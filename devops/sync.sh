#!/usr/bin/env bash
# 同步项目代码到服务器 + SSH 登录
# 用法: ./devops/sync.sh
set -e

SERVER="${DEPLOY_HOST:-ubuntu@43.161.236.200}"
APP_DIR="/opt/johnny-blog"
SSH_KEY="${SSH_KEY:-johnny.pem}"
SSH_OPTS="-o StrictHostKeyChecking=accept-new"
[[ -f "$SSH_KEY" ]] && SSH_OPTS="-i $SSH_KEY $SSH_OPTS"

echo "==> 准备远程目录 $SERVER:$APP_DIR ..."
ssh $SSH_OPTS "$SERVER" "sudo mkdir -p '$APP_DIR' && sudo chown -R \$(id -u):\$(id -g) '$APP_DIR'"

echo "==> 同步项目到 $SERVER:$APP_DIR ..."
rsync -avz --delete -e "ssh $SSH_OPTS" \
  --exclude node_modules \
  --exclude .git \
  --exclude .turbo \
  --exclude .next \
  --exclude dist \
  --exclude "*.log" \
  --exclude "*.tsbuildinfo" \
  --exclude "*.pem" \
  --exclude ".env" \
  --exclude ".env.local" \
  --exclude ".DS_Store" \
  --exclude "backups" \
  ./ "$SERVER:$APP_DIR/"

echo "==> 同步 .env.production ..."
rsync -avz -e "ssh $SSH_OPTS" ./devops/.env.production "$SERVER:$APP_DIR/.env.production"

ENV="--env-file .env.production"

echo ""
echo "===> 同步完成! SSH 登录服务器..."
echo ""
echo "========== 常用 Docker 命令 =========="
echo ""
echo "  # ── 查看状态 ──"
echo "  docker compose $ENV ps"
echo "  docker compose $ENV top"
echo ""
echo "  # ── 重新部署（重建镜像 + 启动） ──"
echo "  docker compose $ENV up -d --build"
echo "  docker compose $ENV up -d --build api        # 只重建 API"
echo "  docker compose $ENV up -d --build web        # 只重建 Web"
echo "  docker compose $ENV up -d --build music      # 只重建 Music"
echo "  docker compose $ENV up -d --build admin      # 只重建 Admin"
echo ""
echo "  # ── 重启（不重建镜像） ──"
echo "  docker compose $ENV restart"
echo "  docker compose $ENV restart api"
echo ""
echo "  # ── 查看日志 ──"
echo "  docker compose $ENV logs -f api"
echo "  docker compose $ENV logs -f web"
echo "  docker compose $ENV logs -f music"
echo "  docker compose $ENV logs -f admin"
echo "  docker compose $ENV logs -f --tail=100 api   # 最近100行"
echo ""
echo "  # ── 停止 / 清理 ──"
echo "  docker compose $ENV down"
echo "  docker system prune -f                       # 清理悬空镜像"
echo ""
echo "  # ── 数据库 ──"
echo "  docker compose $ENV exec db psql -U postgres -d blog_db"
echo ""
echo "======================================="
echo ""

ssh $SSH_OPTS -t "$SERVER" "cd $APP_DIR && exec bash"
