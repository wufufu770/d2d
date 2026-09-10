#!/usr/bin/env node
// autofeed.mjs — #49 OSINT 自动喂送: 指纹命中 → 测绘反查 → 资产回图 的闭环守护。
// 数据流: 轮询图内 Endpoint.tech / Signal_(asset-finger) 指纹信号 → 找「有高价值指纹但无 OSINT 覆盖
//   (无 asset-perimeter 信号)」的 host → 按指纹规则生成测绘 DSL(ruleToDsl, domain 用命中它的 scope 条目
//   钉死授权面) → searchAll 四家测绘聚合(size=SEARCH_BUDGET) → 归一资产按 scope 复筛 → 经 graphd
//   /write/signal 回写 Signal_(type=asset-perimeter, 带证据摘要与 endpoint_url 走 N2 AT 边)。
// 授权纪律: 只喂 engagement scope 内 host(复用 plugin pentest-dsh domain/scope.mjs 的 hostAllowed);
//   无活跃 engagement → fail-closed 整轮跳过; 测绘凭据缺失 → 静默跳过只记审计(osint-feed-audit.jsonl)。
// 限频: 每 host 24h 内只喂一次(状态文件 ${D2D_DATA_DIR:-~/.d2d-data}/osint-feed-state.json)。
// 用法: node scripts/recon/autofeed.mjs --once | --watch [--json]
//   env: P2P_GRAPHD / P2P_HOST_TOKEN_FILE / D2D_DATA_DIR / D2D_FP_RULES /
//        D2D_OSINT_FEED_INTERVAL_MS(watch 轮询, 默认 30min) / D2D_OSINT_FEED_BUDGET(单轮喂送 host 上限, 默认 5)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadRules, isOsintCandidate, ruleToDsl } from './fingerprint.mjs'
import { searchAll } from './mapping/aggregate.mjs'
import { SEARCH_BUDGET } from './mapping/query.mjs'
import { providers } from './mapping/quota.mjs'
import { hostAllowed } from '../../plugin/pentest-dsh/domain/scope.mjs'

export const FEED_WINDOW_MS = 24 * 60 * 60 * 1000 // 每 host 24h 限频
const GRAPHD = process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766'
const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const FP_RULES = process.env.D2D_FP_RULES ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../assets/fingerprints/rules.json')
const TOKEN_FILE = process.env.P2P_HOST_TOKEN_FILE ?? `${os.homedir()}/.config/d2d/host-token`

// ---------- 状态(限频) — 原子落盘, 坏文件当空状态(不炸守护) ----------
export function loadState(file) {
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return j && typeof j === 'object' && j.feeds ? j : { feeds: {} } } catch { return { feeds: {} } }
}
export function saveState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2))
  fs.renameSync(tmp, file)
}
export function shouldFeed(state, host, nowMs, windowMs = FEED_WINDOW_MS) {
  const last = state?.feeds?.[String(host ?? '').toLowerCase()]
  if (!last) return true
  return nowMs - Number(last.tsMs ?? 0) >= windowMs
}
export function markFed(state, host, nowMs, info = {}) {
  state.feeds = state.feeds ?? {}
  state.feeds[String(host).toLowerCase()] = { tsMs: nowMs, ts: new Date(nowMs).toISOString(), ...info }
  return state
}

// ---------- 纯函数: host/证据解析 ----------
const HOSTNAME_OF = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/\.$/, '') } catch { return '' } }
const IS_IPV4 = (h) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h)
// 证据文本里的主机抽取(URL host; 裸域名不抽 — 防散文误配)
export function extractHosts(text) {
  const out = new Set()
  for (const m of String(text ?? '').matchAll(/https?:\/\/[^\s"'`<>)\\]+/gi)) {
    const h = HOSTNAME_OF(m[0])
    if (h && !IS_IPV4(h) && h.includes('.')) out.add(h)
  }
  return [...out]
}
// 测绘 DSL 限定面: 命中 host 的 scope 条目就是授权面 — 域名条目钉 domain, IP 条目钉 ip, CIDR 条目钉 cidr
export function baseDsl(scopeEntry, host) {
  const e = String(scopeEntry ?? '').trim().toLowerCase()
  if (!e) return {}
  if (/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(e)) return { cidr: e }
  if (IS_IPV4(e)) return { ip: e }
  return { domain: e }
}
const techTokens = (tech) => String(tech ?? '').toLowerCase().split(/[,;|/\s]+/).filter(Boolean)

// ---------- 纯函数: 选喂送目标 — 有高价值指纹 × 无 OSINT 覆盖 × scope 内 × 24h 未喂 ----------
// endpoints: [{url, tech, eng}], fingerSignals: [string evidence], coverSignals: [{u, ev}],
// scopes: [{name, scope}], rules: fingerprint.mjs loadRules().rules
export function pickFeedTargets({ endpoints = [], fingerSignals = [], coverSignals = [], scopes = [], state = { feeds: {} }, nowMs = Date.now(), windowMs = FEED_WINDOW_MS, rules = [] }) {
  const covered = new Set()
  for (const s of coverSignals) {
    const h = HOSTNAME_OF(s?.u ?? '')
    if (h) covered.add(h)
    for (const h2 of extractHosts(s?.ev ?? '')) covered.add(h2)
  }
  // 产品索引: 只认规则库内的高价值产品(tech token/evidence 词命中) — 规则外 token 不触发喂送
  const byProduct = new Map()
  for (const r of rules) { if (r?.product && isOsintCandidate(r.tags)) byProduct.set(String(r.product).toLowerCase(), r) }
  // host → {products:Set<product>, eng}
  const found = new Map()
  const note = (host, product) => {
    if (!host || covered.has(host)) return
    const cur = found.get(host) ?? { host, products: new Set() }
    cur.products.add(product)
    found.set(host, cur)
  }
  for (const e of endpoints) {
    const host = HOSTNAME_OF(e?.url ?? '')
    if (!host) continue
    for (const t of techTokens(e?.tech)) { if (byProduct.has(t)) note(host, t) }
  }
  for (const ev of fingerSignals) {
    const hosts = extractHosts(ev)
    if (!hosts.length) continue
    const low = String(ev ?? '').toLowerCase()
    for (const [p] of byProduct) if (low.includes(p)) for (const h of hosts) note(h, p)
  }
  // scope 判定(复用 pentest-dsh domain/scope.mjs hostAllowed) + 24h 限频 — fail-closed: 无活跃 engagement 不喂
  const out = []
  for (const { host, products } of [...found.values()].sort((a, b) => a.host.localeCompare(b.host))) {
    const eng = scopes.find((s) => hostAllowed(host, s.scope ?? ''))
    if (!eng) continue
    if (!shouldFeed(state, host, nowMs, windowMs)) continue
    const rule = [...products].map((p) => byProduct.get(p)).find(Boolean)
    const entry = matchScopeEntry(host, eng.scope ?? '')
    out.push({ host, eng: eng.name ?? '', products: [...products].sort(), rule, scopeEntry: entry, dsl: ruleToDsl(rule, baseDsl(entry, host)) })
  }
  return out
}
// 找出放行 host 的具体 scope 条目(DSL 限定面用): 取与 host 后缀匹配的第一条非排除条目
function matchScopeEntry(host, scopeStr) {
  const h = String(host).toLowerCase()
  for (const s of String(scopeStr ?? '').split(',')) {
    const t = s.trim().toLowerCase()
    if (!t || t.startsWith('!')) continue
    if (h === t || h.endsWith(`.${t}`)) return t
    if (/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(t) && h === t) return t
  }
  return ''
}

// ---------- IO: graphd 读/写(与 collect.mjs writeGraphSummary 同一套 X-Auth 通道) ----------
async function graphQuery(graphd, token, cypher, fetchImpl = fetch) {
  const res = await fetchImpl(`${graphd}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth': token },
    body: JSON.stringify({ cypher }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`graphd /query ${res.status}`)
  const j = await res.json().catch(() => ({}))
  return j.rows ?? []
}
async function writeSignal(graphd, token, body, fetchImpl = fetch) {
  const res = await fetchImpl(`${graphd}/write/signal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth': token },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`graphd /write/signal ${res.status}`)
  return res.json().catch(() => ({}))
}
const readHostToken = (file = TOKEN_FILE) => { try { return fs.readFileSync(file, 'utf8').trim() } catch { return '' } }
// 测绘凭据自省: 一家都没配 → 静默跳过(只记审计), 不打无谓请求
export function mappingConfigured(env = process.env) {
  return providers.some((p) => p.isConfigured(env))
}

// ---------- 主循环: 单轮喂送(deps 全可注入, mocha 用 mock graphd/search 打端到端) ----------
// deps: { graphd, token, stateFile, rules, env, nowMs, budget, searchImpl, fetchImpl, audit, log }
export async function runCycle(deps = {}) {
  const graphd = deps.graphd ?? GRAPHD
  const token = deps.token ?? readHostToken()
  const stateFile = deps.stateFile ?? path.join(DATA_DIR, 'osint-feed-state.json')
  const env = deps.env ?? process.env
  const nowMs = deps.nowMs ?? Date.now()
  const budget = deps.budget ?? Number(process.env.D2D_OSINT_FEED_BUDGET ?? 5)
  const searchImpl = deps.searchImpl ?? ((dsl, opts) => searchAll(dsl, opts))
  const fetchImpl = deps.fetchImpl ?? fetch
  const audit = deps.audit ?? (() => {})
  const log = deps.log ?? (() => {})
  const summary = { fed: 0, assets: 0, targets: [], skipped: { noToken: false, noEngagement: false, unconfigured: false, graphError: '' } }
  if (!token) { summary.skipped.noToken = true; audit({ event: 'skip', why: 'no-host-token' }); return summary }
  let rules = []
  try { rules = deps.rules ?? loadRules(JSON.parse(fs.readFileSync(deps.rulesFile ?? FP_RULES, 'utf8'))).rules } catch { rules = [] }
  try {
    // ① 授权面: 活跃 engagement scope(无 → fail-closed 不喂)
    const engRows = await graphQuery(graphd, token, "MATCH (e:Engagement) WHERE e.status = 'active' RETURN e.name AS name, e.scope AS scope", fetchImpl)
    const scopes = engRows.map((r) => ({ name: String(r.name ?? ''), scope: String(r.scope ?? '') })).filter((s) => s.scope.trim())
    if (!scopes.length) { summary.skipped.noEngagement = true; audit({ event: 'skip', why: 'no-active-engagement' }); return summary }
    // ② 图内指纹源(Endpoint.tech + asset-finger 信号)与 OSINT 覆盖面(asset-perimeter 信号)
    const [epRows, fingerRows, coverRows] = await Promise.all([
      graphQuery(graphd, token, "MATCH (e:Endpoint) WHERE e.tech IS NOT NULL AND e.tech <> '' RETURN e.url AS url, e.tech AS tech LIMIT 300", fetchImpl),
      graphQuery(graphd, token, "MATCH (s:Signal_) WHERE s.type = 'asset-finger' RETURN s.evidence AS ev LIMIT 300", fetchImpl),
      graphQuery(graphd, token, "MATCH (s:Signal_) WHERE s.type = 'asset-perimeter' RETURN s.endpoint_url AS u, s.evidence AS ev LIMIT 500", fetchImpl),
    ])
    // ③ 选目标(纯函数): 指纹 × 无覆盖 × scope × 24h 限频
    const state = deps.state ?? loadState(stateFile)
    const targets = pickFeedTargets({
      endpoints: epRows, fingerSignals: fingerRows.map((r) => String(r.ev ?? '')),
      coverSignals: coverRows, scopes, state, nowMs, rules,
    })
    summary.targets = targets.map((t) => ({ host: t.host, products: t.products, dsl: t.dsl, eng: t.eng }))
    // ④ 凭据门: 四家全未配置 → 静默跳过记审计
    if (!mappingConfigured(env)) {
      summary.skipped.unconfigured = true
      audit({ event: 'skip', why: 'mapping-unconfigured', candidates: targets.map((t) => t.host) })
      return summary
    }
    // ⑤ 逐 host 喂送(预算内): DSL → 测绘聚合 → scope 复筛 → /write/signal 回图 → 状态落盘
    for (const t of targets.slice(0, Math.max(0, budget))) {
      let assets = []
      try {
        const r = await searchImpl(t.dsl, { size: SEARCH_BUDGET, env, fetchImpl })
        // 资产面复筛: 测绘返回可能与特征词撞车的域外面 — 必须仍落在本 host 的授权面(scopeEntry 同域;
        // IP/CIDR 面交由 hostAllowed 按 CIDR 位匹配), 双重过滤后余下的才回图
        assets = (r?.assets ?? []).filter((a) => {
          const h = String(a?.host ?? '').toLowerCase()
          if (!h) return false
          const sameFace = t.scopeEntry && !t.scopeEntry.includes('/')
            ? (h === t.scopeEntry || h.endsWith(`.${t.scopeEntry}`))
            : true
          return sameFace && hostAllowed(h, t.eng.scope ?? '')
        })
      } catch (e) {
        audit({ event: 'search-error', host: t.host, error: String(e.message ?? e).slice(0, 160) })
      }
      const sample = assets.slice(0, 10).map((a) => `${a.host}:${a.port || 0}`).join(',')
      const evidence = `autofeed(#49): ${t.host} 指纹[${t.products.join(',')}] → 测绘反查 ${JSON.stringify(t.dsl)} ` +
        `命中 ${assets.length} 资产(示例: ${sample || '-'}) — 候选资产, 人工确认归属后入 scope`
      try {
        await writeSignal(graphd, token, {
          type: 'asset-perimeter', weight: 1.0, ring: 'discovery', eng: t.eng,
          evidence,
          endpoint_url: assets[0]?.url || `http://${t.host}`,
        }, fetchImpl)
      } catch (e) {
        audit({ event: 'write-error', host: t.host, error: String(e.message ?? e).slice(0, 160) })
        continue // 写图失败不记已喂(下轮重试)
      }
      markFed(state, t.host, nowMs, { products: t.products, assets: assets.length, eng: t.eng })
      saveState(stateFile, state)
      summary.fed += 1
      summary.assets += assets.length
      audit({ event: 'fed', host: t.host, products: t.products, assets: assets.length, eng: t.eng })
      log(`fed ${t.host} [${t.products.join(',')}] → ${assets.length} 资产`)
    }
  } catch (e) {
    summary.skipped.graphError = String(e.message ?? e).slice(0, 160)
    audit({ event: 'cycle-error', error: summary.skipped.graphError })
  }
  return summary
}

// ---------- CLI: --once 单轮 | --watch 长驻轮询 ----------
const IS_MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (IS_MAIN) {
  const has = (k) => process.argv.includes(k)
  const asJson = has('--json')
  const auditFile = path.join(DATA_DIR, 'osint-feed-audit.jsonl')
  const auditSink = (e) => { try { fs.appendFileSync(auditFile, JSON.stringify({ ts: new Date().toISOString(), ...e }) + '\n') } catch {} }
  const log = (m) => console.error(`[osint-feed] ${m}`)
  const once = async () => {
    const s = await runCycle({ audit: auditSink, log })
    log(`cycle: fed=${s.fed} assets=${s.assets} targets=${s.targets.length} skip=${JSON.stringify(s.skipped)}`)
    if (asJson) console.log(JSON.stringify(s, null, 2))
  }
  if (has('--watch')) {
    const interval = Number(process.env.D2D_OSINT_FEED_INTERVAL_MS ?? 30 * 60_000)
    log(`watch 模式: 每 ${Math.round(interval / 1000)}s 轮询 ${GRAPHD}(audit: ${auditFile})`)
    await once()
    setInterval(once, interval)
  } else {
    await once()
  }
}
