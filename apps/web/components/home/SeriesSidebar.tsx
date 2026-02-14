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
    };
}

interface SeriesSidebarProps {
    title: string;
    slug: string;
    emoji: string;
    items: SeriesItem[];
}

export function SeriesSidebar({ title, slug, emoji, items }: SeriesSidebarProps) {
    const pathname = usePathname();

    const renderNode = (node: SeriesItem, level: number = 0) => {
        // Determine if this node or any of its children are active to auto-expand


        // Simple state for folders, default expanded if not deep? 
        // For a read-only sidebar, we might want to expand all or smart expand.
        // Let's implement a toggleable folder.
        return (
            <SeriesNode
                key={node.id}
                node={node}
                level={level}
                activePath={pathname}
            />
        );
    };

    return (
        <div className="w-64 flex-shrink-0 hidden lg:block mr-8">
            <div className="sticky top-24 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4 bg-gradient-to-r from-cyan-50 to-blue-50 border-b border-gray-100">
                    <div className="text-xs text-gray-500 font-medium mb-1">所属专栏</div>
                    <Link href={`/series/${slug}`} className="block">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2 hover:text-cyan-600 transition-colors">
                            <span>{emoji}</span>
                            <span>{title}</span>
                        </h3>
                    </Link>
                </div>
                <div className="p-2 max-h-[calc(100vh-200px)] overflow-y-auto">
                    {items.map((item) => renderNode(item))}
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
    // Check if this node contains the active path (recursively) to default expand
    const containsActive = (n: SeriesItem): boolean => {
        if (n.post && `/article/${n.post.slug}` === activePath) return true;
        return n.children?.some(containsActive) || false;
    };

    const [expanded, setExpanded] = useState(containsActive(node) || level < 1);
    const isFile = !!node.postId;
    const isActive = isFile && node.post && activePath === `/article/${node.post.slug}`;

    if (isFile && node.post) {
        return (
            <Link
                href={`/article/${node.post.slug}`}
                className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors mb-0.5",
                    isActive
                        ? "bg-cyan-50 text-cyan-700 font-medium"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
                style={{ paddingLeft: `${level * 12 + 8}px` }}
            >
                <FileText className={cn("h-3.5 w-3.5 flex-shrink-0", isActive ? "text-cyan-500" : "text-gray-400")} />
                <span className="truncate">{node.title || node.post.title}</span>
            </Link>
        );
    }

    // Folder
    return (
        <div>
            <div
                role="button"
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-gray-700 hover:bg-gray-50 cursor-pointer select-none mb-0.5"
                style={{ paddingLeft: `${level * 12 + 8}px` }}
            >
                <span className="text-gray-400">
                    {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </span>
                <span className="text-amber-400">
                    {expanded ? <FolderOpen className="h-3.5 w-3.5" /> : <Folder className="h-3.5 w-3.5" />}
                </span>
                <span className="font-medium truncate">{node.title || "Untitled Folder"}</span>
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
