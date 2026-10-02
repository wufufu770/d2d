# T4-3 前置审计与拆批方案（阶段 8 信任加固；只读批 T4-3-0 产出）

> 命脉纪律兑现：四子项原始定义实锚优先于一切推断。审计结论：**四子项均源自上游会话
> 规划语境（仓外），入仓只带一行概称**（docs/roadmap.md:55-58，创建于 commit `45035be`
> 2026-09-30 且从未修改；roadmap:59 自证"上游规划文档不存在"）。定义缺失处如实标注，
> 不脑补不排批——三张定义卡含"待用户补充"请求（§五拍板点 1）。
> 消歧警告：graphd 源码注释中的 "8-1/8-2" 是 T1 期审计项编号（转态旁路日志/审计降级
> 显式化，commit `5784797`/`8757293`），与阶段 8 子项无关。

## 一、四子项定义卡

### 8-1 共识验证 v2（推理路径字段正式入库）——定义最厚
- **原文**：roadmap:55；前向依赖声明 stage6-batch-plan.md:77（"6-1 → T4-3 8-1（技能化是共识验证 v2 的素材面）"）。
- **依赖已满足证明链**：T3-1-2 A-MemGuard 共识 v1（commit `3f4e964`：domain/experience-consensus.mjs 123 行纯函数+consensus-check.mjs CLI+promote.mjs 前置信号+14 it）；素材面 6-1 经验→技能（T3-2-2/2b 落地）。两条依赖均 ✅。
- **意图还原（原文对照支撑）**：v1 的既成判定——brain-audit-runbook.md:49-58 "Experience 无推理过程/依据列……可回溯推理轨迹只在 Signal_ 证据的 verify 五段 replay 矩阵（图内 698 条）"+:58 "**v1 可离线做，无需加列**"+v1 纪律"仅标注不写库、只报告不阻断"。v2 = 把 v1 时期只能离线代理的推理路径信息**持久化为图内正式字段**（与 v1 显式对照；字段 schema/落点表/写通道原文未说——实施批前须用户确认草案）。
- **验收标准**：**定义缺失**（§五拍板点 1 请求补充；plan §二给草案）。

### 8-2 双签升级（异构化+分歧调和）——v1 基线厚实，升级定义缺失最重
- **原文**：roadmap:56（全仓唯一表述；"异构化/分歧调和"零二次出现）。
- **"N-of-M 已砍"专项**：**砍除裁决仓内零记录**——全 git 历史（`git log -S "N-of-M"`）仅 roadmap 创建提交一次引入；决策账/devlog/grep"砍"零命中。谁拍板、何时、为何砍不可考（§五拍板点 2 请求用户补记或确认放弃补记）。
- **v1 现状基线（升级对象，实锚完整）**：critical/high LLM verify 需第二模型净室复核（domain/gates.mjs:115-122 needsDualSign；scheduler/gates.mjs:186-190 链）——pending CAS 挂起（H7 防双复核员）→ 第二模型=resolveBackup('verify') 单槽静态配置 → 一次性签码 nonce → 署名绑定防假签 → 双签一致 `signed` / 不一致 `disputed` 留人工（自动结果不采纳+阻止 engagement 收敛）。现行配置 M3+M2.7 已是两模型——**"异构"相对现状的增量语义原文无展开**（vendor 强制？数量扩展？）。
- **验收标准**：**定义缺失**。

### 8-3 gatewarden 自攻击验证——零出处孤行，但字面定义自足
- **原文**：roadmap:57（"gatewarden"全仓+全历史+9 tag+stash+悬空对象+workflow-runs+.mimosa 唯一命中）。
- **判定**：无上游定义可考古；但字面"对门禁系统本身做对抗测试"**语义自足**，且仓内有现成靶面清单（docs/gate-coverage-gaps.md 主缺口+次级 gap1-7）与同族实践先例（"对抗审查复验"commit d754fa7/53287fb、anchor-invalid 防规避 curated 种子）——**可按字面定义先行，无需等用户补定义**（形态选项见 §五拍板点 1b）。
- **验收标准**：**定义缺失**（草案见 §二）。

### 8-4 Adaptive Stability Controller——零出处孤行 + 撞调度环禁区预判
- **原文**：roadmap:58（全仓唯一命中）。
- **判定**：定义缺失。仓内语义邻接机制密集（均未自称该名）：idle-tasks 自适应轮询（idleStreak≥2 二值切换）、egress 令牌桶回灌、failover 七类分类+宽限重派+quota-fail-stop、engConverge 三门收敛+软/硬截止（allocator.mjs:272-273 softDeadline 75/hardDeadline 90）、容量门族、租约 CAS。**"已被既有机制覆盖"的结论部分成立**（失控停机闭环/429 反馈控制/熔断恢复/单点频率自适应均已闭环）；真实增量=跨机制协调器（L，**撞调度环 2C 禁区**）+闭环自动调参（M-L）+渐进自适应。
- **撞禁区预判（拍板 4 兑现）**：L2 自动调参仲裁须动 scheduler 核心邻域（caps 消费点/allocator）→ **预降级登记**：L1 只读稳定视图（汇聚各机制状态，零禁区）可做；L2 须 4-3a 式显式授权+独立批，本 plan 不排。

## 二、差距矩阵（现状锚点→差距→工作量）

| 子项 | 差距 | 改动面 | 量 | 禁区压力 |
|---|---|---|---|---|
| 8-1 | 推理路径字段 schema 定义+落列 | gd/schema.py 三处同步+ALTER+新 schema 文档（gate_anchor/repairability 双先例模板） | S | 中（graphd 增量列=既有实践面，走三处同步纪律） |
| 8-1 | 写通道校验+读侧回传+共识结论落库（superseded_candidate 等）+消费接线（promote 门/假设裁决） | graphd /write 校验+新 host-only 端点+scheduler 消费点 | M | 中 |
| 8-2 | 异构强制（多槽模型池+约束） | model-policies schema/resolveBackup/model-rotate（failover 共用 backup 槽互相牵动） | M | 低 |
| 8-2 | 签名密码学化+模型身份落库 | **auth-contract.mjs 是 do-not-touch:63 禁区**——平行新模块复用原语模式 vs 4-3a 显式授权扩展（拍板点 4） | M-L | 高（邻接） |
| 8-2 | graphd dual_sign 转态门（6 处直写 SET 收编） | gd/gates.py 新纯函数+端点+scheduler/gates.mjs 簿记点全动+回归 | M | 中高 |
| 8-2 | disputed 调和流程（仲裁通道/第三签/重验排程+approvals 接线） | approvals 邻域+新模块 | L | 高（审批面邻接） |
| 8-2 | 复核材料增强（replay_matrix/gate_anchor 入净室 brief） | scheduler/gates.mjs dualFocus+prompt 档位表 | S | 低 |
| 8-3 | 门×攻击面对抗矩阵（登记文档） | 新 docs | S | 零 |
| 8-3 | gate-failure 样本库扩面（30+ 门纳入采集枚举；现仅 3 种子 3 枚举） | gate-failure-capture.mjs+tests/gate-failures/ | S-M | 低 |
| 8-3 | 跨门组合绕过用例集（bash×write×egress×graphd 链式） | tests/ 双侧 | M | 零 |
| 8-3 | 自动化对抗 harness（变异+fuzz+逃逸率度量） | 新 harness+CI 挂点 | L | 零 |
| 8-3 | 次级 gap1-7 清账（熔断口径/risk 审计维度/中档处置） | tool-policy/审计字段 | M | 低 |
| 8-4 | L1 只读稳定视图（多机制状态汇聚） | 新只读模块+agent_status 扩展 | S-M | 零 |
| 8-4 | L2 跨机制协调+闭环调参 | scheduler 核心邻域（2C 禁区） | L | **高（预降级）** |

既有覆盖结论（8-4 防重复建设）：失控停机/429 反馈/熔断恢复/单点自适应已闭环——8-4 若做只做协调与闭环调参，不重做单机制。

## 三、禁区比对与风险定级

| 子项 | 禁区触碰面 | 风险定级 |
|---|---|---|
| 8-1 | graphd schema/端点增量（先例充分：gate_anchor/repairability/value_score 列均为历史批落地）；零 scheduler 核心 | 安全敏感度低中 / 禁区中 / 工作量 M |
| 8-2 | graphd 新门（中高）+ **auth-contract.mjs 禁区邻接**（高——扩展本体须 4-3a）+ approvals 邻接（d 项）+ scheduler/gates.mjs 簿记面大 | 安全敏感度高 / 禁区中高 / 工作量 L（全量） |
| 8-3 | **零禁区**（纯测试面+只读采集枚举+docs）——gate-failure-capture 是插件文件非禁区 | 安全敏感度中（对抗样本自身安全）/ 禁区零 / 工作量 M |
| 8-4 | L1 零禁区；L2 撞 scheduler 2C 禁区（**预降级登记**） | 安全敏感度低中 / 禁区 L2 高 / 工作量 S-M（L1）/L（L2） |

## 四、拆批方案（建议 3+1 实施批；顺序 8-3 → 8-1 → 8-2 → 收官）

| 批 | 范围 | commit 族预估 | 验收要点草案 | 依赖 |
|---|---|---|---|---|
| **T4-3-1（8-3 gatewarden）** | 对抗矩阵 docs（门×攻击面全清单）+ 样本库扩面（30+ 门枚举+种子扩充）+ 跨门组合绕过用例集（bash×write×egress×graphd 链式，py+mocha 双侧） | 3-4 | ①对抗矩阵覆盖门清单全量②组合用例集零逃逸（逃逸即真修复登记）③样本采集枚举扩面且 fail-open 缺陷登记 | 无（定义自足可先行） |
| **T4-3-2（8-1 共识 v2）** | 推理路径字段 schema 定义（草案见 §六）+ 三处同步落列+写通道校验+读侧回传+共识结论落库+promote 消费接线 | 3-4 | ①三处同步+SCHEMA_DEGRADED 响亮告警②写读闭环（校验拒收/回传形状）③v1 纯函数回归零破坏④pytest 新面 | 用户确认字段 schema 草案（§六） |
| **T4-3-3（8-2 双签 a+c 层）** | a) 复核材料增强（S）+异构强制（model-policies 多槽+约束）；c) graphd dual_sign 转态门收编（6 处直写收口） | 3-5 | ①异构约束生效（同 vendor/同 id 拒配）②graphd 门纯函数+迁移表+旧直写全收编③failover 共用槽不回归 | 用户拍板异构语义（§五 1a） |
| **T4-3-4（8-2 d 调和 + 8-4 L1 + 收官）** | d) disputed 调和流程（形态随拍板 1a——若定义缺失则本批缩为 8-4 L1 稳定视图+收官件）+ 8-4 L1 只读稳定视图 + 阶段 8 收官（盘点表/devlog 总账/tag t4-3-stage8） | 3-5 | 调和闭环或 L1 视图上线+收官件齐 | T4-3-3；调和定义待拍板 |

**8-4 L2（跨机制协调+闭环调参）**：预降级登记不排批——撞 scheduler 2C 禁区，须用户 4-3a 式显式授权+独立批设计。
**评测集跑测插入位建议**（拍板 5 兑现，只建议）：**T4-3-1 之后**——gatewarden 对抗面度量与评测集挖掘转化率同源靶场（SPA/DVWA+门禁对抗一次跑测双收益），且 T4-3-2/3 期间库写面活跃不宜跑测；备选=T4 系列收官后独立批。归用户排批。

## 五、拍板点清单（用户裁决项）

1. **定义补充**（三子项，可整体授权"按仓内材料还原最小方案"代替逐项补充）：
   a. **8-2 异构化语义**：异构=强制不同 vendor？不同 model id 即可？多槽=几槽？调和流程形态（第三签/仲裁 worker/重验排程/仅审批接线）？
   b. **8-3 gatewarden 形态**：离线 CI 对抗 harness / 红队 agent 常驻环 / 两者（建议：本批先做矩阵+用例集，harness 视 L 成本独立拍板）。
   c. **8-4 控制器作用域**：L1 只读视图 only（建议，零禁区）/ L2 自动调参须 4-3a 授权（预降级默认不做）。
2. **N-of-M 砍除裁决补记**：仓内零记录——用户若记得原始语境请补一句（拍板人/理由）；不补则 plan 如实登记"不可考"。
3. **批次切分认可**：3+1 批（§四）或调整。
4. **8-2 密码学背书路径**（若做）：平行新模块复用 ed25519 原语模式（不改 auth-contract.mjs 禁区本体——建议）/ 4-3a 显式授权扩展本体；密钥持有方建议**调度器代签**（worker 持钥=净室泄漏面）。
5. **评测集插入位**：T4-3-1 后（建议）/ 收官后 / 其他。
6. **graphd schema 增量加列确认**（8-1）：走 gate_anchor 三处同步纪律先例（历史充分）——确认即可。

## 六、8-1 推理路径字段 schema 草案（供拍板 6/实施批确认；非定稿）

- 落点：**Experience 表加 2 列**（reasoning_path STRING DEFAULT ''——结构化 JSON 串{premises[],evidence_refs[],counter_signals[],decision}≤4096；consensus_status STRING DEFAULT ''——v1 三类清单落库枚举 consistent/superseded/illegal+对手 id）。
- 依据：v1 共识的消费对象就是 Experience（promote 门禁）；Signal_ 五段 replay 矩阵已是"过程"而非"路径结论"；gate_anchor 8192 上限先例同量级。
- 通道：写入侧 /write/experience 扩展校验（JSON 结构+长度）；落库走 host-only 端点（v1 共识结论由 host 半离线算出——沿用 consensus-check 的 host 身份）。
- 消费：promote.mjs 读 consensus_status 作晋级信号；假设裁决面留观察（不扩 scope）。

## 七、假设与未确认项

- 四子项上游定义不在仓内（双重自证），本 plan 全部还原均标注了原文锚点与推断边界。
- 8-2 failover 与双签共用 backup 槽——多槽化改造的互相牵动面未逐一核（实施批前置审计项）。
- hardDeadline 强制终态 completed/exhausted 选择逻辑与软截止交互未逐行核对（8-4 相关，实施批前补读）。
- 撞号消歧（graphd 注释 8-1/8-2）已写入本 plan 头部，实施批文档沿用。
