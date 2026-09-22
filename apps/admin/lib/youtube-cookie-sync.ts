/** The bridge sends status only; the extension pastes cookies directly into the visible form. */
export function requestYoutubeCookieSync(
  action: "ping" | "paste",
): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timeout = setTimeout(
      () => finish(new Error("未连接同步扩展，请安装后刷新页面")),
      action === "ping" ? 1500 : 25000,
    );
    const receive = (event: MessageEvent) => {
      if (
        event.source !== window ||
        event.origin !== location.origin ||
        event.data?.source !== "johnny-cookie-extension" ||
        event.data.id !== id
      )
        return;
      const error = event.data.error || (action === "ping" && event.data.version !== "1.1.0" ? "请下载并重新加载新版同步扩展" : undefined);
      finish(error ? new Error(error) : undefined);
    };
    function finish(error?: Error) {
      clearTimeout(timeout);
      window.removeEventListener("message", receive);
      if (error) reject(error);
      else resolve();
    }
    window.addEventListener("message", receive);
    window.postMessage(
      { source: "johnny-music-admin", action, id },
      location.origin,
    );
  });
}
