# d2d 面板 UI 规格（dsh Web UI 侧栏工作台）

> 一句话：给 dsh Web UI 做一个 d2d 专属侧栏 tab（ops + findings 两页），只读观测台定位，host 半代理聚合快照供数，token 不出 host，graphd 门禁零改动。

- 状态：设计冻结（v1.1 生态修订），骨架已实施（`plugin/d2d-panel/`）。本文 = 三轮生态调研 + 十轮卡片迭代 + 两轮拆分重构的结论。
- 定位：**只读观测**。不写图、不发指令、不碰 ExperienceWeight；轻操控进 v2。
- 形态：better-sidebar tab（主）+ 官方 `sidebar.footer.action` 槽位入口（备），双通道复用同一个半组件。

## 0. v1.1 生态修订（2026-08-31，基于 better-sidebar v0.12.0《外部插件接入指南》全文通读）

骨架实施前按接入指南修正 v1 的 5 处设计：

1. **停靠感知条简化**：v0.12.0 起提供原生 `TabDescriptor.badge`（tab 图标旁计数 pill，99+ 封顶，回调须廉价）与 v0.16.0 自由窗口（tab 可拖出为悬浮窗常驻）。原"自写胶囊停靠条"的大部分诉求由宿主能力覆盖 → v1 只用 badge + 自由窗口，胶囊条降级为 P2 备选。
2. **模块开关不自写 localStorage**：`settings.pluginToggles`（声明式设置行，持久化在宿主 prefs 的 `pluginSettings[<descriptor id>]`）自动出现在官方设置页「侧边卡片」分区 → 六卡开关走声明式，删掉自定义 localStorage 方案。
3. **资源释放挂 `onClose` 而非 `visible`**：`visible=false` 只暂停轮询/订阅；组件卸载 ≠ tab 关闭（会话切换也卸载）。释放 watcher/长连接必须用 `onClose` 生命周期回调。
4. **能力探测先行**：`ctx.betterSidebar.features.includes('badge')` / `version` 先查再用新 API，旧版本优雅降级（features 清单单调只增）。
5. **软依赖模式**：`peerDependencies` 声明 `dsh-better-sidebar` 且 `optional: true`；未安装时 `ctx.betterSidebar === undefined`，注册静默跳过、插件其他表面不受影响（dsh-sentinel 首个三方接入者的成熟模式）。

另按指南确认的硬约束：注册必须包 `ctx.effect()`（HMR/禁用自动撤销）；id 用包前缀 `d2d:ops`；视觉值只消费 `--dsw-alias-*` / `--dsw-font-*` / `--ds-*` 令牌（面板表面用 `--dsw-alias-bg-layer-1`，**绝不消费 `--dsw-specific-sidebar-fill`**），severity/ring 语义色除外（见 §4.6 注）；client bundle 禁止 value-import 其他插件（类型只能 `import type {}`）；构建产物零 Node 依赖。

## 1. 生态调研结论（2026-08 两轮）

| 项目 | 借了什么 | 没借什么（理由） |
|---|---|---|
| dsh-web-ui（~6.5k★） | 任务卡「执行→跳回会话复盘」范式 → worker 卡「查看会话」按钮 | 五列看板列义（d2d 是 FSM 不是任务状态） |
| DSH-better-sidebar（~3.1k★） | `ctx.betterSidebar.registerTab` 第三方接入；`--dsw-*` 主题令牌；设置页模块开关范式 | 双面板 IDE 布局（d2d 不需要编辑器） |
| dsh-workbench-plugin（0.1.31） | Usage 面板 **pin 常驻/收起退化紧凑条**；Execution trajectory **鱼骨图**（彩色左轨+可折叠 I/O+4s 自动刷新） | Ultra Slash 中途 steer（污染 attempt 间对照，ablation 归因作废）；Canvas（无关） |
| dsh-ui-progress | 输入框停靠区常驻进度条 → **停靠感知条** | — |
| 蓝鲸桌面宠物 | 右侧紧凑回合刻度条、悬停回合摘要 → **attempt 回合刻度** | 桌宠形态 |
| dsh-project-kanban | 左边条优先级编码（验证了 severity 边条做法） | 标签色系统 |
| dsh-chat-recovery | fork/失败重试 → v2「从 checkpoint 重派」候选 | — |
| dsh-sidebar-leap（npm 0.3.2） | **host 半自有路由 + client tab + visible 轮询**的最小完整结构（骨架直接照此分层） | — |
| dsh-sentinel（首个三方接入） | 软依赖声明模式（未装 better-sidebar 时静默跳过） | — |

标准对齐：severity 五档（critical/high/medium/low/info）与 graphd `finding_gates` 的 F8 枚举、FIRST CVSS v3.x/v4.0 定性分级完全一致；finding 抽屉字段模型对齐 DefectDojo（复现步骤/影响/修复建议）。

## 2. d2d 现状 → 面板映射（2026-08-31 README 口径）

| d2d 机制 | 面板呈现 |
|---|---|
| 七态 FSM（candidate→triaged→verified→isolated→reported→accepted→rejected，actor+reason 必填） | 4 宏观列看板 + 管线步进器 + **转移审计时间线**（last_transition 直接消费） |
| 五角色（discovery/deep/creative 产出 + verify/study 服务） | 角色泳道双色系（产出彩色 / 服务中性） |
| per-role 模型主备 + 配额感知 failover（model-usage.jsonl） | **fleet 模型矩阵卡** + 配额卡（failover 事件专行） |
| 75min × 3 attempts + gapHints 回填 | engagement 卡 attempt 段 + **gapHints 卡** |
| graphd :8766 Kuzu 黑板 / fail-closed / token 防线 | 数据全走 host 半代理；503 时 fail-closed 横幅 |
| 零写防御（零图写入 worker 自动重派） | worker 卡「零写防御·待命」徽章 |
| src-export 报告（verified-only/CVSS/台账/状态轨迹列） | reported/accepted 态抽屉「查看 SRC 报告」动作 |

## 3. 信息架构：一功能一卡

三判定规则（拆不拆的仲裁）：
1. **信息域**：和卡上其他信息同一个域吗？不同域 → 拆
2. **瞥视频率**：多久看一次？低频事件 → 不配常驻，进独立卡事件行或抽屉
3. **屏上复用**：数据在屏上出现几次？出现 N 次 → 只放识别级；仅 1 次 → 可放判断级

六卡职责表（每张卡一句话职责，验收时逐卡核问）：

| 卡 | 职责 | 厚度 | 数据源 |
|---|---|---|---|
| engagement | 走多远了 | 厚（大数字+attempt 回合刻度） | engagement 节点 + attempts |
| fleet 模型矩阵 | 谁在用哪个模型 | 中（每角色主备一行） | model-policies + failover 事件 |
| 配额 | 还剩多少弹药 | 中（每模型一条 bar） | model-usage.jsonl 聚合 |
| findings 漏斗 | 管线卡在哪 | 中（七态计数条形） | finding 计数聚合 |
| workers | 谁活着在干嘛 | 薄（状态点+id+一行任务+时长） | AgentIdentity 心跳 |
| gapHints | 下轮补什么 | 薄（≤3 行） | gapHints 队列 |

列表卡文本节点硬上限 3 个（标识/状态/单数字）；心跳、stage、尾部输出、模型主备全部进抽屉或独立卡。

## 4. 组件规格

### 4.1 tab 注册（v1.1）
- `d2d:ops`（order 60，single，badge=存活 worker 数）+ `d2d:findings`（order 61，single，badge=已验证数）；均为 React 组件经 `registerTab` 注入
- 未装 better-sidebar：注册静默跳过（软依赖）

### 4.2 模块开关（v1.1）
- 六卡开关走 `settings.pluginToggles` 声明式设置行（持久化于宿主 `pluginSettings['d2d:ops']`），自动出现在官方设置页，不再自写 localStorage

### 4.3 engagement 卡
- 覆盖度大数字（唯一 title 级元素）+ attempt 回合刻度条：每刻度=1 finding，悬停出该 attempt 摘要（蓝鲸模式），进行中 attempt 高亮

### 4.4 findings 七态看板
- **宏观 4 列**：活跃（candidate+triaged）/ 已验证（verified+isolated）/ 已交付（reported+accepted）/ 已驳回（rejected）——窄面板放不下 7 列，rejected 列常年空置
- 卡上精确态用 mono 小徽章（candidate/triaged/…）+ severity 边条 + CVSS 数值
- 顶部管线步进器（6 主态 + 驳回虚线分支），当前态高亮
- **抽屉**：标题/状态徽章/severity 胶囊/CVSS/置信（ExperienceWeight prior 只读）；**转移审计时间线**（每行 = 时间 + 态 + actor + reason，消费 last_transition）；证据摘要；复现命令；时间线（ts→verified_at）；动作区（复制向量/复现命令/打开证据目录→openTab 深链/查看 SRC 报告[reported+accepted 态]）
- refuted/rejected 卡 0.64 不可点（存在的意义是证明垃圾清单门在工作）

### 4.5 worker 抽屉 · 鱼骨轨迹
- 左轨五类着色：brief 灰 / LLM 蓝 / tool 紫 / signal 琥珀 / finding 绿（workbench-plugin Execution trajectory 模式）
- 事件行默认折叠，展开看 I/O（curl 请求响应对、LLM 计划全文）；默认展开首行
- 数据源：model-usage.jsonl 逐 worker 拼接 + 信号 raw + checkpoint，新端点 `/d2d/api/trajectory?worker=`
- 头部：worker id + 环徽章 + chain + stage 段条 + 模型 chip + 运行时长；动作：查看会话（dsh-web-ui 范式）/ checkpoint 存档 / 复制轨迹 JSON

### 4.6 状态语法（全卡统一）
- 编码 = 边条 + 状态点 + 文字标签三通道（不单靠颜色，WCAG）
- worker：queued 虚线 / running 绿+脉冲 / zombie 琥珀「失联 Ns」/ done 灰降透明
- zombie 判定**纯前端时钟**：快照带 now，`now−updated_at>30s`，每秒本地推进走字，不占轮询
- 语义色豁免：severity（critical/high/medium/low/info）与 ring 着色是安全语义（红=危），不由主题令牌提供，以面板局部 CSS 变量定义并保持低饱和；主题相关色（背景/前景/边框/字体）一律 DSW 令牌

### 4.7 四态（加载/错误/空/归档）
- 首拉：等高骨架屏 + shimmer，零假数据
- graphd 503：fail-closed 横幅「图服务不可达·轮询已暂停·不展示过期快照」+ 立即重试
- 空看板：列内引导文案（三环产出后自动入列）
- 归档（wipe 后）：「本 range 已 PASS 归档 · 查看 report 导出」空态 + 跳转按钮

### 4.8 键盘 / 无障碍 / 响应式 / 动效
- 看板卡 roving tabindex：j/k 移动、Enter 开抽屉、Esc 关；严重度圆点 aria-label 全称；脉冲/折叠全包 prefers-reduced-motion
- 容器查询三断点：>480px 三列看板+常驻抽屉；360-480 单列+卡下抽屉+档位横滑；<360 徽章换行 meta 折两行
- 动效令牌：120/150/200ms 三档，字面量零容忍

## 5. 数据契约（host 半代理）

- `GET /d2d/api/snapshot`：**一条聚合响应** = engagement(active+attempts+gapHints 计数) + agents(五角色心跳) + signals tail(20) + findings 计数(七态) + fleet(每角色模型主备) + `now`
- `GET /d2d/api/trajectory?worker=<id>`：鱼骨事件流（P3）
- `POST /d2d/api/start` `{target, scope?, instances?, objective?}`：engagement 启动 API（0906 图队列）— 校验后写 `status='requested'` 节点，web 宿主调度器 ≤15s 采纳（adopt 置 active + 认领租约）；仅 http/https 公网域名（环回/私有/保留段拒绝，政策见 `start-policy.mjs`）；已有 active/requested → 409
- `POST /d2d/api/stop`：对 active engagement 置 `cancel='true'` 令牌 — 调度器栅栏自停（P0 取消流程），无 active → 409
- 轮询 2s，**visible 门控**（tab 不在前台完全静默）；stale-while-revalidate 切回
- 浏览器永不碰凭证：host 侧读 `~/.config/d2d/host-token` 加 X-Auth 头；服务仅监听 127.0.0.1 + Host 头信任栅栏（better-sidebar `/sidebar/api/*` 同构）+ CORS 仅回显 loopback 来源
- 快照聚合在 host 侧带 0.5s 微缓存 + 单飞合并（并发请求共享一次图读取），对 graphd `_lock` 争用窗口最小
- 渲染增量：按 id diff 只 patch 变更卡；信号流虚拟化只渲可视 20 条
- 渲染安全契约：全部文本经 React 文本节点渲染（结构免疫 XSS），禁 `dangerouslySetInnerHTML`；wire 上信号只带 id/type/weight/ts（evidence 留在抽屉端点，P3）

## 6. schema 增补（可选，P4，独立 PR）

- Finding 表：`vector` STRING（CVSS v4.0 向量串）、`cwe` STRING、`impact`/`mitigation` STRING
- 全部走 `/write/finding` 结构化端点加参数校验，不碰 Cypher 透传；动 app.py 需补 `tests/test_graphd_gates.py` 用例
- 向后兼容零成本路径：现有 `category` 字段可先顶 CWE（`category: "CWE-79"`）

## 7. 非目标（v2 轻操控清单，明确不做进 v1）

- 中途 steer worker（污染 attempt 间对照 → ablation 归因作废）
- 从 checkpoint 重派僵尸 worker（dsh-chat-recovery fork 模式）
- ExperienceWeight 编辑（防自刷防线，只读导出走 report.mjs）
- 多 engagement 历史切换（第一版只跟 active；无 active 时展示最近终态 engagement 供上下文）
- 力导向拓扑全景图（Kuzu 万级 Endpoint 渲不动；泳道是降维替代）

## 8. 实施阶段（v1.1 调整）

- P0 host 半代理：**已实施**（`plugin/d2d-panel/lib/host/`）——snapshot 聚合（graphd /query host-token 只读）+ standalone loopback (:8790) + Host 栅栏/CORS no-store；同源网关挂载为待实机验证项
- P1 client 骨架：**已实施**（`lib/client/`）——`registerTab` 双 tab（软依赖）+ DSW 令牌 + 四态 + visible 门控 2s 轮询 + badge 缓存
- P2 ops 页六卡补全 + pluginToggles 模块开关 + attempt 刻度
- P3 findings 看板抽屉（转移审计时间线/复现命令）+ 鱼骨轨迹（trajectory 端点）+ 配额卡（model-usage.jsonl 聚合）
- P4 Playwright 验证 + 截图归档 +（可选）schema 增补独立 PR

## 9. 验收清单

- [ ] 逐卡一句话职责核问（§3 六卡职责表）
- [ ] 列表卡文本节点 ≤3；title 级元素每视图唯一
- [ ] 状态三通道编码（边条+点+文字）全卡一致
- [ ] 四态截图：运行/骨架/503/归档
- [ ] 键盘 j/k/Enter/Esc 全可达；对比度 AA 4.5:1
- [ ] 320/480/720 三宽无横向溢出
- [ ] 轮询仅在 visible；503 时不展示过期快照
- [ ] 动效全包 reduced-motion；时长字面量 0
- [ ] 浏览器端无 token；半代理仅 127.0.0.1
- [ ] host 半单测全绿（`node --test plugin/d2d-panel/test/`）；e2e：graphd 起真实例 → seed → curl 快照断言

## 10. 参考

- better-sidebar 外部插件接入指南：https://github.com/omdsh-dev/DSH-better-sidebar/blob/main/docs/external-plugin-guide.md
- dsh-sidebar-leap（host 路由+client tab 最小结构）：https://npm.io/package/dsh-sidebar-leap
- dsh-workbench-plugin（pin/鱼骨/模块开关模式）：https://www.npmjs.com/package/dsh-workbench-plugin
- FIRST CVSS v4.0 规范：https://www.first.org/cvss/v4-0/cvss-v40-specification.pdf
- DefectDojo finding 状态定义：https://docs.defectdojo.com/triage_findings/findings_workflows/finding_status_definitions/
- dsh-web-ui（会话复盘范式）：https://github.com/zhu1090093659/dsh-web-ui

## 11. 全页大屏设计稿（1.6-D，只写 spec 未实现）

> 一句话：侧边栏保留现状；新增「全页模式」入口进入整页工作台，三个 tab（engagement 总览大屏 / finding 分板 / 覆盖矩阵），宿主半同源路由供数，安全配方与 §5 同源栅栏同构并补 CSRF token。
> 状态：**设计稿，未实施**。本文给出可直接开工的布局/契约/安全/拆分，实现时逐批次对验收清单交差。

### 11.1 布局

**入口**：现有 `d2d:ops` tab 顶部（ModuleToggles 行尾）加一枚「⛶ 全页」按钮；better-sidebar v0.16.0 自由窗口能力可用时 `openTab({mode:'window'})` 拉独立窗口，不可用时 `window.open('/d2d-full/', '_blank')` 降级（同源）。现有侧边栏两 tab 完全保留、零改动。

**Tab A — engagement 总览大屏**（`/d2d-full/`，默认 tab）：

```
┌────────────────────────────────────────────────────────────────────────────┐
│ d2d 全页大屏   [总览] [Findings 板] [覆盖矩阵]        eng: eng-x ▾   ⛶ 收起 │
├────────────────────────────────────────────────────────────────────────────┤
│ ┌─项目卡─────────┐ ┌─项目卡─────────┐ ┌─项目卡─────────┐ ┌─项目卡────────┐  │
│ │● eng-x 运行中   │ │○ eng-y 排队    │ │○ eng-z 已收工  │ │ + 新建 src 项目│  │
│ │ crit2 high5 med9│ │ —             │ │ high1 low4    │ │               │  │
│ │ 活跃12 已验5 交2│ │ —             │ │ 活跃0  已验1 交0│ │               │  │
│ │ 性价比 6.0/10万 │ │ —             │ │ 1.2/10万      │ │               │  │
│ └────────────────┘ └────────────────┘ └───────────────┘ └───────────────┘  │
│ ┌─选中项目七态漏斗(大)───────────┐ ┌─覆盖 M/N ──────┐ ┌─性价比·总消耗───────┐  │
│ │ candidate ████████ 12        │ │ 34/120 端点     │ │ 6.0 findings/10万  │  │
│ │ triaged   ███ 3              │ │ 28%            │ │ 2.0 triaged/10万   │  │
│ │ verified  ██ 5 …             │ │ 缺口: checkout  │ │ 输入 12.3万 tok    │  │
│ └──────────────────────────────┘ └────────────────┘ └────────────────────┘  │
│ ┌─workers 泳道(discovery│deep│creative│verify)──┐ ┌─里程碑时间线────────────┐  │
│ └──────────────────────────────────────────────┘ └────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

项目卡点击 = 切换选中 engagement（复用 `POST /d2d/api/eng {op:'select'}`）；卡片墙即多项目并行一屏总览。

**Tab B — finding 分板页**（`/d2d-full/board`）：

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [eng-x: 24] [eng-y: 0] [eng-z: 5]        ← 按 engagement 分组的板头(计数)     │
│ ┌─统计卡(点击筛选)────────────────────────────────────────────────────────┐  │
│ │ critical 2 │ high 5 │ medium 9 │ low 6 │ info 2  ‖ candidate12 triage3…│  │
│ └───────────────────────────────────────────────────────────────────────┘  │
│ ┌─漏洞板(当前筛选: eng-x × critical)──────────────────────────────────────┐  │
│ │ ┌──────────────────────────────────────────────────────────────────┐   │  │
│ │ │ █critical SQLi in /login   eng-x · sqli · candidate   [验证] [▸] │   │  │
│ │ │ █critical 越权 /admin/pay  eng-x · authz · triaged    [验证] [▸] │   │  │
│ │ └──────────────────────────────────────────────────────────────────┘   │  │
│ │   [▸] 展开 = 详情抽屉: repro / verified_log / 转移审计 / 人工裁决按钮     │  │
│ └───────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

统计卡与板头都是筛选器（可叠加：eng × severity × state）；「验证」= 单条验证按钮，对单条 finding 触发验证环（L0/L1 语义、授权硬门与 validator 完全同轨，见 11.2 契约），按钮态：待验→验证中→verified/reached/quarantined。

**Tab C — 覆盖矩阵页**（`/d2d-full/matrix`）：

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ eng: eng-x ▾   图例: ■已测有发现(金) □已测未命中 ░不适用 ▨预算停   [导出 CSV]   │
├──────────────────────────────────────────────────────────────────────────────┤
│ 主类\子项        │ 未授权访问 │ 弱口令  │ 会话过期 │ 功能级越权 │ …          │
│ ────────────────┼───────────┼────────┼─────────┼──────────┼──────────   │
│ 1 认证          │    ■      │   □    │   ░     │    —     │             │
│ 2 授权与越权     │    ■      │   —    │   ▨     │    □     │             │
│ 3 注入          │    □      │   ▨    │   ░     │    ■     │             │
│ …(共 13 主类)    │           │        │         │          │             │
└──────────────────────────────────────────────────────────────────────────────┘
  双击格子 = 派单: 把「eng-x × 认证 × 弱口令」任务块写入当前 engagement(确认弹窗列出将下发的 brief 摘要)
```

**四态点亮**（格子数据源 = finding 按 category 归格 ∪ 新 coverage 表，coverage 表状态优先）：

| 态 | 色 | 判定 |
|---|---|---|
| 已测有发现 | 金（`#d8a021` 系，唯一 title 级高亮） | coverage.state='tested-hit' 或该格归并的 finding 数 > 0 |
| 已测未命中 | 中性（边框点亮） | coverage.state='tested-miss'（测过、零 finding、有证据行） |
| 不适用 | 低透明度灰 | coverage.state='na'（如无登录面的会话子项） |
| 预算停 | 斜纹/半填充 | coverage.state='budget-stop'（测到一半被 75min/步数预算截断，恢复入口） |
| （未测） | 空白 | 无 coverage 行 —— 矩阵默认底色，也是派单的主要目标 |

**13 主类 × 子项分类学**（v1 定版，实现时落 `domain/categories.mjs` 单一来源；finding.category 归格用首段匹配，未匹配进「未归类」溢出行，不丢数据）：
`1 认证(auth)`、`2 授权与越权(authz)`、`3 注入(injection)`、`4 XSS(xss)`、`5 SSRF/网络面(ssrf)`、`6 文件操作(file)`、`7 业务逻辑(logic)`、`8 竞态(race)`、`9 敏感信息泄露(info-leak)`、`10 配置与传输(config)`、`11 组件与已知漏洞(cve)`、`12 API 与接口(api)`、`13 信息与资产面(recon)`。每主类 3-8 个子项（如 authz → 水平越权/垂直越权/IDOR/功能级缺失），首批清单实现批次 4 时与 briefs 词表对齐后冻结。

### 11.2 数据契约（每 tab 的 graphd 查询 / 快照字段清单）

**Tab A 总览大屏**（大部分复用现有 snapshot，增量 2 项）：

| 字段 | 来源 |
|---|---|
| `engagements[]`（name/status/progress/workers） | 已有：`Q.engList` / `Q.findingsByEng` / `Q.workersByEng` |
| `engagements[].sev`（每项目 critical/high/medium/low/info 计数） | **新增**：`MATCH (f:Finding) RETURN f.eng AS eng, f.severity AS sev, count(f) AS n` |
| `engagements[].cost`（每项目性价比） | **新增**：host 对每个 engagement 调 `readModelUsage({engName})` + `costEfficiency`（选中项目已有，扩展为全量；≤4 项目，成本可控） |
| coverage M/N、gaps、milestones、agents | 已有：`Q.coverage` / `Q.gaps` / `Q.handoffs` / `Q.agents` |

**Tab B finding 分板**：

| 端点/字段 | 说明 |
|---|---|
| `GET /d2d-board/findings?eng=&severity=&state=&cursor=` | **新增**：全量分页列表（现有 snapshot findings list 截 200 条，分板页要全量）。graphd：`MATCH (f:Finding) WHERE f.eng=$eng [AND f.severity=$sev][AND f.gate_status=$state] RETURN f.id,f.title,f.severity,f.cvss,f.gate_status,f.category,f.ts,f.verified_at,f.last_transition ORDER BY f.ts DESC LIMIT 100`（wire 不带 repro/evidence 全文，§5 渲染安全契约不变） |
| `GET /d2d-board/stats` | 计数聚合：`MATCH (f:Finding) WHERE f.eng=$eng RETURN f.severity AS sev, f.gate_status AS state, count(f) AS n`（一次查询前端两维展开） |
| `POST /d2d-board/verify {id}` | **新增**：单条验证。host 侧读该 finding（`MATCH (f:Finding {id:$id})`）→ 调 validator `validateFinding(q, f, {level, eng})`（D2D_VERIFY_LEVEL/授权表/env 与验证环同源），返回 `{gate, verified_log}`；L1 未授权仍走 quarantined 硬门，面板按钮只展示不绕过 |
| `POST /d2d-board/transition` | 已有 `POST /d2d/api/transition` 语义复用（actor=panel-board） |

**Tab C 覆盖矩阵**：

| 端点/字段 | 说明 |
|---|---|
| coverage 表（**新增节点** `CoverageCell`） | 属性：`{eng, main, sub, state('tested-hit'|'tested-miss'|'na'|'budget-stop'), votes, evidence_digest, updated_at, by}`；写门走 graphd `/write/coverage-cell`（eng 必须匹配 active engagement，枚举外 state 400，与七态门同风格）。归格兜底：无 coverage 行时由 finding `category` 首段归格推 'tested-hit' |
| `GET /d2d-matrix/matrix?eng=` | **新增**：`MATCH (c:CoverageCell) WHERE c.eng=$eng RETURN c.main,c.sub,c.state,c.votes,c.updated_at` ∪ `MATCH (f:Finding) WHERE f.eng=$eng RETURN f.category AS cat, count(f) AS n`（两查询 host 合并成 `{main:[{sub, state, findings}]}` 树一次下发） |
| `GET /d2d-matrix/taxonomy` | 13 主类 × 子项清单（`domain/categories.mjs` 导出，前端不内嵌分类学） |
| `POST /d2d-matrix/dispatch {main, sub}` | **新增**：双击派单。host 校验格子与分类学合法 → 对当前选中 engagement 写任务块（`/write/signal` `type='matrix-dispatch'`，evidence 带 `main/sub/brief_digest`），下一轮 discovery/deep 取信号即消费；当前无 active engagement → 409 |

轮询沿用 2s + visible 门控 + 0.5s 微缓存/单飞（§5）；矩阵页可降到 10s（格子变化频率低，graphd `_lock` 优先给调度器）。

### 11.3 安全配方（与既有面板 API 同构 + CSRF 补强）

- **路由前缀**：`/d2d-full/`（页面壳 HTML）、`/d2d-board/`、`/d2d-matrix/` 三个新前缀，全部经 `ctx.webServer.register({kind:'prefix'})` 挂载（与 `/d2d/api` 同一道）；前缀枚举外一律 404。
- **loopback 栅栏**：复用 `isTrustedApiRequest`（Host 必须 loopback 或 webRuntime 受信清单；`sec-fetch-site: cross-site` 拒绝；Origin 存在时必须与 Host 同源）——全页三个前缀逐请求过同一函数，无例外。
- **CSRF token**（新增，写端点专用）：宿主内存持随机 32 字节 token（进程启动生成），页面壳响应以 `Set-Cookie: d2d_csrf=<token>; SameSite=Strict; Path=/d2d-; HttpOnly=false` 下发（同源 JS 需读它做 double-submit）；所有 POST（verify/transition/dispatch/eng select）必须带 `X-D2D-CSRF` 头且与 cookie 值相等，不等 → 403。GET 只读端点不要求（Origin 栅栏已覆盖读侧）。token 不入图、不入日志、进程重启轮换。
- **渲染安全契约不变**（§5）：全部文本走 React 文本节点，禁 `dangerouslySetInnerHTML`；wire 不带 evidence 全文与 repro 原文（分板页 repro 只在详情抽屉按需单条拉取：`GET /d2d-board/finding?id=`，输出仍经脱敏）。
- **写端点通用**：body ≤ 8KB、method 白名单、`Cache-Control: no-store`、错误信息 160 字符截断（与现 host 半一致）；浏览器永不碰 host-token/worker-token。

### 11.4 实施拆分（4 个可独立提交的批次）

| 批次 | 内容 | 依赖 | 验收 |
|---|---|---|---|
| **批次1 数据面/快照字段** | ① `engagements[].sev` + `engagements[].cost` 进 snapshot（host 侧聚合）；② `CoverageCell` schema + graphd `/write/coverage-cell` 写门 + `tests/test_graphd_gates.py` 用例；③ `domain/categories.mjs` 13 主类分类学单一来源 + 单测；④ CSRF token 基建（host 半内存 token + double-submit 校验函数 + 单测） | 无（均可独立合入，先于任何 UI） | graphd pytest 增量全绿；snapshot 单测含 sev/cost 数组；CSRF 校验单测 |
| **批次2 总览大屏** | `/d2d-full/` 页面壳 + Tab A（项目卡墙/大漏斗/覆盖 M/N/性价比/泳道/里程碑），模块开关与侧栏 tab 状态互通 | 批次1（sev/cost 字段） | 320/720/1280 三宽无横向溢出；四态（加载/503/空/归档）截图；轮询 visible 门控生效 |
| **批次3 finding 分板** | `/d2d-board/` 分页列表 + 统计卡筛选 + 详情抽屉（按需拉 repro）+ 单条验证按钮 + 人工裁决 | 批次1（CSRF）；可与批次2 并行开发（同壳不同路由） | 筛选可叠加且 URL 可分享（query 持久化）；verify 按钮对未授权目标展示 quarantined 话术；审计 actor=panel-board 落图 |
| **批次4 覆盖矩阵** | `/d2d-matrix/` 13×子项矩阵 + 四态点亮 + 双击派单 + CSV 导出 | 批次1（CoverageCell + taxonomy）；建议在批次2 后（复用壳与 eng 选择器） | 空库出全空矩阵；finding 归格兜底命中；双击派单后 Signal_ 可查且 discovery 消费；矩阵查询 10s 轮询不挤占 `_lock` |

每批次独立可回滚：批次1 只加字段/表（向后兼容，旧快照消费方无感）；批次 2-4 各自独立前缀路由，任一未合入不影响其余与现有侧栏。

