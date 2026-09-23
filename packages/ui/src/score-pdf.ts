import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

/** Bounded bitmap cache. Each render owns its canvas, so rapid page/zoom changes
 * cannot start competing PDF.js render tasks on the visible canvas. */
export class ScorePdfCache {
  private cache = new Map<string, HTMLCanvasElement>();
  private pending = new Map<string, Promise<HTMLCanvasElement>>();
  private queue: {
    key: string;
    page: number;
    width: number;
    priority: number;
    resolve: (canvas: HTMLCanvasElement) => void;
    reject: (error: Error) => void;
  }[] = [];
  private tasks = new Set<RenderTask>();
  private running = 0;
  private disposed = false;
  constructor(readonly document: PDFDocumentProxy) {}

  get(page: number, width: number, priority = 0): Promise<HTMLCanvasElement> {
    if (this.disposed) return Promise.reject(new Error("Reader closed"));
    const key = `${page}:${width}`;
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return Promise.resolve(cached);
    }
    const pending = this.pending.get(key);
    if (pending) {
      const queued = this.queue.find((item) => item.key === key);
      if (queued) queued.priority = Math.min(priority, queued.priority);
      return pending;
    }
    const promise = new Promise<HTMLCanvasElement>((resolve, reject) => {
      this.queue.push({ key, page, width, priority, resolve, reject });
    });
    this.pending.set(key, promise);
    this.pump();
    return promise;
  }

  prioritize(pages: number[]) {
    for (const job of this.queue) {
      const index = pages.indexOf(job.page);
      job.priority = job.width <= 240 ? 2 : index < 0 ? 3 : index < 2 ? 0 : 1;
    }
  }

  private pump() {
    this.queue.sort((a, b) => a.priority - b.priority);
    while (!this.disposed && this.running < 2 && this.queue.length) {
      const job = this.queue.shift()!;
      this.running++;
      void (async () => {
        let task: RenderTask | undefined;
        try {
          const page = await this.document.getPage(job.page);
          if (this.disposed) throw new Error("Reader closed");
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: job.width / base.width });
          const canvas = window.document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas unavailable");
          task = page.render({ canvasContext: context, viewport });
          this.tasks.add(task);
          await task.promise;
          if (this.disposed) throw new Error("Reader closed");
          this.cache.set(job.key, canvas);
          const isThumb = job.width <= 240;
          const keys = [...this.cache.keys()].filter(
            (key) => Number(key.split(":")[1]) <= 240 === isThumb,
          );
          for (const key of keys.slice(
            0,
            Math.max(0, keys.length - (isThumb ? 80 : 10)),
          ))
            this.cache.delete(key);
          job.resolve(canvas);
        } catch (error) {
          job.reject(
            error instanceof Error ? error : new Error("PDF render failed"),
          );
        } finally {
          if (task) this.tasks.delete(task);
          this.pending.delete(job.key);
          this.running--;
          this.pump();
        }
      })();
    }
  }

  dispose() {
    this.disposed = true;
    this.tasks.forEach((task) => task.cancel());
    this.queue
      .splice(0)
      .forEach((job) => job.reject(new Error("Reader closed")));
    this.cache.clear();
    this.pending.clear();
  }
}
