// api.js — client 半快照拉取
// 探测顺序: 同源(dsh web 网关, P1 路由挂载后零跨域) → standalone loopback(:8790)。
// 成功的 base 记入模块缓存, 后续轮询直连; visible 门控由视图层负责(本模块无状态轮询)。
const CANDIDATES = ['', 'http://127.0.0.1:8790'] // '' = 同源
let base = null

// badge 缓存: TabDescriptor.badge 是同步回调且必须廉价(接入指南 §4.1),
// 轮询成功时更新, badge 直接读 —— 避免在 badge 里发请求。
export const badgeState = { workers: null, verified: null }

export async function fetchSnapshot(signal) {
  const order = base === null ? CANDIDATES : [base, ...CANDIDATES.filter((c) => c !== base)]
  let lastErr = null
  for (const b of order) {
    try {
      const r = await fetch(`${b}/d2d/api/snapshot`, { signal, headers: { accept: 'application/json' } })
      if (!r.ok) { lastErr = new Error(`HTTP ${r.status}`); continue } // 404/503 → 试下一个 base
      const j = await r.json()
      if (!j?.ok) { lastErr = new Error(String(j?.error ?? 'bad snapshot')); continue }
      base = b
      badgeState.workers = j?.agents?.filter((a) => a?.status === 'running').length ?? null
      badgeState.verified = j?.findings?.macro?.verified ?? null
      return j
    } catch (e) {
      if (e?.name === 'AbortError') throw e
      lastErr = e
    }
  }
  throw lastErr ?? new Error('snapshot unreachable')
}
