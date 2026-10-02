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
   $.http.fetch         $.process.run / spawn
         ▼                        ▼
┌─ graphd（Python/Kuzu，常驻）┐  ┌─ 一次性 Node 进程 ──┐
│  黑板 + 八态机 + 写通道认证  │  │ 11 个 node: 模块    │
└────────────────────────────┘  │ scripts/*（burp/   │
                                │ recon/browser/report）│
                                └────────────────────┘
```

**关键约束（官方实锚）**：
- hook 自身执行时间上限 10 秒，**但花在 `next` 与 `$` 调用上的时间不计入**。
- `$.process.run` 超时默认 30 秒、**上限 10 分钟**；后台进程持续写入会一直挂到超时才 reject。
- `$.process.spawn` 为流式 async generator —— 沙箱 2.1.287 **已实测存在**（`claude plugin validate` 识别）。
- **≥10 分钟的长任务不得走 process**：`$.agent.spawn` **恒后台**（起后即返，答案经 `turn.complete` 回收）才是长跑通道。
- `$.fs` 单文件 4 MiB；`$.store` 总计 4 MiB。
- **`$` 不得跨 import**：mods API 的 `$` 只能在 hooks 模块内「同一文件声明的函数」之间传递，且必须在调用点字面拼写（`claude plugin validate` 实证，M1）。纯逻辑可拆文件复用，但 `$` 调用一律留在 hooks 文件内。
- **`hooks.json` 的 `modules` 每插件只允许一项**（第二项被拒，M2 实证）→ 不存在「多 hooks 文件」方案，一切 hook 收敛 `register.js`。
- **hook 必须字面**：`on("event", hook)` 处不接受工厂函数/动态循环（M2 实证），否则报「not a function literal」或过滤器退化为 `tool=?`。
- **注册参数有运行时校验**：`$.agent.register` 的 `name` 限「字母/数字/_/-，≤64」（M2 实证，`:` 被拒）。
- **`$` 名词不得作值读写**（M3 实证）：`Object.keys($.agent)`、`const a = $.agent` 之类一律被 parser 拒
  （「`$.agent` is used as a value」）→ 只能字面拼 `$.noun.event(...)`。
- **`next.to(e, "<tier>")` 仅限 managed 插件**（`prependPlugins`/`appendPlugins`），用户插件用它直接
  「hooks module did not load」（M3 实证）→ 用户插件只有 `next(e)` 一条续传路径。

> **M3 追加实锚（agent.spawn / turn.complete 契约，2026-10 沙箱实测）**：
> - `$.agent.spawn({ name, prompt, ... })` 的宿主封装（`Yp`）= `{ tool:"Agent", prompt, description,
>   run_in_background:true(缺省), name }`；**恒后台**。
> - **agent.spawn hook 的返回**：`{ model }` 或 `{ deny }`（`{value:…}` 形态非法，报「neither { model }
>   nor { deny }」）。宿主再经 `{ model: result.resolvedModel ?? opt.model ?? "inherit",
>   agentId: result.agentId }` 组最终结果 —— 即 **hook 要给 `{ model, result:{ agentId, resolvedModel } }`
>   才会带出 `agentId`**；只给 `{model}` 则返回值无 `agentId`（编排追踪会失效）。
> - **turn.complete 事件** = `{ agentId:<string>, answer:<string>, usage? }`（`checkArgument` 强制
>   `answer` 为字符串且 `agentId` 与派发一致）。
> - **turn.complete hook 必须返回结果对象**（镜像 core 缺省 `(e)=>({text:e.answer, ...(e.usage&&{usage})})`）；
>   用户插件 `next(e)` 在无 core 实现时抛「no implementation for turn.complete」，`return e` 同抛。
>   → 本插件 `turnPassthrough(e)` 即该等价返回。
> - 测试 harness 里 `http.fetch`/`process.run` 等 hook 事件形如 `($, e)`：`e.fetch = { url, init }`、
>   `e.run = { argv, init }`（**不是** `(url, init)`）——离线断言按此取值。

> 📌 以上经 Phase 2 前置审计 + M1 实证修正，详见 `docs/mods-port-phase2-audit.md`。

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

## 4. 目录骨架（新增；已按 M1/M2 实证修正）

```
plugin/d2d-mods/
├── .claude-plugin/plugin.json
├── hooks/hooks.json               { "modules": ["./register.js"] }  ← 只允许一项
├── hooks/register.js              唯一 hooks 模块：门 · 注册 · 状态行（$ 调用全在此文件内）
├── src/domain/*.mjs               纯净域模块只读镜像（22 个；node: 传染的 13 个不镜像）
├── src/roles.generated.js         24 角色 → 纯数据（由 sync-core 生成）
├── src/tools.generated.js         8 工具元数据 / JSON Schema（由 sync-core 生成）
├── src/CORE_MANIFEST.json         镜像哈希清单 + 排除项（CI 校验漂移）
├── src/graphd-client.js           纯辅助：拼 URL/init、解析响应（不含 $）
├── scripts/sync-core.mjs          vendor 同步（镜像/派生）+ `--check` 漂移校验
└── tests/*.test.ts                claude plugin test 用（离线 harness）
```

> ⚠️ **两条硬约束（`claude plugin validate` 实证，M1/M2）**：
> 1. **`hooks.json` 的 `modules` 每插件只允许一项**——第二项直接被拒（「a second entry is refused」）。
>    故计划早期的「hooks/tools.js + agents.js + gates.js … 多文件」**不可行**：全部 hook 必须收敛在
>    `register.js` 一个文件内。
> 2. **hook 必须是函数字面量或同文件具名函数**：`on("event", hook)` 处不接受工厂函数/动态循环
>    （会报「the hook is not a function literal」或退化成 `tool=?`）。
> 3. **`$` 不跨 import**：纯逻辑放 `src/`，`$` 调用一律留在 `register.js` 字面拼写。

> 📐 **镜像口径修正**：早期计划写「23 纯模块」，实测按「**node: 传染闭包**」筛（直接 import `node:`，
> 或传递 import 了这类模块）→ 纯净 **22** 个、传染 **13** 个（含 `allocator` 经 `config/prompt-maxlens`
> 间接引入 `node:fs`）。传染的 13 个不镜像，走 `$.process` 桥（M3）。

> 🛠️ **工具口径修正**：早期计划写「10 工具」，按注册器实锚为 **8 个工具定义**
> （`burp_http_log`/`burp_repeater`/`burp_intruder`/`burp_decoder`/`burp_comparer`/`burp_scan_status`/
> `p2p_js_scan`/`propose_direction`）；`tools/{index,gate}.mjs` 是注册器/辅助，非工具。

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

| 批次 | 内容 | 门禁 | 状态 |
|---|---|---|---|
| Phase 2 前置审计 | 实测 §9 的 4 项技术假设 | 4 项有结论才开工 | ✅ 完成（E1/E3/E5 沙箱实测，见审计报告） |
| M1 最小可跑 | manifest + `register.js` + graphd-client + 1 命令 + 1 工具 + 1 门 + 状态行 | validate 通过 + test 绿 | ✅ 完成（4 用例绿） |
| M2 工具与角色面 | 8 工具 + 24 角色全注册；门族全接线（Bash→`checkBash`，CC 工具→`classifyToolGate`） | validate 通过 + test 绿 | ✅ **完成**（11 用例绿；工具**执行体**接线顺延 M3） |
| M3 编排与 UI | 三环并行（`$.agent.spawn`）、`turn.complete` 收答写 graphd；工具执行体桥接（`$.process`）；消毒/上下文接缝；状态行 → `Pane` | 端到端一次 engagement 全绿 | ✅ **完成（编排/桥/回收面；15 用例绿）**——`Pane` 自绘面顺延 M3.5 |
| M4 砍脚手架与换轨 | 执行 §3 砍除清单；CI 移除 dsh-compat 轨 | CI 绿 + `sync-core --check` 通过 | 待开工 |

> **M3 已落地**：工具执行体桥（`scripts/tool-bridge.mjs`：8 工具 + `sanitize`/`turn-report` 两 op，
> 逐字复用禁区执行体）、三环派生（`buildRingSpawns` → `$.agent.spawn` ×3，`agentRing` 追踪）、
> `turn.complete` 回收（消毒 + provenance_hash → `/write/experience`）、`session.append` 消毒接缝。
> **顺延**：`Pane` 富 UI（当前只有 `ui.render{component=Spinner}` 状态行）、环内并行/收敛判定（M4 分配器）、
> 活的 `claude` 会话端到端（当前为离线 harness 全绿）。

每批收尾：打 annotated tag + 回滚演练。

> **M2 的门语义（host 会话，需在 M3 复核）**：d2d 的 `checkBash` 由 worker 调用，worker 恒在 engagement 内；
> mod 的顶层 Claude Code 会话可能**没有**活跃 engagement。此时若照搬「无 eng 一律 fail-closed」会把
> 顶层普通本地命令（`ls`/`git status`）全部误杀。故 `resolveEng` 的回落是**本机哨兵 scope=`127.0.0.1`**：
> 保留 `checkBash` 全部硬规则（DESTRUCTIVE/OPTSEC/host-token/…），出网目标仍受 scope 门约束（本机以外一律拒）。
> 该语义**逐字复用禁区 `checkBash`，未改其契约**；M3 接好「哪些 `tool.call` 来自 worker」后应改为按来源分流。

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
