# T4-3-2 实施蓝图与 schema 草案（阶段 8 子项 8-1 共识验证 v2；只读批 T4-3-2-0 产出）

> 口径：纯只读审计 + schema 草案定稿 + 实施蓝图。本批落库物仅本文件+状态文档族+devlog+manifest；
> 生产库零写（图内实锚全走运行中 graphd 只读 /query，2026-10-03 实测）；DDL 演练限 /tmp 临时库
> （子 agent 实测 + 主 agent 独立复证双份）；graphd/插件源码零改动。
> **schema 草案=§五，等用户确认后进 T4-3-2 实施批**（T4-3-0 拍板①留位：8-1 是 8-2/8-4 中定义
> 最厚者，schema 属数据结构决策，轻确认一次）。

## 一、审计项 1：Kùzu 0.11.3 DDL 能力结论（子 agent 实测 + 主 agent 复证）

### 1.1 结论卡

| 项 | 结论 | 证据 |
|---|---|---|
| ALTER 加列可行性 | **可行——语法无 `COLUMN` 关键字**：`ALTER TABLE t ADD <col> STRING DEFAULT ''` | 子 agent：带 `ADD COLUMN` 报 Parser exception（expected rule kU_AlterOptions），去关键字后两条成功（"Property reasoning_path added to table Experience."）；主 agent 独立临时库（/tmp/t432verify.o940）复跑同果。仓内自洽：gd/schema.py 全部既有 ALTER 语句本就无 COLUMN（`ADD COLUMN` 全文零命中） |
| DEFAULT 回填语义 | **既有行回填 DEFAULT 值 `''` 而非 NULL**（IS NULL=False）；ALTER 后新建行缺省亦 `''` | 双份独立实测一致；`WHERE e.reasoning_path=''` 命中既有行 |
| table_info | 新列尾插在列（16 列全列示出） | 双份实测 |
| EXPORT/IMPORT 往返 | **数据无损往返；新列自动入归档**（copy.cypher 的 Experience 行列清单自动扩至 16 列） | 子 agent：EXPORT DATABASE '<dir>'（无 TO，与 runbook-storage:14 语法一致）→ 新库 IMPORT DATABASE 往返，行数/值/TIMESTAMP 一致（FLOAT32 显示偏差 0.8999999761581421 属正常表示） |
| **IMPORT 后 DEFAULT 元数据丢失** | schema.cypher 不携带 DEFAULT 子句 → 导入库**新增行**全列得 NULL（既有行数据不受影响）；kuzu 无 SET DEFAULT 恢复手段（ALTER ADD DEFAULT 仅对新列） | 子 agent 实测（导入库 INSERT 得 None）→ 对 runbook-storage 恢复演练/B 预案为新增设计输入，本批登记开放项（§六），不改 runbook |
| CTAS | 不可用（Parser exception）；降级形态=DROP+重建+COPY FROM（IMPORT 实证该形态可行） | 子 agent 探针 |
| 主键列 | 不可 ALTER ADD（schema.py:223 注释既有自证）——本批新列非主键，无影响 | 仓内 |

### 1.2 与存储归档规程的兼容面（runbook-storage 对照）

- 逻辑归档（EXPORT DATABASE '<dir>'）：加列后**零规程改动**——新列自动进 parquet/copy.cypher，归档产物往返自洽（1.1 第 4 行实证）。
- 物理快照形态：文件级拷贝，与列无关，零影响。
- 唯一注意点=IMPORT 侧 DEFAULT 丢失（1.1 第 5 行）：当前恢复演练未立项（runbook-storage §五开放项），本批登记为该演练设计输入；B 预案（LadybugDB 迁移 EXPORT→IMPORT）首批验证项应追加"导入后新行 NULL 检查"。

### 1.3 降级预案（当前不触发，存档备查）

ADD 不可行时（当前不成立）：①新表+INSERT SELECT+应用层双写切换（kuzu 无 RENAME TABLE）；②DROP+按 16 列 schema 重建+COPY FROM 回灌（IMPORT 实证形态，成本≈停服窗口+全量回归）。判定：**无需降级，走三处同步先例直加**。

## 二、审计项 2：v1 全链对照实测与 v2 字段设计

### 2.1 v1 现状实测（零回归基础确认）

- **14 it 全绿**（`npx mocha test/experience-consensus.test.mjs`，47ms，本批复证实测）。
- 三件套实锚：`plugin/pentest-dsh/domain/experience-consensus.mjs` 123 行纯函数（consensusCheck → stats/deviations/anomalies；superseded_candidate **仅标注不写库**）；`scripts/brain/consensus-check.mjs` CLI（只读通用 /query 拉行，host token，execFileSync 参数数组形态）；`scripts/brain/promote.mjs` consensusPreSignal（:139-147；:160 shadow→current / :251 staged→shadow 两挂点，只报告不阻断，图不可达降级一行提示不挂晋级）。
- **图内现状实锚（运行中 graphd 只读 /query）**：verify-result 信号 **698** / used_knowledge 归因 **8** / Experience **9** 条全 quarantined——与 T3-1-0 审计时点（brain-audit-runbook:52-56）逐项一致，零漂移。
- **消歧（本批新证）**：`replay_matrix` 列在 **Finding** 表（schema.py:27），Signal_ 无此列（实查 Binder 报错佐证）；brain-audit-runbook:52 所述"五段 replay 矩阵"指 verify-result 信号 evidence 的**内容结构**。v2 设计勿与 Finding.replay_matrix 混淆。

### 2.2 v2 字段设计卡（细则全文见 §五草案）

| 维度 | reasoning_path | consensus_status |
|---|---|---|
| 语义 | 条目级推理路径自述（前提到结论），worker 创建经验时随条目提供 | 同面共识结论（host 半离线算出），v1 deviations.older 的 superseded_candidate 从"仅标注"升级为落库正式字段=v2 意图本义 |
| 写通道 | /write/experience 可选字段（worker 级，A 面） | /write/experience-consensus（**新 host-only 端点**，B 面——共识由 host 算出，不信 worker 自报） |
| 回写工具 | —（随条目写入） | scripts/brain/consensus-apply.mjs（新，dry-run 缺省） |

### 2.3 三处同步先例锚定（gd/schema.py 实锚）

1. **SCHEMA CREATE**：Experience 行（:35，现 14 列）加 2 列；
2. **幂等 ALTER 迁移**：:225-241 Experience 段尾追加 2 条（except-pass 先例，语法无 COLUMN 关键字）；
3. **_CRITICAL_COLUMNS**["Experience"]（:301-303 全列锁）扩 2 名——缺列即 SCHEMA_DEGRADED 响亮告警（:272-276 迁移收尾校验兜底）。

权威文档先例：docs/gate-anchor-schema.md 模板 → 实施批产出 docs/experience-consensus-schema.md。

### 2.4 写入接点设计（v1 离线产出 → v2 图内持久化）

- **A 面**：/write/experience 增**可选** `reasoning_path` 字段——校验=gates.py 新纯函数 `experience_reasoning_path_rejected`（单测真源先例 experience_evidence_ref_rejected 同款；非空时须可解析 JSON+四键形态+总长 ≤4096；空串放行=缺省占位）；**既有校验链零删改**（provenance_hash/title/content/category/evidence_ref 五校验+redact_pii+注入扫描+配额全保留），CREATE 语句增参数绑定。
- **B 面**：新 host-only 端点 `/write/experience-consensus`——/write/experience-transition 先例同款独立早退路由（既有路由零改写）；{experience_id, consensus_status}；存在性校验+枚举白名单+参数绑定；审计 experience-consensus 事件。
- **读侧回传**：/query/experience RETURN 显式列清单 +2 列（app.py:1590-1597——漏列=静默旧形态，测试锁定）。
- **消费接线**：promote.mjs consensusPreSignal 升 v2——v1 纯函数扫描**保留**（防共识列未回填的经验漏报）+追加读 consensus_status 报告 superseded 行；假设裁决面留观察不扩 scope（t4-3-plan §六拍板）。

## 三、审计项 3：GW-2 门面交互矩阵（新增写点 × 门）

| 写点/面 | 感知的门 | 判定 |
|---|---|---|
| A 面 reasoning_path | _auth(worker) / Content-Length 门 / R6 denylist 红线扫描（do_POST 共享门对 /write/* 自动）+ redact_pii（:920-922 三字段先例扩到新字段）+ experience_injection_scan（扫描源拼接 reasoning_path 串——脱敏后扫描，[REDACTED:*] 无注入词面，双向无干扰先例同款；high→400 拒同 content；soft→照写+审计 suspect 标注，**不加 [SUSPECT] 前缀防破坏 JSON**——差异在 schema 文档注明理由）+ experience_quota_reject（同条目不变） | **全量过门零豁免**（fail-closed 默认） |
| B 面 /write/experience-consensus | _auth(host) / Content-Length 门 / R6 denylist（/write/ 前缀自动）+ 服务端枚举白名单（无 reviewer_note 类自由散文面）+ 参数绑定 + 存在性校验 | 全量过门零豁免；host 信任级仍走共享门 |
| 三处同步 DDL | 非 HTTP 面（init_schema 启动期）；缺列→SCHEMA_DEGRADED | 无门交互；响亮告警兜底在 |
| 读侧 /query/experience +2 列 | 专用早退路由（app.py:1564），不走 worker_query_allowed / host_query_gate(CALL 门) / WORKER_FULLSCAN_RE | 显式列清单手工同步，漏列静默→测试锁定 |

**GW-2 刚修面感知核查**：WORKER_FULLSCAN_RE 标签闭集（无 Experience 标签，不新增查询面）；is_engagement_create（无关）；finding_gates junk 归一（无关）；verify-verdicts/sanitize（plugin verify 链，经验回流链不经过）；checkBash/egress/forbidden-target（工具侧，无新工具调用面）。**结论：v2 新写点不触任何 GW-2 修复面，零豁免需求。**

### 读写面清单

- **写**：A 面（worker）/ B 面（host-only）/ 三处同步 DDL（启动期）。
- **读**：/query/experience（EvolveR 注入 3.5-3 既有消费+新列回传）；通用 /query（consensus-check / promote 前置信号 / consensus-apply——host 侧 CLI）；panel 零消费（grep 实锚）；评测集零耦合（eval-harness / knowledge-retrieval grep 实锚——EV-1 结论复证：嵌入面与 8-1 无耦合）。

## 四、审计项 4：禁区预比对 + 实施蓝图

### 4.1 预期改动面 × 绝不碰清单比对

| 预期改动 | 比对结果 | 处置 |
|---|---|---|
| graphd/gd/schema.py 三处同步 | **do-not-touch:20「Experience 表结构（14 列）」命中** | 实施批**按行修订**为 16 列并注授权链（T4-3-0 拍板⑥+T4-3-2-0 schema 草案确认；4-3a 显式例外先例形态） |
| graphd/app.py /write/experience 扩展 | **do-not-touch:21「/write/experience、/query/experience」命中** | 同上按行修订（扩展=可选字段纯增量+既有校验链零删改） |
| graphd/app.py 新端点 /write/experience-consensus | 新增路由（transition 先例同款独立早退挂载）；do-not-touch:22 /write/experience-transition 不触碰 | 纯新增零改写 |
| graphd/gd/gates.py 新纯函数 | 既有函数零触碰（redact_pii 禁区 :17 语义不动——只扩调用点） | 纯新增 |
| scripts/brain/promote.mjs 消费接线 | 非禁区（T3-1-2 先例同款） | v1 信号保留+v2 追加 |
| scripts/brain/consensus-apply.mjs | 新文件 | 纯新增（dry-run 缺省，migrate-experience-class.mjs 先例） |
| plugin/pentest-dsh | experience-consensus.mjs 语义零改动（14 it=回归门禁） | 零改动 |
| tests/test_graphd_gates.py | 新面 pytest | 纯新增 |
| runbook-storage.md | IMPORT DEFAULT 丢失发现→开放项登记（§六）；本批落库物清单不含存储 runbook | 零改动 |

### 4.2 实施蓝图（单批 T4-3-2；改动面最小化——graphd 仅 schema.py/gates.py/app.py 三文件）

commit 族预估 4：
1. **feat(graphd)**：三处同步落列（schema.py）+ A/B 写读通道（gates.py 纯函数/app.py 扩展+新端点）+ docs/experience-consensus-schema.md + do-not-touch :20-21 按行修订
2. **feat(brain)**：consensus-apply.mjs（dry-run 缺省）+ promote.mjs consensusPreSignal v2 消费接线
3. **test**：pytest 新面（reasoning_path 校验拒收负例×形态/长度 / B 面枚举白名单+worker 403 负例 / 读侧回传两列断言 / _CRITICAL_COLUMNS 列锁）+ mocha promote 信号面
4. **chore/docs**：状态族收官+manifest regen

验收要点：①三处同步+_CRITICAL_COLUMNS 全列校验过（SCHEMA_DEGRADED 空）②A/B 面负例拒收+正例落库+读侧回传形状③v1 14 it 零回归+pytest 394/mocha 1944/panel 88 基线抬升④**既有 9 行零破坏**（ALTER 幂等+回填 '' 双份实证；上生产库前先做 /tmp 演练库 ALTER 冒烟）⑤门交互矩阵逐门断言（脱敏/注入扫描/配额行为不变）⑥归档 smoke：实施批顺手跑一次 EXPORT（临时目录）确认 copy.cypher 含新列并登记。

存量回填：既有 9 行 reasoning_path 恒 ''（不伪造历史）；consensus_status 可由 consensus-apply --apply 回填（实施批可选项，回填前 dry-run 报告先行）。

## 五、schema 草案（独立小节——**等用户确认后进 T4-3-2 实施批**）

> 落点：Experience 表新增 2 列（14→16 列；不动既有列、全列 STRING DEFAULT ''——T4-3-0 拍板形态；
> kuzu 0.11.3 语法 `ALTER TABLE Experience ADD <col> STRING DEFAULT ''` 实证可行）。

### 5.1 reasoning_path（推理路径，条目级）

- **类型/缺省**：`STRING DEFAULT ''`（''=未提供占位）。
- **内容**：结构化 JSON 串——`{"premises":["…"],"evidence_refs":["…"],"counter_signals":["…"],"decision":"…"}`；
  总长 ≤4096 字符（gate_anchor 8192 上限先例同量级取半）；四键固定：三个字符串数组+一个结论字符串；
  数组元素均为字符串、键不增删（多余键拒绝）。
- **写通道**：/write/experience **可选字段**（worker 级，随条目创建；缺省不传=''）。
- **校验**：gates.py 新纯函数 `experience_reasoning_path_rejected`——非空时须可 JSON 解析+四键形态+长度；
  空串放行。**既有门全过不变**：redact_pii（消费点扩展到新字段）→ 注入扫描（扫描源拼接；high→400 拒；
  soft→照写+审计 suspect 标注，不加 [SUSPECT] 前缀防破坏 JSON）→ 配额 → 全参数绑定。
- **依据**：与 Signal_ verify 五段 replay 矩阵互补——后者是验证过程证据（evidence 内容结构；
  Finding.replay_matrix 是 Finding 侧回填列），本列是经验条目的推理路径自述，语义不重叠。

### 5.2 consensus_status（共识结论，条目级）

- **类型/缺省**：`STRING DEFAULT ''`（''=未评估）。
- **内容**：枚举+对手 id——`''` / `consistent`（同面无分歧）/ `superseded:<newer-exp-id>`（被新侧取代，
  v1 deviations.older 落库形态）/ `illegal`（**预留枚举位，本批不产出**——语义候选=transition-illegal
  关联，留 v3 拍板）。
- **写通道**：`/write/experience-consensus`（新 **host-only** 端点；v1 共识由 host 半离线算出——沿用
  consensus-check 的 host 身份，worker 自报不可信）。
- **校验**：服务端枚举正则 `^(consistent|illegal|superseded:[A-Za-z0-9-]+)$` 或空；experience_id 存在性
  校验；参数绑定；审计 experience-consensus 事件（id/from→to 形态）。
- **消费**：promote.mjs consensusPreSignal v2——v1 扫描保留+读 consensus_status 追加报告 superseded 行
  （晋级信号仍**只报告不阻断**——阻断语义 v3 拍板）；假设裁决面留观察不扩 scope。

### 5.3 三处同步与配套

- SCHEMA CREATE（schema.py:35）+ 幂等 ALTER（:225-241 段尾 2 条）+ _CRITICAL_COLUMNS 扩 2 名（:301-303）；
  缺列即 SCHEMA_DEGRADED 响亮告警。
- 权威文档：docs/experience-consensus-schema.md（gate-anchor-schema.md 先例模板）。
- do-not-touch.md :20-21 按行修订（14 列→16 列；端点行注扩展），授权链=T4-3-0 拍板⑥+本草案确认。

### 5.4 不做（防 scope 蔓延）

不加索引/不分表/不动既有 14 列/不改 experience-transition 既有语句/不伪造历史 reasoning_path 回填/
panel 消费不接线（读面已回传，UI 呈现留后续批次）/评测集零耦合维持。

## 六、假设与未确认项 / 开放项

1. **IMPORT 后 DEFAULT 元数据丢失**（§1.1）→ runbook-storage §五"恢复演练"开放项的新增设计输入；
   B 预案首批验证项追加"导入后新行 NULL 检查/重建表缓解"。存储 runbook 本批零改动。
2. `illegal` 枚举位预留（§5.2）——本批不产出不实现。
3. FLOAT32 归档往返显示偏差属正常表示——归档自检口径注意（对照值用近似比较）。
4. 远端新增 3 条 dependabot 分支（actions/setup-node-7、setup-python-7、codeql-action-4 升级 PR）——
   本批不触碰，归用户处置。
5. consensus-check.mjs CLI 拉列不扩（保持 v1 只读形态；v2 报告由 promote 前置信号承载）——如需 CLI
   同步扩列，实施批一行改动随批定。
6. consensus-apply 对存量 9 行的回填（§4.2）为实施批可选项——非本草案确认范围。
