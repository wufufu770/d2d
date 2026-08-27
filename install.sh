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
  pip3 install --user -r "$D2D_DIR/requirements.txt" 2>/dev/null || pip3 install --user -r "requirements.txt" 2>/dev/null || pip3 install --user kuzu || pip3 install --break-system-packages -r "$D2D_DIR/requirements.txt" 2>/dev/null || pip3 install --break-system-packages -r requirements.txt 2>/dev/null || pip3 install --break-system-packages kuzu
}

# 1) 获取代码（供应链钉版：pin 到 commit + sha256 校验，D2D_REF 可覆盖追新）
# 默认 pin 到当前验证过的 commit（b1af82c），D2D_SHA256 可选校验
D2D_REF="${D2D_REF:-b1af82cc599ad164a83040e898e82fd4381c68d9}"
D2D_SHA256="${D2D_SHA256:-}"
if [ -d "$D2D_DIR/plugin" ]; then
  c_info "已存在 $D2D_DIR — 拉取更新"
  if [ -n "${D2D_REF}" ] && [ "${D2D_REF}" != "main" ]; then
    c_info "已存在目录，提示：如需升级到 pin 版本 ${D2D_REF}，请手动 git fetch + reset 或设置 D2D_REF 重新安装"
  fi
  git -C "$D2D_DIR" pull --ff-only 2>/dev/null || true
else
  c_info "获取代码(pin 版本 ${D2D_REF})"
  curl -fsSL "https://github.com/wufufu770/d2d/archive/${D2D_REF}.tar.gz" -o /tmp/d2d.tgz
  if [ -n "${D2D_SHA256}" ]; then
    echo "${D2D_SHA256}  /tmp/d2d.tgz" | sha256sum -c - || { c_err "sha256 mismatch — 供应链校验失败"; exit 1; }
  else
    c_info "未设置 D2D_SHA256，跳过 sha256 校验（建议通过 D2D_SHA256 环境变量钉住）"
  fi
  mkdir -p "$D2D_DIR" && tar -xzf /tmp/d2d.tgz -C "$D2D_DIR" --strip-components=1
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

# 2.5) 凭证初始化（host/worker token）
mkdir -p ~/.config/d2d && chmod 700 ~/.config/d2d
[ -f ~/.config/d2d/host-token ] || { umask 077 && openssl rand -hex 16 > ~/.config/d2d/host-token && chmod 600 ~/.config/d2d/host-token; }
[ -f ~/.config/d2d/worker-token ] || { umask 077 && openssl rand -hex 16 > ~/.config/d2d/worker-token && chmod 600 ~/.config/d2d/worker-token; }
# 迁移旧路径（graphd/.host-token）若存在
if [ -f "$D2D_DIR/graphd/.host-token" ] && [ ! -f ~/.config/d2d/host-token ]; then
  cp "$D2D_DIR/graphd/.host-token" ~/.config/d2d/host-token && chmod 600 ~/.config/d2d/host-token
fi

# 3) graphd 启动脚本 + 可选 systemd 用户服务
mkdir -p "$D2D_DIR/graphd"
cat > "$D2D_DIR/graphd/start.sh" <<'EOF'
#!/usr/bin/env bash
cd "$(dirname "$0")"
export P2P_GRAPH_PORT="${P2P_GRAPH_PORT:-8766}"
export P2P_HOST_TOKEN_FILE="${P2P_HOST_TOKEN_FILE:-$HOME/.config/d2d/host-token}"
export P2P_WORKER_TOKEN_FILE="${P2P_WORKER_TOKEN_FILE:-$HOME/.config/d2d/worker-token}"
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
Environment=P2P_HOST_TOKEN_FILE=%h/.config/d2d/host-token
Environment=P2P_WORKER_TOKEN_FILE=%h/.config/d2d/worker-token
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
