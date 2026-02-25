"use client";

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
import { ImageWithFallback } from "@/components/ImageWithFallback";

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

function formatDuration(seconds: number): string {
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


    /* ── State: UI ── */
    const [selectedPlaylist, setSelectedPlaylist] = useState("daily");
    const [likedSongs, setLikedSongs] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState("");
    const [allSongs, setAllSongs] = useState<Song[]>([]);

    const [currentPage, setCurrentPage] = useState(1);

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

    // Initialize audio element once
    useEffect(() => {
        const audio = new Audio();
        audio.preload = "auto";
        audio.volume = volume;
        audioRef.current = audio;

        const onTimeUpdate = () => {
            setCurrentTime(audio.currentTime);

            // Track play count: increment when user reaches 50% of the song
            const song = currentSongRef.current;
            if (
                audio.duration > 0 &&
                audio.currentTime >= audio.duration / 2 &&
                song &&
                halfPlayedRef.current !== song.id
            ) {
                halfPlayedRef.current = song.id;
                // Fire and forget: increment play count on server
                fetch(`${API_BASE}/music/${song.id}/play`, { method: "PATCH" }).catch(() => { });
                // Update local state
                const songId = song.id;
                setAllSongs((prev) =>
                    prev.map((s) =>
                        s.id === songId
                            ? { ...s, playCount: (s.playCount || 0) + 1 }
                            : s
                    )
                );
            }
        };
        const onLoadedMetadata = () => {
            setAudioDuration(audio.duration);
            setIsLoading(false);
        };
        const onCanPlay = () => {
            setIsLoading(false);
        };
        const onLoadStart = () => {
            setIsLoading(true);
        };
        const onEnded = () => handleTrackEnd();
        const onPlay = () => setIsPlaying(true);
        const onPause = () => {
            setIsPlaying(false);
        };

        audio.addEventListener("timeupdate", onTimeUpdate);
        audio.addEventListener("loadedmetadata", onLoadedMetadata);
        audio.addEventListener("canplay", onCanPlay);
        audio.addEventListener("loadstart", onLoadStart);
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("play", onPlay);
        audio.addEventListener("pause", onPause);

        return () => {
            audio.removeEventListener("timeupdate", onTimeUpdate);
            audio.removeEventListener("loadedmetadata", onLoadedMetadata);
            audio.removeEventListener("canplay", onCanPlay);
            audio.removeEventListener("loadstart", onLoadStart);
            audio.removeEventListener("ended", onEnded);
            audio.removeEventListener("play", onPlay);
            audio.removeEventListener("pause", onPause);
            audio.pause();
            audio.src = "";
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

    // eslint-disable-next-line react-hooks/exhaustive-deps
    function handleTrackEnd() {
        handleTrackEndRef.current();
    }

    /* ── Data fetching ── */

    const fetchSongs = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/music`);
            if (!res.ok) return;
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
            const data: ApiTrack[] = await res.json();
            if (data.length > 0) {
                setAllSongs(
                    data.map((t) => ({
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
                    }))
                );
            }
        } catch {
            // API 不可达时保留空
        }
    }, []);

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

    useEffect(() => {
        fetchSongs();
        fetchSidebar();
    }, [fetchSongs, fetchSidebar]);

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

    /* ── Filter songs ── */

    /* ── Daily recommendation (memoized) ── */
    const dailyRecommendation = useMemo(
        () => getDailyRecommendation(allSongs, sidebarCategories),
        [allSongs, sidebarCategories]
    );

    const filteredSongs = useMemo(() => {
        let list = allSongs;

        // Daily recommendation
        if (selectedPlaylist === "daily") {
            list = dailyRecommendation;
        } else if (selectedPlaylist !== "all") {
            if (selectedPlaylist.startsWith("cat:")) {
                const catName = selectedPlaylist.slice(4);
                list = list.filter((s) => s.category === catName);
            } else if (selectedPlaylist.startsWith("artist:")) {
                const artistName = selectedPlaylist.slice(7);
                list = list.filter((s) => s.musician === artistName);
            } else if (selectedPlaylist.startsWith("series:")) {
                const seriesName = selectedPlaylist.slice(7);
                list = list.filter((s) => s.series === seriesName);
            }
        }

        // Search filter
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            list = list.filter(
                (s) =>
                    s.title.toLowerCase().includes(q) ||
                    s.musician.toLowerCase().includes(q) ||
                    s.artist.toLowerCase().includes(q)
            );
        }

        return list;
    }, [allSongs, selectedPlaylist, searchQuery, dailyRecommendation]);

    // Reset page when filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedPlaylist, searchQuery]);

    /* ── Pagination ── */
    const totalPages = Math.max(1, Math.ceil(filteredSongs.length / PAGE_SIZE));
    const paginatedSongs = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return filteredSongs.slice(start, start + PAGE_SIZE);
    }, [filteredSongs, currentPage]);

    /* ── Song count per sidebar item ── */
    const songCountMap = useMemo(() => {
        const map: Record<string, number> = {};
        map["daily"] = dailyRecommendation.length;
        map["all"] = allSongs.length;
        for (const s of allSongs) {
            const catKey = `cat:${s.category}`;
            map[catKey] = (map[catKey] || 0) + 1;
            const artistKey = `artist:${s.musician}`;
            map[artistKey] = (map[artistKey] || 0) + 1;
            if (s.series) {
                const seriesKey = `series:${s.series}`;
                map[seriesKey] = (map[seriesKey] || 0) + 1;
            }
        }
        return map;
    }, [allSongs]);

    const playlistMeta = useMemo(() => {
        const allItems = [...libraryItems, ...artistItems, ...seriesItems];
        const item = allItems.find((i) => i.id === selectedPlaylist);
        if (item) return { title: item.name, iconName: item.iconName };
        return { title: "音乐", iconName: "Music2" };
    }, [selectedPlaylist, libraryItems, artistItems, seriesItems]);

    /* ════════════ Playback Logic ════════════ */

    const playSong = useCallback((song: Song, queue?: Song[]) => {
        const audio = audioRef.current;
        if (!audio) return;

        setCurrentSong(song);
        setCurrentTime(0);

        setAudioDuration(song.duration || 0);
        audio.src = song.fileUrl;
        audio.play().catch(() => { /* autoplay may be blocked */ });

        // Play count +1 (fire-and-forget)
        fetch(`${API_BASE}/music/${song.id}/play`, { method: "PATCH" }).catch(() => { });

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
        if (!currentSong) return filteredSongs[0] || null;

        if (playMode === "repeat-one") return currentSong;

        if (playMode === "shuffle") {
            const nextIdx = shuffleIndex + 1;
            if (nextIdx < shuffleQueue.length) {
                setShuffleIndex(nextIdx);
                return shuffleQueue[nextIdx] || null;
            }
            // Re-shuffle when exhausted
            const newQueue = shuffleArray(filteredSongs);
            setShuffleQueue(newQueue);
            setShuffleIndex(0);
            return newQueue[0] || null;
        }

        // Sequential
        const currentIdx = filteredSongs.findIndex((s) => s.id === currentSong.id);
        if (currentIdx < filteredSongs.length - 1) {
            return filteredSongs[currentIdx + 1] || null;
        }
        return null; // End of list in sequential mode
    }, [currentSong, filteredSongs, playMode, shuffleIndex, shuffleQueue]);

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
        const currentIdx = filteredSongs.findIndex((s) => s.id === currentSong.id);
        if (currentIdx > 0) {
            return filteredSongs[currentIdx - 1] || null;
        }
        return null;
    }, [currentSong, filteredSongs, playMode, shuffleIndex, shuffleQueue]);

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

    const cyclePlayMode = useCallback(() => {
        setPlayMode((prev) => {
            if (prev === "sequential") return "repeat-one";
            if (prev === "repeat-one") return "shuffle";
            return "sequential";
        });
    }, []);

    // When switching to shuffle mode, generate queue from current list
    useEffect(() => {
        if (playMode === "shuffle" && filteredSongs.length > 0) {
            const queue = shuffleArray(filteredSongs);
            setShuffleQueue(queue);
            if (currentSong) {
                const idx = queue.findIndex((s) => s.id === currentSong.id);
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

    const handlePlaySong = (song: Song, index?: number) => {
        if (currentSong?.id === song.id) {
            togglePlayPause();
            return;
        }
        playSong(song, filteredSongs);
        // If in shuffle mode, rebuild queue with this song first
        if (playMode === "shuffle") {
            const queue = shuffleArray(filteredSongs.filter((s) => s.id !== song.id));
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
    const SidebarSection = ({
        title,
        items,
    }: {
        title: string;
        items: { id: string; name: string; icon: React.ReactNode; filterType?: string }[];
    }) => (
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
                            onClick={() => setSelectedPlaylist(item.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 ${active
                                ? "bg-white/70 shadow-sm text-gray-900 font-medium"
                                : "text-gray-600 hover:bg-white/40 hover:text-gray-900"
                                }`}
                        >
                            <span
                                className={`transition-colors ${active ? "text-purple-600" : "text-gray-400"
                                    }`}
                            >
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
                {/* ══════════ 左侧边栏 ══════════ */}
                <aside className="w-64 h-full overflow-y-auto py-6 px-4 flex-shrink-0">


                    <SidebarSection title="库" items={libraryItems} />
                    {artistItems.length > 0 && <SidebarSection title="音乐家" items={artistItems} />}
                    {seriesItems.length > 0 && <SidebarSection title="系列" items={seriesItems} />}
                </aside>

                {/* ══════════ 右侧内容区 ══════════ */}
                <main className="flex-1 h-full overflow-y-auto py-6 pr-6">
                    {/* 顶部导航 */}
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-6">
                            <a
                                href="https://johnnyallen.blog"
                                className="flex items-center gap-2 text-gray-500 hover:text-gray-800 transition-colors group"
                            >
                                <Home className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
                                <span className="text-sm">返回首页</span>
                            </a>
                        </div>

                        {/* 搜索框 */}
                        <div className="relative w-80">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="搜索音乐、作曲家..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-white/50 backdrop-blur-sm border border-white/60 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100 focus:bg-white/70 transition-all shadow-sm"
                            />
                        </div>
                    </div>

                    {/* 播放列表头部 — 带分类 Logo */}
                    <div className="mb-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-200/50">
                                <HeaderIcon className="h-6 w-6 text-white" />
                            </div>
                            <h1 className="text-3xl font-bold text-gray-900">
                                {playlistMeta.title}
                            </h1>
                        </div>
                    </div>

                    {/* 表头 */}
                    <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-200/50 mb-2">
                        <div className="col-span-1 text-center">序号</div>
                        <div className="col-span-5">标题</div>
                        <div className="col-span-2">艺术家</div>
                        <div className="col-span-1"></div>
                        <div className="col-span-1 text-right">播放</div>
                        <div className="col-span-2 text-right">时长</div>
                    </div>

                    {/* 歌曲列表 */}
                    {filteredSongs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                            <Music2 className="h-12 w-12 mb-4 opacity-40" />
                            <p className="text-sm">{searchQuery ? "没有找到匹配的音乐" : "暂无音乐"}</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-0.5">
                                {paginatedSongs.map((song, index) => {
                                    const isActive = currentSong?.id === song.id;
                                    const isLiked = likedSongs.has(song.id);
                                    const globalIndex = (currentPage - 1) * PAGE_SIZE + index;

                                    return (
                                        <div
                                            key={song.id}
                                            className={`grid grid-cols-12 gap-4 px-4 py-3 rounded-xl transition-all duration-200 group cursor-pointer ${isActive
                                                ? "bg-white/60 shadow-sm"
                                                : "hover:bg-white/40"
                                                }`}
                                            onClick={() => handlePlaySong(song, globalIndex)}
                                        >
                                            {/* Index / Equalizer */}
                                            <div className="col-span-1 flex items-center justify-center">
                                                {isActive && isPlaying ? (
                                                    <div className="flex items-center gap-[3px]">
                                                        <div
                                                            className="w-[3px] h-3 bg-purple-500 rounded-full origin-bottom"
                                                            style={{ animation: "equalizer 0.8s ease-in-out infinite", animationDelay: "0s" }}
                                                        />
                                                        <div
                                                            className="w-[3px] h-4 bg-purple-500 rounded-full origin-bottom"
                                                            style={{ animation: "equalizer 0.8s ease-in-out infinite", animationDelay: "0.2s" }}
                                                        />
                                                        <div
                                                            className="w-[3px] h-3 bg-purple-500 rounded-full origin-bottom"
                                                            style={{ animation: "equalizer 0.8s ease-in-out infinite", animationDelay: "0.4s" }}
                                                        />
                                                    </div>
                                                ) : isActive && !isPlaying ? (
                                                    <Pause className="h-4 w-4 text-purple-600" />
                                                ) : (
                                                    <>
                                                        <span className="text-sm text-gray-400 group-hover:hidden">
                                                            {globalIndex + 1}
                                                        </span>
                                                        <Play className="h-4 w-4 text-purple-600 hidden group-hover:block" />
                                                    </>
                                                )}
                                            </div>

                                            {/* Category Icon + Title */}
                                            <div className="col-span-5 flex items-center gap-3 min-w-0">
                                                {(() => {
                                                    const cat = sidebarCategories.find((c) => c.name === song.category);
                                                    const CatIcon = getIconComponent(cat?.icon, Music);
                                                    return (
                                                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center flex-shrink-0 shadow-sm group-hover:shadow-md transition-shadow">
                                                            <CatIcon className={`h-5 w-5 ${isActive ? "text-purple-600" : "text-purple-400"}`} />
                                                        </div>
                                                    );
                                                })()}
                                                <div className="min-w-0">
                                                    <p
                                                        className={`text-sm truncate ${isActive
                                                            ? "font-semibold text-purple-700"
                                                            : "font-medium text-gray-900"
                                                            }`}
                                                    >
                                                        {song.title}
                                                    </p>
                                                    <p className="text-xs text-gray-400 truncate">
                                                        {song.musician}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Artist (performer) */}
                                            <div className="col-span-2 flex items-center">
                                                <span className="text-sm text-gray-500 truncate">{song.artist}</span>
                                            </div>

                                            {/* Like */}
                                            <div className="col-span-1 flex items-center justify-center">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleLike(song.id);
                                                    }}
                                                    className="p-1.5 rounded-full hover:bg-white/60 transition-all opacity-0 group-hover:opacity-100"
                                                >
                                                    <Heart
                                                        className={`h-4 w-4 transition-colors ${isLiked
                                                            ? "text-pink-500 fill-pink-500"
                                                            : "text-gray-400 hover:text-pink-400"
                                                            }`}
                                                    />
                                                </button>
                                            </div>

                                            {/* Play Count */}
                                            <div className="col-span-1 flex items-center justify-end gap-1">
                                                <Headphones className="h-3 w-3 text-gray-300" />
                                                <span className="text-xs text-gray-400 tabular-nums">{song.playCount || 0}</span>
                                            </div>

                                            {/* Duration */}
                                            <div className="col-span-2 flex items-center justify-end">
                                                <span className="text-sm text-gray-400 tabular-nums">{song.durationStr}</span>
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
                    {/* 进度条 - 只读展示 */}
                    <div className="relative h-1.5 bg-gray-200/50">
                        {/* Playback progress */}
                        <div
                            className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-r-full z-10 transition-[width] duration-100 ease-linear"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>

                    <div className="px-6 py-3">
                        <div className="flex items-center gap-6">
                            {/* 当前播放歌曲信息 */}
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                                {(() => {
                                    const cat = sidebarCategories.find((c) => c.name === currentSong.category);
                                    const CatIcon = getIconComponent(cat?.icon, Music);
                                    return (
                                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-md flex-shrink-0">
                                            <CatIcon className="h-6 w-6 text-white" />
                                        </div>
                                    );
                                })()}
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-gray-900 truncate text-sm">
                                        {currentSong.title}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate">
                                        {currentSong.artist} · {currentSong.musician}
                                    </p>
                                </div>
                                <button
                                    onClick={() => toggleLike(currentSong.id)}
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-all"
                                >
                                    <Heart
                                        className={`h-5 w-5 transition-colors ${likedSongs.has(currentSong.id)
                                            ? "text-pink-500 fill-pink-500"
                                            : "text-gray-400 hover:text-pink-500"
                                            }`}
                                    />
                                </button>
                            </div>

                            {/* 播放控制 */}
                            <div className="flex items-center gap-3">
                                {/* Play mode toggle */}
                                <button
                                    onClick={cyclePlayMode}
                                    className={`p-2 rounded-lg transition-all ${playModeActive
                                        ? "text-purple-600 hover:bg-purple-50"
                                        : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                        }`}
                                    title={playModeLabel}
                                >
                                    <PlayModeIcon className="h-4 w-4" />
                                </button>

                                <button
                                    onClick={playPrev}
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-all"
                                >
                                    <SkipBack className="h-4 w-4 text-gray-600" />
                                </button>
                                <button
                                    onClick={togglePlayPause}
                                    className="p-3.5 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95"
                                >
                                    {isLoading ? (
                                        <Loader2 className="h-5 w-5 text-white animate-spin" />
                                    ) : isPlaying ? (
                                        <Pause className="h-5 w-5 text-white" fill="white" />
                                    ) : (
                                        <Play className="h-5 w-5 text-white" fill="white" />
                                    )}
                                </button>
                                <button
                                    onClick={playNext}
                                    className="p-2 hover:bg-gray-100 rounded-lg transition-all"
                                >
                                    <SkipForward className="h-4 w-4 text-gray-600" />
                                </button>
                            </div>

                            {/* 时间 + 音量控制 */}
                            <div className="flex items-center gap-4 flex-1 justify-end">
                                <span className="text-xs text-gray-400 tabular-nums">{formatDuration(currentTime)}</span>
                                <span className="text-xs text-gray-300">/</span>
                                <span className="text-xs text-gray-400 tabular-nums">
                                    {formatDuration(audioDuration)}
                                </span>
                                <div className="flex items-center gap-2 ml-4">
                                    <button
                                        onClick={toggleMute}
                                        className="p-1 hover:bg-gray-100 rounded transition-all"
                                    >
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
