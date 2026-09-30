// cdp-client.mjs — 浏览器攻击三工具(T2-2b-4-3/4/5)共享底座: cdp-proxy REST 薄封装 + 断言桥。
// 零依赖 native fetch; 断言 DSL 复用 plugin/pentest-dsh/validator.js 的
// parseAssertions/evaluateAssertions(静态 ESM 相对 import — file:// 解析可行性先例
// tests/golden-targets/spa-verify-acceptance.md:36-47)。只 import, 零触碰 validator 本体。
// cdp-proxy REST 契约(scripts/browser/cdp-proxy.mjs:174-297 实读):
//   鉴权 X-Auth(:221, host/worker token 二选一, 401) / /new(:231 POST{url}→{targetId},
//   403=scope 硬拒绝) / /navigate(:246) / /eval(:252 → evalInPage:204-208
//   returnByValue+awaitPromise → {value}) / /fill(:266-274 原生 setter + input/change 事件)
//   / /click(:254-258 → {ok,hit}) / /clickAt(:259) / /targets(:226 GET) / /close(:290)
//   / /health(:214 GET 免鉴权)。错误面: 401 未鉴权 / 403 scope / 404 未知路由 / 502 CDP 连接
//   失败 / 503 chrome 不可用 / 500 执行异常, 体均为 {ok:false,error}。
// 传输纪律: 每调用一请求; 超时用本地计时器自竞(不依赖 fetchImpl 尊重 AbortSignal — 注入 mock
//   时同样生效); 恒返回 {code, data, err} 信封不抛错(code=0 = 传输层失败/超时), 调用方按 code 分支。
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseAssertions, evaluateAssertions, cdpProxyBase, readCdpToken } from '../../plugin/pentest-dsh/validator.js'

export { cdpProxyBase, readCdpToken } // CLI 便利复导出(validator 纯函数, 只读 env)

export const DEFAULT_TIMEOUT_MS = 15_000 // 与 validator CDP_STEP_TIMEOUT_MS 同量级(本地常量, 不 import 私有)

/**
 * cdp-proxy REST 薄封装。body === undefined → GET, 否则 POST(JSON)。
 * 返回 { code, data, err }: code=HTTP 状态(0=传输失败/超时), data=解析后 JSON(解析失败=null),
 * err=传输层错误文案(成功=null)。永不抛错。
 */
export async function cdpFetch(base, token, route, body = undefined, { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = globalThis.fetch } = {}) {
  const b = String(base ?? '').replace(/\/+$/, '')
  const r = String(route ?? '')
  if (!/^https?:\/\//.test(b)) return { code: 0, data: null, err: `cdpFetch: base 必须 http(s)://: ${b.slice(0, 60)}` }
  if (!r.startsWith('/')) return { code: 0, data: null, err: `cdpFetch: route 须以 / 开头: ${r.slice(0, 40)}` }
  const post = body !== undefined
  const headers = { ...(token ? { 'X-Auth': String(token) } : {}) }
  if (post) headers['Content-Type'] = 'application/json'
  let timer
  try {
    const res = await Promise.race([
      fetchImpl(`${b}${r}`, post ? { method: 'POST', headers, body: JSON.stringify(body ?? {}) } : { method: 'GET', headers }),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`cdp-fetch timeout ${timeoutMs}ms: ${r}`)), timeoutMs) }),
    ])
    const data = await res.json().catch(() => null)
    return { code: res.status, data, err: null }
  } catch (e) {
    return { code: 0, data: null, err: String(e?.message ?? e).slice(0, 200) }
  } finally { if (timer) clearTimeout(timer) }
}

/** 信封成功判定: 200 且 data.ok !== false(/click miss 时 data.ok=false → false, 语义正确)。 */
export function isOk(envelope) {
  return Boolean(envelope) && envelope.code === 200 && envelope.data?.ok !== false && !envelope.err
}

/**
 * 断言桥: 把一条 /eval 结果拼成 validator evaluateAssertions 的输入形状并判定。
 *   evalRes: cdpFetch('/eval') 信封({code,data:{value}}) 或 {value} 或裸值;
 *   assertions: 断言 DSL 数组(字符串=子串兼容形态; 对象=status/html_contains/json_path/regex/
 *     selector_exists/selector_value — 语义见 validator.js:638-764);
 *   extras: { navStatus, selectors, log } — status 型走 navStatus(CDP 通道真实状态口径);
 *     selector_* 型走 selectors([{selector,exists,value}] 页内评估)。
 * 返回 { evalOk, value, bodySample, parsed, hit, firstHit, dslMode, hits, misses }。
 */
export function assertEvaluation(evalRes, assertions, extras = {}) {
  let value = evalRes
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    value = value.data?.value !== undefined ? value.data.value : value.value
  }
  const bodySample = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value)
  const parsed = parseAssertions(Array.isArray(assertions) ? assertions : [])
  const verdict = evaluateAssertions({ bodySample }, parsed, { channel: 'cdp', ...extras })
  const env = evalRes && typeof evalRes === 'object' ? evalRes : null
  return { evalOk: isOk(env ?? { code: 200, data: { ok: true } }), value, bodySample, parsed, ...verdict }
}

// 页内 DOM 快照表达式(差异检测用, 审计实证⑤「前后各一条 /eval outerHTML」; 256KB 截断与
// validator CDP_SETTLE_EXPR 的 dom 键同量级)。
export const DOM_SNAPSHOT_EXPR = "String(document.documentElement.outerHTML || '').slice(0, 262144)"

// 页内就绪等待(审计实证⑤前置): /navigate 返回仅代表导航已发起(Page.navigate), 字段枚举/
// 竞态 fetch 前先轮询 readyState(≤6s, 轮询步长 200ms — validator CDP_SETTLE_EXPR 同纪律)。
export const SETTLE_EXPR = `(async () => { /*SETTLE*/
  const t0 = Date.now()
  while (document.readyState !== 'complete' && Date.now() - t0 < 6000) await new Promise((r) => setTimeout(r, 200))
  return JSON.stringify({ ready: document.readyState, url: location.href, title: document.title, ms: Date.now() - t0 })
})()`

// ---- CLI 共享件 ----
export function parseArgs(argv = []) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i] ?? '')
    if (a.startsWith('--')) {
      const k = a.slice(2)
      const v = argv[i + 1]
      if (v === undefined || String(v).startsWith('--')) out[k] = true
      else { out[k] = v; i++ }
    } else out._.push(a)
  }
  return out
}

/** 工具自身审计行落盘 sink(浏览器攻击三工具共用): P2P_ATTACK_AUDIT 显式 > <DATA_DIR>/browser-attack.audit.jsonl。 */
export function fileAuditSink(env = process.env) {
  const file = String(env.P2P_ATTACK_AUDIT ?? '').trim() || `${env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/browser-attack.audit.jsonl`
  return (line) => {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.appendFileSync(file, JSON.stringify({ ts: new Date().toISOString(), ...line }) + '\n')
    } catch { /* 审计落盘失败不翻转结果 */ }
    return file
  }
}
export const noopAudit = () => {}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) {
  console.log('cdp-client.mjs 是共享底座(模块形态): 供 form-fuzzer/logic-tester/race-condition import。')
  console.log(`validator 断言桥已就绪: parseAssertions=${typeof parseAssertions}, evaluateAssertions=${typeof evaluateAssertions}`)
}
