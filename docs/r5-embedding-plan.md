# R5 方案卡：embedding 检索增强（前置审计产出——等用户确认进 R5 实施批）

> 对象：经验脑知识卡检索（domain/knowledge-retrieval.mjs——L1 关键词指纹+L2 trigram
> TF-IDF 余弦，topK=3）。EV-1 实证：锚命中 55.6%（25/45）/L3 跨 run 链召回 28.6%——
> 检索层是经验复利核心管道的短板。本卡合并收口开放项 #15（recall@k/MRR 采集）与
> #16（misses 加固——T3-1-3 聚合 CLI 已落地，本卡只补采集面放宽设计）。
> 存储底座输入：LBD-1/2 结论（kuzu 0.11.3 与 LadybugDB 均无向量距离函数——应用层余弦；
> 但见存储形态：主语料在 JSON 卡片，图引擎无关）。

## 一、misses 归因分布（EV-1 逐条实证，四类）

| 归因类 | 条目 | 证据 | embedding 可救性 |
|--------|------|------|------------------|
| 词面不匹配 | L1-003（锚 title 含 `(security=low)` 后缀）/L1-008（`[REDACTED:*]` 脱敏串降低重叠） | 锚卡在池但未进 topK=3；query 与卡语料 trigram 重叠不足 | **可救**——语义近邻不受词面变体影响 |
| 索引/口径限制 | L1-011/L1-013（type 锚只进 signals 低权重字段）+topK=3 口径 | type 字面与 input 零重叠；排序进不了前 3 | **部分可救**（嵌入 corpusOf 权重设计+topK 复核）——字段加权为主 |
| 语义漂移 | L3 跨 run 链 4 条 partial（chain 叙事关联弱：跨 run 叙事词面不同语义同） | single-finding 73.3% vs cross-run/chain 显著低 | **主场景**——跨语言/跨 run 语义关联正是 README R5 登记的 pluggable hook 意图 |
| 数据面缺口 | **0 条** | EV-1 §二"均为检索排序未进 topK 而非数据缺失" | — |

→ embedding 直击 3/4 类（词面/语义/部分口径），与 misses 实证完全对齐。

## 二、模型选型（本地零成本，全 Node 侧）

| 候选 | 结论 |
|------|------|
| **bge-small-zh-v1.5（ONNX）——主选** | 384 维；中文强（经验卡中英混语料）；~90MB 模型文件；MIT。ONNX Runtime 推理 |
| fastembed（Python，Qdrant） | 模型好但 Python 侧——检索器在 Node scheduler 进程内，跨进程算 query 嵌入=每次检索一次子进程调用（重），否 |
| all-MiniLM-L6-v2 | 英文强中文弱，语料中英混时劣于 bge-small-zh |
| 手写 hash/embedding | 零依赖但语义质量不足，否 |

**全 Node 侧定案依据**：写入端（distill/promote=distill-experience.mjs，Node）与查询端
（retrieveKnowledge，Node）同语言——`onnxruntime-node` 进程内推理（query 嵌入 ~10ms 级），
零跨进程、零 API 费。依赖成本：onnxruntime-node（node_modules +~200MB native，开发机
安装一次）+模型文件 ~90MB 外置 `DATA_DIR/models/`（运行时下载/手动放置，不入仓不入 CI
——CI 单测以纯函数+注入向量 mock，模型不存在时**检索器回退 trigram 通道**（feature
flag `P2P_EMBED=off` 缺省，渐进启用））。

## 三、存储设计（引擎无关）

- **主层（R5 实施范围）=知识卡层**：卡片 JSON 增加 `embedding` 字段（384 维数组，
  序列化 ~3KB/卡；120 张 ≈ 360KB）——随卡读写（brain/ 目录既有存储），**零图引擎
  改动、零向量索引**（百行级语料暴力余弦，knowledge-retrieval.mjs 已有 cosine 基建）。
- **次层（可选二期）=图内 Experience**：9 条级，同样暴力扫描即可；若做，Experience 加
  `embedding_json STRING` 列（图引擎无向量函数的前提下存 JSON 数组+应用层算）——
  本卡不预定，随图内经验量增长另立项。
- 兼容：LadybugDB 切换（LBD-2）对本设计零影响（主层不触图引擎）。

## 四、接线面（双端设计）

1. **写入端**：distill 落卡/promote 晋级时对新卡算嵌入（onnxruntime-node，本地）；
   存量卡批处理补算脚本（scripts/brain/embed-backfill.mjs，--dry-run 缺省）。
2. **查询端**：retrieveKnowledge 的 queryText → 嵌入 → 与卡嵌入余弦 = **L3 语义分**；
   合并公式升级为 L1 关键词(0.25)+L2 trigram 词面(0.25)+L3 语义(0.5)（词面通道保留：
   精确词/锚词强项+防嵌入漂移——权重进可调常量，EV 对照期校准）。
3. **降级链**：模型缺失/推理异常 → L3 分恒 0，行为退回现 L1+L2 形态（逐字节等价保底）。
4. **#16 misses 加固**（设计就绪照落地）：recordMiss 放宽为两档（简报零卡=现有档 +
   「有卡但 top1 分低于阈值」新档）——采集面改 scheduler.js:398 邻域，**按行授权申请**。
5. **#15 trace 采集**（完整方案）：知识块注入时写返回序列+排名（techMatches/retrieved
   两通道）落 trace——同在 scheduler.js 注入点，**按行授权申请**（brain-audit §6.1 既有
   设计照实施）。

## 五、评估计划（EV-1 26 条重测基线固化+接入后对照）

1. **基线固化**：EV-1 12 条固定评估查询+26 锚卡重跑，精确口径 recall@3/MRR（EV-1 的
   55.6% 为粗口径锚命中——重测建立精确基线；数字落 docs/eval-run-1.md 附节）。
2. **对照计划**：R5 实施后同查询集重跑（P2P_EMBED=off/on 双跑）——验收=recall@3 与
   MRR 提升+四条 fail 锚（L1-003/008/011/013）至少 2 条进 topK+garbage-control 三层
   判定保持全过（防退化锚）。
3. **防灌水/防污染与既有门交互**：嵌入是检索面非写入面——experience_quota_reject/
   prose_denylist_hit/experience_injection_scan 三门零改动零交互（嵌入向量非文本不进
   扫描语料）；嵌入分不直接放行任何结论——仍过既有 hits/credits 判定门；防污染=嵌入
   语料仍为 sanitize 后卡文本，注入文本过门后才会被嵌入（不放大攻击面）。

## 六、依赖成本与实施预估

| 项 | 成本 |
|----|------|
| onnxruntime-node | node_modules +~200MB（开发机一次） |
| 模型文件 | bge-small-zh-v1.5 ONNX ~90MB @ DATA_DIR/models/（不入仓不入 CI） |
| 代码面 | knowledge-retrieval.mjs（L3 通道+降级链）/distill-experience.mjs（写入端）/scripts/brain/embed-backfill.mjs（新）/tests（纯函数+mock） |
| 禁区面 | scheduler.js:398 邻域（misses 两档）+注入点 trace——**按行授权申请两项**（#15/#16 收口） |
| 预估 | R5 实施批 M（3-4 族）：依赖+写入端 / L3 通道+降级链 / #15/#16 接线 / 评估对照+docs |
| 风险 | 嵌入质量不达预期=合法结局（降级链保底，trigram 形态零损失回退） |
