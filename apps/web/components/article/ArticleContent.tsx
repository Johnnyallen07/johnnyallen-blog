"use client";

import { useState } from "react";
import { Calendar, Eye, ThumbsUp, Tag, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchClient } from "@/lib/api";
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
          className="prose prose-gray prose-lg max-w-none
            prose-headings:font-bold prose-headings:text-gray-900
            prose-a:text-cyan-600 prose-a:no-underline hover:prose-a:underline
            prose-strong:text-gray-900 prose-strong:font-semibold
            prose-code:text-pink-600 prose-code:bg-pink-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
            prose-pre:bg-gray-900 prose-pre:text-gray-100
            prose-img:rounded-xl prose-img:shadow-md
            prose-blockquote:border-l-4 prose-blockquote:border-cyan-500 prose-blockquote:bg-cyan-50"
          dangerouslySetInnerHTML={{ __html: content }}
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
            >
              分享
            </Button>
          </div>
        </footer>
      </div>
    </article>
  );
}
