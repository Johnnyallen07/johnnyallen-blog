/** 服务端用 API_SERVER_URL（Docker 内为 http://api:3001），客户端用 NEXT_PUBLIC_API_URL，避免解析到容器 ID 报 EAI_AGAIN */
export function getApiBaseUrl(): string {
  if (typeof window === "undefined" && process.env.API_SERVER_URL) {
    return process.env.API_SERVER_URL;
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
}

export async function fetchClient(endpoint: string, options: RequestInit = {}) {
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `/api/backend${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // 401 未授权 → 跳转登录页
  if (response.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
    throw new Error("登录已过期，请重新登录");
  }

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
