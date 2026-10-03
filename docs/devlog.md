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

## 2026-10-02 · T4-2b 拍板落地批（存储选型收官：归档首执行+生态对冲+探针落盘+先例 12）
底账：HEAD 本批收官（落库后以 git log -1 实测）· 基线 pytest 368 / mocha 1896 / panel 88（探针为 ops 脚本以 smoke 代测）
产出：决策书附录 D（六拍板点落档）+ §八已拍板指向 · state/roadmap 终态（6-6 双条件解锁裁决链闭合）· AGENTS 先例 12（落库环境分轨与批前同步——a 批前 pull 核对/b docs-only 临时克隆直推 fast-forward 达标口径/c 涉代码禁区对象必须真实工作仓 world.run 通道）· scripts/ops/graph-stats-probe.mjs（只读探针：18 cypher 字面量零拼接+状态分布+磁盘面+500MB 告警线+主流程守卫+token seam）· docs/runbook-storage.md（归档规程[EXPORT 首选/物理快照降级/3 份滚动]/钉扎清单/B 预案四触发条件与迁移启动批大纲/恢复演练开放项）· do-not-touch 增量（探针安全语义条目+源库零写全局纪律）· 首次归档执行+生态对冲（仓库外，产物清点见 runbook §一/§二）
ops 实锚：**归档首执行**——EXPORT DATABASE 经 /query host 通道实证放行（host_query_gate 仅拦 CALL，T4-2b 审计锚 gates.py:426-443+app.py:1674），产物 export-20261002-1635=18 parquet+schema/copy cypher（18/18 逐表对齐）4.2MB；物理快照 kuzu_db-snap-20261002-1635.tgz 6.3MB+SHA256SUMS-snap.txt；**生态对冲**——kuzu 0.11.3 cp314 wheel 7.6MB 钉扎 pin/（PyPI 绕缓存下载实证存量可得，sha256 86be7d11…）+python-version.txt；外部扩展钉扎实证降级"无需"（graphd 零 INSTALL/LOAD 命中）；**探针 smoke**：节点 9,223 / 边 6,786 / kuzu_db 77.0MB(MiB) / wal 5.5MB / logs 11.7MB / runs 4.4MB
关键裁决：EXPORT 通道=读源库写导出目录（零源库写零 graphd 改动零停服——硬边界"源库零写"完整兑现）；CHECKPOINT 不做（写源库超边界；EXPORT 读已提交状态无需前置——首执行实证结构完整）；**决策书数字勘误**——决策批 §2.1"节点合计 14,146"系加总错误，探针逐表实锚 9,223（决策书四处随批修正+勘误注记；devlog 历史节不动以存轨迹）；8.8KB/节点密度重算后量级结论不变（3 年外推 <3GB，距痛点区 2 个数量级以上）；批前同步纪律首执行（pull 核对 a3c5eba/07fde3f0 在位+/tmp/d2d-survey 清理——先例 12 a 项落实）
教训沉淀：**探针 smoke 抓住了决策书数字错误**——"先落探针再校数字"的顺序价值：只读探针把逐表计数机器化，加总错误无所遁形（人工合计的 14,146 vs 机器合计 9,223）；运维文档（runbook）的命令必须带"已实证"标注（本 runbook 每段命令都标注首执行实锚或审计锚——未实证的命令写"未验证"是 runbook 的诚实底线）
开放项：**恢复演练单独立项**（IMPORT 临时库+只读重开物理快照——"包还在≠恢复计划"，runbook §五登记）；裁剪 >500MB 再议（拍板 ②）；B 迁移不排期（触发条件见 runbook §三）
勘误补记（T4-2b 收官途中）：CI gates 首 red——semgrep p/security-audit 的 react-insecure-request 通用规则把探针 loopback fetch（http://127.0.0.1:8766，代码内常量）判 blocking（run 36986678189 实锚）；修复=行内 nosemgrep 精确规则 ID 豁免+理由注记（行为零变化，smoke 复跑绿）；教训——本机服务探针的 loopback HTTP 是 semgrep 通用安全规则的盲区误报面，新 ops 脚本触网前先过 semgrep 心智检查（本机无 CLI，以 CI 复扫为准）
二轮补记：首版豁免注记放在命中行上方隔一行——semgrep nosemgrep 语义=同行或紧邻上一行才生效，未覆盖多行 fetch 的命中首行；改放 fetch 行尾同行豁免（第三轮，再红按止损停下回报）

## 2026-10-02 · T4-3-0 阶段 8 前置审计+拆批方案（只读批；定义考古优先于一切推断）
底账：HEAD 08fa883b（T4-2b 修复族收官，批前同步核对在位）· 基线 pytest 368 / mocha 1896 / panel 88（只读批零代码）
产出：docs/t4-3-plan.md（四子项定义卡/差距矩阵 15 项/禁区比对+风险定级/3+1 批拆批方案/6 拍板点/8-1 schema 草案）+ state/roadmap 终态
关键裁决：**四子项定义实锚结论=均源自上游会话规划语境，入仓仅一行概称**（roadmap:55-58 创建于 45035be 从未修改；:59 自证"上游规划文档不存在"；brain-audit-runbook:124 五术语审计期已证"阶段 8 仓内零占位"）——定义完整度分四级：8-1 最厚（v1 对照原文"离线做无需加列"+双依赖已落地证据链：T3-1-2 commit 3f4e964+6-1 素材面）/8-2 v1 基线厚实（dual_sign 全链插件侧逐函数实锚）但**"N-of-M 已砍"裁决仓内零记录**（git log -S 仅 roadmap 创建提交一次引入，拍板人/理由不可考）/8-3 gatewarden 零出处孤行（全仓+全历史+tag+stash+悬空对象唯一命中）但字面定义自足可先行/8-4 零出处+**L2 撞调度环 2C 禁区预降级登记**（L1 只读稳定视图零禁区可做）；**8-4 既有覆盖结论部分成立**（失控停机/429 反馈/熔断恢复/单点频率自适应已闭环——防重复建设）；禁区比对关键发现：8-2 密码学背书触 auth-contract.mjs do-not-touch:63 邻接→平行新模块 vs 4-3a 拍板；消歧警示：graphd 注释"8-1/8-2"是 T1 期审计项编号与阶段 8 无关
子 agent 协作（先例 11）：2 派（定义实锚考古/现状差距矩阵并行）——考古派穷尽 9 tag+stash+悬空 commit+workflow-runs+.mimosa 仍零命中（检索路径逐项声明）；差距派产出门体系全清单（graphd 14+门全 pytest/plugin 12+门全 mocha）与既有对抗测试盘点；硬结论主 agent 复证五条全过（roadmap 原文/v1 对照/gatewarden 唯一性/契约链禁区身份/8-4 已覆盖抽查）
教训沉淀：**定义考古的"检索路径声明"与结论同等重要**——"零命中"只有在列出找过哪里之后才是证据（9 tag 逐个 grep+悬空对象+workflow-runs 全列）；一句话概称子项的处理分型：定义自足可先行（8-3 字面完整）/定义缺失不脑补（8-2 异构化语义/8-4 作用域——登记待用户补充而非按名字脑补设计）；上游规划语境的子项入仓时必须同步带定义原文，否则考古成本远超书写成本（本批 2 派 571s+609s）
开放项：三子项定义补充请求（拍板点 1）/N-of-M 补记请求（拍板点 2）/8-2 failover 共用槽牵动面与 hardDeadline 交互未逐行核（实施批前置审计项）

## 2026-10-02 · T4-3-1 gatewarden 门禁对抗测试（阶段 8 首实施批，8-3）
底账：HEAD 本批收官（落库后以 git log -1 实测）· 基线 pytest 394（+26 对抗）/ mocha 1928（+32 对抗）/ panel 88（零回归）
产出：对抗样本库三件套（tests/gatewarden/test_gatewarden_graphd.py 26 用例[13 gap+13 blocked]/plugin test/gatewarden-plugin.test.mjs 24 用例[15 gap+9 blocked]/test/gatewarden-combo.test.mjs 8 组合链）+ docs/gatewarden-report.md（36 条 gap 分级清单🔴可绕过/🟡降级拦截/🔵告警缺失+对照 gate-coverage-gaps.md+7 条新发现）+ 双向断言形态（blocked=回归守护/gap=登记+反向守护防清单腐烂）+ N-of-M 放弃补记（拍板②闭环：v1 2-of-2 为终态）+ state/roadmap 终态
关键裁决：**对抗样本必须以被测门真实签名与真实 fixture 形态驱动**——四轮探针实证：checkBash 三参位置调用+eng={scope} 直接对象，对象形态调用产生全量虚假 DENY，错误 fixture 差点把两条 🔴 P0 级 gap（DESTRUCTIVE 引号变体/bash 重定向写系统路径）洗成"已覆盖"（首两轮"全拦"为假象，修正签名后实锤零拦截/绕过）；gap 36 条（28 明细分级 🔴10/🟡11/🔵7+8 组合链单列——分级计数以 docs/gatewarden-report.md §二明细为准）——P0 级：bash 重定向写系统路径零拦截（write-gate 只看工具名+DESTRUCTIVE 无重定向规则）、Gate-V 塞料+假锚 verified 假阳性全链、缺省 P2P_APPROVAL_MODE=off 七工具零事前拦截、DESTRUCTIVE 编码面、FULLSCAN_RE 标签闭集缺五表；攻击者视角纯粹性兑现（发现不修，修复批候选集中登记）；评测集同源靶场地基交付（58 用例可直接复用）
子 agent 协作（先例 11）：2 派门体系盘点（graphd 侧 16 门+清单外 12 项/plugin 侧 12 门+run-injection 前身形态分析）；对抗用例生成主 agent 自做（质量核心）；盘点预测 vs 实测诚实账入报告 §三（两条 P 级预测首轮被错误 fixture 推翻又四轮修正实锤——子 agent 报告是输入不是事实的先例 11 纪律再次验证，且主 agent 的探针自身也要过"签名正确性"关）
教训沉淀：**错误 fixture 比无测试更危险**——虚假 DENY 给人"门在工作"的错觉（首两轮结论写进 docs 前被第三轮探针自检抓住：裸形态 DENY 与引号形态 PASS 的差异才是判别性证据，全同结果=fixture 无效信号）；双向断言的反向守护设计（gap 用例断言"绕过成立"，修复后自动失败提示撤清单——对抗资产不腐烂的机制化）
开放项：**36 条 gap 全清单**（docs/gatewarden-report.md §二——本批最大产出，修复归用户排批的"门禁收紧批"）；gap 23 DNS rebinding 复现归评测集（可控 DNS 环境）；下一批=评测集跑测（拍板排期，样本库=同源靶场）→ T4-3-2

## 2026-10-02 · EV-1 评测集首跑批（T2-1 评测集 26 条首次真跑；检索层评测形态+半自动裁决清单）
底账：HEAD 本批收官（落库后以 git log -1 实测）· 基线 pytest 394 / mocha **1939**（+11：eval-harness 9+rebinding 2）/ panel 88
产出：experiments/eval-harness.mjs（fixture 确定性构造+逐条编排+三层 garbage 判定+主流程守卫）+ eval-scorer.mjs（聚合/CNSR 段/人工裁决清单产出）+ results/eval-run-1.jsonl+adjudication.json（结构化可复跑）+ docs/eval-run-1.md（首跑报告）+ gatewarden gap 23 受控仿真复现（egress-rebinding-window.test.mjs：resolve 注入零真实 DNS——首查公网入缓存/窗内切元数据 IP 不可见 calls=1 实证，#23 升级动态仿真双证）+ 单测 11 + AGENTS 先例 13（重试型工作流幂等性）+ T4-3-1 补推收官登记（82d626b 已在远端，三 workflow 绿）
首跑结果：26 条=pass 12/manual-pass 3/partial 7/fail 4；锚命中 25/45=55.6%（L1 75%/L2 60%/L3 28.6%）；**锚过期率 0/26=0%**（green 8+amber 18，远低 30% 止损线——评测集本体健康零重写）；garbage-control 三层全过；fail 四条=检索排序未进 topK（锚卡在池），属检索面真实召回弱点非锚错
关键裁决：**检索层评测 only**——全链重放不可行三证（原始轨迹不入仓[0eb6454 自述+/tmp 已灭失]/蒸馏含 LLM 不可确定性重放/活卡库四快照零 run 衍生卡）；cards=数据集自身确定性构造（脱敏形态 canonical——活图原文精确匹配会确定性失配）；判定口径定稿=must_include all-of+主观字段（chain/verdict/跨场 severity）不自动判定进人工裁决清单（14 条待用户终裁）；CNSR 维持 T2-1 基线 5.73 引用（computeCnsr 复算回 5.73 无口径漂移——检索层评测不产 finding/token，不硬造分母）；立项卡"实弹全链路五指标跑测"=另一形态登记后续可选独立批
教训沉淀：**fixture 陷阱第二次现身**（node:test import 在 mocha 下不可见——新测试文件 0 passing 但不报错，与 gatewarden 的 checkBash 对象形态同构：错误载体造虚假结果；两案合并口径=新测试文件先单跑确认 it 数再入全量）；world.run stdout 捕获对部分子进程不稳（npm/npx 空输出）——快速门统一纯 exit-code 口径+数字断言移交复核员实跑（与先例 13 同批沉淀）
开放项：人工裁决清单 14 条待用户终裁（eval-run-1-adjudication.json）；检索面跨 run/链召回弱→embedding hook（R5 既有登记）重测；实弹全链路五指标跑测=可选独立批（立项卡口径）

## 2026-10-02 · GW-2 门禁收紧批（与 T4-3-1 攻击批成对：P0 六组+黄条收编+蓝条处置）
底账：HEAD 本批收官（落库后以 git log -1 实测）· 基线 pytest 394 / mocha **1944**（+5 净增：防御变体+翻转改写）/ panel 88
产出：graphd 三修（#1 FULLSCAN 闭集扩 4 标签[Experience/ExperienceWeight 维持 by-design 豁免]/#2 /query/frontier 升 host-only[消费方普查全 host]/#3 is_engagement_create 扩 MERGE[保留子串语义只紧不松]）+ plugin 五修（#14 候选副本集[引号/转义归一+cd 锚定+runs//tmp 豁免]/#15 重定向 sink 判定[SYSTEM_PREFIXES 同源 import+.ssh 段]/#16 共享模块 forbidden-target.mjs 抽取+web_fetch 硬黑面任意模式 deny/#18 跨类双锚分行判定[单行塞料拒]/#20 零宽剥离先于词表）+ graphd 黄条两修（#5 junk 空白归一/#8 denylist 全角点+十进制 IP 还原）+ replay redact（#11 收窄）+ cidr 形态（#28）+ **36 条处置态全景**（已修 12/豁免 7/延后 17，docs/gatewarden-report.md 处置全景节）+ 反向守护翻转 14 例+防御变体扩面
关键裁决：**逐条可追溯**（每修带 gap 编号+反向守护翻转=非删用例）；**fail-closed 红线两处落地**（MERGE 修保留子串误报不加词边界=只紧不松；L1 口径差豁免因改后缀=权限扩大）；**诚实延后模板**首次批量使用（#19 假锚/源码正则否决论证：无权威命名空间+伪造者零边际成本+0916 误杀学费——延后不是不做是有据不做）；P0 六组实修 5.5 组（#18 收窄+残余延后/#16 硬黑面+内网残余延后——签名零变更红线下的诚实边界）；#23 rebinding 延后（连接面架构改造+端到端靶场验证，EV-1 仿真用例保留守护）
教训沉淀：**编辑通道纪律**——python 脚本写 tests/ 被 Mimosa post-write 恢复机制静默回滚（8 处修改消失），Edit/Write 工具写的存活——源码/测试修改一律工具通道（hook 保护的正确用法）；**反向守护的收益实证**——本批 14 例翻转全部由样本库自动触发提示（G8 三 sev/G12 零宽/combo 三链/graphd 六例），无一遗漏靠人记忆；**combo 静态断言是修复回归的最低成本守护**（FULLSCAN/redact 源码正则断言翻转=一条 assert 锁一个修复）
开放项：Gate-V 架构批（#18 分行残余+#19 假锚对账）/端点编排批（#12 认证顺序+#13 暂停扩面）/部署授权面拍板（#16 内网残余+#21 L0+#24 CONNECT）——三大延后簇见 gatewarden-report 处置全景遗留跟踪

## 2026-10-03 · T4-3-2-0 共识验证 v2 前置审计与 schema 草案（只读批；8-1）
底账：HEAD 本批收官（落库后以 git log -1 实测）· 基线 pytest 394 / mocha 1944 / panel 88（只读批零代码）
产出：docs/t4-3-2-plan.md（DDL 能力结论卡/v1 全链对照实测/v2 字段设计卡/GW-2 门交互矩阵/禁区预比对+四族实施蓝图/**schema 草案 §五**）+ state/roadmap 终态
关键裁决：**Kùzu 0.11.3 ALTER ADD 无 COLUMN 关键字**（带关键字 Parser exception"expected rule kU_AlterOptions"；仓内 schema.py 既有 ALTER 本就无 COLUMN——子 agent 实测纠偏+主 agent 独立临时库复证双过）；**DEFAULT 回填 '' 非 NULL**（既有行/ALTER 后新行双证，读侧零 NULL 风险）；**IMPORT 后 DEFAULT 元数据丢失**（schema.cypher 不携带 DEFAULT→导入库新行全列 NULL，kuzu 无 SET DEFAULT——恢复演练/B 预案新增设计输入，开放项登记零改 runbook）；EXPORT/IMPORT 往返含新列数据无损（copy.cypher 自动扩列）——归档规程零改动；v1 零回归基础（14 it 全绿+图内实锚 698/8/9 与 T3-1-0 时点零漂移，走运行中 graphd 只读 /query）；replay_matrix 消歧（列在 Finding 非 Signal_，runbook"五段矩阵"是 verify-result evidence 内容结构）；GW-2 门交互矩阵=新写点全量过门零豁免（A 面 reasoning_path 过 redact_pii+注入扫描扩展[soft 不加前缀防破坏 JSON]+配额；B 面 host-only 走共享门；专用读路由不走 FULLSCAN）；禁区预比对=**do-not-touch :20-21 命中**（Experience 表结构+读写端点在绝不碰清单）→实施批按行修订入蓝图（授权链=T4-3-0 拍板⑥+schema 草案确认，4-3a 先例形态）
子 agent 协作（先例 11）：1 派（DDL 实测四项：ADD 可行性/DEFAULT 语义/EXPORT-IMPORT 往返/CTAS 探针）——**任务包给的 ALTER 参考语法自身是错的**，子 agent 以报错原文优先纠偏出正确语法完成实测；硬结论主 agent 独立临时库复证全过（ADD/回填/table_info 16 列/空串匹配）；生产库实锚姿势=运行中服务只读 /query 而非直接开库文件（graphd 常驻锁+只读保证双赢）
教训沉淀：**给子 agent 的任务包里"参考语法"自身可能是错的**——实测型任务的结论必须锚在报错原文与可复跑路径上（子 agent 没有把任务包语法当权威，是本批复证链成立的前提）；schema 草案的确认位设计=数据结构决策值得一次轻确认（T4-3-0 拍板①留位兑现），草案与实施蓝图分节使确认粒度清晰
开放项：IMPORT DEFAULT 丢失→恢复演练设计输入+B 预案首批验证项追加；illegal 枚举位预留（v3 拍板）；consensus-apply 存量 9 行回填=实施批可选项；**schema 草案 §五等用户确认后进 T4-3-2 实施批**；远端 dependabot 三分支（actions 升级 PR）归用户处置

## 2026-10-03 · GW-2 v2 门禁收紧批完整版（外部三轮冷读采信落地；N1-N4 结构性缺口+P0 深化+低成本池）
底账：HEAD 本批收官（落库后以 git log -1 实测）· 基线 pytest **404**（+10: 校准集/merge-key/容量豁免/别名回注/样本库 5 例）/ mocha **1948**（+4: G7 三变体+正例/G12-C-003 等）/ panel 88（只读零改）
产出：子批 A（schema.NODE_TABLES 单一来源+闭集 Experience 入集[拍板③]+谓词内容锚[Engagement 严格锚/一般表选择性]+无标签拒+MERGE 命中已存在≠新建[锁内存在性参数绑定]+容量双副本收敛单一来源+params 恒扫[#9]+finding 参数化别名回注[#4]）+ 子批 C（gateV lookup seam 存在性分层[#19 闭合——high/critical 严/medium 形态级+标注]+跨类双锚同链要求[#18 残余闭合]+scheduler 注册 run-log 索引）+ 子批 D（P2P_TOOL_GATE_STRICT=1 off 高危档 fail-closed+审计事件枚举+首次评估横幅[#16 收窄]）+ 子批 B（SYSTEM_PREFIXES 对账=已全覆盖零代码+测试 HOME 热修）+ 低成本池（#20 NFKC 两副本[全角闭合]+#21 部分闭合认定+#17/#26/N3 登记处置）+ 处置全景 v2+底账五字段对齐+verified 纪律决策账+候选清单
关键裁决：**N1 双逃逸 kuzu 实跑钉死**（恒真式 WHERE x.x=x 泄 6/6 行含跨项目 hidden；无标签 MATCH (n) 全图 count）→ 内容锚按表分档（Engagement 严格[scope 泄漏实证]/一般表选择性谓词[briefs:64 活调用点零误伤实锚——高权重信号全局读与查重 CONTAINS 是设计内跨面读]）；**反向守护核验=graphd gap 用例确系恒绿形态**（头注释自证"测试仍过并打印闭合提示"——外部冷读读法成立）→ 修复面全部升格 blocked 断言；**NFKC 探针推翻任务包假设**（ο U+03BF 与拉丁 o 是 confusables 非 compatibility 映射，normalize 原串不变——NFKC 真实闭合面=全角/兼容字形，omicron 转真残余登记 TR39）；N3 按"合成 eng_id=既有合法形态"登记不修（28 处 pytest 夹具+评审工具标签语义实锚）；#26 write-gate.mjs 授权例外刻意排除（对照 D 子批显式含 tool-gate.mjs）→ 待按行授权不硬修；#2 维持 v1 host-only（v2 提示词方案更松——只紧不松红线）；OOB nonce 技术可行（oast /hits 在）但需 briefs 授权+靶场 → 登记后续批
子 agent 协作（先例 11）：本轮主 agent 自做（净新增集中在 A/C 两面，行级实锚后并行派发对齐成本高于增益——白名单授权非义务）；工作流内 A/B 分层复核照常
教训沉淀：**任务包/早前快照与仓内现实漂移时以实跑为准**（提示词底账 6dc85172 已前进两批/G12 用例快照为 v1 前形态——先跑当前态再改断言）；**mocha 全局钩子是 before/after 非 node:test 的 beforeAll**（fixture 陷阱家族第三例）；**Bash 写 tests/ 被 Mimosa hook 拦**（GW-2 教训再次自证——Edit 通道才过）；编辑吞换行会让 try: 并入注释（app.py 导入区事故，grep 复查救回）
开放项：OOB nonce 绑定（需 briefs 授权）/TR39 skeleton（#20 残余）/write-gate realpath（#26 按行授权池）/N3 同-eng 绑定（架构）/validator.js L0 授权语义（#21 残余）/threshold 型全匹配写法（内容锚已知残余）；下一批=**HYG-1 工程卫生批**（workflow 依赖漂移+按行授权池核查）

## 2026-10-03 · HYG-1 工程卫生批（外部复审采信落地；CI 治理+小修+日志轮转+清点，全小项非门禁面）
底账：HEAD 本批收官（落库后以 git log -1 实测）· 基线 pytest **406**（+2 轮转位移/双写入侧在位）/ mocha 1948 / panel 88（零回归）
产出：CI 依赖统一（ci.yml python 3.11→3.12+`-r requirements.txt`[requirements 增 pytest==9.1.1 与 gates 单一来源；弃未钉版]）+ gates npm-audit node 20→24（engines>=22.5 下 20 违宪）+ dsh-compat 22=最低支持轨（注释定位）+ panel package-lock.json 入库（npm ci 口径统一）+ **基线数字三处对齐**（ci.yml 步骤名 368→406/README 角色 25→24/state 底账节）+ standalone 启动错误语义（server error→reject，入口 catch 退出非零——端口占用 EADDRINUSE 实证 exit=1）+ 守卫 5 处主判规范形（wmpf/wxapkg/wordlists/standalone endsWith→pathToFileURL 真实入口判定；match-site fileURLToPath+手拼 file:// 修复）+ **审计/转态日志轮转**（_rotate_if_needed 双写入侧同源镜像+锁内调用；50MB+保留 5 份，P2P_LOG_MAX_MB/P2P_LOG_KEEP 可调；读侧尾读活跃路径兼容不变）+ ARCHITECTURE 节点清单对齐 schema（Signal_ 无 host 列/Endpoint host/port=url 派生）+ **吞错清点分级落 docs/hyg1-swallowed-errors.md**（python 35=上下文记因 17+模式性 11[schema 幂等 ALTER]+有兜底 5+补记因 2[#4 别名块/词表回退]——python 真裸吞清零；js 空 catch 444=记因 298+无注释 146 归后续批逐文件清点）
关键裁决：**任务包行号与本仓 HEAD 漂移以实测为准**（ci.yml python 实为 3.11 非"未对齐"叙述之直接形态；match-site 在 scripts/browser/ 但不在禁区四文件列举内——禁区按列举语义执行）；"build-client 先于测试致防漂移断言 CI 恒真"面按拍板登记不改（本地有效/CI 无害）；轮转放写入侧锁内（读侧零改动=兼容性设计而非补丁）
教训沉淀：**探针自身先核对 env 名再下结论**（首探端口占用行为"挂住"实为探针用了默认端口空转——P2P_PANEL_PORT 核对后实证 exit=1）；窄窗口注释判定会把 2+ 行上的模式注释误判为裸吞（清点方法两档口径并列如实给数）
开放项：js 空 catch 146 处逐文件补因（egress/mitm→snapshot→spa-render 优先级）；#26 write-gate realpath 按行授权池；dependabot/mods 远端分支处置（归用户）

## 2026-10-03 · T4-3-2 共识验证 v2 实施批（8-1 推理路径字段入库；schema 已确认+授权链闭合）
底账：HEAD 本批收官（落库后以 git log -1 实测）· 基线 pytest **412**（+6: 校验×2/ALTER 零破坏/A 面往返/注入 high/B 面五态）/ mocha 1948 / panel 88（零回归；v1 14 it 复跑在位）
产出：族 1 schema 三处同步（CREATE 16 列+段尾 ALTER 2 条+_CRITICAL_COLUMNS 扩 2）+docs/experience-consensus-schema.md 权威文档[**evidence_refs 口径定稿=引用从宽/结论从严**——元素为仓内 id/指针形态不做存在性校验, 结论真实性由 consensus_status 与人工复核承接（细化②）]+do-not-touch :20-21 按行修订；族 2 gates 两校验纯函数（rp 四键形态+≤4096/cs 枚举）+A 面 /write/experience reasoning_path 接线[redact→校验(终值口径)→注入扫描源扩展, soft 不加前缀防破 JSON]；族 3 B 面 host-only /write/experience-consensus[枚举+**superseded 存在性校验**=细化①+SET 单列]+consensus-apply.mjs[dry-run 缺省]+promote 前置信号 v2；族 4 测试 6 例+生产运维序列
关键裁决：**生产迁移走真实路径**（graphd 重启加载新代码=init_schema 幂等+SCHEMA_DEGRADED 16 列校验+新端点生效——在线 ALTER 经 host /query 先行[运行进程内 DDL], 重启承担代码面）；红线①实证=**9 行 14 列逐行比对零破坏**[bak-20261003-1221 快照先行 sha256 双证]；**回填分布=consistent×9/superseded 0**（consensus-apply --apply ok 9/fail 0, 与 v1 审计零分歧一致; reasoning_path 非空 0 行=不伪造历史）；归档 smoke=EXPORT copy.cypher **16 列**+IMPORT 往返行数 9（红线③）；增量核查=GW-2 v2 新面零影响（ALTER 不触 mutation 门/写端点走 /write 分支/verify 链不涉经验写入/CLI host 通道不受 worker 闭集约束）
子 agent 协作（先例 11）：主 agent 自做（生产运维序列为硬结论密集面, 实锚纪律要求亲证）
教训沉淀：**Edit 工具的尾部换行锚点会吞下一行首行**（本批两度: def 行吞 docstring/EXPERIENCE_INJECTION_HIGH 首元素并入元括号行——后者语法合法但丑, ast.parse 均过; 教训=锚点永远不含尾随 \n, 改后 grep+ast 双复查）；kuzu 0.11.3 SUM 不收 BOOL/GROUP BY 别名不支持（核对查询两次才对——roundtrip 核心证据=行数与列数, 分布以生产库直查为准）
开放项：阻断语义留 v3（promote superseded 行仅报告）；illegal 枚举位 v3 产出；panel 消费/评测集耦合维持不做；阶段 8 收官候选（T4-3-3/4）归用户排批

## 2026-10-03 · T4-3-3-0 双签升级前置审计（8-2 只读批+#26 承前+夹具纪律）
底账：HEAD 本批收官（落库后以 git log -1 实测）· 基线 pytest 412 / mocha **1951**（+3 symlink 升级用例）/ panel 88
产出：docs/t4-3-3-plan.md（v1 双签链增量实锚[11 处直写收编目标——plan 记 6 处=HEAD 漂移对账]/T4-3-2 交互结论/**异构语义方案卡**[模型异构主选+8-2a 背景段开关 off+P2P_HETERO_ENFORCE 三档+11 处端点化收编]/禁区比对+按行授权申请三条/拆批方案）+ #26 write-gate symlink realpath 落地（升级判定+3 用例+双头注修订）+ AGENTS 先例 14（夹具纪律）+ dependabot/mods 核查
关键裁决：**experience-consensus 不入双签面**（host-only 数据治理回写无"单一模型自评"风险面——双签保护对象=Finding verdict 裁决信号）；**reasoning_path=8-2a 天然接点但受净室约束**（经验先验≠第一签结论，开关缺省 off 对冲锚定效应）；异构=模型 id 维度最小还原（vendor 强制会把 M3/M2.7 现状判违）；**/bin/sh 真身 symlink 实证**（Ubuntu 下为 dash 链接——#26 升级判定改判 matched=system-path-symlink，deny 语义不变断言收双形态）
教训沉淀：**cat >> 写 tests/ 被 hook 吞且本次无报错回显**（GW-2 教训的静默变体——追加后必须 grep 复核落盘）；**链式 cd 命令的失败伪象**（cd 失败后 grep 吃旧输出报"3 failing"——单命令单目录重跑才是权威计数）
开放项：异构方案等用户确认→T4-3-3 实施（按行授权三条随批申请）；密钥异构独立小批候选；mods 分支（ahead 6=d2d-mods 插件移植，非 dependabot）与 dependabot 四分支（actions 大版本升级，与 HYG-1 改动有 rebase 冲突风险）处置归用户

## 2026-10-03 · PLAN-1 阶段盘点与规划校准（纯文档批；时点实测裁决+roadmap 待执行批次细化）
底账：开工实测 HEAD e63ffb61（七族 5bcbba3…e63ffb6 全在位）· 基线 pytest 412 / mocha 1948（+3 symlink 用例随 T4-3-3-0 在库）/ panel 88（零代码批零改动）
产出：state 底账节五字段偿还（远端 HEAD 行停更两批→e63ffb61/分支行三分支→四+mods/CI 行停 GW-2 v1 时点→三绿 run ID/基线行 406→412[**T4-3-2 批底账漏更=唯一真漂移点**]）+决策账两补记（consensus_status 区分度观察[首个分歧对回看判据]/v3 阻断挂观察双条件）+roadmap **"待执行批次规划"节全量新增**（10 项表格：T4-3-3-0 标 ✅/T4-3-3/T4-3-4 含第四轮冷读验收/EV-2 换挡期已到/恢复演练小批/js catch 146/门禁候选二批/T4-4/T4-5/长期项群——各含范围/依赖/预估/验收草案）
关键裁决：**任务 1 实测推翻提示词时点假设**——提示词按"T4-3-2 后、T4-3-3-0 待发"起草，实测 state 已含 T4-3-3-0 ✅ 段且"当前唯一有效"已单值化（超前提示词两批）；按"以 git 与文件实测为唯一依据"纪律，规划表 T4-3-3-0 标 ✅、下一步单值化维持实测指向（等异构方案确认）而非提示词预期的"备妥待发"——提示词预期与仓内现实的差集即本批对账核心
教训沉淀：**梯队条目与底账节的基线字段是两条独立对账线**（T4-3-2 批更了前者漏了后者——"同批原子对齐"纪律要落到逐节；PLAN-1 型盘点批的价值=抓这类跨批单点漏更）；任务书时点假设过期不是偏差是常态——多批并行推进时"以实测为准"条款是唯一可靠锚
开放项：本批零新增（规划的排期位/触发条件均已入表）；下一步=等异构方案确认 → T4-3-3

## 2026-10-03 · EV-2 端到端实弹评测批（缩批形态：N-0 全锚+就绪度+采集设施；实弹缓行登记）
底账：HEAD 本批收官（落库后以 git log -1 实测）· 基线 pytest 412 / mocha **1955**（+4 采集单测；实测修正 PLAN-1 底账预期 1951——拍板 9 实测为准）/ panel 88
产出：N-0 六项审计全锚（立项卡实锚[五指标 draft+L2/L3 裁决保留+#10 dvwaSession 人工审]/DVWA 就绪交付[容器起+reset 全过]/采集面盘点/**宿主缺口新发现**/ground truth 草案[DVWA oracle 三档+SPA golden-targets]/运行配置定稿[ev2-dvwa-1 隔离+蒸馏不入池+配置透明节]/禁区比对[eng 零触碰双保险]）+ **采集设施** experiments/eval-e2e-collect.mjs（--eng 隔离只读+聚合纯函数+全参数绑定）+单测 4 + docs/eval-run-2-e2e.md（缩批报告+五指标口径定稿+**实弹 runbook §5**）
关键裁决：**调度宿主缺口=前置链断裂点（新发现）**——调度环认领循环在 pentest-dsh/scheduler.js 经 cordis.patch.yml 装载进 dsh web 会话宿主（ARCHITECTURE:8 图队列形态），本机 dsh CLI 在（0.1.5-rc.1+homes 58 实例）但无 attended 启动路径（实例 settings.yaml 无插件引用；历史实弹 eng-0928=用户会话期所跑）——按止损精神**实弹不硬凑不工程化宿主**（超运维动作边界），缩批=审计全锚+DVWA 就绪+采集设施+实弹 runbook，**执行二选一归用户**（①dsh web 会话辅助[runbook §5]②attended 宿主工程化立项 4-3a）；**token 账本无采集设施**（model-usage.jsonl schema 无 token 数字段——零成本配置未落账）→ 五指标之 token 维度降级 worker·时长代理面（拍板 2 缺口径通道，标注"本批补口径"）
教训沉淀：**前置链审计要把"谁在跑"问到进程级**（"四服务就绪"立项卡前置只列了常驻服务，调度宿主是会话形态不在服务清单——立项卡前置清单缺项被 N-0 抓出）；脚本顶层副作用必须入口守卫（import 即跑主流程曾使单测无法安全 import——wmpf/match-site 规范形先例第 4 次复用）
开放项：实弹执行二选一归用户；token 数采集工程归后续；SPA 第二靶（spa-start.sh 可用）随实弹批一并；裁决清单模板已备待实弹后产出

## 2026-10-03 · T4-3-3 双签升级实施批（8-2：异构强制+材料增强+dual_sign 转态收编；方案=t4-3-3-plan §二用户已确认）
底账：HEAD 本批收官（落库后以 git log -1 实测）· 基线 pytest **414**（+2: 迁移表全表+端点 B 面九态）/ mocha **1967**（+12: 异构三档 4+背景段双态 5+逐字回归 3）/ panel 88（零回归；v1 双签链既有用例全在位仅断言观测面随收编改形）
产出：族①异构强制（heteroGuardedBackup 三档接线 resolveBackup 两读取处+启动检查；resolveModel 经 ctx 解构取得——scheduler.js 零改动）+族②材料增强（dualExpBrief 两处 dualFocus 接线+prompt-maxlens 三键 800/200/100）+族③graphd 端点（/write/dual-sign-transition host-only+DUAL_SIGN_TRANSITIONS 迁移表纯函数）+族④11 处收编（dualSignTransition 助手替代 q() 直写，fake 端点路由+断言观测面改形 {id,to}）+docs 四件（state/roadmap[长期项群补 attended 宿主工程化行]/devlog/do-not-touch 唯一写通道纪律）
关键裁决：**迁移表按 11 处实测全边集实现而非方案卡三段式草图**——:514 是 blocked→pending 解冻边（0915 B1 先例「backup 恢复存活自动重派」）、:282 是 ''→blocked 直达、:335/:339/:467/:484 是降级 single——草图若照搬会拒掉 8/11 个真实调用点，违背「收编=机制变更非语义变更」红线；**signed/disputed 才是真终态，blocked=可解冻挂起态**（对账表显式登记偏离）；**CAS 移植端点后 claimed 语义精化**：仅 cur=='pending'→to=='pending' 返 claimed:false（表判定先行，blocked→pending 解冻边不受影响）；**strict 判定 primary 不可解析也按拒配**（无法证明异构=fail-closed；backup 空不走判定走既有降级路径）；**截断定值依据（细化②）**：段总预算 800=净室材料档 gatesDualFocus 1200 的 2/3（背景段是辅助先验，不得压过原始材料注意力）/行级 reasoning_path 200=对齐 gatesExperienceRecipe 200 百位级摘要档先例/标题 100（标题非正文，宽截断防悬挂）/行数 5=LIMIT 防枚举无界——三值入 prompt-maxlens 单表（锁面测试同步 24→27 键）而非硬编码；**EV-2 缩批先例确认**（提示词「EV-2b 回填批另行触发与本批无依赖」与仓内登记一致，本批零依赖 EV-2 产物）
子 agent 协作（先例 11）：主 agent 自做（11 处逐字回归是硬结论密集面；commit 拆族经 W1/W2/W3 三轮小工作流 world.run 通道落库——**同文件跨族（gates.mjs ①②④三改）无法按路径拆 commit，改为「每族完成即落一族」的序贯小工作流**，交互式 Bash commit 被 Mimosa git-gate 拦截为预期行为）
教训沉淀：**fake graphd 的端点收编必须与源码同批改**（fake 只认 /query Cypher 形态，源码改走 /write/dual-sign-transition 后若 fake 不加路由会静默落入兜底分支——pending 测试以「CAS 零命中」假象失败而非报错，靠端点路由先行仿真排除）；**spawn 观测要防 R4c 补写晚落账的 stale spawn**（上一用例的零写入补写会把旧简报落进下一用例窗口——用例间以唯一 finding id 定位目标 spawn）；**整条 focus 下游过 sanitizeUntrusted 是既有行为**（分号含全角均转义 &#59;——测试断言取无分号子串，不改源码转义语义）
开放项：密钥异构独立小批候选（本批不做）；409/404 失败路径新增日志形态（簿记(x): dual-sign-transition ...——机制直调失败的诊断面，v1 无此形态因 q() 失败同被吞）；single→pending 白名单边现无写侧（方案卡预留，未来重开双签场景）

## 2026-10-03 · T4-3-4 阶段 8 收官批（8-2d 缩编+8-4 L1 只读视图+verified 撤除+盘点+tag t4-3-stage8+冷读包）
底账：HEAD 本批收官（落库后以 git log -1 实测）· 基线 pytest 414 / mocha **1971**（+4 stability-view）/ panel 88（零回归）
产出：**8-2d 缩编登记**（stage8-closeout §二——roadmap:56 全仓唯一表述零形态+原设想撞 approvals 禁区+N-of-M 放弃决策账冲突+disputed 机器消费面零；机器化调和归 L2/未来批，触发=真实 disputed 积压可由 L1 视图量化）+ **8-4 L1 只读稳定视图** scripts/ops/stability-view.mjs（runLog 尾窗 ≤20 eng×2000 行+AgentIdentity exit_class/status=error+Finding dual_sign 挂起面；graph 不可达降级 runLog 单源；纯聚合函数 export+入口守卫先例 14 规范形+graph-stats-probe 只读先例同构）+单测 4+**verified 纪律撤除**（决策账撤条：31+41 双绿[拍板口径 33 为 GW-2 静态计数，时点漂移+8 如实记录]+逐批 CI 链+零 revert+flaky 非误伤）+收官盘点 stage8-closeout.md（全项对账+指标汇总 t3-3-stage65..HEAD 70+ commit/基线 394→414·1944→1967）+冷读材料包 coldread-4-briefing.md（行话首现即解释+新落地面六项+老面复检四项）+面板假阳性裁决闭环评估卡（与 #18 合并建议）+t4-3-3-plan 草图勘误（blocked 非终态）+world.run 脚本归属定性（宿主引擎自管理产物——.zcode 自 ignore 不入库，引擎加固注记登记）
关键裁决：**8-2d 缩编是审计结论而非偷懒**（四依据全仓内实测可复现；t4-3-plan:71 预置降级路径即"定义缺失→缩为 L1+收官件"——本批正是走该分支）；**8-4 L1 不新增 graphd 端点**（graphd 零改动=授权面最小，scripts 只读查询面+图内既有列即可覆盖全部信号源——补埋点=改 scheduler 禁区，止损规则禁止）；**tag 触发口径实测**（gates/dsh-compat 的 push.branches:['**'] 不含 tag refs——CI 绿以分支 push 为准，tag push 仅 ci.yml 再跑；回报注明）；**底账节自相对化**（远端 HEAD 行改挂 tag 名 `git rev-parse t4-3-stage8` 实测——收官批不再打二次顺延小笔，T4-3-3 的 W4 教训制度化）
教训沉淀：**mocha 动态 import 与静态 import 路径要分别核对**（同文件两处 import 改了一处漏一处——ERR_MODULE_NOT_FOUND 定位到 :76 才抓出第二处）；**跨目录脚本 import 用三级上跳**（plugin/pentest-dsh/test/ → ../../../scripts/，eval-e2e-collect 先例同构但路径深度不同）
开放项：机器化调和（L2/未来批，触发=disputed 积压）；人工裁决回灌批（面板假阳性×#18 合并评估卡）；第四轮冷读评审归用户执行；world.run 脚本引擎加固注记（宿主侧）；EV-2b 实弹回填挂用户

## 2026-10-04 · RECOV-1 存储恢复演练+LadybugDB DDL 冒烟（roadmap #5 触发=阶段 8 收官 tag；零生产代码改动批）
底账：HEAD 本批收官（落库后以 git ls-remote 实测）· 基线 pytest 414 / mocha 1971 / panel 88（零代码批零改动）
产出：**三段演练**（①EXPORT 4.27s/4.2MB→IMPORT 7.06s→12 节点+6 边表逐表行数双面比对全等+Experience 16 列序齐+存量行 reasoning_path=''/consensus_status='consistent' 保真；②DEFAULT 丢失语义复现[IMPORT 库新行=NULL]+三候选定谳[ALTER 重放无效=already has property 拒绝/init_schema 全吞幂等但不修复/运维回填两条 UPDATE=标准处置 0.157s 实测]+读侧三值逻辑等价论证[NULL<>''=NULL 行被 WHERE 排除与 '' 同效]；③独立实例 :8799 重开秒级+SCHEMA_DEGRADED 空[16 列完整识别]+三条代表查询计数与源一致）+**LadybugDB 0.21.2 首实测**（PyPI ladybug 官方 index 获取[镜像无此包]MIT+cp314 匹配本机 3.14；schema.py 全量 18 DDL 零报错+init_schema 零抛出+DEFAULT 语义保真[CREATE 缺省=''与 kuzu 新库同形]+**kuzu EXPORT 包直接 IMPORT 成功** 8.97s 六主表全等+IN 字面量/参数绑定两形态通）+runbook-storage §六恢复规程（步骤/计时/坑位/DEFAULT 处置/重开序）§七 B 预案数据点+docs/ladybug-ddl-smoke.md+state/roadmap 回填
关键裁决：**DEFAULT 丢失标准处置=运维回填而非代码修复**（写入方显式带 consensus_status 需改生产 CREATE 列集→按本批红线登记拆批候选不实施；运维 UPDATE 回填零代码改动且实测 0.157s——两层落法：规程层立即回填+代码层拆批根除）；**生产零写边界再确认**（EXPORT=读库写导出目录语义实证于 runbook 1.1 既有注释+本批实测；演练实例与生产实例端口 8799/8766·DB 路径 /tmp·token 三独立，flock 按 DB 路径隔离实测同机并存）；**LadybugDB 包名坑**（PyPI 正确包名=ladybug 而非 ladybugdb/ladybug-db，镜像源无此包须官方 index——同名词的环境设计库是无关项目，认准 Summary/Home-page 元数据）
教训沉淀：**bash 写文件带 \n 再读要用 strip**（/tmp/recov1-dir.txt 的换行进路径使 FileNotFoundError——一次性脚本也要防自造脏数据）；**IMPORT 语法与时点**（kuzu 0.11.3 空库打开后 IMPORT DATABASE '<dir>' 直接可用，T4-3-2 往返先例的语法本批复用零调整）
开放项：写入方显式带 consensus_status（拆批候选）；LadybugDB 宿主集成面/长稳/性能基线（迁移启动批范畴）；演练 /tmp 产物复盘后清理

## 2026-10-04 · LBD-1 存储迁移预演批（LadybugDB 切换就绪评估+dependabot 收编；决策建议=HOLD）
底账：HEAD 本批收官（落库后以 git ls-remote 实测）· 基线 pytest 414 / mocha 1971 / panel 88（缺省态零回归）
产出：**第 0 族 dependabot 四分支收编**（checkout v4→v7×6/setup-node v4→v7×4/setup-python v5→v7×2/codeql v3→v4×2——三 yml 双 v7 冲突手解：HYG-1 钉版行 node24/python3.12 与 dependabot uses 行相邻冲突, 解=uses 取 v7+钉版行保留; 四 merge 链入库）+**引擎开关**（graphd/app.py import 层 P2P_GRAPH_ENGINE 条件化一处——下游 kuzu.Database/Connection 调用零改动; ladybug==0.21.2 入 requirements+镜像/包名/真伪供应链注记; kuzu 依赖保留理由=bak 恢复+pytest 测试轨）+**兼容差异清单**（阻断级 1: 进程内多 Database 反复建销→Segfault——pytest 每测试建销形态触发, 隔离单测全绿+同进程累积崩+崩溃点 gates 套件第 9 测附近; h18 reset RuntimeError 同根; 无影响=execute/get_next/has_next/table_info/标量与列表绑定/IN 两形态/宽泛异常捕获）+**预演三轨诚实记录**（pytest 缺省态 414 全绿=开关零回归/ladybug 进程内不可达/mocha 1971+panel 88 引擎无关全绿/预演实例 :8799 单实例功能面全通）+**性能对比六项 0.82~1.22x 无红线**（gates_pending_scan ladybug 快 18%; 同数据=同一生产快照双实例对跑）+**soak 60min 达标**（709 轮×4 查询 2836 成功 0 错误/RSS 150.4→157.4MB 趋平/线程 9 句柄 6 恒定）+**切换 runbook §八**（停写窗口六步+回滚=原库零写保留+观察期+kuzu 退役时机顺延）+决策建议 **HOLD**（测试基建断裂+上游多实例未决两硬证据; 引擎分轨方案归用户裁决）+mods 定性=研究资产挂起+token 采集销账归 mods 移植
关键裁决：**"三轨全绿指向预演实例"拍板目标未全达=合法结局**（边界条款"不达标=不切换只登记"正中——预演的价值恰是发现 pytest 形态与生产形态的引擎负载剖面差异: 多实例建销崩溃 vs 单实例长跑稳定; 诚实记录而非降格断言）；**性能对比方法论**（同数据约束=RECOV-1 同一导出包分别承载于 kuzu 生产实例与 ladybug 预演实例——排除了数据量/分布混淆; 5 轮取中位抗抖动）；**HOLD 而非 NO**（已达标面全备齐: 性能/单实例稳/DEFAULT/许可/迁移路径——两条硬证据都是"测试基建+上游"类可解项, 用户接受引擎分轨即可切）
教训沉淀：**Mimosa git-gate 拦 commit 时回滚暂存**（deny=reset——T4-3-3 W5"暂存卸载怪象"根因实锤; 工作流内 add→commit 同通道执行即免疫, 交互通道被拦后须重新 add）；**merge 冲突的内容级收编**（codeql 分支 merge 从未启动但其两行改动已手编入工作树随 setup-python merge commit 入库——四支收编按内容级验收而非 merge commit 数）
开放项：LBD-2 归用户裁决（引擎分轨方案）；上游多实例 Segfault 跟踪（修复→pytest 切回 ladybug 轨→kuzu 退役重启）；写入方显式带 consensus_status 拆批候选；/tmp 预演产物清理
