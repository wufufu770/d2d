#!/bin/bash
# rollback.sh — 知识脑版本回退: current 软链切回指定版/上一版(恒保留 3 版: 现役+2)
# 用法: rollback.sh [vN]   无参=回退到 current 的 parent_version
set -euo pipefail
DATA_DIR="${D2D_DATA_DIR:-$HOME/.d2d-data}"
BRAIN="$DATA_DIR/brain"
CUR=$(readlink "$BRAIN/current" 2>/dev/null || true)
[ -z "$CUR" ] && { echo "current 未安装"; exit 1; }
TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  TARGET=$(python3 -c "import json;print(json.load(open('$CUR/manifest.json')).get('parent_version') or '')")
  [ -z "$TARGET" ] && { echo "current 无 parent 记录, 请指定版本: $(ls "$BRAIN/versions")"; exit 1; }
fi
[ -d "$BRAIN/versions/$TARGET" ] || { echo "版本不存在: $TARGET"; exit 1; }
rm -f "$BRAIN/current"
ln -sfn "$BRAIN/versions/$TARGET" "$BRAIN/current"
# 新 current 的 parent 更新为被回退的版本(支持连续回退)
python3 - "$BRAIN/versions/$TARGET/manifest.json" "$CUR" <<'EOF'
import json, sys
p, prev = sys.argv[1], sys.argv[2]
m = json.load(open(p))
m.setdefault('parent_version', prev.split('/')[-1])
m['status'] = 'current'
json.dump(m, open(p, 'w'), indent=2, ensure_ascii=False)
EOF
echo "current → $TARGET (原: $(basename "$CUR"))"
