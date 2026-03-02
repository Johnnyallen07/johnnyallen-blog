import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** 不需要鉴权的路径 */
const PUBLIC_PATHS = ["/login"];

/** 静态资源等无需拦截的前缀 */
const IGNORED_PREFIXES = ["/_next", "/favicon.ico", "/api"];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 跳过公开路径
    if (PUBLIC_PATHS.includes(pathname)) {
        return NextResponse.next();
    }

    // 跳过静态资源
    if (IGNORED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
        return NextResponse.next();
    }

    // 从 cookie 取 token
    const token = request.cookies.get("auth_token")?.value;

    if (!token) {
        return NextResponse.redirect(new URL("/login", request.url));
    }

    // 验证 token 是否有效
    try {
        const apiUrl =
            process.env.API_SERVER_URL ||
            process.env.NEXT_PUBLIC_API_URL ||
            "http://localhost:3001";

        const res = await fetch(`${apiUrl}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
            // Token 无效，清除 cookie 并重定向到登录页
            const response = NextResponse.redirect(
                new URL("/login", request.url)
            );
            response.cookies.delete("auth_token");
            return response;
        }
    } catch (error) {
        console.error("Auth verification failed:", error);
        // API 不可用时也重定向到登录页
        const response = NextResponse.redirect(
            new URL("/login", request.url)
        );
        response.cookies.delete("auth_token");
        return response;
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * 匹配所有路径，但排除：
         * - _next/static (静态文件)
         * - _next/image (图片优化)
         * - favicon.ico
         */
        "/((?!_next/static|_next/image|favicon.ico).*)",
    ],
};
