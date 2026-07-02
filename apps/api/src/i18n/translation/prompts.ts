import {
  TranslationItem,
  TranslateOptions,
} from './translation-provider.interface';

const LOCALE_NAMES: Record<string, string> = {
  zh: 'Chinese',
  en: 'English',
};

function localeName(locale: string): string {
  return LOCALE_NAMES[locale] ?? locale;
}

/** 批量短文本（UI 文案 / 标题 / 摘要）系统提示词 */
export function batchSystemPrompt(opts: TranslateOptions): string {
  return [
    `You are a professional translator for a personal blog and music website, translating from ${localeName(opts.sourceLocale)} to ${localeName(opts.targetLocale)}.`,
    'The user message is a JSON object: {"items":[{"id","text","context"?}]}. Translate each "text".',
    'Rules:',
    '- Produce natural, concise UI copy, not literal word-by-word translation.',
    '- Keep ICU placeholders such as {count} or {name} EXACTLY as-is (do not translate or rename them).',
    '- Keep URLs, HTML tags, code and email addresses unchanged.',
    '- Keep proper nouns sensible (e.g. 巴赫 → Bach, 肖邦 → Chopin).',
    '- Use the optional "context" only as a hint; never include it in the output.',
    'Respond with ONLY valid JSON, no markdown fences, in the shape: {"translations":[{"id":"...","text":"..."}]} covering every input id exactly once.',
  ].join('\n');
}

/** 单条普通长文本系统提示词 */
export function textSystemPrompt(opts: TranslateOptions): string {
  return [
    `You are a professional translator, translating from ${localeName(opts.sourceLocale)} to ${localeName(opts.targetLocale)} for a personal blog.`,
    'Translate the user message into natural, fluent prose.',
    'Keep URLs, HTML tags, code and email addresses unchanged.',
    'Output ONLY the translation, with no explanations or quotes.',
  ].join('\n');
}

/** Markdown 正文系统提示词 */
export function markdownSystemPrompt(opts: TranslateOptions): string {
  return [
    `You are a professional translator, translating a blog post written in Markdown from ${localeName(opts.sourceLocale)} to ${localeName(opts.targetLocale)}.`,
    'Rules:',
    '- Translate prose only. Preserve ALL Markdown structure exactly: heading levels, list markers, tables, blockquotes, horizontal rules.',
    '- Keep link and image destinations unchanged; translate only the human-readable link text and image alt text.',
    '- Leave inline code and fenced code blocks completely untranslated (including comments inside code).',
    '- Keep HTML tags, URLs and ICU placeholders such as {count} unchanged.',
    '- Do not add, remove or reorder content. Do not wrap the output in extra code fences.',
    'Output ONLY the translated Markdown.',
  ].join('\n');
}

/** 解析批量翻译的 JSON 响应（容忍模型包了 ```json 围栏的情况） */
export function parseBatchResponse(
  content: string,
  items: TranslationItem[],
): TranslationItem[] {
  let raw = content.trim();
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) raw = fenced[1];

  let parsed: { translations?: Array<{ id?: string; text?: string }> };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error('翻译服务返回的不是有效 JSON');
  }
  if (!Array.isArray(parsed.translations)) {
    throw new Error('翻译服务返回缺少 translations 数组');
  }

  const byId = new Map<string, string>();
  for (const t of parsed.translations) {
    if (typeof t.id === 'string' && typeof t.text === 'string') {
      byId.set(t.id, t.text);
    }
  }

  return items.map((item) => {
    const text = byId.get(item.id);
    if (text === undefined) {
      throw new Error(`翻译服务响应缺少条目: ${item.id}`);
    }
    return { id: item.id, text };
  });
}
