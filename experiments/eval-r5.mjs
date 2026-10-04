#!/usr/bin/env node
// experiments/eval-r5.mjs — R5 评估双跑(拍板 3): P2P_EMBED off/on 各跑 EV-1 评估集
// (26 条/45 锚) → recall@3/MRR 对照+四 fail 锚进 topK 计数+garbage-control 判定保持;
// 另跑权重扫频 3-4 组变体(选型依据进报告; 缺省值不擅改——改值归用户拍板)。
// 模型缺(降级链) → on 轮自动退化为 off 形态, 报告如实标注"degraded"。
// 纯内存可重复跑(先例 10 入口守卫); 结果落 experiments/results/r5-eval.json。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runEval, evalEntry, DATASET } from './eval-harness.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** 排名序列 → recall@k 与 MRR(锚级平均)。 */
export function ranksToMetrics(ranksList, k = 3) {
  let hits = 0
  let anchors = 0
  let mrrSum = 0
  let mrrAnchors = 0
  for (const ranks of ranksList) {
    for (const rank of ranks) {
      anchors++
      if (rank > 0 && rank <= k) hits++
      mrrAnchors++
      mrrSum += rank > 0 ? 1 / rank : 0
    }
  }
  return {
    recall_at_k: anchors ? +(hits / anchors).toFixed(4) : 0,
    mrr: mrrAnchors ? +(mrrSum / mrrAnchors).toFixed(4) : 0,
    anchors,
  }
}

/** 单轮: mode=off(同步原形)|on(async); sweep 权重变体经 opts.weights 注入。 */
export async function runOnce({ mode = 'off', weights = null } = {}) {
  const { buildCardsFixture, evalEntry } = await import('./eval-harness.mjs')
  const entries = fs.readFileSync(DATASET, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const cards = buildCardsFixture(entries)
  const results = []
  for (const e of entries) {
    if (mode === 'off') {
      results.push(evalEntry(e, cards, { topK: 3, weights: weights ?? undefined }))
    } else {
      const { retrieveKnowledgeWithEmbed } = await import('../plugin/pentest-dsh/domain/knowledge-retrieval.mjs')
      const rows = await retrieveKnowledgeWithEmbed(cards, [], { topK: 3, queryText: e.input ?? '', weights: weights ?? undefined })
      // 判定骨架与 finishEval 同构: 锚排名/verdict/status 由 rows 直接算(on 形态单点)
      const hitTitles = rows.map((x) => x.c?.title ?? '')
      const anchors = e.expected?.must_include ?? []
      const ranks = anchors.map((a) => {
        const want = a.title ?? a.type ?? ''
        return hitTitles.findIndex((t) => t === want || (a.type && t.includes(a.type))) + 1
      })
      const hitCount = ranks.filter((x) => x > 0).length
      const subjective = e.layer !== 'L1' || anchors.some((a) => a.chain)
      const status = hitCount === 0 ? 'fail' : hitCount === anchors.length ? (subjective ? 'manual-pass' : 'pass') : 'partial'
      let verdictOk = null
      if (e.scenario === 'garbage-control') {
        const verdictText = anchors.find((a) => a.verdict)?.verdict ?? ''
        const hitCard = rows.find((x) => hitTitles.includes(x.c?.title))
        verdictOk = Boolean(hitCard && verdictText && (hitCard.c?.signals ?? []).some((s) => String(s).includes('garbage-control')))
      }
      results.push({ id: e.id, layer: e.layer, scenario: e.scenario, status, hit: `${hitCount}/${anchors.length}`, hitTitles, verdictOk, ranks, realVulnClass: e.real_vuln_class ?? null })
    }
  }
  const metrics = ranksToMetrics(results.map((r) => r.ranks))
  const failAnchored = ['L1-003', 'L1-008', 'L1-011', 'L1-013']
    .map((id) => ({ id, inTopK: (results.find((r) => r.id === id)?.ranks ?? [0]).some((x) => x > 0) }))
  const garbageOk = results.filter((r) => r.verdictOk !== null).every((r) => r.verdictOk === true)
  return {
    mode, weights: weights ?? 'default',
    metrics, failAnchored, garbageOk,
    summary: {
      total: results.length,
      pass: results.filter((r) => r.status === 'pass').length,
      manualPass: results.filter((r) => r.status === 'manual-pass').length,
      partial: results.filter((r) => r.status === 'partial').length,
      fail: results.filter((r) => r.status === 'fail').length,
    },
  }
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirect) {
  const off = await runOnce({ mode: 'off' })
  console.log('off :', JSON.stringify(off.metrics), 'garbage:', off.garbageOk, JSON.stringify(off.summary))
  const on = await runOnce({ mode: 'on' })
  console.log('on  :', JSON.stringify(on.metrics), 'garbage:', on.garbageOk, 'degraded:', on.degraded)
  const sweeps = []
  for (const w of [{ l1: 0.4, l2: 0.2, l3: 0.4 }, { l1: 0.2, l2: 0.2, l3: 0.6 }, { l1: 0.15, l2: 0.35, l3: 0.5 }, { l1: 0.3, l2: 0.3, l3: 0.4 }]) {
    const r = await runOnce({ mode: 'on', weights: w })
    sweeps.push(r)
    console.log('sweep', JSON.stringify(w), '→', JSON.stringify(r.metrics))
  }
  const out = path.join(HERE, 'results', 'r5-eval.json')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify({ generated_at: new Date().toISOString(), off, on, sweeps }, null, 1))
  console.log(`已落 ${out}`)
}
