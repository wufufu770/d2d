# Phase 2 前置审计报告 — mods 移植

> 分支：`mods` ｜ 性质：只读审计，未改任何仓库代码
> 信源：仓库代码 + `claude-code.d.ts`（本仓 `mods/types/`，自述 2.1.277）+ 官方 mods 文档（2.1.287）+ npm registry

---

## 一、审计目的与方法

Phase 2 是开工前的前置审计，目标是把方案中 4 项技术假设落成硬结论。

**方法限制（重要）**：本审计在隔离沙箱内执行，**无 Claude Code 实例、无 Anthropic 凭据**，因此无法跑真实会话。审计分两级：
- **契约级**（本次完成）：以 `.d.ts` 与官方文档为准，确定"接口是否存在、语义如何"。
- **实测级**（未完成）：需在持有 Claude Code + 凭据的机器上跑，见 §五。

---

## 二、环境实锚

| 项 | 实测值 |
|---|---|
| 沙箱分支 | `mods` |
| `claude` CLI | **未安装**（`claude not found`；无 `~/.claude`） |
| Node / npm | v24.1.0 / 11.4.2 |
| npm `@anthropic-ai/claude-code` | `latest` = **2.1.287**（`stable` 2.1.285 / `next` 2.1.288） |
| 本仓 `claude-code.d.ts` 自述版本 | **2.1.277** |

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

## 五、阻塞项：须在用户机器实测（沙箱无法完成）

| 编号 | 待实测 | 方法 | 影响面 |
|---|---|---|---|
| E1 | 本机 `claude --version ≥ 2.1.287` | `claude --version` | 全局门槛 |
| E2 | `$.agent.register` 的 `tools` 白名单运行时强制 | 注册一个仅允许 `Read` 的 agent，看 `Bash` 是否被拒 | M2 角色面 |
| E3 | `$.process.spawn` 存在性与流式长跑 | 本机 `/plugin-types` 重生成 d.ts，查 `process.spawn` 签名；再跑 ≥20 min 流式任务 | M1/M3 |
| E4 | `$.session.send/receive` 跨会话投递 | 起两会话，用 SendMessage 互投 | 多 engagement |
| E5 | `claude plugin validate` / `test` 离线可用性 | 对本仓 `plugin/d2d-mods/` 试跑 | M1 门禁 |

> 建议：E1–E5 由用户在**持有凭据的真实机器**上一次性跑完，回填本报告；沙箱侧不再空转。

---

## 六、Phase 2 门禁判定

| 判据 | 结果 |
|---|---|
| 4 项技术假设有明确结论 | ✅ 契约级全部有结论（A1–A4） |
| 方案已按结论修正 | ✅ §四，已回写方案文档 |
| 残留不确定项已具名、可实测 | ✅ §五 E1–E5 |
| 是否可开工 M1 | ⚠️ **有条件**：契约级已足以设计 M1 骨架；但 E1/E3 未实测前，**不承诺长跑与版本门禁** |

**结论**：Phase 2 契约级审计**通过**；进入 M1 前需用户回填 E1–E5（尤其 E1 版本、E3 `process.spawn`）。

---

## 七、本次审计的只读性声明

- 未安装/未运行 Claude Code，未发起任何需要凭据的调用。
- 未修改任何仓库代码；仅新增本报告 + 修正 `docs/mods-port-plan.md` 的两处被证伪表述。
- 全部产出落在 `mods` 分支。
