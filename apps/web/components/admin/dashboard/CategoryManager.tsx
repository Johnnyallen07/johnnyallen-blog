"use client";

import { useState, useEffect, useCallback } from "react";
import { Edit, Trash2, Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { fetchClient } from "@/lib/api";

interface Category {
  id: string;
  name: string;
  slug: string;
  emoji: string;
  color: string;
  columnCount: number;
}

interface CategoryFormData {
  name: string;
  emoji: string;
}

const GRADIENT_COLORS = [
  "from-cyan-500 to-blue-500",
  "from-purple-500 to-pink-500",
  "from-green-500 to-teal-500",
  "from-orange-500 to-red-500",
  "from-yellow-500 to-orange-500",
  "from-indigo-500 to-purple-500",
  "from-pink-500 to-rose-500",
];

const EMOJI_OPTIONS = [
  "🎮",
  "🎵",
  "💻",
  "🎨",
  "⭐",
  "📚",
  "📰",
  "🎬",
  "🏆",
  "🚀",
  "💡",
  "🎯",
];

export function CategoryManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newCategory, setNewCategory] = useState<CategoryFormData>({
    name: "",
    emoji: "🎯",
  });
  const [isLoading, setIsLoading] = useState(true);

  // 编辑弹窗状态
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editForm, setEditForm] = useState<CategoryFormData>({
    name: "",
    emoji: "🎯",
  });

  const fetchCategories = useCallback(async () => {
    try {
      const data = await fetchClient("/categories");

      interface CategoryDTO {
        id: string;
        name: string;
        slug?: string;
        icon?: string;
        _count?: { series: number };
      }

      const mapped: Category[] = (data as CategoryDTO[]).map(
        (cat, index) => ({
          id: cat.id,
          name: cat.name,
          slug: cat.slug || cat.name.toLowerCase().replace(/\s+/g, "-"),
          emoji: cat.icon || "📂",
          color:
            GRADIENT_COLORS[index % GRADIENT_COLORS.length] ||
            "from-gray-500 to-gray-600",
          columnCount: cat._count?.series ?? 0,
        })
      );
      setCategories(mapped);
    } catch (error) {
      console.error(error);
      setCategories([
        {
          id: "1",
          name: "游戏",
          slug: "gaming",
          emoji: "🎮",
          color: "from-cyan-500 to-blue-500",
          columnCount: 0,
        },
        {
          id: "2",
          name: "音乐",
          slug: "music",
          emoji: "🎵",
          color: "from-purple-500 to-pink-500",
          columnCount: 0,
        },
        {
          id: "3",
          name: "技术",
          slug: "tech",
          emoji: "💻",
          color: "from-green-500 to-teal-500",
          columnCount: 0,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleOpenEdit = (category: Category) => {
    setEditingCategory(category);
    setEditForm({ name: category.name, emoji: category.emoji });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingCategory) return;
    if (!editForm.name.trim()) {
      toast.error("请输入分类名称");
      return;
    }

    try {
      await fetchClient(`/categories/${editingCategory.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editForm.name,
          slug: editingCategory.slug,
          icon: editForm.emoji,
        }),
      });
      setCategories(
        categories.map((cat) =>
          cat.id === editingCategory.id
            ? { ...cat, name: editForm.name, emoji: editForm.emoji }
            : cat
        )
      );
      setEditDialogOpen(false);
      setEditingCategory(null);
      toast.success("分类已更新");
    } catch (error) {
      console.error(error);
      toast.error("更新分类失败");
    }
  };

  const handleDelete = async (id: string) => {
    const category = categories.find((c) => c.id === id);
    if (category && category.columnCount > 0) {
      toast.error("该分类下还有专栏，无法删除");
      return;
    }

    if (!confirm("确定要删除这个分类吗？")) return;

    try {
      await fetchClient(`/categories/${id}`, { method: "DELETE" });
      setCategories(categories.filter((cat) => cat.id !== id));
      toast.success("分类已删除");
    } catch (error) {
      console.error(error);
      toast.error("删除分类失败");
    }
  };

  const handleAdd = async () => {
    if (!newCategory.name.trim()) {
      toast.error("请输入分类名称");
      return;
    }

    try {
      const created = await fetchClient("/categories", {
        method: "POST",
        body: JSON.stringify({
          name: newCategory.name,
          slug: newCategory.name.toLowerCase().replace(/\s+/g, "-"),
          icon: newCategory.emoji,
        }),
      });

      const newCat: Category = {
        id: created.id,
        name: created.name,
        slug: created.slug || newCategory.name.toLowerCase().replace(/\s+/g, "-"),
        emoji: created.icon || newCategory.emoji,
        color:
          GRADIENT_COLORS[categories.length % GRADIENT_COLORS.length] ||
          "from-gray-500 to-gray-600",
        columnCount: 0,
      };

      setCategories([...categories, newCat]);
      setNewCategory({ name: "", emoji: "🎯" });
      setIsAdding(false);
      toast.success("分类已创建");
    } catch (error) {
      console.error(error);
      toast.error("创建分类失败");
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-24" />
          <div className="h-16 bg-gray-100 rounded" />
          <div className="h-16 bg-gray-100 rounded" />
          <div className="h-16 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">分类管理</h2>
          <Button
            onClick={() => setIsAdding(!isAdding)}
            size="sm"
            variant="outline"
            className="border-cyan-300 text-cyan-700 hover:bg-cyan-50"
          >
            {isAdding ? (
              <>
                <X className="h-4 w-4 mr-2" />
                取消
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                新增分类
              </>
            )}
          </Button>
        </div>

        {/* 新增分类表单 */}
        {isAdding && (
          <div className="mb-4 p-4 bg-gradient-to-br from-cyan-50 to-purple-50 rounded-lg border border-cyan-200">
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  选择图标
                </label>
                <div className="flex flex-wrap gap-2">
                  {EMOJI_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() =>
                        setNewCategory({ ...newCategory, emoji })
                      }
                      className={`text-xl w-10 h-10 rounded-lg border-2 transition-all ${
                        newCategory.emoji === emoji
                          ? "border-cyan-500 bg-white scale-110"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  分类名称
                </label>
                <div className="flex gap-2">
                  <Input
                    value={newCategory.name}
                    onChange={(e) =>
                      setNewCategory({ ...newCategory, name: e.target.value })
                    }
                    placeholder="输入分类名称"
                    className="flex-1"
                  />
                  <Button
                    onClick={handleAdd}
                    className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 text-white"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    保存
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 分类列表 */}
        <div className="space-y-2">
          {categories.map((category) => (
            <div
              key={category.id}
              className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-12 h-12 rounded-lg bg-gradient-to-br ${category.color} flex items-center justify-center text-2xl shadow-lg`}
                >
                  {category.emoji}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {category.name}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {category.columnCount} 个专栏
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleOpenEdit(category)}
                  className="text-cyan-600 hover:bg-cyan-50"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(category.id)}
                  className="text-red-600 hover:bg-red-50"
                  disabled={category.columnCount > 0}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          {categories.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <p>暂无分类</p>
              <p className="text-sm mt-1">点击上方按钮添加第一个分类</p>
            </div>
          )}
        </div>
      </div>

      {/* 编辑分类弹窗 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-white border-gray-200 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold bg-gradient-to-r from-cyan-600 to-purple-600 bg-clip-text text-transparent">
              编辑分类
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* 图标选择 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">
                分类图标
              </Label>
              <div className="flex flex-wrap gap-2">
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() =>
                      setEditForm((prev) => ({ ...prev, emoji }))
                    }
                    className={`text-2xl w-12 h-12 rounded-lg border-2 transition-all ${
                      editForm.emoji === emoji
                        ? "border-cyan-500 bg-cyan-50 scale-110"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* 名称输入 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">
                分类名称
              </Label>
              <Input
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="输入分类名称"
                className="border-gray-300 focus:border-cyan-500 focus-visible:ring-cyan-500/30"
                autoFocus
              />
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
                className="flex-1 border-gray-300 hover:bg-gray-50"
              >
                取消
              </Button>
              <Button
                type="button"
                onClick={handleSaveEdit}
                className="flex-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 hover:from-cyan-600 hover:via-purple-600 hover:to-pink-600 text-white font-semibold shadow-lg shadow-purple-500/30"
              >
                保存修改
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
