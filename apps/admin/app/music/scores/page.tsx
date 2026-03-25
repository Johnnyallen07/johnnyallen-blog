"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowLeft,
    Upload,
    Edit,
    Trash2,
    FileText,
    Music,
    Search,
    MoreVertical,
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

/* ── Types ── */

interface MusicScore {
    id: string;
    title: string;
    composer: string;
    instrument: string;
    fileKey: string;
    fileUrl: string;
    fileSize: number;
    pageCount: number;
    coverUrl: string | null;
    order: number;
    createdAt: string;
}

const INSTRUMENTS = [
    { value: "all", label: "全部" },
    { value: "小提琴", label: "小提琴" },
    { value: "钢琴", label: "钢琴" },
];

/* ── Helpers ── */

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/* ── Page ── */

export default function ScoresManagePage() {
    const router = useRouter();
    const [scores, setScores] = useState<MusicScore[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterInstrument, setFilterInstrument] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");

    /* ── Upload dialog ── */
    const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadForm, setUploadForm] = useState({
        title: "",
        composer: "",
        instrument: "小提琴",
    });
    const [isUploading, setIsUploading] = useState(false);

    /* ── Edit dialog ── */
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingScore, setEditingScore] = useState<MusicScore | null>(null);

    /* ── Data fetching ── */

    const fetchScores = useCallback(async () => {
        try {
            setIsLoading(true);
            const params = new URLSearchParams();
            if (filterInstrument !== "all") {
                params.set("instrument", filterInstrument);
            }
            const result = await fetchClient(
                `/music-scores${params.toString() ? `?${params.toString()}` : ""}`
            );
            const list = Array.isArray(result) ? result : [];
            setScores(
                searchQuery
                    ? list.filter(
                          (s: MusicScore) =>
                              s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              s.composer.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                    : list
            );
        } catch (error) {
            console.error("Failed to fetch scores:", error);
        } finally {
            setIsLoading(false);
        }
    }, [filterInstrument, searchQuery]);

    useEffect(() => {
        fetchScores();
    }, [fetchScores]);

    /* ── Upload handler ── */

    const handleUpload = async () => {
        if (!uploadFile || !uploadForm.title || !uploadForm.composer) return;

        try {
            setIsUploading(true);

            // 1. Get presigned upload URL
            const { uploadUrl, key, publicUrl } = await fetchClient(
                "/music-scores/upload-url",
                {
                    method: "POST",
                    body: JSON.stringify({ fileName: uploadFile.name }),
                }
            );

            // 2. Upload PDF to COS
            await fetch(uploadUrl, {
                method: "PUT",
                body: uploadFile,
                headers: { "Content-Type": "application/pdf" },
            });

            // 3. Get page count using PDF.js (optional — try/catch)
            let pageCount = 0;
            try {
                const pdfjsLib = await import("pdfjs-dist");
                pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
                const arrayBuffer = await uploadFile.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                pageCount = pdf.numPages;
            } catch {
                console.warn("Could not extract page count from PDF");
            }

            // 4. Save to database
            await fetchClient("/music-scores", {
                method: "POST",
                body: JSON.stringify({
                    title: uploadForm.title,
                    composer: uploadForm.composer,
                    instrument: uploadForm.instrument,
                    fileKey: key,
                    fileUrl: publicUrl,
                    fileSize: uploadFile.size,
                    pageCount,
                }),
            });

            setIsUploadDialogOpen(false);
            setUploadFile(null);
            setUploadForm({ title: "", composer: "", instrument: "小提琴" });
            fetchScores();
        } catch (error) {
            console.error("Upload failed:", error);
            alert("上传失败，请重试");
        } finally {
            setIsUploading(false);
        }
    };

    /* ── Edit handler ── */

    const handleEdit = (score: MusicScore) => {
        setEditingScore({ ...score });
        setIsEditDialogOpen(true);
    };

    const handleSaveEdit = async () => {
        if (!editingScore) return;
        try {
            await fetchClient(`/music-scores/${editingScore.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    title: editingScore.title,
                    composer: editingScore.composer,
                    instrument: editingScore.instrument,
                }),
            });
            setIsEditDialogOpen(false);
            setEditingScore(null);
            fetchScores();
        } catch (error) {
            console.error("Failed to save:", error);
        }
    };

    /* ── Delete handler ── */

    const handleDelete = async (id: string) => {
        if (!window.confirm("确定要删除这个乐谱吗？PDF 文件也会从云端删除。")) return;
        try {
            await fetchClient(`/music-scores/${id}`, { method: "DELETE" });
            fetchScores();
        } catch (error) {
            console.error("Failed to delete:", error);
        }
    };

    /* ── Render ── */

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-cyan-50">
            {/* 顶部 */}
            <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/60 sticky top-0 z-10">
                <div className="px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => router.push("/music")}
                            >
                                <ArrowLeft className="h-4 w-4 mr-1" />
                                返回
                            </Button>
                            <h1 className="text-2xl font-bold text-gray-900">
                                乐谱管理
                            </h1>
                            <span className="text-sm text-gray-500">
                                共 {scores.length} 份
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="relative w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <Input
                                    type="text"
                                    placeholder="搜索乐谱、作曲家..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 bg-white/60 border-gray-200/60"
                                />
                            </div>
                            {/* 乐器筛选 */}
                            <div className="flex bg-white/60 rounded-lg border border-gray-200/60 p-0.5">
                                {INSTRUMENTS.map((inst) => (
                                    <button
                                        key={inst.value}
                                        onClick={() => setFilterInstrument(inst.value)}
                                        className={`px-3 py-1.5 rounded-md text-sm transition-all ${
                                            filterInstrument === inst.value
                                                ? "bg-purple-500 text-white shadow-sm"
                                                : "text-gray-600 hover:text-gray-900"
                                        }`}
                                    >
                                        {inst.label}
                                    </button>
                                ))}
                            </div>
                            <Button
                                onClick={() => setIsUploadDialogOpen(true)}
                                className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
                            >
                                <Upload className="h-4 w-4 mr-2" />
                                上传乐谱
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* 列表 */}
            <div className="p-6">
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                    {/* 表头 */}
                    <div className="grid grid-cols-[1fr_160px_100px_80px_80px_40px] gap-3 px-4 py-3 bg-gray-50/80 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <div>标题 / 作曲家</div>
                        <div>乐器</div>
                        <div className="text-right">页数</div>
                        <div className="text-right">大小</div>
                        <div className="text-right">日期</div>
                        <div></div>
                    </div>

                    {isLoading ? (
                        <div className="py-16 text-center text-gray-500">
                            <div className="w-8 h-8 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin mx-auto mb-3" />
                            加载中...
                        </div>
                    ) : scores.length > 0 ? (
                        scores.map((score) => (
                            <div
                                key={score.id}
                                className="group grid grid-cols-[1fr_160px_100px_80px_80px_40px] gap-3 px-4 py-3 border-b border-gray-100 hover:bg-purple-50/30 transition-all"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 bg-gradient-to-br from-amber-100 to-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <FileText className="w-5 h-5 text-amber-600" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-medium text-gray-900 text-sm leading-tight truncate">
                                            {score.title}
                                        </h3>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {score.composer}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center">
                                    <span className="text-xs px-2 py-1 bg-purple-50 text-purple-600 rounded-md">
                                        {score.instrument}
                                    </span>
                                </div>

                                <div className="flex items-center justify-end text-sm text-gray-500 tabular-nums">
                                    {score.pageCount} 页
                                </div>

                                <div className="flex items-center justify-end text-sm text-gray-400 tabular-nums">
                                    {formatFileSize(score.fileSize)}
                                </div>

                                <div className="flex items-center justify-end text-xs text-gray-400">
                                    {new Date(score.createdAt).toLocaleDateString("zh-CN", {
                                        month: "short",
                                        day: "numeric",
                                    })}
                                </div>

                                <div className="flex items-center justify-center">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                                                <MoreVertical className="w-4 h-4 text-gray-500" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem
                                                onClick={() => window.open(score.fileUrl, "_blank")}
                                            >
                                                <FileText className="w-4 h-4 mr-2" />
                                                预览 PDF
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleEdit(score)}>
                                                <Edit className="w-4 h-4 mr-2" />
                                                编辑
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() => handleDelete(score.id)}
                                                className="text-red-600"
                                            >
                                                <Trash2 className="w-4 h-4 mr-2" />
                                                删除
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="py-16 text-center text-gray-500">
                            <Music className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                            <p>{searchQuery ? "没有找到匹配的乐谱" : "暂无乐谱"}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* 上传对话框 */}
            <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>上传乐谱</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>PDF 文件</Label>
                            <div className="mt-1.5">
                                <input
                                    type="file"
                                    accept=".pdf"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0] || null;
                                        setUploadFile(file);
                                        if (file && !uploadForm.title) {
                                            setUploadForm((prev) => ({
                                                ...prev,
                                                title: file.name.replace(/\.pdf$/i, ""),
                                            }));
                                        }
                                    }}
                                    className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-50 file:text-purple-600 file:font-medium hover:file:bg-purple-100 file:cursor-pointer"
                                />
                            </div>
                            {uploadFile && (
                                <p className="text-xs text-gray-400 mt-1">
                                    {formatFileSize(uploadFile.size)}
                                </p>
                            )}
                        </div>
                        <div>
                            <Label>标题</Label>
                            <Input
                                value={uploadForm.title}
                                onChange={(e) =>
                                    setUploadForm({ ...uploadForm, title: e.target.value })
                                }
                                placeholder="例：Salut d'Amour Op 12"
                                className="mt-1.5"
                            />
                        </div>
                        <div>
                            <Label>作曲家</Label>
                            <Input
                                value={uploadForm.composer}
                                onChange={(e) =>
                                    setUploadForm({ ...uploadForm, composer: e.target.value })
                                }
                                placeholder="例：Edward Elgar"
                                className="mt-1.5"
                            />
                        </div>
                        <div>
                            <Label>乐器</Label>
                            <Select
                                value={uploadForm.instrument}
                                onValueChange={(val) =>
                                    setUploadForm({ ...uploadForm, instrument: val })
                                }
                            >
                                <SelectTrigger className="mt-1.5">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="小提琴">小提琴</SelectItem>
                                    <SelectItem value="钢琴">钢琴</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsUploadDialogOpen(false)}
                            disabled={isUploading}
                        >
                            取消
                        </Button>
                        <Button
                            onClick={handleUpload}
                            disabled={!uploadFile || !uploadForm.title || !uploadForm.composer || isUploading}
                        >
                            {isUploading ? "上传中..." : "上传"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 编辑对话框 */}
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>编辑乐谱信息</DialogTitle>
                    </DialogHeader>
                    {editingScore && (
                        <div className="space-y-4">
                            <div>
                                <Label>标题</Label>
                                <Input
                                    value={editingScore.title}
                                    onChange={(e) =>
                                        setEditingScore({
                                            ...editingScore,
                                            title: e.target.value,
                                        })
                                    }
                                    className="mt-1.5"
                                />
                            </div>
                            <div>
                                <Label>作曲家</Label>
                                <Input
                                    value={editingScore.composer}
                                    onChange={(e) =>
                                        setEditingScore({
                                            ...editingScore,
                                            composer: e.target.value,
                                        })
                                    }
                                    className="mt-1.5"
                                />
                            </div>
                            <div>
                                <Label>乐器</Label>
                                <Select
                                    value={editingScore.instrument}
                                    onValueChange={(val) =>
                                        setEditingScore({
                                            ...editingScore,
                                            instrument: val,
                                        })
                                    }
                                >
                                    <SelectTrigger className="mt-1.5">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="小提琴">小提琴</SelectItem>
                                        <SelectItem value="钢琴">钢琴</SelectItem>
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
