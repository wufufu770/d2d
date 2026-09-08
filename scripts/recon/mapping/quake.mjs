// quake.mjs — Quake 360 客户端(P1/M1)。端点实证: quake.360.net/api/v3(search/quake_service + user/info)。
// 认证: X-QuakeToken header。响应 code=0 为成功; 积分制按返回条数消耗。
import { postJson } from './kit.mjs'
import { translateQuery } from './query.mjs'
import { quakeRow } from './normalize.mjs'

export const meta = {
  id: 'quake',
  name: 'Quake 360',
  envKeys: ['D2D_QUAKE_TOKEN'],
  setup: 'quake.360.net 个人中心复制 token',
  docs: 'https://quake.360.net/api/#/',
}

const BASE = 'https://quake.360.net/api/v3'
export function isConfigured(env = process.env) { return Boolean(String(env.D2D_QUAKE_TOKEN ?? '').trim()) }

// → { provider, query, total, assets[] }
export async function search(dsl, { size = 100, maxPages = 1, env = process.env, fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const token = String(env.D2D_QUAKE_TOKEN ?? '').trim()
  if (!token) throw new Error(`缺 ${meta.envKeys[0]} — ${meta.setup}`)
  const query = translateQuery(dsl, 'quake')
  const headers = { 'X-QuakeToken': token }
  const include = ['ip', 'port', 'hostname', 'service.http.host', 'service.http.title', 'service.http.name', 'service.name', 'service.transport', 'timestamp']
  const assets = []
  let total = 0
  for (let page = 0; page < Math.max(1, maxPages); page++) {
    const start = page * Math.min(Math.max(size, 1), 500)
    const j = await postJson(`${BASE}/search/quake_service`, { query, start, size: Math.min(Math.max(size, 1), 500), ignore_cache: false, include }, { headers, timeoutMs, fetchImpl })
    if (j.code !== 0) throw new Error(`Quake 错误(code=${j.code}): ${j.message ?? 'unknown'}`)
    total = Number(j.meta?.pagination?.total ?? 0)
    for (const item of j.data ?? []) assets.push(quakeRow(item))
    if (assets.length >= total) break
  }
  return { provider: meta.id, query, total, assets }
}

// 配额自省: POST /v3/user/info — 字段随账号类型浮动, 数值型配额字段尽力提取, 其余透传
export async function quota({ env = process.env, fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const token = String(env.D2D_QUAKE_TOKEN ?? '').trim()
  if (!token) return { provider: meta.id, ok: false, reason: '未配置' }
  try {
    const j = await postJson(`${BASE}/user/info`, {}, { headers: { 'X-QuakeToken': token }, timeoutMs, fetchImpl })
    if (j.code !== 0) return { provider: meta.id, ok: false, reason: j.message ?? `code=${j.code}` }
    const d = j.data ?? {}
    const cand = [d.quota, d.points, d.credit, d.monthly_quota].map(Number).find(Number.isFinite)
    return { provider: meta.id, ok: true, remaining: Number.isFinite(cand) ? cand : null, raw: d }
  } catch (e) { return { provider: meta.id, ok: false, reason: e.message } }
}
