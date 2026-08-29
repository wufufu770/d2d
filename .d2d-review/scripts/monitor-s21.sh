#!/bin/bash
# S21 100s 监控：检测 laneB/C, 评估 coverage, 触发 sync, 3 轮后推 GitHub
LOG=/home/wff/d2d/.d2d-review/S21-test-log.md
CONCURRENCY_LOG=/home/wff/d2d/.d2d-review/concurrency.log
while true; do
  TS=$(date -Iseconds)
  echo "=== $TS 100s tick ===" | tee -a $LOG
  tail -1 $CONCURRENCY_LOG 2>/dev/null | tee -a $LOG
  for lane in "laneB:8767:testaspnet" "laneC:8768:aspgoat"; do
    IFS=: read name port range <<< "$lane"
    HEALTH=$(curl -m 2 -s http://127.0.0.1:$port/health 2>&1 | head -c 60)
    LOGTAIL=$(tail -n 2 /tmp/${name}.log 2>&1 | head -c 200 | tr '\n' ' ' | sed 's/"/ /g')
    PROFILE=/home/wff/ranges/profiles/${range}.json
    if [ ! -f "$PROFILE" ]; then PROFILE=/home/wff/d2d/ranges/profiles/${range}.json; fi
    if [ ! -f "$PROFILE" ]; then PROFILE=/home/wff/d2d/scripts/eval/../ranges/profiles/${range}.json; fi
    if [ -f "$PROFILE" ]; then
      WT=$(cat /home/wff/.config/d2d/host-token 2>&1)
      EVAL=$(P2P_HOST_TOKEN=$WT python3 /home/wff/d2d/scripts/eval/eval_profile.py $port $PROFILE 2>&1 | head -n 30)
      # try to extract coverage
      COV=$(echo "$EVAL" | grep -o '"covered":"[^"]*"' | head -1)
      echo "$name $port $range health:${HEALTH:0:40} $COV log:${LOGTAIL:0:80}" | tee -a $LOG
      echo "$EVAL" | tail -n 10 | tee -a $LOG
    else
      echo "$name $port $range health:${HEALTH:0:40} log:${LOGTAIL:0:80} (no profile $PROFILE)" | tee -a $LOG
    fi
  done
  echo "" | tee -a $LOG
  sleep 800
done
