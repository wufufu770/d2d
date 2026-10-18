# R-25 资产图设计（E27 设计批产出——纯设计零代码）

> 纪律：本文档=设计授权（本批词）产物，**实施授权另批**（池 R-25 实施面仍冻结）。
> 零 schema 落库零 graphd 运行时触碰；graphd/app.py、gd/gates.py、test_graphd_gates.py
> 为存量面，本批仅只读盘点。设计依据三源：六轮场验实践反推（§三，每条挂实例）+E25 血
> 缘链思想参照（ARTEX 公开架构描述的思想层——零代码零直译）+E26 校准后判读面接口。

## 一、现状盘点（Phase 1，只读实测）

### 1.1 节点与边（graphd/app.py 实测）

| 类型 | 关键字段 | 写入端点 | 写入者 |
|------|---------|---------|--------|
| Endpoint | url/param/method/tech/business_chain/eng/authorized | upsert（:319，按 url 合并） | host 管道 |
| Finding | id/title/severity/cvss/repro/category/**gate_status（八态）**/related_to/content_hash/source_hash/evidence_ref | /write/finding（:774） | reflow（A 级必经 verifyRunner） |
| Signal_ | id/type/weight/status/evidence/ring/eng/surface/boundary | /write/signal（:837） | host 管道 |
| Hypothesis | id/text/strategy/status/ts/eng/value_score | /write/hypothesis（:940） | reflow（B 级） |
| Experience | id/eng_id/category/scope/title/status（quarantined 语义） | /write/experience（:1048） | reflow（C 级） |

**边**：仅 `Signal_-[:AT]->Endpoint` 一种（:859）——**图实为点仓库形态，血缘/时序/因果
语义近零**。Finding.related_to 为自由文本指针（血缘的唯一雏形）。

### 1.2 查询面与权限

- 编排侧：`graphdQuery`（first-run :155，host token，POST /query，10s 超时）——现仅用于
  run 前后图内计数对账（findings/experiences/hypotheses/quarantined 四计数）。
- worker 侧：**零 /query 零 /write 权**（runner.mjs :7 剥 token 契约——"写权归 host 回流
  管道"）。worker 的图感知全靠简报注入（handoff/prompt）。

### 1.3 防线对账（设计不得绕过）

gates.py 纯函数族（test_graphd_gates.py 429 例锁回归）：content_length 门（V-11）/垃圾
拒收/签名去重（content_hash/source_hash）/denylist（R6）/L0-L1 硬门/八态转换门/injection
patterns/redact_pii/evidence_ref 磁盘指针（ev/<eng>/<node-id>.txt）/审计（audit.py）。
**兼容结论**：任何新写端点必须复用同族纯函数；新节点类型的"转换语义"须与八态门对齐或
显式声明 append-only（见 §四.4）。

### 1.4 未入图面（场验产物在 handoff/报告侧的清单）

handoff 五载体（facts/leads/falsified/intents/**env 指纹+ecc 判级**）、ECC 校准后判级
（E26 双记）、advisor.md 建议、竞速 verdicts（race 胜负）、retest 结果（remediated 流转）、
形态转变时间线（E25 侧写档手工维护）、L-1 验证率台账（2/2 类数字靠报告面计算非图）。

## 二、E25 血缘链思想参照（思想层，零代码）

ARTEX 原版公开架构描述中"证据链可回溯"思想：每个结论节点可追至其验证事件与原始证据，
验证事件不可变、结论可被新验证推翻但历史不被改写。与本仓既有语义的映射：facts（已验证
）/falsified（防复测）/remediated（修复后复测）三态恰是"结论-验证"分离的思想实例——
**本设计的核心=把这对分离从 handoff JSON 层提升到图边语义层**。

## 三、需求反推（六轮场验实践，每条挂实例）

| # | 需求 | 场验实例依据 | 现状缺口 |
|---|------|------------|---------|
| N1 | 跨 run 资产记忆 | E22 run1 消费 E20 handoff 12 leads；192.168.132.14 六轮每 run 重新发现资产 | Endpoint 按 url upsert 合并但 eng 单值（最后写入者）；无"目标级"聚合点 |
| N2 | **血缘链（核心增量）** | E20 critical 链（默认凭据→管理员 JWT→管理面）链条语义只在 repro/evidence 文本；L-1 验证率（六轮悬置）靠报告面手算 | finding→验证→复测→处置无图边；Verification 事件不存在 |
| N3 | 验证事件不可变 | R-08 verdicts 三分（held∩pass→facts/fail→falsified）在 reflow 内存态完成后即丢；重测（retest）结果无图档 | 判定轨迹（谁/何时/依据/哪版 repro）不可追溯 |
| N4 | 环境快照 | ECC 五数据点+校准双记（E26）；handoff env 指纹矩阵每 run 生成后不入图 | 形态转变时间线靠 devlog 手工维护（E25 考古被迫全手工回溯） |
| N5 | 跨任务共享（R-25 原语义） | 换目标场景（E24 呈报④自建环境）：新 run 无法引用历史目标的资产与教训 | Experience 有 eng_id 隔离无跨任务查询语义 |
| N6 | 台账机械化 | 持续验证台账（ECC 假阳率/handoff 复战效用/验证率）全人工 | 图内算不出任何台账指标 |

## 四、设计本体

### 4.1 新节点（2 类）

```
Asset        —— 目标级聚合点（N1/N5）
  id, kind(host|service|target), identifier(如 https://192.168.132.14),
  first_seen, last_seen, status(active|tarpit|down|archived),
  posture_note(侧写档指针——docs/ 语义引用非内容拷贝)
EnvSnapshot  —— 环境快照点（N4，append-only）
  id, asset_id, checked_at, ecc_level_raw(校准前), ecc_level_cal(校准后——E26 双记),
  signals(JSON), fingerprint(JSON——handoff env 载体原文), probe_paths
```

### 4.2 新边（5 条语义）

```
Asset-[:HOSTS]->Endpoint                     （N1：目标聚合其端点）
Finding-[:VERIFIED_BY]->Verification         （N2/N3）
Hypothesis-[:JUDGED_BY]->Verification        （N3：verdicts 三分的判定事件）
Asset-[:SNAPSHOT]->EnvSnapshot               （N4，按时间轴有序）
Finding-[:DERIVED_FROM]->Finding             （N2：critical 链类因果，related_to 的结构化替代——保留 related_to 字段兼容期）
```

### 4.3 Verification 事件点（N2/N3 核心，append-only 不可变）

```
Verification
  id, kind(repro|race|retest|advisor-verdict), verdict(pass|fail|race-win|held-unreviewed),
  repro_ref(内容 hash→evidence_ref 磁盘指针——防线同族), executor(reflow|retest-cli),
  run_id, ts, latency_ms, race_variants(可选), note
```

不可变语义：Veri­fication 落盘后零 UPDATE（区别于 Finding 八态）——**结论可被新验证推翻，
历史不改写**（§二思想 + E26 对账表双记法同构）。防线上：append-only 类型豁免八态转换门，
但 content_length/垃圾拒收/签名去重/injection/redact_pii/evidence_ref 全族照用；新增
"事件去重门"（同 run_id+kind+finding_id 幂等拒重）为唯一新纯函数（进 gates.py + 
test_graphd_gates.py 同批锁回归）。

### 4.4 权限与超时契约（零变更声明）

worker 零写权零查询权维持（Verification/EnvSnapshot 均由 reflow/reflow-retest host 管
道写入）；graphdQuery 10s 超时维持——新增查询面全为**批量对账形态**（台账指标预聚合为
定期 COUNT 类查询，不做交互式图遍历 API）。

### 4.5 台账机械化（N6）

L-1 验证率、ECC 假阳率（对账表）、falsified 防复测命中数、handoff 复战效用（leads 复验
率）四指标全部改为图上 COUNT/MATCH 聚合——场验批回报的"四指标"节由编排脚本从图直出。

## 五、实施路线图（实施授权另批后生效）

| 里程碑 | 内容 | 验收线 |
|--------|------|--------|
| M1 schema+写入端点 | Asset/EnvSnapshot/Verification DDL+三写端点+事件去重门（gates.py 纯函数+pytest 同批） | test_graphd_gates.py 429+新增全绿；防线零绕过审计 |
| M2 reflow 接线 | verify/race/retest 三事件→Verification；verdicts 三分→JUDGED_BY | 离线合成 e2e（smoke-e2e 扩展）：一次 run 后图内可 MATCH 出完整链 |
| M3 EnvSnapshot 接线 | ECC assess 结果+指纹矩阵→SNAPSHOT | 场验批 Phase 0 后图内有快照点（对账表数据源切换） |
| M4 资产聚合 | Asset upsert+HOSTS；编排侧跨 run 资产查询函数 | 换 run 重入同目标：图内资产计数不重复增长 |
| M5 台账直出 | 四指标图上聚合脚本 | 台账数字与报告面手算一致（双跑对账一批） |

## 六、不做清单与风险

- 不做：worker 直写、交互式图遍历 API、跨引擎（ladybug 同形 API 已抽象无需设计）、
  handoff 载体废弃（图与 handoff **互补不互替**——handoff=run 间传递契约，图=跨 run 记
  忆；N1 语义已划界）。
- 风险 R1：Event append-only 与八态门的双轨语义复杂度——缓解=事件去重门为唯一新纯函数。
- 风险 R2：EnvSnapshot.fingerprint JSON 大小（五路径矩阵 KB 级）——MAX_BODY_BYTES 1MB
  内，无需新门。
- 风险 R3：双判级字段（ecc_level_raw/cal）语义漂移——缓解=E26 对账表双记同为真值源，
  字段命名与对账表列名一一对应。

## 七、与池的关系

池 R-25"资产图跨任务共享"条目：本设计文档为其前置设计件；**实施授权=另批批词显式给出**
（建议按 M1→M5 分批，M1+M2 为最小可用集）。本批零代码零 schema 落库零运行时触碰，三轨
预期不动（2214/12/429/96）。
