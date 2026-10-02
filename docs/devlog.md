# d2d 开发轨迹（devlog，追加式）

> 分工声明（T3-2-5 拍板）：docs/state.md = 当前快照（可覆盖更新）；本文件 = 完整开发轨迹
> （**只追加**）。历史节只增不改；勘误以新节补记（标注「勘误」），不改旧节。
> 信息源优先级：state.md 梯队状态+决策账 > 各批验收文档（docs/ 下）> roadmap.md。
> 日期口径：git log 收官 commit 实锚；git 史不可考的早期工作以「前史」归并。
> 每节固定五行结构：底账 / 产出 / 关键裁决 / 教训沉淀 / 开放项。

## 前史 · 2026-09-09 ~ 09-25 阶段 1→4 与经验回流子系统（git 史可考的 T 编号前工作）
底账：v0.3.0 合流（2026-09-14, improve/issues-74-66-86）· pytest 145 / plugin 596 / panel 46（merge commit 实锚）
产出：4-8 收敛+验证闭环（2026-09-17）· Experience 表+写读端点（09-20）· 经验检索注入+写端增强+A/B 脚手架（09-21）· 模式库外置（09-25）
关键裁决：经验回流按子系统拆层落地（数据层→检索注入→写端治理→效果验证）
教训沉淀：worker 查询白名单（CALL 全禁/跨项目全表扫禁）在本期定型，成为后续 V-07 只读预检的权威依据
开放项：-（当期口径与 state.md 现表不同源，不回溯）

## 2026-09-26 · T0 止血与合流
底账：HEAD 阶段 1→4-4 合入 main · 三 workflow 体系建立（T0-B 前置 manifest 重生成+gates 分支扩全）
产出：流程卫生（manifest 纪律/gates 扩全分支）+ 三缺口收口（详见 state.md 梯队 T0 行）
关键裁决：T0-C 缺口③情况C（子代理容量账本）以计数+bash 嵌套强执法双面落地，拒绝面挂组合层不碰 checkBash 契约
教训沉淀：manifest regen 必须在文件入库后执行（本期多次「随批重生成」commit 先例）
开放项：lease-cas-watchdog flaky（观察项，至今 P3）

## 2026-09-27 · T1 安全与信任基础设施（4-3c/4-4/T1-2/3/4）
底账：HEAD T1-4 后 · 测试三轨体系成型
产出：4-3c 读侧凭据分流（worker token 直连+worker_query_allowed 权威）· 4-4 审批证据原语 · T1-2/3/4 信任层地基
关键裁决：4-3c 甲方案——p2p_graph 读侧按 profile 分流，宿主会话保留 sched.q 管理型查询（止损线）
教训沉淀：graphd 门是权威判定，插件侧预检只求快失败（CALL 禁令等语义以 graphd 为准）
开放项：-（明细见当期 state.md，现表已消化）

## 2026-09-28 ~ 09-29 · T1.x 实战（T1.5 试运行 → T1.6.1→T1.7.1→T1.8.1 首次完整攻击链）
底账：HEAD T1.8.1 回归后 · 首次实战闭环 22 findings / 9 verified / 零失败
产出：T1.5 试运行暴露四条宿主建议（09-28 docs）· 完整攻击链首次闭环 · 垃圾门变体拒收+真洞表述放行回归（09-29）
关键裁决：实战暴露的问题以回归锁固化（title 回归先例）
教训沉淀：实战验收 = 靶场回归 + 真实目标试运行双轨；宿主建议随批顺手登记不扩批
开放项：#6 上游四条宿主建议（P3 至今）

## 2026-09-29 · T2-1 8.5 瘦身版 + T2-2a 五方向四项
底账：HEAD T2-2a 后 · 评测集 26 条 / CNSR 5.73
产出：8.5 瘦身版（评测集/转化率/A-B/CNSR）· 敏感扫描/无证据≠排除/种子卡 20/偏科检测四项
关键裁决：业务闸 P2 遗留→悬置小批（不混批纪律首次行使）
教训沉淀：评测集先行（26 条）让后续度量有锚
开放项：业务闸（→BG 批）；#9 bias 阈值 80% 首版参数（P2 至今）

## 2026-09-29 ~ 09-30 · T2-2b-0~4 sidebar 三条 + 浏览器环收官
底账：HEAD 4.5-4 后 · 攻击档 V2 会话接管 + V3 三件套实际影响证明
产出：sidebar 三条 · cdp-proxy/四攻击文件 · 浏览器审批面（browser-state-change 恒 high）
关键裁决：scripts/browser/ 四文件本体禁碰（包装层接线形态定型——T3-2-3/T3-2-5 复用）
教训沉淀：高危动作「恒 high 不自动放宽」语义（trust.mjs high 恒不放行同源）
开放项：#17 cdp-proxy.mjs:129-131 头注释勘误待批（P3 至今）

## 2026-09-30 · T3-1 阶段 5 瘦身版 + HD-1 交接固化 + BG-1 业务闸第一段
底账：HEAD f115f6d（T3-1 收官）· 基线 pytest 368 / mocha 1791 / panel 55
产出：卡片 Schema 校验 260 张全过 · A-MemGuard 共识 v1 离线路径 · misses 月度聚合 · 度量框架①③落地 · AGENTS.md/roadmap/state/do-not-touch 文档体系 · 业务闸纯函数+schema
关键裁决：五术语清理（ACON/ATLAS/MaTTS/SAGE 删，CNSR 留名）· 零侵入优先（度量/审计优先离线聚合）· 活文档机制（回报固定含「状态文档更新」节）· PR 授权（CI 三绿即可合并）
教训沉淀：测试污染口径确立（本机 audit.log 聚合多 graphd 实例，统计须按 id 形状过滤）
开放项：#15/#16 检索有效性/misses 加固（设计就绪待授权）

## 2026-10-01 · BG-2 业务闸集成上线
底账：HEAD BG-2 收官 · 三 workflow 全绿
产出：scheduler business_gate+coverage_bias 注入接线（禁区 :621-625 区新增 5 行）· loop.mjs 深环派发检查块 · 集成测试+收官文档（docs/business-gate-acceptance.md 含实测记录）
关键裁决：【锚点①】「:620 后插入」的工程澄清——授权材料按「:620 后插入」表述，实质锚点是禁区区间 [570,618] 结束后的编排位（:621-625），授权语义=禁区编排序保护而非行号字面；业务闸 P2P_BUSINESS_GATE=0 回退开关
教训沉淀：禁区授权的行号表述必须与实质编排位同批核实（授权实质 vs 字面）
开放项：业务闸 #1 全线收官销账

## 2026-10-01 · T3-2-0 阶段 6 前置审计 + 拆批方案（只读批）
底账：HEAD T3-2-0 落档 · 零代码改动
产出：docs/stage6-batch-plan.md（六批顺序 1→(2∥3)→4→5→6）
关键裁决：【锚点②】6-6 事件驱动并发止损降级——Kùzu 无原生 watch，真事件需 graphd 禁区通道 → 本体转长期项挂 T4-2 存储决策后重评，收益由 T3-2-6 闲时任务+自适应轮询+能力路由承接；拆批顺序认可
教训沉淀：前置审计发现架构冲突即降级重议，不做禁区硬做（本批先例成为 T3-2-5 边界裁决的方法来源）
开放项：6-6 本体（T4-2 挂账）

## 2026-10-01 · T3-2-1 联网扩源（6-2）
底账：HEAD T3-2-1 收官 · 三 workflow 全绿
产出：osintGet 网关化（curl --proxy→降级直连）· Hackertarget 免费层双源 · osint-subdomain Signal 类型 · 验收 smoke 实证
关键裁决：双源独立降级（一源失败不影响另一源）· OSINT_HOSTS 豁免面（egress 网关）
教训沉淀：**状态文档必须随 commit 族同批入库**（本批 gates 红：state/roadmap 改动未进族而 manifest 已按新内容算哈希——此后成固定纪律）；Mimosa 拦 push → 工作流 world.run 通道先例定型
开放项：#12 egress MITM HTTPS 全链（真 HTTPS 靶场时实锚）

## 2026-10-01 · T3-2-2 / T3-2-2b 经验→技能整项（6-1）
底账：HEAD T3-2-2b 收官 · 三 workflow 全绿
产出：skill 存储+三门晋级通道（skill-promote）+抽取管道（skill-distill 占位纪律）+示例 2 张+domain/skill-schema · 角色过滤纯函数（role-card-filter）+接线（experience-ref 文件末尾纯新增 buildExperienceRefFiltered + scheduler 覆盖行）
关键裁决：三实质硬门禁下接线形态修正——原改签名方案违反「既有行零触碰」→ 纯新增编排+条件覆盖行（P2P_ROLE_FILTER 双覆盖）；角色过滤接线拆 T3-2-2b 显式授权（授权段先行）
教训沉淀：**复核清单必须分层**（A 层授权面严查/B 层交付物存在性——v1 混单复核 fail 的修正）；词面口径按拆词（拉丁词+CJK 2-gram）而非整串互含
开放项：#19 角色过滤销账 ✅；#20 skill wins 归因（P3）；#21 skill-distill LLM 蒸馏（P3）

## 2026-10-01 · T3-2-3 插件打包（6-3）
底账：HEAD T3-2-3 收官 · 基线 description-baselines 41→58 键
产出：三攻击工具 dsh 注册（基线钉扎 14 条）· 五形态导出框架（manifest.mjs+校验）· Burp 通用 XML 导出 · p2p_js_scan 收编基线（开放项 8 销账）
关键裁决：【锚点③】Burp 实导入验证降级——Burp 专业版许可不可得，走通用 XML 导出（XXE 防线：零 DOCTYPE/零 ENTITY 源码级锁定），实导入验证挂开放项；开放项 13 三工具注册销账
教训沉淀：**新 CLI 必带 import.meta.url 主流程守卫**（CI import 三连红 ENOENT 的教训，本批起固定纪律并写入 AGENTS.md 先例 10）；「工作流里面加入 agent 一起工作」——分层复核进落库工作流自此定型
开放项：Burp 实导入验证（挂开放项不排期）；MCP 骨架（→T3-2-4）

## 2026-10-01 · T3-2-4 双向 MCP（6-5）
底账：HEAD f0a8b9a（修复族收口）· 基线 pytest 368 / mocha 1849 / panel 55 · 三 workflow 全绿
产出：sanitize-ingest 统一消毒编排（注入扫描→消毒→[external:] 标记，fail-closed）+ osint 回补实战接线（collect.mjs）· 对外只读 stdio MCP server（原生 JSON-RPC 零 SDK+isReadOnlyCypher 预检+graphd 权威兜底+审计 JSONL）· 对内配置驱动发现（host 校验 fail-closed/allowPrivate 显式放行/探针降级）+ external-tools 注册接线（config/mcp-servers.json 缺省空清单零注册）· MCP 导出条目 skeleton→实质（manifest +2 live）· docs/mcp-security-design.md 设计定稿
关键裁决：安全四底线拍板（写通道不外放/不过 sanitize-ingest 链不入图/配置即边界/双向各自可关）· 原生 stdio 零 SDK 选型（不引 @modelcontextprotocol/sdk）· CALL 预检放行忠实 V-07 原版（graphd host_query_gate 权威兜底，镜像不越权加严）
教训沉淀：**环境依赖型测试红**（CI 无 ~/.config/d2d/host-token → graphQuery 加 token 注入 seam，空 HOME 复现验证后修复族落库——f8011a1）；agent 分层复核 A7 禁区比对+A5 live 实测（import 零副作用/开关退出/审计三事件）兑现「工作流加入 agent」形态，notes 全文落 report
开放项：#22 MCP 会话化/宿主原生接口跟进/首真实 server 接入（P3，触发条件见设计文档 §9）；全局纪律新增「外部数据不过 sanitize-ingest 链不入图」

## 2026-10-01 · T3-2-5 环内 supervisor（6-4）+ devlog 历史回填（本批）
底账：HEAD 本批收官（落库后以 git log -1 实测）· 基线 pytest 368 / mocha 1866 / panel 55
产出：scheduler/supervisor-tools.mjs（delegate_subtask 工具：ctx.agents.create 既有通道只调用不修改/scope 严格子集机器判定[hostAllowed 归属+父 denied ⊆ 子 denied]/递归深度=1 结构性双通道[进程外 isWorkerProfile+in-process setup 递归锁门，挂门失败 abort 不降级]/subagent-cap 既有账本硬顶预检/治理门继承[checkBash 直传+wirePostExecuteGate 镜像]/审计三事件+Signal(subagent-result) 回流）· index.js 纯新增接线块（sched 声明后）· description 基线 58→62（拍板 8 钉扎）· docs/devlog.md 历史回填（本文件）
关键裁决：worker 工具形态零禁区实现（边界裁决守住——不走 adapter.spawnWorker 调度器槽位语义、adapter 两文件零触碰、scheduler.js/loop.mjs 零改动、审批面只标注）；调度环自动创建切片明确出批（实战后另批 4-3a）；子 Agent 定性=进程内受控实体（同 scope 门治理，不走 sanitize-ingest external 链——两道防线定性区隔）；cap 复用 T0-C 既有账本（二次 acquire 会与宿主 hook 双记，故只预检不占坑）
教训沉淀：接线块 opts 引用 sched 必须置于 sched 声明之后（对象字面量立即求值 vs lambda 惰性引用——T3-2-4 块形态不适用于需实例的注入）；scope 排除项语法是逗号分隔（scope.mjs split(',') 口径，空格分隔会被整体当一条目）；**CI 环境依赖第二次行使 token seam 先例**（emitResultSignal 读 host-token → CI 无文件 Signal 回流断言红 → hostToken 注入 seam + 空 HOME 复现验证，同 T3-2-4 graphQuery 形态）
开放项：devlog 从本批起逐批追加；T3-2-6 闲时路由（阶段 6 收官批，下一批）

## 2026-10-01 · T3-2-6 闲时任务+自适应轮询+能力路由 + 阶段 6 收官（本批）
底账：HEAD 本批收官（落库后以 git log -1 实测；tag t3-2-stage6 指向 manifest 收口 SHA）· 基线 pytest 368 / mocha 1882 / panel 55
产出：scheduler/idle-tasks.mjs 闲时任务框架（watchdog 同构外挂：注册面+预检硬门[active engagement graphd 只读 + in-flight worker subagent-cap 公开账本；busyProbe 异常按忙 fail-closed]+setTimeout 链自适应频率[初始 max 60min→连续空闲 2 tick 收缩 min 10min，忙/失败退避回 max，审计 idle-task-interval]+失败降级进程隔离；P2P_IDLE_TASKS=0 零挂载）· 首批两任务=既有 CLI（skill-distill 补跑[开放项 21 空转保护解除路径]/misses-report 聚合）· 能力路由行为快照回归锁定（实测两环对新信号类型族无真实路由缺口——如实结论，不强补词表）· docs/stage6-finale.md 终态盘点 · index.js 接线纯新增块
关键裁决：**调度环核心（tick→allocateOnce→planAllocation→runWorker）零改动**为本批唯一新增硬边界——自适应轮询只在闲时触发频率上做（框架内闭环），不做调度环轮询间隔改动；能力路由精化实测无缺口→落地为快照锁定而非改词表（防无意义 churn）；短词 1 分档裸子串粗糙点登记开放项（逻辑面不动，0911 评分刚定稿，收官批宁稳）；三层协同（路由选角/角色过滤/scope 继承）测试锁定互不重建
教训沉淀：setTimeout 链（非 setInterval）才支持动态间隔自适应；工厂保守钳制（interval 下限 60s）与测试快跑冲突→显式 intervals 注入 seam（生产不受影响）；cat 读源码被 Mimosa hook 拦→Read 工具替代（hook 把 Bash 列源码当写操作防绕过）
开放项：新增「路由短词 1 分档精化」（allocator 逻辑面，低优先）；6-6 本体（T4-2 挂账）；#21 打通补跑通道但 LLM 蒸馏仍待素材

## 阶段 6 总账（T3-2-0 ~ T3-2-6 收官）

| 子项 | 终态 | 批次 | 一句话裁决 |
|------|------|------|-----------|
| 6-1 经验→技能 | ✅ | T3-2-2/2b | 三实质硬门禁下纯新增接线形态；复核分层定型 |
| 6-2 联网搜索 | ✅ | T3-2-1 | 状态文档同批纪律确立；Mimosa 工作流通道定型 |
| 6-3 插件打包 | ✅ | T3-2-3 | CLI 主流程守卫固定纪律；Burp 实导入降级挂开放项 |
| 6-4 环内 supervisor | ✅（工具形态） | T3-2-5 | 零禁区边界裁决守住；调度环自动创建切片实战后另批 4-3a |
| 6-5 双向 MCP | ✅ | T3-2-4 | 安全四底线；外部数据不过链不入图全局纪律 |
| 6-6 事件驱动并发 | ⏸ 降级 | T3-2-0→T4-2 | Kùzu 无原生 watch→本体挂 T4-2；收益由 T3-2-6 外挂承接（裁决链：审计发现架构冲突即降级重议，不硬做） |
| 吸收（闲时任务+能力路由） | ✅ | T3-2-6 | 调度环核心零触碰为唯一新增硬边界；框架大于任务量 |

阶段 6 方法论沉淀（跨批复用）：①前置审计发现禁区冲突即降级（6-6 先例），不转 4-3a 硬做；②agent 分层复核（A 授权面/B 存在性）+notes 全文落 report 自 T3-2-3 起为落库固定形态；③环境依赖型 CI 红两现两修（token seam 先例 T3-2-4/5 两度行使）；④description 基线随静态注册同步 regen（41→58→62）；⑤devlog 只追加+state 快照的双文档分工。下一步：T3-3（6.5 余项：可视化+授权数字化）。

## 2026-10-02 · T3-3-0 6.5 余项前置审计 + 拆批方案（只读批）
底账：HEAD 4a4eef54（t3-2-stage6）· 基线 368/1882/55 · 本批零代码改动
产出：docs/t3-3-plan.md（五项审计结论+拆批方案全案：3 实施批建议[可视化数据面+三图 → 桑基+9 标签页补全 → 授权契约数字化]）+ AGENTS.md 先例 11（宿主侧子 agent 协作常设授权）
关键裁决：四图全部可经既有 /query 只读通道实现（零新增 endpoint——6-6 禁区教训遵守）；授权数字化 ed25519 零外部依赖实测通过无阻断项（多纯新增挂接点；授权与审批两体系正交实锚）；8.5 定级=看板并入可视化批/变异试点缩水/评测集半自动（取舍归用户）；**子 agent 并行派发首例**（4 派 1 自做，软上限 4 守住，硬结论四条主 agent 亲自复证全过）
教训沉淀：审计纠偏三处（Hypothesis 生命周期实为 open→claimed→confirmed|refuted|suspected 非 pending→validated；dsh-sidebar-compat.md 是版本配对表非功能差距登记；manifest 实为 6 形态注释遗留）——任务书表述与仓库实态冲突时以代码为准；panel client 是零依赖拼接（无 JSX 手写 h()），前端工作量评估须按此形态
开放项：新增审计发现登记（hostAllowed 空 scope fail-open/目录 775/manifest 注释遗留/panel 测试盲区）；等用户对拆批方案与 8.5 取舍拍板后进 T3-3-1

## 2026-10-02 · T3-3-1 可视化数据面+三图+能力看板卡（6.5 首实施批）
底账：HEAD 本批收官（落库后以 git log -1 实测）· 基线 pytest 368 / mocha 1882 / panel **69**（+14）
产出：host 四路由（starmap/coverage/hypotheses/capability——独立微缓存+503 fail-closed[capability 静态读 fail-soft]+graphd 零改动零新增 endpoint+$eng/$since 参数绑定）· snapshot.mjs 三纯函数（buildStarmap[host 提取 evidence 不出 wire+边两端过滤+candidate-links pairs 解析坏对丢弃]/buildCoverage[21 格枚举序稳定补零]/buildHypLane[五态分组+时间窗钳位 1..90 天]）· client view.viz.js 片段（StarMapChart 自绘 SVG 确定性极角布局+CoverageHeat CSS grid+HypLaneSwim 五列泳道+CapabilityCard manifest 消费；渲染护栏 200 节点/300 边+超限计数提示；useViz 独立 5s 轮询 allSettled 单卡降级）· d2d:viz tab（order 62）· 测试 +14（host 纯函数/路由级含 #24 盲区顺手+组件探针）
关键裁决：路由形态照拍板 4 条（审计曾建议聚合为 1 条——故障隔离理由成立但范围决策归拍板，4 条各自微缓存实现同等隔离）；capability 零 graphd 依赖 fail-soft 恒 200（与 graphd 依赖路由 503 fail-closed 语义区分）；client 工厂无 useRef→星图用 id 哈希确定性极角布局（无状态天然稳定）；桑基图出批（transition-log 归 T3-3-2）
教训沉淀：loadFragment 探针的 makeH 不展开子组件——组件内部渲染断言要下沉到子组件级测试或断言 vnode props（'数据不可用' 文本在子组件内，父层只断 vnode）；client.test.mjs tab 断言是精确 deepEqual——加 tab 必须同步改（审计预警兑现，CI 免红）
开放项：#24 两项顺手销账（manifest 注释勘误+路由测试盲区补齐）；余不变。下一批 T3-3-3 授权契约数字化

## 2026-10-02 · T3-3-3 授权契约数字化（6.5 第二批，安全敏感度最高批）
底账：HEAD 本批收官（落库后以 git log -1 实测）· 基线 pytest 368 / mocha 1896 / panel 69
产出：domain/auth-contract.mjs 套件模块（契约 schema v1 一体签名[对规范化载荷防字段剥离]+ed25519 one-shot 签验+六失败面归并三态[missing/invalid/expired]+seen-auth 双维记忆[kid+contract, trust/seen-auth.json 原子写]+authContractGate 消费口[灰度矩阵合并]）· scripts/ops/authctl.mjs CLI（keygen/keys/issue/verify; 主流程守卫+白名单校验对齐 graphd _safe_token_path+O_EXCL 防覆盖+0700/0600）· 四挂接点纯新增接线（startEngagement 顶部[覆盖 adopt 全路径, 图变更前 throw]/p2p_start 预检[字符串回执规避 stopping 闸副作用]/registerGate 组合层[checkBash 之后 T0-C 同位]/egress refreshScope 整集校验[H14 同位数据组装区, deny 收窄 allow 集 fail-closed, 通道故障放行+warn]）· 启动横幅（enforcing/warning-only 与实际判定一致）· 测试 +14（全矩阵/失败面归并/挂接点源码断言/hostAllowed 锁定）· docs/auth-contract-runbook.md
关键裁决：**验签失败≠放行**（invalid/expired 两开关下恒拒——灰度 off 只豁免 missing）；授权与审批正交维持（approvals 零触碰）；四挂接点全部纯新增零降级（egress 经审计边界划定可挂接[H14 同构先例]）；seen 后契约消失不自动锁死（放行+持续警告, 拍板 3 自用纪律）；hostAllowed 空 scope 不补收紧（启动链回退填 scope+checkBash 兜底, 测试锁定现状）
教训沉淀：**T3-3-1 两教训补记**——①viz 路由 fire-and-forget send 与测试驱动时序竞态（await 化修复：异步 send 必须在 handler promise 内完成）；②vizEng 把 graphd 不可达静默吞成空 eng 返回 200 空态（吞错必须上抛给 fail-closed 分流——本批起并入先例 10 扩充口径[环境 seam+吞错记因]）；本批新踩：ed25519 是 one-shot 签名（createSign 流式 API 不支持, 须 crypto.sign(null,data,key)）；loadFragment 探针 makeH 不展开子组件（组件内渲染断言下沉子组件级）
变异观察：StrykerJS 限 domain/auth-contract.mjs **未跑成**——实测 @stryker-mutator/mocha-runner 插件与本地 mocha 版本冲突（run-helpers 内部路径不存在, PluginLoader 加载失败；T3-3-0「脚手架 100% 就位」定级偏差如实纠正：依赖在但不可用）。364 mutant 已 instrument, 卡在 runner。记开放项（修 mocha-runner 兼容后再观察跑, 不阻塞本批）
开放项：graphd.json 混入运行时状态（~/.config/d2d 卫生, 随 T4-5）；**变异工具链兼容**（mocha-runner 插件与 mocha 12 冲突, 修复后补观察跑）；下一批 T3-3-2 收官批（桑基+9 标签页+侧边栏收口）

## 2026-10-02 · T3-3-2 收官批：桑基+9 标签页补全+侧边栏收口（6.5 第三批=T3-3 整体收官）
底账：HEAD 本批收官（落库后以 git log -1 实测，tag t3-3-stage65）· 基线 pytest 368 / mocha 1896 / panel **88**（+19）
产出：host 数据面 snapshot.mjs（readTransitionFlows[桑基聚合: 尾读 2 万行上限+窗口钳位 1..90 天+族按 node_id 前缀 f-/exp-/fr- 分桶+自环防御]/readAuditTail[audit.log+transition-log 双源合流降序+kind 过滤+limit 钳 500]/readToolCalls[run-log 全事件投影+kind 词表+extra 白名单外兜底+per-worker 工具量榜]/buildChain[九查询: Task/worker/信号/端点/漏洞+DERIVED_FROM/AT/CONFIRMS/SUGGESTS 边+去重]/buildFrontierPool/frontierTransition[reviewer 钉死 panel]/readConfigOverview[notify 脱敏 configured/method/has_webhook——webhook 内嵌 token 值面绝不出 host+paused 清单]/attachEngCosts[活跃优先 ≤8]/Q_FINDINGS_SEV[总览 sev 增量]）· index.mjs 七条新路由（transition-flows/toolcalls/audit/configx 四 fail-soft 本地面；chain/frontier vizRoute fail-closed 503；frontier-transition POST 代理校验分型）· client 五新片段+桑基卡（view.approval[待决列单+裁决+badge]/view.chain[三列链路 SVG+Task 看板]/view.tools/view.audit/view.config[既有写面卡集中复用不重写]）· d2d tab 60-67 八个 · router/ORDER 登记 · 测试 +19（聚合/尾读/护栏/链路装配/路由黑盒[四 fail-soft+503+400 分型]/片段探针/tab 注册 8 断言/禁区 grep 断言）
关键裁决：文件尾读路由 fail-soft 恒 200+degraded 记因 vs 图依赖路由 fail-closed 503——双语义在本批成文（先例 10 扩充首次系统化应用：写新数据面先想「CI/他机没有这个文件会怎样」）；桑基/链路稀疏注记=历史存量真相（CONFIRMS 仅 W3 修复后 verified 闭环补建 gates.mjs:383 唯一写点，存量恒 0——不造数据不硬凑视觉）；审批 tab 纯 client 消费（既有 GET/POST /d2d/api/approval，grep 断言钉死 approvals.mjs import 消费点仅既有两处+auth-contract/tier-approval 零出现）；9 tab 实锚勘误——Task 是队列表非图节点（无出边，link_id/eng 列关联）、"Quest/Target" 不存在、链路顶层锚=Engagement；桑基数据面纠偏——transition-log 写入方是 Python（graphd/gd/transition_log.py）不是 .mjs，聚合在 host 侧读文件
教训沉淀：探针 makeH 不展开子组件的推论面扩大——父组件体内直渲染的 Card 可断言文本，子组件内的内容只能「子组件直驱+父层 vnode 在位」双口径；vm 探针 useState 桩不承接异步取数（fetchApi 桩 resolve 但 setData noop——数据路径归 host 测试，探针只测降级态与行组件直驱）；同测试多 vm 上下文的函数实例互不相等（vnode type 比对必须同源上下文）
开放项：#27 新登记（findings 分页/repro 抽屉/验证按钮/notify 写面/条目级 Experience/wakeups 计数/attempt 刻度——豁免理由 t3-3-finale §四）；#25 变异本批不重跑（面板批无安全面）

## 2026-10-02 · T3-3 阶段总账（6.5 余项收官：T3-3-1 → T3-3-3 → T3-3-2）
阶段结论：三批全绿收官，tag t3-3-stage65；终态基线 pytest 368 / mocha 1896 / panel 88；9 功能标签页全通、侧边栏对等三分法收口、8.5 三件去向全定（看板✅/变异 #25/评测集立项卡）
方法论沉淀（五条，T3 系列最厚一段）：①**审计纠偏纪律**——T3-3-0 五项审计纠偏 roadmap 假设两处（Hypothesis 生命周期实锚/dsh-sidebar-compat 是版本配对表），任务书表述与仓库实态冲突时以代码为准，子 agent 报告是输入不是事实（硬结论主 agent 逐条复证成为固定动作）；②**边界语义化先例**（T3-3-3）——「验签失败≠放行」「授权与审批正交」写成可判定行为规则并配源码断言测试，边界不是口号是 grep 得出的机器可查事实；③**变异定级诚实纠正**——「脚手架 100% 就位」降级为「依赖在但不可用」，定级偏差如实登记不粉饰（#25）；④**环境依赖 seam 纪律成形**（先例 10 扩充）——T3-3-1 两红（token seam/吞错空态）提炼成「写新数据面先想 CI 没有这个文件会怎样」，T3-3-2 四条文件路由全部 fail-soft+degraded 记因系统化兑现；⑤**面板工程纪律固化**——零依赖拼接（拼接即行为）/手写 h() 无 JSX/组件纯函数化（数据进 vnode 出）/渲染护栏 client 侧职责/wire 不带凭据与证据全文（notify 脱敏为 T3-3-2 实例）
批次链质量：三批零禁区触碰（graphd 全域/授权契约链 T3-3-3 前零存在后零改动/approvals 本体/scheduler 核心）；CI 三 workflow 全绿贯穿；子 agent 协作先例 11 两批实践（T3-3-0 五项 4 派 1 自做、T3-3-3 四项 2 派 2 自做、T3-3-2 三项 3 派+主 agent 禁区比对自做——软上限 4 守住）
下一阶段：T4-2 存储（优先）/T4-3 信任/T4-4 OTel 可并行；评测集跑测单独立项（立项卡 state.md）；T4-1 已降级只做隔离能力评估；T4-5 终批清理

## 2026-10-02 · 文档校准批（外部独立视角只读调研 → 8 项校准；含 P6 CI 覆盖缺口修复）
底账：HEAD `8aa8f60`（T3-3-2 收官 tag `t3-3-stage65`）· 基线 pytest 368 / mocha 1896 / panel 88（本批零代码改动，基线不变）
产出：P1 HEAD 声明 T3-2-5→T3-3-2（state.md:8，含底账时点行同步）· P3 分支数「31 个」→实测 1 个 + T4-5 清理已提前执行注记（回滚点改由 11 个 tag 承载）· P2 四处并存「下一步建议」消歧为 1 处标「当前唯一有效」（state.md:85）+ 3 处标「历史·…时点，已完成」（state.md:60/68/76），并在 AGENTS.md:25 写死取用规则「取唯一标『当前唯一有效』那条，历史条目不得取」· P6 **核实并修复 CI 覆盖缺口**（实测：`pytest tests/test_graphd_gates.py`=298 例 vs `pytest tests/`=368 例，差额 70 例来自 test_audit_alert/test_gate_anchor/test_injection_sampling/test_repairability/test_transition_log 五个文件——此前不在 ci.yml:20 与 gates.yml:34 执行范围；两处改跑全目录 `tests/`，实跑 368 passed/60s/exit 0 后才落库；state.md:15 补记 368 口径来源）· P4 README 测试基线 1729/55→1896/88 · P5 `## 本次更新（v0.3.0）` 改标「能力快照（v0.3.0）」+ 显式声明非当前状态并指向 state/roadmap（重写留 T4-5）· P7 devlog.md:7「六行结构」→「五行结构」勘误 · P8 AGENTS.md 一句话定位段后补 p2p-core 上游关系（据 scheduler/ 下 9 模块源码头 + index.js:2「由 p2p-core sync-out 分发」实锚；同时明示同步方向/分支策略/p2p-core 演进状态**仓内无据**，不得凭该条推断）· 附带修正速查段 2 条路径漏 `plugin/pentest-dsh/` 前缀（har-capture.mjs、tools/js-scanner.mjs），全段 67 条花括号展开复测 **100% 实存**
关键裁决：**P6 严格「先核实后改」且独立成批**——不与 P1-P5 文档批混批（承 T2-1「不混批纪律」），核实手段为 `pytest --collect-only` 双口径对比 + 全目录实跑取证，非推测；**本批零禁区触碰**（diff 仅 docs/ + README.md + AGENTS.md + 两 workflow + manifest，未触 do-not-touch.md:9-50 任一对象）故无需 4-3a 式显式授权；README 只做局部同步不重写（遵「不与终批抢范围」，重写留 T4-5 roadmap.md:66）；control-v1~v3 + honest-baseline 旧里程碑体系本批不动（留 T4-5 清理批统一处置）；manifest regen 独立 chore commit 且与文档批**同批推送**（CONTRIBUTING.md:44 红线：分开推会让 gates 的 Manifest integrity 步先红、修复步骤永远轮不到验证）
教训沉淀：**①快照文档单节内多字段不得分批更新**——state.md 同一「当前底账」节内 HEAD 停在 T3-2-5 而基线已标「T3-3-2 固化」，是「分节更新」而非「整节原子更新」的产物；新增口径并入 AGENTS.md 活文档机制：单节多字段须同批一次更新，落库前按节自检。**②清单类文档不得抽样验证**——先前对速查段做 5 条抽查判「5/5 属实」，扩到全段 67 条才暴露 2 条漏前缀；速查/白名单/禁碰类清单须全量展开校验（花括号+跨行+通配三种形态分别处理），抽样通过不等于清单正确。**③「基线数字」须同时锚定「执行范围」**——368 是全目录口径却只有 298 受 CI 保护，数字本身正确而覆盖面缺失，两者必须成对核实（先例 10「写新面先想 CI 跑不跑得到」同源扩展到数字口径）
开放项：观察登记（不修）——「state.md 梯队状态节为追加式叙事，历史批次条目建议保持不动以存轨迹；本批只做『下一步建议』单值化消歧，未重排梯队行」；#25 变异工具链（mocha-runner 与 mocha 12 冲突）、#9 bias 阈值、#15/#16 检索采集等既有开放项状态一律不变；评测集跑测立项卡与 T4-2 优先级竞争仍挂用户拍板

## 2026-10-02 · T4-2 存储层选型决策书（阶段 7 首批，决策批零代码零迁移）
底账：HEAD 本批收官（落库后以 git log -1 实测）· 基线 pytest 368 / mocha 1896 / panel 88（决策批零测试面改动，零回归即达标）
产出：docs/t4-2-storage-decision.md（现状实锚/外部环境/选项矩阵四选项/6-6 重评判定/归档策略草案/建议与依据/6 拍板点/假设声明/只读探针附录）+ state/roadmap 终态
关键裁决：**规模不触顶**——本地库 80MB/14,146 节点（Signal_ 5108 大头，open 占 82%；Endpoint/Plan 两表从未启用），增速 150-400 节点/天保守外推 3 年 <2GB，距公开痛点区（数百 GB，#4936/#6012 实锚）3-4 个数量级——"维持"是数据支持的默认态而非保守妥协；**真实到期风险是生态**（kuzu 0.11.3=归档同日绝版、wheel 冻结 CPython ≤3.14、零修复、扩展服务器关闭）；LadybugDB 三面同构（DDL/参数绑定/Python API 逐项核对，原核心团队含联创参与，v0.21.2 前一日 release）→ 强制改动仅 import shim 2 行+文件后缀，迁移=停机 EXPORT→IMPORT Parquet（bak 副本可演练）；**6-6 重评判定=矩阵内不成立**——LadybugDB/Kùzu/FalkorDB/DuckDB 均无事件机制，唯一有原生 trigger 的 Memgraph 需放弃嵌入形态+BSL 许可（架构级改变超本批范围），重评条件精确化为"引入嵌入+事件双条件候选"；归档三件套设计（季度 EXPORT Parquet 逻辑兜底+物理快照保留 3 份+恢复环境钉扎 wheel/扩展镜像——"包还在≠恢复计划"）；建议倾向 A 维持+归档为主、B 迁移 LadybugDB 作触发条件驱动预案（Python 3.15/现场损坏/LadybugDB 治理信号三触发），预案就绪本身显著降低 A 的持有风险
子 agent 协作（先例 11）：2 派信息检索类（LadybugDB 专项 / Kùzu 官方口径+横向候选）——软上限内，来源 URL 全清单收录决策书附录 C（可溯源复核），硬结论主 agent 复证（本地库形态/规模/耦合面 75 执行点/26 方言特征命中亲自取证）；检索不到的如实标"未检索到"（Kùzu 写入渐进变慢无命名 issue 实锚、forks 许可证未核实——全部进假设声明）
教训沉淀：决策批的产出形态=可拍板的事实矩阵而非倾向书——每个选项给"触发条件"列让拍板可推迟（触发条件驱动预案把 A/B 之争从"现在选"变成"到时候自动选"）；外部调研结论必须过"本地实锚关"（调研说 Kùzu 痛点在数百 GB，本地才 80MB——规模论证从外部口径降维成本地量级对比）
开放项：拍板点 6（探针脚本落不落 scripts/ops）随拍板；无其他新增
