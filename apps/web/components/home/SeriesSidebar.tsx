"use client";

import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
    filterPublished,
    getMobileSeriesRecommendations,
    type SeriesSidebarItem,
} from "@/lib/series-sidebar";

interface SeriesSidebarProps {
    title: string;
    slug: string;
    emoji: string;
    items: SeriesSidebarItem[];
}

export function SeriesSidebar({ title, emoji, items }: SeriesSidebarProps) {
    const t = useTranslations("sidebar");
    const pathname = usePathname();
    const visibleItems = filterPublished(items);
    const mobileRecommendations = getMobileSeriesRecommendations(items, pathname);

    return (
        <div>
            <div className="bg-white/60 backdrop-blur-md border border-gray-200/60 rounded-2xl shadow-sm overflow-hidden">
                {/* Header */}
                <div className="px-4 py-3 bg-gradient-to-r from-cyan-50/80 to-blue-50/80 border-b border-gray-200/50">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2 text-base">
                        <span>{emoji}</span>
                        <span>{title}</span>
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">{t("seriesToc")}</p>
                </div>

                {/* Tree */}
                <div className="hidden lg:block p-2">
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
                            {t("seriesEmpty")}
                        </div>
                    )}
                </div>

                <div className="lg:hidden p-2">
                    {mobileRecommendations.length > 0 ? (
                        <div className="space-y-1">
                            {mobileRecommendations.map((item) => {
                                const isActive = pathname === `/article/${item.slug}`;
                                return (
                                    <Link
                                        key={item.id}
                                        href={`/article/${item.slug}`}
                                        className={cn(
                                            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all",
                                            isActive
                                                ? "bg-gradient-to-r from-cyan-50 to-blue-50 text-cyan-700 font-medium border border-cyan-200/60"
                                                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                                        )}
                                    >
                                        <FileText className={cn(
                                            "h-3.5 w-3.5 flex-shrink-0",
                                            isActive ? "text-cyan-500" : "text-gray-400"
                                        )} />
                                        <span className="truncate">{item.title}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-6 text-sm text-gray-400">
                            {t("seriesEmpty")}
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
    node: SeriesSidebarItem;
    level: number;
    activePath: string;
}) {
    const t = useTranslations("sidebar");
    const containsActive = (n: SeriesSidebarItem): boolean => {
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
                <span className="font-medium truncate flex-1">{node.title || t("untitledFolder")}</span>
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
