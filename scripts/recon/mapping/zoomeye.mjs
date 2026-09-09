// zoomeye.mjs — ZoomEye 客户端(P1/M1)。端点实证: api.zoomeye.org/v2(search + userinfo),
// knownsec/ZoomEye-python api.md 交叉核对。认证: API-KEY header。pagesize 官方上限 10000。
import { postJson } from './kit.mjs'
import { translateQuery, relaxLadder, searchRelaxed, SEARCH_BUDGET } from './query.mjs'
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

// 蜜罐过滤: ZoomEye 无 is_honeypot/is_fraud 等价公开字段 — 跳过(query.mjs withHoneypotFilter 按平台旁路)
// 单查询串分页拉取(searchRelaxed 的 doSearch 通道); 资产截断到 size*maxPages 预算内
async function searchPage(query, { headers, size, maxPages, fetchImpl, timeoutMs }) {
  const qbase64 = Buffer.from(query).toString('base64')
  const pageSize = Math.min(Math.max(size, 1), 10000)
  const assets = []
  let total = 0
  for (let page = 1; page <= Math.max(1, maxPages); page++) {
    const j = await postJson(`${BASE}/search`, { qbase64, page, pagesize: pageSize, fields: ZOOMEYE_FIELDS, sub_type: 'v4' }, { headers, timeoutMs, fetchImpl })
    total = Number(j.total ?? 0)
    for (const item of j.data ?? []) assets.push(zoomeyeRow(item))
    if (assets.length >= total) break
  }
  return { provider: meta.id, query, total, assets: assets.slice(0, size * Math.max(1, maxPages)) }
}

// → { provider, query, total, assets[], relaxRound?, relaxQueries? }
// 放宽阶梯: DSL 含特征键(title/body/header/framework)时失败/零命中逐级放宽(最多 5 轮, 命中即停);
// 默认 size=SEARCH_BUDGET(50), 调用方以 size 覆盖。
export async function search(dsl, { size = SEARCH_BUDGET, maxPages = 1, env = process.env, fetchImpl = fetch, timeoutMs = 15000, relax = true } = {}) {
  const key = String(env.D2D_ZOOMEYE_KEY ?? '').trim()
  if (!key) throw new Error(`缺 ${meta.envKeys[0]} — ${meta.setup}`)
  const headers = { 'API-KEY': key }
  const rungs = relax ? relaxLadder(dsl, (q) => translateQuery(q, 'zoomeye')) : [translateQuery(dsl, 'zoomeye')]
  return searchRelaxed(rungs, (query) => searchPage(query, { headers, size, maxPages, fetchImpl, timeoutMs }))
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
