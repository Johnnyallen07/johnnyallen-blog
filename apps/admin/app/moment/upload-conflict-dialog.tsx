"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Folder, GitCompare, Loader2, Trash2 } from "lucide-react";

export type UploadConflictCandidate = {
  id: string;
  originalName: string;
  relativePath: string;
  mimeType: string;
  size: string;
  checksum: string;
  capturedAt?: string | null;
  updatedAt: string;
  width?: number | null;
  height?: number | null;
  reasons: string[];
  exact: boolean;
};

export type UploadConflict =
  | {
      kind: "folder";
      incomingName: string;
      incomingCount: number;
      existing: { id: string; name: string; count: number };
    }
  | {
      kind: "file";
      incoming: {
        file: File;
        path: string;
        checksum: string;
        width?: number;
        height?: number;
      };
      candidates: UploadConflictCandidate[];
      initialCandidateId: string;
    };

export type UploadConflictResolution = {
  action: "replace" | "skip" | "keep" | "cancel";
  applyToAll: boolean;
  existingId?: string;
};

const reasonLabels: Record<string, string> = {
  "same-path": "路径相同",
  "same-content": "SHA-256 相同",
  "same-name": "文件名相同",
  "same-size": "大小相同",
  "same-type": "类型相同",
  "same-date": "日期相同",
  "same-dimensions": "尺寸相同",
};

function canPreview(mimeType: string) {
  return (
    mimeType.startsWith("image/") ||
    mimeType.startsWith("video/") ||
    mimeType.startsWith("audio/") ||
    mimeType === "application/pdf" ||
    mimeType.startsWith("text/")
  );
}

function formatBytes(value: string | number) {
  const size = Number(value);
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;
  return `${(size / 1024 ** 3).toFixed(1)} GB`;
}

function FilePreview({ url, mimeType, name }: { url: string; mimeType: string; name: string }) {
  if (mimeType.startsWith("image/")) return <img src={url} alt={name} className="h-72 w-full rounded-xl bg-gray-100 object-contain" />;
  if (mimeType.startsWith("video/")) return <video src={url} controls className="h-72 w-full rounded-xl bg-black object-contain" />;
  if (mimeType.startsWith("audio/")) return <audio src={url} controls className="my-24 w-full" />;
  return <iframe src={url} title={name} className="h-72 w-full rounded-xl border" />;
}

export function UploadConflictDialog({ conflict, onResolve }: { conflict: UploadConflict; onResolve: (resolution: UploadConflictResolution) => void }) {
  const [compare, setCompare] = useState(false);
  const [applyToAll, setApplyToAll] = useState(false);
  const [selectedId, setSelectedId] = useState(conflict.kind === "file" ? conflict.initialCandidateId : "");
  const [existingUrl, setExistingUrl] = useState("");
  const [incomingUrl, setIncomingUrl] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const selected = conflict.kind === "file" ? conflict.candidates.find((item) => item.id === selectedId) || conflict.candidates[0] : null;
  useEffect(() => {
    if (conflict.kind !== "file") {
      setIncomingUrl("");
      return;
    }
    const url = URL.createObjectURL(conflict.incoming.file);
    setIncomingUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [conflict]);

  useEffect(() => {
    setExistingUrl("");
    setCompare(false);
    setPreviewError("");
  }, [selectedId]);

  useEffect(() => {
    setSelectedId(conflict.kind === "file" ? conflict.initialCandidateId : "");
    setApplyToAll(false);
  }, [conflict]);

  async function showComparison() {
    if (compare) {
      setCompare(false);
      return;
    }
    setCompare(true);
    if (!selected || existingUrl || !canPreview(selected.mimeType)) return;
    setLoadingPreview(true);
    setPreviewError("");
    try {
      const response = await fetch(`/api/moment/admin/assets/${selected.id}/url`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "无法加载旧文件预览");
      setExistingUrl(body.url);
    } catch (error) {
      setPreviewError((error as Error).message);
    } finally {
      setLoadingPreview(false);
    }
  }

  function resolve(action: UploadConflictResolution["action"]) {
    onResolve({ action, applyToAll: action !== "cancel" && conflict.kind === "file" && applyToAll, existingId: selected?.id });
  }

  if (conflict.kind === "folder") {
    return (
      <div className="fixed inset-0 z-[70] grid place-items-center bg-black/55 p-4">
        <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
          <h2 className="flex items-center gap-2 text-xl font-semibold"><Folder className="h-5 w-5 text-amber-600" />发现同名文件夹</h2>
          <p className="mt-3 text-sm leading-6 text-gray-600">目标位置已有“{conflict.existing.name}”。本地文件夹包含 {conflict.incomingCount} 个文件，现有文件夹包含 {conflict.existing.count} 项。</p>
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">“合并并替换”会保留旧文件夹中未冲突的内容，同路径文件按新版本替换；旧对象仅在新文件校验成功后处理。</div>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button onClick={() => resolve("skip")} className="rounded-xl border px-4 py-2 text-sm">跳过整个文件夹</button>
            <button onClick={() => resolve("keep")} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">保留为副本</button>
            <button onClick={() => resolve("replace")} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">合并并替换同路径</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/55 p-4">
      <div className="max-h-[94vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="flex items-center gap-2 text-xl font-semibold"><AlertTriangle className="h-5 w-5 text-amber-600" />发现重复或相似文件</h2>
        <p className="mt-2 text-sm text-gray-500">系统使用路径、SHA-256、名称、大小、类型和日期判断；请选择如何处理新文件。</p>
        {selected && <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${selected.exact ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{selected.exact ? "两个文件的 SHA-256 完全相同，内容逐字节一致。" : "两个文件并非字节级相同，仅路径或元数据相似，请先对比再决定。"}</div>}

        {conflict.candidates.length > 1 && <label className="mt-5 block text-sm font-medium">选择要比较或替换的旧文件<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-2 h-10 w-full rounded-xl border px-3 text-sm">{conflict.candidates.map((item) => <option key={item.id} value={item.id}>{item.relativePath} · {formatBytes(item.size)}</option>)}</select></label>}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">准备上传</p><p className="mt-2 break-all font-medium">{conflict.incoming.path}</p><dl className="mt-3 space-y-1 text-sm text-gray-600"><div className="flex justify-between gap-4"><dt>大小</dt><dd>{formatBytes(conflict.incoming.file.size)}</dd></div><div className="flex justify-between gap-4"><dt>类型</dt><dd>{conflict.incoming.file.type || "application/octet-stream"}</dd></div>{conflict.incoming.width && conflict.incoming.height ? <div className="flex justify-between gap-4"><dt>尺寸</dt><dd>{conflict.incoming.width} × {conflict.incoming.height}</dd></div> : null}<div className="flex justify-between gap-4"><dt>修改时间</dt><dd>{new Date(conflict.incoming.file.lastModified).toLocaleString("zh-CN")}</dd></div><div className="flex justify-between gap-4"><dt>SHA-256</dt><dd className="font-mono text-xs">{conflict.incoming.checksum.slice(0, 16)}…</dd></div></dl></div>
          {selected && <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-amber-700">资料库现有文件</p><p className="mt-2 break-all font-medium">{selected.relativePath}</p><dl className="mt-3 space-y-1 text-sm text-gray-600"><div className="flex justify-between gap-4"><dt>大小</dt><dd>{formatBytes(selected.size)}</dd></div><div className="flex justify-between gap-4"><dt>类型</dt><dd>{selected.mimeType}</dd></div>{selected.width && selected.height ? <div className="flex justify-between gap-4"><dt>尺寸</dt><dd>{selected.width} × {selected.height}</dd></div> : null}{selected.capturedAt ? <div className="flex justify-between gap-4"><dt>拍摄时间</dt><dd>{new Date(selected.capturedAt).toLocaleString("zh-CN")}</dd></div> : null}<div className="flex justify-between gap-4"><dt>更新时间</dt><dd>{new Date(selected.updatedAt).toLocaleString("zh-CN")}</dd></div><div className="flex justify-between gap-4"><dt>SHA-256</dt><dd className="font-mono text-xs">{selected.checksum.slice(0, 16)}…</dd></div></dl><div className="mt-3 flex flex-wrap gap-1">{selected.reasons.map((reason) => <span key={reason} className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-800">{reasonLabels[reason] || reason}</span>)}</div></div>}
        </div>

        {compare && selected && <div className="mt-5 grid gap-4 rounded-2xl bg-gray-50 p-4 md:grid-cols-2"><div><p className="mb-2 text-sm font-medium">新文件</p>{incomingUrl && canPreview(conflict.incoming.file.type) ? <FilePreview url={incomingUrl} mimeType={conflict.incoming.file.type} name={conflict.incoming.file.name} /> : <div className="grid h-72 place-items-center rounded-xl border bg-white text-sm text-gray-400">此类型不支持浏览器预览，请根据元数据判断</div>}</div><div><p className="mb-2 text-sm font-medium">旧文件</p>{loadingPreview ? <div className="grid h-72 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div> : previewError ? <div className="grid h-72 place-items-center rounded-xl border border-red-200 bg-red-50 px-6 text-center text-sm text-red-600">{previewError}</div> : existingUrl && canPreview(selected.mimeType) ? <FilePreview url={existingUrl} mimeType={selected.mimeType} name={selected.originalName} /> : <div className="grid h-72 place-items-center rounded-xl border bg-white text-sm text-gray-400">此类型不支持浏览器预览，请根据元数据判断</div>}</div></div>}

        <label className="mt-5 flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={applyToAll} onChange={(event) => setApplyToAll(event.target.checked)} className="h-4 w-4 rounded border" />对本批后续重复文件使用相同处理方式</label>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button disabled={loadingPreview} onClick={() => void showComparison()} className="mr-auto flex items-center gap-2 rounded-xl border px-4 py-2 text-sm disabled:opacity-50"><GitCompare className="h-4 w-4" />{compare ? "收起对比" : "对比两个文件"}</button>
          <button onClick={() => resolve("cancel")} className="rounded-xl border px-4 py-2 text-sm text-gray-500">暂停本次上传</button>
          <button onClick={() => resolve("skip")} className="rounded-xl border px-4 py-2 text-sm">跳过新文件</button>
          <button onClick={() => resolve("keep")} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">保留两份</button>
          <button onClick={() => resolve("replace")} className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white"><Trash2 className="h-4 w-4" />{selected?.reasons.includes("same-path") ? "替换旧文件" : "上传并删除此旧文件"}</button>
        </div>
        <p className="mt-3 text-right text-xs text-gray-400">删除操作只会在新文件上传且 SHA-256 校验成功后执行。</p>
      </div>
    </div>
  );
}
