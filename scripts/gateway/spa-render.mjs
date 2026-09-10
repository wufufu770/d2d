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

// 中危审计修复(13): env 解析 NaN 兜底 — 旧版 parseInt 无回退, P2P_SPA_PORT=垃圾 → listen(NaN) 启动即崩
const _envInt = (v, dflt) => { const n = parseInt(v ?? '', 10); return Number.isFinite(n) && n > 0 && n <= 65535 ? n : dflt }
const PORT = _envInt(process.env.P2P_SPA_PORT, 8892)
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
// ---------- 0906 跨进程单例锁(skyline web-access 采纳): 两实例同端口各拉 chrome 必冲突 ----------
// H16 审计修复: 旧实现 statSync(新鲜度)后 writeFileSync 直接覆盖写 —— 检查与写非原子(TOCTOU),
// 两实例可同时读到「过期/不存在」再双双写入, 各自以为持锁。现改为 O_EXCL 独占创建
// (writeFileSync flag:'wx', 内核级原子 create): 竞争创建只有一个成功; 过期锁先删再抢,
// 删与建之间的窗口由 wx 兜底 —— 两实例同时抢删后的重建仍只有一个成功。
const SPA_LOCK = path.join(DATA_DIR, 'spa-render.lock') // export 供 pytest 对抗用例取路径/篡改 mtime
export { SPA_LOCK }
const LOCK_STALE_MS = 45_000
const LOCK_WAIT_MS = 30_000
let ownsLock = false
export function tryAcquireLock() {
  try {
    const st = fs.statSync(SPA_LOCK)
    if (Date.now() - st.mtimeMs < LOCK_STALE_MS) return false // 他者新鲜持有(崩溃残留按过期接管)
    try { fs.rmSync(SPA_LOCK, { force: true }) } catch {} // 过期残留: 先删, 下方 wx 独占重建
  } catch {} // 不存在: 直接独占创建
  try {
    fs.writeFileSync(SPA_LOCK, JSON.stringify({ pid: process.pid, at: Date.now() }), { flag: 'wx' })
    ownsLock = true
    return true
  } catch { return false } // EEXIST = 他者抢先持锁
}
export function releaseLock() {
  // H16 配套: 只释放自己持有的锁(旧实现 exit 钩子无条件 rm, 抢锁失败的进程退出会删掉胜者的锁)
  if (!ownsLock) return
  ownsLock = false
  try { fs.rmSync(SPA_LOCK, { force: true }) } catch {}
}
async function waitLock() {
  for (let i = 0; i < LOCK_WAIT_MS / 500; i++) {
    if (tryAcquireLock()) return true
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}
process.on('exit', releaseLock)

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
    // 单例: 本进程已持有 chrome 则免锁; 否则拿锁(带 30s 等待)再拉起 — 拿不到=他实例在跑
    if (!(tryAcquireLock() || (await waitLock()))) return null
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
// 中危审计修复(0910): 会话生命周期收敛 — 旧版 renderPage 建 ws + createTarget 后:
// ①导航/使能任一步抛错 → target 永不 close(chrome 里僵尸页累积); ②ws 从不 close →
// 每次渲染泄漏一条 WebSocket(及随行事件缓冲)。现 renderPage 统一 try/finally:
// finally 里 closeTarget(尽力) + ws.close; ws onclose 兜底清 pending, error 不再无监听。
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
    ws.onclose = () => { for (const fn of pending.values()) try { fn({ error: { message: 'cdp ws closed' } }) } catch {} ; pending.clear() }
    ws.onerror = () => {}
  }
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, (msg) => (msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)))
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }))
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`cdp timeout: ${method}`)) } }, 30_000)
  })
  const close = () => { try { if (ws && ws.readyState <= 1) ws.close() } catch {} }
  return { connect, send, events, close }
}

async function renderPage(url, waitMs) {
  const mode = await ensureChrome()
  if (!mode) throw new Error('chrome 不可用(未安装且未设 P2P_CDP_URL) — 安装 chromium 或 P2P_CHROME_PATH/P2P_CDP_URL 后重试')
  const c = cdpSession(cdpHttp)
  await c.connect()
  let targetId = null
  try {
    ;({ targetId } = await c.send('Target.createTarget', { url: 'about:blank' }))
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
    return extractEndpoints(net, domLinks)
  } finally {
    // 中危审计修复(0910): 断开/异常路径统一清理 — 关 target + 关 ws, 无僵尸页无 socket 泄漏
    try { if (targetId) await c.send('Target.closeTarget', { targetId }) } catch {}
    c.close()
  }
}

// ---------- 图写入(MERGE 去重, tech=spa-cdp) ----------
// H15 审计修复: 旧实现把 url/method 字符串拼接进 Cypher, url 的 ' 用 \\' 转义 ——
// Kuzu/openCypher 标准转义是 '' 双写, 前置反斜杠可被绕过: url 以单个 \ 结尾时(无 ' 可转义,
// 原样落串)把闭合引号吞成 \' 转义, 字符串边界后移, 后续文本变代码; method 完全未转义。
// 现改为参数化: Cypher 文本只含 $占位符, 全部外部输入走 graphd /query 原生 params
// (服务端按字面值绑定, 不再进入语法解析), 注入面归零。导出纯函数供 pytest 对抗用例锁定。
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'])
export function normalizeMethod(m) {
  const s = String(m ?? '').trim().toUpperCase()
  return HTTP_METHODS.has(s) ? s : 'GET' // 白名单外(渲染页面可影响的 XHR method)一律归 GET
}
export function endpointWritePayload(e) {
  return {
    cypher: "MERGE (e:Endpoint {id:$id}) SET e.url=$url, e.method=$method, e.tech=coalesce(e.tech,'spa-cdp')",
    params: { id: String(e.id), url: String(e.url), method: normalizeMethod(e.method) },
  }
}
function writeEndpoints(port, endpoints) {
  let n = 0
  for (const e of endpoints.slice(0, 200)) {
    const id = `ep-${crypto.createHash('sha1').update(e.url).digest('hex').slice(0, 10)}`
    try {
      const payload = endpointWritePayload({ id, url: e.url, method: e.method })
      execFileSync('curl', ['-s', '-m', '8', '-X', 'POST', `http://127.0.0.1:${port}/query`, '-H', 'Content-Type: application/json',
        '-H', `X-Auth: ${hostToken}`, '-d', JSON.stringify(payload)], { encoding: 'utf8' })
      n++
    } catch {}
  }
  return n
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
// cdpSession 导出仅供测试(issues-0910: 会话清理回归用 fake WebSocket 注入)
export { cdpSession }
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
