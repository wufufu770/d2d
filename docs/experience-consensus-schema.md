# 经验共识 v2 字段（reasoning_path / consensus_status）Schema 定义

> 实施批：T4-3-2（本批）。上游：T4-3-0 前置审计（docs/t4-3-plan.md §六草案）→
> T4-3-2-0 增量审计与 DDL 实证（docs/t4-3-2-plan.md，Kùzu 0.11.3 `ALTER TABLE … ADD`
> 无 COLUMN 关键字/DEFAULT 回填 `''` 非 NULL/EXPORT 往返含新列）→ 用户 schema 确认
> （含两条细化意见：superseded 存在性校验、evidence_refs 口径说明）。
> 授权链：T4-3-0 拍板⑥ + T4-3-2-0 审计 + 用户 schema 确认（do-not-touch:20-21 按行修订）。

## 0. 背景与意图

v1 共识验证（T3-1-2，domain/experience-consensus.mjs 纯函数）只能离线代理——
deviations 的 superseded_candidate "仅标注不写库"。v2 = 把推理路径与共识结论
持久化为图内正式字段（Experience 表 14→16 列），v1 纯函数语义零改动（14 it 回归门禁）。

## 1. 落点（Experience 表新增 2 列；不动既有 14 列）

| 列 | 类型/缺省 | 内容 |
|---|---|---|
| reasoning_path | STRING DEFAULT ''（''=未提供） | 结构化 JSON 串：`{"premises":[…],"evidence_refs":[…],"counter_signals":[…],"decision":"…"}`；总长 ≤4096 字符（gate_anchor 8192 先例同量级取半）；四键固定、三数组元素均为字符串、**多余键拒绝** |
| consensus_status | STRING DEFAULT ''（''=未评估） | `''` / `consistent` / `superseded:<newer-exp-id>` / `illegal`（预留枚举位，本批不产出——校验能识别即可）；v1 deviations.older 落库形态=superseded |

三处同步（缺一即 SCHEMA_DEGRADED 响亮降级）：gd/schema.py SCHEMA CREATE（Experience 行
16 列）+ 幂等 ALTER 迁移段（段尾 2 条，语法无 COLUMN 关键字）+ `_CRITICAL_COLUMNS["Experience"]`
扩 2 名。

## 2. evidence_refs 引用对象口径（细化意见②定稿说明）

`evidence_refs` 数组元素为**引用对象的仓内 id/指针字符串**，语义="该经验结论依据的证据
锚点"，按既有仓内 id 形态取值：

- 证据文件指针：`ev/<eng>/<node-id>.txt`（gates.py evidence_ref 同款形态）
- 图节点 id：Signal id / Finding id / Endpoint id 等既有短码形态
- 归档/外部引用：任意非空字符串（**不做存在性校验**——引用面有意从宽：经验结论可依据
  已被清理的临时证据或外部材料；存在性强制会把合法引用拒之门外，与"引用从宽、结论从严"
  的字段分工一致——结论真实性问题由 consensus_status 与人工复核承接，不在本列重复设防）

校验仅约束：元素均为非空字符串、数组长度 ≤16（与总长 4096 联动防灌水）。

## 3. 写入通道

### A 面（条目侧，worker 级）：/write/experience 可选字段 `reasoning_path`
- 校验链**既有门全过不变**：认证/Content-Length/R6 denylist（共享门）→ 字段校验
  （gates.py `experience_reasoning_path_rejected`：非空须可 JSON 解析+四键形态+≤4096+
  多余键拒；空串放行）→ redact_pii（消费点扩到新字段）→ 注入扫描（扫描源拼接
  reasoning_path；**high→400 拒 / soft→照写+审计 suspect 标注，不加 [SUSPECT] 前缀**
  ——前缀会破坏 JSON 结构，与 content 的差异在此注明）→ 配额 → 全参数绑定 CREATE。
- 既有 14 字段校验/服务端生成 id/写入即 quarantined 语义零改动。

### B 面（共识侧，host-only）：/write/experience-consensus（新端点）
- 认证照 host 端点先例（`_auth("host")`，worker token 403，失败审计）。
- 载荷 `{experience_id, consensus_status}`：枚举白名单
  `^(consistent|illegal|superseded:[A-Za-z0-9-]+)$` 或空；**superseded:<id> 的 <id>
  存在性校验**（细化意见①——锁内 `MATCH (x:Experience {id:$k})` 参数绑定，不存在 400）；
  experience_id 存在性校验（404）。
- 写入=SET 单列（`consensus_status`），**不动其他任何列**；审计事件
  `experience-consensus`（id/status/reviewer 形态）；共享门自动生效（/write/ 前缀
  Content-Length/R6 denylist）。
- 回写工具：`scripts/brain/consensus-apply.mjs`（consensusCheck v1 结果 → B 面逐条回写；
  **dry-run 缺省**，`--apply` 实写；v1 纯函数语义零改动）。

## 4. 读侧与消费

- `/query/experience` RETURN 显式列清单 +2 列（读侧回传；漏列=静默旧形态，测试锁定）。
- promote.mjs `consensusPreSignal` v2：v1 纯函数扫描**保留**（防未回填经验漏报）+ 拉取
  consensus_status 报告 superseded 行清单——**仍只报告不阻断**（阻断语义留 v3 拍板）。
- 假设裁决面留观察不扩 scope；panel 消费不接线；评测集维持零耦合。

## 5. 不做（防 scope 蔓延）

不加索引/不分表/不动既有 14 列/不改 experience-transition 既有语句/不伪造历史
reasoning_path 回填（存量仅回填 consensus_status，评估=consensus-apply v1 实跑结果）/
illegal 本批不产出/panel 与评测集零耦合维持。
