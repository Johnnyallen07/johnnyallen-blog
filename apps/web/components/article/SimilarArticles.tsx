"use client";

import { FileText, Eye, Clock } from "lucide-react";
import Link from "next/link";

interface SimilarArticle {
  id: string;
  title: string;
  excerpt: string;
  views: number;
  date: string;
  slug?: string;
}

interface SimilarArticlesProps {
  category: string;
  articles: SimilarArticle[];
}

export function SimilarArticles({ category, articles }: SimilarArticlesProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="mb-4 pb-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <FileText className="h-5 w-5 text-purple-600" />
          相似文章
        </h3>
        <p className="text-xs text-gray-500 mt-1">{category} 分类</p>
      </div>

      <div className="space-y-3">
        {articles.map((article) => {
          const inner = (
            <div className="group p-3 rounded-lg border border-gray-200 hover:border-cyan-300 hover:bg-cyan-50/50 transition-all cursor-pointer">
              <h4 className="text-sm font-medium text-gray-900 mb-2 line-clamp-2 group-hover:text-cyan-600 transition-colors">
                {article.title}
              </h4>
              <p className="text-xs text-gray-600 line-clamp-2 mb-2">
                {article.excerpt}
              </p>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {article.views}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {article.date}
                </span>
              </div>
            </div>
          );

          return article.slug ? (
            <Link key={article.id} href={`/article/${article.slug}`}>
              {inner}
            </Link>
          ) : (
            <div key={article.id}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}
