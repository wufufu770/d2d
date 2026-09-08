#!/usr/bin/env node
// cdp-proxy.mjs — 浏览器 CDP 执行面(P2/M5, web-access 形态采纳 + d2d 安全模型强化):
//   worker 用既有受控 curl 调本代理的 REST 端点操作浏览器(登录态/JS 渲染/交互), 宿主管进程生命周期。
// 安全边界(全部在本层强制, 不依赖浏览器/MCP flag — playwright-mcp 官方承认 flag 非安全边界):
//   ①X-Auth = host-token 或 worker-token(复用图通道凭据) ②域名白名单 = 静态 P2P_PROXY_ALLOW ∪
//   graphd 动态 scope(30s 刷新, 与 egress-gateway 同源) ③CDP Fetch.enable 请求级拦截 — 非白名单
//   导航/子资源/重定向一律 AccessDenied(含页面内 JS 触发的跳转) ④仅绑 127.0.0.1 ⑤浏览器 profile
//   per-engagement 独立目录, 绝不附着用户日常 profile(凭据隔离 + 单实例锁)。
// 用法: P2P_CDP_PROXY_PORT=8893 nohup node cdp-proxy.mjs &
//   chrome 来源: P2P_CDP_URL=http://127.0.0.1:9222 附着 | 自动找 chrome 拉起(headless, 可 P2P_CDP_HEADED=1)
// 端点: /health /targets /new /navigate /eval /click /clickAt /fill /scroll /screenshot /close (X-Auth)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { execFileSync, spawn } from 'node:child_process'
import { buildMatcher } from './scope-match.mjs'

const PORT = parseInt(process.env.P2P_CDP_PROXY_PORT ?? '8893', 10)
const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const ENG = process.env.P2P_CDP_ENG ?? 'default'
const GRAPHS = (process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766').split(',').map((s) => s.trim()).filter(Boolean)
const STATIC_ALLOW = new Set((process.env.P2P_PROXY_ALLOW ?? '127.0.0.1,localhost').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  .concat((process.env.P2P_CDP_ALLOW ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)))
const EVIDENCE_DIR = `${DATA_DIR}/evidence/cdp`
try { fs.mkdirSync(EVIDENCE_DIR, { recursive: true }) } catch {}
const auditLog = `${EVIDENCE_DIR}/audit.jsonl`
const audit = (e) => { try { fs.appendFileSync(auditLog, JSON.stringify({ ts: new Date().toISOString(), ...e }) + '\n') } catch {} }

const readToken = (p) => { try { return fs.readFileSync(p, 'utf8').trim() } catch { return '' } }
const TOKENS = new Set([readToken(`${os.homedir()}/.config/d2d/host-token`), readToken(`${os.homedir()}/.config/d2d/worker-token`)].filter(Boolean))

// ---- 域名白名单(纯函数在 scope-match.mjs, 单测锁定; 静态 ∪ graphd 动态 scope 30s 刷新) ----
let dynScope = new Set()
const graphToken = readToken(`${os.homedir()}/.config/d2d/host-token`)
async function refreshScope() {
  const next = new Set()
  for (const G of GRAPHS) {
    try {
      const res = await fetch(`${G}/query`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth': graphToken },
        body: JSON.stringify({ cypher: "MATCH (e:Engagement) WHERE e.status='active' RETURN e.scope AS s" }),
        signal: AbortSignal.timeout(5000),
      })
      const data = await res.json()
      for (const r of data.rows ?? []) {
        for (const s of String(r.s ?? '').split(',')) {
          const v = s.trim().toLowerCase()
          if (!v) continue
          next.add(v)
          if (!v.includes('/') && !/^\d+\.\d+\.\d+\.\d+$/.test(v)) next.add(`.${v}`) // '.域' = 含全部子域
        }
      }
    } catch { /* 单图抖动保留其余 */ }
  }
  dynScope = next
}
refreshScope(); setInterval(refreshScope, 30_000)
const scopeAllowed = buildMatcher([...STATIC_ALLOW], () => dynScope)

// ---- chrome 发现/拉起(per-engagement profile + 单例锁, spa-render 同款) ----
let chromeProc = null
let cdpHttp = process.env.P2P_CDP_URL ?? ''
const PROFILE_DIR = `${DATA_DIR}/cdp-profiles/${ENG.replace(/[^\w.-]/g, '_')}`
function findChrome() {
  if (process.env.P2P_CHROME_PATH) return process.env.P2P_CHROME_PATH
  for (const b of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try { return execFileSync('which', [b], { encoding: 'utf8' }).trim() } catch {}
  }
  return ''
}
const LOCK = `${DATA_DIR}/cdp-proxy-${ENG.replace(/[^\w.-]/g, '_')}.lock`
function tryAcquireLock() {
  try { if (Date.now() - fs.statSync(LOCK).mtimeMs < 45_000) return false } catch {}
  try { fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: Date.now() })); return true } catch { return false }
}
process.on('exit', () => { try { fs.rmSync(LOCK, { force: true }) } catch {} })

async function chromeAlive() {
  if (!cdpHttp) return false
  try { return (await fetch(`${cdpHttp}/json/version`, { signal: AbortSignal.timeout(1500) })).ok } catch { return false }
}
async function ensureChrome() {
  if (await chromeAlive()) return true
  if (process.env.P2P_CDP_URL) return false // 指定的附着端不可用 — 不自行拉起
  const bin = findChrome()
  if (!bin || !tryAcquireLock()) return false
  fs.mkdirSync(PROFILE_DIR, { recursive: true })
  const port = 9400 + (process.pid % 400)
  chromeProc = spawn(bin, [
    process.env.P2P_CDP_HEADED === '1' ? '--start-maximized' : '--headless=new',
    `--remote-debugging-port=${port}`, `--user-data-dir=${PROFILE_DIR}`,
    '--no-first-run', '--no-sandbox', '--disable-gpu', '--window-size=1440,900',
  ], { stdio: 'ignore' })
  chromeProc.on('exit', () => { chromeProc = null; cdpHttp = '' })
  cdpHttp = `http://127.0.0.1:${port}`
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500))
    if (await chromeAlive()) return true
  }
  return false
}

// ---- CDP 最小驱动(浏览器级 WS + flatten 会话池 + Fetch 拦截), 零依赖 native WebSocket ----
let ws = null
let seq = 0
const pending = new Map()
const sessions = new Map() // targetId → sessionId
async function connectBrowser() {
  if (ws && ws.readyState === 1) return
  const ver = await (await fetch(`${cdpHttp}/json/version`)).json()
  ws = new WebSocket(ver.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result) }
    else if (msg.method === 'Fetch.requestPaused') onFetchPaused(msg)
  }
}
function send(method, params = {}, sessionId = undefined, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }))
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`cdp timeout: ${method}`)) } }, timeoutMs)
  })
}
async function ensureSession(targetId) {
  if (sessions.has(targetId)) return sessions.get(targetId)
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Page.enable', {}, sessionId)
  // 请求级 scope 拦截: 导航/子资源/重定向全过本闸 — 非 scope 一律 AccessDenied(fail-closed)
  await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, sessionId)
  sessions.set(targetId, sessionId)
  return sessionId
}
function onFetchPaused(msg) {
  const url = String(msg.params?.request?.url ?? '')
  const allowed = scopeAllowed(url)
  audit({ event: allowed ? 'fetch-allow' : 'fetch-deny', url: url.slice(0, 200) })
  send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', allowed ? { requestId: msg.params.requestId } : { requestId: msg.params.requestId, errorReason: 'AccessDenied' }, msg.sessionId).catch(() => {})
}

// ---- REST 端点实现 ----
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) }
const readBody = (req) => new Promise((resolve, reject) => {
  let b = ''
  req.on('data', (d) => { b += d; if (b.length > 1_000_000) reject(new Error('body too large')) })
  req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}) } catch (e) { reject(new Error('bad json')) } })
  req.on('error', reject)
})
const evalInPage = async (targetId, expression) => {
  const sessionId = await ensureSession(targetId)
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
  return r?.result?.value ?? null
}

const server = http.createServer(async (req, res) => {
  req.on('error', () => {}); res.on('error', () => {})
  const u = new URL(req.url, 'http://127.0.0.1')
  const route = u.pathname.replace(/\/+$/, '') || '/'
  if (route === '/health') {
    // 只探测不拉起 — 健康检查不应有拉起 chrome 的副作用(首次懒拉起发生在首个业务调用)
    const alive = cdpHttp ? await chromeAlive().catch(() => false) : false
    return json(res, 200, { ok: true, ready: alive, eng: ENG, cdp: cdpHttp || null, scope: [...dynScope].length, profiles: PROFILE_DIR })
  }
  // 鉴权: host/worker token 二选一(worker 走 P2P_WORKER_TOKEN, 面板/宿主走 host-token)
  const tok = String(req.headers['x-auth'] ?? '')
  if (!TOKENS.has(tok)) { audit({ event: 'auth-deny', route }); return json(res, 401, { ok: false, error: 'X-Auth required' }) }
  if (!await ensureChrome().catch(() => false)) return json(res, 503, { ok: false, error: 'chrome 不可用(未装且未设 P2P_CDP_URL)' })
  try { await connectBrowser() } catch (e) { return json(res, 502, { ok: false, error: `CDP 连接失败: ${e.message}` }) }

  try {
    if (route === '/targets' && req.method === 'GET') {
      const list = await (await fetch(`${cdpHttp}/json`)).json()
      return json(res, 200, { ok: true, targets: list.filter((t) => t.type === 'page').map((t) => ({ targetId: t.id, url: t.url, title: t.title })) })
    }
    const body = req.method === 'POST' ? await readBody(req) : {}
    if (route === '/new') {
      const url = String(body.url ?? 'about:blank')
      if (url !== 'about:blank' && !scopeAllowed(url)) { audit({ event: 'deny', route, url }); return json(res, 403, { ok: false, error: `URL 不在 scope: ${url.slice(0, 120)}` }) }
      const { targetId } = await send('Target.createTarget', { url })
      await ensureSession(targetId)
      return json(res, 200, { ok: true, targetId })
    }
    const targetId = String(body.target ?? '')
    if (!targetId || !sessions.has(targetId)) {
      // 未 attach 的既有 target(如 /targets 看到的) — 首次调用时惰性挂载
      if (targetId) await ensureSession(targetId)
      else return json(res, 400, { ok: false, error: '缺 target(先 /new 或 /targets 取)' })
    }
    const sessionId = sessions.get(targetId)
    switch (route) {
      case '/navigate': {
        const url = String(body.url ?? '')
        if (!scopeAllowed(url)) { audit({ event: 'deny', route, url }); return json(res, 403, { ok: false, error: `URL 不在 scope: ${url.slice(0, 120)}` }) }
        await send('Page.navigate', { url }, sessionId)
        return json(res, 200, { ok: true })
      }
      case '/eval':
        return json(res, 200, { ok: true, value: await evalInPage(targetId, String(body.expression ?? 'document.title')) })
      case '/click': {
        const sel = String(body.selector ?? '')
        const hit = await evalInPage(targetId, `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.scrollIntoView({block:'center'}); el.click(); return true })()`)
        return json(res, 200, { ok: Boolean(hit), hit: Boolean(hit) })
      }
      case '/clickAt': {
        const x = Number(body.x ?? 0), y = Number(body.y ?? 0)
        for (const [type, btn] of [['mousePressed', 'down'], ['mouseReleased', 'up']]) {
          await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, sessionId)
        }
        return json(res, 200, { ok: true })
      }
      case '/fill': {
        const sel = String(body.selector ?? ''), value = String(body.value ?? '')
        const okFill = await evalInPage(targetId, `(() => {
          const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false
          const set = Object.getOwnPropertyDescriptor(el.__proto__, 'value')?.set
          ;(set ?? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set).call(el, ${JSON.stringify(value)})
          el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }))
          return true })()`)
        return json(res, 200, { ok: Boolean(okFill) })
      }
      case '/scroll': {
        const y = Number(body.y ?? 600)
        await evalInPage(targetId, body.selector
          ? `document.querySelector(${JSON.stringify(String(body.selector))})?.scrollIntoView({block:'center'}); true`
          : `window.scrollTo(0, ${Number.isFinite(y) ? y : 600}); true`)
        return json(res, 200, { ok: true })
      }
      case '/screenshot': {
        const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId, 20_000)
        const file = path.join(EVIDENCE_DIR, `${ENG}-${Date.now()}.png`)
        fs.writeFileSync(file, Buffer.from(data, 'base64'))
        audit({ event: 'screenshot', file, host: (() => { try { return new URL(body.url ?? 'x', 'http://x').host } catch { return '' } })() })
        return json(res, 200, { ok: true, file, bytes: Buffer.from(data, 'base64').length })
      }
      case '/close': {
        await send('Target.closeTarget', { targetId }).catch(() => {})
        sessions.delete(targetId)
        return json(res, 200, { ok: true })
      }
      default:
        return json(res, 404, { ok: false, error: `unknown route ${route}; 可用: /health /targets /new /navigate /eval /click /clickAt /fill /scroll /screenshot /close` })
    }
  } catch (e) {
    return json(res, 500, { ok: false, error: String(e.message ?? e).slice(0, 200) })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[cdp-proxy] http://127.0.0.1:${PORT} eng=${ENG} profile=${PROFILE_DIR}`)
  console.log('[cdp-proxy] worker 用法: curl -X POST http://127.0.0.1:8893/new -H "X-Auth: $P2P_WORKER_TOKEN" -H \'Content-Type: application/json\' -d \'{"url":"https://<scope 内目标>"}\'')
})
