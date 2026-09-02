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

    let token = request.cookies.get("auth_token")?.value;
    const trusted = request.cookies.get("admin_trusted")?.value;
    const apiUrl =
        process.env.API_SERVER_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        "http://localhost:3001";

    const refresh = async () => {
        if (!trusted) return null;
        const response = await fetch(`${apiUrl}/auth/trusted/refresh`, {
            method: "POST",
            headers: {
                "X-Admin-Trusted-Token": trusted,
                "User-Agent": request.headers.get("user-agent") || "",
                "X-Forwarded-For": request.headers.get("x-forwarded-for") || "",
            },
        });
        if (!response.ok) return null;
        return (await response.json()) as { token: string };
    };

    if (!token) {
        const renewed = await refresh().catch(() => null);
        if (!renewed) return NextResponse.redirect(new URL("/login", request.url));
        token = renewed.token;
        const response = NextResponse.next();
        response.cookies.set("auth_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            path: "/",
            maxAge: 2 * 60 * 60,
        });
        return response;
    }

    // 验证 token 是否有效
    try {
        const res = await fetch(`${apiUrl}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
            const renewed = await refresh().catch(() => null);
            if (renewed) {
                const response = NextResponse.next();
                response.cookies.set("auth_token", renewed.token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === "production",
                    sameSite: "strict",
                    path: "/",
                    maxAge: 2 * 60 * 60,
                });
                return response;
            }
            const response = NextResponse.redirect(new URL("/login", request.url));
            response.cookies.delete("auth_token");
            response.cookies.delete("admin_trusted");
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
