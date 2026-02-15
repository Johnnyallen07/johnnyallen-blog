#!/usr/bin/env bash
# 在服务器上配置 Docker 国内镜像加速（需 root）
# 用法: 复制 devops/docker/daemon.json 到服务器 /etc/docker/daemon.json 后执行 systemctl restart docker

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DAEMON_JSON="${SCRIPT_DIR}/../docker/daemon.json"

if [[ ! -f "$DOCKER_DAEMON_JSON" ]]; then
  echo "未找到 $DOCKER_DAEMON_JSON"
  exit 1
fi

mkdir -p /etc/docker
cp -f "$DOCKER_DAEMON_JSON" /etc/docker/daemon.json
systemctl daemon-reload
systemctl restart docker
echo "Docker 镜像源已更新，当前配置："
docker info 2>/dev/null | grep -A 10 "Registry Mirrors" || true
