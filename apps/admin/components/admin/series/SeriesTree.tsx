"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Folder,
  FileText,
  Search,
  FolderPlus,
  FilePlus,
  Edit,
  Trash,
  Unlink,
  Eye,
  EyeOff,
  GripVertical,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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

interface SeriesTreeProps {
  seriesName: string;
  seriesSlug: string;
  seriesEmoji: string;
  onPostSelect: (postId: string) => void;
  selectedPostId: string | null;
  items: FileNode[];
  onAddFolder?: (parentId?: string) => void;
  onAddPost?: (parentId?: string) => void;
  onRename?: (itemId: string, currentName: string) => void;
  onDelete?: (itemId: string) => void;
  onDetach?: (itemId: string) => void;
  onTogglePublish?: (itemId: string, published: boolean) => void;
  onMoveItem?: (itemId: string, targetParentId: string | null) => void;
}

export function SeriesTree({
  seriesName,
  seriesSlug,
  seriesEmoji,
  onPostSelect,
  selectedPostId,
  items,
  onAddFolder,
  onAddPost,
  onRename,
  onDelete,
  onDetach,
  onTogglePublish,
  onMoveItem,
}: SeriesTreeProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [fileTree, setFileTree] = useState<FileNode[]>(items);

  useEffect(() => {
    setFileTree(items);
  }, [items]);

  // ---- Context Menu ----
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    nodeId: string;
    nodeName?: string;
    nodeType: "folder" | "file";
    postId?: string | null;
    published?: boolean;
  } | null>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      postId: node.postId,
      published: node.published,
    });
  };

  // ---- Drag & Drop ----
  const dragItemRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null); // folder being hovered
  const [dragOverRoot, setDragOverRoot] = useState(false); // root area being hovered

  const handleDragStart = useCallback(
    (e: React.DragEvent, nodeId: string) => {
      dragItemRef.current = nodeId;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", nodeId);
      // Make the drag image slightly transparent
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = "0.5";
      }
    },
    []
  );

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    dragItemRef.current = null;
    setDragOverId(null);
    setDragOverRoot(false);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, targetNode: FileNode) => {
      e.preventDefault();
      e.stopPropagation();
      if (!dragItemRef.current) return;
      // Only allow drop on folders (not on files or on self)
      if (targetNode.type === "folder" && targetNode.id !== dragItemRef.current) {
        e.dataTransfer.dropEffect = "move";
        setDragOverId(targetNode.id);
        setDragOverRoot(false);
      }
    },
    []
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      if (dragOverId === targetId) {
        setDragOverId(null);
      }
    },
    [dragOverId]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, targetNode: FileNode) => {
      e.preventDefault();
      e.stopPropagation();
      const draggedId = dragItemRef.current;
      if (!draggedId || targetNode.type !== "folder" || targetNode.id === draggedId) return;

      // Check that we're not dropping a folder into its own child
      const isDescendant = (parentNode: FileNode, childId: string): boolean => {
        if (parentNode.id === childId) return true;
        if (parentNode.children) {
          return parentNode.children.some((c) => isDescendant(c, childId));
        }
        return false;
      };

      // Find dragged node
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

      const draggedNode = findNode(fileTree, draggedId);
      if (draggedNode && draggedNode.type === "folder" && isDescendant(draggedNode, targetNode.id)) {
        return; // Cannot drop parent folder into its own descendant
      }

      onMoveItem?.(draggedId, targetNode.id);
      setDragOverId(null);
      dragItemRef.current = null;
    },
    [fileTree, onMoveItem]
  );

  // Drop on root area (move to root)
  const handleRootDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (dragItemRef.current) {
      e.dataTransfer.dropEffect = "move";
      setDragOverRoot(true);
      setDragOverId(null);
    }
  }, []);

  const handleRootDragLeave = useCallback(() => {
    setDragOverRoot(false);
  }, []);

  const handleRootDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const draggedId = dragItemRef.current;
      if (!draggedId) return;
      onMoveItem?.(draggedId, null); // null = move to root
      setDragOverRoot(false);
      dragItemRef.current = null;
    },
    [onMoveItem]
  );

  // ---- Tree operations ----
  const toggleFolder = (id: string) => {
    setFileTree((prevTree) =>
      prevTree.map((node) => toggleNodeExpansion(node, id))
    );
  };

  const toggleNodeExpansion = (node: FileNode, id: string): FileNode => {
    if (node.id === id) {
      return { ...node, expanded: !node.expanded };
    }
    if (node.children) {
      return {
        ...node,
        children: node.children.map((child) => toggleNodeExpansion(child, id)),
      };
    }
    return node;
  };

  const filterTree = (nodes: FileNode[], query: string): FileNode[] => {
    if (!query) return nodes;
    const lowerCaseQuery = query.toLowerCase();
    const filtered: FileNode[] = [];

    for (const node of nodes) {
      const matches = node.name.toLowerCase().includes(lowerCaseQuery);
      let children: FileNode[] = [];
      if (node.children) {
        children = filterTree(node.children, query);
      }
      if (matches || children.length > 0) {
        filtered.push({
          ...node,
          expanded: matches || children.length > 0 ? true : node.expanded,
          children: children.length > 0 ? children : node.children,
        });
      }
    }
    return filtered;
  };

  const displayTree = filterTree(fileTree, searchQuery);

  /** 发布状态小圆点 */
  const StatusDot = ({ published }: { published?: boolean }) => (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
        published ? "bg-green-500" : "bg-gray-300"
      }`}
      title={published ? "已发布" : "草稿"}
    />
  );

  const renderNode = (node: FileNode, level: number = 0) => {
    const isDragOver = dragOverId === node.id;

    if (node.type === "folder") {
      return (
        <div key={node.id}>
          <div
            draggable
            onDragStart={(e) => handleDragStart(e, node.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, node)}
            onDragLeave={(e) => handleDragLeave(e, node.id)}
            onDrop={(e) => handleDrop(e, node)}
            className={`flex items-center rounded-lg transition-all ${
              isDragOver
                ? "ring-2 ring-cyan-400 bg-cyan-50"
                : ""
            }`}
          >
            <button
              onClick={() => toggleFolder(node.id)}
              onContextMenu={(e) => handleContextMenu(e, node)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors text-left ${
                !node.published ? "opacity-60" : ""
              }`}
              style={{ paddingLeft: `${level * 12 + 8}px` }}
            >
              <GripVertical className="h-3 w-3 text-gray-300 flex-shrink-0 cursor-grab" />
              {node.expanded ? (
                <ChevronDown className="h-4 w-4 text-gray-500 flex-shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-500 flex-shrink-0" />
              )}
              {node.expanded ? (
                <FolderOpen className="h-4 w-4 text-cyan-600 flex-shrink-0" />
              ) : (
                <Folder className="h-4 w-4 text-gray-500 flex-shrink-0" />
              )}
              <span className="text-sm font-medium text-gray-700 truncate flex-1">
                {node.name}
              </span>
              <StatusDot published={node.published} />
              <span className="text-xs text-gray-400 flex-shrink-0">
                {node.children?.length ?? 0}
              </span>
            </button>
          </div>
          {node.expanded && node.children && (
            <div>
              {node.children.map((child) => renderNode(child, level + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        key={node.id}
        draggable
        onDragStart={(e) => handleDragStart(e, node.id)}
        onDragEnd={handleDragEnd}
      >
        <button
          onClick={() => onPostSelect(node.id)}
          onContextMenu={(e) => handleContextMenu(e, node)}
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors text-left ${
            selectedPostId === node.id
              ? "bg-gradient-to-r from-cyan-50 to-purple-50 text-cyan-900 border border-cyan-200"
              : "hover:bg-gray-50 text-gray-700"
          } ${!node.published ? "opacity-60" : ""}`}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
        >
          <GripVertical className="h-3 w-3 text-gray-300 flex-shrink-0 cursor-grab" />
          <FileText
            className={`h-4 w-4 flex-shrink-0 ${
              selectedPostId === node.id ? "text-cyan-600" : "text-gray-400"
            }`}
          />
          <span className="text-sm truncate flex-1">{node.name}</span>
          <StatusDot published={node.published} />
        </button>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200 relative">
      {/* 专栏标题 */}
      <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-cyan-50 to-purple-50">
        <h2 className="text-lg font-bold bg-gradient-to-r from-cyan-600 to-purple-600 bg-clip-text text-transparent mb-1">
          {seriesEmoji} {seriesName}
        </h2>
        <p className="text-xs text-gray-500">{seriesSlug}</p>
      </div>

      {/* 搜索框 */}
      <div className="p-3 border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索文章..."
            className="pl-9 bg-gray-50 border-gray-200 text-sm h-9"
          />
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="px-3 py-2 border-b border-gray-200 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAddFolder?.()}
          className="flex-1 h-8 text-xs border-cyan-300 text-cyan-700 hover:bg-cyan-50 hover:border-cyan-400"
        >
          <FolderPlus className="h-3.5 w-3.5 mr-1.5" />
          新建文件夹
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAddPost?.()}
          className="flex-1 h-8 text-xs border-purple-300 text-purple-700 hover:bg-purple-50 hover:border-purple-400"
        >
          <FilePlus className="h-3.5 w-3.5 mr-1.5" />
          新建文章
        </Button>
      </div>

      {/* 状态图例 */}
      <div className="px-3 py-1.5 border-b border-gray-100 flex items-center gap-3 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500" /> 已发布
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-300" /> 草稿
        </span>
      </div>

      {/* 文件树 (drop zone for root level) */}
      <div
        className={`flex-1 overflow-y-auto p-2 transition-colors ${
          dragOverRoot ? "bg-cyan-50/50 ring-2 ring-inset ring-cyan-300" : ""
        }`}
        onDragOver={handleRootDragOver}
        onDragLeave={handleRootDragLeave}
        onDrop={handleRootDrop}
      >
        {displayTree.length > 0 ? (
          displayTree.map((node) => renderNode(node))
        ) : (
          <div className="text-center py-8 text-sm text-gray-400">
            {searchQuery ? "没有匹配的文章" : "暂无内容，请新建文件夹或文章"}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && contextMenu.visible && (
        <div
          className="fixed bg-white border border-gray-200 shadow-xl rounded-lg py-1 z-50 min-w-[170px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {/* Toggle publish */}
          {onTogglePublish && (
            <button
              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${
                contextMenu.published
                  ? "text-yellow-600 hover:bg-yellow-50"
                  : "text-green-600 hover:bg-green-50"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePublish(contextMenu.nodeId, !contextMenu.published);
                setContextMenu(null);
              }}
            >
              {contextMenu.published ? (
                <>
                  <EyeOff className="h-4 w-4" /> 取消发布
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" /> 发布
                </>
              )}
            </button>
          )}

          <div className="border-t border-gray-100 my-1" />

          {/* Folder-specific options */}
          {contextMenu.nodeType === "folder" && (
            <>
              <button
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddPost?.(contextMenu.nodeId);
                  setContextMenu(null);
                }}
              >
                <FilePlus className="h-4 w-4" /> 新建文章
              </button>
              <button
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddFolder?.(contextMenu.nodeId);
                  setContextMenu(null);
                }}
              >
                <FolderPlus className="h-4 w-4" /> 新建文件夹
              </button>
              <div className="border-t border-gray-100 my-1" />
            </>
          )}

          {/* Common options */}
          <button
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            onClick={(e) => {
              e.stopPropagation();
              if (onRename && contextMenu.nodeName) {
                onRename(contextMenu.nodeId, contextMenu.nodeName);
              }
              setContextMenu(null);
            }}
          >
            <Edit className="h-4 w-4" /> 重命名
          </button>

          {/* Detach option - only for file (post) nodes */}
          {contextMenu.nodeType === "file" && contextMenu.postId && onDetach && (
            <button
              className="w-full text-left px-4 py-2 text-sm text-amber-600 hover:bg-amber-50 flex items-center gap-2"
              onClick={(e) => {
                e.stopPropagation();
                onDetach(contextMenu.nodeId);
                setContextMenu(null);
              }}
            >
              <Unlink className="h-4 w-4" /> 从专栏分离
            </button>
          )}

          <button
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(contextMenu.nodeId);
              setContextMenu(null);
            }}
          >
            <Trash className="h-4 w-4" /> 删除
          </button>
        </div>
      )}
    </div>
  );
}
