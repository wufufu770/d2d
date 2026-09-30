// race-condition.mjs — 并发条件(竞态)验证器(T2-2b-4-5): 经 cdp-proxy 原语组合, CLI/模块形态。
// 并发最优解(审计实证④): 单条 /eval 页内 Promise.all(n 路 fetch) — n 个 lane 在同一 JS 回合
//   内同步起跑(同一微任务调度批次, 先于任何 await 恢复), 同源性精度最高; 分多次 /eval 发请求
//   会引入进程间往返抖动, 同时性差一个量级。
// DOM/业务状态差异(审计实证⑤): 前后各一条 /eval outerHTML(或调用方给业务状态 API 表达式)。
// 同时性证据(审计实证⑥): cdp-proxy 对每个过 Fetch 闸的请求落 audit.jsonl(cdp-proxy.mjs:33,189-194)
//   {ts, event:'fetch-allow'|'fetch-deny', url} — n 路并发命中时出现 url 相同且 ts 亚秒相邻的
//   fetch-allow 行, 即代理侧「同时到达」见证; 本工具输出该文件路径常量与解读说明(不代读)。
// 防滥用: n 硬上限 5(runRace 只认 1..5 整数, 超限拒绝); 单次运行仅一轮并发。
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { cdpFetch, isOk, DOM_SNAPSHOT_EXPR, SETTLE_EXPR, noopAudit, parseArgs, fileAuditSink, cdpProxyBase, readCdpToken } from './cdp-client.mjs'

export const MAX_RACE_N = 5

/** n 路并发表达式: 单条 /eval(awaitPromise) 返回 JSON 字符串(lane 结果数组, 带各自耗时)。
 *  注意 awaitPromise 只解包最外层 IIFE — Promise.all 必须在 IIFE 内显式 await 后再 stringify
 *  (直接 JSON.stringify(Promise.all(...)) 会把 pending Promise 序列化成 "{}")。 */
export function raceExpr(evalExpr, n) {
  const expr = String(evalExpr ?? '').trim()
  if (!expr) return ''
  const lanes = Array.from({ length: Math.max(1, Number(n) | 0) }, (_, i) => i)
  return `(async () => { /*RC_RACE*/
    const lane = async (i) => {
      const t0 = Date.now()
      try { const v = await (${expr}); return { i, ms: Date.now() - t0, ok: true, v } }
      catch (e) { return { i, ms: Date.now() - t0, ok: false, err: String(e).slice(0, 200) } }
    }
    const out = await Promise.all([${lanes.join(',')}].map(lane))
    return JSON.stringify(out)
  })()`
}

/** lane 结果聚合(纯函数): 发出/成功/按状态分布/同时性偏斜(max-min 耗时)。 */
export function aggregateRace(lanes) {
  const arr = Array.isArray(lanes) ? lanes : []
  const mss = arr.map((l) => Number(l?.ms)).filter((m) => Number.isFinite(m))
  const statuses = {}
  for (const l of arr) {
    const st = l?.ok && l?.v && typeof l.v === 'object' ? Number(l.v.status) : NaN
    if (Number.isFinite(st)) statuses[String(st)] = (statuses[String(st)] ?? 0) + 1
  }
  return {
    sent: arr.length,
    okCount: arr.filter((l) => l?.ok).length,
    errCount: arr.filter((l) => !l?.ok).length,
    statuses,
    maxSkewMs: mss.length ? Math.max(...mss) - Math.min(...mss) : null,
  }
}

/** cdp-proxy 审计文件路径常量(cdp-proxy.mjs:31-33: D2D_DATA_DIR ?? ~/.d2d-data → evidence/cdp/audit.jsonl)。 */
export function auditLogPath(env = process.env) {
  const dataDir = String(env.D2D_DATA_DIR ?? '') || `${os.homedir()}/.d2d-data`
  return `${dataDir}/evidence/cdp/audit.jsonl`
}
export const AUDIT_EVIDENCE_HINT =
  'cdp-proxy 对每个过 Fetch 闸的请求落一行 {ts, event:"fetch-allow"|"fetch-deny", url}(cdp-proxy.mjs:189-194)。'
  + 'n 路并发同时到达的证据 = audit.jsonl 中 url 同端点且 ts 亚秒相邻的 fetch-allow 相邻行;'
  + '用 grep 端点子串后看相邻行 ts 差(应 << 两次独立 /eval 的往返抖动)。本工具只引用不代读。'

/**
 * 竞态验证主流程(纯编排, 传输经注入的 cdpFetchImpl — 测试 mock 不真开 chrome)。
 *   evalExpr: 单 lane 请求表达式(如 "(async()=>{const r=await fetch('/api/coupon',{method:'POST'});return {status:r.status, body:(await r.text()).slice(0,500)}})()")
 *   beforeExpr/afterExpr: 缺省 outerHTML 快照; 业务状态可传页内 fetch 状态 API 表达式。
 * 返回 { ok, n, lanes, aggregate, diff, evidence, auditNotes, error }。
 */
export async function runRace({
  base, token, url, evalExpr,
  n = 3, beforeExpr = null, afterExpr = null,
  cdpFetchImpl = cdpFetch, audit = noopAudit,
} = {}) {
  const auditNotes = []
  const say = (line) => { auditNotes.push(line); try { audit(line) } catch {} }
  const nn = Number(n)
  if (!Number.isInteger(nn) || nn < 1 || nn > MAX_RACE_N) {
    return { ok: false, error: `n 须为 1..${MAX_RACE_N} 整数(防滥用硬上限), 实得: ${n}`, lanes: [], auditNotes }
  }
  if (!String(evalExpr ?? '').trim()) return { ok: false, error: 'evalExpr 缺失 — 单 lane 请求表达式(页内 fetch 形态)', lanes: [], auditNotes }

  // 流程: /new(about:blank) → /navigate(目标) → settle 等就绪 → before 快照 → 单条 /eval 并发 → after 快照
  const created = await cdpFetchImpl(base, token, '/new', { url: 'about:blank' })
  if (created.code === 403) return { ok: false, denied: true, error: `cdp-proxy scope 拒绝: ${created.data?.error ?? url}`, lanes: [], auditNotes }
  const targetId = created.data?.targetId
  if (!isOk(created) || !targetId) return { ok: false, error: `/new ${created.code || 'ERR'}: ${created.data?.error ?? created.err ?? 'no targetId'}`, lanes: [], auditNotes }

  try {
    const nav = await cdpFetchImpl(base, token, '/navigate', { target: targetId, url })
    if (!isOk(nav)) return { ok: false, targetId, error: `/navigate: ${nav.data?.error ?? nav.err ?? nav.code}`, lanes: [], auditNotes }
    await cdpFetchImpl(base, token, '/eval', { target: targetId, expression: SETTLE_EXPR })

    const bExpr = beforeExpr ?? DOM_SNAPSHOT_EXPR
    const aExpr = afterExpr ?? beforeExpr ?? DOM_SNAPSHOT_EXPR
    const before = await cdpFetchImpl(base, token, '/eval', { target: targetId, expression: bExpr })

    const race = await cdpFetchImpl(base, token, '/eval', { target: targetId, expression: raceExpr(evalExpr, nn) })
    let lanes = []
    if (typeof race.data?.value === 'string') { try { lanes = JSON.parse(race.data.value) } catch { lanes = [] } }
    else if (Array.isArray(race.data?.value)) lanes = race.data.value
    if (!Array.isArray(lanes) || !lanes.length) {
      return { ok: false, targetId, error: `race eval 无结果: ${String(race.data?.error ?? race.err ?? 'value 空').slice(0, 120)}`, lanes: [], auditNotes }
    }

    const after = await cdpFetchImpl(base, token, '/eval', { target: targetId, expression: aExpr })
    const bVal = typeof before.data?.value === 'string' ? before.data.value : JSON.stringify(before.data?.value ?? '')
    const aVal = typeof after.data?.value === 'string' ? after.data.value : JSON.stringify(after.data?.value ?? '')

    say({
      event: 'race-condition', tool: 'race-condition', target: targetId, n: nn,
      note: `并发仅一轮、n≤${MAX_RACE_N} 硬上限(防滥用); 同时性证据: ${auditLogPath(process.env)} 的 fetch-allow 相邻行(url 同端点, ts 亚秒同簇)。`,
    })

    return {
      ok: lanes.every((l) => l?.ok), targetId, n: nn, lanes,
      aggregate: aggregateRace(lanes),
      diff: { changed: bVal !== aVal, beforeLen: bVal.length, afterLen: aVal.length, beforeExpr: bExpr.slice(0, 120), afterExpr: aExpr.slice(0, 120) },
      evidence: { path: auditLogPath(process.env), hint: AUDIT_EVIDENCE_HINT },
      auditNotes,
    }
  } finally {
    await cdpFetchImpl(base, token, '/close', { target: targetId }).catch(() => {})
  }
}

// ---- CLI ----
function main() {
  const a = parseArgs(process.argv.slice(2))
  const base = a.base || cdpProxyBase(process.env)
  const token = a.token || readCdpToken(process.env)
  if (!a.url || !a.eval) {
    console.error('用法: node race-condition.mjs --base http://127.0.0.1:8893 --url <scope 内目标> --n 3 --eval "(async()=>{const r=await fetch(\'/api/x\',{method:\'POST\'});return {status:r.status, body:(await r.text()).slice(0,500)}})()" [--before-expr <js>] [--after-expr <js>]')
    process.exitCode = 2
    return
  }
  runRace({
    base, token, url: a.url, evalExpr: a.eval, n: Number(a.n ?? 3),
    beforeExpr: a['before-expr'] ?? null, afterExpr: a['after-expr'] ?? null,
    audit: fileAuditSink(process.env),
  }).then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => { console.error(String(e?.message ?? e)); process.exitCode = 1 })
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) main()
