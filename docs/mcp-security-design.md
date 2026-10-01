# T3-2-4 双向 MCP 安全设计定稿（6-5）

> 批次：T3-2-4（阶段 6 子批 4）。本文档是该批安全设计的**单一真相源**：
> 编排定稿 / 禁区比对 / 选型结论 / 开关矩阵 / 验收口径。
> 实现锚点：`plugin/pentest-dsh/domain/sanitize-ingest.mjs`、
> `scripts/mcp/d2d-mcp-server.mjs`、`plugin/pentest-dsh/domain/mcp-discovery.mjs`、
> `plugin/pentest-dsh/scheduler/external-tools.mjs`、`config/mcp-servers.json`、
> `config/mcp-export.json`。

## 0. 安全四底线 → 落地面映射（拍板原文 → 实现锚）

| # | 底线（拍板） | 落地面 | 锚点 |
|---|--------------|--------|------|
| 1 | 写通道不外放 | 工具面白名单仅两只读工具（readonly:true 结构证明）+ isReadOnlyCypher 预检（V-07 镜像）+ graphd host_query_gate 权威兜底 = **双保险**；写请求在预检即拒（零图 IO）+ auditEvent('write-rejected') 留痕 | d2d-mcp-server.mjs:19-22,34-47,62-72 |
| 2 | 不过 sanitize-ingest 链不入图 | `sanitizeIngestExternal` 统一编排：空/超长守卫→注入扫描（HIGH 丢弃/SOFT 告警）→sanitizeUntrusted 消毒→`[external:<source>]` 标记；任一步异常整条丢弃（fail-closed）；callExternalTool 返回值强制过链；collect.mjs osint 回补为第一次实战接线 | sanitize-ingest.mjs 全文；mcp-discovery.mjs:58-73；collect.mjs:54-77 |
| 3 | 配置即边界 | 只认 `config/mcp-servers.json` 清单；不合法配置 fail-closed 抛错拒绝发现；零运行时自动发现；缺省空清单=零注册（等价既有行为） | mcp-discovery.mjs:26-38；external-tools.mjs；config/mcp-servers.json |
| 4 | 双向各自可关 | `P2P_MCP_SERVER === '0'` → server 启动即退出；`P2P_MCP_CLIENT === '0'` → 发现与调用双双失效；均缺省启用、env 双覆盖（CLI 参数不参与开关）、对外/对内正交 | d2d-mcp-server.mjs:124-127；external-tools.mjs discoverMcpServers |

## 1. 前置审计五项结论（T3-2-4-0）

1. **选型**：对外 server 用**原生 stdio JSON-RPC 2.0（零 SDK 依赖）**。
   理由：MCP stdio 传输本质是换行分隔 JSON-RPC，最小协议面
   （initialize / tools/list / tools/call / ping / notifications）~60 行可实现；
   不引入 @modelcontextprotocol/sdk（重依赖，违反单机零成本约束）。
2. **graphd 只读实锚**：index.js `isReadOnlyCypher`（:39-41，V-07）为首词白名单
   （MATCH/RETURN/WITH/CALL）+ 变更关键字全文扫（MUTATION_RE 大小写不敏感）；
   graphd host_query_gate 的 CALL 禁令与 worker_query_allowed 为**权威兜底**——
   server 端镜像忠实原版语义（CALL 预检放行，不越权加严），双保险第二道由 graphd 承担。
3. **编排定稿**：消毒链序与失败语义见 §2；标记形态选型见 §3。
4. **禁区比对**：六禁区对象零交集（见 §6 比对表）；graphd 本体零触碰。
5. **dsh 消费端登记**：dsh 宿主当前无原生 MCP server 注册接口——对外 server 以
   独立 CLI 进程形态交付（`node scripts/mcp/d2d-mcp-server.mjs [--graph 8766]`，
   由用户/操作员按需挂接任意 MCP client）；对内 client 以 registerExternalMcpTools
   注册为 dsh worker 工具（`mcp_<server>_<tool>` 命名，description 标注
   "建议审批级别 high"+"sanitize-ingest 消毒"）。宿主原生接口出现后登记开放项跟进。

## 2. sanitize-ingest 消毒链（编排定稿）

```
外部原文 raw
  │ ① 空守卫（trim 后空 → 丢弃） + 超长守卫（> maxLen → 丢弃）
  │ ② 注入扫描 scanInjection（loader 词面 + HIGH 镜像词面）
  │     HIGH 命中 → 整条丢弃；SOFT 命中 → 放行但 alert 留痕
  │     （对齐 graphd gates.py EXPERIENCE_INJECTION_HIGH/SOFT 双档语义）
  │ ③ sanitizeUntrusted 消毒（指令文本视为数据/实体替换/maxLen 钳制）
  │     消毒实现缺失或抛异常 → 丢弃；消毒后为空 → 丢弃
  │ ④ external 标记：`[external:<source>] ` 前缀
  ▼
{ ok, text, alerts, via }  — ok=false = 整条丢弃（绝不放行半处理数据）
```

- **词表单点真源**：loader 词面与 Python 读端共读同一份 injection-patterns 文件；
  HIGH 镜像词面与 graphd gates.py `EXPERIENCE_INJECTION_HIGH` 同源语义
  （ignore instructions / disregard instructions / system prompt / you are now a /
  reveal your prompt 五族）。
- **source 归一**：`[a-z0-9._-]` 白名单剥除 + 40 字上限 + 空值回退 'external'
  ——防标记位自身被注入（`bad source!<x>` → `badsourcex`；`.` 保留故
  `mcp.intel` 形态可读）。分隔符选 `.`（白名单内字符），不用 `:`
  （会被剥除致标记不可读）。
- **标记形态选型**：evidence 文本前缀。理由：Signal 无来源列（加列=表结构禁区）；
  osint-* type 族是类型不是标记；前缀与 graphd 写端脱敏产物 `[REDACTED:*]`
  同款先例；**零表结构改动**。
- **scanInjection 健壮性**：非法词面（坏正则）跳过不抛（loader 白名单已挡，
  双保险）；HIGH 镜像与 loader 词面去重（同词面不重复告警）。

## 3. 对外只读 server（scripts/mcp/d2d-mcp-server.mjs）

- **协议面**：stdin 换行分隔 JSON-RPC 2.0；initialize（协议协商+serverInfo）/
  notifications/*（无响应）/ tools/list（白名单工具面）/ tools/call / ping；
  非法方法 -32601、解析失败 -32700、内部异常 -32603。
- **工具面**（只读性结构证明）：
  - `d2d_graph_read`：只读 Cypher（isReadOnlyCypher 预检 → graphd /query）
  - `d2d_findings_summary`：findings 聚合只读（上限 50 条，eng 参数单引号剥除）
- **审计**：`~/.d2d-data/logs/mcp-server-audit.jsonl` —— server-start/stop、
  tool-call（args 截头 200B）、**write-rejected**（cypher 截头 + sha256 前 12 位，
  不落原文全文）、tool-unknown。审计失败静默（不影响协议响应）。
- **server 持 host token**：与 graphd 的认证通道同既有面（host-only 认证禁区
  零触碰）；graphd 权威兜底不受 server 端预检影响。graphQuery 带 token 注入
  seam（可测性；缺省仍读 `~/.config/d2d/host-token`，生产行为零变化）——
  CI 无 host-token 文件，测试必须注入（首跑 CI 红先例：环境依赖型失败）。

## 4. 对内发现（mcp-discovery.mjs + external-tools.mjs）

- **endpoint 校验**（Mimosa 约束 verbatim 实现）："服务端请求 URL 时：仅允许
  http/https；发请求前校验 host，并拒绝 localhost、环回、私有和保留地址。"
  —— `assertMcpEndpoint`：协议白名单 → hostname 归一小写 → PRIVATE_HOST_RE
  （localhost/127./10./192.168./169.254./0.0.0.0/[::1]/::1/fc/fd/fe80）+
  RESERVED_HOST_RE（224.0.0.0/4 组播保留段首字节）缺省拒绝；
  **allowPrivate===true 为配置显式放行**（操作员显式决定，非运行时逃逸）。
- **配置校验 fail-closed**：doc 非 `{servers:[…]}` 抛；name 非法抛；
  endpoint 非法抛；tools 空白名单抛 —— 任何一条不满足 = 该配置整体拒绝发现。
- **健康探针**：initialize 握手（5s 超时）；失败 → `{available:false, reason}`
  降级不抛（发现环不因单 server 失联中断）。
- **远程调用**：tools/call → 响应文本拼接 → **强制过 sanitizeIngestExternal**
  （安全底线 2 的消费端义务收敛在 callExternalTool 内部，调用方拿到的已是
  消毒产物）；白名单外工具名直接拒绝（零网络 IO）。
- **worker 工具注册**：`registerExternalMcpTools` —— 空配置/开关关 = 零注册；
  def name `mcp_<server>_<tool>`（name 白名单字符保证合法工具名）；
  description 注明审批建议（high）与消毒链背书。

## 5. osint 回补接线（collect.mjs — 消毒链第一次实战）

`writeGraphSummary` 内 `ingest` 闭包：asset-perimeter 与 osint-subdomain 两条
evidence 组装后过 `sanitizeIngestExternal`（source=collect/osint，maxLen 4000，
sanitizeImpl=真实 sanitizeUntrusted）。丢弃 → stderr 留痕 + 阻断文案
（`osint-subdomain 丢弃(外部响应未过链不入图)`），不入图。
防 coverage_bias 式死代码：`mcp-security.test.mjs` 含源码断言
（sanitizeIngestExternal 调用 + sanitizeImpl 实接 + 丢弃文案三锁）。

## 6. 禁区比对表（六对象零交集实证）

| 禁区对象 | 本批触碰？ | 依据 |
|----------|-----------|------|
| scheduler.js [570,618] / :589-594 / :596-597 / :603 / :607-630+buildAgentStatus | **否** | 本批零改 scheduler.js；角色过滤覆盖行等既有禁碰条目原样 |
| Experience 表结构 / experience-ref.mjs 既有行 | **否** | external 标记走 evidence 前缀，零表结构改动；experience-ref.mjs 零触碰 |
| scripts/browser/ 四文件 | **否** | 本批无浏览器面改动 |
| graphd 本体（gates.py/八态机/host_query_gate 配置） | **否** | 只读查询走既有 /query 通道；CALL 禁令由 graphd 权威承担（读侧依赖，非配置改动） |
| adapter egress 强制块 | **否** | 对内发现的 fetch 直连 endpoint（经 assertMcpEndpoint 校验）；egress 网关豁免面 T3-2-1 已登记，本批零改 |
| 审批面配置本体 | **否** | index.js 接线为纯新增调用块（browser-attack 块后同形态）；mcp 工具 description 建议审批 high，不动审批配置 |

## 7. 开关矩阵（底线 4）

| 开关 | 值 | 效果 | 缺省 |
|------|-----|------|------|
| `P2P_MCP_SERVER` | '0' | server 主流程启动即退出（exit 0） | 启用 |
| `P2P_MCP_CLIENT` | '0' | discoverMcpServers → `{enabled:false}`；registerExternalMcpTools 零注册 | 启用 |
| 配置 `allowPrivate` | true | 显式放行私有段 endpoint（仅该 server 条目生效） | false（拒绝） |

双覆盖口径：env 开关 > 配置存在性（配置文件存在但开关关 = 仍零注册）；
CLI 参数不参与开关（对内开关只认 env，与 P2P_ROLE_FILTER 同口径）。

## 8. 测试与验收口径

- `plugin/pentest-dsh/test/mcp-security.test.mjs`：18 用例
  （消毒链 6 / 对外 server 6 / 对内发现 6；含 osint 回补源码断言）。
- 全量三轨基线（T3-2-4 后）：pytest **368** / mocha **1849** / panel **55**。
- live smoke（消毒链）：正常放行带标记 / HIGH×3 丢弃 / 超长丢弃 —— 全过。
- description 基线 `--check` 一致（mcp 工具为配置驱动动态注册面，缺省零注册，
  不入静态钉扎面——基线钉缺省注册面，设计如此）。

## 9. 开放项（本批新登记）

| 项 | 内容 | 触发条件 |
|----|------|----------|
| MCP 会话化 | 对内远程调用 v1 无会话态（单 endpoint 单请求）；远程 MCP 需会话时补 initialize 会话保持 | 实际接入需要会话的远程 server 时 |
| dsh 宿主原生 MCP 接口 | dsh 出现原生 MCP server 注册接口后，独立 CLI 进程形态迁移为宿主内注册 | 宿主接口实锚后 |
| mcp-servers.json 首个真实 server | 配置面已就绪（空清单安全态）；首个真实接入时补集成测试（真实 endpoint + 探针 + 消毒链实测） | 操作员决定接入时 |
