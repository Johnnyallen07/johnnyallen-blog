"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface SeriesFormData {
  id?: string;
  name: string;
  url: string;
  category: string;
  emoji: string;
  description?: string;
}

interface SeriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  series?: SeriesFormData;
  onSave: (data: SeriesFormData) => void;
  categories?: { id: string; name: string; emoji?: string }[];
}

const EMOJI_OPTIONS = [
  "🎮",
  "💻",
  "🎨",
  "⭐",
  "📚",
  "📰",
  "🎵",
  "🎬",
  "🏆",
  "🚀",
  "💡",
  "🎯",
];

function generateUrlFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "");
}

export function SeriesDialog({
  open,
  onOpenChange,
  series,
  onSave,
  categories = [],
}: SeriesDialogProps) {
  const [formData, setFormData] = useState<SeriesFormData>({
    name: "",
    url: "",
    category: "",
    emoji: "🎮",
    description: "",
  });

  useEffect(() => {
    if (series) {
      setFormData(series);
    } else {
      setFormData({
        name: "",
        url: "",
        category: "",
        emoji: "🎮",
        description: "",
      });
    }
  }, [series, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.category) {
      toast.error("请选择一个分类");
      return;
    }

    onSave(formData);
    onOpenChange(false);
  };

  const handleNameChange = (name: string) => {
    setFormData((prev) => ({
      ...prev,
      name,
      url: prev.url || generateUrlFromName(name),
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-gray-200 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gray-900">
            {series ? "编辑专栏" : "创建新专栏"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* 表情选择 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              专栏图标
            </Label>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, emoji }))
                  }
                  className={`text-2xl w-12 h-12 rounded-lg border-2 transition-all ${formData.emoji === emoji
                    ? "border-amber-500 bg-amber-50 scale-110"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* 专栏名称 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              专栏名称
            </Label>
            <Input
              value={formData.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="例如：缺氧游戏攻略"
              required
              className="border-gray-300 focus:border-amber-500 focus-visible:ring-amber-500/30"
            />
          </div>

          {/* URL */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              URL标识
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">/series/</span>
              <Input
                value={formData.url}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, url: e.target.value }))
                }
                placeholder="oxygen-not-included"
                required
                className="border-gray-300 focus:border-amber-500 focus-visible:ring-amber-500/30"
              />
            </div>
            <p className="text-xs text-gray-500">
              用于访问专栏的唯一标识，建议使用英文和连字符
            </p>
          </div>

          {/* 简介 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              专栏简介
            </Label>
            <Textarea
              value={formData.description || ""}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="简要介绍这个专栏的内容..."
              className="border-gray-300 focus:border-amber-500 focus-visible:ring-amber-500/30 resize-none"
              rows={3}
            />
          </div>

          {/* 分类 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              所属分类
            </Label>
            <Select
              value={formData.category}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, category: value }))
              }
            >
              <SelectTrigger className="border-gray-300 focus:border-amber-500 focus:ring-amber-500/30">
                <SelectValue placeholder="选择分类" />
              </SelectTrigger>
              <SelectContent className="bg-white border-gray-200">
                {categories.length > 0 ? (
                  categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.emoji || "📂"} {cat.name}
                    </SelectItem>
                  ))
                ) : (
                  <>
                    <SelectItem value="游戏">🎮 游戏</SelectItem>
                    <SelectItem value="科技">💻 科技</SelectItem>
                    <SelectItem value="艺术设计">🎨 艺术设计</SelectItem>
                    <SelectItem value="测评">⭐ 测评</SelectItem>
                    <SelectItem value="教程">📚 教程</SelectItem>
                    <SelectItem value="新闻">📰 新闻</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 border-gray-300 hover:bg-gray-50"
            >
              取消
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-sm"
            >
              {series ? "保存修改" : "创建专栏"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
