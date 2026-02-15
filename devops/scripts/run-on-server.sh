#!/usr/bin/env bash
# 在服务器上执行（需先将代码同步到 /opt/johnny-blog）
# 用法: 在服务器上 cd /opt/johnny-blog && bash devops/scripts/run-on-server.sh

set -e
APP_DIR="${APP_DIR:-/opt/johnny-blog}"
EMAIL="${EMAIL:-johnnyallenyxc@gmail.com}"

cd "$APP_DIR"

# Docker 国内镜像
if [[ -f "$APP_DIR/devops/docker/daemon.json" ]]; then
  echo "==> 配置 Docker 国内镜像源..."
  mkdir -p /etc/docker
  cp -f "$APP_DIR/devops/docker/daemon.json" /etc/docker/daemon.json
  systemctl daemon-reload
  systemctl restart docker
fi

# Nginx
if ! command -v nginx &>/dev/null; then
  (apt-get update -qq && apt-get install -y -qq nginx) 2>/dev/null || \
  (yum install -y nginx 2>/dev/null) || true
fi
cp -f "$APP_DIR/devops/nginx/johnnyallen.blog.conf" /etc/nginx/conf.d/johnnyallen.blog.conf
if nginx -t 2>/dev/null; then
  systemctl enable nginx 2>/dev/null || true
  systemctl is-active --quiet nginx && systemctl reload nginx || systemctl start nginx
fi

# Certbot
if ! command -v certbot &>/dev/null; then
  (apt-get update -qq && apt-get install -y -qq certbot python3-certbot-nginx) 2>/dev/null || \
  (yum install -y certbot python3-certbot-nginx 2>/dev/null) || \
  (dnf install -y certbot python3-certbot-nginx 2>/dev/null) || true
fi

# 构建并启动（必须用 .env.production，否则 API 缺 COS_* 会崩溃导致 502）
if [[ ! -f "$APP_DIR/.env.production" ]]; then
  echo "错误: 未找到 $APP_DIR/.env.production，请先同步 devops/.env.production 到服务器"
  exit 1
fi
export DOCKER_BUILDKIT=1
echo "==> 构建并启动 Docker 容器（可能需 10–20 分钟）..."
docker compose --env-file .env.production build
docker compose --env-file .env.production up -d --build

echo "==> 等待服务就绪..."
sleep 10

# 先为主站和 API 申请证书（static 若指向 COS 会失败，可稍后改 DNS 再申请）
echo "==> 申请 SSL 证书..."
certbot --nginx \
  -d johnnyallen.blog \
  -d www.johnnyallen.blog \
  -d api.johnnyallen.blog \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive \
  --redirect \
  --expand 2>/dev/null || true

# 若 static 已指向本机，再单独申请
certbot --nginx -d static.johnnyallen.blog --email "$EMAIL" --agree-tos --non-interactive --redirect 2>/dev/null || true

systemctl enable certbot.timer 2>/dev/null || true
systemctl start certbot.timer 2>/dev/null || true

echo "==> 部署完成。"
docker compose --env-file .env.production ps
echo ""
echo "请访问: https://johnnyallen.blog 与 https://api.johnnyallen.blog"
