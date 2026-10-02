# d2d 当前状态（活文档，每批收尾必更新）

> 本文件是项目唯一状态真相源。批次回报的「状态文档更新」节执行更新。
> 以下底账时点：T3-3-2 收官（tag `t3-3-stage65` / `8aa8f60`）；本批文档校准后
> HEAD 顺延，以 `git log -1` 实测为准。

## 当前底账
- 远端 HEAD：T3-3-2 收官族末 commit `8aa8f60`（收官 tag `t3-3-stage65`；
  落库后以 `git log -1` 实测为准）
- 分支：main 唯一活跃（实测 1 个远端分支；T4-5 的老基线分支清理已提前执行，
  回滚点改由 tag 保留：control-v1~v3 / honest-baseline / pre-team-arch / archive/*）
- 工作树：0 改动
- CI：三 workflow（ci/dsh-compat/gates）全绿（T3-3-2 收官 run 以 gh 实测为准；
  HEAD 8 个 check-run 全 success）
- 测试基线（T3-3-2 固化）：pytest **368**（口径 = `pytest tests/` 全目录 6 个
  test_*.py 合计；单跑 test_graphd_gates.py 仅 298 例，差额 70 例来自
  test_audit_alert / test_gate_anchor / test_injection_sampling / test_repairability /
  test_transition_log——此前这 5 个文件不在 ci.yml 与 gates.yml 执行范围内，
  本批起两处均改跑全目录 `tests/`）/ mocha **1896** / panel **88**
- stack：graphd :8766 ✅ / egress :8888 ✅（MITM 启用）/ oast :8890 ✅ /
  cdp-proxy :8893 ✅ 常驻 enable / dsh web :8899 按需（HD-1 审计时点未起）；
  SPA/DVWA 靶场就绪
- 模型：五角色统一 primary=MiniMax-M3 / backup=MiniMax-M2.7
  （`~/.d2d-data/config/model-policies.json`，DATA_DIR 外置配置；仓库内无此文件）；
  backup 留空=到限暂停+通知，绝不盲换

## 梯队状态
T0 ✅ / T1 ✅ / T1.x 实战 ✅ / T2-1 ✅ / T2-2a ✅ / T2-2b-0~4 ✅ /
T3-1 ✅（四子项全落地：Schema 校验 260 张全过 / A-MemGuard 共识 v1 离线路径 /
misses 月度聚合 / 度量框架蒸馏+注入实效落地、检索有效性设计就绪）/
HD-1 ✅（文档体系）/ BG-1 ✅ + BG-2 ✅（业务闸全线收官：scheduler 集成上线,
coverage_bias 死代码接线补完 T2-2a, 验收 docs/business-gate-acceptance.md）/
T3-2-0 ✅（阶段 6 前置审计七项 + 拆批方案 docs/stage6-batch-plan.md：
T3-2-1 联网扩源 → T3-2-2 经验技能 ∥ T3-2-3 插件打包 → T3-2-4 双向 MCP →
T3-2-5 supervisor → T3-2-6 闲时路由；6-6 本体与 graphd 架构冲突→重议降级）/
T3-2-1 ✅（联网扩源：osintGet 网关化+Hackertarget 免费层+osint-subdomain Signal，
验收 smoke 实证）/ T3-2-2 ✅ + T3-2-2b ✅（**6-1 经验→技能整项全清**：skill 存储+三门通道
+抽取管道+示例 2 张+domain 补齐+角色过滤接线[P2P_ROLE_FILTER 回退开关, 三实质 diff
+59/-0 实证]）/ T3-2-3 ✅（插件打包：三攻击工具 dsh 注册+基线 regen 收编 js_scan
[开放项 8/13 销账]+五形态导出框架[Tool/Skill 实质, 其余声明]+Burp 通用 XML 导出[降级登记]）/
T3-2-4 ✅（**6-5 双向 MCP 整项落地**：sanitize-ingest 统一消毒编排[osint 回补实战接线]+
对外只读 stdio server[原生 JSON-RPC 零 SDK+只读双保险+审计留痕]+对内配置驱动发现
[host 校验 fail-closed+探针降级]+MCP 导出条目 skeleton→实质；四安全底线全落地，
设计定稿 docs/mcp-security-design.md）/
T3-2-5 ✅（**6-4 环内 supervisor 落地[worker 工具形态]**：delegate_subtask 工具
[ctx.agents.create 只调用不修改/scope 严格子集机器判定/递归深度=1 结构性双通道/
subagent-cap 既有账本硬顶预检/治理门继承 checkBash+post-execute 镜像/审计三事件+
Signal(subagent-result) 回流]+devlog.md 历史回填[T0→本批逐批节, 三锚点核对]；
零禁区实证：adapter 两文件/scheduler.js/loop.mjs/审批面本体零触碰；调度环自动创建
切片明确出批[实战后另批 4-3a]；开发轨迹 docs/devlog.md 自本批起只追加）/
**T3-2-6 ✅ 阶段 6 收官**（闲时任务框架[watchdog 同构外挂：预检硬门 active-eng+in-flight
fail-closed+setTimeout 链自适应频率 60min→10min+失败退避进程隔离；P2P_IDLE_TASKS=0 可关]，
首批两任务=既有 CLI[skill-distill 补跑/misses-report]；能力路由行为快照锁定[实测无真实
缺口，短词精化挂开放项]；调度环核心零触碰为唯一新增硬边界；终态盘点 docs/stage6-finale.md；
tag t3-2-stage6）/
T3-3-0 ✅（**6.5 前置审计+拆批方案**[只读批]：docs/t3-3-plan.md——四图数据全可查
[既有 /query 通道零新增 endpoint]/授权数字化 ed25519 零依赖实测通过无阻断/8.5 定级
[看板并入/变异缩水/评测半自动]/3 实施批建议；**子 agent 并行派发首例**[4 派 1 自做，
硬结论四条复证全过]；**等用户拍板 §7 后进 T3-3-1**）
下一步建议（历史·T3-3-0 时点，已完成）：**等用户对 docs/t3-3-plan.md §7 五个拍板点拍板** → T3-3-1 可视化数据面+三图
（拍板前 T4-2 存储/T4-3 信任/T4-4 OTel 材料准备可穿插）/
T3-3-1 ✅（**可视化数据面+三图+能力看板卡**[§7 已拍板, 顺序 1→3→2]：host 四路由
[starmap/coverage/hypotheses/capability, 独立微缓存, graphd 零改动零新增 endpoint,
capability 静态读 fail-soft]+三图纯函数[buildStarmap/buildCoverage/buildHypLane,
$eng/$since 参数绑定]+d2d:viz tab[自绘 SVG/CSS grid 零图表库, 渲染护栏 200 节点/300 边/
泳道窗口 chips+localStorage+钳位 1..90 天]+#24 顺手两件[panel host 路由测试盲区补齐/
manifest"五形态"注释勘误]）
下一步建议（历史·T3-3-1 时点，已完成）：**T3-3-3 授权契约数字化**（拍板顺序 1→3→2；ed25519 契约模块+四挂接点+
P2P_AUTH_CONTRACT 缺省 off）/
T3-3-3 ✅（**授权契约数字化落地**[安全敏感度最高批]：domain/auth-contract.mjs 套件模块
[一体签名+ed25519+六失败面归并三态+seen-auth 双维记忆]+authctl CLI[keygen/keys/issue/
verify]+四挂接点纯新增接线[startEngagement 顶部覆盖 adopt/p2p_start 预检/registerGate
组合层 T0-C 同位/egress refreshScope 整集校验 H14 同位]——**全部零降级**；验签失败不放行
[invalid/expired 恒拒, 灰度 off 只豁免 missing]；P2P_AUTH_CONTRACT 缺省 off；授权与审批
正交维持；hostAllowed 空 scope 不补收紧[测试锁定现状]；runbook docs/auth-contract-runbook.md）
下一步建议（历史·T3-3-3 时点，已完成）：**T3-3-2 收官批**（桑基+9 标签页补全+侧边栏收口；收官 tag t3-3-stage65）/
T3-3-2 ✅（**6.5 收官批=T3-3 整体收官**[tag t3-3-stage65]：桑基数据面[transition-log
host 侧聚合 readTransitionFlows+SankeyChart 家族过滤零重取, 入 d2d:viz]+五新 tab
[approval 63/chain 64/tools 65/audit 66/config 67——审批纯 client 消费零后端零审批门/
链路三列 SVG+Task 看板[/pentest-tasks 对等]+CONFIRMS 稀疏注记/工具调用明细 run-log
全事件投影+工具量榜/审计 audit.log+transition-log 双源合流/配置只读总览+写面卡集中]+
四部分补全[总览 sev 计数列+per-eng token 总耗 attachEngCosts/前沿提案池+评审代理
frontierTransition reviewer 钉死 panel]+侧边栏对等三分法收口[豁免全清单
docs/t3-3-finale.md §四]+禁区 grep 断言测试[auth-contract/tier-approval 零出现]）
下一步建议（历史·T4-2 决策批前时点，已完成）：**T4-2 优先**（评测集跑测立项卡见下；T4-2/T4-3/T4-4 可并行）/
T4-2 ✅ 决策批（**选型决策书 docs/t4-2-storage-decision.md，零代码零迁移**：Kùzu 归档风险实锚
[本地 80MB/1.4 万节点距痛点 3-4 数量级, 3 年外推 <2GB——规模不触顶, 真实风险=生态到期
{wheel 冻结 Python ≤3.14/零修复/扩展服务器关闭}]+LadybugDB 可行性[原团队延续 v0.21.2/MIT/
三面同构逐项核对/停机 EXPORT→IMPORT/无原生事件]+横向矩阵[Memgraph 唯一原生 trigger 但
服务化+BSL]+**6-6 重评判定=矩阵内不成立**[重评条件精确化：引入嵌入+事件双条件候选才解锁]；
选项矩阵 A 维持+归档[倾向]/B 迁移 LadybugDB[触发条件驱动预案]/C 横向/D 混合[不建议]；
**6 拍板点待用户裁决**——拍板后 T4-2b 实施批或转 T4-3）
下一步建议（**当前唯一有效**·T4-2 决策批时点）：**等用户对 t4-2-storage-decision.md §八 6 拍板点拍板** → T4-2b 实施批
（归档三件套/裁剪/迁移试点，随拍板定）或 T4-3 信任加固；评测集跑测立项卡仍挂（与 T4 竞争优先级）

## 评测集跑测立项卡（T3-3 收官登记，实施单独立项——拍板 6：本批只立项不实施）
- **范围**：8.5 评测集跑测——SPA/DVWA 靶场全链路（五角色+调度环+验证闭环+经验回流），
  产出跑测报告一份
- **预估**：2-3 人日（含靶场复位与报告整理）
- **验收口径（draft）**：发现数/验证闭环率/误报率/端到端耗时/token 账本 五指标成表；
  **L2-L3 人工裁决保留**（自动分级不作终态——#10 dvwaSession 自增可预测随跑测一并人工审）
- **前置条件**：graphd/egress/oast/cdp-proxy 四服务就绪；评测集素材清点（未清点则先清点）
- **挂靠**：T4 系列排批时与 T4-2 竞争优先级（用户拍板）

## 开放项（销账后现存）
| # | 项 | 状态 | 挂靠 | 优先级 |
|---|----|------|------|--------|
| 1 | 业务闸 | **全线收官**（BG-1 纯函数+schema；BG-2 scheduler 集成上线：business_gate+coverage_bias 注入与深环派发闸，P2P_BUSINESS_GATE=0 回退；验收 docs/business-gate-acceptance.md） | — | P2 ✅ |
| 19 | 角色过滤接线（T3-2-2b） | **已落地**（T3-2-2b：面 1 修正形态纯新增接线+P2P_ROLE_FILTER 双覆盖；面 2 时序死结不实施——cards 组装在 role 赋值前，实锚见收官文档） | — | P2 ✅ |
| 20 | skill wins 自动归因 | 未建（门③现 soft=evidence 非空） | 实战 used_knowledge 归因成熟后对齐 | P3 |
| 21 | skill-distill LLM 蒸馏步骤 | 骨架产出（占位纪律防造假）；**补跑通道已打通**（T3-2-6 闲时任务框架首批任务） | 素材积累后按零成本约束立项 | P3 |
| 2 | lease-cas-watchdog flaky | 多批未复发，观察 | 观察项 | P3 |
| 3 | A/B 报告真 eng 名 | 未处理 | 仓库公开前必须 | P3 |
| 4 | collect-results.mjs ts slice(0,15)（:172 实锚） | 未修 | 8.5 完整版 | P3 |
| 5 | 8.5 完整版余量（看板/变异测试/评测集跑测） | **三件去向全定**（T3-3 收官：看板 ✅ 并入 T3-3-1 / 变异缩水 #25 / 评测集立项卡已登记 state.md，实施单独立项） | T4 排批 | P2 ✅ |
| 6 | 上游四条宿主建议（upstream-open-items.md:82-107 实锚） | 仅入库 | 随批顺手 | P3 |
| 7 | js-scanner active 模式 | 未实现（已拍板维持只读，实现需独立授权设计） | — | P3 |
| 8 | p2p_js_scan description 基线告警 | **已收编销账**（T3-2-3 基线 regen ×3 条入基线） | — | P3 ✅ |
| 9 | bias 检测阈值 80% | 首版参数 | 真实目标跑 1-2 场后回调 | P2 |
| 10 | dvwaSession 自增可预测 | 8.5 评测集人工裁决 | T3 | P2 |
| 11 | 滞留信号回填（5 场 50 条） | 未做 | 独立小批 | P2 |
| 12 | egress MITM HTTPS 全链 | 本地无 HTTPS 靶场降级；解密分支有单测 | 真 HTTPS 靶场侦察时实锚 | P3 |
| 13 | 三攻击工具 dsh 注册 | **已销账**（T3-2-3：三工具 defineTool 注册+基线钉扎 14 条；纯接线四文件本体零改动） | — | P3 ✅ |
| 14 | V3 独立外带端点 | audit.jsonl+/api/search 已够闭环 | 按需 | P3 |
| 15 | 检索有效性（recall@k/MRR）数据采集 | 设计就绪（brain-audit-runbook.md §6.1） | scheduler.js 邻域授权后实施 | P2 |
| 16 | misses 采集面加固（scheduler.js:398 邻域两档 miss 判定） | 设计就绪（brain-audit-runbook.md §6.2） | 同上授权 | P2 |
| 17 | cdp-proxy.mjs:129-131 头注释 §② 修正前表述 | 勘误待代码属主批 | 随批顺手 | P3 |
| 18 | 幻觉抽检人工循环首跑（--sample 工作单→人工审→--record 记账） | 框架就绪账本空 | 随批人工执行 | P3 |
| 22 | MCP 会话化 + dsh 宿主原生接口跟进 + 首个真实 server 接入 | 设计就绪（v1 无会话态；独立 CLI 进程形态；配置面空清单安全态） | 触发条件见 docs/mcp-security-design.md §9 | P3 |
| 23 | 能力路由短词 1 分档裸子串可误命中（surface-js→modeling-specialist 实锚；行为快照已锁定现状） | 登记性断言在位（idle-tasks.test 快照） | allocator 逻辑面精化（非禁区低优先，0911 评分刚定稿勿急动） | P3 |
| 24 | 审计发现登记（T3-3-0，均不修）：hostAllowed 空 scope fail-open（checkBash 层已 fail-closed 兜底）/~/.config/d2d 目录 775（私钥子目录应 0700）/manifest 文件头「五形态」注释遗留（实 6 形态）/panel host 路由测试盲区（approval/eng/start 分支） | **两项已顺手销账**（T3-3-1：manifest 注释勘误+panel 路由测试盲区补齐[viz 四路由+approval/caps/denylist 分型]）；hostAllowed 空 scope **测试锁定现状**（T3-3-3 结论不补收紧）；auth-signing 子目录 0700 已建（T3-3-3），父目录 775 登记不修 | 随批顺手或 T4-5 清理 | P3 |
| 25 | 变异测试工具链兼容（@stryker-mutator/mocha-runner 插件与 mocha 12 冲突——run-helpers 内部路径不存在；364 mutant 已 instrument 卡 runner） | T3-3-3 观察跑未跑成（如实登记） | 修 mocha-runner 兼容后限新安全面文件补观察跑 | P3 |
| 26 | graphd.json 运行时状态混入 ~/.config/d2d/（应归 DATA_DIR；契约/密钥面已按 0700/0600 收窄） | 登记不修 | T4-5 仓库清理批 | P3 |
| 27 | T3-3-2 降级/豁免登记（findings 全量分页/单条 repro 抽屉/单条验证按钮[spec 已有设计位]/notify 写面/条目级 Experience 消费/deep-creative wakeups 计数[调度器内存无透出]/attempt 刻度[无数据源]） | 登记不修（豁免理由 docs/t3-3-finale.md §四） | 随批顺手或 T4 排批 | P3 |

## 决策账
已拍板：五术语清理（ACON/ATLAS/MaTTS/SAGE 删，CNSR 留名；T3-1 执行：仓内前四者
零命中/ATLAS 三处已收口为「本仓自有存储唯一」）；Embedding 后移（域评测集未建不度量
换模型收益；开源商品化晚买更便宜）；零侵入优先（度量/审计优先离线聚合，改禁区须显式
授权）；分层压缩保留编排（本批仅确认现状）；业务闸独立小批（不混批）；js-scanner
维持只读；lease-cas-watchdog 继续观察；活文档机制（HD-1：回报固定含「状态文档更新」
节）；PR 流程授权（HD-1：CI 三 workflow 绿即可合并）；**T3-2 拆批方案拍板**（T3-2-0
后：六批顺序 1→(2∥3)→4→5→6 认可；6-6 本体降级长期项挂 T4-2，T3-2-6 承接）；
**T3-2-4 安全四底线拍板**（写通道不外放/不过 sanitize-ingest 链不入图/配置即边界/
双向各自可关；对外 server 原生 stdio JSON-RPC 零 SDK 选型；CALL 预检放行由 graphd
权威兜底——镜像忠实 V-07 不越权加严）；**T3-2-5 拍板**（worker 工具形态零禁区路径；
递归深度=1 硬限制 fail-closed 不降级；scope 继承=严格子集[不可判定维度不给]；
子 Agent=进程内受控实体不走 external 消毒链[两道防线定性区隔]；结果回流=既有
Signal/审计通道；调度环自动创建切片出批[实战后另批 4-3a，不出材料]；devlog 只追加
[state=快照可覆盖/devlog=完整轨迹]）；**T3-2-6 拍板**（调度环核心零改动为唯一新增
硬边界；闲时任务预检硬门不可妥协；能力路由数据面优先[实测无缺口→快照锁定]；
6-6 本体不做挂 T4-2；首批任务 1-2 个防批次膨胀；收官件=盘点+devlog 收官节+tag）；
**T3-3-0 拍板**（只读审计批+拆批方案；审计发现禁区即登记不绕行；8.5 取舍归用户；
授权数字化密钥管理不落实则不排批；宿主侧 agent 协作常设授权=AGENTS 先例 11）。
**待拍板（用户）**：T3-3 拆批方案 §7 **已拍板**（T3-3-0 收官回报后确认：3 批/顺序
1→3→2/看板并入批 1/变异不进主体/评测集后置；授权灰度缺省 off+graphd 侧不参与验签）。
待拍板（用户）：T4-2 LadybugDB 迁/不迁/观望；
T4-4 OTel 插队或按序；T4-5 是否公开仓库及脱敏范围。

## 关键文件/脚本速查
docs/dsh-sidebar-compat.md · docs/assertion-dsl.md · docs/mitm-cert-runbook.md ·
docs/upstream-open-items.md · docs/approval-channels.md · docs/tool-risk-rating.md ·
docs/gate-coverage-gaps.md · docs/gate-anchor-schema.md ·
docs/merge-plan-approval-trust.md · docs/brain-audit-runbook.md ·
docs/business-gate-design.md · docs/business-gate-acceptance.md · docs/stage6-batch-plan.md ·
docs/mcp-security-design.md · docs/stage6-finale.md · docs/t3-3-plan.md ·
docs/devlog.md（只追加轨迹）·
experiments/dataset/eval-dataset.jsonl · experiments/results/ab-report-*.md ·
brain/seed/seed-cards.json · tests/golden-targets/{baseline,spa-recon-acceptance,
spa-verify-acceptance,spa-attack-acceptance}.md · scripts/ops/verify-dsh-version.mjs ·
scripts/ops/dvwa-reset.sh · scripts/browser/{cdp-proxy,cdp-client,form-fuzzer,
logic-tester,race-condition}.mjs · scripts/gateway/{egress-gateway,tls-intercept,
evidence-crypto}.mjs · scripts/brain/{study,promote,validate-cards,consensus-check,
misses-report,experience-metrics}.mjs · plugin/pentest-dsh/tools/js-scanner.mjs ·
scripts/mcp/d2d-mcp-server.mjs · config/mcp-export.json · config/mcp-servers.json ·
plugin/pentest-dsh/scheduler/{approval-agent,subagent-cap,bias-block,trust,
tier-approval,external-tools,supervisor-tools,idle-tasks}.mjs ·
plugin/d2d-panel/lib/client/view.viz.js · plugin/d2d-panel/lib/host/{snapshot,index}.mjs(viz 面) ·
plugin/pentest-dsh/domain/auth-contract.mjs · scripts/ops/authctl.mjs ·
docs/auth-contract-runbook.md ·
plugin/pentest-dsh/domain/{card-schema,
experience-consensus,knowledge-gaps,experience-metrics,memory-store,sanitize-ingest,
mcp-discovery,role-card-filter}.mjs · plugin/pentest-dsh/har-capture.mjs
（路径均经 HD-1 审计核实存在）
