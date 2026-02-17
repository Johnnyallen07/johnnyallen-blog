"use client";

import { useState, useEffect, use, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SeriesTree } from "@/components/admin/series/SeriesTree";
import { PropertyPanel } from "@/components/admin/series/PropertyPanel";
import { RichTextEditor } from "@/components/admin/series/RichTextEditor";
import { PostPreview } from "@/components/admin/series/PostPreview";
import { toast } from "sonner";
import { fetchClient } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebounce } from "@/hooks/use-debounce";
import { useSlugCheck } from "@/hooks/useSlugCheck";

interface SeriesEditorPageProps {
  params: Promise<{ id: string }>;
}

interface FileNode {
  id: string;
  name: string;
  type: "folder" | "file";
  children?: FileNode[];
  expanded?: boolean;
  date?: string;
  postId?: string | null;
  published?: boolean;
}

interface SeriesItemDTO {
  id: string;
  title: string | null;
  postId: string | null;
  published: boolean;
  children: SeriesItemDTO[];
  post?: { title: string };
}

interface SeriesInfo {
  title: string;
  slug: string;
  emoji: string;
  categoryId: string;
  tree?: SeriesItemDTO[];
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "");
}

export default function SeriesEditorPage({ params }: SeriesEditorPageProps) {
  const { id: seriesId } = use(params);
  const router = useRouter();
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [treeItems, setTreeItems] = useState<FileNode[]>([]);
  const [seriesInfo, setSeriesInfo] = useState<SeriesInfo | null>(null);
  const [currentPostId, setCurrentPostId] = useState<string | null>(null);

  // ---- Stable refs for frequently-changing state (prevents closure cascade) ----
  const titleRef = useRef(title);
  const slugRef = useRef(slug);
  const contentRef = useRef(content);
  const currentPostIdRef = useRef(currentPostId);

  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { slugRef.current = slug; }, [slug]);
  useEffect(() => { contentRef.current = content; }, [content]);
  useEffect(() => { currentPostIdRef.current = currentPostId; }, [currentPostId]);

  // Version counter for debounced auto-save (avoids copying large HTML)
  const [contentVersion, setContentVersion] = useState(0);
  const debouncedVersion = useDebounce(contentVersion, 2000);

  // Refs for save lifecycle
  const isLoaded = useRef(false);
  const isDirty = useRef(false);
  const isSavingRef = useRef(false);

  // Rename & Delete State
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<{ id: string; name: string } | null>(null);
  const [newName, setNewName] = useState("");

  // ---- New Post Setup Dialog State ----
  const [newPostDialogOpen, setNewPostDialogOpen] = useState(false);
  const [newPostTitle, setNewPostTitle] = useState("");
  const [newPostSlug, setNewPostSlug] = useState("");
  const [newPostParentId, setNewPostParentId] = useState<string | undefined>(undefined);
  const [isCreatingPost, setIsCreatingPost] = useState(false);

  // Slug 查重 — 编辑中的文章
  const { isDuplicate: isSlugDuplicate, isChecking: isCheckingSlug, getUniqueSlug } = useSlugCheck({
    slug,
    excludeId: currentPostId,
    enabled: !!currentPostId && !!slug.trim(),
  });
  const isSlugDuplicateRef = useRef(isSlugDuplicate);
  useEffect(() => { isSlugDuplicateRef.current = isSlugDuplicate; }, [isSlugDuplicate]);

  // Slug 查重 — 新建文章对话框
  const { isDuplicate: isNewSlugDuplicate, isChecking: isCheckingNewSlug } = useSlugCheck({
    slug: newPostSlug,
    enabled: newPostDialogOpen && !!newPostSlug.trim(),
  });

  const fetchSeries = useCallback(async () => {
    try {
      const data = await fetchClient(`/series/${seriesId}`);
      setSeriesInfo(data);

      const mapTree = (nodes: SeriesItemDTO[]): FileNode[] => {
        return nodes.map((node: SeriesItemDTO) => ({
          id: node.id,
          name: node.title || node.post?.title || "Untitled",
          type: node.postId ? "file" : "folder",
          children: node.children ? mapTree(node.children) : undefined,
          expanded: true,
          postId: node.postId,
          published: node.published,
        }));
      };

      if (data.tree) {
        setTreeItems(mapTree(data.tree));
      }
    } catch (error) {
      console.error(error);
      toast.error("加载专栏失败");
    }
  }, [seriesId]);

  useEffect(() => {
    fetchSeries();
  }, [fetchSeries]);

  // ---- Save handler (STABLE — reads from refs, never captures state) ----
  const handleSave = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!currentPostIdRef.current) {
      if (!options.silent) toast.error("请先选择一篇文章");
      return;
    }
    if (!titleRef.current.trim()) {
      if (!options.silent) toast.error("请先填写文章标题");
      return;
    }
    if (isSavingRef.current) return;

    let safeSlug = slugRef.current;
    if (isSlugDuplicateRef.current) {
      safeSlug = getUniqueSlug(safeSlug);
      setSlug(safeSlug);
    }

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      await fetchClient(`/posts/${currentPostIdRef.current}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: titleRef.current,
          slug: safeSlug,
          content: contentRef.current,
        }),
      });
      setLastSaved(new Date());
      if (!options.silent) toast.success("保存成功");
    } catch (error) {
      console.error(error);
      if (!options.silent) toast.error("保存失败");
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [getUniqueSlug]); // Stable — deps almost never change

  // Mark dirty when user actually edits content/title/slug
  useEffect(() => {
    if (isLoaded.current && currentPostId) {
      isDirty.current = true;
      setContentVersion(v => v + 1);
    }
  }, [content, title, slug, currentPostId]);

  // Auto-save effect — fires on debounced version change
  useEffect(() => {
    if (isLoaded.current && currentPostIdRef.current && isDirty.current) {
      isDirty.current = false;
      handleSave({ silent: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedVersion]);

  // ---- Global Ctrl+S / Cmd+S keyboard shortcut (stable) ----
  useEffect(() => {
    if (!currentPostId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [currentPostId, handleSave]);

  const handlePublish = async () => {
    if (!title.trim() || title === "Untitled") {
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

    if (!currentPostId) return;

    try {
      await fetchClient(`/posts/${currentPostId}`, {
        method: "PATCH",
        body: JSON.stringify({ published: true, title, content }),
      });

      toast.success("发布成功！", {
        description: "您的文章已发布，读者现在可以看到了。",
      });
      fetchSeries();
    } catch (error) {
      console.error(error);
      toast.error("发布失败");
    }
  };

  const handlePostSelect = async (itemId: string) => {
    setSelectedPostId(itemId);

    const findNode = (nodes: FileNode[], id: string): FileNode | undefined => {
      for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) {
          const found = findNode(node.children, id);
          if (found) return found;
        }
      }
      return undefined;
    };

    const node = findNode(treeItems, itemId);
    if (!node?.postId) return;

    try {
      isLoaded.current = false;

      setCurrentPostId(node.postId);
      const post = await fetchClient(`/posts/${node.postId}`);
      setTitle(post.title);
      setSlug(post.slug);
      setContent(post.content || "");

      setTimeout(() => {
        isLoaded.current = true;
      }, 500);
    } catch (error) {
      console.error(error);
      toast.error("加载文章失败");
    }
  };

  const handleBack = () => {
    router.push("/admin/series");
  };

  const handleCreateFolder = async (parentId?: string) => {
    const folderTitle = "New Folder";

    try {
      await fetchClient(`/series/${seriesId}/items`, {
        method: "POST",
        body: JSON.stringify({ title: folderTitle, parentId }),
      });
      fetchSeries();
      toast.success("文件夹已创建");
    } catch (error) {
      console.error(error);
      toast.error("创建文件夹失败");
    }
  };

  // ---- Open new post dialog (setup phase) ----
  const handleCreatePost = (parentId?: string) => {
    setNewPostTitle("");
    setNewPostSlug("");
    setNewPostParentId(parentId);
    setNewPostDialogOpen(true);
  };

  const handleNewPostTitleChange = (value: string) => {
    setNewPostTitle(value);
    // Auto-generate slug from title
    if (!newPostSlug || newPostSlug === generateSlug(newPostTitle)) {
      setNewPostSlug(generateSlug(value));
    }
  };

  const canCreatePost = newPostTitle.trim() && newPostSlug.trim() && !isNewSlugDuplicate && !isCheckingNewSlug;

  const confirmCreatePost = async () => {
    if (!newPostTitle.trim()) { toast.error("请输入文章标题"); return; }
    if (!newPostSlug.trim()) { toast.error("请设置 URL 标识"); return; }
    if (isNewSlugDuplicate) { toast.error("Slug 已被占用，请修改"); return; }

    if (!seriesInfo?.categoryId) {
      toast.error("系列信息未加载，无法创建文章");
      return;
    }

    setIsCreatingPost(true);
    try {
      // 1. Create Post with required fields
      const newPost = await fetchClient("/posts", {
        method: "POST",
        body: JSON.stringify({
          title: newPostTitle.trim(),
          slug: newPostSlug.trim(),
          categoryId: seriesInfo.categoryId,
          content: "",
          published: false,
        }),
      });

      // 2. Link to Series
      const newItem = await fetchClient(`/series/${seriesId}/items`, {
        method: "POST",
        body: JSON.stringify({ postId: newPost.id, parentId: newPostParentId }),
      });

      // 3. Refresh and Select
      await fetchSeries();

      if (newItem?.id) {
        handlePostSelect(newItem.id);
      }

      toast.success("文章已创建");
      setNewPostDialogOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("创建文章失败");
    } finally {
      setIsCreatingPost(false);
    }
  };

  const handleRename = (itemId: string, currentName: string) => {
    setItemToEdit({ id: itemId, name: currentName });
    setNewName(currentName);
    setRenameDialogOpen(true);
  };

  const confirmRename = async () => {
    if (!itemToEdit || !newName.trim()) return;

    try {
      await fetchClient(`/series/items/${itemToEdit.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: newName }),
      });
      fetchSeries();
      toast.success("重命名成功");
      setRenameDialogOpen(false);
      setItemToEdit(null);
    } catch (error) {
      console.error(error);
      toast.error("重命名失败");
    }
  };

  const handleDelete = (itemId: string) => {
    setItemToEdit({ id: itemId, name: "" });
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToEdit) return;

    try {
      await fetchClient(`/series/items/${itemToEdit.id}`, {
        method: "DELETE",
      });
      fetchSeries();
      toast.success("删除成功");
      setDeleteDialogOpen(false);
      setItemToEdit(null);
      // If deleted item was selected, deselect
      if (selectedPostId === itemToEdit.id) {
        setSelectedPostId(null);
        setCurrentPostId(null);
        setTitle("");
        setContent("");
      }
    } catch (error) {
      console.error(error);
      toast.error("删除失败");
    }
  };

  // Move item to a different folder (or root)
  const handleMoveItem = async (itemId: string, targetParentId: string | null) => {
    try {
      await fetchClient(`/series/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ parentId: targetParentId }),
      });
      fetchSeries();
      toast.success("移动成功");
    } catch (error) {
      console.error(error);
      toast.error("移动失败");
    }
  };

  // Toggle publish status for a series item
  const handleTogglePublish = async (itemId: string, published: boolean) => {
    try {
      await fetchClient(`/series/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ published }),
      });
      fetchSeries();
      toast.success(published ? "已发布" : "已取消发布");
    } catch (error) {
      console.error(error);
      toast.error("操作失败");
    }
  };

  // Detach: remove post from series (post becomes standalone)
  const handleDetach = async (itemId: string) => {
    if (!confirm("确定要将此文章从专栏分离吗？文章不会被删除，只会变为独立文章。")) {
      return;
    }

    try {
      await fetchClient(`/series/items/${itemId}`, {
        method: "DELETE",
      });
      fetchSeries();
      toast.success("文章已从专栏分离", {
        description: "该文章现在是独立文章，可在文章列表中找到。",
      });

      if (selectedPostId === itemId) {
        setSelectedPostId(null);
        setCurrentPostId(null);
        setTitle("");
        setContent("");
      }
    } catch (error) {
      console.error(error);
      toast.error("分离失败");
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
      {/* 返回按钮 + 保存状态 */}
      <div className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回专栏列表
        </Button>
        <div className="flex items-center gap-2">
          {currentPostId && (
            <>
              <span className="text-sm text-gray-500">正在编辑: {title || "Untitled"}</span>
              {isSaving ? (
                <span className="text-xs text-cyan-600 animate-pulse">正在保存...</span>
              ) : lastSaved ? (
                <span className="text-xs text-gray-400">
                  · 已保存于 {lastSaved.toLocaleTimeString("zh-CN")}
                </span>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* 主体三栏布局 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧栏 - 文件树 */}
        <aside className="w-64 flex-shrink-0">
          <SeriesTree
            seriesName={seriesInfo?.title || "Loading..."}
            seriesSlug={seriesInfo?.slug || seriesId}
            seriesEmoji={seriesInfo?.emoji || "🎮"}
            onPostSelect={handlePostSelect}
            selectedPostId={selectedPostId}
            items={treeItems}
            onAddFolder={handleCreateFolder}
            onAddPost={handleCreatePost}
            onRename={handleRename}
            onDelete={handleDelete}
            onDetach={handleDetach}
            onTogglePublish={handleTogglePublish}
            onMoveItem={handleMoveItem}
          />
        </aside>

        {/* 中间 - 编辑器 */}
        <main className="flex-1 overflow-y-auto bg-white">
          {currentPostId ? (
            <div className="max-w-4xl mx-auto p-6">
              <RichTextEditor
                content={content}
                onChange={setContent}
                onSave={() => handleSave()}
                articleTitle={title}
              />
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-lg font-medium text-gray-500">选择一篇文章开始编辑</p>
              <p className="text-sm mt-2">点击左侧目录或创建新页面</p>
            </div>
          )}
        </main>

        {/* 右侧栏 - 属性面板 */}
        <aside className="w-80 flex-shrink-0 border-l border-gray-200 bg-gray-50">
          {currentPostId ? (
            <PropertyPanel
              title={title}
              onTitleChange={setTitle}
              slug={slug}
              onSlugChange={setSlug}
              tags={tags}
              onTagsChange={setTags}
              onPreview={() => setShowPreview(true)}
              onSave={() => handleSave()}
              onPublish={handlePublish}
              lastSaved={lastSaved}
              isSaving={isSaving}
              isSlugDuplicate={isSlugDuplicate}
              isCheckingSlug={isCheckingSlug}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400 text-sm">
              属性面板
            </div>
          )}
        </aside>
      </div>

      {/* 预览模态框 */}
      {showPreview && (
        <PostPreview
          title={title}
          content={content}
          tags={tags}
          category={seriesInfo?.title || ""}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* New Post Setup Dialog */}
      <Dialog open={newPostDialogOpen} onOpenChange={setNewPostDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>创建新文章</DialogTitle>
            <DialogDescription>
              请填写必要信息，创建后将自动保存。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-post-title">
                文章标题 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="new-post-title"
                value={newPostTitle}
                onChange={(e) => handleNewPostTitleChange(e.target.value)}
                placeholder="输入文章标题..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canCreatePost) confirmCreatePost();
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-post-slug">
                URL 标识 (Slug) <span className="text-red-500">*</span>
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400 whitespace-nowrap">/article/</span>
                <Input
                  id="new-post-slug"
                  value={newPostSlug}
                  onChange={(e) => setNewPostSlug(e.target.value)}
                  placeholder="article-slug"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canCreatePost) confirmCreatePost();
                  }}
                />
              </div>
              {isNewSlugDuplicate && (
                <p className="text-xs text-red-500">该 Slug 已被其他文章占用，请修改</p>
              )}
              {isCheckingNewSlug && (
                <p className="text-xs text-gray-400">检查中...</p>
              )}
              {!isNewSlugDuplicate && !isCheckingNewSlug && newPostSlug.trim() && (
                <p className="text-xs text-gray-400">自动根据标题生成，也可手动修改</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewPostDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={confirmCreatePost}
              disabled={!canCreatePost || isCreatingPost}
              className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 text-white"
            >
              {isCreatingPost ? (
                "创建中..."
              ) : (
                <>
                  开始写作
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名</DialogTitle>
            <DialogDescription>
              请输入新的名称。
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="rename-input" className="mb-2 block">名称</Label>
            <Input
              id="rename-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter new name"
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmRename();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>取消</Button>
            <Button onClick={confirmRename}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              您确定要删除此项吗？此操作无法撤销。如果是文件夹，其中的内容也会被删除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={confirmDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
