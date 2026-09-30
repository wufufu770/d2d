# 知识脑审计 runbook（T3-1-0）

> 批次: T3-1 阶段 5 瘦身版（知识脑审计 + 经验效果度量）· 审计基线: 远端 HEAD `9a6b5e7`
> 口径: 只读审计 + 离线聚合；禁区（Experience 表结构 3.5-1 / /write/experience 系列 / 离线蒸馏管道 /
> 经验检索+注入 3.5-3 / 安全层 3.5-4 / scheduler.js 2C 区）零触碰，全部结论带数据出处。

## 一、审计项 1：知识脑代码与数据现状

### 1.1 目录与职责（scripts/brain/ 8 文件）

| 文件 | 职责 |
|---|---|
| `curate.sh` | 知识自动策源：拉 config/curate.json 文章源 → 转 md 存 knowledge/inbox |
| `study.mjs` | 学习任务：inbox 文档 → 分批(≈30K chars)蒸馏 technique cards → staged（`--apply` 写盘+队列消费；sha1 进度断点续跑；Reflexion 反例段避让已证伪方向） |
| `promote.mjs` | 三层晋级门禁：①结构（id 形态/必填/EVIL 扫描/幂等去重）②历史复盘（撞已证伪隔离率>30% 整版拒绝）③实战证据（wins≥3 或 wins≥2 且不撞 refuted）；另 `--seed` 冷启动 / `--reject` / `--status` |
| `rollback.sh` | 版本回退：current 软链切回指定版/parent_version（恒保留 3 版 = 现役+2，prune 收口） |
| `insight.mjs` | 自产课程：图内 verified 战果 → 《实战洞察》文档投 inbox（Voyager 式闭环） |
| `strategy-learn.mjs` | 主动学策略：URL/文件/文本 → inbox 草稿（人工审+study 蒸馏） |
| `experience-review-cli.mjs` | 3.5-4-3 人工审计接口：隔离池 promote/reject（走 /write/experience-transition，状态机单向） |
| `migrate-experience-class.mjs` | 存量经验补 e.cls 归一（幂等，dry-run 默认） |

### 1.2 三门禁晋级逻辑（promote.mjs）

| 门 | 位置 | 判定条件 | 失败动作 |
|---|---|---|---|
| ①结构 | `structuralGate`(:52-67) | id=`card:[a-z0-9-]+`；title/applies_to/validation_recipe 必填；variants 形状 `[{stack,payload_diff}]`；EVIL 注入扫描；与现役同卡幂等跳过 | 逐张拒绝（errs 列表） |
| ②历史复盘 | `historyGate`(:71-83) | applies_to 撞已证伪方向（refuted/pruned 且无 wins）→ 隔离；隔离率 >30% 整版拒绝 | 整版 exit 1 |
| ③实战证据 | `gate3`(:111-124) | ExperienceWeight `card:` 前缀 wins≥3，或 wins≥2 且不撞 refuted | exit 1（--force 已废除 #74/P0） |

staged→shadow 附带记忆账本续期（`renewCards`，同题重写即续期）；shadow→current 附带双时长过期清扫（检测类 30 天物理删 / 指纹类 180 天退召回，`sweepExpired`）。

### 1.3 卡片现状

- 种子包（仓库内，CI 校验对象）：`brain/seed/seed-cards.json` 20 张（seed:pkt-v0，数据包特征→漏洞联想）+ `brain/seed/v0-techniques.json` 42 张（出厂基线，按漏洞类组织）。两包独立，id 零重叠。
- 知识库（`~/.d2d-data/brain/`）：current→v2（42 张）/ shadow→v6（78 张）/ versions v2,v4,v5,v6；`memory-usage.json`（热度+misses 台账）/ `evolution.jsonl`（进化台账）/ `index.bin`（trigram TF-IDF 缓存，非 embedding）。
- 字段分布（260 张实测）：必填九字段 `id/title/category/applies_to/validation_recipe/signals/negative_controls/adaptation_prompt/refs` 在全部来源 100% 在场；`domain` 可选（v5 缺 5 张 / v6 缺 5 张，现役 v2 完整）；`variants` 可选（0-3 条）；值域 title 4-84 / recipe 31-471 / applies_to 4-13 / signals 2-6 / negative_controls 1-4。
- 单卡样例（seed:pkt-v0 首卡，脱敏）：`{"id":"card:pkt-server-header-cve","category":"recon","applies_to":["x-powered-by","server",…],"validation_recipe":"curl -s -D- … 查公开 CVE 库联想…","signals":["Server/X-Powered-By 等头暴露产品与版本",…],"negative_controls":["头被 CDN 覆盖…"],"refs":["seed:pkt-v0","OWASP WSTG …"]}`。

### 1.4 版本 ≤3 回滚机制

`prune()`（promote.mjs:96-100）每次晋级后保留 current + 最近 2 版；`rollback.sh [vN]` 无参回退 current 的 parent_version，有参切指定版；`--seed` 以「下一版本」安装不覆写 v0（旧 current 降 retired）。

## 二、审计项 2：A-MemGuard 共识验证的数据基础

### 2.1 Experience 表全部字段（graphd/app.py:958-961 写入侧）

`id`(exp-<12hex> 服务端生成) · `eng_id` · `category`(success|failure|pitfall 枚举) · `scope`(可空) · `title`(1-64) · `content`(1-512) · `evidence_ref`(ev/<eng>/<id>.txt 指针, 可空) · `utility_score`(服务端默认 0.5) · `retrieval_count` · `success_count` · `created_at` · `last_used_at` · `status`(写入恒 quarantined; 转态 quarantined→active→deprecated 单向) · `provenance_hash`(必填)。写入走 `/write/experience`（worker 级，PII 脱敏+注入扫描+配额），转态走 `/write/experience-transition`（host-only，轨迹只落审计不改表 —— 拍板⑧不加列先例）。

### 2.2 推理路径类信息现状

- Experience 无推理过程/依据列（除 512 字 content 自述）。
- 可回溯的推理轨迹存在于 **Signal_ 证据**：verify 任务的结论信号带五段 replay 矩阵（baseline/positive/negative/impact/stop，scheduler.js verifyBlock 模板）——图内 verify-result 信号 **698 条**；含 `used_knowledge:` 归因的信号 8 条。evidence_ref 指向的 ev/ 文件为原文证据。

### 2.3 同 scope 多条经验分布（图内实查）

9 条 Experience：全部 `scope=''`（退化为单组）、5 个 eng_id（eng-0928-*）、category 分布 success×5 / failure×2 / pitfall×2、全部 quarantined、retrieval_count/success_count 全 0。两个 eng 各 3 条。**分组结论：scope 全空 → 同面分组按 `scope 优先、空则 eng_id 降级` 才有信息量。**

### 2.4 结论：v1 可离线做，无需加列

共识 v1 替代信号（全部来自现有 14 列）：①结论一致性 = category 三类在「同面」经验间的冲突（success×failure 强、success×pitfall 弱、failure×pitfall 同阴性不算）；②同面判定 = title+content 归一 token Jaccard ≥ 0.15（保守取低防漏报）；③时间衰减 = 0.5^(龄期天/90)，分歧中新者为准、旧者标 superseded_candidate（仅标注不写库）。落地：`domain/experience-consensus.mjs`（纯函数）+ `scripts/brain/consensus-check.mjs`（CLI，只读 /query）+ promote.mjs 前置信号（只报告不阻断）。

## 三、审计项 3：misses 聚合的数据基础

1. **检索查询侧**：`domain/knowledge-retrieval.mjs` 为纯函数零日志；查询组装与命中记账在 `scheduler.js:361-402`（简报知识块装配处）。
2. **未命中落盘**：**已存在** —— `scheduler.js:398` 在「简报颗粒无收(cards.length=0) 且 queryText 非空」时调 `recordMiss`（memory-store.mjs:114），写入 `${DATA_DIR}/brain/memory-usage.json` 的 `store.misses`（签名=查询词前 120 字符，`{q,n,first_seen,last_seen}`）；读侧 `topMisses` 同文件。当前实查 **0 条**（记录条件窄：整版简报零卡才记，指纹命中通常有卡注入）。
3. **结论：可离线聚合**。落地：`domain/knowledge-gaps.mjs`（月度切分+渲染）+ `scripts/brain/misses-report.mjs`（`--month` / `--inbox` 投放 / `--stdout`）。

**采集面加固（设计就绪，本批不实施）**：现 recordMiss 只覆盖「整版简报零卡」窄条件，逐查询级「有检索动作但无可用产出」不落账。最小侵入候选点：`scheduler.js:398` 邻域（miss 分支扩为「mergeChannels 后空集」与「retrieved 空但 queryText 非空」两档）。scheduler.js 本批不改（禁区边界），仅立此存照。

## 四、审计项 4：经验效果度量的数据基础

| 方案 | 数据可得性 | 结论 |
|---|---|---|
| ①蒸馏质量 | promote manifest `gate.{structural_rejected,quarantined}` 留痕（versions/*/manifest.json）；转态轨迹 `logs/transition-log.jsonl`（exp-* 行）；写端审计 `logs/audit.log`（experience-write/injection-block/soft/quota）；评审记录 `experience-review-cli.mjs` 转态必填 reviewer_note | **落地可跑**（`domain/experience-metrics.mjs` distillQuality + CLI --report / --sample / --record） |
| ②检索有效性 | 「查询→返回集→是否使用」链路：注入台账（memory-usage.json engagements[key].usage，实查 7 engagement 87 卡种）与使用归因（used_knowledge 信号 8 条 / ExperienceWeight `card:idor-bola` w=1,h=2）在，但**逐 brief 的查询与返回集快照不在**（run-log 无知识块记录；handoff-latest.md 非派发 brief） | **设计就绪，本批不实施**（见 §六） |
| ③注入实效 | 注入台账 × `runs/<eng>/run-log.jsonl`（dispatch/terminal 事件带 class 字段）按 engagement 名对齐；重复试错/首中率只能出 engagement 级代理指标 | **落地可跑（对照观测）**：alignEngagements 全等对齐 + ok 率；不做因果声明 |

**测试污染口径（重要）**：`logs/audit.log` 与 `logs/transition-log.jsonl` 聚合本机**全部** graphd 实例（含 pytest 临时实例——实查 exp-* 转态 204 行全部来自测试夹具 `exp-3542`；experience-write 1327 条中绝大多数来自 eng-351 类测试 engagement）。CLI 侧按真实 id 形状过滤（经验 id `exp-<12hex>` = app.py:940 生成器口径；eng_id `eng-MMDD-*` 日期形态）。过滤后数字与图内实况一致（写入 9 = 图内 9 节点；转态 0 = 9 条全 quarantined）。

**抽检记录格式**（`brain/reports/distill-sampling-log.jsonl`，一行一 JSON）：

```json
{"ts":"2026-09-30T12:00:00Z","card_id":"card:xxx","verdict":"ok|hallucination|unverifiable","reviewer":"human","note":"对照来源文档的依据/编造点"}
```

幻觉抽检流程：`experience-metrics.mjs --sample N --version vN` 生成确定性抽样工作单（同日同版可复现）→ 人工对照 manifest.source_docs 逐卡核 validation_recipe/signals 可支撑性 → `--record` 逐条记账 → 下轮 --report 自动出幻觉率。

## 五、审计项 5：测试基线固化（本批门禁）

| 轨道 | 本地全量实测 | 先例基线 | 新基线（本批门禁） |
|---|---|---|---|
| pytest（tests/ 全 6 文件） | **368 passed** | ≥368 | 368 |
| mocha（plugin/pentest-dsh） | 1674 条 = 1673 passing + 1 环境依赖失败（validator L1 mock 用例被本机存活 cdp-proxy 劫持通道所致，CI 无 cdp-proxy 判绿；本批已修复钉通道 → 1674 passing） | ≥1637 | **1674**（含本批新增 55） |
| panel（node --test） | **55 passed** | ≥47 | 55 |

mocha 分片现状：**无分片** —— 单命令 `npx mocha "test/*.test.mjs"` 全量跑（CI ci.yml 同款），panel 独立 node --test。

## 六、设计就绪（本批不实施）

### 6.1 检索有效性数据采集设计（recall@k / MRR 前置）

缺口：无逐 brief 的「查询指纹集/查询文本→返回集(排序)→是否被引用」快照。最小侵入方案（按侵入面从小到大）：
1. **零侵入代理**（已可做）：以 used_knowledge 归因信号为命中真值，memory-usage.json 注入台账为候选集，出 engagement 级命中率（粗口径，无排序信息）。
2. **半侵入（需授权 scheduler.js 邻域）**：brief 装配点（scheduler.js:361-402）在 `recordRead` 处追加一行 JSONL（`${BRAIN}/retrieval-trace.jsonl`：ts/eng/queryText 哈希/返回卡序列）——一处 append，不改判定逻辑。
3. **完整方案（禁区，需显式授权）**：知识块注入时把返回序列连同排名写 trace（含 techMatches/retrieved 两通道来源），recall@k/MRR 才可精确计算。

### 6.2 misses 采集面加固设计

见 §三.3：候选点 scheduler.js:398 邻域，扩 miss 判定为两档（零卡/有查询无产出）。改动面 ≈5 行，属 scheduler.js —— 需显式授权后实施。

## 七、审计项 6：禁区冲突矩阵

| 实施子项 | 触及对象 | 禁区交集 | 处置 |
|---|---|---|---|
| T3-1-1 Schema 校验 | 新 domain 模块 + scripts/brain CLI + gates.yml 步骤 | 无（校验只读卡文件；知识库卡在 DATA_DIR，不入仓） | 落地 |
| T3-1-2 共识验证 | 新 domain 模块 + 只读 /query CLI + promote.mjs 前置信号（只报告不阻断） | 无（promote.mjs 非禁区；零写通道零加列） | 落地 |
| T3-1-3 misses 聚合 | 新 domain 模块 + CLI（读 memory-usage.json，写 reports/） | 无（scheduler.js 不改，采集面加固留设计） | 落地 |
| T3-1-4 度量框架 | 新 domain 模块 + CLI（读 versions/logs/run-logs，写 reports/） | 无（检索有效性停设计就绪） | 落地（①③）+ 设计就绪（②） |

**授权申请清单：无** —— 四子项全部零侵入落地，无禁区触碰，无降级。

## 八、拍板执行记录

1. **五术语占位**：全仓 grep（排除 workflow-runs）——ACON / MaTTS / SAGE / 阶段 8 均零命中（仅存在于上游会话规划语境，仓内无占位可删）；CNSR 为已落地度量名（`experiments/cnsr.mjs`，T2-1-3）保留；ATLAS 仅存于 `docs/merge-plan-approval-trust.md`（2 处）与 `docs/approval-channels.md`（1 处）的「共用存储待确认」悬置——本批收口为「本仓自有存储为唯一存储，不做跨系统假设」，占位撤销。
2. **Embedding 后移**：本批零 embedding 改动（index.bin 为纯 JS trigram TF-IDF 缓存，与 embedding 无关）。
3. **分层压缩**：编排保留，本批未实施。
4. **顺手项（T2-2b-4 开放项②）**：`docs/browser-recon-runbook.md` §② 按实测修正——回环流量的治理面是 CDP 层 Fetch scope 门（17 行审计证据），egress 网关对回环默认隐式直连；cdp-proxy.mjs:129-131 头注释的修正前表述勘误归代码属主批（本批纯文档）。

## 九、CLI 速查

```bash
node scripts/brain/validate-cards.mjs            # 卡片 Schema 全量(种子+知识库), CI 跑 --seed
node scripts/brain/consensus-check.mjs [--out f.md]   # A-MemGuard 共识(只读图)
node scripts/brain/misses-report.mjs [--month YYYY-MM] [--inbox]
node scripts/brain/experience-metrics.mjs --report          # 三方案度量报告
node scripts/brain/experience-metrics.mjs --sample 5 --version v6   # 幻觉抽检工作单
node scripts/brain/experience-metrics.mjs --record --card card:x --verdict ok
```
