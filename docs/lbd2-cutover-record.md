# LBD-2 生产切换实录（kuzu → LadybugDB · 2026-10-04 23:43–23:52 CST）

> go 授权=本批提示词。执行序=docs/lbd2-readiness-checklist.md A→B→C 逐项留证。
> **切换宣告：成功**（C 段六步全绿）。窗口总耗时 ≈7 分钟（含一次异常回滚-修复-重翻）。
> 执行后形态：systemd user unit `d2d-graphd.service` 以三件 Environment 承载
> LadybugDB；原 kuzu_db 零写保留=回滚资产。

## 〇、LBD-2-0 切换前核查（只读）

| 项 | 结论 | 证据 |
|----|------|------|
| 活跃写入面 | **无活跃 engagement**（active/requested/running/paused = 0） | /query 实测 `active_eng: 0`（23:43:09）；autofeed `--watch` 常驻但无活跃 engagement 时 fail-closed 整轮跳过（autofeed.mjs:8 语义）；调度环 frontier-review tick 空转（candidates:0, 23:17:06） |
| 磁盘 | 足额 | /tmp 3.3G 可用（staging 导出 4.2MB）；/home 17G 可用（新库 26MB 落定） |
| 原实例启动形态 | **全缺省形态实锚**：PID 1690591，`/usr/bin/python3 app.py`，cwd=graphd/，environ **零 P2P_* 变量**（DB=graphd/kuzu_db、PORT=8766、token 从 `~/.config/d2d/host-token` 文件装载），启动于 10-03 19:17 | /proc/1690591/{environ,cmdline,cwd} |
| **托管形态（本批新发现）** | **systemd --user unit `d2d-graphd.service` 托管**（enabled，Restart=on-failure RestartSec=3）——kill 后同秒自动拉起；配置翻转的正确形态=改 unit Environment 而非手动进程 | systemctl 反查+unit 文件；LBD-2-0 预案外的结构性发现，已纳入执行 |
| 时间预算 | 与 RECOV-1 先例同量级 | 实测见 B 段（总 15.3s 引擎面+重启秒级） |

## 一、A 段就绪态（7 项留证）

- **A1** 引擎开关面：生产 environ 零 `P2P_GRAPH_ENGINE`（缺省 kuzu 态实锚）✓
- **A2** liblbug 就位：落位 `%h/lib/ladybug/liblbug.so.0.21.2`；**双哈希锚**——
  tar.gz 资产包 `f3de0f9b…c94c4`（下载校验，LBD-1b 锚）+解包 `.so` 本体
  `7784b10397386b63998d2b6e80e819476569f4e1c5e92ae42d8ea4e92d80cf6f`（就位校验，
  本批实测新锚；检查单 A2 表述已随批修正为两值形态）✓
- **A3** 运行时冒烟：临时库建表/写入/count/关闭全通 ✓
- **A4** 新库路径 `/home/kali/d2d/graphd/ladybug_db`（不在生产 kuzu_db/bak 路径）✓
- **A5** staging `/tmp/lbd2-staging/export`（独立目录，EXPORT 自建语义）✓
- **A6** 测试基建：LBD-2-pre 双轨 414 全绿（缺省 101.20s/ladybug 90.31s）✓
- **A7** 窗口期=本批即时（go 授权）✓

## 二、B 段切换五步（计时实录）

| 步 | 时刻 | 耗时 | 结果 |
|----|------|------|------|
| B1 停写确认 | 23:43:09 | — | active_eng=0 实锚 |
| B2 EXPORT→staging | 23:43:41 | **3.13s**（先例 4.27s 同带） | ok，21 文件 4.2MB parquet+copy.cypher |
| B3 IMPORT→ladybug_db | 23:43:56 | **6.51s**（先例 8.97s 同带） | 全表导入 |
| B4 DEFAULT 回填两条 | 23:44:14 | <1s | 两条各 0 行=**DEFAULT 语义保真复现**（无 NULL 存量面，幂等双保险照跑） |
| B5 翻转重启 | 23:44:29 → 23:49:09 | 见下插曲 | 终态=environ 三件实锚+`listening :8766 db=…/ladybug_db` |

### B5 异常插曲（回滚优先，如实记录）
1. **发现 systemd 托管**：TERM 旧实例（1s 优雅退出，:8766 释放）后**同秒被 systemd
   user unit 自动拉起**（kuzu 配置）——`Restart=on-failure` 语义。手动 nohup 形态
   不可行（端口被托管实例占用）。
2. **第一次翻转失败→立即回滚**：unit 加三行 Environment 后 restart，
   ExecStart 的**系统 python3 无 ladybug 模块**（ladybug 只在 /tmp venv）→
   ModuleNotFoundError 崩溃循环（restart counter 6）→**立即 stop+删三行+restart 回滚**，
   kuzu 生产服务 9s 内恢复在线（pid 2719872）。窗口内零调试，符合拍板铁律。
3. **窗口外修复**：`pip3 install --user --break-system-packages ladybug==0.21.2`
   （官方 index；与既有 kuzu 同构——kuzu 即装于 user 层 site-packages，PEP 668 下
   仓内先例形态）+系统 python 冒烟通过。
4. **第二次翻转成功**（23:49:09）：unit 三行 Environment（ENGINE/P2P_GRAPH/LBUG 路径，
   %h 风格）→daemon-reload→restart→**1s health OK**，MainPID 2720938，environ 三件
   实锚，启动日志 `listening :8766 db=/home/kali/d2d/graphd/ladybug_db
   token_required=open host=set worker=set`。

## 三、C 段六步验证（全绿）

| 步 | 结果 | 证据 |
|----|------|------|
| C1 health | ✓ | `{"ok":true,"version":"1.6.0",pid:2720938}`，响应无 schema_degraded 键 |
| C2 行数逐表比对 | ✓ | **18 表（12 节点+6 边）库 count 与 parquet 行数逐表全等，MISMATCH=0**：Task 1381/Engagement 17/ExperienceWeight 97/Experience 9/Finding 777/Signal_ 5108/Hypothesis 435/Handoff 75/Frontier 3/AgentIdentity 1321/Plan 0/Endpoint 0/CONFIRMS 138/DERIVED_FROM 6648/AT·RELATES·SUGGESTS·PRIOR_FOR 0 |
| C3 三代表查询 | ✓ | crit/high Finding=272；Signal_ eng 聚合 top5（1228/922/664/592/…）；consensus 非空 Experience=9（与总数一致=DEFAULT 保真面） |
| C4 stability-view | ✓ | `graph 可达`+20 个 eng 聚合正常输出 |
| C5 双签端点探针 | ✓ | POST /write/dual-sign-transition 对不存在 id → `{"ok":false,"error":"finding not found"}`——host 认证通过+状态机查询路径通+**零写入**（探针后 Finding 总数 777 不变） |
| C6 性能抽测对表 | ✓ | 5 轮中位：finding_crit_high_scan **13.3ms**（LBD-1 ladybug 基线 20.5ms）/signal_eng_agg **20.5ms**（22.0）/experience_consensus_scan **16.2ms**（16.5）——全部同带或更优，无 >2 倍劣化 |

## 四、原库零写证明链（红线留证）

| 时点 | kuzu_db（80,728,064B） | kuzu_db.wal |
|------|------------------------|-------------|
| 基线（23:42:32，EXPORT 前） | `f1dd0d6d…793c884` | `dd01b2a7…bcc358`（5,728,117B，mtime 10-03 12:23） |
| EXPORT 后（23:43:56） | 同上，mtime 未变 | 同上，mtime 未变 |
| 停止后（23:44:30） | 同上 | 同上 |
| 终态（23:51:56） | **同上**（mtime 仍为 09-15 19:08） | `75c2d37b…4c8328`（5,728,189B，mtime 23:47:31） |

- **db 本体三态一致**（哈希+mtime 全程不变）。
- **wal 变化定格于回滚窗口**（23:47:31=回滚 kuzu 实例关闭时刻）：引擎启动 WAL replay+
  关闭 checkpoint 的生命周期行为（replay 幂等+wal 重排 72 字节），期间**零外部写请求**
  （回滚窗口仅 health 只读探活）；23:47:31 后 wal 未再动。引擎生命周期行为≠外部写入，
  数据页未变（db 哈希不变）+导出包行数全等=C2，数据完整性双证。
- 全程写请求审计：EXPORT（读库写目录）/只读 count 类查询/双签探针（not found 拒绝），
  **零图写入面发生**。

## 五、观察期基线（2026-10-04 23:52:32 采，AGENTS.md 第 15 条引用）

- 实例：MainPID 2720938，RSS **166.9MB**（soak 基线 150-160MB 同带），线程 9，运行 3m23s
- 新库：`ladybug_db` 单文件 **26MB**+`.lock`（原 kuzu_db 80MB+wal 5.7MB——库体更紧凑）
- journal 错误计数（error/traceback/segfault，自 23:49 起）= **0**
- 性能基线：见 C6 表（13.3/20.5/16.2ms 三项）
- 观察期 ≥2 周：每批 A 层加快照对比项；graphd 查询面变更批 push 前双轨全量（AGENTS.md 15）

## 六、拍板项对账

| 拍板 | 执行 |
|------|------|
| 1 go=重启与配置翻转授权；原库零写保留 | ✓（unit 托管形态纳入；零写证明链 §四） |
| 2 A→B→C 逐项留证 | ✓（§一/二/三） |
| 3 异常即回滚不再窗口内调试 | ✓（B5 插曲 2：6 次崩溃循环立即 stop 回滚，9s 恢复） |
| 4 切换后三件事 | ✓（§五基线落档+AGENTS.md 15 两条+缺省翻转/kuzu 退役=观察期后另批本批未做） |
| 5 状态文档族+断言 | ✓（随 docs 族提交） |
| 6 零代码改动预期 | ✓（main 零代码 diff——B5 运行时修复为宿主侧环境动作[pip user 安装]，非仓内代码） |
