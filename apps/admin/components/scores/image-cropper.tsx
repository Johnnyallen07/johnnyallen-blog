"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Crop, Undo2, X } from "lucide-react";

export type CropRect = { x: number; y: number; width: number; height: number };

export function ImageCropper({
  url,
  onApply,
  onClose,
}: {
  url: string;
  onApply: (file: File, rect: CropRect) => void;
  onClose: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const start = useRef<{ x: number; y: number; pointerId: number } | null>(
    null,
  );
  const [rect, setRect] = useState<CropRect | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        setRect(null);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  };
  const apply = async () => {
    const image = imgRef.current;
    if (
      !image?.naturalWidth ||
      !rect ||
      rect.width < 0.01 ||
      rect.height < 0.01
    )
      return;
    setBusy(true);
    setError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(rect.width * image.naturalWidth));
      canvas.height = Math.max(
        1,
        Math.round(rect.height * image.naturalHeight),
      );
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      context.drawImage(
        image,
        rect.x * image.naturalWidth,
        rect.y * image.naturalHeight,
        rect.width * image.naturalWidth,
        rect.height * image.naturalHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error("Image export failed")),
          "image/png",
        ),
      );
      onApply(new File([blob], "score-crop.png", { type: "image/png" }), rect);
    } catch {
      setError("裁剪失败，请重新导入图片后重试（远程图片需允许跨域读取）。");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex h-[85dvh] flex-col bg-slate-950 text-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 p-3">
        <Crop size={18} />
        <span className="text-sm">拖动选择保留区域</span>
        <button
          type="button"
          onClick={() => setRect(null)}
          disabled={!rect || busy}
          className="flex items-center gap-1 rounded bg-white/10 px-3 py-2 text-sm disabled:opacity-40"
        >
          <Undo2 size={16} />
          重置选区
        </button>
        <button
          type="button"
          onClick={() => void apply()}
          disabled={!rect || rect.width < 0.01 || rect.height < 0.01 || busy}
          className="ml-auto rounded bg-amber-400 px-3 py-2 text-sm font-medium text-slate-950 disabled:opacity-40"
        >
          {busy ? "裁剪中…" : "应用裁剪"}
        </button>
        <button
          type="button"
          aria-label="关闭裁剪"
          onClick={onClose}
          disabled={busy}
          className="p-2"
        >
          <X size={18} />
        </button>
      </div>
      {error && (
        <p role="alert" className="p-3 text-sm text-red-300">
          {error}
        </p>
      )}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
        <div
          className="relative max-h-full max-w-full overflow-hidden touch-none select-none"
          onPointerDown={(event) => {
            if (event.button !== 0 || busy) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            start.current = { ...point(event), pointerId: event.pointerId };
            setRect(null);
          }}
          onPointerMove={(event) => {
            if (!start.current || start.current.pointerId !== event.pointerId)
              return;
            const end = point(event),
              origin = start.current;
            setRect({
              x: Math.min(origin.x, end.x),
              y: Math.min(origin.y, end.y),
              width: Math.abs(origin.x - end.x),
              height: Math.abs(origin.y - end.y),
            });
          }}
          onPointerUp={() => {
            start.current = null;
          }}
          onPointerCancel={() => {
            start.current = null;
            setRect(null);
          }}
        >
          {/* Full-resolution source is required for cropping. */}
          <img
            ref={imgRef}
            src={url}
            crossOrigin="anonymous"
            draggable={false}
            alt="待裁剪乐谱"
            onError={() =>
              setError("无法读取图片，请检查网络或重新导入本地图片。")
            }
            className="block max-h-[65dvh] max-w-full object-contain"
          />
          {rect && (
            <div
              className="pointer-events-none absolute border-2 border-amber-400 bg-amber-400/10"
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.width * 100}%`,
                height: `${rect.height * 100}%`,
                boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.35)",
                clipPath: "inset(-100vmax)",
              }}
            />
          )}
        </div>
      </div>
      <p className="p-3 text-center text-xs text-slate-400">
        保留原始像素清晰度 · Ctrl / ⌘ Z 重置选区 · 应用后仍需上传或保存乐谱
      </p>
    </div>
  );
}

export async function captureScoreImage(): Promise<File> {
  if (!navigator.mediaDevices?.getDisplayMedia)
    throw new Error(
      "当前浏览器不支持屏幕截图，请使用系统截图后按 Ctrl / ⌘ V 粘贴。",
    );
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
  });
  const video = document.createElement("video");
  try {
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context || !canvas.width || !canvas.height)
      throw new Error("无法读取屏幕画面，请重试。");
    context.drawImage(video, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("截图失败"))),
        "image/png",
      ),
    );
    return new File([blob], "score-screenshot.png", { type: "image/png" });
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    video.pause();
    video.srcObject = null;
  }
}
