#!/usr/bin/env bash
# backup-graph.sh — Kuzu 图库每日快照(E-6/D-2 生产化; 收编原 .d2d-review/cron-backup.sh)
# 停写快照: 单写者架构下对 graphd 进程 SIGSTOP → tar(kuzu_db+kuzu_db.wal) → SIGCONT,
#           避免 live copy 撕裂页(要跳过停写窗口: D2D_BACKUP_NOPAUSE=1, 自担一致性风险)。
# 用法: bash scripts/ops/backup-graph.sh           # 手动或 cron
# 环境变量:
#   D2D_DATA_DIR       快照输出根(默认 ~/.d2d-data → backups/)
#   D2D_BACKUP_INSTANCES  "label:graphd目录" 空格分隔(默认 control/laneB/laneC)
#   D2D_BACKUP_KEEP    保留份数(默认 14)
#   D2D_BACKUP_OFFSITE rsync 异机目标(user@host:/path, 可空)
# 恢复演练(季度, 进 fleet.sh checklist):
#   1) systemctl --user stop d2d-graphd(或 kill 对应 app.py)
#   2) tar xzf graph-<label>-<date>.tgz -C /tmp/restore && 核对 manifest.sha256
#   3) cp kuzu_db kuzu_db.wal → <graphd 目录>/ ; 重启 graphd
#   4) 验收: /health 200 + /query "MATCH (f:Finding) RETURN count(f)" 与 manifest 节点计数一致
set -u
DATA_DIR="${D2D_DATA_DIR:-$HOME/.d2d-data}"
OUT="$DATA_DIR/backups"; KEEP="${D2D_BACKUP_KEEP:-14}"
DATE=$(date +%F-%H%M)
# 默认实例 = 本仓库的 graphd 目录(脚本位于 <repo>/scripts/ops/) — 原硬编码 /home/wff 不可移植
_SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
_REPO_DIR=$(cd "$_SCRIPT_DIR/../.." && pwd)
INSTANCES="${D2D_BACKUP_INSTANCES:-control:$_REPO_DIR/graphd}"
LOG="$OUT/backup.log"
mkdir -p "$OUT"
log() { echo "$(date -Iseconds) | $*" >> "$LOG"; }

# graphd 进程发现: pgrep 后按 /proc cwd 匹配实例目录(避免误停别的 python)
graphd_pids() { # $1 = graphd 目录
  local dir P found=""
  for P in $(pgrep -f 'python3 app.py' 2>/dev/null); do
    dir=$(readlink -f /proc/$P/cwd 2>/dev/null) || continue
    [ "$dir" = "$(readlink -f "$1")" ] && found="$found $P"
  done
  echo $found
}

for inst in $INSTANCES; do
  label=${inst%%:*}; dir=${inst#*:}
  [ -d "$dir" ] || { log "skip $label($dir 不存在)"; continue; }
  DB="$dir/kuzu_db"; [ -e "$DB" ] || { log "skip $label($dir 无 kuzu_db)"; continue; }
  PIDS=$(graphd_pids "$dir")
  if [ -z "${D2D_BACKUP_NOPAUSE:-}" ] && [ -n "$PIDS" ]; then kill -STOP $PIDS 2>/dev/null; fi
  TGZ="$OUT/graph-$label-$DATE.tgz"
  if tar czf "$TGZ" -C "$dir" kuzu_db kuzu_db.wal 2>>"$LOG"; then
    ( cd "$OUT" && sha256sum "$(basename "$TGZ")" >> "$OUT/manifest.sha256" )
    log "✅ $label → $(basename "$TGZ") ($(du -h "$TGZ" | cut -f1)) pids=[$PIDS]"
  else
    log "❌ $label tar 失败"; rm -f "$TGZ"
  fi
  if [ -z "${D2D_BACKUP_NOPAUSE:-}" ] && [ -n "$PIDS" ]; then kill -CONT $PIDS 2>/dev/null; fi
done

# 滚动保留(默认 14 份/实例)
ls -1t "$OUT"/graph-*-*.tgz 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r f; do rm -f "$f"; log "滚动清理 $(basename "$f")"; done
[ -f "$OUT/manifest.sha256" ] && ( cd "$OUT" && sort -u manifest.sha256 > manifest.sha256.tmp && mv manifest.sha256.tmp manifest.sha256 )

# 异机(可选): 只追加当日新快照
if [ -n "${D2D_BACKUP_OFFSITE:-}" ]; then
  rsync -a --ignore-existing "$OUT"/*.tgz "$D2D_BACKUP_OFFSITE/" 2>>"$LOG" && log "异机同步完成 → $D2D_BACKUP_OFFSITE" || log "异机同步失败(下次重试)"
fi

# 运行数据保留期(原 cron-backup 行为, 路径更新为外置 DATA_DIR)
find "$DATA_DIR/evidence" -type f -mtime +7 -delete 2>/dev/null
find "$DATA_DIR/runs" -type f -mtime +7 -delete 2>/dev/null
log "--- 备份轮完成 ---"
