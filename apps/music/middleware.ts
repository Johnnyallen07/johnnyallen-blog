import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// zh 无前缀，en 带 /en 前缀
export default createMiddleware(routing);

export const config = {
    // 必须排除 /api（next.config rewrite 代理到 NestJS）与静态资源
    matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
