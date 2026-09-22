const allowedOrigins = new Set([
  "https://admin.johnnyallen.blog", "http://localhost:3003", "http://127.0.0.1:3003",
]);
const pendingKey = "pending-youtube-cookies";
const expiresAfter = 5 * 60 * 1000;

async function storeForTab(tabId) {
  const stores = await chrome.cookies.getAllCookieStores();
  const store = stores.find((item) => item.tabIds.includes(tabId));
  if (!store) throw new Error("无法读取此窗口的 Cookie 存储，请检查扩展权限及无痕窗口设置。");
  return store.id;
}

async function capture(tab) {
  let url;
  try { url = new URL(tab?.url); } catch { /* handled below */ }
  if (!url || url.protocol !== "https:" || !(url.hostname === "youtube.com" || url.hostname.endsWith(".youtube.com"))) {
    throw new Error("请在要导出的 YouTube 页面点击扩展按钮。");
  }
  const storeId = await storeForTab(tab.id);
  const cookies = await chrome.cookies.getAll({ domain: "youtube.com", storeId });
  const relevant = cookies.filter((cookie) => !cookie.partitionKey
    && (cookie.domain === "youtube.com" || cookie.domain.endsWith(".youtube.com"))
    && (!cookie.expirationDate || cookie.expirationDate > Date.now() / 1000));
  // Cookies cannot reliably tell us whether the user is signed in. Never infer logout here.
  if (!relevant.length) throw new Error("未读取到此 YouTube 页面的 Cookie。这不代表你未登录；请刷新页面，并允许扩展访问 youtube.com。");
  const rows = relevant.map((cookie) => [
    `${cookie.httpOnly ? "#HttpOnly_" : ""}${cookie.domain}`,
    cookie.domain.startsWith(".") ? "TRUE" : "FALSE", cookie.path,
    cookie.secure ? "TRUE" : "FALSE", Math.floor(cookie.expirationDate || 0), cookie.name, cookie.value,
  ].join("\t"));
  return { cookies: "# Netscape HTTP Cookie File\n" + rows.join("\n") + "\n", count: rows.length, storeId };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const fromPopup = sender.url === chrome.runtime.getURL("popup.html") && !sender.tab;
  let adminOrigin;
  try { adminOrigin = new URL(sender.url).origin; } catch { return; }
  const fromAdmin = sender.tab && sender.frameId === 0 && allowedOrigins.has(adminOrigin);
  if (!fromPopup && !fromAdmin) return;
  (async () => {
    if (fromPopup && ["export-youtube-cookies", "capture-to-admin"].includes(message?.type)) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const result = await capture(tab);
      if (message.type === "export-youtube-cookies") { respond(result); return; }
      const origin = message.origin;
      if (!allowedOrigins.has(origin)) throw new Error("不支持此后台地址");
      const id = crypto.randomUUID();
      await chrome.storage.session.set({ [pendingKey]: { ...result, id, origin, expiresAt: Date.now() + expiresAfter } });
      // Only the destination and current profile receive this explicitly requested handoff.
      const candidates = await chrome.tabs.query({ url: `${origin}/*` });
      const destination = candidates.find((candidate) => candidate.incognito === tab.incognito);
      const url = `${origin}/music/youtube?cookieImport=1`;
      if (destination) await chrome.tabs.update(destination.id, { url, active: true });
      else await chrome.tabs.create({ url, windowId: tab.windowId });
      respond({ ok: true, count: result.count });
      return;
    }
    if (fromAdmin && message?.type === "pending-youtube-cookies") {
      const pending = (await chrome.storage.session.get(pendingKey))[pendingKey];
      if (!pending || pending.expiresAt < Date.now()) {
        await chrome.storage.session.remove(pendingKey);
        throw new Error("待填入的 Cookie 已过期或已使用，请回 YouTube 页面重新获取。");
      }
      if (pending.origin !== adminOrigin || pending.storeId !== await storeForTab(sender.tab.id)) throw new Error("请在获取 Cookie 的同一浏览器窗口类型和目标后台中接收。");
      respond({ cookies: pending.cookies, id: pending.id });
      return;
    }
    if (fromAdmin && message?.type === "ack-youtube-cookies") {
      const pending = (await chrome.storage.session.get(pendingKey))[pendingKey];
      if (pending?.id === message.id && pending.origin === adminOrigin
        && pending.storeId === await storeForTab(sender.tab.id)) await chrome.storage.session.remove(pendingKey);
      respond({ ok: true });
      return;
    }
    respond({ error: "请使用新版扩展，在 YouTube 页面点击「获取并填入后台」。" });
  })().catch((error) => respond({ error: error.message }));
  return true;
});
