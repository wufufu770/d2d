# d2d → Claude Code Mods 移植方案（终稿）

> 本文件位于 **`mods` 分支**，是独立于 `main`（d2d 主线）的第二条工作线。
> 信源分级：仓库代码（Phase 0/1 实锚） > 官方 mods 文档与 `claude-code.d.ts` > 对话记忆。冲突以仓库为准。

---

## 0. 纪律例外（必读，防止分支被误清理）

本仓 `AGENTS.md` 规定「禁止长期驻留 feature 分支」。`mods` 分支是**显式例外**：

| 项 | 约定 |
|---|---|
| 基线 | 从 `main` 切出（不并入 `main`，直至本线完成） |
| 性质 | 与 `main` **并行**的第二条工作线，非 feature 分支 |
| 内容 | 仅存放 mods 移植相关的方案与产物，不含 d2d 主线改动 |
| 处置 | 保持长期并存；完成时按 AGENTS.md 规范合回或打 tag 归档 |

> ⚠️ 本例外目前**只记录在本文件内**。AGENTS.md 的接手协议只读 `docs/roadmap.md` / `docs/state.md` / `docs/do-not-touch.md`，不会读到本文件。若要让后续会话看到本例外，需在 `docs/state.md` 增加一行指针 —— 见 §9 开放项。

---

## 1. 定位与路线

**路线 C**：按 mods 原生重写编排外壳，**复用 d2d 的领域内核与 graphd**。

理由：d2d 的 harness（`adapter-dsh.mjs` 的 spawn/杀进程/超时链、`worker-env.js`、`cordis.patch.yml`、dsh 版本运维等）几乎全是为补 dsh 的能力空缺而长出的脚手架；而 Claude Code 原生已提供 subagent 生命周期、上下文压缩、权限门、模型路由、MCP、跨会话协作。反之，d2d 的 graphd 黑板与 34 个 domain 模块、10 个工具、24 个角色、门禁语义是 Claude Code 不提供的领域 IP。

**结论：d2d 的「harness」该扔，d2d 的「领域内核」该留。**

### 决策摘要（P1–P5 / D1–D4 已定）

| 编号 | 决策 | 定论 |
|---|---|---|
| P1 | 架构 | mod 做手脚，Node 内核做大脑；不引入常驻内核，graphd 为唯一常驻件 |
| P2 | graphd | 原样保留（Kuzu + 八态机 + write 通道 + host-only 认证；`$.store` 仅 4 MiB 不可替） |
| P3 | UI | 先只做状态行（`$.ui.status` + `toast`/`log`），`Pane` 延后至 M3 |
| P4 | dsh 资产 | 按清单砍脚手架；保留 HostAdapter 三原语契约（回滚点） |
| P5 | 落点 | 本仓新增 `plugin/d2d-mods/`，不 fork、不碰禁区 |
| D1 | 11 个 `node:` 模块 | 先 `$.process` 委托，再逐个改写为 `$.fs`/`crypto.subtle` |
| D2 | 多 engagement | 环内并行用 `$.agent.spawn` 后台（原生支持）；多 engagement 用 N 会话 + `$.session.send/receive`（保住 maxEngagements 硬约束） |
| D3 | 内核单一真源 | 禁区 `plugin/pentest-dsh/domain/` 不动；`d2d-mods/core/domain/` 为只读镜像，`scripts/ops/sync-core.mjs` 生成 + CI 哈希校验 |
| D4 | UI 手势 | 先状态行，`Pane` 延后 |

---

## 2. 目标架构

```
┌─ Claude Code 会话 ────────────────────────────────┐
│  d2d-mods（插件，$ 世界；无 Node / 无 DOM）        │
│   hooks/   ← 编排者：门 · 派活 · 消毒 · 状态行      │
│   core/domain/  ← 23 个纯模块只读镜像              │
└────────┬───────────────────────┬──────────────────┘
   $.http.fetch              $.process.spawn
         ▼                        ▼
┌─ graphd（Python/Kuzu，常驻）┐  ┌─ 一次性 Node 进程 ──┐
│  黑板 + 八态机 + 写通道认证  │  │ 11 个 node: 模块    │
└────────────────────────────┘  │ scripts/*（burp/   │
                                │ recon/browser/report）│
                                └────────────────────┘
```

**关键约束（官方实锚）**：
- hook 自身执行时间上限 10 秒，**但花在 `next` 与 `$` 调用上的时间不计入**。
- `$.process.run` 超时默认 30 秒、**上限 10 分钟**；长任务用 `$.process.spawn`（流式）。
- `$.agent.spawn` **恒后台**，其答案经 `turn.complete` 回收。
- `$.fs` 单文件 4 MiB；`$.store` 总计 4 MiB。

---

## 3. 模块去留清单

**砍（dsh 脚手架）**
- `adapter-dsh.mjs` 的 spawn / killGroup / DSH_BIN 探测 / 超时链
- `worker-env.js`、`cordis.patch.yml`、`package.json` 的 `dsh` 段
- `scripts/ops/verify-dsh-version.mjs`、`scripts/ops/patch-dsh-tool-fs.mjs`
- `scripts/systemd/d2d-dsh-web.service`
- `scheduler/{workers,loop,state,lifecycle-ops,lease}.mjs`（全部依赖 `node:child_process`）

**留（领域 IP，Claude Code 不给的）**
- `graphd/`（`app.py` + `gd/`）全部原样不动
- `domain/` 34 个 —— 23 个纯模块（无 `node:`）直接进 mod；11 个含 `node:` 走 `$.process` 或改写：
  `tool-policy` · `memory-store` · `strategy-evolution` · `strategy-map` · `gate-failure-capture` ·
  `knowledge-retrieval` · `write-gate` · `experience-metrics` · `digest` · `auth-contract` · `experience`
- `tools/` 10 个（`intruder` · `comparer` · `decoder` · `http-repeater` · `http-logger` · `js-scanner` · `frontier` · `scanner-status` · `gate` · `index`）→ 注册为 `$.tool`
- `roles/*.json` 24 个 → `$.agent.register(AgentSpec)`
- `scheduler/` 门族与经验族（语义保留，接缝改到 hooks）：
  `gates` · `business-gate` · `post-execute-gate` · `approvals` · `tier-approval` · `experience-*` ·
  `digest-bridge` · `starmap-tick` · `frontier-closure` · `bias-block` · `description-audit` ·
  `failure-checklist` · `injection-sampling` · `trust` · `idle-tasks`

**改（仅接缝，本体不动）**
工具/角色的注册形态：`registerXxxTools(ctx.tools, defineTool, opts)` → `registerXxxTools($, opts)`，内部改用 `$.tool.register` / `$.agent.register`。

---

## 4. 目录骨架（新增）

```
plugin/d2d-mods/
├── .claude-plugin/plugin.json
├── hooks/hooks.json               { "modules": ["./register.js"] }
├── hooks/register.js              入口
├── hooks/tools.js                 session.start → $.tool.register ×10
├── hooks/agents.js                session.start → $.agent.register ×24
├── hooks/commands.js              session.start → $.command.register + command.run
├── hooks/gates.js                 tool.call / tool.check / config.set
├── hooks/sanitize.js              session.append → 改写 content
├── hooks/context.js               session.compact / prompt.section / prompt.context
├── hooks/supervise.js             $.agent.spawn + turn.complete 编排
├── hooks/ui.js                    ui.render → 状态行
├── core/domain/                   23 纯模块（只读镜像）
├── core/graphd-client.js          $.http 封装（新写）
└── types/index.d.ts

scripts/ops/sync-core.mjs          vendor 同步 + 哈希校验
```

---

## 5. hooks 接线表（全部为已实锚事件/API）

| d2d 功能 | 现状实现 | mods 接缝 |
|---|---|---|
| 工具注册 | `ctx.tools.register(defineTool)` | `session.start` → `$.tool.register` |
| 命令 | `ctx.commands.register` | `session.start` → `$.command.register` + `command.run` |
| bash 门 / 写门 | `tools/pre-execute` → `gateWriteEdit`/`gateToolCall` | `tool.call` → `{ deny: reason }` / `{ result }` |
| 权限档位 | `approval/request` + `setApprovalPolicy` | `tool.check` → `{ decision: allow \| ask \| deny }` |
| 派 worker | `adapter.spawnWorker`（spawn dsh CLI） | `$.agent.spawn`（后台）+ `turn.complete` 收答 |
| 角色专报 | `roles/*.json` 注入 brief | `$.agent.register`（`prompt` / `tools` / `model` / `effort`） |
| 模型选型 | DSH_HOME overlay | `agent.spawn` 返 `{ model }` / `turn.step` 改 `model` |
| worker 后置门 | `tools/post-execute` | `turn.complete` + `session.append` |
| 输出消毒 | `sanitize.js` / `sanitize-ingest` | `session.append` 改写行 `content` |
| 上下文预算 | 自管 compaction | `session.compact` → `{ skip }` + `$.session.usage()` |
| 系统提示注入 | `worker-env.js` + `briefs.mjs` | `prompt.section` / `prompt.context` |
| 闲时任务 | `idle-tasks.mjs` setTimeout | `$.clock.every` / `after` |
| 黑板读写 | graphd HTTP | `$.http.fetch`（契约不变，见 §6） |
| 指标 / 账 | 自管 | `$.session.usage()`（`context` / `rateLimits` / `cost`）+ `telemetry.mark` |
| 面板态势 | panel 自绘 | `ui.render` 状态行（`Pane` 延后 M3） |
| MCP | `@deepseek-ai/dsh-mcp-client` | `$.mcp.connect` / `call` |
| 环内并行 / 多 engagement | scheduler 进程内编排 | `$.agent.spawn` 后台 / `$.session.send` · `receive` |

---

## 6. graphd 契约（实锚，原样沿用）

- `GET /health`、`GET /authorized`
- `POST /query`（host-only，worker 调会被 `host-call-denied`）、`/query/experience`、`/query/frontier`
- `POST /write/finding` · `/write/signal` · `/write/hypothesis` · `/write/endpoint`
- `POST /write/experience` · `/write/experience-transition` · `/write/frontier` · `/write/frontier-transition`
- `POST /write/transition` · `/write/transition-log`
- `POST /reset`、`POST /reload/denylist`

认证：worker token 与 host token 分级（`graphd/gd/auth.py`）；denylist 命中记 `denylist-hit`。
mod 侧只需一个 `core/graphd-client.js` 封装 `fetch` + token 注入。

---

## 7. 批次计划（遵 d2d 纪律：前置审计 → 拍板 → 批次 → CI 绿 → 下一批）

| 批次 | 内容 | 门禁 |
|---|---|---|
| Phase 2 前置审计 | 实测 §9 的 4 项技术假设 | 4 项有结论才开工 |
| M1 最小可跑 | manifest + `register.js` + graphd-client + 1 命令 + 1 工具 + 1 门 + 状态行 | `claude plugin validate` 通过 + `claude plugin test` 绿 + 本机可 `/命令`、门可拦 |
| M2 工具与角色面 | 10 工具 × 24 角色全注册；门族全接线 | domain 单测零改全绿 + hooks 新测绿 |
| M3 编排与 UI | 三环并行（`$.agent.spawn`）、`turn.complete` 收答写 graphd；消毒/上下文接缝；状态行 → `Pane` | 端到端一次 engagement 全绿 |
| M4 砍脚手架与换轨 | 执行 §3 砍除清单；CI 移除 dsh-compat 轨 | CI 绿 + `sync-core` 哈希校验通过 |

每批收尾：打 annotated tag + 回滚演练。

---

## 8. 验证与基线

复用现基线兜底：`plugin/pentest-dsh` 的 ~110 个 mocha 用例 + `tests/` 6 个 pytest 文件 + panel 轨。
路线 C 下 domain 纯模块用例应**零改即绿**（模块本体未动）；仅需为 hooks 面新增一小组 `claude plugin test`（单测 5 秒上限）。

---

## 9. 风险、红线与开放项

**风险与红线**
1. `$` 接口是 **EARLY ACCESS**（官方 `.d.ts` 明写可能无预警变更）→ 全部 `$` 依赖收敛在 `plugin/d2d-mods/` 一层。
2. hook 自身 10 秒预算 → 重活一律 `await $`，不写在 hook 体内。
3. `$.fs` 单文件 4 MiB、`$.store` 4 MiB → 大证据走 `$.process`。
4. **不碰 `docs/do-not-touch.md`**：graphd、`domain/` 禁区文件、`report.mjs`、`domain/tool-gate.mjs` 的 checkBash 契约等**原样引用，不修改**。
5. 管理型环境 `sec-default@builtin` 守卫 + `allowManagedModsOnly` 可能拒载第三方 mod（自用单机一般无碍）。

**开放项（Phase 2 前置审计须实测）**
1. 本机 `claude --version` 是否 ≥ 2.1.287（文档 2.1.287 与 `.d.ts` 的 2.1.277 口径冲突）。
2. `$.agent.register` 的 `tools` 白名单是否对 subagent 实际生效。
3. `$.process.spawn` 流式长跑（≥20 min）实测。
4. `$.session.send/receive` 跨会话协作实测。

**待办（本文件之外的记录）**
- 在 `docs/state.md` 增加一行指向本文件的指针，使接手协议能感知 `mods` 这条并行线与本纪律例外。
