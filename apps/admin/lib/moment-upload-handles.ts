const DATABASE_NAME = "moment-resumable-uploads";
const STORE_NAME = "directory-handles";

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 请求失败"));
  });
}

async function database() {
  const request = indexedDB.open(DATABASE_NAME, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
      request.result.createObjectStore(STORE_NAME);
    }
  };
  return requestResult(request);
}

export async function saveUploadHandle(key: string, handle: unknown) {
  const db = await database();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(handle, key);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("无法保存文件夹授权"));
      transaction.onabort = () => reject(transaction.error || new Error("保存文件夹授权已中止"));
    });
  } finally {
    db.close();
  }
}

export async function loadUploadHandle<T>(key: string) {
  const db = await database();
  try {
    return (await requestResult(
      db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key),
    )) as T | undefined;
  } finally {
    db.close();
  }
}

export async function removeUploadHandle(key: string) {
  const db = await database();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("无法清理文件夹授权"));
      transaction.onabort = () => reject(transaction.error || new Error("清理文件夹授权已中止"));
    });
  } finally {
    db.close();
  }
}
