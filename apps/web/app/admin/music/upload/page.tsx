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
    status: "pending" | "uploading" | "done" | "error";
    progress: number;
    key?: string;
    publicUrl?: string;
}

interface SidebarEntity {
    id: string;
    name: string;
    slug: string;
}

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

    const handleFileSelect = (newFiles: FileList | null) => {
        if (!newFiles) return;
        const mp3s = Array.from(newFiles).filter(
            (f) =>
                f.type === "audio/mpeg" ||
                f.name.toLowerCase().endsWith(".mp3")
        );
        const additions: UploadFile[] = mp3s.map((f) => ({
            file: f,
            id: crypto.randomUUID(),
            title: stripExtension(f.name),
            status: "pending" as const,
            progress: 0,
        }));
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

        // take a local copy
        const uploadedFiles: UploadFile[] = [...files];

        for (let i = 0; i < uploadedFiles.length; i++) {
            const uf = uploadedFiles[i];
            if (!uf) continue;

            setFiles((prev) =>
                prev.map((f) =>
                    f.id === uf.id ? { ...f, status: "uploading" as const } : f
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

                const uploadRes = await fetch(uploadUrl, {
                    method: "PUT",
                    body: uf.file,
                    headers: { "Content-Type": "audio/mpeg" },
                });
                if (!uploadRes.ok) throw new Error("COS upload failed");

                uploadedFiles[i] = {
                    file: uf.file,
                    id: uf.id,
                    title: uf.title,
                    status: "done",
                    progress: 100,
                    key,
                    publicUrl,
                };

                setFiles((prev) =>
                    prev.map((f) =>
                        f.id === uf.id
                            ? { ...f, status: "done" as const, progress: 100, key, publicUrl }
                            : f
                    )
                );
            } catch (error) {
                console.error("Upload error:", error);
                uploadedFiles[i] = {
                    file: uf.file,
                    id: uf.id,
                    title: uf.title,
                    status: "error",
                    progress: 0,
                };
                setFiles((prev) =>
                    prev.map((f) =>
                        f.id === uf.id ? { ...f, status: "error" as const } : f
                    )
                );
            }
        }

        // batch create records for successfully uploaded files
        const successFiles = uploadedFiles.filter(
            (f) => f.status === "done" && f.key && f.publicUrl
        );

        if (successFiles.length > 0) {
            try {
                const dtos = await Promise.all(
                    successFiles.map(async (sf) => {
                        const dur = await getAudioDuration(sf.file);
                        return {
                            title: sf.title,
                            musician,
                            performer,
                            category: selectedCategory,
                            series: selectedSeries || undefined,
                            duration: dur,
                            fileKey: sf.key!,
                            fileUrl: sf.publicUrl!,
                            fileSize: sf.file.size,
                        };
                    })
                );
                await fetchClient("/music/batch", {
                    method: "POST",
                    body: JSON.stringify(dtos),
                });
                alert(`成功上传 ${successFiles.length} 首音乐！`);
                router.push("/admin/music");
            } catch (error) {
                console.error("Batch create error:", error);
                alert("文件已上传，但创建记录失败");
            }
        }

        setIsUploading(false);
    };

    const pendingCount = files.filter((f) => f.status === "pending").length;

    /* ── Render ── */

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-cyan-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-3xl mx-auto px-8 py-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push("/admin/music")}
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
                        className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-purple-400 transition-colors cursor-pointer"
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
                        <Upload className="h-10 w-10 mx-auto mb-3 text-purple-400" />
                        <p className="text-purple-600 font-medium">选择文件 或拖放文件</p>
                        <p className="text-sm text-gray-500 mt-1">单文件 MP3 小于 50MB</p>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".mp3,audio/mpeg"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFileSelect(e.target.files)}
                    />

                    {/* File list with per-file title */}
                    {files.length > 0 && (
                        <div className="mt-4 space-y-2 max-h-80 overflow-y-auto">
                            {files.map((f) => (
                                <div
                                    key={f.id}
                                    className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100"
                                >
                                    <div className="flex-shrink-0">
                                        {f.status === "done" ? (
                                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                                        ) : f.status === "error" ? (
                                            <AlertCircle className="h-5 w-5 text-red-500" />
                                        ) : f.status === "uploading" ? (
                                            <Loader2 className="h-5 w-5 text-purple-500 animate-spin" />
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
                    className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 disabled:opacity-50"
                >
                    {isUploading ? (
                        <>
                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                            上传中...
                        </>
                    ) : (
                        `提交 (${pendingCount} 个文件)`
                    )}
                </Button>
            </div>
        </div>
    );
}
