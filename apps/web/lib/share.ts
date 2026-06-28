interface ShareTextInput {
    title: string;
    url: string;
    excerpt?: string;
}

export function stripHtmlForShare(html: string, maxLength = 80): string {
    const text = html
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength).trim()}...`;
}

export function buildArticleShareText({
    title,
    url,
    excerpt,
}: ShareTextInput): string {
    const lines = [`分享一篇文章：${title}`];
    if (excerpt) lines.push(excerpt);
    lines.push(url);
    return lines.join("\n");
}
