# 门覆盖缺口登记（4-3 输入）

> 来源：4-2-0 前置审计（dwfrun-d838b762）· 静态核验口径

- 定位：d2d 阶段 4-2 路线 A 文档 5/5。登记 4-2-0 前置审计确认的门覆盖缺口，作为 4-3（门实现）的输入清单。纯登记，零代码。
- 工具档位与门覆盖现状的逐工具明细见 docs/tool-risk-rating.md；接入缝位见 docs/routing-integration-points.md。

## 三条主缺口（用户拍板）

| # | 缺口 | 风险 | 现状 | 建议落点 |
|---|---|---|---|---|
| ① | write/edit 任意路径写无门 | **高** | danger-full-access 下无 workspace 根限制——`dsh-tool-fs/lib/index.js:597`（write）/ `:742`（edit）任意路径写，无任何 d2d 门拦截 | 4-3 或 4-4 |
| ② | web_fetch / web_search 直连不吃 http_proxy env | **高** | 绕过 V-08 egress-gateway 注入路径（Node 侧进程内直连：`dsh-tool-web/lib/index.js:737`（web_fetch 注册）/ `:262`（web_search 注册），后者 API key env 处理在 `dsh-web-search-deepseek/lib/index.js:243`）；宿主层仅『公网 HTTP(S)+地址 pinning』注释且未逐行验证 | 4-3 |
| ③ | 41 工具中只有 bash 过 checkBash 链 | **中** | checkBash/PreToolDecision 统一运行时门链仅覆盖 bash（`scheduler.js:148-165` 唯一接入，已核验）；其余 40 工具均不在门链上，其中仅 3 处存在**个体级软约束**（非门）：burp_repeater / burp_intruder 的 gateEgress 工具体内组合门（`tools/gate.mjs:59-86`）、p2p_graph 的体内 isReadOnlyCypher 双口径校验（不过 checkBash）、propose_direction 的 graphd 认证 + 会话额度 3（`frontier.mjs:48` `FRONTIER_PROPOSAL_CAP = 3`）——而 write/edit（任意路径写）与 web_fetch / web_search（Node 直连出网）等中高档副作用面**完全无门** | 4-3 |

## 附录：7 条次级 gap（审计全量）

| # | gap | 审计锚点 |
|---|---|---|
| 1 | parseToolPolicyCfg 白名单丢弃未知字段——配置加 `risk` 字段会被静默丢弃（分档配置无现成载体） | `plugin/pentest-dsh/domain/tool-policy.mjs:87-111` |
| 2 | 处置映射缺失——现仅 deny / 放行两态，无中低档处置（rewrite/降档/免批）落点 | tool-policy 与 checkBash 契约均为 deny-only 文本匹配 |
| 3 | 审批接口缺失——deny-only 端到端，`ask` 态在宿主 0 组合（`allowed-once` grep 0 命中），无服务时 ask 降级 deny | `lib/types/index.d.ts:414-426` / `:31`；见 docs/routing-integration-points.md |
| 4 | 无误报模式表——error-fingerprints 为唯一热更表先例（外置 JSON + mtime 缓存 + 白名单解析 + 失败回退） | 4-2 已定义表结构与种子：docs/false-positive-schema.md；运行时消费未实施（零代码批次） |
| 5 | ACTIVE/PASSIVE/限速/兜底四表互不对齐——无统一 per-tool profile，四套纪律各管一段 | 对应 tool-policy 限速熔断、gateEgress 限速、headless profile 兜底（`~/.dsh/profiles/headless/cordis.patch.yml:58-64`）三处分散定义 |
| 6 | 熔断失败口径 = 门拒绝次数而非真实执行结果——门放行即记成功清零，命令实际失败不进账 | `plugin/pentest-dsh/domain/tool-policy.mjs:4-6`（deny-only 契约下门层面唯一可观测信号） |
| 7 | 审计日志无 risk/tier 维度——scope-gate-eng / burp-audit / gate-log.md 均不含工具档位字段，事后无法按档位对账 | `scheduler.js:148-165`（scope-gate-eng）、`tools/gate.mjs:59-86`（burp-gate 审计）、gate-log.md（运行时审计 trail，`scheduler/gates.mjs:22` 落盘，非仓库文档） |

## 处置建议汇总

- 主缺口 ①② 落 4-3（写门 + Node 原生出网单独策略，见 docs/tool-risk-rating.md『出网通道两类』）；① 亦可由 4-4 以审批层兜底。
- 主缺口 ③ 的机制前提（事件层对全部工具派发、listener 自过滤可扩展）已由 docs/routing-integration-points.md 锚定；但审批两态约束（附录 gap 2/3）不解决，扩展后仍只有 deny/放行。
- 次级 gap 1（risk 字段被丢）是『把档位表外置进 tool-policy 配置』路线的直接阻塞项——档位表宜按 docs/false-positive-schema.md 同款外置热载表形态独立成表，而非塞进 parseToolPolicyCfg。
- 附录 gap 7 与 docs/tier-depth-mapping.md 的档位词表对齐后即可修复（审计行补 risk/tier 字段）。

## T1-3-2 4-3c 甲方案：call-site 语义决策记录（6 处不可修点，只决策零改动）

> 来源：T1-3-2 call-site 重钉审计（12 处，era→现行；主漂移=其中 4 处已被 0913/0917 批次修复）。可修 6 处中：index.js 镜像读侧凭据收敛已按『行为等价止损线』实施；**briefs.mjs 两处（:63/:64 教学查询 eng 谓词）曾实施后经白名单裁定越界（白名单外改动既有文件）、已 git checkout 撤销（git diff vs HEAD=0），本批维持 HEAD 现状，待重新归属批次实施**；planner/loop×2/starmap 4 处经核实已修复，零改动。以下 6 处按审计建议保留现状，归档语义依据。

| # | 位置 | 决策 | 语义依据 |
|---|---|---|---|
| 7 | scheduler.js:378 `creditRows`（ExperienceWeight `card:` 战果回流，注入 runWorker 模型简报知识检索得分贝叶斯加权） | **保留全局，不补 eng** | 审计重钉所指『index.js 模型运行时生成』在现行 index.js 无独立实锚（q() 仅 4 处：p2p_graph/p2p_eng resume/p2p_eng stop/burp q 透传），最贴合同描述即本处。知识卡跨 eng 共享是文档化设计（经验先验全局，planner.js:9 同口径自证）；host 侧调度器服务消费，甲方案后模型直接读图已受 worker_query_allowed 约束，简报生成是 host 侧行为不受影响 |
| 8 | digest.mjs:23（era:23 全局统计段查询） | **无动作** | 0909 修复(3) 已给全部段查询加条件 eng（:13-15 engClause/engAnd/engParams，:19-32 逐段），era 行号即现行 :23 `MATCH (e:Endpoint)${engClause('e')}`；engName 空时保持原查询是 :12 文档化回退（无活跃 engagement 的裸调用） |
| 9 | experience.mjs:208 `harvest()` succ（CONFIRMS→Signal_ 全图 LIMIT 20） | **保留全局** | 消费方 = host 侧 /pentest-harvest（index.js sched.harvest()）经验沉淀服务；经验先验跨 eng 共享为文档化设计（同 #7），按 eng 切分会把经验库坍缩成每项目孤岛 |
| 10 | experience.mjs:215 `confirmed`（:214 `fails` 同形态） | **保留全局** | 同 #9：succ/fails/confirmed 三源对照判定经验 wins/fails，必须同口径全图，单源切 eng 会产生 succ/confirmed 判定错位 |
| 11 | state.mjs:96 `engagementsSummary()` byEng | **保留跨 eng（功能本体）** | `RETURN f.eng AS eng, ... count(f)` 本身按 eng GROUP，跨 eng 是 W5 多项目总览的功能本体（p2p_status/面板同源，host 侧消费）；加 WHERE f.eng 反而使总览退化为单项目视图 |
| 12 | scheduler.js:438 `nodeCount()`（:433-442 nodesBefore） | **保留原样（禁区，零改动）** | 实锚语义与 ask 标注（『面板漏斗』）不符：这是 R4c 零写入防线派发前快照（Finding/Signal_/Endpoint/Hypothesis 四表全图计数，终态比对判『零写入』），host 侧调度器合规检查消费。只数本 eng 会漏判零写（worker 把战果写到别家 eng 也是零写入失败面）；跨 eng 计数是语义本体 |

**镜像收敛附带说明（可修点 6 之决策细节）**：index.js p2p_graph 动态 Cypher 无法静态内联 f.eng 谓词，甲方案实施为读侧凭据收敛——镜像改持 worker token 直连 /query，graphd `worker_query_allowed` 的跨 eng 全表扫禁（gd/gates.py WORKER_FULLSCAN_RE）成为权威 eng 隔离；host 会话其余路径（sched.q：合规快照/面板漏斗/经验库写/burp q 透传）保留 host token 不变。凭据全部缺失时不回退 host token（401 fail-closed，不静默重开跨 eng 读面）。
