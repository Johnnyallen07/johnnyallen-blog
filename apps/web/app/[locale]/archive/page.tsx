import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { ArchivePageClient } from "./archive-client";

export const metadata: Metadata = {
  title: "文章归档 - JohnnyBlog",
  description: "按时间浏览 JohnnyBlog 的所有文章，涵盖游戏、音乐、技术等话题。",
  openGraph: {
    title: "文章归档 - JohnnyBlog",
    description: "按时间浏览 JohnnyBlog 的所有文章",
  },
};

export default async function ArchivePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ArchivePageClient />;
}
