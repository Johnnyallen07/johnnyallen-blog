"use client";

import { useState, useEffect, useCallback, use } from "react";
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

interface EditPostPageProps {
  params: Promise<{ id: string }>;
}

export default function EditPostPage({ params }: EditPostPageProps) {
  const { id: postId } = use(params);
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [published, setPublished] = useState(false);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [createdAt, setCreatedAt] = useState("");

  const fetchPost = useCallback(async () => {
    try {
      const [postData, categoriesData] = await Promise.all([
        fetchClient(`/posts/${postId}`),
        fetchClient("/categories").catch(() => []),
      ]);

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

      setTitle(postData.title || "");
      setSlug(postData.slug || "");
      setContent(postData.content || "");
      setCategoryId(postData.categoryId || postData.category?.id || "");
      setPublished(postData.published || false);
      setCreatedAt(postData.createdAt || "");
      setTags(postData.tags || []);
    } catch (error) {
      console.error(error);
      toast.error("加载文章失败");
      router.push("/admin/posts");
    } finally {
      setIsLoading(false);
    }
  }, [postId, router]);

  useEffect(() => {
    fetchPost();
  }, [fetchPost]);

  // --- Auto-Save Logic ---
  const saveToBackend = useCallback(async () => {
    try {
      await fetchClient(`/posts/${postId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title || "Untitled",
          slug,
          content,
          published,
        }),
      });
    } catch (error) {
      console.error("Auto-save failed", error);
      throw error;
    }
  }, [postId, title, slug, content, published]);

  // Use a unique local storage key for each post so drafts don't collide
  const LOCAL_STORAGE_KEY = `draft-post-${postId}`;

  const {
    lastSaved,
    isSaving,
    hasUnsavedChanges,
    loadFromLocalStorage
  } = useAutoSave({
    data: { title, slug, content, tags, categoryId, published },
    onSave: async () => {
      await saveToBackend();
    },
    localStorageKey: LOCAL_STORAGE_KEY,
    enabled: !isLoading, // Don't auto-save while loading initial data
  });

  // Check for newer local draft on mount
  useEffect(() => {
    if (isLoading) return;

    const localDraft = loadFromLocalStorage();
    if (localDraft && localDraft.timestamp > new Date(createdAt)) {
      // Logic to prompt user could go here. 
      // For now, we'll just log it or maybe automatically restore if it's very recent?
      // Let's notify the user widely
      toast.info("发现未保存的本地草稿", {
        description: `时间: ${localDraft.timestamp.toLocaleString()}`,
        action: {
          label: "恢复",
          onClick: () => {
            const d = localDraft.data as {
              title: string;
              content: string;
              slug: string;
              [key: string]: unknown;
            };
            setTitle(d.title);
            setContent(d.content);
            setSlug(d.slug);
            // ... restore other fields
            toast.success("已恢复本地草稿");
          }
        }
      });
    }
  }, [isLoading, loadFromLocalStorage, createdAt]);


  const handlePublish = async () => {
    if (!title.trim()) {
      toast.error("发布前请设置文章标题");
      return;
    }
    if (!content.trim()) {
      toast.error("请添加文章内容");
      return;
    }

    try {
      // Manually set saving state for UI feedback if reused
      // But separate isLoading is better for full blocking

      await fetchClient(`/posts/${postId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          slug,
          content,
          published: true,
        }),
      });

      setPublished(true);
      toast.success("发布成功！", {
        description: "您的文章已发布，读者现在可以看到了。",
      });

      // Clear local draft
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (error) {
      console.error(error);
      toast.error("发布失败");
    }
  };

  const selectedCategory = categories.find((c) => c.id === categoryId);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-8 w-8 bg-cyan-500 rounded-full mb-4" />
          <div className="text-gray-400 text-sm">加载文章中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (hasUnsavedChanges && !confirm("您有未保存的更改，确定要离开吗？")) return;
            router.push("/admin/posts");
          }}
          className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回文章列表
        </Button>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${published
              ? "bg-green-100 text-green-700"
              : "bg-yellow-100 text-yellow-700"
              }`}
          >
            {published ? "已发布" : "草稿"}
          </span>
          <span className="text-sm text-gray-500">编辑文章</span>
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
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">文章属性</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* 分类（只读显示） */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">
                  所属分类
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

              {/* 文章标题 */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">
                  标题
                </Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
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
                    创建：
                    {createdAt
                      ? new Date(createdAt).toLocaleDateString("zh-CN")
                      : "未知"}
                  </span>
                </div>
                {selectedCategory && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span>{selectedCategory.icon}</span>
                    <span>分类：{selectedCategory.name}</span>
                  </div>
                )}
                {lastSaved && (
                  <div className="text-xs text-gray-500">
                    最后保存：{lastSaved.toLocaleTimeString("zh-CN")}
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
                  disabled={isSaving}
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
              {!published && (
                <Button
                  onClick={handlePublish}
                  disabled={isSaving}
                  className="w-full relative overflow-hidden bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 hover:from-cyan-600 hover:via-purple-600 hover:to-pink-600 text-white font-semibold shadow-lg shadow-purple-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/40 hover:scale-[1.02]"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12 -translate-x-full animate-[shimmer_2s_infinite]" />
                  <Sparkles className="h-4 w-4 mr-2" />
                  <span>发布文章</span>
                </Button>
              )}
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
