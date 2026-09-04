#!/usr/bin/env node
// mitm-proxy.mjs — #46 自研 HTTP MITM 代理(不依赖 http-mitm-proxy) + #48 WSS 帧审计(opt-in)
// 能力:
//   - 纯 HTTP 请求完整拦截: 记录 method/host/path/状态码/耗时 + 请求/响应 body 的 sha256+size
//     到 events.jsonl(0600)。body 明文一律不落盘, 仅 env D2D_MITM_BODY=1 时保存 ≤256B 片段
//     (对参考实现"明文全落盘"缺陷的修正)。
//   - HTTPS CONNECT 默认纯隧道转发(不解析)。
//   - opt-in 解密模式(env D2D_MITM_TLS=1): 调外部 openssl 生成 CA(缓存 DATA_DIR/mitm-ca/ 0700)
//     并按域名签发证书; fail-closed — openssl 不可用时 CONNECT 退回纯隧道并告警。
//   - #48 WSS 帧审计(默认关闭, env D2D_MITM_WSS=1 才开): 解密模式下对 upgrade 请求做 TLS 终结,
//     按 RFC6455 解析帧, 仅记录帧方向+长度+文本帧前 200B 摘要。
// 监听: host 默认 127.0.0.1, 仅显式 --host 才放开。
// 用法: node mitm-proxy.mjs [--port 8888] [--host 127.0.0.1] [--events /path/events.jsonl]
import http from 'node:http'
import net from 'node:net'
import crypto from 'node:crypto'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { appendFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

const BODY_SNIPPET_MAX = 256 // #46: 明文片段上限, 仅 D2D_MITM_BODY=1 时落盘
const HASH_BUF_MAX = 1 << 20 // 哈希采样上限 1MB(只采样, 不影响转发; 事件里带 truncated 标记)
const WSS_CARRY_MAX = 1 << 20 // WSS 审计半帧缓冲上限(坏帧/超大半帧直接丢弃, 内存有界)

const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const defaultEventsPath = () => `${DATA_DIR}/evidence/mitm/events-${Date.now()}.jsonl`

// 逐跳头(含 Connection 声明的字段)绝不向目标/客户端透传(复审#8)
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade'])
export function stripHopHeaders(headers) {
  let connRaw = ''
  for (const [k, v] of Object.entries(headers ?? {})) {
    if (k.toLowerCase() === 'connection') { connRaw = String(v ?? ''); break }
  }
  const connTokens = new Set(connRaw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))
  const out = {}
  for (const [k, v] of Object.entries(headers ?? {})) {
    const lk = k.toLowerCase()
    if (HOP_BY_HOP.has(lk) || connTokens.has(lk)) continue
    out[lk] = v
  }
  return out
}

// CONNECT authority 解析: host:port / IPv6 [::1]:443 — 用 lastIndexOf(':') 而非 split(':')(复审#9)
export function parseConnectAuthority(url) {
  const s = String(url ?? '')
  const colon = s.lastIndexOf(':')
  if (colon > s.lastIndexOf(']')) {
    const p = Number(s.slice(colon + 1))
    return { host: s.slice(0, colon), port: Number.isInteger(p) && p > 0 ? p : 443 }
  }
  return { host: s, port: 443 }
}

// ---------- #46 事件落盘: jsonl + 0600, 永不写 body 明文(除非 bodyMode) ----------
export function makeEventSink(eventsPath, bodyMode) {
  mkdirSync(dirname(eventsPath), { recursive: true, mode: 0o700 })
  let dropped = 0
  const write = (ev) => {
    try { appendFileSync(eventsPath, JSON.stringify(ev) + '\n', { mode: 0o600 }) } catch (e) {
      // 复审#9: 不再静默吞错 — 计数并打点 stderr
      dropped++
      try { process.stderr.write(`[mitm] events 落盘失败(${e?.code ?? e}), 累计丢弃 ${dropped} 条\n`) } catch {}
    }
  }
  // body 摘要器(整包缓冲路径, 保留给小工具/测试): 只出 sha256+size(+可选片段)
  const digest = (buf) => {
    const d = { sha256: crypto.createHash('sha256').update(buf).digest('hex'), size: buf.length }
    if (buf.length >= HASH_BUF_MAX) d.truncated = true
    if (bodyMode) d.snippet = buf.subarray(0, BODY_SNIPPET_MAX).toString('base64')
    return d
  }
  // 采样器(复审#1): 转发与哈希彻底解耦 — 哈希只吃前 HASH_BUF_MAX 字节, size 记全量;
  // 明文片段(bodyMode)也只另存前 BODY_SNIPPET_MAX 字节
  const sampler = () => {
    const h = crypto.createHash('sha256')
    let seen = 0
    const snippet = bodyMode ? [] : null
    let snippetLen = 0
    return {
      push(chunk) {
        if (seen < HASH_BUF_MAX) h.update(chunk.subarray(0, Math.min(chunk.length, HASH_BUF_MAX - seen)))
        if (snippet && snippetLen < BODY_SNIPPET_MAX) {
          const take = chunk.subarray(0, Math.min(chunk.length, BODY_SNIPPET_MAX - snippetLen))
          snippet.push(take); snippetLen += take.length
        }
        seen += chunk.length
      },
      digest() {
        const d = { sha256: h.digest('hex'), size: seen }
        if (seen >= HASH_BUF_MAX) d.truncated = true
        if (snippet) d.snippet = Buffer.concat(snippet).subarray(0, BODY_SNIPPET_MAX).toString('base64')
        return d
      },
    }
  }
  return { write, digest, sampler, get dropped() { return dropped } }
}

// ---------- #46 纯 HTTP 正向代理转发 ----------
// 复审#1/#12: 转发与哈希采样分离 — 请求/响应体一律流式 pipe(无条件全量+背压),
// 不再用 1MB 截断缓冲当转发体(>1MB 曾被截断转发导致 Content-Length 不符/挂起/数据损坏),
// 哈希只采样前 HASH_BUF_MAX; 响应也不再整包缓存(无流控内存膨胀)。
function proxyHttpRequest(req, res, sink) {
  const started = Date.now()
  let u
  try { u = new URL(req.url) } // 代理形态: 绝对 URL
  catch {
    // 复审#2: origin-form(GET /path)不是代理形态 → 400, 不再抛 TypeError 崩进程
    try { res.writeHead(400, { 'content-type': 'text/plain', connection: 'close' }); res.end('mitm: absolute-form URL required\n') } catch {}
    return
  }
  const reqSample = sink.sampler()
  req.on('data', (c) => reqSample.push(c)) // 旁路采样, 不碰转发路径
  const up = http.request({
    host: u.hostname, port: u.port || 80, path: u.pathname + u.search,
    method: req.method,
    headers: { ...stripHopHeaders(req.headers), host: u.host }, // 复审#8: 剥离逐跳头再转发
    agent: false, // 每请求独立连接, 便于 server.close 收尾
  }, (ur) => {
    const resSample = sink.sampler()
    ur.on('data', (c) => resSample.push(c))
    try { res.writeHead(ur.statusCode, stripHopHeaders(ur.headers)) } catch { try { ur.destroy() } catch {}; return }
    ur.pipe(res) // 全量流式转发(自带背压), 不截断不缓存
    ur.on('end', () => {
      sink.write({
        ts: new Date().toISOString(), kind: 'http', method: req.method,
        host: u.host, path: u.pathname + u.search, status: ur.statusCode,
        durationMs: Date.now() - started,
        req: reqSample.digest(), res: resSample.digest(),
      })
    })
    ur.on('error', () => { try { res.destroy() } catch {} })
  })
  up.on('error', () => { try { res.writeHead(502); res.end('mitm upstream error') } catch {} })
  req.on('error', () => { try { up.destroy() } catch {} }) // 客户端中途 RST: 请求流可能发 'error'
  req.pipe(up) // 请求体全量流式转发(自带背压)
}

// ---------- #46 openssl CA / 按域名签证书(缓存, 0700 目录), fail-closed ----------
export function makeCertFactory({ caDir, execFileImpl = execFile } = {}) {
  const run = (args) => new Promise((resolve, reject) =>
    execFileImpl('openssl', args, (err, stdout) => (err ? reject(err) : resolve(stdout))))
  let caPromise = null
  // 复审#6: ensureCa 懒初始化 + 单飞(并发复用进行中的 Promise), 失败后允许下次重试
  const ensureCa = () => {
    if (!caPromise) {
      caPromise = (async () => {
        mkdirSync(caDir, { recursive: true, mode: 0o700 })
        const key = join(caDir, 'ca.key'); const crt = join(caDir, 'ca.crt')
        if (!existsSync(crt) || !existsSync(key)) {
          await run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt,
            '-days', '3650', '-subj', '/CN=d2d-mitm-ca/O=d2d'])
          try { appendFileSync(join(caDir, 'ca.srl'), '1000\n', { mode: 0o600 }) } catch {}
        }
        return { key, crt }
      })()
      caPromise.catch(() => { caPromise = null })
    }
    return caPromise
  }
  const cache = new Map()
  const pending = new Map() // host → 进行中的签发 Promise(复审#6: 并发同 host 单飞, 不重复签)
  let chain = Promise.resolve() // 签发串行化: openssl -CAcreateserial 并发写 ca.srl 会竞态
  const signHost = (host) => {
    if (cache.has(host)) return Promise.resolve(cache.get(host))
    if (pending.has(host)) return pending.get(host)
    const p = chain.then(async () => {
      const { key, crt } = await ensureCa()
      const hostKey = join(caDir, `${host}.key`); const hostCrt = join(caDir, `${host}.crt`)
      if (!existsSync(hostCrt)) {
        const csr = join(caDir, `${host}.csr`)
        await run(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', hostKey, '-out', csr,
          '-subj', `/CN=${host}/O=d2d`])
        // 复审#7: 叶子证书必须带 subjectAltName(现代客户端拒纯 CN); IP 主机用 IP: 形态。
        // openssl x509 不支持 -addext(实测 3.6), 走 extfile 注入, 兼容 1.1.1+ 全系。
        const san = net.isIP(host) ? `IP:${host}` : `DNS:${host}`
        const ext = join(caDir, 'leaf.ext.cnf')
        try { appendFileSync(ext, `subjectAltName=${san}\n`, { mode: 0o600 }) } catch {}
        await run(['x509', '-req', '-in', csr, '-CA', crt, '-CAkey', key, '-CAcreateserial',
          '-days', '365', '-out', hostCrt, '-extfile', ext])
        try { appendFileSync(join(caDir, `${host}.signed`), new Date().toISOString() + '\n', { mode: 0o600 }) } catch {}
      }
      const ctx = { key: hostKey, crt: hostCrt }
      cache.set(host, ctx)
      return ctx
    })
    chain = p.then(() => {}, () => {}) // 失败不阻塞后续签发
    pending.set(host, p)
    const cleanup = () => pending.delete(host)
    p.then(cleanup, cleanup)
    return p
  }
  return { ensureCa, signHost }
}

// ---------- #48 RFC6455 帧解析纯函数(供测试) ----------
// 返回 { fin, opcode, masked, maskKey, payload(已去掩码), totalLen } ; 数据不完整返回 null
export function parseWebSocketFrame(buf) {
  if (buf.length < 2) return null
  const fin = (buf[0] & 0x80) !== 0
  const opcode = buf[0] & 0x0f
  const masked = (buf[1] & 0x80) !== 0
  let len = buf[1] & 0x7f
  let off = 2
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); off = 4 }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); off = 10 }
  const maskKey = masked ? buf.subarray(off, off + 4) : null
  if (masked) { off += 4; if (buf.length < off + len) return null }
  else if (buf.length < off + len) return null
  const payload = Buffer.from(buf.subarray(off, off + len))
  if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i & 3]
  return { fin, opcode, masked, maskKey, payload, totalLen: off + len }
}

// ---------- #48 WSS 帧审计(解密模式 + 显式开启才有) ----------
// 仅记录: 方向(c2s/s2c)、opcode、长度、文本帧(0x1)前 200B 摘要; 其余只记元数据。
export function makeWsAuditor(auditLog, { carryMax = WSS_CARRY_MAX } = {}) {
  mkdirSync(dirname(auditLog), { recursive: true, mode: 0o700 })
  const log = (ev) => { try { appendFileSync(auditLog, JSON.stringify(ev) + '\n', { mode: 0o600 }) } catch {} }
  const attach = (side, socket) => {
    let carry = Buffer.alloc(0)
    let dropped = 0
    socket.on('data', (chunk) => {
      carry = Buffer.concat([carry, chunk])
      while (true) {
        const f = parseWebSocketFrame(carry)
        if (!f) break
        carry = carry.subarray(f.totalLen)
        const ev = { ts: new Date().toISOString(), kind: 'wss', side, opcode: f.opcode, len: f.payload.length }
        if (f.opcode === 0x1) ev.textDigest = f.payload.subarray(0, 200).toString('base64') // 仅摘要不落明文
        log(ev)
      }
      // 复审#9: carry 无上限 → 1MB 上限; 坏帧/超大半帧超限即丢弃并打点, 内存有界
      if (carry.length > carryMax) {
        dropped++
        try { process.stderr.write(`[mitm] wss audit ${side} carry 超 ${carryMax}B(累计丢弃 ${dropped} 次), 丢弃重同步\n`) } catch {}
        carry = Buffer.alloc(0)
      }
    })
  }
  return { attach }
}

// ---------- #46 代理服务器工厂(可注入, 供测试) ----------
export function createMitmProxy(opts = {}) {
  const {
    port = 0, host = '127.0.0.1', eventsPath = defaultEventsPath(),
    tlsDecrypt = process.env.D2D_MITM_TLS === '1',
    wssAudit = process.env.D2D_MITM_WSS === '1',
    bodyMode = process.env.D2D_MITM_BODY === '1',
    caDir = process.env.D2D_MITM_CA_DIR ?? `${DATA_DIR}/mitm-ca`,
    certFactory,
  } = opts
  const sink = makeEventSink(eventsPath, bodyMode)
  const certs = certFactory ?? makeCertFactory({ caDir })
  const auditor = makeWsAuditor(`${dirname(eventsPath)}/wss-audit-${Date.now()}.jsonl`)
  const conns = new Set() // 连接跟踪: close() 时一并销毁, 便于进程收尾/测试

  const server = http.createServer((req, res) => proxyHttpRequest(req, res, sink))
  server.on('connection', (c) => { conns.add(c); c.on('close', () => conns.delete(c)) })
  server.on('connect', (req, clientSocket, head) => {
    // 复审#3: 处理器入口先挂 error/close 监听 — await 签证书期间客户端 RST
    // 不再是 unhandled 'error'(ECONNRESET) 崩进程
    clientSocket.on('error', () => { try { clientSocket.destroy() } catch {} })
    clientSocket.on('close', () => { try { clientSocket.destroy() } catch {} })
    const respondOk = () => {
      try { clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n') } catch {}
    }
    // 复审#9: IPv6 authority([::1]:443) 用 lastIndexOf(':') 解析
    const { host: h, port: port443 } = parseConnectAuthority(req.url)
    if (!tlsDecrypt) return tunnel(clientSocket, head, h, port443, respondOk) // 默认纯隧道
    // opt-in 解密: openssl 签证书失败 → fail-closed 退回纯隧道 + 告警
    certs.signHost(h).then(
      (ctx) => {
        if (clientSocket.destroyed) return // 签证书期间客户端已断开
        terminateTls({ clientSocket, head, host: h, port: port443, ctx, sink, auditor, wssAudit, respondOk })
      },
      (e) => {
        console.error(`[mitm] #46 openssl 不可用, CONNECT ${h} 保持纯隧道: ${e.message}`)
        if (!clientSocket.destroyed) tunnel(clientSocket, head, h, port443, respondOk)
      },
    )
  })
  return {
    server, eventsPath,
    listen: () => new Promise((resolve) => server.listen(port, host, () => resolve(server.address()))),
    close: () => new Promise((r) => {
      for (const c of conns) { try { c.destroy() } catch {} }
      server.close(() => r())
    }),
  }
}

function tunnel(clientSocket, head, host, port, respondOk) {
  const ok = respondOk ?? (() => {
    try { clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n') } catch {}
  })
  const up = net.connect(port, host, () => {
    ok()
    if (head?.length) up.write(head)
    up.pipe(clientSocket); clientSocket.pipe(up) // pipe 自带背压
  })
  // 复审#4: 双向生命周期联动 — 任一侧 error/close, 两侧都销毁(不留泄漏/悬挂)
  const kill = () => { try { up.destroy() } catch {}; try { clientSocket.destroy() } catch {} }
  up.on('error', kill)
  clientSocket.on('error', kill)
  clientSocket.on('close', kill)
  up.on('close', () => { if (!clientSocket.destroyed) clientSocket.destroy() })
}

// 解密模式: 对内做 TLS 终结, 对上游重新发起 TLS(rejectUnauthorized=false 拦截语义),
// 同时挂 #48 WSS 审计。
import tls from 'node:tls'
function terminateTls({ clientSocket, head, host, port, ctx, sink, auditor, wssAudit, respondOk }) {
  let key; let cert
  try { key = readFileSync(ctx.key); cert = readFileSync(ctx.crt) } catch {
    return tunnel(clientSocket, head, host, port, respondOk)
  }
  // 复审#5: head 是客户端紧随 CONNECT 发出的字节(TLS ClientHello 开头), 属于本地
  // TLSSocket 的流 — 必须回注 clientSocket(老实现误写进上游且未回注, 握手必挂);
  // 无法回注时退回纯隧道。
  if (head?.length) {
    try { clientSocket.unshift(head) } catch {
      return tunnel(clientSocket, head, host, port, respondOk)
    }
  }
  try { respondOk() } catch {}
  const started = Date.now()
  const tlsSocket = new tls.TLSSocket(clientSocket, { isServer: true, key, cert })
  const upstream = tls.connect({ host, port, servername: host, rejectUnauthorized: false })
  // 复审#4: 双向 close/error 联动 — 任一侧断开/出错, 两侧都 destroy
  const kill = () => { try { tlsSocket.destroy() } catch {}; try { upstream.destroy() } catch {} }
  tlsSocket.once('error', kill)
  upstream.once('error', kill)
  tlsSocket.once('close', kill)
  upstream.once('close', kill)
  // 复审#4: 转发改 pipe(自带背压) — 老实现手工 data→write 无背压, 会内存膨胀
  tlsSocket.pipe(upstream)
  upstream.pipe(tlsSocket)
  // #48: WSS 审计挂在明文侧(TLSSocket 'data' 即解密后明文; 上游 TLSSocket 同理),
  // 双向 c2s+s2c(复审#9: 老实现只审计 c2s), 默认关闭
  if (wssAudit) { auditor.attach('c2s', tlsSocket); auditor.attach('s2c', upstream) }
  tlsSocket.on('close', () => {
    sink.write({ ts: new Date().toISOString(), kind: 'tls-session', host, port, durationMs: Date.now() - started })
  })
}

// ---------- CLI 入口 ----------
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const argv = process.argv.slice(2)
  const arg = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt }
  const hostArg = argv.includes('--host') ? arg('--host', '127.0.0.1') : '127.0.0.1' // #46: 显式 --host 才放开
  // 复审#9: --port NaN/越界校验, 不再带着 NaN 端口往下走
  const portArg = arg('--port', '8888')
  const portNum = Number(portArg)
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    console.error(`[mitm] 非法 --port: ${portArg}(需要 1-65535)`)
    process.exit(2)
  }
  const proxy = createMitmProxy({
    port: portNum, host: hostArg,
    eventsPath: arg('--events', undefined) || defaultEventsPath(),
  })
  proxy.listen().then((a) => console.log(`[mitm] :${a.port} events=${proxy.eventsPath} tls=${process.env.D2D_MITM_TLS === '1'} wss=${process.env.D2D_MITM_WSS === '1'}`))
}
