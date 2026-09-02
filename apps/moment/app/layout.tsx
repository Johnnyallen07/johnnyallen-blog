import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Moment · Johnny 的私人资料库",
  description: "照片、回忆与重要文件的私人归档。",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f5f2",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Reading request headers opts the page into dynamic rendering so Next can
  // apply the per-request CSP nonce to its framework/bootstrap scripts.
  await headers();
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
