// hunter.mjs — 鹰图 Hunter 客户端(P1/M1)。端点实证: hunter.qianxin.com/openApi/search。
// 认证: api-key query 参数。配额: 按返回条数扣积分(1 条≈1 分), 响应 data.rest_quota 带剩余;
// 只查数量用 page_size=1 省分 — check.mjs 走这条通道。
import { getJson } from './kit.mjs'
import { translateQuery } from './query.mjs'
import { hunterRow } from './normalize.mjs'

export const meta = {
  id: 'hunter',
  name: '鹰图 Hunter',
  envKeys: ['D2D_HUNTER_KEY'],
  setup: 'hunter.qianxin.com 个人中心复制 api-key',
  docs: 'https://hunter.qianxin.com/home/helpCenter',
}

const BASE = 'https://hunter.qianxin.com/openApi/search'
export function isConfigured(env = process.env) { return Boolean(String(env.D2D_HUNTER_KEY ?? '').trim()) }

// → { provider, query, total, assets[], quota:{remaining} }
export async function search(dsl, { size = 100, maxPages = 1, env = process.env, fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const key = String(env.D2D_HUNTER_KEY ?? '').trim()
  if (!key) throw new Error(`缺 ${meta.envKeys[0]} — ${meta.setup}`)
  const query = translateQuery(dsl, 'hunter')
  const search = Buffer.from(query).toString('base64')
  const pageSize = Math.min(Math.max(size, 1), 500)
  const assets = []
  let total = 0
  let remaining = null
  for (let page = 1; page <= Math.max(1, maxPages); page++) {
    const url = `${BASE}?api-key=${encodeURIComponent(key)}&search=${encodeURIComponent(search)}&page=${page}&page_size=${pageSize}&is_web=0`
    const j = await getJson(url, { timeoutMs, fetchImpl })
    if (j.code !== 200 && j.code !== 0) throw new Error(`鹰图错误(code=${j.code}): ${j.message ?? 'unknown'}`)
    total = Number(j.data?.total ?? 0)
    if (Number.isFinite(Number(j.data?.rest_quota))) remaining = Number(j.data.rest_quota)
    for (const item of j.data?.arr ?? []) assets.push(hunterRow(item))
    if (assets.length >= total) break
  }
  return { provider: meta.id, query, total, assets, quota: { remaining } }
}

// 鹰图无独立配额端点(rest_quota 只随 search 返回) — 探活即配额来源, quota() 返回指引
export async function quota(_opts = {}) {
  return { provider: meta.id, ok: true, remaining: null, raw: { note: 'rest_quota 随 search 响应返回' } }
}
