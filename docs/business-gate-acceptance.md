# 业务闸收官文档（BG-2 验收）

> 批次: BG-2 业务闸第二段（scheduler 集成）· 授权依据: docs/business-gate-design.md §二（BG-1 产出, 已批）
> 集成面: scheduler.js +5/-0 · scheduler/loop.mjs +13/-0 · 新增 scheduler/business-gate.mjs
> **禁区守卫: [570,618] 删除行=0（git diff 实证 + 源码文本断言测试三重锁定）**

## 一、接线清单（三处授权全部落地）

| # | 位置 | 改动 | 内容 |
|---|---|---|---|
| 1 | scheduler.js（:620 经验注入行后, 4 行新增） | 纯新增行 | `P2P_BUSINESS_GATE` 开关判断 + 动态 import business-gate/bias-block 双模块 + `_expRef.block +=`（business_gate + coverage_bias 双块尾部追加） |
| 2 | scheduler/loop.mjs（allocateOnce 的 scope 过滤后, 13 行新增） | 同构 if 块 | `['deep-dive','chain']` → `checkDeepDispatch` → blocked 则 `runLog('business-gate-blocked')` + `continue`（**任务留 pending 不取消**, 卡就绪后自然放行） |
| 3 | scheduler/business-gate.mjs（新文件） | 图 IO 编排 | `buildBusinessGateBlock`（注入块）/ `checkDeepDispatch`（派发闸）/ `readBusinessCard` / `fetchMaterialCounts`；形态照 bias-block.mjs：绝不 throw，失败 → ''/放行 |

**行位依据（回报留痕）**：BG-1 申请材料写「:621 后追加」，实施时实证 `taskFull = taskWithStatus + _expRef.block`（:621）是字符串固化赋值——其后变异 `_expRef.block` 进不了 brief。coverage_bias 设计稿（bias-block.mjs:14-17）原意即「experience_ref 行（:620）之后、taskFull 组装前」——按设计稿原意实施（:620 后插入，:621 平移至 :625），既有行内容零改动，与 3.5-3 当年插入完全同构。此为对拍板字面「:621 后」的必要澄清而非超授权（授权实质=纯新增行+禁区零触碰+双块进 brief，全部满足）。

## 二、回退开关

`P2P_BUSINESS_GATE === '0'` → 注入与派发检查**双双失效**（缺省未设置/=1 启用；惯例照 `P2P_EXPERIENCE_INJECT` 先例）。覆盖面：注入侧（scheduler.js 追加行前置判断 + 编排层 `buildBusinessGateBlock` 内部判断双保险）、检查侧（loop.mjs 前置 deep-dive/chain 判断 + `checkDeepDispatch` 内部判断）。一键止血等价 BG-2 之前行为。

## 三、coverage_bias 死代码接线（补完 T2-2a，拍板 3 落地）

审计项 3 结论：**在授权面内**——`buildBiasBlock({q,eng})` 返回 ''/单行块（bias-block.mjs:40-52 现状），与 business_gate 同点追加即可；两块均为独立单行块，不受 agent_status 1024B 上限约束（该上限是 `<agent_status>` 块本体的内部压缩阈值，追加块在其之外，双块合计 ~450B 相对 24KB brief 预算无压力）。已与 business_gate 同行接线（`await _bb.buildBiasBlock({ q, eng })`），T2-2a 偏科检测的提醒面就此补完（统计落痕 runBiasStats 此前已由 lifecycle-ops 接线，注入面现为死代码复活）。

## 四、端到端实测记录（真实图 + 真实编排 + 开关三态）

实测 harness（一次性脚本, 未入库）对 **graphd :8766 真实实例**执行，2026-09-30：

| 步骤 | 场景 | 结果 |
|---|---|---|
| ① | 素材基线 | 图内真实 Signal_=5108（历史 engagement 累积）→ 阈值「信号 ≥5」由真实数据满足 |
| ② | 无卡 + 素材达标 | `<business_gate>` 块出现 ✓；`checkDeepDispatch(deep-dive)` → `{blocked:true, reason:'card-missing'}` ✓ |
| ③ | verify kind | 放行 ✓（深环枚举之外不拦） |
| ④ | 落卡（DVWA 示例卡） | 块消失 ✓（已就绪不提醒）；deep-dive 放行 ✓ |
| ⑤ | `P2P_BUSINESS_GATE=0`（无卡态） | 块='' ✓；拦截=false ✓（开关双覆盖实证） |
| ⑥ | 清场 | 临时 engagement 数据零残留 ✓（真实历史数据未动） |

**实测深度说明**：本实测覆盖「真实图查询 → 编排判定 → 块组装/闸决策 → 文件系统卡读写 → 开关三态」全链；未覆盖 runner spawn worker 环节（完整 engagement 需模型调用, 与「零成本测试」全局硬约束冲突, 故以组件级全链替代）。闸逻辑正确性由 ②-⑤ 四态转换完备证明；接线在真实派发路径中的生效由源码断言测试（位置+文本）与 syntax/import 链验证保证。

## 五、测试覆盖（本批新增 19 例, 累计业务闸 48 例）

- 编排层（business-gate.test.mjs）：块出现/不出现/开关三态、闸拦/放行/kind 枚举/素材不足/坏卡、异常绝不 throw。
- 接线源码断言：注入行在位 + 3.5-3 先例行原样 + 注入行在 taskFull 之前（位置依据的回归锁）+ 禁区快照行原样 + loop 同位插入不波及 scope 过滤。
- 纯函数层沿用 BG-1 的 29 例（零改动零回归）。

## 六、业务闸使用说明（运维视角）

- 何时出提醒块：discovery 产出端点 ≥8 或信号 ≥5 且 `runs/<eng>/business-card.json` 不存在/未就绪。
- 卡从哪来：worker 蒸馏生成（素材达标后由提醒块指引四字段）或人工投放；schema 见 `domain/business-card.mjs`，示例见 `domain/business-gate-samples.mjs`。
- 深环何时被拦：`deep-dive/chain` 派发时卡缺失（card-missing）或完整度 <75%（card-incomplete）且素材达标；verify/link 恒不拦；任务留 pending 不取消。
- 紧急回退：`P2P_BUSINESS_GATE=0`（注入+检查全关）。
