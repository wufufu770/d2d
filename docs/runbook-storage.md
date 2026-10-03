# 存储运维 runbook（T4-2b 落地；选型决策 docs/t4-2-storage-decision.md 附录 D 拍板 A 方案的执行手册）

> 适用边界：本手册只描述"读源库、写他处"的运维动作；任何需要写 kuzu_db 或改
> graphd 代码/配置的动作超出本手册范围（停下回报——硬边界，见决策书附录 D 拍板 ①）。

## 一、归档规程（拍板 ②：EXPORT 季度 + 里程碑 tag 时顺手；物理快照 3 份滚动）

### 1.1 逻辑归档（首选，已实证 T4-2b 首执行）
```bash
TS=$(date +%Y%m%d-%H%M)
DEST="$HOME/.d2d-data/backups/storage-archive/export-$TS"
TOKEN=$(cat ~/.config/d2d/host-token)
curl -s -m 120 -H "Content-Type: application/json" -H "X-Auth: $TOKEN" \
  -d "{\"cypher\":\"EXPORT DATABASE '$DEST'\"}" http://127.0.0.1:8766/query
```
- 通道语义（T4-2b 审计实锚）：host token /query 仅拦 CALL（graphd/gd/gates.py
  host_query_gate）；`EXPORT DATABASE` 是语句非 CALL → 放行。**读源库、写导出
  目录**——零源库写、零 graphd 改动、零停服。
- 前置：`$DEST` 必须不存在（kuzu 要求空目录）。
- 成功标志：`{"result":"Exported database successfully."}`。
- 产物（首执行实锚 export-20261002-1635）：18 parquet（12 节点表+6 边表）+
  schema.cypher（18 CREATE）+ copy.cypher（18 COPY 列清单逐表对齐）+ index.cypher
  （空，无索引）；总量 4.2MB（列存压缩自 80.7MB）。
- 完整性自检：`grep -c "^COPY " copy.cypher` = 18 且 schema.cypher 行数相同；
  体积量级对照探针计数（Signal_.parquet ~2.3MB ↔ 5,108 行）。
- **不做 CHECKPOINT**：写源库（WAL 刷入主文件）超本手册边界；EXPORT 读已提交
  状态，无需 checkpoint 前置（T4-2b 首执行实证行数/结构完整）。

### 1.2 物理快照（补充形态；EXPORT 不可用时的降级）
```bash
tar -czf ~/.d2d-data/backups/storage-archive/kuzu_db-snap-$(date +%Y%m%d-%H%M).tgz \
  -C graphd kuzu_db kuzu_db.wal kuzu_db.lock
sha256sum ~/.d2d-data/backups/storage-archive/kuzu_db-snap-*.tgz \
  > ~/.d2d-data/backups/storage-archive/SHA256SUMS-snap.txt
```
- 一致性前提（T4-2b 实锚）：WAL mtime 静默（无活跃写入）+ 无 active engagement
  时冷拷贝风险极低；活跃写入期执行前先确认 `kuzu_db.wal` mtime 停止变化。
- **3 份滚动**：`ls -1t kuzu_db-snap-*.tgz | tail -n +4 | xargs rm`（保留最近 3 份，
  SHA256SUMS-snap.txt 随之重生成）。

### 1.3 滚动与保留
- export-* 目录不滚动（季度频率 + 逻辑导出体积小，全量保留；如需控制按年归并）。
- kuzu_db-snap-*.tgz 滚动 3 份（拍板 ②）。
- 归档产物一律仓库外（DATA_DIR/backups/storage-archive/）；repo 内只留本 runbook
  与 sha256 记录引用。

## 二、恢复环境钉扎（拍板 ②：立即执行；T4-2b 已完成）

- 位置：`~/.d2d-data/backups/storage-archive/pin/`
- 内容（首执行实锚）：
  - `kuzu-0.11.3-cp314-cp314-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl`
    （7,615,882 字节；sha256 见 pin/SHA256SUMS：`86be7d11…`；PyPI 存量绕缓存
    下载验证可得——绝版后仍可获取，本 pin 为离线兜底）
  - `python-version.txt`（Python 3.14.6 + requirements 钉扎口径 kuzu==0.11.3）
  - `SHA256SUMS`（自校验过）
- **外部扩展钉扎=无需**（实证降级）：graphd 全域零 INSTALL/LOAD EXTENSION 命中
  （T4-2b 审计 grep 实锚）；0.11.3 预装四扩展随 wheel 自含；官方扩展服务器关闭
  对本项目无影响。
- 恢复环境口径：Python 3.14.6 + `pip install pin/kuzu-*.whl`（离线）→ 只读打开
  物理快照或 IMPORT 逻辑导出。

## 三、B 预案（迁移 LadybugDB）触发条件与操作路径（拍板 ①③：不排期，runbook 承载）

### 3.1 触发条件（任一命中即启动迁移启动批）
1. **Python ≥3.15 wheel 失配**：运行时必须升级而 kuzu 0.11.3 无对应 wheel
   （CPython ≤3.14 冻结；源码编译未验证）。
2. **LadybugDB 治理透明化里程碑**：正式 governance 文档 / 1.0 稳定版 /
   第二承接机构出现（当前"活跃但治理不透明"——T4-2 审计 §5）。
3. **数据量阈值**：单库 >500MB（与裁剪再议联动，拍板 ②）。
4. 现场 Kùzu 数据损坏且 0.11.3 无修复渠道（被动触发）。

### 3.2 操作路径（迁移启动批大纲）
1. **首批验证项（T4-2 未锁定项，拍板 ③）**：①DDL `DEFAULT timestamp('1970-01-01
   00:00:00')` 组合冒烟；②`IN $ids` 列表绑定 / 参数化 `LIMIT $lim` 行为。
2. 试点：`kuzu_db.bak` 副本上 EXPORT→Ladybug IMPORT DATABASE 演练（零生产风险）。
3. 切换：import shim（`import ladybug as kuzu`，2 行）+ DB 文件后缀/reset 适配 +
   requirements 换钉 → 停机窗口（单写者 sidecar，秒级导出导入）→ 全量三轨+观察期。
4. 禁区注意：动 graphd 全域 import 面 = T3-3-0 以来最高禁区压力操作，须独立批次
   +全量回归+A 层三重证据复核。

## 四、季度探针（拍板 ⑥：scripts/ops/graph-stats-probe.mjs）

```bash
node scripts/ops/graph-stats-probe.mjs          # 人读形态
node scripts/ops/graph-stats-probe.mjs --json   # 机器形态
```
- 首执行 smoke 实锚（2026-10-02）：节点 9,223 / 边 6,786 / kuzu_db 77.0MB(MiB) /
  wal 5.5MB / DATA_DIR logs 11.7MB + runs 4.4MB；全 18 查询 + 状态分布 + 磁盘面。
- 阈值联动：脚本内置 500MB 裁剪再议告警线（拍板 ②）；决策书 §2.3 另有
  >1GB 或 >30 万节点触发选项 B 评估线（两条并存取先到）。
- 只读保证：全 cypher 字面量零拼接、零参数输入、URL 代码内常量；token 只读不回显。

## 五、开放项与登记

- ~~恢复演练登记开放项单独立项~~ **RECOV-1 已执行（2026-10-04）——见 §六 完整恢复规程实测**。
- 裁剪暂不启用（拍板 ②；AgentIdentity/Task/终态 Signal_ 三类可裁件清单见决策书 §六）。
- 6-6 终态=双条件解锁（嵌入形态+原生事件；拍板 ⑤）——候选观察归 T4-2 决策书 §五口径。

## 六、完整恢复规程实测（RECOV-1，2026-10-04，生产库快照时点=t4-3-stage8 后）

> "包还在 ≠ 恢复计划"——本节从假设升级为实测。演练全程 /tmp 独立目录+独立端口
> （8799）+独立 token，生产库零写（EXPORT=读库写导出目录）、生产实例零重启零配置
> 变更、T4-3-2 bak 副本零触碰。

### 6.1 三段规程与计时（实测值）

| 段 | 操作 | 实测 | 结果 |
|----|------|------|------|
| ① 导出 | `POST /query {"cypher":"EXPORT DATABASE '<dir>'"}`（host token） | **4.27s**（4.2MB，18 parquet+copy.cypher） | ok |
| ① 导入 | 新空库 `IMPORT DATABASE '<export_dir>'`（kuzu 0.11.3 同版本） | **7.06s** | ok |
| ① 比对 | 12 节点表+6 边表逐表行数 双面计数 | — | **全等零差**（Signal_ 5108/Finding 777/AgentIdentity 1321/Task 1381/Experience 9/ExperienceWeight 97/Frontier 3/Handoff 75/Engagement 17/Endpoint 0/Plan 0 + 6 边表） |
| ① 列抽查 | Experience 16 列 table_info+代表行 | — | **16 列序齐**；存量行 reasoning_path=''/consensus_status='consistent' 保真 |
| ② 语义 | IMPORT 库新增行（不带默认列） | — | reasoning_path/consensus_status = **NULL**（DEFAULT 元数据丢失复现） |
| ③ 重开 | 独立 graphd（`P2P_GRAPH_PORT=8799 P2P_GRAPH=<import_db> P2P_HOST_TOKEN=<drill>`） | 启动秒级 | **SCHEMA_DEGRADED 空（16 列完整识别）**；三条代表性只读查询全通且计数与源一致 |

### 6.2 DEFAULT 丢失标准处置（拍板 2③ 三候选结论）

- **a) ALTER 重放——无效**：kuzu 0.11.3 对已存在列 `ALTER ADD` 报 `already has property` 拒绝，DEFAULT 元数据不可经 ALTER 重建（实测重放后新行仍 NULL）。
- **c) init_schema 重放——安全但不修复**：全吞设计（except pass）在 IMPORT 库零抛出恒幂等；但被吞的正是无效的 ALTER——幂等≠恢复默认值。
- **b) 应用层兜底——唯一有效，分两层落**：
  1. **运维步骤（本批实测，标准处置入规程）**：IMPORT 后立即执行两条回填——
     `MATCH (x:Experience) WHERE x.consensus_status IS NULL SET x.consensus_status=''` 与
     `MATCH (x:Experience) WHERE x.reasoning_path IS NULL SET x.reasoning_path=''`
     （实测 0.157s，NULL→0，读侧 `<>''` 计数与源一致）。NULL 期间读侧语义等价 ''
     （三值逻辑 `NULL<>''` 为 NULL → 行被 WHERE 排除，与 '' 同效），窗口无害但规程要求即回填。
  2. **写入方显式带值（设计输入，拆批候选不实施）**：`/write/experience` CREATE 列集已显式带 reasoning_path，**consensus_status 缺席**（靠 DEFAULT）——写入方显式带 `consensus_status:''` 可根除，属生产代码改动，按本批红线登记拆批。

### 6.3 重开操作序（可复现）

```
RECOV=/tmp/recov1-<ts>                          # 演练根（独立临时路径）
curl -X POST http://127.0.0.1:8766/query -H "X-Auth: $(cat ~/.config/d2d/host-token)" \
  -H 'Content-Type: application/json' -d "{\"cypher\":\"EXPORT DATABASE '$RECOV/export'\"}"
python3 -c "import kuzu; c=kuzu.Connection(kuzu.Database('$RECOV/import-db')); c.execute(\"IMPORT DATABASE '$RECOV/export'\")"
# DEFAULT 回填两条（见 6.2）
cd graphd && P2P_GRAPH_PORT=8799 P2P_GRAPH=$RECOV/import-db P2P_HOST_TOKEN=recov1-drill python3 app.py
curl -H "X-Auth: recov1-drill" http://127.0.0.1:8799/health   # 无 schema_degraded 键=完整
```

坑位登记：演练实例与生产实例端口/DB 路径/token 三独立（flock 按 DB 路径隔离不冲突，
实测同机并存）；演练完 `kill <pid>` 清实例、/tmp 产物留存至复盘后清理。

## 七、B 预案数据点（LadybugDB 0.21.2 首次实测——详见 docs/ladybug-ddl-smoke.md）

- 获取路径实测：PyPI 官方源 `pip install ladybug`（**镜像源无此包，须 --index-url pypi.org**）；
  0.21.2 cp314 wheel 匹配本机 Python 3.14；License=**MIT**（许可面利好——社区延续 Kùzu，
  原 kuzu 仓已归档）。
- **schema.py 全量 18 条 DDL 零报错**（12 节点+6 边逐条 ok）+init_schema 全量零抛出。
- **DEFAULT 语义保真**：CREATE 带列 DEFAULT '' 生效（''）——kuzu 0.11.3 IMPORT 后丢失的
  问题在 LadybugDB 不存在。
- **迁移路径打通**：kuzu 0.11.3 EXPORT 包被 LadybugDB 0.21.2 **直接 IMPORT 成功**（8.97s，
  六主表行数与源全等，Experience 存量保真）——B 预案从"未验证"升级为"导出包级可导"。
- 未锁定项收敛：ALTER ADD DEFAULT 行为与 kuzu 同形（幂等段全吞兼容）；IN 字面量与
  IN $list 参数绑定两形态均支持（生产用字面量形态，参数绑定形态为未来余量）。
- 残余登记：LadybugDB 侧 /health·SCHEMA_DEGRADED·init_schema 等宿主集成面未测（迁移
  启动批范畴）；CDN/轮转等长稳行为未测。
