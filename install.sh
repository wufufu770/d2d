#!/usr/bin/env bash
# d2d 一键安装脚本 — 实测流程固化(2026-08-31 全量重建验证)
# 用法: curl -fsSL https://raw.githubusercontent.com/wufufu770/d2d/main/install.sh | bash -s -- [目标目录]
#   或: git clone https://github.com/wufufu770/d2d && bash d2d/install.sh [目标目录]
# 环境要求: Node >= 18(24 已实测), Python >= 3.10 + pip, git
set -euo pipefail

REPO_DIR="${1:-$(pwd)}"
[ -f "$REPO_DIR/graphd/app.py" ] || { echo "✗ $REPO_DIR 不是 d2d 仓库根目录(缺 graphd/app.py)"; exit 1; }
REPO_DIR="$(cd "$REPO_DIR" && pwd)"

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
D2D_DATA_DIR="${D2D_DATA_DIR:-$HOME/.d2d-data}"
D2D_HOST_TOKEN="${D2D_HOST_TOKEN:-$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')}"
GRAPHD_PORT="${GRAPHD_PORT:-8766}"
WEB_PORT="${WEB_PORT:-8899}"

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }

# ---------- 0. 依赖 ----------
step "检查依赖"
command -v node >/dev/null || { echo "✗ 缺 Node.js(>=18)"; exit 1; }
ok "node $(node --version)"
command -v python3 >/dev/null || { echo "✗ 缺 python3"; exit 1; }
ok "python3 $(python3 --version 2>&1 | cut -d' ' -f2)"

step "安装 dsh CLI(全局)"
if command -v dsh >/dev/null; then
  ok "dsh 已装: $(dsh --version 2>/dev/null || echo '?')"
else
  npm install -g @deepseek-ai/dsh
  ok "dsh $(dsh --version) 已安装"
fi

step "安装 kuzu(图数据库, graphd 依赖)"
if python3 -c "import kuzu" 2>/dev/null; then
  ok "kuzu 已装: $(python3 -c 'import kuzu, importlib.metadata as m; print(m.version("kuzu"))' 2>/dev/null || echo '?')"
else
  pip install "kuzu==0.11.3" --quiet
  ok "kuzu 0.11.3 已安装"
fi

# ---------- 1. 数据目录与令牌 ----------
step "初始化数据目录 $D2D_DATA_DIR"
mkdir -p "$D2D_DATA_DIR"/{runs,config,knowledge/inbox}
mkdir -p "$HOME/.config/d2d"
[ -f "$HOME/.config/d2d/host-token" ] || echo -n "$D2D_HOST_TOKEN" > "$HOME/.config/d2d/host-token"
ok "host-token 就绪"
if [ ! -f "$D2D_DATA_DIR/config/model-policies.json" ]; then
  cp "$REPO_DIR/config/model-policies.example.json" "$D2D_DATA_DIR/config/model-policies.json"
  warn "模型策略模板已复制 → $D2D_DATA_DIR/config/model-policies.json(需编辑, 见 README)"
else
  ok "model-policies.json 已存在, 保留"
fi

# ---------- 2. dsh profiles ----------
step "装配 dsh profiles($DSH_HOME)"
mkdir -p "$DSH_HOME/profiles/web" "$DSH_HOME/profiles/headless"
command -v pnpm >/dev/null || npm install -g pnpm

# --- web profile: 基础 + 侧栏 + d2d 双插件 ---
cat > "$DSH_HOME/profiles/web/cordis.yml" <<'EOF'
# dsh profile root — an empty entry list. The tree is composed as patches:
# each bundle in package.json's dsh.profile.bundles, then cordis.patch.yml, then any
# --patch overlays. Edit cordis.patch.yml, not this file.
[]
EOF
cat > "$DSH_HOME/profiles/web/pnpm-workspace.yaml" <<'EOF'
packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
EOF
cat > "$DSH_HOME/profiles/web/package.json" <<EOF
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {
    "d2d-panel": "link:$REPO_DIR/plugin/d2d-panel",
    "dsh-better-sidebar": "^0.17.1",
    "dsh-sidebar-leap": "^0.3.2",
    "pentest-dsh": "link:$REPO_DIR/plugin/pentest-dsh"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-better-sidebar",
        "dsh-sidebar-leap",
        "d2d-panel",
        "pentest-dsh"
      ]
    }
  }
}
EOF
( cd "$DSH_HOME/profiles/web" && pnpm install --silent )
ok "web profile: d2d-panel + pentest-dsh + better-sidebar 装配完成"

# --- headless profile: worker 进程用(无 UI, 全权限, token 桥) ---
cp "$DSH_HOME/profiles/web/cordis.yml" "$DSH_HOME/profiles/headless/cordis.yml"
cp "$DSH_HOME/profiles/web/pnpm-workspace.yaml" "$DSH_HOME/profiles/headless/pnpm-workspace.yaml"
cat > "$DSH_HOME/profiles/headless/package.json" <<EOF
{
  "name": "dsh-profile-headless",
  "private": true,
  "dependencies": {
    "pentest-dsh": "link:$REPO_DIR/plugin/pentest-dsh"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-headless",
        "pentest-dsh"
      ]
    }
  }
}
EOF
( cd "$DSH_HOME/profiles/headless" && pnpm install --silent )

# headless 补丁: ①LLM 路由(按 model-policies 的 provider 前缀扩展) ②全权限沙箱 ③worker token 桥
cat > "$DSH_HOME/profiles/headless/cordis.patch.yml" <<'EOF'
# headless profile 用户补丁 — 由 d2d install.sh 生成
# LLM 路由: dsh-llm-pi-ai 任意厂商接入; providers 键须与 model-policies.json 的
# "provider/" 前缀一致。下面是示例(minimax-cn 走 MiniMax 官方, opencode-go 走
# OpenCode Go 订阅); 换厂商改 baseURL+apiKeyEnv+models 即可。
- id: llm-pi-ai
  name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      minimax-cn:
        displayName: MiniMax (via pi-ai)
        apiKeyEnv: MINIMAX_API_KEY
        api: openai-completions
        baseURL: https://api.minimax.chat/v1
        compat:
          thinkingFormat: deepseek
          supportsDeveloperRole: false
          maxTokensField: max_tokens
        models:
          - id: MiniMax-M2.7
            name: MiniMax M2.7
            contextWindow: 65536
            maxTokens: 8192
          - id: MiniMax-M2.7-highspeed
            name: MiniMax M2.7 highspeed
            contextWindow: 65536
            maxTokens: 8192
          - id: MiniMax-M3
            name: MiniMax M3
            contextWindow: 131072
            maxTokens: 16384
      opencode-go:
        displayName: OpenCode Go (via pi-ai)
        apiKeyEnv: OPENCODE_API_KEY
        api: openai-completions
        baseURL: https://opencode.ai/zen/go/v1
        compat:
          thinkingFormat: deepseek
          supportsDeveloperRole: false
          maxTokensField: max_tokens
        models:
          - id: mimo-v2.5
            name: MiMo v2.5
            contextWindow: 262144
            maxTokens: 32768
          - id: mimo-v2.5-pro
            name: MiMo v2.5 Pro
            contextWindow: 262144
            maxTokens: 32768

# 渗透 worker 需要完整网络/系统访问(目标探测 + graphd 写入);
# sandbox 与 approval 必须成对切换(单独改 sandbox 组合不出 preset → boot 报错)。
- id: sandbox-policy
  config:
    mode: !!js process.env.DSH_PERMISSION_MODE ?? 'danger-full-access'
    workspaceRoot: !!js process.cwd()
- id: approval
  config:
    policy: !!js "(process.env.DSH_PERMISSION_MODE ?? 'danger-full-access') === 'danger-full-access' ? 'never' : 'ask'"

# worker 侧 token 桥: 把 worker 进程 env 的 P2P_WORKER_TOKEN 经 shell-env 注册表
# 暴露为 DSH_ENV_P2P_WORKER_TOKEN(dsh 子进程 env 擦洗会剥掉 TOKEN 名变量)。
- insert:
    - id: pentest-worker-env
      name: pentest-dsh/worker-env
EOF
ok "headless profile: LLM 路由 + 全权限 + token 桥 装配完成"

# ---------- 3. 启动脚本 ----------
step "生成启动脚本(ops/start-all.sh)"
mkdir -p "$REPO_DIR/ops"
cat > "$REPO_DIR/ops/start-all.sh" <<EOF
#!/usr/bin/env bash
# d2d 全栈启动: graphd + dsh web(面板)。API key 经环境变量注入, 不落盘。
set -euo pipefail
export DSH_HOME="\${DSH_HOME:-$DSH_HOME}"
export D2D_DATA_DIR="\${D2D_DATA_DIR:-$D2D_DATA_DIR}"
export P2P_HOST_TOKEN="\${P2P_HOST_TOKEN:-\$(cat $HOME/.config/d2d/host-token)}"
export P2P_GRAPHD="http://127.0.0.1:$GRAPHD_PORT"

# ↓↓↓ 按需注入你的模型 API key(与 cordis.patch.yml 的 apiKeyEnv 对应)
# export MINIMAX_API_KEY=sk-...
# export OPENCODE_API_KEY=sk-...

pkill -f "graphd/app.py" 2>/dev/null || true
pkill -f "dsh --profile web" 2>/dev/null || true
sleep 1

nohup python3 "$REPO_DIR/graphd/app.py" > "$D2D_DATA_DIR/graphd.log" 2>&1 &
echo "graphd → http://127.0.0.1:$GRAPHD_PORT (pid \$!)"
sleep 2

nohup dsh --profile web --port $WEB_PORT --no-open --host 127.0.0.1 > "$D2D_DATA_DIR/dsh-web.log" 2>&1 &
echo "dsh web → http://127.0.0.1:$WEB_PORT (pid \$!)"
echo "打开浏览器 → 右侧边栏 'd2d' / 'd2d Findings' 两个 tab 即面板"
EOF
chmod +x "$REPO_DIR/ops/start-all.sh"
ok "ops/start-all.sh(记得填 API key)"

# ---------- 4. 完整性 ----------
step "完整性校验"
if (cd "$REPO_DIR" && sha256sum -c manifest.sha256 --quiet 2>/dev/null); then
  ok "manifest.sha256 校验通过"
else
  warn "manifest 校验失败或不存在(仓库被本地修改过) — 不影响使用"
fi

cat <<EOF

\033[1;32m✓ 安装完成\033[0m

下一步:
  1. 编辑 $D2D_DATA_DIR/config/model-policies.json   # 五角色 primary/backup 模型
  2. 编辑 $DSH_HOME/profiles/headless/cordis.patch.yml  # LLM provider 路由(须与上表前缀一致)
  3. 启动:  bash $REPO_DIR/ops/start-all.sh             # 先在脚本里填 API key
  4. 浏览器 http://127.0.0.1:$WEB_PORT → 右侧栏 d2d 面板
  5. 聊天输入: /pentest http://<授权目标> <scope> [instances]

详细文档: $REPO_DIR/README.md
EOF
