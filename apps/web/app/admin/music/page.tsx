"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    Music,
    Play,
    Pause,
    MoreVertical,
    Edit,
    Trash2,
    Search,
    Filter,
    ArrowLeft,
    Upload,
    ChevronUp,
    ChevronDown,
    Settings,
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

export default function MusicManagePage() {
    const router = useRouter();
    const [tracks, setTracks] = useState<MusicTrack[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterCategory, setFilterCategory] = useState("all");
    const [categories, setCategories] = useState<string[]>([]);
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [editingTrack, setEditingTrack] = useState<MusicTrack | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const fetchTracks = useCallback(async () => {
        try {
            setIsLoading(true);
            const params = new URLSearchParams();
            if (searchQuery) params.set("search", searchQuery);
            if (filterCategory && filterCategory !== "all")
                params.set("category", filterCategory);
            const data = await fetchClient(`/music?${params.toString()}`);
            setTracks(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Failed to fetch tracks:", error);
        } finally {
            setIsLoading(false);
        }
    }, [searchQuery, filterCategory]);

    const fetchCategories = useCallback(async () => {
        try {
            const data = await fetchClient("/music/categories");
            setCategories(Array.isArray(data) ? data : []);
        } catch {
            setCategories([]);
        }
    }, []);

    useEffect(() => {
        fetchTracks();
    }, [fetchTracks]);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

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

    const handleMoveUp = async (index: number) => {
        if (index === 0) return;
        const newTracks = [...tracks];
        const a = newTracks[index]!;
        const b = newTracks[index - 1]!;
        newTracks[index - 1] = a;
        newTracks[index] = b;
        setTracks(newTracks);
        try {
            await fetchClient("/music/reorder/batch", {
                method: "PATCH",
                body: JSON.stringify({ ids: newTracks.map((t) => t.id) }),
            });
        } catch (error) {
            console.error("Failed to reorder:", error);
            fetchTracks();
        }
    };

    const handleMoveDown = async (index: number) => {
        if (index === tracks.length - 1) return;
        const newTracks = [...tracks];
        const a = newTracks[index]!;
        const b = newTracks[index + 1]!;
        newTracks[index] = b;
        newTracks[index + 1] = a;
        setTracks(newTracks);
        try {
            await fetchClient("/music/reorder/batch", {
                method: "PATCH",
                body: JSON.stringify({ ids: newTracks.map((t) => t.id) }),
            });
        } catch (error) {
            console.error("Failed to reorder:", error);
            fetchTracks();
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-cyan-50">
            {/* 顶部工具栏 */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-8 py-4">
                    <div className="flex items-center justify-between mb-4">
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
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-600">
                                共 {tracks.length} 首音乐
                            </span>
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

                    {/* 搜索和筛选 */}
                    <div className="flex items-center gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <Input
                                type="text"
                                placeholder="搜索音乐、艺术家、作曲家..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Select value={filterCategory} onValueChange={setFilterCategory}>
                            <SelectTrigger className="w-48">
                                <Filter className="w-4 h-4 mr-2" />
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部分类</SelectItem>
                                {categories.map((cat) => (
                                    <SelectItem key={cat} value={cat}>
                                        {cat}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* 音乐列表 */}
            <div className="max-w-7xl mx-auto p-8">
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                    {/* 表头 */}
                    <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-700">
                        <div className="w-16 text-center">#</div>
                        <div className="w-10"></div>
                        <div className="w-12"></div>
                        <div className="flex-1">标题 / 演奏者</div>
                        <div className="w-32">作曲家</div>
                        <div className="w-28">分类</div>
                        <div className="w-32">系列</div>
                        <div className="w-16 text-right">时长</div>
                        <div className="w-20 text-right">大小</div>
                        <div className="w-10"></div>
                    </div>

                    {/* 列表 */}
                    <div>
                        {isLoading ? (
                            <div className="py-16 text-center text-gray-500">
                                <div className="w-8 h-8 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin mx-auto mb-3" />
                                加载中...
                            </div>
                        ) : tracks.length > 0 ? (
                            tracks.map((track, index) => (
                                <div
                                    key={track.id}
                                    className="group flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100"
                                >
                                    {/* 排序按钮 + 序号 */}
                                    <div className="w-16 flex items-center justify-center gap-1">
                                        <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleMoveUp(index)}
                                                className="p-0.5 hover:bg-gray-200 rounded"
                                                disabled={index === 0}
                                            >
                                                <ChevronUp className="w-3 h-3 text-gray-500" />
                                            </button>
                                            <button
                                                onClick={() => handleMoveDown(index)}
                                                className="p-0.5 hover:bg-gray-200 rounded"
                                                disabled={index === tracks.length - 1}
                                            >
                                                <ChevronDown className="w-3 h-3 text-gray-500" />
                                            </button>
                                        </div>
                                        <span className="text-sm text-gray-500 font-medium">
                                            {index + 1}
                                        </span>
                                    </div>

                                    {/* 播放按钮 */}
                                    <button
                                        onClick={() => handlePlay(track.id)}
                                        className="w-10 h-10 flex items-center justify-center bg-purple-100 hover:bg-purple-200 rounded-full transition-colors"
                                    >
                                        {playingId === track.id ? (
                                            <Pause className="w-5 h-5 text-purple-600" />
                                        ) : (
                                            <Play className="w-5 h-5 text-purple-600 ml-0.5" />
                                        )}
                                    </button>

                                    {/* 封面 */}
                                    <div className="w-12 h-12 bg-gradient-to-br from-purple-200 to-pink-200 rounded flex items-center justify-center flex-shrink-0">
                                        {track.coverUrl ? (
                                            <img
                                                src={track.coverUrl}
                                                alt={track.title}
                                                className="w-full h-full object-cover rounded"
                                            />
                                        ) : (
                                            <Music className="w-6 h-6 text-purple-600" />
                                        )}
                                    </div>

                                    {/* 标题和艺术家 */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-medium text-gray-900 truncate">
                                            {track.title}
                                        </h3>
                                        <p className="text-sm text-gray-500 truncate">
                                            {track.performer}
                                        </p>
                                    </div>

                                    {/* 作曲家 */}
                                    <div className="w-32 text-sm text-gray-600 truncate">
                                        {track.musician}
                                    </div>

                                    {/* 分类 */}
                                    <div className="w-28 text-sm text-gray-600 truncate">
                                        {track.category}
                                    </div>

                                    {/* 系列 */}
                                    <div className="w-32 text-sm text-gray-500 truncate">
                                        {track.series || "-"}
                                    </div>

                                    {/* 时长 */}
                                    <div className="w-16 text-sm text-gray-500 text-right">
                                        {formatDuration(track.duration)}
                                    </div>

                                    {/* 文件大小 */}
                                    <div className="w-20 text-sm text-gray-500 text-right">
                                        {formatFileSize(track.fileSize)}
                                    </div>

                                    {/* 操作菜单 */}
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button className="p-2 hover:bg-gray-200 rounded transition-colors opacity-0 group-hover:opacity-100">
                                                <MoreVertical className="w-5 h-5 text-gray-600" />
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
                            ))
                        ) : (
                            <div className="py-16 text-center text-gray-500">
                                <Music className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                <p>还没有音乐，点击上方"上传音乐"添加</p>
                            </div>
                        )}
                    </div>
                </div>
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
