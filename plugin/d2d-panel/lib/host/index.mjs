// index.mjs — d2d-panel host 半(dsh 插件宿主入口)
// 路由: ctx.webServer.register({kind:'prefix', path:'/d2d/api'}) — 与 dsh /api 同一道
// 浏览器信任栅栏(Host loopback/受信 + sec-fetch-site + Origin 同源), 同源零跨域,
// token 全程留 host 侧。机制参照 dsh-sidebar-leap 宿主半(生态已验证模式)。
import { buildSnapshot, createGraphdQuery, readHostToken, readFleet } from './snapshot.mjs'

export const name = 'd2d-panel'
export const inject = ['webServer', 'webRuntime'] // 无 sessions 依赖: 快照只读 graphd, 不碰会话存储

const MICRO_CACHE_MS = 500 // 微缓存 + 单飞: 并发请求合并为一次图读取(_lock 争用最小)

/** 浏览器信任栅栏(port of dsh-sidebar-leap isTrustedApiRequest 同口径)。 */
function isTrustedApiRequest(req, trustedHosts = []) {
  const host = String(req.headers?.host ?? '')
  if (!host) return false
  const m = host.match(/^\[([^\]]+)\](?::(\d+))?$/) || host.match(/^([^:]+)(?::(\d+))?$/)
  if (!m) return false
  const hostname = String(m[1]).toLowerCase()
  const isLoop = hostname === 'localhost' || hostname === '::1' || /^127\.\d+\.\d+\.\d+$/.test(hostname)
  const trusted = (trustedHosts ?? []).some((t) => {
    const tm = String(t ?? '').match(/^\[([^\]]+)\]/) || String(t ?? '').match(/^([^:]+)/)
    return tm ? String(tm[1]).toLowerCase() === hostname : false
  })
  if (!isLoop && !trusted) return false
  if (String(req.headers?.['sec-fetch-site'] ?? '') === 'cross-site') return false
  const origin = req.headers?.origin
  if (origin === undefined) return true
  try { return new URL(origin).host === host } catch { return false }
}

export function apply(ctx, config = {}) {
  const log = (...a) => { try { ctx?.log?.(...a) } catch { /* 宿主日志面可选 */ } }
  const graphdUrl = String(config.graphdUrl ?? process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766')
  const query = createGraphdQuery({ graphdUrl, token: readHostToken() })

  let cache = null
  let inFlight = null
  async function snapshot() {
    if (cache && Date.now() - cache.ts < MICRO_CACHE_MS) return cache.val
    if (inFlight) return inFlight
    inFlight = (async () => {
      const val = await buildSnapshot(query, { fleet: readFleet() })
      cache = { ts: Date.now(), val }
      return val
    })().finally(() => { inFlight = null })
    return inFlight
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/d2d/api',
    handler: async (req, res) => {
      const send = (code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify(obj))
      }
      if (!isTrustedApiRequest(req, ctx.webRuntime?.trustedHosts ?? [])) {
        return send(403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
      }
      const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
      const method = pathname.startsWith('/d2d/api/') ? pathname.slice('/d2d/api/'.length) : undefined
      if (method === undefined || method.includes('/')) {
        return send(404, { ok: false, error: { code: 'not-found', message: 'unknown d2d API method' } })
      }
      if (method === 'health') {
        return send(200, { ok: true, service: 'd2d-panel', graphd: graphdUrl })
      }
      if (method === 'snapshot') {
        if (req.method !== 'GET') return send(405, { ok: false, error: { code: 'method-error', message: 'method not allowed (read-only)' } })
        try {
          return send(200, await snapshot())
        } catch (e) {
          // fail-closed: graphd 不可达/忙 → 503, 不下发过期快照(PANEL-UI-SPEC §4.7)
          return send(503, { ok: false, error: { code: 'graphd-unreachable', message: `fail-closed: ${String(e?.message ?? e).slice(0, 140)}` } })
        }
      }
      return send(404, { ok: false, error: { code: 'not-found', message: `unknown d2d API method "${method}"` } })
    },
  }), 'd2d-panel: /d2d/api routes')
  log(`d2d-panel: /d2d/api mounted (graphd ${graphdUrl})`)
}
