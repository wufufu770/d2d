#!/usr/bin/env bash
# clean-export.sh — 产出可推送的零数据纯净树并校验
# R4a: 改为「索引+未跟踪(尊重 .gitignore)」工作区导出 — 本地旧 git 史与远端重写史已分叉,
#      原 git archive HEAD 会带走陈旧树且不含新文件。manifest.sha256 在此自动重建(排除自身)。
# 用法: bash scripts/release/clean-export.sh [OUT=/tmp/d2d-clean]   (校验失败即非零退出)
set -euo pipefail
REPO="${D2D:-$(cd "$(dirname "$0")/../.." && pwd)}"
OUT="${1:-/tmp/d2d-clean}"
rm -rf "$OUT"
mkdir -p "$OUT"
cd "$REPO"
git ls-files --cached --others --exclude-standard -z | while IFS= read -r -d '' f; do
  # 二道防线(A-4/A-2): 测试运行日志与用户机器模型策略绝不出门
  case "$f" in
    .d2d-review/S*-test-log.md|config/model-policies.json|manifest.sha256) continue ;;
  esac
  mkdir -p "$OUT/$(dirname "$f")"
  cp -a "$f" "$OUT/$f"
done
# 运行数据/凭据黑名单扫描
VIOLATIONS=0
while IFS= read -r f; do
  echo "✗ 数据/敏感文件混入: $f"; VIOLATIONS=$((VIOLATIONS+1))
done < <(cd "$OUT" && find . -type f \( \
    -path './runs/*' -o -path './evidence/*' -o -path './brain/versions/*' -o -path './brain/staged/*' \
    -o -path './knowledge/inbox/*' -o -name 'experience.json' -o -name '*.jsonl' -o -name 'kuzu_db*' \
    -o -name 'host-token*' -o -name 'worker-token*' -o -name '.credentials.yaml' -o -name 'handoff*.md' \
    -o -name 'model-usage.jsonl' -o -name 'S*-test-log.md' \) | head -50)
# 配置文件默认值确认(不允许带真实 webhook/凭据出门; model-policies.json 已物理排除, example 只有占位符)
if grep -q '"webhook_url": "http' "$OUT/config/notify.json" 2>/dev/null; then echo "✗ notify.json 带真实 webhook"; VIOLATIONS=$((VIOLATIONS+1)); fi
if grep -rEq 'sk_live|AKIA[0-9A-Z]{16}' "$OUT/config" 2>/dev/null; then echo "✗ config 疑似真实凭据"; VIOLATIONS=$((VIOLATIONS+1)); fi
if [ "$VIOLATIONS" -gt 0 ]; then echo "❌ clean-export 校验失败($VIOLATIONS)"; exit 1; fi
# 完整性 manifest(排除自身)
( cd "$OUT" && find . -type f ! -name manifest.sha256 -print0 | sort -z | xargs -0 sha256sum > manifest.sha256 )
echo "✅ 纯净树 → $OUT ($(find "$OUT" -type f | wc -l) 文件, 零运行数据/零凭据)"
