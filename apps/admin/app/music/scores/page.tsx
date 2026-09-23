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
    Camera,
    Eye,
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
import { ScoreReader } from "@repo/ui/score-reader";
import { cropStrokes, type PageAnnotations, type ScoreDocument } from "@repo/ui/score-model";
import { ImageCropper, captureScoreImage } from "@/components/scores/image-cropper";
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
    annotations?: PageAnnotations[] | null;
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
    const editPagesRef = useRef(editPages);
    editPagesRef.current = editPages;
    useEffect(() => () => {
        uploadImagesRef.current.forEach(image => URL.revokeObjectURL(image.previewUrl));
        editPagesRef.current.forEach(page => { if (page.file) URL.revokeObjectURL(page.url); });
    }, []);
    const editImageInputRef = useRef<HTMLInputElement | null>(null);

    /* ── 大图预览（上传/编辑共用） ── */
    const [imagePreview, setImagePreview] = useState<{ source: "upload" | "edit"; index: number } | null>(null);
    const [reader, setReader] = useState<{ source: "upload" | "edit" | "saved"; score: ScoreDocument; id?: string } | null>(null);
    const [uploadAnnotations, setUploadAnnotations] = useState<PageAnnotations[]>([]);
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
    const [capturing, setCapturing] = useState(false);
    const [captureError, setCaptureError] = useState("");

    useEffect(() => {
        if (!uploadFile) { setPdfPreviewUrl(""); return; }
        const url = URL.createObjectURL(uploadFile);
        setPdfPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [uploadFile]);

    const previewUpload = () => setReader({ source: "upload", score: {
        title: uploadForm.title || "乐谱预览",
        fileType: uploadFile ? "pdf" : "images",
        fileUrl: pdfPreviewUrl,
        pages: uploadImages.map(image => ({ key: image.id, url: image.previewUrl })),
        annotations: uploadAnnotations,
    } });
    const previewEdit = () => {
        if (!editingScore) return;
        setReader({ source: "edit", score: { ...editingScore,
            pages: editPages.map(page => ({ key: page.id, url: page.url })),
        } });
    };

    const capture = async (source: "upload" | "edit") => {
        setCapturing(true); setCaptureError("");
        try {
            const file = await captureScoreImage();
            const id = makeId(), url = URL.createObjectURL(file);
            if (source === "upload") {
                if (uploadFile) setUploadAnnotations([]);
                setUploadFile(null);
                setUploadImages(previous => [...previous, { id, file, previewUrl: url }]);
                setUploadForm(previous => ({ ...previous, title: previous.title || "截图乐谱" }));
                setImagePreview({ source, index: uploadImages.length });
            } else {
                setEditPages(previous => [...previous, { id, file, url }]);
                setImagePreview({ source, index: editPages.length });
            }
        } catch (error) {
            if (!(error instanceof DOMException && error.name === "NotAllowedError")) setCaptureError(error instanceof Error ? error.message : "截图失败，请重试。");
        } finally { setCapturing(false); }
    };

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
            setUploadAnnotations([]);
            setUploadForm((prev) =>
                prev.title
                    ? prev
                    : { ...prev, title: pdf.name.replace(/\.pdf$/i, "") }
            );
            return;
        }

        if (images.length > 0) {
            setUploadAnnotations(previous => previous.filter(item => !item.page.startsWith("pdf:")));
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
        if (!isUploadDialogOpen || reader || imagePreview || isUploading || capturing) return;
        const onPaste = (e: globalThis.ClipboardEvent) => {
            const files = Array.from(e.clipboardData?.files ?? []);
            if (files.length > 0) {
                e.preventDefault();
                addUploadFiles(files);
            }
        };
        window.addEventListener("paste", onPaste);
        return () => window.removeEventListener("paste", onPaste);
    }, [isUploadDialogOpen, addUploadFiles, reader, imagePreview, isUploading, capturing]);

    // 关闭对话框时释放本地预览 URL
    const resetUploadDialog = useCallback(() => {
        uploadImagesRef.current.forEach((img) =>
            URL.revokeObjectURL(img.previewUrl)
        );
        setUploadImages([]);
        setUploadFile(null);
        setUploadForm({ title: "", instrument: "小提琴" });
        setUploadProgress(null);
        setUploadAnnotations([]);
        setCaptureError("");
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
            await pdf.destroy();
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
                annotations: uploadAnnotations,
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
                annotations: uploadAnnotations.flatMap(item => {
                    const index = uploadImages.findIndex(image => image.id === item.page);
                    return index < 0 ? [] : [{ ...item, page: pages[index]!.key }];
                }),
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
                      id: page.key,
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
                    annotations: pages ? (editingScore.annotations ?? []).flatMap(item => {
                        const index = editPages.findIndex(page => page.id === item.page);
                        return index < 0 ? [] : [{ ...item, page: pages[index]!.key }];
                    }) : editingScore.annotations ?? [],
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
                                        <button type="button" onClick={() => setReader({ source: "saved", score, id: score.id })} className="max-w-full truncate text-left text-sm font-medium leading-tight text-gray-900 hover:text-amber-600">{score.title}</button>
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
                                            <button className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors opacity-100">
                                                <MoreVertical className="w-4 h-4 text-gray-500" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => setReader({ source: "saved", score, id: score.id })}>
                                                <Eye className="w-4 h-4 mr-2" />
                                                阅读与批注
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
                    if (!open && (isUploading || capturing || reader || imagePreview)) return;
                    setIsUploadDialogOpen(open);
                    if (!open) resetUploadDialog();
                }}
            >
                <DialogContent
                    className={`max-h-[85vh] w-[calc(100vw-2rem)] overflow-y-auto overflow-x-hidden ${
                        "sm:max-w-3xl"
                    }`}
                >
                    <DialogHeader>
                        <DialogTitle>上传乐谱</DialogTitle>
                    </DialogHeader>
                    <fieldset disabled={isUploading || capturing} className="space-y-4">
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
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Button type="button" variant="outline" onClick={() => void capture("upload")} disabled={capturing || isUploading}>
                                    <Camera className="mr-2 h-4 w-4" />{capturing ? "正在截图…" : "截取屏幕 / 窗口"}
                                </Button>
                                <Button type="button" variant="outline" onClick={previewUpload} disabled={(!uploadFile && !uploadImages.length) || (!!uploadFile && !pdfPreviewUrl) || isUploading}>
                                    <Eye className="mr-2 h-4 w-4" />预览与批注
                                </Button>
                            </div>
                            <p className="mt-2 text-xs text-gray-500">可用系统截图后 Ctrl / ⌘ V 粘贴；点击图片裁剪，再预览完整乐谱。</p>
                            {captureError && <p role="alert" className="mt-2 text-sm text-red-600">{captureError}</p>}
                            {uploadImages.length > 0 && (
                                <div className="mt-3 space-y-2">
                                    <div className="flex items-center justify-between text-xs text-gray-500">
                                        <span>拖拽调整顺序 · 点击图片裁剪</span>
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
                                                source: "upload",
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
                    </fieldset>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setIsUploadDialogOpen(false);
                                resetUploadDialog();
                            }}
                            disabled={isUploading || capturing}
                        >
                            取消
                        </Button>
                        <Button
                            onClick={handleUpload}
                            disabled={
                                (!uploadFile && uploadImages.length === 0) ||
                                !uploadForm.title ||
                                isUploading || capturing
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
                    if (!open && (isSavingEdit || capturing || reader || imagePreview)) return;
                    if (!open) closeEditDialog();
                }}
            >
                <DialogContent
                    className={`max-h-[85vh] w-[calc(100vw-2rem)] overflow-y-auto overflow-x-hidden ${
                        "sm:max-w-3xl"
                    }`}
                >
                    <DialogHeader>
                        <DialogTitle>编辑乐谱信息</DialogTitle>
                    </DialogHeader>
                    {editingScore && (
                        <fieldset disabled={isSavingEdit || capturing} className="space-y-4">
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
                            <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="outline" onClick={previewEdit} disabled={isSavingEdit || (editingScore.fileType === "images" && !editPages.length)}><Eye className="mr-2 h-4 w-4" />阅读与批注</Button>
                                {editingScore.fileType === "images" && <Button type="button" variant="outline" onClick={() => void capture("edit")} disabled={capturing || isSavingEdit}><Camera className="mr-2 h-4 w-4" />{capturing ? "正在截图…" : "截图加页"}</Button>}
                            </div>
                            {captureError && <p role="alert" className="text-sm text-red-600">{captureError}</p>}
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
                                        拖拽调整顺序 · 点击图片裁剪 ·
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
                                                source: "edit",
                                                index,
                                            })
                                        }
                                    />
                                </div>
                            )}
                        </fieldset>
                    )}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={closeEditDialog}
                            disabled={isSavingEdit || capturing}
                        >
                            取消
                        </Button>
                        <Button onClick={handleSaveEdit} disabled={isSavingEdit || capturing}>
                            {isSavingEdit ? "保存中..." : "保存"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!reader} onOpenChange={() => {}}>
                <DialogContent aria-describedby={undefined} className="!inset-0 !h-dvh !w-screen !max-w-none !translate-x-0 !translate-y-0 overflow-hidden rounded-none border-0 p-0 [&>button]:hidden" onEscapeKeyDown={event => event.preventDefault()} onPointerDownOutside={event => event.preventDefault()}>
                    <DialogTitle className="sr-only">{reader?.score.title ?? "乐谱预览"}</DialogTitle>
                    {reader && <ScoreReader score={reader.score} locale="zh" onClose={() => setReader(null)} saveLabel={reader.source === "saved" ? "保存批注" : "应用到待保存乐谱"} onSave={async annotations => {
                        if (reader.source === "saved") {
                            await fetchClient(`/music-scores/${reader.id}`, { method: "PATCH", body: JSON.stringify({ annotations }) });
                            setScores(previous => previous.map(score => score.id === reader.id ? { ...score, annotations } : score));
                        } else if (reader.source === "upload") {
                            setUploadAnnotations(annotations); setReader(null);
                        } else {
                            setEditingScore(previous => previous ? { ...previous, annotations } : previous); setReader(null);
                        }
                    }} />}
                </DialogContent>
            </Dialog>
            <Dialog open={!!imagePreview} onOpenChange={open => { if (!open) setImagePreview(null); }}>
                <DialogContent aria-describedby={undefined} className="w-[95vw] overflow-hidden border-0 bg-slate-950 p-0 sm:max-w-6xl [&>button]:hidden">
                    <DialogTitle className="sr-only">裁剪乐谱图片</DialogTitle>
                    {imagePreview && <ImageCropper url={imagePreview.source === "upload" ? uploadImages[imagePreview.index]!.previewUrl : editPages[imagePreview.index]!.url} onClose={() => setImagePreview(null)} onApply={(file, rect) => {
                        const url = URL.createObjectURL(file);
                        if (imagePreview.source === "upload") {
                            const target = uploadImages[imagePreview.index]!;
                            setUploadImages(previous => previous.map(image => image.id === target.id ? { ...image, file, previewUrl: url } : image));
                            setUploadAnnotations(previous => previous.map(item => item.page === target.id ? { ...item, strokes: cropStrokes(item.strokes, rect) } : item));
                            URL.revokeObjectURL(target.previewUrl);
                        } else {
                            const target = editPages[imagePreview.index]!;
                            setEditPages(previous => previous.map(page => page.id === target.id ? { ...page, file, url } : page));
                            setEditingScore(previous => previous ? { ...previous, annotations: (previous.annotations ?? []).map(item => item.page === target.id ? { ...item, strokes: cropStrokes(item.strokes, rect) } : item) } : previous);
                            if (target.file) URL.revokeObjectURL(target.url);
                        }
                        setImagePreview(null);
                    }} />}
                </DialogContent>
            </Dialog>
        </div>
    );
}
