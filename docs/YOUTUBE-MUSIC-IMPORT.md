# YouTube 音乐导入

粘贴单个视频链接或每行一个的批量链接。音频下载与 AI 信息建议独立进行；可试听下载结果、手工修改字段并直接保存，无需等待 AI。已修改的字段不会被稍后返回的 AI 建议覆盖。分类、作曲家等建议来自现有词表，仍需人工确认。

完整曲目保存后可打开「剪辑（可选）」，复用波形与时间范围编辑器。该入口默认另存片段并保留原曲，不会按同名标题覆盖其他录音。不剪辑即可继续导入或离开页面。

## 浏览器 Cookie 同步

音乐导入页的「YouTube Cookie」提供扩展 v1.1 ZIP 下载。解压后在 Chrome / Edge 扩展管理中启用开发者模式并加载该目录；已有旧版时替换文件并重新加载扩展，刷新 YouTube 和后台。扩展使用工具栏弹窗，在已登录的 YouTube 页面点击「获取并填入后台」，会打开后台 Cookie 窗口并填好内容，再点击「检查格式并保存」。也可在扩展中选择「仅下载 cookies.txt」，再选取文件。

获取 Cookie 不要求后台登录，也不依据某个 Cookie 名称推断 YouTube 登录状态。后台登录过期时会保留返回地址，登录后继续填入。扩展只读取当前 YouTube 标签页所属 Cookie store 的 youtube.com Cookie；自动填入的临时快照仅存在扩展 session storage 中，五分钟后拒绝使用并在读取时清除，成功填入后立即清除。扩展直接填入可见输入框，不通过网页 postMessage、URL 或剪贴板传递 Cookie。填写内容只在当前弹窗内使用，保存成功后清空，不写入队列缓存。

支持的后台地址固定在扩展 manifest.json、background.js 和 popup.html：正式 admin 子域及 localhost/127.0.0.1:3003。自定义域名需同步修改并重新打包。浏览器扩展不能替服务器自动通过人机验证；会话被撤销、服务器出口 IP 限制或 PO Token 要求仍可能导致下载失败。未过期数量只是本地格式检查，不代表 YouTube 已接受该会话。

Cookie 存储在 Docker 的 youtube_cookies 命名卷中，文件权限为 0600，更新通过原子重命名完成。下载使用独立快照；yt-dlp 写回的 Cookie 仅在原始内容未变化时持久化，不覆盖同时由浏览器同步的新会话。写回不是无限续期，失效时仍须从浏览器重新同步。

## 音乐 AI 配置与重试

音乐信息建议独立使用 DeepSeek，不继承 Gemini 或翻译服务配置。设置 `DEEPSEEK_API_KEY` 即可使用默认的 `deepseek-flash` 和 `https://api.deepseek.com`；也可用 `MUSIC_METADATA_AI_API_KEY`、`MUSIC_METADATA_AI_MODEL`、`MUSIC_METADATA_AI_BASE_URL` 覆盖。修改 Docker 环境配置后需要重新创建 API 容器。密钥只配置在服务端。

页面会显示模型和缺少密钥的原因。来源信息及分类、系列加载完成后才自动请求建议；失败可手工填写或点击 AI 重试。API 使用 JSON 模式，关闭 DeepSeek 思考模式，总请求预算约 45 秒，空内容最多重试一次。密钥无效、余额不足、限流、模型地址错误、超时和无效结构会显示不同错误。同一任务的并发请求合并，成功结果缓存至任务清理；手动重试可重新生成，手工修改的字段始终保留。

## 下载器运行环境

API 镜像使用 Node 22、ffmpeg 和 `yt-dlp[default]`，包含匹配的 EJS 组件，无需每次运行时从 GitHub获取。设置 YTDLP_PYTHON 后，每次下载前检查距离上次更新尝试是否满一天，使用指定 venv 的 pip 同时升级 yt-dlp 与组件。默认 Docker 已设置 `/opt/yt-dlp/bin/python`。更新最多等待 90 秒，失败显示状态并继续尝试已安装版本。后台也提供「更新下载器」，排在当前下载之后执行，不修改正在运行的 extractor。

本地环境不设置 YTDLP_PYTHON 时由系统管理版本。服务器需能访问 PyPI 和 YouTube；Cookie 同步不能修复网络封锁。

## 恢复与边界

当前标签页的队列和人工填写内容保存在 sessionStorage，刷新后重新核对服务器状态。轮询短暂失败后重试会先恢复原任务。临时 MP3 与任务在单个 API 进程中保留约一天，过期自动清理；尚未保存的下载在服务重启后需要重下，人工填写内容保留。当前实现适用于单 API 副本，多个副本需要共享任务队列和临时存储。

保存使用下载任务 UUID 作为曲目主键并执行 upsert，重复点击、保存响应丢失和重启后的成功回执查询都不会重复创建该曲目。上传失败/数据库失败可重试，已上传对象在任务存活时可复用。不同任务主动导入同一个视频仍被视作不同录音导入，不跨任务自动去重。

相关验证：API 的 music 单元测试、admin TypeScript 检查、`node --test apps/admin/lib/youtube-cookie-extension.test.mjs`。扩展源文件位于 apps/admin/public/youtube-cookie-sync；修改后运行 `python3 scripts/package-youtube-cookie-sync.py` 重新生成旁边的 ZIP。

官方参考：[yt-dlp EJS](https://github.com/yt-dlp/yt-dlp/wiki/EJS)、[YouTube Cookie 说明](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies)。
