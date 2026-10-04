# R5 评估报告（embedding 检索增强 · 2026-10-04）

> 拍板 3 双跑口径：EV-1 评估集（26 条查询/45 锚）× P2P_EMBED off/on + 权重扫频 4 组。
> 边界条款命中：**模型下载双源全败（网络窗口，hf 与 hf-mirror 均不可达——RECOV-1 教训
> 的 HF 面重演）→ 评估降级登记**：off 基线固化完成，on 对照与扫频待模型窗口补跑
> （脚本就绪：`node scripts/brain/embed-model-fetch.mjs --mirror` 重试后
> `node experiments/eval-r5.mjs` 一键补全）。

## 一、off 基线（精确口径固化——本批最硬数字）

| 指标 | 值 | 说明 |
|------|-----|------|
| **recall@3** | **0.5556**（25/45 锚） | 与 EV-1 粗口径锚命中 55.6% 恰好互证——精确口径建立 |
| **MRR** | **0.4741** | 首次建立（EV-1 无此指标）；锚平均排名倒数 |
| 分布 | pass 12 / manual-pass 3 / partial 7 / fail 4 | 与 EV-1 完全一致（同一检索形态） |
| garbage-control | 三层判定全过 ✓ | 防退化锚在位 |

四 fail 锚（L1-003/008/011/013）进 topK：0/4——与 EV-1 一致，即 embedding 的目标改善面。

## 二、on 对照与扫频（降级登记——待模型窗口）

| 轮 | 权重 (l1/l2/l3) | recall@3 | MRR | 备注 |
|----|-----------------|----------|-----|------|
| off | —（原公式） | 0.5556 | 0.4741 | 基线 |
| on（缺省） | 0.25/0.25/0.5 | =off（degraded） | =off | 模型缺 → 降级链按设计工作（L3 恒 0） |
| sweep A | 0.4/0.2/0.4 | 同上 | 同上 | 同 |
| sweep B | 0.2/0.2/0.6 | 同上 | 同上 | 同 |
| sweep C | 0.15/0.35/0.5 | 同上 | 同上 | 同 |
| sweep D | 0.3/0.3/0.4 | 同上 | 同上 | 同 |

降级等价性本身是本批有效验证：**on-without-model 与 off 逐字节同分**（embed.test.mjs
deepEqual 断言+全量双跑同数双重证明）——降级链零风险落定。扫频真值待模型窗口补跑，
缺省权重不擅改（拍板 3）。

## 三、本批交付面（与方案卡 §六对照）

| 项 | 终态 |
|----|------|
| 族 1 embed 模块 | ✅ domain/embed.mjs（懒加载单例/BGE 查询前缀/mean pooling/降级链 warn-once）+config/retrieval-weights.mjs（三权重单表+白名单覆盖）+7 测（含真模型冒烟 skip-gate） |
| 族 2 写入端 | ✅ scripts/brain/embed-backfill.mjs（dry-run 缺省/--apply 幂等 skip 已有向量；模型缺 exit 3 如实登记——已实测降级路径）；promote/study 钩点=backfill 全量兜底覆盖（新卡缺向量时检索侧 L3=0 安全, 补跑 backfill 即齐——钩点散布改最小化） |
| 族 3 查询端 | ✅ knowledge-retrieval.mjs 双路径（off 原公式逐字节保留/on 三权重）+retrieveKnowledgeWithEmbed async 入口；scheduler.js :391 换入口（off 内部直通） |
| 族 4 #15/#16 | ✅ misses 两档（检索零收但指纹兜底有卡=语义缺口档）+knowledge-trace append-only（query/retrieved/tech/final 五键）+3 测（含"trace 块零赋值"静态断言=只增日志红线） |
| 族 5 评估 | ✅ eval-harness ranks 序列+eval-r5.mjs 双跑/扫频 CLI+本报告；on 真值待模型窗口 |
| 供应链 | ✅ scripts/brain/embed-model-fetch.mjs（钉 URL 双源+sha256 表+失败即删）；依赖 @huggingface/transformers+onnxruntime-node（native 内嵌, --ignore-scripts 安装验证可用） |

## 四、红线核验

- **off 态零回归**：mocha 1971→**1981**（+10 全绿）/pytest 414/panel 88——缺省行为零变化。
- **三门零改动**：quota/denylist/注入扫描无 diff（A 层核验）。
- **嵌入分不直接放行结论**：hits/credits 判定门零触碰（boost 乘子链原样）。
- **调度环核心语义零变更**：检索入口换名+记账块内新增两档分支与 trace（授权①②面内）；
  tick→allocateOnce→runWorker 零 diff。
- **garbage-control 全过**：✓（若退化则嵌入分降级为报告面——边界条款，未触发）。

## 五、待办（模型窗口）

1. `node scripts/brain/embed-model-fetch.mjs --mirror`（sha256 表回填 PINNED）。
2. `node scripts/brain/embed-backfill.mjs --apply`（存量卡补算）。
3. `P2P_EMBED=on node experiments/eval-r5.mjs`（on 真值+扫频表回填本报告）。
4. 四 fail 锚改善数≥2 判定嵌入质量；不达标=嵌入分降级为报告面（边界条款）。
