"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
    ArrowLeft,
    Download,
    Maximize,
    Minimize,
    ChevronLeft,
    ChevronRight,
    BookOpen,
    Search,
    Columns2,
    Rows2,
    ScrollText,
    ZoomIn,
    ZoomOut,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { getApiBaseUrl, withLocale } from "@/lib/api";
import { resolvePageJump, type PageReadingLayout } from "@/lib/page-navigation";

/* ───────── Types ───────── */

interface MusicScore {
    id: string;
    title: string;
    composer: string | null;
    instrument: string;
    fileType?: string;
    pages?: { key: string; url: string }[] | null;
    fileUrl: string;
    fileSize: number;
    pageCount: number;
}

/* ───────── Constants ───────── */

const API_BASE = getApiBaseUrl();

// value 是数据库里的乐器规范值（中文，兼作筛选键），label 走翻译
const INSTRUMENTS = [
    { value: "all", labelKey: "filterAll", emoji: "" },
    { value: "小提琴", labelKey: "violin", emoji: "🎻 " },
    { value: "钢琴", labelKey: "piano", emoji: "🎹 " },
] as const;

/** 已知乐器名的展示翻译；未知值原样展示 */
function instrumentLabel(
    value: string,
    t: (key: string) => string,
): string {
    if (value === "小提琴") return t("violin");
    if (value === "钢琴") return t("piano");
    return value;
}

/* ───────── Score List Item ───────── */

function ScoreListItem({
    score,
    onClick,
}: {
    score: MusicScore;
    onClick: () => void;
}) {
    const t = useTranslations("scores");
    return (
        <button
            onClick={onClick}
            className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 rounded-xl border border-slate-200/70 bg-white/70 px-4 py-3 text-left shadow-sm transition-all duration-200 hover:border-amber-300/70 hover:bg-white hover:shadow-md"
        >
            <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-amber-200/70 bg-amber-50 text-amber-600">
                <BookOpen className="h-5 w-5" />
            </div>

            <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-slate-950">
                        {score.title}
                    </h3>
                    <span className="hidden shrink-0 rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 text-[11px] text-slate-500 sm:inline-flex">
                        {t("pageCount", { count: score.pageCount })}
                    </span>
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-slate-500">
                    {score.composer && <span className="truncate">{score.composer}</span>}
                    {score.composer && <span className="text-slate-300">/</span>}
                    <span className="truncate">{instrumentLabel(score.instrument, t)}</span>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 sm:inline-flex">
                    {instrumentLabel(score.instrument, t)}
                </span>
                <ChevronRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-500" />
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
    const t = useTranslations("scores");
    const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [readingLayout, setReadingLayout] = useState<PageReadingLayout>("double");
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [zoom, setZoom] = useState(1);
    const leftCanvasRef = useRef<HTMLCanvasElement>(null);
    const rightCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const continuousScrollRef = useRef<HTMLDivElement>(null);
    const continuousCanvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
    const [pageInput, setPageInput] = useState("1");
    const isDoubleSpread = readingLayout === "double";
    const isContinuous = readingLayout === "continuous";

    // 图片乐谱：按顺序的页面 URL；空数组表示 PDF 乐谱
    const imagePages = useMemo(
        () =>
            score.fileType === "images" && score.pages
                ? score.pages.map((page) => page.url)
                : [],
        [score]
    );
    const isImageScore = imagePages.length > 0;

    // 图片页与 PDF 一致地"适配容器高度再乘缩放"，容器高度用 ResizeObserver 跟踪
    const [fitHeight, setFitHeight] = useState<number | null>(null);

    // Load PDF (image scores skip pdf.js entirely)
    useEffect(() => {
        if (isImageScore) {
            setTotalPages(imagePages.length);
            setIsLoading(false);
            return;
        }

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
    }, [score.fileUrl, isImageScore, imagePages.length]);

    // Track container height for image page fitting
    useEffect(() => {
        if (!isImageScore) return;
        const el = containerRef.current;
        if (!el) return;
        const update = () =>
            setFitHeight(Math.max(120, el.clientHeight - 96));
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [isImageScore]);

    // Preload the next spread so page turns feel instant
    useEffect(() => {
        if (!isImageScore) return;
        const step = isDoubleSpread ? 2 : 1;
        for (const pageNum of [currentPage + step, currentPage + step + 1]) {
            const url = imagePages[pageNum - 1];
            if (url) {
                const img = new window.Image();
                img.src = url;
            }
        }
    }, [isImageScore, imagePages, currentPage, isDoubleSpread]);

    // Render pages
    const renderPage = useCallback(
        async (pageNum: number, canvas: HTMLCanvasElement | null) => {
            if (!pdfDoc || !canvas || pageNum < 1 || pageNum > totalPages) return;

            const page = await pdfDoc.getPage(pageNum);
            const container = containerRef.current;
            if (!container) return;

            // Calculate base scale to fit within container, then apply user zoom.
            const containerHeight = container.clientHeight - 96; // padding for controls
            const viewport = page.getViewport({ scale: 1 });
            const scale = (containerHeight / viewport.height) * zoom;
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
        [pdfDoc, totalPages, zoom]
    );

    // Render current page(s)
    useEffect(() => {
        if (!pdfDoc || isContinuous) return;

        renderPage(currentPage, leftCanvasRef.current);

        if (isDoubleSpread && currentPage + 1 <= totalPages) {
            renderPage(currentPage + 1, rightCanvasRef.current);
        } else {
            const ctx = rightCanvasRef.current?.getContext("2d");
            if (rightCanvasRef.current && ctx) {
                ctx.clearRect(0, 0, rightCanvasRef.current.width, rightCanvasRef.current.height);
                rightCanvasRef.current.width = 0;
                rightCanvasRef.current.height = 0;
            }
        }
    }, [pdfDoc, currentPage, isContinuous, isDoubleSpread, totalPages, renderPage, zoom]);

    const registerContinuousCanvas = useCallback((pageNum: number) => (canvas: HTMLCanvasElement | null) => {
        if (canvas) continuousCanvasRefs.current.set(pageNum, canvas);
        else continuousCanvasRefs.current.delete(pageNum);
    }, []);

    // Continuous reading intentionally renders every page so the browser's own
    // scrollbar is an accurate map of the whole score and can be dragged freely.
    useEffect(() => {
        if (!pdfDoc || !isContinuous) return;
        let cancelled = false;
        const renderAllPages = async () => {
            const scrollContainer = continuousScrollRef.current;
            if (!scrollContainer) return;
            for (let pageNum = 1; pageNum <= totalPages; pageNum += 1) {
                const canvas = continuousCanvasRefs.current.get(pageNum);
                if (!canvas) continue;
                const page = await pdfDoc.getPage(pageNum);
                if (cancelled) return;
                const viewport = page.getViewport({ scale: 1 });
                const scale = ((scrollContainer.clientWidth - 48) / viewport.width) * zoom;
                const scaledViewport = page.getViewport({ scale });
                canvas.width = scaledViewport.width;
                canvas.height = scaledViewport.height;
                const context = canvas.getContext("2d");
                if (!context) continue;
                await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
                if (cancelled) return;
            }
        };
        void renderAllPages();
        return () => {
            cancelled = true;
        };
    }, [pdfDoc, isContinuous, totalPages, zoom]);

    useEffect(() => {
        setPageInput(String(currentPage));
    }, [currentPage]);

    useEffect(() => {
        if (!isDoubleSpread) return;
        setCurrentPage((page) => (page % 2 === 0 ? page - 1 : page));
    }, [isDoubleSpread]);

    const scrollToPage = useCallback((page: number) => {
        const target = continuousScrollRef.current?.querySelector<HTMLElement>(`[data-page="${page}"]`);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, []);

    const goToPage = useCallback((value: string) => {
        const page = resolvePageJump(value, currentPage, totalPages, readingLayout);
        setPageInput(String(page));
        setCurrentPage(page);
        if (isContinuous) scrollToPage(page);
    }, [currentPage, isContinuous, readingLayout, scrollToPage, totalPages]);

    // Navigation
    const pageStep = isDoubleSpread ? 2 : 1;
    const lastPageStart = isDoubleSpread && totalPages % 2 === 0 ? totalPages - 1 : totalPages;

    const goNext = useCallback(() => {
        goToPage(String(Math.min(currentPage + pageStep, lastPageStart)));
    }, [currentPage, goToPage, lastPageStart, pageStep]);

    const goPrev = useCallback(() => {
        goToPage(String(Math.max(currentPage - pageStep, 1)));
    }, [currentPage, goToPage, pageStep]);

    const handleContinuousScroll = useCallback(() => {
        const container = continuousScrollRef.current;
        if (!container) return;
        const midpoint = container.getBoundingClientRect().top + container.clientHeight / 2;
        let nearestPage = currentPage;
        let nearestDistance = Infinity;
        container.querySelectorAll<HTMLElement>("[data-page]").forEach((page) => {
            const pageNumber = Number(page.dataset.page);
            const rect = page.getBoundingClientRect();
            const distance = Math.abs(rect.top + rect.height / 2 - midpoint);
            if (pageNumber && distance < nearestDistance) {
                nearestPage = pageNumber;
                nearestDistance = distance;
            }
        });
        setCurrentPage(nearestPage);
    }, [currentPage]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: globalThis.KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
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

    const zoomOut = useCallback(() => {
        setZoom((value) => Math.max(0.7, Number((value - 0.1).toFixed(2))));
    }, []);

    const zoomIn = useCallback(() => {
        setZoom((value) => Math.min(2.4, Number((value + 0.1).toFixed(2))));
    }, []);

    const resetZoom = useCallback(() => {
        setZoom(1);
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
                        {score.composer && (
                            <p className="text-gray-500 text-xs">{score.composer}</p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    {/* Page mode toggle */}
                    <button
                        onClick={() => setReadingLayout("single")}
                        className={`p-2 rounded-lg transition-colors ${
                            readingLayout === "single"
                                ? "text-white bg-white/15"
                                : "text-gray-500 hover:text-white hover:bg-white/10"
                        }`}
                        title={t("singlePageMode")}
                    >
                        <Rows2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setReadingLayout("double")}
                        className={`p-2 rounded-lg transition-colors ${
                            readingLayout === "double"
                                ? "text-white bg-white/15"
                                : "text-gray-500 hover:text-white hover:bg-white/10"
                        }`}
                        title={t("doublePageMode")}
                    >
                        <Columns2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setReadingLayout("continuous")}
                        className={`p-2 rounded-lg transition-colors ${
                            isContinuous
                                ? "text-white bg-white/15"
                                : "text-gray-500 hover:text-white hover:bg-white/10"
                        }`}
                        title={t("continuousScrollMode")}
                    >
                        <ScrollText className="w-4 h-4" />
                    </button>

                    <div className="w-px h-4 bg-white/10 mx-1" />

                    <button
                        onClick={zoomOut}
                        className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                        title={t("zoomOut")}
                    >
                        <ZoomOut className="w-4 h-4" />
                    </button>
                    <button
                        onClick={resetZoom}
                        className="min-w-12 rounded-lg px-2 py-1.5 text-xs tabular-nums text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
                        title={t("resetZoom")}
                    >
                        {Math.round(zoom * 100)}%
                    </button>
                    <button
                        onClick={zoomIn}
                        className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                        title={t("zoomIn")}
                    >
                        <ZoomIn className="w-4 h-4" />
                    </button>

                    <div className="w-px h-4 bg-white/10 mx-1" />

                    {!isImageScore && (
                        <button
                            onClick={handleDownload}
                            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                            title={t("downloadPdf")}
                        >
                            <Download className="w-4 h-4" />
                        </button>
                    )}
                    <button
                        onClick={toggleFullscreen}
                        className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                        title={isFullscreen ? t("exitFullscreen") : t("fullscreen")}
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
            <div
                ref={continuousScrollRef}
                onScroll={isContinuous ? handleContinuousScroll : undefined}
                style={isContinuous ? { scrollbarGutter: "stable" } : undefined}
                className={`flex-1 relative select-none px-6 py-4 ${
                    isContinuous ? "overflow-y-scroll overflow-x-auto" : "overflow-auto"
                }`}
            >
                {isLoading ? (
                    <div className="flex h-full flex-col items-center justify-center text-gray-500">
                        <div className="w-8 h-8 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin mb-3" />
                        <p className="text-sm">{t("loadingScore")}</p>
                    </div>
                ) : (
                    <>
                        {!isContinuous && <>
                            {/* Left click zone (prev) */}
                            <button
                                onClick={goPrev}
                                className="absolute left-0 top-0 bottom-0 w-1/6 z-10 cursor-pointer opacity-0 hover:opacity-100 transition-opacity flex items-center justify-start pl-4"
                                disabled={currentPage <= 1}
                            >
                                <ChevronLeft className="w-8 h-8 text-white/40" />
                            </button>
                        </>}

                        {/* Pages */}
                        <div className={isContinuous ? "flex flex-col items-center gap-3" : "flex min-h-full items-center justify-center gap-3"}>
                            {isContinuous ? isImageScore ? (
                                imagePages.map((url, index) => (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        key={url}
                                        data-page={index + 1}
                                        src={url}
                                        alt={`${score.title} - ${index + 1}`}
                                        draggable={false}
                                        loading="lazy"
                                        style={{ width: `${Math.round(zoom * 100)}%` }}
                                        className="max-w-none rounded-sm bg-white shadow-2xl"
                                    />
                                ))
                            ) : (
                                Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNum) => (
                                    <canvas
                                        key={pageNum}
                                        data-page={pageNum}
                                        ref={registerContinuousCanvas(pageNum)}
                                        className="rounded-sm bg-white shadow-2xl"
                                    />
                                ))
                            ) : isImageScore ? (
                                <>
                                    {/* 乐谱原图直出（COS 外链、需全分辨率），不走 next/image */}
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={imagePages[currentPage - 1]}
                                        alt={`${score.title} - ${currentPage}`}
                                        draggable={false}
                                        style={{
                                            height: fitHeight
                                                ? fitHeight * zoom
                                                : undefined,
                                        }}
                                        className="shadow-2xl rounded-sm bg-white"
                                    />
                                    {isDoubleSpread &&
                                        currentPage + 1 <= totalPages && (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={imagePages[currentPage]}
                                                alt={`${score.title} - ${currentPage + 1}`}
                                                draggable={false}
                                                style={{
                                                    height: fitHeight
                                                        ? fitHeight * zoom
                                                        : undefined,
                                                }}
                                                className="shadow-2xl rounded-sm bg-white"
                                            />
                                        )}
                                </>
                            ) : (
                                <>
                                    <canvas
                                        ref={leftCanvasRef}
                                        className="shadow-2xl rounded-sm"
                                    />
                                    {isDoubleSpread &&
                                        currentPage + 1 <= totalPages && (
                                            <canvas
                                                ref={rightCanvasRef}
                                                className="shadow-2xl rounded-sm"
                                            />
                                        )}
                                </>
                            )}
                        </div>

                        {!isContinuous && <>
                            {/* Right click zone (next) */}
                            <button
                                onClick={goNext}
                                className="absolute right-0 top-0 bottom-0 w-1/6 z-10 cursor-pointer opacity-0 hover:opacity-100 transition-opacity flex items-center justify-end pr-4"
                                disabled={currentPage >= lastPageStart}
                            >
                                <ChevronRight className="w-8 h-8 text-white/40" />
                            </button>
                        </>}
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
                <label className="flex items-center gap-1 text-gray-400 text-xs tabular-nums">
                    <input
                        value={pageInput}
                        onChange={(event) => setPageInput(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                goToPage(pageInput);
                            }
                        }}
                        onBlur={() => setPageInput(String(currentPage))}
                        inputMode="numeric"
                        aria-label={t("pageNumber")}
                        className="w-12 rounded border border-white/10 bg-white/5 px-1 py-0.5 text-center text-white outline-none transition focus:border-amber-400"
                    />
                    <span>/ {totalPages}</span>
                </label>
                <button
                    onClick={goNext}
                    disabled={currentPage >= lastPageStart}
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
    const t = useTranslations("scores");
    const locale = useLocale();
    const [scores, setScores] = useState<MusicScore[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterInstrument, setFilterInstrument] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [viewingScore, setViewingScore] = useState<MusicScore | null>(null);
    const hasHandledInitialScoreRef = useRef(false);

    const fetchScores = useCallback(async () => {
        try {
            setIsLoading(true);
            const params = filterInstrument !== "all" ? `?instrument=${encodeURIComponent(filterInstrument)}` : "";
            const res = await fetch(withLocale(`${API_BASE}/music-scores${params}`, locale));
            if (!res.ok) return;
            const data = await res.json();
            setScores(Array.isArray(data) ? data : []);
        } catch {
            setScores([]);
        } finally {
            setIsLoading(false);
        }
    }, [filterInstrument, locale]);

    useEffect(() => {
        fetchScores();
    }, [fetchScores]);

    useEffect(() => {
        if (hasHandledInitialScoreRef.current || scores.length === 0) return;
        const scoreId = new URLSearchParams(window.location.search).get("score");
        if (!scoreId) return;

        const score = scores.find((item) => item.id === scoreId);
        if (score) {
            setViewingScore(score);
            hasHandledInitialScoreRef.current = true;
        }
    }, [scores]);

    const filteredScores = scores.filter((score) => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return true;

        return [score.title, score.composer, score.instrument]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(query));
    });

    const openScore = (score: MusicScore) => {
        setViewingScore(score);
        const url = new URL(window.location.href);
        url.searchParams.set("score", score.id);
        window.history.replaceState(null, "", url.toString());
    };

    const closeScore = () => {
        setViewingScore(null);
        const url = new URL(window.location.href);
        url.searchParams.delete("score");
        window.history.replaceState(null, "", url.toString());
    };

    if (viewingScore) {
        return (
            <ScoreViewer
                score={viewingScore}
                onClose={closeScore}
            />
        );
    }

    return (
        <div className="min-h-screen bg-[#f8f6f1]">
            {/* Header */}
            <div className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/75 backdrop-blur-xl">
                <div className="max-w-6xl mx-auto px-6 py-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-3">
                            <Link
                                href="/"
                                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-white/70 transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </Link>
                            <div className="flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-amber-600" />
                                <div>
                                    <h1 className="text-lg font-semibold text-slate-950">{t("title")}</h1>
                                    <p className="text-xs text-slate-500">{t("subtitle")}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <div className="relative sm:w-72">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                    placeholder={t("searchPlaceholder")}
                                    className="w-full rounded-xl border border-slate-200/80 bg-white/70 py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                                />
                            </div>

                            <div className="flex rounded-xl border border-slate-200/70 bg-white/60 p-0.5">
                                {INSTRUMENTS.map((inst) => (
                                    <button
                                        key={inst.value}
                                        onClick={() => setFilterInstrument(inst.value)}
                                        className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                                            filterInstrument === inst.value
                                                ? "bg-amber-500 text-white shadow-sm"
                                                : "text-slate-600 hover:text-slate-950"
                                        }`}
                                    >
                                        {inst.emoji}{t(inst.labelKey)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Score list */}
            <div className="max-w-6xl mx-auto px-6 py-8">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                        <div className="w-8 h-8 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin mb-3" />
                        <p className="text-sm">{t("loading")}</p>
                    </div>
                ) : filteredScores.length > 0 ? (
                    <div className="space-y-3">
                        <div className="hidden grid-cols-[auto_1fr_auto] gap-4 px-4 text-xs font-medium uppercase tracking-wider text-slate-400 md:grid">
                            <span className="w-11" />
                            <span>{t("colTitleComposer")}</span>
                            <span className="pr-7 text-right">{t("colInstrument")}</span>
                        </div>
                        {filteredScores.map((score) => (
                            <ScoreListItem
                                key={score.id}
                                score={score}
                                onClick={() => openScore(score)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                        <BookOpen className="w-12 h-12 mb-3 text-slate-300" />
                        <p className="text-sm">{searchQuery ? t("noMatchingScores") : t("noScores")}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
