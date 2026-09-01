# d2d — 三环并行渗透测试 dsh 插件

> **一句话**: 一个 `dsh` 插件, 对授权目标并行跑 **discovery(n×链) + deep(三级 L1→L2→L3) + creative(假设反转)** 三环渗透, 共享 **Kuzu 图黑板**(`:8766`), 带 **跨模型交接记忆**、**多 agent 任务自调度**、**按角色模型策略**、**自学习知识脑**(三门禁晋级, ≤3 版本, 可回滚)。非破坏规则在简报层强制; 运行数据全部外置(`D2D_DATA_DIR`, 默认 `~/.d2d-data`)。

**面板**: `plugin/d2d-panel/` — dsh Web UI 侧栏观测台(better-sidebar 双 tab: ops + findings), 可交互: 模型矩阵点选换槽 / worker 轨迹抽屉 / Finding 卡片状态裁决, 4s 自动刷新。规格见 `docs/PANEL-UI-SPEC.md`。

---

## 目录

- [安装](#安装)
- [使用](#使用)
- [命令面](#命令面)
- [面板操作](#面板操作)
- [能力层](#能力层)
- [非破坏规则](#非破坏规则简报层由-scope-门禁--评审强制)
- [数据布局](#数据布局)
- [手动安装(不走脚本)](#手动安装不走脚本)
- [运维速查](#运维速查)
- [测试](#测试)

---

## 安装

### 前置要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 18(24 已实测) | dsh CLI 运行时 |
| Python | ≥ 3.10 + pip | graphd(kuzu 图数据库) |
| pnpm | 任意(dsh 自带引导) | profile 依赖装配 |
| git | — | 拉取仓库 |

### 一键安装

```bash
# 方式 A: 脚本自动 clone + 装配(推荐)
curl -fsSL https://raw.githubusercontent.com/wufufu770/d2d/main/install.sh | bash -s -- ~/d2d

# 方式 B: 已 clone 的情况下
git clone https://github.com/wufufu770/d2d
bash d2d/install.sh ~/d2d
```

安装脚本会自动完成:

1. 全局安装 `@deepseek-ai/dsh` CLI(已装则跳过)
2. 安装 `kuzu==0.11.3`(graphd 依赖)
3. 初始化 `~/.d2d-data/`(runs / config / knowledge)与 host-token, 复制 model-policies 与 notify 模板
4. **就地安装插件自身依赖**(pentest-dsh 的 `@deepseek-ai/dsh-tools`/`dsh-mcp-client` — `link:` 协议不会装 link 目标的依赖, 跳过此步则工具面注册被整体跳过)
5. 装配 `~/.dsh/profiles/web`(dsh web + better-sidebar + d2d-panel + pentest-dsh + LLM 路由)
6. 装配 `~/.dsh/profiles/headless`(worker 进程: LLM 路由 + 全权限 + token 桥)
7. 安装 pentest skill(`~/.dsh/skills/pentest/SKILL.md` — 垃圾洞清单/七问验证门)
8. 设置主聊天默认模型(见下「默认模型」), 生成 `ops/start-all.sh` 一键启动脚本

> **pnpm 版本兼容**: 脚本生成的 pnpm-workspace.yaml 带 `allowBuilds: node-pty: true` — pnpm ≥10 默认拦截原生构建脚本, 不放行则 pnpm 11 直接 `ERR_PNPM_IGNORED_BUILDS` 退出 1。该字段在 pnpm 10.5 / 11.x 双版本实测有效。

### 安装后配置(必做)

**① 模型策略** — 编辑 `~/.d2d-data/config/model-policies.json`(安装时已从模板复制):

```json
{
  "default": { "primary": "minimax-cn/MiniMax-M2.7", "backup": "minimax-cn/MiniMax-M2.7-highspeed" },
  "roles": {
    "discovery": { "primary": "minimax-cn/MiniMax-M2.7", "backup": "minimax-cn/MiniMax-M2.7-highspeed" },
    "deep":      { "primary": "minimax-cn/MiniMax-M3",   "backup": "minimax-cn/MiniMax-M2.7" },
    "creative":  { "primary": "opencode-go/mimo-v2.5",   "backup": "" },
    "verify":    { "primary": "minimax-cn/MiniMax-M2.7-highspeed", "backup": "" },
    "study":     { "primary": "minimax-cn/MiniMax-M3",   "backup": "" }
  }
}
```

五角色 `discovery/deep/creative/verify/study` 各配 `{primary, backup}`; backup 留空 = 额度到限后暂停+通知, 绝不盲目轮换。**前缀必须与 ② 的 providers 键一致**。

**② LLM 路由** — 编辑 `~/.dsh/profiles/headless/cordis.patch.yml` 的 `llm-pi-ai` 段: 安装脚本预置了 `minimax-cn`(MiniMax 官方)与 `opencode-go`(OpenCode Go 订阅, 含 mimo-v2.5/mimo-v2.5-pro)两个 provider 示例。换任意厂商只改 `baseURL` + `apiKeyEnv` + `models` 三处。

**③ API key** — 在 `ops/start-all.sh` 里取消注释并填入(与 ② 的 apiKeyEnv 对应):

```bash
export MINIMAX_API_KEY=sk-...
export OPENCODE_API_KEY=sk-...
```

key 只经环境变量注入进程, 不落盘。

### 默认模型(主聊天)

dsh 出厂把**主聊天**默认模型设为 `deepseek-official/deepseek-v4-flash` — 只配了 MINIMAX/OPENCODE key 的机器上, 一启动主会话就报 `MISSING_CREDENTIAL`。三选一:

1. **什么都不做**(推荐): install.sh 已把 `~/.dsh/settings.yaml` 的 `agent-default-model` 指到 `minimax-cn/MiniMax-M2.7`(文件已存在时只提示不覆盖), 且 web profile 已带 LLM 路由;
2. 补 `DEEPSEEK_API_KEY` 到 `ops/start-all.sh`, 沿用官方默认模型;
3. 手改 `~/.dsh/settings.yaml` 的 `agent-default-model` 段指到任意已配置路由的 provider/model。

worker 不受此影响 — 渗透 worker 的模型走 per-task 注入(model-policies.json), 与主聊天独立。

### 启动

```bash
bash ops/start-all.sh
# graphd        → http://127.0.0.1:8766   图数据库(写入侧 scope 门禁)
# egress-gateway → http://127.0.0.1:8888  出网治理(scope 强制/限速/审计), worker curl 连接层强制走它
# oast          → http://127.0.0.1:8890   带外回调(盲注确认通道)
# dsh web       → http://127.0.0.1:8899   ← 浏览器打开
```

打开 `http://127.0.0.1:8899`, 选工作区后右侧边栏会出现 **d2d** 与 **d2d Findings** 两个 tab — 即渗透观测面板。

---

## 使用

### 启动一次渗透(engagement)

在 dsh web 聊天输入框(dsh tui 同理):

```
/pentest http://target.example.com 127.0.0.1 2
```

参数: `<target> [scope] [instances]` — 目标 / 授权 IP 段 / discovery 并行实例数(默认 2)。

回车后系统自动:

1. 建 Engagement 节点(目标+scope 固化入图, 后续所有 worker 动作受 scope 门禁)
2. 派发 discovery 环 worker(每链一个: core-features / auth / …)测绘攻击面
3. 信号入图后 deep 环自动唤醒, 按 L1 单点→L2 组合→L3 跨端点链三级递进
4. verify 环独立复现验证; creative 环做假设反转(拿到验证失败的攻击面, 反向找新入口)
5. 全程 findings/信号/经验实时写入 Kuzu 图, 面板 4s 刷新可见

### 典型工作流

```
/pentest http://192.168.1.10 192.168.1.0/24 3   # 启动(3 个 discovery 实例)
/pentest-status                                 # 随时看状态总览
/pentest-tasks                                  # 多 agent 任务看板
/pentest-report                                 # 导出 SRC 报告(仅 verified, CVSS, 证据链)
/pentest-stop                                   # 停止全部并冻结
```

### CTF / flag 猎取模式

```bash
P2P_CTF=1 dsh --profile headless "pentest http://ctf-target 127.0.0.1"
```

brief 切换为 flag 猎手: 目标是拿 flag 而非找漏洞, 枚举一切内容(页面/注释/JS/robots/备份路径), 疑似 flag 当场写图。

### 全自主模式(OPEN_RECON)

```bash
P2P_OPEN_RECON=1 dsh --profile headless "pentest http://target 127.0.0.1"
```

brief 不含类清单/固定动作引导, worker 自主测绘→假设→攻击; 适合经验脑成熟后的开放目标。

---

## 命令面

| 命令 | 说明 |
|---|---|
| `/pentest <target> [scope] [instances]` | 启动三环渗透 |
| `/pentest-status` | 状态总览(engagement/端点/信号/findings/workers) |
| `/pentest-tasks` | 多 agent 任务看板(分工视图) |
| `/pentest-deep` | 手动触发深度环 |
| `/pentest-creative [主题]` | 手动触发创造环 |
| `/pentest-harvest` | 手动经验沉淀 |
| `/pentest-handoff` | 写交接摘要(跨模型/跨厂商接管入口) |
| `/pentest-model list \| set <role>=<厂商/模型> \| unset <role>` | 模型策略管理 |
| `/pentest-report` | SRC 报告导出(去重+CVSS+证据链) |
| `/pentest-study` | 知识学习(处理 knowledge/inbox, 后台跑) |
| `/pentest-brain status \| seed \| promote` | 知识脑版本管理 |
| `/pentest-notify-test` | 通知通道测试(读 `~/.d2d-data/config/notify.json`, webhook 外置不入库) |
| `/pentest-stop` | 停止全部并冻结 |

**注意**: 带参数命令必须从输入框的命令建议菜单选择(输入 `/` 弹出), 直接回车带参行会被当作聊天发给 LLM。

---

## 面板操作

右侧边栏两个 tab, 全部实时数据(非演示):

**d2d(ops 观测台)**:
- **ENGAGEMENT 卡**: 目标/scope/覆盖/各计数, 运行中状态
- **FLEET 模型矩阵**: 5 角色主/备模型 — **点击模型 chip 内联展开选择器**(候选列表+自定义 provider/model 输入), 换槽即时生效
- **模型用量**: 按 worker 记账的调度次数
- **WORKERS**: 存活计数 + 全部 worker 状态 — **点击行展开执行轨迹抽屉**(DISPATCH/TERMINAL 事件、checkpoint、复制轨迹 JSON)
- **FINDINGS 漏斗**: candidate→triaged→verified→reported→accepted 七态计数
- **模块筛选条**: engagement/fleet/用量/workers/漏斗/缺口/经验库 七卡独立开关

**d2d Findings(发现看板)**:
- 七态管线 stepper(点击 chip 按状态筛选)
- 四列看板: 活跃 / 已验证 / 已交付 / 已驳回, 卡片含 CVSS 分
- **点击卡片展开**: id/timestamp + 状态转换按钮(→ triaged / → verified / → isolated / → rejected) + 裁决理由输入 — 即人工裁决入口, 状态转移落图带 actor+reason 审计

---

## 能力层

| 层 | 内容 | 位置 |
|---|---|---|
| 记忆 | `Handoff` 摘要(≤4000 字符)注入每个 worker 简报——跨环/跨模型/跨厂商接管; `AgentIdentity.checkpoint/todo` 回填 | `plugin/pentest-dsh/domain/digest.mjs` |
| 多智能体 | `Task` 图节点 + `planReplenishment`(verify 最高优先且携带原复现证据) + `planAllocation`(容量/深环上限/原子认领); 零写防御: 零图写入的 worker 自动重派 | `domain/allocator.mjs`, scheduler `applyVerifyResults` |
| 学习脑 | inbox 文章 → `study.mjs`(LLM 提炼技术卡, 可选 `variants`) → 三门禁晋级(结构+注入扫描 → 历史复盘 vs refuted → 实战 wins≥3) → 版本≤3 + 可回滚; 出厂种子 40 张公开知识卡(OWASP WSTG/PortSwigger 体系); Reflexion 反例注入学习提示 | `scripts/brain/`, `brain/seed/`, `domain/knowledge-retrieval.mjs`(混合检索: 加权关键词 + 字符 trigram TF-IDF 余弦) |
| 七态状态机 | Finding: candidate→triaged→verified→isolated→reported→accepted→rejected; `/write/transition` 仅 host, **actor+reason 必填**, `last_transition` 审计 JSON; verify worker 写 `verify-result` 信号, scheduler 以 `actor='scheduler'` 迁移 | `graphd/app.py transition_gate`, `domain/allocator.mjs`, `scripts/report/src-export.mjs`(状态轨迹列) |
| 模型策略 | 按角色 primary/backup, 额度感知降级, `model-usage.jsonl` 按 worker 记账 | `config/model-policies.example.json`, `domain/failover.mjs` |
| 多厂商路由 | dsh-llm-pi-ai: 任意 OpenAI 兼容厂商; per-worker 临时 DSH_HOME(symlink overlay)注入模型, key 只走 env 不落盘 | `plugin/pentest-dsh/adapter-dsh.mjs` `buildModelHome` |
| OAST | 带外 HTTP **+ DNS** 双通道(零依赖 dgram 应答, 首 label = finding 归因), 合并 `/hits?tail=N` | `scripts/gateway/oast.mjs` |
| SPA 渲染 | CDP 驱动 headless chrome(附着或自启), DOM 链接 + XHR/fetch 端点 → `Endpoint` 节点(`tech=spa-cdp`); 无 chrome 优雅降级 | `scripts/gateway/spa-render.mjs` |
| 出网治理 | 连接层 scope 强制(每 30s 动态拉 Engagement.scope ∪ 静态白名单, 子域通配 + CIDR 按位匹配) + per-host 令牌桶限速 + 全量请求审计; worker env 注入 `http_proxy` 强制走网关(graphd 回环 `NO_PROXY` 豁免), **start-all.sh 默认拉起** | `scripts/gateway/egress-gateway.mjs`, `plugin/pentest-dsh/adapter-dsh.mjs` |
| 运维 | 图快照备份(SIGSTOP 停写窗口, 14 天滚动, 异机 hook); worker `cwd=artifact dir`(不污染仓库根) | `scripts/ops/backup-graph.sh` |

---

## 非破坏规则(简报层, 由 scope 门禁 + 评审强制)

- SQL 注入探测**只读**(SELECT / 布尔 / 时间盲)。UPDATE/INSERT/DELETE/DROP/TRUNCATE 注入载荷禁止。
- 删除类端点(DELETE 方法 / 资源删除流)只探存在, 绝不实际调用。
- 破坏性命令封禁(`rm -rf /`、`mkfs`、`dd of=/dev/`、shutdown、DROP TABLE/DATABASE); `file://` 封禁; 每条 curl 目标必须显式 scheme 且过 scope 门; worker token 不能写 `ExperienceWeight`(仅 host)。

---

## 数据布局

运行数据在**仓库外**: `~/.d2d-data/{runs,evidence,brain/{versions,current,shadow},knowledge/inbox,config,backups}`。仓库只带代码 + `brain/seed/`(公开知识基线) + `config/*.example.json`。`manifest.sha256` 覆盖发布快照(本地改代码/装依赖后校验会红, 属预期, 不影响使用)。凭据类配置(model-policies.json / notify.json — webhook URL 内嵌推送 token)一律外置 DATA_DIR, 绝不入库。

---

## 手动安装(不走脚本)

<details>
<summary>展开: 全手动装配步骤(与 install.sh 等价)</summary>

```bash
# 1. 依赖
npm install -g @deepseek-ai/dsh
pip install kuzu==0.11.3

# 2. 数据目录与 token
mkdir -p ~/.d2d-data/{runs,config} ~/.config/d2d
head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > ~/.config/d2d/host-token
cp config/model-policies.example.json ~/.d2d-data/config/model-policies.json

# 3. web profile
mkdir -p ~/.dsh/profiles/web && cd ~/.dsh/profiles/web
#    cordis.yml 写 "[]" ; pnpm-workspace.yaml 写 packages:[.]+nodeLinker:hoisted
pnpm add dsh-better-sidebar@^0.17.1 dsh-sidebar-leap@^0.3.2 \
  link:<repo>/plugin/d2d-panel link:<repo>/plugin/pentest-dsh
#    package.json 的 dsh.profile.bundles 依次加:
#    @deepseek-ai/dsh-base, @deepseek-ai/dsh-web-app,
#    dsh-better-sidebar, dsh-sidebar-leap, d2d-panel, pentest-dsh

# 4. headless profile(参见仓库 install.sh 的 cordis.patch.yml 模板:
#    llm-pi-ai 路由 + sandbox-policy/approval 成对全权限 + pentest-worker-env 桥)

# 5. 启动
P2P_HOST_TOKEN=$(cat ~/.config/d2d/host-token) python3 graphd/app.py &
P2P_HOST_TOKEN=... MINIMAX_API_KEY=sk-... dsh --profile web --port 8899 --no-open
```

</details>

---

## 运维速查

```bash
node scripts/ops/model-rotate.mjs list|set|unset|sync     # 按角色模型策略
node scripts/brain/study.mjs --apply                      # inbox 文章 → staged 卡
node scripts/brain/promote.mjs --check|--to-shadow|--to-current|--seed|--status
node scripts/brain/rollback.sh                            # current 切回父版本
node scripts/report/src-export.mjs [--graph 8766]         # SRC 报告(仅 verified, 去重, CVSS, 账本)
bash scripts/ops/backup-graph.sh                          # graphd 实例快照
bash ops/start-all.sh                                     # 全栈启动(install.sh 生成)
curl -s http://127.0.0.1:8888/health                      # egress-gateway 状态(动态 scope/限速)
curl -s 'http://127.0.0.1:8890/hits?tail=50'              # OAST 最近命中(label 归因)
```

## 测试

```bash
pytest tests/test_graphd_gates.py -q          # graphd 门负例回归(FSM 审计/PII/DDL/worker 只读/V 系列)
cd plugin/pentest-dsh && npm test             # allocator/scope/sanitize/validator/failover/knowledge-retrieval
cd plugin/d2d-panel && npm test               # 面板快照聚合
node --check plugin/pentest-dsh/*.js          # 语法门
sha256sum -c manifest.sha256 --quiet          # 安装完整性
```

## For Other Agents

1. 读 `README.md` + `graphd/app.py`(`finding_gates`, `transition_gate`) + `plugin/pentest-dsh/scheduler.js` + `domain/` 模块
2. 查 `tests/`(graphd 门 + 注入回归) 与 `plugin/pentest-dsh/test/` —— 门禁一律 import 实现, 从不复刻
3. 边界: `home/.dsh/skills/pentest/SKILL.md` + 简报层(`domain/briefs.mjs` + scheduler `boundary`)
