"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Eye, Sparkles, Calendar, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor } from "@/components/admin/series/RichTextEditor";
import { TagInput } from "@/components/admin/series/TagInput";
import { PostPreview } from "@/components/admin/series/PostPreview";
import { toast } from "sonner";
import { fetchClient } from "@/lib/api";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useSlugCheck } from "@/hooks/useSlugCheck";

interface CategoryOption {
  id: string;
  name: string;
  icon?: string;
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "");
}

const LOCAL_STORAGE_KEY = "draft-new-post";

export default function NewPostPage() {
  const router = useRouter();

  // ---- Setup phase state ----
  const [setupComplete, setSetupComplete] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  // ---- Editor phase state ----
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [postId, setPostId] = useState<string | null>(null);

  // Load categories
  useEffect(() => {
    async function loadCategories() {
      try {
        const data = await fetchClient("/categories");
        interface CategoryDTO {
          id: string;
          name: string;
          icon?: string;
        }
        if (Array.isArray(data)) {
          setCategories(
            (data as CategoryDTO[]).map((cat) => ({
              id: cat.id,
              name: cat.name,
              icon: cat.icon || "📂",
            }))
          );
        }
      } catch (error) {
        console.error(error);
        toast.error("加载分类失败");
      }
    }
    loadCategories();
  }, []);

  // Clear stale localStorage drafts on mount (auto-save handles persistence)
  useEffect(() => {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (e) {
      console.error("Failed to clear draft", e);
    }
  }, []);

  // Slug 查重
  const { isChecking: isCheckingSlug, isDuplicate: isSlugDuplicate, getUniqueSlug } = useSlugCheck({
    slug,
    excludeId: postId,
    enabled: !!slug.trim(),
  });

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    if (!slug) {
      setSlug(generateSlug(newTitle));
    }
  };

  const canProceed = title.trim() && slug.trim() && categoryId && !isSlugDuplicate && !isCheckingSlug;

  const handleSetupComplete = () => {
    if (!title.trim()) { toast.error("请输入文章标题"); return; }
    if (!slug.trim()) { toast.error("请设置 URL 标识"); return; }
    if (!categoryId) { toast.error("请选择分类"); return; }
    if (isSlugDuplicate) { toast.error("Slug 已被占用，请修改"); return; }
    setSetupComplete(true);
  };

  // --- Auto-Save Logic ---
  const saveToBackend = useCallback(async () => {
    if (!title || !categoryId) return;

    // 自动保存时如果 slug 重复，使用随机 slug
    let safeSlug = slug;
    if (isSlugDuplicate) {
      safeSlug = getUniqueSlug(slug);
      setSlug(safeSlug);
    }

    try {
      if (postId) {
        await fetchClient(`/posts/${postId}`, {
          method: "PATCH",
          body: JSON.stringify({
            title,
            slug: safeSlug,
            content,
            published: false,
            categoryId,
          }),
        });
      } else {
        const newPost = await fetchClient("/posts", {
          method: "POST",
          body: JSON.stringify({
            title,
            slug: safeSlug || `post-${Date.now()}`,
            categoryId,
            content,
            published: false,
          }),
        });
        setPostId(newPost.id);
        router.replace(`/admin/posts/${newPost.id}/edit`);
        toast.success("草稿已创建", {
          description: "已跳转至编辑页面继续写作",
        });
      }
    } catch (error) {
      console.error("Auto-save failed:", error);
      throw error;
    }
  }, [postId, title, slug, content, categoryId, router, isSlugDuplicate, getUniqueSlug]);

  const { lastSaved, isSaving, hasUnsavedChanges, manualSave } = useAutoSave({
    data: { title, slug, content, tags, categoryId },
    onSave: async () => {
      await saveToBackend();
    },
    localStorageKey: LOCAL_STORAGE_KEY,
    // 只有完成 setup 且有内容时才自动保存到服务器
    enabled: setupComplete && !!categoryId && !!title,
  });

  // Manual save handler (for save button and Ctrl+S)
  const handleSave = useCallback(async () => {
    if (!categoryId || !title) {
      toast.error("请先填写标题和分类");
      return;
    }
    try {
      await manualSave();
      toast.success("保存成功");
    } catch (error) {
      console.error(error);
      toast.error("保存失败");
    }
  }, [manualSave, categoryId, title]);

  // Global Ctrl+S / Cmd+S keyboard shortcut
  useEffect(() => {
    if (!setupComplete) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setupComplete, handleSave]);

  const handlePublish = async () => {
    if (!title.trim()) {
      toast.error("发布前请设置文章标题");
      return;
    }
    if (!content.trim()) {
      toast.error("请添加文章内容");
      return;
    }
    if (!categoryId) {
      toast.error("请选择一个分类");
      return;
    }

    setIsLoading(true);
    try {
      if (postId) {
        await fetchClient(`/posts/${postId}`, {
          method: "PATCH",
          body: JSON.stringify({
            title,
            slug,
            content,
            published: true,
            categoryId,
          }),
        });
      } else {
        const newPost = await fetchClient("/posts", {
          method: "POST",
          body: JSON.stringify({
            title,
            slug: slug || `post-${Date.now()}`,
            categoryId,
            content,
            published: true,
          }),
        });
        setPostId(newPost.id);
      }

      toast.success("发布成功！");
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      router.push("/admin");
    } catch (error) {
      console.error(error);
      toast.error("发布失败");
    } finally {
      setIsLoading(false);
    }
  };

  const selectedCategory = categories.find((c) => c.id === categoryId);

  // ============================================================
  // STEP 1: Setup 页面 — 先填写标题、分类、Slug
  // ============================================================
  if (!setupComplete) {
    return (
      <div className="h-screen flex flex-col bg-gray-50">
        <div className="h-12 bg-white border-b border-gray-200 flex items-center px-4 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/admin")}
            className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回仪表板
          </Button>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md space-y-8">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900">创建新文章</h1>
              <p className="mt-2 text-sm text-gray-500">
                请先填写基本信息，填写后将自动保存草稿
              </p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
              {/* 分类 */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">
                  所属分类 <span className="text-red-500">*</span>
                </Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="border-gray-300 focus:border-cyan-500 focus:ring-cyan-500/30">
                    <SelectValue placeholder="选择分类" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 标题 */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">
                  文章标题 <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="输入文章标题..."
                  className="border-gray-300 focus:border-cyan-500 focus-visible:ring-cyan-500/30"
                  autoFocus
                />
              </div>

              {/* Slug */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">
                  URL 标识 (Slug) <span className="text-red-500">*</span>
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400 whitespace-nowrap">/article/</span>
                  <Input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="article-slug"
                    className="border-gray-300 focus:border-cyan-500 focus-visible:ring-cyan-500/30"
                  />
                </div>
                {isSlugDuplicate && (
                  <p className="text-xs text-red-500">
                    该 Slug 已被其他文章占用，请修改
                  </p>
                )}
                {isCheckingSlug && (
                  <p className="text-xs text-gray-400">检查中...</p>
                )}
                {!isSlugDuplicate && !isCheckingSlug && slug.trim() && (
                  <p className="text-xs text-gray-400">
                    自动根据标题生成，也可手动修改
                  </p>
                )}
              </div>

              <Button
                onClick={handleSetupComplete}
                disabled={!canProceed}
                className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 text-white font-medium"
              >
                开始写作
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // STEP 2: 编辑器页面
  // ============================================================
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (hasUnsavedChanges && !confirm("您有未保存的更改，确定要离开吗？"))
              return;
            router.push("/admin");
          }}
          className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回仪表板
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            {postId ? "编辑文章" : "创建新文章"}
          </span>
          {isSaving ? (
            <span className="text-xs text-cyan-600 animate-pulse">
              正在保存...
            </span>
          ) : lastSaved ? (
            <span className="text-xs text-gray-400">
              · 已保存于 {lastSaved.toLocaleTimeString("zh-CN")}
            </span>
          ) : (
            hasUnsavedChanges && (
              <span className="text-xs text-amber-500">未保存更改</span>
            )
          )}
        </div>
      </div>

      {/* 主体两栏布局 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧 - 编辑器 */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6">
            <div className="mb-4">
              <h2 className="text-sm font-medium text-gray-500">
                正在编辑: {title || "Untitled"}
              </h2>
            </div>
            <RichTextEditor content={content} onChange={setContent} onSave={handleSave} />
          </div>
        </main>

        {/* 右侧栏 - 属性面板 */}
        <aside className="w-80 flex-shrink-0">
          <div className="h-full flex flex-col bg-white border-l border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">文章属性</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* 分类 */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">
                  所属分类 <span className="text-red-500">*</span>
                </Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="border-gray-300 focus:border-cyan-500 focus:ring-cyan-500/30">
                    <SelectValue placeholder="选择分类" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 标题 */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">标题</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="输入文章标题..."
                  className="border-gray-300 focus:border-cyan-500 focus-visible:ring-cyan-500/30"
                />
              </div>

              {/* Slug */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">
                  URL标识 (Slug)
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">/article/</span>
                  <Input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="article-slug"
                    className="border-gray-300 focus:border-cyan-500 focus-visible:ring-cyan-500/30"
                  />
                </div>
              </div>

              {/* 标签 */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">标签</Label>
                <TagInput tags={tags} onTagsChange={setTags} />
              </div>

              {/* 元信息 */}
              <div className="space-y-3 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="h-4 w-4" />
                  <span>创建：{new Date().toLocaleDateString("zh-CN")}</span>
                </div>
                {selectedCategory && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span>{selectedCategory.icon}</span>
                    <span>分类：{selectedCategory.name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 底部操作按钮 */}
            <div className="p-4 border-t border-gray-200 space-y-2">
              <div className="flex gap-2">
                <Button
                  onClick={handleSave}
                  variant="outline"
                  className="flex-1 border-gray-300 hover:bg-gray-50"
                  disabled={isSaving || !categoryId}
                >
                  <Save className="h-4 w-4 mr-2" />
                  保存
                </Button>
                <Button
                  onClick={() => setShowPreview(true)}
                  variant="outline"
                  className="flex-1 border-gray-300 hover:bg-gray-50"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  预览
                </Button>
              </div>
              <Button
                onClick={handlePublish}
                disabled={isLoading || isSaving}
                className="w-full relative overflow-hidden bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 hover:from-cyan-600 hover:via-purple-600 hover:to-pink-600 text-white font-semibold shadow-lg shadow-purple-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/40 hover:scale-[1.02]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12 -translate-x-full animate-[shimmer_2s_infinite]" />
                <Sparkles className="h-4 w-4 mr-2" />
                <span>发布文章</span>
              </Button>
            </div>
          </div>
        </aside>
      </div>

      {/* 预览模态框 */}
      {showPreview && (
        <PostPreview
          title={title}
          content={content}
          tags={tags}
          category={selectedCategory?.name || ""}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}
