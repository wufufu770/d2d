#!/usr/bin/env bash
# P0-4: 安装/启用 d2d 守护单元(user 级 systemd, 无需 root)
# 用法: bash scripts/systemd/install.sh [--start]
#   默认只安装并 daemon-reload; --start 额外启用开机自启并立即拉起
#   (拉起前请先停掉同端口的裸进程: pkill -f 'graphd/app.py|egress-gateway|oast.mjs|profile web')
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
USER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
mkdir -p "$USER_DIR"
for u in d2d-graphd d2d-egress d2d-oast d2d-dsh-web; do
  cp "$DIR/$u.service" "$USER_DIR/$u.service"
  echo "installed: $USER_DIR/$u.service"
done
systemctl --user daemon-reload
echo "daemon-reload OK"
if [[ "${1:-}" == "--start" ]]; then
  systemctl --user enable --now d2d-graphd d2d-egress d2d-oast d2d-dsh-web
  loginctl enable-linger "$USER" 2>/dev/null || echo "[提示] enable-linger 失败(不影响本次, 重启后需重新登录激活 user systemd)"
  systemctl --user --no-pager --plain list-units 'd2d-*'
fi
