// kit.mjs — 测绘客户端共用件(P1/M1): https-only 断言 + JSON fetch 超时封装。
// 出站安全(Mimosa 约束): 平台 host 是模块内常量, 请求前断言 https + 非回环/私有;
// 凭据只从 env 读, 永不写入 URL 日志头之外的位置(错误消息不含 key)。
import { isIP } from 'node:net'

const PRIVATE_RE = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|f[cd][0-9a-f]{2}:)/i

export function assertHttpsHost(raw) {
  let u
  try { u = new URL(String(raw)) } catch { throw new Error(`非法 URL: ${String(raw).slice(0, 80)}`) }
  if (u.protocol !== 'https:') throw new Error(`测绘出站仅允许 https: ${u.protocol}`)
  const h = u.hostname
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
    throw new Error(`测绘出站禁止本地域名: ${h}`)
  }
  if (isIP(h.replace(/^\[|\]$/g, '')) && PRIVATE_RE.test(h)) throw new Error(`测绘出站禁止私有/保留地址: ${h}`)
  return u
}

export async function getJson(url, { headers = {}, timeoutMs = 15000, fetchImpl = fetch } = {}) {
  assertHttpsHost(url)
  const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`http ${res.status}: ${strErr(body)}`)
  return body
}

export async function postJson(url, body, { headers = {}, timeoutMs = 15000, fetchImpl = fetch } = {}) {
  assertHttpsHost(url)
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`http ${res.status}: ${strErr(payload)}`)
  return payload
}

const strErr = (j) => String(j?.message ?? j?.errmsg ?? j?.error ?? '').slice(0, 120) || '无错误详情'

// ---- probeBatch — 测绘资产轻量存活批探测(P2 测绘放宽配套): 并发 5、单请求超时 3000ms、
// GET 首页(无路径归一到 /, 30x 跟随), 失败不抛出只记 status:null。与 recon/probe.mjs 的
// probeHosts(双协议试探+证据采集/favicon, 指纹面)互补不重复 — 本函数只做测绘结果集的批量
// 存活复核: 每目标一次 GET, 不采 body/favicon。入参 target 可带 scheme; 无 scheme 默认 http://
// (30x 跟随可达 https)。返回 Map(原始 target → {url, status, ok, error?})。
export const PROBE_BATCH_CONCURRENCY = 5
export const PROBE_BATCH_TIMEOUT_MS = 3000

export async function probeBatch(targets, { concurrency = PROBE_BATCH_CONCURRENCY, timeoutMs = PROBE_BATCH_TIMEOUT_MS, fetchImpl = fetch } = {}) {
  const list = [...new Set((targets ?? []).map((t) => String(t ?? '').trim()).filter(Boolean))]
  const results = new Map()
  const probeOne = async (raw) => {
    const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`
    let home = null
    try { const u = new URL(url); home = `${u.protocol}//${u.host}/` } catch { /* 记失败 */ }
    if (!home) { results.set(raw, { url: raw, status: null, ok: false, error: '非法目标' }); return }
    try {
      const res = await fetchImpl(home, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })
      results.set(raw, { url: home, status: res.status, ok: Boolean(res.ok) })
    } catch (e) {
      results.set(raw, { url: home, status: null, ok: false, error: String(e?.message ?? e).slice(0, 120) })
    }
  }
  const queue = [...list]
  async function worker() {
    for (;;) {
      const t = queue.shift()
      if (t === undefined) return
      await probeOne(t)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, worker))
  return results
}
