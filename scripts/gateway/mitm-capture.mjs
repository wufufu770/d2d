#!/usr/bin/env node
// mitm-capture.mjs — #44 MITM 拦截面(:8895, 独立进程; D2D_MITM=1 才启用, 防误启动):
//   ①HTTP 明文全量拦截: 请求/响应头+体落证据(体上限 256KB 截断标记), host 逐个过 scope/denylist
//     (复用 plugin pentest-dsh domain/scope.mjs 的 hostAllowed + R6.1 denylist 同源口径), 非 scope 403;
//     出口硬黑面(H14)直接复用 egress-gateway 的 isForbiddenTarget, 元数据/链路本地永不经手。
//   ②TLS 拦截 opt-in(D2D_MITM_TLS=1): 首启生成自签 CA(~/.d2d-data/mitm/ca.key+ca.crt, 600),
//     按 host 动态签发叶子证书(SNICallback + openssl); 默认 D2D_MITM_TLS=0 → CONNECT 直通不解密。
//     (4.5-1: CA/叶子签发/内部 TLS 服务原样抽至共享模块 scripts/gateway/tls-intercept.mjs, 与 egress 解密分支共用)
//   ③落盘+入图: 每笔事务写 ${D2D_DATA_DIR}/evidence/mitm/<eng>/<ts>.json(tmp+rename 原子落盘;
//     T2-2b-1 起默认加密(aes-256-gcm, 密钥=SHA-256(host-token), 见 evidence-crypto.mjs);
//     D2D_EVIDENCE_ENC=0 显式降级为既有明文格式);
//     每 N 笔(D2D_MITM_FLUSH, 默认 20)聚合写 Signal_(type=http-txn, evidence 摘要)走 /write 通道
//     — graphd 侧 denylist 门兜底红线资产。
//   ④WSS 帧审计 opt-in(D2D_MITM_WSS=1): ws 握手入证据 + 帧级(opcode/长度/方向)审计, 不解帧内容。
//   ⑤限速: 全局令牌桶 ≤100 req/s(D2D_MITM_RATE 可调), 超限 503。
// 用法: D2D_MITM=1 node scripts/gateway/mitm-capture.mjs   (worker: export http_proxy=http://127.0.0.1:8895)
import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Transform } from 'node:stream'
import { hostAllowed } from '../../plugin/pentest-dsh/domain/scope.mjs'
import { isForbiddenTarget } from './egress-gateway.mjs'
// 4.5-1: TLS 拦截面(ensureCA/signLeaf/tlsSrvPort)原样抽至共享模块 ./tls-intercept.mjs — 只搬移+导出, 行为零变化
import { ensureCA as _ensureCA, signLeaf as _signLeaf, tlsSrvPort as _tlsSrvPort, _tlsSrv } from './tls-intercept.mjs'
// T2-2b-1: 证据存储加密壳 — captureTxn 落盘改走加密 sink(密钥=SHA-256(host-token 64-hex 原文))
import { createEvidenceSink, keyFromFile } from './evidence-crypto.mjs'

const PORT = parseInt(process.env.D2D_MITM_PORT ?? '8895', 10)
const GRAPHD = process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766'
const TOKEN_FILE = process.env.P2P_HOST_TOKEN_FILE ?? `${process.env.HOME}/.config/d2d/host-token`
const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const EVID_DIR = process.env.D2D_MITM_EVIDENCE ?? `${DATA_DIR}/evidence/mitm`
const CA_DIR = process.env.D2D_MITM_CA_DIR ?? `${DATA_DIR}/mitm`
const TLS_ON = process.env.D2D_MITM_TLS === '1'
const WSS_ON = process.env.D2D_MITM_WSS === '1'
const FLUSH_N = Math.max(1, parseInt(process.env.D2D_MITM_FLUSH ?? '20', 10))
const BODY_CAP = parseInt(process.env.D2D_MITM_BODY_CAP ?? String(256 * 1024), 10)
let RATE = parseFloat(process.env.D2D_MITM_RATE ?? '100')
const STATIC_ALLOW = new Set((process.env.D2D_MITM_ALLOW ?? '127.0.0.1,localhost').split(',').map(s => s.trim().toLowerCase()).filter(Boolean))
try { fs.mkdirSync(EVID_DIR, { recursive: true }) } catch { /* 已记因: 尽力而为——证据目录已存在或创建失败, 不阻断捕获服务启动 */ }
const auditLog = `${EVID_DIR}/mitm-audit.jsonl`
const audit = (e) => { try { fs.appendFileSync(auditLog, JSON.stringify({ ts: new Date().toISOString(), ...e }) + '\n') } catch { /* 已记因: 尽力而为——审计行写盘失败静默, 不阻断拦截转发 */ } }
const readToken = () => { try { return fs.readFileSync(TOKEN_FILE, 'utf8').trim() } catch { return '' } }

// ---- host 归一(与 egress-gateway 同口径的最小面: 剥端口/方括号) + scope/denylist 判定 ----
function normalizeHost(h) {
  let s = String(h ?? '').trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/%[0-9a-z._-]+$/i, '').replace(/^([^:]+):\d+$/, '$1')
  const m = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (m) s = m[1]
  return s
}
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
// denylist 命中(与 scope.mjs checkBash 的 deniedHit 同语义: 域名后缀 + 点分前缀 + CIDR)
export function deniedHit(host, denylist = {}) {
  const h = normalizeHost(host)
  if (!h) return ''
  for (const d of (denylist.domains ?? []).map((x) => String(x).trim().toLowerCase()).filter(Boolean)) {
    if (h === d || h.endsWith(`.${d}`)) return d
  }
  for (const c of (denylist.cidr_prefix ?? []).map((x) => String(x).trim()).filter(Boolean)) {
    if (h === c || (c.endsWith('.') && h.startsWith(c)) || ipInCidr(h, c)) return c
  }
  return ''
}
// ---- 活跃 engagement(scope + R6.1 denylist 文件), 30s 刷新; 图不可达 → ENGS 空 → 全拒(fail-closed) ----
let ENGS = []
async function refreshEngs() {
  const token = readToken()
  let dl = { domains: [], cidr_prefix: [] }
  try { dl = JSON.parse(fs.readFileSync(process.env.P2P_DENYLIST_FILE ?? `${DATA_DIR}/config/denylist.json`, 'utf8')) } catch { /* 已记因: 解析容错——denylist 缺失或坏 JSON 时按空红线名单继续, scope 仍强制 */ }
  try {
    const res = await fetch(`${GRAPHD}/query`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth': token },
      body: JSON.stringify({ cypher: "MATCH (e:Engagement) WHERE e.status='active' RETURN e.name AS name, e.scope AS scope" }),
      signal: AbortSignal.timeout(5000),
    })
    const data = await res.json().catch(() => ({}))
    ENGS = (data.rows ?? []).map((r) => ({ name: String(r.name ?? ''), scope: String(r.scope ?? ''), denylist: dl }))
      .filter((e) => e.scope.trim())
  } catch { ENGS = [] }
}
const _setEngs = (list) => { ENGS = Array.isArray(list) ? list : [] }
// → engagement 对象 | false(denylist 红线/硬黑面) | null(非 scope)。
// 判定序: 硬黑面 → engagement scope(带 eng 归属+denylist) → STATIC_ALLOW 兜底(本地靶场, 无 eng 归属)
export function mitmAllowed(rawHost) {
  const h = normalizeHost(rawHost)
  if (!h || isForbiddenTarget(h)) return false
  const eng = ENGS.find((e) => hostAllowed(h, e.scope))
  if (eng) return deniedHit(h, eng.denylist) ? false : eng
  if (STATIC_ALLOW.has(h)) return { name: '', scope: h, denylist: {} }
  return null
}

// ---- 全局令牌桶: ≤RATE req/s, 超限 503 ----
let bucket = { tokens: RATE, last: Date.now() }
export function allowRate(now = Date.now()) {
  bucket.tokens = Math.min(RATE, bucket.tokens + ((now - bucket.last) / 1000) * RATE)
  bucket.last = now
  if (bucket.tokens < 1) return false
  bucket.tokens -= 1
  return true
}
const _setRate = (r) => { RATE = Number(r); bucket = { tokens: RATE, last: Date.now() } }
const _resetBucket = () => { bucket = { tokens: RATE, last: Date.now() } }

// ---- 目标解析: 代理请求既可能是绝对 URL(CONNECT 场景后的 origin-form 也有) ----
function targetOf(req) {
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(req.url ?? '')) {
      const u = new URL(req.url)
      return { host: normalizeHost(u.hostname), port: Number(u.port || (u.protocol === 'https:' ? 443 : 80)), path: u.pathname + u.search, absolute: true }
    }
    const hb = String(req.headers.host ?? '').trim()
    const m = hb.match(/^(?:\[([^\]]+)\]|([^:]+))(?::(\d+))?$/)
    return { host: normalizeHost(m?.[1] ?? m?.[2] ?? ''), port: parseInt(m?.[3] ?? '80', 10), path: req.url ?? '/', absolute: false }
  } catch { return { host: '', port: 80, path: '/', absolute: false } }
}

// ---- 证据: 事务落盘(tmp+rename) + 每 N 笔聚合写 Signal_(http-txn) ----
let seq = 0
let pending = []
const sanitize = (s) => String(s ?? '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60) || 'default'
function captureTxn(txn) {
  txn.ts = txn.ts ?? new Date().toISOString()
  try {
    const dir = path.join(EVID_DIR, sanitize(txn.eng))
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${Date.now()}-${++seq}.json`)
    // T2-2b-1: 证据加密落盘(默认 on; env D2D_EVIDENCE_ENC=0 显式降级 = 既有明文字节格式, 供回归)。
    // 密钥 = SHA-256(host-token 文件 64-hex 原文)(D2D_EVIDENCE_KEY_FILE 可重定向); 密钥缺文件/形态
    // 不对 → fail-closed 拒写(catch 落 audit, 绝不降级明文 — Cookie/Authorization 头明文不落盘)。
    // 落盘路径只有密文(单行 JSON {v,alg,iv,tag,ct}), 明文串为函数局部量写后即弃。
    const encOff = process.env.D2D_EVIDENCE_ENC === '0'
    const sink = createEvidenceSink(
      encOff ? { dir } : { keyHex: keyFromFile(process.env.D2D_EVIDENCE_KEY_FILE ?? TOKEN_FILE), dir },
    )
    sink.write(txn, file)
  } catch (e) { audit({ event: 'evidence-write-error', error: String(e.message ?? e).slice(0, 120) }) }
  pending.push(txn)
  if (pending.length >= FLUSH_N) return flushSignal()
  return Promise.resolve(false)
}
async function flushSignal() {
  const batch = pending.splice(0, pending.length)
  if (!batch.length) return false
  const hosts = {}
  for (const t of batch) hosts[t.req?.host ?? '?'] = (hosts[t.req?.host ?? '?'] ?? 0) + 1
  const top = Object.entries(hosts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([h, n]) => `${h}×${n}`).join(', ')
  const sample = batch.slice(0, 5).map((t) => `${t.req?.method} ${String(t.req?.host)}${String(t.req?.path).slice(0, 40)} → ${t.res?.status}`).join('; ')
  const eng = batch.find((t) => t.eng)?.eng ?? ''
  const evidence = `mitm(http-txn): 捕获 ${batch.length} 笔事务(hosts: ${top}; 示例: ${sample}) — 明细 ${EVID_DIR}/${sanitize(eng)}/`
  try {
    const res = await fetch(`${GRAPHD}/write/signal`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth': readToken() },
      body: JSON.stringify({ type: 'http-txn', weight: 1.0, ring: 'discovery', eng, evidence }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`graphd ${res.status}`)
    return true
  } catch (e) {
    audit({ event: 'signal-flush-error', error: String(e.message ?? e).slice(0, 120), dropped: batch.length })
    return false
  }
}
// 体捕获: 上限 256KB 截断(只多记 truncated 标记, 不涨内存); 逐字节取上限内前缀, 大块到达也不丢头
function tapBody(stream, store, cap = BODY_CAP) {
  store.size = 0; store.truncated = false; store.chunks = []; store.stored = 0
  stream.on('data', (c) => {
    store.size += c.length
    if (store.stored < cap) {
      const room = cap - store.stored
      store.chunks.push(room >= c.length ? c : c.subarray(0, room))
      store.stored += Math.min(room, c.length)
    }
    if (store.size > cap) store.truncated = true
  })
}
const bodyOut = (store) => ({ size: store.size ?? 0, truncated: Boolean(store.truncated), text: store.chunks?.length ? Buffer.concat(store.chunks).toString('utf8') : '' })
const headOut = (h) => { const o = {}; for (const [k, v] of Object.entries(h ?? {})) o[k] = Array.isArray(v) ? v.join(', ') : String(v); return o }

// ---- WSS 帧审计 tap(D2D_MITM_WSS=1): 逐帧记 {dir, opcode, len}, 不解帧内容, 字节原样透传 ----
export function wsFrameTap(label, onFrame) {
  let buf = Buffer.alloc(0)
  let skip = 0 // 当前帧剩余 payload(只记头, 内容放行)
  const parse = () => {
    for (;;) {
      if (skip > 0) { const eat = Math.min(skip, buf.length); skip -= eat; buf = buf.subarray(eat) }
      if (skip > 0 || buf.length < 2) return
      const b1 = buf[1]
      let len = b1 & 0x7f, off = 2
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4 } // 2 字节扩展长度
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10 } // 8 字节
      if (b1 & 0x80) off += 4 // mask key(客户端→服务端必带)
      if (buf.length < off) return
      onFrame({ dir: label, opcode: buf[0] & 0x0f, len })
      buf = buf.subarray(off)
      skip = len
    }
  }
  return new Transform({
    transform(chunk, enc, cb) { buf = Buffer.concat([buf, chunk]); parse(); cb() },
  })
}

// ---- HTTP 拦截处理器(明文直连 + TLS 解密后的内部 https 服务共用) ----
async function handle(req, res) {
  req.on('error', () => {}); res.on('error', () => {})
  const t = targetOf(req)
  let _hp = ''
  try { _hp = new URL(req.url ?? '/', 'http://x').pathname } catch { /* 已记因: 解析容错——坏 URL 时 _hp 留空跳过探活判定, 继续代理流程 */ }
  if (_hp === '/health' && ['127.0.0.1', 'localhost', '::1'].includes(t.host)) { // 探活: 仅回环目标短路, 不劫持代理路径上的 /health
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, tls: TLS_ON, wss: WSS_ON, rate: RATE, engs: ENGS.length, pending: pending.length }))
  }
  const deny = (code, why) => { audit({ event: 'deny', host: t.host, why }); res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: `mitm-capture: ${why} (${t.host})` })) }
  const allowed = mitmAllowed(t.host)
  if (allowed === false) return deny(403, isForbiddenTarget(t.host) ? 'metadata/link-local 硬黑面(H14)' : 'denylist 红线资产')
  if (!allowed) return deny(403, 'host not in scope (#44 MITM 拦截面)')
  if (!allowRate()) return deny(503, 'rate limit (token bucket)')
  audit({ event: 'http', host: t.host, path: t.path.slice(0, 80), method: req.method })
  const started = Date.now()
  const reqStore = {}, resStore = {}
  tapBody(req, reqStore)
  let up
  try {
    up = http.request({ host: t.host, port: t.port, path: t.path, method: req.method, headers: { ...req.headers, host: `${t.host}${t.port ? `:${t.port}` : ''}` } }, (r) => {
      tapBody(r, resStore)
      res.writeHead(r.statusCode, r.headers)
      r.pipe(res)
      r.on('end', () => {
        captureTxn({
          eng: allowed.name ?? '',
          durMs: Date.now() - started,
          req: { method: req.method, host: t.host, port: t.port, path: t.path, httpVersion: req.httpVersion, headers: headOut(req.headers) },
          reqBody: bodyOut(reqStore),
          res: { status: r.statusCode, headers: headOut(r.headers) },
          resBody: bodyOut(resStore),
        })
      })
    })
  } catch { return deny(502, 'bad upstream') }
  up.on('error', () => { try { res.writeHead(502); res.end() } catch { /* 已记因: 尽力而为——上游错误回 502, 响应已发出/客户端已断时写回失败静默 */ } })
  req.pipe(up)
}

// ---- TLS opt-in: 自签 CA + 按 host 动态叶子证书(openssl) — 4.5-1 原样抽至 ./tls-intercept.mjs ----
// 本文件仅保留绑定面: mitm 侧缺省目录(CA_DIR) + audit 注入(ca-created/leaf-sign-error 仍落 mitm-audit.jsonl),
// 判定逻辑/openssl 参数/文件布局与抽出前逐字节一致(零行为变化, mitm-capture.test.mjs 全量回归兜底)。
export const ensureCA = (dir = CA_DIR) => _ensureCA(dir, audit)
export const signLeaf = (host, dir = CA_DIR) => _signLeaf(host, dir, audit)

const server = http.createServer((req, res) => { handle(req, res).catch(() => { try { res.writeHead(500); res.end() } catch { /* 已记因: 尽力而为——请求处理异常回 500, 客户端已断时写回失败静默 */ } }) })
// ws:// 明文升级(D2D_MITM_WSS=1 审计; 否则原样隧道)
server.on('upgrade', (req, sock, head) => {
  sock.on('error', () => {})
  const t = targetOf(req)
  const allowed = mitmAllowed(t.host)
  const deny = (why) => { audit({ event: 'deny', host: t.host, why }); try { sock.end('HTTP/1.1 403 Forbidden\r\n\r\n') } catch { /* 已记因: 另面留痕——拒绝决定已审计, 对端已断时 403 写回失败静默 */ } }
  if (allowed === false || !allowed) return deny(allowed === false ? 'denylist 红线资产' : 'host not in scope')
  if (!allowRate()) { try { sock.end('HTTP/1.1 503 Service Unavailable\r\n\r\n') } catch { /* 已记因: 尽力而为——升级面限速 503 写回失败(对端已断)静默 */ }; return }
  const started = Date.now()
  const up = http.request({ host: t.host, port: t.port, path: t.path, method: req.method, headers: { ...req.headers, host: `${t.host}${t.port ? `:${t.port}` : ''}` } })
  up.on('upgrade', (r, upSock, upHead) => {
    upSock.on('error', () => {})
    const frames = []
    sock.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(headOut(r.headers)).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`)
    if (WSS_ON) {
      // 审计 tap 串进双向管道(tap 只看不改); 两侧残留首帧字节也从 tap 进, 防帧错位
      const t1 = wsFrameTap('c2s', (f) => frames.push(f)), t2 = wsFrameTap('s2c', (f) => frames.push(f))
      sock.pipe(t1).pipe(upSock)
      upSock.pipe(t2).pipe(sock)
      if (head.length) t1.write(head)
      if (upHead.length) t2.write(upHead)
    } else {
      if (head.length) upSock.write(head)
      if (upHead.length) sock.write(upHead)
      sock.pipe(upSock); upSock.pipe(sock)
    }
    const done = () => { if (WSS_ON) captureTxn({ eng: allowed.name ?? '', durMs: Date.now() - started, ws: { handshake: { host: t.host, path: t.path, status: r.statusCode, headers: headOut(r.headers) }, frames } }) }
    sock.on('close', done); upSock.on('close', done)
  })
  up.on('error', () => { try { sock.end() } catch { /* 已记因: 尽力而为——升级上游错误断开客户端, 对端已断时静默 */ } })
  up.end()
})
server.on('connect', (req, sock, head) => { // HTTPS CONNECT: TLS_ON 解密(经内部 https 服务回环), 否则直通
  sock.on('error', () => {})
  const m = String(req.url ?? '').match(/^(?:\[([^\]]+)\]|([^:]+))(?::(\d+))?$/)
  const host = normalizeHost(m?.[1] ?? m?.[2] ?? '')
  const port = parseInt(m?.[3] ?? '443', 10)
  const allowed = mitmAllowed(host)
  const deny = (code, why) => { audit({ event: 'deny', host, why }); try { sock.end(`HTTP/1.1 ${code} Forbidden\r\n\r\n`) } catch { /* 已记因: 另面留痕——拒绝决定已审计, 对端已断时写回失败静默 */ } }
  if (allowed === false) return deny(403, isForbiddenTarget(host) ? 'metadata/link-local 硬黑面(H14)' : 'denylist 红线资产')
  if (!allowed) return deny(403, 'host not in scope (#44 MITM 拦截面)')
  if (!allowRate()) { try { sock.end('HTTP/1.1 503 Service Unavailable\r\n\r\n') } catch { /* 已记因: 尽力而为——隧道面限速 503 写回失败(对端已断)静默 */ }; return }
  audit({ event: 'connect', host, port, decrypt: TLS_ON })
  if (!TLS_ON) { // 直通: 不解密(默认), 连接层仅 scope/限速/审计
    const up = net.connect(port, host, () => { sock.write('HTTP/1.1 200 Connection Established\r\n\r\n'); up.write(head); up.pipe(sock); sock.pipe(up) })
    up.on('error', () => sock.end())
    return
  }
  // 解密: 回环到内部 TLS 服务(SNICallback 动态签发叶子), 解密后的明文 HTTP 走同一 handle(全量捕获)
  try {
    const up = net.connect(tlsSrvPort(), '127.0.0.1', () => {
      sock.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length) up.write(head)
      sock.pipe(up); up.pipe(sock)
    })
    up.on('error', () => sock.end())
  } catch { try { sock.end('HTTP/1.1 502 Bad Gateway\r\n\r\n') } catch { /* 已记因: 尽力而为——回环建立失败回 502, 对端已断时写回失败静默 */ } }
})
server.on('clientError', (err, socket) => { try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n') } catch { /* 已记因: 尽力而为——畸形请求回 400, 连接已坏时写回失败静默 */ } })

// TLS 解密模式: 内部 https 服务(SNI 动态证书)在共享模块(进程级单例面) — CONNECT 隧道回环至此,
// 明文请求进同一 handle; mitm 侧只注入缺省目录/audit/handle/upgrade 转发(原样搬移, 行为零变化)。
function tlsSrvPort() {
  return _tlsSrvPort(
    (req, res) => { handle(req, res).catch(() => { try { res.writeHead(500); res.end() } catch { /* 已记因: 尽力而为——解密请求处理异常回 500, 客户端已断时写回失败静默 */ } }) },
    { caDir: CA_DIR, onAudit: audit, onUpgrade: (req, sock, head) => server.emit('upgrade', req, sock, head) },
  )
}

// main 守卫: 直接运行才起服务; mocha 纯 import 只取纯函数/真身 server。D2D_MITM=1 才启用(防误启动)。
const IS_MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (IS_MAIN) {
  if (process.env.D2D_MITM !== '1') {
    console.error('[mitm-capture] D2D_MITM=1 未设置 — MITM 拦截面未启用(防误启动; systemd 单元已内置该 env)')
    process.exit(0)
  }
  if (TLS_ON) { try { ensureCA() } catch (e) { console.error(`[mitm-capture] CA 生成失败: ${e.message} — 回退 CONNECT 直通`) } }
  refreshEngs(); setInterval(refreshEngs, 30_000)
  server.listen(PORT, '127.0.0.1', () => console.log(`[mitm-capture] :${PORT} tls=${TLS_ON ? 'on(解密)' : 'off(CONNECT 直通)'} wss=${WSS_ON} rate=${RATE}/s flush=${FLUSH_N} → ${EVID_DIR}`))
}

export { server, normalizeHost, refreshEngs, _setEngs, _setRate, _resetBucket, captureTxn, flushSignal, targetOf, _tlsSrv }
export const _state = { get pending() { return pending }, get engs() { return ENGS }, EVID_DIR, CA_DIR, TLS_ON, WSS_ON, BODY_CAP, get rate() { return RATE } }
