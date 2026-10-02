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

- **恢复演练**（IMPORT 到临时库 + 只读重开物理快照）登记开放项单独立项——
  "包还在≠恢复计划"，本 runbook 即演练的脚本化前置。
- 裁剪暂不启用（拍板 ②；AgentIdentity/Task/终态 Signal_ 三类可裁件清单见决策书 §六）。
- 6-6 终态=双条件解锁（嵌入形态+原生事件；拍板 ⑤）——候选观察归 T4-2 决策书 §五口径。
