#!/usr/bin/env node
// oast.mjs — G2 带外回调服务(dnslog 式): 记录 HTTP/DNS 式回调命中, 供盲注(blind XSS/SSRF/XXE)自主确认
// 用法: P2P_OAST_PORT=8890 nohup node oast.mjs &   回调主机由 bore 隧道暴露: bore local 8890 --to bore.pub
// 命中查询: curl http://127.0.0.1:8890/hits  (按 <eng>-<标记> 前缀聚合)
import http from 'node:http'
import os from 'node:os'
import { appendFileSync, mkdirSync } from 'node:fs'
const PORT = parseInt(process.env.P2P_OAST_PORT ?? '8890', 10)
// R3: 数据外置 D2D_DATA_DIR(默认 ~/.d2d-data)
const DIR = process.env.P2P_OAST_DIR ?? `${process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/evidence/oast`
try { mkdirSync(DIR, { recursive: true }) } catch {}
const LOG = `${DIR}/oast-${Date.now()}.jsonl`
const hit = (path, src) => {
  const entry = { ts: new Date().toISOString(), path, src }
  try { appendFileSync(LOG, JSON.stringify(entry) + '\n') } catch {}
  return entry
}
http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0])
  if (p === '/hits') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, log: LOG }))
  }
  const e = hit(p, req.socket.remoteAddress)
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end(`OAST-HIT ${e.ts}`)
}).listen(PORT, '127.0.0.1', () => console.log(`[oast] :${PORT} log=${LOG}`))
