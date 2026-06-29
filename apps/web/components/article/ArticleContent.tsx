"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Calendar, Check, Copy, Eye, Link2, ThumbsUp, Tag, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchClient, getApiBaseUrl } from "@/lib/api";
import { buildArticleShareText, stripHtmlForShare } from "@/lib/share";
import { toast } from "sonner";

interface ArticleContentProps {
  postId?: string;
  title: string;
  author: string;
  date: string;
  views: number;
  likes: number;
  tags: string[];
  content: string;
  category?: string;
  column?: string;
}

const MUSIC_URL = process.env.NEXT_PUBLIC_MUSIC_URL || "/music";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderScoreReferences(html: string): string {
  return html.replace(
    /(?:<p>)?\[\[score:([a-zA-Z0-9_-]+)(?:\|([^\]]+))?\]\](?:<\/p>)?/g,
    (_match, scoreId: string, label?: string) => {
      const title = escapeHtml(label?.trim() || "查看关联乐谱");
      const href = `${MUSIC_URL}/scores?score=${encodeURIComponent(scoreId)}`;

      return `
        <a href="${href}" target="_blank" rel="noopener noreferrer" class="not-prose my-5 flex items-center gap-3 rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-slate-800 no-underline shadow-sm transition hover:border-amber-300 hover:bg-amber-50">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-amber-600 shadow-sm">♬</span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold">${title}</span>
            <span class="block text-xs text-slate-500">打开乐谱 PDF</span>
          </span>
          <span class="text-xs text-amber-700">查看</span>
        </a>
      `;
    }
  );
}

export function ArticleContent({
  postId,
  title,
  author,
  date,
  views,
  likes: initialLikes,
  tags,
  content,
  category,
  column,
}: ArticleContentProps) {
  const [likesCount, setLikesCount] = useState(initialLikes);
  const [hasLiked, setHasLiked] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState<"link" | "text" | null>(null);
  const [shareUrl, setShareUrl] = useState("");

  const shareExcerpt = useMemo(() => stripHtmlForShare(content), [content]);
  const renderedContent = useMemo(() => renderScoreReferences(content), [content]);
  const shareText = useMemo(
    () =>
      buildArticleShareText({
        title,
        url: shareUrl,
        excerpt: shareExcerpt,
      }),
    [shareExcerpt, shareUrl, title],
  );

  useEffect(() => {
    setShareUrl(window.location.href);
  }, []);

  const handleLike = async () => {
    if (!postId) return;
    const action = hasLiked ? "unlike" : "like";
    try {
      const result = await fetchClient(`/posts/${postId}/like`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setLikesCount(result.likes);
      setHasLiked(!hasLiked);
    } catch (error) {
      console.error(error);
      toast.error("操作失败");
    }
  };

  const handleContentClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const link = target.closest<HTMLAnchorElement>('a[data-attachment="true"]');
    if (!link) return;

    const key = link.dataset.key;
    if (!key) return;

    event.preventDefault();
    const filename = link.dataset.filename || "";
    const query = filename ? `?filename=${encodeURIComponent(filename)}` : "";
    window.location.href = `${getApiBaseUrl()}/media/download/${key}${query}`;
  };

  const copyToClipboard = async (value: string, target: "link" | "text") => {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopiedTarget(target);
      toast.success(target === "link" ? "链接已复制" : "分享文案已复制");
      window.setTimeout(() => setCopiedTarget(null), 1800);
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  return (
    <article className="bg-transparent backdrop-blur-sm border border-white/20 rounded-2xl shadow-sm overflow-hidden">
      {/* 顶部装饰条 */}
      <div className="h-1.5 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500" />

      <div className="p-8">
        {/* 文章头部 */}
        <header className="mb-8 pb-6 border-b border-gray-200">
          {/* 分类/专栏标签 */}
          <div className="flex items-center gap-2 mb-4">
            {column && (
              <span className="text-xs px-3 py-1 rounded-full bg-cyan-100 text-cyan-700 border border-cyan-200">
                📁 {column}
              </span>
            )}
            {category && (
              <span className="text-xs px-3 py-1 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                🏷️ {category}
              </span>
            )}
          </div>

          {/* 标题 */}
          <h1 className="text-4xl font-bold text-gray-900 mb-6 leading-tight tracking-wide">
            {title}
          </h1>

          {/* 元信息 */}
          <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap">
            <div className="flex items-center gap-1.5">
              <User className="h-4 w-4" />
              <span>{author}</span>
            </div>
            <div className="w-px h-4 bg-gray-300" />
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              <span>{date}</span>
            </div>
            <div className="w-px h-4 bg-gray-300" />
            <div className="flex items-center gap-1.5">
              <Eye className="h-4 w-4" />
              <span>{views} 阅读</span>
            </div>
            <div className="w-px h-4 bg-gray-300" />
            <div className="flex items-center gap-1.5">
              <ThumbsUp className="h-4 w-4" />
              <span>{likesCount} 点赞</span>
            </div>
          </div>

          {/* 标签 */}
          {tags.length > 0 && (
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <Tag className="h-4 w-4 text-gray-400" />
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors cursor-pointer"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </header>

        {/* 文章内容 - 增加行高和字间距 */}
        <div
          onClick={handleContentClick}
          className="prose prose-gray prose-lg max-w-none
            prose-headings:font-bold prose-headings:text-gray-900
            prose-a:text-cyan-600 prose-a:no-underline hover:prose-a:underline
            prose-strong:text-gray-900 prose-strong:font-semibold
            prose-code:text-pink-600 prose-code:bg-pink-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
            prose-pre:bg-gray-900 prose-pre:text-gray-100
            prose-img:rounded-xl prose-img:shadow-md
            prose-blockquote:border-l-4 prose-blockquote:border-cyan-500 prose-blockquote:bg-cyan-50"
          dangerouslySetInnerHTML={{ __html: renderedContent }}
        />

        {/* 文章底部 */}
        <footer className="mt-12 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleLike}
                className={
                  hasLiked
                    ? "border-cyan-400 bg-cyan-50 text-cyan-700 hover:bg-cyan-100"
                    : "border-gray-300 hover:bg-gray-50"
                }
              >
                <ThumbsUp
                  className={`h-4 w-4 mr-2 ${hasLiked ? "fill-cyan-600" : ""}`}
                />
                点赞 ({likesCount})
              </Button>
            </div>
            <Button
              variant="outline"
              className="border-gray-300 hover:bg-gray-50"
              onClick={() => setIsShareOpen(true)}
            >
              <Link2 className="h-4 w-4 mr-2" />
              分享
            </Button>
          </div>
        </footer>
      </div>

      <Dialog open={isShareOpen} onOpenChange={setIsShareOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>分享文章</DialogTitle>
            <DialogDescription className="line-clamp-2">{title}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">文章链接</div>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 truncate">
                  {shareUrl}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(shareUrl, "link")}
                  aria-label="复制文章链接"
                >
                  {copiedTarget === "link" ? (
                    <Check className="h-4 w-4 text-cyan-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">推荐文案</div>
              <textarea
                readOnly
                value={shareText}
                className="min-h-28 w-full resize-none rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-700 outline-none"
              />
              <Button
                variant="outline"
                className="w-full border-gray-300 hover:bg-gray-50"
                onClick={() => copyToClipboard(shareText, "text")}
              >
                {copiedTarget === "text" ? (
                  <Check className="h-4 w-4 mr-2 text-cyan-600" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                复制文案
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}
