export interface TranslationItem {
  id: string;
  text: string;
  /** 给 LLM 的上下文，如 "web 首页分页按钮" */
  context?: string;
}

export interface TranslateOptions {
  sourceLocale: string;
  targetLocale: string;
}

/**
 * 翻译提供方抽象：
 * - translateBatch：批量短文本（UI 文案、标题等），JSON 契约
 * - translateText：单条长文本（Markdown 正文），原样输出
 */
export interface TranslationProvider {
  translateBatch(
    items: TranslationItem[],
    opts: TranslateOptions,
  ): Promise<TranslationItem[]>;

  translateText(
    text: string,
    opts: TranslateOptions & { format: 'text' | 'markdown'; context?: string },
  ): Promise<string>;
}
