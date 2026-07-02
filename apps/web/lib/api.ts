/** 服务端用 API_SERVER_URL（Docker 内为 http://api:3001），客户端本地开发走同源代理，避免 localhost/127.0.0.1 跨域。 */
export function getApiBaseUrl(): string {
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

/** 给 endpoint 追加 locale 查询参数（zh 为默认语言，不追加） */
export function withLocale(endpoint: string, locale?: string): string {
    if (!locale || locale === "zh") return endpoint;
    return `${endpoint}${endpoint.includes("?") ? "&" : "?"}locale=${locale}`;
}

export async function fetchClient(
    endpoint: string,
    options: RequestInit = {},
    locale?: string,
) {
    const localizedEndpoint = withLocale(endpoint, locale);
    const url = `${getApiBaseUrl()}${localizedEndpoint.startsWith("/") ? localizedEndpoint : `/${localizedEndpoint}`}`;

    const headers = {
        "Content-Type": "application/json",
        ...options.headers,
    };

    const response = await fetch(url, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.message || `API Error: ${response.statusText}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
        return null;
    }

    const text = await response.text();
    try {
        return text ? JSON.parse(text) : {};
    } catch {
        console.error("Failed to parse JSON response:", text);
        throw new Error("Invalid JSON response from server");
    }
}
