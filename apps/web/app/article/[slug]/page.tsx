import type { Metadata } from "next";
import { ArticlePageClient } from "./article-client";

interface ArticlePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;

  const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  try {
    const res = await fetch(`${API_BASE_URL}/posts/slug/${slug}`, {
      next: { revalidate: 60 },
    });

    if (res.ok) {
      const post = await res.json();
      return {
        title: `${post.title} - JohnnyBlog`,
        description:
          post.content
            ?.replace(/<[^>]*>/g, "")
            .substring(0, 160)
            .trim() || "JohnnyBlog 文章",
        openGraph: {
          title: post.title,
          description:
            post.content
              ?.replace(/<[^>]*>/g, "")
              .substring(0, 160)
              .trim() || "",
          type: "article",
        },
      };
    }
  } catch {
    // 使用默认 metadata
  }

  return {
    title: `文章 - JohnnyBlog`,
    description: "阅读 JohnnyBlog 上的精彩文章",
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  return <ArticlePageClient slug={slug} />;
}
