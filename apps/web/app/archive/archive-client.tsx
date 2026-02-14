"use client";

import { Calendar, FileText } from "lucide-react";
import { Navbar } from "@/components/home/Navbar";

interface ArchiveArticle {
  title: string;
  date: string;
  column: string;
}

interface ArchiveMonth {
  month: string;
  articles: ArchiveArticle[];
}

interface ArchiveYear {
  year: string;
  months: ArchiveMonth[];
}

const ARCHIVES: ArchiveYear[] = [
  {
    year: "2026",
    months: [
      {
        month: "2月",
        articles: [
          {
            title: "缺氧游戏氧气系统完全指南",
            date: "02-12",
            column: "缺氧游戏",
          },
          {
            title: "React 19 新特性深度解析",
            date: "02-10",
            column: "Web开发",
          },
          {
            title: "DAW 中的混音技巧与实战",
            date: "02-08",
            column: "音乐制作",
          },
          {
            title: "TypeScript 类型体操实用技巧",
            date: "02-05",
            column: "Web开发",
          },
        ],
      },
      {
        month: "1月",
        articles: [
          {
            title: "独立游戏开发者的音乐制作入门",
            date: "01-28",
            column: "音乐制作",
          },
          {
            title: "AI 辅助编程实战",
            date: "01-25",
            column: "AI探索",
          },
          {
            title: "游戏音效设计基础",
            date: "01-20",
            column: "音乐制作",
          },
          {
            title: "Next.js 14 完全指南",
            date: "01-15",
            column: "Web开发",
          },
          {
            title: "缺氧电力系统优化",
            date: "01-10",
            column: "缺氧游戏",
          },
        ],
      },
    ],
  },
  {
    year: "2025",
    months: [
      {
        month: "12月",
        articles: [
          {
            title: "年度游戏回顾",
            date: "12-30",
            column: "缺氧游戏",
          },
          {
            title: "我的音乐学习之路",
            date: "12-25",
            column: "音乐制作",
          },
          {
            title: "React Server Components 详解",
            date: "12-20",
            column: "Web开发",
          },
        ],
      },
    ],
  },
];

export function ArchivePageClient() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-amber-50/20 to-orange-50/20 relative overflow-hidden">
      {/* 数学主题动态背景 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* 数学符号 */}
        <div className="absolute top-20 left-20 text-5xl opacity-10 text-amber-600 animate-pulse" style={{ animationDelay: "0s", animationDuration: "3s" }}>∑</div>
        <div className="absolute top-40 right-32 text-4xl opacity-10 text-orange-600 animate-pulse" style={{ animationDelay: "0.5s", animationDuration: "3.5s" }}>π</div>
        <div className="absolute bottom-40 left-40 text-5xl opacity-10 text-amber-600 animate-pulse" style={{ animationDelay: "1s", animationDuration: "4s" }}>∫</div>
        <div className="absolute top-1/2 right-20 text-4xl opacity-10 text-orange-600 animate-pulse" style={{ animationDelay: "1.5s", animationDuration: "3.2s" }}>∞</div>
        <div className="absolute bottom-32 right-48 text-3xl opacity-10 text-amber-600 animate-pulse" style={{ animationDelay: "2s", animationDuration: "3.8s" }}>√</div>
        <div className="absolute top-64 left-56 text-4xl opacity-10 text-orange-600 animate-pulse" style={{ animationDelay: "2.5s", animationDuration: "3.3s" }}>α</div>
        <div className="absolute bottom-56 left-1/3 text-3xl opacity-10 text-amber-600 animate-pulse" style={{ animationDelay: "3s", animationDuration: "4.2s" }}>θ</div>

        {/* 数学公式 */}
        <div className="absolute top-32 right-1/4 opacity-5 text-amber-700 font-mono text-sm">
          <div className="animate-pulse" style={{ animationDelay: "0s" }}>e^(iπ) + 1 = 0</div>
        </div>
        <div className="absolute bottom-1/4 left-1/4 opacity-5 text-orange-700 font-mono text-sm">
          <div className="animate-pulse" style={{ animationDelay: "1s" }}>∫₀^∞ e^(-x²) dx = √π/2</div>
        </div>
        <div className="absolute top-1/3 left-1/2 opacity-5 text-amber-700 font-mono text-sm">
          <div className="animate-pulse" style={{ animationDelay: "2s" }}>lim(n→∞) (1+1/n)ⁿ = e</div>
        </div>

        {/* 几何图形 - 圆 */}
        <svg className="absolute top-1/4 left-1/4 w-32 h-32 opacity-5 text-amber-600" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="2" className="animate-pulse" style={{ animationDuration: "3s" }} />
          <line x1="50" y1="10" x2="50" y2="90" stroke="currentColor" strokeWidth="1" className="animate-pulse" style={{ animationDelay: "0.5s" }} />
          <line x1="10" y1="50" x2="90" y2="50" stroke="currentColor" strokeWidth="1" className="animate-pulse" style={{ animationDelay: "1s" }} />
        </svg>

        {/* 三角形 */}
        <svg className="absolute bottom-1/4 right-1/4 w-40 h-40 opacity-5 text-orange-600" viewBox="0 0 100 100">
          <polygon points="50,10 90,80 10,80" fill="none" stroke="currentColor" strokeWidth="2" className="animate-pulse" style={{ animationDuration: "4s" }} />
          <line x1="50" y1="10" x2="50" y2="80" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2" className="animate-pulse" style={{ animationDelay: "0.5s" }} />
        </svg>

        {/* 坐标系 */}
        <svg className="absolute top-1/2 left-20 w-48 h-48 opacity-5 text-amber-600" viewBox="0 0 100 100">
          <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="1" />
          <line x1="50" y1="0" x2="50" y2="100" stroke="currentColor" strokeWidth="1" />
          <polygon points="100,50 95,47 95,53" fill="currentColor" />
          <polygon points="50,0 47,5 53,5" fill="currentColor" />
          <path d="M 10 50 Q 20 30, 30 50 T 50 50 T 70 50 T 90 50" stroke="currentColor" strokeWidth="1.5" fill="none" className="animate-pulse" style={{ animationDuration: "3s" }} />
        </svg>

        {/* 矩阵 */}
        <div className="absolute bottom-1/3 right-1/3 opacity-5 text-orange-700 font-mono text-xs">
          <div className="border-l-2 border-r-2 border-current px-2 py-1 animate-pulse" style={{ animationDuration: "3.5s" }}>
            <div>1  0  0</div>
            <div>0  1  0</div>
            <div>0  0  1</div>
          </div>
        </div>

        {/* 数学网格 */}
        <svg className="absolute top-1/3 right-10 w-40 h-40 opacity-5 text-amber-600" viewBox="0 0 100 100">
          <line x1="0" y1="20" x2="100" y2="20" stroke="currentColor" strokeWidth="0.5" />
          <line x1="0" y1="40" x2="100" y2="40" stroke="currentColor" strokeWidth="0.5" />
          <line x1="0" y1="60" x2="100" y2="60" stroke="currentColor" strokeWidth="0.5" />
          <line x1="0" y1="80" x2="100" y2="80" stroke="currentColor" strokeWidth="0.5" />
          <line x1="20" y1="0" x2="20" y2="100" stroke="currentColor" strokeWidth="0.5" />
          <line x1="40" y1="0" x2="40" y2="100" stroke="currentColor" strokeWidth="0.5" />
          <line x1="60" y1="0" x2="60" y2="100" stroke="currentColor" strokeWidth="0.5" />
          <line x1="80" y1="0" x2="80" y2="100" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="20" cy="20" r="2" fill="currentColor" className="animate-pulse" />
          <circle cx="40" cy="60" r="2" fill="currentColor" className="animate-pulse" style={{ animationDelay: "0.5s" }} />
          <circle cx="60" cy="40" r="2" fill="currentColor" className="animate-pulse" style={{ animationDelay: "1s" }} />
          <circle cx="80" cy="80" r="2" fill="currentColor" className="animate-pulse" style={{ animationDelay: "1.5s" }} />
        </svg>

        {/* 分形图案 */}
        <svg className="absolute bottom-20 left-1/2 w-32 h-32 opacity-5 text-orange-600" viewBox="0 0 100 100">
          <polygon points="50,20 70,60 30,60" fill="none" stroke="currentColor" strokeWidth="1" className="animate-pulse" />
          <polygon points="50,30 60,50 40,50" fill="none" stroke="currentColor" strokeWidth="1" className="animate-pulse" style={{ animationDelay: "0.3s" }} />
          <polygon points="50,37 55,45 45,45" fill="none" stroke="currentColor" strokeWidth="1" className="animate-pulse" style={{ animationDelay: "0.6s" }} />
        </svg>

        {/* 柔和的模糊圆形背景 */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "0s", animationDuration: "7s" }} />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-orange-400/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "2s", animationDuration: "8s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-400/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "4s", animationDuration: "9s" }} />
      </div>

      {/* 导航栏 */}
      <Navbar />

      {/* 主要内容 */}
      <div className="max-w-4xl mx-auto px-6 py-12 relative z-10">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-3 flex items-center gap-3">
            <Calendar className="h-10 w-10 text-cyan-600" />
            文章归档
          </h1>
          <p className="text-gray-600">按时间浏览所有文章</p>
        </div>

        {/* 归档列表 */}
        <div className="space-y-12">
          {ARCHIVES.map((yearData) => (
            <div key={yearData.year}>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">
                {yearData.year}
              </h2>

              <div className="space-y-8">
                {yearData.months.map((monthData) => (
                  <div
                    key={monthData.month}
                    className="relative pl-8 border-l-2 border-gray-200"
                  >
                    <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-cyan-500 border-4 border-white" />

                    <h3 className="text-xl font-semibold text-gray-900 mb-4">
                      {monthData.month}
                    </h3>

                    <div className="space-y-3">
                      {monthData.articles.map((article, index) => (
                        <div
                          key={index}
                          className="bg-transparent backdrop-blur-sm border border-white/40 rounded-lg p-4 hover:border-cyan-300 hover:bg-white/20 hover:shadow-lg transition-all cursor-pointer group"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900 mb-1 group-hover:text-cyan-600 transition-colors">
                                {article.title}
                              </h4>
                              <div className="flex items-center gap-3 text-sm text-gray-500">
                                <span className="flex items-center gap-1">
                                  <FileText className="h-3.5 w-3.5" />
                                  {article.column}
                                </span>
                              </div>
                            </div>
                            <span className="text-sm text-gray-500 whitespace-nowrap">
                              {yearData.year}-{article.date}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
