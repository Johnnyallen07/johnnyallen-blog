#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
STATE_DIR="${DB_TUNNEL_STATE_DIR:-$ROOT_DIR/.ssh-tunnel}"
CONTROL_PATH="${DB_TUNNEL_CONTROL_PATH:-$STATE_DIR/db.sock}"
SSH_HOST="${DB_TUNNEL_HOST:-ubuntu@43.161.236.200}"
SSH_KEY="${DB_TUNNEL_KEY:-$ROOT_DIR/johnny.pem}"

if [ ! -S "$CONTROL_PATH" ]; then
  exit 0
fi

ssh \
  -i "$SSH_KEY" \
  -S "$CONTROL_PATH" \
  -O exit \
  -o StrictHostKeyChecking=accept-new \
  "$SSH_HOST" >/dev/null 2>&1 || true

rm -f "$CONTROL_PATH"
