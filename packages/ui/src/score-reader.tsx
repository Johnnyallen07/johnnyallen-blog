"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Rows2,
  ScrollText,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  PanelLeft,
  Pencil,
  Minus,
  Eraser,
  Undo2,
  Save,
  Hand,
  Download,
} from "lucide-react";
import {
  adjacentPages,
  resolvePage,
  touchesStroke,
  type PageAnnotations,
  type Point,
  type ReadingLayout,
  type ScoreDocument,
  type Stroke,
} from "./score-model";
import { ScorePdfCache } from "./score-pdf";

const copy = {
  zh: {
    back: "返回",
    thumbnails: "缩略图",
    single: "单页",
    double: "双页",
    continuous: "连续滚动",
    previous: "上一页",
    next: "下一页",
    page: "页码",
    zoomIn: "放大",
    zoomOut: "缩小",
    reset: "重置缩放",
    fullscreen: "全屏",
    loading: "正在加载乐谱…",
    error: "乐谱加载失败，请检查网络后重试",
    retry: "重试",
    browse: "浏览",
    pen: "画笔",
    line: "直线",
    eraser: "橡皮擦",
    color: "颜色",
    width: "笔画粗细",
    undo: "撤回 (Ctrl / ⌘ Z)",
    save: "保存批注",
    saving: "保存中…",
    saved: "已保存",
    unsaved: "有未保存的修改",
    discard: "有未保存的批注，确定放弃并返回？",
    saveError: "保存失败，修改已保留，请重试",
    preload: "已预加载相邻页面",
    download: "下载原始 PDF",
    hint: "方向键翻页 · Home / End · 缩略图快速定位",
    editHint: "拖动画线 · 橡皮擦移除笔画 · Ctrl / ⌘ Z 撤回",
  },
  en: {
    back: "Back",
    thumbnails: "Thumbnails",
    single: "Single page",
    double: "Two pages",
    continuous: "Continuous",
    previous: "Previous page",
    next: "Next page",
    page: "Page",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    reset: "Reset zoom",
    fullscreen: "Fullscreen",
    loading: "Loading score…",
    error: "Could not load the score. Check your connection and retry.",
    retry: "Retry",
    browse: "Browse",
    pen: "Pen",
    line: "Line",
    eraser: "Eraser",
    color: "Color",
    width: "Stroke width",
    undo: "Undo (Ctrl / ⌘ Z)",
    save: "Save annotations",
    saving: "Saving…",
    saved: "Saved",
    unsaved: "Unsaved changes",
    discard: "Discard unsaved annotations and go back?",
    saveError: "Could not save. Your changes are preserved; please retry.",
    preload: "Adjacent pages preloaded",
    download: "Download original PDF",
    hint: "Arrow keys to turn pages · Home / End · Thumbnails to jump",
    editHint: "Drag to draw · Eraser removes strokes · Ctrl / ⌘ Z to undo",
  },
};

function ToolButton({
  label,
  active,
  children,
  ...props
}: {
  label: string;
  active?: boolean;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      {...props}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg p-2 text-sm transition focus-visible:outline-2 focus-visible:outline-amber-400 disabled:opacity-30 ${active ? "bg-amber-400/20 text-amber-300" : "text-slate-300 hover:bg-white/10 hover:text-white"} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

function PageMedia({
  cache,
  page,
  url,
  thumbnail,
  width,
  onRatio,
  loading,
  error,
  retry,
}: {
  cache: ScorePdfCache | null;
  page: number;
  url?: string;
  thumbnail?: boolean;
  width: number;
  onRatio?: (ratio: number) => void;
  loading: string;
  error: string;
  retry: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: thumbnail ? "120px" : "600px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [cache, page, thumbnail]);
  useEffect(() => {
    if (!visible) {
      if (canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
      }
      setState("loading");
      return;
    }
    if (!cache) return;
    let cancelled = false;
    setState("loading");
    void cache
      .get(page, thumbnail ? 180 : width, thumbnail ? 2 : 0)
      .then((bitmap) => {
        if (cancelled || !canvasRef.current) return;
        const canvas = canvasRef.current;
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
        onRatio?.(bitmap.height / bitmap.width);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [cache, page, thumbnail, width, visible, attempt, onRatio]);
  return (
    <div ref={host} className="relative h-full w-full">
      {url ? (
        <img
          key={`${url}:${attempt}`}
          src={visible ? url : undefined}
          alt=""
          draggable={false}
          onLoad={(event) => {
            onRatio?.(
              event.currentTarget.naturalHeight /
                event.currentTarget.naturalWidth,
            );
            setState("ready");
          }}
          onError={() => setState("error")}
          className="block h-full w-full"
        />
      ) : (
        <canvas ref={canvasRef} className="block h-full w-full" />
      )}
      {state === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70 text-xs text-slate-500">
          <span className="animate-pulse">{thumbnail ? "…" : loading}</span>
        </div>
      )}
      {state === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white p-2 text-center text-xs text-red-700">
          <span>{error}</span>
          {!thumbnail && (
            <button
              type="button"
              onClick={() => {
                setState("loading");
                setAttempt((a) => a + 1);
              }}
              className="rounded border px-3 py-1"
            >
              {retry}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreSheet({
  page,
  pageKey,
  url,
  cache,
  width,
  rasterWidth,
  annotations,
  tool,
  color,
  strokeWidth,
  onChange,
  labels,
  thumbnail = false,
}: {
  page: number;
  pageKey: string;
  url?: string;
  cache: ScorePdfCache | null;
  width: number;
  rasterWidth: number;
  annotations: PageAnnotations[];
  tool: "browse" | "pen" | "line" | "eraser";
  color: string;
  strokeWidth: number;
  onChange: (page: string, strokes: Stroke[]) => void;
  labels: typeof copy.en;
  thumbnail?: boolean;
}) {
  const [ratio, setRatio] = useState(Math.SQRT2);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const [erased, setErased] = useState<Stroke[] | null>(null);
  const gesture = useRef<{
    stroke?: Stroke;
    strokes: Stroke[];
    pointerId: number;
  } | null>(null);
  const strokes =
    annotations.find((item) => item.page === pageKey)?.strokes ?? [];
  const getPoint = (event: PointerEvent<SVGSVGElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };
  const finish = (event: PointerEvent<SVGSVGElement>, cancel = false) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (!cancel)
      onChange(
        pageKey,
        current.stroke ? [...current.strokes, current.stroke] : current.strokes,
      );
    setDraft(null);
    setErased(null);
  };
  return (
    <div
      data-score-page={page}
      className="relative shrink-0 overflow-hidden rounded-sm bg-white shadow-xl"
      style={{ width, height: width * ratio }}
    >
      <PageMedia
        cache={cache}
        page={page}
        url={url}
        width={rasterWidth}
        thumbnail={thumbnail}
        onRatio={setRatio}
        loading={labels.loading}
        error={labels.error}
        retry={labels.retry}
      />
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        aria-label={tool === "browse" ? undefined : labels.editHint}
        className={`absolute inset-0 h-full w-full ${tool === "browse" || thumbnail ? "pointer-events-none" : "touch-none cursor-crosshair"}`}
        onPointerDown={(event) => {
          if (
            tool === "browse" ||
            thumbnail ||
            event.button !== 0 ||
            gesture.current
          )
            return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          const point = getPoint(event);
          if (tool === "eraser") {
            const remaining = strokes.filter(
              (stroke) => !touchesStroke(point, stroke),
            );
            gesture.current = {
              strokes: remaining,
              pointerId: event.pointerId,
            };
            setErased(remaining);
          } else {
            const stroke: Stroke = {
              tool,
              color,
              width: strokeWidth,
              points: [point],
            };
            gesture.current = { stroke, strokes, pointerId: event.pointerId };
            setDraft(stroke);
          }
        }}
        onPointerMove={(event) => {
          const current = gesture.current;
          if (!current || current.pointerId !== event.pointerId) return;
          const point = getPoint(event);
          if (!current.stroke) {
            current.strokes = current.strokes.filter(
              (stroke) => !touchesStroke(point, stroke),
            );
            setErased([...current.strokes]);
          } else {
            const points =
              current.stroke.tool === "line"
                ? [current.stroke.points[0]!, point]
                : [...current.stroke.points, point].slice(0, 4000);
            current.stroke = { ...current.stroke, points };
            setDraft(current.stroke);
          }
        }}
        onPointerUp={(event) => finish(event)}
        onPointerCancel={(event) => finish(event, true)}
        onLostPointerCapture={(event) => finish(event, true)}
      >
        {[...(erased ?? strokes), ...(draft ? [draft] : [])].map(
          (stroke, index) =>
            stroke.points.length === 1 ? (
              <circle
                key={index}
                cx={stroke.points[0]!.x * 1000}
                cy={stroke.points[0]!.y * 1000}
                r={stroke.width * 500}
                fill={stroke.color}
              />
            ) : (
              <polyline
                key={index}
                points={stroke.points
                  .map((point) => `${point.x * 1000},${point.y * 1000}`)
                  .join(" ")}
                fill="none"
                stroke={stroke.color}
                strokeWidth={stroke.width * 1000}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ),
        )}
      </svg>
    </div>
  );
}

export function ScoreReader({
  score,
  locale = "zh",
  initialPage = 1,
  onClose,
  onSave,
  saveLabel,
  extraTools,
}: {
  score: ScoreDocument;
  locale?: string;
  initialPage?: number;
  onClose: () => void;
  onSave?: (annotations: PageAnnotations[]) => Promise<void> | void;
  saveLabel?: string;
  extraTools?: ReactNode;
}) {
  const t = locale.startsWith("zh") ? copy.zh : copy.en;
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [cache, setCache] = useState<ScorePdfCache | null>(null);
  const [total, setTotal] = useState(
    score.fileType === "images" ? (score.pages?.length ?? 0) : 0,
  );
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(initialPage);
  const [input, setInput] = useState(String(initialPage));
  const [layout, setLayout] = useState<ReadingLayout>("single");
  const [thumbnails, setThumbnails] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [size, setSize] = useState({ width: 900, height: 700 });
  const [annotations, setAnnotations] = useState<PageAnnotations[]>(
    score.annotations ?? [],
  );
  const [saved, setSaved] = useState(JSON.stringify(score.annotations ?? []));
  const [history, setHistory] = useState<PageAnnotations[][]>([]);
  const [tool, setTool] = useState<"browse" | "pen" | "line" | "eraser">(
    "browse",
  );
  const [color, setColor] = useState("#dc2626");
  const [strokeWidth, setStrokeWidth] = useState(0.003);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [preloaded, setPreloaded] = useState(false);
  const dirty = JSON.stringify(annotations) !== saved;
  const isImages = score.fileType === "images";
  const rasterWidth = zoom > 1.5 ? 2000 : 1400;

  useEffect(() => {
    setThumbnails(window.innerWidth >= 700);
    setLayout(window.innerWidth >= 1100 ? "double" : "single");
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  useEffect(() => {
    if (isImages) {
      setTotal(score.pages?.length ?? 0);
      return;
    }
    let cancelled = false;
    let resource: ScorePdfCache | null = null;
    let loadingTask:
      | ReturnType<typeof import("pdfjs-dist").getDocument>
      | undefined;
    setError(false);
    setCache(null);
    setTotal(0);
    void import("pdfjs-dist")
      .then(async (pdfjs) => {
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
        loadingTask = pdfjs.getDocument(score.fileUrl);
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        resource = new ScorePdfCache(pdf);
        setCache(resource);
        setTotal(pdf.numPages);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      resource?.dispose();
      void loadingTask?.destroy().catch(() => {});
    };
  }, [isImages, score.fileUrl, score.pages?.length, attempt]);
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setSize({ width: element.clientWidth, height: element.clientHeight }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!total) return;
    let cancelled = false;
    setPreloaded(false);
    const neighbors = adjacentPages(page, total);
    cache?.prioritize(neighbors);
    const promises = neighbors.map((number) => {
      if (cache) return cache.get(number, rasterWidth, 1);
      const url = score.pages?.[number - 1]?.url;
      if (!url) return Promise.resolve();
      const image = new window.Image();
      image.src = url;
      return image.decode();
    });
    void Promise.all(promises)
      .then(() => {
        if (!cancelled) setPreloaded(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [page, total, cache, rasterWidth, score.pages]);
  useEffect(() => {
    setInput(String(page));
  }, [page]);
  useEffect(() => {
    if (layout === "double")
      setPage((value) => (value % 2 === 0 ? value - 1 : value));
    if (layout === "continuous")
      scrollRef.current
        ?.querySelector(`[data-score-page="${page}"]`)
        ?.scrollIntoView({ block: "start" });
    // Only align when switching layout, not on every scroll update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);
  const go = useCallback(
    (value: number | string) => {
      const target = resolvePage(value, page, total, layout);
      setPage(target);
      setInput(String(target));
      if (layout === "continuous")
        scrollRef.current
          ?.querySelector(`[data-score-page="${target}"]`)
          ?.scrollIntoView({ block: "start" });
    },
    [page, total, layout],
  );
  const close = useCallback(() => {
    if (!saving && (!dirty || window.confirm(t.discard))) onClose();
  }, [saving, dirty, t.discard, onClose]);
  const undo = useCallback(() => {
    if (saving || !history.length) return;
    setAnnotations(history[history.length - 1]!);
    setHistory((value) => value.slice(0, -1));
  }, [history, saving]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        (event.target instanceof HTMLElement &&
          event.target.closest(
            "input, textarea, select, [contenteditable=true]",
          ))
      )
        return;
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z" &&
        onSave &&
        !event.shiftKey
      ) {
        event.preventDefault();
        undo();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
        return;
      if (event.key === "Escape") {
        if (!document.fullscreenElement) {
          event.preventDefault();
          close();
        }
        return;
      }
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("button, a") &&
        event.key === " "
      )
        return;
      const step = layout === "double" ? 2 : 1;
      if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
        event.preventDefault();
        go(Math.max(1, page - step));
      }
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        go(page + step);
      }
      if (event.key === "Home") {
        event.preventDefault();
        go(1);
      }
      if (event.key === "End") {
        event.preventDefault();
        go(total);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [go, page, layout, total, close, onSave, undo]);
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty]);
  useEffect(() => {
    const listener = () =>
      setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", listener);
    return () => document.removeEventListener("fullscreenchange", listener);
  }, []);
  const change = (key: string, strokes: Stroke[]) => {
    if (saving) return;
    const next = [
      ...annotations.filter((item) => item.page !== key),
      ...(strokes.length ? [{ page: key, strokes }] : []),
    ];
    if (JSON.stringify(next) === JSON.stringify(annotations)) return;
    setHistory((value) => [...value.slice(-49), annotations]);
    setAnnotations(next);
    setSaveError(false);
  };
  const save = async () => {
    if (!onSave || saving) return;
    setSaving(true);
    setSaveError(false);
    try {
      await onSave(annotations);
      setSaved(JSON.stringify(annotations));
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };
  const pageWidth =
    layout === "continuous"
      ? Math.max(160, Math.min(size.width - 40, 1100)) * zoom
      : Math.max(
          120,
          Math.min(
            (size.width - 48) / (layout === "double" ? 2 : 1),
            (size.height - 32) / Math.SQRT2,
          ),
        ) * zoom;
  const visiblePages =
    layout === "continuous"
      ? Array.from({ length: total }, (_, i) => i + 1)
      : [page, ...(layout === "double" && page < total ? [page + 1] : [])];
  const sheet = (number: number, thumbnail = false) => (
    <ScoreSheet
      key={`${number}:${thumbnail}`}
      page={number}
      pageKey={
        isImages
          ? (score.pages?.[number - 1]?.key ?? String(number))
          : `pdf:${number}`
      }
      url={isImages ? score.pages?.[number - 1]?.url : undefined}
      cache={cache}
      width={thumbnail ? 104 : pageWidth}
      rasterWidth={rasterWidth}
      annotations={annotations}
      tool={thumbnail || saving ? "browse" : tool}
      color={color}
      strokeWidth={strokeWidth}
      onChange={change}
      labels={t}
      thumbnail={thumbnail}
    />
  );

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[100] flex flex-col bg-slate-950 text-white"
      onKeyDownCapture={(event) => {
        if (event.key === "Escape" && !document.fullscreenElement) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
      role="region"
      aria-label={score.title}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <ToolButton label={t.back} onClick={close} disabled={saving}>
            <ArrowLeft size={20} />
          </ToolButton>
          <h2 className="max-w-[55vw] truncate text-sm font-medium sm:max-w-72">
            {score.title}
          </h2>
        </div>
        <div className="flex max-w-full items-center gap-1 overflow-x-auto">
          <ToolButton
            label={t.thumbnails}
            active={thumbnails}
            onClick={() => setThumbnails((v) => !v)}
          >
            <PanelLeft size={18} />
          </ToolButton>
          <ToolButton
            label={t.single}
            active={layout === "single"}
            onClick={() => setLayout("single")}
          >
            <Rows2 size={18} />
          </ToolButton>
          <ToolButton
            label={t.double}
            active={layout === "double"}
            onClick={() => setLayout("double")}
          >
            <Columns2 size={18} />
          </ToolButton>
          <ToolButton
            label={t.continuous}
            active={layout === "continuous"}
            onClick={() => setLayout("continuous")}
          >
            <ScrollText size={18} />
          </ToolButton>
          <ToolButton
            label={t.zoomOut}
            onClick={() => setZoom((v) => Math.max(0.5, v - 0.1))}
          >
            <ZoomOut size={18} />
          </ToolButton>
          <ToolButton label={t.reset} onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%
          </ToolButton>
          <ToolButton
            label={t.zoomIn}
            onClick={() => setZoom((v) => Math.min(3, v + 0.1))}
          >
            <ZoomIn size={18} />
          </ToolButton>
          {!isImages && (
            <a
              href={score.fileUrl}
              download
              target="_blank"
              rel="noreferrer"
              title={t.download}
              aria-label={t.download}
              className="rounded-lg p-2 text-slate-300 hover:bg-white/10"
            >
              <Download size={18} />
            </a>
          )}
          <ToolButton
            label={t.fullscreen}
            onClick={() => {
              if (document.fullscreenElement)
                void document.exitFullscreen().catch(() => {});
              else void rootRef.current?.requestFullscreen?.().catch(() => {});
            }}
          >
            {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </ToolButton>
        </div>
      </header>
      {onSave && (
        <div className="flex flex-wrap items-center gap-1 border-b border-white/10 bg-slate-900 px-3 py-2">
          <ToolButton
            label={t.browse}
            active={tool === "browse"}
            onClick={() => setTool("browse")}
          >
            <Hand size={17} />
            <span>{t.browse}</span>
          </ToolButton>
          <ToolButton
            label={t.pen}
            active={tool === "pen"}
            onClick={() => setTool("pen")}
          >
            <Pencil size={17} />
            <span>{t.pen}</span>
          </ToolButton>
          <ToolButton
            label={t.line}
            active={tool === "line"}
            onClick={() => setTool("line")}
          >
            <Minus size={17} />
            <span>{t.line}</span>
          </ToolButton>
          <ToolButton
            label={t.eraser}
            active={tool === "eraser"}
            onClick={() => setTool("eraser")}
          >
            <Eraser size={17} />
            <span>{t.eraser}</span>
          </ToolButton>
          <input
            type="color"
            value={color}
            aria-label={t.color}
            title={t.color}
            onChange={(event) => setColor(event.target.value)}
            className="mx-2 h-7 w-8 cursor-pointer bg-transparent"
          />
          <select
            value={strokeWidth}
            aria-label={t.width}
            onChange={(event) => setStrokeWidth(Number(event.target.value))}
            className="rounded border border-white/20 bg-slate-900 p-1 text-sm"
          >
            <option value={0.0015}>1.5 px</option>
            <option value={0.003}>3 px</option>
            <option value={0.006}>6 px</option>
            <option value={0.01}>10 px</option>
          </select>
          <ToolButton
            label={t.undo}
            onClick={undo}
            disabled={!history.length || saving}
          >
            <Undo2 size={17} />
          </ToolButton>
          {extraTools}
          <span className="ml-auto px-2 text-xs text-slate-400" role="status">
            {saveError ? t.saveError : dirty ? t.unsaved : t.saved}
          </span>
          <ToolButton
            label={saveLabel ?? t.save}
            onClick={() => void save()}
            disabled={saving}
            className="bg-amber-400/15 text-amber-300"
          >
            <Save size={17} />
            {saving ? t.saving : (saveLabel ?? t.save)}
          </ToolButton>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {thumbnails && total > 0 && (
          <aside
            className="w-32 shrink-0 overflow-y-auto border-r border-white/10 bg-slate-900/60 p-2"
            aria-label={t.thumbnails}
          >
            {Array.from({ length: total }, (_, index) => index + 1).map(
              (number) => (
                <button
                  type="button"
                  key={number}
                  aria-label={`${t.page} ${number}`}
                  aria-current={number === page ? "page" : undefined}
                  onClick={() => go(number)}
                  className={`mb-3 block rounded p-1 text-xs ${number === page || (layout === "double" && number === page + 1) ? "bg-amber-400/25 text-amber-200 ring-1 ring-amber-400" : "text-slate-400 hover:bg-white/10"}`}
                >
                  {sheet(number, true)}
                  <span className="mt-1 block">{number}</span>
                </button>
              ),
            )}
          </aside>
        )}
        <div
          ref={scrollRef}
          className="min-w-0 flex-1 overflow-auto p-4"
          onScroll={() => {
            if (layout !== "continuous" || !scrollRef.current) return;
            const container = scrollRef.current;
            const middle =
              container.getBoundingClientRect().top +
              container.clientHeight / 2;
            const elements = Array.from(
              container.querySelectorAll<HTMLElement>("[data-score-page]"),
            );
            const nearest = elements.reduce<HTMLElement | null>(
              (best, item) => {
                const distance = (element: HTMLElement) =>
                  Math.abs(
                    element.getBoundingClientRect().top +
                      element.clientHeight / 2 -
                      middle,
                  );
                return !best || distance(item) < distance(best) ? item : best;
              },
              null,
            );
            if (nearest) setPage(Number(nearest.dataset.scorePage));
          }}
        >
          {error ? (
            <div
              role="alert"
              className="flex h-full flex-col items-center justify-center gap-3 text-sm text-slate-300"
            >
              {t.error}
              <button
                onClick={() => setAttempt((v) => v + 1)}
                className="rounded bg-white/10 px-4 py-2"
              >
                {t.retry}
              </button>
            </div>
          ) : !total ? (
            <div
              role="status"
              className="flex h-full items-center justify-center text-slate-400"
            >
              {t.loading}
            </div>
          ) : (
            <div
              className={`flex min-h-full min-w-full w-max gap-4 ${layout === "continuous" ? "flex-col items-center" : "items-center justify-center"}`}
            >
              {visiblePages.map((number) => sheet(number))}
            </div>
          )}
        </div>
      </div>
      <footer className="flex flex-wrap items-center justify-center gap-3 border-t border-white/10 px-4 py-2">
        <span className="mr-auto hidden text-xs text-slate-500 lg:block">
          {tool === "browse" ? t.hint : t.editHint}
        </span>
        <ToolButton
          label={t.previous}
          disabled={page <= 1 || !total}
          onClick={() => go(Math.max(1, page - (layout === "double" ? 2 : 1)))}
        >
          <ChevronLeft size={18} />
        </ToolButton>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            go(input);
          }}
          className="flex items-center gap-2 text-xs text-slate-400"
        >
          <input
            aria-label={t.page}
            value={input}
            inputMode="numeric"
            onChange={(event) => setInput(event.target.value)}
            onBlur={() => go(input)}
            className="w-12 rounded border border-white/20 bg-white/5 p-1 text-center text-white"
          />
          <span>/ {total}</span>
        </form>
        <ToolButton
          label={t.next}
          disabled={!total || page + (layout === "double" ? 1 : 0) >= total}
          onClick={() => go(page + (layout === "double" ? 2 : 1))}
        >
          <ChevronRight size={18} />
        </ToolButton>
        <input
          type="range"
          min={1}
          max={Math.max(1, total)}
          value={Math.min(page, total || 1)}
          disabled={!total}
          aria-label={t.page}
          onChange={(event) => go(Number(event.target.value))}
          className="w-24 accent-amber-400 sm:w-40"
        />
        <span
          className="ml-auto hidden text-xs text-slate-500 lg:block"
          aria-live="polite"
        >
          {preloaded ? t.preload : ""}
        </span>
      </footer>
    </div>
  );
}
