#!/usr/bin/env bash
# fleet.sh — 多 d2d 并行靶场舰队: N 条车道各绑一个靶场, PASS 后 sync 汇总到 control(:8766 标准库)
# 用法: bash fleet.sh <queue-file> [lanes=2]   队列文件每行: <profile名> [local|online]
# 车道端口: laneB=8767 laneC=8768 laneD=8769 ... ; 并发上限由 auto-concurrency 裁决(本机=2)
set -u
QUEUE=${1:?queue file required}
LANES=${2:-2}
BASE=${LANE_BASE:-8767}
LOGD=/home/wff/d2d/.d2d-review
P2P_DIR=/home/wff/d2d
mapfile -t RANGES < <(grep -vE '^\s*(#|$)' "$QUEUE")
echo "$(date -Iseconds) | fleet start: ${#RANGES[@]} ranges -> $LANES lanes (base port $BASE)"
for i in $(seq 0 $((LANES-1))); do
  PORT=$((BASE+i)); LANE="laneB$([ $i -eq 0 ] && echo '' || echo $i)"; LANE="lane$((i+1))"
  RANGE=${RANGES[$((i % ${#RANGES[@]}))]%|*}; KIND=${RANGES[$((i % ${#RANGES[@]}))]##*|}
  PROF=$(ls /home/wff/ranges/profiles/$RANGE.json /home/wff/d2d/profiles/$RANGE.json 2>/dev/null | head -1)
  [ -z "$PROF" ] && { echo "skip $RANGE (no profile)"; continue; }
  if [ "$KIND" = "local" ] && [ -f "$P2P_DIR/ranges-local/$RANGE.sh" ]; then bash "$P2P_DIR/ranges-local/$RANGE.sh" up || { echo "docker up 失败: $RANGE"; continue; }; fi
  W=/tmp/d2d-$LANE; mkdir -p $W; cp -r $P2P_DIR/plugin $P2P_DIR/graphd $W/ 2>/dev/null
  WT=$(cat ~/.config/d2d/host-token)
  ( cd $W && P2P_GRAPH_PORT=$PORT P2P_HOST_TOKEN_FILE=$HOME/.config/d2d/host-token \
      P2P_WORKER_TOKEN_FILE=$HOME/.config/d2d/worker-token nohup python3 graphd/app.py > graphd.log 2>&1 & )
  sleep 2
  ( cd $W && P2P_OPEN_RANGE=0 P2P_GRAPHD=http://127.0.0.1:$PORT P2P_HOST_TOKEN_FILE=$HOME/.config/d2d/host-token \
      D2D_ROOT=$W R_TARGET=$(python3 -c "import json;print(json.load(open('$PROF'))['url'])") \
      R_SCOPE=$(python3 -c "import json;print(json.load(open('$PROF'))['scope'])") R_INST=2 \
      http_proxy=http://127.0.0.1:8888 https_proxy=http://127.0.0.1:8888 NO_PROXY=127.0.0.1,localhost \
      P2P_PROXY_URL=http://127.0.0.1:8888 node round-launch.mjs dsh > /tmp/$LANE.log 2>&1 & )
  echo "$(date -Iseconds) | $LANE(:$PORT) -> $RANGE ($KIND)" | tee -a $LOGD/S21-test-log.md
done
