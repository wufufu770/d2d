#!/usr/bin/env bash
# scripts/ops/spa-start.sh — 黄金 SPA 靶场启停(4.5-0)
#
# start: nohup 后台起 node tests/golden-targets/spa/spa-server.mjs
#        pid 文件 ${D2D_DATA_DIR:-~/.d2d-data}/run/spa-target.pid, 日志 run/spa-target.log
#        就绪判据: GET /api/notes → 401 且 GET / → 200(15s 上限)
# stop : TERM → 等待 5s → 仍存活则 KILL
# 用法: bash scripts/ops/spa-start.sh {start|stop}
# env : D2D_DATA_DIR(默认 ~/.d2d-data)  D2D_SPA_PORT(默认 8894, 与 spa-server.mjs 一致)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVER="$ROOT/tests/golden-targets/spa/spa-server.mjs"
DATA_DIR="${D2D_DATA_DIR:-$HOME/.d2d-data}"
RUN_DIR="$DATA_DIR/run"
PID_FILE="$RUN_DIR/spa-target.pid"
LOG_FILE="$RUN_DIR/spa-target.log"
PORT="${D2D_SPA_PORT:-8894}"
URL="http://127.0.0.1:$PORT"

alive() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

start() {
  mkdir -p "$RUN_DIR"
  if alive; then
    echo "[spa] 已在运行(pid $(cat "$PID_FILE"), $URL), 无需重复启动。"
    return 0
  fi
  if [ ! -f "$SERVER" ]; then
    echo "[spa] ERROR: 缺服务端文件 $SERVER"
    exit 1
  fi
  nohup node "$SERVER" >>"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
  echo "[spa] 启动中 pid=$(cat "$PID_FILE") port=$PORT log=$LOG_FILE ..."
  local deadline=$(( SECONDS + 15 )) notes="" index=""
  while [ "$SECONDS" -lt "$deadline" ]; do
    if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "[spa] ERROR: 进程启动即退出, 日志尾部:"
      tail -n 20 "$LOG_FILE" || true
      rm -f "$PID_FILE"
      exit 1
    fi
    notes="$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/notes" || true)"
    index="$(curl -s -o /dev/null -w '%{http_code}' "$URL/" || true)"
    if [ "$notes" = "401" ] && [ "$index" = "200" ]; then
      echo "[spa] 已就绪: /api/notes=$notes(期望401) /=$index(期望200)"
      echo "[spa] pid=$(cat "$PID_FILE") url=$URL 故意漏洞: V1 /api/admin/stats(无鉴权) V2 /api/search?q= V3 /ws"
      return 0
    fi
    sleep 1
  done
  echo "[spa] ERROR: 15s 内探测未达标(/api/notes=${notes:-无} /=${index:-无}), 日志尾部:"
  tail -n 20 "$LOG_FILE" || true
  kill "$(cat "$PID_FILE")" 2>/dev/null || true
  rm -f "$PID_FILE"
  exit 1
}

stop() {
  if ! alive; then
    echo "[spa] 未在运行(清理 pid 文件: $PID_FILE)。"
    rm -f "$PID_FILE" 2>/dev/null || true
    return 0
  fi
  local pid
  pid="$(cat "$PID_FILE")"
  kill -TERM "$pid" 2>/dev/null || true
  local deadline=$(( SECONDS + 5 ))
  while [ "$SECONDS" -lt "$deadline" ] && kill -0 "$pid" 2>/dev/null; do
    sleep 1
  done
  if kill -0 "$pid" 2>/dev/null; then
    echo "[spa] TERM 后仍存活, 升级 KILL(pid $pid)。"
    kill -KILL "$pid" 2>/dev/null || true
    sleep 1
  fi
  rm -f "$PID_FILE"
  echo "[spa] 已停止(pid $pid)。"
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  *)
    echo "用法: $0 {start|stop}"
    exit 2
    ;;
esac
