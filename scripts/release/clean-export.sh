#!/usr/bin/env bash
# clean-export.sh — 产出可推送的零数据纯净树并校验
# 用法: bash scripts/release/clean-export.sh   (输出 /tmp/d2d-clean, 校验失败即非零退出)
set -euo pipefail
REPO="${D2D:-$(cd "$(dirname "$0")/../.." && pwd)}"
OUT="${1:-/tmp/d2d-clean}"
rm -rf "$OUT"
mkdir -p "$OUT"
# 全量复制(跟随 .gitignore 语义: 用 git archive 保证只带走被跟踪文件)
git -C "$REPO" archive HEAD | tar -x -C "$OUT"
# 二次防线: 运行数据/凭据黑名单扫描
VIOLATIONS=0
while IFS= read -r f; do
  echo "✗ 数据/敏感文件混入: $f"; VIOLATIONS=$((VIOLATIONS+1))
done < <(cd "$OUT" && find . -type f \( \
    -path './runs/*' -o -path './evidence/*' -o -path './brain/versions/*' -o -path './brain/staged/*' \
    -o -path './knowledge/inbox/*' -o -name 'experience.json' -o -name '*.jsonl' -o -name 'kuzu_db*' \
    -o -name 'host-token*' -o -name 'worker-token*' -o -name '.credentials.yaml' -o -name 'handoff*.md' \
    -o -name 'model-usage.jsonl' \) | head -50)
# 配置文件默认值确认(不允许带真实 webhook/凭据出门)
if grep -q '"webhook_url": "http' "$OUT/config/notify.json" 2>/dev/null; then echo "✗ notify.json 带真实 webhook"; VIOLATIONS=$((VIOLATIONS+1)); fi
if grep -rEq 'sk_live|AKIA[0-9A-Z]{16}' "$OUT/config" 2>/dev/null; then echo "✗ config 疑似真实凭据"; VIOLATIONS=$((VIOLATIONS+1)); fi
if [ "$VIOLATIONS" -gt 0 ]; then echo "❌ clean-export 校验失败($VIOLATIONS)"; exit 1; fi
echo "✅ 纯净树 → $OUT (零运行数据/零凭据)"
