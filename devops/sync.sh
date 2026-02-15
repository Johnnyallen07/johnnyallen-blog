#!/usr/bin/env bash
# 快速同步代码到服务器 + SSH 登录
# 用法: 在项目根目录执行 ./devops/sync.sh
set -e

SERVER="${DEPLOY_HOST:-root@43.161.221.87}"
APP_DIR="/opt/johnny-blog"
SSH_KEY="${SSH_KEY:-devops/johnnyallenblog.pem}"
SSH_OPTS="-o StrictHostKeyChecking=accept-new"
[[ -f "$SSH_KEY" ]] && SSH_OPTS="-i $SSH_KEY $SSH_OPTS"

echo "==> 同步项目到服务器 $SERVER:$APP_DIR ..."
rsync -avz --delete -e "ssh $SSH_OPTS" \
  --exclude node_modules \
  --exclude .git \
  --exclude .turbo \
  --exclude apps/web/.next \
  --exclude '*.log' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude 'backups' \
  ./ "$SERVER:$APP_DIR/"

echo "==> 同步 .env.production..."
rsync -avz -e "ssh $SSH_OPTS" ./devops/.env.production "$SERVER:$APP_DIR/.env.production"

echo ""
echo "==> 同步完成，正在登录服务器..."
echo "    常用命令："
echo "    docker compose --env-file .env.production build --no-cache api web"
echo "    docker compose --env-file .env.production up -d"
echo "    docker compose --env-file .env.production logs -f api"
echo ""
exec ssh $SSH_OPTS -t "$SERVER" "cd $APP_DIR && exec bash"
