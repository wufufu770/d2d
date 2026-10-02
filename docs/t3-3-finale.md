# T3-3 阶段终态盘点（6.5 余项：可视化 + 授权数字化 + 9 标签页收口）

> 阶段定义：docs/t3-3-plan.md（T3-3-0 前置审计+拆批，§7 拍板执行顺序 **1→3→2**）。
> 收官 tag：`t3-3-stage65`（annotated，manifest 收口 SHA 打点）。
> 本文档是 T3-3 三批的终态总账；逐批细节见 docs/devlog.md 各批节。

## 一、三批盘点表

| 批 | 产出 | 关键裁决 | 测试基线演进 |
|---|---|---|---|
| **T3-3-1** 可视化数据面+三图+能力看板卡 | host 四路由（starmap/coverage/hypotheses/capability）+ 三图纯函数（buildStarmap/buildCoverage/buildHypLane）+ d2d:viz tab 自绘 SVG | 路由形态 4 条各自微缓存（故障隔离）；capability 静态读 fail-soft 与图路由 503 fail-closed 语义区分；client 工厂无 useRef → id 哈希确定性极角布局；桑基出批归 T3-3-2 | panel 55→**69**（+14） |
| **T3-3-3** 授权契约数字化（安全敏感度最高批） | domain/auth-contract.mjs 套件模块（一体签名+ed25519+六失败面归并三态+seen-auth 双维记忆）+ authctl CLI（keygen/keys/issue/verify）+ 四挂接点纯新增接线（startEngagement/p2p_start/registerGate 组合层/egress refreshScope）+ runbook | **验签失败≠放行**（invalid/expired 恒拒，灰度 off 只豁免 missing）；授权与审批正交维持（approvals 零触碰）；P2P_AUTH_CONTRACT 缺省 off；graphd 侧不参与验签 | mocha 1882→**1896**（+14） |
| **T3-3-2** 收官批：桑基+9 标签页+侧边栏收口 | 桑基数据面（transition-log host 侧聚合）+ SankeyChart + 五新 tab（approval/chain/tools/audit/config，order 63-67）+ 四部分补全（总览 sev/cost 增量+审批 client+前沿提案池+配置集中）+ 禁区 grep 断言测试 | 文件尾读路由 fail-soft 恒 200+degraded 记因 vs 图依赖路由 fail-closed 503（双语义成文）；桑基/链路稀疏注记（历史存量真相，不造数据不硬凑）；审批 tab 纯 client 消费零后端改动；侧边栏对等三分法（对等/补齐/豁免） | panel 69→**88**（+19） |

**终态基线：pytest 368 / mocha 1896 / panel 88。**

## 二、8.5 余量三件去向（§7 拍板兑现）

1. **能力看板卡** ✅ 并入 T3-3-1（capability 路由 + manifest 消费卡，T3-3-2 复用不重复）。
2. **变异试点**：T3-3-3 后台观察跑未跑成（@stryker-mutator/mocha-runner 与 mocha 12 冲突，364 mutant instrument 卡 runner）——如实登记 #25；T3-3-2 面板批无安全面，不重跑；修复工具链后限新安全面文件补观察跑。
3. **评测集跑测**：后置单独立项——立项卡已登记 state.md「下一步」段（范围/预估 2-3 人日/验收口径 draft/L2-L3 人工裁决保留），本批不跑。

## 三、9 标签页终态（roadmap 口径）

| 页 | 终态 | 载体 |
|---|---|---|
| 总览 | ✅ 补全 | d2d:ops（engagement 卡新增 severity 计数列 + per-eng token 总耗；漏斗/缺口/经验/信号卡既有） |
| 经验库 | ✅（既有） | d2d:ops ExperienceCard+策略库卡（ExperienceWeight 口径；条目级 Experience 表消费登记后续） |
| 漏洞资产 | ✅ 大部分（既有） | d2d:findings 七态看板+人工裁决；全量分页/单条 repro 抽屉/单条验证按钮=P3 豁免（spec 已有设计位） |
| 审批 | ✅ 新增 | d2d:approval（order 63）——既有 GET/POST /d2d/api/approval 纯 client 消费，零后端零审批门改动 |
| 探索链路 | ✅ 新增 | d2d:chain（order 64）——三列链路 SVG（worker→信号→产出，DERIVED_FROM/AT/CONFIRMS 边）+ Task 看板（/pentest-tasks 对等）+ CONFIRMS 稀疏注记 |
| 探索前沿 | ✅ 补全 | d2d:ops 前沿提案池卡（GET frontier + POST frontier-transition 代理，reviewer 钉死 panel）+ 转化率卡既有 |
| 工具调用 | ✅ 新增 | d2d:tools（order 65）——run-log 全事件投影（kind 过滤/limit 钳位 1..600/extra 兜底）+ per-worker 工具量榜 |
| 审计 | ✅ 新增 | d2d:audit（order 66）——audit.log+transition-log 双源合流时间线（kind 过滤/limit 1..500） |
| 配置 | ✅ 补全 | d2d:config（order 67）——只读总览（通知通道脱敏形态/暂停清单/审批模式）+ 既有写面卡集中（denylist/caps/fleet） |

附：桑基图入 d2d:viz（transition-flows 路由 + SankeyChart，家族过滤 client 侧零重取）。

## 四、侧边栏对等收口（真矩阵终态，审计项 3 交付）

判定三分法；豁免须登记理由（拍板 5），全清单如下：

**对等（既有 UI 已覆盖）**：p2p_start/stop（EngStartForm/停止按钮）、p2p_eng 多项目管理、
/pentest-status（ops 卡群）、/pentest-model（FleetCard+凭据）、d2d:viz 四路由内容
（即侧边栏本体）。

**补齐（本批交付）**：
- 审批面（最高优先）：d2d:approval tab + badge（待决数）
- 任务看板（/pentest-tasks 对等）：d2d:chain Task 看板
- 9 页语义补全：探索链路/工具调用/审计/配置四页 + 前沿提案池（见 §三）

**豁免（结构性约束或范围拍板，理由登记）**：
| 豁免项 | 理由 |
|---|---|
| 门/hook 本体（bash/write/tool gate、容量账本、消毒收口） | 结构性：better-sidebar 服务接口无 gate/tools/commands 承载点（纯 UI 注册面）；观测痕迹经 run-log 进面板 |
| 工具面 19+（burp 六件套/js_scan/browser×3/supervisor/mcp_*） | 模型会话面非 UI 面；产物经 findings/signals 卡可见 |
| p2p_graph 自由查询台 | 暴露自由查询 UI 有安全语义成本；viz 四图覆盖高频面（P3 可再议） |
| /pentest-deep/creative/harvest/handoff/study/brain/notify-test | 低频写操作/后台批处理/运维一次性动作（spec §7 非目标口径）；handoff 产物（milestones）已展示 |
| /pentest-report 抽屉 | P3，spec 已有设计位未实施 |
| findings 全量分页/单条 repro 抽屉/单条验证按钮 | 工作量最大且面板批价值有限（P3 可裁——审计项 2 结论）；验证动作耦合验证环参数需独立设计 |
| deep_wakeups/creative_wakeups 计数 | 调度器进程内存计数无文件/HTTP 透出；panel 侧无法取（pentest-dsh 新导出=后端改动，违反本批零后端前提） |
| attempt 回合刻度 | 无可查数据源（审计项 2 未实锚），砍掉 |
| notify.json 写面 | 本批只读（webhook 内嵌 token，写面语义须独立设计）；登记后续 |
| 条目级 Experience 表消费 | 任务书"经验库"按 ExperienceWeight 口径成立；条目级经验展示登记后续 |

## 五、方法论沉淀（T3-3 总账，详 devlog 总账段）

1. **审计纠偏 roadmap 假设两处**（T3-3-0）：任务书表述与仓库实态冲突时以代码为准。
2. **边界语义化定义先例**（T3-3-3）：「验签失败不放行」「授权与审批正交」——边界写成可判定的行为规则而非原则口号。
3. **变异定级诚实纠正**（T3-3-3）：「脚手架就位」降级为「依赖在但不可用」，登记不粉饰。
4. **环境依赖 seam 纪律成形**（T3-3-1 两教训 → 先例 10 扩充）：写新数据面前先想「CI/他机没有这个文件会怎样」——本批四条文件尾读路由全部 fail-soft+degraded 记因落地。
5. **探针纪律**：makeH 不展开子组件——组件内渲染断言下沉子组件级直驱（T3-3-1 首记，T3-3-2 复用兑现）。

## 六、开放项终版（T3-3 遗留）

- #25 变异工具链兼容（修后限新安全面补观察跑）——P3
- #26 graphd.json 运行时状态混入（随 T4-5）——P3
- #24 余项：hostAllowed 空 scope（测试锁定现状）/父目录 775（登记不修）——P3
- 本批新增：findings 全量分页/单条 repro/验证按钮（P3）；notify 写面（P3）；条目级 Experience 消费（P3）
- 评测集跑测：单独立项（立项卡见 state.md）

**下一步：T4-2 优先**（T4-2 存储 / T4-3 信任 / T4-4 OTel 可并行）。
