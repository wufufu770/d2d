// index.mjs — d2d-panel host 半(dsh 插件宿主入口)
// 路由: ctx.webServer.register({kind:'prefix', path:'/d2d/api'}) — 与 dsh /api 同一道
// 浏览器信任栅栏(Host loopback/受信 + sec-fetch-site + Origin 同源), 同源零跨域,
// token 全程留 host 侧。机制参照 dsh-sidebar-leap 宿主半(生态已验证模式)。
import { buildSnapshot, createGraphdQuery, readHostToken, readFleet, writeFleet, readRunEvents, transitionFinding, writeDenylist, readCaps, writeCaps, loadDshCatalog, mergeCredentialRefs } from './snapshot.mjs'
import fs from 'node:fs'
import os from 'node:os'

export const name = 'd2d-panel'
export const inject = ['webServer', 'webRuntime'] // 无 sessions 依赖: 快照只读 graphd, 不碰会话存储

const MICRO_CACHE_MS = 500 // 微缓存 + 单飞: 并发请求合并为一次图读取(_lock 争用最小)
const BODY_MAX = 8 * 1024 // 写端点请求体上限(模型 id / 转移理由都是百字节级)

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > BODY_MAX) { reject(new Error('body too large')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch (e) { reject(new Error('bad json body')) }
    })
    req.on('error', reject)
  })
}

/** 浏览器信任栅栏(port of dsh-sidebar-leap isTrustedApiRequest 同口径)。 */
function isTrustedApiRequest(req, trustedHosts = []) {
  const host = String(req.headers?.host ?? '')
  if (!host) return false
  const m = host.match(/^\[([^\]]+)\](?::(\d+))?$/) || host.match(/^([^:]+)(?::(\d+))?$/)
  if (!m) return false
  const hostname = String(m[1]).toLowerCase()
  const isLoop = hostname === 'localhost' || hostname === '::1' || /^127\.\d+\.\d+\.\d+$/.test(hostname)
  const trusted = (trustedHosts ?? []).some((t) => {
    const tm = String(t ?? '').match(/^\[([^\]]+)\]/) || String(t ?? '').match(/^([^:]+)/)
    return tm ? String(tm[1]).toLowerCase() === hostname : false
  })
  if (!isLoop && !trusted) return false
  if (String(req.headers?.['sec-fetch-site'] ?? '') === 'cross-site') return false
  const origin = req.headers?.origin
  if (origin === undefined) return true
  try { return new URL(origin).host === host } catch { return false }
}

export function apply(ctx, config = {}) {
  const log = (...a) => { try { ctx?.log?.(...a) } catch { /* 宿主日志面可选 */ } }
  const graphdUrl = String(config.graphdUrl ?? process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766')
  const query = createGraphdQuery({ graphdUrl, token: readHostToken() })

  let cache = null
  let inFlight = null
  async function snapshot() {
    if (cache && Date.now() - cache.ts < MICRO_CACHE_MS) return cache.val
    if (inFlight) return inFlight
    inFlight = (async () => {
      // 轨迹/用量区: 读 scheduler 落盘的 run-log.jsonl + model-usage.jsonl(engagement 名取图上最近一条)
      let engName = ''
      try {
        const rows = await query(`MATCH (e:Engagement) WHERE e.status = 'active' RETURN e.name AS name ORDER BY coalesce(e.created_at, '') DESC LIMIT 1`)
        engName = String(rows?.[0]?.name ?? '')
        if (!engName) {
          const last = await query(`MATCH (e:Engagement) RETURN e.name AS name ORDER BY coalesce(e.created_at, '') DESC LIMIT 1`)
          engName = String(last?.[0]?.name ?? '')
        }
      } catch { /* 轨迹区降级为空, 快照主体不受影响 */ }
      const runEvents = engName ? readRunEvents({ engName }) : { events: [], usage: {}, quotaHits: [] }
      const val = await buildSnapshot(query, { fleet: readFleet(), runEvents })
      cache = { ts: Date.now(), val }
      return val
    })().finally(() => { inFlight = null })
    return inFlight
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/d2d/api',
    handler: async (req, res) => {
      const send = (code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify(obj))
      }
      if (!isTrustedApiRequest(req, ctx.webRuntime?.trustedHosts ?? [])) {
        return send(403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
      }
      const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
      const method = pathname.startsWith('/d2d/api/') ? pathname.slice('/d2d/api/'.length) : undefined
      if (method === undefined || method.includes('/')) {
        return send(404, { ok: false, error: { code: 'not-found', message: 'unknown d2d API method' } })
      }
      if (method === 'health') {
        return send(200, { ok: true, service: 'd2d-panel', graphd: graphdUrl })
      }
      if (method === 'snapshot') {
        if (req.method !== 'GET') return send(405, { ok: false, error: { code: 'method-error', message: 'method not allowed (read-only)' } })
        try {
          return send(200, await snapshot())
        } catch (e) {
          // fail-closed: graphd 不可达/忙 → 503, 不下发过期快照(PANEL-UI-SPEC §4.7)
          return send(503, { ok: false, error: { code: 'graphd-unreachable', message: `fail-closed: ${String(e?.message ?? e).slice(0, 140)}` } })
        }
      }
      // ---- 写端点: 面板交互(fleet 模型切换 / finding 人工裁决) ----
      if (method === 'fleet' || method === 'transition') {
        if (req.method !== 'POST') return send(405, { ok: false, error: { code: 'method-error', message: 'POST required' } })
        let body
        try { body = await readBody(req) } catch (e) {
          return send(400, { ok: false, error: { code: 'bad-request', message: String(e?.message ?? e) } })
        }
        if (method === 'fleet') {
          try {
            const fleet = writeFleet({ role: body.role, slot: body.slot, model: body.model })
            cache = null // 策略已变, 快照立即失效
            return send(200, { ok: true, fleet })
          } catch (e) {
            return send(400, { ok: false, error: { code: 'fleet-write-error', message: String(e?.message ?? e).slice(0, 160) } })
          }
        }
        // 供应商凭据落盘(#89 吸纳竞品无痕切换): 面板贴 key → 写 dsh credentials refs(0600), 值不回显不入日志
        if (method === 'credential') {
          try {
            const cat = loadDshCatalog(process.env)
            const p = cat.find((x) => x.provider === body.provider)
            if (!p?.apiKeyEnv) return send(400, { ok: false, error: { code: 'unknown-provider', message: `unknown provider: ${body.provider}` } })
            const key = String(body.key ?? '').trim()
            if (key.length < 8) return send(400, { ok: false, error: { code: 'bad-request', message: 'key too short' } })
            const home = process.env.DSH_HOME ?? `${os.homedir()}/.dsh`
            const credPath = `${home}/.credentials.yaml`
            const merged = mergeCredentialRefs(fs.readFileSync(credPath, 'utf8'), p.apiKeyEnv, key)
            fs.writeFileSync(credPath, merged, { mode: 0o600 })
            cache = null
            return send(200, { ok: true, provider: body.provider, env: p.apiKeyEnv })
          } catch (e) {
            return send(400, { ok: false, error: { code: 'credential-write-error', message: String(e?.message ?? e).slice(0, 160) } })
          }
        }
        try {
          const r = await transitionFinding({ graphdUrl, token: readHostToken(), id: body.id, to: body.to, actor: body.actor, reason: body.reason })
          cache = null // 状态已变, 快照立即失效
          return send(200, { ok: true, transition: r })
        } catch (e) {
          return send(400, { ok: false, error: { code: 'transition-error', message: String(e?.message ?? e).slice(0, 160) } })
        }
      }
      // ---- R6.3: 黑名单卡片 CRUD(改文件 + graphd 热重载) ----
      if (method === 'denylist') {
        if (req.method !== 'POST') return send(405, { ok: false, error: { code: 'method-error', message: 'POST required' } })
        let body
        try { body = await readBody(req) } catch (e) {
          return send(400, { ok: false, error: { code: 'bad-request', message: String(e?.message ?? e) } })
        }
        try {
          const r = await writeDenylist({ ...body, graphdUrl, token: readHostToken() })
          cache = null // 名单已变, 快照立即失效
          return send(200, { ok: true, denylist: r })
        } catch (e) {
          return send(400, { ok: false, error: { code: 'denylist-write-error', message: String(e?.message ?? e).slice(0, 160) } })
        }
      }
      // ---- W4: 容量热调卡片(GET 读 caps.json / POST 写覆盖, 调度器下个 tick 生效) ----
      if (method === 'caps') {
        if (req.method === 'GET') return send(200, { ok: true, caps: readCaps() })
        if (req.method !== 'POST') return send(405, { ok: false, error: { code: 'method-error', message: 'POST/GET required' } })
        let body
        try { body = await readBody(req) } catch (e) {
          return send(400, { ok: false, error: { code: 'bad-request', message: String(e?.message ?? e) } })
        }
        try {
          const r = writeCaps({ updates: body?.updates })
          cache = null // 容量已变, 快照立即失效
          return send(200, { ok: true, caps: r })
        } catch (e) {
          return send(400, { ok: false, error: { code: 'caps-write-error', message: String(e?.message ?? e).slice(0, 160) } })
        }
      }
      return send(404, { ok: false, error: { code: 'not-found', message: `unknown d2d API method "${method}"` } })
    },
  }), 'd2d-panel: /d2d/api routes')
  log(`d2d-panel: /d2d/api mounted (graphd ${graphdUrl})`)
}
