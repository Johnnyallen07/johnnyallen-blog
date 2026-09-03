export const MOMENT_UPLOAD_CACHE_PREFIX = "moment-upload-cache:v1:";

function normalizePath(value) {
  return value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function fileRecord(entry, previous) {
  const current = {
    path: normalizePath(entry.path),
    size: entry.file.size,
    lastModified: entry.file.lastModified,
    mimeType: entry.file.type || "application/octet-stream",
    checksum: null,
    objectKey: null,
    verified: false,
    resolution: null,
    resolvedPath: null,
    deleteAssetId: null,
  };

  if (
    previous &&
    previous.path === current.path &&
    previous.size === current.size &&
    previous.lastModified === current.lastModified &&
    previous.mimeType === current.mimeType
  ) {
    return { ...current, ...previous };
  }

  return current;
}

export function uploadCacheKey(destinationPath, sourceFolder) {
  const scope = JSON.stringify([
    normalizePath(destinationPath),
    normalizePath(sourceFolder),
  ]);
  return `${MOMENT_UPLOAD_CACHE_PREFIX}${encodeURIComponent(scope)}`;
}

export function reconcileUploadCache(previous, context, entries) {
  const destinationPath = normalizePath(context.destinationPath);
  const sourceFolder = normalizePath(context.sourceFolder);
  const previousFiles =
    previous?.version === 1 &&
    previous.destinationPath === destinationPath &&
    previous.sourceFolder === sourceFolder
      ? previous.files || {}
      : {};
  const files = Object.fromEntries(
    entries.map((entry) => {
      const path = normalizePath(entry.path);
      return [path, fileRecord({ ...entry, path }, previousFiles[path])];
    }),
  );

  return {
    version: 1,
    destinationPath,
    sourceFolder,
    targetFolder:
      context.targetFolder || previous?.targetFolder || sourceFolder,
    folderAction:
      context.folderAction || previous?.folderAction || null,
    files,
    updatedAt: new Date().toISOString(),
  };
}

export function updateUploadCacheFile(cache, path, changes) {
  const normalizedPath = normalizePath(path);
  const current = cache.files[normalizedPath];
  if (!current) return cache;
  return {
    ...cache,
    files: {
      ...cache.files,
      [normalizedPath]: { ...current, ...changes },
    },
    updatedAt: new Date().toISOString(),
  };
}

export function uploadCacheComplete(cache) {
  const files = Object.values(cache.files);
  return (
    files.length > 0 &&
    files.every((file) => file.verified || file.resolution === "skip")
  );
}

export function loadUploadCache(storage, destinationPath, sourceFolder) {
  try {
    const value = storage.getItem(
      uploadCacheKey(destinationPath, sourceFolder),
    );
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function saveUploadCache(storage, cache) {
  try {
    storage.setItem(
      uploadCacheKey(cache.destinationPath, cache.sourceFolder),
      JSON.stringify(cache),
    );
  } catch {
    // Uploads should still work when private browsing or quota rules disable storage.
  }
}

export function removeUploadCache(storage, destinationPath, sourceFolder) {
  try {
    storage.removeItem(uploadCacheKey(destinationPath, sourceFolder));
  } catch {
    // There is nothing else to clean up when storage is unavailable.
  }
}

export function listUploadCaches(storage) {
  const caches = [];
  try {
    const keys = Array.from({ length: storage.length }, (_, index) =>
      storage.key(index),
    ).filter((key) => key?.startsWith(MOMENT_UPLOAD_CACHE_PREFIX));
    for (const key of keys) {
      if (!key) continue;
      const value = storage.getItem(key);
      if (!value) continue;
      const cache = JSON.parse(value);
      if (cache?.version !== 1) continue;
      if (uploadCacheComplete(cache)) storage.removeItem(key);
      else caches.push(cache);
    }
  } catch {
    return [];
  }
  return caches;
}
