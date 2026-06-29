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
    Download,
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
    Youtube,
    Scissors,
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
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
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalTracks, setTotalTracks] = useState(0);
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [editingTrack, setEditingTrack] = useState<MusicTrack | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    /* ── Sidebar entities ── */
    const [sidebarCategories, setSidebarCategories] = useState<SidebarEntity[]>([]);
    const [sidebarSeries, setSidebarSeries] = useState<SidebarEntity[]>([]);
    const [serverCounts, setServerCounts] = useState<{ total: number; byCategory: { category: string; _count: number }[]; bySeries: { series: string; _count: number }[] } | null>(null);

    /* ── Drag state ── */
    const dragIndexRef = useRef<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    /* ── Data fetching ── */

    const fetchTracks = useCallback(async () => {
        try {
            setIsLoading(true);
            const params = new URLSearchParams();
            params.set("page", page.toString());
            params.set("pageSize", "50");
            if (searchQuery.trim()) params.set("search", searchQuery.trim());

            if (selectedFilter !== "all") {
                if (selectedFilter.startsWith("cat:")) {
                    params.set("category", selectedFilter.slice(4));
                } else if (selectedFilter.startsWith("series:")) {
                    params.set("series", selectedFilter.slice(7));
                }
            }

            const result = await fetchClient(`/music?${params.toString()}`);
            if (result && result.data) {
                setTracks(Array.isArray(result.data) ? result.data : []);
                setTotalPages(result.totalPages || 1);
                setTotalTracks(result.total || 0);
            } else {
                const list = result?.data ?? result;
                setTracks(Array.isArray(list) ? list : []);
                setTotalPages(1);
                setTotalTracks(list?.length || 0);
            }
        } catch (error) {
            console.error("Failed to fetch tracks:", error);
        } finally {
            setIsLoading(false);
        }
    }, [searchQuery, selectedFilter, page]);

    const fetchSidebar = useCallback(async () => {
        try {
            const [cats, srs, counts] = await Promise.all([
                fetchClient("/music-categories"),
                fetchClient("/music-series"),
                fetchClient("/music/counts").catch(() => null),
            ]);
            setSidebarCategories(Array.isArray(cats) ? cats : []);
            setSidebarSeries(Array.isArray(srs) ? srs : []);
            if (counts) setServerCounts(counts);
        } catch {
            /* ignore */
        }
    }, []);

    // reset page to 1 when filter/search changes
    useEffect(() => {
        setPage(1);
    }, [searchQuery, selectedFilter]);

    useEffect(() => {
        fetchTracks();
    }, [fetchTracks]);

    useEffect(() => {
        fetchSidebar();
    }, [fetchSidebar]);

    /* ── Sidebar filter logic ── */

    const filteredTracks = tracks;

    /* ── Song counts ── */
    const songCountMap = (() => {
        const map: Record<string, number> = {};
        if (serverCounts) {
            map["all"] = serverCounts.total;
            serverCounts.byCategory?.forEach((c) => {
                map[`cat:${c.category}`] = c._count;
            });
            serverCounts.bySeries?.forEach((s) => {
                map[`series:${s.series}`] = s._count;
            });
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

    const handleDownload = (track: MusicTrack) => {
        if (!track.fileUrl) return;
        const safeTitle = track.title.replace(/[\\/:*?"<>|]+/g, "-").trim() || "music";
        const link = document.createElement("a");
        link.href = track.fileUrl;
        link.download = `${safeTitle}.mp3`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        link.remove();
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

        setTracks(newTracks);

        try {
            await fetchClient("/music/reorder/batch", {
                method: "PATCH",
                body: JSON.stringify({
                    ids: newTracks.map((t) => t.id),
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
                                className={`transition-colors ${active ? "text-amber-600" : "text-gray-400"
                                    }`}
                            >
                                {item.icon}
                            </span>
                            <span className="text-sm truncate flex-1 text-left">{item.name}</span>
                            {count > 0 && (
                                <span className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-full ${active ? "text-amber-600 bg-amber-100" : "text-gray-400 bg-gray-100/80"}`}>
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
        <div className="min-h-screen bg-gradient-to-br from-amber-50/60 via-orange-50/40 to-yellow-50/60">
            {/* 顶部工具栏 */}
            <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/60 sticky top-0 z-10">
                <div className="px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => router.push("/")}
                            >
                                <ArrowLeft className="h-4 w-4 mr-1" />
                                返回
                            </Button>
                            <h1 className="text-2xl font-bold text-gray-900">音乐管理</h1>
                            <span className="text-sm text-gray-500">
                                共 {totalTracks} 首
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
                            {process.env.NODE_ENV === "development" && (
                                <Button
                                    variant="outline"
                                    onClick={() => router.push("/music/youtube")}
                                >
                                    <Youtube className="h-4 w-4 mr-2" />
                                    YouTube 下载
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                onClick={() => router.push("/music/scores")}
                            >
                                <FileMusic className="h-4 w-4 mr-2" />
                                乐谱管理
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => router.push("/music/sidebar")}
                            >
                                <Settings className="h-4 w-4 mr-2" />
                                侧边栏管理
                            </Button>
                            <Button
                                onClick={() => router.push("/music/upload")}
                                className="bg-amber-500 hover:bg-amber-600"
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
                                    <div className="w-8 h-8 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin mx-auto mb-3" />
                                    加载中...
                                </div>
                            ) : filteredTracks.length > 0 ? (
                                filteredTracks.map((track, index) => {
                                    const isDragOver = dragOverIndex === index;
                                    return (
                                        <div
                                            key={track.id}
                                            draggable={selectedFilter === "all" && !searchQuery.trim() && page === 1}
                                            onDragStart={() => handleDragStart(index)}
                                            onDragOver={(e) => handleDragOver(e, index)}
                                            onDragLeave={handleDragLeave}
                                            onDrop={() => handleDrop(index)}
                                            onDragEnd={handleDragEnd}
                                            className={`group grid grid-cols-[40px_40px_1fr_140px_120px_120px_70px_70px_40px] gap-3 px-4 py-3 transition-all border-b border-gray-100 hover:bg-amber-50/30 ${isDragOver
                                                ? "border-t-2 border-t-amber-400 bg-amber-50/40"
                                                : ""
                                                }`}
                                        >
                                            {/* Drag handle */}
                                            <div className={`flex items-center justify-center ${selectedFilter === "all" && !searchQuery.trim() && page === 1 ? "cursor-grab active:cursor-grabbing" : "opacity-30 cursor-not-allowed"}`}>
                                                <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                                            </div>

                                            {/* 播放按钮 */}
                                            <div className="flex items-center justify-center">
                                                <button
                                                    onClick={() => handlePlay(track.id)}
                                                    className="w-8 h-8 flex items-center justify-center bg-amber-100 hover:bg-amber-200 rounded-full transition-colors"
                                                >
                                                    {playingId === track.id ? (
                                                        <Pause className="w-4 h-4 text-amber-600" />
                                                    ) : (
                                                        <Play className="w-4 h-4 text-amber-600 ml-0.5" />
                                                    )}
                                                </button>
                                            </div>

                                            {/* 标题和演奏者 */}
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                    {(() => {
                                                        const cat = sidebarCategories.find((c) => c.name === track.category);
                                                        const CatIcon = getIconComponent(cat?.icon, Music);
                                                        return <CatIcon className="w-5 h-5 text-amber-600" />;
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
                                                <span className="text-xs px-2 py-1 bg-amber-50 text-amber-600 rounded-md">
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
                                                        <DropdownMenuItem onClick={() => {
                                                            router.push(`/music/split?trackId=${track.id}`);
                                                        }}>
                                                            <Scissors className="w-4 h-4 mr-2" />
                                                            分割
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => handleDownload(track)}>
                                                            <Download className="w-4 h-4 mr-2" />
                                                            下载
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

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="px-4 py-4 flex items-center justify-between border-t border-gray-100 bg-white">
                                <div className="text-sm text-gray-500">
                                    显示 {(page - 1) * 50 + 1} 到 {Math.min(page * 50, totalTracks)} 条，共 {totalTracks} 条
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                    >
                                        上一页
                                    </Button>
                                    <div className="flex items-center px-4 text-sm text-gray-600 font-medium">
                                        第 {page} / {totalPages} 页
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages}
                                    >
                                        下一页
                                    </Button>
                                </div>
                            </div>
                        )}
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
                                <Select
                                    value={editingTrack.category}
                                    onValueChange={(val) =>
                                        setEditingTrack({ ...editingTrack, category: val })
                                    }
                                >
                                    <SelectTrigger className="mt-1.5">
                                        <SelectValue placeholder="选择分类..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {sidebarCategories.map((cat) => (
                                            <SelectItem key={cat.id} value={cat.name}>
                                                {cat.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>系列</Label>
                                <Select
                                    value={editingTrack.series || "_none"}
                                    onValueChange={(val) =>
                                        setEditingTrack({
                                            ...editingTrack,
                                            series: val === "_none" ? null : val,
                                        })
                                    }
                                >
                                    <SelectTrigger className="mt-1.5">
                                        <SelectValue placeholder="选择系列..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="_none">无系列</SelectItem>
                                        {sidebarSeries.map((s) => (
                                            <SelectItem key={s.id} value={s.name}>
                                                {s.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
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
