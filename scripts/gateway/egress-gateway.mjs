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
// M6 企业代理链: 企业网出网走公司代理(形态 host:port)。scope/限速/审计仍在本网关强制;
// 回环/私有目标绕过上游直连(CDP proxy/graphd 等本地面)。
const UPSTREAM = (() => {
  const raw = String(process.env.D2D_UPSTREAM_PROXY ?? '').trim()
  if (!raw) return null
  const m = raw.replace(/^https?:\/\//i, '').match(/^([^:]+)(?::(\d+))?$/)
  return m ? { host: m[1], port: Number(m[2] ?? 8080) } : null
})()
const isLocalHost = (h) => h === 'localhost' || h === '127.0.0.1' || h === '::1' || /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)
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
          if (!v) continue
          // 保留原文(IP/CIDR 精确匹配用); 域名形态额外记一条 ".域" 供子域通配
          next.add(v)
          if (!v.includes('/') && !/^\d+\.\d+\.\d+\.\d+$/.test(v)) next.add(`.${v}`)
        }
      }
    } catch { /* 单图抖动保留其余 */ }
  }
  dynScope = next
}
refreshScope(); setInterval(refreshScope, 30_000)
// scope 是 CIDR(如 192.168.1.0/24)时按位匹配 — 字符串后缀匹配会误杀段内主机(2026-09-01 接线时实证)
function ipToInt(ip) {
  const p = String(ip).split('.').map(Number)
  if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return null
  return (((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]) >>> 0
}
function ipInCidr(ip, cidr) {
  const [base, bitsStr] = String(cidr).split('/')
  const b = ipToInt(base), v = ipToInt(ip)
  if (b === null || v === null) return false
  const bits = bitsStr === undefined || bitsStr === '' ? 32 : Number(bitsStr)
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return (v & mask) === (b & mask)
}
function hostAllowed(host) {
  const h = String(host || '').toLowerCase().replace(/:\d+$/, '')
  if (STATIC_ALLOW.has(h)) return true
  for (const a of [...STATIC_ALLOW, ...dynScope]) {
    if (a.includes('/')) { if (ipInCidr(h, a)) return true }
    else if (a.startsWith('.')) { if (h.endsWith(a) || h === a.slice(1)) return true }
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
  // 0906 修复: worker 被杀/客户端半途断连时 req/res 的 'error'(ECONNRESET) 无监听 → 整进程退出(12:15 实证)
  req.on('error', () => {})
  res.on('error', () => {})
  const u = new URL(req.url, `http://${req.headers.host ?? 'unknown'}`)
  const host = u.hostname.toLowerCase()
  if (req.url === '/health' || u.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, dynScope: [...dynScope], rate: RATE, upstream: UPSTREAM ? 'configured' : null }))
  }
  if (!hostAllowed(host)) return deny(res, host, 'host not in scope (V-08 egress enforcement)')
  if (!allowRate(host)) return deny(res, host, 'rate limit', 429)
  audit({ event: 'http', host, path: u.pathname, method: req.method })
  try {
    // M6 企业代理链: D2D_UPSTREAM_PROXY 配置时经企业代理转发(http 代理语义 = 绝对 URL 打到代理);
    // 回环/私有目标直连(CDP proxy/graphd 等本地面不过企业网)。scope/限速/审计仍在本网关强制 —
    // 企业代理只是传输通道, 不构成策略旁路。
    const upstreamFor = UPSTREAM && !isLocalHost(host) ? UPSTREAM : null
    const reqOpts = upstreamFor
      ? { host: upstreamFor.host, port: upstreamFor.port, path: `http://${u.host}${u.pathname}${u.search}`, method: req.method, headers: { ...req.headers, host: u.host } }
      : { host: u.hostname, port: u.port || 80, path: u.pathname + u.search, method: req.method, headers: { ...req.headers, host: u.host } }
    const up = http.request(reqOpts, (r) => {
      res.writeHead(r.statusCode, r.headers); r.pipe(res)
    })
    up.on('error', () => { try { res.writeHead(502); res.end() } catch {} })
    req.pipe(up)
  } catch { deny(res, host, 'bad upstream') }
})
server.on('connect', (req, sock, head) => { // HTTPS CONNECT: host 级 scope 强制
  sock.on('error', () => {}) // 0906 修复: 隧道对端 RST(step-limit 杀 worker 等)无监听 → 崩进程(12:15 实证)
  const host = (req.url || '').split(':')[0].toLowerCase()
  const port = parseInt(req.url.split(':')[1] ?? '443', 10)
  if (!hostAllowed(host)) { audit({ event: 'deny', host, why: 'CONNECT not in scope' }); sock.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return }
  if (!allowRate(host)) { sock.end('HTTP/1.1 429 Too Many Requests\r\n\r\n'); return }
  audit({ event: 'connect', host })
  import('node:net').then(({ default: net }) => {
    // M6 企业代理链: CONNECT 经企业代理二次 CONNECT 隧道(握手 200 才放行), 否则直连
    const upstreamFor = UPSTREAM && !isLocalHost(host) ? UPSTREAM : null
    if (!upstreamFor) {
      const up = net.connect(port, host, () => {
        sock.write('HTTP/1.1 200 Connection Established\r\n\r\n'); up.write(head); up.pipe(sock); sock.pipe(up)
      })
      up.on('error', () => sock.end())
      return
    }
    const up = net.connect(upstreamFor.port, upstreamFor.host, () => {
      up.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`)
    })
    let buf = ''
    up.on('data', function onData(d) {
      buf += d.toString('latin1')
      if (!buf.includes('\r\n\r\n')) return
      up.removeListener('data', onData)
      if (/^HTTP\/1\.[01] 200/.test(buf)) {
        sock.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length) up.write(head)
        up.pipe(sock); sock.pipe(up)
      } else {
        audit({ event: 'upstream-refused', host, status: buf.split('\r\n')[0].slice(0, 60) })
        sock.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      }
    })
    up.on('error', () => sock.end())
  })
})
server.on('clientError', (err, socket) => { try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n') } catch {} })
server.listen(PORT, '127.0.0.1', () => console.log(`[egress-gateway] :${PORT} allow=${[...STATIC_ALLOW]} + dynamic scope from ${GRAPHS.join(',')}`))
