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
