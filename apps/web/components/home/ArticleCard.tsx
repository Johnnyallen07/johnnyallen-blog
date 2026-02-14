"use client";

import { useRouter } from "next/navigation";
import { Eye, ThumbsUp, Clock } from "lucide-react";

interface ArticleCardProps {
  title: string;
  excerpt: string;
  column: string;
  tags: string[];
  views: number;
  likes: number;
  date: string;
  articleId?: string;
}

export function ArticleCard({
  title,
  excerpt,
  column,
  tags,
  views,
  likes,
  date,
  articleId = "1",
}: ArticleCardProps) {
  const router = useRouter();

  return (
    <div
      onClick={() => router.push(`/article/${articleId}`)}
      className="group relative bg-transparent backdrop-blur-sm border border-white/40 rounded-xl overflow-hidden hover:border-cyan-300 hover:bg-white/30 hover:shadow-lg transition-all duration-300 cursor-pointer"
    >
      {/* 顶部装饰条 */}
      <div className="h-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 opacity-60 group-hover:opacity-100 transition-opacity" />

      <div className="p-5">
        {/* 专栏标签 */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs px-2.5 py-1 rounded-md bg-white/40 backdrop-blur-sm text-gray-700 border border-white/50">
            {column}
          </span>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="h-3 w-3" />
            {date}
          </div>
        </div>

        {/* 标题 */}
        <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2 group-hover:text-cyan-600 transition-colors">
          {title}
        </h3>

        {/* 摘要 */}
        <p className="text-sm text-gray-600 line-clamp-2 mb-4">{excerpt}</p>

        {/* 标签 */}
        <div className="flex flex-wrap gap-2 mb-4">
          {tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 rounded bg-white/40 backdrop-blur-sm text-gray-600 border border-white/50"
            >
              #{tag}
            </span>
          ))}
        </div>

        {/* 底部信息 */}
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" />
            <span>{views}</span>
          </div>
          <div className="flex items-center gap-1">
            <ThumbsUp className="h-3.5 w-3.5" />
            <span>{likes}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
