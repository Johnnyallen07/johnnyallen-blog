#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SYNC_ROOT="${1:-}"
if [[ -z "$SYNC_ROOT" ]] && command -v osascript >/dev/null; then
  SYNC_ROOT="$(osascript -e 'POSIX path of (choose folder with prompt "选择要同步到 Moment 的文件夹")')"
  SYNC_ROOT="${SYNC_ROOT%/}"
fi

"$SCRIPT_DIR/moment-sync.sh" "$SYNC_ROOT"
echo
read -r -p "同步完成，按回车关闭窗口。"
