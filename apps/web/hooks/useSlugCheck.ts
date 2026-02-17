"use client";

import { useState, useEffect, useRef } from "react";
import { fetchClient } from "@/lib/api";

interface UseSlugCheckOptions {
  slug: string;
  excludeId?: string | null; // 排除自身（编辑模式）
  enabled?: boolean; // 是否启用检查
}

interface UseSlugCheckResult {
  isChecking: boolean;
  isDuplicate: boolean;
  /** 当 slug 重复时返回一个可用的唯一 slug */
  getUniqueSlug: (baseSlug: string) => string;
}

/**
 * 检查 slug 是否已被占用的 Hook
 * 带防抖，输入停止 500ms 后检查
 */
export function useSlugCheck({
  slug,
  excludeId,
  enabled = true,
}: UseSlugCheckOptions): UseSlugCheckResult {
  const [isChecking, setIsChecking] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !slug.trim()) {
      setIsDuplicate(false);
      return;
    }

    // 防抖 500ms
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      setIsChecking(true);
      try {
        const query = excludeId ? `?excludeId=${excludeId}` : "";
        const result = await fetchClient(
          `/posts/check-slug/${encodeURIComponent(slug.trim())}${query}`
        );
        setIsDuplicate(!result.available);
      } catch {
        // 如果检查失败，不阻止用户操作
        setIsDuplicate(false);
      } finally {
        setIsChecking(false);
      }
    }, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [slug, excludeId, enabled]);

  /** 生成一个不重复的 slug（在原 slug 后追加随机后缀） */
  const getUniqueSlug = (baseSlug: string): string => {
    const suffix = Math.random().toString(36).substring(2, 8);
    return `${baseSlug}-${suffix}`;
  };

  return { isChecking, isDuplicate, getUniqueSlug };
}
