"use client";

import { useState, useEffect } from "react";
import { fetchClient } from "@/lib/api";

interface Category {
  id: string;
  name: string;
  slug: string;
}

export function TagCloud() {
  const [tags, setTags] = useState<Category[]>([]);

  useEffect(() => {
    const loadTags = async () => {
      try {
        const categories: Category[] = await fetchClient("/categories");
        if (Array.isArray(categories) && categories.length > 0) {
          // Shuffle and pick up to 10
          const shuffled = [...categories].sort(() => Math.random() - 0.5);
          setTags(shuffled.slice(0, 10));
        }
      } catch (e) {
        console.error("Failed to load tags", e);
      }
    };
    loadTags();
  }, []);

  if (tags.length === 0) return null;

  return (
    <div className="bg-white/[0.18] backdrop-blur-sm border border-slate-200/60 rounded-xl p-5 shadow-sm hover:bg-white/30 hover:border-slate-400 transition-all duration-300">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <span className="text-slate-500">#</span>
        标签
      </h3>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <button
            key={tag.id}
            className="px-3 py-1.5 rounded-lg bg-white/35 backdrop-blur-sm border border-slate-200/70 text-gray-700 hover:border-slate-500 hover:text-slate-950 hover:bg-white/55 transition-all text-sm"
          >
            #{tag.name}
          </button>
        ))}
      </div>
    </div>
  );
}
