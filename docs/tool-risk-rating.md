# 工具风险评级表（41 工具 × 风险等级 × 门覆盖现状 × 出网通道）

> 来源：4-2-0 前置审计（dwfrun-d838b762）· 静态核验口径

- 定位：d2d 阶段 4-2 路线 A（LLM 审批层的前置规则源）文档 1/5。纯规则资产，零代码；本表是分级路由（4-3/4-4/4-6）的工具侧输入。
- **风险等级** = 可逆性 / 权限 / 影响三因子的函数：
  - **高**：任意执行、任意出网或横向扩展，且无 d2d 门；
  - **中**：有副作用但部分受约束（工具体内组合门 / 认证 / 额度 / 作用域受限）；
  - **低**：只读或会话内状态，无门、无公网出网；
  - **特殊档**：不在 headless worker 工具面（宿主专用管理面 / 平台禁用 / 默认不挂载），单列评级并注记，不参与 worker 侧分级路由，也不进入 4-2 档位词表（见 docs/tier-depth-mapping.md）。
- **门覆盖现状**：该工具当前实际经过的运行时门（checkBash 链 / gateEgress 工具体内组合门 / 个体级软约束 / 无门）。headless 下宿主兜底已被置空（`~/.dsh/profiles/headless/cordis.patch.yml:58-64`：sandbox=danger-full-access 与 approval=never 成对钉死），故本列即各工具当前**唯一**的运行时约束面。
- **出网通道**：`curl 类`（走 env 代理 + checkBash）/ `gateEgress 组合门`（体内 synthCurl 再注入 checkBash）/ `Node 原生`（进程内 fetch 直连，绕过 env 代理）/ `无公网出网` / `不适用（未挂载）`（未挂载工具无出网面可言）。两类结论见文末「出网通道两类」。

## 评级表（41 行，工具名逐个可 grep）

| # | 工具 | 风险等级 | 门覆盖现状 | 出网通道 | 依据（4-2-0 审计锚点） |
|---|---|---|---|---|---|
| 1 | bash | 高 | checkBash 链（41 工具中唯一） | curl 类（env 代理 + checkBash） | 唯一过 checkBash 链：`adapter-dsh.mjs:15` wireGate → `scheduler.js:148-165` scope/denylist → tool-policy 限速熔断；deny-only 文本匹配，编码/变量/落盘执行等绕过面仍在；headless 下宿主兜底被置空（danger-full-access + approval=never），d2d 门是它唯一运行时门 |
| 2 | web_fetch | 高 | 无门 | Node 原生（绕过 env 代理） | `dsh-tool-web/lib/index.js:737`（注册行；web_fetch 不在 dsh-tool-fs 包——该包全文 0 命中，原审计误标已复核修正，见文末复核注记）；Node 侧直连不吃 http_proxy env = 绕过 V-08 egress-gateway 注入路径；宿主层仅『公网 HTTP(S)+地址 pinning』注释且未逐行验证 |
| 3 | web_search | 高 | 无门 | Node 原生（绕过 env 代理） | 注册行 `dsh-tool-web/lib/index.js:262`；API key env 处理在另一包：`dsh-web-search-deepseek/lib/index.js:243` `DEFAULT_API_KEY_ENV = "DEEPSEEK_API_KEY"` 直连（两锚勿混） |
| 4 | subagent | 高 | 无门（横向扩展面） | 继承派生 agent 全工具面 | `dsh-tool-subagent/lib/index.js:398`（注册上下文）；派生 agent 继承全工具面 = 权限放大 |
| 5 | subagent_fork | 高 | 无门（横向扩展面） | 继承派生 agent 全工具面 | `dsh-tool-subagent/lib/index.js:398`；派生 agent 继承全工具面 = 权限放大 |
| 6 | workflow | 高 | 无门（多 agent 编排） | 编排派生面 | `dsh-tool-workflow/lib/index.js:144` 多 agent 编排 |
| 7 | ralph | 高 | 无门（固定循环） | 循环执行面 | `dsh-tool-ralph/lib/index.js:301` 固定 64 轮循环 |
| 8 | write | 中 | 无门 | 无公网出网 | `dsh-tool-fs/lib/index.js:597` 任意路径写，无门 |
| 9 | edit | 中 | 无门 | 无公网出网 | `dsh-tool-fs/lib/index.js:742` 任意路径写，无门 |
| 10 | burp_repeater | 中 | gateEgress 工具体内组合门 | gateEgress 组合门（synthCurl 注入 checkBash） | 熔断 → synthCurl 注入 checkBash → 20 req/min 滑窗（`gate.mjs:18` `BURP_DEFAULT_RATE_PER_MIN = 20`）→ burp-audit.jsonl 审计，`tools/gate.mjs:59-86`——治理最好的出网面 |
| 11 | burp_intruder | 中 | gateEgress 工具体内组合门 | gateEgress 组合门（synthCurl 注入 checkBash） | 同上：熔断 → synthCurl 注入 checkBash → 20 req/min 滑窗 → burp-audit.jsonl 审计，`tools/gate.mjs:59-86` |
| 12 | job_kill | 中 | 无门 | 无公网出网 | `dsh-tool-jobs/lib/index.js:305` |
| 13 | send_message | 中 | 无门 | 无公网出网 | dsh-tool-subagent-control 包，操控后台子 agent |
| 14 | interrupt_agent | 中 | 无门 | 无公网出网 | dsh-tool-subagent-control 包，操控后台子 agent |
| 15 | skill | 中 | 无门 | 无公网出网（指令注入面） | `dsh-tool-skill/lib/index.js:60`，技能文件=指令注入面 |
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
- 门覆盖现状列的完整缺口登记（write/edit 无门、Node 原生直连、仅 bash 过链）见 docs/gate-coverage-gaps.md 三条主缺口。

## 复核注记（4-2 撰写批实证）

- web_fetch 注册锚：任务附件原文作 `dsh-tool-fs/lib/index.js:737`；本轮实测 dsh-tool-fs 全文 `web_fetch` **0 命中**、该包 `:737` 为 edit 工具 systemPrompt 段（`applyEditTool`），`dsh-tool-web/lib/index.js:737` 才是 `name: "web_fetch"` 注册行——本表采用实测修正值。
- `dsh-tools` 版本按 `package.json` 实测为 **0.1.5-rc.1**，与审计「0.1.5-rc.1 实装核验」一致。
- 两个 cordis.patch.yml 勿混：`~/.dsh/profiles/headless/cordis.patch.yml`（宿主部署稿，70 行；`:58-64` = sandbox=danger-full-access + approval=never 成对切换；`:13-21` 为 MiniMax 模型配置）≠ `@deepseek-ai/dsh-headless/cordis.patch.yml`（包实装补丁，DSH_TOOLS_MODE 旋钮 `:16`、code-runtime insert `:18-21`）。grep 全部 `~/.dsh/profiles/**/*.yml` 无 DSH_TOOLS_MODE/code-runtime。
- p2p_start 依据勘误：初稿误写『杀全部 worker』（实为 p2p_stop 行为，`index.js:95-96`『停止全部渗透 worker 并冻结当前 engagement』）；p2p_start（`index.js:70`）为启动 engagement。评级结论（高/特殊档）不受影响。
- 未能在本轮定位到行级锚、按审计原文收录（不加锚）：宿主层『公网 HTTP(S)+地址 pinning』注释（审计自述未逐行验证）、pwsh 非 win32 禁用守卫行。
