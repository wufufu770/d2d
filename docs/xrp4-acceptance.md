# XR-P4 验收表（方案 §10 A1-A12）+ 阶段分支记录（2026-10-06）

> **阶段分支走向（拍板 1）**：allowlist 白名单**仍占位**（部署态+example 均为
> `['<provider>/<frontier-model>']`，N-0 实测）→ **阶段 A 全量执行，阶段 B 真首跑不跑**
> ——合法结局，非失败。阶段 B 前置就绪状态见文末"阶段 B 待命清单"。

## 双阶段执行记录

| 阶段 | 状态 | 说明 |
|------|------|------|
| A：前置顺手项+verify 真执行器+注入链+A1-A12 静态可验项 | ✅ 完成 | 本文件+五笔 commit |
| B：真自主首跑（--max-hours 0.5 缺省） | ⏸ gated | allowlist 占位→停下回报（拍板 1 授权形态） |

## A1-A12 逐项验收

| # | 标准 | 判定 | 证据（机械优先） |
|---|------|------|------------------|
| A1 | 七边界逐项（含计数器外置） | ✅ 静态面全过 | ①egress 强制：adapter-dsh.mjs:201-215（proxy 注入+NO_PROXY 直连，全波零 diff）②graphd 写门：graphd/ 全波零 diff ③host token 剥离：runner.mjs stripGraphTokenEnv+断言固化（xring-p1 assertNoTokenAuth 形态，实测 401）④proxy 强制同① ⑤humanOnly 词表：scheduler 面零 diff（adapter 增量仅 liveWorkerPids 观测导出）⑥审批 gate：零 diff ⑦预算硬熔断：monitor budgetCheck+overBudgetSequence+P0/P1/P3 测试族（超时+token 双路径真执行留证） |
| A2 | 流程全抛（无三环无 kind 无 Gate 无停滞检测无角色库） | ✅ | prompt.md 零流程指令 grep 断言=0 命中（xring.test.mjs 10 模式禁词用例）；本波新增停滞遥测=宿主侧观测非环内流程（拍板 4 口径） |
| A3 | 模型自主（prompt 无流程概念） | ✅ | 同上断言；runner.renderPrompt 仅注入 RUN_ID/WORKSPACE 占位+微任务尾注 |
| A4 | 三 JSON 过 ajv strict | ✅ | validate.mjs（模块级预编译）+schema 正反例测试（xring.test.mjs）；封闭 additionalProperties:false |
| A5 | A 级 verify 双签+quarantine 生效 | ✅ 注入链实证 | verify 真执行器（verify-runner.mjs 纯 HTTP 重放+机械 EXPECT 比对+歧义 manual）；注入链测试（xring-p4）：pass→finding 入图（repro=steps 串联）、fail/manual→零入图（**bypass 档亦不放行**）；C 级 quarantine：P1 smoke 图内验证 quarantined×1 |
| A6 | events append-only+过程可见 | ✅ | appendEvent 仅 appendFileSync（全 xring 面无 truncate 路径——grep 证）；过程可见=P2 面板 tab（只读投影）+P3 遥测字段 |
| A7 | 超时 token 任一触发即停+计数器不可写 | ✅ 机制面（触发实测=熔断 smoke） | monitor 测试超时路径+smoke-budget token 路径（五步真执行 worker 确死）；计数器外置：记录面 0700+路径不进 worker env（P1 断言固化）；**首跑内真实触发=待阶段 B**（如触发=合法数据点） |
| A8 | 成本硬上界 | ✅ | BUDGET_LIMITS 硬 cap（拒绝不 clamp——cli 测试）+costLine 上界显示；首跑预算收敛口径=**--max-hours 0.5**（拍板 2，验收=通道机制非探索深度；token 100 万照旧） |
| A9 | 主流程零改动 | ✅ diff 证明 | 全波（c6dabaa..HEAD，46 commits）`git diff --stat -- graphd/ plugin/pentest-dsh/{scheduler,domain}/ scripts/{browser,brain,gateway}/` =**零**；触碰面=scripts/xring/*（自有）+panel 只读投影+adapter liveWorkerPids 导出（观测面 8 行）+ci.yml 根 npm ci+测试+docs——如实列明 |
| A10 | 三档共存 | ✅ | XRING_MODES off/queue/bypass（monitor.mjs）+档位测试族（xring-p3：off 零图写/bypass 硬线/env 旗标入口）；宿主侧 env 单一旋钮（P2P_XRING_MODE）零主流程耦合 |
| A11 | 模型档位合规（弱模型拒绝） | ✅ | parseStart allowlist 拒绝测试（xring.test.mjs：weak 模型/白名单外拒绝+文案）+cli start 入口；**allowlist 内容=用户维护（仍占位——本批停下根因）** |
| A12 | 认知类失败可追溯（F2/F5/F8 留痕+环外可识别） | ◐ 机制面过，观察面待首跑 | C 级 lessons→/write/experience 写入即 quarantined（graphd 语义）+provenance_hash 绑定 runId（reflow provenanceOf）+面板 experience 面；F2/F5/F8 真实观察=**待阶段 B 首跑**（可观察性不足也是如实结论——首跑后回填） |

## 阶段 A 新增机械证据（本批）

- **verify 真执行器**（R9 规避：重放器非裁判——零 LLM-judge，判定=EXPECT 包含比对；
  目标面硬边界=绝对 URL/非相对路径拒绝执行，测试实测靶外零请求）：
  xring-p4.test.mjs 8 例（通过/失败/五类 manual/靶外硬边界/网络 fail/全链双向/实测 DVWA）。
- **注入链全链**：种子工件→真 verify 重放 pass→双签→finding 入图（repro=steps 串联）；
  反面=fail/manual 双形态 bypass 档零入图——硬线强度确定性证明（不依赖首跑运气）。
- **DVWA 实测**：执行器 vs 真 DVWA（:80）重放 /login.php+双 EXPECT → pass（本地实测，
  CI skip 护栏）。

## 阶段 B 待命清单（allowlist 填入后即可跑）

1. **DVWA 就绪 ✅**：容器 Up（docker.1ms.run/vulnerables/web-dvwa:latest，0.0.0.0:80）、
   /login.php 200 实测；凭据面=admin/password（scripts/ops/dvwa-reset.sh 内置公开默认，
   非真实密钥）；NO_PROXY 直连形态=adapter no_proxy 含 127.0.0.1,localhost ✓。
2. **allowlist**：`~/.d2d-data/config/model-policies.json` roles.xring.allowlist 填入
   前沿模型 id（当前 `['<provider>/<frontier-model>']` 占位）——**唯一未决前置**。
3. **首跑形态**：`node scripts/xring/cli.mjs start --model <id> --max-hours 0.5`（拍板 2
   收敛口径）；监控/面板/事件留证自动生效；executor 目标面=受控靶 only；
   首跑任务书限定靶=DVWA，靶外零尝试。
4. **验收动作**（首跑后回填本表）：A7 触发数据点、A12 F2/F5/F8 观察、复盘时间线/
   预算曲线/工件分级/代理偏差。
