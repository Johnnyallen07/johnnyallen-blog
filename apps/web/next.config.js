import process from "node:process";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    async rewrites() {
        return [
            {
                source: "/api/:path*",
                destination: `${process.env.API_SERVER_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/:path*`,
            },
        ];
    },
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "static.johnnyallen.blog",
            },
            {
                protocol: "https",
                hostname: "johnnyallenblog-1335108053.cos.ap-hongkong.myqcloud.com",
            },
            {
                protocol: "http",
                hostname: "localhost",
                port: "3001",
                pathname: "/media/**",
            },
        ],
    },
};

export default withNextIntl(nextConfig);
