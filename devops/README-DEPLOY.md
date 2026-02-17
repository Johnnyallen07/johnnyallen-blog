# 部署说明（johnnyallen.blog）

## 国内加速说明

- **Docker 镜像**：部署脚本会自动将 `devops/docker/daemon.json` 写入服务器 `/etc/docker/daemon.json` 并重启 Docker，使用国内镜像源（1panel、DaoCloud 等）加速拉取 `node`、`postgres` 等基础镜像。
- **npm/pnpm 包**：Dockerfile 内已设置 `npm_config_registry=https://registry.npmmirror.com`，构建时依赖从 npmmirror（原淘宝镜像）拉取。
- **构建缓存**：Dockerfile 使用 BuildKit 的 `RUN --mount=type=cache` 缓存 pnpm store，二次构建会明显更快；部署脚本已启用 `DOCKER_BUILDKIT=1`。

若需单独配置镜像源（不跑完整部署），可在服务器执行：
```bash
cp /opt/johnny-blog/devops/docker/daemon.json /etc/docker/daemon.json
systemctl daemon-reload && systemctl restart docker
```

## 前提

- 服务器 **43.161.221.87** 已能通过 SSH 登录（建议使用公钥：`ssh-copy-id root@43.161.221.87`）。
- DNS 已解析到该服务器：
  - `johnnyallen.blog`、`www.johnnyallen.blog` → 43.161.221.87（A 记录）
  - `api.johnnyallen.blog` → 43.161.221.87（A 记录）
  - `static.johnnyallen.blog` → 43.161.221.87（**A 记录**；若当前是 CNAME 到 COS，需改为 A 记录才能由本机 Nginx 代理并申请证书）

## 一键部署（推荐在本机执行）

在**项目根目录**执行（需已配置好 SSH 公钥，且本机可访问 43.161.221.87）：

```bash
chmod +x devops/deploy.sh
SSH_KEY=devops/johnnyallenblog.pem ./devops/deploy.sh
```

若中途断线或构建时间过长，可改为「先同步代码，再在服务器上执行」：

```bash
# 1. 本机：只同步代码（使用你的 PEM 密钥）
rsync -avz --delete -e "ssh -i devops/johnnyallenblog.pem -o StrictHostKeyChecking=accept-new" \
  --exclude node_modules --exclude .git --exclude apps/api/node_modules \
  --exclude apps/web/node_modules --exclude apps/web/.next --exclude .turbo \
  ./ root@43.161.221.87:/opt/johnny-blog/

rsync -avz -e "ssh -i devops/johnnyallenblog.pem" ./devops/.env.production root@43.161.221.87:/opt/johnny-blog/.env.production
rsync -avz -e "ssh -i devops/johnnyallenblog.pem" ./devops/nginx/ root@43.161.221.87:/opt/johnny-blog/devops/nginx/
rsync -avz -e "ssh -i devops/johnnyallenblog.pem" ./devops/docker/ root@43.161.221.87:/opt/johnny-blog/devops/docker/

# 2. 登录服务器并执行部署脚本
ssh -i devops/johnnyallenblog.pem root@43.161.221.87
cd /opt/johnny-blog && bash devops/scripts/run-on-server.sh
```

脚本会：

1. 用 rsync 把项目同步到服务器 `/opt/johnny-blog`
2. 使用 `devops/.env.production` 作为生产环境变量（含腾讯云 COS）
3. 安装并启动 **宿主机上的** Nginx、Certbot（若未安装）
4. 部署 Nginx 配置（主站 → 3000，API → 3001，static → 代理到 COS）
5. 构建并启动 `docker compose up -d`（仅 db / api / web 三个容器）
6. 为上述域名申请 Let's Encrypt 证书并开启 HTTPS 与自动续期

**说明**：Nginx **不在** docker-compose 中，这是刻意的。Nginx 在宿主机以 systemd 服务运行（`systemctl status nginx`），监听 80/443，反向代理到容器内的 web:3000、api:3001。若 Nginx 未启动，会出现 ERR_CONNECTION_TIMED_OUT；若 API/Web 容器未就绪，会出现 502。

## 环境变量（腾讯云）

生产环境变量在 `devops/.env.production` 中，已包含：

- `COS_BUCKET`、`COS_REGION`、`COS_SECRET_ID`、`COS_SECRET_KEY`
- `COS_PUBLIC_DOMAIN=https://static.johnnyallen.blog`（图片通过本站 Nginx 代理，证书由 Let's Encrypt 签发）
- `NEXT_PUBLIC_API_URL=https://api.johnnyallen.blog`

如需修改，编辑 `devops/.env.production` 后重新执行 `./devops/deploy.sh`。

## 若服务器仅允许公钥登录

当前环境无法用密码登录你的服务器。请在本机（已配置好 SSH 公钥）执行：

```bash
cd /path/to/johnny-blog
./devops/deploy.sh
```

若尚未配置公钥：

```bash
ssh-copy-id root@43.161.221.87
# 按提示输入密码 zzyy0226
./devops/deploy.sh
```

## static.johnnyallen.blog 证书说明

- 图片请求走 `https://static.johnnyallen.blog/xxx`，由本机 Nginx 反向代理到腾讯云 COS。
- SSL 证书由 Certbot 在服务器上申请，自动续期，不再出现 `ERR_CERT_COMMON_NAME_INVALID`。

## Docker 卷（数据库数据）— 务必不要删卷

- **只保留 1 个数据卷**：`docker-compose.yml` 里已设置固定项目名 `name: johnnyblog`，卷名固定为 `johnnyblog_db_data`，避免因换目录或多次部署产生多个卷。
- **严禁在服务器上执行**：`docker compose down -v` 或 `docker volume rm` / `docker volume prune`。`-v` 会删除卷，数据库数据会全部丢失。
- **避免误删卷**：  
  - 停止容器请用：`bash devops/scripts/safe-down.sh`（若误传 `-v` 会报错拒绝）。  
  - 若希望所有 compose 命令都禁止 `down -v`，可用封装脚本：`bash devops/scripts/compose-safe.sh --env-file .env.production up -d`、`bash devops/scripts/compose-safe.sh --env-file .env.production down`；传入 `down -v` 时会直接报错不执行。
- 若只需停止/重启服务，用：`docker compose --env-file .env.production up -d`（或先 `down` 再 `up -d`，**不要加 -v**）。
- **查看当前卷数量、以及 db 实际挂载的卷**（在服务器上执行）：
  ```bash
  bash /opt/johnny-blog/devops/scripts/list-volumes.sh
  ```
  若出现多个相关卷，说明曾发生过卷被新建；只应保留正在使用的那一个，其余确认无用后再删。
- **查看卷里是否有数据（文章/分类/用户行数）**（在服务器上执行，需 db 已运行）：
  ```bash
  bash /opt/johnny-blog/devops/scripts/check-db-data.sh
  ```
  若 Post 为 0 且你曾有过文章，可能是用了新卷或曾执行过 `down -v` 导致旧卷被删。

- **清理未使用容器与镜像、释放 5432/3000**（在服务器上执行）：
  ```bash
  bash /opt/johnny-blog/devops/scripts/docker-clean.sh
  ```
  会先在本项目目录执行 `docker compose down`，再执行 `container prune` 和 `image prune`（悬空镜像）。若 5432/3000 被 **docker-proxy** 占用，多半是之前未完全退出的容器，执行此脚本后可再 `up -d`。需删除**所有**未使用镜像时加参数：`bash docker-clean.sh -a`。

## 数据库备份与定时任务

- **每日单份备份（每天覆盖昨天）**：`devops/scripts/db-backup-daily.sh`  
  输出固定为 `backups/backup_daily.sql.gz`，每次成功执行后覆盖该文件。  
  建议加入 cron 每日执行（例如每天凌晨 2 点）：
  ```bash
  # 在服务器上执行一次即可
  (crontab -l 2>/dev/null; echo "0 2 * * * cd /opt/johnny-blog && bash /opt/johnny-blog/devops/scripts/db-backup-daily.sh") | crontab -
  ```
- **多份轮换备份**：`devops/scripts/db-backup.sh`（保留最近 2 份，带时间戳文件名）。  
  若只需「每天一份、覆盖昨日」，用上面的 `db-backup-daily.sh` 即可。
- 若曾在服务器上为备份加过 cron 且想移除，可在服务器执行：`bash /opt/johnny-blog/devops/scripts/remove-backup-cron.sh`。

## 数据不见了 / 卷与数据对齐

- **现象**：后台显示「共 0 篇文章」或之前的数据全部消失。
- **先确认卷里是否有数据**（在服务器上，db 需已运行）：
  ```bash
  bash /opt/johnny-blog/devops/scripts/check-db-data.sh
  ```
  会输出当前 db 挂载的卷名，以及 Post/Category/User/Series 的行数。若行数均为 0，说明当前挂载的卷内没有数据。
- **是否多个卷导致没对齐**：
  ```bash
  bash /opt/johnny-blog/devops/scripts/list-volumes.sh
  ```
  若存在多个相关卷，可能某次部署用了新卷、旧卷数据未挂载。可尝试用旧卷恢复（需先 down、改 compose 或卷名后再 up，或联系运维从备份恢复）。
- **从备份恢复**（卷被删或数据丢失时）：先确保 db 已运行（`docker compose --env-file .env.production up -d`），再执行：
  ```bash
  bash /opt/johnny-blog/devops/scripts/db-restore.sh [备份文件路径]
  ```
  不传参数则默认使用 `backups/backup_daily.sql.gz`。脚本会要求输入 `yes` 确认后，用该备份覆盖当前库内数据。
- **后续避免再次发生**：严禁执行 `docker compose down -v` 或 `docker volume rm` / `docker volume prune`。停止容器请用 `bash devops/scripts/safe-down.sh` 或 `bash devops/scripts/compose-safe.sh --env-file .env.production down`。定期用 `db-backup-daily.sh` 做备份，以便需要时用 `db-restore.sh` 恢复。

## 故障排查

- **站点无法访问（ERR_CONNECTION_TIMED_OUT）**  
  Nginx 未监听 80/443 时会出现。常见原因：Nginx 配置错误导致未启动。已修复：`devops/nginx/johnnyallen.blog.conf` 中错误的 `proxy_https_version` 已改为 `proxy_http_version 1.1`。  
  **处理**：重新执行 `SSH_KEY=devops/johnnyallenblog.pem ./devops/deploy.sh` 同步配置并启动 Nginx。若仅改配置，可在服务器执行：
  ```bash
  cp /opt/johnny-blog/devops/nginx/johnnyallen.blog.conf /etc/nginx/conf.d/johnnyallen.blog.conf
  nginx -t && systemctl start nginx && systemctl enable nginx
  ```

- **Docker 构建报 ERR_PNPM_OUTDATED_LOCKFILE**  
  说明 `pnpm-lock.yaml` 与各 `package.json` 不同步。在**本机**项目根目录执行 `pnpm install`，提交并推送 `pnpm-lock.yaml` 后重新同步、再在服务器上构建。

- **Bind for 0.0.0.0:5432/3000 failed: port is already allocated**  
  **原因**：占用的不是本项目的容器，而是**宿主机上其他进程**（如系统安装的 PostgreSQL、其他 Docker 容器、或监听 3000 的进程）。`docker compose down` 只关停 johnnyblog 的容器，不会释放被这些进程占用的端口。  
  **排查**：在服务器执行 `bash /opt/johnny-blog/devops/scripts/check-ports.sh` 查看 5432、3000、3001 被谁占用。  
  **处理**：二选一——  
  1）停掉占用端口的服务（例如宿主机 PostgreSQL：`systemctl stop postgresql`；或停掉占用 3000 的进程），再执行 `docker compose --env-file .env.production up -d`。  
  2）若不能停宿主机服务，可改 compose 的宿主机端口，例如 db 改为 `5433:5432`、web 改为 `3080:3000`，并相应修改 Nginx 里对 web 的反代端口（如 `proxy_pass http://127.0.0.1:3080`）。

- **502 Bad Gateway**  
  Nginx 已启动但上游（web:3000 或 api:3001）无响应。常见原因：**未用 `.env.production` 做变量替换**，导致 `docker compose` 中 `${COS_BUCKET}` 等为空，API 启动失败或崩溃。  
  **处理**：部署脚本已改为使用 `docker compose --env-file .env.production`。若此前部署过，需在服务器上用该方式重启：
  ```bash
  cd /opt/johnny-blog
  docker compose --env-file .env.production up -d
  docker compose --env-file .env.production logs api   # 若仍 502 查看 API 日志
  ```

- **API 容器反复重启**  
  确认 `/opt/johnny-blog/.env.production` 存在且含 `COS_*`、`POSTGRES_*`；**手动执行 compose 时务必加** `--env-file .env.production`。  
  查看日志：`cd /opt/johnny-blog && docker compose --env-file .env.production logs api`，根据报错修复（如数据库连接、COS 配置等）。
