#!/usr/bin/env bash
# d2d 全栈启动: graphd + egress-gateway(出网治理) + oast(带外回调) + dsh web(面板)
# 推荐路径: systemd user 单元(scripts/systemd/install.sh --start) — 带 Restart=on-failure 守护。
# 本脚本保留为无 systemd 环境的兜底启动器; 所有路径派生自 $HOME, 无硬编码。
set -euo pipefail
export DSH_HOME="${DSH_HOME:-${HOME}/.dsh}"
export D2D_DATA_DIR="${D2D_DATA_DIR:-${HOME}/.d2d-data}"
export D2D="${D2D:-${HOME}/d2d}"
export P2P_HOST_TOKEN="${P2P_HOST_TOKEN:-$(cat "${HOME}/.config/d2d/host-token" 2>/dev/null || true)}"
export P2P_GRAPHD="http://127.0.0.1:8766"

# ↓↓↓ 按需注入你的模型 API key(与 cordis.patch.yml 的 apiKeyEnv 对应)
# export PROVIDER_A_API_KEY=sk-...
# export PROVIDER_B_API_KEY=sk-...

# 优先走 systemd 守护单元(存在即用): 裸进程无守护, 崩溃无人拉起(0905 实证)
if command -v systemctl >/dev/null 2>&1 && ls "${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/d2d-graphd.service" >/dev/null 2>&1; then
  exec bash "$(dirname "$0")/../scripts/systemd/install.sh" --start
fi

pkill -f "graphd/app.py" 2>/dev/null || true
pkill -f "gateway/egress-gateway.mjs" 2>/dev/null || true
pkill -f "gateway/oast.mjs" 2>/dev/null || true
pkill -f "dsh --profile web" 2>/dev/null || true
sleep 1

nohup python3 "${D2D}/graphd/app.py" > "${D2D_DATA_DIR}/graphd.log" 2>&1 &
echo "graphd → http://127.0.0.1:8766 (pid $!)"
sleep 2

# V-08 出网治理网关: 连接层 scope 强制(每 30s 动态拉 Engagement.scope ∪ 静态白名单,
# 子域通配/CIDR) + per-host 令牌桶限速 + 全量请求审计(→ DATA_DIR/evidence/proxy)。
# worker 的 curl 经 http_proxy 连接层强制走网关(graphd 回环走 NO_PROXY 豁免)。
nohup node "${D2D}/scripts/gateway/egress-gateway.mjs" > "${D2D_DATA_DIR}/egress-gateway.log" 2>&1 &
echo "egress-gateway → http://127.0.0.1:8888 (pid $!)"
export P2P_PROXY_URL="http://127.0.0.1:8888"

# G2 带外回调服务(盲注自主确认): HTTP 通道; DNS 通道需公网部署(见 oast.mjs 头注释)
nohup node "${D2D}/scripts/gateway/oast.mjs" > "${D2D_DATA_DIR}/oast.log" 2>&1 &
echo "oast → http://127.0.0.1:8890 (pid $!)"
export P2P_OAST_HOST="127.0.0.1:8890"

# E-7 SPA 渲染面执行器(需本机 chrome, 默认不启; 启用后取消注释):
# nohup node "${D2D}/scripts/gateway/spa-render.mjs" > "${D2D_DATA_DIR}/spa-render.log" 2>&1 &
# export P2P_SPA_URL="http://127.0.0.1:8891"

nohup dsh --profile web --port 8899 --no-open --host 127.0.0.1 > "${D2D_DATA_DIR}/dsh-web.log" 2>&1 &
echo "dsh web → http://127.0.0.1:8899 (pid $!)"
echo "打开浏览器 → 右侧边栏 'd2d' / 'd2d Findings' 两个 tab 即面板"
