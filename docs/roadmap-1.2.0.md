# 1.2.0 需求池（E12 冻结 · 2026-10-16）

> 性质：纯文档批冻结件——只定稿不实施；排批切分与条目启动归批次提示词显式授权。
> 池基线=E11b 收官树（远端 main a64ce2a）。逐条带实证来源/锚点+一句话方案+改动量
> （S=单文件级 / M=跨文件模块级 / L=架构级——本池最大 M，无 L）。

## 一、与转正批关系声明

1. **1.2.0 不含转正动作**：1.1.0-alpha→latest 转正为独立批，前置=靶场形态确认
   （宿主侧：192.168.132.14 是否切防护模式/真 honeypot）+L-1 验证率线在可比较语境
   重测达标（devlog E11a-P2e 段双列定谳）。
2. **E11b 笔属转正批内容**：GRAPHD/brainDir 守卫、4-3a 内容锚修正、对账台账已随
   v1.1.0-alpha 发布链入包——不在本池重复立项。
3. 本池全部条目为 1.2.0 候选；与 roadmap.md 主编排（T 系梯队）互不替代。

## 二、池总表（22 条：P0×2 / P1×3 / P2×17）

| ID | 层 | 条目 | 实证来源/锚点 | 一句话方案 | 量 |
|----|----|------|--------------|-----------|----|
| R-01 | P0 | mocha flaky 挂死根因定位（--exit 债到期）【✅ E13 落地：根因=xring-p1 真子进程弃管，收割笔+--exit 摘除，4 轮验收+句柄=0，devlog E13 段】 | E11a-P2 收官 mocha rc=124 两轮（组合 B 去 e11a 仍挂=非新增引入的测试间干扰，mock server 句柄非确定性挂源）；ci.yml 已加 --exit=绕过非治愈 | 定位测试间干扰源（句柄泄漏面）根修；根修后摘除 --exit 旗标（摘除=本条验收线，此前 --exit 标注"技术债到期"） | M |
| R-02 | P0 | manifest fold 内建于 docs 类工作流【✅ E13 落地：scripts/ops/manifest-regen.mjs+.zcode/workflows/docs-fold-land.dwf.ts 模板，本批三族笔践行】 | V-16 两犯（E11a-P2 回归段 12 文件失配+E11b devlog 笔 1 文件失配，各补 manifest regen 笔）——治流程不靠记忆 | docs 类笔的落库工作流模板默认带 manifest regen 步：内容笔+regen 笔原子成对（E12 本批自践行） | S |
| R-03 | P1 | tarpit/环境一致性检验产品化（单列亮点）【✅ E15 落地：scripts/xring/ecc.mjs（advisory 信号形态——单轮趋同/双探翻转/跨轮漂移/安全头外部 origin 四判据；first-run 探针期接线+任务书注入+报告 caveat；handoff env 基线消费）】 | Phase 3 run-r2b-10160333 tarpit 反转（lessons L-1~L-4：同路径响应 md5/size/content-type 指纹漂移=快速判据、CSP 外部 origin=环境线索、首探头复读可即时捕获翻转、锁出分支前兆）——worker 自发行为升格产品语义 | 探针级环境一致性检验原语：同路径双探比对+指纹漂移告警+honeypot 嫌疑标注入 lessons/假设图；L-3/L-4 判据固化 | M |
| R-04 | P1 | #9 report.mjs 三格式自动生成【✅ E15 落地：scripts/xring/report-face.mjs（三外部格式只吃已验证+ab-report 内部全量面含环境评估/接力摘要；run 收尾接线）——report.mjs 图内引擎不变，外部面走 run 目录产出】 | r2b-feedback（三格式手工生成于 /tmp）+docs/report-templates/ 三模板已在缺接线；design-1.1.0 曾注"#9 单议"→E12 定谳入 P1 | report.mjs 增 --format butian\|vulbox\|edu-src：repro_paths+裁决态→模板字段映射自动出报告 | M |
| R-05 | P1 | #6 跨 run 接力（handoff 契约化）【✅ E15 落地：scripts/xring/relay.mjs+handoff.schema.json（认识论标签制四载体 facts/leads/falsified/env；reflow 收尾 emit 写侧+first-run --from-record 读侧；leads 假设形态注入语义）】 | r2b2 handoff.md 已自发产出；Phase 3 L-1 实证必要性（前轮发现=leads 非 facts——注入须带怀疑语义） | first-run 增 --from-record：run N 产物（handoff/假设态/裁决）契约化注入 run N+1 任务书，leads 语义显式标注 | M |
| R-06 | P2 | #8 编排探活重试与实录落点统一 | r2b-feedback 卡点 3（3 试重试已固化进 first-run probeTarget）——余项=重试参数化+实录落点约定分散（/tmp 编排 vs record root） | 探活次数/间隔参数化+record 落点统一约定进编排文档 | S |
| R-07 | P2 | #10 egress 限流语义入任务书模板 | Phase 3 L-2（worker 自学 1.5s 间隔+Proxy CONNECT aborted 识别）——应显式下发 | 任务书模板 egress 节：间隔基线/限流识别/abort 语义 | S |
| R-08 | P2 | #11 held 裁决的验证补录字段 | held-admit-8（G5 admit/dismiss 实操 8 条）——人工验证结论无回写位 | adjudicate 增 verification 补录字段（结论+证据引用），闭 held→人工→图内验证链 | S |
| R-09 | P2 | #12 schema 长度策略余项 | E11a #4 evidence 截断（总长含尾标≤500）已进——余项=其余自由文本字段长度策略未统一 | 全产物（handoff/lessons/repro）自由文本字段统一长度上限+截断语义表 | S |
| R-10 | P2 | first-run 收尾段图查询整体超时 | Phase 3 实录（devlog E11a-P2e 段）：reflow 后图内验证查询无整体超时→编排进程挂起（数据已全落盘，kill 收割无损） | 收尾段查询包整体超时+超时即落盘收割报告 | S |
| R-11 | P2 | 行号锚断言脆弱性治理（内容锚模式推广） | 4-3a 两轮 CI/本地行号漂移 ±3（E11b 内容锚修正 a0814c5 首验通过+③④等价性测试背书）——模式未推广 | 内容锚断言模式成文（恰此一处+唯一命中行内容验证+等价性测试背书惯例），存量静态断言审查 | S |
| R-12 | P2 | auth 探测锁出感知 | Phase 3 L-2：锁出分支（HTTP 200+JSON 锁定文案）吞掉后续全部探测窗口（~8 步浪费+session 报废） | 锁出响应识别+auth 试探步进语义（操作者凭据单试+非 auth 端点预探形态）入任务书/教训卡 | S |
| R-13 | P2 | info 严重级入图拒收语义 | Phase 3 reflow errors 1=info 入图被拒（devlog E11a-P2e 段）——severity 域不含 info 态 | 图 schema severity 域增 info 态，或拒收显式报告化（非静默 error） | S |
| R-14 | P2 | T-4 hypotheses eng 归属 | r2b-feedback 卡点 4（worker 产出 hypotheses.json 无 eng 字段→落图后 engagement 维度检索 0 条） | reflow 落图强制补 eng=engagement 上下文 | S |
| R-15 | P2 | T-5 verify-runner header/逐请求表达力 | r2b-feedback T-5（F-2 路径遍历需逐文件探测——现有 METHOD/POST --data/EXPECT 语法无 header 行表达） | verify-runner 增 HEADER 行/逐请求覆盖语法 | S |
| R-16 | P2 | T-6 NAS/SPA 类任务书模板 | r2b-feedback T-6（前端路由 fallback 坑每类新目标冷启动）+Phase 3 判据佐证（R-03 同源） | 任务书模板家族增 NAS/SPA 形态节（指纹差异/fallback 坑/环境一致性判据提示） | S |
| R-17 | P2 | kuzu 退役批 | T4-2/T4-3/LBD-2 决策链（state.md：观察期满 clean→缺省引擎翻转+kuzu 退役；退役复评=观察期满 clean 后另批） | 前置=观察期（10-18）收官 clean；执行=缺省引擎翻转+kuzu 依赖退役+回滚资产归档复核 | M |
| R-18 | P2 | 3-2/3-5 折并项 | SWEEP-1 延后登记（devlog SWEEP-1 段：主会话清单原议归后续批） | 按原议折并推进（切面归排批） | S |
| R-19 | P2 | verify-main 45/46 缺项+technique_cards.json JUNK 检出 | SWEEP-1 实测既有态（do-not-touch.md 登记不扩 scope，处置归后续批） | 缺项补齐核查+JUNK 定性清理 | S |
| R-20 | P2 | improve/burp-oob-jwt-cred-matrix 分支定性 | origin 遗留分支（远端在位未定性） | 定性三选一：吸收/归档/删除（归排批裁决） | S |
| R-21 | P2 | docs 终版精简（13 活引用收缩） | clean-repo-blueprint.md（断链风险>精简收益，终版收缩归执行相后段） | 活引用清单复核+收缩执行（发布相后段时点） | M |
| R-22 | P2 | XR-G8 EXTRACT 机械原语 | wrap4-execution-plan 跨判定独立项+xrp4-acceptance（动态 token 场景参数化边界裁量归用户） | 用户拍板参数化边界后实施 EXTRACT 原语 | M |
| R-23 | P2 | mitm-capture 单跑顺序依赖（反向 flaky） | E14-B 冒烟单文件扫描实测：单跑确定性 2 failing（全量恒绿——依赖先序文件状态），登记不修（E13 同款范围纪律） | 定位依赖源（先序文件建立的目录/env 态）→测试自足化 | S |
| R-24 | P2 | createXRingRunner 真 worker 测试的集成轨拆分或 fake 化 | E13/E14-B 实录：族1 start 测试拉真 dsh worker（LLM 调用+时长方差）——E13 收割笔已消挂死，测试架构优化项 | 集成轨（真 spawn）与单测轨（fake adapter）拆分，单测零 LLM 依赖 | S |
| R-25 | P2 | 资产图跨任务共享（ARTEX 思想，仅公开架构描述） | E18 二轮调研：探索图边语义（spawns/derived_from/yields/proves 血缘链）+Planner 跨轮次共享待办清单+跨 worker 检索执行过程+ScopeSentry 资产同步形态 | handoff→持久图远期演进（intent 节点图内持久化亦挂此——E18 定谳：intent 先行 handoff 载体，图内化归本条） | M |
| R-26 | P2 | 报告带证据与局限字段（REA 思想，仅公开描述） | E18 调研：报告附证据链引用与已知局限声明（与 ab-report caveat 形态同向） | ab-report 扩证据引用+局限节（外部格式面另议） | S |
| R-27 | P2 | 长 run 记忆压缩（BUUCTF_Agent 思想，仅公开描述） | E18 调研：长会话记忆压缩保关键态（worker 2-3h 长跑的上下文管理远期参考——dsh 会话自有压缩，编排层摘要另议） | run 中段摘要注入 handoff/intents 的编排层形态探索 | M |
| R-28 | P2 | auto-fix 造修复语义（strix 思想，仅公开描述） | E18 调研对照声明：strix 做"造修复"（发现→PoC 验证→补丁生成+merge-ready PR）——d2d 定位攻不守；与 R-28 对偶的"验修复"已由 E18 retest.mjs 落地 | 观察项：若未来开防守面（授权修复场景）再启——造修复=补丁生成+PR 全链 | L |
| R-29 | P2 | 渐进式披露三层加载（ctf-skills 思想，仅公开描述） | E18 调研：元数据→主体→附加文件按需加载（Token 降 60-80% 实证）——d2d 任务书模板按需加载远期参考 | 任务书分层（元数据首屏+按需展开节），配 ECC/intent 注入的优先级带 | S |

> E14-B 增补（2026-10-16）：R-23/R-24 为转正批冒烟/根修实录衍生登记；R-01/R-02 已于
> E13 落地（✅ 注记在表）；R-03/R-04/R-05（P1 产品环）自 1.1.0 转正起解锁待启。
> E15（2026-10-17）：R-03/R-04/R-05 ✅ 落地（注记在表）——1.2.0 发布（E16）。
> E17 场验（2026-10-17）：产品环首次真实目标检验两轮收官——ECC 真阳倾向/handoff 消费链
> 真通/falsified 链实战/ECC 采纳两轮对照数据入持续验证台账（devlog E17 段）；L-1 维持悬置。
> E18+E19（2026-10-17）：外部调研四源思想原生实现（Intent 意图运行时/Advisor 第二视角/
> 竞速验证/修复后复测——全部编排层 opt-in 缺省零行为）→**1.3.0 发布固化**；池登
> R-25~R-29；ARTEX 警示档入 devlog E18 段。
> E20 场验批 2（2026-10-17）：四能力实弹首考两轮——**Intent 实弹首响**（worker 自发声明
> intents.json+锁出后 deferred intent+继承精化全链）/**漂移检出现场命中**（形态真变 5/5
> 被 ECC live 捕获）/ECC 四数据点序列（判级-形态相关）/Advisor 触发源扩展与竞速变体生产
> 语义入池观察（devlog E20 段）。
> E21 折并批（2026-10-17）——R-06~R-16 逐项处置（授权面解冻执行+销项定谳）：
> **✅ 实施 8 项**：R-06 探活参数化（--probe-tries/--probe-timeout-s，缺省零变化）/R-07+R-12
> 任务书纪律块（egress 限流+锁出感知入 prompt.md——禁词锁测试背书）/R-08 held 验证补录
> （verdicts.json→reflow 升 facts/降 falsified——held→人工→回写链闭合）/R-09 长度策略
> 统一表（docs/schema-length-policy.md）/R-11 内容锚指南成文+存量零实测
> （docs/content-anchor-guidelines.md）/R-15 verify-runner HEADER 行（声明式 header 表达力，
> 坏形态 manual）/R-16 NAS/SPA 任务书模板（docs/task-templates/nas-spa.md）/ECC 判级-形态
> 对账表固化（docs/ecc-form-ledger.md——四点全对账）。
> **销项 3 项**：R-10 整体超时=既有实现已满足（reflow post 15s+graphdQuery 10s 双层单发
> 超时——挂起形态已在后续批修复，无存量）；R-13 info 入图=编排侧已显式报告化（errors 面）
> +graphd severity 域扩展挂 R-25 邻接（服务侧批次）；R-14 eng 归属=既有实现已满足
> （reflow B 级写面 eng||runId——E11a 时期即落地）。**burp×scope 门定谳**：门禁行为正确
> （工具非越权通道）+burp MCP 桥接评估素材入 R-25（竞品 MCP 直连形态只入档不实施）。
> **dsh 0.2.0 应对**：API 面=ctx.on×7+shellEnv（零 ctx.shell.run——主破坏面不在路径）+
> dsh-* 六包 pin 0.1.1-rc.2 维持（0.2.x 适配进度=shellEnv/hook 契约复核+实跑后解锁）+
> **hook-guard 静默失败防御**（5 处安全链 hook 入口包裹——异常落 hook-guard.log 再原样重抛）。
> E22 场验批 3（2026-10-17，**部分完成收官——外部资源耗尽型停点**）：**已定谳**=①Phase 0
> 靶场探测：**tarpit 已清除**（真实 SPA 域+API 401 真 auth 层）——I-1 锁出窗判据满足、执行
> 窗开启（I-1 定谳移交后续批，形态可能再变需重探）；②dsh 0.2.0 实跑观察收官=六包
> 0.2.0-rc.2 可达+shell.run 六包零残留+临时环境 mocha 14 红全数环境噪声（生产对照全绿）
> +hook-guard 零触发——**0.2.0 零真破坏，pin 维持 0.1.1-rc.2**（0.2.x 解锁条件再证一层）；
> ③ECC 第五数据点=**首假阳**（likely vs 服务真恢复——SPA fallback 与 tarpit 同形，API 面
> 401 真 auth 层为区分特征；对账表 E22 追记段含校准候选不实施，阈值维持）；④I-5
> burp_repeater gate bug 复现数据点（存量面禁区持续在档）；⑤复测语义维持确认。
> **未达面**=run 1 正式版/run 2 接力/I-1 执行/四能力二考/靶场耗尽定谳——minimax 账号级
> 限流贯穿批窗（7.4h+，11 发预检 1 发瞬时放行，日窗两假设排除）；opencode-go 无凭据=
> 模型面单点实证。**池登候选（不启动）**：模型 API 429 指数退避（worker retry5 连发即死，
> monitor 预算面不覆盖限流维度）；下一批建议=场验批 4（I-1 首题，API 恢复后）。
> **E23 发布批（2026-10-18）——1.4.0 固化**：E21 修正窗+E22 429 定谳实施为版本里程碑。
> ①429 退避=adapter 层限流重启（opt-in 缺省 0，dsh-llm 包内 retry5 不可改为实施动机，
> 模型面单点=关键韧性）——上条"池登候选（不启动）"兑现为实施，池不再登；②selfcheck
> #1 自包含化（本地自签靶+仓内 fixture——/tmp 灭失+零实弹双因根修，R-01 精神）；③
> pack 对账抓获 E21 半截（hook-guard 漏 files 白名单——本批收尾修复）；④三轨
> 2208/12/429；⑤发布终态=tag v1.4.0=5212199+release 流 success（OIDC）+Rekor
> logIndex=3305857298+核验五件全过（增量 6 文件零意外）。**1.4.0 里程碑**：模型韧性层
> +插件可观测性（本版起包面为真实增量语义）。**下一批=E24 场验批 4**（I-1 首题+
> 四能力二考补考+ECC 第六点；前置=模型 API 轻试探确认额度真开放）。

## 三、排期建议（主会话终裁）

- **P0 工程卫生（先行小批）**：R-01/R-02——两犯/两挂实证，量小杠杆大；R-02 即时生效
  于后续每批落库。
- **P1 产品（工程主线）**：R-03 tarpit 检测（Phase 3 产品级亮点）→ R-04 报告自动化
  （交付闭环）→ R-05 跨 run 接力（连续作战能力）——三者构成"实战反馈→交付→复战"产品环。
- **P2（随批搭车/排批）**：R-06~R-16 多为 S 量尾巴，按"同文件同族"折并搭车
  （R-07/R-12/R-16 同属任务书模板族；R-13/R-14 同属 reflow 落图族）；R-17~R-22 为
  独立决策/登记项，前置条件成熟才启动。
- **排批禁忌**：本池只冻结不排期——任何条目启动仍需批次提示词显式授权。

## 附则 A：Mimosa 采样性偶拦处置预案（E11b 验收校准点落账）

- 单拦处置=**间隔重试一发即判**（两次实证可过：E11a 分层探针两发全过/E11b tag 面
  间隔单发过检）；两次同拦才升级止损（分层拆族/主会话通道）。
- 禁止项不变：换通道伪装、改扫描面、hook/台账触碰、--no-verify、gh api 旁路。
- 采样模型定谳（mimosa-ledger §一/二）：拦截面与改动集构成+时点采样相关，非通道差异。

## 附则 B：Mimosa 上游反馈草案定稿状态（只定稿不代发）

- 草案全文已在 docs/mimosa-ledger.md §三（三请求：baseline/存量告警接受 API、
  test/fixture 目录扫描降权或内联标注语法、扫描覆盖度声明）。
- E12 定谳=草案内容定稿（对账台账 §一 7H+30H 实证背书）；**代发动作归用户裁决**。
> **E25 谜底考古批（2026-10-18，纯离线供料批）**：E24 失联=第五观察点入档，六观察点合轴
> +核心修正（E20-r1 真实面回溯定性——ECC 假阳实为两例同型系统性盲区，对账表加注）；假设
> 矩阵定谳=H3 测试台+WAF+外加 tarpit 装置 ×H4 演练环境（运营者活跃管理）为最优复合解释，
> I-4 分裂存续（键控三态方向全中+冷却参数不可辨识+对关停零预测力）；**决策供料 memo=靶
> 场轨先③后④**（auth 面真实性证据支持重开优先；④若裁则自建目标适配性最高）——详见
> docs/target-posture-profile-r2b.md 侧写档终版。裁决权在主会话，本批零接触零模型零版本。
> **E26 ECC 校准实施批（2026-10-18，纯离线）**：E25 双样本支持的校准候选→实施——401-JSON
> 在场性抵扣（单轮信号降档+drift 恢复向复合降档；判级逻辑面，探针语义零改动）；回测 #3/#5
> 翻正+真 tarpit 三例不误伤+缺省零变化对照（ecc-calibration.test.mjs 六例，mocha 2214）；
> 对账表双记过渡（历史不改写）。ECC 假阳系统性盲区（SPA fallback 形态）自 E22 发现至 E26
> 机械化闭环：发现（场验）→归因（考古）→实施（校准批）——**advisory 信号的自校准闭环首例**。
> **E27 R-25 资产图设计批（2026-10-18，纯设计零代码）**：R-25 前置设计件落库
> （docs/asset-graph-design-r25.md）——现状盘点（点 5 类/边 1 类=点仓库形态，血缘语义
> 近零）+需求反推六条（全挂场验实例）+设计本体（Asset/EnvSnapshot 两新节点+五条边语义
> +Verification 事件点 append-only+事件去重门唯一新纯函数）+路线图 M1-M5（实施授权另
> 批，M1+M2=最小可用集）。图与 handoff 互补不互替划界。R-25 实施面维持冻结。
