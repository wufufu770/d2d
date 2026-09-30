# 业务闸设计与 BG-2 授权申请（BG-1 交付）

> 批次: BG-1 业务闸第一段 · 设计与纯函数已落库, scheduler 集成留待本申请获批后的 BG-2。
> 本文件 = 4-3a 先例格式的显式授权申请。**本批未改 scheduler.js 任何一行（含注释）。**

## 一、机制概要

discovery 环产出一定数量的资产/信号后，若 engagement 尚无「业务形态卡」（四字段为核：
业务工作流 / 预期约束 / 参数语义 / 已识别缺口），则：
①brief 注入 `<business_gate>` 提醒块（催卡）；②深环任务派发前检查卡存在性与完整度
（未就绪不派深环挖掘任务）。目的：把"有没有理解目标业务"变成派发深环前的硬条件，
避免 worker 在不理解业务工作流的情况下对业务逻辑面盲打。

- 纯函数已落地（本批）：`plugin/pentest-dsh/domain/business-card.mjs`
  （`validateBusinessCard` / `assessBusinessCoverage` / `buildGateReminder` /
  `shouldGateDeepDispatch` / `cardCompleteness`，零 IO 零图写入）+ 示例卡
  `domain/business-gate-samples.mjs`（DVWA/SPA 黄金靶实况）+ 测试 29 例。
- 卡存储（审计项 4 结论）：engagement 级一次性工作对象，落 `runs/<eng>/business-card.json`，
  **不入知识脑**存储/晋级/检索链路；由 worker（深环前置蒸馏任务）或 discovery 收尾生成。

## 二、授权申请（4-3a 先例格式）

### 对象（精确行号实锚，BG-1-0 审计项 1；当前 HEAD `420bf75`）

| # | 文件:行号 | 现状 | BG-2 改动 |
|---|---|---|---|
| 1 | `plugin/pentest-dsh/scheduler.js:621` 后 | `const taskFull = taskWithStatus + _expRef.block`（3.5-3 经验注入先例行） | **紧随其后新增 1 行**：动态 import business-gate 编排模块，追加 `<business_gate>` 块（返回 '' 时派发零影响）。**[570,618] 禁区区间既有行零改动**，与 :618-621 先例同形态（新增行在禁区区间之外） |
| 2 | `plugin/pentest-dsh/scheduler/loop.mjs:417-423` 后 | allocateOnce 的 scope 归属过滤（`task-cancelled-scope` 先例：不合规 → cancel + runLog + continue） | **新增 1 个同构 if 块**：`s.kind ∈ ['deep-dive','chain']` 且 `shouldGateDeepDispatch(card, {taskKind: s.kind})` → runLog(`business-gate-blocked`) + `continue`（任务留 pending 不取消——卡就绪后自然放行）。loop.mjs 不在绝不碰清单 |
| 3 | 新文件 `plugin/pentest-dsh/scheduler/business-gate.mjs` | （无） | 图 IO 编排（形态照 scheduler/bias-block.mjs：绝不 throw、查询失败 → ''/放行）：读卡（`runs/<eng>/business-card.json`）+ 拉端点/信号计数 + 组装 assessment |

### 改动面

- scheduler.js：**+1 行**（尾部追加形态，第三次使用该先例：①3.5-3 experience_ref :618-621 已接线；②coverage_bias 同形态**设计了但从未接线**——`buildBiasBlock` 生产零调用、git -S 证实 scheduler.js 历史从未包含，bias-block.mjs:14-17 注释即该形态的设计稿）。
- loop.mjs：**+6 行左右**（同构 if 块）。
- 新文件 1 个（编排层）。domain 侧已全部就绪（本批）。

### 理由：为何必须 scheduler 层而非提示词层

1. **提醒时机是派发时刻的运行时状态**（素材量达标与否、卡存在与否）——提示词是静态文本，无法感知"discovery 已产出 N 端点但还没卡"这一运行时条件。
2. **派发闸是控制流**：深环任务放行/滞留是 allocator 的调度决策，只有 scheduler 层能执行；提示词层的"请先写业务卡"无强制力（worker 可忽略），业务闸的语义就是硬条件。
3. **注入位已有三个同构先例**（agent_status / experience_ref / coverage_bias 设计稿），2C 尾部追加形态是被 diff 守卫约束认可的扩展点，边际风险最小。

### 风险与缓解

| 风险 | 缓解 |
|---|---|
| 2C 区其他逻辑被波及 | 改动是禁区区间外的**纯新增行**（与 :621 共存的追加节），[570,618] 删除行=0 可 diff 证明；buildAgentStatus/experience_ref 零触碰 |
| 提醒块阻断派发 | 编排层绝不 throw（bias-block.mjs 同款）；块为 '' 时 taskFull 逐字节不变；派发闸只 skip 不取消任务 |
| 卡缺失导致深环永久饿死 | 闸只对 `deep-dive/chain` 生效（verify/link 不拦）；提醒块给出四字段催卡指引；卡由 discovery 素材达标后蒸馏生成，material 不足时闸不触发（`assessBusinessCoverage` 的 `material.sufficient` 门）|
| 业务卡内容注入 brief | 卡经 `validateBusinessCard` schema 校验 + 提醒块只输出白名单拼装文本（`buildGateReminder` 不透传原始 URL/信号）|
| 死代码前车（coverage_bias 未接线即收官） | BG-2 交付定义含**接线行的集成测试**（动态 import 单测 + runLog 事件断言），不留"编排就绪但零调用"状态 |

### 测试覆盖计划（BG-2 内）

- domain 层（本批已落 29 例）：schema/三函数/示例卡。
- 编排层（BG-2）：`business-gate.mjs` mock q/fs 全分支（读卡失败/端点查询失败/块为 ''）。
- 接线层（BG-2）：scheduler.js 追加行的 diff 断言（[570,618] 删除行=0）+ loop.mjs 闸分支单测（deep-dive 拦/verify 放行/卡就绪放行 + runLog 事件）。
- 回归：pytest 368 / mocha ≥1729+BG-2 新增 / panel 55，基线不降。

### 回滚方案

- scheduler.js +1 行与 loop.m +6 行均为独立追加块：`git revert` 单 commit 即完整回滚，不与既有行交织（追加形态的固有优势）。
- 运行时回退开关：编排层读 `P2P_BUSINESS_GATE=0` 即恒返回 ''/false（提醒与闸双双失效，等价 BG-2 之前的行为），环境变量级一键止血。

## 三、审计记录（BG-1-0 五项结论摘要）

1. **agent_status 链路**：:607-617 快照组装（图 IO :611-614 + taskWithStatus :615-617）；:618-621 经验注入先例（尾部追加）；buildAgentStatus :791+（纯函数六字段 1024B 上限）。消费方=worker brief 绝对末尾，派发时刻整体重建。
2. **深环派发检查点**：allocateOnce（loop.mjs:395-431）→ planAllocation（allocator.mjs:92 纯函数）→ scope 过滤先例（:417-423）；深环 kind 枚举 `deep-dive/chain/verify/link`（:405）。
3. **数据源**：四字段全部为语义综合型——规则可给素材（Endpoint tech/url/参数名、Signal type/evidence、coverage 象限空白），卡内容需 agent 蒸馏；`assessBusinessCoverage` 的可计算面=卡存在性+素材充分性（端点 ≥8 或信号 ≥5 触发，可调）。黄金靶样例卡 2 张已落（DVWA：login 流/user_token/安全级别 cookie/uploads 缺口；SPA：V1 无鉴权/V2 callback 污染/V3 帧注入）。
4. **边界**：业务闸管"有没有看业务"（engagement 级生成物，不入知识脑）；coverage 象限管"看得均不均"；bias 四维（param/workflow/race/execution）与 WSTG OTG-BUSL 同构——业务闸补的是"先理解再打"的前置，偏科补的是"打了之后别偏科"的事后纠偏，职责正交。WSTG 映射：OTG-BUSL 六主题（认证绕过/授权缺陷/参数篡改/竞态/工作流绕过/限额）→ 卡四字段中 `expected_constraints`（映射预期行为=测试基线）与 `param_semantics`（映射可篡改面）。
5. **禁区交集**：business-card 仓内零同名；BG-2 触碰面=禁区区间**外**的追加行（scheduler.js 文件级敏感，行级交集为零）+ loop.mjs（不在绝不碰清单）；测试落 `test/business-card.test.mjs`（本批已建）。

## 四、BG-2 工作量预估

编排文件 + 两处接线 + 三层测试 ≈ 一个标准子批（同 T2-2a-4 体量）。
