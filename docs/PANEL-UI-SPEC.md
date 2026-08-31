# d2d 面板 UI 规格（dsh Web UI 侧栏工作台）

> 一句话：给 dsh Web UI 做一个 d2d 专属侧栏 tab（ops + findings 两页），只读观测台定位，host 半代理聚合快照供数，token 不出 host，graphd 门禁零改动。

- 状态：设计冻结（v1），未实施。本文 = 三轮生态调研 + 十轮卡片迭代 + 两轮拆分重构的结论。
- 定位：**只读观测**。不写图、不发指令、不碰 ExperienceWeight；轻操控进 v2。
- 形态：better-sidebar tab（主）+ 官方 `sidebar.footer.action` 槽位入口（备），双通道复用同一个半组件。

## 1. 生态调研结论（2026-08 两轮）

| 项目 | 借了什么 | 没借什么（理由） |
|---|---|---|
| dsh-web-ui（~6.5k★） | 任务卡「执行→跳回会话复盘」范式 → worker 卡「查看会话」按钮 | 五列看板列义（d2d 是 FSM 不是任务状态） |
| DSH-better-sidebar（~2.6k★） | `ctx.betterSidebar.registerTab` 第三方接入；`--dsw-*` 主题令牌；设置页模块开关范式 | 双面板 IDE 布局（d2d 不需要编辑器） |
| dsh-workbench-plugin（0.1.31） | Usage 面板 **pin 常驻/收起退化紧凑条**；Execution trajectory **鱼骨图**（彩色左轨+可折叠 I/O+4s 自动刷新） | Ultra Slash 中途 steer（污染 attempt 间对照，ablation 归因作废）；Canvas（无关） |
| dsh-ui-progress | 输入框停靠区常驻进度条 → **停靠感知条** | — |
| 蓝鲸桌面宠物 | 右侧紧凑回合刻度条、悬停回合摘要 → **attempt 回合刻度** | 桌宠形态 |
| dsh-project-kanban | 左边条优先级编码（验证了 severity 边条做法） | 标签色系统 |
| dsh-chat-recovery | fork/失败重试 → v2「从 checkpoint 重派」候选 | — |

标准对齐：severity 五档（critical/high/medium/low/info）与 FIRST CVSS v3.x/v4.0 定性分级完全一致；finding 抽屉字段模型对齐 DefectDojo（复现步骤/影响/修复建议）。

## 2. d2d 现状 → 面板映射（2026-08-31 README 口径）

| d2d 机制 | 面板呈现 |
|---|---|
| 七态 FSM（candidate→triaged→verified→isolated→reported→accepted/rejected，actor+reason 必填） | 4 宏观列看板 + 管线步进器 + **转移审计时间线**（last_transition 直接消费） |
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

### 4.1 停靠感知条（tab 关闭时）
- 一条胶囊：engagement 状态点 + 覆盖% + attempt n/3 + worker 存活比 + verified 计数 + 「打开面板」按钮
- 依据：badge 只能塞一个计数，停靠条是整个战况的最小切面（dsh-ui-progress / Usage-pin 模式）

### 4.2 模块开关
- 六卡各自开关，状态记 localStorage（`workbench-dsh:modules`）；关掉后网格重排不留空坑（better-sidebar 设置卡范式）

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

- `GET /d2d/api/snapshot`：**一条聚合响应** = engagement(active+attempts+gapHints 计数) + agents(五角色心跳) + signals tail(20) + findings 计数(七态) + fleet(每角色模型主备+failover 事件) + 配额聚合 + `now`
- `GET /d2d/api/trajectory?worker=<id>`：鱼骨事件流
- 轮询 2s，**visible 门控**（tab 不在前台完全静默，官方 external-plugin-guide 建议）；stale-while-revalidate 切回
- 浏览器永不碰凭证：host 侧读 token 加 X-Auth 头；对外仅 127.0.0.1 + Host 头信任栅栏（better-sidebar `/sidebar/api/*` 同构）
- 每轮快照只撞一次 graphd `_lock`，worker 写图争用窗口最小
- 渲染增量：按 id diff 只 patch 变更卡；信号流虚拟化只渲可视 20 条

## 6. schema 增补（可选，P4，独立 PR）

- Finding 表：`vector` STRING（CVSS v4.0 向量串）、`cwe` STRING、`impact`/`mitigation` STRING
- 全部走 `/write/finding` 结构化端点加参数校验，不碰 Cypher 透传；动 app.py 需补 `tests/test_graphd_gates.py` 用例
- 向后兼容零成本路径：现有 `category` 字段可先顶 CWE（`category: "CWE-79"`）

## 7. 非目标（v2 轻操控清单，明确不做进 v1）

- 中途 steer worker（污染 attempt 间对照 → ablation 归因作废）
- 从 checkpoint 重派僵尸 worker（dsh-chat-recovery fork 模式）
- ExperienceWeight 编辑（防自刷防线，只读导出走 report.mjs）
- 多 engagement 历史切换（第一版只跟 active）
- 力导向拓扑全景图（Kuzu 万级 Endpoint 渲不动；泳道是降维替代）

## 8. 实施阶段

- P0 host 半代理：snapshot 端点 + token 注入 + visible 门控轮询（不动 graphd）
- P1 client 骨架：双通道注册（betterSidebar.registerTab + sidebar.footer.action）、`--dsw-*` 令牌、四态
- P2 ops 页六卡 + 模块开关 + 停靠条
- P3 findings 看板 + 转移审计抽屉 + 鱼骨轨迹（trajectory 端点）
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

## 10. 参考

- better-sidebar 外部插件接入指南：https://github.com/omdsh-dev/DSH-better-sidebar/blob/main/docs/external-plugin-guide.md
- dsh-workbench-plugin（pin/鱼骨/模块开关模式）：https://www.npmjs.com/package/dsh-workbench-plugin
- FIRST CVSS v4.0 规范：https://www.first.org/cvss/v4-0/cvss-v40-specification.pdf
- DefectDojo finding 状态定义：https://docs.defectdojo.com/triage_findings/findings_workflows/finding_status_definitions/
- dsh-web-ui（会话复盘范式）：https://github.com/zhu1090093659/dsh-web-ui
