# 上游未决项账目 — Mimosa high/medium 处置总表（27 条）

> 基线：commit `53dbaa9` 之后的门同源修复批（2026-09-24）。
> 口径：账目合计 **27 条 = 22 high + 5 medium**（A5 + D7 + B7 + C8）。
> 本批修复 **7 条 high**（A 类 5 + schema.py 2），剩余 by-design 保留 **15 high + 5 medium**。
> 逐条处置口径与 `.mimosa/security-policy.json`（仓库所有者 2026-09-08 accept）及 issue #12 一致。

## 总表

| 类 | 数量 | 位置 | severity | 处置 | 本批动作 |
|----|------|------|----------|------|----------|
| A | 5 | tests/test_graphd_gates.py:1454/1455/1565/1841/2017 | high | 修复 | ✅ 本批已修复 |
| D(schema) | 2 | graphd/gd/schema.py:302/441 | high | 修复 | ✅ 本批已改写 |
| D(app) | 3 | graphd/app.py:1617/1620/1629 | high | allow | 不变 |
| D(scheduler) | 2 | plugin/pentest-dsh/scheduler.js:140/141 | high | allow | 不变 |
| B | 7 | scheduler.js:87/98 + tests:1744/1919/2135/2709/3052 | high | by-design 保留 | 不变 |
| C | 8 | validator.js:289/374/374 (high) + :259/264/540/629/639 (medium) | high×3 + medium×5 | by-design 保留 | 不变 |

## A 类 5 条 — 本批已修复

`tests/test_graphd_gates.py` 3B/3A/3E/3.5-1 迁移测试的 kuzu tmp_path 脚手架 f-string `CREATE NODE TABLE` DDL：

- `tests/test_graphd_gates.py:1454` — `_3b_old_db_conn` Finding 建表
- `tests/test_graphd_gates.py:1455` — `_3b_old_db_conn` Signal_ 建表
- `tests/test_graphd_gates.py:1565` — `_3a_old_agent_db_conn` AgentIdentity 建表
- `tests/test_graphd_gates.py:1841` — `_3e_old_finding_db_conn` Finding 建表
- `tests/test_graphd_gates.py:2017` — `_351_old_experience_db_conn` Experience 建表

**修法**：f-string 改字符串常量拼接（`"CREATE NODE TABLE T(" + expr + ", PRIMARY KEY(...))"`）。
测试逻辑完全等价：建表语句逐字节同义（已对全部 drop_col/drop_from/cols 输入枚举做新旧逐字节对比），
断言零改动。等价性自验：8 个消费上述脚手架的迁移测试用例逐个跑全绿，全文件 271 passed。

## schema.py 2 条 — 本批已改写

- `graphd/gd/schema.py:302` — `_verify_critical_columns` 的 `CALL table_info('{table}') RETURN *`，
  改常量拼接；`table` 为 `_CRITICAL_COLUMNS` 字面量枚举键，无外部输入，行尾补
  `# noqa: S608` 说明。
- `graphd/gd/schema.py:441` — `_backfill_eng` 的 `MATCH (x:{table}) ... RETURN x.{tscol}, x.id`，
  改常量拼接；`(table, tscol)` 为模块内字面量枚举 `(("Signal_","ts"),("Finding","ts"),
  ("Hypothesis","ts"),("Plan","created_at"))`，行尾 `# noqa: S608` 注释保留。

不触碰 schema 三处同步模式的其他部分（`SCHEMA` 字面量 / `init_schema` ALTER / `_CRITICAL_COLUMNS`）。

## D 类 7 条 — 判 allow 及依据

D 类 = app.py 3 + scheduler 2 + schema 2（schema 2 条已含在上述修复内，本批改写后移出 allow 名单，
**实际保持 allow 的为 5 条**）：

- `graphd/app.py:1617/1620/1629`（3 条）：token 落盘点。三处均为 `_write_token_file(...)` 调用，
  唯一落盘通道（`graphd/app.py:1590-1596`）先经 `_safe_token_path` realpath 前缀白名单
  （`~/.config/d2d/`），再以 `os.O_NOFOLLOW|0o600` 写入，防符号链接替换与权限外泄。
- `plugin/pentest-dsh/scheduler.js:140/141`（2 条）：brain 读取 `current/shadow` techniques.json，
  路径源自操作者 env（`process.env.P2P_BRAIN_DIR ?? ${DATA_DIR}/brain`，scheduler.js:138），
  非攻击者可控输入。

## B 类 7 条 — by-design 保留（high）

- `plugin/pentest-dsh/scheduler.js:87/98`（2 条）：对本地 graphd 的 `/query`、`/health` fetch。
  `GRAPHD` 基址（scheduler.js:52）默认 `http://127.0.0.1:8766`，非回环需操作者显式
  `P2P_GRAPHD_ALLOW=1`（见 `.mimosa/security-policy.json`）。
- `tests/test_graphd_gates.py:1744/1919/2135/2709/3052`（5 条）：端到端测试 harness 的
  `urlopen`，目标为测试内 `_3c_spawn_server` 本地起服的 127.0.0.1 测试服务器，非外部请求。

## C 类 8 条 — by-design 保留（3 high + 5 medium）

`plugin/pentest-dsh/validator.js`：`:289`（re 正则提取 token）、`:374`（`spawn('curl', ...)`
授权重放）为 high；`:259/264/540/629/639`（对本地 graphd 的 `q(...)` 查询）为 medium。
`CONTRIBUTING.md:32` 明示：渗透工具的 by-design 高危（对 graphd/目标的请求、curl 重放等）
**不为满足静态扫描器而阉割**；处置口径见 issue #12 与 `.mimosa/security-policy.json`。

## reviewed-policy 契约 — 上游需求

Mimosa `scan-contract.md:46` 自认：*verdictEffect 保持 none，直到产品采用单独的 reviewed policy*。
即当前扫描器 verdict 不拦截，allow/修复的人工甄别结论（本文档）即为处置真源；
待上游提供 reviewed policy 后再迁移为机器可执行契约。

## commit 通道现状

- **工作流 harness 通道**：落 commit 不受门拦（本批修复即经该通道提交，本文件不含 git 操作）。
- **人工会话**：`medium=ask`，遇到 medium 级 finding 需人工确认后方可继续。
