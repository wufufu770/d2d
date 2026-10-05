# XR 波收官小结（X-Ring v1.1 旁路自主探索通道，P0-P4，2026-10-06）

> 五 Phase 波盘点（喂 WRAP-4 总收官）。路线=XR-0 修订五 Phase（docs/xr0-audit.md）；
> 方案全文 docs/xring-plan.md §五。**波状态：P0-P3 完整收官；P4 阶段 A 收官、阶段 B
> gated 于 allowlist（用户填入后单批收口）——方案 §10 A1-A12 验收表 docs/xrp4-acceptance.md
> （12 项中 11 静态面 ✅、A12 观察面+首跑数据点待阶段 B）。**

## 各批交付一览

| 批 | 交付 | 收官态 |
|----|------|--------|
| XR-0（docs-only） | 方案全文入库（v1.1，M1-M7 修正）+六项衔接面定谳（零红线）+五 Phase 路线+U1/U2/U3 拍板记录 | ✅ |
| XR-P0 契约 | 三 Schema（ajv strict 封闭）+prompt 零流程断言+roles.xring 五环零扰动+monitor/cli skeleton+契约测试 26 例 | ✅ |
| XR-P1 写面接线 | spawn 通道（env 剥除全图 token=更强形态，实测全 401）+monitor 真进程（stop-request/budget 双路+组杀）+reflow（B/C 直写+A 级必经 verify）+verify 骨架+双 smoke 实录 | ✅ |
| XR-P2 面板 tab | 第 9 tab 只读投影（零写零动作双面固化）+host 聚合面 fail-soft+smoke 挂起根治（947s 同步阻塞根因）+manifest 补漏（B 层发现） | ✅ |
| XR-P3 循环编排 | **调查双误诊纠正**（桶名公式+累计语义 last-wins→16.3× 高估）+U2 三档（A 级硬线）+token 运行中近精确（-4.0% 偏差实测）+孤儿回收+单活跃守卫+失联检测+停滞遥测+AGENTS.md 16 | ✅ |
| XR-P4 验收 | **阶段 A**：verify 真执行器（重放器非裁判+目标面硬边界+manual 旗标）+注入链全链确定性证明（bypass 亦不放行）+P3 顺手项五件+A1-A12 表（11/12 静态 ✅）+AGENTS.md 17+DVWA 就绪确认。**阶段 B**：gated（allowlist 占位） | ◐ |

## 波级资产清单（终态形态）

- `scripts/xring/`：runner/monitor/reflow/verify-runner/recover/cli/validate+三 Schema+
  prompt+双 smoke（通道全链，A 级硬线=结构性不可绕）。
- 面板第 9 tab（只读投影：状态/预算/工件三级/事件尾窗/失联警告；零干预入口）。
- `P2P_XRING_MODE`（off/queue/bypass）+`P2P_XRING_RECORD`+`P2P_XRING_STALE_MS` 环境旋钮。
- 测试面：xring.test（26）+xring-p1（13）+xring-p3（14）+xring-p4（8）=61 例 + panel 侧。
- 记录面布局 `<base>/<eng>/<run-id>/{events.jsonl,workspace,worker.json}`（宿主独占写）。

## 开放项汇总（波出口）

1. **allowlist 白名单内容归用户填入**（唯一阶段 B 前置；填入后单批跑首跑+回填验收表
   A7/A12+复盘——验收表待命清单就绪，DVWA 已确认 Up）。
2. max-wins 语义边界（计数器回落段合计口径——P4② 已采 max-wins，多段合计仍低估，
   精确口径需逐段 delta，登记非必做）。
3. smoke 偏差段 teardown 竞态重试逻辑（已加重试，边界仍可空数据=合法登记）。
4. verify 执行器步骤语法扩展（现 GET/POST/EXPECT 子集；跨步会话态如登录 token 属
   P4 后按需——首跑任务书可规避）。
5. 继承悬置：graphd worker-token 写面收紧裁决/LBD-2 观察期/R5 窗口/EV-2 实弹等
   （详见 docs/state.md 开放项节）。

## 波教训（喂 WRAP-4）

1. **否定性结论是最危险的技术债**（P1"运行中不可得"误诊关闭了两批调查线——P3 拍板 2
   强制调查才纠正；否定性定谳须源码级/实证级证据）。
2. **胶水公式必须源码级对齐+真值测试**（桶名公式有测试但测试数据同源于错误公式）。
3. **计数器语义跨系统移植先核源**（累计 vs 增量：求和聚合遇累计计数器=16.3×）。
4. **同步 spawnSync 循环是 setTimeout watchdog 盲区**（P2 挂起根因；护栏须假设同步段）。
5. **修订工作流的一切前置读命令必须 perturb**（journal 重放陈旧态二现——XR-P2/P3）。
6. **拍板断言也要实测取证**（P1"应拒"实测可写——照抄断言会写错安全测试）。
