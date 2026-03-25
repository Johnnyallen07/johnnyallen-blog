"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    Loader2,
    Send,
    ArrowLeft,
    Brain,
    FileText,
    MessageSquare,
    Upload,
    CheckCircle,
    XCircle,
    RotateCcw,
    Download,
    Tag,
    FolderOpen,
    ChevronRight,
    Eye,
    Code,
    X,
    Paperclip,
    ImageIcon,
    File,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchClient } from "@/lib/api";

/* ─────────────────────── Types ─────────────────────── */

type Step = "form" | "preview" | "submit" | "done";

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

interface UploadResult {
    pdfUrl: string;
    key: string;
    fileName: string;
    category: string;
    tags: string[];
}

interface ReferenceFile {
    mimeType: string;
    data: string; // raw base64 without data URI prefix
    fileName: string;
    size: number;
}

/* ─────────────────── Constants ─────────────────── */

const DIFFICULTY_OPTIONS = [
    "Easy",
    "Medium",
    "Hard",
    "University Level",
    "Competition Level",
];

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/* ─────────────────────── Page ─────────────────────── */

export default function AiLatexPage() {
    const router = useRouter();

    /* --- Step management --- */
    const [step, setStep] = useState<Step>("form");

    /* --- Form fields --- */
    const [subject, setSubject] = useState("");
    const [examType, setExamType] = useState("");
    const [topic, setTopic] = useState("");
    const [difficulty, setDifficulty] = useState("Hard");
    const [count, setCount] = useState(3);
    const [referenceQuestions, setReferenceQuestions] = useState("");
    const [referenceFiles, setReferenceFiles] = useState<ReferenceFile[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    /* --- Generation state --- */
    const [sessionId, setSessionId] = useState("");
    const [latexCode, setLatexCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    /* --- Chat state --- */
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState("");
    const [chatLoading, setChatLoading] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);

    /* --- Preview state --- */
    const [previewTab, setPreviewTab] = useState<"code" | "preview">("code");
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
    const [compiling, setCompiling] = useState(false);

    /* --- Submit form state --- */
    const [pdfFileName, setPdfFileName] = useState("");
    const [pdfCategory, setPdfCategory] = useState("AI 生成");
    const [pdfTags, setPdfTags] = useState("");
    const [uploading, setUploading] = useState(false);

    /* --- Done state --- */
    const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

    /* --- Categories from backend --- */
    const [categories, setCategories] = useState<string[]>([]);

    useEffect(() => {
        fetchClient("/categories")
            .then((data) => {
                if (Array.isArray(data)) {
                    const names = data.map(
                        (c: { name: string }) => c.name
                    );
                    if (!names.includes("AI 生成")) {
                        names.unshift("AI 生成");
                    }
                    setCategories(names);
                }
            })
            .catch(() => {
                setCategories(["AI 生成"]);
            });
    }, []);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMessages]);

    /* ──────────────────── File handler ──────────────────── */

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        const MAX_SIZE = 10 * 1024 * 1024; // 10MB per file
        const MAX_FILES = 5;

        if (referenceFiles.length + files.length > MAX_FILES) {
            setError(`最多上传 ${MAX_FILES} 个参考文件`);
            return;
        }

        Array.from(files).forEach((file) => {
            if (file.size > MAX_SIZE) {
                setError(`文件 "${file.name}" 超过 10MB 限制`);
                return;
            }

            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                // Strip "data:xxx;base64," prefix → pure base64
                const base64 = result.split(",")[1] || result;
                setReferenceFiles((prev) => [
                    ...prev,
                    {
                        mimeType: file.type,
                        data: base64,
                        fileName: file.name,
                        size: file.size,
                    },
                ]);
            };
            reader.readAsDataURL(file);
        });

        // Reset input so same file can be re-selected
        e.target.value = "";
    };

    const removeFile = (index: number) => {
        setReferenceFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    /* ──────────────────── Compile preview ──────────────────── */

    const handleCompilePreview = async (latex?: string) => {
        const code = latex ?? latexCode;
        if (!code.trim()) return;
        setCompiling(true);
        try {
            const res = await fetch(`${API_URL}/ai/compile-preview`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ latex: code }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(
                    (data as { message?: string }).message ||
                    `编译失败 (${res.status})`
                );
            }
            const blob = await res.blob();
            // Revoke previous URL to avoid memory leak
            if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
            setPdfPreviewUrl(URL.createObjectURL(blob));
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "PDF 编译失败"
            );
        } finally {
            setCompiling(false);
        }
    };

    /* ──────────────────── Handlers ──────────────────── */

    const handleGenerate = async () => {
        if (!subject.trim() || !examType.trim() || !topic.trim()) {
            setError("请填写学科、考试项目和知识点");
            return;
        }

        setLoading(true);
        setError("");
        setLatexCode("");
        setChatMessages([]);

        try {
            const res = await fetch(`${API_URL}/ai/generate-latex`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    subject: subject.trim(),
                    examType: examType.trim(),
                    topic: topic.trim(),
                    difficulty: difficulty.trim(),
                    count,
                    referenceQuestions: referenceQuestions.trim() || undefined,
                    referenceFiles: referenceFiles.length
                        ? referenceFiles.map((f) => ({
                            mimeType: f.mimeType,
                            data: f.data,
                            fileName: f.fileName,
                        }))
                        : undefined,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(
                    (data as { message?: string }).message ||
                    `请求失败 (${res.status})`
                );
            }

            const data = (await res.json()) as {
                sessionId: string;
                latex: string;
            };
            setSessionId(data.sessionId);
            setLatexCode(data.latex);
            setPdfFileName(
                `${subject}_${examType}_${topic}`.replace(/\s+/g, "_")
            );
            setStep("preview");
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "生成失败，请稍后重试"
            );
        } finally {
            setLoading(false);
        }
    };

    const handleChat = async () => {
        if (!chatInput.trim() || !sessionId) return;

        const userMessage = chatInput.trim();
        setChatInput("");
        setChatMessages((prev) => [
            ...prev,
            { role: "user", content: userMessage },
        ]);
        setChatLoading(true);

        try {
            const res = await fetch(`${API_URL}/ai/chat-latex`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sessionId,
                    message: userMessage,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(
                    (data as { message?: string }).message ||
                    `请求失败 (${res.status})`
                );
            }

            const data = (await res.json()) as { latex: string };
            setLatexCode(data.latex);
            setChatMessages((prev) => [
                ...prev,
                { role: "assistant", content: "已根据你的要求更新了 LaTeX 代码。" },
            ]);
        } catch (err) {
            setChatMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: `错误：${err instanceof Error ? err.message : "修改失败"}`,
                },
            ]);
        } finally {
            setChatLoading(false);
        }
    };

    const handleRegenerate = async () => {
        setLoading(true);
        setError("");

        try {
            const res = await fetch(`${API_URL}/ai/generate-latex`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    subject: subject.trim(),
                    examType: examType.trim(),
                    topic: topic.trim(),
                    difficulty: difficulty.trim(),
                    count,
                    referenceQuestions: referenceQuestions.trim() || undefined,
                    referenceFiles: referenceFiles.length
                        ? referenceFiles.map((f) => ({
                            mimeType: f.mimeType,
                            data: f.data,
                            fileName: f.fileName,
                        }))
                        : undefined,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(
                    (data as { message?: string }).message ||
                    `请求失败 (${res.status})`
                );
            }

            const data = (await res.json()) as {
                sessionId: string;
                latex: string;
            };
            setSessionId(data.sessionId);
            setLatexCode(data.latex);
            setChatMessages([]);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "重新生成失败"
            );
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async () => {
        if (!pdfFileName.trim()) {
            setError("请输入 PDF 文件名");
            return;
        }

        setUploading(true);
        setError("");

        try {
            const tagsArray = pdfTags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean);

            const res = await fetch(`${API_URL}/ai/upload-pdf`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sessionId,
                    fileName: pdfFileName.trim(),
                    category: pdfCategory,
                    tags: tagsArray,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(
                    (data as { message?: string }).message ||
                    `上传失败 (${res.status})`
                );
            }

            const data = (await res.json()) as UploadResult;
            setUploadResult(data);
            setStep("done");
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "上传失败，请稍后重试"
            );
        } finally {
            setUploading(false);
        }
    };

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleChat();
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [chatInput, sessionId]
    );

    const resetAll = () => {
        setStep("form");
        setSubject("");
        setExamType("");
        setTopic("");
        setDifficulty("Hard");
        setCount(3);
        setReferenceQuestions("");
        setReferenceFiles([]);
        setSessionId("");
        setLatexCode("");
        setChatMessages([]);
        setChatInput("");
        setError("");
        setPdfFileName("");
        setPdfCategory("AI 生成");
        setPdfTags("");
        setUploadResult(null);
    };

    /* ─────────────────── Step indicator ─────────────────── */
    const steps: { key: Step; label: string; icon: typeof FileText }[] = [
        { key: "form", label: "填写参数", icon: FileText },
        { key: "preview", label: "预览 & 修改", icon: Eye },
        { key: "submit", label: "提交上传", icon: Upload },
        { key: "done", label: "完成", icon: CheckCircle },
    ];

    const stepIndex = steps.findIndex((s) => s.key === step);

    /* ─────────────────── Render ─────────────────── */
    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 via-cyan-50/30 to-purple-50/30">
            {/* Background */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 -left-20 w-96 h-96 bg-green-400/10 rounded-full blur-3xl animate-pulse" />
                <div
                    className="absolute bottom-1/4 -right-20 w-96 h-96 bg-purple-400/10 rounded-full blur-3xl animate-pulse"
                    style={{ animationDelay: "1s" }}
                />
            </div>

            <div className="relative z-10 max-w-6xl mx-auto px-6 py-12">
                {/* Header */}
                <div className="mb-8">
                    <Button
                        variant="outline"
                        size="sm"
                        className="mb-4 border-gray-300 hover:bg-white"
                        onClick={() => router.push("/")}
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        返回仪表板
                    </Button>
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-gradient-to-br from-green-500 to-teal-500 rounded-xl shadow-lg shadow-green-500/30">
                            <Brain className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold bg-gradient-to-r from-green-600 via-teal-600 to-cyan-600 bg-clip-text text-transparent">
                                AI LaTeX 出题
                            </h1>
                            <p className="text-gray-600 mt-0.5 text-sm">
                                由 Google Gemini 驱动 · 自动生成 LaTeX 试卷
                            </p>
                        </div>
                    </div>
                </div>

                {/* Step indicator */}
                <div className="flex items-center gap-2 mb-8 bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                    {steps.map((s, i) => {
                        const Icon = s.icon;
                        const isActive = i === stepIndex;
                        const isDone = i < stepIndex;
                        return (
                            <div key={s.key} className="flex items-center">
                                {i > 0 && (
                                    <ChevronRight className="w-4 h-4 text-gray-300 mx-1 flex-shrink-0" />
                                )}
                                <div
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${isActive
                                        ? "bg-green-50 text-green-700 border border-green-200"
                                        : isDone
                                            ? "text-green-600"
                                            : "text-gray-400"
                                        }`}
                                >
                                    <Icon className="w-4 h-4 flex-shrink-0" />
                                    <span className="hidden sm:inline whitespace-nowrap">
                                        {s.label}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {error && (
                    <div className="flex items-center gap-2 px-4 py-3 mb-6 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                        <XCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                        <button
                            onClick={() => setError("")}
                            className="ml-auto"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* ═══════════════ STEP 1: FORM ═══════════════ */}
                {step === "form" && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
                        <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-green-600" />
                            填写出题参数
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700">
                                    学科 (Subject) *
                                </label>
                                <input
                                    type="text"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder="例：Physics, Mathematics"
                                    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700">
                                    考试项目 (Exam Type) *
                                </label>
                                <input
                                    type="text"
                                    value={examType}
                                    onChange={(e) => setExamType(e.target.value)}
                                    placeholder="例：AP Physics C: Mechanics, A-Level Mathematics"
                                    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 transition-all"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700">
                                    知识点 (Topic) *
                                </label>
                                <input
                                    type="text"
                                    value={topic}
                                    onChange={(e) => setTopic(e.target.value)}
                                    placeholder="例：Rotational Kinematics and Dynamics"
                                    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700">
                                    难度级别 (Difficulty)
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {DIFFICULTY_OPTIONS.map((d) => (
                                        <button
                                            key={d}
                                            onClick={() => setDifficulty(d)}
                                            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${difficulty === d
                                                ? "bg-green-50 border-green-400 border text-green-700"
                                                : "bg-gray-50 border border-gray-200 text-gray-500 hover:border-gray-300"
                                                }`}
                                        >
                                            {d}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700">
                                    题目数量
                                </label>
                                <input
                                    type="number"
                                    value={count}
                                    onChange={(e) =>
                                        setCount(
                                            Math.max(
                                                1,
                                                Math.min(
                                                    20,
                                                    parseInt(e.target.value) || 1
                                                )
                                            )
                                        )
                                    }
                                    min={1}
                                    max={20}
                                    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700">
                                    参考题目 — 文字 (可选)
                                </label>
                                <textarea
                                    value={referenceQuestions}
                                    onChange={(e) =>
                                        setReferenceQuestions(e.target.value)
                                    }
                                    placeholder="如果有参考题目请粘贴在此，AI 会模仿其风格和难度..."
                                    rows={3}
                                    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 transition-all resize-none"
                                />
                            </div>
                        </div>

                        {/* Reference file upload */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium mb-2 text-gray-700">
                                <Paperclip className="w-4 h-4 inline mr-1.5" />
                                参考题目 — 图片/PDF (可选)
                            </label>
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full px-4 py-6 rounded-xl bg-gray-50 border-2 border-dashed border-gray-200 hover:border-green-400 text-center cursor-pointer transition-colors group"
                            >
                                <Upload className="w-6 h-6 mx-auto mb-2 text-gray-400 group-hover:text-green-500 transition-colors" />
                                <p className="text-sm text-gray-500 group-hover:text-gray-700">
                                    点击上传图片或 PDF（最多 5 个，单个 ≤ 10MB）
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                    支持 JPG, PNG, PDF
                                </p>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,.pdf,application/pdf"
                                multiple
                                onChange={handleFileSelect}
                                className="hidden"
                            />

                            {/* File list */}
                            {referenceFiles.length > 0 && (
                                <div className="mt-3 space-y-2">
                                    {referenceFiles.map((file, idx) => (
                                        <div
                                            key={idx}
                                            className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-white border border-gray-200"
                                        >
                                            {file.mimeType.startsWith("image/") ? (
                                                <ImageIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                                            ) : (
                                                <File className="w-4 h-4 text-red-500 flex-shrink-0" />
                                            )}
                                            <span className="text-sm text-gray-700 truncate flex-1">
                                                {file.fileName}
                                            </span>
                                            <span className="text-xs text-gray-400 flex-shrink-0">
                                                {formatFileSize(file.size)}
                                            </span>
                                            <button
                                                onClick={() => removeFile(idx)}
                                                className="p-1 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button
                            onClick={handleGenerate}
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-r from-green-500 to-teal-500 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-green-500/20 transition-all"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    AI 正在生成 LaTeX...
                                </>
                            ) : (
                                <>
                                    <Brain className="w-5 h-5" />
                                    生成 LaTeX 试卷
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* ═══════════════ STEP 2: PREVIEW & CHAT ═══════════════ */}
                {step === "preview" && (
                    <div className="space-y-6">
                        {/* Tab bar */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-1">
                                <button
                                    onClick={() => setPreviewTab("code")}
                                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${previewTab === "code"
                                        ? "bg-green-50 text-green-700"
                                        : "text-gray-500 hover:text-gray-700"
                                        }`}
                                >
                                    <Code className="w-4 h-4" />
                                    LaTeX 源码
                                </button>
                                <button
                                    onClick={() => {
                                        setPreviewTab("preview");
                                        // Auto-compile when switching to preview tab
                                        if (!pdfPreviewUrl && !compiling) {
                                            handleCompilePreview();
                                        }
                                    }}
                                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${previewTab === "preview"
                                            ? "bg-green-50 text-green-700"
                                            : "text-gray-500 hover:text-gray-700"
                                        }`}
                                >
                                    <Eye className="w-4 h-4" />
                                    PDF 预览
                                </button>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleRegenerate}
                                    disabled={loading}
                                    className="border-gray-300"
                                >
                                    {loading ? (
                                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                    ) : (
                                        <RotateCcw className="w-4 h-4 mr-1" />
                                    )}
                                    重新生成
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={() => setStep("submit")}
                                    className="bg-gradient-to-r from-green-500 to-teal-500 text-white"
                                >
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    满意，下一步
                                </Button>
                            </div>
                        </div>

                        {/* Code / Preview */}
                        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                            {previewTab === "code" ? (
                                <div className="relative">
                                    <div className="absolute top-3 right-3 z-10">
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(latexCode);
                                            }}
                                            className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs text-gray-600 transition-colors"
                                        >
                                            复制代码
                                        </button>
                                    </div>
                                    <textarea
                                        value={latexCode}
                                        onChange={(e) => setLatexCode(e.target.value)}
                                        className="w-full h-[500px] px-6 py-4 font-mono text-sm text-gray-800 bg-gray-50 border-0 focus:outline-none resize-none"
                                        spellCheck={false}
                                    />
                                </div>
                            ) : compiling ? (
                                <div className="h-[500px] flex items-center justify-center bg-gray-50">
                                    <div className="text-center">
                                        <Loader2 className="w-10 h-10 mx-auto mb-3 text-green-500 animate-spin" />
                                        <p className="text-sm font-medium text-gray-600">
                                            正在编译 LaTeX...
                                        </p>
                                        <p className="text-xs text-gray-400 mt-1">
                                            使用 pdflatex 编译中，请稍候
                                        </p>
                                    </div>
                                </div>
                            ) : pdfPreviewUrl ? (
                                <div className="h-[500px] relative">
                                    <iframe
                                        src={pdfPreviewUrl}
                                        className="w-full h-full border-0"
                                        title="PDF Preview"
                                    />
                                    <button
                                        onClick={() => handleCompilePreview()}
                                        className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-white/90 hover:bg-white border border-gray-200 text-xs text-gray-600 transition-colors shadow-sm flex items-center gap-1"
                                    >
                                        <RotateCcw className="w-3 h-3" />
                                        重新编译
                                    </button>
                                </div>
                            ) : (
                                <div className="h-[500px] flex items-center justify-center bg-gray-50">
                                    <div className="text-center">
                                        <Eye className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                        <p className="text-sm font-medium text-gray-500 mb-3">
                                            点击编译查看 PDF 预览
                                        </p>
                                        <button
                                            onClick={() => handleCompilePreview()}
                                            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-teal-500 text-white text-sm font-medium hover:shadow-lg hover:shadow-green-500/20 transition-all"
                                        >
                                            编译预览
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Chat section */}
                        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
                            <div className="px-6 py-4 border-b border-gray-100">
                                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4 text-green-600" />
                                    对话修改
                                    <span className="text-xs text-gray-400 font-normal">
                                        — 告诉 AI 你想如何修改试卷
                                    </span>
                                </h3>
                            </div>

                            {/* Chat messages */}
                            {chatMessages.length > 0 && (
                                <div className="max-h-60 overflow-y-auto px-6 py-4 space-y-3">
                                    {chatMessages.map((msg, idx) => (
                                        <div
                                            key={idx}
                                            className={`flex ${msg.role === "user"
                                                ? "justify-end"
                                                : "justify-start"
                                                }`}
                                        >
                                            <div
                                                className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${msg.role === "user"
                                                    ? "bg-green-500 text-white rounded-br-md"
                                                    : "bg-gray-100 text-gray-800 rounded-bl-md"
                                                    }`}
                                            >
                                                {msg.content}
                                            </div>
                                        </div>
                                    ))}
                                    {chatLoading && (
                                        <div className="flex justify-start">
                                            <div className="bg-gray-100 text-gray-500 px-4 py-2.5 rounded-2xl rounded-bl-md text-sm flex items-center gap-2">
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                AI 正在修改...
                                            </div>
                                        </div>
                                    )}
                                    <div ref={chatEndRef} />
                                </div>
                            )}

                            {/* Chat input */}
                            <div className="px-6 py-4 border-t border-gray-100">
                                <div className="flex gap-3">
                                    <input
                                        type="text"
                                        value={chatInput}
                                        onChange={(e) =>
                                            setChatInput(e.target.value)
                                        }
                                        onKeyDown={handleKeyDown}
                                        placeholder="输入修改意见，如：增加一道关于角动量守恒的题目..."
                                        className="flex-1 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 transition-all text-sm"
                                        disabled={chatLoading}
                                    />
                                    <button
                                        onClick={handleChat}
                                        disabled={
                                            chatLoading || !chatInput.trim()
                                        }
                                        className="px-5 py-3 rounded-xl bg-gradient-to-r from-green-500 to-teal-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-green-500/20 transition-all"
                                    >
                                        <Send className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Back button */}
                        <div className="flex justify-start">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setStep("form")}
                                className="border-gray-300"
                            >
                                <ArrowLeft className="w-4 h-4 mr-1" />
                                返回修改参数
                            </Button>
                        </div>
                    </div>
                )}

                {/* ═══════════════ STEP 3: SUBMIT ═══════════════ */}
                {step === "submit" && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
                        <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <Upload className="w-5 h-5 text-green-600" />
                            提交上传
                        </h2>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700">
                                    <FileText className="w-4 h-4 inline mr-1.5" />
                                    PDF 文件名 *
                                </label>
                                <input
                                    type="text"
                                    value={pdfFileName}
                                    onChange={(e) =>
                                        setPdfFileName(e.target.value)
                                    }
                                    placeholder="例：AP_Physics_C_Rotational_Dynamics"
                                    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700">
                                    <FolderOpen className="w-4 h-4 inline mr-1.5" />
                                    分类
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {categories.map((cat) => (
                                        <button
                                            key={cat}
                                            onClick={() =>
                                                setPdfCategory(cat)
                                            }
                                            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${pdfCategory === cat
                                                ? "bg-green-50 border-green-400 border text-green-700"
                                                : "bg-gray-50 border border-gray-200 text-gray-500 hover:border-gray-300"
                                                }`}
                                        >
                                            {cat}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-400 mt-2">
                                    「AI 生成」标签会自动添加到 Tags 中
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700">
                                    <Tag className="w-4 h-4 inline mr-1.5" />
                                    标签 (Tags)
                                </label>
                                <input
                                    type="text"
                                    value={pdfTags}
                                    onChange={(e) =>
                                        setPdfTags(e.target.value)
                                    }
                                    placeholder="用逗号分隔，如：AP, Physics, FRQ"
                                    className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 transition-all"
                                />
                            </div>
                        </div>

                        {/* LaTeX preview snippet */}
                        <div className="mb-6 rounded-xl bg-gray-50 border border-gray-200 p-4">
                            <p className="text-xs text-gray-500 mb-2 font-medium">
                                LaTeX 源码预览
                            </p>
                            <pre className="text-xs text-gray-600 font-mono overflow-x-auto max-h-40 overflow-y-auto">
                                {latexCode.slice(0, 800)}
                                {latexCode.length > 800 && "\n..."}
                            </pre>
                        </div>

                        <div className="flex gap-3">
                            <Button
                                variant="outline"
                                onClick={() => setStep("preview")}
                                className="border-gray-300"
                            >
                                <ArrowLeft className="w-4 h-4 mr-1" />
                                返回预览
                            </Button>
                            <button
                                onClick={handleUpload}
                                disabled={uploading || !pdfFileName.trim()}
                                className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-r from-green-500 to-teal-500 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-green-500/20 transition-all"
                            >
                                {uploading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        正在编译 & 上传...
                                    </>
                                ) : (
                                    <>
                                        <Upload className="w-5 h-5" />
                                        编译 PDF 并上传
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* ═══════════════ STEP 4: DONE ═══════════════ */}
                {step === "done" && uploadResult && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm text-center">
                        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-green-100 to-teal-100 flex items-center justify-center">
                            <CheckCircle className="w-10 h-10 text-green-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">
                            上传成功！
                        </h2>
                        <p className="text-gray-600 mb-6">
                            PDF 已成功编译并上传至云端
                        </p>

                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-6 text-left max-w-md mx-auto">
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">文件名</span>
                                    <span className="font-medium text-gray-900">
                                        {uploadResult.fileName}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">分类</span>
                                    <span className="font-medium text-gray-900">
                                        {uploadResult.category}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">标签</span>
                                    <div className="flex flex-wrap gap-1 justify-end">
                                        {uploadResult.tags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs"
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 justify-center">
                            <a
                                href={uploadResult.pdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors"
                            >
                                <Download className="w-4 h-4" />
                                查看 PDF
                            </a>
                            <button
                                onClick={resetAll}
                                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-green-500 to-teal-500 text-white font-medium hover:shadow-lg hover:shadow-green-500/20 transition-all"
                            >
                                <RotateCcw className="w-4 h-4" />
                                继续出题
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
