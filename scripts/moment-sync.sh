#!/usr/bin/env bash
set -euo pipefail

# Moment 增量同步：只新增/更新，不会删除云端文件。
# Token 默认从 macOS Keychain 读取，避免保存在脚本或 shell 历史中。

SYNC_ROOT="${1:-}"
MOMENT_API_URL="${MOMENT_API_URL:-https://api.johnnyallen.blog}"
KEYCHAIN_SERVICE="johnny-moment-sync"

if [[ -z "$SYNC_ROOT" || ! -d "$SYNC_ROOT" ]]; then
  echo "用法: $0 /path/to/folder"
  exit 2
fi

for command_name in curl jq shasum file stat; do
  command -v "$command_name" >/dev/null || { echo "缺少命令: $command_name"; exit 2; }
done

SYNC_TOKEN="${MOMENT_SYNC_TOKEN:-}"
if [[ -z "$SYNC_TOKEN" ]] && command -v security >/dev/null; then
  SYNC_TOKEN="$(security find-generic-password -s "$KEYCHAIN_SERVICE" -w 2>/dev/null || true)"
fi
if [[ -z "$SYNC_TOKEN" ]]; then
  read -r -s -p "粘贴 Admin 中生成的 Moment 同步密钥: " SYNC_TOKEN
  echo
  if command -v security >/dev/null; then
    security add-generic-password -U -s "$KEYCHAIN_SERVICE" -a "$USER" -w "$SYNC_TOKEN" >/dev/null
    echo "同步密钥已保存到 macOS Keychain。"
  fi
fi

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT
MANIFEST_FILE="$TEMP_DIR/manifest.json"

curl --fail --silent --show-error \
  -H "X-Moment-Sync-Token: $SYNC_TOKEN" \
  "$MOMENT_API_URL/moment/sync/manifest" > "$MANIFEST_FILE"

uploaded=0
skipped=0
failed=0

while IFS= read -r -d '' local_file; do
  relative_path="${local_file#"$SYNC_ROOT"/}"
  [[ "$relative_path" == "$local_file" ]] && relative_path="$(basename "$local_file")"
  [[ "$(basename "$relative_path")" == ".DS_Store" ]] && continue

  checksum="$(shasum -a 256 "$local_file" | awk '{print $1}')"
  if jq -e --arg path "$relative_path" --arg hash "$checksum" \
    '.items[]? | select(.relativePath == $path and .checksum == $hash)' "$MANIFEST_FILE" >/dev/null; then
    skipped=$((skipped + 1))
    continue
  fi

  mime_type="$(file -b --mime-type "$local_file")"
  file_size="$(stat -f '%z' "$local_file")"
  modified_epoch="$(stat -f '%m' "$local_file")"
  captured_at="$(date -u -r "$modified_epoch" '+%Y-%m-%dT%H:%M:%SZ')"
  category_slug="${relative_path%%/*}"
  [[ "$category_slug" == "$relative_path" ]] && category_slug=""

  init_payload="$(jq -n --arg relativePath "$relative_path" --arg checksum "$checksum" --arg mimeType "$mime_type" --arg size "$file_size" \
    '{relativePath:$relativePath,checksum:$checksum,mimeType:$mimeType,size:$size}')"

  if ! init_response="$(curl --fail --silent --show-error -X POST \
    -H "X-Moment-Sync-Token: $SYNC_TOKEN" -H 'Content-Type: application/json' \
    --data "$init_payload" "$MOMENT_API_URL/moment/sync/upload-url")"; then
    echo "✗ 无法创建上传授权: $relative_path"; failed=$((failed + 1)); continue
  fi
  [[ "$(jq -r '.exists' <<<"$init_response")" == "true" ]] && { skipped=$((skipped + 1)); continue; }

  upload_url="$(jq -r '.uploadUrl' <<<"$init_response")"
  object_key="$(jq -r '.objectKey' <<<"$init_response")"
  echo "↑ $relative_path"
  if ! curl --fail --silent --show-error -X PUT -H "Content-Type: $mime_type" --upload-file "$local_file" "$upload_url"; then
    echo "✗ 上传失败: $relative_path"; failed=$((failed + 1)); continue
  fi

  complete_payload="$(jq -n \
    --arg relativePath "$relative_path" --arg checksum "$checksum" --arg mimeType "$mime_type" --arg size "$file_size" \
    --arg objectKey "$object_key" --arg categorySlug "$category_slug" --arg capturedAt "$captured_at" \
    '{relativePath:$relativePath,checksum:$checksum,mimeType:$mimeType,size:$size,objectKey:$objectKey,capturedAt:$capturedAt} + (if $categorySlug == "" then {} else {categorySlug:$categorySlug} end)')"
  if curl --fail --silent --show-error -X POST \
    -H "X-Moment-Sync-Token: $SYNC_TOKEN" -H 'Content-Type: application/json' \
    --data "$complete_payload" "$MOMENT_API_URL/moment/sync/complete" >/dev/null; then
    uploaded=$((uploaded + 1))
  else
    echo "✗ 登记失败: $relative_path"; failed=$((failed + 1))
  fi
done < <(find "$SYNC_ROOT" -type f -not -path '*/.*' -print0)

echo "完成：上传 $uploaded，跳过 $skipped，失败 $failed。"
[[ "$failed" -eq 0 ]]
