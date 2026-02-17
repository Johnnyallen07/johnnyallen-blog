/** 服务端用 API_SERVER_URL（Docker 内为 http://api:3001），客户端用 NEXT_PUBLIC_API_URL，避免解析到容器 ID 报 EAI_AGAIN */
export function getApiBaseUrl(): string {
    if (typeof window === "undefined" && process.env.API_SERVER_URL) {
        return process.env.API_SERVER_URL;
    }
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
}

export async function fetchClient(endpoint: string, options: RequestInit = {}) {
    const url = `${getApiBaseUrl()}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

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
