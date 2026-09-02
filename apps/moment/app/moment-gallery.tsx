"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  File,
  FileText,
  ImageIcon,
  LockKeyhole,
  LogOut,
  Search,
  ShieldCheck,
  Sparkles,
  Video,
  X,
} from "lucide-react";

type Category = { id: string; name: string; color?: string | null };
type Asset = {
  id: string;
  originalName: string;
  title?: string | null;
  description?: string | null;
  mimeType: string;
  size: string;
  capturedAt?: string | null;
  createdAt: string;
  visibility: "PUBLIC" | "PRIVATE";
  tags: string[];
  category?: Category | null;
};
type Catalog = {
  items: Asset[];
  categories: Category[];
  total: number;
  page: number;
  pages: number;
  access: "public" | "admin";
};

const typeOptions = [
  { value: "", label: "全部", icon: Sparkles },
  { value: "photo", label: "照片", icon: ImageIcon },
  { value: "video", label: "视频", icon: Video },
  { value: "file", label: "文件", icon: FileText },
] as const;

function formatSize(value: string) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = bytes;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index++;
  }
  return `${current >= 10 || index === 0 ? current.toFixed(0) : current.toFixed(1)} ${units[index]}`;
}

function displayDate(asset: Asset) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(asset.capturedAt || asset.createdAt));
}

function MediaTile({
  asset,
  onOpen,
  index,
}: {
  asset: Asset;
  onOpen: () => void;
  index: number;
}) {
  const isImage = asset.mimeType.startsWith("image/");
  const isVideo = asset.mimeType.startsWith("video/");
  return (
    <button
      onClick={onOpen}
      className="photo-card group relative aspect-square overflow-hidden rounded-[18px] bg-[#e7e7e2] text-left shadow-[0_1px_0_rgba(0,0,0,.04)] outline-none transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(0,0,0,.10)] focus-visible:ring-2 focus-visible:ring-blue-500"
      style={{ animationDelay: `${Math.min(index * 24, 240)}ms` }}
    >
      {isImage ? (
        <Image
          src={`/api/moment/assets/${asset.id}/content`}
          alt={asset.title || asset.originalName}
          fill
          unoptimized
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
          className="object-cover transition duration-500 group-hover:scale-[1.025]"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-[#e5e9ef] to-[#d7dce5] p-5 text-[#566274]">
          {isVideo ? (
            <Video className="h-10 w-10" strokeWidth={1.4} />
          ) : (
            <File className="h-10 w-10" strokeWidth={1.4} />
          )}
          <span className="line-clamp-2 text-center text-xs font-medium">
            {asset.title || asset.originalName}
          </span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/55 via-black/10 to-transparent p-3 pt-10 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
        <span className="truncate text-xs font-medium">
          {asset.title || asset.originalName}
        </span>
        {asset.visibility === "PRIVATE" && (
          <LockKeyhole className="ml-2 h-3.5 w-3.5 shrink-0" />
        )}
      </div>
    </button>
  );
}

export function MomentGallery() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: String(page), limit: "60" });
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (category) params.set("category", category);
      if (type) params.set("type", type);
      try {
        const response = await fetch(`/api/moment/catalog?${params}`, {
          signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("资料库暂时无法访问");
        setCatalog(await response.json());
      } catch (reason) {
        if ((reason as Error).name !== "AbortError")
          setError((reason as Error).message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [category, debouncedQuery, page, type],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => setPage(1), [category, debouncedQuery, type]);

  const heading = useMemo(() => {
    if (debouncedQuery) return `“${debouncedQuery}”的结果`;
    if (category)
      return (
        catalog?.categories.find((item) => item.id === category)?.name || "分类"
      );
    return catalog?.access === "admin" ? "所有回忆" : "精选回忆";
  }, [catalog, category, debouncedQuery]);

  async function logout() {
    await fetch("/api/moment/auth/logout", { method: "POST" });
    window.location.reload();
  }

  return (
    <main className="moment-shell">
      <header className="glass sticky top-0 z-30 border-b border-black/[.06]">
        <div className="mx-auto flex h-[66px] max-w-[1500px] items-center gap-4 px-5 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[#1d1d1f] text-white shadow-sm">
              <Archive className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold tracking-[-.01em]">
                Moment
              </p>
              <p className="truncate text-[11px] text-[#77777c]">
                Johnny 的私人资料库
              </p>
            </div>
          </div>
          <div className="relative ml-auto hidden w-full max-w-md sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7a7a80]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索照片、文件名、标签…"
              className="h-10 w-full rounded-xl border border-black/[.06] bg-black/[.045] pl-9 pr-4 text-sm outline-none transition focus:border-blue-500/30 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
          {catalog?.access === "admin" ? (
            <button
              onClick={logout}
              className="flex h-10 items-center gap-2 rounded-xl border border-black/[.08] bg-white/70 px-3 text-xs font-medium transition hover:bg-white"
              title="安全退出"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span className="hidden md:inline">已解锁</span>
              <LogOut className="h-3.5 w-3.5 text-[#777]" />
            </button>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
        <div className="mb-7 sm:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7a7a80]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索照片、文件名、标签…"
              className="h-11 w-full rounded-xl border border-black/[.06] bg-white/65 pl-9 pr-4 text-sm outline-none focus:ring-4 focus:ring-blue-500/10"
            />
          </div>
        </div>

        <section className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[#74747a]">
              <CalendarDays className="h-3.5 w-3.5" /> 安全归档 · 只读浏览
            </div>
            <h1 className="text-[36px] font-semibold leading-none tracking-[-.045em] sm:text-[52px]">
              {heading}
            </h1>
            <p className="mt-3 text-sm text-[#74747a]">
              {catalog ? `${catalog.total} 个项目` : "正在整理资料库…"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {typeOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  onClick={() => setType(option.value)}
                  className={`flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition ${type === option.value ? "bg-[#1d1d1f] text-white shadow-sm" : "border border-black/[.07] bg-white/65 text-[#5f5f64] hover:bg-white"}`}
                >
                  <Icon className="h-3.5 w-3.5" /> {option.label}
                </button>
              );
            })}
          </div>
        </section>

        {catalog && catalog.categories.length > 0 && (
          <nav
            className="mb-8 flex gap-2 overflow-x-auto pb-2"
            aria-label="分类"
          >
            <button
              onClick={() => setCategory("")}
              className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-medium transition ${!category ? "bg-blue-600 text-white" : "border border-black/[.07] bg-white/55 hover:bg-white"}`}
            >
              全部分类
            </button>
            {catalog.categories.map((item) => (
              <button
                key={item.id}
                onClick={() => setCategory(item.id)}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium transition ${category === item.id ? "bg-blue-600 text-white" : "border border-black/[.07] bg-white/55 hover:bg-white"}`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: item.color || "#a1a1a6" }}
                />
                {item.name}
              </button>
            ))}
          </nav>
        )}

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {error}
          </div>
        ) : loading && !catalog ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 18 }).map((_, index) => (
              <div
                key={index}
                className="aspect-square animate-pulse rounded-[18px] bg-black/[.06]"
              />
            ))}
          </div>
        ) : catalog?.items.length === 0 ? (
          <div className="grid min-h-[320px] place-items-center rounded-3xl border border-dashed border-black/10 bg-white/30 text-center">
            <div>
              <Search className="mx-auto mb-3 h-7 w-7 text-[#999]" />
              <p className="font-medium">没有找到相关内容</p>
              <p className="mt-1 text-xs text-[#888]">
                试试文件名、标签或其他分类
              </p>
            </div>
          </div>
        ) : (
          <div
            className={`grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 ${loading ? "opacity-60" : ""}`}
          >
            {catalog?.items.map((asset, index) => (
              <MediaTile
                key={asset.id}
                asset={asset}
                index={index}
                onOpen={() => setSelected(asset)}
              />
            ))}
          </div>
        )}

        {catalog && catalog.pages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-3">
            <button
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
              className="grid h-10 w-10 place-items-center rounded-full border border-black/10 bg-white disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-[#74747a]">
              {page} / {catalog.pages}
            </span>
            <button
              disabled={page >= catalog.pages}
              onClick={() => setPage((value) => value + 1)}
              className="grid h-10 w-10 place-items-center rounded-full border border-black/10 bg-white disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/55 p-0 backdrop-blur-md sm:items-center sm:justify-center sm:p-6"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setSelected(null)
          }
        >
          <div className="relative flex max-h-[94svh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[28px] bg-[#f7f7f5] shadow-2xl sm:rounded-[28px] lg:flex-row">
            <button
              onClick={() => setSelected(null)}
              className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="relative min-h-[42svh] flex-1 bg-[#171719] lg:min-h-[650px]">
              {selected.mimeType.startsWith("image/") ? (
                <Image
                  src={`/api/moment/assets/${selected.id}/content`}
                  alt={selected.title || selected.originalName}
                  fill
                  unoptimized
                  sizes="(max-width: 1024px) 100vw, 70vw"
                  className="object-contain"
                />
              ) : selected.mimeType.startsWith("video/") ? (
                <video
                  className="h-full w-full object-contain"
                  src={`/api/moment/assets/${selected.id}/content`}
                  controls
                  playsInline
                />
              ) : (
                <div className="grid h-full place-items-center text-white/70">
                  <File className="h-20 w-20" strokeWidth={1} />
                </div>
              )}
            </div>
            <aside className="w-full shrink-0 overflow-y-auto p-6 lg:w-[310px] lg:p-7">
              <div className="mb-6">
                <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-[#888]">
                  {selected.category?.name || "未分类"}
                </p>
                <h2 className="mt-2 break-words text-xl font-semibold tracking-[-.025em]">
                  {selected.title || selected.originalName}
                </h2>
                {selected.description && (
                  <p className="mt-3 text-sm leading-6 text-[#666]">
                    {selected.description}
                  </p>
                )}
              </div>
              <dl className="space-y-3 border-y border-black/[.07] py-5 text-xs">
                <div className="flex justify-between gap-4">
                  <dt className="text-[#888]">日期</dt>
                  <dd className="text-right font-medium">
                    {displayDate(selected)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#888]">大小</dt>
                  <dd className="font-medium">{formatSize(selected.size)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#888]">访问</dt>
                  <dd className="flex items-center gap-1 font-medium">
                    {selected.visibility === "PRIVATE" && (
                      <LockKeyhole className="h-3 w-3" />
                    )}
                    {selected.visibility === "PRIVATE" ? "仅自己" : "精选公开"}
                  </dd>
                </div>
              </dl>
              {selected.tags.length > 0 && (
                <div className="my-5 flex flex-wrap gap-1.5">
                  {selected.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-black/[.055] px-2.5 py-1 text-[11px] text-[#666]"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              <a
                href={`/api/moment/assets/${selected.id}/content?download=1`}
                className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1267df] text-sm font-semibold text-white transition hover:bg-[#0b5dcc]"
              >
                <Download className="h-4 w-4" />
                下载原文件
              </a>
            </aside>
          </div>
        </div>
      )}
    </main>
  );
}
