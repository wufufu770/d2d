# 门覆盖缺口登记（4-3 输入）

> 来源：4-2-0 前置审计（dwfrun-d838b762）· 静态核验口径

- 定位：d2d 阶段 4-2 路线 A 文档 5/5。登记 4-2-0 前置审计确认的门覆盖缺口，作为 4-3（门实现）的输入清单。纯登记，零代码。
- 工具档位与门覆盖现状的逐工具明细见 docs/tool-risk-rating.md；接入缝位见 docs/routing-integration-points.md。

## 三条主缺口（用户拍板）

| # | 缺口 | 风险 | 现状 | 建议落点 |
|---|---|---|---|---|
| ① | write/edit 任意路径写无门 | **高** | danger-full-access 下无 workspace 根限制——`dsh-tool-fs/lib/index.js:597`（write）/ `:742`（edit）任意路径写，无任何 d2d 门拦截 | 4-3 或 4-4 |
| ② | web_fetch / web_search 直连不吃 http_proxy env | **高** | 绕过 V-08 egress-gateway 注入路径（Node 侧进程内直连：`dsh-tool-web/lib/index.js:737`（web_fetch 注册）/ `:262`（web_search 注册），后者 API key env 处理在 `dsh-web-search-deepseek/lib/index.js:243`）；宿主层仅『公网 HTTP(S)+地址 pinning』注释且未逐行验证 | 4-3 |
| ③ | 41 工具中只有 bash 过 checkBash 链 | **中** | checkBash/PreToolDecision 统一运行时门链仅覆盖 bash（`scheduler.js:148-165` 唯一接入，已核验）；其余 40 工具均不在门链上，其中仅 3 处存在**个体级软约束**（非门）：burp_repeater / burp_intruder 的 gateEgress 工具体内组合门（`tools/gate.mjs:59-86`）、p2p_graph 的体内 isReadOnlyCypher 双口径校验（不过 checkBash）、propose_direction 的 graphd 认证 + 会话额度 3（`frontier.mjs:48` `FRONTIER_PROPOSAL_CAP = 3`）——而 write/edit（任意路径写）与 web_fetch / web_search（Node 直连出网）等中高档副作用面**完全无门** | 4-3 |

## 附录：7 条次级 gap（审计全量）

| # | gap | 审计锚点 |
|---|---|---|
| 1 | parseToolPolicyCfg 白名单丢弃未知字段——配置加 `risk` 字段会被静默丢弃（分档配置无现成载体） | `plugin/pentest-dsh/domain/tool-policy.mjs:87-111` |
| 2 | 处置映射缺失——现仅 deny / 放行两态，无中低档处置（rewrite/降档/免批）落点 | tool-policy 与 checkBash 契约均为 deny-only 文本匹配 |
| 3 | 审批接口缺失——deny-only 端到端，`ask` 态在宿主 0 组合（`allowed-once` grep 0 命中），无服务时 ask 降级 deny | `lib/types/index.d.ts:414-426` / `:31`；见 docs/routing-integration-points.md |
| 4 | 无误报模式表——error-fingerprints 为唯一热更表先例（外置 JSON + mtime 缓存 + 白名单解析 + 失败回退） | 4-2 已定义表结构与种子：docs/false-positive-schema.md；运行时消费未实施（零代码批次） |
| 5 | ACTIVE/PASSIVE/限速/兜底四表互不对齐——无统一 per-tool profile，四套纪律各管一段 | 对应 tool-policy 限速熔断、gateEgress 限速、headless profile 兜底（`~/.dsh/profiles/headless/cordis.patch.yml:58-64`）三处分散定义 |
| 6 | 熔断失败口径 = 门拒绝次数而非真实执行结果——门放行即记成功清零，命令实际失败不进账 | `plugin/pentest-dsh/domain/tool-policy.mjs:4-6`（deny-only 契约下门层面唯一可观测信号） |
| 7 | 审计日志无 risk/tier 维度——scope-gate-eng / burp-audit / gate-log.md 均不含工具档位字段，事后无法按档位对账 | `scheduler.js:148-165`（scope-gate-eng）、`tools/gate.mjs:59-86`（burp-gate 审计）、gate-log.md（运行时审计 trail，`scheduler/gates.mjs:22` 落盘，非仓库文档） |

## 处置建议汇总

- 主缺口 ①② 落 4-3（写门 + Node 原生出网单独策略，见 docs/tool-risk-rating.md『出网通道两类』）；① 亦可由 4-4 以审批层兜底。
- 主缺口 ③ 的机制前提（事件层对全部工具派发、listener 自过滤可扩展）已由 docs/routing-integration-points.md 锚定；但审批两态约束（附录 gap 2/3）不解决，扩展后仍只有 deny/放行。
- 次级 gap 1（risk 字段被丢）是『把档位表外置进 tool-policy 配置』路线的直接阻塞项——档位表宜按 docs/false-positive-schema.md 同款外置热载表形态独立成表，而非塞进 parseToolPolicyCfg。
- 附录 gap 7 与 docs/tier-depth-mapping.md 的档位词表对齐后即可修复（审计行补 risk/tier 字段）。
