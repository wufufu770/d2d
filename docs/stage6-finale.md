# 阶段 6 收官盘点（T3-2-6 终态）

> 阶段 6「学习升级 + 插件化 + 多 Agent 进化」六子项终态。拆批方案 docs/stage6-batch-plan.md；
> 逐批轨迹 docs/devlog.md；本表为收官快照（终态真相源归 state.md，本表是盘点材料）。

## 六子项终态

| 子项 | 状态 | 落地形态（批次） | 关键裁决 |
|------|------|------------------|----------|
| 6-1 经验→技能 | ✅ 全清 | skill 存储+三门晋级通道+抽取管道（T3-2-2）；角色过滤接线 P2P_ROLE_FILTER（T3-2-2b） | 三实质硬门禁下「纯新增编排+条件覆盖行」形态；复核清单分层（A/B）定型 |
| 6-2 联网搜索 | ✅ 全清 | osintGet 网关化+Hackertarget 双源+osint-subdomain Signal（T3-2-1） | 双源独立降级；**状态文档随族同批**纪律由此批确立 |
| 6-3 插件打包 Hook | ✅ 全清 | 五形态导出框架+三攻击工具 dsh 注册+Burp 通用 XML 导出（T3-2-3） | Burp 实导入验证降级挂开放项；**CLI 主流程守卫**固定纪律 |
| 6-4 环内 supervisor | ✅ 全清（worker 工具形态） | delegate_subtask 工具：ctx.agents 只调用不修改+scope 严格子集+递归深度=1+cap 预检+治理门继承（T3-2-5） | 零禁区路径（边界裁决守住）；**调度环自动创建切片出批**（实战后另批 4-3a）；子 Agent=进程内受控实体（与 external 消毒链两道防线定性区隔） |
| 6-5 双向 MCP | ✅ 全清 | sanitize-ingest 消毒链+对外只读 stdio server+对内配置驱动发现（T3-2-4） | 安全四底线；原生 stdio 零 SDK；**外部数据不过链不入图**全局纪律 |
| 6-6 事件驱动并发 | ⏸ 降级（T4-2 挂账） | 本体不做（Kùzu 无原生 watch，真事件需 graphd 禁区通道——T3-2-0 裁决）；收益由 T3-2-6 承接：闲时任务框架+自适应轮询（本批） | 止损降级先例；承接面零禁区（watchdog 同构外挂） |

## 本批（T3-2-6）落地

- **闲时任务框架**（scheduler/idle-tasks.mjs）：watchdog 同构外挂——注册面+预检硬门（active engagement [graphd 只读] + in-flight worker [subagent-cap 公开账本]，busyProbe 异常按忙 fail-closed）+ setTimeout 链自适应频率（初始 max 60min→连续空闲 2 tick 收缩 min 10min；忙/失败退避回 max，审计留痕 idle-task-interval）+ 失败降级（spawn 非零审计退避，进程隔离不外溢）；P2P_IDLE_TASKS=0 零挂载。
- **首批任务**（既有 CLI，不发明新任务）：skill-distill 补跑（开放项 21 空转保护解除路径）/ misses-report 月度聚合（T3-1 既有选题面）。
- **能力路由衔接增强**：实测两环对新信号类型族**无真实路由缺口**（discovery 侧 osint-subdomain→asset-recon 段命中已覆盖；subagent-result→通配兜底合理；deep 侧新类型消费面在环外）→ 落地为**行为快照回归锁定**（防词表漂移破坏既有命中）；已知粗糙点（短词 1 分档裸子串可误命中 surface-js→modeling-specialist）登记性断言+开放项挂账（逻辑面不动，0911 评分刚定稿）。
- **三层协同边界**（不重复建设）：路由选角（pickRole×roles 词表）／角色过滤（T3-2-2b P2P_ROLE_FILTER）／scope 继承（T3-2-5 delegate_subtask）分属三层，测试锁定互不重建。

## 承接与遗留

- **6-6 裁决链**（devlog 收官节同源）：T3-2-0 审计发现 Kùzu 无原生 watch → 真事件需 graphd 禁区通道 → 止损降级，本体挂 T4-2 存储层决策后重评 → 收益大头（闲时自动化）由本批 watchdog 同构外挂承接，调度环核心零触碰。
- **开放项终版**：阶段 6 期间销账 #8/#13/#19；#21 skill-distill LLM 蒸馏（素材积累后立项——本批闲时任务已打通补跑通道）；#22 MCP 三件（会话化/宿主原生接口/首真实 server）；新增：路由短词 1 分档精化（挂 allocator 逻辑面，非禁区低优先）；6-6 本体（T4-2）。
- **调度环自动创建切片**（6-4 余量）：明确出批，实战观察后按需另批（届时走完整 4-3a 授权）。
