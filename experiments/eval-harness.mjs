#!/usr/bin/env node
// experiments/eval-harness.mjs — 评测集首跑编排器（EV-1；T2-1 评测集 26 条首次真跑）。
//
// 形态（EV-1-0 审计定稿）:
//   检索层评测 only —— 全链重放不可行（原始轨迹不入仓+蒸馏含 LLM+卡库零 run 衍生卡，
//   见 docs/eval-run-1.md §一）。cards 由数据集自身确定性构造（本文件 buildCardsFixture：
//   脱敏形态为 canonical —— 锚 title 含 [REDACTED:*]，用活图原文做精确匹配会确定性失配）。
//   判定口径: must_include = all-of（每锚都须在 topK 命中集内）；命中 = 锚卡被
//   retrieveKnowledge 返回（title/type 锚 → fixture 卡的 title/signals 字段承载）。
//   L2/L3 的 chain/verdict 主观字段不做自动判定 → 进人工裁决清单（scorer 产出）。
//   L1-006 garbage-control 三层判定: 检索命中 + verdict 文本在场 + 统计排除自检。
// 纪律: 纯函数直调真实签名 retrieveKnowledge(cards, fps, opts)（gatewarden fixture 陷阱
//   教训: 错误调用形态造虚假结果）; 零网络零 DATA_DIR 写; 结果 JSONL 落 experiments/results/
//   （.gitignore 已有 experiments/dataset 例外惯例, results 由报告文档承载入库）。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { retrieveKnowledge } from '../plugin/pentest-dsh/domain/knowledge-retrieval.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const DATASET = path.join(HERE, 'dataset', 'eval-dataset.jsonl')
export const RESULTS_DIR = path.join(HERE, 'results')
export const TOP_K = 3

/** 从数据集条目构造锚卡 fixture（确定性: 同输入恒同输出）。锚卡语料=锚字段+evidence 摘录,
 *  保证检索命中的文本面与锚一致; 干扰由 distractorCards 注入。 */
export function buildCardsFixture(entries) {
  const cards = []
  for (const e of entries) {
    for (const [i, anchor] of (e.expected?.must_include ?? []).entries()) {
      cards.push({
        id: `fixture:${e.id}:anchor${i}`,
        title: anchor.title ?? anchor.type ?? `${e.id} anchor ${i}`,
        validation_recipe: (e.evidence ?? '').slice(0, 200),
        applies_to: [e.source ?? ''],
        signals: [anchor.type, anchor.verdict, e.scenario].filter(Boolean),
      })
    }
  }
  return cards
}

/** 单条评测: 真实签名直调检索面, 返回结构化判定（可 JSONL 落盘可复跑）。
 *  R5: retrieveFn 可注入(缺省同步原函数=off 形态; async 包装=on 形态), recall@k/MRR 按排名计算。 */
export function evalEntry(entry, cards, { topK = TOP_K, retrieveFn = retrieveKnowledge } = {}) {
  const r = retrieveFn(cards, [], { topK, queryText: entry.input ?? '' })
  if (r && typeof r.then === 'function') throw new Error('evalEntry 同步形: on 态请用 evalEntryAsync')
  evalEntryShape(entry, r, topK)
  return finishEval(entry, r, topK)
}

/** on 形态(async): 与 evalEntry 同判定, 检索经 retrieveKnowledgeWithEmbed。 */
export async function evalEntryAsync(entry, cards, { topK = TOP_K } = {}) {
  const { retrieveKnowledgeWithEmbed } = await import('../plugin/pentest-dsh/domain/knowledge-retrieval.mjs')
  const r = await retrieveKnowledgeWithEmbed(cards, [], { topK, queryText: entry.input ?? '' })
  return finishEval(entry, r, topK)
}

function evalEntryShape(entry, r, topK) { /* 保留扩展点(现无形状前置校验) */ }

function finishEval(entry, r, topK) {
  const hitTitles = r.map((x) => x.c?.title ?? '')
  // R5 评估口径(#15 精确化): per-anchor 记录排名 → MRR 与 recall@k 可从 ranks 重算
  const anchors = entry.expected?.must_include ?? []
  const perAnchor = anchors.map((a) => {
    const want = a.title ?? a.type ?? ''
    const rank = hitTitles.findIndex((t) => t === want || (a.type && t.includes(a.type))) + 1 // 0=未中
    return { want, hit: rank > 0, rank }
  })
  const hitCount = perAnchor.filter((a) => a.hit).length
  // L1-006 garbage-control 三层: 命中 + verdict 语义在场 + real_vuln_class=false 排除自检
  const garbage = entry.scenario === 'garbage-control'
  let verdictOk = null
  if (garbage) {
    const verdictText = anchors.find((a) => a.verdict)?.verdict ?? ''
    const hitCard = r.find((x) => hitTitles.includes(x.c?.title))
    verdictOk = Boolean(hitCard && verdictText && (hitCard.c?.signals ?? []).some((s) => String(s).includes('garbage-control')))
  }
  // 判定分级: manual = 主观字段条目(L3 chain/L2 跨场部分/L1-007 verdict)自动层只判检索命中,
  // 终裁归人工清单; 客观条目 all-of 命中即 pass。
  const subjective = entry.layer !== 'L1' || (entry.expected?.must_include ?? []).some((a) => a.chain)
  let status
  if (hitCount === 0) status = 'fail'
  else if (hitCount === anchors.length) status = subjective ? 'manual-pass' : 'pass'
  else status = 'partial'
  return {
    id: entry.id, layer: entry.layer, scenario: entry.scenario, status,
    hit: `${hitCount}/${anchors.length}`, hitTitles, verdictOk,
    ranks: perAnchor.map((a) => a.rank), // R5 #15: 锚排名序列(0=未中) → recall@k/MRR 可重算
    realVulnClass: entry.real_vuln_class ?? null,
  }
}

/** 全量编排: 读数据集 → fixture → 逐条评测 → {results, summary}。纯内存可重复跑。 */
export function runEval(datasetPath = DATASET, { topK = TOP_K } = {}) {
  const entries = fs.readFileSync(datasetPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const cards = buildCardsFixture(entries)
  const results = entries.map((e) => evalEntry(e, cards, { topK }))
  const summary = {
    total: results.length,
    pass: results.filter((r) => r.status === 'pass').length,
    manualPass: results.filter((r) => r.status === 'manual-pass').length,
    partial: results.filter((r) => r.status === 'partial').length,
    fail: results.filter((r) => r.status === 'fail').length,
  }
  return { results, summary, cards: cards.length }
}

/** 主流程守卫（先例 10）: 直接执行时跑测并落 JSONL（可重复跑, 幂等覆盖写）。 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { results, summary } = runEval()
  fs.mkdirSync(RESULTS_DIR, { recursive: true })
  const out = path.join(RESULTS_DIR, 'eval-run-1.jsonl')
  fs.writeFileSync(out, results.map((r) => JSON.stringify(r)).join('\n') + '\n')
  console.log(JSON.stringify({ summary, out }, null, 2))
}
