#!/usr/bin/env node
// experience-metrics.mjs — T3-1-4 经验效果度量 CLI(零侵入: 只读现有日志/账本, 只写 reports/)
// 用法:
//   node scripts/brain/experience-metrics.mjs --report            聚合三方案 → 打印+落 reports/
//   node scripts/brain/experience-metrics.mjs --sample 5 --version v6
//       从指定版本卡池确定性抽 N 张 → 幻觉抽检工作单(人工对照来源文档审)
//   node scripts/brain/experience-metrics.mjs --record --card card:x --verdict ok|hallucination|unverifiable \
//        [--reviewer 名字] [--note 说明]
//       抽检结论落账本 distill-sampling-log.jsonl(格式见 docs/brain-audit-runbook.md §抽检记录格式)
// 数据源: brain/versions/*/manifest.json · logs/transition-log.jsonl · logs/audit.log ·
//         brain/memory-usage.json · runs/*/run-log.jsonl · brain/reports/distill-sampling-log.jsonl
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { distillQuality, samplingStats, sampleCards, alignEngagements, renderMetricsDoc } from '../../plugin/pentest-dsh/domain/experience-metrics.mjs'

const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const BRAIN = `${DATA_DIR}/brain`
const RUNS = `${DATA_DIR}/runs`
const REPORTS = `${BRAIN}/reports`
const SAMPLING_LOG = `${REPORTS}/distill-sampling-log.jsonl`

const readJsonLines = (p) => {
  try { return fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) } catch { return [] }
}

// ---------- --record ----------
if (process.argv.includes('--record')) {
  const av = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : '' }
  const card = av('--card')
  const verdict = av('--verdict')
  if (!card || !['ok', 'hallucination', 'unverifiable'].includes(verdict)) {
    console.error('用法: --record --card <card:id> --verdict ok|hallucination|unverifiable [--reviewer 名] [--note 说明]')
    process.exit(1)
  }
  fs.mkdirSync(REPORTS, { recursive: true })
  fs.appendFileSync(SAMPLING_LOG, JSON.stringify({
    ts: new Date().toISOString(), card_id: card, verdict,
    reviewer: av('--reviewer') || 'human', note: av('--note') || '',
  }) + '\n')
  console.log(`✅ 抽检结论已记账: ${SAMPLING_LOG}`)
  process.exit(0)
}

// ---------- 数据装配(全只读) ----------
const manifests = []
try {
  for (const d of fs.readdirSync(`${BRAIN}/versions`).filter((x) => /^v\d+$/.test(x))) {
    try { manifests.push({ dir: d, ...JSON.parse(fs.readFileSync(`${BRAIN}/versions/${d}/manifest.json`, 'utf8')) }) } catch {}
  }
} catch {}
const transitions = readJsonLines(`${DATA_DIR}/logs/transition-log.jsonl`)
const auditEvents = readJsonLines(`${DATA_DIR}/logs/audit.log`)
// 测试污染过滤(口径见 docs/brain-audit-runbook.md): 本机 pytest 临时 graphd 实例写同一批日志文件。
// 经验 id 真实形状 = exp-<12位hex>(app.py "exp-"+uuid4().hex[:12]); 测试夹具 exp-3542 之类被滤除。
const REAL_EXP_ID = /^exp-[0-9a-f]{12}$/
const realTransitions = transitions.filter((t) => REAL_EXP_ID.test(String(t?.node_id ?? '')))
// audit 侧同口径: eng_id 须为 eng-MMDD-* 日期形态(真实 engagement 命名), eng-351 类测试 id 滤除
const REAL_ENG_ID = /^eng-\d{4}-/
const realAudit = auditEvents.filter((ev) => {
  if (!String(ev?.kind ?? '').startsWith('experience-')) return true
  return REAL_ENG_ID.test(String(ev?.detail?.eng_id ?? ''))
})
const samplingRows = readJsonLines(SAMPLING_LOG)
const memoryStore = (() => { try { return JSON.parse(fs.readFileSync(`${BRAIN}/memory-usage.json`, 'utf8')) } catch { return {} } })()
const runLogs = {}
try {
  for (const d of fs.readdirSync(RUNS).filter((x) => x.startsWith('eng-'))) {
    const rows = readJsonLines(`${RUNS}/${d}/run-log.jsonl`)
    if (rows.length) runLogs[d] = rows
  }
} catch {}

// ---------- --sample ----------
if (process.argv.includes('--sample')) {
  const si = process.argv.indexOf('--sample')
  const n = Math.max(1, parseInt(process.argv[si + 1], 10) || 5)
  const vi = process.argv.indexOf('--version')
  const version = vi > -1 ? process.argv[vi + 1] : 'current'
  const vpath = /^v\d+$/.test(version) ? `${BRAIN}/versions/${version}/techniques.json` : `${BRAIN}/${version}/techniques.json`
  let cards = []
  try { cards = JSON.parse(fs.readFileSync(vpath, 'utf8')).cards ?? [] } catch { console.error(`❌ 卡池不可读: ${vpath}`); process.exit(1) }
  const manifest = manifests.find((m) => m.dir === version) ?? {}
  const picked = sampleCards(cards, { n, seed: `${version}:${new Date().toISOString().slice(0, 10)}` })
  const lines = [
    `# 蒸馏幻觉抽检工作单(${version}, ${new Date().toISOString().slice(0, 10)}, n=${n})`,
    '',
    `> 流程: 逐卡对照来源文档(${(manifest.source_docs ?? []).length} 篇: ${(manifest.source_docs ?? []).slice(0, 6).join(', ')}${(manifest.source_docs ?? []).length > 6 ? ' …' : ''}),`,
    `> 核对 validation_recipe/signals 是否为文中可支撑内容(编造步骤/来源未提 = hallucination; 来源缺失无法核对 = unverifiable)。`,
    `> 结论逐条记账: node scripts/brain/experience-metrics.mjs --record --card <id> --verdict ok|hallucination|unverifiable --note "..."`,
    '',
    ...picked.map((c, i) => `${i + 1}. **${c.id}** ${c.title}\n   - recipe: ${c.recipeHead}${String(c.recipeHead).length >= 160 ? '…' : ''}\n   - refs: ${c.refs.join(' ; ')}\n   - 结论: ______(ok / hallucination / unverifiable)`),
    '',
  ]
  fs.mkdirSync(REPORTS, { recursive: true })
  const out = `${REPORTS}/distill-sampling-${new Date().toISOString().slice(0, 10)}.md`
  fs.writeFileSync(out, lines.join('\n'))
  console.log(`✅ 抽检工作单(${picked.length} 张): ${out}`)
  for (const c of picked) console.log(`   - ${c.id} ${c.title}`)
  process.exit(0)
}

// ---------- --report ----------
const distill = distillQuality({ manifests, transitions: realTransitions, auditEvents: realAudit })
const sampling = samplingStats(samplingRows)
const injectionRows = alignEngagements(memoryStore, runLogs)
const doc = renderMetricsDoc({ distill, sampling, injectionRows })
console.log(doc)
if (!process.argv.includes('--stdout')) {
  fs.mkdirSync(REPORTS, { recursive: true })
  const out = `${REPORTS}/experience-metrics-${new Date().toISOString().slice(0, 10)}.md`
  fs.writeFileSync(out, doc)
  console.log(`\n✅ 报告已写入 ${out}`)
}
