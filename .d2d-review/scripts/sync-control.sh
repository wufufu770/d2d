#!/bin/bash
LANE=$1
CONTROL=/home/wff/d2d
WORKER=/tmp/d2d-$LANE

echo "=== syncing $LANE → control ==="
# 1. 导出 worker 的 ExperienceWeight via API (kuzu is binary, not sqlite)
WT=$(cat /home/wff/.config/d2d/host-token)
curl -s -X POST http://127.0.0.1:8767/query -H "Content-Type: application/json" -H "X-Auth: $WT" -d '{"cypher":"MATCH (e:ExperienceWeight) RETURN e.id, e.prior LIMIT 20"}' > /tmp/sync-expweight-$LANE.json 2>&1
echo "ExperienceWeight exported to /tmp/sync-expweight-$LANE.json"

# 2. patch diff (code sync, only strategy, not whole)
cd $CONTROL
git diff --no-color $WORKER/..$CONTROL -- graphd/app.py plugin/pentest-dsh/scheduler.js > /tmp/sync-patch-$LANE.diff 2>&1 || true
if [ -s /tmp/sync-patch-$LANE.diff ]; then
  echo "patch diff found, applying to control"
  git checkout -b temp-sync-$LANE 2>&1 | head
  git apply /tmp/sync-patch-$LANE.diff 2>&1 | head
  python3 -m pytest tests/test_graphd_gates.py -q 2>&1 | tail -n 5
  sha256sum -c manifest.sha256 --quiet 2>&1 | head
  if [ $? -eq 0 ]; then
    git commit -m "sync: $LANE PASS → strategy cherry-pick" 2>&1 | head
    git tag -a control-v2 -m "control v2: $LANE PASS syncing" 2>&1 | head
    git checkout main 2>&1 | head
    git branch -d temp-sync-$LANE 2>&1 | head
    echo "sync OK"
  else
    echo "pytest or sha256 failed, abort sync"
    git checkout main 2>&1 | head
    git branch -D temp-sync-$LANE 2>&1 | head
  fi
else
  echo "no diff, skip code sync (experience sync via API done)"
fi
