#!/usr/bin/env node
// experiments/eval-scorer.mjs — 评测打分器（EV-1）: 聚合度量 + CNSR 基线引用 + 人工裁决清单产出。
// CNSR 口径: T2-1 基线 5.73 = run-A 9 verified ÷ 1,569,628 token（cnsr.test.mjs:19 锁定）。
// 检索层评测不产 finding —— 首跑 CNSR = 基线引用 + 第 0 步漂移探针说明（historical-ab.mjs
// 复算回 5.73 即锚面未漂; 本批不重跑实弹全链, 立项卡口径见 docs/eval-run-1.md §四）。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeCnsr } from './cnsr.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** 度量聚合: per layer / per scenario 命中率 + 裁决分布。 */
export function aggregate(results) {
  const by = (key) => {
    const m = {}
    for (const r of results) {
      const k = String(r[key] ?? '?')
      m[k] ??= { total: 0, hitSum: 0, anchorSum: 0 }
      m[k].total++
      const [h, a] = String(r.hit ?? '0/0').split('/').map(Number)
      m[k].hitSum += h || 0
      m[k].anchorSum += a || 0
    }
    return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v, rate: v.anchorSum ? Math.round((v.hitSum / v.anchorSum) * 1000) / 10 : 0 }]))
  }
  return { byLayer: by('layer'), byScenario: by('scenario') }
}

/** 人工裁决清单: partial/manual 条目 → {id, 命中情况, 建议裁决, 证据引用}。L2/L3 主观字段
 *  （chain/verdict/跨场 severity）终裁归人工 —— 半自动形态的交付边界（拍板 1）。 */
export function buildAdjudicationList(results, datasetPath) {
  const entries = new Map(fs.readFileSync(datasetPath, 'utf8').trim().split('\n').map((l) => {
    const e = JSON.parse(l)
    return [e.id, e]
  }))
  return results
    .filter((r) => r.status === 'partial' || r.status === 'manual-pass' || r.status === 'fail')
    .map((r) => {
      const e = entries.get(r.id) ?? {}
      const missed = (e.expected?.must_include ?? []).filter((a, i) => {
        const want = a.title ?? a.type ?? ''
        return !(r.hitTitles ?? []).some((t) => t === want || (a.type && t.includes(a.type)))
      })
      const subjective = (e.expected?.must_include ?? []).some((a) => a.chain) || e.layer !== 'L1'
      return {
        id: r.id,
        layer: r.layer,
        status: r.status,
        hit: r.hit,
        missedAnchors: missed.map((a) => a.title ?? a.type),
        reason: subjective
          ? '含主观字段(chain/verdict/跨场 severity)——检索命中已达, 语义正确性留人工终裁'
          : '锚未全命中——核对 fixture 语料覆盖或判定口径',
        evidence: (e.evidence ?? '').slice(0, 160),
      }
    })
}

/** CNSR 段: 基线引用 + 重算输入说明（检索层评测不产 finding, 首跑不产新 CNSR —— 如实分列）。 */
export function cnsrSection() {
  const baseline = computeCnsr({ verifiedFindings: 9, inputTokens: 1258532, outputTokens: 311096 })
  return { baseline, note: '首跑为检索层评测(不产 finding/token), CNSR 维持 T2-1 基线引用; 实弹全链路跑测归评测集立项卡口径(五指标), 见 docs/eval-run-1.md §四' }
}

/** 主流程守卫: 读结果 JSONL → 输出聚合+裁决清单（幂等覆盖写）。 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const resultsPath = path.join(HERE, 'results', 'eval-run-1.jsonl')
  const results = fs.readFileSync(resultsPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const agg = aggregate(results)
  const adjudication = buildAdjudicationList(results, path.join(HERE, 'dataset', 'eval-dataset.jsonl'))
  const out = path.join(HERE, 'results', 'eval-run-1-adjudication.json')
  fs.writeFileSync(out, JSON.stringify({ aggregate: agg, cnsr: cnsrSection(), adjudication }, null, 2))
  console.log(JSON.stringify({ aggregate: agg, adjudicationCount: adjudication.length, out }, null, 2))
}
