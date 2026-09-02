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
try { mkdirSync(DIR, { recursive: true }) } catch {}
const LOG = `${DIR}/oast-${Date.now()}.jsonl`
const hit = (path, src) => {
  const entry = { ts: new Date().toISOString(), path, src }
  try { appendFileSync(LOG, JSON.stringify(entry) + '\n') } catch {}
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
    } catch {}
  })
  udp.bind(DNS_PORT, '127.0.0.1', () => console.log(`[oast] dns :${DNS_PORT} (A→${DNS_IP}) log=${LOG}`))
}

// ---------- HTTP 通道 + 命中查询 ----------
http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0])
  if (p === '/hits') {
    const url = new URL(req.url, 'http://x')
    const tail = Math.min(Number(url.searchParams.get('tail') ?? '0'), 500)
    let rows = []
    try { rows = readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) } catch {}
    if (tail > 0) rows = rows.slice(-tail)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, log: LOG, hits: rows }))
  }
  const e = hit(p, req.socket.remoteAddress)
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end(`OAST-HIT ${e.ts}`)
}).listen(PORT, '127.0.0.1', () => console.log(`[oast] :${PORT} log=${LOG}`))
