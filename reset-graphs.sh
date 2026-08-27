#!/bin/bash
# 正确的 graphd 重置: 停进程 → 物理删库 → 重启(避免内存句柄回写污染)
set -e
for d in "$HOME/p2p" "$HOME/d2d"; do
  pkill -f "[g]raphd/app" 2>/dev/null || true
done
sleep 1
rm -rf "$HOME/p2p/graphd/kuzu_db"* "$HOME/d2d/graphd/kuzu_db"*
cd "$HOME/p2p" && setsid nohup python3 graphd/app.py >> graphd/graphd.log 2>&1 < /dev/null &
cd "$HOME/d2d" && setsid nohup python3 graphd/app.py >> graphd/graphd.log 2>&1 < /dev/null &
sleep 3
echo "8765: $(curl -s --max-time 3 http://127.0.0.1:8765/health)"
echo "8766: $(curl -s --max-time 3 http://127.0.0.1:8766/health)"
