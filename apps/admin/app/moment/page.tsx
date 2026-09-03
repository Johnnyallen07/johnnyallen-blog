"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  File,
  FilePlus2,
  Folder,
  FolderInput,
  FolderPlus,
  HardDrive,
  Image as ImageIcon,
  KeyRound,
  LayoutGrid,
  List,
  MapPin,
  MoreHorizontal,
  Move,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Smartphone,
  Trash2,
  Upload,
  Video,
  WifiOff,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { fetchClient } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listUploadCaches,
  loadUploadCache,
  reconcileUploadCache,
  removeUploadCache,
  saveUploadCache,
  updateUploadCacheFile,
  uploadCacheComplete,
  uploadCacheKey,
  uploadCacheProgress,
} from "@/lib/moment-upload-cache";
import {
  loadUploadHandle,
  removeUploadHandle,
  saveUploadHandle,
} from "@/lib/moment-upload-handles";
import {
  delay,
  putPart,
  retryDelay,
  waitForOnline,
} from "@/lib/resumable-upload";
import {
  UploadConflictDialog,
  type UploadConflict,
  type UploadConflictCandidate,
  type UploadConflictResolution,
} from "./upload-conflict-dialog";

type FolderItem = {
  id: string;
  name: string;
  parentId?: string | null;
  trashedAt?: string | null;
  _count?: { assets: number; children: number };
};
type Asset = {
  id: string;
  originalName: string;
  relativePath: string;
  title?: string | null;
  description?: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  tags: string[];
  categoryId?: string | null;
  mimeType: string;
  size: string;
  updatedAt: string;
  trashedAt?: string | null;
  xmpMetadata?: XmpMetadata | null;
  sidecar?: AssetSidecar | null;
  sidecars?: AssetSidecar[];
};
type AssetSidecar = {
  id: string;
  originalName: string;
  relativePath: string;
  mimeType: string;
  size: string;
  updatedAt: string;
  xmpMetadata?: XmpMetadata | null;
};
type XmpMetadata = {
  make?: string;
  model?: string;
  lens?: string;
  focalLength?: string;
  aperture?: string;
  shutterSpeed?: string;
  iso?: string;
  rating?: string;
  label?: string;
  creator?: string;
  description?: string;
  keywords?: string[];
  city?: string;
  state?: string;
  country?: string;
  location?: string;
  gpsLatitude?: string;
  gpsLongitude?: string;
  capturedAt?: string;
};
type SearchFacets = {
  cameras: string[];
  lenses: string[];
  locations: string[];
  keywords: string[];
};
type BrowserData = {
  folderId: string | null;
  breadcrumbs: { id: string; name: string }[];
  folders: FolderItem[];
  assets: Asset[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  includeSidecars: boolean;
  searchFacets?: SearchFacets;
};
type TrustedDevice = {
  id: string;
  deviceLabel: string;
  lastIp?: string | null;
  lastUsedAt: string;
  expiresAt: string;
  revokedAt?: string | null;
};
type SyncToken = {
  id: string;
  label: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
};
type DirectoryHandle = {
  name: string;
  values(): AsyncIterableIterator<FileSystemHandleLike>;
  getDirectoryHandle(name: string): Promise<DirectoryHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  queryPermission?(options: { mode: "readwrite" }): Promise<PermissionState>;
};
type FileHandleLike = {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  requestPermission(options: { mode: "read" }): Promise<PermissionState>;
  queryPermission?(options: { mode: "read" }): Promise<PermissionState>;
};
type FileSystemHandleLike =
  | { kind: "file"; name: string; getFile(): Promise<File> }
  | ({ kind: "directory" } & DirectoryHandle);
type LocalVerified = { path: string; name: string };
type UndoAction = { label: string; run: () => Promise<void> };
type UploadEntry = { file: File; path: string };
type UploadCacheContext = {
  destinationPath: string;
  destinationFolderId?: string | null;
  sourceFolder: string;
  targetFolder?: string;
  folderAction?: "replace" | "keep" | null;
  hasPersistentHandle?: boolean;
  inputKind?: "folder" | "files";
  displayName?: string;
};
type UploadProgressState = {
  cacheKey?: string;
  sourceFolder: string;
  state:
    | "preparing"
    | "uploading"
    | "offline"
    | "verifying"
    | "paused"
    | "error"
    | "completed";
  message: string;
  currentFile: string;
  fileIndex: number;
  totalFiles: number;
  uploadedBytes: number;
  totalBytes: number;
  currentPartBytes?: number;
  speed?: number;
};
type UploadCheckResult = {
  duplicate: boolean;
  pathMatch: UploadConflictCandidate | null;
  candidates: UploadConflictCandidate[];
  suggestedPath: string;
};
type MoveTarget =
  | { kind: "folder"; item: FolderItem }
  | { kind: "asset"; item: Asset };
type RenameTarget = { kind: "folder" | "asset"; id: string; value: string };
type FolderCheckResult = {
  duplicate: boolean;
  existing:
    | (FolderItem & { _count?: { assets: number; children: number } })
    | null;
  suggestedName: string;
};

async function momentFetch(path: string, options: RequestInit = {}) {
  const response = await fetch(`/api/moment${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || "请求失败") as Error & {
      status: number;
    };
    error.status = response.status;
    throw error;
  }
  return body;
}

const thumbnailCache = new Map<string, { url: string; expiresAt: number }>();

function AssetThumbnail({
  asset,
  onOpen,
}: {
  asset: Asset;
  onOpen: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const fallbackAttempted = useRef(false);

  useEffect(() => {
    if (!isImageAsset(asset)) return;
    let active = true;
    const load = async () => {
      const cached = thumbnailCache.get(asset.id);
      if (cached && cached.expiresAt > Date.now()) {
        if (active) setUrl(cached.url);
        return;
      }
      try {
        const value = await momentFetch(
          `/admin/assets/${asset.id}/url?thumbnail=1`,
        );
        thumbnailCache.set(asset.id, {
          url: value.url,
          expiresAt: Date.now() + 4 * 60 * 1000,
        });
        if (active) setUrl(value.url);
      } catch {
        if (active) setFailed(true);
      }
    };
    const node = container.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      void load();
      return () => {
        active = false;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void load();
      },
      { rootMargin: "320px" },
    );
    observer.observe(node);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [asset.id, asset.mimeType]);

  async function useOriginalFallback() {
    if (fallbackAttempted.current) {
      setFailed(true);
      return;
    }
    fallbackAttempted.current = true;
    try {
      const value = await momentFetch(`/admin/assets/${asset.id}/url`);
      setUrl(value.url);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div
      ref={container}
      className="relative aspect-[4/3] overflow-hidden bg-gray-100"
    >
      {isImageAsset(asset) && url && !failed ? (
        <button
          onClick={onOpen}
          className="h-full w-full"
          title={`预览 ${asset.originalName}`}
        >
          <img
            src={url}
            alt={asset.originalName}
            loading="lazy"
            decoding="async"
            onError={() => void useOriginalFallback()}
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]"
          />
        </button>
      ) : (
        <div className="grid h-full place-items-center text-gray-300">
          {isVideoAsset(asset) ? (
            <Video className="h-10 w-10" />
          ) : isImageAsset(asset) ? (
            <ImageIcon className="h-10 w-10" />
          ) : (
            <File className="h-10 w-10" />
          )}
        </div>
      )}
      {asset.sidecar && (
        <span className="absolute bottom-2 left-2 rounded-md bg-violet-600/90 px-2 py-1 text-[10px] font-semibold text-white shadow-sm">
          照片 + {asset.sidecars?.length || 1} metadata
        </span>
      )}
    </div>
  );
}

function formatBytes(value: string | number) {
  const size = Number(value);
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;
  return `${(size / 1024 ** 3).toFixed(1)} GB`;
}

function formatRate(value?: number) {
  return value && Number.isFinite(value)
    ? `${formatBytes(value)}/s`
    : "正在估算速度";
}

function formatEta(bytes: number, speed?: number) {
  if (!speed || speed <= 0 || bytes <= 0) return "";
  const seconds = Math.ceil(bytes / speed);
  if (seconds < 60) return `约 ${seconds} 秒`;
  if (seconds < 3600) return `约 ${Math.ceil(seconds / 60)} 分钟`;
  return `约 ${(seconds / 3600).toFixed(1)} 小时`;
}

function xmpSummary(metadata?: XmpMetadata | null) {
  if (!metadata) return "";
  return [
    metadata.model || metadata.make,
    metadata.lens,
    metadata.focalLength ? `${metadata.focalLength} mm` : "",
    metadata.aperture ? `ƒ/${metadata.aperture}` : "",
    metadata.shutterSpeed ? `${metadata.shutterSpeed} s` : "",
    metadata.iso ? `ISO ${metadata.iso}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

const imageExtensions = new Set([
  "avif",
  "bmp",
  "cr2",
  "cr3",
  "dng",
  "gif",
  "heic",
  "heif",
  "jpeg",
  "jpg",
  "nef",
  "orf",
  "pef",
  "png",
  "raf",
  "raw",
  "rw2",
  "tif",
  "tiff",
  "webp",
]);
const videoExtensions = new Set([
  "3gp",
  "avi",
  "m4v",
  "mkv",
  "mov",
  "mp4",
  "mpeg",
  "mpg",
  "webm",
]);

function assetExtension(asset: Pick<Asset, "originalName">) {
  return asset.originalName.split(".").pop()?.toLocaleLowerCase() || "";
}

function isImageAsset(asset: Asset) {
  return (
    asset.mimeType.startsWith("image/") ||
    imageExtensions.has(assetExtension(asset))
  );
}

function isVideoAsset(asset: Asset) {
  return (
    asset.mimeType.startsWith("video/") ||
    videoExtensions.has(assetExtension(asset))
  );
}

function canPreview(asset: Asset) {
  return (
    isImageAsset(asset) ||
    isVideoAsset(asset) ||
    asset.mimeType.startsWith("audio/") ||
    asset.mimeType === "application/pdf" ||
    asset.mimeType.startsWith("text/")
  );
}

function folderOptions(folders: FolderItem[]) {
  const byParent = new Map<string | null, FolderItem[]>();
  for (const folder of folders) {
    const key = folder.parentId || null;
    byParent.set(key, [...(byParent.get(key) || []), folder]);
  }
  const result: { id: string; label: string }[] = [];
  const visit = (
    parentId: string | null,
    prefix = "",
    seen = new Set<string>(),
  ) => {
    for (const folder of byParent.get(parentId) || []) {
      if (seen.has(folder.id)) continue;
      const label = prefix ? `${prefix} / ${folder.name}` : folder.name;
      result.push({ id: folder.id, label });
      visit(folder.id, label, new Set([...seen, folder.id]));
    }
  };
  visit(null);
  return result;
}

function isFolderInside(
  candidateId: string,
  ancestorId: string,
  folders: FolderItem[],
) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  let current = byId.get(candidateId);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    if (current.id === ancestorId) return true;
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return false;
}

async function checksum(file: File) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function imageDimensions(file: File) {
  if (
    !file.type.startsWith("image/") ||
    typeof createImageBitmap !== "function"
  )
    return {};
  try {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch {
    return {};
  }
}

function fileSelectionId(files: File[]) {
  let hash = 1469598103934665603n;
  const input = files
    .map((file) => `${file.name}\0${file.size}\0${file.lastModified}`)
    .sort()
    .join("\n");
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return `files-${hash.toString(16).padStart(16, "0")}`;
}

async function collectDirectory(
  handle: DirectoryHandle,
  prefix = "",
): Promise<{ file: File; path: string }[]> {
  const files: { file: File; path: string }[] = [];
  for await (const entry of handle.values()) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "file")
      files.push({ file: await entry.getFile(), path });
    else files.push(...(await collectDirectory(entry, path)));
  }
  return files;
}

export default function MomentAdminPage() {
  const router = useRouter();
  const folderInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [setupEnabled, setSetupEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{
    secret: string;
    otpauthUri: string;
  } | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [login, setLogin] = useState({ username: "", password: "", code: "" });
  const [rememberDevice, setRememberDevice] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [browser, setBrowser] = useState<BrowserData>({
    folderId: null,
    breadcrumbs: [],
    folders: [],
    assets: [],
    total: 0,
    page: 1,
    limit: 20,
    pages: 1,
    includeSidecars: false,
  });
  const [trash, setTrash] = useState(false);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [includeSidecars, setIncludeSidecars] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [pendingUploadCount, setPendingUploadCount] = useState(0);
  const [verifiedLocal, setVerifiedLocal] = useState<LocalVerified[]>([]);
  const [directoryHandle, setDirectoryHandle] =
    useState<DirectoryHandle | null>(null);
  const [preview, setPreview] = useState<{ asset: Asset; url: string } | null>(
    null,
  );
  const [selected, setSelected] = useState<Asset | null>(null);
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([]);
  const [adminDevices, setAdminDevices] = useState<TrustedDevice[]>([]);
  const [syncTokens, setSyncTokens] = useState<SyncToken[]>([]);
  const [newTokenLabel, setNewTokenLabel] = useState("Johnny’s MacBook");
  const [revealedToken, setRevealedToken] = useState("");
  const [uploadConflict, setUploadConflict] = useState<UploadConflict | null>(
    null,
  );
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [allFolders, setAllFolders] = useState<FolderItem[]>([]);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<
    ReturnType<typeof listUploadCaches>
  >([]);
  const [uploadProgress, setUploadProgress] =
    useState<UploadProgressState | null>(null);
  const uploadConflictResolver = useRef<
    ((resolution: UploadConflictResolution) => void) | null
  >(null);
  const uploadAbort = useRef<AbortController | null>(null);
  const autoResumeAttempted = useRef(false);
  const browserLocation = useRef<{ folderId: string | null; page: number }>({
    folderId: null,
    page: 1,
  });
  const prefetchedBrowserPages = useRef(new Map<string, BrowserData>());
  const activeUpload = useRef<{
    entries: UploadEntry[];
    localPaths?: string[];
    context?: UploadCacheContext;
  } | null>(null);

  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
    const savedView = window.localStorage.getItem("moment-browser-view");
    if (savedView === "grid" || savedView === "list") setViewMode(savedView);
    const pending = listUploadCaches(window.localStorage);
    setPendingUploads(pending);
    setPendingUploadCount(pending.length);
    void fetchClient("/moment/auth/setup/status")
      .then((value) => setSetupEnabled(value.enabled))
      .catch((error) => toast.error(error.message));
  }, []);

  useEffect(() => {
    if (!unlocked || busy || autoResumeAttempted.current) return;
    const resumable = pendingUploads.find((item) => item.hasPersistentHandle);
    if (!resumable) return;
    autoResumeAttempted.current = true;
    const key = uploadCacheKey(
      resumable.destinationPath,
      resumable.sourceFolder,
    );
    void loadUploadHandle<DirectoryHandle | FileHandleLike[]>(key)
      .then(async (handle) => {
        if (!handle) return;
        const granted = Array.isArray(handle)
          ? (
              await Promise.all(
                handle.map((item) => item.queryPermission?.({ mode: "read" })),
              )
            ).every((permission) => permission === "granted")
          : (await handle.queryPermission?.({ mode: "readwrite" })) ===
            "granted";
        if (!granted) return;
        await resumeCachedUpload(resumable);
      })
      .catch(() => undefined);
  }, [busy, pendingUploads, unlocked]);

  useEffect(() => {
    const offline = () =>
      setUploadProgress((value) =>
        value
          ? {
              ...value,
              state: "offline",
              message: "网络已断开，恢复后会自动继续",
            }
          : value,
      );
    const online = () =>
      setUploadProgress((value) =>
        value?.state === "offline"
          ? { ...value, state: "uploading", message: "网络已恢复，正在继续" }
          : value,
      );
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      uploadAbort.current?.abort();
    };
  }, []);

  const loadBrowser = useCallback(
    async (folderId?: string | null, page?: number) => {
      const resolvedFolderId =
        folderId === undefined ? browserLocation.current.folderId : folderId;
      const resolvedPage = page || browserLocation.current.page;
      const query = new URLSearchParams();
      if (resolvedFolderId && !trash) query.set("folderId", resolvedFolderId);
      if (trash) query.set("trash", "true");
      if (search.trim()) query.set("q", search.trim());
      if (includeSidecars) query.set("includeSidecars", "true");
      query.set("page", String(resolvedPage));
      query.set("limit", "20");
      const key = query.toString();
      const isNavigation =
        resolvedFolderId !== browserLocation.current.folderId ||
        resolvedPage !== browserLocation.current.page;
      const prefetched = isNavigation
        ? prefetchedBrowserPages.current.get(key)
        : undefined;
      const value =
        prefetched || (await momentFetch(`/admin/browser?${query}`));
      prefetchedBrowserPages.current.delete(key);
      browserLocation.current = { folderId: value.folderId, page: value.page };
      setBrowser(value);
      setUnlocked(true);
    },
    [includeSidecars, search, trash],
  );

  const loadSecurity = useCallback(async () => {
    const [momentDevices, tokens, devices] = await Promise.all([
      momentFetch("/admin/trusted-devices"),
      momentFetch("/admin/sync-tokens"),
      fetchClient("/auth/trusted-devices"),
    ]);
    setTrustedDevices(momentDevices);
    setSyncTokens(tokens);
    setAdminDevices(devices);
  }, []);

  useEffect(() => {
    if (!setupEnabled) return;
    void momentFetch("/admin/browser")
      .then((value) => {
        setBrowser(value);
        setUnlocked(true);
        void loadSecurity();
      })
      .catch(() => setUnlocked(false));
  }, [loadSecurity, setupEnabled]);

  useEffect(() => {
    if (!unlocked) return;
    const timer = window.setTimeout(() => {
      browserLocation.current.page = 1;
      prefetchedBrowserPages.current.clear();
      void loadBrowser(undefined, 1).catch((error) =>
        toast.error(error.message),
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadBrowser, unlocked]);

  useEffect(() => {
    if (!unlocked || browser.page >= browser.pages) return;
    const query = new URLSearchParams();
    if (browser.folderId && !trash) query.set("folderId", browser.folderId);
    if (trash) query.set("trash", "true");
    if (search.trim()) query.set("q", search.trim());
    if (includeSidecars) query.set("includeSidecars", "true");
    query.set("page", String(browser.page + 1));
    query.set("limit", "20");
    const key = query.toString();
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void momentFetch(`/admin/browser?${query}`, { signal: controller.signal })
        .then((value) => prefetchedBrowserPages.current.set(key, value))
        .catch(() => undefined);
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    browser.folderId,
    browser.page,
    browser.pages,
    includeSidecars,
    search,
    trash,
    unlocked,
  ]);

  useEffect(() => {
    window.localStorage.setItem("moment-browser-view", viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (trash && viewMode === "grid") setViewMode("list");
  }, [trash, viewMode]);

  useEffect(() => {
    if (!busy || !uploadProgress || uploadProgress.state === "completed")
      return;
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [busy, uploadProgress]);

  async function startSetup() {
    setBusy(true);
    try {
      setSetup(
        await fetchClient("/moment/auth/setup/start", {
          method: "POST",
          body: "{}",
        }),
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup() {
    setBusy(true);
    try {
      const value = await fetchClient("/moment/auth/setup/confirm", {
        method: "POST",
        body: JSON.stringify({ code: setupCode }),
      });
      setRecoveryCodes(value.recoveryCodes);
      setSetupEnabled(true);
      setSetup(null);
      toast.success("Moment 双重验证已启用");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setLoginError("");
    try {
      await momentFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ ...login, rememberDevice }),
      });
      setLogin((value) => ({ ...value, password: "", code: "" }));
      await loadBrowser(null);
      await loadSecurity();
      toast.success(
        rememberDevice
          ? "Moment 已解锁，这台设备 7 天内无需再次验证"
          : "Moment 已解锁",
      );
    } catch (error) {
      setLoginError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function currentPath() {
    return browser.breadcrumbs.map((item) => item.name).join("/");
  }

  function requestStatus(error: unknown) {
    return (error as Error & { status?: number }).status;
  }

  function chooseUploadConflict(conflict: UploadConflict) {
    return new Promise<UploadConflictResolution>((resolve) => {
      uploadConflictResolver.current = resolve;
      setUploadConflict(conflict);
    });
  }

  function resolveUploadConflict(resolution: UploadConflictResolution) {
    uploadConflictResolver.current?.(resolution);
    uploadConflictResolver.current = null;
    setUploadConflict(null);
  }

  async function deleteReplacedAsset(assetId: string | null) {
    if (!assetId) return;
    try {
      await momentFetch(`/admin/assets/${assetId}/permanent`, {
        method: "DELETE",
      });
    } catch (error) {
      if (requestStatus(error) !== 404) throw error;
    }
  }

  function refreshPendingUploads() {
    const pending = listUploadCaches(window.localStorage);
    setPendingUploads(pending);
    setPendingUploadCount(pending.length);
  }

  function reportUploadProgress(
    cache: ReturnType<typeof reconcileUploadCache> | null,
    details: Omit<
      UploadProgressState,
      "uploadedBytes" | "totalBytes" | "totalFiles"
    >,
    currentPartBytes = 0,
  ) {
    const progress = cache
      ? uploadCacheProgress(cache)
      : { uploadedBytes: 0, totalBytes: 0, totalFiles: details.fileIndex || 1 };
    setUploadProgress({
      ...details,
      uploadedBytes: Math.min(
        progress.uploadedBytes + currentPartBytes,
        progress.totalBytes,
      ),
      totalBytes: progress.totalBytes,
      totalFiles: progress.totalFiles,
      currentPartBytes,
    });
  }

  function pauseUpload() {
    uploadAbort.current?.abort();
    setUploadProgress((value) =>
      value
        ? { ...value, state: "paused", message: "上传已暂停，进度已安全保存" }
        : value,
    );
  }

  async function resumeActiveUpload() {
    const active = activeUpload.current;
    if (!active || busy) return;
    await uploadFiles(active.entries, active.localPaths, active.context);
  }

  async function resumeCachedUpload(
    uploadCache: ReturnType<typeof reconcileUploadCache>,
  ) {
    if (busy) return;
    const key = uploadCacheKey(
      uploadCache.destinationPath,
      uploadCache.sourceFolder,
    );
    const storedHandle = await loadUploadHandle<
      DirectoryHandle | FileHandleLike[]
    >(key).catch(() => undefined);
    if (!storedHandle) {
      toast.info("此任务没有可恢复的文件授权，请重新选择相同内容");
      if (uploadCache.inputKind === "files") fileInput.current?.click();
      else folderInput.current?.click();
      return;
    }
    if (Array.isArray(storedHandle)) {
      for (const handle of storedHandle) {
        let permission = await handle.queryPermission?.({ mode: "read" });
        if (permission !== "granted")
          permission = await handle.requestPermission({ mode: "read" });
        if (permission !== "granted") {
          toast.error("需要文件读取权限才能继续上传");
          return;
        }
      }
      const files = await Promise.all(
        storedHandle.map((handle) => handle.getFile()),
      );
      await uploadFiles(
        files.map((file) => ({ file, path: file.name })),
        undefined,
        {
          destinationPath: uploadCache.destinationPath,
          destinationFolderId: uploadCache.destinationFolderId,
          sourceFolder: uploadCache.sourceFolder,
          targetFolder: "",
          hasPersistentHandle: true,
          inputKind: "files",
          displayName: uploadCache.displayName,
        },
      );
      return;
    }
    const handle = storedHandle;
    let permission = await handle.queryPermission?.({ mode: "readwrite" });
    if (permission !== "granted")
      permission = await handle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      toast.error("需要文件夹读取权限才能继续上传");
      return;
    }
    const entries = await collectDirectory(handle);
    setDirectoryHandle(handle);
    await uploadFiles(
      entries.map((entry) => ({
        ...entry,
        path: `${uploadCache.targetFolder || handle.name}/${entry.path}`,
      })),
      entries.map((entry) => entry.path),
      {
        destinationPath: uploadCache.destinationPath,
        destinationFolderId: uploadCache.destinationFolderId,
        sourceFolder: uploadCache.sourceFolder,
        targetFolder: uploadCache.targetFolder,
        folderAction: uploadCache.folderAction,
        hasPersistentHandle: true,
        inputKind: "folder",
        displayName: uploadCache.displayName,
      },
    );
  }

  async function cancelCachedUpload(
    uploadCache: ReturnType<typeof reconcileUploadCache>,
  ) {
    if (
      !confirm(
        `取消“${uploadCache.displayName || uploadCache.sourceFolder}”上传并清理云端临时分片？已入库文件不会删除。`,
      )
    )
      return;
    if (
      uploadProgress?.cacheKey ===
      uploadCacheKey(uploadCache.destinationPath, uploadCache.sourceFolder)
    ) {
      uploadAbort.current?.abort();
    }
    for (const file of Object.values(uploadCache.files || {}) as Array<
      Record<string, unknown>
    >) {
      const objectKey =
        typeof file.objectKey === "string" ? file.objectKey : "";
      const uploadId = typeof file.uploadId === "string" ? file.uploadId : "";
      if (!objectKey || file.verified) continue;
      try {
        if (uploadId && !file.multipartCompleted) {
          await momentFetch("/admin/multipart/abort", {
            method: "POST",
            body: JSON.stringify({ objectKey, uploadId }),
          });
        } else {
          await momentFetch("/admin/upload-cancel", {
            method: "POST",
            body: JSON.stringify({ objectKey }),
          });
        }
      } catch {
        // The local task must remain cancellable even if an expired COS session is already gone.
      }
    }
    const key = uploadCacheKey(
      uploadCache.destinationPath,
      uploadCache.sourceFolder,
    );
    removeUploadCache(
      window.localStorage,
      uploadCache.destinationPath,
      uploadCache.sourceFolder,
    );
    await removeUploadHandle(key).catch(() => undefined);
    if (uploadProgress?.cacheKey === key) {
      setUploadProgress(null);
      activeUpload.current = null;
    }
    refreshPendingUploads();
    toast.success("上传任务已取消，临时分片已清理");
  }

  async function uploadPartWithRetry(
    objectKey: string,
    uploadId: string,
    partNumber: number,
    blob: Blob,
    signal: AbortSignal,
    onProgress: (bytes: number, speed: number) => void,
  ) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await waitForOnline(signal);
      try {
        const signed = await momentFetch("/admin/multipart/part-url", {
          method: "POST",
          body: JSON.stringify({ objectKey, uploadId, partNumber }),
        });
        const startedAt = performance.now();
        await putPart(signed.url, blob, signal, (bytes) => {
          const seconds = Math.max((performance.now() - startedAt) / 1000, 0.2);
          onProgress(bytes, bytes / seconds);
        });
        return;
      } catch (error) {
        if ((error as Error).name === "AbortError") throw error;
        lastError = error;
        if (!navigator.onLine) {
          setUploadProgress((value) =>
            value
              ? {
                  ...value,
                  state: "offline",
                  message: "网络已断开，恢复后会自动继续",
                }
              : value,
          );
          await waitForOnline(signal);
        } else if (attempt < 4) {
          await delay(retryDelay(attempt), signal);
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("分片上传重试失败");
  }

  async function uploadFiles(
    entries: UploadEntry[],
    localPaths?: string[],
    cacheContext?: UploadCacheContext,
  ) {
    if (entries.length === 0) return;
    autoResumeAttempted.current = true;
    setBusy(true);
    const abortController = new AbortController();
    uploadAbort.current = abortController;
    activeUpload.current = { entries, localPaths, context: cacheContext };
    const verified: LocalVerified[] = [];
    let skipped = 0;
    let resumed = 0;
    let batchAction: Exclude<
      UploadConflictResolution["action"],
      "cancel"
    > | null = null;
    let cache = cacheContext
      ? reconcileUploadCache(
          loadUploadCache(
            window.localStorage,
            cacheContext.destinationPath,
            cacheContext.sourceFolder,
          ),
          cacheContext,
          entries,
        )
      : null;
    const cacheKey = cache
      ? uploadCacheKey(cache.destinationPath, cache.sourceFolder)
      : undefined;
    if (cache) {
      saveUploadCache(window.localStorage, cache);
      refreshPendingUploads();
    }

    reportUploadProgress(cache, {
      cacheKey,
      sourceFolder: cache?.displayName || cache?.sourceFolder || "所选文件",
      state: "preparing",
      message: "正在准备上传并核对断点",
      currentFile: "",
      fileIndex: 0,
    });

    const updateCache = (path: string, changes: Record<string, unknown>) => {
      if (!cache) return;
      cache = updateUploadCacheFile(cache, path, changes);
      saveUploadCache(window.localStorage, cache);
      refreshPendingUploads();
    };

    try {
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index]!;
        const base = cacheContext?.destinationPath ?? currentPath();
        let cachedFile = cache?.files[entry.path];
        if (cachedFile?.resolution === "skip") {
          skipped += 1;
          setUploadStatus(
            `按上次选择跳过 ${index + 1}/${entries.length}：${entry.path}`,
          );
          continue;
        }
        let relativePath =
          cachedFile?.resolvedPath ||
          [base, entry.path].filter(Boolean).join("/");
        let deleteAssetId = cachedFile?.deleteAssetId || null;
        let allowReplace = cachedFile?.resolution === "replace";
        setUploadStatus(
          `正在校验并上传 ${index + 1}/${entries.length}：${entry.path}`,
        );
        reportUploadProgress(cache, {
          cacheKey,
          sourceFolder: cache?.displayName || cache?.sourceFolder || "所选文件",
          state: "preparing",
          message: "正在计算 SHA-256 并检查重复文件",
          currentFile: entry.path,
          fileIndex: index + 1,
        });
        const hash = cachedFile?.checksum || (await checksum(entry.file));
        if (abortController.signal.aborted)
          throw new DOMException("上传已暂停", "AbortError");
        const mimeType = entry.file.type || "application/octet-stream";
        const capturedAt = new Date(entry.file.lastModified).toISOString();
        const dimensions = await imageDimensions(entry.file);
        let payload = {
          relativePath,
          checksum: hash,
          mimeType,
          size: String(entry.file.size),
          ...dimensions,
        };
        updateCache(entry.path, { checksum: hash });
        cachedFile = cache?.files[entry.path];
        let init;

        if (cachedFile?.verified) {
          setUploadStatus(
            `正在确认上次进度 ${index + 1}/${entries.length}：${entry.path}`,
          );
          init = await momentFetch("/admin/upload-url", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          if (init.exists && init.verified) {
            await deleteReplacedAsset(deleteAssetId);
            updateCache(entry.path, { deleteAssetId: null });
            resumed += 1;
            if (localPaths?.[index])
              verified.push({
                path: localPaths[index]!,
                name: entry.file.name,
              });
            continue;
          }
          updateCache(entry.path, { verified: false });
        }

        if (!cachedFile?.resolution) {
          const conflict = (await momentFetch("/admin/upload-check", {
            method: "POST",
            body: JSON.stringify({ ...payload, capturedAt }),
          })) as UploadCheckResult;
          if (abortController.signal.aborted)
            throw new DOMException("上传已暂停", "AbortError");
          if (conflict.duplicate) {
            const primary = conflict.pathMatch || conflict.candidates[0]!;
            const resolution: UploadConflictResolution =
              cacheContext?.folderAction === "replace" && conflict.pathMatch
                ? {
                    action: "replace" as const,
                    applyToAll: false,
                    existingId: conflict.pathMatch.id,
                  }
                : batchAction
                  ? {
                      action: batchAction,
                      applyToAll: true,
                      existingId: primary.id,
                    }
                  : await chooseUploadConflict({
                      kind: "file",
                      incoming: {
                        file: entry.file,
                        path: relativePath,
                        checksum: hash,
                        ...dimensions,
                      },
                      candidates: conflict.candidates,
                      initialCandidateId: primary.id,
                    });
            if (resolution.action === "cancel") {
              const error = new Error("上传已暂停，当前进度已保留");
              error.name = "AbortError";
              throw error;
            }
            if (resolution.applyToAll) batchAction = resolution.action;
            if (resolution.action === "skip") {
              if (cachedFile?.objectKey) {
                if (cachedFile.uploadId && !cachedFile.multipartCompleted) {
                  await momentFetch("/admin/multipart/abort", {
                    method: "POST",
                    body: JSON.stringify({
                      objectKey: cachedFile.objectKey,
                      uploadId: cachedFile.uploadId,
                    }),
                  });
                } else {
                  await momentFetch("/admin/upload-cancel", {
                    method: "POST",
                    body: JSON.stringify({ objectKey: cachedFile.objectKey }),
                  });
                }
              }
              updateCache(entry.path, {
                resolution: "skip",
                resolvedPath: relativePath,
                objectKey: null,
                uploadId: null,
                completedParts: [],
                multipartCompleted: false,
              });
              skipped += 1;
              continue;
            }
            if (resolution.action === "keep")
              relativePath = conflict.suggestedPath;
            const selected =
              conflict.candidates.find(
                (candidate) => candidate.id === resolution.existingId,
              ) || primary;
            deleteAssetId =
              resolution.action === "replace" &&
              selected.relativePath.toLocaleLowerCase() !==
                relativePath.toLocaleLowerCase()
                ? selected.id
                : null;
            allowReplace = resolution.action === "replace";
            updateCache(entry.path, {
              resolution: resolution.action,
              resolvedPath: relativePath,
              deleteAssetId,
            });
            payload = { ...payload, relativePath };
          }
        }

        cachedFile = cache?.files[entry.path];
        if (
          cachedFile?.objectKey &&
          cachedFile.uploadId &&
          !cachedFile.multipartCompleted
        ) {
          setUploadStatus(
            `正在核对云端分片 ${index + 1}/${entries.length}：${entry.path}`,
          );
          try {
            const remote = await momentFetch("/admin/multipart/parts", {
              method: "POST",
              body: JSON.stringify({
                objectKey: cachedFile.objectKey,
                uploadId: cachedFile.uploadId,
              }),
            });
            if (remote.completed) {
              updateCache(entry.path, {
                multipartCompleted: true,
                completedParts: [],
              });
            } else {
              updateCache(entry.path, {
                completedParts: remote.parts.map(
                  (part: { partNumber: number }) => part.partNumber,
                ),
              });
            }
            resumed += 1;
          } catch {
            updateCache(entry.path, {
              objectKey: null,
              uploadId: null,
              partSize: null,
              completedParts: [],
              multipartCompleted: false,
            });
          }
          cachedFile = cache?.files[entry.path];
        }

        if (
          cachedFile?.objectKey &&
          (!cachedFile.uploadId || cachedFile.multipartCompleted)
        ) {
          setUploadStatus(
            `正在恢复并确认 ${index + 1}/${entries.length}：${entry.path}`,
          );
          reportUploadProgress(cache, {
            cacheKey,
            sourceFolder:
              cache?.displayName || cache?.sourceFolder || "所选文件",
            state: "verifying",
            message: "上传完成，正在进行云端 SHA-256 校验",
            currentFile: entry.path,
            fileIndex: index + 1,
          });
          try {
            const completed = await momentFetch("/admin/complete", {
              method: "POST",
              body: JSON.stringify({
                ...payload,
                objectKey: cachedFile.objectKey,
                capturedAt,
                conflictAction: allowReplace ? "replace" : "reject",
              }),
            });
            if (!completed.verified)
              throw new Error(`${entry.path} 未通过完整性校验`);
            await deleteReplacedAsset(deleteAssetId);
            updateCache(entry.path, { verified: true, deleteAssetId: null });
            if (localPaths?.[index])
              verified.push({
                path: localPaths[index]!,
                name: entry.file.name,
              });
            continue;
          } catch (error) {
            if (requestStatus(error) === 409) {
              updateCache(entry.path, {
                objectKey: null,
                uploadId: null,
                partSize: null,
                completedParts: [],
                multipartCompleted: false,
                verified: false,
                resolution: null,
                resolvedPath: null,
                deleteAssetId: null,
              });
              throw error;
            }
            if (requestStatus(error) !== 404) throw error;
            updateCache(entry.path, {
              objectKey: null,
              uploadId: null,
              partSize: null,
              completedParts: [],
              multipartCompleted: false,
              verified: false,
            });
          }
        }

        cachedFile = cache?.files[entry.path];
        if (cache && entry.file.size > 0) {
          if (!cachedFile?.uploadId || !cachedFile.objectKey) {
            init = await momentFetch("/admin/multipart/start", {
              method: "POST",
              body: JSON.stringify(payload),
            });
            if (init.exists && init.verified) {
              await deleteReplacedAsset(deleteAssetId);
              updateCache(entry.path, { verified: true, deleteAssetId: null });
              if (localPaths?.[index])
                verified.push({
                  path: localPaths[index]!,
                  name: entry.file.name,
                });
              continue;
            }
            updateCache(entry.path, {
              objectKey: init.objectKey,
              uploadId: init.uploadId,
              partSize: init.partSize,
              completedParts: [],
              multipartCompleted: false,
            });
          }
          cachedFile = cache?.files[entry.path];
          const objectKey = cachedFile.objectKey as string;
          const uploadId = cachedFile.uploadId as string;
          const partSize = Number(cachedFile.partSize);
          const completedParts = new Set<number>(
            (cachedFile.completedParts || []).map(Number),
          );
          const partCount = Math.ceil(entry.file.size / partSize);
          for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
            if (completedParts.has(partNumber)) continue;
            if (abortController.signal.aborted)
              throw new DOMException("上传已暂停", "AbortError");
            const start = (partNumber - 1) * partSize;
            const blob = entry.file.slice(
              start,
              Math.min(start + partSize, entry.file.size),
            );
            setUploadStatus(
              `上传 ${index + 1}/${entries.length} · 分片 ${partNumber}/${partCount}：${entry.path}`,
            );
            reportUploadProgress(cache, {
              cacheKey,
              sourceFolder:
                cacheContext?.displayName ||
                cacheContext?.sourceFolder ||
                "所选文件",
              state: navigator.onLine ? "uploading" : "offline",
              message: `正在上传分片 ${partNumber}/${partCount}`,
              currentFile: entry.path,
              fileIndex: index + 1,
            });
            await uploadPartWithRetry(
              objectKey,
              uploadId,
              partNumber,
              blob,
              abortController.signal,
              (bytes, speed) =>
                reportUploadProgress(
                  cache,
                  {
                    cacheKey,
                    sourceFolder:
                      cacheContext?.displayName ||
                      cacheContext?.sourceFolder ||
                      "所选文件",
                    state: navigator.onLine ? "uploading" : "offline",
                    message: `正在上传分片 ${partNumber}/${partCount}`,
                    currentFile: entry.path,
                    fileIndex: index + 1,
                    speed,
                  },
                  bytes,
                ),
            );
            completedParts.add(partNumber);
            updateCache(entry.path, {
              completedParts: [...completedParts].sort((a, b) => a - b),
            });
          }
          await momentFetch("/admin/multipart/complete", {
            method: "POST",
            body: JSON.stringify({
              objectKey,
              uploadId,
              size: String(entry.file.size),
              partSize,
            }),
          });
          updateCache(entry.path, { multipartCompleted: true });
          if (abortController.signal.aborted)
            throw new DOMException("上传已暂停", "AbortError");
          reportUploadProgress(cache, {
            cacheKey,
            sourceFolder:
              cacheContext?.displayName ||
              cacheContext?.sourceFolder ||
              "所选文件",
            state: "verifying",
            message: "分片已合并，正在进行云端 SHA-256 校验",
            currentFile: entry.path,
            fileIndex: index + 1,
          });
          let completed;
          try {
            completed = await momentFetch("/admin/complete", {
              method: "POST",
              body: JSON.stringify({
                ...payload,
                objectKey,
                capturedAt,
                conflictAction: allowReplace ? "replace" : "reject",
              }),
            });
          } catch (error) {
            if (requestStatus(error) === 409) {
              updateCache(entry.path, {
                objectKey: null,
                uploadId: null,
                partSize: null,
                completedParts: [],
                multipartCompleted: false,
                verified: false,
                resolution: null,
                resolvedPath: null,
                deleteAssetId: null,
              });
            }
            throw error;
          }
          if (!completed.verified)
            throw new Error(`${entry.path} 未通过完整性校验`);
        } else {
          init ??= await momentFetch("/admin/upload-url", {
            method: "POST",
            body: JSON.stringify(payload),
          });
          if (init.exists && !init.verified)
            throw new Error(`${entry.path} 未通过完整性校验`);
          if (!init.exists) {
            await putPart(
              init.uploadUrl,
              entry.file,
              abortController.signal,
              (bytes) => {
                setUploadProgress((value) =>
                  value
                    ? {
                        ...value,
                        state: "uploading",
                        currentPartBytes: bytes,
                        uploadedBytes: bytes,
                        totalBytes: entry.file.size,
                      }
                    : value,
                );
              },
              init.requiredHeaders,
            );
            const completed = await momentFetch("/admin/complete", {
              method: "POST",
              body: JSON.stringify({
                ...payload,
                objectKey: init.objectKey,
                capturedAt,
                conflictAction: allowReplace ? "replace" : "reject",
              }),
            });
            if (!completed.verified)
              throw new Error(`${entry.path} 未通过完整性校验`);
          }
        }
        await deleteReplacedAsset(deleteAssetId);
        updateCache(entry.path, { verified: true, deleteAssetId: null });
        if (localPaths?.[index])
          verified.push({ path: localPaths[index]!, name: entry.file.name });
      }
      if (cache && uploadCacheComplete(cache)) {
        const completedCacheKey = uploadCacheKey(
          cache.destinationPath,
          cache.sourceFolder,
        );
        removeUploadCache(
          window.localStorage,
          cache.destinationPath,
          cache.sourceFolder,
        );
        await removeUploadHandle(completedCacheKey).catch(() => undefined);
        refreshPendingUploads();
      }
      setVerifiedLocal(verified);
      setUploadStatus("");
      setUploadProgress((value) =>
        value
          ? {
              ...value,
              state: "completed",
              message: "全部文件已上传并通过完整性校验",
              uploadedBytes: value.totalBytes,
              currentPartBytes: 0,
            }
          : value,
      );
      activeUpload.current = null;
      toast.success(
        `已处理 ${entries.length} 个文件：确认 ${entries.length - skipped} 个，跳过 ${skipped} 个${resumed ? `，其中续传 ${resumed} 个` : ""}`,
      );
      await loadBrowser();
    } catch (error) {
      refreshPendingUploads();
      if ((error as Error).name === "AbortError") {
        setUploadProgress((value) =>
          value
            ? {
                ...value,
                state: "paused",
                message: "上传已暂停，已完成分片不会丢失",
              }
            : value,
        );
        toast.info((error as Error).message);
      } else {
        setUploadProgress((value) =>
          value
            ? { ...value, state: "error", message: (error as Error).message }
            : value,
        );
        toast.error((error as Error).message);
      }
    } finally {
      if (uploadAbort.current === abortController) uploadAbort.current = null;
      setBusy(false);
      setUploadStatus("");
    }
  }

  async function uploadDirectory(
    entries: { file: File; path: string }[],
    sourceFolder: string,
    localPaths?: string[],
    sourceHandle?: DirectoryHandle,
  ) {
    if (entries.length === 0) return;
    const destinationPath = currentPath();
    const previous = loadUploadCache(
      window.localStorage,
      destinationPath,
      sourceFolder,
    );
    let targetFolder = previous?.targetFolder || sourceFolder;
    let folderAction = previous?.folderAction || null;
    if (!previous?.targetFolder) {
      const folderCheck = (await momentFetch("/admin/folder-check", {
        method: "POST",
        body: JSON.stringify({
          name: sourceFolder,
          parentId: browser.folderId,
        }),
      })) as FolderCheckResult;
      if (folderCheck.duplicate && folderCheck.existing) {
        const existing = folderCheck.existing;
        const resolution = await chooseUploadConflict({
          kind: "folder",
          incomingName: sourceFolder,
          incomingCount: entries.length,
          existing: {
            id: existing.id,
            name: existing.name,
            count:
              (existing._count?.assets || 0) + (existing._count?.children || 0),
          },
        });
        if (resolution.action === "skip") {
          toast.info(`已跳过文件夹“${sourceFolder}”`);
          return;
        }
        if (resolution.action === "cancel") return;
        folderAction = resolution.action;
        if (resolution.action === "keep") {
          targetFolder = folderCheck.suggestedName;
        }
      }
    }
    let hasPersistentHandle = false;
    if (sourceHandle) {
      const key = uploadCacheKey(destinationPath, sourceFolder);
      hasPersistentHandle = await saveUploadHandle(key, sourceHandle)
        .then(() => true)
        .catch(() => false);
    }
    await uploadFiles(
      entries.map((entry) => ({
        ...entry,
        path: `${targetFolder}/${entry.path}`,
      })),
      localPaths,
      {
        destinationPath,
        destinationFolderId: browser.folderId,
        sourceFolder,
        targetFolder,
        folderAction,
        hasPersistentHandle,
        inputKind: "folder",
        displayName: sourceFolder,
      },
    );
  }

  async function uploadSelectedFiles(
    files: File[],
    handles?: FileHandleLike[],
  ) {
    if (!files.length) return;
    const destinationPath = currentPath();
    const sourceFolder = fileSelectionId(files);
    const key = uploadCacheKey(destinationPath, sourceFolder);
    const hasPersistentHandle = handles
      ? await saveUploadHandle(key, handles)
          .then(() => true)
          .catch(() => false)
      : false;
    await uploadFiles(
      files.map((file) => ({ file, path: file.name })),
      undefined,
      {
        destinationPath,
        destinationFolderId: browser.folderId,
        sourceFolder,
        targetFolder: "",
        hasPersistentHandle,
        inputKind: "files",
        displayName:
          files.length === 1 ? files[0]!.name : `${files.length} 个文件`,
      },
    );
  }

  async function openFiles() {
    const picker = (
      window as unknown as {
        showOpenFilePicker?: (options: {
          multiple: boolean;
        }) => Promise<FileHandleLike[]>;
      }
    ).showOpenFilePicker;
    if (!picker) {
      fileInput.current?.click();
      return;
    }
    try {
      const handles = await picker({ multiple: true });
      const files = await Promise.all(
        handles.map((handle) => handle.getFile()),
      );
      await uploadSelectedFiles(files, handles);
    } catch (error) {
      if ((error as DOMException).name !== "AbortError")
        toast.error((error as Error).message);
    }
  }

  async function openDirectory() {
    const picker = (
      window as unknown as {
        showDirectoryPicker?: (options: {
          mode: "readwrite";
        }) => Promise<DirectoryHandle>;
      }
    ).showDirectoryPicker;
    if (!picker) {
      folderInput.current?.click();
      return;
    }
    try {
      const handle = await picker({ mode: "readwrite" });
      const permission = await handle.requestPermission({ mode: "readwrite" });
      const entries = await collectDirectory(handle);
      setDirectoryHandle(permission === "granted" ? handle : null);
      await uploadDirectory(
        entries,
        handle.name,
        entries.map((item) => item.path),
        handle,
      );
    } catch (error) {
      if ((error as DOMException).name !== "AbortError")
        toast.error((error as Error).message);
    }
  }

  async function deleteVerifiedLocalFiles() {
    if (!directoryHandle || verifiedLocal.length === 0) return;
    if (
      !confirm(
        `仅删除已通过云端 SHA-256 校验的 ${verifiedLocal.length} 个本地文件？此操作无法由网站撤销。`,
      )
    )
      return;
    let deleted = 0;
    for (const item of verifiedLocal) {
      try {
        const parts = item.path.split("/").filter(Boolean);
        const fileName = parts.pop()!;
        let parent = directoryHandle;
        for (const part of parts)
          parent = await parent.getDirectoryHandle(part);
        await parent.removeEntry(fileName);
        deleted += 1;
      } catch {
        // Continue so one changed local path cannot hide successful deletions.
      }
    }
    setVerifiedLocal([]);
    toast.success(`已删除 ${deleted} 个本地文件；云端副本保持不变`);
  }

  async function createFolder() {
    const name = prompt("新文件夹名称");
    if (!name) return;
    try {
      await momentFetch("/admin/categories", {
        method: "POST",
        body: JSON.stringify({ name, parentId: browser.folderId }),
      });
      toast.success("文件夹已创建");
      await loadBrowser();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function createTextFile() {
    const name = prompt("文件名（例如 notes.txt）");
    if (!name) return;
    const content = prompt("文件内容");
    if (content === null) return;
    await uploadFiles([
      {
        file: new globalThis.File([content], name, { type: "text/plain" }),
        path: name,
      },
    ]);
  }

  function beginRename(kind: "folder" | "asset", item: FolderItem | Asset) {
    setRenameTarget({
      kind,
      id: item.id,
      value: "name" in item ? item.name : item.originalName,
    });
  }

  async function finishRename() {
    if (!renameTarget) return;
    const item =
      renameTarget.kind === "folder"
        ? browser.folders.find((folder) => folder.id === renameTarget.id)
        : browser.assets.find((asset) => asset.id === renameTarget.id);
    const previous = item && ("name" in item ? item.name : item.originalName);
    const value = renameTarget.value.trim();
    setRenameTarget(null);
    if (!value || value === previous) return;
    try {
      const path =
        renameTarget.kind === "folder"
          ? `/admin/categories/${renameTarget.id}`
          : `/admin/assets/${renameTarget.id}`;
      const body =
        renameTarget.kind === "folder"
          ? { name: value }
          : { originalName: value };
      await momentFetch(path, { method: "PATCH", body: JSON.stringify(body) });
      toast.success("已重命名");
      await loadBrowser();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function openMove(target: MoveTarget) {
    try {
      setAllFolders(await momentFetch("/admin/categories"));
      setMoveTarget(target);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function moveItem(folderId: string | null) {
    if (!moveTarget) return;
    try {
      const path =
        moveTarget.kind === "folder"
          ? `/admin/categories/${moveTarget.item.id}`
          : `/admin/assets/${moveTarget.item.id}`;
      const body =
        moveTarget.kind === "folder"
          ? { parentId: folderId }
          : { categoryId: folderId };
      await momentFetch(path, { method: "PATCH", body: JSON.stringify(body) });
      setMoveTarget(null);
      toast.success(
        `已移动${moveTarget.kind === "folder" ? "文件夹" : "文件"}`,
      );
      await loadBrowser();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function reindexXmp() {
    setBusy(true);
    try {
      const result = await momentFetch("/admin/reindex-xmp", {
        method: "POST",
        body: "{}",
      });
      toast.success(
        `已索引 ${result.indexed}/${result.total} 个 XMP 文件${result.failed ? `，${result.failed} 个失败` : ""}`,
      );
      await loadBrowser();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function trashItem(kind: "folder" | "asset", item: FolderItem | Asset) {
    const path =
      kind === "folder"
        ? `/admin/categories/${item.id}`
        : `/admin/assets/${item.id}`;
    await momentFetch(path, { method: "DELETE" });
    setUndo({
      label: `${"name" in item ? item.name : item.originalName} 已移入回收站`,
      run: async () => {
        await momentFetch(`${path}/restore`, { method: "POST", body: "{}" });
        await loadBrowser();
      },
    });
    await loadBrowser();
  }

  async function restoreOrDelete(
    kind: "folder" | "asset",
    item: FolderItem | Asset,
    permanent: boolean,
  ) {
    const base =
      kind === "folder"
        ? `/admin/categories/${item.id}`
        : `/admin/assets/${item.id}`;
    if (
      permanent &&
      !confirm("永久删除会同步删除 COS 存储桶中的对象，无法撤销。继续？")
    )
      return;
    await momentFetch(permanent ? `${base}/permanent` : `${base}/restore`, {
      method: permanent ? "DELETE" : "POST",
      body: permanent ? undefined : "{}",
    });
    toast.success(permanent ? "已从数据库和存储桶永久删除" : "已恢复");
    await loadBrowser();
  }

  async function previewAsset(asset: Asset) {
    const value = await momentFetch(
      `/admin/assets/${asset.id}/url${isImageAsset(asset) ? "?preview=1" : ""}`,
    );
    setPreview({ asset, url: value.url });
  }

  async function navigatePreview(direction: -1 | 1) {
    if (!preview) return;
    const previewable = browser.assets.filter(canPreview);
    const index = previewable.findIndex(
      (asset) => asset.id === preview.asset.id,
    );
    if (index < 0 || previewable.length < 2) return;
    const target =
      previewable[
        (index + direction + previewable.length) % previewable.length
      ];
    if (!target) return;
    await previewAsset(target);
  }

  async function downloadAsset(asset: Pick<Asset, "id"> | AssetSidecar) {
    const value = await momentFetch(`/admin/assets/${asset.id}/url?download=1`);
    window.location.assign(value.url);
  }

  async function downloadFolder(folder: FolderItem) {
    setBusy(true);
    try {
      const [{ default: JSZip }, manifest] = await Promise.all([
        import("jszip"),
        momentFetch(`/admin/categories/${folder.id}/export`),
      ]);
      const zip = new JSZip();
      for (const item of manifest.items) {
        const response = await fetch(
          `/api/moment/assets/${item.id}/content?download=1`,
        );
        if (!response.ok) throw new Error(`下载 ${item.path} 失败`);
        zip.file(item.path, await response.blob());
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${manifest.folderName}.zip`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveAsset(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    await momentFetch(`/admin/assets/${selected.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: selected.title || "",
        description: selected.description || "",
        visibility: selected.visibility,
        tags: selected.tags,
      }),
    });
    setSelected(null);
    toast.success("文件配置已保存");
    await loadBrowser();
  }

  async function createSyncToken(event: FormEvent) {
    event.preventDefault();
    const value = await momentFetch("/admin/sync-tokens", {
      method: "POST",
      body: JSON.stringify({ label: newTokenLabel }),
    });
    setRevealedToken(value.token);
    await loadSecurity();
  }

  if (setupEnabled === null)
    return (
      <div className="grid min-h-screen place-items-center text-gray-500">
        <RefreshCw className="h-6 w-6 animate-spin" />
      </div>
    );

  const facets = browser.searchFacets || {
    cameras: [],
    lenses: [],
    locations: [],
    keywords: [],
  };
  const searchableFacets = [
    { label: "相机", icon: Camera, values: facets.cameras },
    { label: "镜头", icon: SlidersHorizontal, values: facets.lenses },
    { label: "地点", icon: MapPin, values: facets.locations },
    { label: "关键词", icon: Sparkles, values: facets.keywords },
  ].filter((group) => group.values.length > 0);
  const movingFolderId =
    moveTarget?.kind === "folder" ? moveTarget.item.id : "";
  const moveFolders = folderOptions(allFolders).filter(
    (folder) =>
      !movingFolderId || !isFolderInside(folder.id, movingFolderId, allFolders),
  );

  return (
    <main className="min-h-screen bg-[#f4f4f1] px-4 py-7 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <button
          onClick={() => router.push("/")}
          className="mb-7 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          返回仪表板
        </button>
        <div className="mb-8 flex items-center gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-900 text-white">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Moment 私人资料库
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              层级文件夹、完整性校验、预览与可撤销的文件管理
            </p>
          </div>
        </div>

        {!setupEnabled ? (
          <section className="max-w-2xl rounded-2xl border bg-white p-7 shadow-sm">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <ShieldCheck className="h-5 w-5" />
              启用 Moment 双重验证
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              在管理员密码之外，再使用 TOTP 动态验证码保护私人资料库。
            </p>
            {!setup ? (
              <button
                disabled={busy}
                onClick={startSetup}
                className="mt-6 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
              >
                开始配置
              </button>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="flex flex-col gap-5 rounded-xl bg-gray-50 p-4 sm:flex-row sm:items-center">
                  <div className="w-fit rounded-2xl border bg-white p-3">
                    <QRCodeSVG
                      value={setup.otpauthUri}
                      size={180}
                      level="M"
                      title="Moment 双重验证二维码"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold">扫描二维码</p>
                    <p className="mt-1 text-sm leading-6 text-gray-500">
                      使用 Apple Passwords、1Password 或 Authenticator 扫描。
                    </p>
                    <button
                      onClick={() =>
                        void navigator.clipboard.writeText(setup.secret)
                      }
                      className="mt-3 flex items-center gap-2 rounded-lg border bg-white px-3 py-2 font-mono text-xs"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {setup.secret}
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    value={setupCode}
                    onChange={(event) =>
                      setSetupCode(
                        event.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="输入 6 位验证码"
                    className="h-11 flex-1 rounded-xl border px-3"
                  />
                  <button
                    disabled={busy}
                    onClick={confirmSetup}
                    className="rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white"
                  >
                    确认启用
                  </button>
                </div>
              </div>
            )}
          </section>
        ) : recoveryCodes.length ? (
          <section className="max-w-2xl rounded-2xl border border-emerald-200 bg-white p-7 shadow-sm">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <Check className="h-5 w-5 text-emerald-600" />
              保存恢复码
            </h2>
            <div className="my-5 grid grid-cols-2 gap-2 rounded-xl bg-gray-50 p-4 font-mono text-sm">
              {recoveryCodes.map((code) => (
                <span key={code}>{code}</span>
              ))}
            </div>
            <button
              onClick={() =>
                void navigator.clipboard.writeText(recoveryCodes.join("\n"))
              }
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white"
            >
              复制全部
            </button>
            <button
              onClick={() => setRecoveryCodes([])}
              className="ml-2 rounded-xl border px-4 py-2 text-sm"
            >
              我已安全保存
            </button>
          </section>
        ) : !unlocked ? (
          <section className="mx-auto max-w-4xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_-32px_rgba(15,23,42,0.35)]">
            <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
              <div className="relative overflow-hidden bg-slate-950 p-7 text-white sm:p-9">
                <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
                <div className="relative">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/15 bg-white/10">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    受保护的管理区域
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                    Moment 已锁定
                  </h2>
                  <p className="mt-3 max-w-sm text-sm leading-6 text-slate-300">
                    私人文件需要再次确认管理员密码与动态验证码。验证仅用于解锁
                    Moment，不会影响其他后台功能。
                  </p>
                  <div className="mt-8 space-y-3 border-t border-white/10 pt-6 text-sm text-slate-300">
                    <p className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-400" />
                      双重验证保护文件管理操作
                    </p>
                    <p className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-400" />
                      可信凭证仅保存在受保护 Cookie 中
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-7 sm:p-9">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                  <KeyRound className="h-4 w-4" />
                  身份验证
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                  继续管理 Moment
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  请输入管理员凭据，以及验证器中的 6
                  位动态码；也可以使用一条恢复码。
                </p>
                <form onSubmit={unlock} className="mt-7 space-y-5">
                  {loginError && (
                    <div
                      role="alert"
                      aria-live="polite"
                      className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{loginError}</span>
                    </div>
                  )}
                  <div className="space-y-2">
                    <label
                      htmlFor="moment-username"
                      className="text-sm font-medium text-slate-800"
                    >
                      管理员账号
                    </label>
                    <input
                      id="moment-username"
                      required
                      disabled={busy}
                      autoComplete="username"
                      value={login.username}
                      onChange={(event) => {
                        setLoginError("");
                        setLogin({ ...login, username: event.target.value });
                      }}
                      className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:bg-white focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="moment-password"
                      className="text-sm font-medium text-slate-800"
                    >
                      密码
                    </label>
                    <input
                      id="moment-password"
                      required
                      disabled={busy}
                      type="password"
                      autoComplete="current-password"
                      value={login.password}
                      onChange={(event) => {
                        setLoginError("");
                        setLogin({ ...login, password: event.target.value });
                      }}
                      className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-base text-slate-950 outline-none transition focus:border-slate-500 focus:bg-white focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <label
                        htmlFor="moment-code"
                        className="text-sm font-medium text-slate-800"
                      >
                        动态验证码
                      </label>
                      <span className="text-xs text-slate-400">
                        也支持恢复码
                      </span>
                    </div>
                    <input
                      id="moment-code"
                      required
                      disabled={busy}
                      autoCapitalize="characters"
                      autoComplete="one-time-code"
                      spellCheck={false}
                      placeholder="6 位验证码或恢复码"
                      value={login.code}
                      onChange={(event) => {
                        setLoginError("");
                        setLogin({
                          ...login,
                          code: event.target.value
                            .toUpperCase()
                            .replace(/\s/g, "")
                            .slice(0, 40),
                        });
                      }}
                      className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 font-mono text-base tracking-wide text-slate-950 outline-none transition placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-400 focus:border-slate-500 focus:bg-white focus:ring-4 focus:ring-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>
                  <label
                    htmlFor="moment-remember"
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3.5 transition hover:bg-slate-50"
                  >
                    <input
                      id="moment-remember"
                      type="checkbox"
                      checked={rememberDevice}
                      disabled={busy}
                      onChange={(event) =>
                        setRememberDevice(event.target.checked)
                      }
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-slate-900"
                    />
                    <span>
                      <span className="block text-sm font-medium text-slate-800">
                        信任这台浏览器 7 天
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                        仅在你的私人设备上开启；IP
                        变化只记录审计，不会要求重新验证。
                      </span>
                    </span>
                  </label>
                  <button
                    disabled={busy}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy && <RefreshCw className="h-4 w-4 animate-spin" />}
                    {busy ? "正在验证…" : "验证并进入"}
                  </button>
                </form>
              </div>
            </div>
          </section>
        ) : (
          <div className="space-y-7">
            <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void createFolder()}
                    className="flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white"
                  >
                    <FolderPlus className="h-4 w-4" />
                    新建文件夹
                  </button>
                  <button
                    onClick={() => void openFiles()}
                    className="flex h-10 items-center gap-2 rounded-xl border px-4 text-sm"
                  >
                    <Upload className="h-4 w-4" />
                    上传文件
                  </button>
                  <button
                    onClick={() => void openDirectory()}
                    className="flex h-10 items-center gap-2 rounded-xl border px-4 text-sm"
                  >
                    <FolderInput className="h-4 w-4" />
                    从电脑上传文件夹
                  </button>
                  <button
                    onClick={() => void createTextFile()}
                    className="flex h-10 items-center gap-2 rounded-xl border px-4 text-sm"
                  >
                    <FilePlus2 className="h-4 w-4" />
                    新建文件
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void reindexXmp()}
                    className="flex h-10 items-center gap-2 rounded-xl border px-4 text-sm disabled:opacity-50"
                    title="读取已有 XMP sidecar 并关联同名照片"
                  >
                    <Sparkles className="h-4 w-4 text-violet-600" />
                    索引 XMP
                  </button>
                  {verifiedLocal.length > 0 && directoryHandle && (
                    <button
                      onClick={() => void deleteVerifiedLocalFiles()}
                      className="flex h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                      删除本地已验证文件 ({verifiedLocal.length})
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      onFocus={() => setSearchFocused(true)}
                      onBlur={() =>
                        window.setTimeout(() => setSearchFocused(false), 150)
                      }
                      placeholder="搜索照片、相机、镜头、地点…"
                      className="h-10 w-full rounded-xl border pl-9 pr-3 text-sm lg:w-80"
                    />
                    {searchFocused && searchableFacets.length > 0 && !trash && (
                      <div className="absolute right-0 top-12 z-40 w-[min(32rem,90vw)] rounded-2xl border bg-white p-4 shadow-2xl">
                        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-gray-500">
                          <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                          按照片 metadata 搜索
                        </div>
                        <div className="space-y-3">
                          {searchableFacets.map((group) => (
                            <div
                              key={group.label}
                              className="grid grid-cols-[72px_1fr] gap-2"
                            >
                              <span className="flex items-center gap-1.5 pt-1 text-xs text-gray-400">
                                <group.icon className="h-3.5 w-3.5" />
                                {group.label}
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {group.values.slice(0, 8).map((value) => (
                                  <button
                                    key={value}
                                    onMouseDown={(event) =>
                                      event.preventDefault()
                                    }
                                    onClick={() => {
                                      setSearch(value);
                                      setSearchFocused(false);
                                    }}
                                    className="max-w-48 truncate rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700"
                                  >
                                    {value}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="mt-3 border-t pt-3 text-[11px] text-gray-400">
                          也支持标题、描述、路径、标签、作者、ISO、光圈与快门参数
                        </p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setTrash((value) => !value);
                      setSearch("");
                    }}
                    className={`grid h-10 w-10 place-items-center rounded-xl border ${trash ? "bg-red-50 text-red-600" : ""}`}
                    title="回收站"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex min-h-12 items-center gap-1 border-b bg-gray-50/70 px-4 text-sm">
                <button
                  onClick={() => {
                    setTrash(false);
                    void loadBrowser(null, 1);
                  }}
                  className="font-medium text-gray-700"
                >
                  {trash ? "回收站" : "Moment"}
                </button>
                {!trash &&
                  browser.breadcrumbs.map((crumb) => (
                    <span key={crumb.id} className="flex items-center gap-1">
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                      <button
                        onClick={() => void loadBrowser(crumb.id, 1)}
                        className="font-medium text-gray-700 hover:underline"
                      >
                        {crumb.name}
                      </button>
                    </span>
                  ))}
                <span className="ml-auto max-w-[45%] truncate font-mono text-xs text-gray-400">
                  /{trash ? ".trash" : currentPath()}
                </span>
              </div>

              {uploadProgress &&
                (() => {
                  const percentage =
                    uploadProgress.totalBytes > 0
                      ? Math.min(
                          100,
                          Math.round(
                            (uploadProgress.uploadedBytes /
                              uploadProgress.totalBytes) *
                              100,
                          ),
                        )
                      : 0;
                  const remaining = Math.max(
                    0,
                    uploadProgress.totalBytes - uploadProgress.uploadedBytes,
                  );
                  const activeCache = pendingUploads.find(
                    (item) =>
                      uploadCacheKey(
                        item.destinationPath,
                        item.sourceFolder,
                      ) === uploadProgress.cacheKey,
                  );
                  const color =
                    uploadProgress.state === "error"
                      ? "bg-red-500"
                      : uploadProgress.state === "completed"
                        ? "bg-emerald-500"
                        : uploadProgress.state === "offline" ||
                            uploadProgress.state === "paused"
                          ? "bg-amber-500"
                          : "bg-blue-600";
                  return (
                    <div className="border-b bg-white px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-900">
                              {uploadProgress.sourceFolder}
                            </p>
                            {uploadProgress.state === "offline" && (
                              <WifiOff className="h-4 w-4 text-amber-600" />
                            )}
                          </div>
                          <p className="mt-1 truncate text-xs text-gray-500">
                            {uploadProgress.currentFile ||
                              uploadProgress.message}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {(uploadProgress.state === "uploading" ||
                            uploadProgress.state === "preparing" ||
                            uploadProgress.state === "offline") && (
                            <button
                              onClick={pauseUpload}
                              className="flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs"
                            >
                              <Pause className="h-3.5 w-3.5" />
                              暂停
                            </button>
                          )}
                          {(uploadProgress.state === "paused" ||
                            uploadProgress.state === "error") && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                activeUpload.current
                                  ? void resumeActiveUpload()
                                  : activeCache
                                    ? void resumeCachedUpload(activeCache)
                                    : undefined
                              }
                              className="flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white disabled:opacity-40"
                            >
                              <Play className="h-3.5 w-3.5" />
                              继续
                            </button>
                          )}
                          {activeCache &&
                            uploadProgress.state !== "completed" && (
                              <button
                                onClick={() =>
                                  void cancelCachedUpload(activeCache)
                                }
                                className="h-8 rounded-lg border border-red-200 px-3 text-xs text-red-600"
                              >
                                取消任务
                              </button>
                            )}
                          {uploadProgress.state === "completed" && (
                            <button
                              onClick={() => setUploadProgress(null)}
                              className="h-8 rounded-lg border px-3 text-xs"
                            >
                              关闭
                            </button>
                          )}
                        </div>
                      </div>
                      <div
                        role="progressbar"
                        aria-label={`${uploadProgress.sourceFolder} 上传进度`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percentage}
                        className="mt-3 h-2.5 overflow-hidden rounded-full bg-gray-100"
                      >
                        <div
                          className={`h-full rounded-full transition-[width] duration-300 ${color}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap justify-between gap-x-5 gap-y-1 text-xs text-gray-500">
                        <span>
                          {percentage}% ·{" "}
                          {formatBytes(uploadProgress.uploadedBytes)} /{" "}
                          {formatBytes(uploadProgress.totalBytes)}
                        </span>
                        <span>
                          文件{" "}
                          {Math.min(
                            uploadProgress.fileIndex,
                            uploadProgress.totalFiles,
                          )}{" "}
                          / {uploadProgress.totalFiles}
                        </span>
                        <span>
                          {uploadProgress.message}
                          {uploadProgress.state === "uploading"
                            ? ` · ${formatRate(uploadProgress.speed)} ${formatEta(remaining, uploadProgress.speed)}`
                            : ""}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              {pendingUploads
                .filter(
                  (item) =>
                    uploadCacheKey(item.destinationPath, item.sourceFolder) !==
                    uploadProgress?.cacheKey,
                )
                .map((item) => {
                  const progress = uploadCacheProgress(item);
                  const percentage =
                    progress.totalBytes > 0
                      ? Math.round(
                          (progress.uploadedBytes / progress.totalBytes) * 100,
                        )
                      : 0;
                  return (
                    <div
                      key={uploadCacheKey(
                        item.destinationPath,
                        item.sourceFolder,
                      )}
                      className="border-b bg-amber-50 px-5 py-4 text-sm text-amber-950"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">
                            待续传：{item.displayName || item.sourceFolder}
                          </p>
                          <p className="mt-1 text-xs text-amber-700">
                            已保存 {percentage}% · {progress.completedFiles}/
                            {progress.totalFiles} 个文件完成
                            {item.hasPersistentHandle
                              ? " · 可直接继续"
                              : ` · 需重新选择同一${item.inputKind === "files" ? "批文件" : "文件夹"}`}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            disabled={busy}
                            onClick={() => void resumeCachedUpload(item)}
                            className="flex h-8 items-center gap-1.5 rounded-lg bg-amber-900 px-3 text-xs font-medium text-white disabled:opacity-40"
                          >
                            <Play className="h-3.5 w-3.5" />
                            继续上传
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => void cancelCachedUpload(item)}
                            className="h-8 rounded-lg border border-amber-300 px-3 text-xs disabled:opacity-40"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                      <div
                        role="progressbar"
                        aria-label={`${item.displayName || item.sourceFolder} 待续传进度`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percentage}
                        className="mt-3 h-1.5 overflow-hidden rounded-full bg-amber-100"
                      >
                        <div
                          className="h-full rounded-full bg-amber-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              {!uploadProgress && pendingUploadCount === 0 && uploadStatus && (
                <div className="border-b bg-blue-50 px-4 py-3 text-sm text-blue-700">
                  {uploadStatus}
                </div>
              )}
              {undo && (
                <div className="flex items-center justify-between border-b bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <span>{undo.label}</span>
                  <button
                    onClick={async () => {
                      await undo.run();
                      setUndo(null);
                    }}
                    className="flex items-center gap-1 font-semibold"
                  >
                    <RotateCcw className="h-4 w-4" />
                    撤销
                  </button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 text-xs text-gray-500">
                <span>
                  {browser.total
                    ? `${(browser.page - 1) * browser.limit + 1}–${Math.min(browser.page * browser.limit, browser.total)} / ${browser.total} 个文件`
                    : "0 个文件"}
                </span>
                <button
                  onClick={() => setIncludeSidecars((value) => !value)}
                  className={`ml-auto rounded-lg border px-3 py-1.5 ${includeSidecars ? "border-violet-300 bg-violet-50 text-violet-700" : "bg-white"}`}
                  title="默认将同目录同名的照片和 metadata sidecar 合并；开启后显示原始 sidecar 文件"
                >
                  {includeSidecars
                    ? "正在显示原始 metadata"
                    : "照片 + metadata 已合并"}
                </button>
                <div className="flex rounded-lg border bg-white p-0.5">
                  <button
                    onClick={() => setViewMode("list")}
                    className={`grid h-7 w-8 place-items-center rounded-md ${viewMode === "list" ? "bg-gray-100 text-gray-900" : "text-gray-400"}`}
                    title="列表视图"
                  >
                    <List className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`grid h-7 w-8 place-items-center rounded-md ${viewMode === "grid" ? "bg-gray-100 text-gray-900" : "text-gray-400"}`}
                    title="缩略图视图"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {viewMode === "list" ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="border-b text-xs text-gray-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">名称</th>
                        <th className="px-4 py-3 font-medium">位置 / 类型</th>
                        <th className="px-4 py-3 font-medium">大小</th>
                        <th className="px-4 py-3 font-medium">可见性</th>
                        <th className="w-16 px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {browser.folders.map((folder) => (
                        <tr
                          key={folder.id}
                          className="border-b last:border-0 hover:bg-gray-50"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3 font-medium">
                              <Folder className="h-5 w-5 shrink-0 fill-amber-100 text-amber-600" />
                              {renameTarget?.kind === "folder" &&
                              renameTarget.id === folder.id ? (
                                <input
                                  autoFocus
                                  value={renameTarget.value}
                                  onChange={(event) =>
                                    setRenameTarget({
                                      ...renameTarget,
                                      value: event.target.value,
                                    })
                                  }
                                  onBlur={() => void finishRename()}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter")
                                      event.currentTarget.blur();
                                    if (event.key === "Escape")
                                      setRenameTarget(null);
                                  }}
                                  className="h-8 min-w-52 rounded-lg border border-blue-400 bg-white px-2 outline-none ring-2 ring-blue-100"
                                />
                              ) : (
                                <button
                                  disabled={trash}
                                  onClick={() =>
                                    !trash && void loadBrowser(folder.id, 1)
                                  }
                                >
                                  {folder.name}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            文件夹 ·{" "}
                            {(folder._count?.assets || 0) +
                              (folder._count?.children || 0)}{" "}
                            项
                          </td>
                          <td className="px-4 py-3 text-gray-400">—</td>
                          <td className="px-4 py-3 text-gray-400">
                            继承文件设置
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-3">
                              {trash ? (
                                <>
                                  <button
                                    onClick={() =>
                                      void restoreOrDelete(
                                        "folder",
                                        folder,
                                        false,
                                      )
                                    }
                                    title="恢复"
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      void restoreOrDelete(
                                        "folder",
                                        folder,
                                        true,
                                      )
                                    }
                                    title="永久删除"
                                    className="text-red-600"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </>
                              ) : (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      className="grid h-8 w-8 place-items-center rounded-lg hover:bg-gray-100"
                                      title="更多操作"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    className="w-44"
                                  >
                                    <DropdownMenuItem
                                      onClick={() =>
                                        void downloadFolder(folder)
                                      }
                                    >
                                      <Download />
                                      下载文件夹
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        beginRename("folder", folder)
                                      }
                                    >
                                      <Pencil />
                                      重命名
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        void openMove({
                                          kind: "folder",
                                          item: folder,
                                        })
                                      }
                                    >
                                      <Move />
                                      移动到…
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      variant="destructive"
                                      onClick={() =>
                                        void trashItem("folder", folder)
                                      }
                                    >
                                      <Trash2 />
                                      移到回收站
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {browser.assets.map((asset) => (
                        <tr
                          key={asset.id}
                          className="border-b last:border-0 hover:bg-gray-50"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3 font-medium">
                              {isImageAsset(asset) ? (
                                <ImageIcon className="h-5 w-5 shrink-0 text-emerald-600" />
                              ) : isVideoAsset(asset) ? (
                                <Video className="h-5 w-5 shrink-0 text-purple-600" />
                              ) : (
                                <File className="h-5 w-5 shrink-0 text-blue-600" />
                              )}
                              {renameTarget?.kind === "asset" &&
                              renameTarget.id === asset.id ? (
                                <input
                                  autoFocus
                                  value={renameTarget.value}
                                  onChange={(event) =>
                                    setRenameTarget({
                                      ...renameTarget,
                                      value: event.target.value,
                                    })
                                  }
                                  onBlur={() => void finishRename()}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter")
                                      event.currentTarget.blur();
                                    if (event.key === "Escape")
                                      setRenameTarget(null);
                                  }}
                                  className="h-8 min-w-52 rounded-lg border border-blue-400 bg-white px-2 outline-none ring-2 ring-blue-100"
                                />
                              ) : (
                                <button
                                  disabled={trash}
                                  onDoubleClick={(event) => {
                                    event.preventDefault();
                                    beginRename("asset", asset);
                                  }}
                                  title="双击重命名"
                                >
                                  {asset.originalName}
                                </button>
                              )}
                            </div>
                            {asset.sidecar && (
                              <p className="ml-8 mt-1 flex items-center gap-1 text-[11px] text-violet-600">
                                <Camera className="h-3 w-3" />+{" "}
                                {(asset.sidecars?.length
                                  ? asset.sidecars
                                  : [asset.sidecar]
                                )
                                  .map((sidecar) => sidecar.originalName)
                                  .join("、")}
                              </p>
                            )}
                          </td>
                          <td className="max-w-md px-4 py-3 text-gray-500">
                            <p className="max-w-md truncate">
                              {asset.relativePath}
                            </p>
                            {asset.xmpMetadata && (
                              <p className="mt-1 flex max-w-md items-center gap-1 truncate text-[11px] text-violet-600">
                                <Camera className="h-3 w-3 shrink-0" />
                                {xmpSummary(asset.xmpMetadata) ||
                                  "已关联 XMP metadata"}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            {formatBytes(asset.size)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-1 text-xs ${asset.visibility === "PUBLIC" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}
                            >
                              {asset.visibility === "PUBLIC"
                                ? "公开展示"
                                : "仅自己"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-3">
                              {trash ? (
                                <>
                                  <button
                                    onClick={() =>
                                      void restoreOrDelete(
                                        "asset",
                                        asset,
                                        false,
                                      )
                                    }
                                    title="恢复"
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      void restoreOrDelete("asset", asset, true)
                                    }
                                    title="永久删除"
                                    className="text-red-600"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => void downloadAsset(asset)}
                                    title="下载"
                                  >
                                    <Download className="h-4 w-4" />
                                  </button>
                                  {canPreview(asset) && (
                                    <button
                                      onClick={() => void previewAsset(asset)}
                                      title="预览"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </button>
                                  )}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        className="grid h-8 w-8 place-items-center rounded-lg hover:bg-gray-100"
                                        title="更多操作"
                                      >
                                        <MoreHorizontal className="h-4 w-4" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                      align="end"
                                      className="w-44"
                                    >
                                      <DropdownMenuItem
                                        onClick={() =>
                                          setSelected({ ...asset })
                                        }
                                      >
                                        <SlidersHorizontal />
                                        展示配置
                                      </DropdownMenuItem>
                                      {(asset.sidecars?.length
                                        ? asset.sidecars
                                        : asset.sidecar
                                          ? [asset.sidecar]
                                          : []
                                      ).map((sidecar) => (
                                        <DropdownMenuItem
                                          key={sidecar.id}
                                          onClick={() =>
                                            void downloadAsset(sidecar)
                                          }
                                        >
                                          <Download />
                                          下载 {sidecar.originalName}
                                        </DropdownMenuItem>
                                      ))}
                                      <DropdownMenuItem
                                        onClick={() =>
                                          beginRename("asset", asset)
                                        }
                                      >
                                        <Pencil />
                                        重命名
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={() =>
                                          void openMove({
                                            kind: "asset",
                                            item: asset,
                                          })
                                        }
                                      >
                                        <Move />
                                        移动到…
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        variant="destructive"
                                        onClick={() =>
                                          void trashItem("asset", asset)
                                        }
                                      >
                                        <Trash2 />
                                        移到回收站
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {browser.folders.map((folder) => (
                    <article
                      key={folder.id}
                      className="rounded-xl border bg-amber-50/50 p-4 hover:border-amber-200 hover:bg-amber-50"
                    >
                      <button
                        disabled={trash}
                        onClick={() => !trash && void loadBrowser(folder.id, 1)}
                        className="flex min-h-28 w-full flex-col items-center justify-center gap-3 text-center"
                      >
                        <Folder className="h-12 w-12 fill-amber-100 text-amber-500" />
                        <span className="line-clamp-2 text-sm font-medium">
                          {folder.name}
                        </span>
                        <span className="text-[11px] text-gray-400">
                          {(folder._count?.assets || 0) +
                            (folder._count?.children || 0)}{" "}
                          项
                        </span>
                      </button>
                    </article>
                  ))}
                  {browser.assets.map((asset) => (
                    <article
                      key={asset.id}
                      className="overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md"
                    >
                      <AssetThumbnail
                        asset={asset}
                        onOpen={() =>
                          canPreview(asset) && void previewAsset(asset)
                        }
                      />
                      <div className="p-3">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p
                              className="truncate text-sm font-medium"
                              title={asset.originalName}
                            >
                              {asset.originalName}
                            </p>
                            <p className="mt-1 truncate text-[11px] text-gray-400">
                              {formatBytes(asset.size)}
                              {asset.sidecar
                                ? ` + XMP ${formatBytes(asset.sidecar.size)}`
                                : ""}
                            </p>
                          </div>
                          {!trash && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="grid h-7 w-7 shrink-0 place-items-center rounded-lg hover:bg-gray-100">
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem
                                  onClick={() => void previewAsset(asset)}
                                  disabled={!canPreview(asset)}
                                >
                                  <Eye />
                                  预览
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => void downloadAsset(asset)}
                                >
                                  <Download />
                                  下载
                                </DropdownMenuItem>
                                {(asset.sidecars?.length
                                  ? asset.sidecars
                                  : asset.sidecar
                                    ? [asset.sidecar]
                                    : []
                                ).map((sidecar) => (
                                  <DropdownMenuItem
                                    key={sidecar.id}
                                    onClick={() => void downloadAsset(sidecar)}
                                  >
                                    <Download />
                                    下载 {sidecar.originalName}
                                  </DropdownMenuItem>
                                ))}
                                <DropdownMenuItem
                                  onClick={() => setSelected({ ...asset })}
                                >
                                  <SlidersHorizontal />
                                  展示配置
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => beginRename("asset", asset)}
                                >
                                  <Pencil />
                                  重命名
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    void openMove({
                                      kind: "asset",
                                      item: asset,
                                    })
                                  }
                                >
                                  <Move />
                                  移动到…
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => void trashItem("asset", asset)}
                                >
                                  <Trash2 />
                                  移到回收站
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                        {asset.xmpMetadata && (
                          <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-violet-600">
                            {xmpSummary(asset.xmpMetadata) ||
                              "已关联 XMP metadata"}
                          </p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {browser.folders.length + browser.assets.length === 0 && (
                <div className="grid min-h-52 place-items-center text-sm text-gray-400">
                  {trash
                    ? "回收站为空"
                    : "当前文件夹为空，可以上传文件或文件夹"}
                </div>
              )}
              {browser.pages > 1 && (
                <div className="flex items-center justify-center gap-3 border-t px-4 py-3 text-sm">
                  <button
                    disabled={browser.page <= 1}
                    onClick={() =>
                      void loadBrowser(undefined, browser.page - 1)
                    }
                    className="flex h-9 items-center gap-1 rounded-lg border px-3 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    上一页
                  </button>
                  <span className="min-w-20 text-center text-xs text-gray-500">
                    {browser.page} / {browser.pages}
                  </span>
                  <button
                    disabled={browser.page >= browser.pages}
                    onClick={() =>
                      void loadBrowser(undefined, browser.page + 1)
                    }
                    className="flex h-9 items-center gap-1 rounded-lg border px-3 disabled:opacity-40"
                  >
                    下一页
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
              <input
                ref={fileInput}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files || []);
                  void uploadSelectedFiles(files);
                  event.target.value = "";
                }}
              />
              <input
                ref={folderInput}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files || []);
                  const firstPath =
                    files[0]?.webkitRelativePath || files[0]?.name || "";
                  const sourceFolder = firstPath.split("/")[0] || "folder";
                  setDirectoryHandle(null);
                  setVerifiedLocal([]);
                  void uploadDirectory(
                    files.map((file) => {
                      const path = file.webkitRelativePath || file.name;
                      return {
                        file,
                        path: path.split("/").slice(1).join("/") || file.name,
                      };
                    }),
                    sourceFolder,
                  );
                  event.target.value = "";
                }}
              />
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
                  <Smartphone className="h-5 w-5" />
                  后台可信设备
                </h2>
                <p className="mb-4 text-sm leading-6 text-gray-500">
                  后台登录可选择 1、7 或 30 天。设备凭证不可被页面脚本读取，IP
                  仅用于审计。
                </p>
                <DeviceList
                  items={adminDevices}
                  onRevoke={async (id) => {
                    await fetchClient(`/auth/trusted-devices/${id}`, {
                      method: "DELETE",
                    });
                    await loadSecurity();
                  }}
                />
              </div>
              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
                  <ShieldCheck className="h-5 w-5" />
                  Moment 可信设备
                </h2>
                <p className="mb-4 text-sm leading-6 text-gray-500">
                  完成 TOTP 后同一浏览器保持 7 天；切换 VPN 不会触发登出。
                </p>
                <DeviceList
                  items={trustedDevices}
                  onRevoke={async (id) => {
                    await momentFetch(`/admin/trusted-devices/${id}`, {
                      method: "DELETE",
                    });
                    await loadSecurity();
                  }}
                />
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="mb-2 text-lg font-semibold">Mac 同步密钥</h2>
              <p className="mb-5 text-sm text-gray-500">
                同步密钥只具备写入权限；同路径文件更新后，旧 COS 对象会被删除。
              </p>
              <form onSubmit={createSyncToken} className="flex max-w-lg gap-2">
                <input
                  required
                  value={newTokenLabel}
                  onChange={(event) => setNewTokenLabel(event.target.value)}
                  className="h-10 flex-1 rounded-xl border px-3 text-sm"
                />
                <button className="rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white">
                  创建密钥
                </button>
              </form>
              {revealedToken && (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <code className="min-w-0 flex-1 break-all text-xs">
                    {revealedToken}
                  </code>
                  <button
                    onClick={() =>
                      void navigator.clipboard.writeText(revealedToken)
                    }
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className="mt-5 space-y-2">
                {syncTokens.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{item.label}</p>
                      <p className="text-xs text-gray-400">
                        {item.revokedAt
                          ? "已撤销"
                          : item.lastUsedAt
                            ? `最近使用 ${new Date(item.lastUsedAt).toLocaleString("zh-CN")}`
                            : "尚未使用"}
                      </p>
                    </div>
                    {!item.revokedAt && (
                      <button
                        onClick={async () => {
                          await momentFetch(`/admin/sync-tokens/${item.id}`, {
                            method: "DELETE",
                          });
                          await loadSecurity();
                        }}
                        className="text-xs text-red-600"
                      >
                        撤销
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      {uploadConflict && (
        <UploadConflictDialog
          key={
            uploadConflict.kind === "file"
              ? `${uploadConflict.incoming.path}:${uploadConflict.incoming.checksum}`
              : uploadConflict.incomingName
          }
          conflict={uploadConflict}
          onResolve={resolveUploadConflict}
        />
      )}
      {moveTarget && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-5"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setMoveTarget(null)
          }
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b p-5">
              <h2 className="text-lg font-semibold">
                移动“
                {moveTarget.kind === "folder"
                  ? moveTarget.item.name
                  : moveTarget.item.originalName}
                ”
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                选择目标文件夹；移动文件夹时会同步更新内部文件的路径。
              </p>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-3">
              <button
                onClick={() => void moveItem(null)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-gray-100"
              >
                <HardDrive className="h-4 w-4 text-gray-500" />
                Moment 根目录
              </button>
              {moveFolders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => void moveItem(folder.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-gray-100"
                >
                  <Folder className="h-4 w-4 fill-amber-100 text-amber-600" />
                  <span className="truncate">{folder.label}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end border-t p-4">
              <button
                onClick={() => setMoveTarget(null)}
                className="rounded-xl border px-4 py-2 text-sm"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      {preview && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setPreview(null)
          }
        >
          <div className="relative max-h-[92vh] w-full max-w-5xl overflow-auto rounded-2xl bg-white p-3">
            <button
              onClick={() => setPreview(null)}
              className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white"
            >
              <X className="h-4 w-4" />
            </button>
            {browser.assets.filter(canPreview).length > 1 && (
              <>
                <button
                  onClick={() => void navigatePreview(-1)}
                  className="absolute left-5 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white shadow-lg"
                  title="上一张"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => void navigatePreview(1)}
                  className="absolute right-5 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white shadow-lg"
                  title="下一张"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
            {isImageAsset(preview.asset) ? (
              <img
                src={preview.url}
                alt={preview.asset.originalName}
                className="mx-auto max-h-[86vh] rounded-xl object-contain"
              />
            ) : isVideoAsset(preview.asset) ? (
              <video
                src={preview.url}
                controls
                autoPlay
                className="max-h-[86vh] w-full rounded-xl bg-black"
              />
            ) : preview.asset.mimeType.startsWith("audio/") ? (
              <audio
                src={preview.url}
                controls
                autoPlay
                className="my-16 w-full"
              />
            ) : (
              <iframe
                src={preview.url}
                title={preview.asset.originalName}
                className="h-[82vh] w-full rounded-xl"
              />
            )}
            <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-3 text-sm">
              <span className="min-w-0 truncate font-medium">
                {preview.asset.originalName}
              </span>
              {preview.asset.sidecar && (
                <span className="shrink-0 rounded-full bg-violet-50 px-2.5 py-1 text-xs text-violet-700">
                  已合并{" "}
                  {(preview.asset.sidecars?.length
                    ? preview.asset.sidecars
                    : [preview.asset.sidecar]
                  )
                    .map((sidecar) => sidecar.originalName)
                    .join("、")}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-5"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setSelected(null)
          }
        >
          <form
            onSubmit={saveAsset}
            className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div>
              <h2 className="text-xl font-semibold">文件展示配置</h2>
              <p className="mt-1 truncate text-xs text-gray-400">
                {selected.originalName}
              </p>
            </div>
            <input
              value={selected.title || ""}
              onChange={(event) =>
                setSelected({ ...selected, title: event.target.value })
              }
              placeholder="展示标题"
              className="h-10 w-full rounded-xl border px-3 text-sm"
            />
            <textarea
              value={selected.description || ""}
              onChange={(event) =>
                setSelected({ ...selected, description: event.target.value })
              }
              placeholder="描述"
              className="min-h-24 w-full rounded-xl border p-3 text-sm"
            />
            <select
              value={selected.visibility}
              onChange={(event) =>
                setSelected({
                  ...selected,
                  visibility: event.target.value as "PUBLIC" | "PRIVATE",
                })
              }
              className="h-10 w-full rounded-xl border px-3 text-sm"
            >
              <option value="PRIVATE">仅自己</option>
              <option value="PUBLIC">公开展示</option>
            </select>
            <input
              value={selected.tags.join(", ")}
              onChange={(event) =>
                setSelected({
                  ...selected,
                  tags: event.target.value
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                })
              }
              placeholder="标签，以逗号分隔"
              className="h-10 w-full rounded-xl border px-3 text-sm"
            />
            {selected.xmpMetadata && (
              <XmpMetadataPanel metadata={selected.xmpMetadata} />
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-xl border px-4 py-2 text-sm"
              >
                取消
              </button>
              <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white">
                保存
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function DeviceList({
  items,
  onRevoke,
}: {
  items: TrustedDevice[];
  onRevoke: (id: string) => Promise<void>;
}) {
  const active = items.filter(
    (item) => !item.revokedAt && new Date(item.expiresAt) > new Date(),
  );
  if (!active.length)
    return (
      <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-sm text-gray-400">
        暂无可信设备
      </p>
    );
  return (
    <div className="space-y-2">
      {active.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3"
        >
          <div className="min-w-0">
            <p className="font-medium">{item.deviceLabel}</p>
            <p className="mt-1 truncate text-xs text-gray-400">
              最近使用 {new Date(item.lastUsedAt).toLocaleString("zh-CN")} ·
              到期 {new Date(item.expiresAt).toLocaleString("zh-CN")}
            </p>
          </div>
          <button
            onClick={() => void onRevoke(item.id)}
            className="shrink-0 text-xs font-medium text-red-600"
          >
            撤销
          </button>
        </div>
      ))}
    </div>
  );
}

function XmpMetadataPanel({ metadata }: { metadata: XmpMetadata }) {
  const rows = [
    ["相机", [metadata.make, metadata.model].filter(Boolean).join(" ")],
    ["镜头", metadata.lens],
    [
      "拍摄参数",
      [
        metadata.focalLength && `${metadata.focalLength} mm`,
        metadata.aperture && `ƒ/${metadata.aperture}`,
        metadata.shutterSpeed && `${metadata.shutterSpeed} s`,
        metadata.iso && `ISO ${metadata.iso}`,
      ]
        .filter(Boolean)
        .join(" · "),
    ],
    [
      "地点",
      [metadata.location, metadata.city, metadata.state, metadata.country]
        .filter(Boolean)
        .join(" · "),
    ],
    ["作者", metadata.creator],
    [
      "评分 / 标签",
      [metadata.rating && `${metadata.rating} 星`, metadata.label]
        .filter(Boolean)
        .join(" · "),
    ],
    ["拍摄时间", metadata.capturedAt],
  ].filter((row) => row[1]);
  return (
    <section className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-violet-800">
        <Camera className="h-4 w-4" />
        XMP metadata
      </h3>
      <dl className="grid gap-2 text-xs">
        {rows.map(([label, value]) => (
          <div
            key={label as string}
            className="grid grid-cols-[84px_1fr] gap-3"
          >
            <dt className="text-gray-400">{label}</dt>
            <dd className="break-words text-gray-700">{value}</dd>
          </div>
        ))}
      </dl>
      {metadata.keywords?.length ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {metadata.keywords.map((keyword) => (
            <span
              key={keyword}
              className="rounded-full bg-white px-2 py-1 text-[11px] text-violet-700"
            >
              {keyword}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
