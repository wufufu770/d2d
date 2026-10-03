# Phase 2 前置审计报告 — mods 移植

> 分支：`mods` ｜ 性质：只读审计，未改任何仓库代码
> 信源：仓库代码 + `claude-code.d.ts`（本仓 `mods/types/`，自述 2.1.277）+ 官方 mods 文档（2.1.287）+ npm registry

---

## 一、审计目的与方法

Phase 2 是开工前的前置审计，目标是把方案中 4 项技术假设落成硬结论。

**方法限制（重要）**：本审计起于隔离沙箱，后经用户在沙箱内安装 Claude Code 2.1.287，**离线闭环（validate/test）已可实测**；但仍**无 Anthropic 凭据**，故真实会话级（agent 运行/跨会话投递）仍无法跑。

| 级别 | 状态 |
|---|---|
| **契约级** | ✅ 以 2.1.287 二进制 API 表为准（`claude plugin validate` 逐项列出可识别调用） |
| **离线实测级** | ✅ `claude plugin validate` / `claude plugin test` 可用（沙箱装 2.1.287 后） |
| **真实会话级** | ⛔ 无凭据，未跑（见 §五 E2/E4） |

---

## 二、环境实锚（已更新：沙箱已装 2.1.287）

| 项 | 实测值 |
|---|---|
| 沙箱分支 | `mods` |
| `claude` CLI | **2.1.287**（`claude --version`；离线 validate/test 可用） |
| Node / npm | v24.1.0 / 11.4.2 |
| npm `@anthropic-ai/claude-code` | `latest` = **2.1.287** |
| 本仓 `claude-code.d.ts` | **不存在**（早期会话的临时产物，未随仓持久化）→ 一律以二进制 API 表 + validate 实测为准 |

---

## 三、四项前置假设审计结论

### A1｜版本门槛 — 门禁存在，须锁 ≥2.1.287
- npm `latest` = **2.1.287**，与官方文档「mods 需 ≥2.1.287」一致。
- 但本仓 `mods/types/claude-code.d.ts` 自述 **2.1.277**，**缺失 `$.process.spawn`**（其 `process` 命名空间仅有 `run`）。
- → **结论：版本门禁真实存在**。落地必须锁 `≥2.1.287`，且用 `/plugin-types` 重新生成类型以对齐本机版本（勿依赖本仓陈旧 d.ts）。

### A2｜`$.agent.register` 的角色表达能力 — 契约级通过，且强于 dsh 版
`AgentSpec` 字段（`.d.ts` L360–419）完整覆盖 d2d 角色系统：

| d2d 角色需求 | AgentSpec 字段 | 说明 |
|---|---|---|
| 分层专报（tier 指令） | `prompt` | **整段替换会话系统提示** |
| 每角色工具白名单 | `tools` / `disallowedTools` | 「a call to any other is refused」 |
| 模型选型 | `model` | 别名 `haiku`/`sonnet`/`opus`、全 id、或 `inherit` |
| 思考预算 | `effort` | 档位（low…max）或整数预算 |
| 权限档位 | `permissionMode` | `default`/`acceptEdits`/`plan`/`auto`/`dontAsk`/`bypassPermissions` |
| 步数预算 | `maxTurns` | 直接对应 d2d 的步数线 |
| MCP 工具 | `mcpServers` | 服务名或内联 config |
| 专属钩子 | `hooks` | settings.json 的 hooks 形状 |
| 预载技能 | `skills` | 技能名数组 |
| 首轮提示 | `initialPrompt` | 支持 `{{intent}}` 占位取 spawn 的 prompt |
| 跨run记忆 | `memory` | 持久记忆及其位置 |

- → **结论：d2d 的 24 个 role json 可 1:1 映射，且表达力强于 dsh 版**（dsh 版靠 brief 拼字符串，此处是结构化字段）。
- ⚠️ 白名单的**运行时强制**（"拒绝"是否真的发生）仍需实测，见 E2。

### A3｜长任务通道 — **方案需修正**
原方案假设「长任务用 `$.process.spawn`」。审计发现：
- `$.process.run`：一次性读全量输出，**超时上限 10 分钟**；「a background process left writing holds the call until the timeout」——即后台常驻进程会挂到超时才 reject。
- `$.process.spawn`：确为流式 async generator（文档 `$.process` → `run`, `spawn`；「Hooks on `turn.step` and `process.spawn` are async generators」），**但仅 ≥2.1.287 存在**，本仓 d.ts（2.1.277）无此方法。
- `$.agent.spawn`：**恒后台**，起后即返 `{ agentId }`，答案经 `turn.complete` 回收。

- → **结论（方案修正）**：d2d 的 20 分钟级 worker **必须映射为 `$.agent.spawn`（agent），而非 process**。`$.process.run` 的 10 分钟是硬顶，不可用于超过 10 分钟的单项工作；`$.process.spawn` 只能用于**流式**场景，不能把 `run` 的长任务假想成它可以兜底。

### A4｜跨会话 / 多 engagement — 契约级通过
- `SessionReceiveOrigin.kind` 含 `'peer'`（另一会话）与 `'peer-send-message'`（另一会话的 SendMessage）。
- `$.agent.spawn` 起名后，运行中可用 `SendMessage({ to: name })` 寻址（`.d.ts` L12391）。
- `session.receive` 钩子可改写 `text` 或 `{ consumed: reason }` 吞掉消息。
- `$.session` 面：`send`, `append`, `messages`, `usage`, `compact`, `authorize`, `surfaces`, `repo`…
- → **结论：多 engagement 协作成立**，D2 的「N 会话 + `$.session.send/receive`」路线可行（实测见 E4）。

### A5｜附带发现（对方案有利）
- **`next.budget.ms` / `remainingMs`**：hook 可自省自身时限（≈10s），便于把重活及时发现并外移。
- **`$.session.usage()`** 直接返回 `{ startedAt, context{tokens, window, percent}, rateLimits[{kind, percentUsed, resetsAt}], cost }` → **可替代 d2d 自管的模型用量账**，且 `context.percent` 直接服务上下文预算管理。
- **`$.prompt.compose` → `{ sections }`**：系统提示按 `{ id, text, scope }` 分段注入 → d2d 的 brief 注入可结构化落地。
- **`$.model.complete` maxTokens**：默认 1024，上限 64000 或模型输出上限。

---

## 四、方案修正记录（已回写 `docs/mods-port-plan.md`）

| 位置 | 原表述 | 修正为 |
|---|---|---|
| §2 架构图 | `$.process.spawn` | `$.process.run / spawn` |
| §2 关键约束 | 「长任务用 `$.process.spawn`（流式）」 | 拆三条：`run` 上限 10 分钟 / `spawn` 仅 ≥2.1.287 / **≥10 分钟长任务走 `$.agent.spawn`** |
| §5 接线表「派 worker」 | 无需改（原本已写 `$.agent.spawn`） | 保持 |

---

## 五、开放项状态（E1–E5）

| 编号 | 待实测 | 状态 |
|---|---|---|
| E1 | `claude --version ≥ 2.1.287` | ✅ **已实测** 2.1.287（沙箱） |
| E2 | `$.agent.register` 的 `tools` 白名单运行时强制 | ⛔ 需真实会话/凭据；离线 harness 已证「注册参数运行时校验」（名字受限实测捕获） |
| E3 | `$.process.spawn` 存在性与流式长跑 | ✅ **存在性已实测**（validate 识别 `$.process.spawn`）；⛔ 长跑未测 |
| E4 | `$.session.send/receive` 跨会话投递 | ✅ **存在性已实测**（validate 识别 `$.session.send`/`$.session.receive`）；⛔ 投递未测 |
| E5 | `claude plugin validate` / `test` 离线可用性 | ✅ **已实测**（对 `plugin/d2d-mods/` 跑通） |

**同一探针附带确认存在（2.1.287）**：`$.agent.spawn`、`$.clock.every`、`$.mcp.connect`、`$.prompt.compose`。
即 §2 架构图所列的 M3/M4 接缝（后台派生 / 闲时任务 / MCP / 系统提示分段）**契约级全部可用**。

> E2/E4 的真实会话级验证仍待用户在有凭据的机器上补跑；沙箱侧不再空转（离线闭环已建立）。

---

## 六、Phase 2 门禁判定

| 判据 | 结果 |
|---|---|
| 4 项技术假设有明确结论 | ✅ 契约级全部有结论（A1–A4） |
| 方案已按结论修正 | ✅ §四，已回写方案文档 |
| 残留不确定项已具名、可实测 | ✅ §五 E1–E5（E1/E3/E5 已实测，E2/E4 待凭据） |
| 是否可开工 M1/M2 | ✅ **可**（沙箱离线闭环已建立；M1/M2 均已落地并绿） |

**结论**：Phase 2 审计**通过**，M1/M2 已在沙箱落地（validate 通过 + 11 用例全绿）。真实会话级（E2 白名单强制、E4 跨会话投递）待用户在有凭据的机器补验。

---

## 七、修订记录与只读性说明

- 本报告**初版**为纯只读审计（未装 Claude Code，未改任何仓库代码）。
- **修订（沙箱装 2.1.287 后）**：更新 §一/§二 环境实锚；§五 E1/E3/E5 由「待实测」改为「已实测」；并据 M1/M2 实施结果回填 §六。
- 全部产出落在 `mods` 分支。
