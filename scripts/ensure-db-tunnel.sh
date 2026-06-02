#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
STATE_DIR="${DB_TUNNEL_STATE_DIR:-$ROOT_DIR/.ssh-tunnel}"
CONTROL_PATH="${DB_TUNNEL_CONTROL_PATH:-$STATE_DIR/db.sock}"
LOG_PATH="${DB_TUNNEL_LOG_PATH:-$STATE_DIR/db-tunnel.log}"

SSH_HOST="${DB_TUNNEL_HOST:-ubuntu@43.161.236.200}"
SSH_KEY="${DB_TUNNEL_KEY:-$ROOT_DIR/johnny.pem}"
LOCAL_PORT="${DB_TUNNEL_LOCAL_PORT:-15432}"
REMOTE_HOST="${DB_TUNNEL_REMOTE_HOST:-127.0.0.1}"
REMOTE_PORT="${DB_TUNNEL_REMOTE_PORT:-5432}"

if nc -z 127.0.0.1 "$LOCAL_PORT" >/dev/null 2>&1; then
  echo "DB tunnel already available on 127.0.0.1:$LOCAL_PORT"
  exit 0
fi

if [ ! -f "$SSH_KEY" ]; then
  echo "Missing SSH key: $SSH_KEY" >&2
  exit 1
fi

mkdir -p "$STATE_DIR"

echo "Opening DB tunnel: 127.0.0.1:$LOCAL_PORT -> $SSH_HOST:$REMOTE_PORT"
ssh \
  -i "$SSH_KEY" \
  -M \
  -S "$CONTROL_PATH" \
  -f \
  -N \
  -L "127.0.0.1:$LOCAL_PORT:$REMOTE_HOST:$REMOTE_PORT" \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -o StrictHostKeyChecking=accept-new \
  "$SSH_HOST" >>"$LOG_PATH" 2>&1

for _ in 1 2 3 4 5; do
  if nc -z 127.0.0.1 "$LOCAL_PORT" >/dev/null 2>&1; then
    echo "DB tunnel ready on 127.0.0.1:$LOCAL_PORT"
    exit 0
  fi
  sleep 1
done

echo "DB tunnel did not become ready. See $LOG_PATH" >&2
exit 1
