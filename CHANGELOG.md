# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.9.2] - 2026-11-14

> 面板可访问+图谱独立页+Linear 级降噪+测试夹具装配器批。npm 包面零变化（不发 tag 不触发
> release/npm）；d2d-panel 0.3.0→0.3.2、start-all.sh 运维面、测试夹具面。

### Fixed
- **面板浏览器信任栅栏 LAN 放行**（d2d-panel 0.3.1）：信任面=回环∪本机非内部接口地址
  （每请求现取）；sec-fetch-site/Origin 两层闸原样——伪造外部 Host 实测仍 403。
- **start-all.sh 过时面**：egress 等待/导出 8888→18888 缺省（P2P_PROXY_PORT 可覆盖）；
  WEB_HOST env（dsh 拒通配，LAN 绑定传具体接口 IP）；wait_port host/超时参数化（dsh web
  30s 冷启窗口）。

### Added
- **图谱独立页**（d2d-panel 0.3.1）：dsh 侧栏第二入口「d2d 图谱」（VizView 同组件全页直开，
  轮询/护栏/令牌全复用）；控制台/图谱双入口并存。
- **测试夹具装配器**（tests/test_graphd_gates.py）：`_node_ddl`/`_api_url` 具名 helper 收敛
  DDL/URL 拼接（装配结果与原串逐字节一致，行为零变；443 pytest 全绿）——扫描器噪音归零。

### Changed
- **面板 Linear 级降噪**（d2d-panel 0.3.2）：设计令牌层方角化（chip/btn 999px→5/6px）、卡题
  句式化（去 uppercase/字距装饰）、fail-closed 横幅三行→一行；~50 处标语/布道句/操作教学/
  次要括注砍除；桑基图例入图（布局即图例）。功能面对齐闸实证零削减（30 路由↔21 消费点）。

## [1.9.0] - 2026-11-14

> 1.9.0 里程碑=PLAN-2 提升批 B4-B7（superagent 深化+产品面+质量健康+智能化收尾）。版本步进
> 纪律延续（1.8.0→1.8.9 九 patch，本次 1.8.9→1.9.0 minor 进位）。全程本地零推送。

### Added
- **Eval 门 assessor 判级层**（workitems.mjs assess，superagent MasterAssessor 同形）：三态
  fail-safe（决策采信/规则回落/抛错 fail-closed 影子）；**decision 词表=规则词表**（词表错位
  真 bug 由测试抓出即修）；tick 注入缺省不传=纯规则零行为变化；宿主 LLM 判级接口预留。
- **webhook source 走 oast 通道**（零新入站端口）：POST /hook/workitems（X-Auth timingSafe
  Equal 常量时间比较 + kind 白名单 + body 上限）→ 规范化落投递箱（单一事实源路径，插件 tick
  拾取）；活体四态验证。
- **飞书/钉钉 Source 骨架**（cookbook 008 同形）：parseFeishuMessages/parseDingtalkPayload
  纯解析 + pollFeishu 轮询形态（tenant token env 直供，应用凭据流程归实现批）；env 注册位
  缺省关；钉钉差异如实登记（Stream 长连接形态，无 poll）。
- **资产反查可视化**：host backlinks 路由（?ref→已锚资产 / ?asset→发现+任务）+ Findings
  展开区"已锚定资产"chips。
- **报告导出 UI**：host report-export 路由（代理 src-export.mjs CLI）+ ConfigView 导出卡。
- **季度归档自动化**：graphd-archive.sh + d2d-archive.service/.timer + install.sh timer
  安装循环（1.8.0 段，此处补记）。

### Changed
- **工作台 DSW 风格对齐**：KPI/页签字体换用 `--dsw-font-xxs-12/xxxs-11/xs-13` 令牌族
  （better-sidebar 同源）；KPI 分显细化（待人工红/影子黄分色）。
- **前端深清洁**（砍标语/提示文字/次要标签）：App Bar "影子 on" chip / 空态长文案 /
  未锚定提示括号 / 导出卡 extra 说明——布局自解释替代文字提示。
- **AGENTS.md 增 E39 常设开发纪律节**（对齐机器闸/版本步进/推送纪律/前端文本纪律）。

### Fixed
- snapshot quarantine 查询 TIMESTAMP 混型（T4-3-2 迁移后遗留 Binder exception）→ 503 整体
  fail-closed 修复。
- **deployment 提醒**：kuzu_db.wal 残留会让 LadybugDB 拒开旧库——生产走 runbook §八
  EXPORT→IMPORT 迁移不可省（本地实测实证）。

### 内部
- E2E 驱动入仓 + 覆盖率基线（行 90.19%）+ align 闸 CI 化 + scheduler 禁区结构守卫四层断言
  （golden 16909bd7914f2b78）+ 裸吞分级登记（54 处 7A/47B）——测试基线 pytest 443 /
  mocha 2264 / panel 97 / align 3/3（30 路由↔21 消费点）。

## [1.8.0] - 2026-11-14

> 1.8.0 里程碑=PLAN-2 提升批 B1-B3（测试基建与存储收尾+实战效能两批）。版本步进纪律：
> 每确认更改 +0.0.1（1.7.0→1.7.9, 下一次更改进位 1.8.0）。全程本地零推送。

### Added
- **E2E 驱动入仓**（scripts/e2e/run.mjs）：五套件（align 静态对齐闸/a 数据面/b WorkItems
  生命周期/c 双图锚点/d engagement 启动流）+ 服务预检 + 退出码语义；`npm run e2e` /
  `e2e:align`。**对齐机器闸=E39 纪律的执行点**（28 路由↔19 消费点+5 动态白名单）。
- **覆盖率基线**：c8 接入 `npm run test:cover`；首跑**行 90.19% / 分支 75.53% / 函数
  93.64%**（95 文件）；基线与低覆盖热点入 docs/coverage-baseline.md。
- **季度归档自动化**：scripts/ops/graphd-archive.sh（EXPORT DATABASE→3 份滚动+失败不
  静默）+ d2d-archive.service/.timer（季度首月 03:00 Persistent）+ install.sh timer 安装。
- **TRANSPORT adapter 级自愈**（债项#3 收口）：E23 限流退避同构——非零退出且尾部含
  TRANSPORT 形态词→指数退避重试（缺省 3 次，env 可调）；spawnImpl 注入点（生产零变化）；
  契约 {code,text} 逐字保持；429 分支优先级不受影响。
- **cold_digest 大 brief 冷摘要**：恒等承诺（≤9KB 零改动）+ 分级压缩（falsified/negative/
  fp 白名单零压缩 > facts 截断 > leads 排序截断，迭代收敛+终极兜底）+ CLI + first-run
  接线（P2P_HANDOFF_CAP）——scheduler 禁区零触碰（输入侧）。
- **步数帽 per-ring 策略表**：P2P_MAX_STEPS_<RING> 覆盖 > 全局 > 60（env 缺省不过=零
  行为变化；E35 步数分布数据源）。
- **任务书两纪律块**（prompt.md 运行前提，禁词集 34/34 绿）：秘密/flag 同级计分排位
  前移 + 报告成稿同排位（预算 70% 强制点）。
- **报告强制点机器注入**：first-run 按 --max-hours×70% 注入收束成稿硬提醒。

### Changed
- **egress 网关缺省端口 8888→18888**（env P2P_PROXY_PORT 仍可覆盖；本机 Java 服务撞车
  实证）——网关/两 systemd 单元/install.sh/passive/adapter-dsh/cdp-proxy 缺省值/README
  同步十处。
- **AGENTS.md 增 E39 常设开发纪律节**：前后端对齐机器闸/版本步进/推送纪律/前端文本
  纪律/零推送本地作业形态。

### Fixed
- **snapshot quarantine 查询 TIMESTAMP 混型**（潜伏 bug，T4-3-2 迁移后遗留）：coalesce
  混 '' STRING 触发 Binder exception → snapshot 整体 503——空值兜底改 TIMESTAMP 字面量。

## [1.7.0] - 2026-11-13

> 1.7.0 语义=1.7.0 债项清偿批——复测三态会话 + 双图锚点（reArtex 语义移植第二批）。
> **版本纪律**：1.6.0→1.7.0 小步递增。**安全面纪律**：复测结论写回走既有 host-only
> /write/verification（append-only+去重门）；锚点写面新增 /write/anchors 同口径 host-only
> 幂等+双端引用 404 fail-closed；零入站端口面不变。

### Added
- **复测三态会话（scripts/xring/retest-tri.mjs）**：reproducible(仍可复现)|fixed(已修复)|
  unconfirmable(无法确认) 三态显式化——classifyRetest 纯映射（verify-runner pass/fail/manual
  词表→三态→/write/verification 既有枚举 pass/fail/held-unreviewed，未知词 fail-closed 归
  unconfirmable）；runRetest 编排（重放异常吞为 unconfirmable 照常写回，编排永不因重放异常
  失声）；与既有 retest.mjs(retestFacts 重放执行层, first-run 消费) 正交零触碰——本模块只做
  结论显式化+入图+工单闭环；CLI `--finding/--replay-result/--complete-workitem/--dry-run`。
- **WorkItems 复测执行面**：assigned 且 kind='retest' 工单 reconcile 自动派发复测 CLI
  （detached；去重=进程内 dispatched Set+done 态收敛+graphd 去重门三重幂等——跨重启至多
  重派一次, 结论零重复）；重放执行=外部执行器（payload.replay_result 显式携带）或缺省
  manual（无法确认——宿主侧无靶环境重放执行器, 诚实归人工）。
- **双图锚点（graphd 加性, reArtex 双图互查语义）**：FINDING_ON(Finding→Asset)/
  TOUCHED(Task→Asset) 两锚点边（CREATE IF NOT EXISTS 纯加性, 既有 12 节点表/八态机/
  actor+reason/host-only 认证零触碰）+ `/write/anchors` 写端点（host-only 幂等, 既有边
  零新建, 双端引用缺一 404 fail-closed）+ 资产反查查询形态（MATCH (f:Finding)-[:FINDING_ON]
  ->(a:Asset) 经既有 /query host-token 通道, 零新读端点）；graphd VERSION 1.7.0→1.8.0
  （schema 变更强制实例换装, preflight 版本握手）。
- pytest 7 例（test_graphd_anchors_e38.py：写边+反查/幂等/双端 404/参数校验/worker token
  403/schema 纯加性护栏）+ mocha 8 例（retest-tri.test.mjs：三态映射/编排异常吞/工单收口）。

### Changed
- graphd VERSION 1.8.0（见上）。

### 内部
- **债项再挂账（归后续批）**：cold_digest 大 brief 压缩（消费接线邻接 scheduler.js:570-618
  brief 组装序禁区, 需显式授权批）; 意图运行时契约（reArtex intent_guard/normalizer +
  progress receipts, 牵动任务书模板面）; 双图锚点面板可视化（资产反查卡）。

## [1.6.0] - 2026-11-13

> 1.6.0 语义=dsh 0.2.2 成对适配 + superagent 机制移植（事件驱动入口/工单状态机/影子模式）
> + dsh workspace 主面板全页 UI。**版本纪律**：1.5.2→1.6.0 小步大特性里程碑（包面真实增量）。
> **安全面纪律**：WorkItems 影子模式缺省开（主动触发只记录不派发）；拉式源零入站端口；
> 写面/范围门/出口治理三层不变。

### Added
- **WorkItems 事件驱动框架（superagent 机制移植）**：Source→Trigger→WorkItem 状态机
  （trigger_received→eval_queued→accepted|eval_shadowed|rejected|needs_human→assigned⇄
  needs_human→done|expired，迁移表 fail-closed 校验）；Eval 规则门四判（影子>源名单>作者
  名单>容量>accept，纯规则不调模型）；拉式源两类=文件投递箱（`$D2D_DATA_DIR/sources/inbox/`，
  处理完挪 .processed/）+ GitHub issues 轮询（`P2P_WORKITEMS_GITHUB`，水位去重）；影子模式
  缺省开（`P2P_WORKITEM_SHADOW=0` 解除）；注意力通知（needs_human/done 才说话，一次一个
  具体问题）走既有 notify webhook。模块 `workitems.mjs`（纯注入式可测）+ 单测 15 例。
- **面板 WorkItems 数据面**：host 半 `/d2d/api/workitems` GET 列表+摘要 / POST 人工迁移
  （迁移校验复用 workitems.mjs 跨包单源）；客户端「待人工」视图（影子/需人工置顶分列，
  放行/否决动作，健康态折叠）。
- **dsh workspace 主面板全页（d2d-panel 0.3.0）**：`ctx.slots.inject('main')` 全页注册 +
  `sidebar.panellist` 左栏图标（dsh-superagent-prototype panel 同机制）——态势/待人工/
  Findings/可视化/审批/链路/工具/审计/配置/XRing 十签顶栏导航，复用既有视图层（零新视图，
  轮询随激活签 visible 门控）；better-sidebar 侧栏 tab 保留为快捷入口（两形态并存）。
- client.inject 增加 layout/workspace/renderer/sidebar 四包（superagent 同款清单）。

### Changed
- **dsh 版本基线重锁（E37 批）**：六包 0.2.1-rc.2→0.2.2-rc.1（dsh-tools exports 面零破坏
  实证）；install.sh CLI pin 同步（行号守恒）；dsh-better-sidebar 0.24.1→0.31.1 成对升级
  （peers 钉 dsh ^0.2.2-rc.1 + cordis ^4.0.5 实证；兼容表 0.2.2 区间转当前基线）。
- **dsh 0.2.2 破坏性变更适配**：宿主移除 `webRuntime` 服务（0.2.1 尚有）——面板 host 半
  inject 去除之，trustedHosts 贡献面以空兜底替代（信任栅栏回环判定+同源闸保留，缺省
  127.0.0.1 绑定形态行为不变）。

### Fixed
- 面板主面板注册与侧栏解耦：betterSidebar 服务缺失时主面板仍注册（软依赖降级分层——
  tabs 跳过、main 槽位照常），测试覆盖两形态。

### 内部
- devlog E37 批登记；SIDEBAR_COMPAT_TABLE 第五行（0.2.2-rc.1↔0.31.1 当前基线）；
- **债项（归 1.7.0）**：双图锚点（graphd schema 邻接禁区，需显式授权批）；漏洞复测三态
  会话（verifyRunner 语义链，XR-G7 分层面）；reArtex 意图运行时契约/cold_digest。

## [1.5.2] - 2026-10-26

> 1.5.2 语义=dsh 0.2.1-rc.2 统一重锁（宿主升级引发的成对适配）+X-Ring 契约归一化前置闸+
> 平台-图对账旗标+夜链组件入仓。
> **版本纪律**：1.5.1→1.5.2 小步递增（大数字跳变仅限大版本迭代）。
> **加性纪律**：required: false 删除与数组类型形态改写均经语义等价论证（校验真值判断/
> 编译产物同形），worker 调用面零行为变化。

### Changed
- **dsh 版本基线重锁（E36-r0）**：六包 @deepseek-ai/dsh-* 0.1.1-rc.2→0.2.1-rc.2（与宿主 CLI
  内置版本对齐；dsh-tools exports 面逐字一致、defineTool(options) 签名不变——API 面零破坏
  实证）；install.sh CLI pin 同步（行号守恒）；dsh-better-sidebar 0.17.1→0.24.1 成对升级
  （兼容表 0.2.x 区间转当前基线，docs/dsh-sidebar-compat.md 同步注记）。
- **defineTool author DSL 收紧适配**：required 属性出现必须为 true（required: false 20 处
  全删——d2d 自家校验真值判断语义等价）；string[]/object[] 类型简写不再支持，改
  array+items 显式形态（items 位 object 显式 additionalProperties）。
- web profile 移除 dsh-sidebar-leap（0.3.2 为最新版但 peers 钉 client-runtime ^0.1.0-rc.8，
  被 0.2.x 宿主拒载——上游发兼容版后回加；导航增强件非功能依赖，panel 走 better-sidebar
  通道不受影响）。

### Added
- **契约归一化前置闸（E34-r0）**：normalizeRepro/normalizeHypotheses/normalizeLessons 纯函数
  （id 缺连字符稳定重映射/variants ≤5 裁切/枚举串场归位/时区补全，合规输入恒等零改动）
  接入 reflow 三段，归一履历 contract-normalized 事件入流；回放验收 39 项归一化全过。
- **平台-图对账旗标（E34-r0）**：first-run --score-panel 起跑基线+终态对账，分涨图零增触发
  platform-graph-divergence 告警（Goodhart 脱钩机器级监测）。
- **night-chain 组件入仓（E35-r2）**：scripts/ops/night-chain/（chain-wrapper.sh+seed-gen.py）
  ——4 槽链式无人值守（文档续接种子/治理五件/靶场健康预检/完成传播/周窗限流 park）。
- first-run 补 --max-tokens 旗标（cap 2M 拒绝不 clamp；E35-r1）。

### Fixed
- adapter-inprocess 测试 mock 对齐 0.2.x 事件词汇（assistant/message 事件必带
  stream: AssistantStreamRecord[]——dsh-session types 权威；真实 agent 产物自带该字段，
  生产路径无恙）。

### 内部
- manifest node_modules 段重生成（六包 0.2.1-rc.2 哈希 18 条）；verify-dsh-version
  SIDEBAR_COMPAT_TABLE 基线注记同步；pentest-dsh README 双轨说明注记 2026-10-26 重锁对齐。

## [1.5.1] - 2026-10-19

> 1.5.1 语义=ECC 判级校准+竞速变体契约形态示例修复+资产图数据层（M1）——小步迭代
> （版本纪律：1.5.1→后续 1.5.2/1.5.3 小步递增，大数字跳变仅限大版本迭代）。
> **加性纪律（升级零行为变化）**：ECC 校准缺省关闭等价于旧判级路径下无 401-JSON 证据
> 场景的判读（正常形态判 none 与旧口径一致）；资产图表为新增纯加性；契约示例修复=
> 文档面对齐（schema 权威零改动）。

### Added
- **资产图数据层**：Asset（目标级聚合）/EnvSnapshot（环境快照 append-only，双判级字段）/
  Verification（验证事件 append-only——"结论可被新验证推翻，历史不改写"）三节点+四边
  （HOSTS/SNAPSHOT/VERIFIED_BY/JUDGED_BY）+三写端点（host-only）+事件去重门（同
  run+kind+引用幂等拒重，重放安全）+编排侧 helper。
- **ECC 判级校准**：单轮判据的 401-JSON 在场性抵扣——多路径同指纹（SPA fallback 形态）
  与 tarpit 同形时，组外真实 auth 层证据使置信降档；跨轮漂移在"恢复向切换"上同型假阳的
  复合降档。正常形态判读 none 与旧口径一致（校准零干扰对照测试背书）。

### Fixed
- **竞速变体契约形态示例**：产出契约表补 variants 形态显式示例（字符串数组的数组——
  与 schema 强制形态对齐）+env 字段仅 https 自签靶需要的说明——此前引导语无示例导致
  worker 自然形态（对象数组）被 schema 整份拒收。
- selfcheck TLS 分层检自包含化（内建本地自签靶+仓内 fixture——零外部依赖）。

### 内部
- 公开面卫生：测试面靶场关联字面量代号化（语义等价零信息损失）+push 前扫描闸
  （scripts/ops/push-scan.mjs）+场验实录移出版本库跟踪。

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
