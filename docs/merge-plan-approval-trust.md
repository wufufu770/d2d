# 审批流 × 渐进信任合并评估（4-5+4-6 合并为四层架构第二层）

> 定位：T0-A-4 纯文档交付，零代码。合并评估结论：原计划的 4-5（渐进式信任）与 4-6（审批形态）**不再各开一条线，合并为四层架构中的第二层**，直接叠在已交付的 4-4 hook 原语之上。
> 判据源（本文件只做衔接，不另立口径）：docs/approval-channels.md（4-4 事实记录）、docs/tier-depth-mapping.md（档位词表 + 中档幂等键派生口径的唯一规范源）、docs/false-positive-schema.md（routingSafe 语义 + ledger 优先级）、docs/routing-integration-points.md（4-5/4-6 缝位锚定）、docs/PANEL-UI-SPEC.md（面板 tab 范式）。

## 一、四层架构

### 第 1 层：hook 原语（4-4，已交付）

四件套，事实记录见 docs/approval-channels.md：

- **handler 扩展**（3cff248）：wireGate `_gateHandler(cmd, exec.arguments ?? {}, exec)` 一行向后兼容——高危单四元组的 intent/proposer_reason 得以从 `exec.arguments.description` 透传（此前只传 command 丢弃）。
- **answerer 桥**（3cff248，index.js apply 注册 `ctx.on('approval/request')`）：自家标记 `d2d-approval:` → 读通道①队列应答（approved→`allowed-once`，rejected→`rejected`，超时/读失败→`unavailable` fail-closed）；非自家请求 → `next()` 交还宿主 UI answerer。不注册新服务名、不覆盖宿主既有 answerer。
- **异步队列**：`plugin/pentest-dsh/scheduler/approvals.mjs`（3cff248 新增）——`$D2D_DATA_DIR/approvals/pending-approvals.jsonl` append-only 一行一状态迁移（fold），幂等键同键合并，TTL 到点写 `timeout` 终态 + deny（fail-closed），终态一次写死。
- **P2P_APPROVAL_MODE 灰度**：`off`（缺省，既有 allow/deny 行为零变化）/ `queue`（通道①，不过宿主 approval 链）/ `native`（通道②，宿主链 + 桥读队列）；非法值一律回落 `off`。

### 第 2 层：审批流 = 4-5 + 4-6 合并

原 4-5 与 4-6 合并为一个批次交付，互为表里，不重复建设：

- **渐进信任账本**：审批决定动态归纳误报模式，写入 docs/false-positive-schema.md 的 `source:"ledger"` 侧，优先级 `ledger > static`（docs/routing-integration-points.md:23 预留缝位）。
- **低/中风险异步化**：按 docs/tier-depth-mapping.md 档位映射执行——低=异步免批（免审批不免审计）、中=异步+幂等键；高档不在本层自动化（恒阻塞同步人工批，由第 4 层"高危转人工"承接）。
- **中档幂等键（method/host/path 口径）批准**：operation 桶审批单的 `norm_payload = tool + method + host + path + 规范化 body 摘要`（docs/tier-depth-mapping.md『中档幂等键派生口径』，唯一规范来源）；同口径重复操作合并复用决定，不重批。
- **复用第 1 层，不另起炉灶**：同一存储（pending-approvals.jsonl + approvals.mjs）、同一面板 API（`GET/POST /d2d/api/approval`）、同一审批单 schema；以 `tier` 字段区分档位处置——第 1 层只发 `high`，本层放开 mid/low 落单口径，tier 词表仍以 docs/tier-depth-mapping.md 三档为唯一规范来源。

### 第 3 层：渐进信任（自动放宽策略）

- **计数器键 = model + role**：信任计数不按 engagement 记，键为模型标识 + 角色，**跨 engagement 持久化**——同一模型同一角色的历史审批表现可累积。
- **N 次零拒绝自动放宽**：连续 N 次审批零拒绝 → 自动放宽（放宽的落点——免批面/TTL/档位降档——属实施参数，实施批拍板，本文件不定数值）。
- **异常重置**：出现任一拒绝或异常（超时、放宽后命中事故）即重置计数并收紧回基线——放宽单向可逆，fail-closed。
- **ATLAS 共用信任存储：待确认**。仓库内无 ATLAS 既有实现（全仓 grep 仅命中 `.zcode/workflow-runs/` 运行记录，无生产代码与文档）；是否与 ATLAS 共用一套信任存储为开放决策项，未确认前第 3 层只落本仓自有存储，不做跨系统假设。

### 第 4 层：dsh 插件形态（审批的 UI / 角色面）

- **审批台标签页**：面板新增审批台 tab，复用 docs/PANEL-UI-SPEC.md 的 registerTab 范式（`d2d:ops`/`d2d:findings` 先例）与 host 半代理快照通道，数据即第 1 层 `GET /d2d/api/approval`。
- **总 Agent 审核**：worker 落单后可由总 Agent（主会话/总控侧）经同一队列与同一 API 代审（`decided_by` 记代审身份）；queue 模式下 worker 阻塞轮询同一决定文件，代审即解除阻塞，不新增通路。
- **高危转人工**：tier=high 恒不自动放宽、不由总 Agent 终审替代人工——阻塞同步人工批（docs/tier-depth-mapping.md 高档定义），自动化的天花板压在中/低档。

## 二、交付顺序（1 → 2 → 3 → 4）

1. **第 1 层已交付**（4-4，完成度复核见下节四）。
2. **第 2 层**（4-5+4-6 合并批）为下一交付：ledger schema 接线 + 低/中档异步化 + 中档幂等键口径落地，全部复用第 1 层设施。
3. **第 3 层**（渐进信任计数与放宽）依赖第 2 层账本与决定埋点，其后交付；ATLAS 存储决策须在开工前收口。
4. **第 4 层**（dsh 插件形态）为表现层，最后交付；前三层 API 稳定后 tab 只做壳。

## 三、与 4-4 的接口衔接（已预留，不返工）

| 接口 | 4-4 预留 | 第 2/3 层消费 |
|---|---|---|
| `decided_by` | 审批单 schema 预留 `"null → panel-human\|api\|timeout（4-5 预留 ledger-auto）"`（docs/approval-channels.md:81） | `ledger-auto` 作为新增取值，由第 3 层放宽策略写入 |
| 幂等键单源 | docs/tier-depth-mapping.md『中档幂等键派生口径』为唯一规范来源（4-6 不得另立档位词表/派生口径） | 第 2 层中档审批按口径直接实现，不改键 |
| `tier` 字段 | 审批单 schema 已有 `"tier": "high"`（本批只发 high，docs/approval-channels.md:69） | 第 2 层放开 mid/low 落单；三档词表不扩不改名 |

## 四、4-4 完成度复核（A/B/C 全完成）

| 子批 | commit | 内容 | 实证 |
|---|---|---|---|
| A 审批系统基座 | `3cff248` | ask 接线 + answerer 桥 + 异步队列（approvals.mjs）+ 通道② + description 透传；新增 approval-api/approvals 测试 | docs/approval-channels.md 全篇即 A 批记录 |
| B 审批证据摘要/验证优先 | `4068bba` | 审批证据摘要 + 验证优先 + repairability 纯函数（两段式段1）：graphd/gd/gates.py +71、schema.py、tests/test_repairability.py | `git show --stat 4068bba` |
| C 转向机制最小版 | `5039919` | 检测器 + pivot-detected + 假设降权（domain/pivot.mjs + 测试） | docs/approval-channels.md §7 C 批记录 |

结论：4-4 三子批 A/B/C 均已入库，第 1 层无遗留实施项；第 2 层（4-5+4-6 合并批）可直接开工。

## 五、6.5 拆分

原任务 6.5 不再作为单一任务存在，按以下去向拆分：

- **审批**部分 → 并入本文件**第 2 层**（4-5+4-6 合并批）交付；
- **星图**部分 → 移交 **T3**；
- **授权数字化**部分 → 移交 **T3**。
