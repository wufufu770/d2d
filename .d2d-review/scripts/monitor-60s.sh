#!/usr/bin/env bash
set -e
ITER_FILE=/tmp/opencode/iter-count.txt
[ -f "$ITER_FILE" ] || echo 0 > "$ITER_FILE"
while true; do
  date +"%H:%M:%S 800s监控 tick"
  # 检查 control graphd 8766 状态 (修复: token 路径 + 移除已停的 8765/pi)
  curl -s --max-time 6 -X POST http://127.0.0.1:8766/query -H 'Content-Type: application/json' \
    -H "X-Auth: $(cat /home/wff/.config/d2d/host-token 2>/dev/null)" \
    -d '{"cypher":"MATCH (e:Engagement) RETURN e.status AS s"}' 2>/dev/null | head -c 120
  echo " dsh-8766"
  sleep 800
done
