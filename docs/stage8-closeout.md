# 阶段 8 收官盘点（T4-3-4 · tag `t4-3-stage8`）

> 信任加固阶段（T4-3）收官件。范围=8-1/8-2 abcd/8-3/评测/8-4 全项对账+阶段级指标汇总
> +8-2d 缩编登记+面板假阳性裁决闭环评估卡。数据时点=本批 HEAD（git log/state 实测，
> 基线以 state.md 当前底账节为准）。

## 一、全项对账表

| 项 | 终态 | 载体批 | 交付物与边界 |
|----|------|--------|--------------|
| 8-1 共识验证 v2 | ✅ 完整版 | T4-3-2-0 审计+T4-3-2 实施 | Experience 16 列（+reasoning_path/consensus_status）+读写双通道（A 面 /write/experience 扩展+B 面 /write/experience-consensus host-only）+consensus-apply CLI（dry-run 缺省）+存量回填 9 条全 consistent；**v3 挂观察**：阻断语义（promote superseded 仅报告）+illegal 枚举产出——双条件见 state 决策账 |
| 8-2a 复核材料增强 | ✅ | T4-3-3 族② | dualFocus 背景参考段（consensus_status 非空行+reasoning_path 行级截断+「经验池先验，非任何先前结论」标注）；P2P_DUAL_BRIEF_EXP 缺省 off=逐字节等价 |
| 8-2b（编号未分配） | — 不存在 | — | 全仓 grep 零命中——8-2 升级文档从未分配 b 编号；密钥异构维度=T4-3-3 拍板⑤独立小批候选（未实施，非本表缺口） |
| 8-2c 异构强制+转态收编 | ✅ 完整版 | T4-3-3 族①③④ | P2P_HETERO_ENFORCE 三档（warn 缺省/strict 拒配 fail-closed 落既有单签留痕/off 静默）+/write/dual-sign-transition host-only 端点+迁移表纯函数（**11 处实测全边集**——signed/disputed 真终态，blocked 可解冻）+scheduler 11 处直写收编（话术逐字保留）；auth-contract/domain 零触碰 |
| 8-2d 分歧调和 | **◐ 缩编** | 本批（登记） | 见下节——**合法结局**，机器化调和归 L2/未来批 |
| 8-3 gatewarden 自攻击 | ✅ 完整版 | GW-1+GW-2 v1+GW-2 v2 | 58 对抗用例+36 gap 处置（v2 终态：已修 19/深化 4/豁免 7/延后-登记 14）+反向守护翻转 14 例+N1-N4 结构性缺口清账；处置全景 docs/gatewarden-report.md |
| 评测 | ◐ 缩批+实弹挂起 | EV-1+EV-2 | EV-1 首跑 ✅；EV-2 缩批=N-0 六项全锚+DVWA 就绪+采集设施（experiments/eval-e2e-collect.mjs）+实弹 runbook §5（docs/eval-run-2-e2e.md）；**实弹执行二选一悬置归用户**（宿主缺口发现——attended 启动路径缺失）；EV-2b 回填批随实弹触发 |
| 8-4 Adaptive Stability Controller | ◐ 缩编为 L1 视图 | 本批 | **L1 只读稳定视图** scripts/ops/stability-view.mjs（严格只读聚合：runLog 尾窗+AgentIdentity 终态+Finding dual_sign 挂起面）；**L2 控制器维持预降级**（撞 scheduler 2C 禁区——state.md:111-112 审计登记；且 8-4 差距矩阵 15 项中失控停机/429 反馈/熔断恢复/单点自适应已被既有机制闭环，残余=观测面） |
| verified 运营纪律 | ✅ 撤除 | 本批 | 见第三节 |

## 二、8-2d 调和缩编登记（原设计意图+理由，不静默丢弃）

- **原设计意图**（roadmap:56 全仓唯一表述——「8-2 双签升级：N-of-M 已砍，改异构化+分歧调和（多模型独立验证，分歧进调和流程）」；t4-3-plan:43 展开设想=仲裁通道/第三签/重验排程+approvals 接线，L 级预估）。
- **缩编理由**（四条，全部仓内实测）：
  1. **定义缺失**：调和形态（谁裁/怎么落/第三签还是仲裁 worker/重验排程）全仓零二次表述——T4-3-0 审计即登记「升级定义缺失最重」；
  2. **禁区冲突**：t4-3-plan:43 设想的 approvals 接线撞 approvals 本体禁区（do-not-touch）；
  3. **决策账冲突**：state.md:265 N-of-M 多签确认放弃——「第三签」是 N+1 多签的变体，与已拍板放弃的路线同族；
  4. **消费者为零**：disputed 的机器消费面实测为零（panel 无展示、无消费代码）——v1 双签链语义中 disputed 出口=人工仲裁（gate-log `留人工仲裁`+runLog `dual-sign-disputed`/`disputed-locked`+图态留痕已有定义），调和需求的真实形态是**人看**而非机器裁。
- **缩编处置**：8-2d 不新增机制；disputed 留痕面已被 8-4 L1 稳定视图纳入观测（dual_sign_pending.disputed 计数）——仲裁挂起从「日志里翻」变为「视图上看」。机器化调和（自动重验排程/仲裁工单）登记 L2/未来批候选，触发条件=真实 disputed 积压出现（L1 视图可量化验证）。

## 三、verified 运营纪律撤除（决策账撤条）

- **撤除条件原文**（GW-2 v2 拍板 6 落档）：「样本库 31+33 it 双绿持续一个收官批且无误伤回滚记录；届时由收官批在本决策账撤条」。
- **证据链（逐批 CI）**：GW-2 v2（fe44ea98）起每批 push CI 三 workflow 全绿——HYG-1/T4-3-2/T4-3-3-0/PLAN-1/EV-2/T4-3-3（两轮）/本批，run ID 链在 state.md 各批 ✅ 段与本批底账节；样本库双族本批本地实跑 pytest **31 passed**（tests/gatewarden/）+ mocha **41 passing**（gatewarden-plugin+combo，实跑计数；拍板口径 33 为 GW-2 时点静态计数，时点漂移 +8 如实记录——条件精神=双族全绿，满足）。
- **误伤回滚史**：`git log --all` grep revert/回滚 → 零 revert 操作（唯一命中 9a2159d 为阶段 7「CAS 租约回滚」功能 commit，消息词面非回滚动作）；GW-2 以来 CI 红仅 lease-cas-watchdog timing flaky 两度（PLAN-1/EV-2 批），rerun --failed 转绿（先例 8），非纪律误伤非回滚。
- **结论：撤除**——verified 结论不再强制人工复核通道；Gate-V 存在性校验/双签状态机/迁移表等结构化防线已接管其保护对象。注：撤除的是「结论必须人工复核」的运营纪律，Gate-V 对 high/critical 的确定性锚要求等门禁本体零变化。

## 四、阶段级指标汇总（t3-3-stage65..本批 HEAD 实测）

| 指标 | 值 |
|------|-----|
| 提交总量 | 70+（本批前）+ 本批 6 族 ≈ 76；其中 feat/fix/refactor 24+本批 3 |
| 批序列 | GW-1 → GW-2 → GW-2 v2 → HYG-1 → T4-3-2-0 → T4-3-2 → T4-3-3-0 → PLAN-1 → EV-2 → T4-3-3 → T4-3-4（本批） |
| 测试基线演进 | pytest 394→404→406→412→412→**414**；mocha 1944→1948→1948→1951→1955→**1967**；panel 88 恒定 |
| 测试净增 | pytest +20 / mocha +23 / panel 0（阶段 8 全程） |
| gap 处置（8-3） | 36 条=已修 19/深化 4/豁免 7/延后-登记 14；反向守护翻转 14 例 |
| 双签收编 | 11 处直写→端点状态机（唯一写通道）；迁移表 10 边实测全集 |
| 结构性防线新增 | Gate-V 锚存在性校验 seam/双签 CAS+一次性签码/异构三档/共识两字段+host-only 双写通道/L1 稳定视图 |
| 缩编与挂起 | 8-2d 缩编（本登记）/8-4 L2 预降级维持/EV-2b 实弹挂用户/密钥异构独立小批候选 |
| tag | `t4-3-stage8`（annotated，打在本批最终 commit——须 CI 三绿后推送） |

## 五、面板假阳性裁决闭环候选评估卡（只评估不实施——收官后排批决策）

- **构想**：panel「撤销 verified/标假阳性」入口 → 裁决回灌经验脑负样本（Experience 负效用卡/consensus superseded 指向）→ 调度环下次检索降权同面结论。范围=panel client 一入口+host 一路由（或复用 /write/experience-consensus 的 superseded 语义）+蒸馏面负样本通道。
- **依赖**：①面板写入通道（现 panel 对图零写——需 host 级写路由授权）；②负样本语义（Experience.utility_score 负向/consensus_status=illegal 产出——后者 v3 才有产出面）；③与开放项 #18 幻觉抽检人工循环的合并面（--record 记账已有人工裁决落点，闭环入口可共用同一 UI）。
- **合并建议**：与 #18 合并为「人工裁决回灌」一个候选批（入口一处、回灌两路：假阳性→负样本、幻觉抽检→记录），避免两个相近的 panel 写面分别立项。
- **风险**：人工标假阳性绕过 Gate-V/双签直接降 verified 结论=绕门禁语义——须走 host-only+审计事件+不可逆性设计（与 experience-transition 同款谁在何时以何理由可追溯）。
- **触发条件**：真实运行中 verified 误报累积到可量化（L1 视图/共识检查可观测），或 T4-5 公开前需要清理面。
