# d2d 继任 Agent 协议

> 本文件是任何 AI 会话接手 d2d 的入口。读完本文件 + docs/roadmap.md +
> docs/state.md + docs/do-not-touch.md，即可开始工作。
> 信源分级：仓库代码 > 本文档体系 > 任何对话记忆。冲突时以仓库为准。

## 一句话定位
d2d 是 Agent 的 Harness——以 dsh 插件形式运行，编排多个 dsh Agent 完成渗透测试
任务，在 Agent 层面实施上下文管理、工具接口、约束、验证、纠正和持续进化。
架构与能力详见 README 与 ARCHITECTURE.md。

> **上游关系**（据源码实锚，非推测）：本仓 `plugin/pentest-dsh/scheduler/` 下 9 个
> 模块的头行统一标注 `p2p-core/scheduler/<name>.mjs — 纯代码搬移自 scheduler.js`，
> 且 `plugin/pentest-dsh/index.js:2` 注明 adapter 由「p2p-core sync-out 分发」
> —— 即**调度内核源自 p2p-core、经 sync-out 落入本仓**，本仓是分发侧。
> 两仓的同步方向、分支策略、以及 p2p-core 是否仍在演进，**仓内无据**；
> 涉及该边界的问题须另行取证，不得凭本条推断。

## 接手协议（新会话第一步，按序执行）
1. `git fetch && git log --oneline -5`，对照 docs/state.md「当前底账」；
   不一致以仓库为准，并向用户报告差异
2. 通读本文件 + docs/roadmap.md + docs/state.md + docs/do-not-touch.md
3. 按 README "For Other Agents" 段确认测试基线可复现
4. 向用户确认当前批次；无指示时按 docs/state.md「下一步建议」推进
   （**取「梯队状态」节内唯一标注「当前唯一有效」的那条**；其余并存条目均已
   标注「历史·…时点，已完成」，表示该批已完成、其建议已作废，不得取）
5. 红线：未读完 docs/do-not-touch.md 前，不得实施任何变更

## 全局硬约束
| 约束 | 内容 |
|------|------|
| 单机 | 全部设计须在一台个人主机运行，不引入额外设备 |
| 中文优先 | 当前阶段中文；双语仅 SECURITY.md 破例（终批） |
| 自用优先 | 团队/社区为推广期规划，不为未来过度设计 |
| 多 engagement | 用户可控同时运行数量（maxEngagements） |
| 零成本测试 | 测试须零成本（本地模型或免费额度） |

## 批次推进规范
阶段 N：N-0 前置审计（只读）→ 拍板 → N-1 批次1 → CI 绿 → N-2 批次2 → …
→ N-x 收尾（flake/清账/开放项）。批次划分不预设，按依赖与风险定；
互不依赖可并行，强依赖串行；发现新问题可插临时批次（HD-1 即插队批先例）。

## 门禁规范
前置审计完成 → 拍板 → 才实施；实施 → CI 绿 → 才进下一批；
CI 红 → 止损 → 拍板（重跑/修/切）。

## 网络重试规范
push 前探针（git ls-remote）→ 失败等 30s 重试最多 3 次 → 成功才 push →
push 中断记录原因、探针确认后重试 → 连续 8 次失败停下回报 →
gh run watch 盯梢单次 ≤15min。

## Mimosa L3 门处理（关键先例，违反=事故）
实施员 commit 被拦 → 停在变更就绪、移交提交；工作流脚本走 harness（world.run）
通道落 commit。绝不 --no-verify。28H+9M 存量项零触碰。
根因：子代理 Bash 走 hook，world.run/harness 通道不经。

## 分支管理
主干 main。每完成一个大阶段：从 main 拉 feature 分支 → 完成即合回 →
合流后立即删分支 → 阶段性打 annotated tag。禁止长期驻留 feature 分支。
历史实验分支经 archive/<名> tag 保留回滚点。

## CI 与测试
mocha 超 10 分钟需分片（现未分片，单命令全量）。测试三轨：
pytest（graphd 门负例，tests/test_graphd_gates.py 等 6 文件）/
plugin/pentest-dsh mocha（allocator/scope/sanitize/validator/failover/knowledge）/
plugin/d2d-panel（面板）。基线数字见 docs/state.md，基线不降是门禁。
mocha 通道瞬断（-1）按先例手动实锚 + CI 全量最终裁决。
每阶段收尾打 tag + 回滚演练。

## 关键先例（触发场景 → 操作 → 注意）
1. mocha 瞬断：门禁阶段连续 -1 而 pytest 正常 → 手动复现同款调用确认全绿 →
   收尾工作流落 commit → CI 最终裁决。勿因 -1 判代码失败。
   （HD-1 补记：T3-1 曾现非纯瞬断——validator L1 mock 用例被本机存活 cdp-proxy
   劫持通道所致，环境依赖型失败；排查时先想「本机服务存活改变代码路径」。）
2. .gitignore *.jsonl 吞文件（.gitignore:11）：评测集/种子被静默忽略 →
   补 !<路径>/*.jsonl 例外科径入库（T1-4 先例）。git status 全程看不见 ignored 文件。
3. 白名单升级裁决：实施员撞门禁白名单（词表/常量类合法伴随）→ 正确 escalate →
   授权断言同步 + amend 白名单 → 续跑（约 10 分钟重入）。
4. AmendWorkflow 缓存回放：修订运行原样回放首次失败 → 微调 runner code
   字符串强制 live 执行。
5. manifest 收口：manifest commit 被 pre-commit 全仓扫描拦（28 存量）→
   收口员保持工作树不动 → manifest commit 由工作流 world.run 通道落。
   regen 口径：`git -c core.quotePath=false ls-files`（去 manifest 自身）全量哈希，
   末尾锚定段（# 开头 node_modules 钉版本段）原样保留。
6. 网络探针：见「网络重试规范」。Connection reset by peer 常见。
7. Mimosa L3：见专节。落库工作流用 `git -C <repo>` 传参（world.run 无 cwd 选项）。
8. lease-cas-watchdog flaky：CI 红为单条超时 → gh run rerun --failed 照先例；
   已知 timing flaky，文件在禁区绝不碰；累计两次、多批未复发，持续观察。
9. 测试污染口径：本机 logs/audit.log 与 logs/transition-log.jsonl 聚合全部
   graphd 实例（含 pytest 临时实例）；聚合统计须按 id 真实形状过滤
   （经验 id = exp-<12位hex>，eng_id = eng-MMDD-* 日期形态），见
   docs/brain-audit-runbook.md §四。
10. 新 CLI/入口脚本主流程守卫：凡可能被测试 import 的脚本（CLI/网关/server）必须带
   `import.meta.url === pathToFileURL(process.argv[1]).href` 守卫包住直跑主流程 ——
   否则 CI import 时执行主流程体（T3-2-3 实证：burp-export 直跑缺 host-token 抛
   ENOENT 三连红）。T3-2-3 教训固化为固定纪律（scripts/mcp/d2d-mcp-server.mjs 等
   同款）；mocha 调用通道 = `cd plugin/pentest-dsh && npx mocha "test/*.test.mjs"`
   （插件本地 node_modules，仓库根 npx 会拉错版本）。
   【T3-3-3 扩充口径】凡新面与 CI/异构环境共享，随守卫一并带两件：①环境依赖读取
   带 seam（token/dir/路径类读取支持 env 或参数注入，缺省回落真实文件——本机文件
   掩盖 CI 缺文件的失败已四现：graphQuery token seam/vizEng 吞错等，写新面时先想
   「CI 没有这个文件会怎样」）；②吞错必须记因（catch 不得静默空串——降级语义的
   原因进返回值/审计/日志，供排障与 fail-closed 分流）。
11. 宿主侧子 agent 协作（T3-3-0 常设授权）：授权场景白名单六类——前置审计并行化/
   独立复核/禁区比对交叉验证/回报冷读/信息检索（CI 日志等只读提取）/CI 失败根因调查，
   越界须回报说明理由；任务包四要素（目标/边界[只读或可写面，绝不碰清单同样生效]/
   材料[路径、SHA、清单原文]/输出格式）缺一不派；每批软上限 4（超限回报），失败降级
   主 agent 自做留痕不重试轰炸；**采信纪律：子 agent 产出是报告不是事实——硬结论
   （禁区比对/数据可查性关键断言）主 agent 亲自取证复证，冲突以证据为准并记录分歧**；
   落库权集中（子 agent 不直接 commit/push）；回报含「子 agent 派发记录」节
   （数量/任务/结果采纳·降级·冲突/硬结论复证）。首例：T3-3-0 五项审计派 4 自做 1。
12. **落库环境分轨与批前同步（T4-2b 常设纪律，T4-2 实证背书）**：
   a) **批前同步**：一切批次开工前，真实工作仓 `git pull --ff-only` 至远端 HEAD 并
   `git log` 核对基线在位——并行会话撞车的成本（T4-2 实证：push 8 连败+两轮 rebase
   才救回）远高于一次 pull；
   b) **docs-only 校准/纯文档批**：允许从临时克隆直推 main，达标口径=fast-forward
   （无 force/amend）+ 远端三 workflow 绿 + `sha256sum -c manifest.sha256` 自校验通过；
   c) **涉代码/测试/数据/禁区对象批**：必须在真实工作仓经 Mimosa world.run 通道落库
   ——临时克隆无 hook，克隆直推=环境性绕过。
13. **重试型工作流的幂等性（EV-1 落库；T4-3-1 双重 reset 事故收口）**：重试型工作流中
   一切改变 git 状态的步骤（commit/软回退/tag）必须幂等——执行前检查目标态已达成则跳过；
   **软回退（reset --soft HEAD~N）在连续失败重试轮中会级联**（T4-3-1 实证：两轮重试各
   回退 5 笔=剥掉 4 笔已推送提交，内容沉入工作树成脏状态难以察觉，基座悄然换到过时提交）；
   回退类步骤禁止与数据变更步骤混排重试——重试前先核对当前 HEAD/基线再动手（先例 12a
   的展开条款）；AmendWorkflow 缓存按步骤文本匹配，改参即 live 重跑，门步骤统一纯
   exit-code 口径（stdout 捕获对部分子进程不稳，T4-2b/T4-3-1 两批实证）。
14. **测试夹具禁止硬编码本机绝对路径（T4-3-3-0 泛化 GW-2 HOME 事故）**：夹具中环境相关值
   （home/runs/dataDir 等）一律以 `os.homedir()`/env seam 与实现同源推导（如 gatewarden
   豁免正例与 scope.mjs runsBase 推导同源），不得写 `/home/<user>/...` 字面量——CI runner
   HOME 不同必翻红。判别口径：**被实现的环境相关逻辑读取比对的值=违规**；测试注入向量
   （osHome 显式参数/mock 虚拟路径，实现不读真实环境）=合法。落库时以
   `grep -rn "/home/" tests plugin/*/test` 扫描并逐条按口径审查。
15. **存储引擎观察期纪律（LBD-2 切换批设立，2026-10-04 生效，观察期 ≥2 周）**：
   生产 graphd 已翻转为 LadybugDB（unit 三件 Environment，原 kuzu_db 零写保留=回滚资产，
   见 docs/lbd2-cutover-record.md）。观察期内两条常设：
   ① **每批 agent 批开工 A 层新增"L1 快照 vs 切换基线"对比项**——stability-view 产出与
   docs/lbd2-cutover-record.md §观察期基线（RSS ~167MB/9 线程/错误计数 0）对表，越带即
   停批回报；
   ② **观察期内 graphd 查询面代码变更批，push 前本地双轨全量**（缺省 kuzu+ladybug 各
   pytest 414，合计约 3 分钟；ladybug 轨要件=系统 python user 层 `ladybug==0.21.2`+
   `LBUG_C_API_LIB_PATH=$HOME/lib/ladybug/liblbug.so.0.21.2`）。
   缺省引擎翻转+kuzu 退役复评=观察期满 clean 后另批（WRAP-4 或 micro-batch）。
16. **证据与清单的提交态一致性（XR-P2 双教训固化，2026-10-06 生效）**：
   ① **实录/smoke 类证据必须出自已提交代码**——或标注来源版本 SHA 且在提交后复跑覆盖
   （XR-P2 事故：smoke 实录出自提交前工作树迭代版，提交版回归为挂起形态，三次复跑全挂
   才暴露）；执行口径=代码族全部 commit 之后再跑 smoke，实录 json 内标注 HEAD SHA。
   ② **manifest regen 一律最后一步，且 regen 前工作树无 untracked**——`git ls-files`
   不含 untracked 文件，先建文件后 regen 才能入完整性锁（XR-P2 事故：regen 时
   view.xring.js/xrp2-smoke-hang.md 尚未 track → 漏收，B 层复核才发现）；执行口径=
   `git add -A` 先行（或确认 status 无 ?? 项）→ regen → `sha256sum -c` 自校验 →
   全集核对（ls-files vs manifest 条目 comm 为空）→ commit。
17. **钩子禁用旗标=违反 L3 门纪律（XR-P4 固化）**：任何钩子禁用形态（`--no-verify`/
   `core.hooksPath` 重定向/同族手段）视同违反 Mimosa L3 门纪律——"已做后果分析"不构成
   合规依据；commit/push 一律走 world.run 工作流通道（先例 13），交互通道零禁用旗标。

## 提示词生成规范（给生成批次提示词的一方，人或 AI）
固定结构：进入[阶段号] → 背景 → 拍板决定（已授权决策直接执行）→
N-0 前置审计（5-7 项只读，含输出与门禁）→ N-1..N 各子项（实施+子项门禁）→
测试（单元/集成/回归/全量，双轨基线）→ commit 拆分（按修复族）→
Mimosa L3 处理 → push+CI → 回报固定格式 → 绝不碰清单 → 边界 → 止损规则。
原则：前置审计是核心（不确认现状就实施必撞假设偏差）；拍板要明确；
门禁要硬；回归要全；绝不碰清单每批更新；止损要清晰；回报格式固定（跨会话继承）。

## 批次回报固定格式（收尾必用，含活文档更新）
---
**[阶段号] 结果**
**前置审计** / **实施** / **测试**（pytest/mocha/panel 精确数）/
**push + CI**（结果/三 workflow 判定/远端 HEAD/工作树剩余）/
**Mimosa L3 记录** / **批次状态**（完成度/是否进下一批）/
**状态文档更新**（docs/state.md 已更新至本批；清单有变则 do-not-touch.md 同步）/
**开放项**
---

## 活文档机制（HD-1 拍板确立）
- 每批收尾回报必须含「状态文档更新」节：更新 docs/state.md（HEAD/基线/梯队/开放项/
  决策账）；docs/do-not-touch.md 仅在清单变化时更新（新增禁碰须注明来源批次）。
- docs/roadmap.md 在梯队/批次状态变化时同步（已完成简记一行）。
- 机制本体由本节承载，回报格式已内置（见上节）。
- **单节原子更新**（文档校准批新增口径）：state.md「当前底账」是活文档里最易腐化的一节——曾出现
  同节内 HEAD 停在 T3-2-5 而基线已标「T3-3-2 固化」的分节更新产物。**单节内多字段须同批一次更新**，
  落库前按节自检一遍（HEAD / 分支 / CI / 基线 / 下一步五项同批对齐）。
- **清单类文档全量校验**（同批新增口径）：state.md「关键文件/脚本速查」、do-not-touch.md 禁碰清单、
  白名单类文档**不得抽样验证**——5 条抽查判「属实」会在全段 67 条时暴露漏项。须全量展开校验，
  且注意三种形态：花括号展开（`{a,b}.mjs`）、跨行续接、通配（`*.md`）。

## 给用户的后续会话开场白模板
「读仓库 AGENTS.md 接手 d2d，按 docs/state.md 当前状态继续，
本批任务：<任务>。」

## 新会话自检（落库后任何 AI 应能回答）
- 项目一句话定位是什么？
- 当前 HEAD / 测试基线 / 下一步批次是什么？（答案全在 docs/state.md）
- 本批会碰哪些禁区？（答案在 docs/do-not-touch.md）
- 回报用什么格式？（本文件）
答不上任何一条 = 文档体系有缺口，补完再开工。
