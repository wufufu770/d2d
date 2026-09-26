# 审批通道（4-4 子批次 A：审批系统基座）

> 实施批：4-4 子批次 A（A-1 ask 接线 / A-2 answerer 桥 / A-3 通道①队列 / A-5 description 透传 / A-6 对抗面）。
> 上游规则资产：docs/tool-risk-rating.md（bash=高）、docs/false-positive-schema.md（routingSafe 语义 + 封闭词表种子）、docs/tier-depth-mapping.md。

## 0. 4-2-0 基线修正（先纠正一个审计结论）

**宿主一直有 ApprovalService。** 4-2-0 审计「宿主无 ApprovalService」的结论是 grep 查错了 bundle：
`@deepseek-ai/dsh-base/cordis.patch.yml:224-228` 早已 insert `@deepseek-ai/dsh-user-approval`：

```yaml
- id: approval
  name: '@deepseek-ai/dsh-user-approval'
  config:
    policy: !!js "(process.env.DSH_PERMISSION_MODE ?? 'workspace-write') === 'danger-full-access' ? 'never' : 'ask'"
```

- **web 宿主** = policy `ask`（`DSH_PERMISSION_MODE` 未设 danger-full-access 时），真实 UI answerer
  （`dsh-client-ui-approval`，client.js:282 `ctx.remote.$on("approval/request", …)`）已组合 ——
  **主会话 ask 今天即可被消费，零新通道**。
- **headless worker** = policy `never`（deployed `~/.dsh/profiles/headless/cordis.patch.yml:60-62`，
  `danger-full-access → never` 成对钉死）。

ask 通路（宿主既有，本批只接线不改动）：gate 返回 `{kind:'ask',reason}` → dsh-tools `prepareExecution`
→ `serviceAsk`（dsh-tools lib/index.js:3303-3358，四分支 allowed-once/rejected/cancelled/unavailable）
→ `ctx.get('approval').request()`。`decide()`（dsh-user-approval lib/index.js:175-192）：
signal abort → `cancelled`；policy `never` → `rejected`（**answerer 之前短路**）；waterfall
`approval/request`，无 answerer → `unavailable`。OUTCOMES = `['allowed-once','rejected','cancelled','unavailable']`。

## 1. 灰度旋钮：P2P_APPROVAL_MODE

| 值 | 行为 | 默认 |
|---|---|---|
| `off` | 分类器不触发 ask；三挂载点 ask 分支不可达；桥注册但幂等旁路（恒 `next()`）。**既有 allow/deny 行为零变化** | ✅ 缺省 |
| `queue` | 通道①：gate 内落盘 pending 单 + 阻塞轮询决定文件，**不经过宿主 approval 链**（worker policy=never 也不影响） | |
| `native` | 通道②：gate 返回 `{kind:'ask'}` 走宿主 approval 链；answerer 桥读通道①队列应答 | |

非法值一律回落 `off`（fail-closed：不引入新通路）。

## 2. 通道①：审批队列（worker 主通道）

- **落盘**：`$D2D_DATA_DIR/approvals/pending-approvals.jsonl`（目录 0700），append-only，一行一状态迁移；
  同 id 后行覆盖前行（fold）。实现：`plugin/pentest-dsh/scheduler/approvals.mjs`。
- **流程**：wireGate 高危命中 → `maybeAsk` 落单（幂等）→ wireGate 内 `awaitDecision(id, {signal: exec.signal, ttlMs})`
  阻塞轮询 → `approved` 放行（`next()`）/ 其余 deny。异步门挂 `exec.signal` 是宿主 sanctioned 契约
  （dsh-tools lib/types/index.d.ts:29-32 "Async gates must observe exec.signal"）。
- **TTL**：`min(回合预算, P2P_APPROVAL_TTL_MS 默认 5m)`；worker 回合预算取 `P2P_WORKER_TIMEOUT_MS`（默认 20m）。
  到点无决定 → 写 `timeout` 终态 + deny（**超时拒，fail-closed**）。阻塞吃 worker 20m 墙钟预算
  （step 预算不受影响——阻塞中不产生新 step），TTL 必须有界。
- **幂等键**：`idem_key = sha256(join('\x1f', eng, actor, bucket, norm_payload))[:16]`，`bucket='operation'`，
  `norm_payload` = 空白折叠。**同键重试合并不重批**：已 `approved` → 复用决定（不重批直接放行）；
  已 `pending` → 继续等待同一张单（合并）。
- **终态一次写死**：`pending → approved|rejected|timeout`，终态后再裁决返回 409 语义。
  `approved` 只兑付一次的语义 = 等待方在终态上收敛，不重复消费；同键后续重试按上面规则复用。
- **并行多 ask → 多张单**（同命令同 actor 同 eng 才合并）；审计落 d2d run-log
  （`RUNS_BASE/<eng>/run-log.jsonl`，事件 `approval-requested` / `approval-decided`，
  scheduler.js:248-254 既有纪律的镜像）——**非 session log**。
- **面板 API**（`plugin/d2d-panel/lib/host/index.mjs`，trustedHosts 鉴权复用既有写端点门）：
  - `GET /d2d/api/approval` → `{ok, mode, count, approvals:[pending 单]}`;
  - `POST /d2d/api/approval {id, decision:'approved'|'rejected', decided_by}` → 裁决（终态后 409）；
  - 快照 `approvals: {mode, pending}` 附加字段 + `p2p_status` 尾行 `approvals: mode=… pending=N`（off 恒不出现在输出里）。

### 审批单 schema（用户拍板版）

```jsonc
{
  "id": "uuid",
  "idem_key": "16hex",            // sha256(join('\x1f',eng,actor,bucket,norm_payload))[:16]
  "tier": "high",                 // 本批只发 high
  "command": "exec.arguments.command 原文",
  "raw_args": {},                 // exec.arguments 全量
  "context": {
    "eng": "engagement 名",
    "recent_task": "worker=argv taskFull 摘要(≤400) / 宿主=objective",
    "intent": "exec.arguments.description（模型自述，dsh-tool-bash 必填恒非空）",
    "proposer_reason": "同 intent 源（策略场景=Gate-P anchor/Task.link_id，后续批接入）",
    "gate_summary": "scope/eng/tier/matched 摘要"
  },
  "proposer": "<lease_id|host-session>",
  "state": "pending → approved|rejected|timeout",
  "decided_by": "null → panel-human|api|timeout（4-5 预留 ledger-auto）",
  "created_at": "ISO8601", "decided_at": "ISO8601|null", "expiry_at": "ISO8601"
}
```

四元组可得性：①原始命令=cmd 现成（scope-gate-eng 审计已留痕 ≤160 归一）；②最近任务=worker 进程
`process.argv` 回读完整 taskFull 简报（adapter-dsh spawnWorker 位置参数注入）或 env
`P2P_WORKER_LEASE_ID`（两跳图反查 MATCH (a:AgentIdentity{lease_id})→MATCH (t:Task{claimed_by})
为可选替代，本批走 argv 直读）；③④操作意图+提议者理由=`exec.arguments.description`
（wireGate 现只传 command 丢弃了它——本批 `_gateHandler(cmd, exec.arguments ?? {}, exec)` 一行向后兼容）。

## 3. 通道②：宿主 approval 链（web 主会话免费收益 + native）

- **免费收益**：主会话（web 宿主）policy=ask + UI answerer 已组合 —— 本批把 gate 的 ask 形态接通后，
  主会话 ask 立即被既有 UI answerer 消费，**零新通道**。
- **native 模式**：gate 返回 `{kind:'ask', reason}`（reason 带自家标记 `d2d-approval:{json}`）→ 宿主
  `serviceAsk` → `approval.request` → waterfall → **answerer 桥**（`index.js` apply 注册
  `ctx.on('approval/request')`）：
  - 自家标记 → 读通道①队列 → OUTCOMES 词汇应答（approved→`allowed-once`，rejected→`rejected`，
    超时/读失败→`unavailable` fail-closed，signal abort→`cancelled`）；
  - 非自家请求 → `next()` 交还宿主 UI answerer（web 主会话真实人审不受影响）；
  - **不注册新服务名、不覆盖宿主现有 answerer**（自建 ApprovalService 不可行也不必要：
    服务名占用 + 宿主 4 消费方碰撞面）。
- queue 模式下 wireGate 阻塞轮询**不经过**宿主 approval 链；off 下两条通路都不激活。

## 4. 对抗面（fail-closed 为底线：任何翻转失败 → 维持 never → auto-reject，绝不静默放行）

1. **delegation 播种**：`dsh-subagent`（lib/index.js:566-570）对每个 delegate 子代 pin
   `approvalPolicy 'never'`（无视父会话策略）。处理：
   - ask 前对本会话 lazy `setApprovalPolicy(session,'ask')`（wireGate native 分支，exec.agent.session
     即 decide() 读取的会话，append 事件即生效）；
   - worker profile 进程内挂 `subagent/start` 钩子对新子代 `setApprovalPolicy(child.session,'ask')`
     （web 宿主主会话的用户自派子代理不注册此钩子，不受影响）。
   - **运行时验证项**：inprocess 直创路径（adapter-inprocess `agents.create`，无 parentAgent）不经
     captureDelegatedPolicyOverrides，未观测到 seed never——但部署默认 policy=never 时其会话仍无
     'ask' 覆盖，lazy 翻转（ask 前置）兜住该路径；subagent/start 钩子在真实宿主多 scope 下的到达性
     需运行时验证（漏翻 = auto-reject 安全默认，无放行风险）。
2. **preset 失配**：`danger-full-access ↔ never` 是 dsh-base presets 表成对预设
   （cordis.patch.yml:231-241 read-only/workspace-write/danger-full-access 三行）。
   单独改 approval 行 → `PermissionPresetService` 构造期 `derive()==='custom'` 且无显式
   `defaultPreset` → boot 抛 "configure defaultPreset explicitly"。install.sh/patch 生成逻辑禁区不动；
   处理 = 插件 apply 期 best-effort 检测（`probePresetMismatch`：读 approval/permissionPresets/shell
   服务面，组合不出 preset → console.error + adapter.notify 预警；服务面读不到则跳过）+ 本文档说明显式
   `defaultPreset` 配置要求。
3. **伪造自家标记**：非本系统产生的 `d2d-approval:` reason 指向不存在票据 → 桥读队列无此单 →
   `unavailable` → 宿主 deny（fail-closed）。

## 5. 高危分类器（初始形态：确定性正则组）

`approvals.mjs classifyRisk(cmd)`，调用点保证 checkBash（DESTRUCTIVE/OPSEC/scope/denylist/toolGate）
先行返回 null；命中放行清单（routingSafe=true 误报种子）→ 免批；否则三类候选命中 → ask：

| 候选组 | 判定 |
|---|---|
| `state-change` | 状态表（Engagement/AgentIdentity/Finding/Signal_/Endpoint/Hypothesis）+ 变更动词（SET/DELETE/REMOVE/DETACH/CREATE/MERGE/DROP）——scope.mjs:128 同源兜底纵深（checkBash 已 deny 同形） |
| `graph-write` | graphd 结构化写通道 `/write/*`（图状态变更，档位=高） |
| `egress-probe` | URL_RE（scope.mjs:60）抽到非回环 host 且命中网络探测动词（curl/wget/nc/nmap/dig/ping…） |

放行清单（封闭词表，docs/false-positive-schema.md 种子在 bash 面的投影）：D-env-path（`P2P_*` 前缀或
`D2D_DATA_DIR` env 指路的读型 `.json/.jsonl`，无写动词 guard）+ graphd-local-query（全回环 URL 且
`/query|/health` 或只读 Cypher 头，无写路径）。state-change 形态永不放行。调优只改
`approvals.mjs` 种子（登记制，扩集须改表 + run-log 审计）。

## 6. 行为矩阵（止损线）

| gate 结果 | off（默认） | queue | native |
|---|---|---|---|
| checkBash deny | deny（原文，零变化） | deny（零变化） | deny（零变化） |
| 高危命中 | **allow（分类器关闭，零变化）** | 落单+阻塞轮询，approved→allow / 其余→deny | 落单+ask→宿主链→桥读队列 |
| 其余 | allow（零变化） | allow（零变化） | allow（零变化） |

## 7. 4-4 子批次 C 记录（转向机制最小版，不依赖 SUGGESTS 边）

### C-4 SUGGESTS / PRIOR_FOR 边：全仓零生产写入（留创意环扩展）

- 现状核实（2026-09-26 全仓 grep）：`SUGGESTS`/`PRIOR_FOR` 仅出现在 schema 建表
  （graphd/gd/schema.py:49/51）、消费侧只读查询（scheduler/loop.mjs 跨链因子 `sugRows` 的
  SUGGESTS MATCH）与注释；**没有任何生产写入通道**。唯一「想建边」的指令在 creative 简报
  （domain/briefs.mjs:97「用 SUGGESTS 边连接相关 Endpoint」），但 worker 无边可写：`/query`
  对 worker 是只读门（graphd/gd/gates.py `worker_query_allowed`，mutation 关键字全拒），
  `/write/hypothesis` 只 CREATE 节点（graphd/app.py:798-805）——简报指令与写入通道矛盾，
  实图该边恒空、跨链特征恒 0。
- 处置：4-4 转向机制**不依赖** SUGGESTS 边（三源否决聚合见 `domain/pivot.mjs`，阻断判定三源：
  Finding gate_status='rejected' / Signal_ status∈['refuted','pruned'] / Hypothesis status='refuted'）。
  写入通道留创意环扩展：graphd `/write/hypothesis` 加 `action=link`，或 host 代写边——先例为
  N2 AT 边（app.py:711-718「graphd 代写 Endpoint 节点 + (s)-[:AT]->(e)」）。不属本批。

### C-5 Gate-V 位置更正（避免后续混淆）

- 纯函数 `gateV` 在 **domain/verify-verdicts.mjs:147-163**（V_ANCHORS 七类锚表 :133-141），
  **不在** domain/gates.mjs；domain/gates.mjs 实有 gateD1 / gateR / gateP / needsDualSign /
  canSpawnDualSign（gateR 的 openIntents 拒绝项在 gates.mjs:43）。
- 语义侧别：Gate-V =「缺确定性锚不盖章」（验证准入），与转向 =「被阻断就转向」（消费降权，
  domain/pivot.mjs）语义相反侧，不混用。
