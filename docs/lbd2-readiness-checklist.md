# LBD-2 生产切换就绪检查单（LBD-2-pre 产出 · 2026-10-04）

> 用法：用户 go 后另批执行，本单逐项勾选作为切换批的验收骨架。执行蓝图=runbook-storage
> §八（本单为其可勾选形态，冲突时以 §八 为准）。**零生产面红线全程有效**：执行前生产
> kuzu_db 零写、生产 graphd 实例零重启、T4-3-2 bak 零触碰。

## A. 就绪态（切换批启动前逐项核验，全部 ✅ 方可进 B 段）

- [ ] **A1 引擎开关面**：`P2P_GRAPH_ENGINE` 缺省 kuzu（生产态零变化）——合并后 main 实测
  （LBD-2-pre 双轨 414 绿：缺省 101.20s / ladybug 90.31s，mocha 1981 / panel 88）
- [ ] **A2 liblbug 就位**：`liblbug-linux-x86_64.tar.gz`（v0.21.2 资产）下载落位
  `<staging>/lib/ladybug/liblbug.so.0.21.2`，sha256 复算 =
  `f3de0f9be86fffd0919bc7a7f65699d1b099d0a1df7115142fa1606ba83c94c4`
- [ ] **A3 ladybug 运行时冒烟**：`LBUG_C_API_LIB_PATH=<A2 路径> python3 -c "import ladybug;
  ladybug.Database('/tmp/lbd2-smoke')"` 建/销一次成功（无 `_lbug_capi.py:186` RuntimeError）
- [ ] **A4 新库路径**：`<new_db>` 目录已规划（**不在**生产 kuzu_db 路径、不在 bak 路径；
  磁盘余量 ≥ 导出包 3 倍）
- [ ] **A5 staging 导出目录**：`<staging>/export` 可写、独立于生产数据目录
- [ ] **A6 测试基建面**：main 上双轨绿为前提——收编后任一轨回归即退回（止损条款：
  非既有失败出现 → LBD-2 自动退回 HOLD）
- [ ] **A7 停写窗口窗口期**：与用户约定执行时刻（评测/实战空闲档）；停写预计 <10 分钟

## B. 切换执行（停写窗口内，顺序不可调换）

- [ ] **B1 停写**：panel/宿主暂停调度环认领 → 确认图写入面停（audit log 尾查）
- [ ] **B2 最新导出**：生产实例 `POST /query EXPORT DATABASE '<staging>/export'`
  （读库写目录语义，历史基线 4.27s/4.2MB 量级）
- [ ] **B3 新库导入**：ladybug 空库 → `IMPORT DATABASE '<staging>/export'`
  （历史基线 7.06s；kuzu EXPORT 包直接 IMPORT 已两批实证）
- [ ] **B4 DEFAULT 回填两条**：`UPDATE … SET consensus_status='' WHERE consensus_status IS NULL`
  + `UPDATE … SET reasoning_path='' WHERE reasoning_path IS NULL`
  （历史实测 0.157s；kuzu 导出在 ladybug 上 DEFAULT 语义保真，此步清存量 NULL 面）
- [ ] **B5 配置翻转**：生产 graphd 停止 → `P2P_GRAPH_ENGINE=ladybug P2P_GRAPH=<new_db>
  LBUG_C_API_LIB_PATH=<A2 路径> python3 graphd/app.py`（**原 kuzu_db 目录零写零删除保留
  =回滚资产**）

## C. 六步验证（B5 后即时执行，任一红 → 触发 D 回滚）

- [ ] **C1** `/health` 正常且无 `schema_degraded` 键（16 列完整识别）
- [ ] **C2** 逐表行数比对（对 B2 导出包计数，12 节点+6 边表全等）
- [ ] **C3** RECOV-1 三代表查询计数与源一致
- [ ] **C4** L1 stability-view 只读冒烟（scripts/ops/stability-view.mjs）
- [ ] **C5** 双签端点只读探针：`/write/dual-sign-transition` 对测试 finding 走一转态+
  审计留痕核对（DUAL_SIGN_TRANSITIONS 白名单边内）
- [ ] **C6** 性能抽测：gates_pending_scan 等 2-3 项对照 LBD-1 §三基线（0.82~1.22x 带内，
  >2 倍劣化即红）

## D. 回滚（任一验证红即触发；无数据丢失面）

- [ ] **D1** 停 ladybug 实例
- [ ] **D2** 以原配置（无 P2P_GRAPH_ENGINE / 原 P2P_GRAPH / 无 LBUG_C_API_LIB_PATH）
  重启 kuzu 实例
- [ ] **D3** `/health`+行数抽查
- [ ] **D4** 停写窗口内写入面回灌（调度环幂等重放）
- [ ] **D5** 登记差距 → B 预案回触发条件驱动状态

## E. 观察期（切换后 ≥2 周）

- [ ] **E1** RSS 盯基线（soak ~150-160MB 趋平形态）
- [ ] **E2** 查询延迟对照 LBD-1 §三六项基线
- [ ] **E3** 错误日志零原生崩溃（单实例形态，多实例并存约束不适用——LBD-1b §四）
- [ ] **E4** kuzu 退役时机复评（上游多实例问题已重新定性为仓内测试侧混用——kuzu 依赖
  移除条件收敛为"bak 恢复需求消失+一个观察周期"，WRAP-4 口径随 LBD-1b 更新）

## 附：依赖面备忘

- 合并后 main 含测试侧引擎单一化收编（LBD-1b）——**进程内禁双引擎共存**由收编保证；
  任何新增测试/脚本不得 `import kuzu` 直连（统一 `from graphd.app import kuzu`）。
- ladybug 轨运行要件三件套：PyPI `ladybug==0.21.2`（官方 index）+ liblbug 资产（A2）+
  `LBUG_C_API_LIB_PATH`（B5 注入）。
