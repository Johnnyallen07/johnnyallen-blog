"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
    Music,
    Play,
    Pause,
    MoreVertical,
    Edit,
    Trash2,
    Search,
    ArrowLeft,
    Upload,
    Settings,
    GripVertical,
    Star,
    ListMusic,
    Music2,
    Music4,
    Mic2,
    Guitar,
    Piano,
    Disc2,
    Disc3,
    FileMusic,
    Users,
    AudioLines,
    Headphones,
    Radio,
    Volume2,
    Heart,
    Sparkles,
    Library,
    BookOpen,
    Waves,
    CirclePlay,
    User,
    type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { fetchClient } from "@/lib/api";

/* ── Icon Map (same as music main page) ── */

const ICON_MAP: Record<string, LucideIcon> = {
    Music, Music2, Music4, Mic2, Guitar, Piano,
    Disc2, Disc3, FileMusic, ListMusic, Users, AudioLines,
    Headphones, Radio, Volume2, Star, Heart, Sparkles,
    Library, BookOpen, Waves, CirclePlay, User,
};

function getIconComponent(name: string | null | undefined, fallback: LucideIcon = Music2): LucideIcon {
    if (name && ICON_MAP[name]) return ICON_MAP[name]!;
    return fallback;
}

/* ── Types ── */

interface MusicTrack {
    id: string;
    title: string;
    musician: string;
    performer: string;
    category: string;
    series: string | null;
    duration: number;
    fileSize: number;
    fileUrl: string;
    coverUrl: string | null;
    order: number;
    createdAt: string;
}

interface SidebarEntity {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    icon: string | null;
}

/* ── Helpers ── */

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/* ── Page ── */

export default function MusicManagePage() {
    const router = useRouter();
    const [tracks, setTracks] = useState<MusicTrack[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedFilter, setSelectedFilter] = useState("all");
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [editingTrack, setEditingTrack] = useState<MusicTrack | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    /* ── Sidebar entities ── */
    const [sidebarCategories, setSidebarCategories] = useState<SidebarEntity[]>([]);
    const [sidebarSeries, setSidebarSeries] = useState<SidebarEntity[]>([]);

    /* ── Drag state ── */
    const dragIndexRef = useRef<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    /* ── Data fetching ── */

    const fetchTracks = useCallback(async () => {
        try {
            setIsLoading(true);
            const params = new URLSearchParams();
            if (searchQuery) params.set("search", searchQuery);
            const data = await fetchClient(`/music?${params.toString()}`);
            setTracks(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Failed to fetch tracks:", error);
        } finally {
            setIsLoading(false);
        }
    }, [searchQuery]);

    const fetchSidebar = useCallback(async () => {
        try {
            const [cats, srs] = await Promise.all([
                fetchClient("/music-categories"),
                fetchClient("/music-series"),
            ]);
            setSidebarCategories(Array.isArray(cats) ? cats : []);
            setSidebarSeries(Array.isArray(srs) ? srs : []);
        } catch {
            /* ignore */
        }
    }, []);

    useEffect(() => {
        fetchTracks();
    }, [fetchTracks]);

    useEffect(() => {
        fetchSidebar();
    }, [fetchSidebar]);

    /* ── Sidebar filter logic ── */

    const filteredTracks = (() => {
        let list = tracks;

        // Sidebar filter
        if (selectedFilter !== "all") {
            if (selectedFilter.startsWith("cat:")) {
                const catName = selectedFilter.slice(4);
                list = list.filter((t) => t.category === catName);
            } else if (selectedFilter.startsWith("series:")) {
                const seriesName = selectedFilter.slice(7);
                list = list.filter((t) => t.series === seriesName);
            }
        }

        // Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            list = list.filter(
                (t) =>
                    t.title.toLowerCase().includes(q) ||
                    t.musician.toLowerCase().includes(q) ||
                    t.performer.toLowerCase().includes(q)
            );
        }

        return list;
    })();

    /* ── Song counts ── */
    const songCountMap = (() => {
        const map: Record<string, number> = {};
        map["all"] = tracks.length;
        for (const t of tracks) {
            const catKey = `cat:${t.category}`;
            map[catKey] = (map[catKey] || 0) + 1;
            if (t.series) {
                const seriesKey = `series:${t.series}`;
                map[seriesKey] = (map[seriesKey] || 0) + 1;
            }
        }
        return map;
    })();

    /* ── Actions ── */

    const handlePlay = (id: string) => {
        setPlayingId(playingId === id ? null : id);
    };

    const handleEdit = (track: MusicTrack) => {
        setEditingTrack({ ...track });
        setIsEditDialogOpen(true);
    };

    const handleSaveEdit = async () => {
        if (!editingTrack) return;
        try {
            await fetchClient(`/music/${editingTrack.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    title: editingTrack.title,
                    musician: editingTrack.musician,
                    performer: editingTrack.performer,
                    category: editingTrack.category,
                    series: editingTrack.series,
                }),
            });
            setIsEditDialogOpen(false);
            setEditingTrack(null);
            fetchTracks();
        } catch (error) {
            console.error("Failed to save:", error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("确定要删除这首音乐吗？文件也会从云端删除。")) return;
        try {
            await fetchClient(`/music/${id}`, { method: "DELETE" });
            fetchTracks();
        } catch (error) {
            console.error("Failed to delete:", error);
        }
    };

    /* ── Drag-to-reorder ── */

    const handleDragStart = (index: number) => {
        dragIndexRef.current = index;
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        setDragOverIndex(index);
    };

    const handleDragLeave = () => {
        setDragOverIndex(null);
    };

    const handleDrop = async (dropIndex: number) => {
        const dragIndex = dragIndexRef.current;
        setDragOverIndex(null);
        dragIndexRef.current = null;

        if (dragIndex === null || dragIndex === dropIndex) return;

        const newTracks = [...filteredTracks];
        const [dragged] = newTracks.splice(dragIndex, 1);
        if (!dragged) return;
        newTracks.splice(dropIndex, 0, dragged);

        // If we're viewing a filtered subset, we need to map back to the full tracks array
        // For simplicity, when filtered, update the full list order
        if (selectedFilter === "all" && !searchQuery.trim()) {
            setTracks(newTracks);
        } else {
            // Update order within the filtered view
            const newFull = [...tracks];
            const filteredIds = newTracks.map((t) => t.id);
            // Reorder only the filtered items within the full list
            const filteredPositions = tracks
                .map((t, i) => (filteredIds.includes(t.id) ? i : -1))
                .filter((i) => i >= 0);
            filteredPositions.forEach((pos, i) => {
                newFull[pos] = newTracks[i]!;
            });
            setTracks(newFull);
        }

        try {
            const allIds = selectedFilter === "all" && !searchQuery.trim()
                ? newTracks.map((t) => t.id)
                : tracks.map((t) => t.id); // fallback: send current full order
            // For filtered reorder, we just reorder the filtered subset
            await fetchClient("/music/reorder/batch", {
                method: "PATCH",
                body: JSON.stringify({
                    ids: selectedFilter === "all" && !searchQuery.trim()
                        ? newTracks.map((t) => t.id)
                        : (() => {
                            const newFull = [...tracks];
                            const filteredIds = newTracks.map((t) => t.id);
                            const filteredPositions = tracks
                                .map((t, i) => (filteredIds.includes(t.id) ? i : -1))
                                .filter((i) => i >= 0);
                            filteredPositions.forEach((pos, i) => {
                                newFull[pos] = newTracks[i]!;
                            });
                            return newFull.map((t) => t.id);
                        })(),
                }),
            });
        } catch (error) {
            console.error("Failed to reorder:", error);
            fetchTracks();
        }
    };

    const handleDragEnd = () => {
        dragIndexRef.current = null;
        setDragOverIndex(null);
    };

    /* ── Sidebar items ── */

    const categoryItems = sidebarCategories.map((c) => {
        const Icon = getIconComponent(c.icon, Music);
        return {
            id: `cat:${c.name}`,
            name: c.name,
            icon: <Icon className="h-4 w-4" />,
        };
    });

    const seriesItems = sidebarSeries.map((s) => {
        const Icon = getIconComponent(s.icon, Headphones);
        return {
            id: `series:${s.name}`,
            name: s.name,
            icon: <Icon className="h-4 w-4" />,
        };
    });

    /* ── Sidebar Section Component ── */

    const SidebarSection = ({
        title,
        items,
    }: {
        title: string;
        items: { id: string; name: string; icon: React.ReactNode }[];
    }) => (
        <div className="mb-6">
            <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3 px-3">
                {title}
            </h2>
            <nav className="space-y-0.5">
                {items.map((item) => {
                    const active = selectedFilter === item.id;
                    const count = songCountMap[item.id] || 0;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setSelectedFilter(item.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 ${active
                                ? "bg-white shadow-sm text-gray-900 font-medium"
                                : "text-gray-600 hover:bg-white/60 hover:text-gray-900"
                                }`}
                        >
                            <span
                                className={`transition-colors ${active ? "text-purple-600" : "text-gray-400"
                                    }`}
                            >
                                {item.icon}
                            </span>
                            <span className="text-sm truncate flex-1 text-left">{item.name}</span>
                            {count > 0 && (
                                <span className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-full ${active ? "text-purple-600 bg-purple-100" : "text-gray-400 bg-gray-100/80"}`}>
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </nav>
        </div>
    );

    /* ── Render ── */

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-cyan-50">
            {/* 顶部工具栏 */}
            <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/60 sticky top-0 z-10">
                <div className="px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => router.push("/admin")}
                            >
                                <ArrowLeft className="h-4 w-4 mr-1" />
                                返回
                            </Button>
                            <h1 className="text-2xl font-bold text-gray-900">音乐管理</h1>
                            <span className="text-sm text-gray-500">
                                共 {tracks.length} 首
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* 搜索框 */}
                            <div className="relative w-72">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <Input
                                    type="text"
                                    placeholder="搜索音乐、艺术家、作曲家..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 bg-white/60 border-gray-200/60"
                                />
                            </div>
                            <Button
                                variant="outline"
                                onClick={() => router.push("/admin/music/sidebar")}
                            >
                                <Settings className="h-4 w-4 mr-2" />
                                侧边栏管理
                            </Button>
                            <Button
                                onClick={() => router.push("/admin/music/upload")}
                                className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
                            >
                                <Upload className="h-4 w-4 mr-2" />
                                上传音乐
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* 主体: 侧边栏 + 内容 */}
            <div className="flex" style={{ height: "calc(100vh - 73px)" }}>
                {/* ═══ 侧边栏 ═══ */}
                <aside className="w-60 h-full overflow-y-auto py-6 px-4 flex-shrink-0 border-r border-gray-200/40">
                    <SidebarSection
                        title="库"
                        items={[
                            {
                                id: "all",
                                name: "所有音乐",
                                icon: <ListMusic className="h-4 w-4" />,
                            },
                            ...categoryItems,
                        ]}
                    />
                    {seriesItems.length > 0 && (
                        <SidebarSection title="系列" items={seriesItems} />
                    )}
                </aside>

                {/* ═══ 内容区 ═══ */}
                <main className="flex-1 h-full overflow-y-auto p-6">
                    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                        {/* 表头 */}
                        <div className="grid grid-cols-[40px_40px_1fr_140px_120px_120px_70px_70px_40px] gap-3 px-4 py-3 bg-gray-50/80 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider">
                            <div></div>
                            <div></div>
                            <div>标题 / 演奏者</div>
                            <div>作曲家</div>
                            <div>分类</div>
                            <div>系列</div>
                            <div className="text-right">时长</div>
                            <div className="text-right">大小</div>
                            <div></div>
                        </div>

                        {/* 列表 */}
                        <div>
                            {isLoading ? (
                                <div className="py-16 text-center text-gray-500">
                                    <div className="w-8 h-8 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin mx-auto mb-3" />
                                    加载中...
                                </div>
                            ) : filteredTracks.length > 0 ? (
                                filteredTracks.map((track, index) => {
                                    const isDragOver = dragOverIndex === index;
                                    return (
                                        <div
                                            key={track.id}
                                            draggable
                                            onDragStart={() => handleDragStart(index)}
                                            onDragOver={(e) => handleDragOver(e, index)}
                                            onDragLeave={handleDragLeave}
                                            onDrop={() => handleDrop(index)}
                                            onDragEnd={handleDragEnd}
                                            className={`group grid grid-cols-[40px_40px_1fr_140px_120px_120px_70px_70px_40px] gap-3 px-4 py-3 transition-all border-b border-gray-100 hover:bg-purple-50/30 ${isDragOver
                                                ? "border-t-2 border-t-purple-400 bg-purple-50/40"
                                                : ""
                                                }`}
                                        >
                                            {/* Drag handle */}
                                            <div className="flex items-center justify-center cursor-grab active:cursor-grabbing">
                                                <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                                            </div>

                                            {/* 播放按钮 */}
                                            <div className="flex items-center justify-center">
                                                <button
                                                    onClick={() => handlePlay(track.id)}
                                                    className="w-8 h-8 flex items-center justify-center bg-purple-100 hover:bg-purple-200 rounded-full transition-colors"
                                                >
                                                    {playingId === track.id ? (
                                                        <Pause className="w-4 h-4 text-purple-600" />
                                                    ) : (
                                                        <Play className="w-4 h-4 text-purple-600 ml-0.5" />
                                                    )}
                                                </button>
                                            </div>

                                            {/* 标题和演奏者 */}
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-10 h-10 bg-gradient-to-br from-purple-100 to-pink-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                    {(() => {
                                                        const cat = sidebarCategories.find((c) => c.name === track.category);
                                                        const CatIcon = getIconComponent(cat?.icon, Music);
                                                        return <CatIcon className="w-5 h-5 text-purple-500" />;
                                                    })()}
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="font-medium text-gray-900 text-sm leading-tight break-words">
                                                        {track.title}
                                                    </h3>
                                                    <p className="text-xs text-gray-400 mt-0.5">
                                                        {track.performer}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* 作曲家 */}
                                            <div className="flex items-center text-sm text-gray-600">
                                                {track.musician}
                                            </div>

                                            {/* 分类 */}
                                            <div className="flex items-center">
                                                <span className="text-xs px-2 py-1 bg-purple-50 text-purple-600 rounded-md">
                                                    {track.category}
                                                </span>
                                            </div>

                                            {/* 系列 */}
                                            <div className="flex items-center text-sm text-gray-500">
                                                {track.series || "-"}
                                            </div>

                                            {/* 时长 */}
                                            <div className="flex items-center justify-end text-sm text-gray-500 tabular-nums">
                                                {formatDuration(track.duration)}
                                            </div>

                                            {/* 文件大小 */}
                                            <div className="flex items-center justify-end text-sm text-gray-400 tabular-nums">
                                                {formatFileSize(track.fileSize)}
                                            </div>

                                            {/* 操作菜单 */}
                                            <div className="flex items-center justify-center">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <button className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                                                            <MoreVertical className="w-4 h-4 text-gray-500" />
                                                        </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => handleEdit(track)}>
                                                            <Edit className="w-4 h-4 mr-2" />
                                                            编辑
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => handleDelete(track.id)}
                                                            className="text-red-600"
                                                        >
                                                            <Trash2 className="w-4 h-4 mr-2" />
                                                            删除
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="py-16 text-center text-gray-500">
                                    <Music className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                    <p>{searchQuery ? "没有找到匹配的音乐" : "暂无音乐"}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>

            {/* 编辑对话框 */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>编辑音乐信息</DialogTitle>
                    </DialogHeader>
                    {editingTrack && (
                        <div className="space-y-4">
                            <div>
                                <Label>标题</Label>
                                <Input
                                    value={editingTrack.title}
                                    onChange={(e) =>
                                        setEditingTrack({ ...editingTrack, title: e.target.value })
                                    }
                                    className="mt-1.5"
                                />
                            </div>
                            <div>
                                <Label>作曲家</Label>
                                <Input
                                    value={editingTrack.musician}
                                    onChange={(e) =>
                                        setEditingTrack({
                                            ...editingTrack,
                                            musician: e.target.value,
                                        })
                                    }
                                    className="mt-1.5"
                                />
                            </div>
                            <div>
                                <Label>演奏者</Label>
                                <Input
                                    value={editingTrack.performer}
                                    onChange={(e) =>
                                        setEditingTrack({
                                            ...editingTrack,
                                            performer: e.target.value,
                                        })
                                    }
                                    className="mt-1.5"
                                />
                            </div>
                            <div>
                                <Label>分类</Label>
                                <Input
                                    value={editingTrack.category}
                                    onChange={(e) =>
                                        setEditingTrack({
                                            ...editingTrack,
                                            category: e.target.value,
                                        })
                                    }
                                    className="mt-1.5"
                                />
                            </div>
                            <div>
                                <Label>系列</Label>
                                <Input
                                    value={editingTrack.series || ""}
                                    onChange={(e) =>
                                        setEditingTrack({
                                            ...editingTrack,
                                            series: e.target.value || null,
                                        })
                                    }
                                    className="mt-1.5"
                                    placeholder="可选"
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsEditDialogOpen(false)}
                        >
                            取消
                        </Button>
                        <Button onClick={handleSaveEdit}>保存</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
