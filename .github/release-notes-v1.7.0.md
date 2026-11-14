# d2d v1.7.0 — 复测三态会话 + 双图锚点（reArtex 语义移植第二批）

pentest-dsh 1.7.0：SRC 复测闭环 + 资产互查图。复测结论从"workspace 报告文件"升格为"图内 Verification 事件（append-only+去重门）+ WorkItems 工单自动收口"；资产图与探索图经锚点边互查（资产反查被哪些发现测过/被哪些任务探过）。安全面纪律不变——复测写回走既有 host-only verification 端点，锚点写面 host-only 幂等+双端 404 fail-closed。

## Added

### 1. 复测三态会话（scripts/xring/retest-tri.mjs）
- 三态显式化：**reproducible(仍可复现) / fixed(已修复) / unconfirmable(无法确认)**。
- 判定映射：verify-runner 词表 pass→仍可复现 / fail→已修复 / manual·异常·未知词→无法确认（fail-closed 归人工，不臆断）。
- 结论入图：`/write/verification` kind='retest'（上游枚举已收录零改）——append-only+去重门（run_id=retest-<ts> 键，重放幂等），VERIFIED_BY 边自动挂。
- WorkItems 全闭环：SRC 报告工单（投递箱/GitHub）→ 影子 → 放行 → reconcile 自动派发复测 CLI → 三态结论入图 → 工单 done 回写。重放执行=外部执行器（payload.replay_result）或缺省 manual（宿主无靶环境重放器，诚实归人工）。
- CLI：`node scripts/xring/retest-tri.mjs --finding F-1 [--replay-result pass|fail|manual] [--complete-workitem wi-xxx] [--dry-run]`。
- 与既有 retest.mjs（retestFacts 重放执行层）正交零触碰——本批只做结论显式化+入图层。

### 2. 双图锚点（graphd 加性）
- 锚点边：FINDING_ON(Finding→Asset) + TOUCHED(Task→Asset)——`CREATE IF NOT EXISTS` 纯加性，既有 12 节点表/八态机/actor+reason/host-only 认证零触碰（pytest 纯加性护栏断言）。
- 写端点：`POST /write/anchors`（host-only；幂等——既有边零新建；双端引用缺一 404 fail-closed 拒挂空）。
- 反查查询：`MATCH (f:Finding)-[:FINDING_ON]->(a:Asset)` 经既有 /query host-token 通道——零新读端点。
- graphd VERSION → 1.8.0（schema 变更强制实例换装，preflight 版本握手）。

## 验证口径

pytest 14（锚点 7 + M1 回归 7）/ mocha 2245（2237 + retest-tri 8）/ verify-dsh-version 五项绿 / boot 零 pending（WorkItems 框架+reconcile 挂载）。**全程本地零推送**（push URL 物理禁用）。

## 债项

cold_digest 大 brief 压缩（消费接线邻接 scheduler 禁区，需显式授权批）；意图运行时契约（任务书模板面）；双图锚点面板可视化。

## 资产

SBOM（CycloneDX）+ 三平台报告字段映射样例（脱敏版）。
