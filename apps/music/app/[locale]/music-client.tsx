"use client";

import React from "react";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
    Home, Play, Pause, SkipBack, SkipForward,
    Volume2, Volume1, VolumeX, ListMusic, Music2,
    Headphones, Search, Star, User, Music,
    Shuffle, Repeat, Repeat1, Loader2,
    Music4, Mic2, Guitar, Piano, Disc2, Disc3,
    FileMusic, Users, AudioLines, Radio,
    Sparkles, Library, BookOpen, Waves, CirclePlay,
    ChevronLeft, ChevronRight,
    type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getApiBaseUrl, withLocale } from "@/lib/api";

import {
    calculateBufferedPercent,
    calculateDownloadedPercent,
    calculateDisplayedBufferPercent,
    calculateProgressPercent,
    getRetryResumeTime,
    shouldStopCacheDownload,
    calculateThroughputKbps,
    shouldShowBufferStatus,
} from "@/lib/player-metrics";

/* ───────── Icon Map ───────── */

const ICON_MAP: Record<string, LucideIcon> = {
    Music, Music2, Music4, Mic2, Guitar, Piano,
    Disc2, Disc3, FileMusic, ListMusic, Users, AudioLines,
    Headphones, Radio, Volume2, Star, Sparkles,
    Library, BookOpen, Waves, CirclePlay, User,
};

function getIconComponent(name: string | null | undefined, fallback: LucideIcon = Music2): LucideIcon {
    if (name && ICON_MAP[name]) return ICON_MAP[name]!;
    return fallback;
}

/* ───────── Types ───────── */

interface Song {
    id: string;
    title: string;
    artist: string;      // performer
    musician: string;     // composer
    series: string;
    duration: number;     // in seconds
    durationStr: string;  // formatted "m:ss"
    category: string;
    coverUrl: string;
    fileUrl: string;
    fileSize: number;
    playCount: number;
}

interface SidebarEntity {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    icon: string | null;
    /** 非 zh 时后端返回的中文原名（筛选/计数的规范键） */
    sourceName?: string;
}

type PlayMode = "sequential" | "repeat-one" | "shuffle";

/* ───────── Constants ───────── */

const PAGE_SIZE = 20;
const DAILY_RECOMMEND_COUNT = 20;

/* ───────── Helpers ───────── */

const API_BASE = getApiBaseUrl();

/* ── Sidebar Section (extracted to avoid re-creation on every render tick) ── */
const SidebarSection = React.memo(function SidebarSection({
    title,
    items,
    selectedPlaylist,
    songCountMap,
    onSelect,
}: {
    title: string;
    items: { id: string; name: string; icon: React.ReactNode; filterType?: string }[];
    selectedPlaylist: string;
    songCountMap: Record<string, number>;
    onSelect: (id: string) => void;
}) {
    return (
        <div className="mb-6">
            <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3 px-3">
                {title}
            </h2>
            <nav className="space-y-0.5">
                {items.map((item) => {
                    const active = selectedPlaylist === item.id;
                    const count = songCountMap[item.id] || 0;
                    return (
                        <button
                            key={item.id}
                            onClick={() => onSelect(item.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 ${active
                                ? "bg-white/70 shadow-sm text-gray-900 font-medium"
                                : "text-gray-600 hover:bg-white/40 hover:text-gray-900"
                                }`}
                        >
                            <span className={`transition-colors ${active ? "text-violet-600" : "text-gray-400"}`}>
                                {item.icon}
                            </span>
                            <span className="text-sm truncate flex-1 text-left">{item.name}</span>
                            {count > 0 && (
                                <span className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-full ${active ? "text-violet-700 bg-violet-100/70" : "text-gray-400 bg-gray-100/80"}`}>
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </nav>
        </div>
    );
});

function formatDuration(seconds: number): string {
    if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatNetworkSpeed(kbps: number): string {
    if (!Number.isFinite(kbps) || kbps <= 0) return "0 KB/s";
    const kiloBytes = kbps / 8;
    if (kiloBytes >= 1024) return `${(kiloBytes / 1024).toFixed(1)} MB/s`;
    return `${Math.round(kiloBytes)} KB/s`;
}

/** Fisher-Yates shuffle for generating a random play queue */
function shuffleArray<T>(arr: T[]): T[] {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    return shuffled;
}

/* ───────── Seeded Daily Recommendation ───────── */

class SeededRNG {
    private seed: number;
    constructor(seed: number) { this.seed = seed; }
    next(): number {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
}

function getDailyRecommendation(songs: Song[], categories: SidebarEntity[]): Song[] {
    if (!songs.length || !categories.length) return songs.slice(0, DAILY_RECOMMEND_COUNT);

    const today = new Date();
    const epoch = new Date(2024, 0, 1).getTime();
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysSinceEpoch = Math.floor((today.getTime() - epoch) / msPerDay);

    // Seed from date string for consistency within a day
    const dateString = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
    let seed = 0;
    for (let i = 0; i < dateString.length; i++) {
        seed = ((seed << 5) - seed) + dateString.charCodeAt(i);
        seed |= 0;
    }
    const rng = new SeededRNG(Math.abs(seed));

    // Rotate category daily
    const categoryIndex = daysSinceEpoch % categories.length;
    const targetCategory = categories[categoryIndex];
    if (!targetCategory) return songs.slice(0, DAILY_RECOMMEND_COUNT);

    const genreSongs = songs.filter((s) => s.category === targetCategory.name);
    if (genreSongs.length <= DAILY_RECOMMEND_COUNT) return genreSongs;

    // Score: log popularity + random factor
    const scored = genreSongs.map((song) => ({
        song,
        score: Math.log10((song.playCount || 0) + 1) + rng.next() * 2,
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, DAILY_RECOMMEND_COUNT).map((s) => s.song);
}

/* ───────── Component ───────── */

export default function MusicPageClient() {
    const t = useTranslations("player");
    const locale = useLocale();
    /* ── State: Audio ── */
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [currentSong, setCurrentSong] = useState<Song | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [audioDuration, setAudioDuration] = useState(0);
    const [bufferedPercent, setBufferedPercent] = useState(0);
    const [networkSpeedKbps, setNetworkSpeedKbps] = useState(0);

    const savedStateRef = useRef<{
        songId?: string;
        song?: Song;
        time?: number;
        volume?: number;
        muted?: boolean;
        playMode?: PlayMode;
        playlist?: string;
    } | null>(null);
    const [hasRestoredState, setHasRestoredState] = useState(false);

    const [volume, setVolume] = useState(0.8);
    const [isMuted, setIsMuted] = useState(false);
    const [playMode, setPlayMode] = useState<PlayMode>("sequential");


    /* ── State: Mobile ── */
    const [sidebarOpen, setSidebarOpen] = useState(false);

    /* ── State: UI ── */
    const [selectedPlaylist, setSelectedPlaylist] = useState("daily");
    const [searchQuery, setSearchQuery] = useState("");

    /* ── State: Server-driven pagination ── */
    const [pageSongs, setPageSongs] = useState<Song[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [songCountMap, setSongCountMap] = useState<Record<string, number>>({});

    /* ── State: Sidebar ── */
    const [sidebarCategories, setSidebarCategories] = useState<SidebarEntity[]>([]);
    const [sidebarArtists, setSidebarArtists] = useState<SidebarEntity[]>([]);
    const [sidebarSeries, setSidebarSeries] = useState<SidebarEntity[]>([]);

    /* ── Shuffle queue ── */
    const [shuffleQueue, setShuffleQueue] = useState<Song[]>([]);
    const [shuffleIndex, setShuffleIndex] = useState(0);

    /* ── Play count tracking ── */
    const halfPlayedRef = useRef<string | null>(null); // song id that has been counted
    const currentSongRef = useRef<Song | null>(null);

    // Restore persisted state only after hydration so SSR and the first client render match.
    useEffect(() => {
        try {
            const raw = localStorage.getItem("MUSIC_PLAYER_STATE");
            const saved = raw ? JSON.parse(raw) : {};
            savedStateRef.current = saved;

            if (typeof saved.volume === "number") setVolume(saved.volume);
            if (typeof saved.muted === "boolean") setIsMuted(saved.muted);
            if (saved.playMode === "sequential" || saved.playMode === "repeat-one" || saved.playMode === "shuffle") {
                setPlayMode(saved.playMode);
            }
            if (typeof saved.playlist === "string" && saved.playlist) {
                setSelectedPlaylist(saved.playlist);
            }
        } catch {
            savedStateRef.current = {};
        } finally {
            setHasRestoredState(true);
        }
    }, []);

    // Keep ref in sync with state (avoids stale closure in audio events)
    useEffect(() => {
        currentSongRef.current = currentSong;
        // Reset half-played flag when song changes
        if (currentSong && halfPlayedRef.current !== currentSong.id) {
            halfPlayedRef.current = null;
        }
    }, [currentSong]);

    /* ── Persist playback state to localStorage ── */
    const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const restoredRef = useRef(false);

    // Save non-time state immediately when it changes
    useEffect(() => {
        if (!hasRestoredState) return;
        try {
            const existing = localStorage.getItem("MUSIC_PLAYER_STATE");
            const state = existing ? JSON.parse(existing) : {};
            state.volume = volume;
            state.muted = isMuted;
            state.playMode = playMode;
            state.playlist = selectedPlaylist;
            if (currentSong) {
                state.songId = currentSong.id;
                state.song = currentSong;
            }
            localStorage.setItem("MUSIC_PLAYER_STATE", JSON.stringify(state));
        } catch { /* localStorage may be unavailable */ }
    }, [volume, isMuted, playMode, selectedPlaylist, currentSong, hasRestoredState]);

    // Save currentTime every 5 seconds (throttled to avoid excessive writes)
    useEffect(() => {
        saveTimerRef.current = setInterval(() => {
            if (!currentSongRef.current) return;
            try {
                const existing = localStorage.getItem("MUSIC_PLAYER_STATE");
                const state = existing ? JSON.parse(existing) : {};
                const audio = audioRef.current;
                if (audio && isFinite(audio.currentTime)) {
                    state.time = audio.currentTime;
                }
                localStorage.setItem("MUSIC_PLAYER_STATE", JSON.stringify(state));
            } catch { /* ignore */ }
        }, 5000);
        return () => {
            if (saveTimerRef.current) clearInterval(saveTimerRef.current);
        };
    }, []);

    // Also save time on page unload
    useEffect(() => {
        const handleBeforeUnload = () => {
            try {
                const existing = localStorage.getItem("MUSIC_PLAYER_STATE");
                const state = existing ? JSON.parse(existing) : {};
                const audio = audioRef.current;
                if (audio && isFinite(audio.currentTime)) {
                    state.time = audio.currentTime;
                }
                localStorage.setItem("MUSIC_PLAYER_STATE", JSON.stringify(state));
            } catch { /* ignore */ }
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, []);



    /* ════════════ Audio Engine ════════════ */

    const retryCountRef = useRef(0);
    const maxRetries = 2;
    const bufferSampleRef = useRef<{ bytes: number; at: number } | null>(null);
    const mediaBufferedPercentRef = useRef(0);
    const cacheDownloadedPercentRef = useRef(0);
    const cacheAbortRef = useRef<AbortController | null>(null);
    const lastKnownPlaybackTimeRef = useRef(0);
    const playbackIntentRef = useRef(false);

    const abortCacheDownload = useCallback(() => {
        cacheAbortRef.current?.abort();
        cacheAbortRef.current = null;
    }, []);

    const publishBufferedPercent = useCallback(() => {
        const nextBufferedPercent = calculateDisplayedBufferPercent(
            mediaBufferedPercentRef.current,
            cacheDownloadedPercentRef.current,
        );
        setBufferedPercent(nextBufferedPercent);

        if (shouldStopCacheDownload(nextBufferedPercent)) {
            abortCacheDownload();
            setNetworkSpeedKbps(0);
        }
    }, [abortCacheDownload]);

    const resetBufferTracking = useCallback(() => {
        bufferSampleRef.current = null;
        mediaBufferedPercentRef.current = 0;
        cacheDownloadedPercentRef.current = 0;
        setBufferedPercent(0);
        setNetworkSpeedKbps(0);
    }, []);

    const startCacheDownload = useCallback((song: Song) => {
        abortCacheDownload();

        if (!song.fileUrl || !song.fileSize) return;

        const controller = new AbortController();
        cacheAbortRef.current = controller;

        void (async () => {
            let loadedBytes = 0;
            let previousSample = { bytes: 0, at: performance.now() };

            try {
                const response = await fetch(song.fileUrl, {
                    signal: controller.signal,
                    cache: "force-cache",
                });
                if (!response.ok || !response.body) return;

                const contentLength = Number(response.headers.get("content-length"));
                const totalBytes = Number.isFinite(contentLength) && contentLength > 0
                    ? contentLength
                    : song.fileSize;
                const reader = response.body.getReader();

                while (!controller.signal.aborted) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    loadedBytes += value.byteLength;
                    const downloadedPercent = calculateDownloadedPercent(loadedBytes, totalBytes);
                    cacheDownloadedPercentRef.current = downloadedPercent;
                    publishBufferedPercent();

                    const displayedPercent = calculateDisplayedBufferPercent(
                        mediaBufferedPercentRef.current,
                        downloadedPercent,
                    );
                    if (shouldStopCacheDownload(displayedPercent)) {
                        await reader.cancel().catch(() => undefined);
                        break;
                    }

                    const now = performance.now();
                    setNetworkSpeedKbps(calculateThroughputKbps(
                        loadedBytes,
                        previousSample.bytes,
                        now - previousSample.at,
                    ));
                    previousSample = { bytes: loadedBytes, at: now };
                }

                if (!controller.signal.aborted) {
                    cacheDownloadedPercentRef.current = 100;
                    publishBufferedPercent();
                    setNetworkSpeedKbps(0);
                }
            } catch (err) {
                if (!controller.signal.aborted) {
                    setNetworkSpeedKbps(0);
                    console.warn("Audio cache progress failed:", err);
                }
            } finally {
                if (cacheAbortRef.current === controller) {
                    cacheAbortRef.current = null;
                }
            }
        })();
    }, [abortCacheDownload, publishBufferedPercent]);

    // Initialize audio element once
    useEffect(() => {
        const audio = new Audio();
        audio.preload = "auto";
        audio.setAttribute("playsinline", "");
        audio.volume = volume;
        audio.dataset.musicPlayer = "true";
        audio.style.display = "none";
        document.body.appendChild(audio);
        audioRef.current = audio;

        const updateBufferMetrics = () => {
            const song = currentSongRef.current;
            const duration = isFinite(audio.duration) && audio.duration > 0
                ? audio.duration
                : song?.duration ?? 0;
            mediaBufferedPercentRef.current = calculateBufferedPercent(audio.buffered, duration);
            publishBufferedPercent();
        };

        const onTimeUpdate = () => {
            setCurrentTime(audio.currentTime);
            if (Number.isFinite(audio.currentTime) && audio.currentTime > 0) {
                lastKnownPlaybackTimeRef.current = audio.currentTime;
            }
            updateBufferMetrics();

            // Update MediaSession position state
            if ("mediaSession" in navigator && isFinite(audio.duration) && audio.duration > 0) {
                try {
                    navigator.mediaSession.setPositionState({
                        duration: audio.duration,
                        playbackRate: audio.playbackRate,
                        position: Math.min(audio.currentTime, audio.duration),
                    });
                } catch { /* ignore */ }
            }

            // Track play count: increment when user reaches 50% of the song
            const song = currentSongRef.current;
            if (
                audio.duration > 0 &&
                audio.currentTime >= audio.duration / 2 &&
                song &&
                halfPlayedRef.current !== song.id
            ) {
                halfPlayedRef.current = song.id;
                const songId = song.id;
                fetch(`${API_BASE}/music/${songId}/play`, { method: "PATCH" })
                    .then((res) => {
                        if (!res.ok) throw new Error("play count update failed");
                        setPageSongs((prev) =>
                            prev.map((s) =>
                                s.id === songId
                                    ? { ...s, playCount: (s.playCount || 0) + 1 }
                                    : s
                            )
                        );
                        setCurrentSong((prev) =>
                            prev?.id === songId
                                ? { ...prev, playCount: (prev.playCount || 0) + 1 }
                                : prev
                        );
                    })
                    .catch(() => {
                        halfPlayedRef.current = null;
                    });
            }
        };
        const onLoadedMetadata = () => {
            if (isFinite(audio.duration) && audio.duration > 0) {
                setAudioDuration(audio.duration);
            }
            updateBufferMetrics();
            setIsLoading(false);
        };
        const onDurationChange = () => {
            if (isFinite(audio.duration) && audio.duration > 0) {
                setAudioDuration(audio.duration);
            }
            updateBufferMetrics();
        };
        const onCanPlay = () => {
            updateBufferMetrics();
            setIsLoading(false);
            retryCountRef.current = 0; // reset retry on successful buffer
        };
        const onLoadStart = () => {
            setIsLoading(true);
        };
        const onWaiting = () => {
            // Mobile: buffer ran out, show loading spinner
            setIsLoading(true);
        };
        const onPlaying = () => {
            // Buffer recovered, hide loading spinner
            updateBufferMetrics();
            setIsLoading(false);
        };
        const onProgress = () => {
            updateBufferMetrics();
            if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA || audio.paused) {
                setIsLoading(false);
            }
        };
        const onStalled = () => {
            // Network stall, show loading state
            setIsLoading(true);
            setNetworkSpeedKbps(0);
        };
        const onSuspend = () => {
            updateBufferMetrics();
            setNetworkSpeedKbps(0);
        };
        const onError = () => {
            // Auto-retry on transient network errors (mobile connection drops)
            const song = currentSongRef.current;
            if (song && retryCountRef.current < maxRetries) {
                retryCountRef.current += 1;
                const savedTime = getRetryResumeTime(audio.currentTime, lastKnownPlaybackTimeRef.current);
                const shouldResumePlayback = playbackIntentRef.current;
                console.warn(`Audio error, retrying (${retryCountRef.current}/${maxRetries})...`);
                setTimeout(() => {
                    bufferSampleRef.current = null;
                    const restorePosition = () => {
                        audio.removeEventListener("loadedmetadata", restorePosition);
                        if (savedTime > 0 && savedTime < (audio.duration || song.duration)) {
                            audio.currentTime = savedTime;
                            lastKnownPlaybackTimeRef.current = savedTime;
                            setCurrentTime(savedTime);
                        }
                        if (shouldResumePlayback) {
                            audio.play().catch(() => {
                                playbackIntentRef.current = false;
                                setIsPlaying(false);
                            });
                        }
                    };
                    audio.addEventListener("loadedmetadata", restorePosition, { once: true });
                    audio.src = song.fileUrl;
                    audio.load();
                }, 1000);
            } else {
                setIsLoading(false);
                setIsPlaying(false);
                setNetworkSpeedKbps(0);
            }
        };
        const onEnded = () => handleTrackEnd();
        const onPlay = () => {
            playbackIntentRef.current = true;
            setIsPlaying(true);
            if ("mediaSession" in navigator) {
                navigator.mediaSession.playbackState = "playing";
            }
        };
        const onPause = () => {
            setIsPlaying(false);
            if ("mediaSession" in navigator) {
                navigator.mediaSession.playbackState = "paused";
            }
        };

        audio.addEventListener("timeupdate", onTimeUpdate);
        audio.addEventListener("loadedmetadata", onLoadedMetadata);
        audio.addEventListener("durationchange", onDurationChange);
        audio.addEventListener("canplay", onCanPlay);
        audio.addEventListener("loadstart", onLoadStart);
        audio.addEventListener("waiting", onWaiting);
        audio.addEventListener("playing", onPlaying);
        audio.addEventListener("progress", onProgress);
        audio.addEventListener("stalled", onStalled);
        audio.addEventListener("suspend", onSuspend);
        audio.addEventListener("error", onError);
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("play", onPlay);
        audio.addEventListener("pause", onPause);

        const bufferPoll = window.setInterval(() => {
            if (currentSongRef.current) updateBufferMetrics();
        }, 500);

        return () => {
            window.clearInterval(bufferPoll);
            abortCacheDownload();
            audio.removeEventListener("timeupdate", onTimeUpdate);
            audio.removeEventListener("loadedmetadata", onLoadedMetadata);
            audio.removeEventListener("durationchange", onDurationChange);
            audio.removeEventListener("canplay", onCanPlay);
            audio.removeEventListener("loadstart", onLoadStart);
            audio.removeEventListener("waiting", onWaiting);
            audio.removeEventListener("playing", onPlaying);
            audio.removeEventListener("progress", onProgress);
            audio.removeEventListener("stalled", onStalled);
            audio.removeEventListener("suspend", onSuspend);
            audio.removeEventListener("error", onError);
            audio.removeEventListener("ended", onEnded);
            audio.removeEventListener("play", onPlay);
            audio.removeEventListener("pause", onPause);
            audio.pause();
            audio.src = "";
            audio.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync volume changes
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = isMuted ? 0 : volume;
        }
    }, [volume, isMuted]);

    // We need a ref for handleTrackEnd so the audio's ended event always
    // calls the latest version (closures capture stale state otherwise).
    const handleTrackEndRef = useRef<() => void>(() => { });

    function handleTrackEnd() {
        handleTrackEndRef.current();
    }

    /* ── Data fetching ── */

    interface ApiTrack {
        id: string;
        title: string;
        performer: string;
        musician: string;
        duration: number;
        category: string;
        series: string | null;
        coverUrl: string | null;
        fileUrl: string;
        fileSize?: number;
        playCount?: number;
    }

    const mapTrack = useCallback((t: ApiTrack): Song => ({
        id: t.id,
        title: t.title,
        artist: t.performer,
        musician: t.musician,
        series: t.series || "",
        duration: t.duration,
        durationStr: formatDuration(t.duration),
        category: t.category,
        coverUrl: t.coverUrl || "",
        fileUrl: t.fileUrl,
        fileSize: t.fileSize || 0,
        playCount: t.playCount || 0,
    }), []);

    // Search debounce
    const [debouncedSearch, setDebouncedSearch] = useState("");
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Reset page when filter/search changes
    const prevPlaylistRef = useRef(selectedPlaylist);
    const prevSearchRef = useRef(debouncedSearch);
    useEffect(() => {
        if (prevPlaylistRef.current !== selectedPlaylist || prevSearchRef.current !== debouncedSearch) {
            prevPlaylistRef.current = selectedPlaylist;
            prevSearchRef.current = debouncedSearch;
            setCurrentPage(1);
        }
    }, [selectedPlaylist, debouncedSearch]);

    // Fetch current page of songs from server
    const fetchSongs = useCallback(async (page: number, playlist: string, search: string) => {
        try {
            // Daily recommendation: fetch a larger batch from the rotated category, then pick client-side
            if (playlist === "daily") {
                // Determine today's rotated category
                const today = new Date();
                const epoch = new Date(2024, 0, 1).getTime();
                const msPerDay = 24 * 60 * 60 * 1000;
                const daysSinceEpoch = Math.floor((today.getTime() - epoch) / msPerDay);
                const catIndex = sidebarCategories.length > 0
                    ? daysSinceEpoch % sidebarCategories.length
                    : 0;
                const targetCat = sidebarCategories[catIndex];
                // 筛选键始终用中文规范值（sourceName）
                const catParam = targetCat ? `&category=${encodeURIComponent(targetCat.sourceName ?? targetCat.name)}` : "";
                const searchParam = search ? `&search=${encodeURIComponent(search)}` : "";
                const res = await fetch(withLocale(`${API_BASE}/music?pageSize=100${catParam}${searchParam}`, locale));
                if (!res.ok) return;
                const json = await res.json();
                const tracks: ApiTrack[] = json.data ?? [];
                const songs = tracks.map(mapTrack);
                const daily = getDailyRecommendation(songs, sidebarCategories);
                // Client-side page slicing on the daily recommendation list
                const start = (page - 1) * PAGE_SIZE;
                const pageSlice = daily.slice(start, start + PAGE_SIZE);
                setPageSongs(pageSlice);
                setTotalPages(Math.max(1, Math.ceil(daily.length / PAGE_SIZE)));
                return;
            }

            // Build query params for server-side pagination
            const params = new URLSearchParams();
            params.set("page", String(page));
            params.set("pageSize", String(PAGE_SIZE));
            if (search) params.set("search", search);

            if (playlist === "all") {
                // No filter
            } else if (playlist.startsWith("cat:")) {
                params.set("category", playlist.slice(4));
            } else if (playlist.startsWith("artist:")) {
                params.set("artist", playlist.slice(7));
            } else if (playlist.startsWith("series:")) {
                params.set("series", playlist.slice(7));
            }

            const res = await fetch(withLocale(`${API_BASE}/music?${params.toString()}`, locale));
            if (!res.ok) return;
            const json = await res.json();
            const tracks: ApiTrack[] = json.data ?? [];
            setPageSongs(tracks.map(mapTrack));
            setTotalPages(json.totalPages ?? 1);
        } catch {
            // API 不可达时保留空
        }
    }, [mapTrack, sidebarCategories, locale]);

    const fetchSidebar = useCallback(async () => {
        try {
            const [cats, arts, srs] = await Promise.all([
                fetch(withLocale(`${API_BASE}/music-categories`, locale)).then((r) => r.ok ? r.json() : []),
                fetch(withLocale(`${API_BASE}/music-artists`, locale)).then((r) => r.ok ? r.json() : []),
                fetch(withLocale(`${API_BASE}/music-series`, locale)).then((r) => r.ok ? r.json() : []),
            ]);
            setSidebarCategories(Array.isArray(cats) ? cats : []);
            setSidebarArtists(Array.isArray(arts) ? arts : []);
            setSidebarSeries(Array.isArray(srs) ? srs : []);
        } catch { /* keep empty */ }
    }, [locale]);

    const fetchCounts = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/music/counts`);
            if (!res.ok) return;
            const json = await res.json();
            const map: Record<string, number> = {};
            map["all"] = json.total ?? 0;
            map["daily"] = DAILY_RECOMMEND_COUNT;
            if (Array.isArray(json.byCategory)) {
                for (const item of json.byCategory) {
                    map[`cat:${item.category}`] = item._count ?? 0;
                }
            }
            if (Array.isArray(json.byArtist)) {
                for (const item of json.byArtist) {
                    map[`artist:${item.musician}`] = item._count ?? 0;
                }
            }
            if (Array.isArray(json.bySeries)) {
                for (const item of json.bySeries) {
                    if (item.series) {
                        map[`series:${item.series}`] = item._count ?? 0;
                    }
                }
            }
            setSongCountMap(map);
        } catch { /* keep empty */ }
    }, []);

    // Initial load: sidebar + counts
    const sidebarLoadedRef = useRef(false);
    useEffect(() => {
        if (!sidebarLoadedRef.current) {
            sidebarLoadedRef.current = true;
            fetchSidebar();
            fetchCounts();
        }
    }, [fetchSidebar, fetchCounts]);

    // Fetch songs whenever page/filter/search changes (and sidebar is loaded)
    useEffect(() => {
        fetchSongs(currentPage, selectedPlaylist, debouncedSearch);
    }, [currentPage, selectedPlaylist, debouncedSearch, fetchSongs]);

    /* ── Sidebar items ── */

    // id 用中文规范值（sourceName，与曲目筛选/计数键一致），name 用当前语言展示值
    const libraryItems = useMemo(() => [
        { id: "daily", name: t("dailyRecommend"), iconName: "Star", icon: <Star className="h-4 w-4" />, filterType: "special" as const },
        ...sidebarCategories.map((c) => {
            const Icon = getIconComponent(c.icon, Music);
            return {
                id: `cat:${c.sourceName ?? c.name}`,
                name: c.name,
                iconName: c.icon || "Music",
                icon: <Icon className="h-4 w-4" />,
                filterType: "category" as const,
            };
        }),
        { id: "all", name: t("allMusic"), iconName: "ListMusic", icon: <ListMusic className="h-4 w-4" />, filterType: "special" as const },
    ], [sidebarCategories, t]);

    const artistItems = useMemo(() =>
        sidebarArtists.map((a) => {
            const Icon = getIconComponent(a.icon, User);
            return {
                id: `artist:${a.sourceName ?? a.name}`,
                name: a.name,
                iconName: a.icon || "User",
                icon: <Icon className="h-4 w-4" />,
                filterType: "artist" as const,
            };
        }),
        [sidebarArtists]);

    const seriesItems = useMemo(() =>
        sidebarSeries.map((s) => {
            const Icon = getIconComponent(s.icon, Headphones);
            return {
                id: `series:${s.sourceName ?? s.name}`,
                name: s.name,
                iconName: s.icon || "Headphones",
                icon: <Icon className="h-4 w-4" />,
                filterType: "series" as const,
            };
        }),
        [sidebarSeries]);

    const playlistMeta = useMemo(() => {
        const allItems = [...libraryItems, ...artistItems, ...seriesItems];
        const item = allItems.find((i) => i.id === selectedPlaylist);
        if (item) return { title: item.name, iconName: item.iconName };
        return { title: t("musicFallbackTitle"), iconName: "Music2" };
    }, [selectedPlaylist, libraryItems, artistItems, seriesItems, t]);

    /* ════════════ Playback Logic ════════════ */

    const playSong = useCallback((song: Song, queue?: Song[]) => {
        const audio = audioRef.current;
        if (!audio) return;

        retryCountRef.current = 0;
        resetBufferTracking();
        lastKnownPlaybackTimeRef.current = 0;
        playbackIntentRef.current = true;
        halfPlayedRef.current = null;
        setCurrentSong(song);
        setCurrentTime(0);
        setAudioDuration(song.duration || 0);
        setIsLoading(true);

        // Update MediaSession metadata for lock screen
        if ("mediaSession" in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: song.title,
                artist: song.musician || song.artist,
                album: song.category,
                artwork: song.coverUrl ? [
                    { src: song.coverUrl, sizes: "256x256", type: "image/png" },
                ] : [],
            });
            // Set initial position state with known duration from DB
            try {
                navigator.mediaSession.setPositionState({
                    duration: song.duration,
                    playbackRate: 1,
                    position: 0,
                });
            } catch { /* ignore */ }
        }

        audio.pause();
        audio.src = song.fileUrl;
        audio.load();
        startCacheDownload(song);
        audio.play()
            .then(() => setIsLoading(false))
            .catch((err) => {
                // Autoplay blocked is not a network error; the user can press play.
                if (err.name === "NotAllowedError") {
                    playbackIntentRef.current = false;
                    setIsLoading(false);
                    setIsPlaying(false);
                    return;
                }
                console.error("Audio play failed:", err);
                playbackIntentRef.current = false;
                setIsLoading(false);
                setIsPlaying(false);
            });

        // Build/reset shuffle queue if entering shuffle mode
        if (playMode === "shuffle" && queue) {
            const shuffled = shuffleArray(queue.filter((s) => s.id !== song.id));
            setShuffleQueue([song, ...shuffled]);
            setShuffleIndex(0);
        }
    }, [playMode, resetBufferTracking, startCacheDownload]);

    /* ── Restore saved song on mount ── */
    useEffect(() => {
        if (restoredRef.current) return;
        restoredRef.current = true;

        const saved = savedStateRef.current;
        if (!saved?.song?.id || !saved.song.fileUrl) return;

        const song = saved.song;
        const savedTime = saved.time || 0;
        const audio = audioRef.current;
        if (!audio) return;

        // Set UI state immediately (song info, duration, time)
        setCurrentSong(song);
        setCurrentTime(savedTime);
        setAudioDuration(song.duration || 0);
        resetBufferTracking();
        lastKnownPlaybackTimeRef.current = savedTime;
        playbackIntentRef.current = false;
        setIsLoading(true);

        // Update MediaSession metadata
        if ("mediaSession" in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: song.title,
                artist: song.musician || song.artist,
                album: song.category,
            });
        }

        audio.src = song.fileUrl;
        audio.load();
        startCacheDownload(song);

        // After metadata loads, seek to saved time (stay paused).
        const onReady = () => {
            audio.removeEventListener("loadedmetadata", onReady);
            if (savedTime > 0 && savedTime < (audio.duration || song.duration)) {
                audio.currentTime = savedTime;
                setCurrentTime(savedTime);
            }
            if (isFinite(audio.duration) && audio.duration > 0) {
                setAudioDuration(audio.duration);
            }
            setIsLoading(false);
        };
        audio.addEventListener("loadedmetadata", onReady, { once: true });
    }, [resetBufferTracking, startCacheDownload]);

    const togglePlayPause = useCallback(() => {
        const audio = audioRef.current;
        if (!audio || !currentSong) return;
        if (!audio.paused && !audio.ended) {
            playbackIntentRef.current = false;
            audio.pause();
        } else {
            playbackIntentRef.current = true;
            audio.play().catch(() => {
                playbackIntentRef.current = false;
                setIsPlaying(false);
                setIsLoading(false);
            });
        }
    }, [currentSong]);

    // Next / Previous track helpers
    const getNextSong = useCallback((): Song | null => {
        if (!currentSong) return pageSongs[0] || null;

        if (playMode === "repeat-one") return currentSong;

        if (playMode === "shuffle") {
            const nextIdx = shuffleIndex + 1;
            if (nextIdx < shuffleQueue.length) {
                setShuffleIndex(nextIdx);
                return shuffleQueue[nextIdx] || null;
            }
            // Re-shuffle when exhausted
            const newQueue = shuffleArray(pageSongs);
            setShuffleQueue(newQueue);
            setShuffleIndex(0);
            return newQueue[0] || null;
        }

        // Sequential
        const currentIdx = pageSongs.findIndex((s) => s.id === currentSong.id);
        if (currentIdx < pageSongs.length - 1) {
            return pageSongs[currentIdx + 1] || null;
        }
        return null; // End of list in sequential mode
    }, [currentSong, pageSongs, playMode, shuffleIndex, shuffleQueue]);

    const getPrevSong = useCallback((): Song | null => {
        if (!currentSong) return null;

        if (playMode === "repeat-one") return currentSong;

        if (playMode === "shuffle") {
            const prevIdx = shuffleIndex - 1;
            if (prevIdx >= 0) {
                setShuffleIndex(prevIdx);
                return shuffleQueue[prevIdx] || null;
            }
            return currentSong; // At start, replay current
        }

        // Sequential
        const currentIdx = pageSongs.findIndex((s) => s.id === currentSong.id);
        if (currentIdx > 0) {
            return pageSongs[currentIdx - 1] || null;
        }
        return null;
    }, [currentSong, pageSongs, playMode, shuffleIndex, shuffleQueue]);

    const playNext = useCallback(() => {
        const next = getNextSong();
        if (next) playSong(next);
    }, [getNextSong, playSong]);

    const playPrev = useCallback(() => {
        const audio = audioRef.current;
        // If more than 3 seconds in, restart current track
        if (audio && audio.currentTime > 3) {
            audio.currentTime = 0;
            lastKnownPlaybackTimeRef.current = 0;
            setCurrentTime(0);
            return;
        }
        const prev = getPrevSong();
        if (prev) playSong(prev);
    }, [getPrevSong, playSong]);

    // Keep the ended handler ref up-to-date
    useEffect(() => {
        handleTrackEndRef.current = () => {
            if (playMode === "repeat-one") {
                const audio = audioRef.current;
                if (audio) {
                    audio.currentTime = 0;
                    lastKnownPlaybackTimeRef.current = 0;
                    setCurrentTime(0);
                    playbackIntentRef.current = true;
                    audio.play().catch(() => { });
                }
            } else {
                playNext();
            }
        };
    }, [playMode, playNext]);

    // MediaSession action handlers (lock screen / notification controls)
    useEffect(() => {
        if (!("mediaSession" in navigator)) return;
        const ms = navigator.mediaSession;
        ms.setActionHandler("play", () => {
            playbackIntentRef.current = true;
            audioRef.current?.play().catch(() => { });
        });
        ms.setActionHandler("pause", () => {
            playbackIntentRef.current = false;
            audioRef.current?.pause();
        });
        ms.setActionHandler("previoustrack", () => {
            playPrev();
        });
        ms.setActionHandler("nexttrack", () => {
            playNext();
        });
        ms.setActionHandler("seekto", (details) => {
            if (audioRef.current && details.seekTime != null) {
                audioRef.current.currentTime = details.seekTime;
                lastKnownPlaybackTimeRef.current = details.seekTime;
                setCurrentTime(details.seekTime);
            }
        });
        return () => {
            ms.setActionHandler("play", null);
            ms.setActionHandler("pause", null);
            ms.setActionHandler("previoustrack", null);
            ms.setActionHandler("nexttrack", null);
            ms.setActionHandler("seekto", null);
        };
    }, [playNext, playPrev]);

    const cyclePlayMode = useCallback(() => {
        setPlayMode((prev) => {
            if (prev === "sequential") return "repeat-one";
            if (prev === "repeat-one") return "shuffle";
            return "sequential";
        });
    }, []);

    // When switching to shuffle mode, generate queue from current list
    useEffect(() => {
        if (playMode === "shuffle" && pageSongs.length > 0) {
            const queue = shuffleArray(pageSongs);
            setShuffleQueue(queue);
            if (currentSong) {
                const idx = queue.findIndex((s: Song) => s.id === currentSong.id);
                setShuffleIndex(idx >= 0 ? idx : 0);
            } else {
                setShuffleIndex(0);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playMode]);



    /* ── Volume ── */

    const volumeBarRef = useRef<HTMLDivElement>(null);
    const volumeDragging = useRef(false);

    const computeVolumeRatio = useCallback((clientX: number) => {
        const bar = volumeBarRef.current;
        if (!bar) return;
        const rect = bar.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        setVolume(ratio);
        setIsMuted(false);
    }, []);

    const handleVolumeMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        volumeDragging.current = true;
        computeVolumeRatio(e.clientX);

        const onMouseMove = (ev: MouseEvent) => {
            if (!volumeDragging.current) return;
            computeVolumeRatio(ev.clientX);
        };
        const onMouseUp = () => {
            volumeDragging.current = false;
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    }, [computeVolumeRatio]);

    /* ── Progress bar seek (drag + click) ── */

    const progressBarRef = useRef<HTMLDivElement>(null);
    const progressDragging = useRef(false);
    const [seekPreview, setSeekPreview] = useState<number | null>(null);

    const computeSeekTime = useCallback((clientX: number): number => {
        const bar = progressBarRef.current;
        if (!bar || audioDuration <= 0) return 0;
        const rect = bar.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return ratio * audioDuration;
    }, [audioDuration]);

    const handleProgressMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        progressDragging.current = true;
        const time = computeSeekTime(e.clientX);
        setSeekPreview(time);

        const onMouseMove = (ev: MouseEvent) => {
            if (!progressDragging.current) return;
            const t = computeSeekTime(ev.clientX);
            setSeekPreview(t);
        };
        const onMouseUp = (ev: MouseEvent) => {
            progressDragging.current = false;
            const t = computeSeekTime(ev.clientX);
            setSeekPreview(null);
            // Seek audio to the final position
            const audio = audioRef.current;
            if (audio) {
                audio.currentTime = t;
                lastKnownPlaybackTimeRef.current = t;
                setCurrentTime(t);
                if (isPlaying) {
                    playbackIntentRef.current = true;
                    audio.play().catch(() => { });
                }
            }
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    }, [computeSeekTime, isPlaying]);

    const handleProgressTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        progressDragging.current = true;
        const touch = e.touches[0];
        if (!touch) return;
        const time = computeSeekTime(touch.clientX);
        setSeekPreview(time);

        const onTouchMove = (ev: TouchEvent) => {
            if (!progressDragging.current) return;
            const t2 = ev.touches[0];
            if (!t2) return;
            const t = computeSeekTime(t2.clientX);
            setSeekPreview(t);
        };
        const onTouchEnd = (ev: TouchEvent) => {
            progressDragging.current = false;
            const ct = ev.changedTouches[0];
            const t = ct ? computeSeekTime(ct.clientX) : (seekPreview ?? 0);
            setSeekPreview(null);
            const audio = audioRef.current;
            if (audio) {
                audio.currentTime = t;
                lastKnownPlaybackTimeRef.current = t;
                setCurrentTime(t);
                if (isPlaying) {
                    playbackIntentRef.current = true;
                    audio.play().catch(() => { });
                }
            }
            window.removeEventListener("touchmove", onTouchMove);
            window.removeEventListener("touchend", onTouchEnd);
        };
        window.addEventListener("touchmove", onTouchMove, { passive: true });
        window.addEventListener("touchend", onTouchEnd);
    }, [computeSeekTime, isPlaying, seekPreview]);

    const toggleMute = useCallback(() => {
        setIsMuted((prev) => !prev);
    }, []);

    /* ── Song actions ── */

    const handlePlaySong = (song: Song) => {
        if (currentSong?.id === song.id) {
            togglePlayPause();
            return;
        }
        playSong(song, pageSongs);
        // If in shuffle mode, rebuild queue with this song first
        if (playMode === "shuffle") {
            const queue = shuffleArray(pageSongs.filter((s: Song) => s.id !== song.id));
            setShuffleQueue([song, ...queue]);
            setShuffleIndex(0);
        }
    };

    /* ── Play mode icon ── */
    const PlayModeIcon = useMemo(() => {
        if (playMode === "repeat-one") return Repeat1;
        if (playMode === "shuffle") return Shuffle;
        return Repeat;
    }, [playMode]);

    const playModeLabel = playMode === "sequential" ? t("playModeSequential") : playMode === "repeat-one" ? t("playModeRepeatOne") : t("playModeShuffle");
    const playModeActive = playMode !== "sequential";

    /* ── Volume icon ── */
    const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

    /* ── Header icon ── */
    const HeaderIcon = useMemo(() => {
        return getIconComponent(playlistMeta.iconName, Music2);
    }, [playlistMeta.iconName]);

    /* ─── Sidebar Section ─── */
    // SidebarSection is extracted outside the component (see below MusicPageClient)
    // to avoid re-creation on every render tick, which caused flicker and swallowed clicks.

    /* ─── Animated Background ─── */
    const AnimatedBackground = useMemo(
        () => (
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute inset-0 bg-[#f8f6f1]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_12%,rgba(255,255,255,0.86),transparent_30%),radial-gradient(circle_at_82%_78%,rgba(124,58,237,0.07),transparent_34%),linear-gradient(to_bottom,rgba(255,255,255,0.48),transparent_40%,rgba(255,255,255,0.72))]" />

                {/* Piano keys */}
                <div className="absolute -bottom-14 -left-12 flex h-52 rotate-[-8deg] opacity-[0.18]">
                    {Array.from({ length: 18 }).map((_, index) => (
                        <div
                            key={`white-key-${index}`}
                            className="relative h-full w-12 border border-slate-800/25 bg-white"
                        >
                            {[0, 1, 3, 4, 5].includes(index % 7) && (
                                <div className="absolute -right-3 top-0 h-32 w-6 rounded-b-sm bg-slate-950" />
                            )}
                        </div>
                    ))}
                </div>

                <div className="absolute -left-10 top-24 flex h-44 rotate-[9deg] opacity-[0.09] md:opacity-[0.12]">
                    {Array.from({ length: 12 }).map((_, index) => (
                        <div
                            key={`side-key-${index}`}
                            className="relative h-full w-10 border border-slate-800/20 bg-white"
                        >
                            {[0, 1, 3, 4, 5].includes(index % 7) && (
                                <div className="absolute -right-2 top-0 h-28 w-5 rounded-b-sm bg-slate-950" />
                            )}
                        </div>
                    ))}
                </div>

                <svg className="absolute inset-0 h-full w-full opacity-[0.13]" viewBox="0 0 1200 800" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="musicLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#334155" stopOpacity="0.35" />
                            <stop offset="55%" stopColor="#7c3aed" stopOpacity="0.42" />
                            <stop offset="100%" stopColor="#be185d" stopOpacity="0.32" />
                        </linearGradient>
                    </defs>

                    {/* Staff lines */}
                    {Array.from({ length: 5 }).map((_, index) => (
                        <path
                            key={`staff-${index}`}
                            d={`M 80 ${210 + index * 18} C 280 ${160 + index * 18}, 470 ${270 + index * 18}, 650 ${220 + index * 18} S 980 ${170 + index * 18}, 1160 ${235 + index * 18}`}
                            fill="none"
                            stroke="url(#musicLineGradient)"
                            strokeWidth="1"
                        />
                    ))}

                    {/* Violin body */}
                    <path
                        d="M 865 165 C 786 112, 730 200, 795 266 C 720 308, 742 430, 837 412 C 856 498, 986 501, 1000 410 C 1086 431, 1125 312, 1038 266 C 1094 192, 1025 111, 956 166 C 933 187, 889 187, 865 165 Z"
                        fill="none"
                        stroke="url(#musicLineGradient)"
                        strokeWidth="3"
                    />
                    <path
                        d="M 914 132 C 921 204, 919 306, 913 438"
                        fill="none"
                        stroke="#334155"
                        strokeOpacity="0.22"
                        strokeWidth="1.4"
                    />
                    <path
                        d="M 952 132 C 946 212, 949 312, 958 438"
                        fill="none"
                        stroke="#334155"
                        strokeOpacity="0.22"
                        strokeWidth="1.4"
                    />
                    <path
                        d="M 936 108 L 936 458"
                        fill="none"
                        stroke="#7c3aed"
                        strokeOpacity="0.22"
                        strokeWidth="1"
                    />
                    <path
                        d="M 850 452 C 900 475, 974 475, 1026 452"
                        fill="none"
                        stroke="#334155"
                        strokeOpacity="0.18"
                        strokeWidth="2"
                    />

                    {/* Violin neck and bow */}
                    <path
                        d="M 935 104 C 939 69, 962 50, 1002 44"
                        fill="none"
                        stroke="#334155"
                        strokeOpacity="0.2"
                        strokeWidth="4"
                        strokeLinecap="round"
                    />
                    <path
                        d="M 740 520 C 870 438, 1000 330, 1135 190"
                        fill="none"
                        stroke="#be185d"
                        strokeOpacity="0.18"
                        strokeWidth="2"
                    />

                    {/* Music notes */}
                    <g fill="#7c3aed" fillOpacity="0.22">
                        <circle cx="286" cy="256" r="10" />
                        <rect x="294" y="190" width="4" height="68" rx="2" />
                        <circle cx="408" cy="214" r="8" />
                        <rect x="416" y="154" width="4" height="62" rx="2" />
                        <path d="M 416 154 C 446 164, 458 176, 462 194" fill="none" stroke="#7c3aed" strokeOpacity="0.22" strokeWidth="4" />
                    </g>
                </svg>

                <svg
                    className="absolute -right-10 top-28 h-[58vh] w-56 opacity-[0.11] md:right-[8%] md:top-20 md:h-[68vh] md:w-72"
                    viewBox="0 0 260 520"
                    fill="none"
                >
                    <path
                        d="M122 78 C80 46 45 96 78 145 C36 178 47 252 99 248 C110 300 183 300 193 248 C245 252 257 177 214 145 C248 96 211 45 169 78 C156 90 135 90 122 78 Z"
                        stroke="#7c3aed"
                        strokeWidth="5"
                        strokeOpacity="0.42"
                    />
                    <path d="M130 54 C135 142 134 252 126 336" stroke="#334155" strokeWidth="2" strokeOpacity="0.32" />
                    <path d="M160 54 C153 142 155 250 165 336" stroke="#334155" strokeWidth="2" strokeOpacity="0.32" />
                    <path d="M146 36 L146 370" stroke="#be185d" strokeWidth="1.5" strokeOpacity="0.35" />
                    <path d="M92 360 C124 378 174 378 208 360" stroke="#334155" strokeWidth="4" strokeOpacity="0.24" />
                    <path d="M146 36 C151 14 169 6 204 4" stroke="#334155" strokeWidth="8" strokeLinecap="round" strokeOpacity="0.22" />
                    <path d="M36 454 C100 372 174 270 240 112" stroke="#be185d" strokeWidth="3" strokeOpacity="0.24" />
                </svg>

                <div className="absolute bottom-[16%] right-[10%] flex items-end gap-1 opacity-[0.08]">
                    {Array.from({ length: 18 }).map((_, index) => (
                        <div
                            key={index}
                            className="w-1 bg-violet-700"
                            style={{ height: `${12 + ((index * 9) % 36)}px` }}
                        />
                    ))}
                </div>
            </div>
        ),
        []
    );

    /* ════════════ Render ════════════ */

    const progressPercent = calculateProgressPercent(currentTime, audioDuration);
    const visibleProgressPercent = seekPreview !== null
        ? calculateProgressPercent(seekPreview, audioDuration)
        : progressPercent;
    const showBufferStatus = shouldShowBufferStatus(bufferedPercent);
    const bufferStatusLabel = isLoading && networkSpeedKbps <= 0
        ? t("buffering")
        : formatNetworkSpeed(networkSpeedKbps);

    return (
        <div className="min-h-screen bg-[#f8f6f1] relative overflow-hidden">
            {AnimatedBackground}

            {/* 主要内容 */}
            <div className="relative z-10 flex h-screen" style={{ paddingBottom: currentSong ? "96px" : "0" }}>
                {/* ══════════ 移动端侧边栏 backdrop ══════════ */}
                {sidebarOpen && (
                    <div
                        className="fixed inset-0 bg-black/30 z-40 md:hidden"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                {/* ══════════ 左侧边栏 ══════════ */}
                <aside className={`
                    fixed inset-y-0 left-0 z-50 w-64 bg-white/90 backdrop-blur-xl shadow-xl border-r border-slate-200/70
                    transform transition-transform duration-300 ease-in-out
                    md:relative md:translate-x-0 md:shadow-none md:bg-white/[0.18] md:backdrop-blur-sm
                    ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
                    h-full overflow-y-auto py-6 px-4 flex-shrink-0
                `}>
                    {/* 移动端关闭按钮 */}
                    <button
                        className="md:hidden absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                        onClick={() => setSidebarOpen(false)}
                    >
                        ✕
                    </button>

                    <div onClick={() => setSidebarOpen(false)}>
                        <SidebarSection title={t("sectionLibrary")} items={libraryItems} selectedPlaylist={selectedPlaylist} songCountMap={songCountMap} onSelect={setSelectedPlaylist} />
                        {artistItems.length > 0 && <SidebarSection title={t("sectionArtists")} items={artistItems} selectedPlaylist={selectedPlaylist} songCountMap={songCountMap} onSelect={setSelectedPlaylist} />}
                        {seriesItems.length > 0 && <SidebarSection title={t("sectionSeries")} items={seriesItems} selectedPlaylist={selectedPlaylist} songCountMap={songCountMap} onSelect={setSelectedPlaylist} />}
                    </div>

                    {/* 工具入口 */}
                    <div className="mt-4 space-y-1 px-3">
                        <Link
                            href="/tuner"
                            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-500 hover:text-emerald-700 hover:bg-white/45 transition-all duration-200"
                        >
                            <Mic2 className="h-4 w-4" />
                            <span>{t("tuner")}</span>
                        </Link>
                        <Link
                            href="/scores"
                            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-500 hover:text-violet-700 hover:bg-white/45 transition-all duration-200"
                        >
                            <span className="text-base">🎼</span>
                            <span>{t("scores")}</span>
                        </Link>
                    </div>
                </aside>

                {/* ══════════ 右侧内容区 ══════════ */}
                <main className="flex-1 h-full overflow-y-auto py-4 px-4 md:py-6 md:pl-6 md:pr-6">
                    {/* 顶部导航 */}
                    <div className="flex items-center justify-between mb-6 md:mb-8 gap-3">
                        <div className="flex items-center gap-3">
                            {/* 移动端菜单按钮 */}
                            <button
                                className="md:hidden p-2 rounded-lg hover:bg-white/60 text-gray-600"
                                onClick={() => setSidebarOpen(true)}
                            >
                                <ListMusic className="h-5 w-5" />
                            </button>
                            <a
                                href={`https://johnnyallen.blog${locale === "zh" ? "" : `/${locale}`}`}
                                className="hidden md:flex items-center gap-2 text-gray-500 hover:text-gray-800 transition-colors group"
                            >
                                <Home className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
                                <span className="text-sm">{t("backHome")}</span>
                            </a>
                            <LanguageSwitcher />
                        </div>

                        {/* 搜索框 */}
                        <div className="relative flex-1 max-w-xs md:max-w-sm md:flex-none md:w-80">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder={t("searchPlaceholder")}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-white/45 backdrop-blur-sm border border-slate-200/70 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100/80 focus:bg-white/70 transition-all shadow-sm"
                            />
                        </div>
                    </div>

                    {/* 播放列表头部 — 带分类 Logo */}
                    <div className="mb-4 md:mb-6">
                        <div className="flex items-center gap-3 md:gap-4">
                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-white/55 border border-slate-200/70 flex items-center justify-center shadow-sm">
                                <HeaderIcon className="h-5 w-5 md:h-6 md:w-6 text-violet-700" />
                            </div>
                            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                                {playlistMeta.title}
                            </h1>
                        </div>
                    </div>

                    {/* 表头 - 桌面端 */}
                    <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-slate-200/70 mb-2">
                        <div className="col-span-1 text-center">{t("colIndex")}</div>
                        <div className="col-span-5">{t("colTitle")}</div>
                        <div className="col-span-3">{t("colPerformerMusician")}</div>
                        <div className="col-span-1 text-right">{t("colPlays")}</div>
                        <div className="col-span-2 text-right">{t("colDuration")}</div>
                    </div>

                    {/* 歌曲列表 */}
                    {pageSongs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                            <Music2 className="h-12 w-12 mb-4 opacity-40" />
                            <p className="text-sm">{searchQuery ? t("noMatchingMusic") : t("noMusic")}</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-0.5">
                                {pageSongs.map((song, index) => {
                                    const isActive = currentSong?.id === song.id;
                                    const globalIndex = (currentPage - 1) * PAGE_SIZE + index;

                                    return (
                                        <div
                                            key={song.id}
                                            className={`flex items-center gap-3 md:grid md:grid-cols-12 md:gap-4 px-3 md:px-4 py-3 rounded-xl border transition-all duration-200 group cursor-pointer ${isActive
                                                ? "bg-white/65 border-violet-200/80 shadow-sm"
                                                : "border-transparent hover:border-slate-200/70 hover:bg-white/35"
                                                }`}
                                            onClick={() => handlePlaySong(song)}
                                        >
                                            {/* Index / Equalizer */}
                                            <div className="w-6 flex-shrink-0 md:col-span-1 flex items-center justify-center">
                                                {isActive && isPlaying ? (
                                                    <div className="flex items-center gap-[3px]">
                                                        <div className="w-[3px] h-3 bg-violet-600 rounded-full origin-bottom" style={{ animation: "equalizer 0.8s ease-in-out infinite", animationDelay: "0s" }} />
                                                        <div className="w-[3px] h-4 bg-violet-600 rounded-full origin-bottom" style={{ animation: "equalizer 0.8s ease-in-out infinite", animationDelay: "0.2s" }} />
                                                        <div className="w-[3px] h-3 bg-violet-600 rounded-full origin-bottom" style={{ animation: "equalizer 0.8s ease-in-out infinite", animationDelay: "0.4s" }} />
                                                    </div>
                                                ) : isActive && !isPlaying ? (
                                                    <Pause className="h-4 w-4 text-violet-700" />
                                                ) : (
                                                    <span className="text-sm text-gray-400">
                                                        {globalIndex + 1}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Category Icon + Title */}
                                            <div className="flex-1 min-w-0 md:col-span-5 flex items-center gap-3">
                                                {(() => {
                                                    const cat = sidebarCategories.find((c) => c.name === song.category);
                                                    const CatIcon = getIconComponent(cat?.icon, Music);
                                                    return (
                                                        <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg bg-white/55 border border-slate-200/70 flex items-center justify-center flex-shrink-0 shadow-sm">
                                                            <CatIcon className={`h-4 w-4 md:h-5 md:w-5 ${isActive ? "text-violet-700" : "text-slate-500"}`} />
                                                        </div>
                                                    );
                                                })()}
                                                <div className="min-w-0">
                                                    <p className={`text-sm truncate ${isActive ? "font-semibold text-violet-800" : "font-medium text-gray-900"}`}>
                                                        {song.title}
                                                    </p>
                                                    <p className="text-xs text-gray-400 truncate">
                                                        {song.musician}
                                                    </p>
                                                    <p className="md:hidden mt-0.5 text-[11px] text-gray-400 tabular-nums truncate">
                                                        {t("playCount", { count: song.playCount || 0 })}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Artist (desktop only) */}
                                            <div className="hidden md:flex col-span-3 items-center min-w-0">
                                                <span className="text-sm text-gray-500 truncate">
                                                    {song.artist}
                                                    {song.musician ? ` · ${song.musician}` : ""}
                                                </span>
                                            </div>

                                            {/* Play count (desktop only) */}
                                            <div className="hidden md:flex col-span-1 items-center justify-end min-w-0">
                                                <span
                                                    className="inline-flex items-center gap-1 text-xs text-gray-400 tabular-nums"
                                                    title={t("playCount", { count: song.playCount || 0 })}
                                                >
                                                    <Headphones className="h-3.5 w-3.5" />
                                                    {song.playCount || 0}
                                                </span>
                                            </div>

                                            {/* Duration */}
                                            <div className="flex-shrink-0 md:col-span-2 flex items-center justify-end">
                                                <span className="text-xs md:text-sm text-gray-400 tabular-nums">{song.durationStr}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-center gap-2 mt-6 pb-4">
                                    <button
                                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="p-2 rounded-lg hover:bg-white/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                    >
                                        <ChevronLeft className="h-4 w-4 text-gray-600" />
                                    </button>
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                                        <button
                                            key={page}
                                            onClick={() => setCurrentPage(page)}
                                            className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${page === currentPage
                                                ? "bg-violet-700 text-white shadow-sm"
                                                : "text-gray-500 hover:bg-white/60"
                                                }`}
                                        >
                                            {page}
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="p-2 rounded-lg hover:bg-white/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                    >
                                        <ChevronRight className="h-4 w-4 text-gray-600" />
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </main>
            </div>

            {/* ══════════ 底部播放器 ══════════ */}
            {currentSong && (
                <div className="fixed bottom-0 left-0 right-0 bg-white/82 backdrop-blur-xl border-t border-slate-200/80 shadow-2xl shadow-slate-900/10 z-50">
                    {/* 进度条 — 可点击 / 可拖拽 */}
                    <div
                        ref={progressBarRef}
                        className="relative h-2 md:h-2 bg-gray-200/50 cursor-pointer group"
                        onMouseDown={handleProgressMouseDown}
                        onTouchStart={handleProgressTouchStart}
                    >
                        <div
                            className="absolute inset-y-0 left-0 bg-slate-300/80 rounded-r-full z-10 transition-[width] duration-150 ease-linear"
                            style={{
                                width: `${bufferedPercent}%`,
                                backgroundImage: isLoading
                                    ? "linear-gradient(90deg, rgba(203,213,225,0.72), rgba(226,232,240,0.96), rgba(203,213,225,0.72))"
                                    : undefined,
                                backgroundSize: isLoading ? "200% 100%" : undefined,
                                animation: isLoading ? "progressShimmer 1.35s linear infinite" : undefined,
                            }}
                        />
                        <div
                            className="absolute inset-y-0 left-0 bg-violet-700 rounded-r-full z-20 transition-[width] duration-75 ease-linear"
                            style={{ width: `${visibleProgressPercent}%` }}
                        />
                        {/* Drag thumb */}
                        <div
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 md:w-3.5 md:h-3.5 bg-white rounded-full shadow-md border-2 border-violet-700 z-30 opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{
                                left: `${visibleProgressPercent}%`,
                                opacity: seekPreview !== null ? 1 : undefined,
                            }}
                        />
                    </div>

                    <div className="px-3 py-2 md:px-6 md:py-3">
                        <div className="flex items-center gap-3 md:gap-6">
                            {/* 当前播放歌曲信息 */}
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                {(() => {
                                    const cat = sidebarCategories.find((c) => c.name === currentSong.category);
                                    const CatIcon = getIconComponent(cat?.icon, Music);
                                    return (
                                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-white/70 border border-slate-200/80 flex items-center justify-center shadow-sm flex-shrink-0">
                                            <CatIcon className="h-5 w-5 md:h-6 md:w-6 text-violet-700" />
                                        </div>
                                    );
                                })()}
                                <div className="flex-1 min-w-0 hidden sm:block">
                                    <p className="font-semibold text-gray-900 truncate text-sm">
                                        {currentSong.title}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate">
                                        {currentSong.artist} · {currentSong.musician}
                                    </p>
                                </div>
                            </div>

                            {/* 播放控制 */}
                            <div className="flex items-center gap-1 md:gap-3">
                                <button onClick={cyclePlayMode} className={`p-2 rounded-lg transition-all ${playModeActive ? "text-violet-700 hover:bg-violet-50" : "text-gray-400 hover:bg-gray-100"}`} title={playModeLabel}>
                                    <PlayModeIcon className="h-4 w-4" />
                                </button>
                                <button onClick={playPrev} className="p-2 hover:bg-gray-100 rounded-lg transition-all">
                                    <SkipBack className="h-4 w-4 text-gray-600" />
                                </button>
                                <button
                                    onClick={togglePlayPause}
                                    className="p-3 md:p-3.5 bg-gradient-to-r from-violet-700 to-rose-600 hover:from-violet-800 hover:to-rose-700 rounded-full shadow-lg shadow-violet-900/15 transition-all active:scale-95"
                                >
                                    {isLoading ? (
                                        <Loader2 className="h-5 w-5 text-white animate-spin" />
                                    ) : isPlaying ? (
                                        <Pause className="h-5 w-5 text-white" fill="white" />
                                    ) : (
                                        <Play className="h-5 w-5 text-white" fill="white" />
                                    )}
                                </button>
                                <button onClick={playNext} className="p-2 hover:bg-gray-100 rounded-lg transition-all">
                                    <SkipForward className="h-4 w-4 text-gray-600" />
                                </button>
                            </div>

                            {/* 时间 + 音量控制 */}
                            <div className="flex items-center gap-2 md:gap-4 flex-1 justify-end">
                                <span className="text-xs text-gray-400 tabular-nums">{formatDuration(currentTime)}</span>
                                <span className="text-xs text-gray-300">/</span>
                                <span className="text-xs text-gray-400 tabular-nums">{formatDuration(audioDuration)}</span>
                                {showBufferStatus && (
                                    <span className="hidden md:inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/55 px-2 py-1 text-[11px] tabular-nums text-gray-500">
                                        {t("bufferStatus", { percent: Math.round(bufferedPercent) })} · {bufferStatusLabel}
                                    </span>
                                )}
                                <div className="hidden md:flex items-center gap-2 ml-4">
                                    <button onClick={toggleMute} className="p-1 hover:bg-gray-100 rounded transition-all">
                                        <VolumeIcon className="h-4 w-4 text-gray-500" />
                                    </button>
                                    <div
                                        ref={volumeBarRef}
                                        className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden cursor-pointer group relative"
                                        onMouseDown={handleVolumeMouseDown}
                                    >
                                        <div
                                            className="h-full bg-violet-600 transition-colors relative"
                                            style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
                                        >
                                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow border border-violet-500 opacity-0 group-hover:opacity-100 transition-opacity -mr-1" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
