# T4-2 存储层选型决策书（Kùzu 归档风险评估 + LadybugDB 迁移可行性 + 6-6 重评条件判定）

> **决策批产出，非实施方案**。零迁移动作、graphd 零改动、Kùzu 配置零改动、DATA_DIR 零触碰（只读探针）。
> 选项矩阵全列，建议给依据，**拍板归用户**（拍板点清单见 §八）。
> 数据实锚时点：2026-10-02；外部信息时效同日，来源 URL 全清单见附录 C。

## 一、决策问题

KùzuDB 母公司 2025-10-10 归档开源仓库（核心团队被 Apple 收购），graphd 的存储引擎 kuzu==0.11.3 成为绝版。需判定三件事：

1. 现库的**规模与增长**是否构成触顶压力，"维持 Kùzu+归档"是否成立；
2. **迁移 LadybugDB**（Kùzu 社区延续项目）的可行性、成本与风险；
3. **6-6（事件驱动并发）重评条件**在候选矩阵内是否成立（T3-2-0 止损裁决：新存储层有原生事件/订阅机制才值得重评）。

## 二、现状实锚（2026-10-02，graphd v1.6.0 运行中，只读探针）

### 2.1 图规模

| 表 | 计数 | 说明 |
|---|---|---|
| Signal_ | **5,108** | 大头；open 4,180 / consumed 695 / stale 119 / refuted 65 / confirmed 42 / 其他 7 |
| Task | 1,381 | 历史任务队列（全部可裁） |
| AgentIdentity | 1,321 | 历史 worker 心跳（全部可裁） |
| Finding | 777 | 漏洞资产（长存） |
| Hypothesis | 435 | 假设池 |
| ExperienceWeight / Experience / Frontier | 97 / 9 / 3 | 经验与前沿（跨项目共享，长存） |
| Engagement | 17 | 全终态（14 frozen / 2 exhausted / 1 completed，无 active——当前停战期） |
| Handoff | 75 | 里程碑 |
| Endpoint / Plan | 0 | 未启用表 |
| **节点合计** | **14,146** | |
| 边合计 | 6,786 | DERIVED_FROM 6,648 / CONFIRMS 138 / 其余 4 表 0 |

### 2.2 库文件形态与磁盘

- `graphd/kuzu_db` **80MB 单文件**（0.11.x 单文件形态）+ `kuzu_db.wal` 5.7MB + `.lock`；手工备份 `kuzu_db.bak-09191809`（80MB）已存在。
- DATA_DIR 总 351MB（spa-profile 158M / backups 112M / logs 23M / runs 12M 等）——**库文件不在 DATA_DIR**，在 graphd/ 下约 166MB（含 bak）。
- 日志增速：transition-log ~280 行/天（74KB/天）；audit.log ~650 行/天。logs/ 23MB 是当前 DATA_DIR 增长主力，与库无关。

### 2.3 增长推算与触顶预估（含假设声明）

- **假设声明**：无历史快照，用当前量级+日志推算。Signal_ 5,108 跨约 5 周（audit.log 首行 9-04）≈ **145 节点/天 + 190 边/天**；近期 transition-log 峰值 532 行/天（9-27 含探针批），取保守区间 **150-400 节点/天**。
- 库字节密度 ≈ 80MB / 14,146 节点 ≈ **5.7KB/节点**。
- 推算：按 300 节点/天（保守×2）线性外推，**1 年 ≈ 11 万节点 ≈ 620MB；3 年 ≈ 33 万节点 ≈ 1.9GB**。
- **触顶判定**：Kùzu 无官方规模硬上限（官方口径"数十亿"级，CIDR 2023 论文）；公开 issue 痛点集中在**数百 GB / 亿级**（#4936 150GB 库 OOM、#4943 buffer manager 异常、#6012 导入内存无界）。本项目量级距痛点区 **3-4 个数量级**——以单机自用强度，**规模触顶不在本项目可见时间线内（≥3 年）**。
- 真实到期风险不是规模而是**生态**（§三）：wheel 冻结、零修复、扩展服务器关闭。次要运维项：checkpoint 全量刷盘代价随库线性增长（80MB 库当前秒级，GB 级仍在分钟内）；WAL 长期不 checkpoint 有损坏重放风险（#5016/#5120 实锚，本库 WAL 5.7MB/3 周未动，风险低但应纳入归档节奏）。

### 2.4 graphd 耦合面清点（迁移 = 动 graphd 全域的定量依据）

- 核心代码 3,023 行（app.py 1,817 / gates.py 1,169 / queries.py 37）；**cypher 执行点约 75 处**（app.py 43 / schema.py 31 / gates.py 1）。
- Kùzu 方言特征命中 26 处：REL TABLE DDL 6 条、`timestamp('1970-01-01...')` 默认值 7 处（kuzu 0.11 DDL 无当前时刻函数默认的现场实证写法）、`table_info` CALL、`coalesce`/`CASE WHEN`/参数绑定全量使用。
- gates.py `worker_query_allowed` 白名单（MATCH/RETURN/WITH + 变更关键字黑名单）与 `host_query_gate` 的 CALL 禁令是**安全面**——任何迁移必须证明该门语义在目标引擎下等价（黑名单字面覆盖 Ladybug 新增 ATTACH/IMPORT 语句，见 §三）。
- graphd 为单进程单库单写者（app.py:231 全局 Database + flock 互斥）——迁移停机窗口可控，无并发障碍。

## 三、外部环境实锚（摘要；来源 URL 全清单见附录 C）

### 3.1 Kùzu 后现状

- 归档 2025-10-10（Apple 收购，官方 README/BetaKit/欧盟申报披露）；**kuzu 0.11.3 与归档同日发布=绝版**；PyPI 官方声明"不再接收任何更新"；官方扩展服务器已关闭。
- 已发布版本"可继续使用"（官方口径），MIT 到最后一刻；**wheel 覆盖 CPython ≤3.14**——未来 Python 无新 wheel，pin 0.11.3 有隐性到期日。
- 官方迁移/备份命令：`EXPORT DATABASE`（默认 Parquet，schema.cypher+copy.cypher+数据文件；只能导入空库，失败不自动回滚）、`COPY TO`（官方明示用途含 archiving）、`CHECKPOINT`+停写+拷文件（物理备份姿势）。
- 冷归档**技术上成立**，前提三条：归档前 checkpoint 清空 WAL（#4006）；同版本 0.11.3 只读重开（`read_only=True` 支持多进程；跨版本无兼容承诺 #5064/#5535）；归档 wheel+校验和+扩展镜像。

### 3.2 LadybugDB（Kùzu 社区延续）

- **身份**："formerly known as Kuzu"（非 GitHub fork，代码库重建延续，6,516 commits）；**Kùzu 原核心团队 5+ 人参与（含联创 Semih Salihoglu）**；MIT；最新 v0.21.2（2026-10-01），自 2025-11 起 29 个 release、近 4 周 140 commits——**活跃度高**。
- **兼容面（逐项核对）**：DDL（NODE/REL TABLE/DEFAULT/ALTER IF NOT EXISTS）✅；参数绑定 ✅；Python API（Database/Connection/execute(parameters)/has_next/get_next）✅ 逐方法源码核实同构；`current_timestamp()` 反而补齐 0.11.3 缺口。⚠️ 两处未锁定：`timestamp('...')` 作为 DDL DEFAULT 表达式的组合、`IN $ids`/`LIMIT $lim` 绑定行为（同 binder 继承，高置信）——迁移前 DDL 冒烟。
- **强制改动仅两处**：`import kuzu` → `import ladybug`（可 2 行 shim 实现 app.py 零改动）+ DB 文件后缀（.kz→.lbdb，reset 逻辑适配）。
- **迁移路径**：仅停机迁移——Kùzu 侧 `CHECKPOINT; EXPORT DATABASE`（Parquet）→ 空库 `IMPORT DATABASE`；数据文件互不兼容（OneUptime："changes a name, not a storage format"）；失败无自动回滚（删库重导）。本库 80MB，导出导入秒级；`kuzu_db.bak-09191809` 可作演练副本。
- **原生事件/订阅机制：无**（明确否定：文档全站无 watch/trigger/CDC；源码 trigger 命中均为内部实现注释）——**6-6 不因迁移 LadybugDB 解锁**。
- **风险**：死寂风险低-中（活跃度正面 vs 治理/资金不透明、单一 org、赛道先例脆弱）；功能缺口低；API 断裂低（0.x 快速迭代需钉版跟进）。

### 3.3 横向候选一行档案

| 候选 | 形态 | 许可证 | Cypher | 原生事件/trigger |
|---|---|---|---|---|
| LadybugDB | 嵌入（同 Kùzu） | MIT | Kùzu 方言延续 | 无 |
| RyuGraph / Vela kuzu / Bighorn / NeuG（forks） | 嵌入 | 未核实 | 继承 | 未核实（活跃度/单一主体风险更高） |
| Memgraph | **服务进程**（Bolt，非嵌入） | BSL 1.1 + 商业 | 兼容 | **有（唯一）**：原生 CREATE TRIGGER（节点/边/全库×BEFORE/AFTER COMMIT）+ Kafka Streams 社区版可用 |
| FalkorDB（含 Lite） | Redis 模块/服务 | SSPL（非 OSI） | openCypher | 无（keyspace 通知是未实现 feature request #1496） |
| DuckDB + DuckPGQ | 嵌入列存关系库 | MIT | **不兼容**（SQL/PGQ；无 REL TABLE DDL，schema.py 无法原样迁移） | 无 |

## 四、选项矩阵

| 选项 | 迁移成本 | 风险 | 收益 | 触发条件（何时该选它） |
|---|---|---|---|---|
| **A. 维持 Kùzu 0.11.3 + 归档策略** | **零迁移**（归档三件套约 0.5-1 人日/首次，之后每季例行） | 生态到期（Python 3.14 冻结/零修复/扩展关闭）；WAL 损坏长尾风险；数据规模无压力 | 零迁移风险、零禁区触碰；graphd 3,023 行 75 执行点原样 | 规模无压力（当前成立）且无运行时升级需求——**默认态** |
| **B. 迁移 LadybugDB** | **低**：1-2 批次（试点批：bak 副本演练 EXPORT→IMPORT+DDL 冒烟+shim；切换批：停机迁移+全量三轨+观察期）。graphd 预期改动：import shim 2 行+文件后缀/reset 适配+依赖行——查询面与 gates 门预期零改动 | 迁移中断风险中（停机+失败无回滚，需二次窗口）；治理不透明；0.x breaking 跟随成本；**禁区压力=动 graphd 全域 import 面（触发 6-6 级禁区审视）** | 恢复上游修复流（0.x 持续演进）；补齐 current_timestamp；MIT + 原团队延续=合法性与人才面最优；摆脱 wheel/Python 冻结倒计时 | 任一触发：①Python ≥3.15 且需升级运行时；②现场数据损坏且无修复渠道；③LadybugDB 治理/1.0 稳定信号；④主动跟进上游修复的需求出现 |
| **C. 其他图库**（Memgraph/FalkorDB/DuckDB/forks） | **高**：Memgraph=架构级（嵌入→Bolt 服务进程+依赖拓扑变化+Falcon 语法差异+BSL 许可评估）；FalkorDB=Redis 拓扑+SSPL；DuckDB=Cypher 全量重写（queries 面 75 处+gates 门重设计）；forks=比 LadybugDB 活跃度/团队更弱 | 架构改变级（Memgraph）或许可风险（SSPL/BSL）或重写级（DuckDB） | 仅 Memgraph 有原生 trigger（6-6 唯一现成解） | **仅在 6-6 升级为强需求且接受服务化架构时单独立项**——本矩阵内不成立 |
| **D. 混合**（Kùzu/Ladybug 主库 + Parquet 导出进 DuckDB 分析面） | 中（新增分析管道） | 双存储一致性负担；本项目分析面需求已由 JSONL 文件面（transition-log/audit/panel host 半）承接，图分析需求低 | 分析查询解耦 | **不建议**：无真实需求拉动，引入一致性负担得不偿失 |

## 五、6-6 重评条件判定（本决策书核心判定项之一）

**判定：候选矩阵内 6-6 重评解锁条件不成立。**

| 候选 | 事件/订阅机制 | 6-6 判定 |
|---|---|---|
| Kùzu 0.11.3 | 无（永无，已归档） | 不解锁（维持 T3-2-0 止损裁决；T3-2-6 闲时任务外挂已承接大部分收益） |
| LadybugDB | 无（明确否定，文档全站+源码双核） | 不解锁 |
| Memgraph | 有（原生 trigger + Streams） | **唯一满足**，但代价=放弃嵌入形态改服务进程+BSL 许可——这是架构级改变，超出"存储层续命"本批范围；若未来 6-6 升格为强需求，按独立立项评估，不入本矩阵 |
| 其余全部 | 无/未核实到实锚 | 不解锁 |

**结论**：6-6 维持降级状态，重评条件从"新存储层有原生事件/订阅机制"**精确化**为——"Memgraph（或未来出现嵌入形态+原生事件的候选）被引入且接受其架构与许可代价"。文件旁路轮询（paused.json / transition-log JSONL / idle-tasks）仍是事件面唯一通道，该模式已由 T3-2-6 实证有效。

## 六、归档策略设计草案（选项 A 的完整论证——同等认真设计的选项）

1. **归档三件套（一次性建立，约 0.5-1 人日）**：
   a. **逻辑兜底**：季度 `CHECKPOINT; EXPORT DATABASE '<archive-dir>'`（Parquet）——防物理文件版本锁死，这是唯一跨引擎可读的形态；
   b. **物理快照**：checkpoint 后拷 `kuzu_db` 文件（现有 `.bak-09191809` 惯例延续，加日期后缀+保留最近 3 份）；
   c. **恢复环境钉扎**：kuzu 0.11.3 wheel+sha256+扩展镜像（`ghcr.io/kuzudb/extension-repo`）+Python 3.13 venv 说明，一并入归档目录——"包还在≠恢复计划"。
2. **裁剪策略（保留窗口）**：AgentIdentity/Task 全量裁剪（纯历史件，当前 2,702 节点=19%）；终态 Signal_（consumed/stale/refuted）保留 90 天后裁；终态 Engagement 关联子图按 eng 整组裁剪。**实现归拍板后实施批**（graphd 写面操作，本批零动作）。
3. **checkpoint 节奏**：graphd 侧纳入周期 checkpoint（WAL 5.7MB/3 周未动说明当前无压力；归档/备份前必须 checkpoint）。
4. **监控锚**：季度复跑 §二只读探针（命令附录 B），库 >1GB 或节点 >30 万即触发选项 B 评估（即使无生态触发条件）。

## 七、建议与依据（不预定结论）

**倾向：A（维持+归档策略）为主，B（LadybugDB 迁移）作为触发条件驱动的就绪预案。**

依据：
1. **规模数据不支持急迫迁移**：80MB/1.4 万节点，距公开痛点区 3-4 个数量级，3 年外推仍 <2GB（§2.3）。
2. **迁移的技术风险虽低但禁区压力高**：B 的技术改动极小（shim+后缀），但动作=动 graphd 全域 import 面——按 T3-3-0 以来禁区纪律，这需要独立批次+全量回归+观察期，成本主要在流程而非代码。
3. **生态倒计时真实但不迫近**：Python 3.15 未发布、当前运行时不需升级——触发条件①未到；wheel 在 PyPI 长期可装（3.14 及以下）。
4. **LadybugDB 是高置信预案**：三面同构逐项验证+原团队+MIT+29 releases——若触发条件到达，迁移是"1-2 批次的确定性工作"而非"高风险探索"。**预案就绪本身显著降低 A 的持有风险**。
5. **6-6 不构成迁移理由**：唯一有事件机制的候选（Memgraph）与嵌入架构冲突且许可复杂（§五）——为 6-6 而迁移在当前收益曲线下不成立。

**反方案（选 B 立即迁移）的成立条件**：若用户更看重"摆脱死库持有风险/尽快回到上游修复流"，B 立即执行也可辩护——试点批（bak 副本演练）零生产风险，80MB 迁移窗口秒级。差异本质是**风险偏好与批次预算**，不是技术分歧。

## 八、用户拍板点清单

| # | 拍板点 | 选项 |
|---|---|---|
| 1 | **选型方向** | A 维持+归档（倾向）/ B 立即迁移 LadybugDB / C 横向候选（Memgraph 需接受服务化+BSL）/ D 混合（不建议） |
| 2 | **若 A：归档策略参数** | 季度 EXPORT 频率 / 物理快照保留份数（建议 3）/ 裁剪保留窗口（Signal_ 终态 90 天）/ 是否随批实施裁剪 |
| 3 | **若 A：B 预案的形态** | 只登记触发条件（最轻）/ 预写迁移 runbook（0.5 人日，触发时零准备）/ 预做试点批（bak 副本演练 EXPORT→IMPORT，零生产风险） |
| 4 | **若 B：迁移时机** | 立即（下一批 T4-2b）/ 下个自然窗口（Python 3.15 前）/ 触发条件驱动 |
| 5 | **6-6 重评** | 维持降级（判定：矩阵内无解锁候选，§五）/ 若未来引入 Memgraph 类候选则按独立立项重评（本判定已写入 roadmap） |
| 6 | **探针脚本** | §2 只读探针是否落为 scripts/ops/graph-stats-probe.mjs（主流程守卫，季度复测增长锚）——本批未落（决策批零代码预期），归拍板 |

## 附录 A：假设与未确认项声明

- 增速为当前量级+保守外推（无历史快照），已在 §2.3 声明；若未来活跃度显著上升（多 engagement 并行常态），按季度探针修正。
- LadybugDB 两处未锁定（DDL DEFAULT 函数组合 / IN 列表绑定）——迁移前 1 条 DDL 冒烟闭合。
- Kùzu"写入渐进变慢"无命名公开实锚（相近代理证据 #4953/#2529）。
- forks（RyuGraph/Vela/Bighorn/NeuG）许可证与活跃度未逐一核实（候选矩阵标注"未核实"）。
- 外部信息时点 2026-10-02；LadybugDB 迭代快，拍板迁移前应复核其最新 release notes。

## 附录 B：只读探针命令（手动复跑口径）

```bash
TOKEN=$(cat ~/.config/d2d/host-token)
q() { curl -s -m 8 -H "Content-Type: application/json" -H "X-Auth: $TOKEN" \
  -d "{\"cypher\":\"$1\"}" http://127.0.0.1:8766/query; echo; }
for t in Engagement Endpoint Signal_ Hypothesis Finding Plan ExperienceWeight Experience Frontier AgentIdentity Task Handoff; do printf "%-16s " "$t"; q "MATCH (n:$t) RETURN count(n) AS n"; done
for e in AT CONFIRMS SUGGESTS DERIVED_FROM PRIOR_FOR RELATES; do printf "%-12s " "$e"; q "MATCH (a)-[:$e]->(b) RETURN count(a) AS n"; done
q "MATCH (s:Signal_) RETURN s.status AS st, count(s) AS n"
ls -la graphd/kuzu_db graphd/kuzu_db.wal
du -sh ~/.d2d-data/logs ~/.d2d-data/runs
```
（全部只读 /query + 文件元数据；零写面。若落为脚本归拍板点 6。）

## 附录 C：外部信息来源清单（2026-10-02 检索，子 agent 调研报告全文引证）

**Kùzu 后现状与官方口径**
- 归档仓库（2025-10-10 archived，官方横幅与 README 口径）：https://github.com/kuzudb/kuzu
- PyPI 归档声明（kuzu 0.11.3 绝版）：https://pypi.org/project/kuzu/
- 官方迁移文档（EXPORT/IMPORT DATABASE 语义）：https://kuzudb.github.io/docs/migrate
- 官方导出文档（COPY TO 含 archiving 用途）：https://kuzudb.github.io/docs/export
- Apple 收购披露：https://betakit.com/apple-strikes-deal-to-acquire-canadian-database-software-startup-kuzu · https://cs.uwaterloo.ca/news/waterloo-based-graph-database-start-up-kuzu-acquired-apple · https://9to5mac.com/2026/02/11/kuzu-database-company-joins-apples-list-of-recent-acquisitions
- 已知问题实锚（GitHub issues，均已随归档冻结）：内存 #4936/#4943/#6012/#5515、写入崩溃 #4953、checkpoint 代价 #2529、checkpoint 致损 #6045、WAL 损坏 #5016/#5120、版本不兼容 #5064/#5535/#5407、WAL 非空限制附加 #4006、只读多进程 #2934
- 规模口径（无硬上限，"数十亿"级）：CIDR 2023 论文 https://www.cidr.org/cidr2023/papers/p48-jin.pdf

**LadybugDB**
- 仓库（"formerly known as Kuzu"，v0.21.2 2026-10-01）：https://github.com/LadybugDB/ladybug
- 官网/博客（原团队延续、MIT、"more than a kuzu fork"）：https://ladybugdb.com · https://ladybugdb.com/post/ladybug-spreading-its-wings
- 官方文档（DDL/Prepared Statements/Python API/Migrate）：https://docs.ladybugdb.com/ · https://docs.ladybugdb.com/cypher/data-definition/create-table · https://docs.ladybugdb.com/get-started/prepared-statements · https://docs.ladybugdb.com/client-apis/python · https://docs.ladybugdb.com/migrate
- Python 包：https://pypi.org/project/ladybug/ · Node 包：https://www.npmjs.com/package/@ladybugdb/core
- 第三方迁移分析（数据文件互不兼容："changes a name, not a storage format"）：https://oneuptime.com/blog/post/2026-08-12-kuzu-to-ladybugdb-packages-apis-extensions-database-files/view

**横向候选**
- Memgraph 原生 trigger 文档（6-6 唯一满足候选）：https://memgraph.com/docs/fundamentals/triggers
- FalkorDB 许可证（SSPL）：https://docs.falkordb.com/references/license · keyspace 通知未实现 request：https://github.com/FalkorDB/FalkorDB/issues/1496
- DuckPGQ（SQL/PGQ 非 Cypher）：https://duckpgq.org · https://duckdb.org/community_extensions/extensions/duckpgq
- fork 生态盘点（RyuGraph/Vela/Bighorn/NeuG，活跃度未逐一核实）：https://gdotv.com/blog/kuzu-legacy-embedded-graph-database-landscape · https://github.com/predictable-labs/ryugraph

**Kùzu 单文件形态佐证**
- v0.11.x 单文件化与版本报错改进：https://github.com/kuzudb/kuzu/issues/5407
