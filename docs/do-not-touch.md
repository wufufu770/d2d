# 绝不碰清单（活文档，批次收尾核对更新；改动需显式授权并记录）

> 红线文档。任何批次实施前必读。本清单每批收尾时增删，新增禁碰项须注明
> 来源批次；解除禁碰须用户显式授权（4-3a 先例：显式例外按行申请）。

## 清单
| 对象 | 禁碰原因 |
|------|----------|
| adapter egress 强制块 | 凭证强制注入面 |
| app.py slowloris + 信号量 | 并发保护核心 |
| failover QUOTA_RE + 备用模型语义 | 熔断语义 |
| scheduler.js 禁区区间 [570,618]（删除行=0） | brief 组装序整体（头注释 scheduler.js:14 自证） |
| scheduler.js:589-594 | Gate-P 拒绝回收区（unclaim + identity reset；素材原标「join 序」经 HD-1 核实修正） |
| scheduler.js:596-597 | 简报保险丝丢弃序注释（applyBriefBudget 裁剪序） |
| scheduler.js:607-630 + buildAgentStatus（:791+ 文件末尾） | 2C agent_status 区（派发快照+taskWithStatus+experience_ref 注入） |
| scheduler.js:603 | linkContext .slice(0,800) 显式例外先例（4-3a 保留） |
| gates.py redact_pii 8 类 | 脱敏语义 |
| report.mjs 三校验点 | 3E 已落地 |
| graphd 八态机 / actor+reason / host-only 认证 | 4-8 已落地 |
| Experience 表结构（**16 列**——T4-3-2 按 4-3a 授权链[T4-3-0 拍板⑥+T4-3-2-0 审计+用户 schema 确认]新增 reasoning_path/consensus_status 两列；既有 14 列语义零改动，权威定义 docs/experience-consensus-schema.md） | 3.5-1 已落地+T4-3-2 增列 |
| /write/experience（可选字段 reasoning_path 扩展——既有校验链零删改）、/query/experience（读侧回传 +2 列） | 3.5-1 已落地+T4-3-2 扩展 |
| /write/experience-consensus（host-only 共识回写端点——枚举白名单+superseded 存在性校验+SET 单列） | T4-3-2 已落地 |
| /write/experience-transition | 3.5-4 已落地 |
| 离线蒸馏管道 | 3.5-2 已落地 |
| 经验检索 + 注入 | 3.5-3 已落地 |
| 安全层 | 3.5-4 已落地 |
| lease-cas-watchdog 用例逻辑与断言 | timing flaky 观察中 |
| experiments/ 目录 | 3.5-5b 已落地 |
| Frontier 表其他字段 | 3.6-1/2/3 已落地 |
| /write/frontier 其他逻辑 | 3.6-2/3 已落地 |
| /write/frontier-transition | 3.6-1 已落地 |
| frontier-review.mjs | 3.6-3 已落地 |
| FRONTIER_VALUE_WEIGHTS 公式 | 3.6-3 已落地 |
| C 组 8 文件 | 需明确授权 |
| 2B checklist 文件 | 已落地 |
| 3A-3E 已落地代码 | 已落地 |
| 4-1/4-2/4-3a/b/c/d/4-4 已落地代码 | 已落地 |
| T0-C-2 / 合并工作流第二层 / T0-C 缺口③ | 已落地 |
| T1-2/3/4/6/7/8/9 | 已落地 |
| T2-1 / T2-2a / T2-2b-0/1/2/3/4 | 已落地 |
| evidence-crypto.mjs / cdp-proxy.mjs / har-capture.mjs | 已落地 |
| 4-4 handler 原语层 | 已落地 |
| checkBash 契约本体 | 已落地 |
| Mimosa L3 门既有拦截项 | 存量账目 |
| approvals.mjs / tier-approval.mjs 浏览器⓪支（approvals.mjs:74-77 词表+116-121 isBrowserStateChange；tier-approval.mjs:79-82 镜像，均实锚） | T2-2b-4 已落地 |
| scripts/browser/ 四文件（cdp-client/form-fuzzer/logic-tester/race-condition） | T2-2b-4 已落地 |
| scheduler.js BG-2 业务闸注入行（:621-625 区新增 5 行, 禁区 [570,618] 之外） | BG-2 已落地 |
| scheduler/loop.mjs 深环业务闸检查块（allocateOnce scope 过滤后 13 行） | BG-2 已落地 |
| scheduler/business-gate.mjs 编排文件 | BG-2 已落地 |
| domain/skill-schema.mjs（skill Schema+结构门纯函数） | T3-2-2 已落地 |
| scripts/brain/skill-promote.mjs（skill 三门晋级通道） | T3-2-2 已落地 |
| scripts/brain/skill-distill.mjs（skill 抽取管道） | T3-2-2 已落地 |
| experience-ref.mjs 角色过滤编排 buildExperienceRefFiltered（文件末尾纯新增） | T3-2-2b 已落地 |
| scheduler.js 角色过滤覆盖行（taskFull 前，EI×RF 双开关前置） | T3-2-2b 已落地 |
| tests/golden-targets/spa-attack-acceptance.md 验收结论 | T2-2b-4 已落地 |
| domain/sanitize-ingest.mjs（消毒链编排本体：链序/HIGH 镜像词面/fail-closed 语义） | T3-2-4 已落地 |
| scripts/mcp/d2d-mcp-server.mjs（对外只读 server：工具白名单+isReadOnlyCypher 预检+审计面） | T3-2-4 已落地 |
| domain/mcp-discovery.mjs（endpoint host 校验 fail-closed 面 + 响应强制过链） | T3-2-4 已落地 |
| config/mcp-servers.json 边界语义（配置即边界；缺省空清单=零注册安全态） | T3-2-4 已落地 |
| scheduler/supervisor-tools.mjs（环内 supervisor：scope 严格子集判定+递归深度=1 双通道+cap 预检+治理门挂载） | T3-2-5 已落地 |
| docs/devlog.md 追加式纪律（历史节只增不改；勘误以新节补记；state.md=快照可覆盖） | T3-2-5 已落地 |
| scheduler/idle-tasks.mjs（闲时任务框架：预检硬门+自适应频率+失败降级；**调度环核心 tick→allocateOnce→planAllocation→runWorker 零改动为 T3-2-6 唯一新增硬边界**） | T3-2-6 已落地 |
| plugin/d2d-panel viz 面（lib/client/view.viz.js 三图组件+lib/host/snapshot.mjs buildStarmap/Coverage/HypLane+index.mjs viz 四路由；**graphd 全域零改动零新增 endpoint 为 T3-3-1 硬边界**——数据全走既有 /query host-token 通道；wire 不带 evidence 全文） | T3-3-1 已落地 |
| domain/auth-contract.mjs（授权契约套件：一体签名+六失败面归并三态+seen-auth 记忆；**「验签失败不放行」为 T3-3-3 全局纪律**——invalid/expired 恒拒不随灰度；挂接点四处置=启动/工具/bash 门/egress 纯新增） | T3-3-3 已落地 |
| scripts/ops/graph-stats-probe.mjs（图规模只读探针：全 cypher 字面量零拼接+只读 /query+500MB 告警线；**源库零写/URL 代码内常量/token 不回显为其安全语义**——改动须保该语义并随批 smoke） | T4-2b 已落地 |
| graphd worker /query 门三面（WORKER_FULLSCAN_RE 闭集自 schema.NODE_TABLES 单一来源生成+_WORKER_FULLSCAN_EXEMPT 仅 ExperienceWeight[briefs 活调用点锁定]+谓词内容锚 Engagement 严格锚/一般表选择性规则+无标签拒；**改动须同步 callsite 样本库 31 用例与 briefs 误伤面对照**） | GW-2 v2 已落地 |
| Gate-V 锚存在性 seam（setGateVAnchorLookup 注册契约：req_id×2+marker 须命中本 run 记录；high/critical 未注册即拒——**签名零变更红线产物，gateV 形参恒不变**）+ 跨类双锚同链要求 | GW-2 v2 已落地 |
| 工具门 STRICT 面（P2P_TOOL_GATE_STRICT 语义=off 高危档 fail-closed 拒；缺省 off=allow 维持 4-4 拍板；STRICT_HIGH_RISK_TOOLS 集合关系=进门集全 7 名） | GW-2 v2 已落地 |

T4-2b 新增运维边界：存储归档/钉扎产物一律仓库外（DATA_DIR/backups/storage-archive/，
含 3 份滚动物理快照与 wheel pin——见 docs/runbook-storage.md）；**"源库零写"为存储
运维全局纪律**（任何写 kuzu_db 的运维动作须停下回报）。

T3-1 新增：无（四子项零侵入落地）。HD-1 新增：无（纯文档批）。
T3-2-4 新增全局纪律：**外部数据不过 sanitize-ingest 链不入图** —— 任何新的外部
入图面（MCP/OSINT/未来扩源）必须过 sanitizeIngestExternal 全链（collect.mjs osint
回补为先例，源码断言防死代码），见 docs/mcp-security-design.md §2/§5。
T3-2-5 澄清（边界裁决沉淀）：环内子 Agent 是**进程内受控实体**（同 scope 门治理），
不走 sanitize-ingest external 消毒链——那是外部数据纪律；两道防线定性区隔，
不混淆不互借。

## 28H+9M 存量项
- 含义：Mimosa L3 门预提交扫描的存量高危/中危项，历史遗留非新引入
- 位置：tests/test_graphd_gates.py 注入 fixture（T3-1 实锚 :1524/1525/1635/1814 等
  SQL 注入/SSRF 高危行）+ validator.js:334 extractCurlArgs curl 黑名单防线区
- 处理口径：实施员 commit 被拦 → 变更就绪、移交提交 → 工作流 world.run
  通道落 commit（既有成功形态，非绕过）；绝不 --no-verify；存量零触碰
