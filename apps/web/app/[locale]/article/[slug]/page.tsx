import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getApiBaseUrl, withLocale } from "@/lib/api";
import { alternatesFor } from "@/lib/seo";
import { ArticlePageClient } from "./article-client";

interface ArticlePageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({
  params,
}: ArticlePageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  const alternates = alternatesFor(locale, `/article/${slug}`);

  try {
    const res = await fetch(
      `${getApiBaseUrl()}${withLocale(`/posts/slug/${slug}`, locale)}`,
      {
        next: { revalidate: 60 },
      },
    );

    if (res.ok) {
      const post = await res.json();
      return {
        title: `${post.title} - JohnnyBlog`,
        description:
          post.content
            ?.replace(/<[^>]*>/g, "")
            .substring(0, 160)
            .trim() || t("articleDefaultDescription"),
        openGraph: {
          title: post.title,
          description:
            post.content
              ?.replace(/<[^>]*>/g, "")
              .substring(0, 160)
              .trim() || "",
          type: "article",
        },
        alternates,
      };
    }
  } catch {
    // 使用默认 metadata
  }

  return {
    title: t("articleFallbackTitle"),
    description: t("articleFallbackDescription"),
    alternates,
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  return <ArticlePageClient slug={slug} />;
}
