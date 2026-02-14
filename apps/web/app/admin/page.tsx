"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  FileText,
  Eye,
  ThumbsUp,
  MessageSquare,
  TrendingUp,
  Sparkles,
  ArrowRight,
  Plus,
  BarChart3,
  Edit,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/admin/dashboard/StatCard";
import { CategoryManager } from "@/components/admin/dashboard/CategoryManager";
import { fetchClient } from "@/lib/api";

interface StatItem {
  title: string;
  value: string;
  change: string;
  changeType: "increase" | "decrease";
  icon: typeof LayoutGrid;
  gradient: string;
}

interface RecentActivity {
  id: string;
  type: "文章" | "评论" | "点赞";
  title: string;
  column: string;
  time: string;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<StatItem[]>([]);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(true);

  const fetchDashboardData = useCallback(async () => {
    try {
      const [seriesData, postsData] = await Promise.all([
        fetchClient("/series").catch(() => []),
        fetchClient("/posts").catch(() => []),
      ]);

      const seriesCount = Array.isArray(seriesData) ? seriesData.length : 0;
      const postsCount = Array.isArray(postsData) ? postsData.length : 0;

      setStats([
        {
          title: "总专栏数",
          value: String(seriesCount),
          change: "+3",
          changeType: "increase",
          icon: LayoutGrid,
          gradient: "from-cyan-500 to-blue-500",
        },
        {
          title: "总文章数",
          value: String(postsCount),
          change: "+12",
          changeType: "increase",
          icon: FileText,
          gradient: "from-purple-500 to-pink-500",
        },
        {
          title: "总阅读量",
          value: "45.2K",
          change: "+8.3%",
          changeType: "increase",
          icon: Eye,
          gradient: "from-green-500 to-teal-500",
        },
        {
          title: "总点赞数",
          value: "3,842",
          change: "+156",
          changeType: "increase",
          icon: ThumbsUp,
          gradient: "from-orange-500 to-red-500",
        },
        {
          title: "总评论数",
          value: "1,234",
          change: "+45",
          changeType: "increase",
          icon: MessageSquare,
          gradient: "from-yellow-500 to-orange-500",
        },
        {
          title: "本周增长",
          value: "+23%",
          change: "+5%",
          changeType: "increase",
          icon: TrendingUp,
          gradient: "from-indigo-500 to-purple-500",
        },
      ]);

      interface PostDTO {
        id: string;
        title: string;
        series?: { title: string };
        category?: { name: string };
        updatedAt: string;
      }

      const activities: RecentActivity[] = Array.isArray(postsData)
        ? (postsData as PostDTO[]).slice(0, 5).map((post) => ({
            id: post.id,
            type: "文章" as const,
            title: post.title || "未命名文章",
            column:
              post.series?.title || post.category?.name || "未分配",
            time: getRelativeTime(post.updatedAt),
          }))
        : [];

      if (activities.length === 0) {
        setRecentActivities(DEFAULT_ACTIVITIES);
      } else {
        setRecentActivities(activities);
      }
    } catch (error) {
      console.error(error);
      setStats(DEFAULT_STATS);
      setRecentActivities(DEFAULT_ACTIVITIES);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-cyan-50/30 to-purple-50/30">
      {/* 背景装饰 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-cyan-400/10 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute bottom-1/4 -right-20 w-96 h-96 bg-purple-400/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "1s" }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-pink-400/5 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "2s" }}
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        {/* 头部 */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-cyan-500 to-purple-500 rounded-xl shadow-lg shadow-purple-500/30">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                  管理仪表板
                </h1>
                <p className="text-gray-600 mt-1">快速管理你的博客内容</p>
              </div>
            </div>

            <Button
              onClick={() => router.push("/")}
              variant="outline"
              size="sm"
              className="border-gray-300 hover:bg-white"
            >
              <ArrowRight className="h-4 w-4 mr-2 rotate-180" />
              返回主页
            </Button>
          </div>
        </div>

        {/* 内容管理 - 第一优先级 */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Edit className="h-5 w-5 text-cyan-600" />
            内容管理
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 创建文章 - 最突出 */}
            <button
              onClick={() => router.push("/admin/posts/new")}
              className="group relative overflow-hidden bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 rounded-2xl p-6 shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-[1.02]"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                  <Plus className="h-7 w-7 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">
                    创建文章
                  </h3>
                  <p className="text-sm text-white/80">写一篇新文章</p>
                </div>
              </div>
            </button>

            {/* 管理专栏 */}
            <button
              onClick={() => router.push("/admin/series")}
              className="group bg-white border-2 border-cyan-200 hover:border-cyan-400 rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02]"
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 bg-gradient-to-br from-cyan-100 to-cyan-200 rounded-xl flex items-center justify-center group-hover:from-cyan-200 group-hover:to-cyan-300 transition-colors">
                  <LayoutGrid className="h-7 w-7 text-cyan-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">
                    管理专栏
                  </h3>
                  <p className="text-sm text-gray-600">组织和编辑专栏</p>
                </div>
              </div>
            </button>

            {/* 管理文章 */}
            <button
              onClick={() => router.push("/admin/posts")}
              className="group bg-white border-2 border-purple-200 hover:border-purple-400 rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02]"
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 bg-gradient-to-br from-purple-100 to-purple-200 rounded-xl flex items-center justify-center group-hover:from-purple-200 group-hover:to-purple-300 transition-colors">
                  <FileText className="h-7 w-7 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">
                    管理文章
                  </h3>
                  <p className="text-sm text-gray-600">管理独立文章</p>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* 分类管理 - 第二优先级 */}
        <div className="mb-8" id="category-manager">
          <CategoryManager />
        </div>

        {/* 数据统计 - 第三优先级 */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-purple-600" />
            数据统计
          </h2>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="bg-white border border-gray-200 rounded-xl p-6 animate-pulse"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-gray-200 rounded-lg" />
                    <div className="w-12 h-5 bg-gray-200 rounded" />
                  </div>
                  <div className="h-4 bg-gray-200 rounded w-20 mb-2" />
                  <div className="h-8 bg-gray-200 rounded w-16" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {stats.map((stat, index) => (
                <StatCard key={index} {...stat} />
              ))}
            </div>
          )}
        </div>

        {/* 最近活动 - 第四优先级 */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-pink-600" />
            最近活动
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="space-y-4">
              {recentActivities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div
                    className={`w-2 h-2 mt-2 rounded-full ${
                      activity.type === "文章"
                        ? "bg-cyan-500"
                        : activity.type === "评论"
                          ? "bg-purple-500"
                          : "bg-pink-500"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {activity.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {activity.column} · {activity.time}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${
                      activity.type === "文章"
                        ? "bg-cyan-100 text-cyan-700"
                        : activity.type === "评论"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-pink-100 text-pink-700"
                    }`}
                  >
                    {activity.type}
                  </span>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              className="w-full mt-4 border-gray-300 hover:bg-gray-50"
              onClick={() => router.push("/admin/series")}
            >
              查看所有活动
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_STATS: StatItem[] = [
  {
    title: "总专栏数",
    value: "25",
    change: "+3",
    changeType: "increase",
    icon: LayoutGrid,
    gradient: "from-cyan-500 to-blue-500",
  },
  {
    title: "总文章数",
    value: "156",
    change: "+12",
    changeType: "increase",
    icon: FileText,
    gradient: "from-purple-500 to-pink-500",
  },
  {
    title: "总阅读量",
    value: "45.2K",
    change: "+8.3%",
    changeType: "increase",
    icon: Eye,
    gradient: "from-green-500 to-teal-500",
  },
  {
    title: "总点赞数",
    value: "3,842",
    change: "+156",
    changeType: "increase",
    icon: ThumbsUp,
    gradient: "from-orange-500 to-red-500",
  },
  {
    title: "总评论数",
    value: "1,234",
    change: "+45",
    changeType: "increase",
    icon: MessageSquare,
    gradient: "from-yellow-500 to-orange-500",
  },
  {
    title: "本周增长",
    value: "+23%",
    change: "+5%",
    changeType: "increase",
    icon: TrendingUp,
    gradient: "from-indigo-500 to-purple-500",
  },
];

const DEFAULT_ACTIVITIES: RecentActivity[] = [
  {
    id: "1",
    type: "文章",
    title: "缺氧游戏基础玩法指南",
    column: "缺氧游戏",
    time: "2分钟前",
  },
  {
    id: "2",
    type: "评论",
    title: "AI技术的最新突破",
    column: "AI技术探索",
    time: "15分钟前",
  },
  {
    id: "3",
    type: "点赞",
    title: "Web开发最佳实践",
    column: "Web开发实践",
    time: "1小时前",
  },
  {
    id: "4",
    type: "文章",
    title: "数字艺术创作技巧",
    column: "数字艺术创作",
    time: "3小时前",
  },
  {
    id: "5",
    type: "评论",
    title: "游戏音乐赏析",
    column: "游戏音乐赏析",
    time: "5小时前",
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
  if (diffDays < 30) return `${diffDays}天前`;
  return date.toLocaleDateString("zh-CN");
}
