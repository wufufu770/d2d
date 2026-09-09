// aggregate.mjs — 多平台测绘聚合(P1/M1): 逐家查询 → mergeAssets 跨平台去重(指纹并集)。
// 单家失败不拖垮聚合(perProvider 带错误), 无一家配置时抛出带开通指引的聚合错误。
import { mergeAssets } from './normalize.mjs'
import { SEARCH_BUDGET } from './query.mjs'
import { providers, quotaAll, orderByQuota } from './quota.mjs'

// → { assets[], perProvider[{provider,ok,total?,count,error?}] }
// 各平台 search 内置五轮放宽(命中即停)与蜜罐过滤(FOFA), 聚合层只做排序/容错/去重;
// 默认 size=SEARCH_BUDGET(50), 调用方以 size 覆盖。
export async function searchAll(dsl, {
  order = null, size = SEARCH_BUDGET, maxPages = 1,
  env = process.env, fetchImpl = fetch, timeoutMs = 15000,
} = {}) {
  let seq = order
  if (!seq) seq = orderByQuota(await quotaAll({ env, fetchImpl, timeoutMs }))
  const perProvider = []
  const collected = []
  for (const id of seq) {
    const p = providers.find((x) => x.meta.id === id)
    if (!p) continue
    if (!p.isConfigured(env)) { perProvider.push({ provider: id, ok: false, error: `未配置(${p.meta.envKeys.join(',')})` }); continue }
    try {
      const r = await p.search(dsl, { size, maxPages, env, fetchImpl, timeoutMs })
      collected.push(...r.assets)
      perProvider.push({ provider: id, ok: true, total: r.total, count: r.assets.length, quota: r.quota })
    } catch (e) {
      perProvider.push({ provider: id, ok: false, error: String(e.message ?? e).slice(0, 160) })
    }
  }
  if (!perProvider.some((x) => x.ok)) {
    const unconfigured = perProvider.every((x) => String(x.error).startsWith('未配置'))
    throw new Error(unconfigured
      ? `四家测绘平台均未配置 — 按需设置任一: ${providers.map((p) => `${p.meta.envKeys.join('/')}(${p.meta.name})`).join(', ')}; ${providers.map((p) => p.meta.setup).join(' / ')}`
      : `测绘查询全部失败: ${perProvider.map((x) => `${x.provider}: ${x.error}`).join('; ')}`)
  }
  return { assets: mergeAssets(collected), perProvider }
}
