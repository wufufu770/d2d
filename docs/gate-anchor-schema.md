# 门禁结构化锚（gate_anchor）Schema 定义

> 实施批：T1-4-1（本文档）/ T1-4-2（graphd 落列 + `/write/signal` 接受 `gate_anchor` 字段）。
> 上游素材：审计结论（Signal_ 表 CREATE 在 graphd/gd/schema.py:12；`/write/signal` handler 在
> graphd/app.py:720-771；消费点 scheduler/gates.mjs:44/:83/:276；briefs.mjs:53-56/:93）。

## 0. 背景与拍板

Gate-D1（画像门）与 Gate-V（验证门）目前靠 `Signal_.evidence` **散文**解析：

- D1：worker 按 brief 指令写 `type='protection-profile'` 信号，evidence 带
  `WAF=<…>; 速率=<…>; 噪声=<…>; 证据=<…>; 开放问题=<…>` 五标记
  （plugin/pentest-dsh/domain/briefs.mjs:53-56），调度器 `gateD1` 读 `s.evidence` 作
  `profileText` 确定性校验后才启动深环（plugin/pentest-dsh/scheduler/gates.mjs:44、:50）。
- V：verify 环 worker 按 brief 写 `type='verify-result'` 信号，evidence 以
  `finding:<id> verdict:<词> 依据:<…>` 开头（briefs.mjs:93；双签第二写入源
  gates.mjs:256/:435 同格式 + `sign:2` 一次性签码），调度器消费后传 `verifyEvidence: r.ev`
  进 `gateV`（gates.mjs:83、:276）。

散文解析对格式漂移脆弱（worker 措辞偏移 → 解析失败 → 信号弃置）。本批引入**可选**结构化锚。

**落列方案（审计建议，已拍板采纳）**：`gate_anchor` 放 `Signal_` **单一通用列**——D1 画像信号
与 V verify-result 信号**同列**，列内存 JSON 串、消费侧按信号 `type` 自判 schema，**不分列**。
理由：①两信号本就同表共 evidence 列，消费靠 type 分派天然隔离（gates.mjs:44
`type='protection-profile'` vs :83 `type='verify-result'` 两条独立查询）；②仓库先例全是通用
共享列（content_hash/source_hash/evidence_ref/surface/boundary 均跨信号类型复用），无按 type
分列先例；③分列使列数随门禁增长且逐列 ALTER 迁移成本线性涨。

## 1. 落列

```sql
ALTER TABLE Signal_ ADD gate_anchor STRING DEFAULT '';   -- 旧库幂等迁移
-- 新库由 SCHEMA CREATE 直建（graphd/gd/schema.py Signal_ 行, 15→16 列）
```

- 类型 `STRING DEFAULT ''`，`''` = 无锚占位（与 surface/boundary/content_hash 同语义）。
- **三处同步**（repairability 4-4 子批次 B 先例逐字对齐，schema.py:197-205/:268-269）：
  SCHEMA CREATE + 幂等 ALTER + `_CRITICAL_COLUMNS["Signal_"]`；缺列即消费点 Binder 异常被
  `.catch` 静默吞，`_verify_critical_columns` → `SCHEMA_DEGRADED` 响亮告警兜底。
- 其他列零触碰；八态机/host-only 认证/Experience/Frontier 表结构与端点零触碰。

## 2. 锚 schema（用户拍板版）

列内为 JSON **对象字符串**（UTF-8，≤8192 字符）。顶层至多两键，按信号 type 消费其一：

### gate_d1（配 `type='protection-profile'` 信号 — 画像门锚）

| 字段 | 类型 | 语义（散文五标记一一对应） |
|---|---|---|
| `baseline_req_id` | string | 干净基线请求 id |
| `baseline_diff_req_id` | string | 差分对照请求 id（WAF/限流对照探测） |
| `rate_budget` | string | 速率预算观察（如 `"30 req/min 无 429"` ← `速率=`） |
| `waf_marker` | string | WAF 指纹（`none` 或类型指纹 ← `WAF=`） |
| `noise_marker` | string | 高危资产/蜜罐盘点（← `噪声=`） |
| `evidence` | string[] | 支撑证据清单（← `证据=`） |
| `open_questions` | string[] | 未决项（← `开放问题=`） |

### gate_v（配 `type='verify-result'` 信号 — 验证门锚）

| 字段 | 类型 | 语义 |
|---|---|---|
| `category_anchor` | enum | `ssrf\|traversal\|xss\|rce\|auth_bypass\|race` 六类之一 |
| `baseline_req_id` | string | 基线请求 id |
| `diff_req_id` | string | 差分（命中）请求 id |
| `marker_hit` | string | 命中标记（与 finding repro 中标记对应） |
| `evidence` | string[] | 支撑证据清单 |

**必填口径**：锚对象一旦出现（顶层含 `gate_d1` 或 `gate_v` 键），该键下**上表所列字段全部必填**
——与散文五标记全量要求同构；消费侧按"字段缺 → fail"执行（见 §3 语义②）。

### wire 示例

```jsonc
// POST /write/signal （Gate-D1 画像信号，结构化锚 + 散文并存）
{
  "eng": "<eng-name>", "type": "protection-profile", "weight": 1.0,
  "evidence": "WAF=无; 速率=30 req/min 无429; 噪声=无蜜罐; 证据=baseline#1; 开放问题=无",
  "gate_anchor": "{\"gate_d1\":{\"baseline_req_id\":\"req-b01\",\"baseline_diff_req_id\":\"req-d01\",\"rate_budget\":\"30 req/min 无429\",\"waf_marker\":\"none\",\"noise_marker\":\"无蜜罐\",\"evidence\":[\"baseline#1\"],\"open_questions\":[]}}"
}
```

```jsonc
// POST /write/signal （Gate-V 裁决信号）
{
  "eng": "<eng-name>", "type": "verify-result",
  "evidence": "finding:f-123 verdict:confirmed 依据:复现响应含 marker",
  "gate_anchor": "{\"gate_v\":{\"category_anchor\":\"ssrf\",\"baseline_req_id\":\"req-b02\",\"diff_req_id\":\"req-d02\",\"marker_hit\":\"collab-hit\",\"evidence\":[\"finding:f-123\"]}}"
}
```

## 3. 兼容语义（三条，拍板）

1. **空/缺 → 字面回退**：`gate_anchor` 为 `''`、缺省或存量行无该列 → 消费点按原**散文**解析，
   行为零变化。三个散文消费面（gateD1 gates.mjs:50 读 `s.evidence`、profileHasWaf、
   scheduler.js:541 画像注入）必须保留散文回退。
2. **非空解析失败/字段缺 → fail 防规避**：锚非空但 JSON 不可解析、非对象、缺
   `gate_d1`/`gate_v` 键 → **写入侧 400**（graphd/app.py `/write/signal`，错误码沿现有惯例
   `{"ok": false, "error": …}`）；消费侧（后续批次接线）遇到非空但残缺的锚 → 门判 **FAIL**，
   **不得**降级回散文——防"带残缺锚绕过散文校验"的规避路径。注意这与 surface/boundary
   "枚举外置空"的软校验**刻意不同**：锚是调度器确定性消费的数据，残缺锚比无锚更危险。
3. **结构化优先**：锚命中且合法 → 以锚为准，不再散文解析（**不双读互斥**）；
   gateV 的 `verifyEvidence`（gates.mjs:276）保持 `r.ev` 原文传参不变，新列作优先锚源。

## 4. 写入通道（T1-4-2 已实现）与读取

- `/write/signal` 新增**可选**字段 `gate_anchor`（JSON 字符串）：
  - 空/缺省 → 列落 `''`（DEFAULT 同语义，存量写入零变化）；
  - 非空 → 依次校验：长度 ≤8192 字符 → `JSON.parse` 合法 → 顶层是 object 且含
    `gate_d1`/`gate_v` 键之一；任一不满足 → **400**；
  - 合法 → 原文透传入库（Cypher 参数绑定 `$ga`，服务端不派生不改写锚内容；
    denylist 红线扫描已在上游对整包 req JSON 生效，锚内容无豁免）；
  - `/query` 读侧**零改动**（列随行返回：`MATCH (s:Signal_) RETURN s.gate_anchor`）。
- 服务端不深校验 gate_d1/gate_v 内部字段（那是 §3② 消费侧职责）；写入侧只挡
  "结构性非法"的锚。
- 本批只落数据层 + 写入通道；调度器消费接线留后续批次（repairability 4-4 子批次 B
  "先落列占位、写入接线后批"同款节奏）。

## 5. 失败样本库（gate-failure samples，供回归）

> 命名避开 `failure-checklist` 字样：`scheduler/failure-checklist.mjs` +
> `docs/multi-agent-failure-checklist.md` 是 #26 multi-agent failure checklist 的 preEngagement
> **文档注入**机制（读 md 抽 Top3 现象行拼 ≤1KB 注入，失败返回 `{ok:false,text:''}`），
> 与本"门禁失败样本库"（采集 gate 拦截判定 → JSONL 落盘供回归）功能无撞车。

- **运行时 sink**：`$D2D_DATA_DIR/gate-failures/YYYY-MM-DD.jsonl`（env
  `P2P_GATE_FAILURE_SINK` 可覆盖，指向仓库目录供 CI 收集）。**运行时不写仓库**，工作树不脏。
  写失败 fail-open、不影响主流程（与 scheduler/gates.mjs:24-32 `appendGateLog`
  "写失败不翻转判定"同哲学）。
- **仓库内 `tests/gate-failures/`**：只放格式定义（本节）+ 种子样本，供回归测试消费。
- **行格式**（JSONL，每行一个对象）：

| 字段 | 类型 | 语义 |
|---|---|---|
| `gate` | string | `"gate_d1"` \| `"gate_v"` \| `"write-400"`（写入侧校验拒绝也采） |
| `input` | object | 触发判定的原始输入（evidence 散文 / gate_anchor 原串） |
| `expected` | string | 期望判定（如 `"pass"` / `"fail"` / `"400"`） |
| `actual` | string | 实际判定 |
| `reason` | string | 失败原因摘要（解析失败点 / 缺字段名） |
| `source` | string | 采集点（`"gateD1"` \| `"gateV"` \| `"write-400"`） |
| `created_at` | string | ISO-8601 UTC 时间戳 |
