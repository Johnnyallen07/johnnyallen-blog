import process from "node:process";

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
                hostname: "images.unsplash.com",
            },
            {
                protocol: "https",
                hostname: "static.johnnyallen.blog",
            },
        ],
    },
};

export default nextConfig;
