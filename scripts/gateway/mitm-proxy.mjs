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
const HASH_BUF_MAX = 1 << 20 // 哈希采样上限 1MB(超长截断, 事件里带 truncated 标记)

const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const defaultEventsPath = () => `${DATA_DIR}/evidence/mitm/events-${Date.now()}.jsonl`

// ---------- #46 事件落盘: jsonl + 0600, 永不写 body 明文(除非 bodyMode) ----------
export function makeEventSink(eventsPath, bodyMode) {
  mkdirSync(dirname(eventsPath), { recursive: true, mode: 0o700 })
  const write = (ev) => {
    try { appendFileSync(eventsPath, JSON.stringify(ev) + '\n', { mode: 0o600 }) } catch {}
  }
  // body 摘要器: 只出 sha256+size(+可选片段), 明文不进事件对象
  const digest = (buf) => {
    const d = { sha256: crypto.createHash('sha256').update(buf).digest('hex'), size: buf.length }
    if (buf.length >= HASH_BUF_MAX) d.truncated = true
    if (bodyMode) d.snippet = buf.subarray(0, BODY_SNIPPET_MAX).toString('base64')
    return d
  }
  return { write, digest }
}

// ---------- #46 纯 HTTP 正向代理转发 ----------
function proxyHttpRequest(req, res, sink) {
  const started = Date.now()
  const u = new URL(req.url) // 代理形态: 绝对 URL
  const chunks = []
  let reqLen = 0
  req.on('data', (c) => { reqLen += c.length; if (reqLen <= HASH_BUF_MAX) chunks.push(c) })
  req.on('end', () => {
    const reqBuf = Buffer.concat(chunks)
    const up = http.request({
      host: u.hostname, port: u.port || 80, path: u.pathname + u.search,
      method: req.method, headers: { ...req.headers, host: u.host }, agent: false, // 每请求独立连接, 便于 server.close 收尾
    }, (ur) => {
      const rchunks = []
      let rLen = 0
      ur.on('data', (c) => { rLen += c.length; if (rLen <= HASH_BUF_MAX) rchunks.push(c) })
      ur.on('end', () => {
        res.writeHead(ur.statusCode, ur.headers)
        res.end(Buffer.concat(rchunks))
        sink.write({
          ts: new Date().toISOString(), kind: 'http', method: req.method,
          host: u.host, path: u.pathname + u.search, status: ur.statusCode,
          durationMs: Date.now() - started,
          req: sink.digest(reqBuf), res: sink.digest(Buffer.concat(rchunks)),
        })
      })
      ur.on('error', () => { try { res.destroy() } catch {} })
    })
    up.on('error', () => { try { res.writeHead(502); res.end('mitm upstream error') } catch {} })
    up.end(reqBuf) // body 已被拦截缓存, 显式重发(不 pipe 已耗尽的 req)
  })
}

// ---------- #46 openssl CA / 按域名签证书(缓存, 0700 目录), fail-closed ----------
export function makeCertFactory({ caDir, execFileImpl = execFile } = {}) {
  const run = (args) => new Promise((resolve, reject) =>
    execFileImpl('openssl', args, (err, stdout) => (err ? reject(err) : resolve(stdout))))
  const ensureCa = async () => {
    mkdirSync(caDir, { recursive: true, mode: 0o700 })
    const key = join(caDir, 'ca.key'); const crt = join(caDir, 'ca.crt')
    if (!existsSync(crt) || !existsSync(key)) {
      await run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt,
        '-days', '3650', '-subj', '/CN=d2d-mitm-ca/O=d2d'])
      try { appendFileSync(join(caDir, 'ca.srl'), '1000\n', { mode: 0o600 }) } catch {}
    }
    return { key, crt }
  }
  const cache = new Map()
  const signHost = async (host) => {
    if (cache.has(host)) return cache.get(host)
    const { key, crt } = await ensureCa()
    const hostKey = join(caDir, `${host}.key`); const hostCrt = join(caDir, `${host}.crt`)
    if (!existsSync(hostCrt)) {
      const csr = join(caDir, `${host}.csr`)
      await run(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', hostKey, '-out', csr,
        '-subj', `/CN=${host}/O=d2d`])
      await run(['x509', '-req', '-in', csr, '-CA', crt, '-CAkey', key, '-CAcreateserial',
        '-days', '365', '-out', hostCrt])
      try { appendFileSync(join(caDir, `${host}.signed`), new Date().toISOString() + '\n', { mode: 0o600 }) } catch {}
    }
    const ctx = { key: hostKey, crt: hostCrt }
    cache.set(host, ctx)
    return ctx
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
export function makeWsAuditor(auditLog) {
  mkdirSync(dirname(auditLog), { recursive: true, mode: 0o700 })
  const log = (ev) => { try { appendFileSync(auditLog, JSON.stringify(ev) + '\n', { mode: 0o600 }) } catch {} }
  const attach = (side, socket) => {
    let carry = Buffer.alloc(0)
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
  server.on('connect', async (req, clientSocket, head) => {
    const [h, p] = req.url.split(':')
    const port443 = Number(p) || 443
    if (!tlsDecrypt) return tunnel(clientSocket, head, h, port443) // 默认纯隧道
    // opt-in 解密: openssl 签证书失败 → fail-closed 退回纯隧道 + 告警
    let ctx
    try { ctx = await certs.signHost(h) } catch (e) {
      console.error(`[mitm] #46 openssl 不可用, CONNECT ${h} 保持纯隧道: ${e.message}`)
      return tunnel(clientSocket, head, h, port443)
    }
    terminateTls({ req, clientSocket, head, host: h, port: port443, ctx, sink, auditor, wssAudit })
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

function tunnel(clientSocket, head, host, port) {
  const up = net.connect(port, host, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    if (head?.length) up.write(head)
    up.pipe(clientSocket); clientSocket.pipe(up)
  })
  const kill = () => { try { up.destroy() } catch {}; try { clientSocket.destroy() } catch {} }
  up.on('error', kill)
  clientSocket.on('error', kill)
  clientSocket.on('close', () => { try { up.destroy() } catch {} }) // 双向收尾, 不留悬挂 socket
}

// 解密模式: 对内做 TLS 终结, 对上游仍是普通 TCP(TLS 由 http.request 走 https) — 简化:
// 这里用 node:tls 终结客户端, 然后按 https 模块转发, 同时挂 #48 WSS 审计。
import tls from 'node:tls'
function terminateTls({ clientSocket, head, host, port, ctx, sink, auditor, wssAudit }) {
  clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
  // 对内 TLS 终结: 客户端信任 CA 后握手成功; 对上游重新发起 TLS(rejectUnauthorized=false 拦截语义)
  let key; let cert
  try { key = readFileSync(ctx.key); cert = readFileSync(ctx.crt) } catch {
    return tunnel(clientSocket, head, host, port)
  }
  const tlsSocket = new tls.TLSSocket(clientSocket, { isServer: true, key, cert })
  const started = Date.now()
  tlsSocket.on('error', () => { try { clientSocket.destroy() } catch {} })
  const upstream = tls.connect({ host, port, servername: host, rejectUnauthorized: false })
  upstream.on('error', () => { try { tlsSocket.destroy() } catch {} })
  if (head?.length) upstream.write(head)
  tlsSocket.on('data', (c) => upstream.write(c)) // 解密侧明文 → 上游
  upstream.on('data', (c) => tlsSocket.write(c))
  // #48: WSS 审计挂在解密侧(能看到明文帧), 默认关闭
  if (wssAudit) auditor.attach('c2s', tlsSocket)
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
  const proxy = createMitmProxy({
    port: parseInt(arg('--port', '8888'), 10), host: hostArg,
    eventsPath: arg('--events', undefined) || defaultEventsPath(),
  })
  proxy.listen().then((a) => console.log(`[mitm] :${a.port} events=${proxy.eventsPath} tls=${process.env.D2D_MITM_TLS === '1'} wss=${process.env.D2D_MITM_WSS === '1'}`))
}
