#!/bin/bash
# 3 档自适应：检测 load + mem + kuzu 锁等待（S21 修复版）
while true; do
  LOAD=$(uptime | awk -F'load average:' '{print $2}' | awk -F, '{print $1}' | tr -d ' ')
  # locale 无关: 直接取第2行(Mem 行)前3列, 避免 zh_CN "内存：" 导致 grep Mem 失配
  MEM_PCT=$(free | awk 'NR==2{printf "%.0f", $3/$2*100}')
  # kuzu 锁等待：检查 :8766 是否 LISTEN（0=异常）
  KUZU_LOCK=$(ss -ltn | grep -c ":8766" || echo 0)
  # bc 可能缺失，改用 awk 比较
  HIGH_LOAD=$(awk -v l="$LOAD" 'BEGIN{print (l>3.5)?1:0}')
  MED_LOAD=$(awk -v l="$LOAD" 'BEGIN{print (l>1.5)?1:0}')
  
  if [ "$HIGH_LOAD" -eq 1 ] || [ "$MEM_PCT" -gt 85 ] || [ "$KUZU_LOCK" -eq 0 ]; then
    echo "HIGH load=${LOAD} mem=${MEM_PCT}% kuzu=${KUZU_LOCK} → 1 lane"
    # 修复: env 变量不在 cmdline, pkill -f 匹配不到; 改扫 /proc/*/environ 杀 laneC(8768)/laneD(8769) worker
    for pid in $(pgrep -f 'round-launch|/bin/dsh' 2>/dev/null); do
      if tr '\0' '\n' < /proc/$pid/environ 2>/dev/null | grep -q 'P2P_GRAPHD=http://127.0.0.1:876[89]'; then
        kill -9 "$pid" 2>/dev/null && echo "  killed laneC/D worker pid=$pid"
      fi
    done
    LANES=1
  elif [ "$MED_LOAD" -eq 1 ]; then
    echo "MEDIUM load=${LOAD} mem=${MEM_PCT}% → 2 lanes"
    LANES=2
  else
    echo "LOW load=${LOAD} mem=${MEM_PCT}% → 3 lanes"
    LANES=3
  fi
  echo "$(date -Iseconds) | load=$LOAD mem=${MEM_PCT}% kuzu=$KUZU_LOCK lanes=$LANES" >> /home/wff/d2d/.d2d-review/concurrency.log
  sleep 800
done
