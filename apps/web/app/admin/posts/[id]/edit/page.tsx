"use client";

import { useState, useEffect, useCallback, use, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Eye, Sparkles, Calendar, BookOpen, X } from "lucide-react";
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
import { useDebounce } from "@/hooks/use-debounce";
import { useSlugCheck } from "@/hooks/useSlugCheck";

interface CategoryOption {
  id: string;
  name: string;
  icon?: string;
}

interface SeriesOption {
  id: string;
  title: string;
  emoji?: string;
  slug: string;
}

interface SeriesItemInfo {
  series: {
    id: string;
    title: string;
    slug: string;
    emoji?: string;
  };
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

  // ---- Stable refs for all frequently-changing state ----
  // This prevents closure cascade: handleSave reads from refs, not deps.
  const titleRef = useRef(title);
  const slugRef = useRef(slug);
  const contentRef = useRef(content);
  const categoryIdRef = useRef(categoryId);
  const tagsRef = useRef(tags);
  const publishedRef = useRef(published);

  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { slugRef.current = slug; }, [slug]);
  useEffect(() => { contentRef.current = content; }, [content]);
  useEffect(() => { categoryIdRef.current = categoryId; }, [categoryId]);
  useEffect(() => { tagsRef.current = tags; }, [tags]);
  useEffect(() => { publishedRef.current = published; }, [published]);

  // Version counter for debounced auto-save trigger (avoids copying large HTML)
  const [contentVersion, setContentVersion] = useState(0);
  const debouncedVersion = useDebounce(contentVersion, 2000);

  // Refs for save lifecycle
  const isLoaded = useRef(false);
  const isDirty = useRef(false);
  const isSavingRef = useRef(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Series binding
  const [seriesId, setSeriesId] = useState<string | null>(null);
  const seriesIdRef = useRef(seriesId);
  useEffect(() => { seriesIdRef.current = seriesId; }, [seriesId]);
  const [seriesList, setSeriesList] = useState<SeriesOption[]>([]);
  const [seriesSearch, setSeriesSearch] = useState("");

  // Slug 查重
  const { isChecking: isCheckingSlug, isDuplicate: isSlugDuplicate, getUniqueSlug } = useSlugCheck({
    slug,
    excludeId: postId,
    enabled: !isLoading && !!slug.trim(),
  });
  const isSlugDuplicateRef = useRef(isSlugDuplicate);
  useEffect(() => { isSlugDuplicateRef.current = isSlugDuplicate; }, [isSlugDuplicate]);

  const fetchPost = useCallback(async () => {
    try {
      const [postData, categoriesData, seriesData] = await Promise.all([
        fetchClient(`/posts/${postId}`),
        fetchClient("/categories").catch(() => []),
        fetchClient("/series").catch(() => []),
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

      if (Array.isArray(seriesData)) {
        setSeriesList(
          seriesData.map((s: SeriesOption) => ({
            id: s.id,
            title: s.title,
            emoji: s.emoji || "📝",
            slug: s.slug,
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

      // Extract current series binding
      const currentSeriesItem = postData.seriesItems?.[0] as SeriesItemInfo | undefined;
      setSeriesId(currentSeriesItem?.series?.id || null);
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

  // ---- Save handler (STABLE — reads from refs, never captures state) ----
  const handleSave = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!titleRef.current.trim()) {
      if (!options.silent) toast.error("请先填写文章标题");
      return;
    }
    if (isSavingRef.current) return;

    // 自动保存时如果 slug 重复，使用随机后缀
    let safeSlug = slugRef.current;
    if (isSlugDuplicateRef.current) {
      safeSlug = getUniqueSlug(safeSlug);
      setSlug(safeSlug);
    }

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      await fetchClient(`/posts/${postId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: titleRef.current || "Untitled",
          slug: safeSlug,
          content: contentRef.current,
          categoryId: categoryIdRef.current,
          tags: tagsRef.current,
          published: publishedRef.current,
          seriesId: seriesIdRef.current,
        }),
      });
      setLastSaved(new Date());
      isDirty.current = false;
      if (!options.silent) toast.success("保存成功");
    } catch (error) {
      console.error("Save failed", error);
      if (!options.silent) toast.error("保存失败");
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [postId, getUniqueSlug]); // Stable — postId rarely changes

  // Mark loaded after initial fetch
  useEffect(() => {
    if (!isLoading) {
      setTimeout(() => { isLoaded.current = true; }, 500);
    }
  }, [isLoading]);

  // Bump version counter on content/title/slug changes (lightweight, no copying)
  useEffect(() => {
    if (isLoaded.current) {
      isDirty.current = true;
      setContentVersion(v => v + 1);
    }
  }, [content, title, slug, tags, categoryId, seriesId]);

  // Auto-save effect — fires on debounced version change
  useEffect(() => {
    if (isLoaded.current && isDirty.current) {
      handleSave({ silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedVersion]);

  // Global Ctrl+S / Cmd+S keyboard shortcut (stable — handleSave is stable)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);



  // 页面离开 / 关闭时使用 keepalive fetch 保存 (STABLE — reads refs, registers once)
  useEffect(() => {
    const saveOnExit = () => {
      if (!titleRef.current || !categoryIdRef.current) return;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      try {
        fetch(`${apiUrl}/posts/${postId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: titleRef.current || "Untitled",
            slug: slugRef.current,
            content: contentRef.current,
            categoryId: categoryIdRef.current,
            tags: tagsRef.current,
            published: publishedRef.current,
            seriesId: seriesIdRef.current,
          }),
          keepalive: true,
        });
      } catch {
        // 静默失败 — 页面已在卸载
      }
    };

    window.addEventListener("beforeunload", saveOnExit);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        saveOnExit();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", saveOnExit);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [postId]); // Only re-registers when postId changes (practically never)


  const handlePublish = async () => {
    if (!title.trim()) {
      toast.error("发布前请设置文章标题");
      return;
    }
    if (!content.trim()) {
      toast.error("请添加文章内容");
      return;
    }
    if (isSlugDuplicate) {
      toast.error("Slug 已被占用，请先修改");
      return;
    }

    try {
      await fetchClient(`/posts/${postId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          slug,
          content,
          published: true,
          seriesId,
        }),
      });

      setPublished(true);
      toast.success("发布成功！", {
        description: "您的文章已发布，读者现在可以看到了。",
      });

    } catch (error) {
      console.error(error);
      toast.error("发布失败");
    }
  };

  // Handle series change
  const handleSeriesChange = (value: string) => {
    if (value === "__standalone__") {
      setSeriesId(null);
    } else {
      setSeriesId(value);
    }
  };

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const selectedSeries = seriesList.find((s) => s.id === seriesId);

  // Filtered series list for search
  const filteredSeries = seriesSearch
    ? seriesList.filter(
      (s) =>
        s.title.toLowerCase().includes(seriesSearch.toLowerCase()) ||
        s.slug.toLowerCase().includes(seriesSearch.toLowerCase())
    )
    : seriesList;

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
          onClick={async () => {
            if (isDirty.current) {
              await handleSave({ silent: true });
            }
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
          {selectedSeries && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
              {selectedSeries.emoji} {selectedSeries.title}
            </span>
          )}
          <span className="text-sm text-gray-500">编辑文章</span>
          {isSaving ? (
            <span className="text-xs text-cyan-600 animate-pulse">正在保存...</span>
          ) : lastSaved ? (
            <span className="text-xs text-gray-400">
              · 已保存于 {lastSaved.toLocaleTimeString("zh-CN")}
            </span>
          ) : (
            isDirty.current && <span className="text-xs text-amber-500">未保存更改</span>
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

            <RichTextEditor content={content} onChange={setContent} onSave={() => handleSave()} articleTitle={title} />
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

              {/* 所属专栏 */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">
                  <BookOpen className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />
                  所属专栏
                  <span className="text-xs text-gray-400 font-normal ml-1">（可选）</span>
                </Label>
                {selectedSeries ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-md">
                    <span className="text-base">{selectedSeries.emoji}</span>
                    <span className="text-sm font-medium text-purple-800 flex-1 truncate">
                      {selectedSeries.title}
                    </span>
                    <button
                      onClick={() => setSeriesId(null)}
                      className="text-purple-400 hover:text-purple-600 transition-colors"
                      title="从专栏中分离"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <Select
                    value={seriesId || "__standalone__"}
                    onValueChange={handleSeriesChange}
                  >
                    <SelectTrigger className="border-gray-300 focus:border-purple-500 focus:ring-purple-500/30">
                      <SelectValue placeholder="选择专栏..." />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-gray-200">
                      {/* Search input */}
                      <div className="px-2 pb-2">
                        <Input
                          value={seriesSearch}
                          onChange={(e) => setSeriesSearch(e.target.value)}
                          placeholder="搜索专栏..."
                          className="h-8 text-sm border-gray-200"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                      </div>
                      <SelectItem value="__standalone__">
                        <span className="text-gray-500">无（独立文章）</span>
                      </SelectItem>
                      {filteredSeries.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          <span className="flex items-center gap-1.5">
                            <span>{s.emoji}</span>
                            <span>{s.title}</span>
                          </span>
                        </SelectItem>
                      ))}
                      {filteredSeries.length === 0 && seriesSearch && (
                        <div className="px-3 py-2 text-sm text-gray-400">
                          未找到匹配的专栏
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-gray-400">
                  {seriesId
                    ? "此文章属于专栏，文章列表中将不显示"
                    : "绑定专栏后文章将归属于该专栏"}
                </p>
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
                    className={`border-gray-300 focus:border-cyan-500 focus-visible:ring-cyan-500/30 ${isSlugDuplicate ? "border-red-400 focus:border-red-500" : ""
                      }`}
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
                  onClick={() => handleSave()}
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
