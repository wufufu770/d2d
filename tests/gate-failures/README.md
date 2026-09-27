# tests/gate-failures/ — 门禁失败样本库（curated 种子 + 格式定义）

> 格式权威：`docs/gate-anchor-schema.md` §5。本目录**只放格式定义与 curated 种子样本**，
> 供回归测试回放（`plugin/pentest-dsh/test/gate-failure-capture.test.mjs`）。
> **运行时绝不写本目录** —— 运行时 sink 外置 `$D2D_DATA_DIR/gate-failures/YYYY-MM-DD.jsonl`
> （env `P2P_GATE_FAILURE_SINK` 可覆盖），写失败 fail-open 不影响门判定主流程
> （与 `scheduler/gates.mjs` `appendGateLog`「写失败不翻转判定」同哲学）。
> 命名避开 `failure-checklist` 字样：`scheduler/failure-checklist.mjs` +
> `docs/multi-agent-failure-checklist.md` 是 #26 multi-agent failure checklist 的**文档注入**
> 机制，与本「门禁失败样本库」（采集 gate 拦截判定 → JSONL 落盘供回归）功能无撞车。

## 行格式（JSONL，每行一个 JSON 对象）

| 字段 | 类型 | 语义 |
|---|---|---|
| `gate` | string | `"gate_d1"` \| `"gate_v"` \| `"write-400"`（写入侧校验拒绝也采） |
| `input` | object | 触发判定的原始输入（gate 入参：`profileText`/`anchorText`/`scopeCount`… 或 `severity`/`category`/`repro`/`verifyEvidence`/`anchorText`） |
| `expected` | string | 期望判定（`"pass"` / `"fail"` / `"400"`） |
| `actual` | string | 实际判定 |
| `reason` | string | 失败原因摘要（解析失败点 / 缺字段名） |
| `source` | string | 采集点（`"gateD1"` \| `"gateV"` \| `"write-400"`；curated 种子用 `"curated"`） |
| `created_at` | string | ISO-8601 UTC 时间戳 |

## 回放语义（回归测试消费）

逐行读 `*.jsonl`：`gate === 'gate_d1'` → `gateD1(input)`；`gate === 'gate_v'` → `gateV(input)`；
断言 `(判定 ok ? 'pass' : 'fail') === expected`。种子锁死的是**防规避语义**：
散文五标记/三件套齐备 + 残缺结构化锚 → 仍 fail（不降级回散文）；
若有人削弱锚校验或破坏散文回退，种子回放先行报警。

## 种子清单（curated-anchor-invalid-samples.jsonl）

均为「散文齐备但无实锚/残缺锚」的失败案例形态（生产 anchor-invalid 路径上线前的典型规避尝试）：

1. `gate_d1`：散文五标记齐备 + gate_d1 锚缺 4 个字段 → fail（anchor-invalid，缺字段点名）。
2. `gate_d1`：散文五标记齐备 + gate_anchor 垃圾 JSON → fail（anchor-invalid，散文齐备也不降级）。
3. `gate_v`：散文三件套齐备 + gate_v 锚缺 diff_req_id/marker_hit/evidence → fail（anchor-invalid）。
