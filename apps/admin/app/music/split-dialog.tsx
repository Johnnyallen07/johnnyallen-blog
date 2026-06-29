"use client";

import {
    useState,
    useEffect,
    useCallback,
    useRef,
    useMemo,
} from "react";

import {
    Scissors,
    Plus,
    X,
    Loader2,
    CheckCircle2,
    AlertCircle,
    Play,
    Pause,
    SkipBack,

    Music,
    Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { fetchClient } from "@/lib/api";

/* ── Types ── */

interface MusicTrack {
    id: string;
    title: string;
    musician: string;
    performer: string;
    category: string;
    series: string | null;
    duration: number;
    fileSize: number;
    fileUrl: string;
}

interface Segment {
    id: string;
    title: string;
    startTime: number;
    endTime: number;
}

interface SplitResult {
    title: string;
    fileKey: string;
    fileUrl: string;
    fileSize: number;
    duration: number;
}

interface SaveResult {
    title: string;
    status: "replaced" | "created" | "pending" | "error";
    existingId?: string;
}

type SplitStatus = "idle" | "splitting" | "done" | "error";

/* ── Helpers ── */

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function parseTimeInput(val: string): number {
    const trimmed = val.trim();
    if (!trimmed) return NaN;
    if (trimmed.includes(":")) {
        const parts = trimmed.split(":");
        const m = parseInt(parts[0] || "0", 10);
        const s = parseInt(parts[1] || "0", 10);
        if (isNaN(m) || isNaN(s)) return NaN;
        return m * 60 + s;
    }
    const secs = parseFloat(trimmed);
    return isNaN(secs) ? NaN : Math.round(secs);
}

/* ── Waveform Component ── */

function WaveformEditor({
    audioBuffer,
    duration,
    segment,
    onSegmentChange,
    currentTime,
    isPlaying,
    onSeek,
    onPreview,
}: {
    audioBuffer: AudioBuffer | null;
    duration: number;
    segment: Segment;
    onSegmentChange: (start: number, end: number) => void;
    currentTime: number;
    isPlaying: boolean;
    onSeek: (time: number) => void;
    onPreview: (marker: "start" | "end", time: number) => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState<"start" | "end" | null>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const segmentRef = useRef(segment);
    segmentRef.current = segment;
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Store ALL callbacks in refs so the drag useEffect never re-runs mid-drag
    const onSegmentChangeRef = useRef(onSegmentChange);
    onSegmentChangeRef.current = onSegmentChange;
    const onPreviewRef = useRef(onPreview);
    onPreviewRef.current = onPreview;
    const onSeekRef = useRef(onSeek);
    onSeekRef.current = onSeek;
    const durationRef = useRef(duration);
    durationRef.current = duration;

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });
        observer.observe(el);
        setContainerWidth(el.clientWidth);
        return () => observer.disconnect();
    }, []);

    const peaks = useMemo(() => {
        if (!audioBuffer || containerWidth === 0) return [];
        const rawData = audioBuffer.getChannelData(0);
        const numBars = Math.floor(containerWidth / 3);
        const blockSize = Math.floor(rawData.length / numBars);
        const result: number[] = [];
        for (let i = 0; i < numBars; i++) {
            let sum = 0;
            const start = i * blockSize;
            for (let j = 0; j < blockSize; j++) {
                sum += Math.abs(rawData[start + j] || 0);
            }
            result.push(sum / blockSize);
        }
        const max = Math.max(...result, 0.001);
        return result.map((v) => v / max);
    }, [audioBuffer, containerWidth]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || peaks.length === 0 || duration === 0) return;

        const ctx = canvas.getContext("2d")!;
        const dpr = window.devicePixelRatio || 1;
        const w = containerWidth;
        const h = 130;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        ctx.scale(dpr, dpr);

        ctx.fillStyle = "#faf5ff";
        ctx.fillRect(0, 0, w, h);

        const barWidth = 2;
        const gap = 1;
        const totalBarWidth = barWidth + gap;

        const startX = (segment.startTime / duration) * w;
        const endX = (segment.endTime / duration) * w;
        ctx.fillStyle = "rgba(168, 85, 247, 0.08)";
        ctx.fillRect(startX, 0, endX - startX, h);

        for (let i = 0; i < peaks.length; i++) {
            const x = i * totalBarWidth;
            const barH = Math.max(2, peaks[i]! * (h - 30));
            const y = (h - barH) / 2;
            const inRegion = x >= startX && x <= endX;
            ctx.fillStyle = inRegion
                ? "rgba(168, 85, 247, 0.7)"
                : "rgba(168, 85, 247, 0.25)";
            ctx.fillRect(x, y, barWidth, barH);
        }

        if (isPlaying || currentTime > 0) {
            const playX = (currentTime / duration) * w;
            ctx.strokeStyle = "#f97316";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(playX, 0);
            ctx.lineTo(playX, h);
            ctx.stroke();
        }

        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX, h);
        ctx.stroke();
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX + 10, 0);
        ctx.lineTo(startX + 10, 18);
        ctx.lineTo(startX, 24);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 8px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(formatDuration(segment.startTime), startX + 5, 12);

        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(endX, 0);
        ctx.lineTo(endX, h);
        ctx.stroke();
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.moveTo(endX, 0);
        ctx.lineTo(endX - 10, 0);
        ctx.lineTo(endX - 10, 18);
        ctx.lineTo(endX, 24);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 8px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(formatDuration(segment.endTime), endX - 5, 12);

        ctx.fillStyle = "#9ca3af";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        const numLabels = Math.max(2, Math.floor(w / 80));
        for (let i = 0; i <= numLabels; i++) {
            const t = (i / numLabels) * duration;
            const lx = (i / numLabels) * w;
            ctx.fillText(formatDuration(t), lx, h - 4);
        }
    }, [peaks, duration, segment, currentTime, isPlaying, containerWidth]);

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            const dur = durationRef.current;
            if (dur === 0) return;
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const x = e.clientX - rect.left;
            const seg = segmentRef.current;
            const sX = (seg.startTime / dur) * rect.width;
            const eX = (seg.endTime / dur) * rect.width;

            if (Math.abs(x - sX) < 12) {
                setDragging("start");
                e.preventDefault();
            } else if (Math.abs(x - eX) < 12) {
                setDragging("end");
                e.preventDefault();
            } else {
                const time = clamp((x / rect.width) * dur, 0, dur);
                onSeekRef.current(time);
            }
        },
        [] // stable — reads everything from refs
    );

    // This effect ONLY re-runs when dragging changes (null → "start"/"end" → null)
    // Never during mouse moves, so the debounce timer survives.
    useEffect(() => {
        if (!dragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            const dur = durationRef.current;
            if (!rect || dur === 0) return;
            const x = e.clientX - rect.left;
            const time = clamp((x / rect.width) * dur, 0, dur);
            const seg = segmentRef.current;

            if (dragging === "start") {
                onSegmentChangeRef.current(Math.min(time, seg.endTime - 1), seg.endTime);
            } else {
                onSegmentChangeRef.current(seg.startTime, Math.max(time, seg.startTime + 1));
            }

            // Reset debounce: after 250ms of no movement, preview from marker-3s
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                const latestSeg = segmentRef.current;
                const markerTime = dragging === "start" ? latestSeg.startTime : latestSeg.endTime;
                onPreviewRef.current(dragging, markerTime);
            }, 250);
        };

        const handleMouseUp = () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            const seg = segmentRef.current;
            const markerTime = dragging === "start" ? seg.startTime : seg.endTime;
            setDragging(null);
            onPreviewRef.current(dragging, markerTime);
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [dragging]); // ONLY depends on dragging — callbacks are all in refs

    return (
        <div
            ref={containerRef}
            className="relative select-none"
            style={{ cursor: dragging ? "col-resize" : "default" }}
        >
            <canvas
                ref={canvasRef}
                className="w-full rounded-lg border border-gray-200"
                style={{ height: 130 }}
                onMouseDown={handleMouseDown}
            />
        </div>
    );
}

/* ── Split Dialog ── */

export default function SplitDialog({
    open,
    onOpenChange,
    track,
    onComplete,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    track: MusicTrack | null;
    onComplete: () => void;
}) {
    // Internal track selection (when track prop is null, e.g. toolbar button)
    const [internalTrack, setInternalTrack] = useState<MusicTrack | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<MusicTrack[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const effectiveTrack = track ?? internalTrack;

    // Search tracks when no track prop
    useEffect(() => {
        if (!open || track) return;
        if (internalTrack) return; // already picked
        const search = async () => {
            setIsSearching(true);
            try {
                const params = new URLSearchParams();
                if (searchQuery) params.set("search", searchQuery);
                const data = await fetchClient(`/music?${params.toString()}`);
                setSearchResults(Array.isArray(data) ? data : []);
            } catch {
                setSearchResults([]);
            } finally {
                setIsSearching(false);
            }
        };
        search();
    }, [open, track, internalTrack, searchQuery]);

    // Reset when dialog closes
    useEffect(() => {
        if (!open) {
            setInternalTrack(null);
            setSearchQuery("");
        }
    }, [open]);

    // Audio
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [isLoadingAudio, setIsLoadingAudio] = useState(false);
    const previewEndTimeRef = useRef<number | null>(null);

    // Segments
    const [segments, setSegments] = useState<Segment[]>([]);
    const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);

    // Split status
    const [splitStatus, setSplitStatus] = useState<SplitStatus>("idle");
    const [splitResults, setSplitResults] = useState<SplitResult[]>([]);
    const [errorMsg, setErrorMsg] = useState("");

    // Save
    const [isSaving, setIsSaving] = useState(false);
    const [saveResults, setSaveResults] = useState<SaveResult[]>([]);
    const [saveStatus, setSaveStatus] = useState<"idle" | "done" | "error">("idle");

    /* ── Reset when effective track changes ── */
    useEffect(() => {
        if (effectiveTrack && open) {
            const seg: Segment = {
                id: crypto.randomUUID(),
                title: effectiveTrack.title,
                startTime: 0,
                endTime: effectiveTrack.duration,
            };
            setSegments([seg]);
            setActiveSegmentId(seg.id);
            setSplitStatus("idle");
            setSplitResults([]);
            setSaveStatus("idle");
            setSaveResults([]);
            setErrorMsg("");
        }
    }, [effectiveTrack, open]);

    /* ── Load audio & decode ── */
    useEffect(() => {
        if (!effectiveTrack || !open) {
            setAudioBuffer(null);
            return;
        }
        setIsLoadingAudio(true);
        const audio = new Audio(effectiveTrack.fileUrl);
        audio.crossOrigin = "anonymous";
        audio.preload = "auto";
        audioRef.current = audio;

        const onTimeUpdate = () => {
            setCurrentTime(audio.currentTime);
            if (previewEndTimeRef.current !== null && audio.currentTime >= previewEndTimeRef.current) {
                audio.pause();
                setIsPlaying(false);
                previewEndTimeRef.current = null;
            }
        };
        const onEnded = () => { setIsPlaying(false); previewEndTimeRef.current = null; };
        audio.addEventListener("timeupdate", onTimeUpdate);
        audio.addEventListener("ended", onEnded);

        const ctx = new AudioContext();
        audioContextRef.current = ctx;
        fetch(effectiveTrack.fileUrl)
            .then((res) => res.arrayBuffer())
            .then((buf) => ctx.decodeAudioData(buf))
            .then((decoded) => { setAudioBuffer(decoded); setIsLoadingAudio(false); })
            .catch(() => setIsLoadingAudio(false));

        return () => {
            audio.pause();
            audio.removeEventListener("timeupdate", onTimeUpdate);
            audio.removeEventListener("ended", onEnded);
            audioRef.current = null;
            ctx.close().catch(() => { });
        };
    }, [effectiveTrack, open]);

    const handleClose = (v: boolean) => {
        if (!v) {
            audioRef.current?.pause();
            setIsPlaying(false);
            setCurrentTime(0);
            previewEndTimeRef.current = null;
        }
        onOpenChange(v);
    };

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) { audioRef.current.pause(); previewEndTimeRef.current = null; }
        else { audioRef.current.play(); }
        setIsPlaying(!isPlaying);
    };

    const seekTo = (s: number) => {
        if (!audioRef.current) return;
        audioRef.current.currentTime = s;
        setCurrentTime(s);
    };

    const previewSegment = (seg: Segment) => {
        if (!audioRef.current) return;
        audioRef.current.currentTime = Math.max(0, seg.startTime - 3);
        previewEndTimeRef.current = seg.endTime;
        audioRef.current.play();
        setIsPlaying(true);
    };

    const addSegment = () => {
        const newSeg: Segment = { id: crypto.randomUUID(), title: "", startTime: 0, endTime: effectiveTrack?.duration || 0 };
        setSegments((prev) => [...prev, newSeg]);
        setActiveSegmentId(newSeg.id);
    };

    const removeSegment = (id: string) => {
        setSegments((prev) => prev.filter((s) => s.id !== id));
        if (activeSegmentId === id) setActiveSegmentId(segments.find((s) => s.id !== id)?.id || null);
    };

    const updateSegment = (id: string, field: keyof Omit<Segment, "id">, value: string | number) => {
        setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
    };

    const activeSegment = segments.find((s) => s.id === activeSegmentId);

    const handleWaveformSegmentChange = (start: number, end: number) => {
        if (!activeSegmentId) return;
        setSegments((prev) =>
            prev.map((s) =>
                s.id === activeSegmentId
                    ? { ...s, startTime: Math.max(0, Math.round(start * 10) / 10), endTime: Math.min(effectiveTrack?.duration || end, Math.round(end * 10) / 10) }
                    : s
            )
        );
    };

    const handleSplit = async () => {
        if (!effectiveTrack || segments.length === 0) return;
        for (const seg of segments) {
            if (!seg.title.trim()) { setErrorMsg("每个片段都需要标题"); setSplitStatus("error"); return; }
            if (seg.startTime >= seg.endTime) { setErrorMsg(`片段 "${seg.title}" 的开始时间必须小于结束时间`); setSplitStatus("error"); return; }
        }
        setSplitStatus("splitting"); setErrorMsg(""); setSplitResults([]); setSaveStatus("idle"); setSaveResults([]);
        try {
            const data = await fetchClient("/music/split", {
                method: "POST",
                body: JSON.stringify({ trackId: effectiveTrack.id, segments: segments.map((s) => ({ title: s.title.trim(), startTime: s.startTime, endTime: s.endTime })) }),
            });
            setSplitResults(Array.isArray(data) ? data : []);
            setSplitStatus("done");
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : "分割失败，请重试");
            setSplitStatus("error");
        }
    };

    const handleSaveAll = async () => {
        if (!effectiveTrack || splitResults.length === 0) return;
        setIsSaving(true);
        const results: SaveResult[] = [];
        try {
            for (const r of splitResults) {
                try {
                    const check = await fetchClient(`/music/check-title?title=${encodeURIComponent(r.title)}`);
                    if (check.exists && check.id) {
                        await fetchClient(`/music/${check.id}`, { method: "PATCH", body: JSON.stringify({ fileKey: r.fileKey, fileUrl: r.fileUrl, fileSize: r.fileSize, duration: r.duration }) });
                        results.push({ title: r.title, status: "replaced", existingId: check.id });
                    } else {
                        await fetchClient("/music", { method: "POST", body: JSON.stringify({ title: r.title, musician: effectiveTrack.musician, performer: effectiveTrack.performer, category: effectiveTrack.category, series: effectiveTrack.series || undefined, duration: r.duration, fileKey: r.fileKey, fileUrl: r.fileUrl, fileSize: r.fileSize }) });
                        results.push({ title: r.title, status: "created" });
                    }
                } catch { results.push({ title: r.title, status: "error" }); }
            }
            setSaveResults(results);
            setSaveStatus(results.some((r) => r.status === "error") ? "error" : "done");
            if (!results.some((r) => r.status === "error")) { setTimeout(() => { handleClose(false); onComplete(); }, 1200); }
        } catch { setSaveStatus("error"); }
        finally { setIsSaving(false); }
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Scissors className="h-5 w-5 text-amber-600" />
                        分割音乐
                    </DialogTitle>
                </DialogHeader>

                {!effectiveTrack ? (
                    /* ── Track picker ── */
                    <div>
                        <div className="relative mb-3">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <Input
                                type="text"
                                placeholder="搜索音乐标题、作曲家..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <div className="max-h-64 overflow-y-auto space-y-1">
                            {isSearching ? (
                                <div className="py-6 text-center text-gray-500">
                                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-1" />
                                    搜索中...
                                </div>
                            ) : searchResults.length > 0 ? (
                                searchResults.map((t) => (
                                    <button
                                        key={t.id}
                                        onClick={() => setInternalTrack(t)}
                                        className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-amber-50/50 transition-colors text-left"
                                    >
                                        <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                            <Music className="w-4 h-4 text-amber-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{t.title}</p>
                                            <p className="text-xs text-gray-400">{t.musician} · {formatDuration(t.duration)}</p>
                                        </div>
                                        <span className="text-xs text-gray-400">{formatFileSize(t.fileSize)}</span>
                                    </button>
                                ))
                            ) : (
                                <div className="py-6 text-center text-gray-500 text-sm">暂无音乐</div>
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Track info */}
                        <div className="flex items-center gap-3 p-3 bg-amber-50/50 rounded-lg">
                            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Music className="w-5 h-5 text-amber-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 text-sm">{effectiveTrack.title}</p>
                                <p className="text-xs text-gray-500">{effectiveTrack.musician} · {effectiveTrack.performer} · {formatDuration(effectiveTrack.duration)}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={togglePlay} className="w-9 h-9 flex items-center justify-center bg-amber-100 hover:bg-amber-200 rounded-full transition-colors flex-shrink-0">
                                    {isPlaying ? <Pause className="w-4 h-4 text-amber-600" /> : <Play className="w-4 h-4 text-amber-600 ml-0.5" />}
                                </button>
                                {!track && (
                                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => { audioRef.current?.pause(); setInternalTrack(null); setIsPlaying(false); setCurrentTime(0); setSegments([]); setActiveSegmentId(null); setSplitStatus("idle"); setAudioBuffer(null); }}>
                                        更换
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Waveform */}
                        <div>
                            {isLoadingAudio ? (
                                <div className="h-[130px] bg-gray-50 rounded-lg flex items-center justify-center border border-gray-200">
                                    <div className="text-center">
                                        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-1 text-amber-600" />
                                        <p className="text-xs text-gray-500">加载波形...</p>
                                    </div>
                                </div>
                            ) : audioBuffer && activeSegment ? (
                                <>
                                    <WaveformEditor
                                        audioBuffer={audioBuffer}
                                        duration={effectiveTrack.duration}
                                        segment={activeSegment}
                                        onSegmentChange={handleWaveformSegmentChange}
                                        currentTime={currentTime}
                                        isPlaying={isPlaying}
                                        onSeek={seekTo}
                                        onPreview={(marker: "start" | "end", time: number) => {
                                            const audio = audioRef.current;
                                            if (!audio) return;

                                            // 1. Pause and clear stale preview boundary to prevent
                                            //    onTimeUpdate from immediately pausing after seek
                                            audio.pause();
                                            previewEndTimeRef.current = null;

                                            const previewStart = Math.max(0, time - 3);
                                            const previewEnd = marker === "start"
                                                ? Math.min(time + 3, activeSegment?.endTime ?? time + 3)
                                                : time;

                                            // 2. Seek first, then play ONLY after seek completes
                                            //    to avoid playing from the old position
                                            audio.currentTime = previewStart;
                                            setCurrentTime(previewStart);

                                            const onSeeked = () => {
                                                audio.removeEventListener("seeked", onSeeked);
                                                previewEndTimeRef.current = previewEnd;
                                                audio.play().catch(() => { /* ignore AbortError */ });
                                                setIsPlaying(true);
                                            };
                                            audio.addEventListener("seeked", onSeeked, { once: true });

                                            // Fallback: if seeked never fires (audio already at position),
                                            // trigger manually after a short delay
                                            setTimeout(() => {
                                                if (previewEndTimeRef.current === null) {
                                                    onSeeked();
                                                }
                                            }, 100);
                                        }}
                                    />
                                    <div className="flex items-center justify-between mt-1 text-[11px] text-gray-400">
                                        <span>拖拽标记设定起止点</span>
                                        <span className="tabular-nums">{formatDuration(currentTime)} / {formatDuration(effectiveTrack.duration)}</span>
                                    </div>
                                </>
                            ) : null}
                        </div>

                        {/* Segments */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-700">分割片段</span>
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addSegment}>
                                    <Plus className="h-3 w-3 mr-1" />添加
                                </Button>
                            </div>
                            <div className="space-y-2">
                                {segments.map((seg, index) => {
                                    const isActive = seg.id === activeSegmentId;
                                    return (
                                        <div key={seg.id} onClick={() => setActiveSegmentId(seg.id)}
                                            className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${isActive ? "border-amber-400 bg-amber-50/30" : "border-gray-100 bg-gray-50 hover:border-gray-200"}`}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className={`text-xs font-bold w-5 text-center ${isActive ? "text-amber-600" : "text-gray-400"}`}>{index + 1}</span>
                                                <Input value={seg.title} onChange={(e) => updateSegment(seg.id, "title", e.target.value)} placeholder="片段标题..." className="h-8 text-sm flex-1" onClick={(e) => e.stopPropagation()} />
                                                <button onClick={(e) => { e.stopPropagation(); removeSegment(seg.id); }} className="p-1 hover:bg-gray-200 rounded transition-colors">
                                                    <X className="h-3.5 w-3.5 text-gray-400" />
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-2 pl-7">
                                                <div className="flex-1">
                                                    <Label className="text-[10px] text-gray-400">开始</Label>
                                                    <Input value={formatDuration(seg.startTime)} onChange={(e) => { const t = parseTimeInput(e.target.value); if (!isNaN(t)) updateSegment(seg.id, "startTime", t); }} placeholder="0:00" className="h-7 text-xs tabular-nums" onClick={(e) => e.stopPropagation()} />
                                                </div>
                                                <div className="flex-1">
                                                    <Label className="text-[10px] text-gray-400">结束</Label>
                                                    <Input value={formatDuration(seg.endTime)} onChange={(e) => { const t = parseTimeInput(e.target.value); if (!isNaN(t)) updateSegment(seg.id, "endTime", t); }} placeholder="1:00" className="h-7 text-xs tabular-nums" onClick={(e) => e.stopPropagation()} />
                                                </div>
                                                <Button variant="outline" size="sm" className="h-7 px-2 text-xs mt-3" onClick={(e) => { e.stopPropagation(); previewSegment(seg); }} title="预览：从开始前3秒播放">
                                                    <SkipBack className="h-3 w-3 mr-1" />预览
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Actions */}
                        {splitStatus === "idle" && segments.length > 0 && (
                            <Button onClick={handleSplit} className="w-full h-11 font-semibold bg-amber-500 hover:bg-amber-600">
                                <Scissors className="h-4 w-4 mr-2" />开始分割 ({segments.length} 个片段)
                            </Button>
                        )}

                        {splitStatus === "splitting" && (
                            <div className="text-center py-4">
                                <Loader2 className="h-6 w-6 text-amber-600 animate-spin mx-auto mb-2" />
                                <p className="text-sm text-gray-600">正在使用 ffmpeg 分割音频...</p>
                            </div>
                        )}

                        {splitStatus === "error" && (
                            <div className="p-3 rounded-lg border-l-4 border-red-400 bg-red-50">
                                <div className="flex items-start gap-2">
                                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm text-red-700 font-medium">{errorMsg}</p>
                                        <Button variant="outline" size="sm" onClick={() => { setSplitStatus("idle"); setErrorMsg(""); }} className="mt-2 h-7 text-xs">重试</Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Results */}
                        {splitStatus === "done" && splitResults.length > 0 && (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    <span className="text-sm font-medium text-green-700">分割完成</span>
                                    <span className="text-xs text-gray-400">标题匹配则替换，否则新建</span>
                                </div>
                                <div className="space-y-1">
                                    {splitResults.map((r, i) => {
                                        const sr = saveResults.find((s) => s.title === r.title);
                                        return (
                                            <div key={i} className="flex items-center gap-2 p-2 bg-green-50/50 rounded-lg text-sm">
                                                <span className="text-green-600 font-medium w-5 text-center text-xs">{i + 1}</span>
                                                <span className="flex-1 truncate text-gray-900 text-xs">{r.title}</span>
                                                <span className="text-xs text-gray-400">{formatDuration(r.duration)} · {formatFileSize(r.fileSize)}</span>
                                                {sr && (
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${sr.status === "replaced" ? "bg-amber-100 text-amber-700" : sr.status === "created" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                                        {sr.status === "replaced" ? "已替换" : sr.status === "created" ? "新建" : "失败"}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                {saveStatus === "done" ? (
                                    <div className="bg-green-50 rounded-lg p-4 text-center">
                                        <CheckCircle2 className="h-6 w-6 text-green-500 mx-auto mb-1" />
                                        <p className="text-sm font-medium text-green-700">保存成功！</p>
                                    </div>
                                ) : (
                                    <Button onClick={handleSaveAll} disabled={isSaving} className="w-full h-11 font-semibold bg-amber-500 hover:bg-amber-600 disabled:opacity-50">
                                        {isSaving ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />保存中...</>) : `保存全部 ${splitResults.length} 个片段`}
                                    </Button>
                                )}
                                {saveStatus === "error" && <p className="text-xs text-red-500 text-center">部分片段保存失败</p>}
                            </div>
                        )}
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
