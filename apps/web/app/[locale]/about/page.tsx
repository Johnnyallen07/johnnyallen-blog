import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AboutPageClient } from "./about-client";

export const metadata: Metadata = {
  title: "关于我 - JohnnyBlog",
  description:
    "帝国理工本科大三数学；前 Google prompt engineer；教微积分桃李满天下的老师；超级喜欢玩「缺氧」的 Steam 玩家。",
  openGraph: {
    title: "关于我 - JohnnyBlog",
    description: "帝国理工本科大三数学；前 Google prompt engineer；教微积分桃李满天下的老师；超级喜欢玩「缺氧」的 Steam 玩家。",
  },
};

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AboutPageClient />;
}
