"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowRight, FolderOpen } from "lucide-react";
import { Navbar } from "@/components/home/Navbar";
import { fetchClient } from "@/lib/api";

interface Column {
  name: string;
  articleCount: number;
}

interface CategoryDisplay {
  id: string;
  name: string;
  emoji: string;
  description: string;
  gradient: string;
  columns: Column[];
}

const DEFAULT_CATEGORIES: CategoryDisplay[] = [
  {
    id: "1",
    name: "游戏世界",
    emoji: "🎮",
    description: "探索虚拟世界的奥秘",
    gradient: "from-cyan-500/20 to-blue-500/20",
    columns: [
      { name: "缺氧游戏", articleCount: 12 },
      { name: "独立游戏", articleCount: 8 },
      { name: "游戏设计", articleCount: 6 },
    ],
  },
  {
    id: "2",
    name: "音乐殿堂",
    emoji: "🎵",
    description: "用音符表达情感",
    gradient: "from-purple-500/20 to-pink-500/20",
    columns: [
      { name: "小提琴演奏", articleCount: 7 },
      { name: "钢琴学习", articleCount: 5 },
      { name: "音乐制作", articleCount: 8 },
      { name: "游戏音乐", articleCount: 6 },
    ],
  },
  {
    id: "3",
    name: "技术探索",
    emoji: "💻",
    description: "用代码改变世界",
    gradient: "from-emerald-500/20 to-teal-500/20",
    columns: [
      { name: "Web开发", articleCount: 24 },
      { name: "React生态", articleCount: 15 },
      { name: "TypeScript", articleCount: 10 },
      { name: "性能优化", articleCount: 8 },
    ],
  },
  {
    id: "4",
    name: "数学世界",
    emoji: "📐",
    description: "探索数字与逻辑之美",
    gradient: "from-amber-500/20 to-orange-500/20",
    columns: [
      { name: "高等数学", articleCount: 9 },
      { name: "线性代数", articleCount: 6 },
      { name: "概率统计", articleCount: 7 },
      { name: "数学建模", articleCount: 5 },
    ],
  },
  {
    id: "5",
    name: "AI时代",
    emoji: "🚀",
    description: "拥抱人工智能的未来",
    gradient: "from-rose-500/20 to-red-500/20",
    columns: [
      { name: "AI工具", articleCount: 12 },
      { name: "机器学习", articleCount: 7 },
      { name: "Prompt工程", articleCount: 9 },
    ],
  },
];

const GRADIENTS = [
  "from-cyan-500/20 to-blue-500/20",
  "from-purple-500/20 to-pink-500/20",
  "from-emerald-500/20 to-teal-500/20",
  "from-amber-500/20 to-orange-500/20",
  "from-rose-500/20 to-red-500/20",
  "from-indigo-500/20 to-purple-500/20",
];

export function CategoriesPageClient() {
  const [categories, setCategories] = useState<CategoryDisplay[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    try {
      const data = await fetchClient("/categories");

      interface CategoryDTO {
        id: string;
        name: string;
        icon?: string;
        description?: string;
        series?: {
          title: string;
          _count?: { items: number };
        }[];
      }

      if (Array.isArray(data) && data.length > 0) {
        const mapped: CategoryDisplay[] = (data as CategoryDTO[]).map(
          (cat, index) => ({
            id: cat.id,
            name: cat.name,
            emoji: cat.icon || "📂",
            description: cat.description || "探索更多内容",
            gradient: GRADIENTS[index % GRADIENTS.length] || "from-gray-500/20 to-gray-600/20",
            columns: (cat.series || []).map((s) => ({
              name: s.title,
              articleCount: s._count?.items || 0,
            })),
          })
        );
        setCategories(mapped);
      } else {
        setCategories(DEFAULT_CATEGORIES);
      }
    } catch {
      setCategories(DEFAULT_CATEGORIES);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-cyan-50/20 to-purple-50/20 relative overflow-hidden">
      {/* 动态背景效果 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* 游戏元素 - 像素方块 */}
        <div className="absolute top-20 left-10 w-4 h-4 bg-cyan-400/20 animate-pulse" style={{ animationDelay: "0s", animationDuration: "3s" }} />
        <div className="absolute top-40 left-32 w-3 h-3 bg-cyan-400/20 animate-pulse" style={{ animationDelay: "0.5s", animationDuration: "2.5s" }} />
        <div className="absolute top-60 left-20 w-5 h-5 bg-blue-400/20 animate-pulse" style={{ animationDelay: "1s", animationDuration: "3.5s" }} />
        <div className="absolute bottom-32 left-40 w-4 h-4 bg-cyan-400/20 animate-pulse" style={{ animationDelay: "1.5s", animationDuration: "2s" }} />

        {/* 音乐元素 - 音符 */}
        <div className="absolute top-32 right-20 text-4xl opacity-10 animate-bounce" style={{ animationDelay: "0s", animationDuration: "4s" }}>♪</div>
        <div className="absolute top-56 right-48 text-3xl opacity-10 animate-bounce" style={{ animationDelay: "1s", animationDuration: "3.5s" }}>♫</div>
        <div className="absolute bottom-40 right-32 text-5xl opacity-10 animate-bounce" style={{ animationDelay: "2s", animationDuration: "4.5s" }}>♬</div>

        {/* 技术元素 - 代码符号 */}
        <div className="absolute top-48 right-12 text-3xl opacity-10 text-emerald-600 animate-pulse" style={{ animationDelay: "0s", animationDuration: "3s" }}>&lt;/&gt;</div>
        <div className="absolute bottom-48 right-56 text-2xl opacity-10 text-emerald-600 animate-pulse" style={{ animationDelay: "1.5s", animationDuration: "2.5s" }}>&#123; &#125;</div>
        <div className="absolute top-72 right-72 text-4xl opacity-10 text-teal-600 animate-pulse" style={{ animationDelay: "2.5s", animationDuration: "3.5s" }}>⚡</div>

        {/* 柔和的模糊圆形背景 */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-cyan-400/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "0s", animationDuration: "6s" }} />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-purple-400/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "2s", animationDuration: "7s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-pink-400/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "4s", animationDuration: "8s" }} />

        {/* 游戏手柄图标 */}
        <svg className="absolute top-1/4 left-1/4 w-32 h-32 opacity-5 animate-spin" style={{ animationDuration: "20s" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M6 11h4m-2-2v4m8-1h.01M18 10h.01M8 3h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z" />
        </svg>

        {/* 音符波形 */}
        <svg className="absolute bottom-1/4 right-1/4 w-40 h-40 opacity-5" viewBox="0 0 200 100">
          <path d="M 0 50 Q 25 20, 50 50 T 100 50 T 150 50 T 200 50" stroke="currentColor" strokeWidth="2" fill="none" className="animate-pulse" style={{ animationDuration: "3s" }} />
          <path d="M 0 60 Q 25 30, 50 60 T 100 60 T 150 60 T 200 60" stroke="currentColor" strokeWidth="2" fill="none" className="animate-pulse" style={{ animationDelay: "0.5s", animationDuration: "3s" }} />
        </svg>

        {/* 电路板线条 */}
        <svg className="absolute top-1/3 right-1/3 w-48 h-48 opacity-5 text-emerald-600" viewBox="0 0 100 100">
          <line x1="10" y1="10" x2="90" y2="10" stroke="currentColor" strokeWidth="1" className="animate-pulse" style={{ animationDuration: "2s" }} />
          <line x1="10" y1="10" x2="10" y2="90" stroke="currentColor" strokeWidth="1" className="animate-pulse" style={{ animationDelay: "0.3s", animationDuration: "2s" }} />
          <line x1="50" y1="10" x2="50" y2="50" stroke="currentColor" strokeWidth="1" className="animate-pulse" style={{ animationDelay: "0.6s", animationDuration: "2s" }} />
          <line x1="10" y1="50" x2="90" y2="50" stroke="currentColor" strokeWidth="1" className="animate-pulse" style={{ animationDelay: "0.9s", animationDuration: "2s" }} />
          <circle cx="10" cy="10" r="3" fill="currentColor" className="animate-pulse" />
          <circle cx="50" cy="10" r="3" fill="currentColor" className="animate-pulse" style={{ animationDelay: "0.5s" }} />
          <circle cx="90" cy="10" r="3" fill="currentColor" className="animate-pulse" style={{ animationDelay: "1s" }} />
        </svg>
      </div>

      {/* 导航栏 */}
      <Navbar />

      {/* 主要内容 */}
      <div className="max-w-5xl mx-auto px-6 py-12 relative z-10">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-3 flex items-center gap-3">
            <FolderOpen className="h-10 w-10 text-cyan-600" />
            内容分类
          </h1>
          <p className="text-gray-600">按主题浏览所有专栏</p>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="bg-white/60 backdrop-blur-sm border border-white/40 rounded-2xl p-6 animate-pulse"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-14 h-14 bg-gray-200 rounded-lg" />
                  <div className="flex-1">
                    <div className="h-6 bg-gray-200 rounded w-32 mb-2" />
                    <div className="h-4 bg-gray-200 rounded w-48" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/30">
                  <div className="h-12 bg-gray-100 rounded-lg" />
                  <div className="h-12 bg-gray-100 rounded-lg" />
                  <div className="h-12 bg-gray-100 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {categories.map((category) => (
              <div
                key={category.id}
                className="group relative bg-transparent backdrop-blur-sm border border-white/40 rounded-2xl p-6 hover:border-cyan-300 hover:bg-white/20 hover:shadow-lg transition-all duration-300"
              >
                {/* 背景渐变 */}
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${category.gradient} opacity-0 group-hover:opacity-50 transition-opacity rounded-2xl`}
                />

                <div className="relative">
                  {/* 分类头部 */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className="text-5xl">{category.emoji}</div>
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold text-gray-900 mb-2 group-hover:text-cyan-600 transition-colors">
                        {category.name}
                      </h2>
                      <p className="text-gray-600">{category.description}</p>
                    </div>
                    <ArrowRight className="h-6 w-6 text-gray-400 group-hover:text-cyan-600 group-hover:translate-x-1 transition-all" />
                  </div>

                  {/* 专栏列表 */}
                  {category.columns.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/30">
                      {category.columns.map((column) => (
                        <div
                          key={column.name}
                          className="px-4 py-3 rounded-lg bg-white/20 backdrop-blur-sm border border-white/40 hover:bg-white/40 hover:border-cyan-300 transition-all cursor-pointer group/column"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-900 group-hover/column:text-cyan-600 transition-colors">
                              {column.name}
                            </span>
                            <span className="text-sm text-gray-500 bg-white/50 px-2 py-0.5 rounded-full border border-white/60">
                              {column.articleCount}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
