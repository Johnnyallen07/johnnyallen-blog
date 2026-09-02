"use client";

import {
    useState,
    useEffect,
    useCallback,
    useRef,
    type ChangeEvent,
    type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
    AlertCircle,
    ArrowLeft,
    CheckCircle2,
    ClipboardPaste,
    FileText,
    KeyRound,
    Loader2,
    Plus,
    RefreshCw,
    Save,
    Sparkles,
    Upload,
    X,
    Youtube,
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

interface SidebarEntity {
    id: string;
    name: string;
    slug: string;
}

interface TaskProgress {
    status: "fetching_info" | "downloading" | "converting" | "done" | "error";
    progress: number;
    title: string;
    error?: string;
    fileSize?: number;
    duration?: number;
}

interface MetadataSuggestion {
    taskId: string;
    title: string;
    musician: string;
    performer: string;
    category: string;
    series: string | null;
    confidence: number;
    reason: string;
    needsReview: string[];
}

interface EditableMetadata {
    musician: string;
    performer: string;
    categoryId: string;
    seriesId: string;
    confidence: number;
    reason: string;
    needsReview: string[];
}

interface CookieSummary {
    configured: boolean;
    bytes?: number;
    updatedAt?: string;
    totalCookies?: number;
    youtubeCookies?: number;
    activeYoutubeCookies?: number;
    domains?: string[];
    expiresAt?: string | null;
    likelyExpired?: boolean;
    issue?: string;
}

type ItemStatus = "queued" | "downloading" | "downloaded" | "uploading" | "saved" | "error";
type SuggestionStatus = "idle" | "loading" | "ready" | "error";

interface QueueItem {
    id: string;
    url: string;
    taskId: string | null;
    title: string;
    status: ItemStatus;
    progress: number;
    statusLabel: string;
    error: string;
    failureStage?: "download" | "save";
    fileSize: number;
    duration: number;
    suggestionStatus: SuggestionStatus;
    suggestionError: string;
    metadata: EditableMetadata;
}

const EMPTY_METADATA: EditableMetadata = {
    musician: "",
    performer: "",
    categoryId: "",
    seriesId: "",
    confidence: 0,
    reason: "",
    needsReview: [],
};

const REVIEW_LABELS: Record<string, string> = {
    title: "标题",
    musician: "作曲家",
    performer: "演奏者",
    category: "分类",
    series: "系列",
};

const DL_STATUS_LABELS: Record<string, string> = {
    fetching_info: "获取视频信息...",
    downloading: "下载音频中...",
    converting: "转换为 MP3...",
    done: "下载完成",
    error: "下载失败",
};

function isYoutubeUrl(url: string): boolean {
    return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url.trim());
}

function formatDuration(seconds: number): string {
    if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60);
    return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value?: string | null): string {
    if (!value) return "未知";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "未知" : date.toLocaleString("zh-CN");
}

export default function YoutubeDownloadPage() {
    const router = useRouter();
    const [urlInput, setUrlInput] = useState("");
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const pollingTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
    const isProcessing = useRef(false);
    const isUploading = useRef<Set<string>>(new Set());
    const isSuggesting = useRef<Set<string>>(new Set());

    const [categories, setCategories] = useState<SidebarEntity[]>([]);
    const [seriesList, setSeriesList] = useState<SidebarEntity[]>([]);
    const [musicians, setMusicians] = useState<string[]>([]);
    const categoriesRef = useRef<SidebarEntity[]>([]);
    const seriesListRef = useRef<SidebarEntity[]>([]);

    const [cookieDialogOpen, setCookieDialogOpen] = useState(false);
    const [cookieText, setCookieText] = useState("");
    const [cookieFileName, setCookieFileName] = useState("");
    const [cookieSummary, setCookieSummary] = useState<CookieSummary | null>(null);
    const [cookieStatus, setCookieStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
    const [isUpdatingCookie, setIsUpdatingCookie] = useState(false);
    const [isCookieDragging, setIsCookieDragging] = useState(false);

    useEffect(() => {
        categoriesRef.current = categories;
    }, [categories]);
    useEffect(() => {
        seriesListRef.current = seriesList;
    }, [seriesList]);

    const fetchDropdowns = useCallback(async () => {
        try {
            const [cats, series, knownMusicians] = await Promise.all([
                fetchClient("/music-categories"),
                fetchClient("/music-series"),
                fetchClient("/music/musicians"),
            ]);
            setCategories(Array.isArray(cats) ? cats : []);
            setSeriesList(Array.isArray(series) ? series : []);
            setMusicians(Array.isArray(knownMusicians) ? knownMusicians : []);
        } catch {
            // 元数据建议仍可运行，失败时允许用户手工填写。
        }
    }, []);

    const fetchCookieSummary = useCallback(async () => {
        try {
            const result = await fetchClient("/music/youtube-cookies") as CookieSummary;
            setCookieSummary(result);
        } catch (error) {
            setCookieSummary({
                configured: false,
                issue: error instanceof Error ? error.message : "无法读取 Cookie 状态",
            });
        }
    }, []);

    useEffect(() => {
        fetchDropdowns();
        fetchCookieSummary();
    }, [fetchDropdowns, fetchCookieSummary]);

    useEffect(() => {
        const timers = pollingTimers.current;
        return () => timers.forEach((timer) => clearInterval(timer));
    }, []);

    const readCookieFile = async (file: File) => {
        setCookieStatus(null);
        setCookieFileName(file.name);
        setCookieText(await file.text());
    };

    const handleCookieFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) await readCookieFile(file);
    };

    const handleCookieDrop = async (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsCookieDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) await readCookieFile(file);
    };

    const pasteCookies = async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (!text.trim()) throw new Error("剪贴板为空");
            setCookieText(text);
            setCookieFileName("从剪贴板粘贴");
            setCookieStatus(null);
        } catch (error) {
            setCookieStatus({
                type: "error",
                message: error instanceof Error ? error.message : "无法读取剪贴板",
            });
        }
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
            }) as CookieSummary & { ok?: boolean };
            setCookieSummary(result);
            setCookieStatus({
                type: "success",
                message: `已安全更新，共识别 ${result.youtubeCookies ?? 0} 条 YouTube/Google Cookie。`,
            });
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

    const addUrls = () => {
        const urls = urlInput
            .split(/[\n\r]+/)
            .map((url) => url.trim())
            .filter((url) => url && isYoutubeUrl(url));
        if (urls.length === 0) return;

        const existingUrls = new Set(queue.map((item) => item.url));
        const newItems: QueueItem[] = urls
            .filter((url) => !existingUrls.has(url))
            .map((url) => ({
                id: crypto.randomUUID(),
                url,
                taskId: null,
                title: "",
                status: "queued",
                progress: 0,
                statusLabel: "等待下载",
                error: "",
                fileSize: 0,
                duration: 0,
                suggestionStatus: "idle",
                suggestionError: "",
                metadata: { ...EMPTY_METADATA, needsReview: [] },
            }));
        if (newItems.length === 0) return;
        setQueue((current) => [...current, ...newItems]);
        setUrlInput("");
    };

    const removeFromQueue = (id: string) => {
        const item = queue.find((entry) => entry.id === id);
        if (item?.taskId) {
            fetchClient(`/music/youtube-download/${item.taskId}`, { method: "DELETE" }).catch(() => undefined);
        }
        const timer = pollingTimers.current.get(id);
        if (timer) clearInterval(timer);
        pollingTimers.current.delete(id);
        setQueue((current) => current.filter((entry) => entry.id !== id));
    };

    const updateTitle = (id: string, title: string) => {
        setQueue((current) => current.map((item) => item.id === id
            ? {
                ...item,
                title,
                metadata: {
                    ...item.metadata,
                    needsReview: item.metadata.needsReview.filter((field) => field !== "title"),
                },
            }
            : item));
    };

    const updateMetadata = (id: string, field: "musician" | "performer" | "categoryId" | "seriesId", value: string) => {
        const reviewField = field === "categoryId" ? "category" : field === "seriesId" ? "series" : field;
        setQueue((current) => current.map((item) => item.id === id
            ? {
                ...item,
                metadata: {
                    ...item.metadata,
                    [field]: value,
                    needsReview: item.metadata.needsReview.filter((name) => name !== reviewField),
                },
            }
            : item));
    };

    const suggestItem = useCallback(async (itemId: string, taskId: string) => {
        if (isSuggesting.current.has(itemId)) return;
        isSuggesting.current.add(itemId);
        setQueue((current) => current.map((item) => item.id === itemId
            ? { ...item, suggestionStatus: "loading", suggestionError: "" }
            : item));

        try {
            const result = await fetchClient("/music/youtube-metadata/suggest", {
                method: "POST",
                body: JSON.stringify({ taskIds: [taskId] }),
            }) as { suggestions?: MetadataSuggestion[] };
            const suggestion = result.suggestions?.[0];
            if (!suggestion) throw new Error("AI 未返回音乐信息");

            const categoryId = categoriesRef.current.find((item) => item.name === suggestion.category)?.id || "";
            const seriesId = seriesListRef.current.find((item) => item.name === suggestion.series)?.id || "";
            setQueue((current) => current.map((item) => item.id === itemId
                ? {
                    ...item,
                    title: suggestion.title || item.title,
                    suggestionStatus: "ready",
                    suggestionError: "",
                    statusLabel: "等待审核",
                    metadata: {
                        musician: suggestion.musician,
                        performer: suggestion.performer,
                        categoryId,
                        seriesId,
                        confidence: suggestion.confidence,
                        reason: suggestion.reason,
                        needsReview: suggestion.needsReview,
                    },
                }
                : item));
            if (suggestion.musician) {
                setMusicians((current) => current.includes(suggestion.musician)
                    ? current
                    : [...current, suggestion.musician].sort());
            }
        } catch (error) {
            setQueue((current) => current.map((item) => item.id === itemId
                ? {
                    ...item,
                    suggestionStatus: "error",
                    suggestionError: error instanceof Error ? error.message : "AI 补全失败",
                    statusLabel: "请手工填写或重试 AI",
                }
                : item));
        } finally {
            isSuggesting.current.delete(itemId);
        }
    }, []);

    useEffect(() => {
        for (const item of queue) {
            if (
                (item.status === "downloading" || item.status === "downloaded")
                && item.title
                && item.taskId
                && item.suggestionStatus === "idle"
            ) {
                suggestItem(item.id, item.taskId);
            }
        }
    }, [queue, suggestItem]);

    const itemIsComplete = (item: QueueItem) => Boolean(
        item.title.trim()
        && item.metadata.musician.trim()
        && item.metadata.performer.trim()
        && item.metadata.categoryId,
    );

    const uploadAndSaveItem = useCallback(async (item: QueueItem) => {
        if (!item.taskId || isUploading.current.has(item.id) || !itemIsComplete(item)) return;
        isUploading.current.add(item.id);
        const category = categoriesRef.current.find((entry) => entry.id === item.metadata.categoryId)?.name;
        const series = seriesListRef.current.find((entry) => entry.id === item.metadata.seriesId)?.name;
        if (!category) {
            isUploading.current.delete(item.id);
            return;
        }

        setQueue((current) => current.map((entry) => entry.id === item.id
            ? { ...entry, status: "uploading", statusLabel: "上传到云端并保存...", error: "" }
            : entry));
        try {
            await fetchClient(`/music/youtube-upload/${item.taskId}/save`, {
                method: "POST",
                body: JSON.stringify({
                    title: item.title.trim(),
                    musician: item.metadata.musician.trim(),
                    performer: item.metadata.performer.trim(),
                    category,
                    series: series || undefined,
                }),
            });
            setQueue((current) => current.map((entry) => entry.id === item.id
                ? { ...entry, status: "saved", statusLabel: "已审核并保存", failureStage: undefined }
                : entry));
        } catch (error) {
            setQueue((current) => current.map((entry) => entry.id === item.id
                ? {
                    ...entry,
                    status: "error",
                    statusLabel: "保存失败",
                    failureStage: "save",
                    error: error instanceof Error ? error.message : "上传/保存失败",
                }
                : entry));
        } finally {
            isUploading.current.delete(item.id);
        }
    }, []);

    const saveAllReviewed = async () => {
        const ready = queue.filter((item) => item.status === "downloaded" && itemIsComplete(item));
        for (const item of ready) await uploadAndSaveItem(item);
    };

    const processQueue = useCallback(async () => {
        if (isProcessing.current) return;
        const nextItem = queue.find((item) => item.status === "queued");
        if (!nextItem) return;
        isProcessing.current = true;

        try {
            const data = await fetchClient("/music/youtube-download", {
                method: "POST",
                body: JSON.stringify({ url: nextItem.url }),
            });
            const taskId = data.taskId as string;
            setQueue((current) => current.map((item) => item.id === nextItem.id
                ? { ...item, taskId, status: "downloading", statusLabel: "获取视频信息...", progress: 0 }
                : item));

            const timer = setInterval(async () => {
                try {
                    const progress = await fetchClient(`/music/youtube-download/${taskId}`) as TaskProgress;
                    setQueue((current) => current.map((item) => {
                        if (item.id !== nextItem.id) return item;
                        if (progress.status === "done") {
                            clearInterval(timer);
                            pollingTimers.current.delete(nextItem.id);
                            isProcessing.current = false;
                            return {
                                ...item,
                                status: "downloaded",
                                progress: 100,
                                statusLabel: item.suggestionStatus === "ready"
                                    ? "等待审核"
                                    : item.suggestionStatus === "error"
                                        ? "请手工填写或重试 AI"
                                        : "AI 正在整理音乐信息...",
                                title: item.title || progress.title,
                                fileSize: progress.fileSize ?? 0,
                                duration: progress.duration ?? 0,
                            };
                        }
                        if (progress.status === "error") {
                            clearInterval(timer);
                            pollingTimers.current.delete(nextItem.id);
                            isProcessing.current = false;
                            return {
                                ...item,
                                status: "error",
                                failureStage: "download",
                                progress: 0,
                                statusLabel: "下载失败",
                                error: progress.error || "下载失败",
                            };
                        }
                        return {
                            ...item,
                            progress: progress.progress,
                            statusLabel: DL_STATUS_LABELS[progress.status] || "处理中...",
                            title: progress.title || item.title,
                        };
                    }));
                } catch {
                    // 短暂轮询错误，下次继续。
                }
            }, 800);
            pollingTimers.current.set(nextItem.id, timer);
        } catch (error) {
            setQueue((current) => current.map((item) => item.id === nextItem.id
                ? {
                    ...item,
                    status: "error",
                    failureStage: "download",
                    error: error instanceof Error ? error.message : "启动下载失败",
                    statusLabel: "失败",
                }
                : item));
            isProcessing.current = false;
        }
    }, [queue]);

    useEffect(() => {
        const hasQueued = queue.some((item) => item.status === "queued");
        const hasActive = queue.some((item) => item.status === "downloading");
        if (hasQueued && !hasActive && !isProcessing.current) processQueue();
    }, [queue, processQueue]);

    const retryItem = (item: QueueItem) => {
        if (item.failureStage === "save") {
            uploadAndSaveItem({ ...item, status: "downloaded" });
            return;
        }
        setQueue((current) => current.map((entry) => entry.id === item.id
            ? {
                ...entry,
                status: "queued",
                taskId: null,
                progress: 0,
                error: "",
                failureStage: undefined,
                statusLabel: "等待下载",
                suggestionStatus: "idle",
            }
            : entry));
    };

    const savedCount = queue.filter((item) => item.status === "saved").length;
    const errorCount = queue.filter((item) => item.status === "error").length;
    const readyToSave = queue.filter((item) => item.status === "downloaded" && itemIsComplete(item)).length;
    const allDone = queue.length > 0 && savedCount === queue.length;
    const overallProgress = queue.length > 0
        ? Math.round(queue.reduce((sum, item) => {
            if (item.status === "saved") return sum + 100;
            if (item.status === "uploading") return sum + 95;
            if (item.status === "downloaded") return sum + 85;
            return sum + item.progress * 0.8;
        }, 0) / queue.length)
        : 0;

    const statusIcon = (item: QueueItem) => {
        if (item.status === "saved") return <CheckCircle2 className="h-5 w-5 text-green-500" />;
        if (item.status === "error") return <AlertCircle className="h-5 w-5 text-red-500" />;
        if (item.status === "downloaded" && item.suggestionStatus === "ready") {
            return <Sparkles className="h-5 w-5 text-violet-500" />;
        }
        if (item.status === "downloaded" && item.suggestionStatus === "error") {
            return <AlertCircle className="h-5 w-5 text-amber-500" />;
        }
        if (item.status === "queued") return <span className="block w-5 text-center text-gray-400">·</span>;
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-amber-50/60 via-orange-50/40 to-yellow-50/60">
            <datalist id="known-musicians">
                {musicians.map((name) => <option key={name} value={name} />)}
            </datalist>

            <div className="sticky top-0 z-10 border-b border-gray-200 bg-white">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-4">
                    <Button variant="ghost" size="sm" onClick={() => router.push("/music")}>
                        <ArrowLeft className="mr-1 h-4 w-4" /> 返回音乐管理
                    </Button>
                    <div className="flex items-center gap-3">
                        {queue.length > 0 && (
                            <div className="text-sm text-gray-500">
                                {savedCount}/{queue.length} 已保存
                                {readyToSave > 0 && <span className="text-violet-600"> · {readyToSave} 待确认</span>}
                                {errorCount > 0 && <span className="text-red-500"> · {errorCount} 失败</span>}
                            </div>
                        )}
                        <Dialog open={cookieDialogOpen} onOpenChange={(open) => {
                            setCookieDialogOpen(open);
                            if (open) fetchCookieSummary();
                        }}>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                    <span className={`mr-2 h-2 w-2 rounded-full ${cookieSummary?.configured && !cookieSummary.likelyExpired ? "bg-green-500" : "bg-amber-500"}`} />
                                    <KeyRound className="mr-1 h-4 w-4" />
                                    YouTube Cookie
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-h-[88vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl">
                                <DialogHeader>
                                    <DialogTitle>更新 YouTube Cookie</DialogTitle>
                                    <DialogDescription>Cookie 只写入 API 的私有文件，不会在页面中回显。</DialogDescription>
                                </DialogHeader>

                                <div className="space-y-4">
                                    <div className={`rounded-lg border p-3 ${cookieSummary?.configured && !cookieSummary.likelyExpired ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-medium text-gray-800">{cookieSummary?.configured ? "已配置 Cookie" : "尚未配置可用 Cookie"}</p>
                                                <p className="mt-1 text-xs text-gray-600">
                                                    {cookieSummary?.issue || (cookieSummary?.configured
                                                        ? `${cookieSummary.activeYoutubeCookies ?? 0}/${cookieSummary.youtubeCookies ?? 0} 条相关 Cookie 当前未过期`
                                                        : "上传浏览器导出的 Netscape cookies.txt 后即可使用")}
                                                </p>
                                            </div>
                                            <RefreshCw className="h-4 w-4 text-gray-400" />
                                        </div>
                                        {cookieSummary?.updatedAt && (
                                            <div className="mt-2 grid gap-1 text-xs text-gray-500 sm:grid-cols-2">
                                                <span>更新时间：{formatDate(cookieSummary.updatedAt)}</span>
                                                <span>最晚到期：{formatDate(cookieSummary.expiresAt)}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div
                                        onDragOver={(event) => { event.preventDefault(); setIsCookieDragging(true); }}
                                        onDragLeave={() => setIsCookieDragging(false)}
                                        onDrop={handleCookieDrop}
                                        className={`rounded-lg border-2 border-dashed p-5 text-center transition-colors ${isCookieDragging ? "border-red-400 bg-red-50" : "border-gray-200 bg-gray-50"}`}
                                    >
                                        <FileText className="mx-auto mb-2 h-7 w-7 text-gray-400" />
                                        <Label htmlFor="youtube-cookie-file" className="cursor-pointer text-sm font-medium text-gray-700">拖入 cookies.txt，或点击选择文件</Label>
                                        <Input id="youtube-cookie-file" type="file" accept=".txt,text/plain" onChange={handleCookieFileChange} className="sr-only" />
                                        {cookieFileName && <p className="mt-2 text-xs text-gray-500">{cookieFileName}</p>}
                                        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={pasteCookies}>
                                            <ClipboardPaste className="mr-1 h-4 w-4" /> 从剪贴板读取
                                        </Button>
                                    </div>

                                    <div>
                                        <div className="mb-1.5 flex items-center justify-between">
                                            <Label htmlFor="youtube-cookie-text">内容预览 / 手工粘贴</Label>
                                            {cookieText && <button type="button" onClick={() => { setCookieText(""); setCookieFileName(""); }} className="text-xs text-gray-400 hover:text-gray-700">清空</button>}
                                        </div>
                                        <Textarea
                                            id="youtube-cookie-text"
                                            value={cookieText}
                                            onChange={(event) => { setCookieText(event.target.value); setCookieStatus(null); }}
                                            rows={8}
                                            spellCheck={false}
                                            className="h-44 resize-y break-all font-mono text-xs"
                                            placeholder="# Netscape HTTP Cookie File"
                                        />
                                    </div>

                                    {cookieStatus && <div className={`rounded-md px-3 py-2 text-sm ${cookieStatus.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{cookieStatus.message}</div>}
                                </div>

                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setCookieDialogOpen(false)} disabled={isUpdatingCookie}>关闭</Button>
                                    <Button onClick={updateYoutubeCookies} disabled={!cookieText.trim() || isUpdatingCookie} className="bg-red-600 hover:bg-red-700">
                                        {isUpdatingCookie ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
                                        验证并保存
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-5xl p-8">
                <div className="mb-8 text-center">
                    <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-red-600 shadow-lg">
                        <Youtube className="h-8 w-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900">YouTube 音乐入库</h1>
                    <p className="mt-2 text-gray-500">粘贴链接 → AI 检索并填写 → 人工审核 → 确认后上传保存</p>
                </div>

                <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="flex items-center gap-2 text-lg font-semibold">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-xs font-bold text-red-600">1</span>
                            添加 YouTube 链接
                        </h2>
                        <span className="text-xs text-gray-400">每行一个，可批量粘贴</span>
                    </div>
                    <Textarea placeholder={"https://www.youtube.com/watch?v=...\nhttps://youtu.be/..."} value={urlInput} onChange={(event) => setUrlInput(event.target.value)} rows={3} className="resize-none" />
                    <Button onClick={addUrls} disabled={!urlInput.trim()} className="mt-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700">
                        <Plus className="mr-1 h-4 w-4" /> 添加并开始处理
                    </Button>
                </div>

                {queue.length > 0 && (
                    <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="flex items-center gap-2 text-lg font-semibold">
                                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-600">2</span>
                                    审核 AI 填写的信息
                                </h2>
                                <p className="ml-8 mt-1 text-xs text-gray-400">紫色标记表示 AI 建议已就绪；只有点击确认后才会入库。</p>
                            </div>
                            <Button onClick={saveAllReviewed} disabled={readyToSave === 0}>
                                <Save className="mr-1 h-4 w-4" /> 确认保存全部完整项 ({readyToSave})
                            </Button>
                        </div>

                        <div className="mb-5 border-b border-gray-100 pb-4">
                            <div className="mb-1.5 flex justify-between text-xs text-gray-500"><span>整体进度</span><span>{overallProgress}%</span></div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                                <div className="h-full rounded-full bg-gradient-to-r from-blue-400 via-violet-500 to-green-500 transition-all duration-500" style={{ width: `${overallProgress}%` }} />
                            </div>
                        </div>

                        <div className="space-y-4">
                            {queue.map((item) => (
                                <div key={item.id} className={`rounded-xl border p-4 ${item.status === "saved" ? "border-green-200 bg-green-50/60" : item.status === "error" ? "border-red-200 bg-red-50/60" : item.status === "downloaded" ? "border-violet-200 bg-violet-50/30" : "border-gray-200 bg-gray-50/50"}`}>
                                    <div className="flex items-start gap-3">
                                        <span className="mt-1 shrink-0">{statusIcon(item)}</span>
                                        <div className="min-w-0 flex-1">
                                            {item.title && item.status !== "saved" ? (
                                                <Input value={item.title} onChange={(event) => updateTitle(item.id, event.target.value)} className="h-8 bg-white font-medium" />
                                            ) : (
                                                <p className="truncate text-sm font-medium text-gray-900">{item.title || item.url.replace(/^https?:\/\/(www\.)?/, "")}</p>
                                            )}
                                            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                                                <span className={item.status === "error" ? "text-red-600" : item.status === "saved" ? "text-green-600" : "text-gray-500"}>{item.statusLabel}</span>
                                                {item.duration > 0 && <span className="text-gray-400">{formatDuration(item.duration)} · {formatFileSize(item.fileSize)}</span>}
                                            </div>
                                            {item.status === "downloading" && (
                                                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                                                    <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${item.progress}%` }} />
                                                </div>
                                            )}
                                            {item.error && <p className="mt-2 text-xs text-red-500">{item.error}</p>}
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1">
                                            {item.status === "error" && <Button variant="ghost" size="sm" onClick={() => retryItem(item)}>重试</Button>}
                                            {item.status === "downloaded" && item.taskId && (
                                                <Button variant="ghost" size="sm" onClick={() => suggestItem(item.id, item.taskId!)} disabled={item.suggestionStatus === "loading"} title="重新生成 AI 建议">
                                                    <RefreshCw className={`h-4 w-4 ${item.suggestionStatus === "loading" ? "animate-spin" : ""}`} />
                                                </Button>
                                            )}
                                            {item.status !== "downloading" && item.status !== "uploading" && <button onClick={() => removeFromQueue(item.id)} className="rounded p-1 hover:bg-gray-200/60"><X className="h-4 w-4 text-gray-400" /></button>}
                                        </div>
                                    </div>

                                    {item.status === "downloaded" && (
                                        <div className="ml-8 mt-4 border-t border-violet-100 pt-4">
                                            {item.suggestionStatus === "loading" && <div className="mb-4 flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-700"><Loader2 className="h-4 w-4 animate-spin" /> AI 正在检索音乐库并整理信息…</div>}
                                            {item.suggestionStatus === "error" && <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">AI 补全失败：{item.suggestionError}。可手工填写或点击右上角重试。</div>}
                                            {item.suggestionStatus === "ready" && (
                                                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-700">
                                                    <Sparkles className="h-4 w-4" />
                                                    <span>AI 置信度 {Math.round(item.metadata.confidence * 100)}%</span>
                                                    <span className="text-violet-400">·</span>
                                                    <span>{item.metadata.reason}</span>
                                                    {item.metadata.needsReview.length > 0 && <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-700">请重点检查：{item.metadata.needsReview.map((field) => REVIEW_LABELS[field] || field).join("、")}</span>}
                                                </div>
                                            )}

                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <div>
                                                    <Label className="text-xs">Musician / Composer *</Label>
                                                    <Input list="known-musicians" value={item.metadata.musician} onChange={(event) => updateMetadata(item.id, "musician", event.target.value)} placeholder="例如 Mozart" className="mt-1.5 bg-white" />
                                                </div>
                                                <div>
                                                    <Label className="text-xs">Performer / 演奏者 *</Label>
                                                    <Input value={item.metadata.performer} onChange={(event) => updateMetadata(item.id, "performer", event.target.value)} placeholder="确认实际演奏者或来源频道" className="mt-1.5 bg-white" />
                                                </div>
                                                <div>
                                                    <Label className="text-xs">Category / 分类 *</Label>
                                                    <Select value={item.metadata.categoryId} onValueChange={(value) => updateMetadata(item.id, "categoryId", value)}>
                                                        <SelectTrigger className="mt-1.5 bg-white"><SelectValue placeholder="选择分类..." /></SelectTrigger>
                                                        <SelectContent>
                                                            {categories.length === 0 ? <SelectItem value="_none" disabled>暂无分类</SelectItem> : categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div>
                                                    <Label className="text-xs">Series / 系列（可选）</Label>
                                                    <Select value={item.metadata.seriesId || "_none"} onValueChange={(value) => updateMetadata(item.id, "seriesId", value === "_none" ? "" : value)}>
                                                        <SelectTrigger className="mt-1.5 bg-white"><SelectValue placeholder="无系列" /></SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="_none">无系列</SelectItem>
                                                            {seriesList.map((series) => <SelectItem key={series.id} value={series.id}>{series.name}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                            <div className="mt-4 flex items-center justify-between gap-3">
                                                <p className="text-xs text-gray-400">请试听或核对来源后再确认；保存后仍可在音乐管理中编辑。</p>
                                                <Button onClick={() => uploadAndSaveItem(item)} disabled={!itemIsComplete(item) || item.suggestionStatus === "loading"}>
                                                    <Save className="mr-1 h-4 w-4" /> 确认并保存
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {allDone && (
                    <div className="rounded-xl bg-green-50 p-8 text-center">
                        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-500" />
                        <p className="text-lg font-semibold text-green-700">全部审核并保存成功</p>
                        <p className="mt-1 text-sm text-green-600">共 {savedCount} 首曲目已保存到数据库</p>
                        <Button variant="outline" className="mt-4" onClick={() => router.push("/music")}>返回音乐管理</Button>
                    </div>
                )}
            </div>
        </div>
    );
}
