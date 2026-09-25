# 档位 × 证据深度映射（高 / 中 / 低）

> 来源：4-2-0 前置审计（dwfrun-d838b762）· 静态核验口径

- 定位：d2d 阶段 4-2 路线 A 文档 2/5。按用户拍板的表，定义处置档位各自的**证据深度**与**审批形态**。纯规则资产，零代码。
- 路径与唯一性说明：本文件即 4-2 文档 2（档位×证据深度映射），路径取阶段任务白名单名 `docs/tier-depth-mapping.md`。仓库中另存在 `docs/tier-evidence-mapping.md`（前次尝试遗留稿，自称『文档 2/5』）——该路径命中 `.gitignore:83`（`*evidence*.md`），**永不入库**（`git check-ignore -v` 实证 `.gitignore:83:*evidence*.md  docs/tier-evidence-mapping.md`），不是本批交付物，其内容已停止维护；其全部有效内容（含幂等键派生口径）已并入本文件。**档位词表以本文件为唯一规范来源，不得双源**；按旧路径寻找文档 2 的消费方一律改用本文件。

## 档位词表（唯一，全 4-2 资产共用）

三档：**高 / 中 / 低**。与 docs/tool-risk-rating.md 的风险档位同名同序；docs/false-positive-schema.md 的 `routingSafe` 语义锚定于此，布尔两值对档位落点**唯一**：`true` ⇔ 低档（异步免批）；`false` ⇔ 高档（阻塞同步人工批）——**误报模式维度不存在『中档』落点**，中档只由中档工具的发现驱动（见映射表），不由模式 routingSafe 取值驱动。docs/tool-risk-rating.md 特殊档 6 工具不在 headless worker 面，不进入本表。

## 映射表（用户拍板）

| 档位 | 证据深度 | 证据构成 | 审批形态（4-6 消费） | 典型来源（工具侧见 docs/tool-risk-rating.md） |
|---|---|---|---|---|
| **高** | 完整证据链 | 原始请求/响应对 + HAR + 断言 | **阻塞同步审批** | 高档工具（bash / web_fetch / web_search / subagent / subagent_fork / workflow / ralph）产生的高影响发现；误报模式 guard 失败被降人工的命中 |
| **中** | 关键证据 | 请求/响应摘要 + 断言 | **异步 + 幂等键**（派生口径见下节） | 中档工具（gateEgress 组合门出网、有认证/额度副作用，如 burp_repeater / burp_intruder / propose_direction）的发现 |
| **低** | 状态记录 | 时间 / actor / 结果 | **异步免批** | 低档工具只读/会话内观测；静态种子完整命中（`routingSafe=true`）的误报自动降级处置 |

## 与 4-4 的对齐（分工边界）

4-4 定义**『怎么摘』**（证据提取/采集机制），本表（4-2）定义**『摘到什么深度』**（每档证据构成）。两者以档位名为接缝；4-4 不得改变本表档位定义，只实现各档的摘取。

## 与 4-6 的对齐（sync/async 边界）

- 高 = **阻塞同步审批**；中 = **异步 + 幂等键**；低 = **异步免批**（免审批不免审计——工程纪律①，见 docs/false-positive-schema.md『工程纪律』）。
- **本表是 4-6 的判据源，4-6 不得另立档位词表**：4-6 只消费本表的档位 → 审批形态映射；引入第四档、改名或重定义均视为违约。

## headless 现实约束（引自 4-2-0 审计）

高档所需的『阻塞同步审批』在当前 headless 面无现成通道：headless profile 钉死 approval=never（`~/.dsh/profiles/headless/cordis.patch.yml:58-64`），自主 worker 无 answerer——高危人工批需新通道或异步审批队列（缝位见 docs/routing-integration-points.md）。

## 处置档位判定唯一规则（消歧）

- **当且仅当**误报模式 `routingSafe=true` 且判别式（含内置 guard）**完整命中** → 低档（异步免批，落审计）。
- 其余一切命中，**一律高档**（阻塞同步人工批），无中档落点、无自由裁量：① guard 任一失败；② `routingSafe=false`（无论 `source=static` 还是 `ledger`，含 4-5 账本归纳出的可查表但标 false 的模式）；③ 命中『移交 4-5』清单模式；④ 判别式无法判定（符号解析失败、绑定来源不明等）。
- 中档不由误报模式驱动，只由中档工具的发现驱动（见映射表）。
- 判别式细则以 docs/false-positive-schema.md 种子条目为准。

## 中档幂等键派生口径（『异步 + 幂等键』的实现判据，4-6 必读）

1. **优先级**：观测已有服务端节点 id（graphd 分配的 Finding/Signal/Endpoint id）时，直接以该 id 为幂等键，不再派生。
2. **无 id 时派生**：`idem_key = sha256( join('\x1f', eng, actor, bucket, norm_payload) )` 取前 16 个 hex 字符。字段口径：
   - `eng`：engagement 名（结构化写通道硬约定字段——每个写请求 JSON 必须带 `"eng"`，`plugin/pentest-dsh/domain/briefs.mjs:42`）；
   - `actor`：产出观测的工具名（worker 侧会话为 worker 标识）；
   - `bucket` ∈ {`finding`, `signal`, `endpoint`, `operation`}（封闭枚举）；
   - `norm_payload`（规范化 = 空白折叠后按序拼接）：
     - finding / signal：`title` + `endpoint_url`（或缺陷坐标）——**与 graphd 服务端去重判定同基**（同类重复标题/同端点同缺陷 409 拒、endpoint 幂等 upsert，`briefs.mjs:42`），避免客户端键与服务端去重成为双事实源；
     - endpoint：`url`（服务端已幂等 upsert，键仅用于审批单去重）；
     - operation（出网/写操作类审批）：`tool` + `method` + `host` + `path` + 规范化 body 摘要。
3. **对账语义**：同键重试不产生第二张审批单；键冲突视为同一事项重复上报（合并证据与 hitCount，不重批、不重摘）。

## 一致性

- 门覆盖缺口决定哪些操作会进入审批流：见 docs/gate-coverage-gaps.md 三条主缺口。
