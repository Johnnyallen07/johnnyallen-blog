#!/usr/bin/env bash
# 部署到服务器并配置 nginx + Let's Encrypt
# 用法: 在项目根目录执行 ./devops/deploy.sh
# 使用 devops/johnnyblog.pem 密钥时: SSH_KEY=devops/johnnyblog.pem ./devops/deploy.sh

set -e
SERVER="${DEPLOY_HOST:-root@43.161.221.87}"
APP_DIR="/opt/johnny-blog"
EMAIL="johnnyallenyxc@gmail.com"
# 优先使用传入的密钥，否则使用 devops 下的 pem
SSH_KEY="${SSH_KEY:-devops/johnnyallenblog.pem}"
SSH_OPTS="-o StrictHostKeyChecking=accept-new"
[[ -f "$SSH_KEY" ]] && SSH_OPTS="-i $SSH_KEY $SSH_OPTS"

echo "==> 同步项目到服务器 $SERVER..."
rsync -avz --delete -e "ssh $SSH_OPTS" \
  --exclude node_modules \
  --exclude .git \
  --exclude apps/api/node_modules \
  --exclude apps/web/node_modules \
  --exclude apps/web/.next \
  --exclude .turbo \
  --exclude '*.log' \
  ./ "$SERVER:$APP_DIR/"

echo "==> 同步 devops 环境、nginx 与 docker 配置..."
rsync -avz -e "ssh $SSH_OPTS" ./devops/.env.production "$SERVER:$APP_DIR/.env.production"
rsync -avz -e "ssh $SSH_OPTS" ./devops/nginx/ "$SERVER:$APP_DIR/devops/nginx/"
rsync -avz -e "ssh $SSH_OPTS" ./devops/docker/ "$SERVER:$APP_DIR/devops/docker/"

echo "==> 在服务器上执行部署..."
ssh $SSH_OPTS "$SERVER" "bash -s" << 'REMOTE'
set -e
APP_DIR="/opt/johnny-blog"
EMAIL="johnnyallenyxc@gmail.com"

cd "$APP_DIR"

# 安装 Docker（若未安装）
if ! command -v docker &>/dev/null; then
  echo "==> 安装 Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker && systemctl start docker
fi

# 配置 Docker 国内镜像加速
if [[ -f "$APP_DIR/devops/docker/daemon.json" ]]; then
  echo "==> 配置 Docker 国内镜像源..."
  mkdir -p /etc/docker
  cp -f "$APP_DIR/devops/docker/daemon.json" /etc/docker/daemon.json
  systemctl daemon-reload
  systemctl restart docker
fi

# 安装 Docker Compose 插件
if ! docker compose version &>/dev/null; then
  echo "==> 安装 Docker Compose..."
  (apt-get update -qq && apt-get install -y -qq docker-compose-plugin) 2>/dev/null || \
  (yum install -y docker-compose-plugin 2>/dev/null) || true
fi

# 安装 Nginx 与 Certbot（若未安装）
if ! command -v nginx &>/dev/null; then
  echo "==> 安装 Nginx..."
  (apt-get update -qq && apt-get install -y -qq nginx) 2>/dev/null || \
  (yum install -y nginx 2>/dev/null) || true
fi
if ! command -v certbot &>/dev/null; then
  echo "==> 安装 Certbot..."
  (apt-get update -qq && apt-get install -y -qq certbot python3-certbot-nginx) 2>/dev/null || \
  (yum install -y certbot python3-certbot-nginx 2>/dev/null) || \
  (dnf install -y certbot python3-certbot-nginx 2>/dev/null) || true
fi

# 部署 Nginx 配置（仅 HTTP，Certbot 会添加 HTTPS）
cp -f "$APP_DIR/devops/nginx/johnnyallen.blog.conf" /etc/nginx/conf.d/johnnyallen.blog.conf
if nginx -t 2>/dev/null; then
  systemctl enable nginx 2>/dev/null || true
  systemctl is-active --quiet nginx && systemctl reload nginx || systemctl start nginx
else
  echo "警告: Nginx 配置检查失败，请检查 /etc/nginx/conf.d/johnnyallen.blog.conf"
fi

# 构建并启动容器（必须用 .env.production 做变量替换，否则 API 拿不到 COS_* 会崩溃导致 502）
if [[ ! -f "$APP_DIR/.env.production" ]]; then
  echo "错误: 未找到 $APP_DIR/.env.production，请先同步 devops/.env.production 到服务器"
  exit 1
fi
export DOCKER_BUILDKIT=1
echo "==> 构建并启动 Docker 容器（使用 .env.production）..."
docker compose --env-file .env.production build 2>/dev/null || docker-compose --env-file .env.production build 2>/dev/null || true
docker compose --env-file .env.production up -d --build 2>/dev/null || docker-compose --env-file .env.production up -d --build 2>/dev/null || true

# 等待服务就绪（Next.js 冷启动需数秒）
sleep 10
COMPOSE_CMD="docker compose --env-file .env.production"
$COMPOSE_CMD ps 2>/dev/null || true
echo "若仍出现 502，请登录服务器执行: cd $APP_DIR && $COMPOSE_CMD logs api"

# 申请证书（主站 + API；static 若 DNS 指向 COS 则单独改 A 记录后再申请）
echo "==> 配置 SSL 证书..."
certbot --nginx \
  -d johnnyallen.blog \
  -d www.johnnyallen.blog \
  -d api.johnnyallen.blog \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive \
  --redirect \
  --expand 2>/dev/null || true
certbot --nginx -d static.johnnyallen.blog --email "$EMAIL" --agree-tos --non-interactive --redirect 2>/dev/null || true

# 确保 certbot 自动续期
systemctl enable certbot.timer 2>/dev/null || true
systemctl start certbot.timer 2>/dev/null || true

echo "==> 部署完成。"
docker compose --env-file .env.production ps 2>/dev/null || docker-compose --env-file .env.production ps 2>/dev/null || true
REMOTE

echo ""
echo "部署完成。请确认 DNS："
echo "  johnnyallen.blog, www.johnnyallen.blog  -> 43.161.221.87"
echo "  api.johnnyallen.blog                    -> 43.161.221.87"
echo "  static.johnnyallen.blog                 -> 43.161.221.87"
