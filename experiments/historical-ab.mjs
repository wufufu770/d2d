#!/usr/bin/env node
// experiments/historical-ab.mjs — 历史场 A/B 对比(T2-1-4, 只读编排: 不跑新 engagement)。
//
// 对比对象(任务给定, 历史已冻结场, 本脚本零派发零写图):
//   · A 组 = engagement-A(形式化, 运行时字面量见 L31)(T1.8.1, 任务口径五旋钮全开; 开场时池内可注入历史经验 6 条 —
//     实测 Experience 全量 9 条中 3 条 created_at 晚于 A 场开始, 属 A 场自身蒸馏产出)
//   · B 组 = engagement-B(形式化, 运行时字面量见 L32)(T1.6.1, 开场时池内可注入经验 0 条)
//
// 数据源(全部只读):
//   · graphd POST /query(仅 http/https, X-Auth 走 P2P_HOST_TOKEN_FILE/默认 ~/.config/d2d/host-token):
//     Finding 明细(含 gate_status)/Signal_ 计数/Hypothesis 计数, cypher 全参数绑定。
//   · token 历史回溯: ./token-usage.mjs(backtrackEngTokens — model-usage.jsonl 按 worker 前缀分组
//     → ~/.dsh/sessions 会话文件 v3+旧名候选 → unzstd 只计 assistant/message 行 usage)。
//   · 重复率: ./collect-results.mjs dedupFindings 口径(category 归一(空≡vuln)+标题小写)原样复用。
//   · CNSR: ./cnsr.mjs computeCnsr — verified findings ÷ 总 token × 1e6; token 缺 → n/a 不造假。
//
// 用法: node experiments/historical-ab.mjs [--a <eng名>] [--b <eng名>]
//   输出: experiments/results/ab-report-<YYYYMMDD-HHMMSS>.md
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dedupFindings } from './collect-results.mjs'
import { computeCnsr, formatCnsr } from './cnsr.mjs'
import { backtrackEngTokens } from './token-usage.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ── 对比场元数据(框架版本/旋钮口径为任务给定; 经验存量/图计数/token 均为本脚本实测) ──
export const GROUPS_DEFAULT = {
  a: { eng: 'eng-0928-2340-127-1l', label: 'A 组', framework: 'T1.8.1', knobs: '五旋钮全开(任务口径), P2P_DISTILL_LLM=on' },
  b: { eng: 'eng-0928-0850-127-jl', label: 'B 组', framework: 'T1.6.1', knobs: '无可注入经验, P2P_DISTILL_LLM=on' },
}

// ── 组收集: 图计数 + Finding 明细 + token 回溯 + CNSR(queryFn/账本/会话目录全注入 → 测试全 mock) ──
export async function collectEngGroup(meta, { queryFn, ledgerLines, sessionsDir, log = () => {} }) {
  const eng = meta.eng
  const findings = await queryFn(
    `MATCH (f:Finding) WHERE f.eng = $e RETURN f.title AS title, f.category AS category, f.gate_status AS gate_status ORDER BY f.title`,
    { e: eng },
  )
  const rows = Array.isArray(findings) ? findings : []
  const verified = rows.filter((r) => String(r?.gate_status ?? '') === 'verified').length
  const sigRows = await queryFn(`MATCH (s:Signal_) WHERE s.eng = $e RETURN count(s) AS c`, { e: eng })
  const hypRows = await queryFn(`MATCH (h:Hypothesis) WHERE h.eng = $e RETURN count(h) AS c`, { e: eng })
  const tokens = backtrackEngTokens({ eng, ledgerLines, sessionsDir })
  const cnsr = computeCnsr({ verifiedFindings: verified, inputTokens: tokens.inputTokens, outputTokens: tokens.outputTokens })
  const summary = {
    ...meta,
    eng,
    findings: rows,
    dedup: dedupFindings(rows),
    verified,
    signals: Number(sigRows?.[0]?.c) || 0,
    hypotheses: Number(hypRows?.[0]?.c) || 0,
    tokens,
    cnsr,
  }
  log(`[historical-ab] ${meta.label}(${eng}): findings=${rows.length} verified=${verified} signals=${summary.signals} tokens=${tokens.degraded ? 'n/a(降级)' : `${tokens.inputTokens}+${tokens.outputTokens}`}`)
  return summary
}

const fmt = (v) => (v == null ? 'n/a' : String(v))
const dup = (d) => (d.dupRate == null ? 'n/a' : `${(d.dupRate * 100).toFixed(0)}%`)

// 每 verified 消耗(万 token): tokensTotal/verified/1e4; verified=0 或 token 缺 → n/a
function tokPerVerified(tokens, verified) {
  if (tokens.degraded || (!tokens.inputTokens && !tokens.outputTokens) || !verified) return null
  return Math.round((tokens.inputTokens + tokens.outputTokens) / verified / 1e4 * 10) / 10
}

// ── 报告渲染: A vs B 汇总 + 口径局限 + 回溯明细 + v3 修复前瞻(纯函数, 全注入) ──────────────
export function renderHistoricalReport({ groups, generatedAt, graphd = '-', ledgerPath = '-', sessionsDir = '-', experienceStock = null }) {
  const A = groups.a
  const B = groups.b
  const lines = [
    `# 历史场 A/B 对比报告(T2-1-4) — ${generatedAt}`,
    '',
    `- 数据源: graphd ${graphd} /query(Finding/Signal_/Hypothesis, 按 eng 精确匹配, 参数绑定) + token 历史回溯(${ledgerPath}) + dsh 会话文件(${sessionsDir})`,
    `- A 组=${A.eng}(${A.framework}, ${A.knobs}); B 组=${B.eng}(${B.framework}, ${B.knobs})`,
    '- 本报告只读历史场, 未跑任何新 engagement、未写图。',
    '',
    '## 汇总对比',
    '',
    '| 指标 | A 组 | B 组 | 差异(A−B) |',
    '|---|---|---|---|',
    `| Finding 总数 | ${A.dedup.total} | ${B.dedup.total} | ${A.dedup.total - B.dedup.total} |`,
    `| 去重后 Finding(category+标题) | ${A.dedup.unique} | ${B.dedup.unique} | ${A.dedup.unique - B.dedup.unique} |`,
    `| 重复率 | ${dup(A.dedup)} | ${dup(B.dedup)} | ${A.dedup.dupRate != null && B.dedup.dupRate != null ? `${((A.dedup.dupRate - B.dedup.dupRate) * 100).toFixed(0)}pp` : 'n/a'} |`,
    `| verified Finding | ${A.verified} | ${B.verified} | ${A.verified - B.verified} |`,
    `| Signal_ 数 | ${A.signals} | ${B.signals} | ${A.signals - B.signals} |`,
    `| Hypothesis 数 | ${A.hypotheses} | ${B.hypotheses} | ${A.hypotheses - B.hypotheses} |`,
    `| input tokens(回溯) | ${fmt(A.tokens.degraded ? null : A.tokens.inputTokens)} | ${fmt(B.tokens.degraded ? null : B.tokens.inputTokens)} | ${!A.tokens.degraded && !B.tokens.degraded ? A.tokens.inputTokens - B.tokens.inputTokens : 'n/a'} |`,
    `| output tokens(回溯) | ${fmt(A.tokens.degraded ? null : A.tokens.outputTokens)} | ${fmt(B.tokens.degraded ? null : B.tokens.outputTokens)} | ${!A.tokens.degraded && !B.tokens.degraded ? A.tokens.outputTokens - B.tokens.outputTokens : 'n/a'} |`,
    `| token 总计(in+out) | ${fmt(A.tokens.degraded ? null : A.tokens.inputTokens + A.tokens.outputTokens)} | ${fmt(B.tokens.degraded ? null : B.tokens.inputTokens + B.tokens.outputTokens)} | ${!A.tokens.degraded && !B.tokens.degraded ? (A.tokens.inputTokens + A.tokens.outputTokens) - (B.tokens.inputTokens + B.tokens.outputTokens) : 'n/a'} |`,
    `| 每 verified 消耗(万 token) | ${fmt(tokPerVerified(A.tokens, A.verified))} | ${fmt(tokPerVerified(B.tokens, B.verified))} | n/a |`,
    `| CNSR(verified/百万 token) | ${formatCnsr(A.cnsr)} | ${formatCnsr(B.cnsr)} | n/a |`,
    '',
    tokenBacktrackNote(A, B),
    '',
    '## 口径局限(必读 — 本对比不是严格 A/B)',
    '',
    '- **非严格 A/B**: 两场均 `P2P_DISTILL_LLM=on`(蒸馏未关), 差异变量是「开场时池内可注入经验存量」(A=6 条 / B=0 条)而非注入开关通断; 同时框架版本不同(A=T1.8.1, B=T1.6.1, 任务口径 A 为五旋钮全开)。版本与经验存量两个变量未分离, 差异不能归因单因素。',
    `- **经验存量实测口径**: graphd Experience 全量 ${experienceStock?.total ?? 'n/a'} 条; created_at 晚于 A 场开始的有 ${experienceStock?.afterA ?? 'n/a'} 条(A 场自身蒸馏产出), 先于 A 场的 ${experienceStock?.beforeA ?? 'n/a'} 条; 先于 B 场的 ${experienceStock?.beforeB ?? 'n/a'} 条。created_at 字段两种格式(Experience "YYYY-MM-DD HH:MM:SS" / Engagement ISO+Z)按 Date 解析对比, 时区口径未独立标定, 存量数为近似实证。`,
    `- **单样本**: 每侧 1 个 engagement, 无重复 run, 不做统计推断(不报置信区间 — collect-results.mjs meanCI 的 n<3 → n/a 口径)。`,
    `- **B 组零 Finding**: B 场图上 Finding 计数为 0(80 条 Signal_ 无一升级入库), verified=0 → CNSR=0.00 为真实计算值(0 verified ÷ 实测 token), 不是缺数。`,
    '- **token 口径**: 会话文件 assistant/message 行 `data.usage` 增量累计(同 workers.mjs readSessionTokens 口径, chunk/attempt 副本不双计); 回溯器与账本终态写入同源, 但账本历史上 0 条带值(见下节), 本报告 token 全部来自会话文件实证。',
    '',
    '## token 回溯明细',
    '',
    ...['a', 'b'].flatMap((k) => {
      const g = groups[k]
      return [
        `- **${g.label}(${g.eng})**: ledger worker=${g.tokens.workers}, 会话文件命中=${g.tokens.sessionsFound}, 未命中=${g.tokens.missing.length}, 降级=${g.tokens.degraded ? '是(token 列 n/a)' : '否'} — ${g.tokens.reason}`,
      ]
    }),
    '',
    '## workers.mjs v3 修复(前瞻)',
    '',
    '- 根因: `plugin/pentest-dsh/scheduler/workers.mjs` readSessionTokens 只找旧名 `session.jsonl.zstd`, 而 dsh v3 会话写 `session.v3.jsonl.zstd`(实测 sessions 目录旧名 1898 / v3 名 1382, 新旧可共存于同一 `session-*` 子目录)→ 账本 terminal 行 0 条带 token。',
    '- 本批修复: 文件名候选改为两名任一存在即读(同子目录 v3 优先, 旧名兼容)。此后新 run 的账本终态将自带 `input_tokens/output_tokens`, token 记账回归实时, 不再依赖本脚本这类事后回溯。',
    '- CNSR 前瞻: 账本落数后, CNSR 可由 collect-results.mjs 一类收集器直接消费 `input_tokens/output_tokens` 现算, 历史回溯器(token-usage.mjs)仅用于补历史场。',
    '',
    ...((A.findings.length
      ? [`## A 组 Finding 明细(${A.findings.length} 条)`, '', '| title | category | gate_status |', '|---|---|---|', ...A.findings.map((f) => `| ${String(f.title ?? '').replace(/\|/g, '\\|')} | ${f.category || 'vuln'} | ${f.gate_status ?? '-'} |`), '']
      : [])),
  ]
  return lines.join('\n')
}

function tokenBacktrackNote(A, B) {
  const degraded = [A, B].filter((g) => g.tokens.degraded)
  if (degraded.length) {
    return `> token 回溯降级记录: ${degraded.map((g) => g.label).join('/')}未找到任何 worker 会话文件(缺 session 映射或已清理) — token/CNSR 列按 n/a 口径处理, 不造假。`
  }
  const partial = [A, B].filter((g) => g.tokens.missing.length)
  return `> token 数据可得性: 两组均由会话文件回溯实证(A ${A.tokens.workers} worker/${A.tokens.sessionsFound} 会话, B ${B.tokens.workers} worker/${B.tokens.sessionsFound} 会话, 未命中 ${A.tokens.missing.length + B.tokens.missing.length})${partial.length ? '; 部分缺失见明细节' : ', 无降级'}。`
}

// ── IO: graphd 只读查询(仅 http/https, 与 collect-results.mjs makeGraphQuery 同形态) ──
export async function makeGraphQuery(graphdUrl, token = '') {
  const u = new URL(String(graphdUrl))
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error(`graphd 仅允许 http/https(得到 ${u.protocol})`)
  return async (cypher, params = {}) => {
    const res = await fetch(`${u.origin}/query`, {
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

async function main(argv) {
  const argOf = (name, def) => { const i = argv.indexOf(name); return i !== -1 && argv[i + 1] ? argv[i + 1] : def }
  const groupsMeta = {
    a: { ...GROUPS_DEFAULT.a, eng: argOf('--a', GROUPS_DEFAULT.a.eng) },
    b: { ...GROUPS_DEFAULT.b, eng: argOf('--b', GROUPS_DEFAULT.b.eng) },
  }
  const GRAPHD = process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766'
  const RUNS_DIR = process.env.P2P_RUNS_DIR ?? path.join(process.env.D2D_DATA_DIR ?? path.join(os.homedir(), '.d2d-data'), 'runs')
  const SESSIONS = process.env.P2P_SESSIONS_DIR ?? path.join(os.homedir(), '.dsh', 'sessions')
  const token = (() => { try { return fs.readFileSync(process.env.P2P_HOST_TOKEN_FILE ?? path.join(os.homedir(), '.config', 'd2d', 'host-token'), 'utf8').trim() } catch { return '' } })()
  const ledgerFile = path.join(RUNS_DIR, 'model-usage.jsonl')
  const ledgerLines = fs.existsSync(ledgerFile)
    ? fs.readFileSync(ledgerFile, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    : []
  console.log(`[historical-ab] graphd=${GRAPHD} ledger=${ledgerFile}(${ledgerLines.length} 行) sessions=${SESSIONS}`)

  const queryFn = await makeGraphQuery(GRAPHD, token)
  const groups = { a: await collectEngGroup(groupsMeta.a, { queryFn, ledgerLines, sessionsDir: SESSIONS, log: console.log }), b: await collectEngGroup(groupsMeta.b, { queryFn, ledgerLines, sessionsDir: SESSIONS, log: console.log }) }

  // 经验池存量(只读): 全量 Experience created_at + 两场开始时间
  let experienceStock = null
  try {
    const expRows = await queryFn(`MATCH (x:Experience) RETURN x.created_at AS created_at`, {})
    const engRows = await queryFn(`MATCH (e:Engagement) WHERE e.name IN [$a, $b] RETURN e.name AS name, e.created_at AS created`, { a: groupsMeta.a.eng, b: groupsMeta.b.eng })
    const createdA = engRows.find((r) => r.name === groupsMeta.a.eng)?.created
    const createdB = engRows.find((r) => r.name === groupsMeta.b.eng)?.created
    const parse = (s) => { const ms = Date.parse(String(s ?? '').replace(' ', 'T') + (/Z|[+]\d\d:?\d\d$/.test(String(s ?? '')) ? '' : 'Z')); return Number.isFinite(ms) ? ms : null }
    const tA = parse(createdA); const tB = parse(createdB)
    const ts = expRows.map((r) => parse(r.created_at)).filter((x) => x != null)
    experienceStock = { total: expRows.length, beforeA: Number.isFinite(tA) ? ts.filter((x) => x < tA).length : null, afterA: Number.isFinite(tA) ? ts.filter((x) => x >= tA).length : null, beforeB: Number.isFinite(tB) ? ts.filter((x) => x < tB).length : null }
  } catch (e) { console.error(`[historical-ab] 经验池存量查询失败(报告标 n/a): ${e?.message ?? e}`) }

  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14).replace(/^(\d{8})(\d{6})$/, '$1-$2')
  const md = renderHistoricalReport({ groups, generatedAt: new Date().toISOString(), graphd: GRAPHD, ledgerPath: ledgerFile, sessionsDir: SESSIONS, experienceStock })
  const outDir = path.join(REPO, 'experiments', 'results')
  fs.mkdirSync(outDir, { recursive: true })
  const out = path.join(outDir, `ab-report-${ts}.md`)
  fs.writeFileSync(out, md)
  console.log(`[historical-ab] 报告已写: ${out}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main(process.argv.slice(2))
