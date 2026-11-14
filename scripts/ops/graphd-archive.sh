#!/usr/bin/env bash
# graphd-archive.sh — 季度逻辑归档(E39-B1-3: runbook-storage §一 规程的定时形态)
# 拍板②: EXPORT 季度 + 物理快照 3 份滚动。读源库写他处——零源库写零停服。
# 前置: graphd 在跑(8766) + host-token 文件。失败不静默(退出码 1, timer Persistent 补跑)。
set -euo pipefail

TS=$(date +%Y%m%d-%H%M)
ROOT="${D2D_DATA_DIR:-$HOME/.d2d-data}"
DEST="$ROOT/backups/storage-archive/export-$TS"
TOKEN_FILE="${HOME}/.config/d2d/host-token"
BASE="${P2P_GRAPHD:-http://127.0.0.1:8766}"
KEEP=3

[ -f "$TOKEN_FILE" ] || { echo "✗ host-token 缺失: $TOKEN_FILE" >&2; exit 1; }
TOKEN=$(cat "$TOKEN_FILE")
mkdir -p "$ROOT/backups/storage-archive"

# 前置: DEST 必须不存在(kuzu/LadybugDB EXPORT 要求空目录)
[ -e "$DEST" ] && DEST="${DEST}-$$"
mkdir -p "$DEST"

HTTP=$(curl -s -m 180 -w "\n%{http_code}" -H "Content-Type: application/json" -H "X-Auth: $TOKEN" \
  -d "{\"cypher\":\"EXPORT DATABASE '$DEST'\"}" "$BASE/query")
BODY=${HTTP%$'\n'*}
CODE=${HTTP##*$'\n'}
if [ "$CODE" != "200" ] || ! echo "$BODY" | grep -q "Exported database successfully"; then
  echo "✗ EXPORT 失败(http=$CODE): ${BODY:0:200}" >&2
  rm -rf "$DEST"
  exit 1
fi

FILES=$(find "$DEST" -type f | wc -l)
SIZE=$(du -sh "$DEST" | cut -f1)
echo "✓ 归档完成: $DEST ($FILES 文件, $SIZE)"

# 滚动保留 3 份(旧于最新 3 份的删除)
ls -1dt "$ROOT"/backups/storage-archive/export-* 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
  rm -rf "$old"
  echo "滚动清理: $old"
done
