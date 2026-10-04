# X-Ring v1.1 方案（旁路自主探索通道）

> **状态：骨架入库（2026-10-05，XR-0 批）**。方案 v1.1 全文（M1-M7 修正后形态）由用户
> 立项提供，**全文未随 XR-0 批提示词到达且仓内无先存材料**——本文件先承载已拍板记录
> （§一）、设计红线（§二）、边界实锚（§三，以仓内代码实证形态重构）、实施路线（§四，
> 指向 XR-0 审计修订版）；**§五 全文节留位，材料到达后补齐并对齐 §三/§四 复核**。
> 审计证据链：docs/xr0-audit.md。

## 一、拍板记录（XR-0 批提示词即拍板，直接执行）

| 项 | 拍板 |
|----|------|
| U1 过程可见 | X-Ring 运行过程对宿主可见（过程面=记录面外置+面板只读投影，见 §二/§四 P2） |
| U2 共存三档 | 与主流程共存采用三档形态（档位细目随方案全文补齐；宿主侧实现落 XR-P3） |
| U3 model-policies xring 角色 | model-policies.json `roles.xring:{primary,backup}` 增量+白名单（现状=五角色 discovery/deep/creative/verify/study 各 {primary,backup}，加键形态） |
| 补强①记录面外置 | **设计红线**（§二.1） |
| 补强②token 计数硬前提 | 计量通道为硬前提——XR-0 定谳=通道①（会话转录 usage 四字段精确可得，xr0-audit 定谳一） |
| 补强③首跑受控靶 | **XR-P4 首跑验收=DVWA/本地 lab，非生产目标** |
| 补强④成本上界入启动确认 | 每次 run 启动确认面含成本上界声明（token 预算+超时+步数线），超界熔断 |

## 二、设计红线（X-Ring 全程有效）

1. **记录面外置**：`xring/<eng>/<run-id>/` 目录 worker 不可达——worker env **不注入**
   该路径+目录权限收紧（worker 属主不可写）；`events.jsonl` 由**宿主监控进程独占写**
   （worker 产不出过程事件=不可伪造过程面）；worker 只写其 workspace。
2. **首跑受控靶**：XR-P4 验收跑 DVWA/本地 lab；生产目标禁入首跑（升级须另行拍板）。
3. **token 计数硬前提**：通道①（session.v3.jsonl.zstd 的 usage 字段，unzstd 增量解析）
   为主旋钮；通道③（请求数近似+超时）为降级备胎（xr0-audit 定谳一）。
4. **成本上界入启动确认**：无上界确认不得 spawn；上界值+受控靶声明随 events.jsonl
   首事件落档。
5. **旁路不碰主流程**：scheduler 核心调度环/graphd/approvals 本体零触碰（XR 全波；
   六项审计"须改 scheduler"红线判定=零命中，xr0-audit 定谳二）。

## 三、七项安全边界（仓内实锚形态重构；方案全文到达后对齐）

dsh worker 七项安全边界在 plugin/pentest-dsh/adapter-dsh.mjs+egress-gateway 的实锚
形态与旁路兼容判定，逐项见 docs/xr0-audit.md 定谳二表格（**结论：全部兼容复用，
eng/leaseId 可选承载无租约 worker，零红线命中**）。摘要：①env 凭据擦洗与分级注入
②egress 网关强制（动态 scope 回落白名单；本地受控靶 NO_PROXY 直连）③worker token
权限分级 ④产物/证据目录隔离 ⑤超时与 MAX_STEPS 预算硬约束 ⑥per-model DSH_HOME 隔离
⑦租约/停滞检测/资源回收（scheduler 保障面——旁路不适用，监控进程等价接管=R10，
xr0-audit 定谳六）。

## 四、实施路线（XR-0 审计修订版，XR-P0 精确输入）

五 Phase 划界+各批禁区预比对见 **docs/xr0-audit.md §修订后实施路线**表：
XR-P0 骨架+spawn 通道（scripts/xring/+记录面+监控 skeleton+roles.xring+启动确认）→
XR-P1 写面接线（三级产出六写端点 worker-token 通道+verify 独立重放骨架）→
XR-P2 面板 X-Ring tab（只读投影）→XR-P3 自主循环编排（停滞等价接管/孤儿回收/成本
熔断/U2 三档）→XR-P4 首跑验收（受控靶端到端+零主流程触碰证明）。

存储域预期触碰=零；个别批若碰图读面按 LBD-2 观察期纪律 push 前双轨全量。

## 五、方案全文（v1.1，M1-M7 修正后形态）——**留位待材料**

> 用户提供全文后本节补齐，并执行两项对齐复核：①§三七项边界与全文清单逐项比对
> （重构形态 vs 原文措辞）；②§四 Phase 划界与全文原划批次边界比对（XR-0 审计修订
> 是否引入偏移）。对齐差异登记本节尾。

（待材料）

## 六、开放项（XR-0 登记）

- 方案 v1.1 全文补齐+§三/§四对齐复核（唯一阻断级悬置——XR-P0 开工前应完成）。
- model-policies.json 加 roles.xring 后既有五环调度零扰动实测（XR-P0 首项验证）。
- U2 共存三档的档位细目随全文补齐。
