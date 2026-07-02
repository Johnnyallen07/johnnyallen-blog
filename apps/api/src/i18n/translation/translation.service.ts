import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { asLabel, getEntityConfig } from '../content-registry';
import {
  TranslationItem,
  TranslationProvider,
} from './translation-provider.interface';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';
import { AnthropicProvider } from './anthropic.provider';

export interface ItemResult {
  id: string;
  ok: boolean;
  error?: string;
}

export interface ContentFieldResult {
  field: string;
  ok: boolean;
  error?: string;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** 源文与译文的 ICU 占位符集合、代码围栏数量必须一致，否则拒绝落库 */
export function validateTranslation(
  source: string,
  translated: string,
): string | null {
  const placeholders = (s: string) =>
    new Set(s.match(/\{[a-zA-Z0-9_]+\}/g) ?? []);
  const src = placeholders(source);
  const dst = placeholders(translated);
  if (src.size !== dst.size || [...src].some((p) => !dst.has(p))) {
    return `占位符不一致（源: ${[...src].join(',') || '无'}；译: ${[...dst].join(',') || '无'}）`;
  }

  const fences = (s: string) => (s.match(/```/g) ?? []).length;
  if (fences(source) !== fences(translated)) {
    return '代码块围栏数量不一致';
  }
  return null;
}

/** Markdown 长文按顶级二级标题分块，控制单次请求大小、失败可按块重试 */
export function splitMarkdown(content: string, maxChunk = 8000): string[] {
  if (content.length <= maxChunk) return [content];
  const parts = content.split(/\n(?=## )/);
  // 合并相邻小块，避免碎片化
  const chunks: string[] = [];
  let current = '';
  for (const part of parts) {
    if (current && current.length + part.length + 1 > maxChunk) {
      chunks.push(current);
      current = part;
    } else {
      current = current ? `${current}\n${part}` : part;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);
  private provider: TranslationProvider | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private getProvider(): TranslationProvider {
    if (this.provider) return this.provider;

    const providerName = this.config.get<string>(
      'TRANSLATE_PROVIDER',
      'openai-compatible',
    );
    const model = this.config.get<string>('TRANSLATE_MODEL', '');
    // 未配置 TRANSLATE_API_KEY 时回退用已有的 GEMINI_API_KEY
    const apiKey =
      this.config.get<string>('TRANSLATE_API_KEY') ||
      this.config.get<string>('GEMINI_API_KEY') ||
      '';
    const baseUrl = this.config.get<string>('TRANSLATE_BASE_URL');

    if (!apiKey || !model) {
      throw new Error(
        '自动翻译未配置：请在 .env 设置 TRANSLATE_MODEL 和 TRANSLATE_API_KEY（或 GEMINI_API_KEY）',
      );
    }

    this.provider =
      providerName === 'anthropic'
        ? new AnthropicProvider(apiKey, model, baseUrl || undefined)
        : new OpenAiCompatibleProvider(apiKey, model, baseUrl || undefined);
    return this.provider;
  }

  /**
   * 批量机翻 UI 文案并落库（status=MACHINE）。
   * 返回受影响的 app 列表（供调用方失效 messages 缓存）与逐条结果。
   */
  async translateUiMessages(
    uiMessageIds: string[],
    targetLocale: string,
  ): Promise<{ results: ItemResult[]; affectedApps: string[] }> {
    const messages = await this.prisma.uiMessage.findMany({
      where: { id: { in: uiMessageIds } },
    });
    const foundIds = new Set(messages.map((m) => m.id));
    const results: ItemResult[] = uiMessageIds
      .filter((id) => !foundIds.has(id))
      .map((id) => ({ id, ok: false, error: '文案不存在' }));

    if (messages.length === 0) return { results, affectedApps: [] };

    const items: TranslationItem[] = messages.map((m) => ({
      id: m.id,
      text: m.sourceText,
      context:
        [
          `${m.app} 应用 / ${m.namespace}.${m.key}`,
          m.description ?? '',
          m.locations[0] ?? '',
        ]
          .filter(Boolean)
          .join(' | ') || undefined,
    }));

    let translated: TranslationItem[];
    try {
      translated = await this.getProvider().translateBatch(items, {
        sourceLocale: 'zh',
        targetLocale,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`批量翻译失败: ${message}`);
      return {
        results: [
          ...results,
          ...messages.map((m) => ({ id: m.id, ok: false, error: message })),
        ],
        affectedApps: [],
      };
    }

    const translatedById = new Map(translated.map((t) => [t.id, t.text]));
    const affectedApps = new Set<string>();

    for (const m of messages) {
      const text = translatedById.get(m.id);
      if (text === undefined) {
        results.push({ id: m.id, ok: false, error: '响应缺少该条目' });
        continue;
      }
      const invalid = validateTranslation(m.sourceText, text);
      if (invalid) {
        results.push({ id: m.id, ok: false, error: invalid });
        continue;
      }
      await this.prisma.uiMessageTranslation.upsert({
        where: {
          messageId_locale: { messageId: m.id, locale: targetLocale },
        },
        create: {
          messageId: m.id,
          locale: targetLocale,
          text,
          status: 'MACHINE',
          sourceHash: sha256(m.sourceText),
        },
        update: {
          text,
          status: 'MACHINE',
          sourceHash: sha256(m.sourceText),
        },
      });
      affectedApps.add(m.app);
      results.push({ id: m.id, ok: true });
    }

    return { results, affectedApps: [...affectedApps] };
  }

  /**
   * 机翻某个内容实体的字段并落库（status=MACHINE）。
   * fields 不传则翻译注册表中的全部字段。
   */
  async translateContent(
    entityType: string,
    entityId: string,
    targetLocale: string,
    fields?: string[],
  ): Promise<ContentFieldResult[]> {
    const config = getEntityConfig(entityType);
    const targetFields = (fields ?? config.fields).filter((f) =>
      config.fields.includes(f),
    );

    const delegate = (
      this.prisma as unknown as Record<
        string,
        { findUnique: (args: unknown) => Promise<Record<string, unknown>> }
      >
    )[config.model];
    const entity = await delegate.findUnique({ where: { id: entityId } });
    if (!entity) {
      return targetFields.map((field) => ({
        field,
        ok: false,
        error: '实体不存在',
      }));
    }

    const results: ContentFieldResult[] = [];
    const markdownFields = new Set(config.markdownFields ?? []);
    const shortItems: TranslationItem[] = [];

    for (const field of targetFields) {
      const source = entity[field];
      if (typeof source !== 'string' || source.trim() === '') {
        results.push({ field, ok: false, error: '源字段为空，跳过' });
        continue;
      }
      if (markdownFields.has(field)) {
        // Markdown 长文：逐块翻译
        try {
          const chunks = splitMarkdown(source);
          const translatedChunks: string[] = [];
          for (const chunk of chunks) {
            translatedChunks.push(
              await this.getProvider().translateText(chunk, {
                sourceLocale: 'zh',
                targetLocale,
                format: 'markdown',
                context: `${config.displayName}《${asLabel(entity[config.label], '')}》正文${chunks.length > 1 ? '（分块）' : ''}`,
              }),
            );
          }
          const translated = translatedChunks.join('\n');
          const invalid = validateTranslation(source, translated);
          if (invalid) {
            results.push({ field, ok: false, error: invalid });
            continue;
          }
          await this.upsertContentTranslation(
            entityType,
            entityId,
            field,
            targetLocale,
            translated,
            source,
          );
          results.push({ field, ok: true });
        } catch (err) {
          results.push({
            field,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        shortItems.push({
          id: field,
          text: source,
          context: `${config.displayName}的 ${field} 字段`,
        });
      }
    }

    if (shortItems.length > 0) {
      try {
        const translated = await this.getProvider().translateBatch(shortItems, {
          sourceLocale: 'zh',
          targetLocale,
        });
        const byField = new Map(translated.map((t) => [t.id, t.text]));
        for (const item of shortItems) {
          const text = byField.get(item.id);
          const source = entity[item.id] as string;
          if (text === undefined) {
            results.push({
              field: item.id,
              ok: false,
              error: '响应缺少该字段',
            });
            continue;
          }
          const invalid = validateTranslation(source, text);
          if (invalid) {
            results.push({ field: item.id, ok: false, error: invalid });
            continue;
          }
          await this.upsertContentTranslation(
            entityType,
            entityId,
            item.id,
            targetLocale,
            text,
            source,
          );
          results.push({ field: item.id, ok: true });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        for (const item of shortItems) {
          results.push({ field: item.id, ok: false, error: message });
        }
      }
    }

    return results;
  }

  private async upsertContentTranslation(
    entityType: string,
    entityId: string,
    field: string,
    locale: string,
    value: string,
    source: string,
  ) {
    await this.prisma.contentTranslation.upsert({
      where: {
        entityType_entityId_field_locale: {
          entityType,
          entityId,
          field,
          locale,
        },
      },
      create: {
        entityType,
        entityId,
        field,
        locale,
        value,
        status: 'MACHINE',
        sourceHash: sha256(source),
      },
      update: {
        value,
        status: 'MACHINE',
        sourceHash: sha256(source),
      },
    });
  }
}
