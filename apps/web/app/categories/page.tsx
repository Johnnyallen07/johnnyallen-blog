import type { Metadata } from "next";
import { CategoriesPageClient } from "./categories-client";

export const metadata: Metadata = {
  title: "内容分类 - JohnnyBlog",
  description:
    "按主题浏览 JohnnyBlog 的所有专栏，包括游戏世界、音乐殿堂、技术探索、AI时代等分类。",
  openGraph: {
    title: "内容分类 - JohnnyBlog",
    description: "按主题浏览 JohnnyBlog 的所有专栏",
  },
};

export default function CategoriesPage() {
  return <CategoriesPageClient />;
}
