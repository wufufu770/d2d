# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-10-18

> 1.4.0 语义=Advisor 触发源扩展+竞速变体生产契约（修正窗）+P2 折并清债 8 项+hook 静默
> 失败防御+429 限流退避重启（模型韧性层）。
> **包面口径（vs 1.2.0/1.3.0 的版本对齐语义——本版含真实包面增量）**：hook-guard.mjs
> （新增）与四处 hook 入口包裹（index.js/adapter-dsh.mjs/adapter-inprocess.mjs/scheduler/
> post-execute-gate.mjs）+429 退避（adapter-dsh.mjs，opt-in）；编排层增量（Advisor 三信号/
> 竞速变体契约/P2 折并 8 项/reflow verdicts 三分）在仓内 scripts/xring——包面不含该层
> （先例口径维持）。npm pack 对账：本版 vs 1.3.0 增量恰=上述五文件，零意外面。
> **加性纪律（升级零行为变化）**：429 退避缺省 P2P_WORKER_429_MAX_RETRIES=0（单次 spawn
> 零变化，缺省对照测试背书）；Advisor 三信号为 opt-in 观察面；竞速变体契约=可选声明面；
> 探活参数化缺省=既有 3×10s 语义。
> **包文件集修复**：hook-guard.mjs 入 files 白名单——1.3.0 发布后插件面 hook 入口包裹
> 引用它而不在白名单（装包即断链的半截实施），本版收尾修复。

### Added
- **hook 静默失败防御（hook-guard.mjs，包面）**：五处安全链 hook 入口（approval/request、tools/pre-execute ×2、tools/post-execute ×2）guardHook 包裹——hook 异常先落 hook-guard.log（ts/hook/error/stack JSON 行）再原样重抛；宿主吞错形态的定位法产品化。
- **429 限流退避重启（adapter-dsh.mjs，包面）**：worker 非零退出且输出尾部含 RATE_LIMIT/rate_limit_error 时按指数退避（P2P_WORKER_429_BASE_MS，缺省 60000ms）重启，至多 P2P_WORKER_429_MAX_RETRIES 次（**缺省 0=零行为变化**）；模型面单点环境（无备用 provider）下的关键韧性层。
- **Advisor 触发源扩展（编排层）**：三信号=①探索停滞（跨轮零新增认识论内容）②封锁检测（401/403/429 ≥3）③证伪连击 ≥2 且零建设；防过触发三件套（单发/阈值可配/与连败信号互斥）。
- **竞速变体生产契约（编排层）**：prompt.md 引导 worker 自发声明 repro findings[].variants（≤5 组 steps 变体）——竞速模式的生产侧入口（此前只有消费侧）。
- **verify-runner HEADER 行**：`HEADER <Name>: <value>` 声明式请求头（机械语法解析，坏形态归 manual）——repro 表达力扩展。

### Fixed
- **files 白名单补 hook-guard.mjs**（包文件集增量对账见上）。
- reflow verdicts 三分：held∩verdicts pass→facts（verified_in）/fail→falsified（operator 判伪）/未补录→heldUnreviewed 照旧 leads——held 验证补录链闭环。
- first-run 探活参数化：`--probe-tries`/`--probe-timeout-s`（缺省 3×10s 语义不变）。
- selfcheck 扩至 12 检（+三信号/hook-guard 两检）；mocha 2205→2208（+429 退避三例：缺省零变化对照/重试成功/非限流零重试）。

## [1.3.0] - 2026-10-17

> 1.3.0 语义=意图运行时+第二视角+竞速验证+修复后复测（外部调研四源思想的原生实现，零外部依赖）。
> **包面诚实口径（承 1.2.0 先例）**：四项能力为编排层（仓内 scripts/xring）能力——npm 包面
> 不含该层，本版发布为版本对齐语义；包文件集与 1.2.0 全同。
> **验证口径**：离线合成断言闭环（Intent 继承/Advisor 触发与缺省零行为/竞速胜出与缺省关/
> 复测流转——全 fake adapter 零真进程）+三轨全绿；**编排层能力已经两轮单目标授权环境真实
> 场验**（ECC 判级/接力消费/报告产出的实弹形态见 1.2.0 台账首批数据）；四项新能力的实弹
> 首考列入持续验证台账待入项。

### Added
- **Intent 意图运行时（编排层）**：handoff 契约第五载体 intents（id/direction/status[pending|completed|abandoned]/spawned_from）——worker 收尾自声明（可选 intents.json），跨 run 只继承 pending；注入优先级带=低于 facts 复验、高于新 leads（与 leads[未验证假设]语义互斥：leads=有证据没验，intent=已决定方向）。
- **Advisor 第二视角（编排层）**：验证连败 ≥3 次（可配）触发——同模型新开干净上下文（历史摘要+失败序列+硬边界+上轮建议防重复），只输出建议不执行工具；建议落 workspace/advisor.md（主 worker 可读面）+handoff leads（origin=advisor 传承，防重复同一死法）。
- **竞速验证（编排层，默认关）**：repro findings[].variants（≤5 组 steps 变体）并行重放——先 pass 者胜、败者结果弃置入档（evidence race✓ 行）；与机械验证互补，ECC 可疑时多策略同答=环境可疑旁证。
- **修复后复测（编排层）**：remediated.json 人工/上游修复标记（run workspace）+`first-run --retest <run 目录>`——facts∩标记机械重放（零 worker 零 LLM）；语义对偶=falsified 证伪防复测 / remediated 修复后复测（exit 3=存在复测失败）。

### Changed
- prompt.md 产出契约表加可选 intents.json 行（worker 收尾方向声明——不写=无方向继承）。

### 池登摘要（R-25~R-29，详见 docs/roadmap-1.2.0.md）
资产图跨任务共享/报告证据与局限字段/长 run 记忆压缩/auto-fix 造修复（攻不守定位观察项）/渐进式披露三层加载。

## [1.2.0] - 2026-10-17

> 1.2.0 语义=P1 产品环（复战→抗欺骗→交付——R-05/R-03/R-04）。
> **包面诚实口径**：产品环为编排层（仓内 scripts/xring）能力——npm 包面不含该层，
> 本版发布为版本对齐语义（npm 版本与仓内里程碑同步）；包文件集与 1.1.0 全同。
> **验证口径**：离线合成 e2e 七断言闭环（复战环：消费/注入/falsified/ECC 单轮/跨轮漂移/
> 报告分面/基线再产出）+三轨全绿=机制级证据；实弹面转持续验证台账（ECC 真实目标
> 假阳率/handoff 复战效用/报告面实弹产出=台账待入项）。

### Added
- **跨 run 接力（R-05，编排层）**：handoff 契约（xring/handoff@1）——认识论标签制四载体（facts 已验证/leads 未验证假设/falsified 已证伪/env 路径级指纹基线）；reflow 收尾自动产出 handoff.json，first-run `--from-record` 消费注入（leads 以假设形态注入复验不采信；falsified 入排除表防复测；无 handoff=首战零注入向后兼容）。
- **环境一致性检验 ECC（R-03，编排层）**：tarpit/形态突变 **advisory 信号**（非硬闸）——单轮异构路径指纹趋同/同路径双探翻转（L-3 冻结判据）+跨轮指纹漂移（消费 handoff 基线）+CSP 外部 origin（L-4）；信号入任务书注入+环境画像+报告 caveat，worker 据此自行降档（`--no-ecc` 逃生）。
- **报告自动化（R-04，编排层）**：run 收尾 verified findings → 三外部格式（butian/vulbox/edu-src，docs/report-templates/ 字段映射）自动产出至 run 目录 report/；**分面规则**=外部面只吃已验证 findings，ab-report.md 内部面吃全量（含 leads/falsified/环境评估/接力消费摘要/caveat）。

### Fixed
- selfcheck 扩面至 8 检（+R-05 契约与注入语义/R-03 L-3 判据/R-04 分面——纯函数离线判据）。

## [1.1.0] - 2026-10-16

> 1.1.0-alpha 转正（latest 移动至本版；alpha dist-tag 保留指 1.1.0-alpha）。
> **诚实口径**：L-1 验证率线（A 级机械验证率 ≥70%）因第三轮靶场形态突变（tarpit
> 特征，A 级真漏洞零出现、仅 2 条 info 环境特征）悬置——分母缺失使该线无现场语义，
> 工具未被考到而非考砸。自本版起转为**持续验证契约**：此后每次实弹验证率入
> docs/devlog.md 台账，1.1.1 兑现定谳。换目标冷启动 1m37s（线 15min）与零 /tmp 手写
> 两线达标；验证机器本身经离线合成 e2e 闭环实证（AUTH 合成链/TLS 双模式/reflow
> env.tls 载体全链真网络重放入图）。

### Added（承 1.1.0-alpha 全量）
- verify-runner TLS 分层：repro `env.tls`（insecure 子进程隔离路径/ca 注入）——https 自签靶场机械验证恢复（E11a#1）。
- verify-runner AUTH 原语：`AUTH <loginPath> <credRef> <tokenExtract>` 登录→token 会话链；凭据实体间接引用，token 进程内存零落盘（E11a#2）。
- first-run 目标参数化：`--target/--scope/--task-file/--record-root/--max-hours`（E11a#3）。
- reflow 条目级容错+超长 evidence 截断+`partial` 标记（E11a#4）。
- scope gate 端点白名单：三元组登记+循环变量展开+前缀匹配；黑名单面零豁免（E11a#5）。
- 回流 ID 对账闸：三集合一致性校验+漂移拒落+孤儿差集审计（E11a#7）。
- DSH 0.2.0-rc.2 兼容：会话文件候选表前插 v4 代（0.1.x 零行为变化）。
- **repro schema `findings[].env` 载体补全（本转正批）**：design#1 契约要求的新增可选字段落 schema——env.tls 发现可带 TLS 模式入回流管道（此前 schema additionalProperties 拒收=管道内恒 manual 的断链；离线合成 e2e 闭环实证 A 级直写）。

### Fixed
- E11b：GRAPHD 值启动校验+brainDir 归一守卫（宿主配置面真修，行为零变化）；4-3a 切点断言行号锚→内容锚。
- E13：mocha 挂死根修（xring-p1 真子进程弃管→killAllWorkers 收割+有界等 close）——ci 摘除 `--exit`（技术债到期），套件时长方差收敛。
- E14-B：selfcheck #2 凭据探针外置（`P2P_SCAN_NEEDLE` env，SWEEP-1 同款模式；原版真值字面量入库+管道 rc 恒 0 双缺陷）。

### Security
- AUTH 失败语义：登录/token 提取失败整单转 manual 且标 `auth-failure`（不降级）；凭据全链零落盘零回显（承 alpha）。
- E11b：GRAPHD 配置注入面 fail-closed 启动校验（协议白名单+host 非空）。

## [1.1.0-alpha] - 2026-10-15

> 预发布版（npm dist-tag=alpha；latest 保持 1.0.1 不动直至 Phase 3 实弹验收达标转正）。

### Added
- verify-runner TLS 分层：repro `env.tls`（insecure 子进程隔离路径/ca 注入）——https 自签靶场机械验证恢复（E11a#1）。
- verify-runner AUTH 原语：`AUTH <loginPath> <credRef> <tokenExtract>` 登录→token 会话链；凭据实体 `~/.d2d-data/creds/<eng>.env` 间接引用，token 进程内存零落盘（E11a#2）。
- first-run 目标参数化：`--target/--scope/--task-file/--record-root/--max-hours`，无参缺省零行为变化（E11a#3）。
- scope gate 端点白名单：task-file 内嵌 `allowed_endpoints` 三元组登记，循环变量展开模拟后前缀匹配放行；黑名单面零豁免取严（E11a#5）。
- 回流 ID 对账闸：handoff/repro_paths/图内三集合一致性校验，漂移整场拒落+差集报告（E11a#7）。
- DSH 0.2.0-rc.2 兼容性支持：会话文件候选表前插 v4 代会话名（v4/v3/旧名回退序，0.1.x 下零行为变化；dsh-022 盘点零 blocking 并入）。

### Fixed
- 回流条目级容错：单条 schema 失败不再拖死整文件——超长 evidence 截断（总长含尾标≤上限）+`partial` 标记入图（E11a#4）。

### Security
- AUTH 失败语义：登录/token 提取失败整单转 manual 且标 `failure_class: auth-failure`（不降级为无凭据伪验证）；凭据值全链零落盘零回显（E11a#2 伴生，A0a 修正）。

## [1.0.1] - 2026-10-09

### Security
- 召回窗内脱敏补扫落地（SWEEP-1）：站点情报样例出库（迁本地经验库 `D2D_SITE_PATTERNS` 路径）、engagement ID 注释级形式化（7 处注释/文档；测试夹具与运行时字面量按豁免表保留）、运营计数注释脱目标化。
- scan-clean 门禁接线：泄露面扫描命中退出码修正（exit 1）+入库面（git 跟踪文件）语义+规则精修；`verify-main` 消费接线（目标名单走环境变量，不入代码/CI）。
- Mimosa 运行态确认零公开面（gitignore+包白名单双挡，豁免表登记）。

### Fixed
- lockfile 版本与 package.json 同步（1.0.0 发布时序遗漏）。
- graphd 引擎描述更新（ladybug 转正后事实）。

**零功能变更**：代码行为与 1.0.0 逐字节等价（除版本号与注释/文档字符串）。

## [1.0.0] - 2026-10-09

### Added
- 三环并行自主渗透测试框架首个公开发布（发现/深度攻击/创造探索三类 agent 并行竞速+graphd 图黑板+观测面板）。
- X-Ring 受控自主测试通道：任务书契约/预算双路径熔断/verifyRunner 机械重放（证据链 pass+独立复现分层标注）/held 人工裁决回灌（adjudicate held-finding）。
- 引擎分轨定型：生产 ladybug + 测试双轨（kuzu/ladybug 全量等值书档）。
- 报告交付三平台字段映射样例（补天/漏洞盒子/教育 SRC，脱敏版，docs/report-templates/）。

### Security
- 写面分级（worker 结构化写/host-only 裁决面）+OPSEC scope 门（engagement 上下文 fail-closed）。
- worker env 白名单双层剥离（进程级 strip+spawn 级 buildWorkerEnv——host 凭据面零残留）。
- egress-gateway 出口治理（resolve once/connect validated+CONNECT 端口 pin+硬黑面）。
- 双签验证链（dual_sign 状态机+disputed 人工仲裁闭环）+审计四面 append-only。

[Unreleased]: https://github.com/wufufu770/d2d/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/wufufu770/d2d/compare/v0.3.0...v1.0.0
