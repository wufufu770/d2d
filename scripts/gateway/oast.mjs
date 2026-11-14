#!/usr/bin/env node
// oast.mjs — G2 带外回调服务(dnslog 式): HTTP + DNS(E-5) 双通道命中记录, 供盲注自主确认
// 盲打场景: blind XSS/SSRF/XXE/SSTI/反序列化 — HTTP 通道打 http://<host>/<eng>-<标记>;
//           DNS 通道(E-5)打 <标记>.<zone>(任意查询名即命中, 首段 label 归因到 finding)。
// 用法: P2P_OAST_PORT=8890 P2P_OAST_DNS_PORT=8853 nohup node oast.mjs &
//   DNS 上线两方式: ①公网部署: zone 的 NS 委托到本机(53 端口) ②实验室: 目标解析器指向本机(如 docker --dns 172.17.0.1, 自配端口 8853)
// 命中查询: curl 'http://127.0.0.1:8890/hits?tail=50'   (最近命中, label 聚合归因)
import http from 'node:http'
import dgram from 'node:dgram'
import os from 'node:os'
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
const PORT = parseInt(process.env.P2P_OAST_PORT ?? '8890', 10)
const DNS_PORT = parseInt(process.env.P2P_OAST_DNS_PORT ?? '0', 10) // 默认关闭, 显式开启
const DNS_IP = process.env.P2P_OAST_DNS_IP ?? '127.0.0.1' // A 记录应答值(指向回调收集端)
// R3: 数据外置 D2D_DATA_DIR(默认 ~/.d2d-data)
const DIR = process.env.P2P_OAST_DIR ?? `${process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/evidence/oast`
try { mkdirSync(DIR, { recursive: true }) } catch { /* 已记因: 尽力而为——目录已存在或创建失败, 不阻断回调服务启动 */ }
const LOG = `${DIR}/oast-${Date.now()}.jsonl`
const hit = (path, src) => {
  const entry = { ts: new Date().toISOString(), path, src }
  try { appendFileSync(LOG, JSON.stringify(entry) + '\n') } catch { /* 已记因: 尽力而为——单条命中落盘失败静默, 不阻断 DNS/HTTP 应答 */ }
  return entry
}

// ---------- E-5: 最小 DNS 应答器(零依赖) — 解析 question, A 查询回 P2P_OAST_DNS_IP, 查询名即命中记录 ----------
function parseQname(buf, off) {
  const labels = []
  let p = off
  while (p < buf.length) {
    const len = buf[p]
    if (len === 0) return { name: labels.join('.'), end: p + 1 }
    if ((len & 0xc0) !== 0 || p + 1 + len > buf.length) return { name: labels.join('.'), end: p + 1 }
    labels.push(buf.toString('ascii', p + 1, p + 1 + len))
    p += 1 + len
  }
  return { name: labels.join('.'), end: p }
}
function dnsAnswer(req, remote) {
  if (req.length < 12) return null
  const qd = req.readUInt16BE(4)
  if (qd < 1) return null
  const { name, end } = parseQname(req, 12)
  if (!name) return null
  const qtype = req.length >= end + 2 ? req.readUInt16BE(end) : 1
  hit(`dns:${name}`, `${remote.address}:dns-label=${name.split('.')[0]}`)
  const id = req.readUInt16BE(0)
  const head = Buffer.alloc(12)
  head.writeUInt16BE(id, 0)
  head.writeUInt16BE(0x8180, 2) // 标准应答+递归可用
  head.writeUInt16BE(1, 4) // qd
  head.writeUInt16BE(qtype === 1 ? 1 : 0, 6) // 仅 A 查询给应答记录
  const resp = [head, req.subarray(12, end + 4)] // 回显 question(name+qtype+qclass)
  if (qtype === 1) {
    const ans = Buffer.alloc(16)
    ans.writeUInt16BE(0xc00c, 0) // name 指针 → question
    ans.writeUInt16BE(1, 2) // type A
    ans.writeUInt16BE(1, 4) // class IN
    ans.writeUInt32BE(60, 6) // TTL 短: 支持 rebinding 类验证
    ans.writeUInt16BE(4, 10)
    ans.set(DNS_IP.split('.').map((x) => Number(x) & 0xff), 12)
    resp.push(ans)
  }
  return Buffer.concat(resp)
}
if (DNS_PORT > 0) {
  const udp = dgram.createSocket('udp4')
  udp.on('message', (msg, rinfo) => {
    try {
      const resp = dnsAnswer(msg, rinfo)
      if (resp) udp.send(resp, rinfo.port, rinfo.address)
    } catch { /* 已记因: 解析容错——畸形 DNS 报文解析失败跳过, 服务继续收下一个包 */ }
  })
  udp.bind(DNS_PORT, '127.0.0.1', () => console.log(`[oast] dns :${DNS_PORT} (A→${DNS_IP}) log=${LOG}`))
}

// ---------- HTTP 通道 + 命中查询 ----------
// E39-B4-2: WorkItems webhook source(E39 零新入站端口纪律——复用 oast 8890 面)。POST
// /hook/workitems(X-Auth=host-token 或 P2P_WORKITEM_HOOK_TOKEN 专用值) → 规范化落投递箱
// (D2D_DATA_DIR/sources/inbox/)——单一事实源路径, 插件 tick 拾取, workitems 语义零重复。
// 外部可达性=部署面(与 DNS 通道同构: loopback 实验室形态即用; 公网 SRC 平台部署随
// oast 公网部署规程)。token 比较用 timingSafeEqual(常量时间——本服务公网部署同形)。
import { timingSafeEqual } from 'node:crypto'
const HOOK_TOKEN = process.env.P2P_WORKITEM_HOOK_TOKEN
const INBOX_DIR = `${process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/sources/inbox`
const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a ?? ''))
  const bb = Buffer.from(String(b ?? ''))
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = ''
    req.on('data', (c) => { d += c; if (d.length > 1e6) { reject(new Error('body too large')); req.destroy() } })
    req.on('end', () => resolve(d))
    req.on('error', reject)
  })
}
http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0])
  if (p === '/hits') {
    const url = new URL(req.url, 'http://x')
    const tail = Math.min(Number(url.searchParams.get('tail') ?? '0'), 500)
    let rows = []
    try { rows = readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) } catch { /* 已记因: 降级路径——命中日志尚未生成时按空结果应答查询 */ }
    if (tail > 0) rows = rows.slice(-tail)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, log: LOG, hits: rows }))
  }
  if (p === '/hook/workitems' && req.method === 'POST') {
    const auth = req.headers['x-auth'] ?? ''
    const expected = HOOK_TOKEN ?? (() => { try { return readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim() } catch { return '' } })()
    if (!expected || !safeEqual(auth, expected)) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ ok: false, error: 'hook token required(X-Auth)' }))
    }
    readBody(req).then((raw) => {
      let doc = null
      try { doc = JSON.parse(raw) } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, error: 'invalid JSON' })) }
      const kind = String(doc?.kind ?? 'manual').trim().toLowerCase()
      const title = String(doc?.title ?? '').trim().slice(0, 200)
      if (!['retest', 'manual', 'general'].includes(kind) || !title) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ ok: false, error: 'kind 须 retest|manual|general 且 title 必填' }))
      }
      const name = `hook-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.json`
      const entry = {
        source: String(doc?.source ?? 'webhook'), kind, externalId: String(doc?.id ?? ''),
        title, author: String(doc?.author ?? ''), url: String(doc?.url ?? ''),
        payload: { ...(doc?.payload ?? {}), replay_result: String(doc?.payload?.replay_result ?? '') },
      }
      try {
        mkdirSync(INBOX_DIR, { recursive: true })
        appendFileSync(`${INBOX_DIR}/${name}`, JSON.stringify(entry) + '\n')
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ ok: false, error: `inbox 落箱失败: ${String(e?.message ?? e).slice(0, 120)}` }))
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, dropped: name, note: '插件 tick 拾取(≤P2P_WORKITEMS_INTERVAL_MS)' }))
    }).catch((e) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: String(e?.message ?? e).slice(0, 120) }))
    })
    return
  }
  const e = hit(p, req.socket.remoteAddress)
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end(`OAST-HIT ${e.ts}`)
}).listen(PORT, '127.0.0.1', () => console.log(`[oast] :${PORT} log=${LOG} hook=/hook/workitems(X-Auth)`))
