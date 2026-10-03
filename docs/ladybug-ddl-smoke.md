# LadybugDB DDL 冒烟数据点（RECOV-1 · B 预案输入，2026-10-04）

> 性质：纯数据点，不启动迁移（runbook-storage §七摘要的完整版）。测试对象=ladybug
> 0.21.2（PyPI，MIT，社区延续 kuzu——kuzu 仓已归档）；隔离 /tmp 库，零生产触碰。
> 生产基线=kuzu 0.11.3（Python 3.14，cp314 wheel）。

## 一、获取路径

- **PyPI 官方源可装**：`pip install ladybug --index-url https://pypi.org/simple`——注意
  国内镜像（aliyun）无此包，须官方 index；`ladybugdb`/`ladybug-db` 包名不存在，**正确
  包名=ladybug**（PyPI 上同为 "ladybug" 的环境设计库是无关项目，认准 Summary=
  "embeddable graph database"+Home=ladybugdb.com）。
- 0.21.2 提供 cp314 wheel（Requires-Python <3.15,>=3.10）——**本机 Python 3.14 直装可用**；
  T4-2b 钉扎形态（pin wheel 离线装）可平移（wheel 落 pin/ 目录）。
- **License=MIT**（metadata 实证）——原 kuzu MIT 延续，B 预案许可合规。

## 二、schema.py 全量 DDL 重放（18 条逐条）

| 块 | 结果 |
|----|------|
| 12 节点表 CREATE NODE TABLE IF NOT EXISTS（含 Experience 16 列全表） | **18/18 全 ok 零报错** |
| 6 边表 CREATE REL TABLE IF NOT EXISTS | 同上（含 AT/CONFIRMS/SUGGESTS/DERIVED_FROM/PRIOR_FOR/RELATES） |
| init_schema 全量（含 ExperienceWeight 6 列/Engagement 5 列/Finding/Task/审计列 ALTER 幂等段） | 零抛出 |

迁移代价预估（DDL 面）：**≈零**——无一条 schema 语句需要改写。

## 三、行为差异与兼容性实测

| 探针 | kuzu 0.11.3 行为 | ladybug 0.21.2 行为 | 迁移影响 |
|------|------------------|---------------------|----------|
| CREATE 带 DEFAULT 列后新行缺省值 | `''`（生效） | `''`（生效，**保真**） | 无差异 |
| **IMPORT 库 DEFAULT 元数据** | **丢失**（新增行=NULL，RECOV-1 段②实证） | 不适用——见下「导出包直接 IMPORT」 | **LadybugDB 无此缺陷类** |
| ALTER ADD 已存在列 | `already has property` 拒绝 | 同形拒绝 | init_schema 全吞幂等段兼容 ✓ |
| IN 字面量（生产形态 `IN ['a','b']`） | 支持 | 支持 | 零改写 |
| IN 参数绑定 `IN $list`（未来形态） | 支持（未用于生产） | 支持 | 余量 |
| 标量绑定 $param+timestamp() | 支持 | 支持 | 零改写 |

## 四、B 预案迁移路径实测（本批最重数据点）

**kuzu 0.11.3 EXPORT DATABASE 的导出包（18 parquet+copy.cypher，4.2MB）被 ladybug
0.21.2 直接 `IMPORT DATABASE` 成功**：8.97s；六主表行数与源全等（Engagement 17 /
Finding 777 / Signal_ 5108 / Experience 9 / AgentIdentity 1321 / Task 1381）；Experience
代表行 reasoning_path='' / consensus_status='consistent' 存量保真。

→ B 预案可行性从 T4-2b 的"未验证"升级为：**DDL 全兼容+导出包级可导+DEFAULT 语义
保真**。迁移启动批（若触发）的剩余验证面：宿主集成（graphd 换引擎的 /health·
SCHEMA_DEGRADED·门函数全链）、长稳（WAL/轮转/并发写）、性能基线对比。

## 五、方法论备注

- 冒烟全程隔离：`pip install --target /tmp/lb-py`（不污染生产 venv）+`/tmp/lb-smoke-db`
  独立库；生产 kuzu_db 零写、生产实例零触碰。
- 演练脚本与冒烟脚本为 /tmp 一次性工具（runbook §6.3 已承载可复现命令序），不入仓
  ——scripts/ 面扩授权非本批范围。
