"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface SeriesItem {
    id: string;
    title: string | null;
    children: SeriesItem[];
    postId: string | null;
    post?: {
        id: string;
        title: string;
        slug: string;
        published?: boolean;
    };
}

interface SeriesSidebarProps {
    title: string;
    slug: string;
    emoji: string;
    items: SeriesItem[];
}

/**
 * Check if a node (or any descendant) has a published post.
 * Folders are visible if they have at least one published descendant.
 */
function hasPublishedDescendant(node: SeriesItem): boolean {
    if (node.postId && node.post?.published !== false) return true;
    return node.children?.some(hasPublishedDescendant) || false;
}

/**
 * Filter tree to only include nodes with published posts
 * or folders that contain published descendants.
 */
function filterPublished(nodes: SeriesItem[]): SeriesItem[] {
    return nodes
        .filter(hasPublishedDescendant)
        .map((node) => ({
            ...node,
            children: node.children ? filterPublished(node.children) : [],
        }));
}

export function SeriesSidebar({ title, emoji, items }: SeriesSidebarProps) {
    const pathname = usePathname();
    const visibleItems = filterPublished(items);

    return (
        <div className="lg:sticky lg:top-24">
            <div className="bg-white/60 backdrop-blur-md border border-gray-200/60 rounded-2xl shadow-sm overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 bg-gradient-to-r from-cyan-50/80 to-blue-50/80 border-b border-gray-200/50">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2 text-base">
                        <span>{emoji}</span>
                        <span>{title}</span>
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">专栏目录</p>
                </div>

                {/* Tree */}
                <div className="p-2 max-h-[calc(100vh-220px)] overflow-y-auto">
                    {visibleItems.length > 0 ? (
                        visibleItems.map((item) => (
                            <SeriesNode
                                key={item.id}
                                node={item}
                                level={0}
                                activePath={pathname}
                            />
                        ))
                    ) : (
                        <div className="text-center py-6 text-sm text-gray-400">
                            暂无已发布内容
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function SeriesNode({
    node,
    level,
    activePath
}: {
    node: SeriesItem;
    level: number;
    activePath: string;
}) {
    const containsActive = (n: SeriesItem): boolean => {
        if (n.post && `/article/${n.post.slug}` === activePath) return true;
        return n.children?.some(containsActive) || false;
    };

    const [expanded, setExpanded] = useState(containsActive(node) || level < 1);
    const isFile = !!node.postId;
    const isActive = isFile && node.post && activePath === `/article/${node.post.slug}`;

    // File node — link to article
    if (isFile && node.post) {
        return (
            <Link
                href={`/article/${node.post.slug}`}
                className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-all mb-0.5",
                    isActive
                        ? "bg-gradient-to-r from-cyan-50 to-blue-50 text-cyan-700 font-medium border border-cyan-200/60"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
                style={{ paddingLeft: `${level * 16 + 8}px` }}
            >
                <FileText className={cn(
                    "h-3.5 w-3.5 flex-shrink-0",
                    isActive ? "text-cyan-500" : "text-gray-400"
                )} />
                <span className="truncate">{node.title || node.post.title}</span>
            </Link>
        );
    }

    // Folder node
    const childCount = node.children?.length ?? 0;

    return (
        <div>
            <div
                role="button"
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50 cursor-pointer select-none mb-0.5 transition-colors"
                style={{ paddingLeft: `${level * 16 + 8}px` }}
            >
                <span className="text-gray-400 flex-shrink-0">
                    {expanded
                        ? <ChevronDown className="h-3.5 w-3.5" />
                        : <ChevronRight className="h-3.5 w-3.5" />
                    }
                </span>
                <span className="flex-shrink-0">
                    {expanded
                        ? <FolderOpen className="h-3.5 w-3.5 text-cyan-500" />
                        : <Folder className="h-3.5 w-3.5 text-amber-400" />
                    }
                </span>
                <span className="font-medium truncate flex-1">{node.title || "未命名文件夹"}</span>
                {childCount > 0 && (
                    <span className="text-xs text-gray-400 flex-shrink-0">{childCount}</span>
                )}
            </div>
            {expanded && node.children && (
                <div>
                    {node.children.map((child) => (
                        <SeriesNode
                            key={child.id}
                            node={child}
                            level={level + 1}
                            activePath={activePath}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
