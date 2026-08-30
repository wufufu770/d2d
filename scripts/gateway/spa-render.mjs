#!/usr/bin/env node
// spa-render.mjs — E-7 SPA 渲染执行器: CDP 驱动 headless chrome, 提取 JS 渲染后的端点(DOM 链接 + XHR/fetch)
//                   并可选写入 Kuzu 图(Endpoint 节点, tech='spa-cdp'), 补齐 katana 爬不到的渲染后面。
// 用法: P2P_SPA_PORT=8892 nohup node spa-render.mjs &
//   chrome 来源(二选一, 都缺则服务降级 ready=false, /render 返 503):
//   ①P2P_CDP_URL=http://127.0.0.1:9222  附着已运行的 chrome(--remote-debugging-port=9222)
//   ②P2P_CHROME_PATH=/usr/bin/chromium  由本服务拉起(headless)
//   写图: POST /render body {"url":"...", "graph":true, "port":"8766"} → 渲染端点 MERGE 进图(去重)
// 健康: GET /health → {ok, ready, chrome}
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn, execFileSync } from 'node:child_process'

const PORT = parseInt(process.env.P2P_SPA_PORT ?? '8892', 10)
const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const hostToken = (() => { try { return fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim() } catch { return '' } })()

// ---------- 纯函数: 渲染产物 → 端点清单(去重/分类), 单测锁定 ----------
export function extractEndpoints(networkEvents = [], domLinks = []) {
  const seen = new Map()
  const add = (url, method, via) => {
    try {
      const u = new URL(url)
      if (!/^https?:$/.test(u.protocol)) return
      const key = `${u.origin}${u.pathname}${u.search}`
      if (!seen.has(key)) seen.set(key, { url: key, method: method || 'GET', via })
    } catch {}
  }
  for (const e of networkEvents) if (e?.url) add(e.url, e.method, e.type === 'XHR' || e.type === 'Fetch' ? 'xhr' : 'doc')
  for (const l of domLinks) if (l) add(l, 'GET', 'dom')
  return [...seen.values()]
}

// ---------- chrome 发现与拉起 ----------
let chromeProc = null
let cdpHttp = process.env.P2P_CDP_URL ?? ''
function findChrome() {
  if (process.env.P2P_CHROME_PATH) return process.env.P2P_CHROME_PATH
  for (const b of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try { return execFileSync('which', [b], { encoding: 'utf8' }).trim() } catch {}
  }
  return ''
}
async function ensureChrome() {
  if (cdpHttp) {
    try {
      const r = await fetch(`${cdpHttp}/json/version`, { signal: AbortSignal.timeout(2000) })
      if (r.ok) return 'attached'
      return null
    } catch { return null }
  }
  const bin = findChrome()
  if (!bin) return null
  if (!chromeProc) {
    const port = 9333 + (process.pid % 100)
    chromeProc = spawn(bin, ['--headless=new', `--remote-debugging-port=${port}`, '--no-first-run', '--no-sandbox', '--disable-gpu', `--user-data-dir=${DATA_DIR}/spa-profile`], { stdio: 'ignore' })
    chromeProc.on('exit', () => { chromeProc = null })
    cdpHttp = `http://127.0.0.1:${port}`
    for (let i = 0; i < 60; i++) { // R4c: 冷启动窗口 6s→30s(首启建 profile 曾超窗)
      await new Promise((r) => setTimeout(r, 500))
      if (await ensureChromeRaw()) break
    }
  }
  return 'launched'
}
async function ensureChromeRaw() {
  try { const r = await fetch(`${cdpHttp}/json/version`, { signal: AbortSignal.timeout(1000) }); return r.ok } catch { return false }
}

// ---------- CDP 最小驱动(native WebSocket, 零依赖) ----------
function cdpSession(cdpHttp) {
  let seq = 0
  const pending = new Map()
  const events = []
  let ws = null
  async function connect() {
    const ver = await (await fetch(`${cdpHttp}/json/version`)).json()
    ws = new WebSocket(ver.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data)
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
      else if (msg.method) events.push(msg)
    }
  }
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, (msg) => (msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)))
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }))
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`cdp timeout: ${method}`)) } }, 30_000)
  })
  return { connect, send, events }
}

async function renderPage(url, waitMs) {
  const mode = await ensureChrome()
  if (!mode) throw new Error('chrome 不可用(未安装且未设 P2P_CDP_URL) — 安装 chromium 或 P2P_CHROME_PATH/P2P_CDP_URL 后重试')
  const c = cdpSession(cdpHttp)
  await c.connect()
  const { targetId } = await c.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true })
  await c.send('Page.enable', {}, sessionId)
  await c.send('Network.enable', {}, sessionId)
  const net = []
  const onMsg = (msg) => { if (msg.method === 'Network.requestWillBeSent') { const r = msg.params.request; net.push({ url: r.url, method: r.method, type: msg.params.type }) } }
  c.events.push = Array.prototype.push.bind(c.events) // keep default
  const origPush = c.events.push.bind(c.events)
  c.events.push = (m) => { try { onMsg(m) } catch {} ; return origPush(m) }
  await c.send('Page.navigate', { url }, sessionId)
  await new Promise((r) => setTimeout(r, waitMs || 4000))
  let domLinks = []
  try {
    const ev = await c.send('Runtime.evaluate', { expression: `[...new Set([...document.querySelectorAll('a[href]')].map(a => a.href))].slice(0,300)`, returnByValue: true }, sessionId)
    domLinks = ev.result?.value ?? []
  } catch {}
  try { await c.send('Target.closeTarget', { targetId }) } catch {}
  return extractEndpoints(net, domLinks)
}

// ---------- 图写入(MERGE 去重, tech=spa-cdp) ----------
function writeEndpoints(port, endpoints) {
  let n = 0
  for (const e of endpoints.slice(0, 200)) {
    const id = `ep-${crypto.createHash('sha1').update(e.url).digest('hex').slice(0, 10)}`
    try {
      execFileSync('curl', ['-s', '-m', '8', '-X', 'POST', `http://127.0.0.1:${port}/query`, '-H', 'Content-Type: application/json',
        '-H', `X-Auth: ${hostToken}`, '-d', JSON.stringify({ cypher:
          `MERGE (e:Endpoint {id:'${id}'}) SET e.url='${e.url.replace(/'/g, "\\'")}', e.method='${e.method}', e.tech=coalesce(e.tech,'spa-cdp')` })], { encoding: 'utf8' })
      n++
    } catch {}
  }
  return n
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) {
  http.createServer(async (req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) }
  if (req.method === 'GET' && req.url === '/health') {
    const ready = !!(await ensureChrome())
    return send(200, { ok: true, ready, chrome: ready ? (cdpHttp) : 'unavailable(安装 chromium 或设 P2P_CDP_URL)' })
  }
  if (req.method === 'POST' && req.url.split('?')[0] === '/render') {
    let body = ''
    req.on('data', (d) => { body += d; if (body.length > 100_000) req.destroy() })
    req.on('end', async () => {
      try {
        const { url, waitMs, graph, port: gport } = JSON.parse(body || '{}')
        if (!/^https?:\/\//.test(String(url ?? ''))) return send(400, { ok: false, error: 'url required(http/https)' })
        const endpoints = await renderPage(url, waitMs)
        const written = graph ? writeEndpoints(gport ?? '8766', endpoints) : 0
        send(200, { ok: true, url, count: endpoints.length, endpoints: endpoints.slice(0, 100), graph_written: written })
      } catch (e) { send(e.message.includes('chrome') ? 503 : 500, { ok: false, error: String(e.message).slice(0, 300) }) }
    })
    return
  }
  send(404, { error: 'unknown' })
}).listen(PORT, '127.0.0.1', () => console.log(`[spa-render] :${PORT} chrome=${process.env.P2P_CDP_URL ?? process.env.P2P_CHROME_PATH ?? '(auto)'}`))
}
