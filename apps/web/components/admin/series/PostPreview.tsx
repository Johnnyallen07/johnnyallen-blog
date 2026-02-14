"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PostPreviewProps {
  title: string;
  content: string;
  tags: string[];
  category: string;
  onClose: () => void;
}

export function PostPreview({
  title,
  content,
  tags,
  category,
  onClose,
}: PostPreviewProps) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-600 to-purple-600 bg-clip-text text-transparent">
            预览
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="hover:bg-gray-100"
          >
            <X className="h-5 w-5 text-gray-600" />
          </Button>
        </div>

        <div className="p-8 overflow-y-auto max-h-[calc(90vh-100px)]">
          {category && (
            <div className="mb-4">
              <span className="inline-block px-3 py-1 text-xs rounded-full bg-gradient-to-r from-cyan-100 to-purple-100 border border-cyan-300 text-cyan-700">
                {category}
              </span>
            </div>
          )}

          <h1 className="text-4xl font-bold mb-6 bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            {title || "未命名文章"}
          </h1>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-sm"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <div
            className="prose prose-gray max-w-none
                       prose-headings:text-gray-900 prose-h1:text-3xl prose-h2:text-2xl
                       prose-p:text-gray-700 prose-strong:text-gray-900
                       prose-a:text-cyan-600 prose-a:no-underline hover:prose-a:underline
                       prose-blockquote:border-l-cyan-500 prose-blockquote:text-gray-600
                       prose-code:text-purple-600 prose-pre:bg-gray-100
                       prose-img:rounded-lg prose-img:shadow-lg"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        </div>
      </div>
    </div>
  );
}
