"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/home/Sidebar";
import { ArticleCard } from "@/components/home/ArticleCard";
import { TagCloud } from "@/components/home/TagCloud";
import { MusicRecommendation } from "@/components/home/MusicRecommendation";
import { fetchClient } from "@/lib/api";

interface Article {
  title: string;
  excerpt: string;
  column: string;
  tags: string[];
  views: number;
  likes: number;
  date: string;
  articleId?: string;
}

const DEFAULT_ARTICLES: Article[] = [
  {
    title: "缺氧游戏氧气系统完全指南",
    excerpt:
      "深入解析缺氧游戏中的氧气生成、循环和优化方案，帮助你建立稳定的氧气供应系统。",
    column: "缺氧游戏",
    tags: ["游戏攻略", "氧气系统", "建造"],
    views: 1234,
    likes: 89,
    date: "2天前",
    articleId: "1",
  },
  {
    title: "React 19 新特性深度解析",
    excerpt:
      "全面介绍 React 19 的新特性，包括 Server Components、新的 Hooks 和性能优化。",
    column: "Web开发",
    tags: ["React", "JavaScript", "前端"],
    views: 2156,
    likes: 145,
    date: "3天前",
    articleId: "2",
  },
  {
    title: "DAW 中的混音技巧与实战",
    excerpt:
      "分享音乐制作中的混音经验，从 EQ、压缩到空间处理的完整工作流程。",
    column: "音乐制作",
    tags: ["混音", "DAW", "音频处理"],
    views: 876,
    likes: 67,
    date: "5天前",
    articleId: "3",
  },
  {
    title: "TypeScript 类型体操实用技巧",
    excerpt:
      "掌握 TypeScript 的高级类型技巧，提升代码的类型安全性和开发效率。",
    column: "Web开发",
    tags: ["TypeScript", "类型系统", "进阶"],
    views: 1543,
    likes: 98,
    date: "1周前",
    articleId: "4",
  },
  {
    title: "独立游戏开发者的音乐制作入门",
    excerpt:
      "为游戏开发者介绍基础的音乐制作知识，让你也能为自己的游戏创作配乐。",
    column: "音乐制作",
    tags: ["游戏音乐", "独立开发", "音乐理论"],
    views: 1089,
    likes: 76,
    date: "1周前",
    articleId: "5",
  },
  {
    title: "AI 辅助编程：GitHub Copilot 使用心得",
    excerpt:
      "分享使用 AI 编程助手的实战经验，如何更高效地利用 AI 提升开发效率。",
    column: "AI探索",
    tags: ["AI", "Copilot", "工具"],
    views: 1876,
    likes: 134,
    date: "2周前",
    articleId: "6",
  },
];

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
  if (diffDays < 7) return `${diffDays}天前`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return `${diffWeeks}周前`;
  return date.toLocaleDateString("zh-CN");
}

export function HomePageClient() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchArticles = useCallback(async () => {
    try {
      const data = await fetchClient("/posts?published=true");

      interface PostDTO {
        id: string;
        title: string;
        slug: string;
        content?: string;
        series?: { title: string };
        category?: { name: string };
        tags?: string[];
        views?: number;
        likes?: number;
        updatedAt: string;
      }

      if (Array.isArray(data) && data.length > 0) {
        const mapped: Article[] = (data as PostDTO[]).map((post) => ({
          title: post.title || "未命名文章",
          excerpt:
            post.content
              ?.replace(/<[^>]*>/g, "")
              .substring(0, 120)
              .trim() + "..." || "",
          column:
            post.series?.title || post.category?.name || "未分类",
          tags: post.tags || [],
          views: post.views || 0,
          likes: post.likes || 0,
          date: getRelativeTime(post.updatedAt),
          articleId: post.slug || post.id,
        }));
        setArticles(mapped);
      } else {
        setArticles(DEFAULT_ARTICLES);
      }
    } catch {
      setArticles(DEFAULT_ARTICLES);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-cyan-50/30 via-purple-50/20 to-pink-50/30 relative overflow-hidden">
      {/* 全屏动态背景 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* === 游戏元素 === */}
        <div className="absolute top-20 left-10 w-4 h-4 bg-cyan-400/15 animate-pulse" style={{ animationDelay: "0s", animationDuration: "3s" }} />
        <div className="absolute top-40 left-32 w-3 h-3 bg-cyan-400/15 animate-pulse" style={{ animationDelay: "0.5s", animationDuration: "2.5s" }} />
        <div className="absolute bottom-32 right-40 w-5 h-5 bg-blue-400/15 animate-pulse" style={{ animationDelay: "1.5s", animationDuration: "2s" }} />

        {/* 游戏手柄 */}
        <svg className="absolute top-1/4 left-1/3 w-24 h-24 opacity-5 text-cyan-600 animate-spin" style={{ animationDuration: "25s" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M6 11h4m-2-2v4m8-1h.01M18 10h.01M8 3h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z" />
        </svg>

        {/* 生命值条 */}
        <div className="absolute top-12 right-12 opacity-10">
          <div className="flex items-center gap-1">
            <span className="text-red-500 text-xs">❤️</span>
            <div className="w-20 h-2 bg-gray-300 rounded-full overflow-hidden">
              <div className="h-full bg-red-500 rounded-full animate-pulse" style={{ width: "80%", animationDuration: "2s" }} />
            </div>
          </div>
        </div>

        {/* 经验值条 */}
        <div className="absolute top-20 right-12 opacity-10">
          <div className="flex items-center gap-1">
            <span className="text-blue-500 text-xs">⭐</span>
            <div className="w-20 h-2 bg-gray-300 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: "60%", animationDuration: "2.5s" }} />
            </div>
          </div>
        </div>

        {/* 像素爱心 */}
        <div className="absolute bottom-1/4 left-12 text-4xl opacity-10 text-red-500" style={{ animation: "heartbeat 1.5s ease-in-out infinite" }}>
          <svg width="40" height="40" viewBox="0 0 8 8" className="pixelated">
            <rect x="1" y="2" width="1" height="1" fill="currentColor" />
            <rect x="2" y="1" width="1" height="1" fill="currentColor" />
            <rect x="3" y="1" width="1" height="1" fill="currentColor" />
            <rect x="4" y="1" width="1" height="1" fill="currentColor" />
            <rect x="5" y="2" width="1" height="1" fill="currentColor" />
            <rect x="0" y="3" width="1" height="1" fill="currentColor" />
            <rect x="6" y="3" width="1" height="1" fill="currentColor" />
            <rect x="1" y="4" width="1" height="1" fill="currentColor" />
            <rect x="5" y="4" width="1" height="1" fill="currentColor" />
            <rect x="2" y="5" width="1" height="1" fill="currentColor" />
            <rect x="4" y="5" width="1" height="1" fill="currentColor" />
            <rect x="3" y="6" width="1" height="1" fill="currentColor" />
          </svg>
        </div>

        {/* === 音乐元素 === */}
        <div className="absolute top-32 right-20 text-4xl opacity-10 text-purple-600" style={{ animation: "musicJump 2s ease-in-out infinite" }}>♪</div>
        <div className="absolute bottom-40 right-32 text-3xl opacity-10 text-purple-600" style={{ animation: "musicJump 2.3s ease-in-out infinite", animationDelay: "0.3s" }}>♫</div>
        <div className="absolute top-64 left-20 text-5xl opacity-10 text-purple-600" style={{ animation: "musicJump 2.5s ease-in-out infinite", animationDelay: "0.6s" }}>♬</div>

        {/* 音量柱 */}
        <div className="absolute top-1/2 right-16 flex items-end gap-1 opacity-10">
          <div className="w-1.5 h-8 bg-purple-500 rounded-full" style={{ animation: "volumeBar 0.8s ease-in-out infinite", animationDelay: "0s" }} />
          <div className="w-1.5 h-12 bg-purple-500 rounded-full" style={{ animation: "volumeBar 0.8s ease-in-out infinite", animationDelay: "0.1s" }} />
          <div className="w-1.5 h-6 bg-purple-500 rounded-full" style={{ animation: "volumeBar 0.8s ease-in-out infinite", animationDelay: "0.2s" }} />
          <div className="w-1.5 h-10 bg-purple-500 rounded-full" style={{ animation: "volumeBar 0.8s ease-in-out infinite", animationDelay: "0.3s" }} />
          <div className="w-1.5 h-7 bg-purple-500 rounded-full" style={{ animation: "volumeBar 0.8s ease-in-out infinite", animationDelay: "0.4s" }} />
        </div>

        {/* 音乐波形 */}
        <svg className="absolute bottom-1/3 right-1/4 w-48 h-32 opacity-5 text-purple-600" viewBox="0 0 200 100">
          <path d="M 0 50 Q 25 20, 50 50 T 100 50 T 150 50 T 200 50" stroke="currentColor" strokeWidth="2" fill="none" className="animate-pulse" style={{ animationDuration: "3s" }} />
          <path d="M 0 60 Q 25 30, 50 60 T 100 60 T 150 60 T 200 60" stroke="currentColor" strokeWidth="2" fill="none" className="animate-pulse" style={{ animationDelay: "0.5s", animationDuration: "3s" }} />
        </svg>

        {/* 五线谱 */}
        <svg className="absolute top-1/3 left-10 w-32 h-24 opacity-5 text-purple-600" viewBox="0 0 100 50">
          <line x1="0" y1="10" x2="100" y2="10" stroke="currentColor" strokeWidth="0.5" />
          <line x1="0" y1="20" x2="100" y2="20" stroke="currentColor" strokeWidth="0.5" />
          <line x1="0" y1="30" x2="100" y2="30" stroke="currentColor" strokeWidth="0.5" />
          <line x1="0" y1="40" x2="100" y2="40" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="20" cy="30" r="3" fill="currentColor" className="animate-pulse" />
          <circle cx="50" cy="20" r="3" fill="currentColor" className="animate-pulse" style={{ animationDelay: "0.5s" }} />
          <circle cx="80" cy="30" r="3" fill="currentColor" className="animate-pulse" style={{ animationDelay: "1s" }} />
        </svg>

        {/* === 技术元素 === */}
        <div className="absolute top-48 right-12 text-3xl opacity-[0.08] text-emerald-600 animate-pulse" style={{ animationDelay: "0s", animationDuration: "3s" }}>&lt;/&gt;</div>
        <div className="absolute bottom-48 left-56 text-2xl opacity-[0.08] text-emerald-600 animate-pulse" style={{ animationDelay: "1.5s", animationDuration: "2.5s" }}>&#123; &#125;</div>
        <div className="absolute top-1/2 right-1/3 text-4xl opacity-[0.08] text-teal-600 animate-pulse" style={{ animationDelay: "2.5s", animationDuration: "3.5s" }}>⚡</div>

        {/* Hello World 代码流 */}
        <div className="absolute top-40 left-1/2 opacity-[0.08] text-emerald-700 font-mono text-xs whitespace-nowrap">
          <div style={{ animation: "typing 4s steps(30) infinite" }}>
            {`console.log("Hello World");`}
          </div>
        </div>

        <div className="absolute bottom-1/3 left-1/4 opacity-[0.08] text-teal-700 font-mono text-xs whitespace-nowrap">
          <div style={{ animation: "typing 5s steps(40) infinite", animationDelay: "1s" }}>
            {`const passion = ["music", "games", "code"];`}
          </div>
        </div>

        {/* 电路板 */}
        <svg className="absolute bottom-1/4 left-1/3 w-40 h-40 opacity-5 text-emerald-600" viewBox="0 0 100 100">
          <line x1="10" y1="10" x2="90" y2="10" stroke="currentColor" strokeWidth="1" className="animate-pulse" style={{ animationDuration: "2s" }} />
          <line x1="10" y1="10" x2="10" y2="90" stroke="currentColor" strokeWidth="1" className="animate-pulse" style={{ animationDelay: "0.3s", animationDuration: "2s" }} />
          <line x1="50" y1="10" x2="50" y2="50" stroke="currentColor" strokeWidth="1" className="animate-pulse" style={{ animationDelay: "0.6s", animationDuration: "2s" }} />
          <line x1="10" y1="50" x2="90" y2="50" stroke="currentColor" strokeWidth="1" className="animate-pulse" style={{ animationDelay: "0.9s", animationDuration: "2s" }} />
          <circle cx="10" cy="10" r="3" fill="currentColor" className="animate-pulse" />
          <circle cx="50" cy="10" r="3" fill="currentColor" className="animate-pulse" style={{ animationDelay: "0.5s" }} />
          <circle cx="90" cy="10" r="3" fill="currentColor" className="animate-pulse" style={{ animationDelay: "1s" }} />
        </svg>

        {/* === 数学元素 === */}
        <div className="absolute top-1/3 right-48 text-5xl opacity-[0.08] text-amber-600 animate-pulse" style={{ animationDelay: "0s", animationDuration: "3.5s" }}>π</div>
        <div className="absolute bottom-1/3 left-48 text-4xl opacity-[0.08] text-orange-600 animate-pulse" style={{ animationDelay: "1s", animationDuration: "4s" }}>∫</div>
        <div className="absolute top-72 right-64 text-3xl opacity-[0.08] text-amber-600 animate-pulse" style={{ animationDelay: "2s", animationDuration: "3.2s" }}>∑</div>
        <div className="absolute bottom-56 right-20 text-4xl opacity-[0.08] text-orange-600 animate-pulse" style={{ animationDelay: "2.5s", animationDuration: "3.8s" }}>∞</div>

        {/* 数学公式 */}
        <div className="absolute top-24 left-1/4 opacity-[0.08] text-amber-700 font-mono text-sm" style={{ animation: "fadeInOut 6s ease-in-out infinite" }}>
          y = sin(x)
        </div>
        <div className="absolute bottom-1/4 right-1/3 opacity-[0.08] text-orange-700 font-mono text-sm" style={{ animation: "fadeInOut 6s ease-in-out infinite", animationDelay: "2s" }}>
          E = mc²
        </div>

        {/* 正弦波 */}
        <svg className="absolute top-1/2 left-1/3 w-48 h-24 opacity-5 text-amber-600" viewBox="0 0 200 50">
          <path d="M 0 25 Q 25 10, 50 25 T 100 25 T 150 25 T 200 25" stroke="currentColor" strokeWidth="2" fill="none" style={{ animation: "waveMove 3s ease-in-out infinite" }} />
        </svg>

        {/* 几何圆 */}
        <svg className="absolute top-1/4 right-1/3 w-32 h-32 opacity-5 text-amber-600" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="2" className="animate-pulse" style={{ animationDuration: "3s" }} />
          <line x1="50" y1="10" x2="50" y2="90" stroke="currentColor" strokeWidth="1" className="animate-pulse" style={{ animationDelay: "0.5s" }} />
          <line x1="10" y1="50" x2="90" y2="50" stroke="currentColor" strokeWidth="1" className="animate-pulse" style={{ animationDelay: "1s" }} />
        </svg>

        {/* 坐标系 */}
        <svg className="absolute bottom-1/4 right-1/4 w-36 h-36 opacity-5 text-orange-600" viewBox="0 0 100 100">
          <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="1" />
          <line x1="50" y1="0" x2="50" y2="100" stroke="currentColor" strokeWidth="1" />
          <polygon points="100,50 95,47 95,53" fill="currentColor" />
          <polygon points="50,0 47,5 53,5" fill="currentColor" />
          <path d="M 10 50 Q 20 30, 30 50 T 50 50 T 70 50 T 90 50" stroke="currentColor" strokeWidth="1.5" fill="none" className="animate-pulse" style={{ animationDuration: "3s" }} />
        </svg>

        {/* === 装饰元素 === */}
        <div className="absolute top-16 right-1/4 w-20 h-20 border-2 border-cyan-400/10 rounded-lg animate-spin" style={{ animationDuration: "20s" }} />
        <div className="absolute bottom-20 left-1/4 w-16 h-16 border-2 border-purple-400/10 rounded-full animate-spin" style={{ animationDuration: "18s", animationDirection: "reverse" }} />

        {/* 漂浮粒子 */}
        <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-cyan-400/20 rounded-full animate-bounce" style={{ animationDelay: "0s", animationDuration: "3s" }} />
        <div className="absolute top-1/3 right-1/3 w-3 h-3 bg-purple-400/20 rounded-full animate-bounce" style={{ animationDelay: "0.5s", animationDuration: "3.5s" }} />
        <div className="absolute bottom-1/3 left-1/2 w-2 h-2 bg-pink-400/20 rounded-full animate-bounce" style={{ animationDelay: "1s", animationDuration: "4s" }} />
        <div className="absolute top-2/3 right-1/4 w-3 h-3 bg-amber-400/20 rounded-full animate-bounce" style={{ animationDelay: "1.5s", animationDuration: "3.2s" }} />
        <div className="absolute bottom-1/4 left-1/3 w-2 h-2 bg-emerald-400/20 rounded-full animate-bounce" style={{ animationDelay: "2s", animationDuration: "3.8s" }} />

        {/* 柔和的大型模糊圆形背景 */}
        <div className="absolute top-1/4 -left-32 w-[500px] h-[500px] bg-cyan-400/[0.08] rounded-full blur-3xl animate-pulse" style={{ animationDelay: "0s", animationDuration: "8s" }} />
        <div className="absolute bottom-1/4 -right-32 w-[500px] h-[500px] bg-purple-400/[0.08] rounded-full blur-3xl animate-pulse" style={{ animationDelay: "2s", animationDuration: "9s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-pink-400/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "4s", animationDuration: "10s" }} />
        <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-amber-400/[0.06] rounded-full blur-3xl animate-pulse" style={{ animationDelay: "6s", animationDuration: "11s" }} />
        <div className="absolute bottom-1/3 left-1/4 w-[450px] h-[450px] bg-emerald-400/[0.06] rounded-full blur-3xl animate-pulse" style={{ animationDelay: "3s", animationDuration: "9.5s" }} />
      </div>

      {/* 自定义动画 */}
      <style>{`
        @keyframes musicJump {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }
        @keyframes volumeBar {
          0%, 100% { transform: scaleY(0.3); }
          50% { transform: scaleY(1); }
        }
        @keyframes heartbeat {
          0%, 100% { transform: scale(1); }
          25% { transform: scale(1.2); }
          50% { transform: scale(1); }
        }
        @keyframes typing {
          0% { width: 0; opacity: 0; }
          10% { opacity: 1; }
          50% { width: 100%; opacity: 1; }
          90% { opacity: 1; }
          100% { width: 100%; opacity: 0; }
        }
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        @keyframes fadeInOut {
          0%, 100% { opacity: 0; transform: translateY(10px); }
          50% { opacity: 0.1; transform: translateY(0); }
        }
        @keyframes waveMove {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(-10px); }
        }
        .pixelated {
          image-rendering: pixelated;
          image-rendering: -moz-crisp-edges;
          image-rendering: crisp-edges;
        }
      `}</style>

      {/* 主要内容 */}
      <div className="max-w-7xl mx-auto px-6 py-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* 左侧边栏 */}
          <aside className="lg:col-span-1">
            <div className="lg:sticky lg:top-6">
              <Sidebar />
            </div>
          </aside>

          {/* 中间主要内容 */}
          <main className="lg:col-span-2 space-y-6">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <h2 className="text-2xl font-bold text-gray-900">最近发布</h2>
                <div className="h-1 flex-1 bg-gradient-to-r from-cyan-500/30 via-purple-500/30 to-transparent rounded-full" />
              </div>

              {isLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl p-5 animate-pulse"
                    >
                      <div className="h-1 bg-gray-200 rounded mb-4" />
                      <div className="flex justify-between mb-3">
                        <div className="h-5 w-16 bg-gray-200 rounded" />
                        <div className="h-4 w-12 bg-gray-200 rounded" />
                      </div>
                      <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
                      <div className="h-4 bg-gray-200 rounded w-full mb-4" />
                      <div className="flex gap-2 mb-4">
                        <div className="h-5 w-16 bg-gray-100 rounded" />
                        <div className="h-5 w-16 bg-gray-100 rounded" />
                      </div>
                      <div className="flex gap-4">
                        <div className="h-4 w-10 bg-gray-100 rounded" />
                        <div className="h-4 w-10 bg-gray-100 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {articles.map((article, index) => (
                    <ArticleCard key={index} {...article} />
                  ))}
                </div>
              )}

              {/* 加载更多 */}
              <div className="mt-6 text-center">
                <Button
                  variant="outline"
                  className="border-gray-300 bg-white hover:bg-gray-50 hover:border-cyan-300 hover:text-cyan-600 transition-all"
                >
                  加载更多文章
                </Button>
              </div>
            </div>
          </main>

          {/* 右侧边栏 */}
          <aside className="lg:col-span-1">
            <div className="lg:sticky lg:top-6 space-y-6">
              <MusicRecommendation />
              <TagCloud />
            </div>
          </aside>
        </div>
      </div>

      {/* 底部 */}
      <footer className="border-t border-gray-200 bg-white/80 backdrop-blur-sm mt-16 relative z-10">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center text-sm text-gray-500">
            <p>© 2026 JohnnyBlog. 用 ❤️ 和 ☕ 创作.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
