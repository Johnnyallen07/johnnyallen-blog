/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
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

export default nextConfig;
