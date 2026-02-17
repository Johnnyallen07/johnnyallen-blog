import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Johnny Music",
    description: "Johnny 的古典音乐空间 — 钢琴、小提琴与室内乐的精选收藏。",
    icons: {
        icon: "/images/logo.png",
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="zh-CN" suppressHydrationWarning>
            <head>
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body className="antialiased font-sans">
                {children}
            </body>
        </html>
    );
}
