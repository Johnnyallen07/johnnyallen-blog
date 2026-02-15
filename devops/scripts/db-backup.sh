#!/usr/bin/env bash
# ============================================================
# PostgreSQL 每日备份脚本（2 份轮换，安全删除）
# 用法: 由 cron 每日执行，或手动运行
#   bash /opt/johnny-blog/devops/scripts/db-backup.sh
#
# 策略:
#   - 保留最近 2 份成功的备份（今天 + 昨天）
#   - 新备份写入临时文件，pg_dump 成功后才移入正式目录
#   - 如果本次备份失败，不删除任何历史备份
#   - 用 flock 防止并发执行
# ============================================================
set -euo pipefail

# ---------- 配置 ----------
BACKUP_DIR="/opt/johnny-blog/backups"
KEEP_COUNT=2                  # 保留最近几份成功备份
COMPOSE_FILE="/opt/johnny-blog/docker-compose.yml"
ENV_FILE="/opt/johnny-blog/.env.production"
LOG_FILE="$BACKUP_DIR/backup.log"
LOCK_FILE="/tmp/johnny-blog-db-backup.lock"

# 从 .env.production 读取数据库配置
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-blog_db}"
CONTAINER_NAME="johnny-blog-db-1"

# ---------- 初始化 ----------
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backup_${TIMESTAMP}.sql.gz"
TEMP_FILE="$BACKUP_DIR/.tmp_${BACKUP_FILE}"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

cleanup_temp() {
    rm -f "$TEMP_FILE"
}
trap cleanup_temp EXIT

# ---------- 防并发 ----------
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
    log "错误: 另一个备份进程正在运行，退出"
    exit 1
fi

# ---------- 检查数据库容器 ----------
# 自动检测 db 容器名（兼容不同 compose 版本的命名规则）
CONTAINER_NAME=$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -q db 2>/dev/null || true)
if [[ -z "$CONTAINER_NAME" ]]; then
    log "错误: 找不到 db 容器，请确认 docker compose 正在运行"
    exit 1
fi

log "开始备份 (容器: ${CONTAINER_NAME:0:12})"

# ---------- 执行 pg_dump ----------
if docker exec "$CONTAINER_NAME" \
    pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner \
    | gzip > "$TEMP_FILE"; then

    # 校验：文件大于 100 字节才视为有效（空库也有 DDL）
    FILE_SIZE=$(stat -c%s "$TEMP_FILE" 2>/dev/null || stat -f%z "$TEMP_FILE" 2>/dev/null || echo 0)
    if [[ "$FILE_SIZE" -lt 100 ]]; then
        log "错误: 备份文件异常（${FILE_SIZE} 字节），可能 pg_dump 输出为空，不替换历史备份"
        exit 1
    fi

    # 移入正式目录
    mv "$TEMP_FILE" "$BACKUP_DIR/$BACKUP_FILE"
    log "备份成功: $BACKUP_FILE (${FILE_SIZE} 字节)"

    # ---------- 安全轮换：只在新备份成功后才删除多余旧备份 ----------
    # 列出所有成功备份，按时间倒序
    BACKUPS=($(ls -1t "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null))
    TOTAL=${#BACKUPS[@]}

    if [[ "$TOTAL" -gt "$KEEP_COUNT" ]]; then
        for ((i=KEEP_COUNT; i<TOTAL; i++)); do
            log "轮换删除: $(basename "${BACKUPS[$i]}")"
            rm -f "${BACKUPS[$i]}"
        done
    fi

    log "当前保留 $(ls -1 "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null | wc -l) 份备份"
else
    log "错误: pg_dump 失败（exit $?），保留所有历史备份不做删除"
    exit 1
fi
