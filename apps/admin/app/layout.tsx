import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
    title: "管理后台 - Johnny Admin",
    description: "管理后台：专栏管理与文章编辑",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="zh-CN" suppressHydrationWarning>
            <body className="antialiased">
                {children}
                <Toaster richColors position="top-center" />
            </body>
        </html>
    );
}
