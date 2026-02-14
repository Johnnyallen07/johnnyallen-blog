"use client";

import { useState, useEffect } from "react";
import { Plus, Search, Sparkles, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SeriesCard } from "@/components/admin/series/SeriesCard";
import {
  SeriesDialog,
  type SeriesFormData,
} from "@/components/admin/series/SeriesDialog";
import { toast } from "sonner";

interface Series {
  id: string;
  name: string;
  url: string; // slug
  category: string;
  articleCount: number;
  lastUpdated: string;
  emoji: string;
  description?: string;
  thumbnailUrl?: string;
  published: boolean;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function SeriesListPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSeries, setEditingSeries] = useState<
    SeriesFormData | undefined
  >();
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string; emoji?: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSeries = async () => {
    try {
      const [seriesRes, categoriesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/series`),
        fetch(`${API_BASE_URL}/categories`)
      ]);

      if (!seriesRes.ok) throw new Error("Failed to fetch series");
      const data = await seriesRes.json();

      interface CategoryDTO {
        id: string;
        name: string;
        icon?: string;
      }

      interface SeriesDTO {
        id: string;
        title: string;
        slug: string;
        category?: { name: string };
        _count?: { items: number };
        updatedAt: string;
        description?: string;
        thumbnailUrl?: string;
        emoji?: string;
        published: boolean;
      }

      if (categoriesRes.ok) {
        const cats: CategoryDTO[] = await categoriesRes.json();
        setCategories(cats.map((c) => ({ id: c.id, name: c.name, emoji: c.icon })));
      }

      // Map backend data to frontend model
      const seriesData: SeriesDTO[] = data;
      const mappedSeries: Series[] = seriesData.map((item) => ({
        id: item.id,
        name: item.title,
        url: item.slug,
        category: item.category?.name || "未分类",
        articleCount: item._count?.items || 0,
        lastUpdated: new Date(item.updatedAt).toLocaleDateString(),
        emoji: item.emoji || "📝",
        description: item.description,
        thumbnailUrl: item.thumbnailUrl,
        published: item.published
      }));

      setSeriesList(mappedSeries);
    } catch (error) {
      console.error(error);
      toast.error("获取数据失败");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSeries();
  }, []);

  const filteredSeries = seriesList.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateSeries = () => {
    setEditingSeries(undefined);
    setDialogOpen(true);
  };

  const handleEditSeries = (series: Series) => {
    const matchedCategory = categories.find(c => c.name === series.category);
    setEditingSeries({
      id: series.id,
      name: series.name,
      url: series.url,
      category: matchedCategory ? matchedCategory.id : "",
      emoji: series.emoji,
      description: series.description || "",
    });
    setDialogOpen(true);
  };

  const handleDeleteSeries = async (id: string) => {
    if (confirm("确定要删除这个专栏吗？")) {
      try {
        const res = await fetch(`${API_BASE_URL}/series/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete");

        setSeriesList(seriesList.filter((s) => s.id !== id));
        toast.success("专栏已删除");
      } catch (error) {
        console.error(error);
        toast.error("删除失败");
      }
    }
  };

  // This handles both Create and Update from the Dialog
  const handleSaveSeries = async (formData: SeriesFormData) => {
    try {
      if (formData.id) {
        // Update
        const payload = {
          title: formData.name,
          slug: formData.url,
          description: formData.description,
          emoji: formData.emoji,
          categoryId: formData.category,
        };

        const res = await fetch(`${API_BASE_URL}/series/${formData.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error("Failed to update");

        toast.success("专栏已更新");
      } else {
        // Create
        const payload = {
          title: formData.name,
          slug: formData.url,
          description: formData.description,
          emoji: formData.emoji,
          categoryId: formData.category,
          authorId: "123e4567-e89b-12d3-a456-426614174000", // TODO: 从 auth context 获取真实用户 ID
          withDefaults: true,
        };

        const res = await fetch(`${API_BASE_URL}/series`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || "Failed to create");
        }

        toast.success("专栏已创建");
      }

      // Refresh list
      fetchSeries();
      setDialogOpen(false);
    } catch (error: unknown) {
      console.error(error);
      const message = error instanceof Error ? error.message : "操作失败";
      toast.error(message);
    }
  };

  const handleSeriesClick = (series: Series) => {
    router.push(`/admin/series/${series.id}`); // Use ID instead of URL/Slug to be safe, or slug? Backend findOne uses ID.
  };

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
        <div className="mb-12">
          <Button
            onClick={() => router.push("/admin")}
            variant="ghost"
            size="sm"
            className="mb-4 text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回仪表板
          </Button>

          <div className="flex items-center gap-3 mb-3">
            <div className="p-3 bg-gradient-to-br from-cyan-500 to-purple-500 rounded-xl shadow-lg shadow-purple-500/30">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                我的专栏
              </h1>
              <p className="text-gray-600 mt-1">管理和创作你的内容世界</p>
            </div>
          </div>
        </div>

        {/* 操作栏 */}
        <div className="mb-8 flex flex-col sm:flex-row gap-4 items-center justify-between bg-white/80 backdrop-blur-sm p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="relative flex-1 w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索专栏..."
              className="pl-10 bg-gray-50 border-gray-200 focus:border-cyan-500"
            />
          </div>
          <Button
            onClick={handleCreateSeries}
            className="relative overflow-hidden bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 hover:from-cyan-600 hover:via-purple-600 hover:to-pink-600 text-white font-semibold shadow-lg shadow-purple-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/40 hover:scale-[1.02] w-full sm:w-auto"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12 -translate-x-full animate-[shimmer_2s_infinite]" />
            <Plus className="h-5 w-5 mr-2" />
            <span>创建新专栏</span>
          </Button>
        </div>

        {/* 专栏网格 */}
        {isLoading ? (
          <div className="text-center py-20">加载中...</div>
        ) : filteredSeries.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSeries.map((series) => (
              <SeriesCard
                key={series.id}
                {...series}
                onClick={() => handleSeriesClick(series)}
                onEdit={() => handleEditSeries(series)}
                onDelete={() => handleDeleteSeries(series.id)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📝</div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              {searchQuery ? "没有找到匹配的专栏" : "还没有专栏"}
            </h3>
            <p className="text-gray-500 mb-6">
              {searchQuery
                ? "试试其他关键词"
                : "创建你的第一个专栏，开始写作之旅"}
            </p>
            {!searchQuery && (
              <Button
                onClick={handleCreateSeries}
                className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 text-white"
              >
                <Plus className="h-5 w-5 mr-2" />
                创建新专栏
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 创建/编辑对话框 */}
      <SeriesDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        series={editingSeries}
        onSave={handleSaveSeries}
        categories={categories}
      />

    </div>
  );
}
