import createMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const handleI18n = createMiddleware(routing);

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 保留原有 /admin 保护逻辑（不参与 i18n 路由）
    if (pathname.startsWith('/admin')) {
        if (pathname === '/admin/login') {
            return NextResponse.next();
        }

        const result = request.cookies.get('auth_token');

        if (!result || result.value !== 'valid') {
            return NextResponse.redirect(new URL('/admin/login', request.url));
        }

        return NextResponse.next();
    }

    // 其余路由交给 next-intl：zh 无前缀，en 带 /en 前缀
    return handleI18n(request);
}

export const config = {
    // 必须排除 /api（next.config rewrite 代理到 NestJS）与静态资源
    matcher: ['/((?!api|_next|_vercel|admin|.*\\..*).*)', '/admin/:path*'],
};
