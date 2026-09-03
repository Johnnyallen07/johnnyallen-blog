import test from "node:test";
import assert from "node:assert/strict";

import {
  listUploadCaches,
  loadUploadCache,
  reconcileUploadCache,
  removeUploadCache,
  saveUploadCache,
  updateUploadCacheFile,
  uploadCacheComplete,
  uploadCacheKey,
} from "./moment-upload-cache.js";

function memoryStorage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index] ?? null,
  };
}

function entry(path, size = 10, lastModified = 100) {
  return {
    path,
    file: { size, lastModified, type: "image/jpeg" },
  };
}

test("keeps upload caches isolated by source folder and destination", () => {
  assert.notEqual(
    uploadCacheKey("旅行", "北京"),
    uploadCacheKey("旅行", "上海"),
  );
  assert.notEqual(
    uploadCacheKey("旅行", "北京"),
    uploadCacheKey("家人", "北京"),
  );
});

test("reuses verified and uploaded state only for an unchanged file", () => {
  let cache = reconcileUploadCache(
    null,
    { destinationPath: "旅行", sourceFolder: "北京" },
    [entry("北京/a.jpg"), entry("北京/b.jpg")],
  );
  cache = updateUploadCacheFile(cache, "北京/a.jpg", {
    checksum: "abc",
    objectKey: "moment/vault/a.jpg",
    verified: true,
  });
  cache = updateUploadCacheFile(cache, "北京/b.jpg", {
    checksum: "def",
    objectKey: "moment/vault/b.jpg",
  });

  const resumed = reconcileUploadCache(
    cache,
    { destinationPath: "旅行", sourceFolder: "北京" },
    [entry("北京/a.jpg"), entry("北京/b.jpg", 11), entry("北京/c.jpg")],
  );

  assert.equal(resumed.files["北京/a.jpg"].verified, true);
  assert.equal(resumed.files["北京/a.jpg"].checksum, "abc");
  assert.equal(resumed.files["北京/b.jpg"].checksum, null);
  assert.equal(resumed.files["北京/b.jpg"].objectKey, null);
  assert.equal(resumed.files["北京/c.jpg"].verified, false);
});

test("persists unfinished progress and removes it after every file is verified", () => {
  const storage = memoryStorage();
  let cache = reconcileUploadCache(
    null,
    { destinationPath: "", sourceFolder: "相册" },
    [entry("相册/a.jpg"), entry("相册/b.jpg")],
  );
  cache = updateUploadCacheFile(cache, "相册/a.jpg", { verified: true });
  saveUploadCache(storage, cache);

  assert.equal(listUploadCaches(storage).length, 1);
  assert.equal(
    loadUploadCache(storage, "", "相册").files["相册/a.jpg"].verified,
    true,
  );
  assert.equal(uploadCacheComplete(cache), false);

  cache = updateUploadCacheFile(cache, "相册/b.jpg", { verified: true });
  assert.equal(uploadCacheComplete(cache), true);
  saveUploadCache(storage, cache);
  const unfinished = reconcileUploadCache(
    null,
    { destinationPath: "", sourceFolder: "待续传" },
    [entry("待续传/c.jpg")],
  );
  saveUploadCache(storage, unfinished);
  assert.deepEqual(
    listUploadCaches(storage).map((item) => item.sourceFolder),
    ["待续传"],
  );
  assert.equal(loadUploadCache(storage, "", "相册"), null);

  saveUploadCache(storage, cache);
  removeUploadCache(storage, "", "相册");
  assert.equal(loadUploadCache(storage, "", "相册"), null);
});
