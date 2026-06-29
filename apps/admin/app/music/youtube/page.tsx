"use client";

import { useState, useEffect, useCallback, useRef, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowLeft,
    Youtube,
    Loader2,
    CheckCircle2,
    AlertCircle,
    Plus,
    X,
    Pencil,
    KeyRound,
    Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { fetchClient } from "@/lib/api";

/* ── Types ── */

interface SidebarEntity { id: string; name: string; slug: string; }

interface TaskProgress {
    status: "fetching_info" | "downloading" | "converting" | "done" | "error";
    progress: number;
    title: string;
    error?: string;
    fileSize?: number;
    duration?: number;
}

type ItemStatus = "queued" | "downloading" | "downloaded" | "uploading" | "saved" | "error";

interface QueueItem {
    id: string;
    url: string;
    taskId: string | null;
    title: string;
    editedTitle: string;
    status: ItemStatus;
    progress: number;
    statusLabel: string;
    error: string;
    fileSize: number;
    duration: number;
}

/* ── Helpers ── */

function isYoutubeUrl(url: string): boolean {
    return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url.trim());
}

function formatDuration(seconds: number): string {
    if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

const DL_STATUS_LABELS: Record<string, string> = {
    fetching_info: "获取视频信息...",
    downloading: "下载音频中...",
    converting: "转换为 MP3...",
    done: "下载完成",
    error: "下载失败",
};

/* ── Page ── */

export default function YoutubeDownloadPage() {
    const router = useRouter();

    const [urlInput, setUrlInput] = useState("");
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const pollingTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
    const isProcessing = useRef(false);
    const isUploading = useRef<Set<string>>(new Set());

    // Shared metadata
    const [musician, setMusician] = useState("");
    const [performer, setPerformer] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [seriesId, setSeriesId] = useState("");

    const [categories, setCategories] = useState<SidebarEntity[]>([]);
    const [seriesList, setSeriesList] = useState<SidebarEntity[]>([]);
    const [cookieDialogOpen, setCookieDialogOpen] = useState(false);
    const [cookieText, setCookieText] = useState("");
    const [cookieFileName, setCookieFileName] = useState("");
    const [cookieStatus, setCookieStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
    const [isUpdatingCookie, setIsUpdatingCookie] = useState(false);

    // Refs for metadata so auto-upload closure always reads latest values
    const metaRef = useRef({ musician: "", performer: "", categoryId: "", seriesId: "" });
    useEffect(() => {
        metaRef.current = { musician, performer, categoryId, seriesId };
    }, [musician, performer, categoryId, seriesId]);

    const categoriesRef = useRef<SidebarEntity[]>([]);
    const seriesListRef = useRef<SidebarEntity[]>([]);
    useEffect(() => { categoriesRef.current = categories; }, [categories]);
    useEffect(() => { seriesListRef.current = seriesList; }, [seriesList]);

    const fetchDropdowns = useCallback(async () => {
        try {
            const [cats, srs] = await Promise.all([
                fetchClient("/music-categories"),
                fetchClient("/music-series"),
            ]);
            setCategories(Array.isArray(cats) ? cats : []);
            setSeriesList(Array.isArray(srs) ? srs : []);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => { fetchDropdowns(); }, [fetchDropdowns]);
    useEffect(() => {
        const timers = pollingTimers.current;
        return () => { timers.forEach((timer) => clearInterval(timer)); };
    }, []);

    const handleCookieFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setCookieStatus(null);
        setCookieFileName(file.name);
        setCookieText(await file.text());
    };

    const updateYoutubeCookies = async () => {
        const cookies = cookieText.trim();
        if (!cookies) return;

        setIsUpdatingCookie(true);
        setCookieStatus(null);
        try {
            const result = await fetchClient("/music/youtube-cookies", {
                method: "POST",
                body: JSON.stringify({ cookies }),
            }) as { bytes?: number; updatedAt?: string };

            const size = typeof result.bytes === "number" ? `${result.bytes} bytes` : "已保存";
            setCookieStatus({ type: "success", message: `Cookie 已更新：${size}` });
            setCookieText("");
            setCookieFileName("");
        } catch (error) {
            setCookieStatus({
                type: "error",
                message: error instanceof Error ? error.message : "Cookie 更新失败",
            });
        } finally {
            setIsUpdatingCookie(false);
        }
    };

    /* ── Add URLs ── */

    const addUrls = () => {
        const rawInput = urlInput.trim();
        if (!rawInput) return;
        const urls = rawInput.split(/[\n\r]+/).map((u) => u.trim()).filter((u) => u && isYoutubeUrl(u));
        if (urls.length === 0) return;

        const existingUrls = new Set(queue.map((q) => q.url));
        const newItems: QueueItem[] = urls
            .filter((u) => !existingUrls.has(u))
            .map((url) => ({
                id: crypto.randomUUID(), url, taskId: null,
                title: "", editedTitle: "",
                status: "queued" as const, progress: 0,
                statusLabel: "等待下载", error: "",
                fileSize: 0, duration: 0,
            }));
        if (newItems.length === 0) return;
        setQueue((prev) => [...prev, ...newItems]);
        setUrlInput("");
    };

    const removeFromQueue = (id: string) => {
        const item = queue.find((q) => q.id === id);
        if (item?.taskId) {
            fetchClient(`/music/youtube-download/${item.taskId}`, { method: "DELETE" }).catch(() => { });
        }
        setQueue((prev) => prev.filter((q) => q.id !== id));
        const timer = pollingTimers.current.get(id);
        if (timer) { clearInterval(timer); pollingTimers.current.delete(id); }
    };

    const updateTitle = (id: string, newTitle: string) => {
        setQueue((prev) => prev.map((q) => q.id === id ? { ...q, editedTitle: newTitle } : q));
    };

    /* ── Auto-upload+save a downloaded item ── */

    const uploadAndSaveItem = useCallback(async (item: QueueItem) => {
        if (!item.taskId || isUploading.current.has(item.id)) return;
        isUploading.current.add(item.id);

        const meta = metaRef.current;
        const catName = categoriesRef.current.find((c) => c.id === meta.categoryId)?.name || "";
        const seriesName = seriesListRef.current.find((s) => s.id === meta.seriesId)?.name || "";

        if (!meta.musician || !meta.performer || !catName) {
            // Metadata not ready yet — skip, will retry via effect
            isUploading.current.delete(item.id);
            return;
        }

        // Mark as uploading
        setQueue((prev) => prev.map((q) =>
            q.id === item.id ? { ...q, status: "uploading" as const, statusLabel: "上传到云端..." } : q
        ));

        try {
            await fetchClient(`/music/youtube-upload/${item.taskId}/save`, {
                method: "POST",
                body: JSON.stringify({
                    title: item.editedTitle || item.title,
                    musician: meta.musician,
                    performer: meta.performer,
                    category: catName,
                    series: seriesName || undefined,
                }),
            });

            setQueue((prev) => prev.map((q) =>
                q.id === item.id ? { ...q, status: "saved" as const, statusLabel: "已保存" } : q
            ));
        } catch (error) {
            setQueue((prev) => prev.map((q) =>
                q.id === item.id ? {
                    ...q, status: "error" as const,
                    statusLabel: "上传失败",
                    error: error instanceof Error ? error.message : "上传/保存失败",
                } : q
            ));
        } finally {
            isUploading.current.delete(item.id);
        }
    }, []);

    /* ── Auto-trigger upload for downloaded items when metadata is ready ── */

    useEffect(() => {
        const meta = metaRef.current;
        const catName = categories.find((c) => c.id === meta.categoryId)?.name || "";
        if (!meta.musician || !meta.performer || !catName) return;

        const readyItems = queue.filter(
            (q) => q.status === "downloaded" && q.taskId && !isUploading.current.has(q.id)
        );
        for (const item of readyItems) {
            uploadAndSaveItem(item);
        }
    }, [queue, musician, performer, categoryId, categories, uploadAndSaveItem]);

    /* ── Process download queue (one at a time) ── */

    const processQueue = useCallback(async () => {
        if (isProcessing.current) return;
        isProcessing.current = true;

        const nextItem = queue.find((q) => q.status === "queued");
        if (!nextItem) { isProcessing.current = false; return; }

        try {
            const data = await fetchClient("/music/youtube-download", {
                method: "POST", body: JSON.stringify({ url: nextItem.url }),
            });
            const taskId = data.taskId as string;

            setQueue((prev) => prev.map((q) =>
                q.id === nextItem.id ? { ...q, taskId, status: "downloading" as const, statusLabel: "获取视频信息...", progress: 0 } : q
            ));

            const timer = setInterval(async () => {
                try {
                    const progress = (await fetchClient(`/music/youtube-download/${taskId}`)) as TaskProgress;
                    setQueue((prev) => prev.map((q) => {
                        if (q.id !== nextItem.id) return q;

                        if (progress.status === "done") {
                            clearInterval(timer);
                            pollingTimers.current.delete(nextItem.id);
                            isProcessing.current = false;
                            return {
                                ...q, status: "downloaded" as const, progress: 100,
                                statusLabel: "下载完成，准备上传...",
                                title: progress.title,
                                editedTitle: q.editedTitle || progress.title,
                                fileSize: progress.fileSize ?? 0,
                                duration: progress.duration ?? 0,
                            };
                        }

                        if (progress.status === "error") {
                            clearInterval(timer);
                            pollingTimers.current.delete(nextItem.id);
                            isProcessing.current = false;
                            return { ...q, status: "error" as const, progress: 0, statusLabel: "下载失败", error: progress.error || "下载失败" };
                        }

                        return {
                            ...q, progress: progress.progress,
                            statusLabel: DL_STATUS_LABELS[progress.status] || "处理中...",
                            title: progress.title || q.title,
                            editedTitle: q.editedTitle || progress.title || "",
                        };
                    }));
                } catch { /* polling error, will retry */ }
            }, 800);

            pollingTimers.current.set(nextItem.id, timer);
        } catch (error) {
            setQueue((prev) => prev.map((q) =>
                q.id === nextItem.id ? { ...q, status: "error" as const, error: error instanceof Error ? error.message : "启动下载失败", statusLabel: "失败" } : q
            ));
            isProcessing.current = false;
        }
    }, [queue]);

    useEffect(() => {
        const hasQueued = queue.some((q) => q.status === "queued");
        const hasActive = queue.some((q) => q.status === "downloading");
        if (hasQueued && !hasActive && !isProcessing.current) { processQueue(); }
    }, [queue, processQueue]);

    const retryItem = (id: string) => {
        setQueue((prev) => prev.map((q) =>
            q.id === id ? { ...q, status: "queued" as const, taskId: null, progress: 0, error: "", statusLabel: "等待下载" } : q
        ));
    };

    /* ── Stats ── */

    const savedCount = queue.filter((q) => q.status === "saved").length;
    const downloadingCount = queue.filter((q) => q.status === "downloading").length;
    const uploadingCount = queue.filter((q) => q.status === "uploading").length;
    const errorCount = queue.filter((q) => q.status === "error").length;
    const allDone = queue.length > 0 && savedCount === queue.length;

    const overallProgress = queue.length > 0
        ? Math.round(queue.reduce((sum, q) => sum + (q.status === "saved" ? 100 : q.status === "uploading" ? 95 : q.status === "downloaded" ? 90 : q.progress * 0.9), 0) / queue.length)
        : 0;

    const metaReady = !!(musician && performer && categoryId);

    /* ── Render helpers ── */

    const statusIcon = (item: QueueItem) => {
        switch (item.status) {
            case "saved": return <CheckCircle2 className="h-5 w-5 text-green-500" />;
            case "uploading": return <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />;
            case "downloaded": return metaReady
                ? <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
                : <CheckCircle2 className="h-5 w-5 text-amber-500" />;
            case "error": return <AlertCircle className="h-5 w-5 text-red-500" />;
            case "downloading": return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
            default: return <span className="text-sm text-gray-400 w-5 text-center block">·</span>;
        }
    };

    const statusColor = (status: ItemStatus) => {
        switch (status) {
            case "saved": return "bg-green-50/60 border-green-200";
            case "uploading": return "bg-amber-50/40 border-amber-200";
            case "downloaded": return metaReady ? "bg-amber-50/40 border-amber-200" : "bg-amber-50/40 border-amber-200";
            case "error": return "bg-red-50/60 border-red-200";
            case "downloading": return "bg-blue-50/50 border-blue-200";
            default: return "bg-gray-50/50 border-gray-100";
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-amber-50/60 via-orange-50/40 to-yellow-50/60">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-8 py-4 flex items-center justify-between">
                    <Button variant="ghost" size="sm" onClick={() => router.push("/music")}>
                        <ArrowLeft className="h-4 w-4 mr-1" /> 返回音乐管理
                    </Button>
                    <div className="flex items-center gap-3">
                        {queue.length > 0 && (
                            <div className="text-sm text-gray-500">
                                {savedCount}/{queue.length} 已完成
                                {downloadingCount > 0 && ` · ${downloadingCount} 下载中`}
                                {uploadingCount > 0 && ` · ${uploadingCount} 上传中`}
                                {errorCount > 0 && <span className="text-red-500"> · {errorCount} 失败</span>}
                            </div>
                        )}
                        <Dialog open={cookieDialogOpen} onOpenChange={setCookieDialogOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <KeyRound className="h-4 w-4 mr-1" />
                                    更新 Cookie
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                                <DialogHeader>
                                    <DialogTitle>更新 YouTube Cookie</DialogTitle>
                                    <DialogDescription>
                                        选择新导出的 cookies.txt，或粘贴 Netscape 格式内容。
                                    </DialogDescription>
                                </DialogHeader>

                                <div className="space-y-4">
                                    <div>
                                        <Label htmlFor="youtube-cookie-file">cookies.txt</Label>
                                        <Input
                                            id="youtube-cookie-file"
                                            type="file"
                                            accept=".txt,text/plain"
                                            onChange={handleCookieFileChange}
                                            className="mt-1.5"
                                        />
                                        {cookieFileName && (
                                            <p className="mt-1 text-xs text-gray-500">{cookieFileName}</p>
                                        )}
                                    </div>
                                    <div>
                                        <Label htmlFor="youtube-cookie-text">Cookie 内容</Label>
                                        <Textarea
                                            id="youtube-cookie-text"
                                            value={cookieText}
                                            onChange={(event) => {
                                                setCookieText(event.target.value);
                                                setCookieStatus(null);
                                            }}
                                            rows={9}
                                            spellCheck={false}
                                            className="mt-1.5 h-48 max-h-72 resize-y overflow-auto font-mono text-xs [field-sizing:fixed]"
                                            placeholder="# Netscape HTTP Cookie File"
                                        />
                                    </div>
                                    {cookieStatus && (
                                        <div className={`rounded-md px-3 py-2 text-sm ${cookieStatus.type === "success"
                                            ? "bg-green-50 text-green-700"
                                            : "bg-red-50 text-red-700"
                                            }`}>
                                            {cookieStatus.message}
                                        </div>
                                    )}
                                </div>

                                <DialogFooter>
                                    <Button
                                        variant="outline"
                                        onClick={() => setCookieDialogOpen(false)}
                                        disabled={isUpdatingCookie}
                                    >
                                        关闭
                                    </Button>
                                    <Button
                                        onClick={updateYoutubeCookies}
                                        disabled={!cookieText.trim() || isUpdatingCookie}
                                        className="bg-red-600 hover:bg-red-700"
                                    >
                                        {isUpdatingCookie ? (
                                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                        ) : (
                                            <Upload className="h-4 w-4 mr-1" />
                                        )}
                                        保存 Cookie
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto p-8">
                {/* Title */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl mb-4 shadow-lg">
                        <Youtube className="h-8 w-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900">YouTube 批量下载</h1>
                    <p className="text-gray-500 mt-2">粘贴链接 → 填写公共属性 → 自动下载、上传并保存到数据库</p>
                </div>

                {/* Step 1: Add URLs */}
                <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-red-100 text-red-600 rounded-full text-xs font-bold">1</span>
                            添加 YouTube 链接
                        </h2>
                        <span className="text-xs text-gray-400">支持多行粘贴</span>
                    </div>
                    <div className="space-y-3">
                        <textarea
                            placeholder={"粘贴一个或多个 YouTube 链接（每行一个）：\nhttps://www.youtube.com/watch?v=...\nhttps://www.youtube.com/watch?v=..."}
                            value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
                            rows={3}
                            className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition-all placeholder:text-gray-400"
                        />
                        <Button onClick={addUrls} disabled={!urlInput.trim()} className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700">
                            <Plus className="h-4 w-4 mr-1" /> 添加到队列
                        </Button>
                    </div>
                </div>

                {/* Step 2: Shared metadata */}
                {queue.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-amber-100 text-amber-600 rounded-full text-xs font-bold">2</span>
                            公共属性
                        </h2>
                        <p className="text-xs text-gray-400 mb-4 ml-8">
                            填写后，已下载的曲目会自动上传并保存到数据库
                        </p>
                        {!metaReady && queue.some((q) => q.status === "downloaded") && (
                            <div className="bg-amber-50 rounded-lg p-3 mb-4 ml-8">
                                <p className="text-xs text-amber-700">⚠ 请填写作曲家、演奏者和分类，已下载的曲目将自动上传保存</p>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-sm">Musician / Composer *</Label>
                                <Input placeholder="例如 Beethoven" value={musician} onChange={(e) => setMusician(e.target.value)} className="mt-1.5" />
                            </div>
                            <div>
                                <Label className="text-sm">Performer / 演奏者 *</Label>
                                <Input placeholder="输入演奏者名称..." value={performer} onChange={(e) => setPerformer(e.target.value)} className="mt-1.5" />
                            </div>
                            <div>
                                <Label className="text-sm">Category / 分类 *</Label>
                                <Select value={categoryId} onValueChange={setCategoryId}>
                                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="选择分类..." /></SelectTrigger>
                                    <SelectContent>
                                        {categories.length === 0
                                            ? <SelectItem value="_none" disabled>暂无分类</SelectItem>
                                            : categories.map((cat) => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)
                                        }
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-sm">Series / 系列 (可选)</Label>
                                <Select value={seriesId} onValueChange={setSeriesId}>
                                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="选择系列..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="_none">无系列</SelectItem>
                                        {seriesList.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 3: Download queue */}
                {queue.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-600 rounded-full text-xs font-bold">3</span>
                                下载进度
                                <span className="text-sm font-normal text-gray-400">({queue.length} 首)</span>
                            </h2>
                        </div>

                        {/* Overall progress */}
                        {queue.length > 0 && (
                            <div className="mb-4 pb-4 border-b border-gray-100">
                                <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                                    <span>整体进度</span>
                                    <span>{overallProgress}%</span>
                                </div>
                                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-blue-400 via-amber-500 to-green-500 rounded-full transition-all duration-500"
                                        style={{ width: `${overallProgress}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Queue items */}
                        <div className="space-y-3">
                            {queue.map((item) => (
                                <div key={item.id} className={`p-4 rounded-lg border transition-all ${statusColor(item.status)}`}>
                                    <div className="flex items-start gap-3">
                                        <span className="mt-1 flex-shrink-0">{statusIcon(item)}</span>
                                        <div className="flex-1 min-w-0">
                                            {/* Title: editable only while downloading/downloaded */}
                                            {(item.status === "downloaded" || item.status === "downloading") && item.title ? (
                                                <div className="flex items-center gap-2">
                                                    <Pencil className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                                    <input
                                                        type="text" value={item.editedTitle}
                                                        onChange={(e) => updateTitle(item.id, e.target.value)}
                                                        className="text-sm font-medium text-gray-900 bg-transparent border-b border-dashed border-gray-300 focus:border-amber-400 focus:outline-none w-full py-0.5"
                                                    />
                                                </div>
                                            ) : (
                                                <p className="text-sm font-medium text-gray-900 truncate">
                                                    {item.editedTitle || item.title || item.url.replace(/^https?:\/\/(www\.)?/, "")}
                                                </p>
                                            )}

                                            {/* Status line */}
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className={`text-xs ${item.status === "saved" ? "text-green-600"
                                                    : item.status === "error" ? "text-red-600"
                                                        : item.status === "uploading" ? "text-amber-600"
                                                            : item.status === "downloading" ? "text-blue-600"
                                                                : item.status === "downloaded" ? (metaReady ? "text-amber-600" : "text-amber-600")
                                                                    : "text-gray-400"
                                                    }`}>
                                                    {item.status === "downloaded" && !metaReady ? "等待填写公共属性..." : item.statusLabel}
                                                </span>
                                                {(item.status === "saved" || item.status === "downloaded") && item.duration > 0 && (
                                                    <span className="text-xs text-gray-400">
                                                        {formatDuration(item.duration)} · {formatFileSize(item.fileSize)}
                                                    </span>
                                                )}
                                                {item.status === "error" && item.error && (
                                                    <span className="text-xs text-red-400 truncate max-w-xs">{item.error}</span>
                                                )}
                                            </div>

                                            {/* Progress bar */}
                                            {item.status === "downloading" && (
                                                <div className="mt-2 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all duration-500" style={{ width: `${item.progress}%` }} />
                                                </div>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            {item.status === "error" && (
                                                <Button variant="ghost" size="sm" onClick={() => retryItem(item.id)} className="text-xs h-7">重试</Button>
                                            )}
                                            {item.status !== "downloading" && item.status !== "uploading" && (
                                                <button onClick={() => removeFromQueue(item.id)} className="p-1 hover:bg-gray-200/60 rounded transition-colors">
                                                    <X className="h-4 w-4 text-gray-400" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* All done */}
                {allDone && (
                    <div className="bg-green-50 rounded-xl p-8 text-center">
                        <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
                        <p className="text-lg font-semibold text-green-700">全部保存成功！</p>
                        <p className="text-sm text-green-600 mt-1">共 {savedCount} 首曲目已保存到数据库</p>
                        <Button variant="outline" className="mt-4" onClick={() => router.push("/music")}>
                            返回音乐管理
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
