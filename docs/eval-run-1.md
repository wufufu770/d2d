# EV-1 评测集首跑报告（T2-1 评测集 26 条首次真跑；检索层评测形态）

> 半自动形态（拍板 1）：编排器自动跑 + 打分器自动算 + L2/L3 与未全中条目整理成人工裁决
> 清单（§三，等你终裁）。跑测资产：experiments/eval-harness.mjs（编排）+ eval-scorer.mjs
> （打分）+ results/eval-run-1.jsonl（结构化结果，可重复跑）。锚时效性：**过期率 0/26=0%**
> （green 8 / amber 18——amber=依赖仓外活数据但仓内侧零漂移，建集后 dataset/retrieval/
> ab-report 三件 git 零变更实证），远低于 30% 止损线。

## 一、形态判定（EV-1-0 审计结论）

**检索层评测 only**：全链重放不可行——①原始轨迹不入仓（commit 0eb6454 自述"/tmp 构建器与
原始 dump 不入仓"，实测已灭失）；②蒸馏含 LLM 调用（study.mjs model 驱动）不可确定性重放；
③活卡库四快照中 run 衍生卡=0 张。cards 来源=**数据集自身确定性构造**（buildCardsFixture：
每锚一卡，title/evidence 脱敏形态为 canonical——活图原文做精确匹配会确定性失配）。

## 二、首跑结果（2026-10-02）

| 层 | 条目 | 锚命中 | 命中率 | 分布 |
|---|---|---|---|---|
| L1 | 16 | 12/16 | **75%** | pass 11 / fail 4 / garbage-control 1（三层判定全过） |
| L2 | 6 | 9/15 | **60%** | manual-pass 3（全锚命中+主观字段留人工）/ partial 3 |
| L3 | 4 | 4/14 | **28.6%** | partial 4（chain 主观字段，检索命中仅 1 锚/条） |
| **合计** | **26** | **25/45** | **55.6%** | pass 12 / manual-pass 3 / partial 7 / fail 4 |

场景面：single-finding-retrieval 73.3% / cross-run-same-class 与 chain 显著低于单条——
跨场/跨链召回是检索面的真实弱项（trigram 词面+单卡语料，跨 run 叙事关联弱），与
knowledge-retrieval.mjs 的 L1+L2 双通道设计预期一致（跨语言/跨 run 语义关联留给
pluggable embedding hook——README R5 既有登记）。

garbage-control（L1-006）三层判定全过：检索命中 ✓ / verdict 语义在场 ✓ / 统计排除自检 ✓
——"登录速率限制缺失不计入真洞"的守门语义首跑即正确。

### fail 四条原因分析（最小勘误候选，拍板 2 口径=单条级勘误不重设计）
| id | 锚 | 分析 |
|---|---|---|
| L1-003 | 命令注入 RCE title | 锚 title 含 `(security=low)` 后缀，input 无该词——fixture 语料=锚自身，query 与卡语料 trigram 重叠不足；**判定器可复核**：锚卡在池中但未进 topK 3 |
| L1-008 | 默认凭证 title（含 [REDACTED:*]） | 同上+脱敏串降低词面重叠 |
| L1-011/013 | type 锚（weak-creds-multi / cross-chain-creds） | type 锚只进 signals 字段（语料权重低），input 与 type 字面无重叠 |

→ 均为**检索排序未进 topK**而非数据缺失（锚卡在池），属检索面真实召回弱点+判定口径
（topK=3）组合效应；不改锚不造数据，登记为检索面改进输入（embedding hook 接入后重测）。

## 三、人工裁决清单（14 条，等你终裁——experiments/results/eval-run-1-adjudication.json 全文）

| # | id | 状态 | 命中 | 建议裁决 | 待裁点 |
|---|---|---|---|---|---|
| 1 | L1-003 | fail | 0/1 | 检索面召回弱点，非数据错——维持锚 | 是否接受 topK=3 口径 |
| 2 | L1-008 | fail | 0/1 | 同上（脱敏词面弱化） | 同上 |
| 3 | L1-011 | fail | 0/1 | 同上（type 锚语料权重） | 同上 |
| 4 | L1-013 | fail | 0/1 | 同上 | 同上 |
| 5 | L2-001 | partial | 1/4 | run-A 半边命中；run-B/C type 锚需活图核对 | run-B/C 信号锚是否与集内 evidence 一致 |
| 6 | L2-002 | manual-pass | 2/2 | 全锚命中——确认语义正确即通过 | LFI 类跨场等价性 |
| 7 | L2-003 | manual-pass | 2/2 | 全锚命中 | 弱会话类跨场等价性 |
| 8 | L2-004 | manual-pass | 2/2 | 全锚命中 | CSRF 类跨场等价性 |
| 9 | L2-005 | partial | 1/3 | 主锚（critical verified）命中，次锚未进 topK | 次锚重要性 |
| 10 | L2-006 | partial | 1/2 | title 锚命中，type 锚（deferred）未中 | 同 L1-016 关联 |
| 11 | L3-001 | partial | 1/3 | XSS→SQLI→EXEC 链：单锚命中 | **chain 叙事正确性（人工域）** |
| 12 | L3-002 | partial | 1/5 | 认证接管五环链：单锚命中 | **五环链人工重构** |
| 13 | L3-003 | partial | 1/3 | 配置泄露→DB 沦陷链：单锚命中 | **chain 叙事** |
| 14 | L3-004 | partial | 1/3 | 哈希外带链：单锚命中 | **chain 叙事** |

## 四、CNSR 与度量口径（如实分列）

- **T2-1 基线 5.73** = run-A 9 verified ÷ 1,569,628 token（computeCnsr 复算回 5.73 ✓，
  cnsr.test.mjs:19 锁定值一致）——首跑为**检索层评测，不产 finding/token**，CNSR 维持
  基线引用（口径无漂移；不硬造新分母）。
- 立项卡口径的"实弹全链路跑测"（SPA/DVWA 五指标：发现数/验证闭环率/误报率/耗时/token
  账本）= 另一形态，需起靶场+调度环实跑——**本批未做**（立项卡预估 2-3 人日主体是该件），
  登记为后续可选独立批；本批交付的是评测集检索面首跑+打分基建。
- gap 23（DNS rebinding）：**受控仿真复现完成**——resolve 依赖注入（零真实 DNS 零外联），
  首查公网入缓存→窗内切元数据 IP 不可见（calls=1 实证窗口存在）→ gatewarden-report #23
  从"静态登记"升级"动态仿真双证"；修复后用例自动失败提示撤下。

## 五、工作流幂等性纪律（先例 13，拍板 5 落库）

**AGENTS.md 先例 13**：重试型工作流中一切改变 git 状态的步骤必须幂等（执行前检查目标态
已达成则跳过）；软回退（reset --soft）在重试轮中会级联（T4-3-1 双重 reset 事故：两轮各
回退 5 笔=剥掉 4 笔已推送提交）；AmendWorkflow 缓存按步骤文本匹配——改参即重跑，回退类
步骤与数据变更步骤混排时必须显式"目标态检查"守卫。落地形态见 AGENTS.md 先例 12/13 两条。

## 六、评测集健康度结论

26 条锚 0 失效（green 8+amber 18）——评测集本体健康，零重写；单条级勘误=零（fail 四条
均为检索召回问题非锚错）。检索面改进输入：跨 run/跨链召回弱 → embedding hook（R5 既有
登记）是正解，排序口 topK=3 的口径敏感性已量化（fail 四条锚卡均在池内、未进 topK）。
