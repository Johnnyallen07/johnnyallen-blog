import { getApiBaseUrl } from "./api";

function stripTrailingSlash(value: string): string {
    return value.replace(/\/$/, "");
}

function normalizeArticleMediaUrl(rawUrl: string, apiBaseUrl: string): string {
    const trimmed = rawUrl.trim();
    if (!trimmed) return rawUrl;

    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(trimmed)) {
        return rawUrl;
    }

    const normalizedPath = trimmed.replace(/^\.?\//, "");
    const mediaPath = normalizedPath.startsWith("api/media/")
        ? normalizedPath.replace(/^api\/media\//, "media/")
        : normalizedPath;

    if (mediaPath.startsWith("media/assets/")) {
        return `${stripTrailingSlash(apiBaseUrl)}/${mediaPath}`;
    }

    if (mediaPath.startsWith("assets/")) {
        return `${stripTrailingSlash(apiBaseUrl)}/media/${mediaPath}`;
    }

    return rawUrl;
}

export function normalizeArticleMediaHtml(
    html: string,
    apiBaseUrl = getApiBaseUrl(),
): string {
    return html.replace(
        /\b(src|href)=("([^"]*)"|'([^']*)')/gi,
        (match, attr: string, quoted: string, doubleQuoted?: string, singleQuoted?: string) => {
            const url = doubleQuoted ?? singleQuoted ?? "";
            const nextUrl = normalizeArticleMediaUrl(url, apiBaseUrl);
            if (nextUrl === url) return match;
            const quote = quoted.startsWith("'") ? "'" : '"';
            return `${attr}=${quote}${nextUrl}${quote}`;
        },
    );
}
