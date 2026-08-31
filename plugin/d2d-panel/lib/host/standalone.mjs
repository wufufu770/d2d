// standalone.mjs — loopback 观测服务(host 半)
// 仅监听 127.0.0.1; Host 头信任栅栏 + CORS 只回显 loopback 来源(better-sidebar
// /sidebar/api/* 同构防线); 全端点只读 GET + no-store; graphd 不可达 → 503 fail-closed。
// 可独立运行: node lib/host/standalone.mjs (调试/未挂 dsh web 时)
import http from 'node:http'
import { buildSnapshot, createGraphdQuery, readHostToken, readFleet } from './snapshot.mjs'

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1', '[::]'])
const MICRO_CACHE_MS = 500 // 0.5s 微缓存 + 单飞: 并发请求合并为一次图读取(对 _lock 争用最小)

function hostnameOf(hostHeader) {
  const h = String(hostHeader ?? '').trim().toLowerCase()
  if (!h) return ''
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1) // [::1]:8790
  return h.split(':')[0]
}
function loopbackOrigin(origin) {
  try {
    const h = new URL(origin).hostname
    return LOOPBACK.has(h) || LOOPBACK.has(`[${h}]`) ? origin : ''
  } catch { return '' }
}
function corsHeaders(req) {
  const o = loopbackOrigin(String(req.headers.origin ?? ''))
  if (!o) return {}
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Vary': 'Origin',
  }
}

export function startStandalone({
  graphdUrl = process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766',
  port = Number(process.env.P2P_PANEL_PORT ?? 8790),
  token,
  fetchImpl = fetch,
  log = () => {},
} = {}) {
  const tok = token ?? readHostToken()
  const query = createGraphdQuery({ graphdUrl, token: tok, fetchImpl })
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

  const server = http.createServer(async (req, res) => {
    const send = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(req) })
      res.end(JSON.stringify(obj))
    }
    // Host 头信任栅栏: 只服务本机请求
    if (!LOOPBACK.has(hostnameOf(req.headers.host))) {
      return send(403, { ok: false, error: 'forbidden: non-loopback Host' })
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(req))
      return res.end()
    }
    if (req.method !== 'GET') return send(405, { ok: false, error: 'method not allowed (read-only)' })
    const path = String(req.url ?? '').split('?')[0]
    if (path === '/health') {
      return send(200, { ok: true, service: 'd2d-panel', graphd: graphdUrl })
    }
    if (path === '/d2d/api/snapshot') {
      try {
        return send(200, await snapshot())
      } catch (e) {
        // fail-closed: graphd 不可达/忙 → 503, 不下发过期快照(PANEL-UI-SPEC §4.7)
        return send(503, { ok: false, error: `graphd unreachable (fail-closed): ${String(e?.message ?? e).slice(0, 140)}` })
      }
    }
    return send(404, { ok: false, error: 'not found' })
  })

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      log(`d2d-panel standalone: http://127.0.0.1:${port} (graphd ${graphdUrl})`)
      resolve({ port, close: () => new Promise((r) => server.close(() => r())) })
    })
    server.on('error', (e) => log(`d2d-panel standalone error: ${e?.message ?? e}`))
  })
}

// 独立运行入口(被 import 时不触发)
if (process.argv[1] && process.argv[1].endsWith('standalone.mjs')) {
  startStandalone({ log: (...a) => console.log('[d2d-panel]', ...a) }).then(() => {
    for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0))
  }).catch((e) => { console.error('[d2d-panel] start failed:', e); process.exit(1) })
}
