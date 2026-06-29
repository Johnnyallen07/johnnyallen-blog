"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowLeft,
    Upload,
    X,
    FileAudio,
    CheckCircle2,
    AlertCircle,
    Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface UploadFile {
    file: File;
    id: string;
    title: string;
    status: "pending" | "uploading" | "done" | "error" | "duplicate";
    progress: number;
    speed: string; // e.g. "1.2 MB/s"
    key?: string;
    publicUrl?: string;
}

interface SidebarEntity {
    id: string;
    name: string;
    slug: string;
}

/* ── Constants ── */

const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30 MB

/* ── Helpers ── */

function getAudioDuration(file: File): Promise<number> {
    return new Promise((resolve) => {
        const audio = new Audio();
        audio.addEventListener("loadedmetadata", () => {
            resolve(Math.round(audio.duration));
            URL.revokeObjectURL(audio.src);
        });
        audio.addEventListener("error", () => resolve(0));
        audio.src = URL.createObjectURL(file);
    });
}

function stripExtension(name: string) {
    return name.replace(/\.[^.]+$/, "");
}

function formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond >= 1024 * 1024) {
        return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    if (bytesPerSecond >= 1024) {
        return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`;
    }
    return `${bytesPerSecond.toFixed(0)} B/s`;
}

/** 使用 XMLHttpRequest 上传文件到 COS，支持进度回调 */
function uploadWithProgress(
    url: string,
    file: File,
    onProgress: (percent: number, speed: string) => void,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let lastLoaded = 0;
        let lastTime = Date.now();

        xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                const now = Date.now();
                const elapsed = (now - lastTime) / 1000; // seconds
                if (elapsed > 0.3) {
                    const bytesPerSecond = (e.loaded - lastLoaded) / elapsed;
                    lastLoaded = e.loaded;
                    lastTime = now;
                    onProgress(percent, formatSpeed(bytesPerSecond));
                } else {
                    onProgress(percent, "");
                }
            }
        });

        xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                onProgress(100, "");
                resolve();
            } else {
                reject(new Error(`COS upload failed: ${xhr.status} ${xhr.statusText}`));
            }
        });

        xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
        xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));

        xhr.open("PUT", url);
        xhr.setRequestHeader("Content-Type", "audio/mpeg");
        xhr.timeout = 5 * 60 * 1000; // 5 minutes timeout
        xhr.addEventListener("timeout", () =>
            reject(new Error("Upload timed out (5 min)"))
        );
        xhr.send(file);
    });
}

/* ── Page ── */

export default function MusicUploadPage() {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [files, setFiles] = useState<UploadFile[]>([]);
    const [musician, setMusician] = useState("");
    const [performer, setPerformer] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [seriesId, setSeriesId] = useState("");
    const [isUploading, setIsUploading] = useState(false);

    // sidebar entities for dropdowns
    const [categories, setCategories] = useState<SidebarEntity[]>([]);
    const [seriesList, setSeriesList] = useState<SidebarEntity[]>([]);

    const fetchDropdowns = useCallback(async () => {
        try {
            const [cats, srs] = await Promise.all([
                fetchClient("/music-categories"),
                fetchClient("/music-series"),
            ]);
            setCategories(Array.isArray(cats) ? cats : []);
            setSeriesList(Array.isArray(srs) ? srs : []);
        } catch {
            /* ignore */
        }
    }, []);

    useEffect(() => {
        fetchDropdowns();
    }, [fetchDropdowns]);

    /* ── File handling ── */

    const handleFileSelect = async (newFiles: FileList | null) => {
        if (!newFiles) return;
        const allMp3s = Array.from(newFiles).filter(
            (f) =>
                f.type === "audio/mpeg" ||
                f.name.toLowerCase().endsWith(".mp3")
        );

        // Filter by size limit
        const oversized = allMp3s.filter((f) => f.size > MAX_FILE_SIZE);
        const mp3s = allMp3s.filter((f) => f.size <= MAX_FILE_SIZE);
        if (oversized.length > 0) {
            alert(
                `以下文件超过 30MB 限制，已跳过：\n${oversized.map((f) => `${f.name} (${(f.size / (1024 * 1024)).toFixed(1)} MB)`).join("\n")}`
            );
        }
        if (mp3s.length === 0) return;

        const additions: UploadFile[] = mp3s.map((f) => ({
            file: f,
            id: crypto.randomUUID(),
            title: stripExtension(f.name),
            status: "pending" as const,
            progress: 0,
            speed: "",
        }));

        // Deduplicate within the new batch + against existing files in the list
        const seenTitles = new Set<string>();
        setFiles((prev) => {
            prev.forEach((f) => seenTitles.add(f.title));
            return prev;
        });

        // Check each new file title against DB
        for (const af of additions) {
            if (seenTitles.has(af.title)) {
                af.status = "duplicate";
                continue;
            }
            seenTitles.add(af.title);

            try {
                const res = await fetchClient(
                    `/music/check-title?title=${encodeURIComponent(af.title)}`
                );
                if (res?.exists) {
                    af.status = "duplicate";
                }
            } catch {
                // If check fails, keep as pending
            }
        }

        setFiles((prev) => [...prev, ...additions]);
    };

    const removeFile = (id: string) => {
        setFiles((prev) => prev.filter((f) => f.id !== id));
    };

    const updateFileTitle = (id: string, newTitle: string) => {
        setFiles((prev) =>
            prev.map((f) => (f.id === id ? { ...f, title: newTitle } : f))
        );
    };

    /* ── Upload flow ── */

    const selectedCategory =
        categories.find((c) => c.id === categoryId)?.name || "";
    const selectedSeries =
        seriesList.find((s) => s.id === seriesId)?.name || "";

    const handleSubmit = async () => {
        if (files.length === 0 || !musician || !performer || !categoryId) return;
        setIsUploading(true);

        const uploadList = [...files];
        let successCount = 0;

        for (let i = 0; i < uploadList.length; i++) {
            const uf = uploadList[i];
            if (!uf) continue;

            // 1. Check for duplicate title
            try {
                const checkRes = await fetchClient(
                    `/music/check-title?title=${encodeURIComponent(uf.title)}`
                );
                if (checkRes?.exists) {
                    setFiles((prev) =>
                        prev.map((f) =>
                            f.id === uf.id
                                ? { ...f, status: "duplicate" as const, progress: 0, speed: "" }
                                : f
                        )
                    );
                    continue;
                }
            } catch {
                // If check fails, proceed with upload
            }

            // 2. Upload to COS
            setFiles((prev) =>
                prev.map((f) =>
                    f.id === uf.id ? { ...f, status: "uploading" as const, progress: 0, speed: "" } : f
                )
            );

            try {
                const { uploadUrl, key, publicUrl } = await fetchClient(
                    "/music/upload-url",
                    {
                        method: "POST",
                        body: JSON.stringify({ fileName: uf.file.name }),
                    }
                );

                await uploadWithProgress(
                    uploadUrl,
                    uf.file,
                    (percent, speed) => {
                        setFiles((prev) =>
                            prev.map((f) =>
                                f.id === uf.id
                                    ? { ...f, progress: percent, speed: speed || f.speed }
                                    : f
                            )
                        );
                    },
                );

                // 3. Immediately save to DB after successful COS upload
                const dur = await getAudioDuration(uf.file);
                await fetchClient("/music", {
                    method: "POST",
                    body: JSON.stringify({
                        title: uf.title,
                        musician,
                        performer,
                        category: selectedCategory,
                        series: selectedSeries || undefined,
                        duration: dur,
                        fileKey: key,
                        fileUrl: publicUrl,
                        fileSize: uf.file.size,
                    }),
                });

                successCount++;
                setFiles((prev) =>
                    prev.map((f) =>
                        f.id === uf.id
                            ? { ...f, status: "done" as const, progress: 100, speed: "", key, publicUrl }
                            : f
                    )
                );
            } catch (error) {
                console.error("Upload error:", error);
                setFiles((prev) =>
                    prev.map((f) =>
                        f.id === uf.id ? { ...f, status: "error" as const, progress: 0, speed: "" } : f
                    )
                );
            }
        }

        const duplicateCount = files.filter((f) => f.status === "duplicate").length;
        if (successCount > 0) {
            const msg = duplicateCount > 0
                ? `成功上传 ${successCount} 首音乐！${duplicateCount} 首因标题重复已跳过。`
                : `成功上传 ${successCount} 首音乐！`;
            alert(msg);
            router.push("/music");
        } else if (duplicateCount > 0) {
            alert(`所有曲目标题已存在，已全部跳过。`);
        }

        setIsUploading(false);
    };

    const pendingCount = files.filter((f) => f.status === "pending").length;
    const totalProgress = files.length > 0
        ? Math.round(files.reduce((sum, f) => sum + f.progress, 0) / files.length)
        : 0;

    /* ── Render ── */

    return (
        <div className="min-h-screen bg-gradient-to-br from-amber-50/60 via-orange-50/40 to-yellow-50/60">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-3xl mx-auto px-8 py-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push("/music")}
                    >
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        返回音乐管理
                    </Button>
                </div>
            </div>

            <div className="max-w-3xl mx-auto p-8">
                <h1 className="text-3xl font-bold text-center mb-8">批量上传音乐</h1>

                {/* File picker */}
                <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                    <Label className="mb-2 block font-semibold">
                        MP3 文件 (支持多选)
                    </Label>
                    <div
                        className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-amber-400 transition-colors cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                        onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleFileSelect(e.dataTransfer.files);
                        }}
                    >
                        <Upload className="h-10 w-10 mx-auto mb-3 text-amber-400" />
                        <p className="text-amber-600 font-medium">选择文件 或拖放文件</p>
                        <p className="text-sm text-gray-500 mt-1">单文件 MP3 小于 30MB</p>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".mp3,audio/mpeg"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFileSelect(e.target.files)}
                    />

                    {/* File list with per-file title and progress */}
                    {files.length > 0 && (
                        <div className="mt-4 space-y-2 max-h-[28rem] overflow-y-auto">
                            {files.map((f) => (
                                <div
                                    key={f.id}
                                    className="p-3 rounded-lg bg-gray-50 border border-gray-100"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="flex-shrink-0">
                                            {f.status === "done" ? (
                                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                                            ) : f.status === "error" ? (
                                                <AlertCircle className="h-5 w-5 text-red-500" />
                                            ) : f.status === "duplicate" ? (
                                                <AlertCircle className="h-5 w-5 text-amber-500" />
                                            ) : f.status === "uploading" ? (
                                                <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
                                            ) : (
                                                <FileAudio className="h-5 w-5 text-gray-400" />
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <Input
                                                value={f.title}
                                                onChange={(e) =>
                                                    updateFileTitle(f.id, e.target.value)
                                                }
                                                placeholder="输入标题"
                                                className="h-8 text-sm"
                                                disabled={f.status !== "pending"}
                                            />
                                            <p className="text-xs text-gray-400 mt-0.5 truncate">
                                                {f.file.name} ·{" "}
                                                {(f.file.size / (1024 * 1024)).toFixed(1)} MB
                                            </p>
                                        </div>

                                        {f.status === "pending" && (
                                            <button
                                                onClick={() => removeFile(f.id)}
                                                className="p-1 hover:bg-gray-200 rounded transition-colors"
                                            >
                                                <X className="h-4 w-4 text-gray-500" />
                                            </button>
                                        )}

                                        {f.status === "uploading" && (
                                            <span className="text-xs font-medium text-amber-600 tabular-nums whitespace-nowrap">
                                                {f.progress}%
                                            </span>
                                        )}
                                    </div>

                                    {/* Progress bar */}
                                    {(f.status === "uploading" || f.status === "done") && (
                                        <div className="mt-2">
                                            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-300 ease-out ${f.status === "done"
                                                        ? "bg-green-500"
                                                        : "bg-gradient-to-r from-amber-500 to-amber-500"
                                                        }`}
                                                    style={{ width: `${f.progress}%` }}
                                                />
                                            </div>
                                            {f.status === "uploading" && f.speed && (
                                                <p className="text-xs text-gray-400 mt-1 text-right tabular-nums">
                                                    {f.speed}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {f.status === "error" && (
                                        <p className="mt-1.5 text-xs text-red-500">上传失败，请重试</p>
                                    )}

                                    {f.status === "duplicate" && (
                                        <p className="mt-1.5 text-xs text-amber-600">⚠️ 曲目标题已存在，已跳过</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Common metadata */}
                <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                    <h2 className="text-lg font-semibold mb-4">
                        公共属性{" "}
                        <span className="text-sm font-normal text-gray-500">
                            (应用于所有文件)
                        </span>
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <Label>Musician / Composer *</Label>
                            <Input
                                placeholder="例如 Beethoven"
                                value={musician}
                                onChange={(e) => setMusician(e.target.value)}
                                className="mt-1.5"
                            />
                        </div>
                        <div>
                            <Label>Performer / 演奏者 *</Label>
                            <Input
                                placeholder="输入演奏者名称..."
                                value={performer}
                                onChange={(e) => setPerformer(e.target.value)}
                                className="mt-1.5"
                            />
                        </div>
                        <div>
                            <Label>Category / 分类 *</Label>
                            <Select value={categoryId} onValueChange={setCategoryId}>
                                <SelectTrigger className="mt-1.5">
                                    <SelectValue placeholder="选择分类..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {categories.length === 0 ? (
                                        <SelectItem value="_none" disabled>
                                            暂无分类，请先在侧边栏管理中添加
                                        </SelectItem>
                                    ) : (
                                        categories.map((cat) => (
                                            <SelectItem key={cat.id} value={cat.id}>
                                                {cat.name}
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Series / 系列 (可选)</Label>
                            <Select value={seriesId} onValueChange={setSeriesId}>
                                <SelectTrigger className="mt-1.5">
                                    <SelectValue placeholder="选择系列..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="_none">无系列</SelectItem>
                                    {seriesList.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>
                                            {s.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                {/* Submit */}
                <Button
                    onClick={handleSubmit}
                    disabled={
                        files.length === 0 ||
                        !musician ||
                        !performer ||
                        !categoryId ||
                        isUploading
                    }
                    className="w-full h-14 text-lg font-semibold bg-amber-500 hover:bg-amber-600 disabled:opacity-50"
                >
                    {isUploading ? (
                        <>
                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                            上传中 {totalProgress}%
                        </>
                    ) : (
                        `提交 (${pendingCount} 个文件)`
                    )}
                </Button>
            </div>
        </div>
    );
}

