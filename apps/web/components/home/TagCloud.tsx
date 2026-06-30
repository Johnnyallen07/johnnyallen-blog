"use client";

import { useState, useEffect } from "react";
import { fetchClient } from "@/lib/api";

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface TagCloudProps {
  selectedTagSlug?: string | null;
  onSelectTag?: (tag: Category) => void;
}

export function TagCloud({ selectedTagSlug, onSelectTag }: TagCloudProps) {
  const [tags, setTags] = useState<Category[]>([]);

  useEffect(() => {
    const loadTags = async () => {
      try {
        const categories: Category[] = await fetchClient("/categories");
        if (Array.isArray(categories) && categories.length > 0) {
          setTags(categories.slice(0, 12));
        }
      } catch (e) {
        console.error("Failed to load tags", e);
      }
    };
    loadTags();
  }, []);

  if (tags.length === 0) return null;

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <span className="text-slate-500">#</span>
        标签
      </h3>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const isSelected = selectedTagSlug === tag.slug;

          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => onSelectTag?.(tag)}
              className={`px-3 py-1.5 rounded-lg backdrop-blur-sm border transition-all text-sm ${
                isSelected
                  ? "bg-slate-950 text-white border-slate-950"
                  : "bg-white/35 border-slate-200/70 text-gray-700 hover:border-slate-500 hover:text-slate-950 hover:bg-white/55"
              }`}
            >
              #{tag.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
