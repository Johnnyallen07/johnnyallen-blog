"use client";

import { Music, Play } from "lucide-react";

interface MusicTrack {
  title: string;
  composer: string;
  instrument: string;
  type: "violin" | "piano";
}

const TRACKS: MusicTrack[] = [
  {
    title: "Meditation from Thaïs",
    composer: "Massenet",
    instrument: "小提琴",
    type: "violin",
  },
  {
    title: "Nocturne Op.9 No.2",
    composer: "Chopin",
    instrument: "钢琴",
    type: "piano",
  },
  {
    title: "Csárdás",
    composer: "Monti",
    instrument: "小提琴",
    type: "violin",
  },
  {
    title: "Clair de Lune",
    composer: "Debussy",
    instrument: "钢琴",
    type: "piano",
  },
];

export function MusicRecommendation() {
  return (
    <div className="bg-transparent backdrop-blur-sm border border-white/40 rounded-xl p-6 shadow-sm hover:bg-white/20 hover:border-purple-300 transition-all duration-300">
      <div className="flex items-center gap-2 mb-4">
        <Music className="h-5 w-5 text-purple-600" />
        <h3 className="text-lg font-semibold text-gray-900">音乐推荐</h3>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        分享我喜欢的小提琴与钢琴作品
      </p>

      <div className="space-y-3">
        {TRACKS.map((track, index) => (
          <div
            key={index}
            className="group flex items-center gap-3 p-3 rounded-lg border border-white/40 hover:border-purple-300 hover:bg-white/30 transition-all cursor-pointer"
          >
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                track.type === "violin"
                  ? "bg-gradient-to-br from-cyan-100 to-blue-100 text-cyan-700"
                  : "bg-gradient-to-br from-purple-100 to-pink-100 text-purple-700"
              }`}
            >
              {track.type === "violin" ? "🎻" : "🎹"}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {track.title}
              </p>
              <p className="text-xs text-gray-500">
                {track.composer} · {track.instrument}
              </p>
            </div>

            <button className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center hover:bg-purple-200">
              <Play className="h-3.5 w-3.5 text-purple-700 ml-0.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
