#!/usr/bin/env bash
# graphd-cov.sh — E46-F6: graphd Python 轨覆盖率入口(docs/coverage-baseline.md 登记的
# "pytest-cov 未接入"边界兑现)。默认只测 graphd 面(--cov=gd --cov=app), term 报告缺行;
# --html 额外产 htmlcov/(浏览器细看)。依赖: pip install --user pytest-cov(PEP668 加
# --break-system-packages)。用法: scripts/ops/graphd-cov.sh [--html] [pytest 附加参数…]
set -euo pipefail
cd "$(dirname "$0")/../.."
EXTRA=()
HTML=0
for a in "$@"; do
  if [ "$a" = "--html" ]; then HTML=1; else EXTRA+=("$a"); fi
done
COV_OPTS=(--cov=gd --cov=app --cov-report=term-missing:skip-covered)
if [ "$HTML" = "1" ]; then COV_OPTS+=(--cov-report=html); fi
python3 -m pytest tests/ -q "${COV_OPTS[@]}" "${EXTRA[@]}"
[ "$HTML" = "1" ] && echo "htmlcov/ 已产出(浏览器打开 htmlcov/index.html)"
