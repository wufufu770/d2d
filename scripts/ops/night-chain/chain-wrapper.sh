#!/bin/bash
# E35-r2 过夜链式 wrapper —— 4 槽 × first-run(2h/2M/450) + 槽间 5min 冷却
# 链级治理: 6M 总 token 线 / 靶场健康预检 park / 任务完成传播 / 周窗型限流 park
# 续接: 槽 N+1 任务书 = 基础任务书 + 前棒 handoff 种子（文档续接, 非上下文续接——
#   E34 断连形态①(接力 brief 体积)免疫: 种子是文件, worker 按需 read, 不进任务文本）
# 用法: NIGHT_CHAIN_FIELD=<场地目录> bash scripts/ops/night-chain/chain-wrapper.sh
#   场地需含: task-night-base.md（含 __SLOT_NO__ 占位）| seed-gen.py 与本脚本同目录
#   发射旗标（r0 漏旗教训流程化, 每槽入链日志）: --max-hours 2 / --max-tokens 2000000 /
#   DSH_HOME overlay(M3.1-Flash) / P2P_MAX_STEPS=450 / P2P_WORKER_TIMEOUT_MS=7200000 / 429 退避×2
set -u
REPO=$(cd "$(dirname "$0")/../../.." && pwd)
FIELD=${NIGHT_CHAIN_FIELD:?需 NIGHT_CHAIN_FIELD=<场地目录>}
LOG=$FIELD/chain.log
TASK_BASE=$FIELD/task-night-base.md
DSH_OVERRIDE=${NIGHT_CHAIN_DSH_HOME:?需 NIGHT_CHAIN_DSH_HOME=<M3.1-Flash overlay home>}
MAX_SLOTS=4
TOKEN_LINE=6000000
TOTAL_TOKENS=0
PREV_RECORD=""

log(){ echo "[chain $(date '+%H:%M:%S')] $*" >> "$LOG"; }
: > "$LOG"
log "=== E35-r2 链启动: MAX_SLOTS=$MAX_SLOTS TOKEN_LINE=$TOKEN_LINE ==="

for SLOT in $(seq 1 $MAX_SLOTS); do
  # —— 靶场健康预检（挂=整链 park, docker 复位归晨间人类处置）——
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 8 http://127.0.0.1:8080/ || echo 000)
  if [ "$code" != "200" ]; then log "PARK: 靶场非 200 ($code)——整链 park"; break; fi
  # —— token 治理线 ——
  if [ "$TOTAL_TOKENS" -ge "$TOKEN_LINE" ]; then log "PARK: 累计 token $TOTAL_TOKENS >= $TOKEN_LINE 治理线"; break; fi

  # —— 任务书组装: 基础(注入槽号) + 前棒种子指针 ——
  TASK=$FIELD/task-slot-$SLOT.md
  sed "s/__SLOT_NO__/$SLOT/" "$TASK_BASE" > "$TASK"
  if [ -n "$PREV_RECORD" ]; then
    SEED=$FIELD/handoff-seed-$SLOT.md
    if python3 "$REPO"/scripts/ops/night-chain/seed-gen.py "$PREV_RECORD" > "$SEED" 2>>"$LOG" && [ -s "$SEED" ]; then
      cat >> "$TASK" <<EOF

## 夜班交接（第 $((SLOT-1)) 棒种子——文档续接: **先 read 本种子文件再开工**）
- 种子文件: $SEED（前棒报告摘要+open leads+负向结论集+持留 findings+秘密路径进度）
- 前棒 record: $PREV_RECORD（本棒证据/报告在前棒 final-report.md 基础上增量合并）
- 引用规范（E34）: 讨论前棒条目时用其 id（H-n/F-n/L-n，种子内即对照表）——棒间机械对账
EOF
      log "种子生成: $SEED ($(wc -c < "$SEED")B)"
    else
      log "WARN: 种子生成失败——本棒零注入首战形态"
    fi
  fi

  # —— 发射旗标核对清单（r0 漏旗教训流程化: 每槽发射前过一遍并入链日志）——
  log "槽 $SLOT 旗标核对: --max-hours 2 | --max-tokens 2000000 | DSH_HOME=$DSH_OVERRIDE(M3.1-Flash) | P2P_MAX_STEPS=450 | P2P_WORKER_TIMEOUT_MS=7200000 | 429RETRY=2x60s | task=$TASK | 接力=文档续接($([ -n "$PREV_RECORD" ] && echo seed || echo 首战))"

  # —— 发射（顺序阻塞: 槽 N 完全退出才进槽 N+1）——
  env DSH_HOME=$DSH_OVERRIDE P2P_WORKER_TIMEOUT_MS=7200000 P2P_MAX_STEPS=450 \
      P2P_WORKER_429_MAX_RETRIES=2 P2P_WORKER_429_BASE_MS=60000 \
      node $REPO/scripts/xring/first-run.mjs \
      --task-file "$TASK" --target http://127.0.0.1:8080 --scope 127.0.0.1 \
      --max-hours 2 --max-tokens 2000000 \
      --record-root $FIELD/record > $FIELD/slot-$SLOT.log 2>&1
  rc=$?
  log "槽 $SLOT 退出 rc=$rc"

  # —— 本槽 run 定位 + 停点归因（r0 教训: 读 events 终态行, 读数巧合不构成归因）——
  RUNDIR=$(ls -td $FIELD/record/record/xring-first/run-* 2>/dev/null | head -1)
  if [ -z "$RUNDIR" ]; then log "PARK: 槽 $SLOT 无 run record——编排异常, 整链 park"; break; fi
  term=$(grep -ao '"event": *"[a-z-]*"' $RUNDIR/events.jsonl 2>/dev/null | tail -1)
  wlog=$(grep -a 'worker 终态' $FIELD/slot-$SLOT.log | tail -1)
  log "槽 $SLOT 停点归因: events尾=[$term] | $wlog"

  # —— token 累计 ——
  tk=$(grep -ao '"tokens": *[0-9]*' $RUNDIR/events.jsonl 2>/dev/null | tail -1 | grep -o '[0-9]*$')
  tk=${tk:-0}
  TOTAL_TOKENS=$((TOTAL_TOKENS + tk))
  log "槽 $SLOT token=$tk 累计=$TOTAL_TOKENS"

  # —— 任务完成传播 ——
  WS=$RUNDIR/workspace
  st=$(grep -m1 '^STATUS:' $WS/final-report.md 2>/dev/null | awk '{print $2}')
  log "槽 $SLOT STATUS=${st:-无标记}"
  if [ "$st" = "complete" ]; then log "任务完成传播: STATUS=complete——不发后续槽, 整链自停"; break; fi

  # —— 周窗型限流 park（槽几乎没干活+rate limit 痕迹）——
  if [ "$tk" -lt 100000 ] && grep -aqi 'rate.limit\|RATE_LIMIT\|429' $FIELD/slot-$SLOT.log; then
    log "PARK: 疑似周窗限流（token=$tk 过低 + rate limit 痕迹）——整链 park"; break
  fi

  PREV_RECORD=$RUNDIR
  if [ "$SLOT" -lt "$MAX_SLOTS" ]; then log "冷却 5min"; sleep 300; fi
done

log "=== 链终态: TOTAL_TOKENS=$TOTAL_TOKENS 槽序列结束 ==="
