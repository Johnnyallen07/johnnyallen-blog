/** The extension sends status only; browser cookies never enter React state. */
export function requestYoutubeCookieSync(
  action: "ping" | "sync",
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
      finish(event.data.error ? new Error(event.data.error) : undefined);
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
