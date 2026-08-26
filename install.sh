#!/usr/bin/env bash
# d2d 一键安装器 — 从 GitHub 克隆并作为 dsh bundle 插入任意 profile
# 用法:
#   curl -fsSL https://raw.githubusercontent.com/wufufu770/d2d/main/install.sh | bash -s -- [profile名] [d2d安装目录]
#   默认: profile=headless, 安装到 ~/d2d
set -euo pipefail

PROFILE="${1:-headless}"
D2D_DIR="${2:-$HOME/d2d}"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
REPO="https://github.com/wufufu770/d2d.git"
BRANCH="main"

c_info(){ echo -e "\033[36m[d2d]\033[0m $*"; }
c_ok(){ echo -e "\033[32m[d2d]\033[0m ✅ $*"; }
c_err(){ echo -e "\033[31m[d2d]\033[0m ❌ $*"; }

# 0) 前置检查
command -v dsh >/dev/null || { c_err "未找到 dsh CLI —— 请先安装 @deepseek-ai/dsh"; exit 1; }
command -v python3 >/dev/null || { c_err "需要 python3"; exit 1; }
python3 -c "import kuzu" 2>/dev/null || {
  c_info "安装 kuzu (graphd 依赖)"
  pip3 install --user kuzu || pip3 install --break-system-packages kuzu
}

# 1) 获取代码
if [ -d "$D2D_DIR/plugin" ]; then
  c_info "已存在 $D2D_DIR — 拉取更新"
  git -C "$D2D_DIR" pull --ff-only 2>/dev/null || true
else
  c_info "克隆 $REPO → $D2D_DIR"
  git clone --depth 1 -b "$BRANCH" "$REPO" "$D2D_DIR"
fi

# 2) 注册为 dsh bundle(link 模式: 本地目录即源码, 更新即时生效)
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
mkdir -p "$PROFILE_DIR"
[ -f "$PROFILE_DIR/package.json" ] || echo '{"name":"dsh-profile-'"$PROFILE"'","private":true}' > "$PROFILE_DIR/package.json"
[ -f "$PROFILE_DIR/cordis.patch.yml" ] || touch "$PROFILE_DIR/cordis.patch.yml"

c_info "注册 pentest-dsh 到 profile '$PROFILE'"
node - "$PROFILE_DIR" "$D2D_DIR" <<'JS'
const fs = require('fs')
const [dir, d2d] = process.argv.slice(2)
const pj = JSON.parse(fs.readFileSync(`${dir}/package.json`, 'utf8'))
pj.dependencies ??= {}
pj.dependencies['pentest-dsh'] = `link:${d2d}/plugin/pentest-dsh`
pj.dsh ??= {}
pj.dsh.profile ??= { bundles: [] }
if (!pj.dsh.profile.bundles.includes('pentest-dsh')) pj.dsh.profile.bundles.push('pentest-dsh')
// headless 启动需要 workspace 声明(pnpm)
if (!fs.existsSync(`${dir}/pnpm-workspace.yaml`)) fs.writeFileSync(`${dir}/pnpm-workspace.yaml`, '')
fs.writeFileSync(`${dir}/package.json`, JSON.stringify(pj, null, 2))
console.log('[d2d] bundle 已注册:', pj.dsh.profile.bundles.join(', '))
JS

# pnpm 安装依赖(树外插件进 profile node_modules)
if command -v pnpm >/dev/null; then
  (cd "$PROFILE_DIR" && pnpm install --ignore-scripts) || c_err "pnpm install 失败(可手动重试: cd $PROFILE_DIR && pnpm install)"
elif command -v bun >/dev/null; then
  (cd "$PROFILE_DIR" && bun install) || true
fi

# 3) graphd 启动脚本 + 可选 systemd 用户服务
mkdir -p "$D2D_DIR/graphd"
cat > "$D2D_DIR/graphd/start.sh" <<'EOF'
#!/usr/bin/env bash
cd "$(dirname "$0")"
export P2P_GRAPH_PORT="${P2P_GRAPH_PORT:-8766}"
unset P2P_GRAPH
exec python3 app.py
EOF
chmod +x "$D2D_DIR/graphd/start.sh"

if command -v systemctl >/dev/null && systemctl --user status >/dev/null 2>&1; then
  mkdir -p ~/.config/systemd/user
  cat > ~/.config/systemd/user/d2d-graphd.service <<EOF
[Unit]
Description=d2d graphd (Kuzu single-writer state store)
[Service]
ExecStart=$D2D_DIR/graphd/start.sh
Restart=on-failure
[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now d2d-graphd.service 2>/dev/null || true
  c_ok "graphd 已注册为用户服务(d2d-graphd)"
else
  c_info "启动 graphd: $D2D_DIR/graphd/start.sh"
fi

sleep 3
PORT=8766
curl -sf "http://127.0.0.1:$PORT/health" >/dev/null && c_ok "graphd 健康 :$PORT" || c_err "graphd 未响应(手动启动: $D2D_DIR/graphd/start.sh)"

# 4) 冒烟
echo
c_ok "安装完成。使用方式:"
echo "  dsh --profile $PROFILE \"对 http://目标 进行三环渗透测试\""
echo "  # 或交互式:"
echo "  dsh --profile $PROFILE"
echo "  # 图查询: curl -X POST http://127.0.0.1:$PORT/query -d '{\"cypher\":\"MATCH (n) RETURN count(n)\"}'"
