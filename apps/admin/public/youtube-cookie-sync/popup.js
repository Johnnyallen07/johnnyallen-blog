const destination = document.getElementById("destination");
const status = document.getElementById("status");
chrome.storage.local.get("adminOrigin").then((settings) => {
  if ([...destination.options].some((option) => option.value === settings.adminOrigin)) destination.value = settings.adminOrigin;
});
async function run(type) {
  for (const button of document.querySelectorAll("button")) button.disabled = true;
  status.textContent = "正在读取当前 YouTube 页面的 Cookie…";
  try {
    await chrome.storage.local.set({ adminOrigin: destination.value });
    const result = await chrome.runtime.sendMessage({ type, origin: destination.value });
    if (result?.error || !result) throw new Error(result?.error || "扩展连接中断，请重新加载扩展。");
    if (type === "export-youtube-cookies") {
      const url = URL.createObjectURL(new Blob([result.cookies], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = "cookies.txt"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      status.textContent = `已导出 ${result.count} 条 Cookie，可在后台选择该文件。`;
    } else { status.textContent = "已打开后台并准备自动填入。若后台登录过期，登录后会继续填入。"; }
  } catch (error) { status.textContent = error.message || "读取失败，请刷新 YouTube 页面后重试。"; }
  finally { for (const button of document.querySelectorAll("button")) button.disabled = false; }
}
document.getElementById("capture").addEventListener("click", () => run("capture-to-admin"));
document.getElementById("download").addEventListener("click", () => run("export-youtube-cookies"));
