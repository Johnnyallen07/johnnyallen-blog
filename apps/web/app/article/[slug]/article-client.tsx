"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArticleContent } from "@/components/article/ArticleContent";
import { TableOfContents } from "@/components/article/TableOfContents";
import { SimilarArticles } from "@/components/article/SimilarArticles";
import { fetchClient } from "@/lib/api";
import { SeriesSidebar } from "@/components/home/SeriesSidebar";

// --- Interfaces ---

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface SimilarArticle {
  id: string;
  title: string;
  excerpt: string;
  views: number;
  date: string;
  slug?: string;
}

interface SeriesItemDTO {
  id: string;
  title: string | null;
  postId: string | null;
  children: SeriesItemDTO[];
  post?: { id: string; title: string; slug: string };
}

interface MappedSeriesItem {
  id: string;
  title: string;
  postId: string | null;
  post: { id: string; title: string; slug: string } | undefined;
  children: MappedSeriesItem[];
}

interface PostData {
  id: string;
  title: string;
  slug: string;
  content: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  views?: number;
  likes?: number;
  tags?: string[];
  category?: { id: string; name: string };
  seriesItems?: {
    series: {
      id: string;
      title: string;
      slug: string;
      emoji?: string;
      items: SeriesItemDTO[];
    };
  }[];
  // Backwards compatibility if needed, though we prefer seriesItems
  series?: {
    id: string;
    title: string;
    tree?: SeriesItemDTO[];
  };
}

interface ArticlePageClientProps {
  slug: string;
}

// --- Helper Functions ---

function generateHeadingId(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "");
  return base ? `heading-${base}-${index}` : `heading-${index}`;
}

function extractTocAndInjectIds(html: string): {
  items: TocItem[];
  html: string;
} {
  const items: TocItem[] = [];
  let index = 0;

  // Match h1, h2, h3 with or without existing id
  const processed = html.replace(
    /<h([1-3])(\s[^>]*)?>([^<]*)<\/h[1-3]>/gi,
    (fullMatch, levelStr: string, attrs: string | undefined, text: string) => {
      const level = parseInt(levelStr, 10);
      const trimmedText = text.trim();
      if (!trimmedText) return fullMatch;

      // Check if there's already an id
      const existingId = attrs?.match(/id="([^"]*)"/)?.[1];
      const id = existingId || generateHeadingId(trimmedText, index);
      index++;

      items.push({ id, text: trimmedText, level });

      if (existingId) return fullMatch;
      // Inject the id attribute
      return `<h${level}${attrs || ""} id="${id}">${text}</h${level}>`;
    }
  );

  return { items, html: processed };
}

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}天前`;
  return date.toLocaleDateString("zh-CN");
}

function mapToSeriesItems(nodes: SeriesItemDTO[]): MappedSeriesItem[] {
  return nodes.map((node) => ({
    id: node.id,
    title: node.title || node.post?.title || "Untitled",
    postId: node.postId,
    post: node.post,
    children: node.children ? mapToSeriesItems(node.children) : [],
  }));
}

// Default Data Fallbacks
const DEFAULT_CONTENT = `<p>加载失败...</p>`;

const DEFAULT_SIMILAR: SimilarArticle[] = [
  {
    id: "1",
    title: "示例文章",
    excerpt: "这是一个示例...",
    views: 100,
    date: "1天前",
  },
];

// --- Main Component ---

export function ArticlePageClient({ slug }: ArticlePageClientProps) {
  const [post, setPost] = useState<PostData | null>(null);
  const [seriesItems, setSeriesItems] = useState<MappedSeriesItem[]>([]);
  const [seriesInfo, setSeriesInfo] = useState<{
    title: string;
    slug: string;
    emoji: string;
  } | null>(null);
  const [similarArticles, setSimilarArticles] = useState<SimilarArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const viewCountedRef = useRef(false);

  const fetchArticle = useCallback(async () => {
    try {
      // Force fresh fetch to avoid caching issues with drafted content updates
      const data: PostData = await fetchClient(`/posts/slug/${slug}`, {
        cache: "no-store",
        headers: {
          "Pragma": "no-cache",
          "Cache-Control": "no-cache"
        }
      });
      setPost(data);
      // Increment view count (only once, guard against StrictMode double-invoke)
      if (!viewCountedRef.current) {
        viewCountedRef.current = true;
        fetchClient(`/posts/${data.id}/view`, { method: "POST" })
          .then((result) => {
            setPost((prev) =>
              prev ? { ...prev, views: result.views } : prev
            );
          })
          .catch(() => {
            // silently ignore view count errors
          });
      }

      // Check if post belongs to a series
      // Priority: data.seriesItems (recursive) > data.series (legacy)
      const primarySeriesItem = data.seriesItems?.[0];

      if (primarySeriesItem?.series) {
        const s = primarySeriesItem.series;
        setSeriesInfo({
          title: s.title,
          slug: s.slug,
          emoji: s.emoji || "📝",
        });
        if (s.items) {
          setSeriesItems(mapToSeriesItems(s.items));
        }
      } else if (data.series) {
        // Fallback legacy structure support if API changes aren't fully propagated
        setSeriesInfo({
          title: data.series.title,
          slug: "series-fallback", // We might not have slug here if legacy
          emoji: "📝"
        });
      }

      // Fetch similar articles - filter by same category
      try {
        const categoryParam = data.category?.id
          ? `&categoryId=${data.category.id}`
          : "";
        const similar = await fetchClient(
          `/posts?take=5${categoryParam}`
        );

        interface SimilarPostDTO {
          id: string;
          title: string;
          content?: string;
          slug: string;
          views?: number;
          updatedAt: string;
        }

        if (Array.isArray(similar)) {
          setSimilarArticles(
            (similar as SimilarPostDTO[])
              .filter((p) => p.id !== data.id)
              .slice(0, 4)
              .map((p) => ({
                id: p.id,
                title: p.title,
                excerpt:
                  p.content
                    ?.replace(/<[^>]*>/g, "")
                    .substring(0, 80)
                    .trim() + "..." || "",
                views: p.views || 0,
                date: getRelativeTime(p.updatedAt),
                slug: p.slug,
              }))
          );
        }
      } catch {
        // ignore
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchArticle();
  }, [fetchArticle]);

  const rawContent = post?.content || DEFAULT_CONTENT;
  const { items: tocItems, html: articleContent } = useMemo(
    () => extractTocAndInjectIds(rawContent),
    [rawContent]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-8 w-8 bg-cyan-500 rounded-full mb-4"></div>
          <div className="text-gray-400 text-sm">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="text-2xl font-bold bg-gradient-to-r from-cyan-600 to-purple-600 bg-clip-text text-transparent"
            >
              JohnnyBlog
            </Link>

            <Link href="/">
              <Button
                size="sm"
                variant="outline"
                className="border-gray-300 hover:bg-gray-50 text-gray-600"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                返回首页
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <aside className="lg:col-span-1">
            {seriesInfo ? (
              <SeriesSidebar
                title={seriesInfo.title}
                slug={seriesInfo.slug}
                emoji={seriesInfo.emoji}
                items={seriesItems}
              />
            ) : (
              <SimilarArticles
                category={post?.category?.name || "推荐阅读"}
                articles={
                  similarArticles.length > 0 ? similarArticles : DEFAULT_SIMILAR
                }
              />
            )}
          </aside>

          <main className="lg:col-span-2">
            <ArticleContent
              postId={post?.id}
              title={post?.title || ""}
              author="Johnny"
              date={post?.createdAt ? getRelativeTime(post.createdAt) : ""}
              views={post?.views || 0}
              likes={post?.likes || 0}
              tags={post?.tags || []}
              category={post?.category?.name || "未分类"}
              column={seriesInfo?.title}
              content={articleContent}
            />
          </main>

          <aside className="lg:col-span-1">
            <div className="lg:sticky lg:top-24">
              <TableOfContents items={tocItems} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
