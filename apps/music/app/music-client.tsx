"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
    Home, Play, Pause, SkipBack, SkipForward,
    Volume2, ListMusic, Heart, Music2,
    Headphones, Search, Star, User, Music,
} from "lucide-react";
import { ImageWithFallback } from "@/components/ImageWithFallback";

/* ───────── Types ───────── */

interface Song {
    id: string;
    title: string;
    artist: string;
    musician: string;
    series: string;
    duration: string;
    category: string;
    coverUrl: string;
}

interface Playlist {
    id: string;
    name: string;
    icon: React.ReactNode;
    filterType?: "category" | "artist" | "series" | "special";
}

interface SidebarEntity {
    id: string;
    name: string;
    slug: string;
    description: string | null;
}

/* ───────── Data ───────── */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

const DEMO_SONGS: Song[] = [
    { id: "1", title: "巴赫D小调第一号键盘组曲 BWV 1004 - 恰空", artist: "Hilary Hahn", musician: "Bach", series: "", duration: "14:32", category: "小提琴协奏曲", coverUrl: "" },
    { id: "2", title: "肖邦第一号钢琴叙事曲 Op.23", artist: "Lang Lang", musician: "Chopin", series: "", duration: "9:18", category: "钢琴独奏", coverUrl: "" },
    { id: "3", title: "贝多芬小提琴协奏曲 D大调 Op.61", artist: "Anne-Sophie Mutter", musician: "Beethoven", series: "", duration: "23:45", category: "小提琴协奏曲", coverUrl: "" },
    { id: "4", title: "德彪西月光", artist: "Yuja Wang", musician: "Debussy", series: "", duration: "5:28", category: "钢琴独奏", coverUrl: "" },
    { id: "5", title: "帕格尼尼24首随想曲 No.24", artist: "Joshua Bell", musician: "Paganini", series: "", duration: "4:52", category: "小提琴独奏", coverUrl: "" },
    { id: "6", title: "拉赫玛尼诺夫第二钢琴协奏曲", artist: "Denis Matsuev", musician: "Rachmaninoff", series: "", duration: "33:12", category: "钢琴协奏曲", coverUrl: "" },
];

/* ───────── Component ───────── */

export default function MusicPageClient() {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentSong, setCurrentSong] = useState<Song | null>(null);
    const [selectedPlaylist, setSelectedPlaylist] = useState("daily");
    const [likedSongs, setLikedSongs] = useState<Set<string>>(new Set());
    const [allSongs, setAllSongs] = useState<Song[]>(DEMO_SONGS);

    // Dynamic sidebar data
    const [sidebarCategories, setSidebarCategories] = useState<SidebarEntity[]>([]);
    const [sidebarArtists, setSidebarArtists] = useState<SidebarEntity[]>([]);
    const [sidebarSeries, setSidebarSeries] = useState<SidebarEntity[]>([]);

    /** 从 API 获取真实曲目 */
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
                        duration: formatDuration(t.duration),
                        category: t.category,
                        coverUrl: t.coverUrl || "",
                    }))
                );
            }
        } catch {
            // API 不可达时保留 demo 数据
        }
    }, []);

    /** 获取侧边栏导航数据 */
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
        } catch {
            /* 保持空数组 */
        }
    }, []);

    useEffect(() => {
        fetchSongs();
        fetchSidebar();
    }, [fetchSongs, fetchSidebar]);

    // Build dynamic sidebar playlists
    const libraryItems: Playlist[] = useMemo(() => [
        { id: "daily", name: "每日推荐", icon: <Star className="h-4 w-4" />, filterType: "special" as const },
        ...sidebarCategories.map((c) => ({
            id: `cat:${c.name}`,
            name: c.name,
            icon: <Music className="h-4 w-4" />,
            filterType: "category" as const,
        })),
        { id: "all", name: "所有音乐", icon: <ListMusic className="h-4 w-4" />, filterType: "special" as const },
    ], [sidebarCategories]);

    const artistItems: Playlist[] = useMemo(() =>
        sidebarArtists.map((a) => ({
            id: `artist:${a.name}`,
            name: a.name,
            icon: <User className="h-4 w-4" />,
            filterType: "artist" as const,
        })),
        [sidebarArtists]);

    const seriesItems: Playlist[] = useMemo(() =>
        sidebarSeries.map((s) => ({
            id: `series:${s.name}`,
            name: s.name,
            icon: <Headphones className="h-4 w-4" />,
            filterType: "series" as const,
        })),
        [sidebarSeries]);

    // Filter songs based on selection
    const songs = useMemo(() => {
        if (selectedPlaylist === "daily" || selectedPlaylist === "all") return allSongs;
        if (selectedPlaylist.startsWith("cat:")) {
            const catName = selectedPlaylist.slice(4);
            return allSongs.filter((s) => s.category === catName);
        }
        if (selectedPlaylist.startsWith("artist:")) {
            const artistName = selectedPlaylist.slice(7);
            return allSongs.filter((s) => s.musician === artistName);
        }
        if (selectedPlaylist.startsWith("series:")) {
            const seriesName = selectedPlaylist.slice(7);
            return allSongs.filter((s) => s.series === seriesName);
        }
        return allSongs;
    }, [allSongs, selectedPlaylist]);

    // Get current header info
    const playlistMeta = useMemo(() => {
        if (selectedPlaylist === "daily") return { title: "每日推荐", description: "精选古典音乐，开启美好一天" };
        if (selectedPlaylist === "all") return { title: "所有音乐", description: "浏览完整的音乐收藏" };
        // find name from sidebar entities
        const allItems = [...libraryItems, ...artistItems, ...seriesItems];
        const item = allItems.find((i) => i.id === selectedPlaylist);
        if (item) return { title: item.name, description: `${item.name} 的所有音乐` };
        return { title: "音乐", description: "" };
    }, [selectedPlaylist, libraryItems, artistItems, seriesItems]);

    const handlePlaySong = (song: Song) => {
        setCurrentSong(song);
        setIsPlaying(true);
        // 播放计数 +1（fire-and-forget）
        fetch(`${API_BASE}/music/${song.id}/play`, { method: "PATCH" }).catch(() => { });
    };

    const togglePlayPause = () => setIsPlaying(!isPlaying);

    const toggleLike = (songId: string) => {
        setLikedSongs((prev) => {
            const next = new Set(prev);
            if (next.has(songId)) next.delete(songId);
            else next.add(songId);
            return next;
        });
    };

    /* ─── Sidebar item renderer ─── */
    const SidebarSection = ({
        title,
        items,
    }: {
        title: string;
        items: Playlist[];
    }) => (
        <div className="mb-6">
            <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3 px-3">
                {title}
            </h2>
            <nav className="space-y-0.5">
                {items.map((item) => {
                    const active = selectedPlaylist === item.id;
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
                            <span className="text-sm truncate">{item.name}</span>
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
                {/* 音符动画 */}
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

                {/* 波浪线条 */}
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

                {/* 旋转光环 */}
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

    return (
        <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-purple-50/60 to-pink-50/40 relative overflow-hidden">
            {AnimatedBackground}

            {/* 主要内容 */}
            <div className="relative z-10 flex h-screen" style={{ paddingBottom: currentSong ? "96px" : "0" }}>
                {/* ══════════ 左侧边栏 ══════════ */}
                <aside className="w-64 h-full overflow-y-auto py-6 px-4 flex-shrink-0">
                    {/* Logo */}
                    <div className="flex items-center gap-2 px-3 mb-8">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-md">
                            <Music2 className="h-4 w-4 text-white" />
                        </div>
                        <span className="text-lg font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                            Johnny Music
                        </span>
                    </div>

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
                                className="w-full pl-10 pr-4 py-2.5 bg-white/50 backdrop-blur-sm border border-white/60 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100 focus:bg-white/70 transition-all shadow-sm"
                            />
                        </div>
                    </div>

                    {/* 播放列表头部 */}
                    <div className="mb-6">
                        <div className="flex items-center gap-3 mb-1">
                            <Music2 className="h-7 w-7 text-purple-600" />
                            <h1 className="text-3xl font-bold text-gray-900">
                                {playlistMeta.title}
                            </h1>
                        </div>
                        <p className="text-sm text-gray-500 ml-10">
                            {playlistMeta.description}
                        </p>
                    </div>

                    {/* 表头 */}
                    <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-200/50 mb-2">
                        <div className="col-span-1 text-center">#</div>
                        <div className="col-span-5">名称</div>
                        <div className="col-span-3">艺术家</div>
                        <div className="col-span-1"></div>
                        <div className="col-span-2 text-right">时长</div>
                    </div>

                    {/* 歌曲列表 */}
                    <div className="space-y-0.5">
                        {songs.map((song, index) => {
                            const isActive = currentSong?.id === song.id;
                            const isLiked = likedSongs.has(song.id);

                            return (
                                <div
                                    key={song.id}
                                    className={`grid grid-cols-12 gap-4 px-4 py-3 rounded-xl transition-all duration-200 group cursor-pointer ${isActive
                                        ? "bg-white/60 shadow-sm"
                                        : "hover:bg-white/40"
                                        }`}
                                    onClick={() => handlePlaySong(song)}
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
                                        ) : (
                                            <>
                                                <span className="text-sm text-gray-400 group-hover:hidden">
                                                    {index + 1}
                                                </span>
                                                <Play className="h-4 w-4 text-purple-600 hidden group-hover:block" />
                                            </>
                                        )}
                                    </div>

                                    {/* Cover + Title */}
                                    <div className="col-span-5 flex items-center gap-3 min-w-0">
                                        <div className="w-12 h-12 rounded-lg overflow-hidden shadow-sm group-hover:shadow-md transition-shadow flex-shrink-0">
                                            <ImageWithFallback
                                                src={song.coverUrl}
                                                alt={song.title}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                        <p
                                            className={`text-sm truncate ${isActive
                                                ? "font-semibold text-purple-700"
                                                : "font-medium text-gray-900"
                                                }`}
                                        >
                                            {song.title}
                                        </p>
                                    </div>

                                    {/* Artist */}
                                    <div className="col-span-3 flex items-center">
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

                                    {/* Duration */}
                                    <div className="col-span-2 flex items-center justify-end">
                                        <span className="text-sm text-gray-400">{song.duration}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </main>
            </div>

            {/* ══════════ 底部播放器 ══════════ */}
            {currentSong && (
                <div className="fixed bottom-0 left-0 right-0 glass-strong shadow-2xl z-50">
                    {/* 进度条 - 顶部细线 */}
                    <div className="h-1 bg-gray-100 cursor-pointer group">
                        <div
                            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 group-hover:h-1.5 transition-all relative"
                            style={{ width: "25%" }}
                        >
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md border-2 border-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                    </div>

                    <div className="px-6 py-3">
                        <div className="flex items-center gap-6">
                            {/* 当前播放歌曲信息 */}
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                                <div className="w-12 h-12 rounded-lg overflow-hidden shadow-md flex-shrink-0 group">
                                    <ImageWithFallback
                                        src={currentSong.coverUrl}
                                        alt={currentSong.title}
                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-gray-900 truncate text-sm">
                                        {currentSong.title}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate">
                                        {currentSong.artist}
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
                            <div className="flex items-center gap-4">
                                <button className="p-2 hover:bg-gray-100 rounded-lg transition-all">
                                    <SkipBack className="h-4 w-4 text-gray-600" />
                                </button>
                                <button
                                    onClick={togglePlayPause}
                                    className="p-3.5 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95"
                                >
                                    {isPlaying ? (
                                        <Pause className="h-5 w-5 text-white" fill="white" />
                                    ) : (
                                        <Play className="h-5 w-5 text-white" fill="white" />
                                    )}
                                </button>
                                <button className="p-2 hover:bg-gray-100 rounded-lg transition-all">
                                    <SkipForward className="h-4 w-4 text-gray-600" />
                                </button>
                            </div>

                            {/* 时间 + 音量控制 */}
                            <div className="flex items-center gap-4 flex-1 justify-end">
                                <span className="text-xs text-gray-400 tabular-nums">1:23</span>
                                <span className="text-xs text-gray-300">/</span>
                                <span className="text-xs text-gray-400 tabular-nums">
                                    {currentSong.duration}
                                </span>
                                <div className="flex items-center gap-2 ml-4">
                                    <Volume2 className="h-4 w-4 text-gray-500" />
                                    <div className="w-20 h-1 bg-gray-200 rounded-full overflow-hidden cursor-pointer group">
                                        <div className="w-3/4 h-full bg-gradient-to-r from-purple-400 to-pink-400 group-hover:from-purple-500 group-hover:to-pink-500 transition-colors" />
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
