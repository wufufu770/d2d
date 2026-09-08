// zoomeye.mjs — ZoomEye 客户端(P1/M1)。端点实证: api.zoomeye.org/v2(search + userinfo),
// knownsec/ZoomEye-python api.md 交叉核对。认证: API-KEY header。pagesize 官方上限 10000。
import { postJson } from './kit.mjs'
import { translateQuery } from './query.mjs'
import { zoomeyeRow, ZOOMEYE_FIELDS } from './normalize.mjs'

export const meta = {
  id: 'zoomeye',
  name: 'ZoomEye',
  envKeys: ['D2D_ZOOMEYE_KEY'],
  setup: 'www.zoomeye.org/profile 生成 API-KEY',
  docs: 'https://www.zoomeye.ai/doc',
}

const BASE = 'https://api.zoomeye.org/v2'
export function isConfigured(env = process.env) { return Boolean(String(env.D2D_ZOOMEYE_KEY ?? '').trim()) }

// → { provider, query, total, assets[] }
export async function search(dsl, { size = 100, maxPages = 1, env = process.env, fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const key = String(env.D2D_ZOOMEYE_KEY ?? '').trim()
  if (!key) throw new Error(`缺 ${meta.envKeys[0]} — ${meta.setup}`)
  const query = translateQuery(dsl, 'zoomeye')
  const qbase64 = Buffer.from(query).toString('base64')
  const headers = { 'API-KEY': key }
  const pageSize = Math.min(Math.max(size, 1), 10000)
  const assets = []
  let total = 0
  for (let page = 1; page <= Math.max(1, maxPages); page++) {
    const j = await postJson(`${BASE}/search`, { qbase64, page, pagesize: pageSize, fields: ZOOMEYE_FIELDS, sub_type: 'v4' }, { headers, timeoutMs, fetchImpl })
    total = Number(j.total ?? 0)
    for (const item of j.data ?? []) assets.push(zoomeyeRow(item))
    if (assets.length >= total) break
  }
  return { provider: meta.id, query, total, assets }
}

// 配额自省: POST /v2/userinfo — points(普通积分) / zoomeye_points(权益积分) / subscription.plan
export async function quota({ env = process.env, fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const key = String(env.D2D_ZOOMEYE_KEY ?? '').trim()
  if (!key) return { provider: meta.id, ok: false, reason: '未配置' }
  try {
    const j = await postJson(`${BASE}/userinfo`, {}, { headers: { 'API-KEY': key }, timeoutMs, fetchImpl })
    const p = j.points ?? {}
    const cand = [p.vip_points, p.zoomeye_points, p.points].map(Number).find(Number.isFinite)
    return {
      provider: meta.id,
      ok: true,
      remaining: Number.isFinite(cand) ? cand : null,
      raw: { plan: j.subscription?.plan, points: j.points },
    }
  } catch (e) { return { provider: meta.id, ok: false, reason: e.message } }
}
