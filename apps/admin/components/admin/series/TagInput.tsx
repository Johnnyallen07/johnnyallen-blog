"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

interface TagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
}

export function TagInput({ tags, onTagsChange }: TagInputProps) {
  const [input, setInput] = useState("");

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const newTag = input.trim().toLowerCase();
      if (newTag && !tags.includes(newTag)) {
        onTagsChange([...tags, newTag]);
        setInput("");
      }
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      onTagsChange(tags.slice(0, -1));
    }
  };

  const removeTag = (tagToRemove: string) => {
    onTagsChange(tags.filter((tag) => tag !== tagToRemove));
  };

  return (
    <div className="flex flex-wrap gap-2 min-h-[40px] px-3 py-1.5 border border-gray-300 rounded-lg bg-gray-50 focus-within:border-cyan-500 transition-colors items-center">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-cyan-100 to-purple-100 border border-cyan-300 text-cyan-700 text-sm"
        >
          {tag}
          <button
            onClick={() => removeTag(tag)}
            className="hover:text-cyan-900 transition-colors"
            type="button"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          handleKeyDown(e);
        }}
        placeholder={tags.length === 0 ? "添加标签（按回车或逗号）" : ""}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-gray-700 placeholder:text-gray-400 h-full py-1"
      />
    </div>
  );
}
