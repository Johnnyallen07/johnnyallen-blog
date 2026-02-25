"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Music, Play, Pause, ExternalLink } from "lucide-react";
import { fetchClient } from "@/lib/api";

/* ── Seeded RNG (same algorithm as music page) ── */

class SeededRNG {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

/* ── Types ── */

interface MusicTrack {
  id: string;
  title: string;
  musician: string;
  performer: string;
  category: string;
  series: string | null;
  fileUrl: string;
  playCount?: number;
}

interface SidebarCategory {
  id: string;
  name: string;
}

const MUSIC_URL = process.env.NEXT_PUBLIC_MUSIC_URL || "/music";

export function MusicRecommendation() {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [recommended, setRecommended] = useState<MusicTrack[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /* ── Fetch tracks + categories, compute daily recommendation ── */

  const fetchData = useCallback(async () => {
    try {
      const [allTracks, categories] = await Promise.all([
        fetchClient("/music"),
        fetchClient("/music-categories"),
      ]);

      const songs: MusicTrack[] = Array.isArray(allTracks) ? allTracks : [];
      const cats: SidebarCategory[] = Array.isArray(categories) ? categories : [];
      setTracks(songs);

      if (songs.length === 0) return;

      // Daily recommendation algorithm
      const today = new Date();
      const epoch = new Date(2024, 0, 1).getTime();
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysSinceEpoch = Math.floor((today.getTime() - epoch) / msPerDay);

      const dateString = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
      let seed = 0;
      for (let i = 0; i < dateString.length; i++) {
        seed = ((seed << 5) - seed) + dateString.charCodeAt(i);
        seed |= 0;
      }
      const rng = new SeededRNG(Math.abs(seed));

      if (cats.length === 0) {
        // No categories: just pick random top 4
        const scored = songs.map((s) => ({ s, score: rng.next() }));
        scored.sort((a, b) => b.score - a.score);
        setRecommended(scored.slice(0, 4).map((x) => x.s));
        return;
      }

      const categoryIndex = daysSinceEpoch % cats.length;
      const targetCategory = cats[categoryIndex];
      if (!targetCategory) return;

      const genreSongs = songs.filter((s) => s.category === targetCategory.name);
      const pool = genreSongs.length > 0 ? genreSongs : songs;

      const scored = pool.map((song) => ({
        song,
        score: Math.log10((song.playCount || 0) + 1) + rng.next() * 2,
      }));
      scored.sort((a, b) => b.score - a.score);
      setRecommended(scored.slice(0, 4).map((x) => x.song));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── Audio playback ── */

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audioRef.current = audio;

    const handleEnded = () => setPlayingId(null);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.pause();
      audio.src = "";
    };
  }, []);

  const handlePlayPause = (track: MusicTrack) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playingId === track.id) {
      // Pause current track
      audio.pause();
      setPlayingId(null);
    } else {
      // Play new track
      if (audio.src !== track.fileUrl) {
        audio.src = track.fileUrl;
      }
      audio.play().catch(() => { /* ignore autoplay block */ });
      setPlayingId(track.id);
    }
  };

  /* ── Render ── */

  if (tracks.length === 0 && recommended.length === 0) {
    return null; // Don't show widget if no music data
  }

  return (
    <div className="bg-transparent backdrop-blur-sm border border-white/40 rounded-xl p-6 shadow-sm hover:bg-white/20 hover:border-purple-300 transition-all duration-300">
      <div className="flex items-center gap-2 mb-4">
        <Music className="h-5 w-5 text-purple-600" />
        <h3 className="text-lg font-semibold text-gray-900">音乐推荐</h3>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        每日精选，分享我喜欢的古典韵律
      </p>

      <div className="space-y-3">
        {recommended.map((track) => {
          const isPlaying = playingId === track.id;
          return (
            <div
              key={track.id}
              className={`group flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${isPlaying
                ? "border-purple-300 bg-purple-50/50"
                : "border-white/40 hover:border-purple-300 hover:bg-white/30"
                }`}
              onClick={() => handlePlayPause(track)}
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br from-purple-100 to-pink-100">
                {isPlaying ? (
                  <div className="flex items-end gap-0.5 h-5">
                    <div className="w-1 bg-purple-600 rounded-full animate-pulse" style={{ height: "60%", animationDelay: "0s", animationDuration: "0.6s" }} />
                    <div className="w-1 bg-purple-600 rounded-full animate-pulse" style={{ height: "100%", animationDelay: "0.15s", animationDuration: "0.6s" }} />
                    <div className="w-1 bg-purple-600 rounded-full animate-pulse" style={{ height: "40%", animationDelay: "0.3s", animationDuration: "0.6s" }} />
                    <div className="w-1 bg-purple-600 rounded-full animate-pulse" style={{ height: "80%", animationDelay: "0.45s", animationDuration: "0.6s" }} />
                  </div>
                ) : (
                  <span className="text-lg">🎵</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${isPlaying ? "text-purple-700" : "text-gray-900"}`}>
                  {track.title}
                </p>
                <p className="text-xs text-gray-500">
                  {track.musician} · {track.category}
                </p>
              </div>

              <button
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isPlaying
                  ? "bg-purple-200 text-purple-700 opacity-100"
                  : "bg-purple-100 text-purple-700 opacity-0 group-hover:opacity-100 hover:bg-purple-200"
                  }`}
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayPause(track);
                }}
              >
                {isPlaying ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5 ml-0.5" />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Link to music page */}
      <a
        href={MUSIC_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex items-center justify-center gap-2 text-sm text-purple-600 hover:text-purple-700 bg-purple-50/50 hover:bg-purple-100/60 rounded-lg py-2.5 transition-all group"
      >
        <span>探索更多音乐</span>
        <ExternalLink className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
      </a>
    </div>
  );
}
