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
| Experience 表结构（14 列） | 3.5-1 已落地 |
| /write/experience、/query/experience | 3.5-1 已落地 |
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

T3-1 新增：无（四子项零侵入落地）。HD-1 新增：无（纯文档批）。

## 28H+9M 存量项
- 含义：Mimosa L3 门预提交扫描的存量高危/中危项，历史遗留非新引入
- 位置：tests/test_graphd_gates.py 注入 fixture（T3-1 实锚 :1524/1525/1635/1814 等
  SQL 注入/SSRF 高危行）+ validator.js:334 extractCurlArgs curl 黑名单防线区
- 处理口径：实施员 commit 被拦 → 变更就绪、移交提交 → 工作流 world.run
  通道落 commit（既有成功形态，非绕过）；绝不 --no-verify；存量零触碰
