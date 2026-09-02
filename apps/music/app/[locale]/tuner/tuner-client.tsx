"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
    ArrowLeft,
    BarChart3,
    BookOpen,
    ChevronDown,
    ChevronRight,
    Columns2,
    Gauge,
    KeyboardMusic,
    Loader2,
    Mic,
    MicOff,
    Minus,
    PanelRightClose,
    Plus,
    Rows2,
    SlidersHorizontal,
    Timer,
    Upload,
    Volume2,
    X,
    ZoomIn,
    ZoomOut,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { getApiBaseUrl } from "@/lib/api";
import { resolvePageJump } from "@/lib/page-navigation";

import {
    buildPianoKeys,
    createPitchTracker,
    createSustainedNoteEvaluator,
    estimatePitchFromTimeDomain,
    formatSignedDecimal,
    frequencyForMidi,
    getEvaluatorConfig,
    getPianoVoicePartials,
    getToleranceHz,
    getTrackerConfig,
    noteFromFrequency,
    notePartsForMidi,
    smoothPathSegments,
    type NoteVerdict,
    type PitchEstimate,
    type PitchTracker,
    type PianoKey,
    type ResponseMode,
    type SustainedNoteEvaluator,
    type TunerMode,
} from "@/lib/tuner";
import {
    advanceSchedule,
    blankWindowFor,
    clampBeatsPerBar,
    clampBpm,
    MAX_BPM,
    MIN_BPM,
    type MetronomeClick,
    type ScheduleCursor,
} from "@/lib/metronome";

type AudioContextCtor = typeof AudioContext;
type ScriptProcessorAudioContext = AudioContext & {
    createScriptProcessor: (
        bufferSize?: number,
        numberOfInputChannels?: number,
        numberOfOutputChannels?: number,
    ) => ScriptProcessorNode;
};

declare global {
    interface Window {
        webkitAudioContext?: AudioContextCtor;
    }
}

const ANALYSIS_FRAME_SIZE = 4096;
// Trajectory window: shorter = faster scroll (vibrato becomes visible).
const MIN_TRACE_WINDOW_MS = 2000;
const MAX_TRACE_WINDOW_MS = 20000;
const DEFAULT_TRACE_WINDOW_MS = 5000;

interface PitchSample {
    /** Wall-clock timestamp (ms) of the underlying frame. */
    at: number;
    /** Voiced-clock timestamp (ms) — only advances while sound is recorded. */
    traceMs: number;
    frequency: number;
    targetHz: number;
    hzDelta: number;
    cents: number;
    confidence: number;
    rms: number;
    label: string;
}

interface MicNodes {
    stream: MediaStream;
    source: MediaStreamAudioSourceNode;
    highPass: BiquadFilterNode;
    processor?: AudioWorkletNode;
    scriptProcessor?: ScriptProcessorNode;
    silentGain: GainNode;
}

interface BlankWindow {
    from: number;
    to: number;
}

interface NoteStat {
    midi: number;
    label: string;
    total: number;
    outOfTune: number;
    flat: number;
    sharp: number;
    sumAbsCents: number;
}

type ScoreLayout = "vertical" | "horizontal";

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

const MODES: { id: TunerMode; label: string; tolerance: string }[] = [
    { id: "standard", label: "标准", tolerance: "±5 Hz" },
    { id: "strict", label: "严格", tolerance: "±3 Hz" },
    { id: "custom", label: "自定义", tolerance: "手动" },
];

const RESPONSE_LABELS: Record<ResponseMode, { label: string; hint: string }> = {
    stable: { label: "稳定", hint: "重平滑，慢响应" },
    standard: { label: "标准", hint: "平衡" },
    sensitive: { label: "灵敏", hint: "轻平滑，快响应" },
};

function useIsMobile(query = "(max-width: 1023px)"): boolean {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const media = window.matchMedia(query);
        const update = () => setIsMobile(media.matches);
        update();
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, [query]);
    return isMobile;
}

/**
 * Card with a header that can collapse its body. On desktop panels stay open
 * (`collapsible=false`); on small screens they fold away so the page is not
 * overwhelming. An optional `action` button lives in the header and never
 * triggers the collapse.
 */
function Panel({
    icon,
    title,
    action,
    collapsible,
    defaultOpen = true,
    children,
}: {
    icon?: React.ReactNode;
    title: string;
    action?: React.ReactNode;
    collapsible: boolean;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    const isOpen = collapsible ? open : true;

    return (
        <div className="rounded-lg border border-slate-200 bg-white/78 shadow-sm">
            <div className={`flex items-center justify-between gap-2 px-4 ${isOpen ? "pt-4 pb-3" : "py-3"}`}>
                <button
                    type="button"
                    onClick={collapsible ? () => setOpen((value) => !value) : undefined}
                    disabled={!collapsible}
                    className="flex flex-1 items-center gap-2 text-left text-sm font-bold text-slate-900 disabled:cursor-default"
                >
                    {icon}
                    <span>{title}</span>
                    {collapsible && (
                        <ChevronDown className={`ml-auto h-4 w-4 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`} />
                    )}
                </button>
                {action && <div className="shrink-0">{action}</div>}
            </div>
            {isOpen && <div className="px-4 pb-4">{children}</div>}
        </div>
    );
}

function TunerMeter({
    samples,
    toleranceHz,
    traceClockRef,
    traceWindowMsRef,
    recordingRef,
    isListening,
}: {
    samples: React.MutableRefObject<PitchSample[]>;
    toleranceHz: number;
    traceClockRef: React.MutableRefObject<number>;
    traceWindowMsRef: React.MutableRefObject<number>;
    recordingRef: React.MutableRefObject<boolean>;
    isListening: boolean;
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let frameId = 0;
        let lastTs = performance.now();
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const draw = () => {
            const rect = canvas.getBoundingClientRect();
            const pixelRatio = window.devicePixelRatio || 1;
            const width = Math.max(1, Math.floor(rect.width * pixelRatio));
            const height = Math.max(1, Math.floor(rect.height * pixelRatio));
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }

            // The trajectory clock only advances while sound is being recorded,
            // so the trace freezes during silence and resumes on the next note.
            const ts = performance.now();
            const delta = ts - lastTs;
            lastTs = ts;
            if (recordingRef.current) traceClockRef.current += delta;
            const traceNow = traceClockRef.current;
            const traceWindowMs = traceWindowMsRef.current;

            ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            ctx.clearRect(0, 0, rect.width, rect.height);

            const centerX = rect.width / 2;
            const usableWidth = Math.max(160, rect.width - 72);
            const scale = usableWidth / 2 / Math.max(20, toleranceHz * 2.2);
            const bandHalfWidth = toleranceHz * scale;

            ctx.fillStyle = "#18181b";
            ctx.fillRect(0, 0, rect.width, rect.height);

            ctx.fillStyle = "#152c25";
            ctx.fillRect(centerX - bandHalfWidth, 0, bandHalfWidth * 2, rect.height);
            ctx.fillStyle = "#1f8f6f";
            ctx.fillRect(centerX - Math.min(bandHalfWidth, 6), 0, Math.min(bandHalfWidth, 6) * 2, rect.height);

            ctx.strokeStyle = "rgba(255,255,255,0.14)";
            ctx.lineWidth = 1;
            for (let hz = -20; hz <= 20; hz += 5) {
                const x = centerX + hz * scale;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, rect.height);
                ctx.stroke();
            }

            ctx.strokeStyle = "rgba(255,255,255,0.62)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(centerX, 0);
            ctx.lineTo(centerX, rect.height);
            ctx.stroke();

            const activeSamples = samples.current.filter((sample) => traceNow - sample.traceMs <= traceWindowMs);
            samples.current = activeSamples;

            const plotPoint = (sample: PitchSample) => ({
                x: centerX + Math.max(-42, Math.min(42, sample.hzDelta)) * scale,
                y: rect.height - ((traceNow - sample.traceMs) / traceWindowMs) * rect.height,
            });

            const points = activeSamples.map(plotPoint);
            // Smooth the polyline into curves: gentle bends for a tight vibrato
            // wobble, broader arcs when the pitch travels further between frames.
            const curve = smoothPathSegments(points);

            ctx.lineJoin = "round";
            ctx.lineCap = "round";

            // Red/amber shading measures how far the line sits OUTSIDE the green
            // band — anchored at the band edge, not the centre — so anything in
            // tune stays clean and only real excursions are highlighted. The
            // trajectory side of each patch follows the same curve as the line.
            for (let index = 0; index < curve.length; index += 1) {
                const previous = activeSamples[index]!;
                const current = activeSamples[index + 1]!;
                const avgDelta = (previous.hzDelta + current.hzDelta) / 2;
                const beyond = Math.abs(avgDelta) - toleranceHz;
                if (beyond <= 0.05) continue;

                const flat = avgDelta < 0;
                const edgeX = centerX + (flat ? -bandHalfWidth : bandHalfWidth);
                const start = points[index]!;
                const segment = curve[index]!;
                const intensity = Math.min(1, beyond / Math.max(2, toleranceHz));
                const alpha = 0.2 + intensity * 0.5;
                ctx.fillStyle = flat
                    ? `rgba(239, 68, 68, ${alpha.toFixed(3)})`
                    : `rgba(245, 158, 11, ${alpha.toFixed(3)})`;
                ctx.beginPath();
                ctx.moveTo(edgeX, start.y);
                ctx.lineTo(start.x, start.y);
                ctx.bezierCurveTo(segment.cp1.x, segment.cp1.y, segment.cp2.x, segment.cp2.y, segment.end.x, segment.end.y);
                ctx.lineTo(edgeX, segment.end.y);
                ctx.closePath();
                ctx.fill();
            }

            const strokeCurve = () => {
                if (points.length === 0) return;
                ctx.beginPath();
                ctx.moveTo(points[0]!.x, points[0]!.y);
                if (curve.length === 0) {
                    ctx.lineTo(points[0]!.x, points[0]!.y);
                } else {
                    for (const segment of curve) {
                        ctx.bezierCurveTo(segment.cp1.x, segment.cp1.y, segment.cp2.x, segment.cp2.y, segment.end.x, segment.end.y);
                    }
                }
                ctx.stroke();
            };

            ctx.lineWidth = 4;
            ctx.strokeStyle = "rgba(255,255,255,0.22)";
            strokeCurve();

            ctx.lineWidth = 2.6;
            ctx.strokeStyle = "#fafafa";
            strokeCurve();

            if (activeSamples.length > 0) {
                const head = points[points.length - 1]!;
                ctx.fillStyle = recordingRef.current ? "#34d399" : "rgba(250,250,250,0.55)";
                ctx.beginPath();
                ctx.arc(head.x, head.y, 4.5, 0, Math.PI * 2);
                ctx.fill();
            }

            if (activeSamples.length === 0) {
                ctx.fillStyle = "rgba(255,255,255,0.6)";
                ctx.font = "600 14px Inter, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(isListening ? "等待声音…" : "麦克风待机", rect.width / 2, rect.height / 2);
                ctx.textAlign = "start";
            }

            frameId = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(frameId);
    }, [isListening, recordingRef, samples, toleranceHz, traceClockRef, traceWindowMsRef]);

    return (
        <canvas
            ref={canvasRef}
            className="h-[430px] w-full rounded-lg border border-zinc-700 bg-zinc-900 shadow-inner md:h-[560px]"
            aria-label="实时音准轨迹"
        />
    );
}

function PianoKeyboard({
    keys,
    onPlay,
}: {
    keys: PianoKey[];
    onPlay: (key: PianoKey) => void;
}) {
    const whiteKeys = keys.filter((key) => !key.accidental);

    return (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="relative h-44 min-w-[760px]">
                <div className="flex h-full">
                    {whiteKeys.map((key) => {
                        return (
                            <button
                                key={key.midi}
                                type="button"
                                onPointerDown={() => onPlay(key)}
                                className="relative h-full flex-1 border border-slate-300 bg-white text-slate-700 transition hover:bg-emerald-50 active:bg-emerald-100"
                                title={`${key.label} ${key.frequency.toFixed(1)}Hz`}
                            >
                                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs font-semibold">
                                    {key.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
                {keys.filter((key) => key.accidental).map((key) => {
                    const precedingWhiteCount = whiteKeys.filter((white) => white.midi < key.midi).length;
                    return (
                        <button
                            key={key.midi}
                            type="button"
                            onPointerDown={() => onPlay(key)}
                            className="absolute top-0 z-10 h-28 w-10 -translate-x-1/2 rounded-b-md bg-zinc-900 text-white shadow-lg transition hover:bg-zinc-700 active:bg-emerald-900"
                            style={{ left: `${(precedingWhiteCount / whiteKeys.length) * 100}%` }}
                            title={`${key.label} ${key.frequency.toFixed(1)}Hz`}
                        >
                            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-semibold">
                                {key.name}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/** Compact chromatic pad for phones, where a full keyboard has no room. */
function NoteButtons({ onPlay }: { onPlay: (key: PianoKey) => void }) {
    const [octave, setOctave] = useState(4);

    return (
        <div>
            <div className="mb-3 flex items-center justify-center gap-4">
                <button
                    type="button"
                    onClick={() => setOctave((value) => Math.max(1, value - 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                    aria-label="降低八度"
                >
                    <Minus className="h-4 w-4" />
                </button>
                <div className="text-sm font-bold tabular-nums text-slate-900">八度 {octave}</div>
                <button
                    type="button"
                    onClick={() => setOctave((value) => Math.min(7, value + 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                    aria-label="提高八度"
                >
                    <Plus className="h-4 w-4" />
                </button>
            </div>
            <div className="grid grid-cols-6 gap-2">
                {Array.from({ length: 12 }).map((_, index) => {
                    const midi = 12 * (octave + 1) + index;
                    const parts = notePartsForMidi(midi);
                    return (
                        <button
                            key={parts.name}
                            type="button"
                            onPointerDown={() => onPlay({ midi, ...parts, frequency: frequencyForMidi(midi) })}
                            className={`rounded-lg py-3 text-sm font-bold transition active:scale-95 ${
                                parts.accidental
                                    ? "bg-zinc-900 text-white hover:bg-zinc-700"
                                    : "border border-slate-200 bg-white text-slate-700 hover:bg-emerald-50"
                            }`}
                            title={`${parts.label} ${frequencyForMidi(midi).toFixed(1)}Hz`}
                        >
                            {parts.name}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * Split-view sheet-music reader. Renders a PDF (from the library API or a local
 * file) with two reading modes: a continuous vertical scroll (swipe up/down) and
 * a horizontal page-by-page strip (swipe left/right). Pages are fitted to the
 * panel — width in vertical mode, height in horizontal — so almost no margin is
 * wasted, and a user zoom multiplies that fit.
 */
function ScorePanel({
    layout,
    onLayoutChange,
    onClose,
}: {
    layout: ScoreLayout;
    onLayoutChange: (layout: ScoreLayout) => void;
    onClose: () => void;
}) {
    const [scores, setScores] = useState<MusicScore[]>([]);
    const [picking, setPicking] = useState(true);
    const [title, setTitle] = useState("乐谱");
    const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
    // 图片乐谱：按顺序的页面 URL；非空时走 <img> 渲染，不经过 pdf.js
    const [imagePages, setImagePages] = useState<string[] | null>(null);
    const [numPages, setNumPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageInput, setPageInput] = useState("1");
    const [zoom, setZoom] = useState(1);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [dimsVersion, setDimsVersion] = useState(0);

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const canvasMapRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
    const canvasCbRef = useRef<Map<number, (el: HTMLCanvasElement | null) => void>>(new Map());
    const localUrlRef = useRef<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
    const pageDimsRef = useRef<Array<{ w: number; h: number } | undefined>>([]);
    const rasterKeyRef = useRef<Map<number, string>>(new Map());
    const visibleRef = useRef<Set<number>>(new Set());
    const queueRef = useRef<number[]>([]);
    const processingRef = useRef(false);
    const genRef = useRef(0);

    const layoutRef = useRef(layout);
    layoutRef.current = layout;
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;

    useEffect(() => {
        let cancelled = false;
        fetch(`${getApiBaseUrl()}/music-scores`)
            .then((res) => (res.ok ? res.json() : []))
            .then((data) => {
                if (!cancelled) setScores(Array.isArray(data) ? data : []);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    const openImageScore = useCallback((pageUrls: string[], label: string) => {
        setLoading(false);
        setLoadError("");
        setPicking(false);
        setTitle(label);
        setPdfDoc(null);
        setImagePages(pageUrls);
        setNumPages(pageUrls.length);
        setCurrentPage(1);
    }, []);

    const loadFromUrl = useCallback((url: string, label: string) => {
        setLoading(true);
        setLoadError("");
        setPicking(false);
        setTitle(label);
        setPdfDoc(null);
        setImagePages(null);
        setNumPages(0);
        setCurrentPage(1);
        void import("pdfjs-dist")
            .then((pdfjsLib) => {
                pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
                return pdfjsLib.getDocument(url).promise;
            })
            .then((pdf) => {
                setPdfDoc(pdf);
                setNumPages(pdf.numPages);
                setLoading(false);
            })
            .catch((err) => {
                console.error("Failed to load PDF:", err);
                setLoadError("无法加载该乐谱。");
                setLoading(false);
            });
    }, []);

    const openLocalFile = (file: File) => {
        if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
        const url = URL.createObjectURL(file);
        localUrlRef.current = url;
        loadFromUrl(url, file.name.replace(/\.pdf$/i, ""));
    };

    useEffect(() => () => {
        if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    }, []);

    const scaleFor = useCallback((container: HTMLDivElement, dims: { w: number; h: number }) => {
        return layoutRef.current === "vertical"
            ? ((container.clientWidth - 6) / dims.w) * zoomRef.current
            : ((container.clientHeight - 6) / dims.h) * zoomRef.current;
    }, []);

    // Cheap: resize the on-screen canvases via CSS only, so the existing bitmap
    // scales to keep live divider-drag/resize smooth without re-rasterising.
    const applyFit = useCallback(() => {
        const container = scrollRef.current;
        if (!container) return;
        canvasMapRef.current.forEach((canvas, pageNum) => {
            const dims = pageDimsRef.current[pageNum];
            if (!dims) return;
            const scale = scaleFor(container, dims);
            if (!Number.isFinite(scale) || scale <= 0) return;
            canvas.style.width = `${Math.floor(dims.w * scale)}px`;
            canvas.style.height = `${Math.floor(dims.h * scale)}px`;
        });
    }, [scaleFor]);

    // Rasterise one page off-screen at device resolution, then blit it onto the
    // visible canvas in a single synchronous step — the on-screen canvas is never
    // cleared mid-flight, so there is no blank/flicker frame. A per-page size
    // cache skips work when the page is already crisp at the current size.
    const rasterizePage = useCallback(async (pageNum: number) => {
        const container = scrollRef.current;
        const doc = pdfDocRef.current;
        if (!container || !doc) return;
        const canvas = canvasMapRef.current.get(pageNum);
        const dims = pageDimsRef.current[pageNum];
        if (!canvas || !dims) return;
        const scale = scaleFor(container, dims);
        if (!Number.isFinite(scale) || scale <= 0) return;
        const dpr = window.devicePixelRatio || 1;
        const targetW = Math.max(1, Math.floor(dims.w * scale * dpr));
        const targetH = Math.max(1, Math.floor(dims.h * scale * dpr));
        const key = `${targetW}x${targetH}`;
        if (rasterKeyRef.current.get(pageNum) === key) return;
        const gen = genRef.current;
        const page = await doc.getPage(pageNum);
        if (gen !== genRef.current) return;
        const off = document.createElement("canvas");
        off.width = targetW;
        off.height = targetH;
        const offCtx = off.getContext("2d");
        if (!offCtx) return;
        await page.render({ canvasContext: offCtx, viewport: page.getViewport({ scale: scale * dpr }) }).promise;
        if (gen !== genRef.current) return;
        canvas.style.width = `${Math.floor(dims.w * scale)}px`;
        canvas.style.height = `${Math.floor(dims.h * scale)}px`;
        canvas.width = targetW;
        canvas.height = targetH;
        canvas.getContext("2d")?.drawImage(off, 0, 0);
        rasterKeyRef.current.set(pageNum, key);
    }, [scaleFor]);

    const pumpQueue = useCallback(async () => {
        if (processingRef.current) return;
        processingRef.current = true;
        try {
            while (queueRef.current.length > 0) {
                const next = queueRef.current.shift();
                if (next === undefined) break;
                await rasterizePage(next);
            }
        } finally {
            processingRef.current = false;
        }
    }, [rasterizePage]);

    const enqueuePage = useCallback((pageNum: number) => {
        if (!queueRef.current.includes(pageNum)) queueRef.current.push(pageNum);
        void pumpQueue();
    }, [pumpQueue]);

    // Measure intrinsic page sizes once per document so placeholders are sized
    // correctly (scroll geometry is right immediately) and lazy rasterisation can
    // fit without re-measuring.
    useEffect(() => {
        pdfDocRef.current = pdfDoc;
        pageDimsRef.current = [];
        rasterKeyRef.current.clear();
        visibleRef.current.clear();
        queueRef.current = [];
        genRef.current += 1;
        if (!pdfDoc) return;
        let cancelled = false;
        (async () => {
            const dims: Array<{ w: number; h: number }> = [];
            for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum += 1) {
                const page = await pdfDoc.getPage(pageNum);
                if (cancelled) return;
                const viewport = page.getViewport({ scale: 1 });
                dims[pageNum] = { w: viewport.width, h: viewport.height };
            }
            if (cancelled) return;
            pageDimsRef.current = dims;
            setDimsVersion((value) => value + 1);
        })();
        return () => {
            cancelled = true;
        };
    }, [pdfDoc]);

    // Lazily rasterise only the pages near the viewport (huge scores stay light),
    // and on resize re-fit cheaply (live) then re-rasterise the visible pages
    // once things settle (debounced) — no per-frame pdf.js work while dragging.
    useEffect(() => {
        const container = scrollRef.current;
        if (!container || pageDimsRef.current.length === 0) return;
        applyFit();

        const io = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const pageNum = Number((entry.target as HTMLElement).dataset.page);
                    if (!pageNum) continue;
                    if (entry.isIntersecting) {
                        visibleRef.current.add(pageNum);
                        enqueuePage(pageNum);
                    } else {
                        visibleRef.current.delete(pageNum);
                    }
                }
            },
            { root: container, rootMargin: "200%" },
        );
        canvasMapRef.current.forEach((canvas) => io.observe(canvas));

        let settleTimer: number | undefined;
        const ro = new ResizeObserver(() => {
            applyFit();
            window.clearTimeout(settleTimer);
            settleTimer = window.setTimeout(() => {
                genRef.current += 1;
                rasterKeyRef.current.clear();
                queueRef.current = [];
                visibleRef.current.forEach((pageNum) => enqueuePage(pageNum));
            }, 180);
        });
        ro.observe(container);

        return () => {
            io.disconnect();
            ro.disconnect();
            window.clearTimeout(settleTimer);
        };
    }, [dimsVersion, numPages, applyFit, enqueuePage]);

    // Layout/zoom changes: re-fit immediately and re-rasterise the visible pages.
    useEffect(() => {
        if (pageDimsRef.current.length === 0) return;
        applyFit();
        genRef.current += 1;
        rasterKeyRef.current.clear();
        queueRef.current = [];
        visibleRef.current.forEach((pageNum) => enqueuePage(pageNum));
    }, [layout, zoom, applyFit, enqueuePage]);

    // Track which page is centred so the indicator stays in sync while scrolling.
    // Bounding rects keep the maths in one coordinate space — the canvases'
    // offsetParent is the document body, so offsetLeft/Top can't be compared
    // against the scroller directly.
    const handleScroll = useCallback(() => {
        const container = scrollRef.current;
        if (!container || numPages === 0) return;
        const rect = container.getBoundingClientRect();
        const target = layout === "vertical" ? rect.top + rect.height / 2 : rect.left + rect.width / 2;
        let nearest = 1;
        let best = Infinity;
        // canvas（PDF）和 img（图片乐谱）都带 data-page，统一按 DOM 找最近页
        container.querySelectorAll<HTMLElement>("[data-page]").forEach((el) => {
            const pageNum = Number(el.dataset.page);
            if (!pageNum) return;
            const cr = el.getBoundingClientRect();
            const mid = layout === "vertical" ? cr.top + cr.height / 2 : cr.left + cr.width / 2;
            const distance = Math.abs(mid - target);
            if (distance < best) {
                best = distance;
                nearest = pageNum;
            }
        });
        setCurrentPage(nearest);
    }, [layout, numPages]);

    useEffect(() => {
        setPageInput(String(currentPage));
    }, [currentPage]);

    const goToPage = useCallback((value: string) => {
        const page = resolvePageJump(
            value,
            currentPage,
            numPages,
            layout === "vertical" ? "continuous" : "single",
        );
        setPageInput(String(page));
        setCurrentPage(page);
        scrollRef.current
            ?.querySelector<HTMLElement>(`[data-page="${page}"]`)
            ?.scrollIntoView({
                behavior: "smooth",
                block: layout === "vertical" ? "start" : "nearest",
                inline: "center",
            });
    }, [currentPage, layout, numPages]);

    const zoomIn = () => setZoom((value) => Math.min(2.6, Number((value + 0.1).toFixed(2))));
    const zoomOut = () => setZoom((value) => Math.max(0.6, Number((value - 0.1).toFixed(2))));

    const pages = Array.from({ length: numPages }, (_, index) => index + 1);
    // Stable per-page ref callbacks so scroll-driven re-renders don't detach and
    // re-attach every canvas (which would churn the IntersectionObserver).
    const registerCanvas = useCallback((pageNum: number) => {
        let cb = canvasCbRef.current.get(pageNum);
        if (!cb) {
            cb = (el: HTMLCanvasElement | null) => {
                if (el) canvasMapRef.current.set(pageNum, el);
                else canvasMapRef.current.delete(pageNum);
            };
            canvasCbRef.current.set(pageNum, cb);
        }
        return cb;
    }, []);

    return (
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-zinc-900 text-white">
            <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) openLocalFile(file);
                    event.target.value = "";
                }}
            />

            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-2 py-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                    <BookOpen className="h-4 w-4 shrink-0 text-amber-400" />
                    <span className="truncate text-xs font-medium" title={title}>
                        {title}
                    </span>
                    {!picking && (
                        <button
                            type="button"
                            onClick={() => setPicking(true)}
                            className="ml-1 shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-gray-400 transition hover:bg-white/10 hover:text-white"
                        >
                            更换
                        </button>
                    )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                    {(pdfDoc || imagePages) && (
                        <>
                            <button
                                type="button"
                                onClick={() => onLayoutChange("vertical")}
                                className={`rounded-md p-1.5 transition ${layout === "vertical" ? "bg-white/15 text-white" : "text-gray-400 hover:bg-white/10 hover:text-white"}`}
                                title="上下滚动"
                            >
                                <Rows2 className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => onLayoutChange("horizontal")}
                                className={`rounded-md p-1.5 transition ${layout === "horizontal" ? "bg-white/15 text-white" : "text-gray-400 hover:bg-white/10 hover:text-white"}`}
                                title="左右翻页"
                            >
                                <Columns2 className="h-4 w-4" />
                            </button>
                            <div className="mx-1 h-4 w-px bg-white/10" />
                            <button
                                type="button"
                                onClick={zoomOut}
                                className="rounded-md p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
                                title="缩小"
                            >
                                <ZoomOut className="h-4 w-4" />
                            </button>
                            <span className="min-w-10 text-center text-[11px] tabular-nums text-gray-400">
                                {Math.round(zoom * 100)}%
                            </span>
                            <button
                                type="button"
                                onClick={zoomIn}
                                className="rounded-md p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
                                title="放大"
                            >
                                <ZoomIn className="h-4 w-4" />
                            </button>
                            <div className="mx-1 h-4 w-px bg-white/10" />
                        </>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
                        title="关闭乐谱"
                    >
                        <PanelRightClose className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Body */}
            {picking ? (
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 bg-white/5 px-3 py-3 text-sm font-medium text-gray-200 transition hover:border-amber-400/60 hover:bg-white/10"
                    >
                        <Upload className="h-4 w-4" />
                        打开本地 PDF
                    </button>
                    {scores.length > 0 ? (
                        <div className="space-y-1.5">
                            <div className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wider text-gray-500">
                                谱库
                            </div>
                            {scores.map((score) => (
                                <button
                                    key={score.id}
                                    type="button"
                                    onClick={() => {
                                        if (score.fileType === "images" && score.pages?.length) {
                                            openImageScore(
                                                score.pages.map((page) => page.url),
                                                score.title,
                                            );
                                        } else {
                                            loadFromUrl(score.fileUrl, score.title);
                                        }
                                    }}
                                    className="group flex w-full items-center gap-3 rounded-lg border border-white/5 bg-white/5 px-3 py-2.5 text-left transition hover:border-amber-400/40 hover:bg-white/10"
                                >
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-400">
                                        <BookOpen className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-medium text-white">{score.title}</div>
                                        <div className="truncate text-xs text-gray-400">
                                            {[score.composer, score.instrument].filter(Boolean).join(" · ")}
                                        </div>
                                    </div>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-amber-400" />
                                </button>
                            ))}
                        </div>
                    ) : (
                        <p className="px-1 text-xs text-gray-500">谱库暂无乐谱，可打开本地 PDF。</p>
                    )}
                </div>
            ) : loading ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-gray-500">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <p className="text-sm">加载乐谱中…</p>
                </div>
            ) : loadError ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-gray-400">
                    <p className="text-sm">{loadError}</p>
                    <button
                        type="button"
                        onClick={() => setPicking(true)}
                        className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-gray-200 transition hover:bg-white/10"
                    >
                        重新选择
                    </button>
                </div>
            ) : (
                <>
                    <div
                        ref={scrollRef}
                        onScroll={handleScroll}
                        style={{ scrollbarGutter: "stable" }}
                        className={
                            layout === "vertical"
                                ? "min-h-0 w-full min-w-0 flex-1 touch-pan-y overflow-y-auto overflow-x-hidden overscroll-contain bg-zinc-800"
                                : "min-h-0 w-full min-w-0 flex-1 touch-pan-x snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-contain bg-zinc-800"
                        }
                    >
                        <div
                            className={
                                layout === "vertical"
                                    ? "flex flex-col items-center gap-1 py-1"
                                    : "flex h-full items-center gap-1"
                            }
                        >
                            {imagePages
                                ? imagePages.map((url, index) => (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                          key={index}
                                          data-page={index + 1}
                                          src={url}
                                          alt={`${title} - ${index + 1}`}
                                          draggable={false}
                                          loading="lazy"
                                          style={
                                              layout === "vertical"
                                                  ? { width: `${Math.round(zoom * 100)}%` }
                                                  : { height: `${Math.round(zoom * 100)}%` }
                                          }
                                          className={`block bg-white shadow-lg ${layout === "horizontal" ? "shrink-0 snap-center" : ""}`}
                                      />
                                  ))
                                : pages.map((pageNum) => (
                                      <canvas
                                          key={pageNum}
                                          data-page={pageNum}
                                          ref={registerCanvas(pageNum)}
                                          className={`block bg-white shadow-lg ${layout === "horizontal" ? "shrink-0 snap-center" : ""}`}
                                      />
                                  ))}
                        </div>
                    </div>
                    {numPages > 0 && (
                        <div className="flex items-center justify-center gap-1 border-t border-white/10 px-3 py-1 text-[11px] tabular-nums text-gray-400">
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
                                aria-label="页码"
                                className="w-11 rounded border border-white/10 bg-white/5 px-1 py-0.5 text-center text-white outline-none transition focus:border-amber-400"
                            />
                            <span>/ {numPages}</span>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default function TunerPageClient() {
    const isMobile = useIsMobile();
    const [isListening, setIsListening] = useState(false);
    const [error, setError] = useState("");
    const [latest, setLatest] = useState<PitchSample | null>(null);
    const [mode, setMode] = useState<TunerMode>("standard");
    const [customToleranceHz, setCustomToleranceHz] = useState(10);
    const [responseMode, setResponseMode] = useState<ResponseMode>("standard");
    const [traceWindowMs, setTraceWindowMs] = useState(DEFAULT_TRACE_WINDOW_MS);

    const [metronomeOn, setMetronomeOn] = useState(false);
    const [bpm, setBpm] = useState(120);
    const [beatsPerBar, setBeatsPerBar] = useState(4);
    const [metronomeVolume, setMetronomeVolume] = useState(0.6);
    const [activeBeat, setActiveBeat] = useState(-1);

    const [statsEnabled, setStatsEnabled] = useState(false);
    const [noteStats, setNoteStats] = useState<NoteStat[]>([]);
    const [statsModalOpen, setStatsModalOpen] = useState(false);

    // Holds the last detected note frozen on screen during silence, so the
    // "当前目标音" reference tone stays available for an A/B pitch check.
    const [held, setHeld] = useState(false);

    // Split-view sheet music.
    const [scoreOpen, setScoreOpen] = useState(false);
    const [scoreLayout, setScoreLayout] = useState<ScoreLayout>("vertical");
    const [scorePct, setScorePct] = useState(45);
    const dividerDraggingRef = useRef(false);

    const audioCtxRef = useRef<AudioContext | null>(null);
    const micNodesRef = useRef<MicNodes | null>(null);
    const trackerRef = useRef<PitchTracker | null>(null);
    const samplesRef = useRef<PitchSample[]>([]);
    const traceClockRef = useRef<number>(0);
    const recordingRef = useRef<boolean>(false);
    const blankWindowsRef = useRef<BlankWindow[]>([]);
    const evaluatorRef = useRef<SustainedNoteEvaluator | null>(null);
    const statsEnabledRef = useRef(false);
    const toleranceHzRef = useRef(5);
    const traceWindowMsRef = useRef(DEFAULT_TRACE_WINDOW_MS);

    const toleranceHz = getToleranceHz(mode, customToleranceHz);
    toleranceHzRef.current = toleranceHz;
    traceWindowMsRef.current = traceWindowMs;
    statsEnabledRef.current = statsEnabled;
    const pianoKeys = useMemo(() => buildPianoKeys(48, 84), []);
    const displayNote = latest ? noteFromFrequency(latest.frequency) : null;
    const withinTolerance = latest ? Math.abs(latest.hzDelta) <= toleranceHz : false;

    useEffect(() => {
        const saved = localStorage.getItem("MUSIC_TUNER_SETTINGS");
        if (!saved) return;
        try {
            const settings = JSON.parse(saved) as {
                mode?: TunerMode;
                customToleranceHz?: number;
                responseMode?: ResponseMode;
                bpm?: number;
                beatsPerBar?: number;
                metronomeVolume?: number;
                traceWindowMs?: number;
                scoreLayout?: ScoreLayout;
                scorePct?: number;
            };
            if (settings.mode === "standard" || settings.mode === "strict" || settings.mode === "custom") {
                setMode(settings.mode);
            }
            if (typeof settings.customToleranceHz === "number") setCustomToleranceHz(settings.customToleranceHz);
            if (settings.responseMode === "stable" || settings.responseMode === "standard" || settings.responseMode === "sensitive") {
                setResponseMode(settings.responseMode);
            }
            if (typeof settings.bpm === "number") setBpm(clampBpm(settings.bpm));
            if (typeof settings.beatsPerBar === "number") setBeatsPerBar(clampBeatsPerBar(settings.beatsPerBar));
            if (typeof settings.metronomeVolume === "number") {
                setMetronomeVolume(Math.max(0, Math.min(1, settings.metronomeVolume)));
            }
            if (typeof settings.traceWindowMs === "number") {
                setTraceWindowMs(Math.max(MIN_TRACE_WINDOW_MS, Math.min(MAX_TRACE_WINDOW_MS, settings.traceWindowMs)));
            }
            if (settings.scoreLayout === "vertical" || settings.scoreLayout === "horizontal") {
                setScoreLayout(settings.scoreLayout);
            }
            if (typeof settings.scorePct === "number") {
                setScorePct(Math.max(25, Math.min(70, settings.scorePct)));
            }
        } catch {
            localStorage.removeItem("MUSIC_TUNER_SETTINGS");
        }
    }, []);

    useEffect(() => {
        localStorage.setItem("MUSIC_TUNER_SETTINGS", JSON.stringify({
            mode,
            customToleranceHz,
            responseMode,
            bpm,
            beatsPerBar,
            metronomeVolume,
            traceWindowMs,
            scoreLayout,
            scorePct,
        }));
    }, [beatsPerBar, bpm, customToleranceHz, metronomeVolume, mode, responseMode, scoreLayout, scorePct, traceWindowMs]);

    // Rebuild the tracker whenever the response profile changes.
    useEffect(() => {
        trackerRef.current = createPitchTracker(getTrackerConfig(responseMode));
        samplesRef.current = [];
        recordingRef.current = false;
        setLatest(null);
        setHeld(false);
    }, [responseMode]);

    // The intonation evaluator lives for the page session.
    useEffect(() => {
        evaluatorRef.current = createSustainedNoteEvaluator(getEvaluatorConfig());
    }, []);

    const recordVerdict = useCallback((verdict: NoteVerdict) => {
        setNoteStats((previous) => {
            const next = previous.slice();
            const index = next.findIndex((stat) => stat.midi === verdict.midi);
            const base: NoteStat = index >= 0
                ? { ...next[index]! }
                : { midi: verdict.midi, label: verdict.label, total: 0, outOfTune: 0, flat: 0, sharp: 0, sumAbsCents: 0 };
            base.total += 1;
            base.sumAbsCents += Math.abs(verdict.medianCents);
            if (!verdict.inTune) {
                base.outOfTune += 1;
                if (verdict.direction === "flat") base.flat += 1;
                else if (verdict.direction === "sharp") base.sharp += 1;
            }
            if (index >= 0) next[index] = base;
            else next.push(base);
            return next;
        });
    }, []);

    const ensureAudioContext = useCallback(() => {
        if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
            void audioCtxRef.current.resume();
            return audioCtxRef.current;
        }
        const ContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!ContextCtor) return null;
        const context = new ContextCtor({ latencyHint: "interactive" });
        audioCtxRef.current = context;
        return context;
    }, []);

    // Stable across re-renders: the worklet message handler keeps this exact
    // reference, so everything dynamic is read from refs.
    const handleRaw = useCallback((estimate: PitchEstimate & { blanked?: boolean }) => {
        const tracker = trackerRef.current;
        if (!tracker) return;

        const now = performance.now();
        const result = tracker.push({
            frequency: estimate.frequency,
            confidence: estimate.confidence,
            rms: estimate.rms,
            at: now,
            blanked: estimate.blanked,
        });

        recordingRef.current = result.recording;

        const note = result.frequency > 0 ? noteFromFrequency(result.frequency) : null;

        // Feed the intonation evaluator: only confirmed, recorded frames carry a
        // note; everything else flushes the in-progress note.
        if (statsEnabledRef.current && evaluatorRef.current) {
            const verdict = evaluatorRef.current.push(
                result.recording && note
                    ? {
                        at: now,
                        recording: true,
                        midi: note.midi,
                        label: note.label,
                        cents: note.cents,
                        hzDelta: note.hzDelta,
                        toleranceHz: toleranceHzRef.current,
                    }
                    : { at: now, recording: false },
            );
            if (verdict) recordVerdict(verdict);
        }

        if (result.phase === "idle" || !note) {
            // Freeze the last note on screen during silence instead of clearing
            // it, so the "当前目标音" reference tone stays available for an A/B
            // check. Only flag it as held; the trajectory clock is already paused.
            if (result.phase === "idle") setHeld(true);
            return;
        }

        setHeld(false);
        const sample: PitchSample = {
            at: now,
            traceMs: traceClockRef.current,
            frequency: result.frequency,
            targetHz: note.targetHz,
            hzDelta: note.hzDelta,
            cents: note.cents,
            confidence: estimate.confidence,
            rms: estimate.rms,
            label: note.label,
        };

        setLatest(sample);
        if (result.recording) samplesRef.current.push(sample);
    }, [recordVerdict]);

    const teardownMic = useCallback(() => {
        const nodes = micNodesRef.current;
        micNodesRef.current = null;
        if (!nodes) return;
        if (nodes.scriptProcessor) nodes.scriptProcessor.onaudioprocess = null;
        nodes.stream.getTracks().forEach((track) => track.stop());
        nodes.source.disconnect();
        nodes.highPass.disconnect();
        nodes.processor?.port.postMessage({ type: "clear" });
        nodes.processor?.disconnect();
        nodes.scriptProcessor?.disconnect();
        nodes.silentGain.disconnect();
    }, []);

    const stopListening = useCallback(() => {
        teardownMic();
        trackerRef.current?.reset();
        // Finalise any note still in progress so it is not lost from the stats.
        const verdict = evaluatorRef.current?.flush();
        if (verdict && statsEnabledRef.current) recordVerdict(verdict);
        recordingRef.current = false;
        setIsListening(false);
        // Keep the last note frozen so the reference-tone check stays usable
        // after pausing; "清空轨迹" clears it explicitly.
        setHeld(true);
    }, [recordVerdict, teardownMic]);

    const startListening = useCallback(async () => {
        setError("");
        const context = ensureAudioContext();
        if (!context || !navigator.mediaDevices?.getUserMedia) {
            setError("当前浏览器不支持实时麦克风调音。");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                },
            });
            const source = context.createMediaStreamSource(stream);
            const highPass = context.createBiquadFilter();
            highPass.type = "highpass";
            highPass.frequency.value = 55;
            highPass.Q.value = 0.7;
            const silentGain = context.createGain();
            silentGain.gain.value = 0;

            source.connect(highPass);

            const nodes: MicNodes = { stream, source, highPass, silentGain };

            const canUseWorklet = typeof AudioWorkletNode !== "undefined" && typeof context.audioWorklet?.addModule === "function";

            if (canUseWorklet) {
                await context.audioWorklet.addModule("/worklets/tuner-processor.js");
                const processor = new AudioWorkletNode(context, "tuner-processor");
                processor.port.onmessage = (event: MessageEvent<PitchEstimate & { blanked?: boolean }>) => handleRaw(event.data);
                highPass.connect(processor);
                processor.connect(silentGain).connect(context.destination);
                nodes.processor = processor;
            } else {
                const scriptContext = context as ScriptProcessorAudioContext;
                const scriptProcessor = scriptContext.createScriptProcessor(ANALYSIS_FRAME_SIZE, 1, 1);
                scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
                    const frame = event.inputBuffer.getChannelData(0);
                    const estimate = estimatePitchFromTimeDomain(frame, scriptContext.sampleRate);
                    // No worklet clock here, so blank on the main thread instead.
                    const now = scriptContext.currentTime;
                    blankWindowsRef.current = blankWindowsRef.current.filter((window) => window.to >= now - 0.5);
                    const blanked = blankWindowsRef.current.some((window) => window.from <= now && window.to >= now);
                    handleRaw({ ...estimate, blanked });
                };
                highPass.connect(scriptProcessor);
                scriptProcessor.connect(silentGain).connect(scriptContext.destination);
                nodes.scriptProcessor = scriptProcessor;
            }

            micNodesRef.current = nodes;
            await context.resume();
            setIsListening(true);
        } catch (err) {
            console.error(err);
            setError("无法打开麦克风，请检查浏览器权限或输入设备。");
            stopListening();
        }
    }, [ensureAudioContext, handleRaw, stopListening]);

    useEffect(() => () => {
        teardownMic();
        const context = audioCtxRef.current;
        audioCtxRef.current = null;
        if (context && context.state !== "closed") void context.close();
    }, [teardownMic]);

    const toggleListening = () => {
        if (isListening) stopListening();
        else void startListening();
    };

    // ---- Metronome scheduler (lookahead, shares the tuner's clock) -------------
    const metronomeStateRef = useRef({ bpm, beatsPerBar, volume: metronomeVolume });
    metronomeStateRef.current = { bpm, beatsPerBar, volume: metronomeVolume };
    const schedulerRef = useRef<number | null>(null);
    const cursorRef = useRef<ScheduleCursor>({ nextNoteTime: 0, beat: 0 });

    const emitClick = useCallback((context: AudioContext, click: MetronomeClick) => {
        const { volume } = metronomeStateRef.current;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "square";
        oscillator.frequency.setValueAtTime(click.accent ? 2000 : 1200, click.time);
        const peak = Math.max(0.0001, volume * (click.accent ? 1 : 0.62));
        gain.gain.setValueAtTime(0.0001, click.time);
        gain.gain.exponentialRampToValueAtTime(peak, click.time + 0.001);
        gain.gain.exponentialRampToValueAtTime(0.0001, click.time + 0.045);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(click.time);
        oscillator.stop(click.time + 0.06);

        // Blank pitch analysis around the click so the mic-captured tick cannot
        // corrupt detection. The window covers output + input latency plus the
        // analysis frame length.
        const latency = (context.outputLatency || 0.02)
            + (context.baseLatency || 0.01)
            + ANALYSIS_FRAME_SIZE / context.sampleRate
            + 0.04;
        const blank = blankWindowFor(click.time, latency);
        blankWindowsRef.current = blankWindowsRef.current.filter((window) => window.to >= context.currentTime - 0.5);
        blankWindowsRef.current.push(blank);
        micNodesRef.current?.processor?.port.postMessage({ type: "blank", ...blank });

        const delayMs = Math.max(0, (click.time - context.currentTime) * 1000);
        window.setTimeout(() => setActiveBeat(click.beat), delayMs);
    }, []);

    const stopMetronome = useCallback(() => {
        if (schedulerRef.current !== null) {
            window.clearInterval(schedulerRef.current);
            schedulerRef.current = null;
        }
        setActiveBeat(-1);
    }, []);

    const startMetronome = useCallback(() => {
        const context = ensureAudioContext();
        if (!context) {
            setError("当前浏览器不支持节拍器。");
            return;
        }
        if (schedulerRef.current !== null) return;
        cursorRef.current = { nextNoteTime: context.currentTime + 0.12, beat: 0 };

        const lookahead = 0.12;
        const pump = () => {
            const { bpm: currentBpm, beatsPerBar: currentBeats } = metronomeStateRef.current;
            const { clicks, cursor } = advanceSchedule(
                cursorRef.current,
                context.currentTime + lookahead,
                currentBpm,
                currentBeats,
            );
            cursorRef.current = cursor;
            for (const click of clicks) emitClick(context, click);
        };

        pump();
        schedulerRef.current = window.setInterval(pump, 25);
    }, [emitClick, ensureAudioContext]);

    const toggleMetronome = () => {
        if (metronomeOn) {
            stopMetronome();
            setMetronomeOn(false);
        } else {
            startMetronome();
            setMetronomeOn(true);
        }
    };

    useEffect(() => () => stopMetronome(), [stopMetronome]);

    // Draggable split divider: the right (score) pane width follows the cursor.
    useEffect(() => {
        const onMove = (event: PointerEvent) => {
            if (!dividerDraggingRef.current) return;
            const pct = (1 - event.clientX / window.innerWidth) * 100;
            setScorePct(Math.max(25, Math.min(70, pct)));
        };
        const onUp = () => {
            if (!dividerDraggingRef.current) return;
            dividerDraggingRef.current = false;
            document.body.style.userSelect = "";
            document.body.style.cursor = "";
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
    }, []);

    const startDividerDrag = () => {
        dividerDraggingRef.current = true;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";
    };

    const playReferenceTone = useCallback((key: PianoKey) => {
        const context = ensureAudioContext();
        if (!context) return;

        const now = context.currentTime;
        const master = context.createGain();
        const filter = context.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(Math.min(9000, key.frequency * 16), now);
        filter.Q.setValueAtTime(0.55, now);
        master.gain.setValueAtTime(0.0001, now);
        master.gain.exponentialRampToValueAtTime(0.22, now + 0.012);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);
        filter.connect(master).connect(context.destination);

        getPianoVoicePartials(key.frequency).forEach((partial) => {
            const oscillator = context.createOscillator();
            const partialGain = context.createGain();
            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(partial.frequency, now);
            oscillator.detune.setValueAtTime(partial.detuneCents, now);
            partialGain.gain.setValueAtTime(0.0001, now);
            partialGain.gain.exponentialRampToValueAtTime(partial.gain, now + 0.006);
            partialGain.gain.exponentialRampToValueAtTime(0.0001, now + partial.decaySeconds);
            oscillator.connect(partialGain).connect(filter);
            oscillator.start(now);
            oscillator.stop(now + Math.max(0.35, partial.decaySeconds + 0.08));
        });

        const noiseBuffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.035), context.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let index = 0; index < noiseData.length; index += 1) {
            const decay = 1 - index / noiseData.length;
            noiseData[index] = (Math.random() * 2 - 1) * decay * 0.22;
        }
        const hammer = context.createBufferSource();
        const hammerGain = context.createGain();
        const hammerFilter = context.createBiquadFilter();
        hammer.buffer = noiseBuffer;
        hammerFilter.type = "bandpass";
        hammerFilter.frequency.setValueAtTime(Math.min(5200, key.frequency * 10), now);
        hammerFilter.Q.setValueAtTime(1.2, now);
        hammerGain.gain.setValueAtTime(0.08, now);
        hammerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
        hammer.connect(hammerFilter).connect(hammerGain).connect(filter);
        hammer.start(now);
        hammer.stop(now + 0.05);
    }, [ensureAudioContext]);

    const resetSamples = () => {
        samplesRef.current = [];
        traceClockRef.current = 0;
        recordingRef.current = false;
        trackerRef.current?.reset();
        setLatest(null);
        setHeld(false);
    };

    const toggleStats = () => {
        setStatsEnabled((enabled) => {
            const next = !enabled;
            // Drop the half-measured note so it cannot bleed across a toggle.
            evaluatorRef.current?.reset();
            return next;
        });
    };

    const clearStats = () => {
        evaluatorRef.current?.reset();
        setNoteStats([]);
    };

    const nudgeBpm = (delta: number) => setBpm((value) => clampBpm(value + delta));

    const sortedStats = useMemo(
        () => [...noteStats].sort((a, b) => b.outOfTune - a.outOfTune || a.midi - b.midi),
        [noteStats],
    );
    const totalNotes = noteStats.reduce((sum, stat) => sum + stat.total, 0);
    const totalOut = noteStats.reduce((sum, stat) => sum + stat.outOfTune, 0);
    const totalFlat = noteStats.reduce((sum, stat) => sum + stat.flat, 0);
    const totalSharp = noteStats.reduce((sum, stat) => sum + stat.sharp, 0);
    const totalAbsCents = noteStats.reduce((sum, stat) => sum + stat.sumAbsCents, 0);
    const accuracy = totalNotes > 0 ? Math.round(((totalNotes - totalOut) / totalNotes) * 100) : null;
    const avgDeviation = totalNotes > 0 ? totalAbsCents / totalNotes : null;
    const worstNote = sortedStats.find((stat) => stat.outOfTune > 0) ?? null;

    const statsToggle = (
        <button
            type="button"
            onClick={toggleStats}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition active:scale-[0.98] ${statsEnabled ? "bg-zinc-800 hover:bg-zinc-950" : "bg-emerald-700 hover:bg-emerald-800"}`}
        >
            {statsEnabled ? "停止统计" : "开始统计"}
        </button>
    );

    const statsSummaryGrid = (
        <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-slate-50 p-2">
                <div className="text-[11px] text-slate-400">计数音</div>
                <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{totalNotes}</div>
            </div>
            <div className="rounded-md bg-slate-50 p-2">
                <div className="text-[11px] text-slate-400">不准</div>
                <div className="mt-0.5 text-lg font-bold tabular-nums text-red-600">{totalOut}</div>
            </div>
            <div className="rounded-md bg-slate-50 p-2">
                <div className="text-[11px] text-slate-400">准确率</div>
                <div className="mt-0.5 text-lg font-bold tabular-nums text-emerald-700">{accuracy === null ? "--" : `${accuracy}%`}</div>
            </div>
        </div>
    );

    // Compact card for the side panel: headline numbers plus a peek at the
    // worst note, with a button that expands the full breakdown in a modal.
    const statsSummary = (
        <>
            {statsSummaryGrid}
            {totalNotes > 0 ? (
                <>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                        <span>平均偏差 <span className="font-semibold tabular-nums text-slate-700">±{avgDeviation!.toFixed(1)}¢</span></span>
                        {worstNote ? (
                            <span>最常偏 <span className="font-semibold text-red-600">{worstNote.label}</span> <span className="tabular-nums text-slate-400">×{worstNote.outOfTune}</span></span>
                        ) : (
                            <span className="text-emerald-700">全部命中 🎯</span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => setStatsModalOpen(true)}
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                        <BarChart3 className="h-3.5 w-3.5" />
                        展开详细统计
                    </button>
                </>
            ) : (
                <p className="mt-3 text-[11px] leading-snug text-slate-400">
                    {statsEnabled
                        ? "统计中…只记录持续 ≥250ms 的稳定音，按中位偏差判断是否超出绿色范围（避免起音、滑音与揉弦误判）。"
                        : "开启后统计录音期间每个音的音准。"}
                </p>
            )}
        </>
    );

    // Full breakdown shown inside the modal (shared by desktop and mobile).
    const statsDetail = (
        <>
            {statsSummaryGrid}

            {totalNotes > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-slate-50 p-2">
                        <div className="text-[11px] text-slate-400">平均偏差</div>
                        <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">±{avgDeviation!.toFixed(1)}¢</div>
                    </div>
                    <div className="rounded-md bg-slate-50 p-2">
                        <div className="text-[11px] text-slate-400">偏低</div>
                        <div className="mt-0.5 text-sm font-bold tabular-nums text-sky-700">{totalFlat}</div>
                    </div>
                    <div className="rounded-md bg-slate-50 p-2">
                        <div className="text-[11px] text-slate-400">偏高</div>
                        <div className="mt-0.5 text-sm font-bold tabular-nums text-amber-600">{totalSharp}</div>
                    </div>
                </div>
            )}

            {sortedStats.length > 0 ? (
                <div className="mt-3 max-h-[52vh] overflow-y-auto md:max-h-[360px]">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white/95 text-[11px] uppercase text-slate-400">
                            <tr className="text-left">
                                <th className="py-1 font-semibold">音</th>
                                <th className="py-1 text-center font-semibold">次数</th>
                                <th className="py-1 text-center font-semibold">不准</th>
                                <th className="py-1 text-center font-semibold">准确率</th>
                                <th className="py-1 text-right font-semibold">平均偏差</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedStats.map((stat) => {
                                const noteAccuracy = Math.round(((stat.total - stat.outOfTune) / stat.total) * 100);
                                return (
                                    <tr key={stat.midi} className="border-t border-slate-100">
                                        <td className="py-1.5 font-semibold text-slate-900">{stat.label}</td>
                                        <td className="py-1.5 text-center tabular-nums text-slate-500">{stat.total}</td>
                                        <td className="py-1.5 text-center tabular-nums">
                                            <span className={stat.outOfTune > 0 ? "font-semibold text-red-600" : "text-slate-300"}>
                                                {stat.outOfTune}
                                            </span>
                                            {stat.outOfTune > 0 && (
                                                <span className="ml-1 text-[10px] text-slate-400">
                                                    {stat.flat > 0 ? `↓${stat.flat}` : ""}{stat.sharp > 0 ? ` ↑${stat.sharp}` : ""}
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-1.5 text-center tabular-nums">
                                            <span className={noteAccuracy >= 80 ? "text-emerald-700" : noteAccuracy >= 50 ? "text-amber-600" : "text-red-600"}>
                                                {noteAccuracy}%
                                            </span>
                                        </td>
                                        <td className="py-1.5 text-right tabular-nums text-slate-500">
                                            ±{(stat.sumAbsCents / stat.total).toFixed(1)}¢
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <p className="mt-3 text-[11px] leading-snug text-slate-400">
                    {statsEnabled
                        ? "统计中…只记录持续 ≥250ms 的稳定音，按中位偏差判断是否超出绿色范围（避免起音、滑音与揉弦误判）。"
                        : "开启后统计录音期间每个音的音准。"}
                </p>
            )}

            {sortedStats.length > 0 && (
                <button
                    type="button"
                    onClick={clearStats}
                    className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                    清空统计
                </button>
            )}
        </>
    );

    const keyboardAction = (
        <button
            type="button"
            onClick={() => displayNote && playReferenceTone({
                midi: displayNote.midi,
                name: displayNote.name,
                octave: displayNote.octave,
                label: displayNote.label,
                frequency: displayNote.targetHz,
                accidental: displayNote.name.includes("#"),
            })}
            disabled={!displayNote}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
            <Volume2 className="h-3.5 w-3.5" />
            当前目标音
        </button>
    );

    const splitActive = scoreOpen && !isMobile;

    return (
        <div className={splitActive ? "flex h-screen overflow-hidden bg-[#f8f6f1] text-slate-950" : "min-h-screen bg-[#f8f6f1] text-slate-950"}>
            <div
                className={splitActive ? "h-screen min-w-0 flex-1 overflow-y-auto" : "contents"}
                style={splitActive ? { scrollbarGutter: "stable" } : undefined}
            >
            <main className={splitActive ? "flex min-h-screen w-full flex-col px-4 py-5 md:px-6 md:py-7" : "mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 md:px-6 md:py-7"}>
                <div className="mb-5 flex items-center justify-between gap-3">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-white hover:text-slate-950"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        音乐库
                    </Link>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setScoreOpen((open) => !open)}
                            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold shadow-sm transition active:scale-[0.98] ${scoreOpen ? "border-amber-500 bg-amber-500 text-white hover:bg-amber-600" : "border-slate-200 bg-white/70 text-slate-700 hover:bg-white"}`}
                        >
                            <BookOpen className="h-4 w-4" />
                            乐谱
                        </button>
                        <button
                            type="button"
                            onClick={toggleListening}
                            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] ${isListening ? "bg-zinc-800 hover:bg-zinc-950" : "bg-emerald-700 hover:bg-emerald-800"}`}
                        >
                            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                            {isListening ? "暂停" : "开始"}
                        </button>
                    </div>
                </div>

                <section className="mb-5 grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-end">
                    <div>
                        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                            <Gauge className="h-3.5 w-3.5" />
                            A4 440Hz
                        </div>
                        <h1 className="text-3xl font-bold tracking-normal text-slate-950 md:text-5xl">调音器</h1>
                    </div>

                    <div className="text-center">
                        <div className={`text-[92px] font-black leading-none tracking-normal transition-colors md:text-[128px] ${held ? "text-slate-400" : "text-slate-950"}`}>
                            {displayNote?.name ?? "--"}
                            {displayNote && <span className="ml-1 align-baseline text-4xl md:text-5xl">{displayNote.octave}</span>}
                        </div>
                        <div className={`mx-auto mt-2 h-2 w-28 rounded-full ${held ? "bg-slate-300" : withinTolerance ? "bg-emerald-500" : latest ? "bg-red-500" : "bg-slate-300"}`} />
                        {held && latest && (
                            <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                保持上一个音
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 md:min-w-80">
                        <div className="rounded-lg border border-slate-200 bg-white/75 p-4 shadow-sm">
                            <div className="text-xs font-semibold uppercase text-slate-400">Hertz</div>
                            <div className="mt-1 text-3xl font-bold tabular-nums text-slate-950">
                                {latest ? latest.frequency.toFixed(1) : "--"}
                            </div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white/75 p-4 shadow-sm">
                            <div className="text-xs font-semibold uppercase text-slate-400">Cents</div>
                            <div className="mt-1 text-3xl font-bold tabular-nums text-slate-950">
                                {latest ? formatSignedDecimal(latest.cents) : "--"}
                            </div>
                        </div>
                    </div>
                </section>

                {error && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                        {error}
                    </div>
                )}

                <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="min-w-0 space-y-4">
                        <div>
                            <TunerMeter
                                samples={samplesRef}
                                toleranceHz={toleranceHz}
                                traceClockRef={traceClockRef}
                                traceWindowMsRef={traceWindowMsRef}
                                recordingRef={recordingRef}
                                isListening={isListening}
                            />
                            <div className="mt-3 flex items-center gap-3">
                                <span className="text-xs font-semibold text-slate-500">轨迹速度</span>
                                <span className="text-[11px] text-slate-400">慢</span>
                                <input
                                    type="range"
                                    min={MIN_TRACE_WINDOW_MS}
                                    max={MAX_TRACE_WINDOW_MS}
                                    step={500}
                                    // Invert so dragging right = faster (shorter window).
                                    value={MIN_TRACE_WINDOW_MS + MAX_TRACE_WINDOW_MS - traceWindowMs}
                                    onChange={(event) =>
                                        setTraceWindowMs(MIN_TRACE_WINDOW_MS + MAX_TRACE_WINDOW_MS - Number(event.target.value))
                                    }
                                    className="flex-1 accent-emerald-700"
                                    aria-label="轨迹移动速度"
                                />
                                <span className="text-[11px] text-slate-400">快</span>
                                <span className="w-12 text-right text-xs font-semibold tabular-nums text-slate-600">
                                    {(traceWindowMs / 1000).toFixed(1)}s
                                </span>
                            </div>
                        </div>

                        {/* Keyboard sits directly under the tuner for quick reference tones. */}
                        <Panel
                            key={`kbd-${isMobile}`}
                            icon={<KeyboardMusic className="h-4 w-4 text-emerald-700" />}
                            title="钢琴键盘"
                            action={keyboardAction}
                            collapsible={isMobile}
                            defaultOpen={!isMobile}
                        >
                            {isMobile
                                ? <NoteButtons onPlay={playReferenceTone} />
                                : <PianoKeyboard keys={pianoKeys} onPlay={playReferenceTone} />}
                        </Panel>

                        {!isMobile && (
                            <Panel
                                icon={<BarChart3 className="h-4 w-4 text-emerald-700" />}
                                title="音准统计"
                                action={statsToggle}
                                collapsible={false}
                            >
                                {statsSummary}
                            </Panel>
                        )}
                    </div>

                    <aside className="space-y-4">
                        <Panel
                            icon={<SlidersHorizontal className="h-4 w-4 text-emerald-700" />}
                            title="绿色范围"
                            collapsible={isMobile}
                        >
                            <div className="grid grid-cols-3 gap-2">
                                {MODES.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setMode(item.id)}
                                        className={`rounded-lg border px-2 py-2 text-sm font-semibold transition ${mode === item.id ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                                    >
                                        <span className="block">{item.label}</span>
                                        <span className="text-[11px] font-medium text-slate-400">{item.tolerance}</span>
                                    </button>
                                ))}
                            </div>
                            {mode === "custom" && (
                                <div className="mt-4">
                                    <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
                                        <span>容差</span>
                                        <span>±{customToleranceHz.toFixed(0)} Hz</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={1}
                                        max={20}
                                        value={customToleranceHz}
                                        onChange={(event) => setCustomToleranceHz(Number(event.target.value))}
                                        className="w-full accent-emerald-700"
                                    />
                                </div>
                            )}
                        </Panel>

                        <Panel key={`resp-${isMobile}`} title="响应" collapsible={isMobile} defaultOpen={!isMobile}>
                            <div className="grid grid-cols-3 gap-2">
                                {(["stable", "standard", "sensitive"] as const).map((item) => (
                                    <button
                                        key={item}
                                        type="button"
                                        onClick={() => setResponseMode(item)}
                                        className={`rounded-lg border px-2 py-2 text-sm font-semibold transition ${responseMode === item ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                                    >
                                        {RESPONSE_LABELS[item].label}
                                    </button>
                                ))}
                            </div>
                            <p className="mt-2 text-[11px] leading-snug text-slate-400">
                                {RESPONSE_LABELS[responseMode].hint}
                            </p>
                        </Panel>

                        <Panel
                            key={`metro-${isMobile}`}
                            icon={<Timer className="h-4 w-4 text-emerald-700" />}
                            title="节拍器"
                            collapsible={isMobile}
                            defaultOpen={!isMobile}
                            action={(
                                <button
                                    type="button"
                                    onClick={toggleMetronome}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition active:scale-[0.98] ${metronomeOn ? "bg-zinc-800 hover:bg-zinc-950" : "bg-emerald-700 hover:bg-emerald-800"}`}
                                >
                                    {metronomeOn ? "停止" : "启动"}
                                </button>
                            )}
                        >
                            <div className="flex items-center justify-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => nudgeBpm(-1)}
                                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                                    aria-label="降低速度"
                                >
                                    <Minus className="h-4 w-4" />
                                </button>
                                <div className="text-center">
                                    <div className="text-4xl font-black tabular-nums text-slate-950">{bpm}</div>
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">BPM</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => nudgeBpm(1)}
                                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
                                    aria-label="提高速度"
                                >
                                    <Plus className="h-4 w-4" />
                                </button>
                            </div>

                            <input
                                type="range"
                                min={MIN_BPM}
                                max={MAX_BPM}
                                value={bpm}
                                onChange={(event) => setBpm(clampBpm(Number(event.target.value)))}
                                className="mt-3 w-full accent-emerald-700"
                            />

                            <div className="mt-3 flex items-center justify-center gap-1.5">
                                {Array.from({ length: beatsPerBar }).map((_, index) => (
                                    <span
                                        key={index}
                                        className={`h-2.5 w-2.5 rounded-full transition ${
                                            metronomeOn && activeBeat === index
                                                ? index === 0 ? "scale-125 bg-emerald-600" : "scale-125 bg-slate-700"
                                                : index === 0 ? "bg-emerald-200" : "bg-slate-200"
                                        }`}
                                    />
                                ))}
                            </div>

                            <div className="mt-3 flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-slate-500">拍号</span>
                                <div className="flex gap-1">
                                    {[2, 3, 4, 6].map((beats) => (
                                        <button
                                            key={beats}
                                            type="button"
                                            onClick={() => setBeatsPerBar(beats)}
                                            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${beatsPerBar === beats ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                                        >
                                            {beats}/4
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-3 flex items-center gap-2">
                                <Volume2 className="h-4 w-4 text-slate-400" />
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={Math.round(metronomeVolume * 100)}
                                    onChange={(event) => setMetronomeVolume(Number(event.target.value) / 100)}
                                    className="w-full accent-slate-700"
                                />
                            </div>
                            <p className="mt-2 text-[11px] leading-snug text-slate-400">
                                节拍声会在拾取窗口内被自动屏蔽，不影响音准识别。
                            </p>
                        </Panel>

                        {isMobile && (
                            <button
                                type="button"
                                onClick={() => setStatsModalOpen(true)}
                                className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white/78 px-4 py-3 text-sm font-bold text-slate-900 shadow-sm transition hover:bg-white"
                            >
                                <span className="flex items-center gap-2">
                                    <BarChart3 className="h-4 w-4 text-emerald-700" />
                                    音准统计
                                </span>
                                <span className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                                    {statsEnabled && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                                    {totalNotes > 0 && (
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5">{totalOut}/{totalNotes}</span>
                                    )}
                                    <ChevronDown className="h-4 w-4 -rotate-90 text-slate-400" />
                                </span>
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={resetSamples}
                            className="w-full rounded-lg border border-slate-200 bg-white/78 px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white"
                        >
                            清空轨迹
                        </button>
                    </aside>
                </section>
            </main>
            </div>

            {splitActive && (
                <div
                    onPointerDown={startDividerDrag}
                    className="relative w-1.5 shrink-0 cursor-col-resize bg-slate-200 transition hover:bg-emerald-400"
                    title="拖动调整宽度"
                >
                    <div className="absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-400/60" />
                </div>
            )}

            {scoreOpen && (
                <aside
                    className={splitActive ? "h-screen min-w-0 shrink-0 overflow-hidden" : "fixed inset-0 z-50"}
                    style={splitActive ? { flexBasis: `${scorePct}%` } : undefined}
                >
                    <ScorePanel
                        layout={scoreLayout}
                        onLayoutChange={setScoreLayout}
                        onClose={() => setScoreOpen(false)}
                    />
                </aside>
            )}

            {statsModalOpen && (
                <div
                    className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/40 md:items-center md:justify-center md:p-6"
                    onClick={() => setStatsModalOpen(false)}
                >
                    <div
                        className="max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl md:w-full md:max-w-lg md:rounded-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                                <BarChart3 className="h-4 w-4 text-emerald-700" />
                                音准统计 · 详细
                            </div>
                            <div className="flex items-center gap-2">
                                {statsToggle}
                                <button
                                    type="button"
                                    onClick={() => setStatsModalOpen(false)}
                                    className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                                    aria-label="关闭统计"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        {statsDetail}
                    </div>
                </div>
            )}
        </div>
    );
}
