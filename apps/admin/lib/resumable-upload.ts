export function putPart(
  url: string,
  body: Blob,
  signal: AbortSignal,
  onProgress: (uploadedBytes: number) => void,
  headers: Record<string, string> = {},
) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("上传已暂停", "AbortError"));
      return;
    }
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    request.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) {
      request.setRequestHeader(name, value);
    }
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    request.onload = () => {
      signal.removeEventListener("abort", abort);
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(Object.assign(new Error(`分片上传失败（HTTP ${request.status}）`), { status: request.status }));
    };
    request.onerror = () => {
      signal.removeEventListener("abort", abort);
      reject(new Error(navigator.onLine ? "网络错误，分片上传失败" : "网络已断开"));
    };
    request.onabort = () => {
      signal.removeEventListener("abort", abort);
      reject(new DOMException("上传已暂停", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    request.send(body);
  });
}

export function waitForOnline(signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(new DOMException("上传已暂停", "AbortError"));
  if (navigator.onLine) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const online = () => {
      cleanup();
      resolve();
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("上传已暂停", "AbortError"));
    };
    const cleanup = () => {
      window.removeEventListener("online", online);
      signal.removeEventListener("abort", abort);
    };
    window.addEventListener("online", online, { once: true });
    signal.addEventListener("abort", abort, { once: true });
  });
}

export function retryDelay(attempt: number) {
  const exponential = Math.min(1_000 * 2 ** attempt, 15_000);
  return exponential + Math.floor(Math.random() * 500);
}

export function delay(milliseconds: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(new DOMException("上传已暂停", "AbortError"));
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("上传已暂停", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}
