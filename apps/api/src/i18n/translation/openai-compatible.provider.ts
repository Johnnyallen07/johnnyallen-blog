import {
  TranslationItem,
  TranslateOptions,
  TranslationProvider,
} from './translation-provider.interface';
import {
  batchSystemPrompt,
  markdownSystemPrompt,
  textSystemPrompt,
  parseBatchResponse,
} from './prompts';

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

/**
 * OpenAI 兼容端点（OpenAI / DeepSeek / Gemini OpenAI-compat / 任意兼容网关）。
 */
export class OpenAiCompatibleProvider implements TranslationProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl = 'https://api.openai.com/v1',
  ) {}

  private async chat(system: string, user: string): Promise<string> {
    const res = await fetch(
      `${this.baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.2,
        }),
      },
    );

    const data = (await res.json()) as OpenAiChatResponse;
    if (!res.ok) {
      throw new Error(
        `翻译服务请求失败 (${res.status}): ${data?.error?.message ?? '未知错误'}`,
      );
    }
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('翻译服务返回为空');
    }
    return content;
  }

  async translateBatch(
    items: TranslationItem[],
    opts: TranslateOptions,
  ): Promise<TranslationItem[]> {
    const content = await this.chat(
      batchSystemPrompt(opts),
      JSON.stringify({ items }),
    );
    return parseBatchResponse(content, items);
  }

  async translateText(
    text: string,
    opts: TranslateOptions & { format: 'text' | 'markdown'; context?: string },
  ): Promise<string> {
    const system =
      opts.format === 'markdown'
        ? markdownSystemPrompt(opts)
        : textSystemPrompt(opts);
    const user = opts.context ? `[Context: ${opts.context}]\n\n${text}` : text;
    return (await this.chat(system, user)).trim();
  }
}
