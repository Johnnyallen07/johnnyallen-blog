"use client";

import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";

interface ArticleCardProps {
  title: string;
  excerpt: string;
  column: string;
  tags: string[];
  date: string;
  articleId?: string;
}

export function ArticleCard({
  title,
  excerpt,
  column,
  tags,
  date,
  articleId = "1",
}: ArticleCardProps) {
  const router = useRouter();

  return (
    <div
      onClick={() => router.push(`/article/${articleId}`)}
      className="group relative bg-white/[0.28] backdrop-blur-sm border border-slate-200/60 rounded-xl overflow-hidden hover:border-slate-400 hover:bg-white/45 hover:shadow-lg hover:shadow-slate-900/5 transition-all duration-300 cursor-pointer"
    >
      {/* 顶部装饰条 */}
      <div className="h-px bg-gradient-to-r from-slate-950 via-slate-500 to-transparent opacity-60 group-hover:opacity-100 transition-opacity" />

      <div className="p-5">
        {/* 专栏标签 */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs px-2.5 py-1 rounded-md bg-white/45 backdrop-blur-sm text-slate-700 border border-slate-200/70">
            {column}
          </span>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Clock className="h-3 w-3" />
            {date}
          </div>
        </div>

        {/* 标题 */}
        <h3 className="text-lg font-semibold text-slate-950 mb-2 line-clamp-2 group-hover:text-slate-700 transition-colors">
          {title}
        </h3>

        {/* 摘要 */}
        <p className="text-sm text-slate-600 line-clamp-2 mb-4">{excerpt}</p>

        {/* 标签 */}
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-0.5 rounded bg-white/40 backdrop-blur-sm text-slate-600 border border-slate-200/70"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
