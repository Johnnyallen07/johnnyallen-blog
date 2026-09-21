/* Cookie values stay inside the extension; only the isolated content script receives them. */
const allowedOrigins = new Set([
  "https://admin.johnnyallen.blog", "http://localhost:3003", "http://127.0.0.1:3003",
]);
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== "read-youtube-cookies" || !sender.tab || sender.frameId !== 0) return;
  let origin;
  try { origin = new URL(sender.url).origin; } catch { return; }
  if (!allowedOrigins.has(origin)) return;
  (async () => {
    const stores = await chrome.cookies.getAllCookieStores();
    const store = stores.find((item) => item.tabIds.includes(sender.tab.id));
    if (!store) throw new Error("无法读取当前浏览器会话");
    const cookies = await chrome.cookies.getAll({ domain: "youtube.com", storeId: store.id });
    const relevant = cookies.filter((cookie) =>
      !cookie.partitionKey && (cookie.domain === "youtube.com" || cookie.domain.endsWith(".youtube.com"))
      && (!cookie.expirationDate || cookie.expirationDate > Date.now() / 1000));
    if (!relevant.length) throw new Error("请先在同一浏览器打开 YouTube 并完成登录或验证，再同步");
    const rows = relevant.map((cookie) => [
      `${cookie.httpOnly ? "#HttpOnly_" : ""}${cookie.domain}`,
      cookie.domain.startsWith(".") ? "TRUE" : "FALSE", cookie.path,
      cookie.secure ? "TRUE" : "FALSE", Math.floor(cookie.expirationDate || 0), cookie.name, cookie.value,
    ].join("\t"));
    respond({ cookies: "# Netscape HTTP Cookie File\n" + rows.join("\n") + "\n" });
  })().catch((error) => respond({ error: error.message }));
  return true;
});
