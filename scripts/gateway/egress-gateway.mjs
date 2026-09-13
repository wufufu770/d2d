#!/usr/bin/env node
// egress-gateway — V-08 完整修复: 出网治理网关(连接层 scope 强制)
// 职责: ①动态 scope(每 30s 从 control graphd 读活跃 Engagement.scope, 与静态白名单取并集)
//       ②子域通配 ③per-host 令牌桶限速 ④全量请求审计 JSONL
//       ⑤H14(审计 0910): 目标硬黑面(IPv4-mapped IPv6 归一 / fe80 / 0/8 / CGNAT / 云元数据) + DNS 解析后校验
// 用法: P2P_PROXY_PORT=8888 P2P_GRAPHD=http://127.0.0.1:8766 P2P_PROXY_ALLOW="127.0.0.1,localhost,.vulnweb.com" node egress-gateway.mjs
// worker 侧: export http_proxy=http://127.0.0.1:8888 https_proxy=... NO_PROXY=127.0.0.1,localhost
import http from 'node:http'
import os from 'node:os'
import dns from 'node:dns'
import { mkdirSync, appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// 中危审计修复(13): env 解析 NaN 兜底 — 旧版 parseInt/parseFloat 无回退, env 填垃圾 →
// listen(NaN) 启动即崩 / RATE=NaN 使 allowRate 恒 false(全限死)。非法值一律回退默认。
const _envInt = (v, dflt) => { const n = parseInt(v ?? '', 10); return Number.isFinite(n) && n > 0 && n <= 65535 ? n : dflt }
const _envFloat = (v, dflt) => { const n = parseFloat(v ?? ''); return Number.isFinite(n) && n > 0 ? n : dflt }
const PORT = _envInt(process.env.P2P_PROXY_PORT, 8888)
const GRAPHS = (process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766,http://127.0.0.1:8767,http://127.0.0.1:8768').split(',').map(s => s.trim()).filter(Boolean)
const TOKEN_FILE = process.env.P2P_HOST_TOKEN_FILE ?? `${process.env.HOME}/.config/d2d/host-token`
const STATIC_ALLOW = new Set((process.env.P2P_PROXY_ALLOW ?? '127.0.0.1,localhost')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean))
const RATE = _envFloat(process.env.P2P_PROXY_RATE, 5)
// 0911: 模型 API 主机豁免(scope 过滤外, 硬黑面内)——worker 的 LLM 调用是基础设施不是目标流量;
// 默认覆盖常见 LLM 端点, D2D_EGRESS_MODEL_HOSTS 逗号分隔可增补。
const MODEL_HOSTS = new Set([
  'api.minimaxi.com', 'api.minimax.io', 'api.minimax.chat', 'api.opencode.ai',
  'api.deepseek.com', 'api.openai.com', 'api.anthropic.com', 'open.bigmodel.cn',
  'api.moonshot.cn', 'dashscope.aliyuncs.com',
  ...(process.env.D2D_EGRESS_MODEL_HOSTS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
])
// 中危审计修复(9): 上游请求/隧道超时 — 旧版 http.request/net.connect 无任何超时, 上游挂住 =
// worker 连接与 socket 永久悬挂。默认 30s, P2P_PROXY_TIMEOUT_MS 可调(非法/非正值回退默认)。
const UPSTREAM_TIMEOUT_MS = _envInt(process.env.P2P_PROXY_TIMEOUT_MS, 30_000)
// 中危审计修复(9): 审计 bucket/DNS 缓存容量上限 — 旧版 Map 无限增长(每 host 一条, 永不回收)。
// 超上限时按插入序淘汰最旧条目(Map 迭代序=插入序, 等效 LRU 粗版; 刷新由令牌桶 last/DNS ts 自带)。
const MAP_CAP = 4096
const _capMap = (m) => { while (m.size >= MAP_CAP) { const oldest = m.keys().next().value; if (oldest === undefined) break; m.delete(oldest) } }
// M6 企业代理链: 企业网出网走公司代理(形态 host:port)。scope/限速/审计仍在本网关强制;
// 回环/私有目标绕过上游直连(CDP proxy/graphd 等本地面)。
const UPSTREAM = (() => {
  const raw = String(process.env.D2D_UPSTREAM_PROXY ?? '').trim()
  if (!raw) return null
  const m = raw.replace(/^https?:\/\//i, '').match(/^([^:]+)(?::(\d+))?$/)
  return m ? { host: m[1], port: Number(m[2] ?? 8080) } : null
})()
const isLocalHost = (h) => h === 'localhost' || h === '127.0.0.1' || h === '::1' || /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)
// R3: 数据外置 D2D_DATA_DIR(默认 ~/.d2d-data)
const EVIDENCE_DIR = process.env.P2P_PROXY_EVIDENCE ?? `${process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/evidence/proxy`
try { mkdirSync(EVIDENCE_DIR, { recursive: true }) } catch {}
const logFile = `${EVIDENCE_DIR}/proxy-${Date.now()}.jsonl`
const audit = (e) => { try { appendFileSync(logFile, JSON.stringify({ ts: new Date().toISOString(), ...e }) + '\n') } catch {} }

// ---- H14(审计 0910): 主机归一 + 目标硬黑面(与 plugin/d2d-panel/lib/host/start-policy.mjs 同源口径) ----
// C6 修复后面板侧已拒保留段 scope, 此处兜底 /pentest 命令创建的 engagement 与图内直改:
//   ①IPv4-mapped IPv6 归一: `http://[::ffff:169.254.169.254]/` 被 Node 规范化为 hostname "[::ffff:a9fe:a9fe]",
//     旧版字符串比对既不命中 scope 也从不怀疑 → 按十六进制映射还原成 v4 再过黑面;
//   ②硬黑面(即使被 scope 声明也不放): 0.0.0.0/8、100.64/10(CGNAT)、169.254/16(链路本地, 含云元数据
//     169.254.169.254)、fe80::/10(v6 链路本地)。环回/私有段(127/8, 10/8, 172.16/12, 192.168/16)不进硬黑面
//     — 本地靶场(NoProxy 直连 DVLA 等)是合法目标, 仍走 scope 判定。
// CIDR: 与保留段任一重叠即拒(`0.0.0.0/0` 在此被拦, 字符串后缀/IP 精确比对都挡不住它)。
function _ip4ToInt(s) {
  const p = String(s).split('.').map(Number)
  if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return null
  return (((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]) >>> 0
}
function _rangeOf(cidr) {
  const [base, bitsStr] = String(cidr).split('/')
  const b = _ip4ToInt(base)
  if (b === null) return null
  const bits = bitsStr === undefined || bitsStr === '' ? 32 : Number(bitsStr)
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return null
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  const lo = (b & mask) >>> 0
  return [lo, (lo | (~mask >>> 0)) >>> 0]
}
const FORBIDDEN_CIDRS = ['0.0.0.0/8', '100.64.0.0/10', '169.254.0.0/16']
function normalizeHost(h) {
  // 只剥 "host:port" 的端口(前缀无冒号才动刀), 不伤裸 IPv6 的尾组(fe80::1 ≠ 端口 1)
  let s = String(h ?? '').trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/%[0-9a-z._-]+$/i, '').replace(/^([^:]+):\d+$/, '$1')
  const m = s.match(/^::ffff:(.+)$/)
  if (m) {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(m[1])) s = m[1]
    else {
      const g = m[1].split(':')
      if (g.length === 2 && g.every((x) => /^[0-9a-f]{1,4}$/.test(x))) {
        const hi = parseInt(g[0], 16), lo = parseInt(g[1], 16)
        s = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`
      }
      // 解不动的 mapped 形态原样保留 → isForbiddenTarget 的 v6 规则保守拒
    }
  }
  return s
}
function isForbiddenTarget(raw) {
  const n = normalizeHost(raw)
  if (!n) return false
  if (n.includes('/')) {
    const r = _rangeOf(n)
    if (r === null) return true // 非法 CIDR 形态 → 保守拒
    return FORBIDDEN_CIDRS.some((c) => { const f = _rangeOf(c); return r[0] <= f[1] && f[0] <= r[1] })
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(n)) {
    const v = _ip4ToInt(n)
    return v !== null && FORBIDDEN_CIDRS.some((c) => { const f = _rangeOf(c); return v >= f[0] && v <= f[1] })
  }
  if (n.includes(':')) {
    if (/^fe[89ab][0-9a-f]:/.test(n)) return true // fe80::/10 链路本地
    if (/^::ffff:/.test(n)) return true // 归一失败的 mapped 残留 → 保守拒
    return false
  }
  return false
}

// ---- 动态 scope: control 图的活跃 Engagement.scope, 30s 刷新 ----
let dynScope = new Set()
let token = ''
try { token = readFileSync(TOKEN_FILE, 'utf8').trim() } catch {}
async function refreshScope() {
  const next = new Set()
  for (const G of GRAPHS) {
    try {
      const res = await fetch(`${G}/query`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth': token },
        body: JSON.stringify({ cypher: "MATCH (e:Engagement) WHERE e.status='active' RETURN e.scope AS s" }),
        signal: AbortSignal.timeout(5000),
      })
      const data = await res.json()
      for (const r of data.rows ?? []) {
        for (const s of String(r.s ?? '').split(',')) {
          const v = s.trim().toLowerCase()
          if (!v) continue
          // H14: 图内 scope 条目同样过硬黑面(0.0.0.0/0、169.254.169.254、100.64/10 等不进 allow 集);
          // `!` 前缀是排除清单语法(allow 侧无意义, 旧版当死条目原样放入从不匹配) → 直接不收, 防解析歧义。
          if (v.startsWith('!')) continue
          if (isForbiddenTarget(v)) { audit({ event: 'scope-entry-rejected', entry: v.slice(0, 60) }); continue }
          // 保留原文(IP/CIDR 精确匹配用); 域名形态额外记一条 ".域" 供子域通配
          next.add(v)
          if (!v.includes('/') && !/^\d+\.\d+\.\d+\.\d+$/.test(v)) next.add(`.${v}`)
        }
      }
    } catch { /* 单图抖动保留其余 */ }
  }
  dynScope = next
}
// scope 是 CIDR(如 192.168.1.0/24)时按位匹配 — 字符串后缀匹配会误杀段内主机(2026-09-01 接线时实证)
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
function hostAllowed(host) {
  const h = normalizeHost(host)
  if (isForbiddenTarget(h)) return false // 硬黑面双保险(处理器层已先拒一次)
  // 0911: 模型 API 豁免(基础设施, 非目标流量)——scope 只约束目标侧; LLM 端点不豁免会被
  // engagement scope 全拦(worker 模型调用全部 TRANSPORT error)。硬黑面仍优先于本豁免。
  if (MODEL_HOSTS.has(h)) return true
  if (STATIC_ALLOW.has(h)) return true
  for (const a of [...STATIC_ALLOW, ...dynScope]) {
    if (a.includes('/')) { if (ipInCidr(h, a)) return true }
    else if (a.startsWith('.')) { if (h.endsWith(a) || h === a.slice(1)) return true }
    else if (h === a) return true
  }
  return false
}
// ---- H14: DNS 解析后校验 — scope 内域名可被(被挟持的)权威 DNS 解到元数据/链路本地等保留段,
// host 字符串比对防不住; 放行前先解一层, 解析失败或任一解析结果命中硬黑面 → fail-closed 拒绝。
const _dnsCache = new Map()
const _dnsLookupAll = (h) => dns.promises.lookup(h, { all: true, verbatim: true })
async function resolvedIpsAllowed(host, resolve = _dnsLookupAll) {
  const h = normalizeHost(host)
  if (!h) return false
  const c = _dnsCache.get(h)
  if (c && Date.now() - c.ts < 30_000) return c.ok
  let ok = false
  try {
    const addrs = await resolve(h)
    ok = Array.isArray(addrs) && addrs.length > 0 && addrs.every((a) => !isForbiddenTarget(a?.address ?? a))
  } catch { ok = false } // 解析失败/超时 → fail-closed
  _capMap(_dnsCache) // 中危审计修复(9): 容量上限(旧版过期条目也永不回收)
  _dnsCache.set(h, { ts: Date.now(), ok })
  return ok
}
const _clearDnsCache = () => _dnsCache.clear()
// 测试注入口(mocha 直接 import 本模块, 不走 main)
const _setDynScope = (s) => { dynScope = s instanceof Set ? s : new Set() }

const buckets = new Map()
function allowRate(host) {
  _capMap(buckets) // 中危审计修复(9): 容量上限, 防海量 host 撑爆内存
  const now = Date.now()
  let b = buckets.get(host)
  if (!b) { b = { tokens: RATE, last: now }; buckets.set(host, b) }
  b.tokens = Math.min(RATE, b.tokens + ((now - b.last) / 1000) * RATE); b.last = now
  if (b.tokens < 1) return false
  b.tokens -= 1
  return true
}
function deny(res, host, why, code = 403) {
  audit({ event: 'deny', host, why })
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: false, error: `egress-gateway: ${why} (${host})` }))
}
const _sockDeny = (sock, host, why, code = 403) => {
  audit({ event: 'deny', host, why })
  try { sock.end(`HTTP/1.1 ${code} Forbidden\r\n\r\n`) } catch {}
}
const server = http.createServer(async (req, res) => {
  // 0906 修复: worker 被杀/客户端半途断连时 req/res 的 'error'(ECONNRESET) 无监听 → 整进程退出(12:15 实证)
  req.on('error', () => {})
  res.on('error', () => {})
  let u
  try { u = new URL(req.url, `http://${req.headers.host ?? 'unknown'}`) } catch { return deny(res, '', 'bad request url') }
  const host = normalizeHost(u.hostname)
  if (req.url === '/health' || u.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, dynScope: [...dynScope], rate: RATE, upstream: UPSTREAM ? 'configured' : null }))
  }
  // H14 顺序: 硬黑面 → scope → 限速 → DNS 解析校验(逐请求逐 host, prompt 注入改 URL 也逃不过)
  if (isForbiddenTarget(host)) return deny(res, host, 'metadata/link-local/CGNAT/0-net 硬黑面(H14), scope 声明也不放行')
  if (!hostAllowed(host)) return deny(res, host, 'host not in scope (V-08 egress enforcement)')
  if (!allowRate(host)) return deny(res, host, 'rate limit', 429)
  if (!(await resolvedIpsAllowed(host))) return deny(res, host, 'DNS 解析失败或解析到保留/元数据地址(H14 fail-closed)')
  audit({ event: 'http', host, path: u.pathname, method: req.method })
  try {
    // M6 企业代理链: D2D_UPSTREAM_PROXY 配置时经企业代理转发(http 代理语义 = 绝对 URL 打到代理);
    // 回环/私有目标直连(CDP proxy/graphd 等本地面不过企业网)。scope/限速/审计仍在本网关强制 —
    // 企业代理只是传输通道, 不构成策略旁路。
    const upstreamFor = UPSTREAM && !isLocalHost(host) ? UPSTREAM : null
    // 连接用归一化 host(去方括号/mapped 还原后的 v4) — net.connect 不吃 "[::ffff:..]" 带括号字面量;
    // Host 头保持 u.host(URL 规范形态, v6 带方括号)。
    const reqOpts = upstreamFor
      ? { host: upstreamFor.host, port: upstreamFor.port, path: `http://${u.host}${u.pathname}${u.search}`, method: req.method, headers: { ...req.headers, host: u.host } }
      : { host, port: u.port || 80, path: u.pathname + u.search, method: req.method, headers: { ...req.headers, host: u.host } }
    // 中危审计修复(9): 上游超时 — timeout 只报警不销毁, 必须显式 destroy → 走 error → 502
    reqOpts.timeout = UPSTREAM_TIMEOUT_MS
    const up = http.request(reqOpts, (r) => {
      res.writeHead(r.statusCode, r.headers); r.pipe(res)
    })
    up.on('timeout', () => up.destroy(new Error(`upstream timeout ${UPSTREAM_TIMEOUT_MS}ms`)))
    up.on('error', () => { try { res.writeHead(502); res.end() } catch {} })
    req.pipe(up)
  } catch { deny(res, host, 'bad upstream') }
})
server.on('connect', async (req, sock, head) => { // HTTPS CONNECT: host 级 scope 强制
  sock.on('error', () => {}) // 0906 修复: 隧道对端 RST(step-limit 杀 worker 等)无监听 → 崩进程(12:15 实证)
  // H14: CONNECT 目标可能是 [v6]:port 形态 — 旧版 split(':')[0] 会把它截成 "[::ffff"(比对必然失真)
  const cm = String(req.url ?? '').match(/^(?:\[([^\]]+)\]|([^:]+))(?::(\d+))?$/)
  const host = normalizeHost(cm?.[1] ?? cm?.[2] ?? '')
  const port = _envInt(cm?.[3], 443) // 中危审计修复(13): 端口 NaN/越界兜底(旧版 parseInt 原样透传给 net.connect)
  if (isForbiddenTarget(host)) return _sockDeny(sock, host, 'metadata/link-local/CGNAT/0-net 硬黑面(H14), scope 声明也不放行')
  if (!hostAllowed(host)) { audit({ event: 'deny', host, why: 'CONNECT not in scope' }); sock.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return }
  if (!allowRate(host)) { sock.end('HTTP/1.1 429 Too Many Requests\r\n\r\n'); return }
  if (!(await resolvedIpsAllowed(host))) return _sockDeny(sock, host, 'DNS 解析失败或解析到保留/元数据地址(H14 fail-closed)')
  audit({ event: 'connect', host })
  import('node:net').then(({ default: net }) => {
    // M6 企业代理链: CONNECT 经企业代理二次 CONNECT 隧道(握手 200 才放行), 否则直连
    // 中危审计修复(9): 隧道两侧都挂超时 — 上游挂住/握手不回时销毁, socket 不再永久悬挂
    const upstreamFor = UPSTREAM && !isLocalHost(host) ? UPSTREAM : null
    if (!upstreamFor) {
      const up = net.connect(port, host, () => {
        up.setTimeout(0) // 隧道已建立: 解除握手超时(长连接空闲属正常, 挂死风险只在握手窗口)
        sock.write('HTTP/1.1 200 Connection Established\r\n\r\n'); up.write(head); up.pipe(sock); sock.pipe(up)
      })
      up.setTimeout(UPSTREAM_TIMEOUT_MS, () => { try { up.destroy(); sock.end() } catch {} })
      up.on('error', () => sock.end())
      return
    }
    const up = net.connect(upstreamFor.port, upstreamFor.host, () => {
      up.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`)
    })
    up.setTimeout(UPSTREAM_TIMEOUT_MS, () => { try { up.destroy(); sock.end() } catch {} })
    let buf = ''
    up.on('data', function onData(d) {
      buf += d.toString('latin1')
      if (!buf.includes('\r\n\r\n')) return
      up.removeListener('data', onData)
      if (/^HTTP\/1\.[01] 200/.test(buf)) {
        up.setTimeout(0) // 隧道已建立: 解除握手超时(同直连路径)
        sock.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length) up.write(head)
        up.pipe(sock); sock.pipe(up)
      } else {
        audit({ event: 'upstream-refused', host, status: buf.split('\r\n')[0].slice(0, 60) })
        sock.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      }
    })
    up.on('error', () => sock.end())
  }).catch(() => sock.end())
})
server.on('clientError', (err, socket) => { try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n') } catch {} })

// main 守卫: 直接 `node egress-gateway.mjs` 才起服务/刷 scope; mocha 等纯 import 只取纯函数
const IS_MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (IS_MAIN) {
  refreshScope(); setInterval(refreshScope, 30_000)
  server.listen(PORT, '127.0.0.1', () => console.log(`[egress-gateway] :${PORT} allow=${[...STATIC_ALLOW]} + dynamic scope from ${GRAPHS.join(',')}`))
}

export { normalizeHost, isForbiddenTarget, hostAllowed, allowRate, resolvedIpsAllowed, refreshScope, server, _setDynScope, _clearDnsCache, UPSTREAM_TIMEOUT_MS, MAP_CAP, buckets as _buckets, _dnsCache }
