"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
    ArrowLeft,
    Download,
    Maximize,
    Minimize,
    ChevronLeft,
    ChevronRight,
    BookOpen,
    FileText,
    Columns2,
    Rows2,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";

/* ───────── Types ───────── */

interface MusicScore {
    id: string;
    title: string;
    composer: string;
    instrument: string;
    fileUrl: string;
    fileSize: number;
    pageCount: number;
}

/* ───────── Constants ───────── */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const INSTRUMENTS = [
    { value: "all", label: "全部" },
    { value: "小提琴", label: "🎻 小提琴" },
    { value: "钢琴", label: "🎹 钢琴" },
];

/* ───────── Score Card ───────── */

function ScoreCard({
    score,
    onClick,
}: {
    score: MusicScore;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className="group relative bg-white/80 backdrop-blur-sm rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 text-left w-full"
        >
            {/* PDF 封面区域 */}
            <div className="relative aspect-[3/4] bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 flex items-center justify-center">
                <div className="text-center p-4">
                    <FileText className="w-12 h-12 text-amber-400 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                    <p className="text-[10px] text-amber-600/60 font-medium">{score.pageCount} 页</p>
                </div>
                {/* Instrument badge */}
                <span className="absolute top-2 right-2 text-xs px-2 py-0.5 bg-white/90 text-gray-600 rounded-full shadow-sm">
                    {score.instrument}
                </span>
            </div>
            {/* 信息 */}
            <div className="p-3">
                <h3 className="text-sm font-semibold text-gray-900 truncate leading-tight">
                    {score.title}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{score.composer}</p>
            </div>
        </button>
    );
}

/* ───────── PDF Viewer (Book Mode) ───────── */

function ScoreViewer({
    score,
    onClose,
}: {
    score: MusicScore;
    onClose: () => void;
}) {
    const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [isDoubleSpread, setIsDoubleSpread] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const leftCanvasRef = useRef<HTMLCanvasElement>(null);
    const rightCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Load PDF
    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);

        void import("pdfjs-dist")
            .then((pdfjsLib) => {
                pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
                return pdfjsLib.getDocument(score.fileUrl).promise;
            })
            .then((pdf) => {
                if (cancelled) return;
                setPdfDoc(pdf);
                setTotalPages(pdf.numPages);
                setIsLoading(false);
            })
            .catch((err) => {
                console.error("Failed to load PDF:", err);
                setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [score.fileUrl]);

    // Render pages
    const renderPage = useCallback(
        async (pageNum: number, canvas: HTMLCanvasElement | null) => {
            if (!pdfDoc || !canvas || pageNum < 1 || pageNum > totalPages) return;

            const page = await pdfDoc.getPage(pageNum);
            const container = containerRef.current;
            if (!container) return;

            // Calculate scale to fit within container
            const containerHeight = container.clientHeight - 80; // padding for controls
            const viewport = page.getViewport({ scale: 1 });
            const scale = containerHeight / viewport.height;
            const scaledViewport = page.getViewport({ scale });

            canvas.height = scaledViewport.height;
            canvas.width = scaledViewport.width;

            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            await page.render({
                canvasContext: ctx,
                viewport: scaledViewport,
            }).promise;
        },
        [pdfDoc, totalPages]
    );

    // Render current page(s)
    useEffect(() => {
        if (!pdfDoc) return;

        renderPage(currentPage, leftCanvasRef.current);

        if (isDoubleSpread && currentPage + 1 <= totalPages) {
            renderPage(currentPage + 1, rightCanvasRef.current);
        }
    }, [pdfDoc, currentPage, isDoubleSpread, totalPages, renderPage]);

    // Navigation
    const pageStep = isDoubleSpread ? 2 : 1;

    const goNext = useCallback(() => {
        setCurrentPage((p) => Math.min(p + pageStep, totalPages));
    }, [pageStep, totalPages]);

    const goPrev = useCallback(() => {
        setCurrentPage((p) => Math.max(p - pageStep, 1));
    }, [pageStep]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: globalThis.KeyboardEvent) => {
            if (e.key === "Escape") {
                if (isFullscreen) {
                    document.exitFullscreen().catch(() => {});
                } else {
                    onClose();
                }
                return;
            }
            if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                goPrev();
            } else {
                // Any other key → next page
                goNext();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [goNext, goPrev, isFullscreen, onClose]);

    // Fullscreen
    const toggleFullscreen = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;

        if (!document.fullscreenElement) {
            el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
        } else {
            document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
        }
    }, []);

    useEffect(() => {
        const onFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener("fullscreenchange", onFullscreenChange);
        return () =>
            document.removeEventListener("fullscreenchange", onFullscreenChange);
    }, []);

    // Download
    const handleDownload = () => {
        const a = document.createElement("a");
        a.href = score.fileUrl;
        a.download = `${score.title}.pdf`;
        a.target = "_blank";
        a.click();
    };

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 z-50 bg-gray-900 flex flex-col"
        >
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-900/90 backdrop-blur-sm border-b border-white/5">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h2 className="text-white text-sm font-medium">{score.title}</h2>
                        <p className="text-gray-500 text-xs">{score.composer}</p>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    {/* Page mode toggle */}
                    <button
                        onClick={() => setIsDoubleSpread(false)}
                        className={`p-2 rounded-lg transition-colors ${
                            !isDoubleSpread
                                ? "text-white bg-white/15"
                                : "text-gray-500 hover:text-white hover:bg-white/10"
                        }`}
                        title="单页模式"
                    >
                        <Rows2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setIsDoubleSpread(true)}
                        className={`p-2 rounded-lg transition-colors ${
                            isDoubleSpread
                                ? "text-white bg-white/15"
                                : "text-gray-500 hover:text-white hover:bg-white/10"
                        }`}
                        title="双页模式"
                    >
                        <Columns2 className="w-4 h-4" />
                    </button>

                    <div className="w-px h-4 bg-white/10 mx-1" />

                    <button
                        onClick={handleDownload}
                        className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                        title="下载 PDF"
                    >
                        <Download className="w-4 h-4" />
                    </button>
                    <button
                        onClick={toggleFullscreen}
                        className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                        title={isFullscreen ? "退出全屏" : "全屏"}
                    >
                        {isFullscreen ? (
                            <Minimize className="w-4 h-4" />
                        ) : (
                            <Maximize className="w-4 h-4" />
                        )}
                    </button>
                </div>
            </div>

            {/* PDF display area */}
            <div className="flex-1 flex items-center justify-center relative overflow-hidden select-none">
                {isLoading ? (
                    <div className="flex flex-col items-center text-gray-500">
                        <div className="w-8 h-8 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin mb-3" />
                        <p className="text-sm">加载乐谱中...</p>
                    </div>
                ) : (
                    <>
                        {/* Left click zone (prev) */}
                        <button
                            onClick={goPrev}
                            className="absolute left-0 top-0 bottom-0 w-1/6 z-10 cursor-pointer opacity-0 hover:opacity-100 transition-opacity flex items-center justify-start pl-4"
                            disabled={currentPage <= 1}
                        >
                            <ChevronLeft className="w-8 h-8 text-white/40" />
                        </button>

                        {/* Pages */}
                        <div className="flex items-center gap-1">
                            <canvas
                                ref={leftCanvasRef}
                                className="max-h-[calc(100vh-80px)] shadow-2xl rounded-sm"
                            />
                            {isDoubleSpread && currentPage + 1 <= totalPages && (
                                <canvas
                                    ref={rightCanvasRef}
                                    className="max-h-[calc(100vh-80px)] shadow-2xl rounded-sm"
                                />
                            )}
                        </div>

                        {/* Right click zone (next) */}
                        <button
                            onClick={goNext}
                            className="absolute right-0 top-0 bottom-0 w-1/6 z-10 cursor-pointer opacity-0 hover:opacity-100 transition-opacity flex items-center justify-end pr-4"
                            disabled={currentPage >= totalPages}
                        >
                            <ChevronRight className="w-8 h-8 text-white/40" />
                        </button>
                    </>
                )}
            </div>

            {/* Bottom bar */}
            <div className="flex items-center justify-center gap-4 px-4 py-2 bg-gray-900/90 backdrop-blur-sm border-t border-white/5">
                <button
                    onClick={goPrev}
                    disabled={currentPage <= 1}
                    className="p-1.5 text-gray-400 hover:text-white disabled:text-gray-600 rounded-lg transition-colors"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-gray-400 text-xs tabular-nums min-w-[80px] text-center">
                    {currentPage}
                    {isDoubleSpread && currentPage + 1 <= totalPages
                        ? ` - ${currentPage + 1}`
                        : ""}{" "}
                    / {totalPages}
                </span>
                <button
                    onClick={goNext}
                    disabled={currentPage >= totalPages}
                    className="p-1.5 text-gray-400 hover:text-white disabled:text-gray-600 rounded-lg transition-colors"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

/* ───────── Main Page ───────── */

export default function ScorePageClient() {
    const [scores, setScores] = useState<MusicScore[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterInstrument, setFilterInstrument] = useState("all");
    const [viewingScore, setViewingScore] = useState<MusicScore | null>(null);

    const fetchScores = useCallback(async () => {
        try {
            setIsLoading(true);
            const params = filterInstrument !== "all" ? `?instrument=${encodeURIComponent(filterInstrument)}` : "";
            const res = await fetch(`${API_BASE}/music-scores${params}`);
            if (!res.ok) return;
            const data = await res.json();
            setScores(Array.isArray(data) ? data : []);
        } catch {
            console.error("Failed to fetch scores");
        } finally {
            setIsLoading(false);
        }
    }, [filterInstrument]);

    useEffect(() => {
        fetchScores();
    }, [fetchScores]);

    if (viewingScore) {
        return (
            <ScoreViewer
                score={viewingScore}
                onClose={() => setViewingScore(null)}
            />
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-amber-50/60 via-orange-50/40 to-yellow-50/60">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white/60 backdrop-blur-xl border-b border-gray-200/40">
                <div className="max-w-6xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Link
                                href="/"
                                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-white/60 transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </Link>
                            <div className="flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-amber-500" />
                                <h1 className="text-lg font-semibold text-gray-900">乐谱</h1>
                            </div>
                        </div>

                        {/* Instrument filter tabs */}
                        <div className="flex bg-white/60 rounded-xl p-0.5 border border-gray-200/40">
                            {INSTRUMENTS.map((inst) => (
                                <button
                                    key={inst.value}
                                    onClick={() => setFilterInstrument(inst.value)}
                                    className={`px-4 py-1.5 rounded-lg text-sm transition-all ${
                                        filterInstrument === inst.value
                                            ? "bg-amber-500 text-white shadow-sm"
                                            : "text-gray-600 hover:text-gray-900"
                                    }`}
                                >
                                    {inst.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Score grid */}
            <div className="max-w-6xl mx-auto px-6 py-8">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                        <div className="w-8 h-8 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin mb-3" />
                        <p className="text-sm">加载中...</p>
                    </div>
                ) : scores.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {scores.map((score) => (
                            <ScoreCard
                                key={score.id}
                                score={score}
                                onClick={() => setViewingScore(score)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                        <BookOpen className="w-12 h-12 mb-3 text-gray-300" />
                        <p className="text-sm">暂无乐谱</p>
                    </div>
                )}
            </div>
        </div>
    );
}
