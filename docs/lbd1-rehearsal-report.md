# LBD-1 存储迁移预演报告（LadybugDB · 2026-10-03/04）

> 使命：B 预案从"可行性已验证"（RECOV-1）推进到"切换就绪"。本报告是 LBD-2（生产
> 切换）的决策输入。全程预演面：生产 kuzu_db 零写零删除、生产实例零重启零配置变更。

## 一、兼容面审计结论（graphd × LadybugDB 0.21.2）

graphd 对 kuzu 的 API 依赖面实测极简：`import kuzu` ×1 + `kuzu.Database` ×1 +
`kuzu.Connection` ×17（每请求新建）；**零事务、零 PRAGMA**（唯一 CALL=table_info 在
gd/schema.py 内部直连）；67 处异常捕获全为宽泛 `Exception`/`TimeoutError`，不依赖 kuzu
异常类型。引擎开关落地为 import 层条件化（`P2P_GRAPH_ENGINE`，缺省 kuzu）——下游
`kuzu.Database/Connection` 调用点零改动。

| 差异项 | 定级 | 处置 |
|--------|------|------|
| **进程内多 Database 实例反复建销 → 原生 Segfault**（pytest 每测试建库销库形态；隔离单测全绿、同进程累积后崩，崩溃点在 gates 套件第 9 测附近） | **阻断级（测试基建面）** | 预演三轨改道（见 §二）；LadybugDB 多实例生命周期问题登记上游跟踪；kuzu 测试轨保留 |
| h18 reset 类测试 RuntimeError（DB 关闭+删除重建语义，`_lbug_capi.py:186`） | 阻断级（同根：实例生命周期管理） | 同上 |
| execute/get_next/has_next/table_info/标量与列表参数绑定/IN 字面量 | 无影响 | RECOV-1+本批预演实例实证（六查询全通） |
| 异常捕获形态 | 无影响 | 全宽泛捕获，零 kuzu 类型依赖 |
| DEFAULT 语义 | **LadybugDB 优** | CREATE 缺省列='' 保真——kuzu IMPORT 后丢失问题（RECOV-1 段②）在 B 预案不存在 |

## 二、预演三轨结果（诚实记录——拍板目标"三轨全绿指向预演实例"未全达）

| 轨 | 引擎形态 | 结果 |
|----|----------|------|
| pytest（kuzu 缺省态） | kuzu 进程内 | **414 全绿**——引擎开关缺省态零回归实证 |
| pytest（ladybug 进程内） | ladybug 进程内每测试建销 | **不可达**：前 8 测 2 失败+第 9 测 Segfault 进程死亡；隔离重跑同名用例全绿 → 多实例累积性引擎问题（非业务代码缺陷） |
| mocha / panel | 引擎无关（fake/mock，CI 无 graphd 实例跑绿为证） | **1971 / 88 全绿** |
| 预演实例功能面 | ladybug 单实例（IMPORT 生产导出包 4.24s） | /health 正常+RECOV-1 三查询+性能六项全通（见 §三） |

结论：**单实例长跑形态（=生产形态）功能面全绿；进程内多实例形态（=pytest 形态）引擎崩溃**。测试基建与生产形态的引擎负载剖面不同，是本次预演的核心发现。

## 三、性能对比（同数据同查询，5 轮中位，ms）

数据基线：同一生产快照（RECOV-1 EXPORT 包）分别以 kuzu(:8766 生产实例)与 ladybug(:8799
预演实例)承载。**差异 >2 倍的项：无**。

| 查询 | kuzu | ladybug | 比 |
|------|------|---------|-----|
| finding_crit_high_scan（severity IN 扫描） | 16.8 | 20.5 | 1.22x |
| signal_eng_agg（eng 过滤+GROUP BY） | 21.9 | 22.0 | 1.01x |
| experience_consensus_scan（consensus 非空+ORDER+LIMIT） | 16.2 | 16.5 | 1.02x |
| gates_pending_scan（双 IN+eng 过滤——gates 高频面） | 14.5 | **11.9** | **0.82x（ladybug 快 18%）** |
| experience_eng_read（eng_id 过滤——dualExpBrief 读面） | 13.1 | 12.8 | 0.98x |
| agent_exit_agg（exit_class 分组——L1 读面） | 16.3 | 16.9 | 1.03x |

## 四、soak（60 分钟持续查询循环+资源观测——实测终值）

- 规模：709 轮 × 4 代表查询（5s 间隔）= **2836 查询全成功、0 错误**。
- 资源：RSS 150.4 → 157.4 MB（+7MB 后趋平，无泄漏迹象）；线程 9、句柄 6 全程恒定。
- 结论：**单实例长跑形态长稳健康**——与进程内多实例 Segfault（§二）形成形态分明的
  对照：崩溃面=测试基建的建销负载，生产形态无此剖面。留档 /tmp/lb-soak-result.json。

## 五、切换 runbook 与回滚预案（成稿于 runbook-storage §八——LBD-2 执行蓝图）

## 六、决策建议

**暂缓切换（HOLD），理由两条硬证据**：
1. **测试基建断裂**：pytest 全量在 ladybug 下不可达（Segfault）——切换后 CI 无法全量
   验证引擎面；三选一路径=①测试轨维持 kuzu（引擎分轨，预演价值打折但生产形态已有
   单实例实证）②pytest fixture 单实例化改造（测试基建重构批）③等上游修复多实例问题。
2. **引擎稳定性问题未决**：多实例 Segfault 属 LadybugDB 0.21.2 引擎级，上游修复前切换
   的长稳风险不可量化。

**已达标面**（为 LBD-2 备好）：性能六项 0.82~1.22x 无红线项；单实例功能面全绿；
DEFAULT 语义保真；MIT 许可；导出包级迁移路径已证。**若用户接受引擎分轨方案（①），
LBD-2 可执行**——runbook §八 已成稿，观察期/回滚/依赖保留周期全部可落。
