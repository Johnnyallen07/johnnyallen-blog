"use client";

import { useState } from "react";
import { FileText, Folder, ChevronRight, ChevronDown } from "lucide-react";
import Link from "next/link";

interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
  isActive?: boolean;
  slug?: string;
}

interface ColumnFileTreeProps {
  columnName: string;
  files: FileNode[];
}

function FileTreeNode({ node, level = 0 }: { node: FileNode; level?: number }) {
  const [isOpen, setIsOpen] = useState(true);

  const content = (
    <button
      onClick={() => node.type === "folder" && setIsOpen(!isOpen)}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
        node.isActive
          ? "bg-cyan-50 text-cyan-700 font-medium"
          : "text-gray-700 hover:bg-gray-50"
      }`}
      style={{ paddingLeft: `${level * 12 + 12}px` }}
    >
      {node.type === "folder" ? (
        <>
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
          <Folder className="h-4 w-4 text-amber-500" />
        </>
      ) : (
        <>
          <div className="w-4" />
          <FileText className="h-4 w-4 text-gray-400" />
        </>
      )}
      <span className="flex-1 text-left truncate">{node.name}</span>
    </button>
  );

  return (
    <div>
      {node.type === "file" && node.slug ? (
        <Link href={`/article/${node.slug}`}>{content}</Link>
      ) : (
        content
      )}
      {node.type === "folder" && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ColumnFileTree({ columnName, files }: ColumnFileTreeProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
      <div className="mb-4 pb-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Folder className="h-5 w-5 text-cyan-600" />
          {columnName}
        </h3>
        <p className="text-xs text-gray-500 mt-1">专栏目录</p>
      </div>

      <div className="space-y-0.5">
        {files.map((node) => (
          <FileTreeNode key={node.id} node={node} />
        ))}
      </div>
    </div>
  );
}
