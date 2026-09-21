# YouTube Cookie 同步

Chrome / Edge 中打开扩展管理，启用开发者模式，将下载的 ZIP 解压，然后选择「加载已解压的扩展程序」并选中该目录。刷新音乐导入页面，打开「YouTube Cookie」，点击「从浏览器同步」。

请先在同一浏览器的普通窗口中打开 YouTube 并完成登录或人机验证。扩展只读取 youtube.com 的 Cookie，只发送到当前已登录的 Johnny 音乐管理后台；不读取 Google 或其他网站的 Cookie，不保存 Cookie 副本，不在网页消息中返回 Cookie 值。请求沿用后台登录状态，不需要复制管理员 Token。

支持 https://admin.johnnyallen.blog 与本地 3003 端口。使用其他域名时需同时修改 manifest.json 的 content_scripts.matches 和 background.js 的 allowedOrigins，随后重新加载扩展。

这是会话同步，不是绕过验证或无限续期。服务器与浏览器出口 IP 不同、会话被撤销或 YouTube 要求 PO Token 时，仍可能下载失败。请根据页面错误处理。下载器写回的 Cookie 会持久保存，但无法替代浏览器重新登录。
