import type { Metadata } from "next";
import { HomePageClient } from "./home-client";

export const metadata: Metadata = {
  title: "JohnnyBlog - 游戏·音乐·技术",
  description:
    "Johnny 的个人博客，分享游戏攻略、音乐心得和技术笔记。探索缺氧游戏、小提琴、钢琴、React、TypeScript 等话题。",
  openGraph: {
    title: "JohnnyBlog - 游戏·音乐·技术",
    description:
      "Johnny 的个人博客，分享游戏攻略、音乐心得和技术笔记。",
    type: "website",
  },
};

export default function HomePage() {
  return <HomePageClient />;
}
