(() => {
  let syncing = false;
  const reply = (id, payload) => window.postMessage({ source: "johnny-cookie-extension", id, ...payload }, location.origin);
  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== "johnny-music-admin") return;
    const { action, id } = event.data;
    if (typeof id !== "string" || id.length > 100) return;
    if (action === "ping") { reply(id, { installed: true }); return; }
    if (action !== "sync" || syncing) return;
    syncing = true;
    try {
      const result = await chrome.runtime.sendMessage({ type: "read-youtube-cookies" });
      if (result?.error || !result?.cookies) throw new Error(result?.error || "扩展连接中断，请刷新页面");
      const response = await fetch("/api/backend/music/youtube-cookies", {
        method: "POST", credentials: "same-origin", redirect: "error",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cookies: result.cookies }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(response.status === 401 ? "请先登录音乐管理后台" : "同步失败，请检查后台服务后重试");
      reply(id, { ok: true });
    } catch (error) {
      reply(id, { error: error.message || "同步失败" });
    } finally { syncing = false; }
  });
})();
