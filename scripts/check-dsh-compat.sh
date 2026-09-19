#!/usr/bin/env bash
# scripts/check-dsh-compat.sh — dsh 版本兼容性冒烟(蓝图 #20)
#
# 背景: dsh 是 developer preview, 六个 @deepseek-ai/dsh-* 包在 plugin/pentest-dsh/package.json
#       精确 pin 为 0.1.1-rc.2。本脚本对比 pinned 与 latest 两列的兼容性冒烟结果,
#       在 dsh 上游 breaking 时第一时间暴露差异。
# 语义: pinned 列失败 = 阻塞(退出 2); latest 列失败 = 仅通知(退出 3); 全部通过 = 退出 0。
#       CI 矩阵(.github/workflows/dsh-compat.yml)按 --channel 逐列调用。
# 用法: bash scripts/check-dsh-compat.sh [--channel pinned|latest|both]   # 默认 both
# 依赖: node>=22, npm; latest 列需要网络(临时目录安装, 不动工作树与既有 node_modules)。
# 探针口径:
#   ①dsh API 面: 六包可加载且导出非空 + dsh-tools.defineTool 为函数
#     (index.js:39/140 经 defineTool 注册 d2d 全部工具 — 该导出形态是 d2d 对 dsh 的硬依赖);
#   ②调度内核 boot: 复用既有 test/boot-import.test.mjs(scheduler.js + domain/ + scheduler/
#     全模块装配冒烟)。该测试不 import 任何 dsh 包(见其文件头注释), 与 dsh 版本无关,
#     故仅在 pinned 列执行, 作为内核回归锚点; latest 列只对比 dsh API 面。
set -u

REPO=$(cd "$(dirname "$0")/.." && pwd)
PLUGIN="$REPO/plugin/pentest-dsh"
CHANNEL="both"
if [ "${1:-}" = "--channel" ]; then
  CHANNEL="${2:?--channel 需要 pinned|latest|both}"
  case "$CHANNEL" in pinned|latest|both) ;; *) echo "非法 channel: $CHANNEL" >&2; exit 1;; esac
fi

DSH_PKGS="dsh-agent dsh-llm dsh-tools dsh-mcp-client dsh-session dsh-subagent"
PINNED_VER=$(node -e "console.log(require('$PLUGIN/package.json').dependencies['@deepseek-ai/dsh-agent'])")
TMP=$(mktemp -d /tmp/dsh-compat.XXXXXX)
trap 'rm -rf "$TMP"' EXIT

# 探针①: dsh 六包 API 面(bare import 从本文件位置向上解析 → 由调用方决定 $TMP/node_modules 指向谁)
cat > "$TMP/probe-dsh.mjs" <<'PROBE'
const pkgs = ['dsh-agent', 'dsh-llm', 'dsh-tools', 'dsh-mcp-client', 'dsh-session', 'dsh-subagent'];
const out = [];
for (const p of pkgs) {
  const m = await import('@deepseek-ai/' + p);
  const n = Object.keys(m).length;
  if (!n) { console.error('FAIL ' + p + ': 零导出'); process.exit(1); }
  out.push(p + '=' + n);
}
const t = await import('@deepseek-ai/dsh-tools');
if (typeof t.defineTool !== 'function') {
  console.error('FAIL dsh-tools.defineTool=' + typeof t.defineTool);
  process.exit(1);
}
console.log('DSH_PROBE_PASS ' + out.join(',') + ' defineTool:function');
PROBE

RES_VER=""; RES_SMOKE="?"
RES_NOTE=""

run_channel() {
  local ch="$1" rc=0 ver="" smoke="" note=""
  rm -rf "$TMP/node_modules" "$TMP/package.json" "$TMP/package-lock.json"
  if [ "$ch" = "latest" ]; then
    echo "--- [latest] npm install @deepseek-ai/*@latest → 临时目录(不动工作树) ---"
    local args="" p
    for p in $DSH_PKGS; do args="$args @deepseek-ai/$p@latest"; done
    # 六包 @latest 同装可能触发上游 peer 依赖 ERESOLVE(实测会) — 先直装, 失败自动
    # 以 --legacy-peer-deps 重试(gates.yml:62-63 容错安装先例同精神); "需要 legacy"
    # 这一事实本身写入结果行, 属于兼容性信号而非噪音。
    if npm install --prefix "$TMP" --no-audit --no-fund --no-save --loglevel=error $args >/dev/null 2>&1; then
      note=""
    elif npm install --prefix "$TMP" --no-audit --no-fund --no-save --loglevel=error --legacy-peer-deps $args >/dev/null 2>&1; then
      echo "[latest] 直接安装失败(ERESOLVE) — legacy-peer-deps 重试成功(该事实计入结果)"
      note=" via=legacy-peer-deps"
    else
      echo "[latest] INSTALL_FAIL(两次安装均失败) — 最近错误:"
      npm install --prefix "$TMP" --no-audit --no-fund --no-save $args 2>&1 | tail -5
      RES_VER="install-failed"; RES_SMOKE="FAIL"; RES_NOTE=""; return 1
    fi
    ver=$(node -e "console.log(require('$TMP/node_modules/@deepseek-ai/dsh-agent/package.json').version)")
  else
    echo "--- [pinned] 使用 plugin 现装 node_modules($PINNED_VER; 缺失时 npm ci 兜底) ---"
    if [ ! -d "$PLUGIN/node_modules/@deepseek-ai/dsh-agent" ]; then
      (cd "$PLUGIN" && { npm ci --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null 2>&1; }) \
        || { echo "[pinned] INSTALL_FAIL"; RES_VER="$PINNED_VER"; RES_SMOKE="FAIL"; return 1; }
    fi
    ln -sfn "$PLUGIN/node_modules" "$TMP/node_modules"
    ver="$PINNED_VER"
  fi
  echo "--- [$ch] 探针①: dsh 六包 API 面 ---"
  if node "$TMP/probe-dsh.mjs"; then smoke="PASS"; else smoke="FAIL"; rc=1; fi
  if [ "$ch" = "pinned" ]; then
    echo "--- [$ch] 探针②: d2d 调度内核 boot(复用 test/boot-import.test.mjs) ---"
    if (cd "$PLUGIN" && npx mocha test/boot-import.test.mjs --reporter min >/dev/null 2>&1); then
      echo "[$ch] boot=PASS"
    else
      echo "[$ch] boot=FAIL"; smoke="FAIL"; rc=1
    fi
  fi
  RES_VER="$ver"; RES_SMOKE="$smoke"; RES_NOTE="$note"
  echo "RESULT $ch=$ver SMOKE=$smoke$note"
  return $rc
}

PIN_SMOKE="?"; LAT_SMOKE="?"; LAT_VER="-"
if [ "$CHANNEL" = "pinned" ] || [ "$CHANNEL" = "both" ]; then
  run_channel pinned; PIN_RC=$?; PIN_SMOKE="$RES_SMOKE"
fi
if [ "$CHANNEL" = "latest" ] || [ "$CHANNEL" = "both" ]; then
  run_channel latest; LAT_RC=$?; LAT_SMOKE="$RES_SMOKE"; LAT_VER="$RES_VER"
fi

echo "== dsh-compat 结果 =="
[ "$CHANNEL" != "latest" ] && echo "pinned: $PINNED_VER  SMOKE=$PIN_SMOKE"
[ "$CHANNEL" != "pinned" ] && echo "latest: $LAT_VER  SMOKE=$LAT_SMOKE"

if [ "$PIN_SMOKE" = "FAIL" ]; then
  echo "pinned 列失败: 阻塞(退出 2) — 当前锁定版本自身冒烟不通过, 检查本地环境或 lock 完整性"
  exit 2
fi
if [ "$LAT_SMOKE" = "FAIL" ]; then
  echo "latest 列失败: 仅通知, 不阻塞(退出 3) — dsh 上游可能有 breaking change, 评估是否需要重锁版本"
  exit 3
fi
echo "ALL PASS"
exit 0
