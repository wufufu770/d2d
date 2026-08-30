#!/usr/bin/env bash
# watchdog v3 — 确定性自驱巡检(800s 循环): 健康自愈 + 车道终态处置(PASS 合流换靶/FAIL 缺口重启/3轮归档)
#               + R3: 空闲车道自动学习进化(curate→study→影子晋级→实战证据晋级)
LOG=/home/wff/d2d/.d2d-review/S21-test-log.md; D2D=/home/wff/d2d; WT=$(cat ~/.config/d2d/host-token)
DATA_DIR=${D2D_DATA_DIR:-$HOME/.d2d-data}
queues() { python3 -c "import json;print(' '.join(json.load(open('/home/wff/d2d/profiles/online-queue.json'))))"; }
# 车道 launcher 判定必须按 port 区分(全局 pgrep 会把别道 launcher 认成自己的)
lane_busy() {
  local p=$1
  for P in $(pgrep -f 'round-launch.mjs dsh' 2>/dev/null); do
    tr '\0' '\n' < /proc/$P/environ 2>/dev/null | grep -q "P2P_GRAPHD=http://127.0.0.1:$p" && return 0
  done
  return 1
}
workers_busy() { pgrep -f 'profile [h]eadless' >/dev/null 2>&1; }
declare -A CUR=( [8767]="dvwa" [8768]="idle" )
declare -A ATT=( [8767]=1 [8768]=0 )
while true; do
  for p in 8766 8767 8768; do
    ss -ltn | grep -q ":$p " || (cd $( [ $p = 8766 ] && echo /home/wff/d2d/graphd || echo /tmp/d2d-lane$([ $p = 8767 ] && echo B || echo C) ) && P2P_GRAPH_PORT=$p nohup python3 app.py >> graphd.log 2>&1 & echo "$(date -Iseconds) | watchdog: graphd $p 自愈重启" >> $LOG)
  done
  curl -s -m 3 http://127.0.0.1:8888/health >/dev/null || (cd $D2D && P2P_PROXY_PORT=8888 nohup node scripts/gateway/egress-gateway.mjs > /tmp/egress-gw.log 2>&1 & echo "$(date -Iseconds) | watchdog: egress-gateway 自愈重启" >> $LOG)
  for p in 8767 8768; do
    LANE=$([ $p = 8767 ] && echo B || echo C); W=/tmp/d2d-lane$LANE; RANGE=${CUR[$p]}; A=${ATT[$p]}
    [ "$RANGE" = "idle" ] && continue
    ST=$(curl -s -m 5 -X POST http://127.0.0.1:$p/query -H 'Content-Type: application/json' -H "X-Auth: $WT" -d '{"cypher":"MATCH (e:Engagement) RETURN e.status AS s LIMIT 1"}' | python3 -c "import json,sys;print((json.load(sys.stdin).get('rows') or [{'s':'none'}])[0]['s'])" 2>/dev/null)
    if lane_busy $p && [ "$ST" = "active" ]; then
      echo "$(date -Iseconds) | watchdog tick lane$LANE $RANGE a$A running" >> $LOG; continue
    fi
    [ "$ST" = "active" ] && continue  # engagement 在飞但 launcher 未现身——下轮再判
    EV=$(P2P_HOST_TOKEN=$WT timeout 120 python3 $D2D/scripts/eval/eval_profile.py $p /home/wff/ranges/profiles/$RANGE.json 2>/dev/null)
    PASS=$(echo "$EV" | python3 -c "import json,sys;print(json.load(sys.stdin).get('PASS'))" 2>/dev/null)
    echo "$(date -Iseconds) | watchdog: lane$LANE $RANGE a$A/3 终态=$ST PASS=$PASS" | tee -a $LOG
    if [ "$PASS" = "True" ]; then
      bash $D2D/.d2d-review/scripts/sync-control.sh lane$LANE >> $LOG 2>&1
      echo "$(date -Iseconds) | ✅ $RANGE PASS @attempt $A -> 经验已 sync control" | tee -a $LOG
      ATT[$p]=0; CUR[$p]=$(queues | awk '{print $1}'); RANGE=${CUR[$p]}
    elif [ "$A" -ge 3 ]; then
      echo "$(date -Iseconds) | ❌ $RANGE 3轮未过 -> 归档换下一靶" | tee -a $LOG
      ATT[$p]=0; CUR[$p]=$(queues | awk -v cur="$RANGE" '{for(i=1;i<=NF;i++) if($i==cur){print $(i<NF?i+1:$1); exit}}'); RANGE=${CUR[$p]}
    else
      ATT[$p]=$((A+1))
    fi
    HINTS=$(echo "$EV" | python3 -c "import json,sys;d=json.load(sys.stdin);h=[f'类:{k}' for k,v in d.get('class_detail',{}).items() if not v]+[f'证据:{k}' for k,v in d.get('artifact_detail',{}).items() if not v];print(';'.join(h))" 2>/dev/null)
    PROF=/home/wff/ranges/profiles/$RANGE.json
    URL=$(python3 -c "import json;print(json.load(open('$PROF'))['url'])" 2>/dev/null); SCOPE=$(python3 -c "import json;print(json.load(open('$PROF'))['scope'])" 2>/dev/null)
    for lbl in Engagement Finding Hypothesis Endpoint AgentIdentity Signal_ Task Handoff; do
      curl -s -m 5 -X POST http://127.0.0.1:$p/query -H 'Content-Type: application/json' -H "X-Auth: $WT" -d "{\"cypher\":\"MATCH (n:$lbl) DETACH DELETE n\"}" >/dev/null
    done
    if [ -f "/home/wff/ranges/profiles/$RANGE.seeds.json" ]; then
      python3 -c "
import json,os,urllib.request
tok=open(os.path.expanduser('~/.config/d2d/host-token')).read().strip()
for s in json.load(open('/home/wff/ranges/profiles/$RANGE.seeds.json')):
    r=urllib.request.Request('http://127.0.0.1:$p/write/hypothesis',data=json.dumps({**s,'id':'seed-'+os.urandom(3).hex()}).encode(),headers={'Content-Type':'application/json','X-Auth':tok});urllib.request.urlopen(r,timeout=10)" 2>/dev/null
    fi
    # R2b/R3: eval 后自动建模闭环 + 知识脑影子晋级(实战证据在 lane 产出后由下方空闲块晋升)
    SUG=$(P2P_HOST_TOKEN=$WT timeout 60 python3 $D2D/scripts/eval/profile_suggest.py $p /home/wff/ranges/profiles/$RANGE.json 2>/dev/null)
    echo "$SUG" | grep -q '"action"' && { P2P_HOST_TOKEN=$WT timeout 60 python3 $D2D/scripts/eval/profile_suggest.py $p /home/wff/ranges/profiles/$RANGE.json --apply >/dev/null 2>&1; echo "$(date -Iseconds) | watchdog: $RANGE profile_suggest 自动建模已应用" >> $LOG; }
    ( cd $W && P2P_OPEN_RANGE=0 P2P_OPEN_RECON=1 P2P_GRAPHD=http://127.0.0.1:$p P2P_HOST_TOKEN_FILE=$HOME/.config/d2d/host-token D2D_ROOT=$W \
      P2P_OAST_HOST=127.0.0.1:8890 R_TARGET=$URL R_SCOPE=$SCOPE R_INST=2 http_proxy=http://127.0.0.1:8888 https_proxy=http://127.0.0.1:8888 \
      NO_PROXY=127.0.0.1,localhost P2P_PROXY_URL=http://127.0.0.1:8888 P2P_GAP_HINTS="$HINTS" nohup node round-launch.mjs dsh > /tmp/lane$LANE.log 2>&1 & )
    echo "$(date -Iseconds) | watchdog: lane$LANE === $RANGE attempt ${ATT[$p]}/3 hints=[$HINTS] ===" | tee -a $LOG
  done
  # R3 知识脑空闲进化: 无活跃 worker 时 curate→study→staged→影子; 影子有实战命中即晋升 current(无证据则礼貌退出)
  if ! workers_busy; then
    bash $D2D/scripts/brain/curate.sh >> $LOG 2>&1
    if [ ! -d "$DATA_DIR/brain/staged" ] || [ -z "$(ls -A $DATA_DIR/brain/staged 2>/dev/null)" ]; then
      node $D2D/scripts/brain/study.mjs --apply >> $DATA_DIR/study.log 2>&1
      # R4b: 只在 staged 真有产出时记日志(空 inbox 空转不刷屏)
      [ -n "$(ls -A $DATA_DIR/brain/staged 2>/dev/null)" ] && echo "$(date -Iseconds) | watchdog: 知识脑 study 产出 staged" >> $LOG
    fi
    [ -d "$DATA_DIR/brain/staged" ] && [ -n "$(ls -A $DATA_DIR/brain/staged 2>/dev/null)" ] && node $D2D/scripts/brain/promote.mjs --to-shadow >> $LOG 2>&1
    node $D2D/scripts/brain/promote.mjs --to-current >> $LOG 2>&1
  fi
  sleep 800
done
