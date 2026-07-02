export function getApiBaseUrl(): string {
    // 服务端（Docker 内为 http://api:3001）优先用 API_SERVER_URL
    if (typeof window === "undefined" && process.env.API_SERVER_URL) {
        return process.env.API_SERVER_URL;
    }

    const publicApiUrl = process.env.NEXT_PUBLIC_API_URL;

    if (typeof window !== "undefined") {
        if (!publicApiUrl) return "/api";

        try {
            const apiUrl = new URL(publicApiUrl);
            if (apiUrl.hostname === "localhost" || apiUrl.hostname === "127.0.0.1") {
                return "/api";
            }
        } catch {
            return publicApiUrl;
        }
    }

    return publicApiUrl || "http://localhost:3001";
}

/** 给 URL 追加 locale 查询参数（zh 为默认语言，不追加） */
export function withLocale(url: string, locale?: string): string {
    if (!locale || locale === "zh") return url;
    return `${url}${url.includes("?") ? "&" : "?"}locale=${locale}`;
}
