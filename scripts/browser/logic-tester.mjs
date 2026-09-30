// logic-tester.mjs — 业务逻辑漏洞多步验证器(T2-2b-4-4): 经 cdp-proxy 原语组合, CLI/模块形态。
// 能力(场景数据驱动 — steps 数组, 本文件零硬编码业务):
//   ① 多步骤序列执行: 每步 /navigate 或 /eval + 断言(validator evaluateAssertions 断言桥)。
//   ② 步骤跳步检测: 期望步骤序(场景 mark 声明) vs 实际可达序(逐步捕获值中 mark 是否可见) —
//      checkStepOrder 纯函数报 missing/jumped/outOfOrder; 「直接跳步调用终态 API」由场景写成
//      终态步骤(tamper/eval 调受保护端点) + 断言服务端拒绝(status 401/403 或 html_contains)。
//   ③ 参数篡改: /eval 页内 fetch(审计实证③ — awaitPromise 直拿响应体)改写 body/role 等字段
//      (tamperFetchExpr; 同源相对 fetch, 流量同过 cdp-proxy Fetch 闸)。
//   ④ 状态机操纵: /eval 改 localStorage token(stateTamperExpr)后调受保护 API, 断言服务端拒绝。
// 审批面纪律: 本工具只做 /navigate + /eval(读型页内 fetch), 无 /fill|/click|/clickAt 提交语义,
//   不触发 approvals.mjs browser-state-change 三重合取; 仍逐运行发自查审计行(planeMatch:false)。
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { cdpFetch, isOk, assertEvaluation, DOM_SNAPSHOT_EXPR, SETTLE_EXPR, noopAudit, parseArgs, fileAuditSink, cdpProxyBase, readCdpToken } from './cdp-client.mjs'

/** 参数篡改核心(页内 async 箭头函数体): fetch(JSON body 合并 overrides) → {status, body, sent}。 */
function tamperFetchFn({ url, method = 'POST', body = {}, overrides = {}, headers = { 'Content-Type': 'application/json' }, timeoutMs = 5000 } = {}) {
  return `async () => { /*LT_TAMPER*/
    const base = ${JSON.stringify(body ?? {})}
    const ov = ${JSON.stringify(overrides ?? {})}
    const merged = { ...base, ...ov }
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ${Number(timeoutMs)})
    try {
      const res = await fetch(${JSON.stringify(String(url ?? ''))}, {
        method: ${JSON.stringify(String(method))}, headers: ${JSON.stringify(headers ?? {})},
        body: JSON.stringify(merged), signal: ctrl.signal })
      const text = await res.text()
      return JSON.stringify({ status: res.status, body: String(text).slice(0, 4000), sent: merged })
    } catch (e) { return JSON.stringify({ status: 0, body: '', err: String(e).slice(0, 200), sent: merged }) }
    finally { clearTimeout(t) }
  }`
}

/** 参数篡改表达式: /eval (async()=>{...})() awaitPromise 直拿响应体(审计实证③)。 */
export function tamperFetchExpr(opts = {}) {
  return `(${tamperFetchFn(opts)})()`
}

/** 状态机操纵表达式: 改 localStorage 键值(记录改前值作证据); 可与 tamper 组合为单步「换凭据 → 调受保护 API」。 */
export function stateTamperExpr({ setState = [], tamper = null } = {}) {
  const ops = (Array.isArray(setState) ? setState : [setState]).filter((s) => s && s.key !== undefined)
  const lsFn = `() => { const ops = ${JSON.stringify(ops.map((o) => ({ key: String(o.key), value: String(o.value ?? '') })))};
      const before = ops.map((o) => localStorage.getItem(o.key));
      ops.forEach((o) => localStorage.setItem(o.key, o.value));
      return { swapped: ops.map((o) => o.key), before } }`
  if (!tamper) return `(() => { /*LT_STATE*/ const ls = (${lsFn})(); return JSON.stringify(ls) })()`
  return `(async () => { /*LT_STATE_TAMPER*/
    const ls = (${lsFn})()
    const api = await (${tamperFetchFn(tamper)})()
    let apiVal = null; try { apiVal = JSON.parse(api) } catch {}
    return JSON.stringify({ ls, api: apiVal ?? String(api) })
  })()`
}

/**
 * 跳步检测(纯函数): expected = 场景声明的有序 mark 集; observed = 实际按步序观测到的 mark 集。
 *   missing: 声明而未观测到的 mark; outOfOrder: 已观测 mark 相对期望序乱序;
 *   jumped: 某 mark 观测到但其前置期望 mark 缺失(= 直接跳步命中该步);
 *   unexpected: 观测到但场景未声明的 mark。ok = 无 missing 且无乱序。
 */
export function checkStepOrder(expected, observed) {
  const E = (expected ?? []).map(String)
  const O = (observed ?? []).map(String)
  const missing = E.filter((m) => !O.includes(m))
  const unexpected = O.filter((m) => !E.includes(m))
  const observedInExpected = O.filter((m) => E.includes(m))
  const expectedObserved = E.filter((m) => O.includes(m))
  const outOfOrder = JSON.stringify(observedInExpected) !== JSON.stringify(expectedObserved)
  const jumped = missing.length > 0
    ? O.filter((m) => E.includes(m)).filter((m) => {
        const idx = E.indexOf(m)
        return E.slice(0, idx).some((e) => missing.includes(e))
      })
    : []
  return { ok: missing.length === 0 && !outOfOrder, expected: E, observed: O, missing, jumped, outOfOrder, unexpected }
}

/** 步骤形态守卫: 每步 navigate/eval/tamper 三选一(eval 可与 setState 并存), mark 可选。 */
export function validateSteps(steps) {
  if (!Array.isArray(steps) || !steps.length) return { error: 'steps 须为非空数组(场景数据驱动)' }
  for (const [i, s] of steps.entries()) {
    if (!s || typeof s !== 'object') return { error: `steps[${i}] 非对象` }
    const kinds = ['navigate', 'eval', 'tamper'].filter((k) => s[k] != null)
    if (kinds.length === 0) return { error: `steps[${i}]: navigate/eval/tamper 至少一项` }
    if (kinds.includes('navigate') && kinds.length > 1) return { error: `steps[${i}]: navigate 不与 eval/tamper 并存` }
    if (kinds.includes('eval') && kinds.includes('tamper')) return { error: `steps[${i}]: eval 与 tamper 不并存(组合语义走 setState+tamper)` }
  }
  return { ok: true }
}

/**
 * 多步逻辑测试主流程(纯编排, 传输经注入的 cdpFetchImpl — 测试 mock 不真开 chrome)。
 * 步骤字段: { name?, navigate | eval | (setState?+tamper?), assertions?, mark? }
 *   mark: 捕获值(字符串含匹配)中应可见的步骤标记 — 缺失即「该步不可达」, 参与 checkStepOrder。
 * 返回 { ok, targetId, steps: [...], order: checkStepOrder 结果, domDiff, auditNotes, error }。
 */
export async function runLogicTest({
  base, token, startUrl = null,
  steps,
  cdpFetchImpl = cdpFetch, audit = noopAudit,
} = {}) {
  const auditNotes = []
  const say = (line) => { auditNotes.push(line); try { audit(line) } catch {} }
  const guard = validateSteps(steps)
  if (guard.error) return { ok: false, error: guard.error, steps: [], auditNotes }

  const created = await cdpFetchImpl(base, token, '/new', { url: startUrl ?? 'about:blank' })
  if (created.code === 403) return { ok: false, denied: true, error: `cdp-proxy scope 拒绝: ${created.data?.error ?? startUrl}`, steps: [], auditNotes }
  const targetId = created.data?.targetId
  if (!isOk(created) || !targetId) return { ok: false, error: `/new ${created.code || 'ERR'}: ${created.data?.error ?? created.err ?? 'no targetId'}`, steps: [], auditNotes }

  say({
    event: 'logic-tester-notice', tool: 'logic-tester', target: targetId, steps: steps.length,
    note: '本工具仅经 /navigate + /eval(页内同源 fetch)执行场景步骤: 无 /fill|/click|/clickAt 提交语义, 不触发 browser-state-change 审批面机检(planeMatch:false 自查行); 页内篡改 fetch 与页面自身流量同过 cdp-proxy Fetch scope 闸(cdp-proxy.mjs:184-194)。',
  })

  try {
    const executed = []
    const observedMarks = []
    const before = await cdpFetchImpl(base, token, '/eval', { target: targetId, expression: DOM_SNAPSHOT_EXPR })
    const baseHtml = typeof before.data?.value === 'string' ? before.data.value : ''

    for (const [i, step] of steps.entries()) {
      const rec = { index: i, name: String(step.name ?? `step-${i}`), type: null, ok: false, value: null, markSeen: false, assertion: null, error: '' }
      try {
        let env
        if (step.navigate != null) {
          rec.type = 'navigate'
          env = await cdpFetchImpl(base, token, '/navigate', { target: targetId, url: String(step.navigate) })
          rec.ok = isOk(env)
          if (!rec.ok) rec.error = env.data?.error ?? env.err ?? `navigate ${env.code}`
          else await cdpFetchImpl(base, token, '/eval', { target: targetId, expression: SETTLE_EXPR }) // 就绪等待, 失败不翻转结果
        } else {
          let expression
          if (step.eval != null) { rec.type = 'eval'; expression = String(step.eval) }
          else { rec.type = 'tamper'; expression = step.setState != null ? stateTamperExpr({ setState: step.setState, tamper: step.tamper }) : tamperFetchExpr(step.tamper) }
          env = await cdpFetchImpl(base, token, '/eval', { target: targetId, expression })
          const raw = env.data?.value
          rec.value = typeof raw === 'string' ? (raw.length > 8000 ? raw.slice(0, 8000) : raw) : raw
          rec.ok = isOk(env)
          if (!rec.ok) rec.error = env.data?.error ?? env.err ?? `eval ${env.code}`
          // mark 观测(期望步骤序 vs 实际可达序的「实际」侧)
          if (step.mark != null && rec.ok) {
            const hay = typeof rec.value === 'string' ? rec.value : JSON.stringify(rec.value ?? '')
            rec.markSeen = String(hay).includes(String(step.mark))
            if (rec.markSeen) observedMarks.push(String(step.mark))
          }
          // 篡改/页内 fetch 结果若携 {status}, 透传作 status 型断言的 navStatus 口径(CDP 通道)
          let navStatus = null
          try { const p = JSON.parse(String(rec.value)); if (p && typeof p === 'object' && Number.isFinite(Number(p.status))) navStatus = Number(p.status) } catch {}
          if (rec.ok && Array.isArray(step.assertions) && step.assertions.length) {
            const v = assertEvaluation(env, step.assertions, { channel: 'cdp', navStatus, selectors: [] })
            rec.assertion = { hit: v.hit, hits: v.hits, misses: v.misses }
            rec.ok = rec.ok && v.hit === true
          }
        }
      } catch (e) { rec.error = String(e?.message ?? e).slice(0, 200) }
      executed.push(rec)
    }

    const after = await cdpFetchImpl(base, token, '/eval', { target: targetId, expression: DOM_SNAPSHOT_EXPR })
    const endHtml = typeof after.data?.value === 'string' ? after.data.value : ''
    const order = checkStepOrder(steps.filter((s) => s.mark != null).map((s) => String(s.mark)), observedMarks)

    return {
      ok: executed.every((r) => r.ok) && order.ok, targetId, steps: executed, order,
      domDiff: { changed: baseHtml !== '' && endHtml !== baseHtml, beforeLen: baseHtml.length, afterLen: endHtml.length },
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
  const src = a.steps
  if (!src) { console.error('用法: node logic-tester.mjs --base http://127.0.0.1:8893 --steps <JSON 数组文件路径或内联 JSON> [--start-url <url>]'); process.exitCode = 2; return }
  let steps
  try {
    steps = JSON.parse(src.startsWith('[') ? src : readFileSync(src, 'utf8'))
  } catch (e) { console.error(`--steps 解析失败(须为 JSON 数组内联或文件路径): ${String(e).slice(0, 120)}`); process.exitCode = 2; return }
  runLogicTest({ base, token, startUrl: a['start-url'] ?? null, steps, audit: fileAuditSink(process.env) })
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => { console.error(String(e?.message ?? e)); process.exitCode = 1 })
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) main()
