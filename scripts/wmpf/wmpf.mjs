#!/usr/bin/env node
// wmpf.mjs — 0913 小程序工具面: WMPF 调试器 CDP 客户端(wmpf 六动作语义)
// 前提: 本机 WMPF 调试器已开启(ws://127.0.0.1:62000)。只连本机回环——这不是目标资产,
// 是操作者自己的调试通道; 连不上即退出并给指引, 绝不自启任何浏览器/调试器。
// 用法:
//   node scripts/wmpf/wmpf.mjs targets
//   node scripts/wmpf/wmpf.mjs hook                       # 注入 wx.request 捕获(只读记录, 不改包不改业务)
//   node scripts/wmpf/wmpf.mjs requests --seconds 10      # 采 N 秒请求流
//   node scripts/wmpf/wmpf.mjs eval --expr "wx.getSystemInfoSync()"
//   node scripts/wmpf/wmpf.mjs snapshot --out ./shot.png
const PORT = Number(process.env.WMPF_PORT ?? 62000)
const URL = `ws://127.0.0.1:${PORT}`

const HOOK_JS = `(function(){ if (window.__d2d_hooked) return 'already'; window.__d2d_reqs=[]; try { const orig = wx.request; wx.request = function(o){ try{ window.__d2d_reqs.push({url:(o&&o.url)||'', method:(o&&o.method)||'GET', data:o&&o.data}); }catch(e){} return orig.apply(this, arguments); }; window.__d2d_hooked=true; return 'hooked'; } catch(e){ return 'hook-fail:'+e.message } })()`

async function connect() {
  const ws = new WebSocket(URL)
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`WMPF 调试器连接超时(${PORT}) — 确认本机 WMPF 调试端口已开启(微信 PC 端小程序调试), 只连 127.0.0.1, 不自启任何进程`)), 5000)
    ws.onopen = () => { clearTimeout(t); res() }
    ws.onerror = () => { clearTimeout(t); rej(new Error(`WMPF 调试器连不上 ws://127.0.0.1:${PORT} — 只连本机回环, 不自启进程; 开启 PC 端微信小程序调试后重试`)) }
  })
  let seq = 0
  const pending = new Map()
  const events = []
  ws.onmessage = (m) => {
    let d
    try { d = JSON.parse(m.data) } catch { return }
    if (d.id !== undefined && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) }
    else if (d.method) events.push(d)
  }
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq
    const t = setTimeout(() => { pending.delete(id); rej(new Error(`CDP 超时: ${method}`)) }, 10_000)
    pending.set(id, (d) => { clearTimeout(t); d.error ? rej(new Error(d.error.message ?? JSON.stringify(d.error))) : res(d.result) })
    ws.send(JSON.stringify({ id, method, params }))
  })
  return { ws, send, events }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const argv = process.argv.slice(2)
  const cmd = argv[0]
  const argOf = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
  if (!cmd) { console.error('用法: wmpf.mjs targets | hook | requests [--seconds 10] | eval --expr "<js>" | snapshot [--out f.png]'); process.exit(2) }
  const c = await connect()
  try {
    if (cmd === 'targets') {
      const r = await c.send('Target.getTargets').catch(() => null)
      const list = r?.targetInfos ?? []
      for (const t of list) console.log(`${t.targetId} [${t.type}] ${t.title ?? ''} ${t.url ?? ''}`)
      if (!list.length) console.log('(无目标页 — 先在微信 PC 端打开目标小程序)')
    } else if (cmd === 'hook') {
      const r = await c.send('Runtime.evaluate', { expression: HOOK_JS, returnByValue: true })
      console.log('hook:', r?.result?.value ?? JSON.stringify(r))
    } else if (cmd === 'requests') {
      const secs = Number(argOf('--seconds') ?? 10)
      await c.send('Network.enable').catch(() => {})
      await c.send('Runtime.evaluate', { expression: HOOK_JS, returnByValue: true }).catch(() => {})
      console.log(`采集 ${secs}s 请求流(期间在 PC 端小程序里触发目标操作)...`)
      await sleep(secs * 1000)
      const cdp = c.events.filter((e) => e.method === 'Network.requestWillBeSent').map((e) => e.params.request)
      const hooked = await c.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__d2d_reqs||[])', returnByValue: true }).catch(() => null)
      let hx = []
      try { hx = JSON.parse(hooked?.result?.value ?? '[]') } catch {}
      console.log(`== CDP 捕获 ${cdp.length} 条 ==`)
      for (const r of cdp.slice(0, 50)) console.log(`${r.method} ${r.url}`)
      console.log(`== wx.request 钩子 ${hx.length} 条 ==`)
      for (const r of hx.slice(0, 50)) console.log(`${r.method} ${r.url} data=${JSON.stringify(r.data)?.slice(0, 200)}`)
      console.log('纪律: 捕获到的 token/sign/openid 写 Signal_(type=wx-flow), 报文样本脱敏; CDP 只见 [native code] 时回静态源码交叉验证')
    } else if (cmd === 'eval') {
      const r = await c.send('Runtime.evaluate', { expression: argOf('--expr') ?? '1+1', returnByValue: true })
      console.log(JSON.stringify(r?.result ?? r, null, 1).slice(0, 4000))
    } else if (cmd === 'snapshot') {
      const r = await c.send('Page.captureScreenshot', { format: 'png' })
      const out = argOf('--out') ?? `wmpf-shot-${Date.now()}.png`
      fs.writeFileSync(out, Buffer.from(r.data, 'base64'))
      console.log(`✓ ${out}`)
    } else {
      console.error(`未知命令: ${cmd}`)
      process.exit(2)
    }
  } finally { try { c.ws.close() } catch {} }
}
import fs from 'node:fs'
if (process.argv[1]?.endsWith('wmpf.mjs')) {
  main().catch((e) => { console.error(`✗ ${e?.message}`); process.exit(1) })
}
