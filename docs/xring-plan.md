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

## 五、方案全文（v1.1，M1-M7 修正后形态）——XR-P0 族 0 原样入库

### §五.0 对齐复核出入清单（XR-P0 族 0，全文不改，按现状收敛加注）

| # | 出入 | 处置 |
|---|------|------|
| 1 | 全文 §7"quarantine 默认 1 tick" vs 实锚"Experience 写入即 `status:'quarantined'`"（graphd/app.py:1009） | **按现状收敛**：写入即隔离强于 1 tick 延迟语义，复用现状；全文原文不改 |
| 2 | 全文 §7.1 三级产出端点映射（概称六写端点）vs 实锚十写端点精确化 | 精确映射以 docs/xr0-audit.md 定谳四为准：A→/write/finding(+transition)；B→/write/hypothesis+/write/signal；C→/write/experience[写入即隔离]，**B/C 级出池走 /write/experience-transition=host 评审面** |
| 3 | B 包（B1-B4）对话层调研材料 | 结论已浓缩于 M1-M7 与各节证据锚；全文中 B 包引用保留原样+尾注：**原始调研归用户层**，不入仓 |
| 4 | 全文尾节"下一步" | 对话层内容，不入库（本节即实施归宿） |
| 5 | 全文与既有拍板记录一致性 | 确认一致：U1 过程可见=M6 独立记录面+过程可见；U2 共存三档=验收 A12/三档共存；U3=model-policies xring 角色+白名单（§5 八模块）；四补强=记录面外置（§3⑦计数器外置+§5 独立记录）/token 计数硬前提（M2/M3/§3⑦）/首跑受控靶（实施红线，§9 P4）/成本上界入启动确认（§5 /xring-start 启动显示） |

### §五.1 全文正文（用户原样，2026-10-05 入库）

（基线：v1.0 极简组装+B 包四调研；骨架不变，七处参数与三处设计前提修正；红线=只陈列证据支持的修正）

**修正总览**：M1 超时 6h→3h 可配 6h（METR 前沿 50% 档 2h42m）；M2 token 200 万→100 万可配（与 3h 匹配）；M3 归属明确=计数器在模型不可写位置+worker 对配置只读（AI Scientist 改自身代码延超时反例）；M4 workspace=存档隐结构（Go-Explore archive/Voyager 技能库/Reflexion 记忆/AI Scientist journal 四作对应物）；M5 准入=前沿模型（GPT-3.5 不可用反证；质量随模型单调）；M6 黑屏=①独立记录面+过程可见（OpenAI DR sidebar 先例；纯不可见无产品先例）；M7 认知类失败兜底位置明确=环外 quarantine→verify 唯一兜底。新增：适用边界三维表/失败模式兜底矩阵/partial harness 同构声明。

**§1 定位**：X-Ring=一个 dsh worker+七项安全边界+抛开全部流程+模型自主循环+结构化工件回流；不造新调度/状态机/记忆系统/验证器/evaluator；两头定中间自主（四作+两产品收敛形态；partial harness 同构：只给初始步骤其余自主，通过率优于全结构化）。

**§2 原则 P1-P10**：抛流程不抛护栏/能力→流程减负但能力↛权限放权/模型自主边界外置/分段累积不单会话硬撑（16-hour agent 谬误+METR all-or-nothing）/旁路跑/独立记录是前提/产出经现有门回流/两头定中间自主/前沿模型准入门槛/环外验收是认知类失败唯一兜底。

**§3 七边界**：①egress 网关（scope 强制+限速+全量审计+黑名单+DNS 复查+LLM 白名单；局限=scope 内越权仅审计留痕）②graphd 写门（六门卫生门不判内容质量）③host token 剥离（worker env 只注 P2P_WORKER_TOKEN+租约 id）④proxy 强制注入 ⑤humanOnly 词表（破坏性命令；不覆盖自我修改行为——由计数器外置兜）⑥审批 queue/native 不默认 off（off 拒启动）⑦预算硬熔断（3h/100 万默认，6h/200 万上限；计数器外置宿主侧进程 worker 不可写；触发=SIGTERM→SIGKILL→读 workspace 已有产出→回流→stop 事件；语义=止损非解决，单次最大报废额=3h×模型单价+100 万 token）。

**§4 架构**：宿主（命令入口/面板 tab 只读投影/预算监控进程）→spawn→dsh worker（headless；模型自主循环任意形态；workspace 存档隐结构；图只读 /query worker token；七边界全时生效）→回流管道（workspace→quarantine→verify→六写端点）。

**§5 八模块**：/xring-start（--model 显式必填前沿模型/--max-hours 默认 3 上限 6/--max-tokens 默认 100 万上限 200 万）/边界包装（复用 adapter env 注入与 gate 接线+监控进程独立于 worker）/输入注入（prompt 声明运行前提：可靠时长 2-3h/整段报废分布/主动收敛/预算熔断语义/认知类失败无环内兜底只能靠工作质量）/产出契约（三 JSON Schema；schema=格式层约束，内容质量归环外 verify）/回流管道（schema 校验→quarantine→verify 独立重放 A 级必须→六写端点；环外 verify 若自动化则暴露 reward hacking——对抗性验证器加固路径）/独立记录（xring/<eng>/<run-id>/events.jsonl+workspace+会话转录；面板过程可见；主流程不可干预，/xring-stop 唯一例外）//xring-status|stop/预算硬熔断（宿主侧独立进程，两个数，触发后五步）。

**§6 产出契约**：hypotheses.json/repro_paths.json/lessons.json 三 schema；字段完整性与结构合规归 schema，语义正确性归环外 verify。

**§7 回流**：三级产出 A（可复现漏洞发现→verify 双签→/write/finding）B（假设树/攻击面扩展→quarantine→/write/hypothesis 或 /write/signal）C（失败教训→distill→/write/experience）；回流链路=无编排路线的安全余量（资源类 F1/F7 归边界⑦；破坏类 F4 归边界⑤+计数器外置；越权类 F3 归①④部分；认知类 F2/F5/F8 无边界可兜只有环外验收）。

**§8 适用边界三维表**：任务类型（信息聚合/well-specified 工程=支持域；开放探索=边缘域；杂乱任务=证据不足域）×模型档位（前沿=支持域；中低端=Voyager 反证不可用）×时长（分钟级-3h=支持域；3-6h=边缘域；>16h=METR 不可测）；结构前提跨三维=环外验证链路完备度即安全余量；定位结论="边缘域、前沿模型、有环外验收"通道，不是"支持长程"通道。

**§9 实施路线**：Phase 0 契约→1 手动闭环→2 产出回流→3 记录面板→4 验收（3-4 周）——按 XR-0 修订为 P0-P4 五批。

**§10 验收 A1-A12**：七边界逐项（含计数器外置）/流程全抛（无三环无 kind 无 Gate 无停滞检测无角色库）/模型自主（prompt 无流程概念）/三 JSON 过 ajv strict/A 级 verify 双签+quarantine 生效/events append-only+过程可见/超时 token 任一触发即停+计数器不可写/成本硬上界/主流程零改动/三档共存/模型档位合规（弱模型拒绝）/认知类失败可追溯（F2/F5/F8 留痕+环外可识别）。

**§11 风险 R1-R9+未决（U1/U2/U3 已拍板入记录）**；R7 计数器篡改→外置；R8 scope 内越权仅审计→结构性局限；R9 自动 verify 的 reward hacking→对抗性验证器加固。

**§12 一句话收束**：X-Ring v1.1=v1.0 骨架+B 包证据校准；定位="边缘域、前沿模型、有环外验收"。

### §五.2 B 包尾注

B 包（B1-B4）为对话层调研材料：其结论已浓缩于上方 M1-M7 修正与各节证据锚；**原始调研归用户层，不入仓**——文中 B 包引用保留原样指涉。

（全文完。全文尾节"下一步"为对话层内容，未入库。）

## 六、开放项（XR-0 登记）

- 方案 v1.1 全文补齐+§三/§四对齐复核（唯一阻断级悬置——XR-P0 开工前应完成）。
- model-policies.json 加 roles.xring 后既有五环调度零扰动实测（XR-P0 首项验证）。
- U2 共存三档的档位细目随全文补齐。
