# 误报模式 schema + 最小种子（4-2 交付 4-5 的接口）

> 来源：4-2-0 前置审计（dwfrun-d838b762）· 静态核验口径

- 定位：d2d 阶段 4-2 路线 A 文档 3/5。定义误报（false-positive）模式表的 schema、最小初始种子（6 条，仅查表型）与优先级规则。纯规则资产，零代码——运行时消费（热载、匹配、路由）不在本批实施。
- 档位语义锚定：`routingSafe=true` 的模式**完整命中**（判别式含内置 guard 全过）时，处置可自动路由为**低档**（异步免批，证据深度=状态记录，见 docs/tier-depth-mapping.md）；guard 任一失败或命中需人工甄别模式 → 升**高档**（阻塞同步审批）。

## Schema（用户拍板结构）

```json
{
  "version": "v1",
  "patterns": [
    {
      "id": "A-test-ddl",
      "description": "人读描述",
      "discriminator": "查表型判别式（含内置 guard）",
      "routingSafe": true,
      "source": "static",
      "hitCount": 0
    }
  ],
  "priority": "ledger > static"
}
```

字段语义：

| 字段 | 语义 |
|---|---|
| `version` | 表结构版本；本批为 `v1` |
| `patterns[].id` | 模式唯一标识；同一 ID 账本优先（见优先级规则） |
| `patterns[].description` | 人读描述 |
| `patterns[].discriminator` | 查表型判别式，必须可枚举验证；内置 guard 任一失败 → 降人工，不自动路由 |
| `patterns[].routingSafe` | 布尔。`true`=完整命中时允许自动路由为低档（异步免批）；`false`=命中仅作线索，必须人工甄别，处置一律升**高档**人工批（档位落点唯一，无中档落点），不得驱动自动放行 |
| `patterns[].source` | `"static"`（4-2 静态种子）或 `"ledger"`（4-5 渐进式信任自审批账本归纳） |
| `patterns[].hitCount` | 命中计数，初始 0（工程纪律②：必须带命中率统计） |
| `priority` | 恒为 `"ledger > static"`（见优先级规则） |

## 最小初始种子（6 条，仅查表型，判别式全部封闭枚举）

口径：每条判别式的所有集合/词表**封闭给出**（无『等』类开放集合）；扩集只能改本表（登记制），运行时不得现场扩集。行号一律只作实证登记、不作判别锚（工程纪律③④）。种子均为 `source=static`、`hitCount=0`。

### `A-test-ddl` — 测试文件 DDL 脚手架误报（routingSafe=true）

- **路径谓词（封闭）**：POSIX 仓库相对路径按 `/` 分段后，段集合包含段 `tests`（即 `tests/**`，含子目录）。段匹配，非子串匹配（工程纪律③）。
- **DDL 关键字词表（封闭，词边界匹配，大小写不敏感）**：`CREATE NODE TABLE` / `CREATE TABLE` / `DROP TABLE` / `ALTER TABLE` / `CREATE INDEX` / `DROP INDEX` / `INSERT INTO`。
- **插值 guard（封闭词元表，语义钉死）**：在**触发告警的构造所在函数体**文本内检索词元 `os.environ` / `argv` / `input` / `request`，**词边界匹配**（同 DDL 关键字口径，非子串）；命中其一即**降人工**，不自动放行；检索不到（词表干净）才自动降低档。函数体无法定位时（如模块顶层构造）退化为**整文件**检索——方向保守（扩大降人工面），宁可多降人工不可误放行。
- **实证**：5 条同型误报已于 4-1 `ca56f63` 改写消除（f-string → 字符串常量拼接；登记 docs/upstream-open-items.md A 类：`tests/test_graphd_gates.py:1454/1455/1565/1841/2017` 的 `CREATE NODE TABLE` f-string 脚手架）。本条为**防复发规则**。

### `B-test-urlopen` — 测试域 urlopen 回环请求误报（routingSafe=true）

- **测试域（封闭定义）**：路径谓词同 `A-test-ddl`（路径段集合含段 `tests`）。
- **判别式（三条全过才降低档）**：① 调用为 urlopen 类（`urlopen(` 词元）；② 目标 host ∈ {`127.0.0.1`, `localhost`, `::1`}（精确值枚举，词边界匹配）；③ **同文件内**存在本地起服构造 `GraphdHTTPServer(("127.0.0.1", 0)`（回环 host + port=0 字面量，双验）。
- **实证（已核验）**：urlopen 行 `tests/test_graphd_gates.py:1744/1919/2135/2709/3052`；对应本地起服构造行 `:1735/:1910/:2123/:2696/:3040` 均为 `srv = graphd_app.GraphdHTTPServer(("127.0.0.1", 0), graphd_app.Handler)`。目标为测试内本地起服的回环测试服务器，非外部请求（upstream-open-items.md B 类同登记）。

### `C-validator` — validator.js 存量告警误报（routingSafe=true）

**三元查表**（(file, 规则 id, 函数锚) 整行命中才适用；表外组合一律降人工）。规则 id 登记名为本表自定标签，登记行对应 docs/upstream-open-items.md C 类 8 条（by-design 保留）：

| file | 规则 id（登记名） | 函数锚（定义行，符号解析定位） | 上游登记（行号仅注记，不作锚） |
|---|---|---|---|
| `plugin/pentest-dsh/validator.js` | `token-extract-re` | `extractCurlArgs`（validator.js:275） | :289 high（re 正则提取 token） |
| `plugin/pentest-dsh/validator.js` | `curl-spawn-replay` | `runCurl`（validator.js:360） | :374 high（`spawn('curl',…)` 授权重放） |
| `plugin/pentest-dsh/validator.js` | `graphd-local-query` | `q`（定义于 scheduler.js:87） | :259/264/540/629/639 medium（对本地 graphd 的 `q()` 查询） |

- 判定规则：告警经符号解析落到锚函数（解析不出符号 → 降人工）；(file, 规则 id) 与上表整行一致；**禁裸行号**——scheduler.js 账目行号已实证漂移 ±1，行号仅作登记注记。
- 新增规则 id 只能改表登记（或由 4-5 账本以同名 id 覆盖）。

### `D-app-token` — app.py token 落盘告警误报（routingSafe=true）

- **判定单元（作用域）**：`graphd/app.py` 的 `_write_token_file`（:1589）**函数体**。
- **三件套实查（三者全部在函数体内命中才降低档；缺一即降人工）**：① `_safe_token_path(raw_path)` 调用（:1594；实现 re-export 自 gd/auth 模块，:1587 注记）；② `os.open(…, os.O_NOFOLLOW, 0o600)`（:1596）；③ `os.chmod(…, 0o600)`（:1599）。
- **调用点登记（注记）**：三处写入点 :1617/1620/1629（upstream-open-items.md D(app) 类同登记，allow 不变）。

### `D-env-path` — 操作者 env 指路读型通用判别式（routingSafe=true）

- **env 源封闭集**：变量名匹配封闭前缀规则 `^P2P_[A-Z0-9_]+$`，或属于显式枚举 {`D2D_DATA_DIR`}。无『等』类开放集合；扩充只能改表（登记制）。
- **判别式（三者齐备降低档）**：① 路径表达式引用上述 env 源（登记实证 `scheduler/caps.mjs:15` `P2P_CAPS_FILE`，0913 C8 同型）；② 操作 ∈ {read}（读型）；③ 扩展名 ∈ {`.json`, `.jsonl`}（精确后缀）。
- **guard**：出现写操作（write/append/chmod/unlink 类词元）即**降人工**，不自动放行。

### `D-schema-noqa` — schema.py noqa:S608 告警误报（routingSafe=true）

- **登记文件（封闭，仅此一处生效）**：`graphd/gd/schema.py`；其他文件出现 noqa 不适用本模式。
- **判别式（全过才降低档）**：
  1. `# noqa: S608` 注释存在；
  2. SQL 语句形态 = 字符串字面量模板 + `+` 常量拼接（f-string/格式化形态**不适用**——A 类修法即 f-string→常量拼接，防复发反向覆盖）；
  3. 拼接变量的**取值来源**为已登记封闭枚举（按变量绑定处判定，二选一；按字面『变量名 ∈ 枚举名』判定不可实现——变量名是 `table`/`tscol`，枚举是取值域）：
     - **绑定形态一（dict 解构）**：变量经 `for table, cols in _CRITICAL_COLUMNS.items()` 解构绑定（`schema.py:300`），取值域 = `_CRITICAL_COLUMNS` 模块级 dict（`schema.py:256`）的键集合——登记实例 `schema.py:302`（`"CALL table_info('" + table + "') RETURN *"`）；
     - **绑定形态二（字面量元组解构）**：变量经字面量元组解构绑定（`schema.py:440` `(("Signal_", "ts"), ("Finding", "ts"), ("Hypothesis", "ts"), ("Plan", "created_at"))`），取值域 = 该元组字面量集合，双变量 `table`/`tscol` 须同源同元组——登记实例 `schema.py:441`（`"MATCH (x:" + table + ") WHERE x.eng = '' RETURN x." + tscol + ", x.id"`）；
  4. 引用位置在登记文件内。
- 绑定形态扩集只能改本表（登记制）；判定不出绑定来源（如变量跨函数传入、动态构造）→ **降人工**。
- **实证（已核验）**：`graphd/gd/schema.py:302` 与 `:441` 逐行核实吻合（形态一/二各一）；登记行 :302/:441（upstream-open-items.md D(schema) 类）。

## 优先级规则（`priority: "ledger > static"`）

1. **账本模式（4-5 归纳）覆盖静态模式（4-2 种子）**。
2. **同一模式 ID 以账本为准**：ID 冲突时静态定义整体失效，不做字段级合并。
3. **静态种子只在账本无该 ID 时生效**；账本删除某 ID 后，静态种子不自动复活（防博弈回灌）。

## 明确移交 4-5 的清单

以下模式**不在本批种子内**，由 4-5 渐进式信任以审批账本动态归纳；**4-2 只交 schema + 种子 + 优先级规则**：

- `B-prod-fetch`：生产域回环 fetch——必须实查回环 guard 构造存在，不可只看 host 字面量。
- `curl-spawn-outside-validator`：validator.js 之外一切 `spawn('curl')`——0915 `.curlrc` CRITICAL 对抗史。
- `noqa-generic`：通用『有 noqa 即放行』——可被注释博弈，仅限已登记文件 + 常量拼接形态。
- 以及**一切需人工甄别的模式**：凡无法写成查表型判别式的，一律不进 4-2 种子；账本若归纳出此类模式，其 `routingSafe` 必须为 `false`（命中仅作线索，升高档人工批）。

## 工程纪律（历史经验固化 8 条，4-2-0 审计提炼）

1. **直放必须落审计**——`df067e8` tier-clamp 先例：自动降级/放行动作必须有审计事件可对账。
2. **必须带命中率统计**——下游 0 信号无法区分无漏报与通道断链（`95490dc` 讯飞 147 triaged/0 双签教训）；故 schema 内建 `hitCount`。
3. **判别式禁 endsWith / 子串宽匹配**——`f8569c7` wxapkg 误伤；判别式必须锚定结构（路径段、AST 形态、三元查表），不做宽匹配。
4. **须（规则 id, 特征）双锚定**——`d861690` 单锚跨类误伤；单特征不足以放行。
5. **直放规则清单做成热载表**——仿 4-1 error-fingerprints：外置 JSON + mtime 缓存 + 白名单解析 + 失败回退（`a5b76c7` 先例）；本 schema 即按该形态外置。
6. **CI 红先归因测试基建再定级**——`f13945d`；不把基建锅记到业务头上。
7. **环境型 flake 走独立通道**——`00d6cda` / `f9e750b` / `7eb9843`；不与误报模式混表。
8. **designed-behavior 可自动降级但必须落审计事件**——`df067e8`；『设计如此』不等于『免记录』。

## 一致性

- `routingSafe` 的档位语义 = docs/tool-risk-rating.md 的风险档位 = docs/tier-depth-mapping.md 的证据档位（高/中/低同名同序）；落点唯一：`true` ⇔ 低档、`false` ⇔ 高档（人工批），误报模式维度无中档落点（见 docs/tier-depth-mapping.md『处置档位判定唯一规则』）。
- 自动降档动作的审计落点与审批形态见 docs/tier-depth-mapping.md；接入门（gate 侧消费此表的位置）见 docs/routing-integration-points.md。
- 工具侧无门导致的误报/漏报暴露面背景见 docs/gate-coverage-gaps.md 附录（无误报模式表 gap）。
