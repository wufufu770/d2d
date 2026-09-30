# d2d 当前状态（活文档，每批收尾必更新）

> 本文件是项目唯一状态真相源。批次回报的「状态文档更新」节执行更新。
> 以下底账时点：HD-1 落库（T3-1 收官 `f115f6d` 之后；HD-1 合并后 HEAD 顺延，
> 以 `git log -1` 实测为准）。

## 当前底账
- 远端 HEAD：`f115f6d`（T3-1 收官七族末 commit；HD-1 merge 后以 git log 实测为准）
- 分支：main 唯一活跃；31 个远端分支保留（历史基线/archive 回滚点，T4-5 清理）
- 工作树：0 改动
- CI：三 workflow（ci/dsh-compat/gates）全绿（T3-1 run 36717743144/36717743365/36717743481）
- 测试基线（T3-1 固化）：pytest **368** / mocha **1729 passing** / panel **55**
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
HD-1 ✅（文档体系）/ BG-1 ✅（业务闸第一段：纯函数+schema+29 测试+BG-2 申请材料；
scheduler 集成留 BG-2 待授权）
下一步建议：BG-2（待用户对 docs/business-gate-design.md §二授权申请拍板）+ 滞留回填小批
（穿插）→ T3-2（先发 T3-2-0 拆批方案）

## 开放项（销账后现存）
| # | 项 | 状态 | 挂靠 | 优先级 |
|---|----|------|------|--------|
| 1 | 业务闸 | **BG-1 完成**（schema+三纯函数 29 测试+BG-2 授权申请材料 docs/business-gate-design.md；BG-2 待用户对申请拍板） | BG-2 | P2 |
| 2 | lease-cas-watchdog flaky | 多批未复发，观察 | 观察项 | P3 |
| 3 | A/B 报告真 eng 名 | 未处理 | 仓库公开前必须 | P3 |
| 4 | collect-results.mjs ts slice(0,15)（:172 实锚） | 未修 | 8.5 完整版 | P3 |
| 5 | 8.5 完整版余量（看板/变异测试/评测集跑测） | 未做 | T3-3 前后 | P2 |
| 6 | 上游四条宿主建议（upstream-open-items.md:82-107 实锚） | 仅入库 | 随批顺手 | P3 |
| 7 | js-scanner active 模式 | 未实现（已拍板维持只读，实现需独立授权设计） | — | P3 |
| 8 | p2p_js_scan description 基线告警 | unbaselined | 下次基线重生成收编 | P3 |
| 9 | bias 检测阈值 80% | 首版参数 | 真实目标跑 1-2 场后回调 | P2 |
| 10 | dvwaSession 自增可预测 | 8.5 评测集人工裁决 | T3 | P2 |
| 11 | 滞留信号回填（5 场 50 条） | 未做 | 独立小批 | P2 |
| 12 | egress MITM HTTPS 全链 | 本地无 HTTPS 靶场降级；解密分支有单测 | 真 HTTPS 靶场侦察时实锚 | P3 |
| 13 | 三攻击工具 dsh 注册 | CLI/模块形态，审批面已覆盖 | T3-2 6-3 | P3 |
| 14 | V3 独立外带端点 | audit.jsonl+/api/search 已够闭环 | 按需 | P3 |
| 15 | 检索有效性（recall@k/MRR）数据采集 | 设计就绪（brain-audit-runbook.md §6.1） | scheduler.js 邻域授权后实施 | P2 |
| 16 | misses 采集面加固（scheduler.js:398 邻域两档 miss 判定） | 设计就绪（brain-audit-runbook.md §6.2） | 同上授权 | P2 |
| 17 | cdp-proxy.mjs:129-131 头注释 §② 修正前表述 | 勘误待代码属主批 | 随批顺手 | P3 |
| 18 | 幻觉抽检人工循环首跑（--sample 工作单→人工审→--record 记账） | 框架就绪账本空 | 随批人工执行 | P3 |

## 决策账
已拍板：五术语清理（ACON/ATLAS/MaTTS/SAGE 删，CNSR 留名；T3-1 执行：仓内前四者
零命中/ATLAS 三处已收口为「本仓自有存储唯一」）；Embedding 后移（域评测集未建不度量
换模型收益；开源商品化晚买更便宜）；零侵入优先（度量/审计优先离线聚合，改禁区须显式
授权）；分层压缩保留编排（本批仅确认现状）；业务闸独立小批（不混批）；js-scanner
维持只读；lease-cas-watchdog 继续观察；活文档机制（HD-1：回报固定含「状态文档更新」
节）；PR 流程授权（HD-1：CI 三 workflow 绿即可合并）。
待拍板（用户）：T3-2 拆批方案确认；T4-2 LadybugDB 迁/不迁/观望；
T4-4 OTel 插队或按序；T4-5 是否公开仓库及脱敏范围。

## 关键文件/脚本速查
docs/dsh-sidebar-compat.md · docs/assertion-dsl.md · docs/mitm-cert-runbook.md ·
docs/upstream-open-items.md · docs/approval-channels.md · docs/tool-risk-rating.md ·
docs/gate-coverage-gaps.md · docs/gate-anchor-schema.md ·
docs/merge-plan-approval-trust.md · docs/brain-audit-runbook.md ·
experiments/dataset/eval-dataset.jsonl · experiments/results/ab-report-*.md ·
brain/seed/seed-cards.json · tests/golden-targets/{baseline,spa-recon-acceptance,
spa-verify-acceptance,spa-attack-acceptance}.md · scripts/ops/verify-dsh-version.mjs ·
scripts/ops/dvwa-reset.sh · scripts/browser/{cdp-proxy,cdp-client,form-fuzzer,
logic-tester,race-condition}.mjs · scripts/gateway/{egress-gateway,tls-intercept,
evidence-crypto}.mjs · scripts/brain/{study,promote,validate-cards,consensus-check,
misses-report,experience-metrics}.mjs · tools/js-scanner.mjs ·
plugin/pentest-dsh/scheduler/{approval-agent,subagent-cap,bias-block,trust,
tier-approval}.mjs · plugin/pentest-dsh/domain/{card-schema,experience-consensus,
knowledge-gaps,experience-metrics,memory-store}.mjs · har-capture.mjs
（路径均经 HD-1 审计核实存在）
