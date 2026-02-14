"use client";

import { Input } from "@/components/ui/input";
import { TagInput } from "./TagInput";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, Eye, Sparkles, Calendar } from "lucide-react";

interface PropertyPanelProps {
  title: string;
  onTitleChange: (title: string) => void;
  slug: string;
  onSlugChange: (slug: string) => void;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  onPreview: () => void;
  onSave: () => void;
  onPublish: () => void;
  lastSaved: Date | null;
}

export function PropertyPanel({
  title,
  onTitleChange,
  slug,
  onSlugChange,
  tags,
  onTagsChange,
  onPreview,
  onSave,
  onPublish,
  lastSaved,
}: PropertyPanelProps) {
  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200">
      {/* 头部 */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">文章属性</h2>
      </div>

      {/* 属性表单 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* 文章标题 */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-700">标题</Label>
          <Input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="输入文章标题..."
            className="border-gray-300 focus:border-cyan-500 focus-visible:ring-cyan-500/30"
          />
        </div>

        {/* URL/Slug */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-700">URL标识 (Slug)</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">/article/</span>
            <Input
              value={slug}
              onChange={(e) => onSlugChange(e.target.value)}
              placeholder="article-slug"
              className="border-gray-300 focus:border-cyan-500 focus-visible:ring-cyan-500/30"
            />
          </div>
        </div>

        {/* 标签 */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-gray-700">标签</Label>
          <TagInput tags={tags} onTagsChange={onTagsChange} />
        </div>

        {/* 元信息 */}
        <div className="space-y-3 pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="h-4 w-4" />
            <span>创建：2026-02-12</span>
          </div>
          {lastSaved && (
            <div className="text-xs text-gray-500">
              最后保存：{lastSaved.toLocaleTimeString("zh-CN")}
            </div>
          )}
        </div>

        {/* 统计信息 */}
        <div className="p-4 bg-gradient-to-br from-cyan-50 via-purple-50 to-pink-50 rounded-lg border border-cyan-200/50">
          <div className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
            <span>📊</span>
            <span>文章统计</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">阅读量</span>
              <span className="text-lg font-bold bg-gradient-to-r from-cyan-600 to-purple-600 bg-clip-text text-transparent">
                1,234
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">点赞数</span>
              <span className="text-lg font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                89
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">评论数</span>
              <span className="text-lg font-bold bg-gradient-to-r from-pink-600 to-orange-600 bg-clip-text text-transparent">
                23
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 底部操作按钮 */}
      <div className="p-4 border-t border-gray-200 space-y-2">
        <div className="flex gap-2">
          <Button
            onClick={onSave}
            variant="outline"
            className="flex-1 border-gray-300 hover:bg-gray-50"
          >
            <Save className="h-4 w-4 mr-2" />
            保存
          </Button>
          <Button
            onClick={onPreview}
            variant="outline"
            className="flex-1 border-gray-300 hover:bg-gray-50"
          >
            <Eye className="h-4 w-4 mr-2" />
            预览
          </Button>
        </div>
        <Button
          onClick={onPublish}
          className="w-full relative overflow-hidden bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 hover:from-cyan-600 hover:via-purple-600 hover:to-pink-600 text-white font-semibold shadow-lg shadow-purple-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/40 hover:scale-[1.02]"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12 -translate-x-full animate-[shimmer_2s_infinite]" />
          <Sparkles className="h-4 w-4 mr-2" />
          <span>发布文章</span>
        </Button>
      </div>
    </div>
  );
}
