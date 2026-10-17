# X-Ring 产物 schema 长度策略统一表（R-09 · E21）

> 语义：上限=schema maxLength 硬闸（超限=条目拒/截断）；截断=宿主侧组装语义（E11a#4：
> 总长含尾标≤上限，截断后仍超=partial 入图）。语义正确性归环外 verify——本表只管结构面。

## 载体字段长度总表（四 schema）

| schema | 字段 | 上限 | 超限处置 |
|---|---|---|---|
| hypotheses | hypotheses[].statement | 1500（relay 收集同） | 条目级容错（E11a#4） |
| hypotheses | hypotheses[].evidence_refs[] | 单条 ≤500（EVIDENCE_MAX） | 截断+`[truncated:原长N]` 尾标+partial |
| repro_paths | findings[].title | 200 | 条目拒 |
| repro_paths | findings[].steps[] | 单条 ≤2000、≤100 条 | 条目拒 |
| repro_paths | findings[].expected/observed | 2000 | 条目拒 |
| repro_paths | findings[].variants | ≤5 组×steps | 竞速面（E18） |
| repro_paths | findings[].env.tls.caPath | 500 | manual 兜底 |
| lessons | lessons[].lesson | 512（图写 content 截断） | 入图截断 |
| handoff | leads[].statement / falsified.statement | 1500 | relay 截断（E18 collect 收口） |
| handoff | intents[].direction | 500 | relay 截断 |
| handoff | ecc.signals[].detail | 500 | relay 截断 |
| handoff | env.fingerprint[].path | 500 | relay 截断 |

## 组装器截断语义（relay.collectHandoff）

全部自由文本字段经 `String().slice(0, 上限)` 收口——组装器永不因超长拒收（超长=静默收口
到上限）；schema 层 maxLength 只拒**非组装器来源**的原始 worker 产物（条目级容错）。
两层口径：worker 原始产物=条目级容错；宿主组装产物=截断收口。
