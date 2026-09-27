# 工具风险评级表（41 工具 × 风险等级 × 门覆盖现状 × 出网通道）

> 来源：4-2-0 前置审计（dwfrun-d838b762）· 静态核验口径

- 定位：d2d 阶段 4-2 路线 A（LLM 审批层的前置规则源）文档 1/5。纯规则资产，零代码；本表是分级路由（4-3/4-4/4-6）的工具侧输入。
- **风险等级** = 可逆性 / 权限 / 影响三因子的函数：
  - **高**：任意执行、任意出网或横向扩展，且无 d2d 门；
  - **中**：有副作用但部分受约束（工具体内组合门 / 认证 / 额度 / 作用域受限）；
  - **低**：只读或会话内状态，无门、无公网出网；
  - **特殊档**：不在 headless worker 工具面（宿主专用管理面 / 平台禁用 / 默认不挂载），单列评级并注记，不参与 worker 侧分级路由，也不进入 4-2 档位词表（见 docs/tier-depth-mapping.md）。
- **门覆盖现状**：该工具当前实际经过的运行时门（checkBash 链 / d2d 门链（pre-execute 三态门：write/edit=gateWriteEdit，T0-C-2；本批 7 高危工具=classifyToolGate，T1-3-1）/ gateEgress 工具体内组合门 / 个体级软约束 / 无门）。headless 下宿主兜底已被置空（`~/.dsh/profiles/headless/cordis.patch.yml:58-64`：sandbox=danger-full-access 与 approval=never 成对钉死），故本列即各工具当前**唯一**的运行时约束面。
- **出网通道**：`curl 类`（走 env 代理 + checkBash）/ `gateEgress 组合门`（体内 synthCurl 再注入 checkBash）/ `Node 原生`（进程内 fetch 直连，绕过 env 代理）/ `无公网出网` / `不适用（未挂载）`（未挂载工具无出网面可言）。两类结论见文末「出网通道两类」。

## 评级表（41 行，工具名逐个可 grep）

| # | 工具 | 风险等级 | 门覆盖现状 | 出网通道 | 依据（4-2-0 审计锚点） |
|---|---|---|---|---|---|
| 1 | bash | 高 | checkBash 链 + d2d 门链（pre-execute handler） | curl 类（env 代理 + checkBash） | 唯一过 checkBash 链：`adapter-dsh.mjs:15` wireGate → `scheduler.js:148-165` scope/denylist → tool-policy 限速熔断；deny-only 文本匹配，编码/变量/落盘执行等绕过面仍在；headless 下宿主兜底被置空（danger-full-access + approval=never），d2d 门是它唯一运行时门。『41 工具中唯一』自 T0-C-2/T1-3-1 起仅指 checkBash 链：write/edit 与本批 7 工具同过 pre-execute d2d 门链（checkBash 链本身仍唯 bash） |
| 2 | web_fetch | 高 | d2d 工具门（classifyToolGate 三态：非 http/https scheme deny 硬规则/其余 ask 档；T1-3-1） | Node 原生（绕过 env 代理） | `dsh-tool-web/lib/index.js:737`（注册行；web_fetch 不在 dsh-tool-fs 包——该包全文 0 命中，原审计误标已复核修正，见文末复核注记）；Node 侧直连不吃 http_proxy env = 绕过 V-08 egress-gateway 注入路径；宿主层仅『公网 HTTP(S)+地址 pinning』注释且未逐行验证 |
| 3 | web_search | 高 | d2d 工具门（ask 档；T1-3-1） | Node 原生（绕过 env 代理） | 注册行 `dsh-tool-web/lib/index.js:262`；API key env 处理在另一包：`dsh-web-search-deepseek/lib/index.js:243` `DEFAULT_API_KEY_ENV = "DEEPSEEK_API_KEY"` 直连（两锚勿混） |
| 4 | subagent | 高 | d2d 工具门（ask 档，横向扩展面事前审批；T1-3-1）+ subagent-cap 账本观测面（T0-C，只计数不拒绝） | 继承派生 agent 全工具面 | `dsh-tool-subagent/lib/index.js:398`（注册上下文）；派生 agent 继承全工具面 = 权限放大 |
| 5 | subagent_fork | 高 | d2d 工具门（ask 档；T1-3-1；非独立工具——fork 经同一 subagent 工具 args.provider='fork' 选路，门键 exec.name='subagent'）+ subagent-cap 账本观测面（T0-C） | 继承派生 agent 全工具面 | `dsh-tool-subagent/lib/index.js:398`；派生 agent 继承全工具面 = 权限放大 |
| 6 | workflow | 高 | d2d 工具门（ask 档，多 agent 编排；T1-3-1）+ subagent-cap 账本观测面（T0-C） | 编排派生面 | `dsh-tool-workflow/lib/index.js:144` 多 agent 编排 |
| 7 | ralph | 高 | d2d 工具门（ask 档，固定循环；T1-3-1）+ subagent-cap 账本观测面（T0-C） | 循环执行面 | `dsh-tool-ralph/lib/index.js:301` 固定 64 轮循环 |
| 8 | write | 中 | d2d write/edit 门（gateWriteEdit 三态：deny 硬规则/ask 档/allow；T0-C-2，index.js gateWriteEdit） | 无公网出网 | `dsh-tool-fs/lib/index.js:597` 任意路径写，无门 |
| 9 | edit | 中 | d2d write/edit 门（gateWriteEdit 三态；T0-C-2，index.js gateWriteEdit） | 无公网出网 | `dsh-tool-fs/lib/index.js:742` 任意路径写，无门 |
| 10 | burp_repeater | 中 | gateEgress 工具体内组合门 | gateEgress 组合门（synthCurl 注入 checkBash） | 熔断 → synthCurl 注入 checkBash → 20 req/min 滑窗（`gate.mjs:18` `BURP_DEFAULT_RATE_PER_MIN = 20`）→ burp-audit.jsonl 审计，`tools/gate.mjs:59-86`——治理最好的出网面 |
| 11 | burp_intruder | 中 | gateEgress 工具体内组合门 | gateEgress 组合门（synthCurl 注入 checkBash） | 同上：熔断 → synthCurl 注入 checkBash → 20 req/min 滑窗 → burp-audit.jsonl 审计，`tools/gate.mjs:59-86` |
| 12 | job_kill | 中 | 无门 | 无公网出网 | `dsh-tool-jobs/lib/index.js:305` |
| 13 | send_message | 中 | 无门 | 无公网出网 | dsh-tool-subagent-control 包，操控后台子 agent |
| 14 | interrupt_agent | 中 | 无门 | 无公网出网 | dsh-tool-subagent-control 包，操控后台子 agent |
| 15 | skill | 中 | d2d 工具门（ask 档，指令注入面；T1-3-1） | 无公网出网（指令注入面） | `dsh-tool-skill/lib/index.js:60`，技能文件=指令注入面 |
| 16 | propose_direction | 中 | graphd worker 级认证 + 会话额度 3（`frontier.mjs:48` `FRONTIER_PROPOSAL_CAP = 3`） | Node 原生（graphd 写） | `tools/frontier.mjs:110`，graphd 写 + worker 级认证 + 会话额度 3 |
| 17 | read | 低 | 无门（只读） | 无公网出网 | dsh-tool-fs |
| 18 | read_image | 低 | 无门（只读） | 无公网出网 | dsh-tool-fs |
| 19 | glob | 低 | 无门（只读） | 无公网出网（本地 ripgrep 子进程） | dsh-tool-fs-search，ripgrep 子进程 |
| 20 | grep | 低 | 无门（只读） | 无公网出网（本地 ripgrep 子进程） | dsh-tool-fs-search，ripgrep 子进程 |
| 21 | job_output | 低 | 无门（只读） | 无公网出网 | dsh-tool-jobs |
| 22 | job_list | 低 | 无门（只读） | 无公网出网 | dsh-tool-jobs |
| 23 | p2p_status | 低 | 无门（只读） | graphd 只读查询（非公网） | `plugin/pentest-dsh/index.js:46` |
| 24 | p2p_graph | 低 | 工具体内 isReadOnlyCypher 双口径校验，但不过 checkBash | graphd 只读查询（非公网） | `plugin/pentest-dsh/index.js:53`，体内 isReadOnlyCypher 双口径校验但不过 checkBash |
| 25 | burp_http_log | 低 | 无门（只读） | 零出网 | 零出网 |
| 26 | burp_decoder | 低 | 无门（纯变换） | 零出网 | 零出网 |
| 27 | burp_comparer | 低 | 无门（纯对比） | 零出网 | 零出网 |
| 28 | burp_scan_status | 低 | 无门（只读） | 零出网 | 零出网 |
| 29 | todo_write | 低 | 无门（会话内状态） | 无公网出网 | 会话内状态 |
| 30 | get_goal | 低 | 无门（会话内状态） | 无公网出网 | 会话内状态 |
| 31 | create_goal | 低 | 无门（会话内状态） | 无公网出网 | 会话内状态 |
| 32 | update_goal | 低 | 无门（会话内状态） | 无公网出网 | 会话内状态 |
| 33 | exit_plan_mode | 低 | 无门（挂载注记：常驻注册，非门） | 无公网出网 | `dsh-plan-mode/lib/index.js:229` 常驻注册 |
| 34 | list_agents | 低 | 无门（只读） | 无公网出网 | 只读列举 |
| 35 | list_subagent_models | 低 | 无门（只读）；条件挂载 | 无公网出网 | 条件挂载：modelSelectionPolicy 存在时 |
| 36 | p2p_start | 高（特殊档：不在 worker 面） | worker 面不可达（isWorkerProfile 排除，`index.js:42/:66/:136`） | graphd 写（宿主主会话专用） | `plugin/pentest-dsh/index.js:70`，宿主主会话专用管理面：启动一次三环渗透 engagement（攻击入口面）——实质高风险但 worker 拿不到，评级标高 + 『不在 worker 面』注记（停止全部 worker 是 p2p_stop 的行为，勿混） |
| 37 | p2p_stop | 高（特殊档：不在 worker 面） | worker 面不可达（isWorkerProfile 排除） | graphd 写（宿主主会话专用） | `plugin/pentest-dsh/index.js:95`，停止全部 worker 并冻结 engagement，实质高风险但 worker 拿不到 |
| 38 | p2p_eng | 高（特殊档：不在 worker 面） | worker 面不可达（isWorkerProfile 排除） | graphd 写（宿主主会话专用，直写 Engagement） | `plugin/pentest-dsh/index.js:107`，宿主主会话专用管理面，实质高风险但 worker 拿不到 |
| 39 | pwsh | 高（特殊档：本机不挂载） | 非 win32 禁用（审计口径，守卫行未逐行定位） | 不适用（未挂载） | 非 win32 禁用，本机不挂载（dsh-tool-pwsh 包存在） |
| 40 | ask_user_question | 特殊档（不挂载，无评级） | 包存在但无挂载行 | 不适用（未挂载） | dsh-tool-ask-user 包存在，但 dsh-base / dsh-headless patch 均无挂载行（dsh-base/cordis.patch.yml 仅提示语提及，非注册行） |
| 41 | run_code | 高（特殊档：默认不挂载） | 仅 DSH_TOOLS_MODE=ptc/both 挂载；默认 native 不挂载 | 不适用（未挂载） | 旋钮锚在 dsh-headless 包实装补丁：`@deepseek-ai/dsh-headless/cordis.patch.yml:16`（`mode: !!js process.env.DSH_TOOLS_MODE`）+ `:18-21`（按需 insert code-runtime）。注意：宿主部署稿 `~/.dsh/profiles/headless/cordis.patch.yml`（70 行）**不含**此旋钮——两个 cordis.patch.yml 勿混 |

档位小计：高档 7（bash、web_fetch、web_search、subagent、subagent_fork、workflow、ralph）· 中档 9（write、edit、burp_repeater、burp_intruder、job_kill、send_message、interrupt_agent、skill、propose_direction）· 低档 19（read、read_image、glob、grep、job_output、job_list、p2p_status、p2p_graph、burp_http_log、burp_decoder、burp_comparer、burp_scan_status、todo_write、get_goal、create_goal、update_goal、exit_plan_mode、list_agents、list_subagent_models）· 特殊档 6（p2p_start、p2p_stop、p2p_eng 评级标高但『不在 worker 面』；pwsh、ask_user_question、run_code 本机/默认不挂载）。7+9+19+6 = 41。

## 出网通道两类（表尾结论）

1. **curl 类**：走 env 代理 + checkBash。bash 内的 curl/网络命令属此类；burp_repeater / burp_intruder 经 gateEgress 把请求合成 synthCurl 再注入同一条 checkBash 链（`tools/gate.mjs:59-86`），叠加熔断、20 req/min 滑窗与 burp-audit.jsonl 审计。egress-gateway 的 env 注入路径（V-08）对这类**有效**。
2. **Node 原生类**：web_fetch（`dsh-tool-web/lib/index.js:737`）、web_search（注册 `dsh-tool-web/lib/index.js:262`；API key env 处理 `dsh-web-search-deepseek/lib/index.js:243`）、propose_direction 的 fetch（graphd 写）。进程内直连，**不吃 http_proxy env，绕过 egress-gateway 注入路径**——需单独策略（缺口登记见 docs/gate-coverage-gaps.md 主缺口②）。

（其余工具无公网出网；subagent / workflow / ralph 自身不直接出网，经继承/编排/循环放大下游工具面。）

## 一致性与下游

- 档位词表（高/中/低）与 docs/tier-depth-mapping.md 的证据档位同名同序：工具风险档位决定其发现/操作的处置档位，处置档位决定证据深度与审批形态；『特殊』不进入该词表。
- 本表驱动的 listener 扩展路径（改过滤 → 加档位表消费 → 接审批通道）见 docs/routing-integration-points.md。
- docs/false-positive-schema.md 的 `routingSafe` 语义锚定本表档位，落点唯一：模式完整命中（判别式含内置 guard 全过）才允许把处置自动路由为低档（异步免批）；`routingSafe=false` 的命中（含账本归纳）与 guard 任一失败一律升高档（阻塞同步审批），误报模式维度无中档落点。
- 特殊档 6 工具不在 headless worker 面，不参与 worker 侧分级路由；其评级（p2p_start/p2p_stop/p2p_eng 标高）仅作宿主侧风险记录。
- 门覆盖现状列的完整缺口登记（write/edit 无门、Node 原生直连、仅 bash 过链）见 docs/gate-coverage-gaps.md 三条主缺口（登记为 4-2 时点静态快照：write/edit 自 T0-C-2、本批 7 工具自 T1-3-1 起已有 d2d 门，见文末批记；job_kill/send_message/interrupt_agent 等仍无门）。

## 复核注记（4-2 撰写批实证）

- web_fetch 注册锚：任务附件原文作 `dsh-tool-fs/lib/index.js:737`；本轮实测 dsh-tool-fs 全文 `web_fetch` **0 命中**、该包 `:737` 为 edit 工具 systemPrompt 段（`applyEditTool`），`dsh-tool-web/lib/index.js:737` 才是 `name: "web_fetch"` 注册行——本表采用实测修正值。
- `dsh-tools` 版本按 `package.json` 实测为 **0.1.5-rc.1**，与审计「0.1.5-rc.1 实装核验」一致。
- 两个 cordis.patch.yml 勿混：`~/.dsh/profiles/headless/cordis.patch.yml`（宿主部署稿，70 行；`:58-64` = sandbox=danger-full-access + approval=never 成对切换；`:13-21` 为 MiniMax 模型配置）≠ `@deepseek-ai/dsh-headless/cordis.patch.yml`（包实装补丁，DSH_TOOLS_MODE 旋钮 `:16`、code-runtime insert `:18-21`）。grep 全部 `~/.dsh/profiles/**/*.yml` 无 DSH_TOOLS_MODE/code-runtime。
- p2p_start 依据勘误：初稿误写『杀全部 worker』（实为 p2p_stop 行为，`index.js:95-96`『停止全部渗透 worker 并冻结当前 engagement』）；p2p_start（`index.js:70`）为启动 engagement。评级结论（高/特殊档）不受影响。
- 未能在本轮定位到行级锚、按审计原文收录（不加锚）：宿主层『公网 HTTP(S)+地址 pinning』注释（审计自述未逐行验证）、pwsh 非 win32 禁用守卫行。

## 缺口③情况C 补账本（T0-C 批，2026-09-27）

> 口径：只追加不改写。上表 41 行评级与「门覆盖现状」列为本批前的静态核验原值；本节记载缺口③中情况 C 的账本已落地。

- **范围**：缺口③（41 工具中只有 bash 过 checkBash 链；定义实体 docs/gate-coverage-gaps.md:14，本文件交叉引用行 :75、评级表本体 :11/:18-58，subagent 行=:21）中的**情况 C**——审计实证 worker 进程内 spawn 的宿主子代理结构性不进 d2d 容量账本（d2d 计数点全部位于 runWorker 内部，只认调度器自派 worker；scheduler.js:752/:716/:749 注册/删除、dispatching :264/:268、_verifyLive :753/:717/:750）。
- **实现**：`plugin/pentest-dsh/scheduler/subagent-cap.mjs`（纯函数判定核心 + 进程内账本单例）+ 两处既有文件最小接线（`index.js` 组合层 / `scheduler/gates.mjs`）。
- **工具路径计数**（上表 #4/#5/#6/#7：subagent / subagent_fork / workflow / ralph）：经宿主 spawn 事件 hook（`dsh-subagent/lib/index.js:210` `subagent/start` / `:199` `subagent/end`，identity.runId 唯一、start/end 严格成对，创建失败无边=不计）在 index.js 组合层挂计数——**只计数不拒绝**（拒绝须把 subagent 塞进 GATED_TOOLS/adapters 门链=禁区，未做；超发留 runLog `subagent-cap-breach` 轨迹）。这 4 行的「无门（横向扩展面）」自此补上**账本观测面**；风险等级评级本身不变。
- **bash 嵌套路径**（worker 继承父 env + 凭据 symlink，实证 adapter-dsh.mjs:199/:148，会话内 `dsh --profile headless <task>` 可拉起第二个宿主）：index.js 门组合层新增嵌套 dsh 调用判定（classifyNestedDsh，**checkBash 契约本体零改动**——规则加在组合层），账本满 → deny 回执（硬规则不随 P2P_APPROVAL_MODE 灰度降级；行为矩阵见 subagent-cap.mjs 头注与 commit body）。
- **共享硬顶**：live(子代理) + workers + dispatching < MAX_AGENTS + CAP_VERIFY + 2 —— 与 `domain/gates.mjs:97-101` canSpawnDualSign 总量闸同式（含 +2 松弛，较双签预述多一项松弛已在审计中更正）；MAX_AGENTS/CAP_VERIFY 读 env 与 `scheduler.js:75/:77` 同源同式。双签派发（gates.mjs applyVerifyResults）与 respin 处**并列容量判定**——既有 dual-sign 语义零变化（canSpawnDualSign 判定式/入参逐字未动，账本零计数时并列门恒真=行为逐字节等价）。
- **开关与持久化**：`P2P_SUBAGENT_CAP=off` 整体旁路（计数/判定/bash 规则全停=接入前行为）；`P2P_SUBAGENT_CAP_PERSIST=1` 可选 D2D_DATA_DIR 子树切片合计（跨进程，缺省关）。进程生命周期内计数为主，重启清零——子代理生命周期短，重启即无孤儿，清零是保守方向（只可能暂时多放行、不会幽灵占坑）。
- **未覆盖残差（如实登记）**：①工具路径无拒绝（须动禁区，未做）；②backgrounded 嵌套 dsh 由占坑 TTL 全额持有（`P2P_SUBAGENT_RESERVATION_TTL_MS`，默认 20min）——提前退出多记、伪装前台少记，双向有界（记账面非对抗面）；③`sudo -u <user> dsh` 类带位置参数的包装命令漏判；④跨进程合计依赖可选持久化，缺省下调度器进程只见本进程账目（in-process 模式 P2P_INPROCESS=1 下账目天然同进程全可见）。
- **回归**：`test/subagent-cap.test.mjs` 49 例（含 canSpawnDualSign 现值零变化锚 + classifyNestedDsh 正反例 26 例）；全量套件 `npm test` 1314 passing / fail 0（含新增 49 例）。

## 缺口③门覆盖扩展批记（T1-3-1 批，2026-09-27）

> 口径：只更正「门覆盖现状」事实列与交叉引用，不重写表；风险等级列与 :60 档位小计不变。

- **范围**：缺口③残余（工具路径门覆盖）。本批把 `GATED_TOOLS`（`plugin/pentest-dsh/domain/write-gate.mjs`）从 {bash, write, edit} 扩为 10 名，追加 web_fetch / web_search / subagent / subagent_fork / workflow / ralph / skill（上表 #2-#7 与 #15）。三挂载点（`adapter-dsh.mjs` wireGate、`adapter-inprocess.mjs` 主会话 wireGate + worker 镜像 setup()）迭代同一集合，**adapter 零改动**自动扩展；事件层前提（dsh-tools `lib/index.js:3116` prepareExecution 对每次工具执行无条件 waterfall `tools/pre-execute`）已复核。
- **实现**：新分类纯函数 `plugin/pentest-dsh/domain/tool-gate.mjs` classifyToolGate（三态 {allow}/{ask,reason}/{deny,reason}，与 4-4 handler 返回值同构）：web_fetch 非 http/https scheme=deny 硬规则（任何 P2P_APPROVAL_MODE 生效），其余全 ask（出网/横向扩展/编排/循环/指令注入面；拿不准一律 ask）。编排 `index.js` gateToolCall 与 gateWriteEdit 同构：off（P2P_APPROVAL_MODE 缺省）ask 降级 allow+runLog `tool-gate-ask-downgraded` 警告；queue/native 走既有 ask 通路（buildTicket/enqueueTicket + adapter resolveAskGate 零改动）。registerGate handler 新分支位于 write/edit 分支之后、bash 分支之前——bash/write/edit 分支逐字未动（bash→checkBash 链、write/edit→gateWriteEdit、本批 7 名→gateToolCall 三路分流互斥）。4-4 原语层（approvals.mjs/makeAskGateResolver/maybeAsk）只 import 复用零改动；scheduler.js/adapters/validator/subagent-cap 零触碰。
- **off 矩阵（缺省=与扩展前行为一致）**：本批 7 工具扩展前不进门直接执行；扩展后 off 下 ask 档全部降级放行（null→adapter next()），行为不变，仅多 runLog 警告；唯一新增拒绝路径=web_fetch 显式非 http/https scheme deny 硬规则（不随灰度降级）。subagent-cap 事后计数与本门互补：门=事前审批，cap=事后账本（#4-#7 观测面保留）。
- **仍未覆盖（如实）**：job_kill / send_message / interrupt_agent（上表 #12-#14）仍无门（本批未纳入）；deny/ask 分类为名面+参数面文本判定，不校验 URL 目标归属（scope 归属仍由 checkBash 链/egress-gateway 在 bash 路径承担）。
- **回归**：`test/tool-gate.test.mjs` 14 例（集合精确断言/classifyToolGate 每工具三态正反例/gateToolCall off·queue·native 矩阵/三挂载点回归/index.js 接线静态锚）。
