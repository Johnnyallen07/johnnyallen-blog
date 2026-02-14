"use client";

import { useState, useEffect } from "react";
import { List } from "lucide-react";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  items: TocItem[];
}

export function TableOfContents({ items }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-20% 0px -80% 0px" }
    );

    items.forEach((item) => {
      const element = document.getElementById(item.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [items]);

  const handleClick = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
      <div className="mb-4 pb-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <List className="h-5 w-5 text-emerald-600" />
          目录
        </h3>
      </div>

      <nav className="space-y-1">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => handleClick(item.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
              activeId === item.id
                ? "bg-cyan-50 text-cyan-700 font-medium border-l-2 border-cyan-500"
                : "text-gray-600 hover:bg-gray-50 border-l-2 border-transparent"
            }`}
            style={{ paddingLeft: `${(item.level - 1) * 12 + 12}px` }}
          >
            {item.text}
          </button>
        ))}
      </nav>
    </div>
  );
}
