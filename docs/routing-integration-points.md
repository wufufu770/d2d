# 分级路由接入点锚定（当前事实 × 未来接入点）

> 来源：4-2-0 前置审计（dwfrun-d838b762）· 静态核验口径

- 定位：d2d 阶段 4-2 路线 A 文档 4/5。为 4-4（审批层）/ 4-5（渐进式信任）/ 4-6（审批形态）锚定可接入的宿主缝位。**只锚定不实施**：本文档描述现状与预留契约，不含任何代码改动。
- 消费的规则资产：docs/tool-risk-rating.md（工具档位）、docs/tier-depth-mapping.md（证据/审批档位）、docs/false-positive-schema.md（误报模式表）。

## 当前事实（0.1.5-rc.1 实装核验）

1. **PreToolDecision 三态**：`{kind:'allow'} | {kind:'deny', reason} | {kind:'ask', reason?}`——`@deepseek-ai/dsh-tools` `lib/types/index.d.ts:414-426`。`ask` 仅在审批服务返回 `allowed-once` 后放行，否则转为 deny。
2. **事件层派发恰一次**：`tools/pre-execute` 事件对**全部工具**各派发恰一次——`dsh-tools/lib/index.js:3116` prepareExecution（waterfall 派发，缺省 `{kind:'allow'}`）+ `dsh-tools/lib/invariant.js:68-71`（`tools/pre-execute repeated for one execution` 穷举校验）；PTC 折叠例外默认不挂载（默认 native 工具面无此路径）。
3. **d2d listener 现状（自过滤只拦 bash）**：三处挂载点均在 listener 内自过滤 `exec.name === 'bash'`——`plugin/pentest-dsh/adapter-dsh.mjs:15`、`adapter-inprocess.mjs:48` 与 `:231`。**扩展分级路由到其他工具只需改 listener 过滤条件（`exec.arguments` 全可见），非宿主限制**。
4. **ApprovalService 缝存在但当前无组合**：dsh 宿主包 `lib/` 中 grep `allowed-once` / `get('approval')` 均 **0 命中**（4-2 复核实测）——缝未接；无审批服务时 `ask` 降级 deny（`lib/types/index.d.ts:31` 区域：missing approval support turns `ask` into denial）。
5. **headless profile 钉死 approval=never**：`~/.dsh/profiles/headless/cordis.patch.yml:58-64`，sandbox=danger-full-access 与 approval=never 成对切换——自主 worker 无 answerer，**高危人工批需新通道或异步审批队列**（形态见 docs/tier-depth-mapping.md sync/async 边界）。

## 未来接入点（4-4 / 4-5 / 4-6 用，只锚定不实施）

| 接入点 | 契约/位置 | 归属 |
|---|---|---|
| registerGate 目标契约 union | `{action:'deny'\|'rewrite', ...}`——4-1 `docs/hook-design.md:211` 已预留（deny-as-rewrite 为 A-1 落点，本批不实施） | 4-4 消费：改写型处置的升级路径 |
| ApprovalService 缝 | 宿主 ApprovalService API 存在（PreToolDecision `ask`/`allowed-once` 契约，types:414-426）但 0 组合 | 4-4 建立：接通后 `ask` 才可成为可用处置态 |
| 分级路由消费档位表 | listener 内扩展过滤后，按 docs/tool-risk-rating.md 档位 + docs/tier-depth-mapping.md 审批形态分流；误报模式表（docs/false-positive-schema.md）作 deny 前判别：**仅当模式完整命中（判别式含内置 guard 全部通过且 `routingSafe=true`）才自动降低档；guard 任一失败一律升高档人工批**——禁止实现成『命中即降档』（否则 guard 失败的命中会被自动放行），判别细则以 docs/false-positive-schema.md 种子条目为准 | 4-3/4-4 |
| 渐进式信任账本 | 审批账本动态归纳模式，写入 false-positive-schema 的 `source:"ledger"` 侧，优先级 `ledger > static` | 4-5 |
| 异步审批队列 | headless 无 answerer 的人工批通道：高档=阻塞同步（需新通道）/中=异步+幂等键（派生口径见 docs/tier-depth-mapping.md『中档幂等键派生口径』）/低=免批 | 4-6 |

## 扩展路径三步（只锚定，不实施）

1. **改 listener 过滤**：三处挂载点（`adapter-dsh.mjs:15`、`adapter-inprocess.mjs:48`、`:231`）把 `exec.name === 'bash'` 的自过滤扩展为按 docs/tool-risk-rating.md 档位的工具集合；`exec.arguments` 全可见，无需宿主配合。
2. **加档位表消费**：listener 内引入档位查表（工具档位 → 处置档位 → 证据深度），误报模式表作 deny 前判别。
3. **接审批通道**：高档走 ApprovalService 缝（4-4 建立组合）或异步审批队列（4-6 定形态）；中档异步+幂等键（派生口径见 docs/tier-depth-mapping.md）；低档免批落审计。

## 约束记录

- `ask` 在无 ApprovalService 时等价 deny（types:31）——审批通道未建立前，分级路由的可用处置态只有 deny/放行两态（缺口见 docs/gate-coverage-gaps.md 附录『处置映射缺失』『审批接口缺失』）。
- PTC 折叠例外默认不挂载：`tools/pre-execute` 门覆盖以默认 native 工具面为口径（run_code 仅 DSH_TOOLS_MODE=ptc/both 时挂载；旋钮锚在 dsh-headless 包实装补丁 `@deepseek-ai/dsh-headless/cordis.patch.yml:16`/:18-21，宿主部署稿 `~/.dsh/profiles/headless/cordis.patch.yml` 不含该旋钮，见 docs/tool-risk-rating.md 特殊档）。
