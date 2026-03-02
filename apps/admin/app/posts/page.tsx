"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { fetchClient } from "@/lib/api";

interface PostItem {
  id: string;
  title: string;
  slug: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string; icon?: string } | null;
}

interface CategoryOption {
  id: string;
  name: string;
  icon?: string;
}

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

export default function PostsManagementPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  const fetchData = useCallback(async () => {
    try {
      const [postsData, categoriesData] = await Promise.all([
        fetchClient("/posts?standalone=true").catch(() => []),
        fetchClient("/categories").catch(() => []),
      ]);

      if (Array.isArray(postsData)) {
        setPosts(
          (postsData as PostItem[]).map((p) => ({
            id: p.id,
            title: p.title || "Untitled",
            slug: p.slug,
            published: p.published,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
            category: p.category,
          }))
        );
      }

      interface CategoryDTO {
        id: string;
        name: string;
        icon?: string;
      }

      if (Array.isArray(categoriesData)) {
        setCategories(
          (categoriesData as CategoryDTO[]).map((c) => ({
            id: c.id,
            name: c.name,
            icon: c.icon || "📂",
          }))
        );
      }
    } catch (error) {
      console.error(error);
      toast.error("加载数据失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`确定要删除文章「${title}」吗？此操作无法撤销。`)) return;

    try {
      await fetchClient(`/posts/${id}`, { method: "DELETE" });
      setPosts(posts.filter((p) => p.id !== id));
      toast.success("文章已删除");
    } catch (error) {
      console.error(error);
      toast.error("删除失败");
    }
  };

  const handleTogglePublish = async (id: string, currentStatus: boolean) => {
    try {
      await fetchClient(`/posts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ published: !currentStatus }),
      });
      setPosts(
        posts.map((p) =>
          p.id === id ? { ...p, published: !currentStatus } : p
        )
      );
      toast.success(currentStatus ? "已取消发布" : "已发布");
    } catch (error) {
      console.error(error);
      toast.error("操作失败");
    }
  };

  const filteredPosts = posts.filter((post) => {
    const matchesSearch =
      !searchQuery ||
      post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.slug.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      filterCategory === "all" || post.category?.id === filterCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-cyan-50/30 to-purple-50/30">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-cyan-400/10 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute bottom-1/4 -right-20 w-96 h-96 bg-purple-400/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "1s" }}
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        {/* 头部 */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl shadow-lg shadow-purple-500/30">
                <FileText className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-cyan-600 bg-clip-text text-transparent">
                  文章管理
                </h1>
                <p className="text-gray-600 mt-1">
                  管理所有独立文章，支持直接编辑
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={() => router.push("/")}
                variant="outline"
                size="sm"
                className="border-gray-300 hover:bg-white"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                返回仪表板
              </Button>
              <Button
                onClick={() => router.push("/posts/new")}
                className="bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 hover:from-cyan-600 hover:via-purple-600 hover:to-pink-600 text-white font-semibold shadow-lg shadow-purple-500/30"
              >
                <Plus className="h-4 w-4 mr-2" />
                创建文章
              </Button>
            </div>
          </div>
        </div>

        {/* 搜索和过滤 */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索文章标题或 slug..."
              className="pl-10 border-gray-300"
            />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-full md:w-48 border-gray-300">
              <SelectValue placeholder="所有分类" />
            </SelectTrigger>
            <SelectContent className="bg-white border-gray-200">
              <SelectItem value="all">所有分类</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 文章列表 */}
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="bg-white border border-gray-200 rounded-xl p-5 animate-pulse"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="h-5 bg-gray-200 rounded w-1/3 mb-2" />
                    <div className="h-4 bg-gray-100 rounded w-1/2" />
                  </div>
                  <div className="flex gap-2">
                    <div className="w-8 h-8 bg-gray-200 rounded" />
                    <div className="w-8 h-8 bg-gray-200 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {searchQuery || filterCategory !== "all"
                ? "没有找到匹配的文章"
                : "还没有文章"}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {searchQuery || filterCategory !== "all"
                ? "尝试修改搜索条件"
                : "点击上方按钮创建第一篇文章"}
            </p>
            {!searchQuery && filterCategory === "all" && (
              <Button
                onClick={() => router.push("/posts/new")}
                className="bg-gradient-to-r from-cyan-500 to-purple-500 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                创建文章
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPosts.map((post) => (
              <div
                key={post.id}
                className="bg-white border border-gray-200 rounded-xl p-5 hover:border-cyan-300 hover:shadow-md transition-all duration-200 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {post.title}
                      </h3>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${post.published
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                          }`}
                      >
                        {post.published ? "已发布" : "草稿"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-500">
                      {post.category && (
                        <span className="flex items-center gap-1">
                          <span>{post.category.icon || "📂"}</span>
                          {post.category.name}
                        </span>
                      )}
                      <span>/article/{post.slug}</span>
                      <span>·</span>
                      <span>更新于 {getRelativeTime(post.updatedAt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        handleTogglePublish(post.id, post.published)
                      }
                      className={
                        post.published
                          ? "text-yellow-600 hover:bg-yellow-50"
                          : "text-green-600 hover:bg-green-50"
                      }
                      title={post.published ? "取消发布" : "发布"}
                    >
                      {post.published ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        router.push(`/posts/${post.id}/edit`)
                      }
                      className="text-cyan-600 hover:bg-cyan-50"
                      title="编辑"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(post.id, post.title)}
                      className="text-red-600 hover:bg-red-50"
                      title="删除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 统计 */}
        {!isLoading && (
          <div className="mt-6 text-sm text-gray-500 text-center">
            共 {filteredPosts.length} 篇文章
            {(searchQuery || filterCategory !== "all") &&
              ` (总计 ${posts.length} 篇)`}
          </div>
        )}
      </div>
    </div>
  );
}
