"use client";

import React from "react";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
    Home, Play, Pause, SkipBack, SkipForward,
    Volume2, Volume1, VolumeX, ListMusic, Heart, Music2,
    Headphones, Search, Star, User, Music,
    Shuffle, Repeat, Repeat1, Loader2,
    Music4, Mic2, Guitar, Piano, Disc2, Disc3,
    FileMusic, Users, AudioLines, Radio,
    Sparkles, Library, BookOpen, Waves, CirclePlay,
    ChevronLeft, ChevronRight,
    type LucideIcon,
} from "lucide-react";


/* ───────── Icon Map ───────── */

const ICON_MAP: Record<string, LucideIcon> = {
    Music, Music2, Music4, Mic2, Guitar, Piano,
    Disc2, Disc3, FileMusic, ListMusic, Users, AudioLines,
    Headphones, Radio, Volume2, Star, Heart, Sparkles,
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
    playCount: number;
}

interface SidebarEntity {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    icon: string | null;
}

type PlayMode = "sequential" | "repeat-one" | "shuffle";

/* ───────── Constants ───────── */

const PAGE_SIZE = 20;
const DAILY_RECOMMEND_COUNT = 20;

/* ───────── Helpers ───────── */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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
                            <span className={`transition-colors ${active ? "text-purple-600" : "text-gray-400"}`}>
                                {item.icon}
                            </span>
                            <span className="text-sm truncate flex-1 text-left">{item.name}</span>
                            {count > 0 && (
                                <span className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-full ${active ? "text-purple-600 bg-purple-100" : "text-gray-400 bg-gray-100/80"}`}>
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
    /* ── State: Audio ── */
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [currentSong, setCurrentSong] = useState<Song | null>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [audioDuration, setAudioDuration] = useState(0);
    const [volume, setVolume] = useState(0.8);
    const [isMuted, setIsMuted] = useState(false);
    const [playMode, setPlayMode] = useState<PlayMode>("sequential");


    /* ── State: Mobile ── */
    const [sidebarOpen, setSidebarOpen] = useState(false);

    /* ── State: UI ── */
    const [selectedPlaylist, setSelectedPlaylist] = useState("daily");
    const [likedSongs, setLikedSongs] = useState<Set<string>>(new Set());
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

    // Keep ref in sync with state (avoids stale closure in audio events)
    useEffect(() => {
        currentSongRef.current = currentSong;
        // Reset half-played flag when song changes
        if (currentSong && halfPlayedRef.current !== currentSong.id) {
            halfPlayedRef.current = null;
        }
    }, [currentSong]);



    /* ════════════ Audio Engine ════════════ */

    const retryCountRef = useRef(0);
    const maxRetries = 2;

    // Initialize audio element once
    useEffect(() => {
        const audio = new Audio();
        audio.preload = "auto";
        audio.volume = volume;
        audioRef.current = audio;

        const onTimeUpdate = () => {
            setCurrentTime(audio.currentTime);

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
                fetch(`${API_BASE}/music/${song.id}/play`, { method: "PATCH" }).catch(() => { });
                const songId = song.id;
                setPageSongs((prev) =>
                    prev.map((s) =>
                        s.id === songId
                            ? { ...s, playCount: (s.playCount || 0) + 1 }
                            : s
                    )
                );
            }
        };
        const onLoadedMetadata = () => {
            if (isFinite(audio.duration) && audio.duration > 0) {
                setAudioDuration(audio.duration);
            }
            setIsLoading(false);
        };
        const onDurationChange = () => {
            if (isFinite(audio.duration) && audio.duration > 0) {
                setAudioDuration(audio.duration);
            }
        };
        const onCanPlay = () => {
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
            setIsLoading(false);
        };
        const onStalled = () => {
            // Network stall, show loading state
            setIsLoading(true);
        };
        const onError = () => {
            // Auto-retry on transient network errors (mobile connection drops)
            const song = currentSongRef.current;
            if (song && retryCountRef.current < maxRetries) {
                retryCountRef.current += 1;
                const savedTime = audio.currentTime;
                console.warn(`Audio error, retrying (${retryCountRef.current}/${maxRetries})...`);
                setTimeout(() => {
                    audio.src = song.fileUrl;
                    audio.currentTime = savedTime;
                    audio.play().catch(() => { });
                }, 1000);
            } else {
                setIsLoading(false);
                setIsPlaying(false);
            }
        };
        const onEnded = () => handleTrackEnd();
        const onPlay = () => {
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
        audio.addEventListener("stalled", onStalled);
        audio.addEventListener("error", onError);
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("play", onPlay);
        audio.addEventListener("pause", onPause);

        return () => {
            audio.removeEventListener("timeupdate", onTimeUpdate);
            audio.removeEventListener("loadedmetadata", onLoadedMetadata);
            audio.removeEventListener("durationchange", onDurationChange);
            audio.removeEventListener("canplay", onCanPlay);
            audio.removeEventListener("loadstart", onLoadStart);
            audio.removeEventListener("waiting", onWaiting);
            audio.removeEventListener("playing", onPlaying);
            audio.removeEventListener("stalled", onStalled);
            audio.removeEventListener("error", onError);
            audio.removeEventListener("ended", onEnded);
            audio.removeEventListener("play", onPlay);
            audio.removeEventListener("pause", onPause);
            audio.pause();
            audio.src = "";
            // Clean up blob URL if any
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
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
                const catParam = targetCat ? `&category=${encodeURIComponent(targetCat.name)}` : "";
                const searchParam = search ? `&search=${encodeURIComponent(search)}` : "";
                const res = await fetch(`${API_BASE}/music?pageSize=100${catParam}${searchParam}`);
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

            const res = await fetch(`${API_BASE}/music?${params.toString()}`);
            if (!res.ok) return;
            const json = await res.json();
            const tracks: ApiTrack[] = json.data ?? [];
            setPageSongs(tracks.map(mapTrack));
            setTotalPages(json.totalPages ?? 1);
        } catch {
            // API 不可达时保留空
        }
    }, [mapTrack, sidebarCategories]);

    const fetchSidebar = useCallback(async () => {
        try {
            const [cats, arts, srs] = await Promise.all([
                fetch(`${API_BASE}/music-categories`).then((r) => r.ok ? r.json() : []),
                fetch(`${API_BASE}/music-artists`).then((r) => r.ok ? r.json() : []),
                fetch(`${API_BASE}/music-series`).then((r) => r.ok ? r.json() : []),
            ]);
            setSidebarCategories(Array.isArray(cats) ? cats : []);
            setSidebarArtists(Array.isArray(arts) ? arts : []);
            setSidebarSeries(Array.isArray(srs) ? srs : []);
        } catch { /* keep empty */ }
    }, []);

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

    const libraryItems = useMemo(() => [
        { id: "daily", name: "每日推荐", iconName: "Star", icon: <Star className="h-4 w-4" />, filterType: "special" as const },
        ...sidebarCategories.map((c) => {
            const Icon = getIconComponent(c.icon, Music);
            return {
                id: `cat:${c.name}`,
                name: c.name,
                iconName: c.icon || "Music",
                icon: <Icon className="h-4 w-4" />,
                filterType: "category" as const,
            };
        }),
        { id: "all", name: "所有音乐", iconName: "ListMusic", icon: <ListMusic className="h-4 w-4" />, filterType: "special" as const },
    ], [sidebarCategories]);

    const artistItems = useMemo(() =>
        sidebarArtists.map((a) => {
            const Icon = getIconComponent(a.icon, User);
            return {
                id: `artist:${a.name}`,
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
                id: `series:${s.name}`,
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
        return { title: "音乐", iconName: "Music2" };
    }, [selectedPlaylist, libraryItems, artistItems, seriesItems]);

    /* ════════════ Playback Logic ════════════ */

    const blobUrlRef = useRef<string | null>(null);
    const loadAbortRef = useRef<AbortController | null>(null);

    const playSong = useCallback((song: Song, queue?: Song[]) => {
        const audio = audioRef.current;
        if (!audio) return;

        // Abort any in-progress load
        if (loadAbortRef.current) {
            loadAbortRef.current.abort();
            loadAbortRef.current = null;
        }

        // Revoke previous blob URL to free memory
        if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
        }

        retryCountRef.current = 0;
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

        // Always preload full file as blob for reliability
        // This ensures the entire file is in memory before playback,
        // preventing streaming issues (especially on mobile Safari)
        const controller = new AbortController();
        loadAbortRef.current = controller;

        fetch(song.fileUrl, { signal: controller.signal })
            .then((res) => {
                if (!res.ok) throw new Error("fetch failed");
                return res.blob();
            })
            .then((blob) => {
                if (controller.signal.aborted) return;
                const blobUrl = URL.createObjectURL(blob);
                blobUrlRef.current = blobUrl;
                audio.src = blobUrl;
                return audio.play();
            })
            .then(() => {
                if (controller.signal.aborted) return;
                setIsLoading(false);
            })
            .catch((err) => {
                if (err.name === "AbortError") return;
                // autoplay blocked is not a real error, just clear loading
                if (err.name === "NotAllowedError") {
                    setIsLoading(false);
                    return;
                }
                console.error("Audio preload failed:", err);
                setIsLoading(false);
            });

        // Build/reset shuffle queue if entering shuffle mode
        if (playMode === "shuffle" && queue) {
            const shuffled = shuffleArray(queue.filter((s) => s.id !== song.id));
            setShuffleQueue([song, ...shuffled]);
            setShuffleIndex(0);
        }
    }, [playMode]);

    const togglePlayPause = useCallback(() => {
        const audio = audioRef.current;
        if (!audio || !currentSong) return;
        if (isPlaying) {
            audio.pause();
        } else {
            audio.play().catch(() => { });
        }
    }, [currentSong, isPlaying]);

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
            audioRef.current?.play().catch(() => { });
        });
        ms.setActionHandler("pause", () => {
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

    const toggleLike = (songId: string) => {
        setLikedSongs((prev) => {
            const next = new Set(prev);
            if (next.has(songId)) next.delete(songId);
            else next.add(songId);
            return next;
        });
    };

    /* ── Play mode icon ── */
    const PlayModeIcon = useMemo(() => {
        if (playMode === "repeat-one") return Repeat1;
        if (playMode === "shuffle") return Shuffle;
        return Repeat;
    }, [playMode]);

    const playModeLabel = playMode === "sequential" ? "顺序播放" : playMode === "repeat-one" ? "单曲循环" : "随机播放";
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
                {Array.from({ length: 12 }).map((_, i) => (
                    <div
                        key={`note-${i}`}
                        className="absolute text-4xl opacity-[0.04]"
                        style={{
                            left: `${(i * 17 + 5) % 100}%`,
                            top: `${(i * 23 + 10) % 100}%`,
                            animation: `musicFloat ${8 + (i % 4) * 2}s ease-in-out infinite`,
                            animationDelay: `${(i * 0.7) % 5}s`,
                        }}
                    >
                        {["🎵", "🎶", "🎼", "🎹", "🎻"][i % 5]}
                    </div>
                ))}

                <svg className="absolute inset-0 w-full h-full opacity-[0.04]">
                    <defs>
                        <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#06b6d4" />
                            <stop offset="50%" stopColor="#a855f7" />
                            <stop offset="100%" stopColor="#ec4899" />
                        </linearGradient>
                    </defs>
                    {Array.from({ length: 6 }).map((_, i) => (
                        <path
                            key={`wave-${i}`}
                            d={`M 0 ${120 + i * 120} Q 250 ${80 + i * 120} 500 ${120 + i * 120} T 1000 ${120 + i * 120} T 1500 ${120 + i * 120} T 2000 ${120 + i * 120}`}
                            stroke="url(#waveGradient)"
                            strokeWidth="1.5"
                            fill="none"
                            className="animate-wave"
                            style={{ animationDelay: `${i * 0.4}s` }}
                        />
                    ))}
                </svg>

                <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-gradient-to-r from-cyan-200/10 to-purple-200/10 blur-3xl animate-spin-slow" />
                <div
                    className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-gradient-to-r from-purple-200/10 to-pink-200/10 blur-3xl animate-spin-slow"
                    style={{ animationDirection: "reverse", animationDuration: "20s" }}
                />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-gradient-to-br from-amber-100/5 to-rose-100/5 blur-3xl animate-pulse" style={{ animationDuration: "8s" }} />
            </div>
        ),
        []
    );

    /* ════════════ Render ════════════ */

    const progressPercent = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;

    return (
        <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-purple-50/60 to-pink-50/40 relative overflow-hidden">
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
                    fixed inset-y-0 left-0 z-50 w-64 bg-white/90 backdrop-blur-xl shadow-xl
                    transform transition-transform duration-300 ease-in-out
                    md:relative md:translate-x-0 md:shadow-none md:bg-transparent md:backdrop-blur-none
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
                        <SidebarSection title="库" items={libraryItems} selectedPlaylist={selectedPlaylist} songCountMap={songCountMap} onSelect={setSelectedPlaylist} />
                        {artistItems.length > 0 && <SidebarSection title="音乐家" items={artistItems} selectedPlaylist={selectedPlaylist} songCountMap={songCountMap} onSelect={setSelectedPlaylist} />}
                        {seriesItems.length > 0 && <SidebarSection title="系列" items={seriesItems} selectedPlaylist={selectedPlaylist} songCountMap={songCountMap} onSelect={setSelectedPlaylist} />}
                    </div>
                </aside>

                {/* ══════════ 右侧内容区 ══════════ */}
                <main className="flex-1 h-full overflow-y-auto py-4 px-4 md:py-6 md:pr-6 md:pl-0">
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
                                href="https://johnnyallen.blog"
                                className="hidden md:flex items-center gap-2 text-gray-500 hover:text-gray-800 transition-colors group"
                            >
                                <Home className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
                                <span className="text-sm">返回首页</span>
                            </a>
                        </div>

                        {/* 搜索框 */}
                        <div className="relative flex-1 max-w-xs md:max-w-sm md:flex-none md:w-80">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="搜索音乐..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-white/50 backdrop-blur-sm border border-white/60 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100 focus:bg-white/70 transition-all shadow-sm"
                            />
                        </div>
                    </div>

                    {/* 播放列表头部 — 带分类 Logo */}
                    <div className="mb-4 md:mb-6">
                        <div className="flex items-center gap-3 md:gap-4">
                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-200/50">
                                <HeaderIcon className="h-5 w-5 md:h-6 md:w-6 text-white" />
                            </div>
                            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
                                {playlistMeta.title}
                            </h1>
                        </div>
                    </div>

                    {/* 表头 - 桌面端 */}
                    <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-200/50 mb-2">
                        <div className="col-span-1 text-center">序号</div>
                        <div className="col-span-5">标题</div>
                        <div className="col-span-2">艺术家</div>
                        <div className="col-span-1"></div>
                        <div className="col-span-1 text-right">播放</div>
                        <div className="col-span-2 text-right">时长</div>
                    </div>

                    {/* 歌曲列表 */}
                    {pageSongs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                            <Music2 className="h-12 w-12 mb-4 opacity-40" />
                            <p className="text-sm">{searchQuery ? "没有找到匹配的音乐" : "暂无音乐"}</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-0.5">
                                {pageSongs.map((song, index) => {
                                    const isActive = currentSong?.id === song.id;
                                    const isLiked = likedSongs.has(song.id);
                                    const globalIndex = (currentPage - 1) * PAGE_SIZE + index;

                                    return (
                                        <div
                                            key={song.id}
                                            className={`flex items-center gap-3 md:grid md:grid-cols-12 md:gap-4 px-3 md:px-4 py-3 rounded-xl transition-all duration-200 group cursor-pointer ${isActive
                                                ? "bg-white/60 shadow-sm"
                                                : "hover:bg-white/40"
                                                }`}
                                            onClick={() => handlePlaySong(song)}
                                        >
                                            {/* Index / Equalizer */}
                                            <div className="w-6 flex-shrink-0 md:col-span-1 flex items-center justify-center">
                                                {isActive && isPlaying ? (
                                                    <div className="flex items-center gap-[3px]">
                                                        <div className="w-[3px] h-3 bg-purple-500 rounded-full origin-bottom" style={{ animation: "equalizer 0.8s ease-in-out infinite", animationDelay: "0s" }} />
                                                        <div className="w-[3px] h-4 bg-purple-500 rounded-full origin-bottom" style={{ animation: "equalizer 0.8s ease-in-out infinite", animationDelay: "0.2s" }} />
                                                        <div className="w-[3px] h-3 bg-purple-500 rounded-full origin-bottom" style={{ animation: "equalizer 0.8s ease-in-out infinite", animationDelay: "0.4s" }} />
                                                    </div>
                                                ) : isActive && !isPlaying ? (
                                                    <Pause className="h-4 w-4 text-purple-600" />
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
                                                        <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center flex-shrink-0 shadow-sm">
                                                            <CatIcon className={`h-4 w-4 md:h-5 md:w-5 ${isActive ? "text-purple-600" : "text-purple-400"}`} />
                                                        </div>
                                                    );
                                                })()}
                                                <div className="min-w-0">
                                                    <p className={`text-sm truncate ${isActive ? "font-semibold text-purple-700" : "font-medium text-gray-900"}`}>
                                                        {song.title}
                                                    </p>
                                                    <p className="text-xs text-gray-400 truncate">
                                                        {song.musician}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Artist (desktop only) */}
                                            <div className="hidden md:flex col-span-2 items-center">
                                                <span className="text-sm text-gray-500 truncate">{song.artist}</span>
                                            </div>

                                            {/* Like (desktop only) */}
                                            <div className="hidden md:flex col-span-1 items-center justify-center">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); toggleLike(song.id); }}
                                                    className="p-1.5 rounded-full hover:bg-white/60 transition-all opacity-0 group-hover:opacity-100"
                                                >
                                                    <Heart className={`h-4 w-4 transition-colors ${isLiked ? "text-pink-500 fill-pink-500" : "text-gray-400 hover:text-pink-400"}`} />
                                                </button>
                                            </div>

                                            {/* Play Count (desktop only) */}
                                            <div className="hidden md:flex col-span-1 items-center justify-end gap-1">
                                                <Headphones className="h-3 w-3 text-gray-300" />
                                                <span className="text-xs text-gray-400 tabular-nums">{song.playCount || 0}</span>
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
                                                ? "bg-purple-500 text-white shadow-sm"
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
                <div className="fixed bottom-0 left-0 right-0 glass-strong shadow-2xl z-50">
                    {/* 进度条 */}
                    <div className="relative h-1 md:h-1.5 bg-gray-200/50">
                        <div
                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-r-full z-10 transition-[width] duration-100 ease-linear"
                            style={{ width: `${progressPercent}%` }}
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
                                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-md flex-shrink-0">
                                            <CatIcon className="h-5 w-5 md:h-6 md:w-6 text-white" />
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
                                <button onClick={cyclePlayMode} className={`p-2 rounded-lg transition-all ${playModeActive ? "text-purple-600 hover:bg-purple-50" : "text-gray-400 hover:bg-gray-100"}`} title={playModeLabel}>
                                    <PlayModeIcon className="h-4 w-4" />
                                </button>
                                <button onClick={playPrev} className="p-2 hover:bg-gray-100 rounded-lg transition-all">
                                    <SkipBack className="h-4 w-4 text-gray-600" />
                                </button>
                                <button
                                    onClick={togglePlayPause}
                                    className="p-3 md:p-3.5 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-full shadow-lg transition-all active:scale-95"
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
                                            className="h-full bg-gradient-to-r from-purple-400 to-pink-400 group-hover:from-purple-500 group-hover:to-pink-500 transition-colors relative"
                                            style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
                                        >
                                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow border border-purple-400 opacity-0 group-hover:opacity-100 transition-opacity -mr-1" />
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
