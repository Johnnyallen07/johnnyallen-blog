# Moment 私人资料库

Moment 是 `moment.johnnyallen.blog` 上的只读私人资料库。照片和备份文件存放在腾讯 COS 的私有桶中，PostgreSQL 只保存索引与配置。

## 安全模型

- Web 页面没有任何上传接口；浏览器只能搜索、预览与下载。
- Mac 同步使用独立的 `mom_sync_…` 密钥，只能读取清单、申请 15 分钟上传 URL、登记文件，不能读取或下载任何内容。
- 私密访问首次需要管理员密码 + TOTP。短会话有效期 2 小时；选择信任设备后，同一浏览器可在 7 天内通过服务端登记的可信设备会话自动续期。两类凭证都只保存在 `HttpOnly`、`Secure`、`SameSite=Strict` 的 `__Host-` cookie 中，服务端只保存可信设备密钥摘要。
- 可信设备以高熵 Cookie 的持有证明为核心，并绑定归一化的浏览器/系统类型；IP 变化只进入风险审计，不作为硬性拦截条件，以兼容 VPN、蜂窝网络和正常漫游。后台可查看并立即撤销设备，主动退出也会撤销当前设备。
- 连续 5 次验证码失败会锁定 15 分钟；TOTP 密钥使用 AES-256-GCM 加密；恢复码只保存 SHA-256 摘要且每个只能使用一次。
- 公开精选也不直接匿名调用 API。Moment Next.js 服务端持有只读 gateway token，API 根据 `PUBLIC` 可见性再次过滤。
- COS 对象统一位于 `moment/vault/`，不生成公网 URL。每次查看与下载都会记录审计事件。
- 页面默认 `noindex`，并设置 CSP、禁止 iframe、禁止 MIME sniffing、最小 Permissions Policy。

此实现保护应用层访问，但不替代存储侧备份。COS 必须保持私有读写，并建议启用版本控制、生命周期规则、服务端加密和异地备份。

## 首次部署

1. 为 `moment.johnnyallen.blog` 添加 DNS A/AAAA 记录。
2. 生成两个彼此独立的随机值，并写入服务器 `.env.production`：

   ```bash
   openssl rand -base64 48  # MOMENT_ENCRYPTION_KEY
   openssl rand -base64 48  # MOMENT_PUBLIC_API_TOKEN
   ```

   `MOMENT_ENCRYPTION_KEY` 用于加密 TOTP 密钥。启用 2FA 后不要直接轮换，否则需要先实现密钥迁移或重新绑定 2FA。

3. 部署并迁移数据库：

   ```bash
   docker compose --env-file .env.production up -d --build
   ```

   API 容器启动时会自动执行 `prisma migrate deploy`。

4. 安装 Nginx 配置并签发证书：

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d moment.johnnyallen.blog --redirect
   ```

5. 登录 `admin.johnnyallen.blog/moment`，扫描二维码绑定 TOTP，并离线保存一次性恢复码。
6. 公开页面不展示私人入口；需要首次解锁时直接访问 `moment.johnnyallen.blog/login`。

管理员上传文件夹时，浏览器会按“目标目录 + 本地文件夹”缓存上传清单及每个文件的校验状态。网络中断后重新选择同一文件夹即可续传：已确认文件会直接跳过，已写入 COS 但尚未确认的文件会先补做确认。仅当清单中的全部文件均通过服务端 SHA-256 校验后，对应缓存才会被删除。

7. 添加分类。分类 slug 可与 Mac 同步目录的第一级文件夹同名，例如 `family/IMG_001.HEIC` 会尝试归入 slug 为 `family` 的分类。
8. 创建 Mac 同步密钥。密钥只显示一次，可随时从 Admin 撤销。

## Mac 一键同步

首次使用需安装 `jq`：

```bash
brew install jq
chmod +x scripts/moment-sync.sh "scripts/Moment Sync.command"
```

之后双击 `scripts/Moment Sync.command`，选择文件夹并粘贴一次同步密钥。密钥会进入 macOS Keychain，后续无需再次输入。也可以在终端执行：

```bash
pnpm moment:sync -- "/Users/me/Pictures/Moment"
```

同步按“相对路径 + SHA-256”增量判断，只上传新增或内容改变的文件；不会删除云端内容。若需要更换密钥，先在 Admin 撤销旧密钥，然后执行：

```bash
security delete-generic-password -s johnny-moment-sync
```

## 运维建议

- COS 主账号密钥不应长期用于生产。推荐创建仅允许目标桶所需操作的 CAM 子账号，并限制到 `moment/vault/*` 与现有博客前缀。
- 数据库与 COS 应分别备份；定期做恢复演练，而不仅是确认备份任务成功。
- 每月检查 `MomentAuditLog`、同步密钥最近使用时间以及异常认证失败。
- CDN、Nginx 和日志系统不得记录 Authorization、Cookie、同步 token 或预签名 URL。
- 私密文件不应经过会保存响应体的公共 CDN。当前 Moment 内容响应为 `private`/`no-store`。
- 上传超大文件前确认 Nginx 仅代理同步控制请求；实际文件通过预签名 URL 从 Mac 直传 COS。

## 当前边界

- 搜索覆盖标题、文件名、相对路径、描述和精确标签；暂不执行人脸识别、OCR 或 EXIF 地点聚类。
- 视频目前按完整对象读取；若要流畅拖动超大视频，下一步应增加经过鉴权的 HTTP Range 转发。
- 恢复码只能消耗，暂未提供在线重新生成入口。遗失全部恢复方式时需通过数据库运维流程重置 MomentCredential。
