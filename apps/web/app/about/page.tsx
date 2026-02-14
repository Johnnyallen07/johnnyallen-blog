import type { Metadata } from "next";
import { AboutPageClient } from "./about-client";

export const metadata: Metadata = {
  title: "关于我 - JohnnyBlog",
  description:
    "了解 Johnny - 一个热爱游戏、音乐和技术的创作者。小提琴、钢琴演奏者，全栈开发者。",
  openGraph: {
    title: "关于我 - JohnnyBlog",
    description: "了解 Johnny - 游戏玩家·音乐爱好者·技术探索者",
  },
};

export default function AboutPage() {
  return <AboutPageClient />;
}
