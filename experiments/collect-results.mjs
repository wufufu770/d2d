#!/usr/bin/env node
// experiments/collect-results.mjs — 3.5-5b A/B 结果收集(纯编排: 图查询 + run-log 汇总 → markdown 报告)。
//
// 数据源(只读, 零业务改动):
//   · graphd POST /query(仅 http/https): 按 eng 前缀(ab-a- / ab-b-)拉 Finding 明细与 Signal_ 计数;
//     host token 走 P2P_HOST_TOKEN_FILE 环境变量(与宿主 runner 同源, 本脚本不内置任何凭据)。
//   · ${RUNS_BASE}/model-usage.jsonl(scheduler.js:696 终态账本): 按 worker 前缀(worker_id=
//     `<eng>-<ring>-<rand>`, scheduler.js:422)归组汇总 input_tokens/output_tokens 与 ms。
//     token 字段缺省(无 dsh 会话数据)时该列标 n/a 并在报告记录 — 不造假。
//
// 用法: node experiments/collect-results.mjs [--config experiments/config.json]
//   输出: <output_dir>/ab-report-<YYYYMMDD-HHMMSS>.md
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ── 纯函数: Finding 去重与分类(编排层统计, 与图侧 #11 去重门口径同形: category 归一(空≡vuln)+标题归一) ──
export function dedupFindings(rows) {
  const byCat = {}
  const seen = new Set()
  let total = 0
  for (const r of Array.isArray(rows) ? rows : []) {
    total++
    const cat = String(r?.category ?? '').trim().toLowerCase() || 'vuln'
    const key = `${cat}|${String(r?.title ?? '').trim().toLowerCase()}`
    byCat[cat] ??= { total: 0, unique: 0 }
    byCat[cat].total++
    if (!seen.has(key)) { seen.add(key); byCat[cat].unique++ }
  }
  const unique = seen.size
  return { total, unique, dupRate: total ? (total - unique) / total : null, byCategory: byCat }
}

// ── 纯函数: token/耗时汇总(model-usage.jsonl 行数组 → 按 eng 前缀归组; 无 token 数据 → null=n/a) ──
export function sumUsage(usageLines, engPrefix) {
  let inTok = 0, outTok = 0, ms = 0, terminals = 0, tokEvents = 0
  for (const line of Array.isArray(usageLines) ? usageLines : []) {
    if (!String(line?.worker ?? '').startsWith(engPrefix) || line?.event !== 'terminal') continue
    terminals++
    ms += Number(line?.ms) || 0
    if (Number.isFinite(Number(line?.input_tokens)) || Number.isFinite(Number(line?.output_tokens))) {
      tokEvents++
      inTok += Number(line?.input_tokens) || 0
      outTok += Number(line?.output_tokens) || 0
    }
  }
  return { terminals, ms: terminals ? ms : null, inputTokens: tokEvents ? inTok : null, outputTokens: tokEvents ? outTok : null }
}

// ── 纯函数: 均值 ± 95% CI(正态近似); n<3 → n/a(样本不足不做统计推断, 按拍板标 n/a) ──
export function meanCI(nums) {
  const xs = (nums ?? []).filter((x) => Number.isFinite(x))
  const n = xs.length
  if (n < 3) return null
  const mean = xs.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1))
  return { mean, halfWidth: n > 1 ? 1.96 * sd / Math.sqrt(n) : 0, n }
}

const fmtNum = (v, unit = '') => (v == null ? 'n/a' : `${v}${unit}`)
const fmtCI = (ci, unit = '') => (ci ? `${ci.mean.toFixed(1)}±${ci.halfWidth.toFixed(1)}${unit} (n=${ci.n})` : 'n/a(样本不足)')

// ── 纯函数: A/B 报告渲染(每组一行差异对比; 数据缺 → n/a 列) ─────────────────────────
export function renderReport({ groups, generatedAt, configPath = '-', runsDir = '-' }) {
  const g = (k) => groups[k] ?? { findings: [], signals: 0, usage: {}, engPrefix: k === 'a' ? 'ab-a-' : 'ab-b-' }
  const A = dedupFindings(g('a').findings)
  const B = dedupFindings(g('b').findings)
  const UA = sumUsage(g('a').usageLines, 'ab-a-')
  const UB = sumUsage(g('b').usageLines, 'ab-b-')
  const cats = [...new Set([...Object.keys(A.byCategory), ...Object.keys(B.byCategory)])].sort()
  const dup = (x) => (x.dupRate == null ? 'n/a' : `${(x.dupRate * 100).toFixed(0)}%`)
  const lines = [
    `# A/B 对比报告(3.5-5b 脚手架) — ${generatedAt}`,
    '',
    `- 配置: ${configPath}; runs 目录: ${runsDir}`,
    `- A 组=经验蒸馏${g('a').distillOn ? '开' : '关'}+经验注入${g('a').injectOn ? '开' : '关'}(eng 前缀 ab-a-); B 组=蒸馏${g('b').distillOn ? '开' : '关'}+注入${g('b').injectOn ? '开' : '关'}(eng 前缀 ab-b-)`,
    `- 数据源: graphd /query(Finding/Signal_, 按 eng 前缀过滤) + model-usage.jsonl(终态账本, token/耗时)`,
    '',
    '## 汇总对比',
    '',
    '| 指标 | A 组 | B 组 | 差异(A−B) |',
    '|---|---|---|---|',
    `| Finding 总数 | ${A.total} | ${B.total} | ${A.total - B.total} |`,
    `| 去重后 Finding(category+标题) | ${A.unique} | ${B.unique} | ${A.unique - B.unique} |`,
    `| 重复率 | ${dup(A)} | ${dup(B)} | ${A.dupRate != null && B.dupRate != null ? `${((A.dupRate - B.dupRate) * 100).toFixed(0)}pp` : 'n/a'} |`,
    `| Signal_ 数 | ${g('a').signals ?? 0} | ${g('b').signals ?? 0} | ${(g('a').signals ?? 0) - (g('b').signals ?? 0)} |`,
    `| input tokens | ${fmtNum(UA.inputTokens)} | ${fmtNum(UB.inputTokens)} | ${UA.inputTokens != null && UB.inputTokens != null ? UA.inputTokens - UB.inputTokens : 'n/a'} |`,
    `| output tokens | ${fmtNum(UA.outputTokens)} | ${fmtNum(UB.outputTokens)} | ${UA.outputTokens != null && UB.outputTokens != null ? UA.outputTokens - UB.outputTokens : 'n/a'} |`,
    `| 每发现 token 成本(in+out/去重后) | ${A.unique && UA.inputTokens != null ? Math.round((UA.inputTokens + UA.outputTokens) / A.unique) : 'n/a'} | ${B.unique && UB.inputTokens != null ? Math.round((UB.inputTokens + UB.outputTokens) / B.unique) : 'n/a'} | n/a |`,
    `| 累计耗时(ms) | ${fmtNum(UA.ms)} | ${fmtNum(UB.ms)} | ${UA.ms != null && UB.ms != null ? UA.ms - UB.ms : 'n/a'} |`,
    `| 每 run 发现数 95%CI | ${fmtCI(meanCI(perRunCounts(g('a').findings)))} | ${fmtCI(meanCI(perRunCounts(g('b').findings)))} | n/a |`,
    '',
    '## 分类明细(category: 总数/去重后)',
    '',
    ...(cats.length ? cats.map((c) => `- ${c}: A ${A.byCategory[c]?.total ?? 0}/${A.byCategory[c]?.unique ?? 0} — B ${B.byCategory[c]?.total ?? 0}/${B.byCategory[c]?.unique ?? 0}`) : ['- (无 Finding 数据 — 空跑或未收集)']),
    '',
    tokenNote(UA, UB),
    '',
  ]
  return lines.join('\n')
}

function perRunCounts(findings) {
  const per = {}
  for (const r of Array.isArray(findings) ? findings : []) {
    const eng = String(r?.eng ?? '')
    if (eng) per[eng] = (per[eng] ?? 0) + 1
  }
  return Object.values(per)
}

function tokenNote(UA, UB) {
  const missing = []
  if (UA.inputTokens == null) missing.push('A 组')
  if (UB.inputTokens == null) missing.push('B 组')
  return missing.length
    ? `> token 列 n/a 记录: ${missing.join('/')}的 model-usage.jsonl 终态事件无 input_tokens/output_tokens(无 dsh 会话数据时字段缺省, scheduler.js:696 不造假语义) — 本轮 token 效率不可比。`
    : '> token 数据可得性: model-usage.jsonl 终态事件含 input_tokens/output_tokens, 本轮可比。'
}

// ── IO: graphd 只读查询(仅 http/https) ─────────────────────────────────────────
export async function makeGraphQuery(graphdUrl, token = '') {
  const u = new URL(String(graphdUrl))
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error(`graphd 仅允许 http/https(得到 ${u.protocol})`)
  return async (cypher, params = {}) => {
    const res = await fetch(`${u.origin}${u.pathname === '/' ? '' : u.pathname}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Auth': token } : {}) },
      body: JSON.stringify({ cypher, params }),
      signal: AbortSignal.timeout(15000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.ok) throw new Error(`graphd: ${data?.error ?? `http ${res.status}`}`)
    return data.rows ?? []
  }
}

// ── 组收集: findings 明细 + signals 计数 + usage 行(全部可注入 → 测试全 mock) ────
export async function collectGroup(group, cfg, { queryFn, usageLines, log = () => {} }) {
  const engPrefix = `ab-${group}-`
  const findings = await queryFn(
    `MATCH (f:Finding) WHERE f.eng STARTS WITH $p RETURN f.eng AS eng, f.category AS category, f.title AS title, f.severity AS severity, f.gate_status AS gate_status ORDER BY f.eng`,
    { p: engPrefix },
  )
  const sigRows = await queryFn(`MATCH (s:Signal_) WHERE s.eng STARTS WITH $p RETURN count(s) AS c`, { p: engPrefix })
  const gcfg = group === 'a' ? cfg.group_a : cfg.group_b
  const summary = { engPrefix, findings: findings ?? [], signals: Number(sigRows?.[0]?.c) || 0, usageLines: usageLines ?? [], distillOn: Boolean(gcfg?.enable_distill), injectOn: Boolean(gcfg?.enable_injection) }
  log(`[collect-results] 组 ${group}: findings=${summary.findings.length} signals=${summary.signals}`)
  return summary
}

async function main(argv) {
  const ci = argv.indexOf('--config')
  const cfgPath = path.resolve(ci !== -1 ? argv[ci + 1] : path.join(REPO, 'experiments', 'config.json'))
  if (!fs.existsSync(cfgPath)) { console.error(`[collect-results] 配置不存在: ${cfgPath}`); process.exit(2) }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  const outDir = path.resolve(cfg.output_dir || path.join(REPO, 'experiments', 'results'))
  const GRAPHD = process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766'
  const RUNS_DIR = process.env.P2P_RUNS_DIR ?? path.join(process.env.D2D_DATA_DIR ?? path.join(os.homedir(), '.d2d-data'), 'runs')
  const token = (() => { try { return fs.readFileSync(process.env.P2P_HOST_TOKEN_FILE ?? path.join(os.homedir(), '.config', 'd2d', 'host-token'), 'utf8').trim() } catch { return '' } })()

  const queryFn = await makeGraphQuery(GRAPHD, token)
  const usageFile = path.join(RUNS_DIR, 'model-usage.jsonl')
  const usageLines = fs.existsSync(usageFile)
    ? fs.readFileSync(usageFile, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    : []
  console.log(`[collect-results] graphd=${GRAPHD} runs=${RUNS_DIR}(model-usage.jsonl ${usageLines.length} 行)`)
  const groups = { a: await collectGroup('a', cfg, { queryFn, usageLines, log: console.log }), b: await collectGroup('b', cfg, { queryFn, usageLines, log: console.log }) }
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15).replace(/^(\d{8})(\d{6})$/, '$1-$2')
  const md = renderReport({ groups, generatedAt: new Date().toISOString(), configPath: cfgPath, runsDir: RUNS_DIR })
  fs.mkdirSync(outDir, { recursive: true })
  const out = path.join(outDir, `ab-report-${ts}.md`)
  fs.writeFileSync(out, md)
  console.log(`[collect-results] 报告已写: ${out}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main(process.argv.slice(2))
