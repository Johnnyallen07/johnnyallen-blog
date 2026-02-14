"use client";

import { useState, useEffect, use, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
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
}

interface SeriesItemDTO {
  id: string;
  title: string | null;
  postId: string | null;
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
  const [treeItems, setTreeItems] = useState<FileNode[]>([]);
  const [seriesInfo, setSeriesInfo] = useState<SeriesInfo | null>(null);
  const [currentPostId, setCurrentPostId] = useState<string | null>(null);

  // Debounced values for auto-save
  const debouncedContent = useDebounce(content, 2000);
  const debouncedTitle = useDebounce(title, 2000);
  const debouncedSlug = useDebounce(slug, 2000);

  // Ref to track if initial load has happened effectively to prevent auto-save on load
  const isLoaded = useRef(false);

  // Rename & Delete State
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<{ id: string; name: string } | null>(null);
  const [newName, setNewName] = useState("");

  const fetchSeries = useCallback(async () => {
    // ... existing fetchSeries ...
    try {
      const data = await fetchClient(`/series/${seriesId}`);
      setSeriesInfo(data);

      const mapTree = (nodes: SeriesItemDTO[]): FileNode[] => {
        return nodes.map((node: SeriesItemDTO) => ({
          id: node.id, // SeriesItem ID, not Post ID
          name: node.title || node.post?.title || "Untitled",
          type: node.postId ? "file" : "folder",
          children: node.children ? mapTree(node.children) : undefined,
          expanded: true, // Default expanded
          postId: node.postId
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

  const handleSave = useCallback(async (options: { silent?: boolean } = {}) => {
    // Save draft even without title
    if (!currentPostId) {
      // Don't error on empty state, just return
      return;
    }

    try {
      const payload = {
        title, // Can be empty or "Untitled"
        slug,
        content,
        // published: false, // REMOVED: Auto-save should not unpublish
      };

      await fetchClient(`/posts/${currentPostId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });

      setLastSaved(new Date());

      if (!options.silent) {
        toast.success("保存成功！", {
          description: "您的更改已保存为草稿。",
        });
      }

      // Refresh tree to update titles ONLY if title changed? 
      // Doing full fetch might be heavy, but safe.
      // fetchSeries(); 

    } catch (error) {
      console.error(error);
      if (!options.silent) {
        toast.error("保存失败");
      }
    }
  }, [currentPostId, title, slug, content]);

  // Auto-save effect
  useEffect(() => {
    if (isLoaded.current && currentPostId) {
      handleSave({ silent: true });
    }
  }, [debouncedContent, debouncedTitle, debouncedSlug, handleSave, currentPostId]);

  const handlePublish = async () => {
    if (!title.trim() || title === "Untitled") {
      toast.error("发布前请设置文章标题");
      return;
    }
    if (!content.trim()) {
      toast.error("请添加文章内容");
      return;
    }

    if (!currentPostId) return;

    try {
      await fetchClient(`/posts/${currentPostId}`, {
        method: "PATCH",
        body: JSON.stringify({ published: true, title, content })
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
      // pause auto-save detection during load
      isLoaded.current = false;

      setCurrentPostId(node.postId);
      const post = await fetchClient(`/posts/${node.postId}`);
      setTitle(post.title);
      setSlug(post.slug);
      setContent(post.content || "");

      // re-enable auto-save detection
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
    const title = "New Folder";

    try {
      await fetchClient(`/series/${seriesId}/items`, {
        method: "POST",
        body: JSON.stringify({ title, parentId }),
      });
      fetchSeries();
      toast.success("文件夹已创建");
    } catch (error) {
      console.error(error);
      toast.error("创建文件夹失败");
    }
  };

  const handleCreatePost = async (parentId?: string) => {
    try {
      if (!seriesInfo?.categoryId) {
        toast.error("系列信息未加载，无法创建文章");
        return;
      }

      const defaultTitle = "Untitled";
      const slug = `post-${Date.now()}`;

      // 1. Create Post
      const newPost = await fetchClient("/posts", {
        method: "POST",
        body: JSON.stringify({
          title: defaultTitle,
          slug,
          categoryId: seriesInfo.categoryId,
          authorId: "123e4567-e89b-12d3-a456-426614174000", // TODO: Auth context
          content: "",
          published: false,
        }),
      });

      // 2. Link to Series
      const newItem = await fetchClient(`/series/${seriesId}/items`, {
        method: "POST",
        body: JSON.stringify({ postId: newPost.id, parentId }),
      });

      // 3. Refresh and Select
      await fetchSeries(); // Await to ensure tree is updated

      // Select the new item
      if (newItem && newItem.id) {
        // We need to find the node ID in the tree, which is newItem.id (SeriesItem ID)
        handlePostSelect(newItem.id);
      }

      toast.success("文章已创建");
    } catch (error) {
      console.error(error);
      toast.error("创建文章失败");
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
    setItemToEdit({ id: itemId, name: "" }); // Name needed? Just ID is enough really
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


  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
      {/* 返回按钮 */}
      <div className="h-12 bg-white border-b border-gray-200 flex items-center px-4 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回专栏列表
        </Button>
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
          />
        </aside>

        {/* 中间 - 编辑器 */}
        <main className="flex-1 overflow-y-auto bg-white">
          {currentPostId ? (
            <div className="max-w-4xl mx-auto p-6">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-medium text-gray-500">正在编辑: {title || "Untitled"}</h2>
                  {lastSaved && (
                    <span className="text-xs text-gray-400">
                      上次保存于 {lastSaved.toLocaleTimeString("zh-CN")}
                    </span>
                  )}
                </div>
              </div>

              <RichTextEditor content={content} onChange={setContent} />
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
