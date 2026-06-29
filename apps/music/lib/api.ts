export function getApiBaseUrl(): string {
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
