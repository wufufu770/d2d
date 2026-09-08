// fofa.mjs — FOFA 客户端(P1/M1)。端点/参数实证: fofa.info/api(search/all + info/my)。
// 认证: key-only(新版); 存量账号补 email(D2D_FOFA_EMAIL, 老 key-only 账号不用配)。
// 限频: 官方 ~1qps — 页间 sleep 由调用方 collect 控, 本模块页间 1.1s 内置。
import { getJson } from './kit.mjs'
import { translateQuery } from './query.mjs'
import { fofaRow, FOFA_FIELDS } from './normalize.mjs'

export const meta = {
  id: 'fofa',
  name: 'FOFA',
  envKeys: ['D2D_FOFA_KEY'],
  optionalEnv: { D2D_FOFA_EMAIL: '存量账号 email(key-only 不需要)' },
  setup: 'fofa.info 个人中心复制 api key',
  docs: 'https://fofa.info/api',
}

const BASE = 'https://fofa.info'
export function isConfigured(env = process.env) { return Boolean(String(env.D2D_FOFA_KEY ?? '').trim()) }

// → { provider, query, total, assets[], note }
export async function search(dsl, { size = 1000, maxPages = 1, env = process.env, fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const key = String(env.D2D_FOFA_KEY ?? '').trim()
  if (!key) throw new Error(`缺 ${meta.envKeys[0]} — ${meta.setup}`)
  const query = translateQuery(dsl, 'fofa')
  const qbase64 = Buffer.from(query).toString('base64')
  const auth = isConfigured(env) && String(env.D2D_FOFA_EMAIL ?? '').trim()
    ? `email=${encodeURIComponent(String(env.D2D_FOFA_EMAIL).trim())}&key=${encodeURIComponent(key)}`
    : `key=${encodeURIComponent(key)}`
  const assets = []
  let total = 0
  for (let page = 1; page <= Math.max(1, maxPages); page++) {
    const url = `${BASE}/api/v1/search/all?${auth}&qbase64=${qbase64}&fields=${FOFA_FIELDS}&page=${page}&size=${Math.min(size, 10000)}`
    const j = await getJson(url, { timeoutMs, fetchImpl })
    if (j.error) throw new Error(`FOFA 错误: ${j.errmsg ?? 'unknown'}`)
    total = Number(j.size ?? 0)
    for (const row of j.results ?? []) assets.push(fofaRow(row))
    if (assets.length >= total) break
    if (page < maxPages) await new Promise((r) => setTimeout(r, 1100)) // ~1qps 限频
  }
  return { provider: meta.id, query, total, assets }
}

// 配额自省: info/my — F 点/会员级(剩余额度语义随账号类型, 透传数值)
export async function quota({ env = process.env, fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const key = String(env.D2D_FOFA_KEY ?? '').trim()
  if (!key) return { provider: meta.id, ok: false, reason: '未配置' }
  try {
    const auth = String(env.D2D_FOFA_EMAIL ?? '').trim()
      ? `email=${encodeURIComponent(String(env.D2D_FOFA_EMAIL).trim())}&key=${encodeURIComponent(key)}`
      : `key=${encodeURIComponent(key)}`
    const j = await getJson(`${BASE}/api/v1/info/my?${auth}`, { timeoutMs, fetchImpl })
    if (j.error) return { provider: meta.id, ok: false, reason: j.errmsg ?? 'unknown' }
    return { provider: meta.id, ok: true, remaining: Number.isFinite(Number(j.fofa_point)) ? Number(j.fofa_point) : null, raw: { isvip: j.isvip, vip_level: j.vip_level } }
  } catch (e) { return { provider: meta.id, ok: false, reason: e.message } }
}
