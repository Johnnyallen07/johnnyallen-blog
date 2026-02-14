"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Eye, Sparkles, Calendar } from "lucide-react";
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

export default function NewPostPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
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

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    if (!postId && !slug) {
      setSlug(generateSlug(newTitle));
    }
  };

  // --- Auto-Save Logic ---
  const saveToBackend = useCallback(async () => {
    if (!title && !content) return; // Don't save empty posts automatically

    try {
      // If we already have an ID, update it
      if (postId) {
        await fetchClient(`/posts/${postId}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: title || "Untitled",
            slug,
            content,
            published: false,
            categoryId,
          }),
        });
      } else {
        // Create new post
        // Only if we have minimal required fields for creation (e.g. category)
        // Or we might need to relax backend requirements for drafts
        if (!categoryId) return;

        const newPost = await fetchClient("/posts", {
          method: "POST",
          body: JSON.stringify({
            title: title || "Untitled",
            slug: slug || `post-${Date.now()}`,
            categoryId,
            authorId: "123e4567-e89b-12d3-a456-426614174000", // TODO: Get from auth context
            content,
            published: false,
          }),
        });

        setPostId(newPost.id);

        // Critical: Redirect to edit page to continue editing the same post
        router.replace(`/admin/posts/${newPost.id}/edit`);
        toast.success("草稿已创建", {
          description: "已跳转至编辑页面继续写作",
        });
      }
    } catch (error) {
      console.error("Auto-save failed:", error);
      throw error;
    }
  }, [postId, title, slug, content, categoryId, router]);

  // Hook usage
  // We use a local storage key for crash recovery on new posts
  const LOCAL_STORAGE_KEY = "draft-new-post";

  const {
    lastSaved,
    isSaving,
    hasUnsavedChanges
  } = useAutoSave({
    data: { title, slug, content, tags, categoryId },
    onSave: async () => {
      await saveToBackend();
    },
    localStorageKey: LOCAL_STORAGE_KEY,
    // Auto-save disabled if no category selected yet (database constraint usually) 
    // or if title/content empty
    enabled: !!categoryId && (!!title || !!content),
  });


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
            categoryId
          }),
        });
      } else {
        const newPost = await fetchClient("/posts", {
          method: "POST",
          body: JSON.stringify({
            title,
            slug: slug || `post-${Date.now()}`,
            categoryId,
            authorId: "123e4567-e89b-12d3-a456-426614174000",
            content,
            published: true,
          }),
        });
        setPostId(newPost.id);
      }

      toast.success("发布成功！");
      router.push("/admin");

      // Clear local storage draft
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (error) {
      console.error(error);
      toast.error("发布失败");
    } finally {
      setIsLoading(false);
    }
  };

  const selectedCategory = categories.find((c) => c.id === categoryId);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            // Optional: warn if unsaved changes
            if (hasUnsavedChanges && !confirm("您有未保存的更改，确定要离开吗？")) return;
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
            <span className="text-xs text-cyan-600 animate-pulse">正在保存...</span>
          ) : lastSaved ? (
            <span className="text-xs text-gray-400">
              · 已保存于 {lastSaved.toLocaleTimeString("zh-CN")}
            </span>
          ) : (
            hasUnsavedChanges && <span className="text-xs text-amber-500">未保存更改</span>
          )}
        </div>
      </div>

      {/* 主体两栏布局 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧 - 编辑器 */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-medium text-gray-500">
                  正在编辑: {title || "Untitled"}
                </h2>
              </div>
            </div>

            <RichTextEditor content={content} onChange={setContent} />
          </div>
        </main>

        {/* 右侧栏 - 属性面板 */}
        <aside className="w-80 flex-shrink-0">
          <div className="h-full flex flex-col bg-white border-l border-gray-200">
            {/* 头部 */}
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">文章属性</h2>
            </div>

            {/* 属性表单 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* 分类选择 */}
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
                <p className="text-xs text-gray-500">
                  文章将直接归入此分类
                </p>
              </div>

              {/* 文章标题 */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">
                  标题
                </Label>
                <Input
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="输入文章标题..."
                  className="border-gray-300 focus:border-cyan-500 focus-visible:ring-cyan-500/30"
                />
              </div>

              {/* URL/Slug */}
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
                <Label className="text-sm font-medium text-gray-700">
                  标签
                </Label>
                <TagInput tags={tags} onTagsChange={setTags} />
              </div>

              {/* 元信息 */}
              <div className="space-y-3 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="h-4 w-4" />
                  <span>
                    创建：{new Date().toLocaleDateString("zh-CN")}
                  </span>
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
                  onClick={() => saveToBackend()}
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
