#!/usr/bin/env bash
# d2d 全栈启动: graphd + egress-gateway(出网治理) + oast(带外回调) + dsh web(面板)
# 推荐路径: systemd user 单元(scripts/systemd/install.sh --start) — 带 Restart=on-failure 守护。
# 本脚本保留为无 systemd 环境的兜底启动器; 所有路径派生自 $HOME, 无硬编码。
#
# 0913 加固(审查采纳):
#   - PID 文件管理(${D2D_DATA_DIR}/run/*.pid): stop 子命令优雅终止(TERM→等→KILL)
#   - graphd 启动后 /health 健康检查(失败 fast-fail, 不再盲等 2s 后带病启动全家)
#   - 兜底 pkill 锚定本仓库绝对路径/端口, 不误杀其他项目的同名脚本/其他 dsh 实例
#   - 每个服务 nohup 后立即捕获 PID 到变量($! 只随新后台任务更新, 但显式捕获抗改动)
# 用法: ops/start-all.sh [start|stop|restart]
set -euo pipefail
export DSH_HOME="${DSH_HOME:-${HOME}/.dsh}"
export D2D_DATA_DIR="${D2D_DATA_DIR:-${HOME}/.d2d-data}"
export D2D="${D2D:-${HOME}/d2d}"
export P2P_HOST_TOKEN="${P2P_HOST_TOKEN:-$(cat "${HOME}/.config/d2d/host-token" 2>/dev/null || true)}"
export P2P_GRAPHD="http://127.0.0.1:8766"
WEB_PORT="${WEB_PORT:-8899}"
RUN_DIR="${D2D_DATA_DIR}/run"
mkdir -p "${RUN_DIR}"

ACTION="${1:-start}"

# 优雅终止: PID 文件优先(TERM→等 5s→KILL), 兜底 pkill 只锚定本仓库绝对路径/端口
kill_svc() {          # $1=名称 $2=匹配串(已含绝对路径锚或端口锚)
  local pf="${RUN_DIR}/$1.pid" pid=""
  if [ -f "$pf" ]; then pid="$(cat "$pf" 2>/dev/null || true)"; fi
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
    kill -KILL "$pid" 2>/dev/null || true
  else
    # 无 PID 文件(历史裸启)才用 pkill 兜底 — 锚定 ${D2D} 绝对路径/端口, 不误伤其他项目
    pkill -TERM -f "$2" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do pgrep -f "$2" >/dev/null 2>&1 || break; sleep 0.5; done
    pkill -KILL -f "$2" 2>/dev/null || true
  fi
  rm -f "$pf"
}

if [ "$ACTION" = "stop" ] || [ "$ACTION" = "restart" ]; then
  echo "[stop] graphd / egress-gateway / oast / cdp-proxy / dsh web"
  kill_svc graphd   "${D2D}/graphd/app.py"
  kill_svc egress   "${D2D}/scripts/gateway/egress-gateway.mjs"
  kill_svc oast     "${D2D}/scripts/gateway/oast.mjs"
  kill_svc cdpproxy "${D2D}/scripts/browser/cdp-proxy.mjs"
  # dsh web 同走 kill_svc(PID 文件优先, 端口锚定兜底) — 与其他服务行为对称
  kill_svc dshweb   "dsh --profile web --port ${WEB_PORT}"
  if [ "$ACTION" = "stop" ]; then exit 0; fi
fi

# ↓↓↓ 按需注入你的模型 API key(与 cordis.patch.yml 的 apiKeyEnv 对应)
# export PROVIDER_A_API_KEY=sk-...
# export PROVIDER_B_API_KEY=sk-...

# 优先走 systemd 守护单元(存在即用): 裸进程无守护, 崩溃无人拉起(0905 实证)
if command -v systemctl >/dev/null 2>&1 && ls "${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/d2d-graphd.service" >/dev/null 2>&1; then
  exec bash "$(dirname "$0")/../scripts/systemd/install.sh" --start
fi

# graphd: #14 优雅起停 — kill -9 会丢未 checkpoint 提交; 健康检查失败 fast-fail 不带病启动全家
nohup python3 "${D2D}/graphd/app.py" > "${D2D_DATA_DIR}/graphd.log" 2>&1 &
GRAPHDPID=$!
echo "${GRAPHDPID}" > "${RUN_DIR}/graphd.pid"
ok=0
for _ in $(seq 1 15); do
  if curl -sf -m 2 http://127.0.0.1:8766/health >/dev/null 2>&1; then ok=1; break; fi
  kill -0 "${GRAPHDPID}" 2>/dev/null || break   # 进程已死, 不必再等
  sleep 1
done
if [ "${ok}" != "1" ]; then
  echo "✗ graphd 健康检查失败(15s) — 后续服务不启动。日志: ${D2D_DATA_DIR}/graphd.log"
  exit 1
fi
echo "graphd → http://127.0.0.1:8766 (pid ${GRAPHDPID}, /health OK)"

# V-08 出网治理网关: 连接层 scope 强制(每 30s 动态拉 Engagement.scope ∪ 静态白名单,
# 子域通配/CIDR) + per-host 令牌桶限速 + 全量请求审计(→ DATA_DIR/evidence/proxy)。
# worker 的 curl 经 http_proxy 连接层强制走网关(graphd 回环走 NO_PROXY 豁免)。
nohup node "${D2D}/scripts/gateway/egress-gateway.mjs" > "${D2D_DATA_DIR}/egress-gateway.log" 2>&1 &
EGRESSPID=$!
echo "${EGRESSPID}" > "${RUN_DIR}/egress.pid"
sleep 1
kill -0 "${EGRESSPID}" 2>/dev/null || echo "⚠ egress-gateway 启动后即退出 — 查 ${D2D_DATA_DIR}/egress-gateway.log"
echo "egress-gateway → http://127.0.0.1:8888 (pid ${EGRESSPID})"
export P2P_PROXY_URL="http://127.0.0.1:8888"

# G2 带外回调服务(盲注自主确认): HTTP 通道; DNS 通道需公网部署(见 oast.mjs 头注释)
nohup node "${D2D}/scripts/gateway/oast.mjs" > "${D2D_DATA_DIR}/oast.log" 2>&1 &
OASTPID=$!
echo "${OASTPID}" > "${RUN_DIR}/oast.pid"
sleep 1
kill -0 "${OASTPID}" 2>/dev/null || echo "⚠ oast 启动后即退出 — 查 ${D2D_DATA_DIR}/oast.log"
echo "oast → http://127.0.0.1:8890 (pid ${OASTPID})"
export P2P_OAST_HOST="127.0.0.1:8890"

# E-7 SPA 渲染面执行器(需本机 chrome, 默认不启; 启用后取消注释):
# nohup node "${D2D}/scripts/gateway/spa-render.mjs" > "${D2D_DATA_DIR}/spa-render.log" 2>&1 &
# export P2P_SPA_URL="http://127.0.0.1:8891"

nohup dsh --profile web --port "${WEB_PORT}" --no-open --host 127.0.0.1 > "${D2D_DATA_DIR}/dsh-web.log" 2>&1 &
DSHWBPID=$!
echo "${DSHWBPID}" > "${RUN_DIR}/dshweb.pid"
echo "dsh web → http://127.0.0.1:${WEB_PORT} (pid ${DSHWBPID})"
echo "打开浏览器 → 右侧边栏 'd2d' / 'd2d Findings' 两个 tab 即面板"
echo "停止: ${D2D}/ops/start-all.sh stop"
