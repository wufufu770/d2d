# T3-3 前置审计与拆批方案（T3-3-0，只读批）

> 形态同 T3-2-0 先例：本批零代码改动，唯一交付物为本文档 + 状态文档族。
> 审计方法：五项中前四项并行派发只读子 agent（4 个，宿主侧 agent 协作先例 11），
> 硬结论由主 agent 亲自复证（复证记录见 §8）。信息源分级：仓库代码 > 文档 > 子 agent 报告。

## 0. 摘要

四图数据全部可经既有 graphd `/query` 只读通道实现（零新增 endpoint，6-6 禁区教训遵守）；
授权数字化 ed25519 零外部依赖实测通过（生成/签名/验签/篡改拒绝），存在多个纯新增验签
挂接点，**无阻断项**；8.5 三件定级：看板合并/变异缩水/评测集半自动。建议拆 **3 实施批**
（可视化数据面+三图 → 桑基+9 标签页补全 → 授权契约数字化），依赖 1→2 串行、3 独立可并行。
**等待用户拍板后进首实施批**（拍板点清单见 §7）。

## 1. 审计项 1：可视化数据源面（四图可查性）

公共通道：`POST /query`（graphd/app.py:1654-1704，行数封顶 10000 + truncated 标记）；
面板走 host token（panel lib/host/snapshot.mjs:20-23 先例，不受 worker 全表扫禁）；
**四图在 panel 均无雏形**（client 目录 grep starmap/象限/桑基/泳道零命中，复证✓），
package.json 无图表库——需自绘 SVG（React createElement 手写形态，无 JSX）。

| 图 | 数据形态（实锚） | 可查性 | 查询草案要点 | 量级与约束 |
|----|------------------|--------|--------------|-----------|
| 星图 | Signal_（schema.py:17）+ AT/DERIVED_FROM/RELATES 三边（schema.py:52-57）；候选连线不在图内（allocator.candidateCoLinks 纯函数→runLog `candidate-links` 事件） | 可查；候选连线读 runLog 事件（wire 不带 evidence 全文，host 半复算为备选） | 三条 MATCH（open 信号/DERIVED_FROM 对/AT 端点），与 starmap-tick.mjs:15-22 同形 | 单 eng 数百信号；LIMIT 500+时间窗必须 |
| 覆盖热力图 | Signal_.surface×boundary 21 格固定枚举（7 面×3 周界，allocator.mjs:363-364） | **可查且服务端聚合直出**（count 分组 ≤21 行） | `RETURN su, bo, count(*)`（原型 scheduler.js:486） | 极小；缺口=存量旧信号坐标空串（非真空白） |
| 假设泳道 | Hypothesis（schema.py:22）；**生命周期纠偏**：`open→claimed→confirmed\|refuted\|suspected`（app.py:849-850，非任务书 pending→validated；复证✓） | 可查（GROUP BY status 计数+明细一条） | 两条 MATCH（计数/明细 ORDER BY ts LIMIT 200，同 loop.mjs:473） | 小；claimed 租约 15min 回流有视觉抖动 |
| 攻击链桑基 | Finding.gate_status 八态（gates.py:179）；CONFIRMS 边**仅 W3 修复后 verified 闭环补建**（gates.mjs:379-383 复证✓，存量恒 0）；逐信号归因靠 verify-result 证据文本 | 阶段漏斗可查；**逐节点流量需聚合**——transition-log.jsonl（graphd/gd/transition_log.py:15-23，8 字段 append-only，实测 425KB）是真实流量源 | 漏斗 `RETURN gate_status, count(*)`；流量对 host 半读 transition-log 聚合 from→to | 小（8 态+类型簇几十行）；时间维必须补 transition-log |

非图数据源：runLog（单 eng 800~3700 行，可喂候选连线提示/活跃度时间轴）、审计 JSONL
（1.7MB，门拒绝/安全事件条）、transition-log（桑基流量）、T2-1 转化率（面板已有
frontierConversion 卡可扩漏斗）、T3-1 misses 聚合（纯 host 文件读，知识缺口条形图）。

## 2. 审计项 2：panel 架构与侧边栏差距

- **架构**：host 半（Node，dsh 插件）+ client 半（React 18 手写 h() 无 JSX，零依赖
  build-client.mjs 按 ORDER 拼接 8 片段，拼接即行为）；两条挂载（dsh web profile/独立
  standalone :8790）；55 例分布 snapshot 34/start-policy 13/client 8。
- **既有页面**：2 个 tab（d2d:ops 13 卡 / d2d:findings 七态看板+人工裁决）；数据单一
  模式=浏览器→同源 `/d2d/api/*`→host 半直连 graphd（X-Auth host-token）；本地文件旁路
  （caps/model-policies/run-log/brain current）。
- **侧边栏差距**（勘误：dsh-sidebar-compat.md 是 DSH↔sidebar **版本配对表**非功能差距
  登记；真正差距=PANEL-UI-SPEC.md §11 全页稿[未实施]+roadmap:37 一句话）：审批
  （后端 API 已有 index.mjs:195-221、**client 零行代码**，复证✓ grep=0）/鱼骨轨迹
  （简化版）/finding 详情抽屉（仅单行）/CSRF token/声明式模块开关——均缺或部分。
- **9 标签页实锚**（roadmap.md:34 原文；无展开设计文档，§11 三 tab 全页稿为最近邻）：
  总览（部分，与 d2d:ops 合并即可）/审批（仅后端）/探索链路（缺）/漏洞资产（大部分
  已有）/经验库（已有）/探索前沿（部分）/工具调用（缺）/审计（缺）/配置（部分）。
  净新增三块：工具调用明细、审计时间线、桑基图；外加 manifest 消费卡（数据现成）。
- **接入惯例**（T2-1-2 转化率卡范本）：snapshot.mjs 加 Q.* 查询 → client 新片段入
  build ORDER → view 装配或 router 新 tab；wire 禁带 evidence/repro；2s visible 轮询。

## 3. 审计项 3：授权数字化基础（安全重点）

- **授权现状**：scope 字符串语法（scope.mjs，纯函数零 import）；配置来源=CLI//pentest
  或 p2p_start 参数→startEngagement（lifecycle-ops.mjs:249，scope 缺省回退 target 主机
  名 :263）→`CREATE (e:Engagement {..., auth:'declared', ...})`（:292，**硬编码字面量
  即天然挂点**，复证✓）；采纳路径（面板 requested→adopt）scope 来自图节点——验签须
  覆盖两路。消费面：loop.mjs 两处/scheduler.js bash 门薄壳/burp+js-scanner 直传/
  supervisor scopeSubsetOf/graphd Python 同口径纵深/egress 网关 30s 刷新。
- **ed25519 零依赖实测通过**（复证✓：verify true/篡改 false，签名 64B）；密钥管理
  候选=对齐 host-token 先例（`~/.config/d2d/auth-signing/<kid>.{pkcs8,spki}.pem`，
  0600/0700，kid 进契约做轮换导航，轮换=只增不改、吊销=移除公钥文件 fail-closed）。
  注意：`~/.config/d2d` 目录 775，私钥子目录应 0700（既有面小收紧项）。
- **验签挂接点候选**（全部纯新增，先例=T3-2-5 supervisor 块）：①startEngagement 入口
  （CREATE 前校验+adoptName 分支覆盖采纳路径）②p2p_start execute 预检③registerGate
  组合层（进程内缓存验签结果）④egress refreshScope。supervisor scopeSubsetOf 无需改
  （父已验签，子集自然继承）。
- **失败三态（fail-closed 草案）**：缺失=灰度 on 拒启/off 警告放行（灰度旗标
  `P2P_AUTH_CONTRACT` 缺省 off=现状零变化）；签名不匹配=无条件拒（硬规则不降级哲学）；
  过期=启动拒+运行中软截止（复用 drain 机制，不硬杀取证链）。
- **边界确认**：授权契约与审批面**正交无耦合**（approvals 对 scope.mjs 仅 import
  URL_RE 只读复用；开关独立）——契约化不动审批面本体。
- **字段草案**：version/contract_id/target/scope（逐字 scope.mjs 语法）/denylist 可选/
  valid_from..valid_until/principal/grantee/objective/key_id/alg='ed25519'/signed_at/
  signature（规范化载荷须钉死一种）/revoked 可选；节点侧复用现有 auth 列携带
  contract_id 引用，**不动 graphd schema**（委托人只进契约文件）。
- **待拍板**：graphd(Python) 侧不参与验签（标准库无 ed25519，引依赖违反零成本；建议
  维持 Node 侧单点验签、graphd 只消费已验 scope）。

## 4. 审计项 4：8.5 余量定级

| 件 | 定级 | 依据 |
|----|------|------|
| 能力看板 | **合并进可视化批** | 重叠度 70-80%：数据通道同源（host snapshot）、spec §11 已拆好批次；缩水为一张 manifest 消费卡（6 形态 9 项登记面数据现成——勘误：实为 6 形态非五形态，文件头注释遗留） |
| 变异测试 | **缩水（核心域试点）** | StrykerJS+配置+依赖已 100% 就位（stryker.conf.json 圈 sanitize+validator，thresholds 只报告不卡门）；增量=挂机 1-4h+收编 2 个 node:test 文件；全仓变异以天计且收益被 334 例 pytest 黄金门覆盖，性价比不成立 |
| 评测集跑测 | **缩水（半自动先跑 L1）** | 26 条实锚+expected.must_include 判定锚已齐；唯一消费方是门禁测试，**从未真跑过**；缺编排+打分器约 2-3 人日（图在位时跑 L1 单场检索）；L2/L3+garbage-control 留人工裁决（state 遗留项 10 口径）；live 全自动 5 人日+环境保真成本，收益倒挂 |

## 5. 禁区预比对（审计项 5 前半）

| 子项 | 预期改动面 | 禁区压力 | 结论 |
|------|-----------|---------|------|
| 可视化三图+看板卡 | panel lib/host/snapshot.mjs（Q.* 查询集）+ lib/client 新片段+build ORDER+view/router | **低**——全走 host 半既有只读通道（X-Auth host token 先例）；snapshot.mjs 与 client 片段均非禁区；wire 契约（不带 evidence）继承 | 可行 |
| 9 标签页补全 | 同上+host 路由增量（审批卡只消费既有 API） | **低**——审批 API 既有（index.mjs:195-221），UI 纯新增 | 可行 |
| 授权契约数字化 | 新契约模块（domain/）+lifecycle-ops 入口前置校验+p2p_start 预检+registerGate 组合层+egress refreshScope | **中**——lifecycle-ops/egress 非禁区文件（比对 do-not-touch 全清单零命中）；checkBash 判定链零触碰（组合层新规则先例 index.js:625）；approvals 零耦合实锚 | 可行（验签为纯新增前置，不改判定链） |
| 变异试点 | stryker.conf.json mutate 面扩展+2 个 node:test 收编 | **低**——测试文件非禁区 | 可行（随批顺手） |

**审计发现登记（不修）**：hostAllowed 空 scope fail-open（:47,:54——真正 fail-closed 在
checkBash 层 :151-152）；`~/.config/d2d` 目录 775；manifest 文件头"五形态"注释遗留；
panel 测试盲区（host 路由 approval/eng/start 等分支无路由级测试）。

## 6. 拆批方案（建议 3 实施批；预估每批 4-6 commit 族）

### 批 1 · T3-3-1 可视化数据面 + 三图 + 看板卡
范围：snapshot.mjs 查询集（四图 Q.*+transition-log 读取备料）→ 热力图（聚合直出，最低
垂）→ 假设泳道 → 星图（含 runLog 候选连线提示）→ manifest 消费卡+转化漏斗扩展；
新增新 tab（d2d:viz）入 router。
验收：四图实数据渲染（靶场 engagement）+快照测试扩展+client 拼接防漂移守护。
预估 5-6 族（host 查询/client 图形×3/看板卡/测试/docs）。

### 批 2 · T3-3-2 桑基图 + 9 标签页补全 + 侧边栏对等收口
范围：桑基（transition-log host 半聚合）→ 审批卡（消费既有 API）→ 工具调用明细 →
审计时间线（audit.jsonl+transition-log 消费）→ 探索链路/前沿补全 → 总览/配置整合判定
落地；spec §11 增量择要（CSRF/抽屉按余量）。
依赖：批 1 的可视化通道与 client 片段基建。
验收：9 标签页逐个现状判定表复核+审批卡实战可用+侧边栏对等差距矩阵复核。
预估 4-5 族。

### 批 3 · T3-3-3 授权契约数字化（独立安全批，可与批 1/2 并行）
范围：auth-contract 契约模块（ed25519 签验+字段 schema v1）+CLI 签约工具+四挂接点
（startEngagement 前置/adoptName 分支/p2p_start 预检/egress refreshScope）+三态
fail-closed+灰度 P2P_AUTH_CONTRACT（缺省 off=现状零变化）+测试（签验/篡改拒/过期/
缺失三态/挂接点纯新增源码断言）+密钥管理 runbook。
验收：端到端演练（签契约→启动→篡改拒→过期软截止）+零改动源码断言（checkBash 链/
approvals 本体）。
预估 4-5 族。**拍板前置**：灰度缺省值确认（建议 off）。

### 8.5 三件（用户拍板后插批或随批）
- 看板卡 → 已并入批 1。
- 变异试点 → 可随批 3 或独立半日批（挂机 1-4h）。
- 评测集半自动 → 独立小批（2-3 人日）或 T3-3 后。

### 收官件预案
tag `t3-3-stage65`（阶段 6.5 收官）指向 manifest 收口 SHA；devlog 收官节（三批总账+
9 标签页终态矩阵+授权数字化验收记录）。

## 7. 用户拍板点清单（回报后拍板，不默认）

1. **批次切分认可**：3 实施批（1 可视化 → 2 标签页 → 3 授权数字化，1→2 串行、3 并行）。
2. **8.5 取舍**：看板并入批 1（建议做）；变异试点（建议随批 3 挂机档）；评测集半自动
   （建议 T3-3 后独立小批或缓）——三件各自做/缓。
3. **授权数字化排批确认**：ed25519 可行性已证，批 3 是否排入（建议排）。
4. **灰度缺省值**：P2P_AUTH_CONTRACT 缺省 off（建议）。
5. **graphd(Python) 侧不参与验签**（建议维持 Node 侧单点）。

## 8. 子 agent 派发记录（先例 11 溯源）

| # | 任务 | 结果 | 采纳/降级/冲突 | 硬结论复证 |
|---|------|------|----------------|-----------|
| 1 | 可视化数据源面（四图可查性+查询草案+量级） | 报告全文采纳入 §1 | 采纳 | 复证：panel 无 starmap 雏形（grep 零命中✓）；Hypothesis 枚举纠偏（app.py:849-850 ✓） |
| 2 | panel 架构与侧边栏差距 + 9 标签页实锚 | 报告全文采纳入 §2 | 采纳（含两处勘误：compat 表是版本配对非差距登记；manifest 6 形态注释遗留） | 复证：审批 client 零行代码（grep=0 ✓） |
| 3 | 授权数字化基础（ed25519/密钥/挂接点/边界） | 报告全文采纳入 §3 | 采纳 | 复证：ed25519 签验+篡改拒（✓）；auth:'declared' 硬编码（lifecycle-ops.mjs:292/317 ✓） |
| 4 | 8.5 三件定级 | 报告要点采纳入 §4 | 采纳（含勘误：panel src/ 路径不存在实为 lib/） | 定级为建议非硬结论，用户拍板 |
| — | 审计项 5（禁区比对+拆批综合） | 主 agent 自做（依赖前四项产出+禁区清单在主会话） | — | CONFIRMS W3 溯源（gates.mjs:379-383 ✓） |

软上限 4 守住（派 4 自做 1）；子 agent 零落库权（本批落库由主 agent 工作流承载）。
