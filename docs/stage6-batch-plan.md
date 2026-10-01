# 阶段 6 前置审计与拆批方案（T3-2-0）

> 只读批产出 · 审计基线: 远端 HEAD `51c941c`（BG-2 收官后）· 测试基线 368/1777/55
> BG-2 实锚复用: scheduler.js 2C 核心区 :607-617 + buildAgentStatus :791+（禁区区间以
> scheduler.js:14 头注释自证为准 [570,618] 删除行=0）；loop.mjs allocateOnce :395-431、
> scope 过滤 :417-423、BG-2 业务闸检查块 :423-435。行号为 51c941c 时点实锚。

## 一、七项审计结论

### 审计项 1 · 6-1 经验→技能

- **MUSE-AutoSkill 仓内零痕迹**：全仓（排除 node_modules/workflow-runs）仅 roadmap.md 一处提及——无设计稿、无半成品，属纯新建。
- **晋级机制可复用面**：三门禁 promote.mjs（结构/历史复盘/实战证据）与 Experience 隔离池（quarantined→active→deprecated，/write/experience-transition）都是**对象级**机制；per-skill `.memory.md` 是新存储形态（仓内 .memory.md 零命中）——需新建 skill 目录结构（建议 `~/.d2d-data/skills/<skill-id>/`：SKILL.md + memory.md）+ 复用 promote 门禁语义做 skill 晋级（staged→shadow→current 的 skill 版）。
- **角色-卡绑定现状**：`roles/` 目录 24 个专才 JSON（角色=人格+词表）；检索路由已按角色分流——`pickDiscoveryRole`（roles 实料+信号亲和）、`pickDeepRoleForSignals`（allocator.mjs:132）已存在；但 **experience-ref.mjs 注入侧无角色过滤**（grep role 零命中）——经验卡注入不分角色，全员同 brief。6-1 的"角色-卡绑定"=注入侧按 `pickXxxRole` 结果过滤卡（domain 字段已存在，v2 现 42 卡 domain 全空是数据缺口）。
- **缺口清单**：①skill 存储与晋级通道（新）②经验→技能的抽取触发与蒸馏流程（新，可复用 study.mjs 批蒸馏骨架）③domain 字段数据补齐④注入侧角色过滤。
- **实施面估计**：domain 层 2-3 新模块 + scripts/brain 1 CLI + experience-ref 一处注入过滤（禁区外）≈ 中批。

### 审计项 2 · 6-2 联网搜索

- **源现状**：crt.sh 被动子域**已落地**（scripts/recon/passive.mjs `crtshSubs`，20s 超时+5000 上限；collect.mjs Stage2 接线）。被动 DNS/其他 CT 源零落地。
- **免费源候选**：crt.sh（已用，免费无限但慢）；Hackertarget reverse IP/hosts（免费 API 日配额 ~20/host）；dnsdumpster 类需 key 不合零成本；结论=**crt.sh 扩展 + hackertarget 免费层**两源起步，被动 DNS 免费无 key 源稀缺（零成本相容结论：两源可行，全量被动 DNS 情报需付费 key——登记开放项不强做）。
- **egress 对接缺口**：passive.mjs 用裸 `fetch` **直连**，未经 d2d-egress 网关（网关强制面=经代理的连接层；宿主侧脚本直连不受管）。6-2 接入面=①被动源查询显式走 `P2P_PROXY_URL`（网关 scope 门+令牌桶+审计全覆盖）②网关模型 API 豁免名单机制（egress-gateway.mjs:37-42 先例）可容纳外部情报源白名单。**限速形态**：per-host 令牌桶已有，crt.sh 慢源天然适配。
- **Signal 入图路径**：collect.mjs:46 `/write/signal` 先例（asset-finger 类型）——外部情报信号扩 `osint-*` 类型族即可，graphd 信号类型是开放枚举（写入端五段 evidence 纪律照走）。

### 审计项 3 · 6-3 插件打包

- **五形态注册机制实锚**（index.js 薄壳）：
  | 形态 | 机制 | 现状 |
  |---|---|---|
  | Tool | `defineTool`（9 处注册）+ `createAuditedDefineTool`（description 基线钉扎+灰度审计，4-3d-1） | ✅ 成熟 |
  | Command | 插件 command 注册（宿主约定） | ✅ |
  | Agent | `inject: ['tools','commands','agents','shellEnv']` — ctx.agents 服务 | ✅（inprocess 用） |
  | Hook | `registerGate`（bash/write/tool 三门 handler）+ dsh hooks 配置 | ✅ |
  | MCP | 宿主侧 MCP client（@deepseek-ai/dsh-mcp-client 钉版本）为**消费端**；d2d 作为 MCP server 暴露=6-5 范围 | 部分 |
- **三攻击工具注册**：form-fuzzer/logic-tester/race-condition 均为可 import 模块+可执行 CLI 双形态；审批面已覆盖（approvals.mjs CDP 词表/isBrowserStateChange，T2-2b-4）。注册路径=index.js `defineTool` 包装三模块的编程接口 + description 基线入库。**纯接线批，风险低。**
- **Burp 互操作现状**：已有 burp_repeater/burp_decoder 工具（description-audit 钉扎）、post-execute-gate 优先级、runs/<eng>/burp 工件目录、run-log burp-gate/burp-repeater-save 事件。互操作候选=**工件级互通**：d2d findings 导出 Burp 可导入格式（XML/CSV）+ burp 工件入图归档——不做实时代理桥（超范围）。

### 审计项 4 · 6-4 环内 supervisor

- **现有基础**：adapter-inprocess.mjs（P2P_INPROCESS=1）——worker = `ctx.agents.create()` 组合的子 agent（同进程、独立 session/系统提示/上下文），**对 scheduler 契约与 adapter-dsh 完全一致**（spawnWorker/killAllWorkers/registerGate），调度器零改动即用。token 桥/bash 门/保险层已在子 agent scope 镜像。
- **与宿主层 agent 区别**：生命周期随 worker 任务（spawn→settle 必然收敛 H9）；scope 继承=engagement scope（经 worker token + graphd worker_query_allowed 门）；审批面归属=子 agent scope 内镜像宿主三门。**"运行中按需创建"缺的是决策面**：当前 worker 只能由调度环派发，worker 自己不能（也不应直接）创建子 agent——6-4 的实施面=①受控创建接口（经审批面 high 档+scope 强制继承）②容量账本挂接（subagent-cap.mjs 已有，T0-C 缺口③）。
- **触碰面**：创建调用点若由 worker 工具发起（defineTool）→ **不进 2C 禁区**；若由调度环自动创建（如 pivot 后自动补员）→ 进 loop.mjs tick 面（非禁区但敏感）。结论：**以 worker 工具形态实施可零禁区**，调度环自动创建留开放项按需另批。

### 审计项 5 · 6-5 双向 MCP

- **对外输出基础**：宿主 MCP client（消费端）成熟；d2d 作为 MCP server=新面。候选形态：stdio server 暴露只读能力（p2p_graph 只读查询 isReadOnlyCypher 已有+graphd worker_query_allowed 权威门复用）+ findings 摘要读取。**零图写入暴露**（写通道不外放是安全底线）。
- **对内发现**：动态发现外部 MCP server——机制候选=配置驱动（`~/.d2d-data/config/mcp-servers.json`）+ 健康探针 + 工具面动态挂载；**不建议**运行时自动发现（供应链面），配置文件即安全边界。
- **消毒链现状与缺口**：可复用——`sanitizeUntrusted`（外部文本入 brief 先例）、sanitize.js、graphd redact_pii 8 类+注入扫描（experience 写端同款）、worker_query_allowed 只读门。**缺口**：MCP 响应→图入写路径还没有统一"外部数据消毒器"编排（现有消毒散在各写端点内部）；6-5 需落一个域级 `sanitize-ingest.mjs`（MCP 响应→脱敏→注入扫描→标记 source=external→才可入图），供图黑板写侧强制调用。scope 继承=调用方 worker token 透传（inprocess token 桥先例）。

### 审计项 6 · 6-6 事件驱动并发

- **轮询链路时序**（实锚）：scheduler tick（loop.mjs 周期）→ `allocateOnce`（:395-431：容量算→pending 拉取→planAllocation 纯决策→scope 过滤→业务闸→runWorker）→ `runWorker`→`_runWorkerInner`（scheduler.js 派发点 :607-630 区）。
- **改订阅推送的脉络**：graphd（Kùzu）无原生 watch/SSE——"事件"只能靠①图内状态轮询加密（伪事件）②graphd 增加 event 端点（改动 graphd app.py=禁区+安全层敏感）③任务入队信号（/write/signal 触发宿主回调）。**结论：6-6 与现有架构存在实质冲突面**——真事件源需要 graphd 侧新通道（禁区），不引入则退化轮询换皮。**建议重议范围**：降级为"自适应轮询间隔"（空闲拉长/事件密集缩短，纯 loop.mjs 面）+闲时任务/能力路由先行（见下）——真订阅推送列为长期项待 graphd 事件通道立项。此为审计项 7"根本冲突"触发点之一，按止损规则单列回报。
- **闲时任务挂载点**：**已有三先例**——study watchdog（车道空闲触发）、`wake-creative-idle`（run-log 实证事件）、tick 面的 `assetConverged`/`engagementConverged` 判定（allocator.mjs:243/275）。闲时任务=在 tick 的收敛分支挂任务工厂，**零禁区**。
- **按能力路由挂载点**：`pickDiscoveryRole`/`pickDeepRoleForSignals` 已是能力路由雏形（roles JSON 实料）；缺的是**容量账本联动**（subagent-cap.mjs 已有账本）与角色表现回流（能力画像=roles JSON 加统计字段，experience-usage 先例）。挂闲时同批，零禁区。

### 审计项 7 · 依赖图与风险矩阵

```
6-2 联网扩源 ────────┐（独立）
6-1 经验→技能 ───────┤（独立；角色绑定用 6-x 无前置）
6-3 插件打包 ────┬───┤（独立；→ T4-5 发布前置：五形态导出即发布物）
                 └──→ 6-5 双向 MCP（共享宿主接口面：MCP server=五形态之一）
6-4 supervisor（独立面：worker 工具形态零禁区；调度环自动创建=另批）
6-6 事件驱动 ──→ 闲时任务+能力路由（同架构；6-6 本体与 graphd 冲突→重议范围）
```

| 子项 | 禁区触碰度 | 宿主耦合度 | 测试冲击度 | 综合 |
|---|---|---|---|---|
| 6-1 | 低（注入侧禁区外） | 低 | 中 | 低 |
| 6-2 | 低 | 低 | 低 | 低 |
| 6-3 | 低 | 高（五形态注册面） | 中 | 中 |
| 6-4 | 低（工具形态）/中（调度环形态） | 高 | 高 | 中高 |
| 6-5 | 低 | 高 | 高（安全面） | 中高 |
| 6-6 | **高**（真事件需 graphd 通道=禁区+安全层） | 中 | 高 | **高→重议** |
| 闲时+路由 | 低 | 低 | 中 | 低 |
| 前向依赖 | 6-3 → T4-5（发布物即五形态导出）；6-1 → T4-3 8-1（技能化是共识验证 v2 的素材面）；其余无 | | | |

## 二、拆批方案（docs/stage6-batch-plan.md 本体）

| 批次 | 范围 | 依据 | 依赖 | 并行性 | commit 族估 |
|---|---|---|---|---|---|
| **T3-2-1** | 6-2 联网扩源：passive.mjs 扩被动源（hackertarget 免费层）+ 走网关路径修正 + osint-* Signal 族 + 资产面消费 | 独立/低风险先行热身；crt.sh 已有骨架 | 无 | 可与 T3-2-2 并行 | 3 |
| **T3-2-2** | 6-1 经验→技能：skill 存储与晋级通道（复用三门禁语义）+ 抽取蒸馏流程（study 骨架复用）+ 注入侧角色过滤 + domain 数据补齐 | 独立；brain 链路 T3-1 认知最新鲜 | 无 | 可与 T3-2-1 并行 | 4 |
| **T3-2-3** | 6-3 插件打包：三攻击工具 dsh 注册（**顺手项挂此批**，开放项 13 销账）+ 五形态导出清单化 + Burp 工件互通（findings 导出） | 独立；description-audit 基线机制成熟 | 无（与 1/2 串行亦可） | 可并行 | 4 |
| **T3-2-4** | 6-5 双向 MCP：d2d MCP server（只读暴露）+ 配置驱动对内发现 + sanitize-ingest 消毒编排 | 强依赖 T3-2-3（MCP server=五形态之一，共享宿主接口改造） | T3-2-3 | 串行 | 5 |
| **T3-2-5** | 6-4 环内 supervisor：**worker 工具形态**（受控创建+scope 强制继承+审批 high+容量账本挂接） | 工具形态零禁区（审计项 4 结论）；调度环自动创建不进本批 | 无（建议在 3 后） | 串行（宿主耦合重） | 4 |
| **T3-2-6** | 闲时任务 + 按能力路由：tick 收敛分支任务工厂 + 角色表现回流画像 + 容量账本联动 | 审计项 6：先例齐备零禁区；**不依赖 6-6 本体** | 建议在 T3-2-2 后（角色绑定先行） | 可与 T3-2-4/5 并行 | 3 |

### 6-6 重议建议（止损规则触发，单列回报）

真"订阅推送"需要 graphd 事件通道（app.py 新端点=禁区+安全层敏感，且 Kùzu 无原生 watch），与现有架构实质冲突。**建议**：阶段 6 范围内不做 6-6 本体；以 T3-2-6 的闲时任务+自适应轮询（空闲拉长间隔/任务密集缩短，纯 loop.mjs）承接其收益的 70%；真事件通道登记长期项，待 T4-2 存储层决策后一并评估（若迁移 LadybugDB 可能原生支持 CDC）。

### 显式授权申请清单（按批；4-3a 格式）

- **T3-2-1..T3-2-4、T3-2-6：零禁区触碰，无授权申请**（T3-2-2 的 experience-ref 注入过滤与 T3-2-4 的 sanitize 编排均在禁区外；graphd 零触碰）。
- **T3-2-5（若含调度环自动创建切片）**：对象=loop.mjs tick 分支（非禁区但派发敏感面）；改动面=收敛判定后按 pivot 事件创建 inprocess 子 agent（复用 BG-2 业务闸检查同位形态）；理由=worker 工具形态无法覆盖"调度环自主补员"场景；风险与缓解=审批 high 档人工批+容量账本强制+P2P_SUPERVISOR=0 回退开关；回滚=单 commit revert。**默认本批不含此切片**——工具形态先行，调度环切片按实战观察另批申请。
- **6-6 本体（若坚持做）**：对象=graphd app.py 新事件端点——**超出本方案授权范围，未列入申请**，需重议。

### 门禁草案（每批）

| 批 | 前置审计重点 | 测试范围 | 回滚 |
|---|---|---|---|
| T3-2-1 | passive 源超时/限速实测 + 网关路径验证 | 源函数 mock + Signal 入图端到端 | 单 commit revert + osint 类型零污染（写端纪律） |
| T3-2-2 | skill 目录现状 + brain 三门禁复用面 | skill 晋级门禁全分支 + 注入过滤角色断言 | revert + skills 数据目录独立（删目录即净） |
| T3-2-3 | description 基线入库流程（4-3d-1） | 三工具注册断言 + 基线钉扎 + Burp 导出格式 | revert + 基线段 regen |
| T3-2-4 | MCP client 钉版本面 + 消毒链缺口复核 | server 只读门 + 消毒编排全分支 + 对内发现配置解析 | revert + 配置文件缺省关闭 |
| T3-2-5 | inprocess 契约面（审计项 4 实锚） | 工具审批 high + scope 继承 + 容量账本 + 开关三态 | revert + P2P_SUPERVISOR=0 |
| T3-2-6 | tick 收敛分支实锚 | 任务工厂幂等 + 画像回流统计 + 账本联动 | revert |

## 三、执行顺序建议

T3-2-1 →（T3-2-2 ∥ T3-2-3）→ T3-2-4 → T3-2-5 → T3-2-6。全部串行约 6 批；按并行标注压到约 4 个串行位。每批收尾走回报固定格式+状态文档更新；三攻击工具注册在 T3-2-3 销账开放项 13；闲时/路由挂 T3-2-6。
