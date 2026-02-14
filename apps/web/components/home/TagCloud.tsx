"use client";

const TAGS = [
  { name: "React", count: 24 },
  { name: "游戏设计", count: 18 },
  { name: "音乐", count: 12 },
  { name: "TypeScript", count: 20 },
  { name: "缺氧", count: 15 },
  { name: "Web开发", count: 22 },
  { name: "独立游戏", count: 10 },
  { name: "小提琴", count: 8 },
  { name: "AI技术", count: 16 },
  { name: "钢琴", count: 7 },
  { name: "前端", count: 22 },
  { name: "算法", count: 11 },
];

export function TagCloud() {
  return (
    <div className="bg-transparent backdrop-blur-sm border border-white/40 rounded-xl p-5 shadow-sm hover:bg-white/20 hover:border-cyan-300 transition-all duration-300">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <span className="text-purple-600">#</span>
        热门标签
      </h3>
      <div className="flex flex-wrap gap-2">
        {TAGS.map((tag) => (
          <button
            key={tag.name}
            className="px-3 py-1.5 rounded-lg bg-white/30 backdrop-blur-sm border border-white/50 text-gray-700 hover:border-cyan-300 hover:text-cyan-600 hover:bg-white/50 transition-all text-sm"
          >
            #{tag.name}
            <span className="ml-1.5 text-xs text-gray-500">({tag.count})</span>
          </button>
        ))}
      </div>
    </div>
  );
}
