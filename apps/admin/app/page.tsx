"use client";

import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  FileText,
  Sparkles,
  ArrowRight,
  Plus,
  Edit,
  Music,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryManager } from "@/components/admin/dashboard/CategoryManager";

export default function AdminDashboard() {
  const router = useRouter();

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 创建文章 - 最突出 */}
            <button
              onClick={() => router.push("/posts/new")}
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
              onClick={() => router.push("/series")}
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
              onClick={() => router.push("/posts")}
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

            {/* 音乐管理 */}
            <button
              onClick={() => router.push("/music")}
              className="group bg-white border-2 border-pink-200 hover:border-pink-400 rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 hover:scale-[1.02]"
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 bg-gradient-to-br from-pink-100 to-pink-200 rounded-xl flex items-center justify-center group-hover:from-pink-200 group-hover:to-pink-300 transition-colors">
                  <Music className="h-7 w-7 text-pink-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">
                    音乐管理
                  </h3>
                  <p className="text-sm text-gray-600">管理音乐库</p>
                </div>
              </div>
            </button>

          </div>

          {/* 音乐上传快捷入口 */}
          <div className="mt-4">
            <button
              onClick={() => router.push("/music/upload")}
              className="group w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white rounded-xl p-4 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-[1.01]"
            >
              <div className="flex items-center justify-center gap-3">
                <Upload className="h-5 w-5" />
                <span className="font-semibold">批量上传音乐</span>
              </div>
            </button>
          </div>
        </div>

        {/* 分类管理 - 第二优先级 */}
        <div className="mb-8" id="category-manager">
          <CategoryManager />
        </div>
      </div>
    </div>
  );
}
