"use client";

import {
    useState,
    useEffect,
    useCallback,
    useRef,
    useMemo,
    Suspense,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
    ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function TimeInput({
    value,
    onChange,
    onPreview,
    className,
}: {
    value: number;
    onChange: (val: number) => void;
    onPreview?: (committedTime: number) => void;
    className?: string;
}) {
    const [localMin, setLocalMin] = useState(Math.floor(value / 60).toString());
    const [localSec, setLocalSec] = useState(Math.floor(value % 60).toString().padStart(2, "0"));
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const isFocused = containerRef.current?.contains(document.activeElement);
        if (!isFocused) {
            setLocalMin(Math.floor(value / 60).toString());
            setLocalSec(Math.floor(value % 60).toString().padStart(2, "0"));
        }
    }, [value]);

    const handleBlur = (e: React.FocusEvent) => {
        if (containerRef.current?.contains(e.relatedTarget as Node)) return;
        const m = parseInt(localMin, 10) || 0;
        const s = parseInt(localSec, 10) || 0;
        const total = m * 60 + s;
        if (total !== value) {
            onChange(total);
        } else {
            setLocalMin(Math.floor(value / 60).toString());
            setLocalSec(Math.floor(value % 60).toString().padStart(2, "0"));
        }
        if (onPreview) onPreview(total);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLElement).blur();
        }
    };

    return (
        <div
            ref={containerRef}
            className={`flex items-center bg-white border border-gray-200 rounded-md px-2 focus-within:ring-1 focus-within:ring-purple-500 focus-within:border-purple-500 transition-shadow transition-colors ${className || ""}`}
            onClick={(e) => e.stopPropagation()}
        >
            <input
                type="text"
                value={localMin}
                onChange={(e) => setLocalMin(e.target.value.replace(/\D/g, ''))}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className="w-8 text-right bg-transparent outline-none tabular-nums text-xs placeholder:text-gray-300 font-mono"
                placeholder="0"
            />
            <span className="text-gray-400 font-medium text-xs mx-0.5">:</span>
            <input
                type="text"
                value={localSec}
                onChange={(e) => {
                    let val = e.target.value.replace(/\D/g, '');
                    if (val.length > 2) val = val.slice(0, 2);
                    setLocalSec(val);
                }}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                className="w-8 text-left bg-transparent outline-none tabular-nums text-xs placeholder:text-gray-300 font-mono"
                placeholder="00"
            />
        </div>
    );
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
        const h = 160;
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
        []
    );

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
    }, [dragging]);

    return (
        <div
            ref={containerRef}
            className="relative select-none"
            style={{ cursor: dragging ? "col-resize" : "default" }}
        >
            <canvas
                ref={canvasRef}
                className="w-full rounded-lg border border-gray-200"
                style={{ height: 160 }}
                onMouseDown={handleMouseDown}
            />
        </div>
    );
}

/* ── Split Page ── */

function SplitPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const trackIdFromUrl = searchParams.get("trackId");

    // Track selection
    const [selectedTrack, setSelectedTrack] = useState<MusicTrack | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<MusicTrack[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Load track from URL param
    useEffect(() => {
        if (!trackIdFromUrl) return;
        const loadTrack = async () => {
            try {
                const track = await fetchClient(`/music/${trackIdFromUrl}`);
                if (track?.id) setSelectedTrack(track);
            } catch {
                /* track not found */
            }
        };
        loadTrack();
    }, [trackIdFromUrl]);

    // Search tracks when no track selected
    useEffect(() => {
        if (selectedTrack) return;
        const search = async () => {
            setIsSearching(true);
            try {
                const params = new URLSearchParams();
                params.set("pageSize", "50");
                if (searchQuery) params.set("search", searchQuery);
                const result = await fetchClient(`/music?${params.toString()}`);
                const list = result?.data ?? result;
                setSearchResults(Array.isArray(list) ? list : []);
            } catch {
                setSearchResults([]);
            } finally {
                setIsSearching(false);
            }
        };
        search();
    }, [selectedTrack, searchQuery]);

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

    /* ── Reset when track changes ── */
    useEffect(() => {
        if (selectedTrack) {
            const seg: Segment = {
                id: crypto.randomUUID(),
                title: selectedTrack.title,
                startTime: 0,
                endTime: selectedTrack.duration,
            };
            setSegments([seg]);
            setActiveSegmentId(seg.id);
            setSplitStatus("idle");
            setSplitResults([]);
            setSaveStatus("idle");
            setSaveResults([]);
            setErrorMsg("");
        }
    }, [selectedTrack]);

    // Blob URL ref for cleanup
    const blobUrlRef = useRef<string | null>(null);

    /* ── Load audio & decode ── */
    useEffect(() => {
        if (!selectedTrack) {
            setAudioBuffer(null);
            return;
        }
        setIsLoadingAudio(true);

        const audio = new Audio();
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

        // Fetch the entire file once, use it for both blob URL (seeking) and waveform decoding
        fetch(selectedTrack.fileUrl)
            .then((res) => res.arrayBuffer())
            .then(async (buf) => {
                // Create blob URL for the Audio element — enables reliable seeking
                const blob = new Blob([buf], { type: "audio/mpeg" });
                const url = URL.createObjectURL(blob);
                if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = url;
                audio.src = url;

                // Decode for waveform visualization
                const decoded = await ctx.decodeAudioData(buf.slice(0));
                setAudioBuffer(decoded);
                setIsLoadingAudio(false);
            })
            .catch(() => setIsLoadingAudio(false));

        return () => {
            audio.pause();
            audio.removeEventListener("timeupdate", onTimeUpdate);
            audio.removeEventListener("ended", onEnded);
            audioRef.current = null;
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
            ctx.close().catch(() => { });
        };
    }, [selectedTrack]);

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

    /** Preview from 3s before a given time point (same as drag behavior) */
    const previewFromTime = (marker: "start" | "end", time: number) => {
        const audio = audioRef.current;
        if (!audio) return;

        audio.pause();
        previewEndTimeRef.current = null;

        const seg = segments.find((s) => s.id === activeSegmentId);
        const previewStart = Math.max(0, time - 3);
        const previewEnd = marker === "start"
            ? Math.min(time + 3, seg?.endTime ?? time + 3)
            : time;

        audio.currentTime = previewStart;
        setCurrentTime(previewStart);

        const onSeeked = () => {
            audio.removeEventListener("seeked", onSeeked);
            previewEndTimeRef.current = previewEnd;
            audio.play().catch(() => { });
            setIsPlaying(true);
        };
        audio.addEventListener("seeked", onSeeked, { once: true });
        setTimeout(() => {
            if (previewEndTimeRef.current === null) onSeeked();
        }, 100);
    };

    const addSegment = () => {
        const newSeg: Segment = { id: crypto.randomUUID(), title: "", startTime: 0, endTime: selectedTrack?.duration || 0 };
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
                    ? { ...s, startTime: Math.max(0, Math.round(start * 10) / 10), endTime: Math.min(selectedTrack?.duration || end, Math.round(end * 10) / 10) }
                    : s
            )
        );
    };

    const handleSplit = async () => {
        if (!selectedTrack || segments.length === 0) return;
        for (const seg of segments) {
            if (!seg.title.trim()) { setErrorMsg("每个片段都需要标题"); setSplitStatus("error"); return; }
            if (seg.startTime >= seg.endTime) { setErrorMsg(`片段 "${seg.title}" 的开始时间必须小于结束时间`); setSplitStatus("error"); return; }
        }
        setSplitStatus("splitting"); setErrorMsg(""); setSplitResults([]); setSaveStatus("idle"); setSaveResults([]);
        try {
            const data = await fetchClient("/music/split", {
                method: "POST",
                body: JSON.stringify({ trackId: selectedTrack.id, segments: segments.map((s) => ({ title: s.title.trim(), startTime: s.startTime, endTime: s.endTime })) }),
            });
            setSplitResults(Array.isArray(data) ? data : []);
            setSplitStatus("done");
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : "分割失败，请重试");
            setSplitStatus("error");
        }
    };

    const handleSaveAll = async () => {
        if (!selectedTrack || splitResults.length === 0) return;
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
                        await fetchClient("/music", { method: "POST", body: JSON.stringify({ title: r.title, musician: selectedTrack.musician, performer: selectedTrack.performer, category: selectedTrack.category, series: selectedTrack.series || undefined, duration: r.duration, fileKey: r.fileKey, fileUrl: r.fileUrl, fileSize: r.fileSize }) });
                        results.push({ title: r.title, status: "created" });
                    }
                } catch { results.push({ title: r.title, status: "error" }); }
            }
            setSaveResults(results);
            setSaveStatus(results.some((r) => r.status === "error") ? "error" : "done");
            if (!results.some((r) => r.status === "error")) { setTimeout(() => { router.push("/music"); }, 1200); }
        } catch { setSaveStatus("error"); }
        finally { setIsSaving(false); }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-cyan-50">
            {/* Header */}
            <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/60 sticky top-0 z-10">
                <div className="px-8 py-4 flex items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => router.push("/music")}>
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        返回
                    </Button>
                    <div className="flex items-center gap-2">
                        <Scissors className="h-5 w-5 text-purple-500" />
                        <h1 className="text-xl font-bold text-gray-900">音乐分割</h1>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-4xl mx-auto p-8 space-y-6">
                {!selectedTrack ? (
                    /* ── Track picker ── */
                    <div className="bg-white rounded-xl shadow-sm p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">选择要分割的音乐</h2>
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <Input
                                type="text"
                                placeholder="搜索音乐标题、作曲家..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <div className="max-h-96 overflow-y-auto space-y-1">
                            {isSearching ? (
                                <div className="py-8 text-center text-gray-500">
                                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-1" />
                                    搜索中...
                                </div>
                            ) : searchResults.length > 0 ? (
                                searchResults.map((t) => (
                                    <button
                                        key={t.id}
                                        onClick={() => setSelectedTrack(t)}
                                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-purple-50/50 transition-colors text-left"
                                    >
                                        <div className="w-10 h-10 bg-gradient-to-br from-purple-100 to-pink-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                            <Music className="w-5 h-5 text-purple-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{t.title}</p>
                                            <p className="text-xs text-gray-400">{t.musician} · {formatDuration(t.duration)}</p>
                                        </div>
                                        <span className="text-xs text-gray-400">{formatFileSize(t.fileSize)}</span>
                                    </button>
                                ))
                            ) : (
                                <div className="py-8 text-center text-gray-500 text-sm">暂无音乐</div>
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Track info */}
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-pink-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                    <Music className="w-6 h-6 text-purple-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-gray-900">{selectedTrack.title}</p>
                                    <p className="text-sm text-gray-500">{selectedTrack.musician} · {selectedTrack.performer} · {formatDuration(selectedTrack.duration)}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={togglePlay} className="w-10 h-10 flex items-center justify-center bg-purple-100 hover:bg-purple-200 rounded-full transition-colors flex-shrink-0">
                                        {isPlaying ? <Pause className="w-4 h-4 text-purple-600" /> : <Play className="w-4 h-4 text-purple-600 ml-0.5" />}
                                    </button>
                                    {!trackIdFromUrl && (
                                        <Button variant="ghost" size="sm" className="text-xs" onClick={() => { audioRef.current?.pause(); setSelectedTrack(null); setIsPlaying(false); setCurrentTime(0); setSegments([]); setActiveSegmentId(null); setSplitStatus("idle"); setAudioBuffer(null); }}>
                                            更换
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* Waveform */}
                            <div>
                                {isLoadingAudio ? (
                                    <div className="h-[160px] bg-gray-50 rounded-lg flex items-center justify-center border border-gray-200">
                                        <div className="text-center">
                                            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-1 text-purple-500" />
                                            <p className="text-xs text-gray-500">加载波形...</p>
                                        </div>
                                    </div>
                                ) : audioBuffer && activeSegment ? (
                                    <>
                                        <WaveformEditor
                                            audioBuffer={audioBuffer}
                                            duration={selectedTrack.duration}
                                            segment={activeSegment}
                                            onSegmentChange={handleWaveformSegmentChange}
                                            currentTime={currentTime}
                                            isPlaying={isPlaying}
                                            onSeek={seekTo}
                                            onPreview={(marker: "start" | "end", time: number) => {
                                                const audio = audioRef.current;
                                                if (!audio) return;

                                                audio.pause();
                                                previewEndTimeRef.current = null;

                                                const previewStart = Math.max(0, time - 3);
                                                const previewEnd = marker === "start"
                                                    ? Math.min(time + 3, activeSegment?.endTime ?? time + 3)
                                                    : time;

                                                audio.currentTime = previewStart;
                                                setCurrentTime(previewStart);

                                                const onSeeked = () => {
                                                    audio.removeEventListener("seeked", onSeeked);
                                                    previewEndTimeRef.current = previewEnd;
                                                    audio.play().catch(() => { /* ignore AbortError */ });
                                                    setIsPlaying(true);
                                                };
                                                audio.addEventListener("seeked", onSeeked, { once: true });

                                                setTimeout(() => {
                                                    if (previewEndTimeRef.current === null) {
                                                        onSeeked();
                                                    }
                                                }, 100);
                                            }}
                                        />
                                        <div className="flex items-center justify-between mt-1 text-[11px] text-gray-400">
                                            <span>拖拽标记设定起止点</span>
                                            <span className="tabular-nums">{formatDuration(currentTime)} / {formatDuration(selectedTrack.duration)}</span>
                                        </div>
                                    </>
                                ) : null}
                            </div>
                        </div>

                        {/* Segments */}
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-base font-semibold text-gray-900">分割片段</span>
                                <Button variant="outline" size="sm" onClick={addSegment}>
                                    <Plus className="h-3 w-3 mr-1" />添加
                                </Button>
                            </div>
                            <div className="space-y-3">
                                {segments.map((seg, index) => {
                                    const isActive = seg.id === activeSegmentId;
                                    return (
                                        <div key={seg.id} onClick={() => setActiveSegmentId(seg.id)}
                                            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${isActive ? "border-purple-400 bg-purple-50/30" : "border-gray-100 bg-gray-50 hover:border-gray-200"}`}>
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className={`text-xs font-bold w-5 text-center ${isActive ? "text-purple-600" : "text-gray-400"}`}>{index + 1}</span>
                                                <Input value={seg.title} onChange={(e) => updateSegment(seg.id, "title", e.target.value)} placeholder="片段标题..." className="h-9 text-sm flex-1" onClick={(e) => e.stopPropagation()} />
                                                <button onClick={(e) => { e.stopPropagation(); removeSegment(seg.id); }} className="p-1 hover:bg-gray-200 rounded transition-colors">
                                                    <X className="h-3.5 w-3.5 text-gray-400" />
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-3 pl-7">
                                                <div className="flex-1">
                                                    <Label className="text-[10px] text-gray-400">开始</Label>
                                                    <TimeInput
                                                        value={seg.startTime}
                                                        onChange={(t) => updateSegment(seg.id, "startTime", t)}
                                                        onPreview={(t) => previewFromTime("start", t)}
                                                        className="h-8 mt-1"
                                                    />
                                                </div>
                                                <div className="flex-1">
                                                    <Label className="text-[10px] text-gray-400">结束</Label>
                                                    <TimeInput
                                                        value={seg.endTime}
                                                        onChange={(t) => updateSegment(seg.id, "endTime", t)}
                                                        onPreview={(t) => previewFromTime("end", t)}
                                                        className="h-8 mt-1"
                                                    />
                                                </div>
                                                <Button variant="outline" size="sm" className="h-8 px-3 text-xs mt-3" onClick={(e) => { e.stopPropagation(); previewSegment(seg); }} title="预览：从开始前3秒播放">
                                                    <SkipBack className="h-3 w-3 mr-1" />预览
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            {splitStatus === "idle" && segments.length > 0 && (
                                <Button onClick={handleSplit} className="w-full h-12 font-semibold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-base">
                                    <Scissors className="h-4 w-4 mr-2" />开始分割 ({segments.length} 个片段)
                                </Button>
                            )}

                            {splitStatus === "splitting" && (
                                <div className="text-center py-6">
                                    <Loader2 className="h-6 w-6 text-purple-500 animate-spin mx-auto mb-2" />
                                    <p className="text-sm text-gray-600">正在使用 ffmpeg 分割音频...</p>
                                </div>
                            )}

                            {splitStatus === "error" && (
                                <div className="p-4 rounded-lg border-l-4 border-red-400 bg-red-50">
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
                                                <div key={i} className="flex items-center gap-2 p-2.5 bg-green-50/50 rounded-lg text-sm">
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
                                        <Button onClick={handleSaveAll} disabled={isSaving} className="w-full h-12 font-semibold bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 disabled:opacity-50 text-base">
                                            {isSaving ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />保存中...</>) : `保存全部 ${splitResults.length} 个片段`}
                                        </Button>
                                    )}
                                    {saveStatus === "error" && <p className="text-xs text-red-500 text-center">部分片段保存失败</p>}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default function SplitPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-cyan-50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-purple-500 animate-spin" />
            </div>
        }>
            <SplitPageContent />
        </Suspense>
    );
}
