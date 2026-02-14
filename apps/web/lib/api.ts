
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function fetchClient(endpoint: string, options: RequestInit = {}) {
    const url = `${API_BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

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
