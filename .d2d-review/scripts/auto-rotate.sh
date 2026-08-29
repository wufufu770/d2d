#!/bin/bash
# auto-rotate.sh — PASS 后自动换下一在线靶场（S21 扩展: 在线优先队列）
# 用法: nohup bash auto-rotate.sh > /tmp/auto-rotate.log 2>&1 &
set -u
LOG=/home/wff/d2d/.d2d-review/S21-test-log.md
QUEUE_FILE=/home/wff/ranges/profiles/online-queue.json
WT=$(cat /home/wff/.config/d2d/host-token)
TICK=800
# V-08 完整修复: worker 出网统一经 egress-gateway(连接层 scope 强制+限速+审计); graphd 走 NO_PROXY 直连
export http_proxy=http://127.0.0.1:8888 https_proxy=http://127.0.0.1:8888
export NO_PROXY=127.0.0.1,localhost
export P2P_PROXY_URL=http://127.0.0.1:8888
MAX_ATTEMPTS=3
PORT=8767
TARGET_HOST="127.0.0.1"

get_queue() { python3 -c "import json; print('\n'.join(json.load(open('$QUEUE_FILE'))))"; }

pass_check() {  # $1=profile path -> echo PASS|FAIL
  local ev
  ev=$(P2P_HOST_TOKEN=$WT python3 /home/wff/d2d/scripts/eval/eval_profile.py $PORT "$1" 2>/dev/null)
  echo "$ev" | python3 -c "import json,sys; d=json.load(sys.stdin); print('PASS' if d['PASS'] else 'FAIL')" 2>/dev/null || echo "FAIL"
}

launch_range() {  # $1=name $2=url $3=scope
  (nohup bash -c "cd /tmp/d2d-laneB && P2P_OPEN_RANGE=0 P2P_GRAPHD=http://127.0.0.1:$PORT \
    P2P_HOST_TOKEN_FILE=/home/wff/.config/d2d/host-token D2D_ROOT=/tmp/d2d-laneB \
    R_TARGET=$2 R_SCOPE=$3 R_INST=2 node round-launch.mjs dsh" > /tmp/laneB.log 2>&1 &)
  echo "$(date -Iseconds) | launched $1 ($2)" | tee -a $LOG
}

wipe_graph() {
  for lbl in Engagement Finding Hypothesis Endpoint AgentIdentity Signal_; do
    curl -m 5 -s -X POST http://127.0.0.1:$PORT/query -H "Content-Type: application/json" \
      -H "X-Auth: $WT" -d "{\"cypher\":\"MATCH (n:$lbl) DETACH DELETE n\"}" > /dev/null
  done
}

sync_exp() {  # PASS 后先合流 worker 经验到 control 再 wipe（S21 sync 纪律）
  python3 - << 'PY'
import json, os, urllib.request
tok = open(os.path.expanduser('~/.config/d2d/host-token')).read().strip()
def q(port, cypher, params=None):
    req = urllib.request.Request(f"http://127.0.0.1:{port}/query",
        data=json.dumps({"cypher": cypher, "params": params or {}}).encode(),
        headers={"Content-Type": "application/json", "X-Auth": tok})
    return json.loads(urllib.request.urlopen(req, timeout=10).read())
try:
    rows = q(8767, "MATCH (e:ExperienceWeight) RETURN e.id AS id, e.pattern AS pattern, e.stack AS stack, e.prior AS prior, e.hits AS hits, e.wins AS wins, e.target_type AS target_type")["rows"]
    for r in rows:
        q(8766, "MERGE (e:ExperienceWeight {id:$id}) SET e.pattern=$p, e.stack=$s, e.prior=$pr, e.hits=$h, e.wins=$w, e.target_type=$t",
          {"id": r["id"], "p": r.get("pattern") or r["id"], "s": r.get("stack") or "web",
           "pr": float(r.get("prior") or 0.5), "h": int(r.get("hits") or 0), "w": int(r.get("wins") or 0),
           "t": r.get("target_type") or "web"})
    print(f"sync_exp: {len(rows)} rows -> control")
except Exception as e:
    print("sync_exp failed:", e)
PY
}

gap_hints() {  # $1=profile -> 从当前图态生成缺口提示(类+证据)
  P2P_HOST_TOKEN=$WT python3 /home/wff/d2d/scripts/eval/eval_profile.py $PORT "$1" 2>/dev/null | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    miss=[k for k,v in d.get('class_detail',{}).items() if not v]
    arts=[k for k,v in d.get('artifact_detail',{}).items() if not v]
    print(';'.join([f'类:{c}' for c in miss] + [f'证据:{a}' for a in arts]))
except: print('')
" 2>/dev/null
}

echo "$(date -Iseconds) | auto-rotate started, queue=$(cat $QUEUE_FILE | tr -d '\n')" | tee -a $LOG
for range in $(get_queue); do
  PROF=/home/wff/ranges/profiles/$range.json
  URL=$(python3 -c "import json; print(json.load(open('$PROF'))['url'])")
  SCOPE=$(python3 -c "import json; print(json.load(open('$PROF'))['scope'])")
  HINTS=""
  for attempt in $(seq 1 $MAX_ATTEMPTS); do
    # attempt>1 时从上一轮图态生成缺口提示（须在 wipe 前）
    if [ "$attempt" -gt 1 ] && [ -z "$HINTS" ]; then HINTS=$(gap_hints $PROF); fi
    echo "$(date -Iseconds) | === $range attempt $attempt/$MAX_ATTEMPTS hints=[$HINTS] ===" | tee -a $LOG
    wipe_graph
    (nohup bash -c "cd /tmp/d2d-laneB && P2P_OPEN_RANGE=0 P2P_GRAPHD=http://127.0.0.1:$PORT \
      P2P_HOST_TOKEN_FILE=/home/wff/.config/d2d/host-token D2D_ROOT=/tmp/d2d-laneB \
      R_TARGET=$URL R_SCOPE=$SCOPE R_INST=2 P2P_GAP_HINTS=\"$HINTS\" node round-launch.mjs dsh" > /tmp/laneB.log 2>&1 &)
    echo "$(date -Iseconds) | launched $range ($URL)" | tee -a $LOG
    # 等待 75min 上限, 每 TICK 秒检测 PASS
    for i in $(seq 1 $((75*60/TICK))); do
      sleep $TICK
      R=$(pass_check $PROF)
      echo "$(date -Iseconds) | $range tick: $R" | tee -a $LOG
      if [ "$R" = "PASS" ]; then
        echo "$(date -Iseconds) | ✅ $range PASS @attempt $attempt" | tee -a $LOG
        sync_exp >> $LOG 2>&1
        break 2
      fi
      # worker 全退出且非 PASS -> 提前收口并生成缺口提示
      ps aux | grep round-launch | grep -v grep | grep -q . || { HINTS=$(gap_hints $PROF); echo "$(date -Iseconds) | worker exited, attempt $attempt end ($R) hints=[$HINTS]" | tee -a $LOG; break; }
    done
  done
  if [ "$(pass_check $PROF)" = "PASS" ]; then
    echo "$(date -Iseconds) | $range PASSED -> next target" | tee -a $LOG
  else
    echo "$(date -Iseconds) | ❌ $range $MAX_ATTEMPTS 轮未 PASS -> 记录 gapHints, 下一靶" | tee -a $LOG
    P2P_HOST_TOKEN=$WT python3 /home/wff/d2d/scripts/eval/eval_profile.py $PORT $PROF 2>/dev/null | tail -n 20 | tee -a $LOG
  fi
done
echo "$(date -Iseconds) | queue done" | tee -a $LOG
