/** 与 API src/i18n 返回结构对应的类型 */

export type TranslationStatus = "MACHINE" | "REVIEWED";

export interface UiMessageRow {
    id: string;
    app: string;
    namespace: string;
    key: string;
    sourceText: string;
    description: string | null;
    locations: string[];
    orphaned: boolean;
    translation: {
        text: string;
        status: TranslationStatus;
        stale: boolean;
        updatedAt: string;
    } | null;
}

export interface ContentFieldState {
    source: string | null;
    translation: string | null;
    status: TranslationStatus | null;
    stale: boolean;
}

export interface ContentRow {
    entityId: string;
    label: string;
    fields: Record<string, ContentFieldState>;
}

export interface ContentTypeMeta {
    entityType: string;
    displayName: string;
    fields: string[];
    markdownFields: string[];
    label: string;
}

export const FIELD_LABELS: Record<string, string> = {
    title: "标题",
    excerpt: "摘要",
    content: "正文",
    name: "名称",
    description: "描述",
    musician: "音乐家",
    performer: "演奏者",
    composer: "作曲家",
};

export function fieldLabel(field: string): string {
    return FIELD_LABELS[field] ?? field;
}
