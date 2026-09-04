#!/usr/bin/env bash
# d2d 一键安装脚本 — 实测流程固化(2026-08-31 全量重建验证; 09-01 修复 pnpm≥11 构建拦截/插件依赖/skill/网关接线)
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
PROXY_PORT="${PROXY_PORT:-8888}"
OAST_PORT="${OAST_PORT:-8890}"

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
  warn "模型策略模板已复制 → $D2D_DATA_DIR/config/model-policies.json(须编辑; 保持占位符时 worker 会回退宿主默认模型并提示, 不会再全灭)"
else
  ok "model-policies.json 已存在, 保留"
fi
# D-6: notify 配置外置 — webhook URL 内嵌推送 token(Bark/Server酱), 绝不入库
if [ ! -f "$D2D_DATA_DIR/config/notify.json" ]; then
  cp "$REPO_DIR/config/notify.example.json" "$D2D_DATA_DIR/config/notify.json"
  ok "notify 模板 → $D2D_DATA_DIR/config/notify.json(填 webhook 后即生效)"
else
  ok "notify.json 已存在, 保留"
fi

# ---------- 2. 插件自身依赖 ----------
# link: 协议只做符号链接, pnpm 不安装 link 目标的 dependencies; 而 Node 按 symlink
# 真实路径解析依赖, profile 的 node_modules 不在解析链上 → 必须就地安装插件依赖。
step "安装插件自身依赖(pentest-dsh: dsh-tools / dsh-mcp-client)"
( cd "$REPO_DIR/plugin/pentest-dsh" && npm ci --omit=dev --no-audit --no-fund --silent 2>/dev/null ) \
  || ( cd "$REPO_DIR/plugin/pentest-dsh" && npm install --omit=dev --no-audit --no-fund )
ok "pentest-dsh 依赖就绪 — 工具面(p2p_status/p2p_graph)不再静默跳过"
# d2d-panel 仅 peerDependencies(react/cordis/better-sidebar, 由 profile 环境提供), 无需就地安装

# ---------- 3. dsh profiles ----------
step "装配 dsh profiles($DSH_HOME)"
mkdir -p "$DSH_HOME/profiles/web" "$DSH_HOME/profiles/headless"
command -v pnpm >/dev/null || npm install -g pnpm

# pnpm ≥10 默认拦截依赖的构建脚本(原生编译); node-pty(dsh 终端模拟)须放行,
# 否则 pnpm 11 直接报 ERR_PNPM_IGNORED_BUILDS 退出 1。
# allowBuilds 在 pnpm 10.5/11.x 双版本实测有效(onlyBuiltDependencies 已被 11 弃用)。
cat > "$DSH_HOME/profiles/web/pnpm-workspace.yaml" <<'EOF'
packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false

allowBuilds:
  node-pty: true
EOF
cp "$DSH_HOME/profiles/web/pnpm-workspace.yaml" "$DSH_HOME/profiles/headless/pnpm-workspace.yaml"

cat > "$DSH_HOME/profiles/web/cordis.yml" <<'EOF'
# dsh profile root — an empty entry list. The tree is composed as patches:
# each bundle in package.json's dsh.profile.bundles, then cordis.patch.yml, then any
# --patch overlays. Edit cordis.patch.yml, not this file.
[]
EOF
cp "$DSH_HOME/profiles/web/cordis.yml" "$DSH_HOME/profiles/headless/cordis.yml"

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

# web profile 补丁: LLM 路由 — 主聊天接入你在下方 provider 模板里配置的厂商
# #2: patch 层对 settings.yaml 的 llm-pi-ai 段是整体覆盖语义 — 用户在 UI Models 页配好的
#     provider 会被静默冲掉(实证: 模型选择器瘫痪/发送框禁用)。已配置则不生成模板, 保留用户配置。
_GEN_LLM_BLOCK=1
if [ -f "$DSH_HOME/settings.yaml" ] && grep -q "llm-pi-ai" "$DSH_HOME/settings.yaml"; then
  _GEN_LLM_BLOCK=0
  warn "settings.yaml 已有 llm-pi-ai 配置(UI Models 页) — 本次不生成 provider 模板, 避免覆盖你的配置"
  warn "注意: model-policies.json 的 provider 前缀必须与你已有 provider 名一致"
fi
cat > "$DSH_HOME/profiles/web/cordis.patch.yml" <<'EOF'
# web profile 用户补丁 — 由 d2d install.sh 生成
# LLM 路由: dsh-llm-pi-ai 任意厂商接入; providers 键须与 model-policies.json 的
# "provider/" 前缀一致。apiKeyEnv 必须与你在 web UI Models 页存储的凭证引用名逐字一致,
# 否则宿主 LLM 注册表解析出零个可用模型(选择器瘫痪/发送禁用, 实证见 issue #2)。
EOF
if [ "$_GEN_LLM_BLOCK" = "1" ]; then
  cat >> "$DSH_HOME/profiles/web/cordis.patch.yml" <<'EOF'
- id: llm-pi-ai
  name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      # ↓ 占位示例: 换成你的厂商(改 displayName/baseURL/apiKeyEnv/models 四处),
      #   provider 键名须与 model-policies.json 的 "provider/" 前缀一致
      provider-a:
        displayName: Provider A (via pi-ai)
        apiKeyEnv: PROVIDER_A_API_KEY
        api: openai-completions
        baseURL: https://api.provider-a.example/v1
        compat:
          thinkingFormat: deepseek
          supportsDeveloperRole: false
          maxTokensField: max_tokens
        models:
          - id: model-x-fast
            name: Model X Fast
            contextWindow: 65536
            maxTokens: 8192
          - id: model-x
            name: Model X
            contextWindow: 131072
            maxTokens: 16384
      provider-b:
        displayName: Provider B (via pi-ai)
        apiKeyEnv: PROVIDER_B_API_KEY
        api: openai-completions
        baseURL: https://api.provider-b.example/v1
        compat:
          thinkingFormat: deepseek
          supportsDeveloperRole: false
          maxTokensField: max_tokens
        models:
          - id: model-y
            name: Model Y
            contextWindow: 262144
            maxTokens: 32768
          - id: model-y-large
            name: Model Y Large
            contextWindow: 1000000
            maxTokens: 32768
EOF
fi

( cd "$DSH_HOME/profiles/web" && pnpm install ) \
  || { echo "✗ web profile 装配失败(上方为 pnpm 完整输出; 常见原因: 网络/registry 权限)"; exit 1; }
ok "web profile: d2d-panel + pentest-dsh + better-sidebar 装配完成"

# --- headless profile: worker 进程用(无 UI, 全权限, token 桥) ---
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
( cd "$DSH_HOME/profiles/headless" && pnpm install ) \
  || { echo "✗ headless profile 装配失败(上方为 pnpm 完整输出)"; exit 1; }

# headless 补丁: ①LLM 路由(与 web 同源) ②全权限沙箱 ③worker token 桥
cp "$DSH_HOME/profiles/web/cordis.patch.yml" "$DSH_HOME/profiles/headless/cordis.patch.yml"
cat >> "$DSH_HOME/profiles/headless/cordis.patch.yml" <<'EOF'

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

# ---------- 4. pentest skill ----------
step "安装 pentest skill(仓库 home/.dsh/skills/pentest — 垃圾洞清单/七问验证门)"
if [ -d "$REPO_DIR/home/.dsh/skills/pentest" ]; then
  mkdir -p "$DSH_HOME/skills"
  rm -rf "$DSH_HOME/skills/pentest"
  cp -r "$REPO_DIR/home/.dsh/skills/pentest" "$DSH_HOME/skills/pentest"
  ok "skill → $DSH_HOME/skills/pentest/SKILL.md"
else
  warn "仓库缺 home/.dsh/skills/pentest(非发布树?) — 跳过"
fi

# ---------- 5. 默认模型 ----------
step "设置主聊天默认模型"
# dsh 出厂自带一个默认 provider — 只配第三方 provider key 的
# 机器上主会话可能 MISSING_CREDENTIAL。worker 不受影响(per-task 模型注入),
# 这里只把「主聊天」指到已配置路由的 provider 上。
# #2: 用户已有自己的 llm-pi-ai provider 时不改默认(避免指到不存在的 provider)。
SETTINGS="$DSH_HOME/settings.yaml"
if [ "$_GEN_LLM_BLOCK" = "0" ]; then
  ok "保留你现有的默认模型(settings.yaml 已有 llm-pi-ai 配置)"
elif [ ! -f "$SETTINGS" ]; then
  cat > "$SETTINGS" <<'EOF'
agent-default-model:
  provider: provider-a
  model: model-x
EOF
  ok "主聊天默认模型 → provider-a/model-x(占位 — 换成你在 cordis.patch.yml 接入的 provider/model)"
elif grep -q '^agent-default-model:' "$SETTINGS"; then
  warn "settings.yaml 已有 agent-default-model — 保留你的选择(若指向未配置 key 的 provider, 主聊天会 MISSING_CREDENTIAL, 改法见 README「默认模型」)"
else
  printf '\nagent-default-model:\n  provider: provider-a\n  model: model-x\n' >> "$SETTINGS"
  ok "已追加 agent-default-model → provider-a/model-x"
fi

# ---------- 6. 启动脚本 ----------
step "生成启动脚本(ops/start-all.sh)"
mkdir -p "$REPO_DIR/ops"
cat > "$REPO_DIR/ops/start-all.sh" <<EOF
#!/usr/bin/env bash
# d2d 全栈启动: graphd + egress-gateway(出网治理) + oast(带外回调) + dsh web(面板)
# API key 经环境变量注入, 不落盘。
set -euo pipefail
export DSH_HOME="\${DSH_HOME:-$DSH_HOME}"
export D2D_DATA_DIR="\${D2D_DATA_DIR:-$D2D_DATA_DIR}"
export P2P_HOST_TOKEN="\${P2P_HOST_TOKEN:-\$(cat $HOME/.config/d2d/host-token)}"
export P2P_GRAPHD="http://127.0.0.1:$GRAPHD_PORT"

# ↓↓↓ 按需注入你的模型 API key(与 cordis.patch.yml 的 apiKeyEnv 对应)
# export PROVIDER_A_API_KEY=sk-...
# export PROVIDER_B_API_KEY=sk-...

# #14: 优雅停止 — graphd 持 kuzu WAL, kill -9 会丢未 checkpoint 的提交(实证全图数据丢失)。
#      先 SIGTERM 等退出(≤5s), 仍存活才 SIGKILL 兜底。
stop_graceful() {
  pkill -TERM -f "\$1" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    pgrep -f "\$1" >/dev/null 2>&1 || return 0
    sleep 0.5
  done
  pkill -KILL -f "\$1" 2>/dev/null || true
}
stop_graceful "graphd/app.py"
stop_graceful "gateway/egress-gateway.mjs"
stop_graceful "gateway/oast.mjs"
stop_graceful "dsh --profile web"
sleep 1

# graphd 以自身目录为 cwd 启动 — backup-graph.sh 按 /proc/<pid>/cwd 匹配实例做 SIGSTOP 停写快照
( cd "$REPO_DIR/graphd" && nohup python3 app.py > "$D2D_DATA_DIR/graphd.log" 2>&1 & )
echo "graphd → http://127.0.0.1:$GRAPHD_PORT"
sleep 2

# V-08 出网治理网关: 连接层 scope 强制(每 30s 动态拉 Engagement.scope ∪ 静态白名单,
# 子域通配/CIDR) + per-host 令牌桶限速 + 全量请求审计(→ DATA_DIR/evidence/proxy)。
# worker 的 curl 经 http_proxy 连接层强制走网关(graphd 回环走 NO_PROXY 豁免)。
nohup node "$REPO_DIR/scripts/gateway/egress-gateway.mjs" > "$D2D_DATA_DIR/egress-gateway.log" 2>&1 &
echo "egress-gateway → http://127.0.0.1:$PROXY_PORT (pid \$!)"
export P2P_PROXY_URL="http://127.0.0.1:$PROXY_PORT"

# G2 带外回调服务(盲注自主确认): HTTP 通道; DNS 通道需公网部署(见 oast.mjs 头注释)
nohup node "$REPO_DIR/scripts/gateway/oast.mjs" > "$D2D_DATA_DIR/oast.log" 2>&1 &
echo "oast → http://127.0.0.1:$OAST_PORT (pid \$!)"
export P2P_OAST_HOST="127.0.0.1:$OAST_PORT"

# E-7 SPA 渲染面执行器(需本机 chrome, 默认不启; 启用后取消注释):
# nohup node "$REPO_DIR/scripts/gateway/spa-render.mjs" > "$D2D_DATA_DIR/spa-render.log" 2>&1 &
# export P2P_SPA_URL="http://127.0.0.1:8891"

nohup dsh --profile web --port $WEB_PORT --no-open --host 127.0.0.1 > "$D2D_DATA_DIR/dsh-web.log" 2>&1 &
echo "dsh web → http://127.0.0.1:$WEB_PORT (pid \$!)"
echo "打开浏览器 → 右侧边栏 'd2d' / 'd2d Findings' 两个 tab 即面板"
EOF
chmod +x "$REPO_DIR/ops/start-all.sh"
ok "ops/start-all.sh(记得填 API key)"

# ---------- 7. 完整性 ----------
step "完整性校验"
if (cd "$REPO_DIR" && sha256sum -c manifest.sha256 --quiet 2>/dev/null); then
  ok "manifest.sha256 校验通过"
else
  warn "manifest 校验失败 — 发布快照与磁盘不一致(本地改过代码/装过依赖属正常), 不影响使用"
fi

printf '\n\033[1;32m✓ 安装完成\033[0m\n\n'
cat <<EOF
下一步:
  1. 编辑 $D2D_DATA_DIR/config/model-policies.json   # 五角色 primary/backup 模型
  2. 编辑 $DSH_HOME/profiles/headless/cordis.patch.yml  # LLM provider 路由(须与上表前缀一致)
  3. 启动:  bash $REPO_DIR/ops/start-all.sh             # 先在脚本里填 API key
  4. 浏览器 http://127.0.0.1:$WEB_PORT → 右侧栏 d2d 面板
  5. 聊天输入: /pentest http://<授权目标> <scope> [instances]

详细文档: $REPO_DIR/README.md
EOF
