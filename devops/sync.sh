#!/usr/bin/env bash
# 同步项目代码到服务器 + SSH 登录
# 用法: ./devops/sync.sh
set -e

SERVER="${DEPLOY_HOST:-root@43.161.221.87}"
APP_DIR="/opt/johnny-blog"
SSH_KEY="${SSH_KEY:-devops/johnnyallenblog.pem}"
SSH_OPTS="-o StrictHostKeyChecking=accept-new"
[[ -f "$SSH_KEY" ]] && SSH_OPTS="-i $SSH_KEY $SSH_OPTS"

echo "==> 同步项目到 $SERVER:$APP_DIR ..."
rsync -avz --delete -e "ssh $SSH_OPTS" \
  --exclude node_modules \
  --exclude .git \
  --exclude .turbo \
  --exclude apps/web/.next \
  --exclude apps/music/.next \
  --exclude '*.log' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude 'backups' \
  ./ "$SERVER:$APP_DIR/"

echo "==> 同步 .env.production ..."
rsync -avz -e "ssh $SSH_OPTS" ./devops/.env.production "$SERVER:$APP_DIR/.env.production"

echo ""
echo "==> 同步完成，登录服务器..."
echo "    常用命令："
echo "    docker compose --env-file .env.production build              # 构建镜像"
echo "    docker compose --env-file .env.production up -d              # 启动服务"
echo "    docker compose --env-file .env.production up -d --build      # 构建并启动"
echo "    docker compose --env-file .env.production down               # 停止服务"
echo "    docker compose --env-file .env.production ps                 # 查看状态"
echo "    docker compose --env-file .env.production logs -f api        # API 日志"
echo "    docker compose --env-file .env.production logs -f web        # Web 日志"
echo "    docker compose --env-file .env.production logs -f db         # DB 日志"
echo "    docker compose --env-file .env.production restart api        # 重启 API"
echo "    docker compose --env-file .env.production exec db psql -U postgres -d blog_db  # 进入数据库"
echo ""
exec ssh $SSH_OPTS -t "$SERVER" "cd $APP_DIR && exec bash"
