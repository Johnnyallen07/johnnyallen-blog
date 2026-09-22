(() => {
  let importing = false;
  const reply = (id, payload) => window.postMessage({ source: "johnny-cookie-extension", id, ...payload }, location.origin);
  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== "johnny-music-admin") return;
    const { action, id } = event.data;
    if (typeof id !== "string" || id.length > 100) return;
    if (action === "ping") { reply(id, { installed: true, version: "1.1.0" }); return; }
    if (action !== "paste" || importing) return;
    importing = true;
    try {
      const result = await chrome.runtime.sendMessage({ type: "pending-youtube-cookies" });
      if (result?.error || !result?.cookies) throw new Error(result?.error || "请在 YouTube 页面重新获取 Cookie。");
      const input = document.getElementById("youtube-cookie-text");
      if (!(input instanceof HTMLTextAreaElement)) throw new Error("请先打开后台的 YouTube Cookie 窗口。");
      // Paste directly into the user-visible input, never pass credentials through window messages.
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(input, result.cookies);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await chrome.runtime.sendMessage({ type: "ack-youtube-cookies", id: result.id });
      reply(id, { ok: true });
    } catch (error) { reply(id, { error: error.message || "自动填入失败" }); }
    finally { importing = false; }
  });
})();
