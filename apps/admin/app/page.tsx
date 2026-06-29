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
    <div className="min-h-screen bg-gradient-to-br from-amber-50/60 via-orange-50/40 to-yellow-50/60">
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* 头部 */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-100 rounded-xl">
                <Sparkles className="h-8 w-8 text-amber-600" />
              </div>
              <div>
                <h1 className="text-3xl font-semibold text-gray-900">
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
            <Edit className="h-5 w-5 text-amber-600" />
            内容管理
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 创建文章 - 最突出 */}
            <button
              onClick={() => router.push("/posts/new")}
              className="group bg-white border border-amber-200 rounded-xl p-6 shadow-sm hover:shadow-md hover:bg-amber-50/40 transition-colors"
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 bg-amber-100 rounded-xl flex items-center justify-center">
                  <Plus className="h-7 w-7 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">
                    创建文章
                  </h3>
                  <p className="text-sm text-gray-600">写一篇新文章</p>
                </div>
              </div>
            </button>

            {/* 管理专栏 */}
            <button
              onClick={() => router.push("/series")}
              className="group bg-white border border-gray-200 hover:border-amber-200 rounded-xl p-6 shadow-sm hover:shadow-md hover:bg-amber-50/30 transition-colors"
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 bg-amber-100 rounded-xl flex items-center justify-center">
                  <LayoutGrid className="h-7 w-7 text-amber-600" />
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
              className="group bg-white border border-gray-200 hover:border-amber-200 rounded-xl p-6 shadow-sm hover:shadow-md hover:bg-amber-50/30 transition-colors"
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 bg-amber-100 rounded-xl flex items-center justify-center">
                  <FileText className="h-7 w-7 text-amber-600" />
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
              className="group bg-white border border-gray-200 hover:border-amber-200 rounded-xl p-6 shadow-sm hover:shadow-md hover:bg-amber-50/30 transition-colors"
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 bg-amber-100 rounded-xl flex items-center justify-center">
                  <Music className="h-7 w-7 text-amber-600" />
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
              className="group w-full bg-amber-500 hover:bg-amber-600 text-white rounded-xl p-4 shadow-sm transition-colors"
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
