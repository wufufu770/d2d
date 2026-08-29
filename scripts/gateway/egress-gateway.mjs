#!/usr/bin/env node
// egress-gateway — V-08 完整修复: 出网治理网关(连接层 scope 强制)
// 职责: ①动态 scope(每 30s 从 control graphd 读活跃 Engagement.scope, 与静态白名单取并集)
//       ②子域通配 ③per-host 令牌桶限速 ④全量请求审计 JSONL
// 用法: P2P_PROXY_PORT=8888 P2P_GRAPHD=http://127.0.0.1:8766 P2P_PROXY_ALLOW="127.0.0.1,localhost,.vulnweb.com" node egress-gateway.mjs
// worker 侧: export http_proxy=http://127.0.0.1:8888 https_proxy=... NO_PROXY=127.0.0.1,localhost
import http from 'node:http'
import os from 'node:os'
import { mkdirSync, appendFileSync } from 'node:fs'

const PORT = parseInt(process.env.P2P_PROXY_PORT ?? '8888', 10)
const GRAPHS = (process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766,http://127.0.0.1:8767,http://127.0.0.1:8768').split(',').map(s => s.trim()).filter(Boolean)
const TOKEN_FILE = process.env.P2P_HOST_TOKEN_FILE ?? `${process.env.HOME}/.config/d2d/host-token`
const STATIC_ALLOW = new Set((process.env.P2P_PROXY_ALLOW ?? '127.0.0.1,localhost')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean))
const RATE = parseFloat(process.env.P2P_PROXY_RATE ?? '5')
// R3: 数据外置 D2D_DATA_DIR(默认 ~/.d2d-data)
const EVIDENCE_DIR = process.env.P2P_PROXY_EVIDENCE ?? `${process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/evidence/proxy`
try { mkdirSync(EVIDENCE_DIR, { recursive: true }) } catch {}
const logFile = `${EVIDENCE_DIR}/proxy-${Date.now()}.jsonl`
const audit = (e) => { try { appendFileSync(logFile, JSON.stringify({ ts: new Date().toISOString(), ...e }) + '\n') } catch {} }

// ---- 动态 scope: control 图的活跃 Engagement.scope, 30s 刷新 ----
let dynScope = new Set()
let token = ''
try { token = (await import('node:fs')).readFileSync(TOKEN_FILE, 'utf8').trim() } catch {}
async function refreshScope() {
  const next = new Set()
  for (const G of GRAPHS) {
    try {
      const res = await fetch(`${G}/query`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth': token },
        body: JSON.stringify({ cypher: "MATCH (e:Engagement) WHERE e.status='active' RETURN e.scope AS s" }),
        signal: AbortSignal.timeout(5000),
      })
      const data = await res.json()
      for (const r of data.rows ?? []) {
        for (const s of String(r.s ?? '').split(',')) {
          const v = s.trim().toLowerCase()
          if (v) next.add(v.startsWith('.') ? v : `.${v}`)
        }
      }
    } catch { /* 单图抖动保留其余 */ }
  }
  dynScope = next
}
refreshScope(); setInterval(refreshScope, 30_000)
function hostAllowed(host) {
  const h = String(host || '').toLowerCase().replace(/:\d+$/, '')
  if (STATIC_ALLOW.has(h)) return true
  for (const a of [...STATIC_ALLOW, ...dynScope]) {
    if (a.startsWith('.')) { if (h.endsWith(a) || h === a.slice(1)) return true }
    else if (h === a) return true
  }
  return false
}
const buckets = new Map()
function allowRate(host) {
  const now = Date.now()
  let b = buckets.get(host)
  if (!b) { b = { tokens: RATE, last: now }; buckets.set(host, b) }
  b.tokens = Math.min(RATE, b.tokens + ((now - b.last) / 1000) * RATE); b.last = now
  if (b.tokens < 1) return false
  b.tokens -= 1
  return true
}
function deny(res, host, why, code = 403) {
  audit({ event: 'deny', host, why })
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: false, error: `egress-gateway: ${why} (${host})` }))
}
const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://${req.headers.host ?? 'unknown'}`)
  const host = u.hostname.toLowerCase()
  if (req.url === '/health' || u.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, dynScope: [...dynScope], rate: RATE }))
  }
  if (!hostAllowed(host)) return deny(res, host, 'host not in scope (V-08 egress enforcement)')
  if (!allowRate(host)) return deny(res, host, 'rate limit', 429)
  audit({ event: 'http', host, path: u.pathname, method: req.method })
  try {
    const up = http.request({ host: u.hostname, port: u.port || 80, path: u.pathname + u.search, method: req.method, headers: { ...req.headers, host: u.host } }, (r) => {
      res.writeHead(r.statusCode, r.headers); r.pipe(res)
    })
    up.on('error', () => { try { res.writeHead(502); res.end() } catch {} })
    req.pipe(up)
  } catch { deny(res, host, 'bad upstream') }
})
server.on('connect', (req, sock, head) => { // HTTPS CONNECT: host 级 scope 强制
  const host = (req.url || '').split(':')[0].toLowerCase()
  if (!hostAllowed(host)) { audit({ event: 'deny', host, why: 'CONNECT not in scope' }); sock.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return }
  if (!allowRate(host)) { sock.end('HTTP/1.1 429 Too Many Requests\r\n\r\n'); return }
  audit({ event: 'connect', host })
  import('node:net').then(({ default: net }) => {
    const up = net.connect(parseInt(req.url.split(':')[1] ?? '443', 10), host, () => {
      sock.write('HTTP/1.1 200 Connection Established\r\n\r\n'); up.write(head); up.pipe(sock); sock.pipe(up)
    })
    up.on('error', () => sock.end())
  })
})
server.listen(PORT, '127.0.0.1', () => console.log(`[egress-gateway] :${PORT} allow=${[...STATIC_ALLOW]} + dynamic scope from ${GRAPHS.join(',')}`))
