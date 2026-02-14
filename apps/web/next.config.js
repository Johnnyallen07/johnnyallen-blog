/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "pub-5b647118ac394cf4be1b0263b1327b52.r2.dev",
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
