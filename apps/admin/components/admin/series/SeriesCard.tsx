"use client";

import { MoreVertical, Edit, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SeriesCardProps {
  id: string;
  name: string;
  url: string;
  category: string;
  articleCount: number;
  lastUpdated: string;
  emoji: string;
  onEdit: () => void;
  onDelete: () => void;
  onClick: () => void;
}

export function SeriesCard({
  name,
  url,
  category,
  articleCount,
  lastUpdated,
  emoji,
  onEdit,
  onDelete,
  onClick,
}: SeriesCardProps) {
  return (
    <div
      className="group bg-white border border-gray-200 rounded-xl p-6 transition-colors cursor-pointer hover:border-amber-200 hover:bg-amber-50/30"
      onClick={onClick}
    >
      <div>
        {/* 头部 */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="text-4xl">{emoji}</div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 group-hover:text-amber-600 transition-colors">
                {name}
              </h3>
              <p className="text-sm text-gray-500 flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />
                {url}
              </p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => e.stopPropagation()}
                className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="bg-white border-gray-200"
            >
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="cursor-pointer"
              >
                <Edit className="h-4 w-4 mr-2" />
                编辑专栏
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="cursor-pointer text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                删除专栏
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 分类标签 */}
        <div className="mb-4">
          <span
            className="inline-block px-3 py-1 text-xs rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium"
          >
            {category}
          </span>
        </div>

        {/* 统计信息 */}
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-gray-900">{articleCount}</span>
            <span>篇文章</span>
          </div>
          <div className="text-gray-400">&bull;</div>
          <div>更新于 {lastUpdated}</div>
        </div>
      </div>
    </div>
  );
}
