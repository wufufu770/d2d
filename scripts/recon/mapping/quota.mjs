// quota.mjs — 四家配额自省与查询排序(P1/M1)。剩余额度多的平台先查, null(未知)排后保稳定序。
import * as fofa from './fofa.mjs'
import * as hunter from './hunter.mjs'
import * as quake from './quake.mjs'
import * as zoomeye from './zoomeye.mjs'

export const providers = [fofa, hunter, quake, zoomeye]
export const providerById = Object.fromEntries(providers.map((p) => [p.meta.id, p]))

// 并行拉四家配额(单家失败不影响其余 — 静默降级 {ok:false})
export async function quotaAll({ env = process.env, fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  return Promise.all(providers.map((p) => p.quota({ env, fetchImpl, timeoutMs })))
}

// 纯函数: 排序 — ok 且有数值 remaining 优先(大→小), 其余保持注册序
export function orderByQuota(quotaResults) {
  const withIdx = quotaResults.map((q, i) => ({ q, i }))
  withIdx.sort((a, b) => {
    const av = a.q.ok && Number.isFinite(a.q.remaining) ? a.q.remaining : -1
    const bv = b.q.ok && Number.isFinite(b.q.remaining) ? b.q.remaining : -1
    if (av !== bv) return bv - av
    return a.i - b.i
  })
  return withIdx.map(({ q }) => q.provider)
}
