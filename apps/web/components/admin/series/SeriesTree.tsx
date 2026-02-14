"use client";

import { useState, useEffect } from "react";
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
}: SeriesTreeProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [fileTree, setFileTree] = useState<FileNode[]>(items);

  // Sync state with props when items change
  useEffect(() => {
    setFileTree(items);
  }, [items]);

  /* Context Menu State */
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    folderId: string;
    nodeName?: string;
  } | null>(null);

  // Close context menu on click elsewhere
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, folderId: string, nodeName: string) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      folderId,
      nodeName,
    });
  };

  // Function to toggle folder expansion
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

  // Filter tree based on search query
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
          expanded: matches || children.length > 0 ? true : node.expanded, // Expand if matched or has matching children
          children: children.length > 0 ? children : node.children, // Keep original children if no match in children
        });
      }
    }
    return filtered;
  };

  const displayTree = filterTree(fileTree, searchQuery);

  const renderNode = (node: FileNode, level: number = 0) => {
    if (node.type === "folder") {
      return (
        <div key={node.id}>
          <button
            onClick={() => toggleFolder(node.id)}
            onContextMenu={(e) => handleContextMenu(e, node.id, node.name)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors text-left"
            style={{ paddingLeft: `${level * 12 + 8}px` }}
          >
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
            <span className="text-xs text-gray-400 flex-shrink-0">
              {node.children?.length ?? 0}
            </span>
          </button>
          {node.expanded && node.children && (
            <div>
              {node.children.map((child) => renderNode(child, level + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        key={node.id}
        onClick={() => onPostSelect(node.id)}
        onContextMenu={(e) => handleContextMenu(e, node.id, node.name)}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors text-left ${selectedPostId === node.id
          ? "bg-gradient-to-r from-cyan-50 to-purple-50 text-cyan-900 border border-cyan-200"
          : "hover:bg-gray-50 text-gray-700"
          }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        <FileText
          className={`h-4 w-4 flex-shrink-0 ${selectedPostId === node.id ? "text-cyan-600" : "text-gray-400"
            }`}
        />
        <span className="text-sm truncate flex-1">{node.name}</span>
      </button>
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

      {/* 文件树 */}
      <div className="flex-1 overflow-y-auto p-2">
        {displayTree.length > 0 ? (
          displayTree.map((node) => renderNode(node))
        ) : (
          <div className="text-center py-8 text-sm text-gray-400">
            {searchQuery ? "没有匹配的文章" : "暂无内容"}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && contextMenu.visible && (
        <div
          className="fixed bg-white border border-gray-200 shadow-xl rounded-lg py-1 z-50 min-w-[150px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            onClick={(e) => {
              e.stopPropagation();
              onAddPost?.(contextMenu.folderId);
              setContextMenu(null);
            }}
          >
            <FilePlus className="h-4 w-4" /> 新建文章
          </button>
          <button
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            onClick={(e) => {
              e.stopPropagation();
              onAddFolder?.(contextMenu.folderId);
              setContextMenu(null);
            }}
          >
            <FolderPlus className="h-4 w-4" /> 新建文件夹
          </button>
          <div className="border-t border-gray-100 my-1" />
          <button
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            onClick={(e) => {
              e.stopPropagation();
              if (onRename && contextMenu.nodeName) {
                onRename(contextMenu.folderId, contextMenu.nodeName);
              }
              setContextMenu(null);
            }}
          >
            <Edit className="h-4 w-4" /> 重命名
          </button>
          <button
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(contextMenu.folderId);
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
