# 4-1-1 PreToolUse Hook 方案设计

- **状态**：设计稿（本批只设计、不实施；不改代码/测试/CI）
- **日期**：2026-09-24
- **范围**：d2d（pentest-dsh 插件）工具前置拦截面的改写（rewrite）能力缺口，评估三条补齐路线
- **证据基线**：本机安装包 `@deepseek-ai/dsh 0.1.5-rc.1`（npm 全局），d2d 仓库 `/home/kali/d2d`，Mimosa ZCode 插件 `1.0.3`。文中所有代码引用均在本稿撰写当日本机核实，核验命令见附录 A。

---

## 1. 现状：并存的两套拦截面

d2d 生态当前有**两套互不重叠的工具前置拦截面**，分别作用在不同进程上：

### 1.1 d2d 原生 deny-only 门（wireGate → checkBash 链）

挂载链路：

1. **挂载点**：`plugin/pentest-dsh/index.js:203` —— `adapter.registerGate(ctx, async (cmd) => sched.checkBash(cmd, eng))`，薄壳一行，宿主细节全部在 adapter 内。
2. **宿主接线**：`plugin/pentest-dsh/adapter-dsh.mjs:12-23` —— `wireGate` 把 handler 挂到 dsh 的 `tools/pre-execute` 事件，只拦 `exec.name === 'bash'`，返回值只有一种决策形态：

   ```js
   if (reason) return { kind: 'deny', reason }   // adapter-dsh.mjs:19
   return next()
   ```

   即 **deny-only**：handler 返回真值理由 → deny；否则放行。没有 ask，没有改写。
3. **判定链**：`plugin/pentest-dsh/scheduler.js:147-164` —— `checkBash` 串两道门：
   - **scope/denylist 门**：`_checkBash(cmd, {...eng, denylist: loadDenylist()}, GRAPHD)`（纯函数实现在 `domain/scope.mjs`，全局黑名单由 `scheduler/state.mjs` 的 `loadDenylist` 提供，见 scheduler.js:145-152 注释）；
   - **tool-policy 门**：`_toolGate(...)`（限速 caps / 工具级熔断 / 主动扫描基线前置；异步查图，治理层异常 **fail-open** 并留日志，scheduler.js:155-163）。

第二个后端同构：`adapter-inprocess.mjs:156-160` 的 `registerGate` 与 `setup()` 内 worker 侧门控（约 ：228-238）挂的是**同一个 handler、同一种 deny-only 决策形态**。两种后端契约一致（`index.js:24` 注释），因此任何门契约扩展天然波及两处。

### 1.2 Mimosa L3 门（ZCode 插件 hook）

- 插件位于 `~/.zcode/cli/plugins/cache/zcode-plugins-official/mimosa/1.0.3/`，`hooks/hooks.json` 声明了完整的 ZCode hook 面：`PreToolUse` 上 matcher `Bash` → 进程 hook `payload/hooks/git-gate-hook.mjs`（`timeoutMs: 120000`），matcher `Edit|Write|MultiEdit` → `scan-hook.mjs`；`PostToolUse` 同构镜像，另有 `SessionStart`/`UserPromptSubmit`/`Stop` 各一道。
- **对 Bash git commit 触发现扫全仓**这一行为事实来自上一批审计（本稿任务材料给定）。本稿在磁盘上核实了 hook 的存在、matcher、进程类型与超时；引擎本体不可读——`payload/hooks/git-gate-hook.mjs:11` 是签名保护的加密装载器（`loadProtectedScript(..., "mimosa/af8b.../zcode-hook/git-gate-hook.mjs", ...git-gate-hook.engine.cjs)`），逻辑封在 `.mimosa` 密封资产内，**内部行为未在本稿独立核验**。

### 1.3 进程面差异：两张网互不重叠

- ZCode hook 只作用于 **ZCode 会话**的工具调用。
- d2d worker 是 **dsh 独立子进程**：`adapter-dsh.mjs:182` 以 `spawn('timeout', [..., DSH_BIN, '--profile', 'headless', dshTask])` 拉起，且每个 worker 可能拿到独立的 per-model `DSH_HOME` 软链 overlay（`adapter-dsh.mjs:129-149`）。
- 结论：**ZCode 侧的 Mimosa 门看不见 worker 的任何工具调用；d2d 的 wireGate 也管不到 ZCode 主会话**。两套拦截面的保护域是两个进程宇宙，能力（deny / 改写 / 上下文注入）也各自独立。

### 1.4 能力缺口（本设计的动因）

| 能力 | ZCode 会话（Mimosa 门所在） | d2d worker（wireGate 所在） |
|---|---|---|
| deny | 有 | 有（deny-only） |
| ask | 协议有（见 §2） | 无（wireGate 不产出 ask） |
| **input 改写（updatedInput）** | **协议有** | **无** |
| additionalContext 注入 | 协议有 | 无 |

d2d 想要"危险命令不直接拦死、而是修正后放行"（例如自动补 scope 边界参数、剥离越权片段），唯一协议级通道是 ZCode 的 `updatedInput`；但 worker 不跑在 ZCode 里，而 dsh 的 CC-hook 桥（§3）恰好把 `updatedInput` parse 后丢弃——**这就是缺口**。

---

## 2. ZCode PreToolUse Hook 协议完整说明

> 来源：上批对 ZCode 运行时 bundle 的反解（任务材料给定，本节整理成文）；本机 Mimosa 插件的 `hooks.json`（进程型 hook 声明、matcher、timeoutMs 字段形态）与 `@deepseek-ai/dsh-hook-protocol` 的类型定义（同一 CC 协议家族的字段规范，`lib/types/types.d.ts:104-129`）可作旁证。

### 2.1 进程模型与 stdin payload

- hook 以 `type: "process"` 本地子进程运行（Mimosa 实例：`command: "node"` + `args` + `timeoutMs` + `statusMessage`，见其 `hooks/hooks.json`）。
- 通过 **stdin** 收 JSON payload：
  - 基础 payload + `hook_event_name` + `session_id` + `permission_mode` + `transcript_path`；
  - 工具事件（PreToolUse/PostToolUse）额外携带 `tool_name` / `tool_input` / `tool_use_id`。

### 2.2 决策通道（exit 0 → stdout 严格 schema）

exit 0 时，stdout 必须是**严格 schema** 的 JSON（多余 key 即 schema 失败）：

```jsonc
{
  "decision": "approve" | "block",            // 顶层旧通道，仅此两值
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",            // 必须匹配事件名，错配则事件级字段被丢弃
    "permissionDecision": "allow" | "ask" | "deny",
    "permissionDecisionReason": "...",
    "updatedInput": { /* 完整替换后的 tool_input */ }
  },
  "additionalContext": "..."                  // 注入下一轮模型请求的上下文
}
```

要点（`dsh-hook-protocol/lib/types/types.d.ts:104-129` 的规范旁证同构）：

- 顶层 `decision` 与 `permissionDecision` 是**两条独立通道**，归一化后：`block`/`deny` 禁止、`approve`/`allow` 放行、`ask` 请求确认；`allow/deny/ask` **只能**来自 `permissionDecision`，裸 `{"decision":"deny"}` 无效被忽略。
- `updatedInput` 语义：**整体替换**该次工具调用的 input（不是深合并）。
- 所有字段可选，hook 可只行使其中任意子集。

### 2.3 exit 2 → 定向 deny

exit 2 是快捷否决通道：该工具调用被定向 deny，**stderr 内容作为否决理由**呈现给模型。无需输出 stdout JSON。

### 2.4 多 hook 串行与合并规则

同一 matcher 组命中的多个 hook **串行全部执行**（不是短路），输出按以下规则合并：

- **决策合并**：`deny > ask > allow`，与 hook 配置顺序无关——任一 hook deny 即 deny；无 deny 有 ask 则 ask；全 allow/无决策才放行。
- **updatedInput 合并**：多个 hook 都给出改写时，**后写覆盖先写**；最终值必须**过工具 schema 复验**，**复验失败 = 硬失败、不回退到原始 input**（不会"改坏了就当没改"）。
- **additionalContext**：各 hook 的注入按序拼接。

这套语义是 §4 评估"改写落点"的基准：ZCode 原生面具备完整的 deny/ask/allow + 静默改写能力，且改写有 schema 复验兜底。

---

## 3. dsh CC-hook 桥约束：updatedInput parse 后丢弃

`@deepseek-ai/dsh-hooks-claude-code@0.1.5-rc.1` 是把 CC 格式 `hooks.json` 跑在 dsh 拦截缝上的桥。**三处一致证明：`updatedInput` 被 parse，然后丢弃。**

| 证据 | 位置 | 原文 |
|---|---|---|
| 模块文档 | `lib/types/index.d.ts:6` | "`updatedInput` is logged and warned but not honored. Bespoke behavior should use typed native plugins on the same extension points." |
| 运行时行为 | `lib/index.js:192` | `if (output.updatedInput !== void 0) ctx.logger.warn("hooks-claude-code: ${point} hook requested updatedInput, which is not yet honored (ignored)")` —— warn 之后继续执行，改写被丢弃 |
| 协议类型 | `@deepseek-ai/dsh-hook-protocol/lib/types/types.d.ts:126-127` | "A tool-input rewrite a hook requested (CC `updatedInput`). **PARSED but NOT honored — input rewrite is deferred**" |

桥实际支持的决策映射（`lib/index.js:248-260`，`tools/pre-execute` 处）：

- merged `deny` → `{ kind: 'deny', reason: merged.reason ?? 'blocked by PreToolUse hook' }`
- merged `ask` → `{ kind: 'ask', reason? }`
- 其余 → `next()` 放行；`additionalContext` 会被组装成 user message 注入（`lib/index.js:206-213`）。

**额外的部署性约束**（常被忽略）：桥的 `configPath` 是**进程级**、load 时读一次；per-session 的项目本地 `hooks.json` 发现是 TODO（`lib/types/index.d.ts:14-22`）。也就是说，即使只想让 worker 获得桥的 **deny** 能力，也要把 `configPath` 接进每个 worker 的 dsh 进程配置，而不是往 worker cwd 扔一份 `hooks.json` 就完事。

**小结**：ZCode 的改写能力（`updatedInput`）**经 dsh 桥不可用**。桥至多给 dsh 进程带来 deny/ask/上下文注入——而 d2d 的 wireGate 已经原生具备 deny。指望"给 worker 配个 CC hooks.json 就能改写命令"这条捷径不存在。

---

## 4. 三条路线评估

### 4.0 路线 A 前提的实证核验（本稿当日在本机执行）

上批审计遗留一个未证实命题："已装包 grep 无 `modify`"。本稿核验如下（命令与完整输出见附录 A）：

1. **缝契约签名**：`@deepseek-ai/dsh-tools/lib/types/index.d.ts:38`
   ```ts
   'tools/pre-execute'(this: Scoped<ToolRuntime>, exec: ToolExecution,
     next: () => Promise<PreToolDecision>): Promise<PreToolDecision>;
   ```
2. **typed-Decision 全集**：`dsh-tools/lib/types/index.d.ts:414-427`
   ```ts
   /**
    * Pre-dispatch decision. `allow` runs the call; `deny` materializes an error;
    * `ask` runs only after an approval service returns `allowed-once` and otherwise
    * denies. Input rewriting is excluded because arguments are already logged and
    * presented.
    */
   export type PreToolDecision = { kind: 'allow' } | { kind: 'deny'; reason: string } | { kind: 'ask'; reason?: string };
   ```
3. **全局 grep**：对整个已安装 `@deepseek-ai` 树 grep `'modify'`/`"modify"` → **0 命中**；`rewrite` 的全部命中都是 §3 那句 "input rewrite is deferred" 的文档注释。

**结论（升级了上批的不确定态）**：typed-Decision **没有** modify/rewrite 变体，且这不是 backlog，而是**写进类型注释的设计立场**——"Input rewriting is excluded because arguments are already logged and presented"（参数在决策前已被记录与呈现，事前静默改写会让审计日志与实际执行脱节，上游有意不做）。

### 4.1 路线 A：d2d 原生 wireGate 补改写

在现有 `tools/pre-execute` 缝（`adapter-dsh.mjs:12`）上补改写能力。经 §4.0 核验，**typed 缝上没有改写变体**，故此路线只能有两种落地形态：

**A-1：deny-as-rewrite（deny 即改写，可行）**

- 机制：checkBash 判定需要修正时，wireGate 仍返回 `{kind:'deny', reason}`，但 **reason 里携带改写后的完整命令**与修正原因模板。deny 理由会作为错误结果呈现给模型（dsh 语义："deny materializes an error"），模型可见、下一步即用修正命令重发。
- **成本**：低。改动集中在 handler 返回值（reason 文案模板化），契约向后兼容（`{kind:'deny', reason}` 就是今天的形态）；两种 adapter（dsh/inprocess）零结构性改动。
- **风险**：
  - 非静默：消耗一个模型轮次，且依赖模型服从理由文本（可用知识脑 distill 把高频修正沉淀为 brief 纪律，降低重犯率）；
  - reason 长度要有界（worker 输出面已有 8MB 头尾保留的先例意识，`adapter-dsh.mjs:228-232`；理由模板应控制在百字节级）；
  - 修正命令本身要再过一遍 checkBash（防"改写建议"反而越权，建议在 reason 生成处自检）。
- **依赖**：无外部依赖。
- **适用场景**：立即生效的默认形态；修正模式有限且可模板化的场景（scope 越界、缺 timeout、凭据回显剥离等）。

**A-2：静默改写（不可行/需换面）**

- 要在执行前无感知替换 argv，d2d 必须**接管 bash 执行面**：注册/包裹自己的 bash 工具（在 dsh worker 进程内以 typed native plugin 形态，这正是桥文档 `lib/types/index.d.ts:6-7` 指的 "Bespoke behavior should use typed native plugins on the same extension points"），在工具体内执行前替换 `arguments.command`。typed 缝的 PostToolDecision（`dsh-tools/lib/types/index.d.ts:432-441`）虽有 `{kind:'accept', value/content}` 的**结果**改写，但那是执行之后，防不了危险命令，救不了这个需求。
- **成本**：高——要复刻或包裹宿主 bash 工具的全部语义（cwd、env 擦洗 `P2P_*`、egress 代理注入、超时/步数预算都挂在执行面上，见 `adapter-dsh.mjs:184-225` 的 env 工程），并与宿主原生 bash 形成**双事实源**。
- **风险**：高。dsh 尚在 0.1.5-rc，工具注册面随版本漂移；argv/引号改写本身成为新攻击面（改写逻辑 bug 可能**放宽**而非收紧命令）。
- **结论**：不建议在本批或可见将来做；除非出现"必须在执行前静默修正"的硬需求。

### 4.2 路线 B：d2d 自建工具前拦截（绕过 dsh 桥）

把 `registerGate` 契约从"返回 reason 字符串"扩展为结构化决策：

```js
// 今: handler(cmd) -> reason|string|null   (truthy => deny)
// 扩: handler(cmd) -> { action: 'deny', reason } | { action: 'rewrite', cmd, reason } | null
```

- 改写落点放在 **d2d 自己注册/包裹的 bash 执行工具内**（同 A-2 的接管方式：worker 进程内注册自有工具，执行前替换 argv）；**宿主原生 bash 保持 deny-only 不动**——模型若点名原生 bash，仍被 wireGate 兜底拦截。
- **成本**：中高。契约扩展本身便宜（兼容旧 truthy 语义），贵在改写执行面（同 A-2 的全部成本）+ 两种 adapter 的 worker 侧接线（`adapter-inprocess.mjs` setup() 内要挂同构包裹）。
- **风险**：同 A-2（双事实源、改写面成为攻击面、随 dsh 版本漂移），外加**绕行风险**——只要宿主原生 bash 仍可达，模型在受挫后改用原生 bash 就绕过了改写面；因此原生 bash 必须维持 deny-only 且 deny 理由里引导模型走 d2d 工具，或者干脆禁止原生 bash 直达。
- **依赖**：dsh worker 进程内的 typed native plugin 注册 API（存在，dsh-tools 工具注册面）；d2d worker bootstrap 链路。
- **适用场景**：静默改写是硬需求、且 deny-as-rewrite 的轮次成本不可接受的场景。
- **建议**：契约扩展（`{action: ...}` union）值得现在定下来作为**向前兼容的缝**——它让 A-1 的实现可以平滑升级为 B 的实现而不动 scheduler；但**工具包裹实施本身**推迟到有具体需求驱动。

### 4.3 路线 C：等 dsh 上游补齐 updatedInput

- **成本**：本地零代码。但时间线不可控，且 §3/§4.0 的证据表明这更像**设计立场而非排期问题**（typed 注释明言因"参数已记录已呈现"而排除改写；CC 桥侧也只是 "deferred"）。上游若坚持该立场，此路线永不通车。
- **风险**：被动等待；即便落地，也是桥 + typed Decision + schema 复验三处联动升级，0.1.5-rc 阶段的 breaking 概率不低。
- **依赖**：dsh 上游 release；无本地依赖。
- **适用场景**：仅作长期收敛观察，**不作为任何需求的计划路径**。
- **建议**：把本稿 §4.0 的三条核验命令纳入 dsh 升级检查单（升级后重跑一次 grep + 类型确认）；期间一律以 A-1 过渡。

### 4.4 对比与推荐

| | A-1 deny-as-rewrite | A-2 静默改写（A 路线重形态） | B 自建工具前拦截 | C 等上游 |
|---|---|---|---|---|
| 成本 | 低 | 高 | 中高 | 零（但不确定） |
| 静默性 | 否（模型可见） | 是 | 是 | 是 |
| 改写可靠性 | 依赖模型服从 | 确定性 | 确定性 | 确定性（含 schema 复验） |
| 主要风险 | 多一轮/可能重犯 | 双事实源+攻击面 | 同左+原生 bash 绕行 | 永不通车 |
| 依赖 | 无 | dsh 工具注册面 | 同左 | dsh 上游 |
| 建议 | **立即采纳** | 不做 | 只定契约，缓实施 | 只观察 |

**推荐**：**路线 A 的 A-1（deny-as-rewrite）作为本设计采纳的落点**——deny 理由携带改写后的完整命令，模型可见、下一步即用修正命令；同时把路线 B 的 `{action:'deny'|'rewrite', cmd?, reason?}` 契约 union 定为 registerGate 的目标形态（本批不实施），保证未来升级改写执行面时 scheduler 与两种 adapter 零返工。

---

## 5. 结论与不做清单

**结论**：

1. d2d 现状是 deny-only 门（`adapter-dsh.mjs:12` wireGate → `scheduler.js:147` checkBash 链），ZCode 侧另有 Mimosa L3 门（PreToolUse Bash → git-gate-hook）；两者分属不同进程，保护域互不重叠。
2. ZCode PreToolUse 协议具备完整决策面（deny/ask/allow/updatedInput/附加上下文 + 多 hook 串行合并），但该能力只在 ZCode 会话进程内有效。
3. dsh CC-hook 桥把 `updatedInput` parse 后丢弃（三处证据，§3），**d2d 不能经桥复用 ZCode 的改写能力**。
4. typed-Decision 无 modify/rewrite 变体已实证（本稿执行，§4.0），且上游注释表明是有意排除——路线 A 的静默形态与路线 C 的期望都被上游立场封死。
5. **采纳：A-1 deny-as-rewrite**；契约层预留 B 的 union；C 仅观察。

**不做清单（本批）**：

- ❌ 不实施任何路线：不改 `adapter-dsh.mjs` / `adapter-inprocess.mjs` / `scheduler.js` / `index.js`，不动 checkBash 返回契约。
- ❌ 不做静默改写（A-2/B 的工具包裹部分）：d2d 接管 bash 执行面成本与风险不成比例，且 0.1.5-rc 上游面不稳。
- ❌ 不给 dsh 上游发 patch / 不 fork dsh 包。
- ❌ 不把 ZCode hook 配置或 CC hooks.json 塞进 worker 的 `DSH_HOME`：桥 `configPath` 是进程级且 `updatedInput` 被丢，收益为零（§3）。
- ❌ 不依赖 `updatedInput` 及其 schema 复验语义做任何 d2d 侧设计。
- ❌ 不改 Mimosa 插件（密封资产，也不应改）。
- ✅ 本批唯一产出：本设计文档。不改代码/测试/CI，不执行 git add/commit。

---

## 附录 A：本稿核验记录（2026-09-24，本机执行）

| # | 命令（摘要） | 结果 |
|---|---|---|
| 1 | 读 `/home/kali/d2d/plugin/pentest-dsh/adapter-dsh.mjs` | :12-23 wireGate deny-only（:19 `{kind:'deny', reason}`）；:182 `spawn('timeout', [..., DSH_BIN, '--profile', 'headless', dshTask])` |
| 2 | 读 `plugin/pentest-dsh/scheduler.js` :100-209 | :147-164 checkBash 链（scope/denylist → tool-policy fail-open）；:145-152 注释指明纯函数在 domain/scope.mjs |
| 3 | `grep -rn "registerGate" plugin/pentest-dsh/` | index.js:203（挂载）、adapter-inprocess.mjs:156/:228（同构 deny-only） |
| 4 | 读 `~/.npm-global/.../@deepseek-ai/dsh-hooks-claude-code/` | `lib/types/index.d.ts:6` "logged and warned but not honored"；`lib/index.js:192` warn 后丢弃；`lib/index.js:248` deny/ask/next 映射；`lib/types/index.d.ts:14-22` configPath 进程级 + per-session TODO |
| 5 | 读 `.../@deepseek-ai/dsh-hook-protocol/lib/types/types.d.ts` | :104-129 HookOutput 归一化（approve/block + permissionDecision allow/deny/ask）；:126-127 "PARSED but NOT honored — input rewrite is deferred" |
| 6 | 读 `.../@deepseek-ai/dsh-tools/lib/types/index.d.ts` | :38 `tools/pre-execute` 缝签名返回 `PreToolDecision`；:414-427 PreToolDecision = allow/deny/ask，注释明言排除 input rewriting；:432-441 PostToolDecision（结果改写，非输入） |
| 7 | `grep -rn "'modify'\|\"modify\"" ~/.npm-global/lib/node_modules/@deepseek-ai/` | **0 命中**；`rewrite` 命中仅为 §3 的 deferred 注释 |
| 8 | `grep '"version"' ...` | dsh / dsh-hooks-claude-code / dsh-hook-protocol / dsh-tools 均 `0.1.5-rc.1` |
| 9 | 读 `~/.zcode/cli/plugins/cache/zcode-plugins-official/mimosa/1.0.3/hooks/hooks.json` | PreToolUse matcher `Bash` → 进程 hook `git-gate-hook.mjs`（timeoutMs 120000）；`Edit\|Write\|MultiEdit` → `scan-hook.mjs`；PostToolUse 镜像 + SessionStart/UserPromptSubmit/Stop |
| 10 | 读 `.../payload/hooks/git-gate-hook.mjs` | :11 为签名保护装载器（`.mimosa` 密封资产）→ 引擎逻辑加密不可读，其"git commit 现扫全仓"行为采信上批审计（任务材料），未独立核验 |

> 注：§2 的 ZCode PreToolUse 协议正文（stdin payload 字段、exit 0 严格 schema、exit 2 语义、多 hook 合并规则）来自上批运行时 bundle 反解（任务材料给定）；本机可旁证的是 Mimosa `hooks.json` 的进程型 hook 声明形态与 `dsh-hook-protocol` 类型对同一 CC 协议家族的字段规范，ZCode 运行时本身未在本稿反解。
