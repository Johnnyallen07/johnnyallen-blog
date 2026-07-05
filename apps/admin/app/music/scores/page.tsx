"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
    X,
    ChevronLeft,
    ChevronRight,
    Image as ImageIcon,
    Plus,
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

interface ScorePage {
    key: string;
    url: string;
    size?: number;
}

interface MusicScore {
    id: string;
    title: string;
    composer: string | null;
    instrument: string;
    fileType: string;
    pages: ScorePage[] | null;
    fileKey: string;
    fileUrl: string;
    fileSize: number;
    pageCount: number;
    coverUrl: string | null;
    order: number;
    createdAt: string;
}

/** 上传前暂存在本地的图片页 */
interface LocalImage {
    id: string;
    file: File;
    previewUrl: string;
}

/** 编辑对话框里的页面：已上传的带 key/url，新增的带 file（保存时才上传） */
interface EditPage {
    id: string;
    url: string;
    key?: string;
    size?: number;
    file?: File;
}

const INSTRUMENTS = [
    { value: "all", label: "全部" },
    { value: "小提琴", label: "小提琴" },
    { value: "钢琴", label: "钢琴" },
];

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/* ── Helpers ── */

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function makeId(): string {
    return typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
    if (to < 0 || to >= list.length || from === to) return list;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    return next;
}

/* ── Page thumbnail grid（上传/编辑共用：拖拽排序、左右微调、删除、点击查看大图） ── */

function PageThumbGrid({
    items,
    onMove,
    onRemove,
    onPreview,
}: {
    items: { id: string; url: string; isNew?: boolean }[];
    onMove: (from: number, to: number) => void;
    onRemove: (index: number) => void;
    onPreview: (index: number) => void;
}) {
    const dragFromRef = useRef<number | null>(null);
    return (
        <div className="grid grid-cols-4 gap-2">
            {items.map((item, index) => (
                <div
                    key={item.id}
                    draggable
                    onDragStart={() => {
                        dragFromRef.current = index;
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                        // 阻止冒泡，避免外层 dropzone 把排序拖拽当成新文件
                        e.preventDefault();
                        e.stopPropagation();
                        if (dragFromRef.current !== null) {
                            onMove(dragFromRef.current, index);
                        }
                        dragFromRef.current = null;
                    }}
                    className="group relative aspect-[3/4] cursor-grab overflow-hidden rounded-lg border border-gray-200 bg-gray-50 active:cursor-grabbing"
                >
                    <img
                        src={item.url}
                        alt={`第 ${index + 1} 页`}
                        onClick={() => onPreview(index)}
                        className="h-full w-full object-cover"
                    />
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
                        {index + 1}
                    </span>
                    {item.isNew && (
                        <span className="absolute bottom-1 left-1 rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] text-white">
                            新增
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => onRemove(index)}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
                        title="移除"
                    >
                        <X className="h-3 w-3" />
                    </button>
                    <div className="absolute bottom-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                            type="button"
                            onClick={() => onMove(index, index - 1)}
                            disabled={index === 0}
                            className="rounded bg-black/60 p-0.5 text-white disabled:opacity-30"
                            title="前移"
                        >
                            <ChevronLeft className="h-3 w-3" />
                        </button>
                        <button
                            type="button"
                            onClick={() => onMove(index, index + 1)}
                            disabled={index === items.length - 1}
                            className="rounded bg-black/60 p-0.5 text-white disabled:opacity-30"
                            title="后移"
                        >
                            <ChevronRight className="h-3 w-3" />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ── 大图预览（上传前检查图片；渲染在对话框外层避免 transform 影响 fixed 定位） ── */

function ImagePreviewOverlay({
    urls,
    index,
    onNavigate,
    onClose,
}: {
    urls: string[];
    index: number;
    onNavigate: (index: number) => void;
    onClose: () => void;
}) {
    useEffect(() => {
        const onKeyDown = (e: globalThis.KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
            if (e.key === "ArrowRight" && index < urls.length - 1) onNavigate(index + 1);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [index, urls.length, onNavigate, onClose]);

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85"
            onClick={onClose}
        >
            <img
                src={urls[index]}
                alt={`第 ${index + 1} 页`}
                onClick={(e) => e.stopPropagation()}
                className="max-h-[90vh] max-w-[90vw] rounded object-contain shadow-2xl"
            />
            <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs tabular-nums text-white">
                {index + 1} / {urls.length}
            </span>
            <button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
            >
                <X className="h-5 w-5" />
            </button>
            {index > 0 && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onNavigate(index - 1);
                    }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
                >
                    <ChevronLeft className="h-6 w-6" />
                </button>
            )}
            {index < urls.length - 1 && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onNavigate(index + 1);
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
                >
                    <ChevronRight className="h-6 w-6" />
                </button>
            )}
        </div>
    );
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
    const [uploadImages, setUploadImages] = useState<LocalImage[]>([]);
    const [uploadForm, setUploadForm] = useState({
        title: "",
        instrument: "小提琴",
    });
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<
        { done: number; total: number } | null
    >(null);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const uploadFileInputRef = useRef<HTMLInputElement | null>(null);
    const uploadImagesRef = useRef<LocalImage[]>([]);
    uploadImagesRef.current = uploadImages;

    /* ── Edit dialog ── */
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [editingScore, setEditingScore] = useState<MusicScore | null>(null);
    const [editPages, setEditPages] = useState<EditPage[]>([]);
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const editImageInputRef = useRef<HTMLInputElement | null>(null);

    /* ── 大图预览（上传/编辑共用） ── */
    const [imagePreview, setImagePreview] = useState<
        { urls: string[]; index: number } | null
    >(null);

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
                              (s.composer ?? "").toLowerCase().includes(searchQuery.toLowerCase())
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

    /* ── 文件接收（选择/粘贴/拖拽共用）：PDF 单选，图片可多张累加 ── */

    const addUploadFiles = useCallback((files: File[]) => {
        const pdf = files.find((file) => file.type === "application/pdf");
        const images = files.filter((file) => IMAGE_TYPES.includes(file.type));

        if (pdf) {
            // 选了 PDF：切到 PDF 模式，清空已选图片
            setUploadImages((prev) => {
                prev.forEach((img) => URL.revokeObjectURL(img.previewUrl));
                return [];
            });
            setUploadFile(pdf);
            setUploadForm((prev) =>
                prev.title
                    ? prev
                    : { ...prev, title: pdf.name.replace(/\.pdf$/i, "") }
            );
            return;
        }

        if (images.length > 0) {
            setUploadFile(null);
            setUploadImages((prev) => [
                ...prev,
                ...images.map((file) => ({
                    id: makeId(),
                    file,
                    previewUrl: URL.createObjectURL(file),
                })),
            ]);
            setUploadForm((prev) =>
                prev.title
                    ? prev
                    : {
                          ...prev,
                          title: images[0]!.name.replace(/\.[^.]+$/, ""),
                      }
            );
        }
    }, []);

    // 对话框打开期间支持全局粘贴（截图或复制的图片文件）
    useEffect(() => {
        if (!isUploadDialogOpen) return;
        const onPaste = (e: globalThis.ClipboardEvent) => {
            const files = Array.from(e.clipboardData?.files ?? []);
            if (files.length > 0) {
                e.preventDefault();
                addUploadFiles(files);
            }
        };
        window.addEventListener("paste", onPaste);
        return () => window.removeEventListener("paste", onPaste);
    }, [isUploadDialogOpen, addUploadFiles]);

    // 关闭对话框时释放本地预览 URL
    const resetUploadDialog = useCallback(() => {
        uploadImagesRef.current.forEach((img) =>
            URL.revokeObjectURL(img.previewUrl)
        );
        setUploadImages([]);
        setUploadFile(null);
        setUploadForm({ title: "", instrument: "小提琴" });
        setUploadProgress(null);
        setIsDraggingOver(false);
    }, []);

    /* ── Upload handler ── */

    const uploadPdfScore = async () => {
        if (!uploadFile) return;

        // 1. Get presigned upload URL
        const { uploadUrl, key, publicUrl } = await fetchClient(
            "/music-scores/upload-url",
            {
                method: "POST",
                body: JSON.stringify({
                    fileName: uploadFile.name,
                    contentType: "application/pdf",
                }),
            }
        );

        // 2. Upload PDF to COS
        const res = await fetch(uploadUrl, {
            method: "PUT",
            body: uploadFile,
            headers: { "Content-Type": "application/pdf" },
        });
        if (!res.ok) throw new Error(`PDF 上传失败 (${res.status})`);

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
                composer: null,
                instrument: uploadForm.instrument,
                fileType: "pdf",
                fileKey: key,
                fileUrl: publicUrl,
                fileSize: uploadFile.size,
                pageCount,
            }),
        });
    };

    /** 批量申请预签名 URL 并逐张 PUT，返回按原顺序的页面列表 */
    const uploadImageFiles = async (
        files: File[],
        onProgress?: (done: number, total: number) => void
    ): Promise<ScorePage[]> => {
        const targets: { uploadUrl: string; key: string; publicUrl: string }[] =
            await fetchClient("/music-scores/upload-urls", {
                method: "POST",
                body: JSON.stringify({
                    files: files.map((file) => ({
                        fileName: file.name,
                        contentType: file.type,
                    })),
                }),
            });

        for (let i = 0; i < files.length; i++) {
            onProgress?.(i, files.length);
            const res = await fetch(targets[i]!.uploadUrl, {
                method: "PUT",
                body: files[i],
                headers: { "Content-Type": files[i]!.type },
            });
            if (!res.ok) throw new Error(`第 ${i + 1} 张图片上传失败 (${res.status})`);
        }
        onProgress?.(files.length, files.length);

        return files.map((file, i) => ({
            key: targets[i]!.key,
            url: targets[i]!.publicUrl,
            size: file.size,
        }));
    };

    const uploadImageScore = async () => {
        if (uploadImages.length === 0) return;

        const pages = await uploadImageFiles(
            uploadImages.map((img) => img.file),
            (done, total) => setUploadProgress({ done, total })
        );

        await fetchClient("/music-scores", {
            method: "POST",
            body: JSON.stringify({
                title: uploadForm.title,
                composer: null,
                instrument: uploadForm.instrument,
                fileType: "images",
                pages,
                fileKey: pages[0]!.key,
                fileUrl: pages[0]!.url,
                coverUrl: pages[0]!.url,
                fileSize: uploadImages.reduce((sum, img) => sum + img.file.size, 0),
                pageCount: pages.length,
            }),
        });
    };

    const handleUpload = async () => {
        if ((!uploadFile && uploadImages.length === 0) || !uploadForm.title) return;

        try {
            setIsUploading(true);
            if (uploadFile) {
                await uploadPdfScore();
            } else {
                await uploadImageScore();
            }
            setIsUploadDialogOpen(false);
            resetUploadDialog();
            fetchScores();
        } catch (error) {
            console.error("Upload failed:", error);
            alert("上传失败，请重试");
        } finally {
            setIsUploading(false);
            setUploadProgress(null);
        }
    };

    /* ── Edit handler ── */

    const handleEdit = (score: MusicScore) => {
        setEditingScore({ ...score });
        setEditPages(
            score.fileType === "images"
                ? (score.pages ?? []).map((page) => ({
                      id: makeId(),
                      key: page.key,
                      url: page.url,
                      size: page.size,
                  }))
                : []
        );
        setIsEditDialogOpen(true);
    };

    const closeEditDialog = useCallback(() => {
        setEditPages((prev) => {
            // 新增未保存的页释放本地预览 URL
            prev.forEach((page) => {
                if (page.file) URL.revokeObjectURL(page.url);
            });
            return [];
        });
        setIsEditDialogOpen(false);
        setEditingScore(null);
    }, []);

    const addEditImages = (files: File[]) => {
        const images = files.filter((file) => IMAGE_TYPES.includes(file.type));
        if (images.length === 0) return;
        setEditPages((prev) => [
            ...prev,
            ...images.map((file) => ({
                id: makeId(),
                url: URL.createObjectURL(file),
                file,
            })),
        ]);
    };

    const handleSaveEdit = async () => {
        if (!editingScore) return;
        const isImageScore = editingScore.fileType === "images";
        if (isImageScore && editPages.length === 0) {
            alert("图片乐谱至少保留一页");
            return;
        }
        try {
            setIsSavingEdit(true);

            let pages: ScorePage[] | undefined;
            if (isImageScore) {
                // 先把新增的图片传到 COS，再按当前顺序组装整组页面
                const newOnes = editPages.filter((page) => page.file);
                const uploaded =
                    newOnes.length > 0
                        ? await uploadImageFiles(newOnes.map((page) => page.file!))
                        : [];
                const uploadedById = new Map(
                    newOnes.map((page, i) => [page.id, uploaded[i]!])
                );
                pages = editPages.map((page) => {
                    const fresh = uploadedById.get(page.id);
                    if (fresh) return fresh;
                    return {
                        key: page.key!,
                        url: page.url,
                        ...(typeof page.size === "number" ? { size: page.size } : {}),
                    };
                });
            }

            await fetchClient(`/music-scores/${editingScore.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    title: editingScore.title,
                    composer: editingScore.composer?.trim() || null,
                    instrument: editingScore.instrument,
                    ...(pages ? { pages } : {}),
                }),
            });
            closeEditDialog();
            fetchScores();
        } catch (error) {
            console.error("Failed to save:", error);
            alert("保存失败，请重试");
        } finally {
            setIsSavingEdit(false);
        }
    };

    /* ── Delete handler ── */

    const handleDelete = async (id: string) => {
        if (!window.confirm("确定要删除这个乐谱吗？文件也会从云端删除。")) return;
        try {
            await fetchClient(`/music-scores/${id}`, { method: "DELETE" });
            fetchScores();
        } catch (error) {
            console.error("Failed to delete:", error);
        }
    };

    /* ── Render ── */

    return (
        <div className="min-h-screen bg-gradient-to-br from-amber-50/60 via-orange-50/40 to-yellow-50/60">
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
                                                ? "bg-amber-500 text-white shadow-sm"
                                                : "text-gray-600 hover:text-gray-900"
                                        }`}
                                    >
                                        {inst.label}
                                    </button>
                                ))}
                            </div>
                            <Button
                                onClick={() => setIsUploadDialogOpen(true)}
                                className="bg-amber-500 hover:bg-amber-600 text-white"
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
                            <div className="w-8 h-8 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin mx-auto mb-3" />
                            加载中...
                        </div>
                    ) : scores.length > 0 ? (
                        scores.map((score) => (
                            <div
                                key={score.id}
                                className="group grid grid-cols-[1fr_160px_100px_80px_80px_40px] gap-3 px-4 py-3 border-b border-gray-100 hover:bg-amber-50/40 transition-all"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 bg-gradient-to-br from-amber-100 to-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        {score.fileType === "images" ? (
                                            <ImageIcon className="w-5 h-5 text-amber-600" />
                                        ) : (
                                            <FileText className="w-5 h-5 text-amber-600" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-medium text-gray-900 text-sm leading-tight truncate">
                                            {score.title}
                                        </h3>
                                        {score.composer && (
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                {score.composer}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs px-2 py-1 bg-amber-50 text-amber-700 rounded-md">
                                        {score.instrument}
                                    </span>
                                    {score.fileType === "images" && (
                                        <span className="text-xs px-2 py-1 bg-sky-50 text-sky-600 rounded-md">
                                            图片
                                        </span>
                                    )}
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
                                                onClick={() => {
                                                    if (
                                                        score.fileType === "images" &&
                                                        score.pages?.length
                                                    ) {
                                                        setImagePreview({
                                                            urls: score.pages.map(
                                                                (page) => page.url
                                                            ),
                                                            index: 0,
                                                        });
                                                    } else {
                                                        window.open(
                                                            score.fileUrl,
                                                            "_blank"
                                                        );
                                                    }
                                                }}
                                            >
                                                <FileText className="w-4 h-4 mr-2" />
                                                {score.fileType === "images"
                                                    ? "预览图片"
                                                    : "预览 PDF"}
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
            <Dialog
                open={isUploadDialogOpen}
                onOpenChange={(open) => {
                    if (!open && isUploading) return;
                    setIsUploadDialogOpen(open);
                    if (!open) resetUploadDialog();
                }}
            >
                <DialogContent
                    className={`max-h-[85vh] w-[calc(100vw-2rem)] overflow-y-auto overflow-x-hidden ${
                        uploadImages.length > 0 ? "max-w-xl" : "max-w-md"
                    }`}
                >
                    <DialogHeader>
                        <DialogTitle>上传乐谱</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>文件（PDF 或图片）</Label>
                            <input
                                ref={uploadFileInputRef}
                                type="file"
                                accept=".pdf,application/pdf,image/jpeg,image/png,image/webp,image/gif"
                                multiple
                                onChange={(e) => {
                                    addUploadFiles(Array.from(e.target.files ?? []));
                                    e.target.value = "";
                                }}
                                className="sr-only"
                            />
                            <div
                                onClick={() => uploadFileInputRef.current?.click()}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setIsDraggingOver(true);
                                }}
                                onDragLeave={() => setIsDraggingOver(false)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setIsDraggingOver(false);
                                    addUploadFiles(Array.from(e.dataTransfer.files));
                                }}
                                className={`mt-1.5 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
                                    isDraggingOver
                                        ? "border-amber-400 bg-amber-50"
                                        : "border-gray-200 bg-gray-50/60 hover:border-amber-300 hover:bg-amber-50/40"
                                }`}
                            >
                                {uploadFile ? (
                                    <>
                                        <FileText className="h-6 w-6 text-amber-500" />
                                        <p className="break-all text-sm font-medium text-gray-700">
                                            {uploadFile.name}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            {formatFileSize(uploadFile.size)} · 点击可重新选择
                                        </p>
                                    </>
                                ) : uploadImages.length > 0 ? (
                                    <>
                                        <ImageIcon className="h-6 w-6 text-amber-500" />
                                        <p className="text-sm font-medium text-gray-700">
                                            已选 {uploadImages.length} 张图片
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            继续点击、拖拽或粘贴可追加
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <Upload className="h-6 w-6 text-gray-400" />
                                        <p className="text-sm text-gray-600">
                                            点击选择、拖拽或粘贴（Ctrl+V）
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            支持 PDF，或多张图片（JPG / PNG / WebP / GIF）
                                        </p>
                                    </>
                                )}
                            </div>
                            {uploadImages.length > 0 && (
                                <div className="mt-3 space-y-2">
                                    <div className="flex items-center justify-between text-xs text-gray-500">
                                        <span>拖拽调整顺序 · 点击图片检查大图</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                uploadImages.forEach((img) =>
                                                    URL.revokeObjectURL(img.previewUrl)
                                                );
                                                setUploadImages([]);
                                            }}
                                            className="text-gray-400 hover:text-red-500"
                                        >
                                            清空
                                        </button>
                                    </div>
                                    <PageThumbGrid
                                        items={uploadImages.map((img) => ({
                                            id: img.id,
                                            url: img.previewUrl,
                                        }))}
                                        onMove={(from, to) =>
                                            setUploadImages((prev) => moveItem(prev, from, to))
                                        }
                                        onRemove={(index) =>
                                            setUploadImages((prev) => {
                                                const target = prev[index];
                                                if (target)
                                                    URL.revokeObjectURL(target.previewUrl);
                                                return prev.filter((_, i) => i !== index);
                                            })
                                        }
                                        onPreview={(index) =>
                                            setImagePreview({
                                                urls: uploadImages.map(
                                                    (img) => img.previewUrl
                                                ),
                                                index,
                                            })
                                        }
                                    />
                                </div>
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
                            onClick={() => {
                                setIsUploadDialogOpen(false);
                                resetUploadDialog();
                            }}
                            disabled={isUploading}
                        >
                            取消
                        </Button>
                        <Button
                            onClick={handleUpload}
                            disabled={
                                (!uploadFile && uploadImages.length === 0) ||
                                !uploadForm.title ||
                                isUploading
                            }
                        >
                            {isUploading
                                ? uploadProgress
                                    ? `上传中 ${uploadProgress.done}/${uploadProgress.total}...`
                                    : "上传中..."
                                : uploadImages.length > 0
                                  ? `上传 ${uploadImages.length} 张图片`
                                  : "上传"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 编辑对话框 */}
            <Dialog
                open={isEditDialogOpen}
                onOpenChange={(open) => {
                    if (!open && isSavingEdit) return;
                    if (!open) closeEditDialog();
                }}
            >
                <DialogContent
                    className={`max-h-[85vh] w-[calc(100vw-2rem)] overflow-y-auto overflow-x-hidden ${
                        editingScore?.fileType === "images" ? "max-w-xl" : "max-w-md"
                    }`}
                >
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
                                <Label>作曲家 <span className="text-gray-400 font-normal">可选</span></Label>
                                <Input
                                    value={editingScore.composer ?? ""}
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
                            {editingScore.fileType === "images" && (
                                <div>
                                    <div className="flex items-center justify-between">
                                        <Label>
                                            页面顺序{" "}
                                            <span className="font-normal text-gray-400">
                                                共 {editPages.length} 页
                                            </span>
                                        </Label>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                editImageInputRef.current?.click()
                                            }
                                            className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700"
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                            添加图片
                                        </button>
                                    </div>
                                    <input
                                        ref={editImageInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,image/gif"
                                        multiple
                                        onChange={(e) => {
                                            addEditImages(
                                                Array.from(e.target.files ?? [])
                                            );
                                            e.target.value = "";
                                        }}
                                        className="sr-only"
                                    />
                                    <p className="mb-2 mt-1 text-xs text-gray-400">
                                        拖拽调整顺序 · 点击图片查看大图 ·
                                        新增页保存时才会上传
                                    </p>
                                    <PageThumbGrid
                                        items={editPages.map((page) => ({
                                            id: page.id,
                                            url: page.url,
                                            isNew: !!page.file,
                                        }))}
                                        onMove={(from, to) =>
                                            setEditPages((prev) =>
                                                moveItem(prev, from, to)
                                            )
                                        }
                                        onRemove={(index) =>
                                            setEditPages((prev) => {
                                                const target = prev[index];
                                                if (target?.file)
                                                    URL.revokeObjectURL(target.url);
                                                return prev.filter(
                                                    (_, i) => i !== index
                                                );
                                            })
                                        }
                                        onPreview={(index) =>
                                            setImagePreview({
                                                urls: editPages.map(
                                                    (page) => page.url
                                                ),
                                                index,
                                            })
                                        }
                                    />
                                </div>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={closeEditDialog}
                            disabled={isSavingEdit}
                        >
                            取消
                        </Button>
                        <Button onClick={handleSaveEdit} disabled={isSavingEdit}>
                            {isSavingEdit ? "保存中..." : "保存"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 大图预览 */}
            {imagePreview && (
                <ImagePreviewOverlay
                    urls={imagePreview.urls}
                    index={imagePreview.index}
                    onNavigate={(index) =>
                        setImagePreview((prev) => (prev ? { ...prev, index } : prev))
                    }
                    onClose={() => setImagePreview(null)}
                />
            )}
        </div>
    );
}
