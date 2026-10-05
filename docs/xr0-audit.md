# XR-0 衔接面定谳报告（X-Ring 旁路通道 · 2026-10-05 · 只读审计）

> 使命：X-Ring v1.1（dsh worker 旁路自主探索）立项后的六个衔接点定谳——逐项实证结论
> 与证据（path:line 可复核），产出 XR-P0 的精确输入。**审计全程只读**；生产 kuzu_db/
> ladybug 库零写；scheduler 核心调度环零触碰（只读 grep）。
> **材料缺口声明**：方案 v1.1 全文（M1-M7 修正形态）未随批提示词到达且仓内无先存材料
> （全仓 grep xring 零命中）——本报告与 docs/xring-plan.md 以批提示词给出的拍板子集
> （U1/U2/U3+四补强+设计红线）为方案侧依据，全文到达后须对齐复核（唯一悬置）。

## 定谳一：token 计数通道 = 通道①（dsh 会话转录 usage 面）精确可得

**判定：通道①成立，mitm 计量（通道②）不需启用，降级设计（通道③）备而不用。**

| 通道 | 实证 | 结论 |
|------|------|------|
| ① dsh 会话转录 | `~/.dsh/sessions/<cwd-slug>/session-<uuid>/session.v3.jsonl.zstd`（zstd 压缩 JSONL，0600）；解压实测逐消息 `"usage":{"inputTokens":13229,"outputTokens":3211,"totalTokens":16568,"cacheReadTokens":128}` 四字段精确计量；目录按 worker cwd 分桶 | **主通道**：XR worker cwd=其 workspace → 监控进程按桶只读 `unzstd -c` 累计 usage（unzstd 读取为仓内既有先例 plugin/pentest-dsh/adapter-dsh.mjs:101）；读取形态=监控进程侧批量增量解析（记 offset 幂等续读） |
| ② mitm 网关计量 | egress-gateway 为连接层 scope/审计面（scripts/gateway/egress-gateway.mjs），无 LLM token 语义计量（流量字节级） | 不启用：精度口径不匹配（字节≠token），且模型 API 主机走豁免面（:37）不一定过解密链 |
| ③ 降级设计 | — | 备而不用（转录缺失/损坏时）：请求数近似+超时为主旋钮（XR-P0 按此细化兜底分支即可，非主形态） |

## 定谳二：无租约 worker 边界兼容性 = 全部兼容，**无"须改 scheduler"红线命中**

七项边界（按仓内实锚形态重构，与方案全文对齐后为准）逐项判定：

| # | 边界（实锚形态） | 旁路兼容判定 | 证据 |
|---|------------------|--------------|------|
| 1 | env 凭据擦洗与分级注入（`*/KEY\|TOKEN\|SECRET/i` 剥除；P2P_HOST_TOKEN 剥除；仅注入 worker token） | ✓ 复用 | adapter-dsh.mjs:197-244（env 构造块整体复用，与租约无关） |
| 2 | egress 网关强制（连接层 http_proxy+scope 判定+fail-closed） | ✓ 复用；旁路无 engagement → 动态 scope 回落静态白名单（egress-gateway.mjs:3 每 30s 读活跃 Engagement.scope 与白名单取并集——无活跃=纯白名单）；**首跑受控靶=本地 DVWA → NO_PROXY 直连（127.0.0.1）根本不过 scope 面**；模型 API 主机豁免在 scope 外（:37） | adapter-dsh.mjs:201-215 |
| 3 | worker token 权限分级（结构化写 vs host-only 面） | ✓ 复用 | adapter-dsh.mjs:198（I-013 注释）；graphd /write/* 按 token 分权 |
| 4 | 产物/证据目录隔离（R4c cwd=artifacts+按 eng 分桶+50MB 轮转） | ✓ 复用；**eng 可省略→回落平铺（:264 显式兼容旧调用）**——旁路 cwd=X-Ring workspace | adapter-dsh.mjs:262-278 |
| 5 | 超时与预算硬约束（`timeout --signal=KILL`+MAX_STEPS 步数线+组杀+软着陆一次） | ✓ 复用；ring='xring' 走 WORKER_TIMEOUT_MS 缺省（:191 仅 deep/creative 走短超时） | adapter-dsh.mjs:181-194 |
| 6 | 模型隔离（per-model DSH_HOME=buildModelHome+THINKING_INCOMPATIBLE） | ✓ 复用 | adapter-dsh.mjs:176,120 |
| 7 | **租约/停滞检测/资源回收（scheduler 保障面）** | **旁路不适用→监控进程等价接管**（见定谳六/R10）：leaseId 在 spawnWorker 内**可选**（:244 `if (leaseId)` 仅观测注入）；eng 仅日志分桶（:264 可空）——**spawn 通道零改动可承载无租约 worker** | adapter-dsh.mjs:241-244,262-264 |

**红线判定：零命中。** spawnWorker 签名 `{ring,task,model,cwd,eng,leaseId}` 中 eng/leaseId
均可选（graphd 侧 worker-token 写权不依赖租约——P0 注释 :241-243"仅可观测用途,不是写权限"）。
旁路 spawn=宿主脚本直调 `adapter.spawnWorker({ring:'xring',task,model,cwd:<workspace>})`
（eng/leaseId 省略），scheduler 全链不经手。

## 定谳三：A2 前提成立 = 零流程注入是 headless 缺省形态

- **dsh headless profile 层零流程**：`~/.dsh/profiles/headless/cordis.yml` 条目为空 `[]`
  （"empty entry list, composed as patches"），cordis.patch.yml 70 行全文
  `grep -E "system|prompt|persona|kind|gate|环|role"` **零命中**（仅 LLM providers 路由
  块，install.sh 生成）——无硬编码三环/kind/Gate/角色库指令。
- **流程注入全部在 taskFull 拼装链（scheduler 侧）**：spawnWorker 仅原样传 task+追加
  MAX_STEPS 预算硬线段（adapter-dsh.mjs:186-189——此段为预算约束非探索流程，X-Ring
  复用=成本上界的通道级强制，与"零流程注入"不冲突）；简报的 agent_status/experience_
  ref/审批回读等全部由 scheduler.js:659 调用侧拼装（scheduler/bias-block.mjs:11
  "派发消费点(spawnWorker task)为既有行"实证）。
- **可行性证明路径**：X-Ring worker task=纯任务文本（不带任何环/流程段）→ adapter 直调
  → headless profile 缺省行为=裸 LLM agentic 循环。XR-P0 以一条冒烟 task 实证。

## 定谳四：quarantine→verify 链 = 复用面充分，差距两项（XR-P1 承接）

**现状实锚**（graphd/app.py）：
- Experience 写入即隔离：`status:'quarantined'` 内联字面量（:1009），写入即隔离在池
  （:969 语义注释）；转态白名单仅 quarantined→active（评审出池）/active→deprecated
  （:1035）。
- Finding 转态走 /write/transition（:555）；双签面 /write/dual-sign-transition（:1137，
  DUAL_SIGN_TRANSITIONS 状态机）；frontier 面 /write/frontier(+transition)（:1187/:1368）。

**六写端点精确映射**（三级产出 → 端点实证）：

| 级 | 产出 | 端点 | 权限 |
|----|------|------|------|
| A | finding | /write/finding（:633）+ /write/transition（转态） | worker token（结构化写） |
| B | hypothesis+signal | /write/hypothesis（:751 前）+ /write/signal（:751） | worker token |
| C | experience | /write/experience（:922，写入即 quarantined）+ 评审出池走 /write/experience-transition（:1041） | 写入=worker token；**出池=host 评审面**（方案 U2 共存三档的评审归属在此落点） |

**差距清单**：①"quarantine 1 tick"——现状**写入即隔离（强于 1 tick 延迟）**，复用即可
（方案措辞按现状收敛）；②"verify 独立重放"——现 verify=五环角色由 scheduler 派发；
旁路形态=监控进程以独立 spawn（verify 角色/独立 cwd）重放 worker 声称的 finding——
通道与三级产出端点全复用，编排逻辑归 XR-P1/P3。

## 定谳五：面板增量面 = 纯增量文件+只读投影，绝不碰清单零交集

- 面板代码位置：plugin/d2d-panel/lib/{client,host}——client 侧
  view.{audit,chain,config,findings,ops,tools,viz}.js+cards.*+router.js/ui.js/api.js；
  host 侧 snapshot.mjs（只读快照）+standalone.mjs（全端点只读 GET+no-store+graphd
  不可达 503 fail-closed，:3/:37/:44）。
- **X-Ring tab 增量面**：client 侧新增 view.xring.js（router 注册一跳）+host 侧
  snapshot 增 xring events.jsonl 尾窗只读投影（宿主文件读，xring/ 目录 worker 不可达
  故读面天然安全）——**与 scripts/browser/ 等绝不碰清单零交集**（面板在 plugin/d2d-panel，
  与 scripts/browser/ 无 import 关系）。
- **model-policies.json 现状**（~/.d2d-data/config/model-policies.json）：`{default,
  roles:{discovery,deep,creative,verify,study}}` 五角色各 {primary,backup}——
  **U3 xring 角色增量=roles.xring:{primary,backup}** 一段 JSON，读取面
  （scheduler.js:115 校验既有键）需确认对未知角色键的容忍度（XR-P0 实测项：加键后
  既有五环调度零扰动）。

## 定谳六：scheduler 保障面代价清单 → R10（方案风险节）

| 保障 | 实锚 | 对 X-Ring worker | 等价接管（监控进程） |
|------|------|------------------|---------------------|
| 租约续期 | scheduler/lease.mjs+LEASE_TTL_MS=120s（scheduler.js:72，心跳 tick≈45s 2 拍余量） | 不适用（无租约——终态写入 CAS 钥匙为空，写权由 token 分级承担） | run-id 心跳：监控进程 tick 写 events.jsonl |
| 停滞检测 | scheduler/state.mjs+gates 套件（会话 90s 无新写入判定先例=adapter MAX_STEPS 软着陆 :182） | 不适用（scheduler 不经手） | 等价：转录文件 mtime 静默窗（90s 先例值）+MAX_STEPS 硬线（adapter 原生复用）→超限组杀 |
| 资源回收 | killAllWorkers/recoverOrphans（scheduler.js:447-450 域） | 不适用 | 等价：监控进程持 child.pid 直杀进程组+孤儿扫描（detached 组，pgrep 模式=--profile headless+cwd 工作区） |
| 超时兜底 | timeout --signal=KILL+kill-after=5（:194） | **原生复用（非代价——adapter 层自带）** | — |

**R10 定性**：X-Ring worker 放弃的三项 scheduler 保障全部有监控进程等价物，且无一项
需要改 scheduler/adapter 源码（接管逻辑全部活在监控进程+记录面外置红线内）。

## 修订后实施路线（Phase 0-4，按审计实证重切）

| Phase | 边界 | 内容 | 禁区预比对 |
|-------|------|------|-----------|
| **XR-P0** 骨架+spawn 通道 | 宿主脚本（scripts/xring/） | 记录面规范落地（xring/<eng>/<run-id>/{events.jsonl,workspace}+权限收紧）；监控进程 skeleton（events 独占写+token 计数器[通道① unzstd 累计+③降级分支]+run 生命周期）；spawn 通道（直调 adapter.spawnWorker ring='xring'）；model-policies roles.xring 增量+既有五环零扰动实测；启动确认面（成本上界+受控靶声明） | scheduler 零触碰；graphd 零触碰；scripts/browser/ 零交集；存储域触碰=0 |
| **XR-P1** 写面接线 | 复用层验证 | 三级产出六写端点 worker-token 通道实测（一条 smoke finding/hypothesis/signal/experience 走 quarantined 池）；verify 独立重放骨架 | approvals 本体只读；sanitize-ingest 链零触碰 |
| **XR-P2** 面板 X-Ring tab | 只读投影 | view.xring.js+host snapshot 尾窗投影（events.jsonl+图只读） | 全端点只读 GET 形态（standalone 先例同构） |
| **XR-P3** 自主循环编排 | 监控进程成熟 | 停滞等价接管（mtime 静默窗+MAX_STEPS）/孤儿回收/成本熔断/多 run 并存（U2 三档宿主侧实现） | — |
| **XR-P4** 首跑验收 | 受控靶 | DVWA/本地 lab 端到端：零流程注入冒烟+三级产出回流+token 计量对账+零主流程触碰证明（审计对照） | **非生产目标**（拍板 3 红线） |

**存储域触碰预期**：全 Phase 零（XR-P2 只读图面——若触碰图读面代码，按 LBD-2 观察期
纪律 push 前双轨全量，拍板 4）。

**落地进度（2026-10-06 XR-P3 收官）**：XR-P0 ✅ / XR-P1 ✅ / XR-P2 ✅ / **XR-P3 ✅**
（U2 三档+token 软代理升格近精确[调查双误诊纠正 docs/xrp3-token-investigation.md]+
孤儿回收+单活跃守卫+失联检测+停滞遥测；panel 94）——**XR-P4 待用户排批**（前置=
allowlist 白名单内容填入）。
