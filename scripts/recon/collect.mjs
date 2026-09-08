#!/usr/bin/env node
// collect.mjs — 资产面收集引擎(P1/M2, skyline auto/deep-collect 对标): 公司名/域名 →
//   Stage0 企业面(company-sweep ICP, --company 时) → Stage1 测绘聚合(mapping 四家, 命中子域
//   source=mapping 反哺) → Stage2 被动子域(crt.sh 证书透明) → Stage3 字典爆破(自研 dgram 解析
//   + 泛解析剪枝; tier 可调) → Stage4 探活+指纹(自研引擎 assets/fingerprints/rules.json)。
// 产物: 快照 JSON → $D2D_DATA_DIR/assets/<base>/<ts>.json; --write-graph 时写一条
//   Signal_(asset-perimeter) 摘要(host token)。人审门: 候选资产不自动入 scope — 测试前必须
//   人工确认归属(与 company-sweep 同一红线)。
// 用法:
//   node scripts/recon/collect.mjs --domain example.com [--tier p0|p1|p2] [--skip-mapping]
//        [--skip-brute] [--skip-probe] [--write-graph] [--json]
//   node scripts/recon/collect.mjs --company 某某网络 [--same 上述选项]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawn } from 'node:child_process'
import { loadDict, loadResolvers } from './wordlists.mjs'
import { searchAll } from './mapping/aggregate.mjs'
import { subdomainsOf } from './mapping/normalize.mjs'
import { crtshSubs } from './passive.mjs'
import { resolveBatch, pruneWildcard, candidateSubs, selectBases } from './net.mjs'
import { probeHosts } from './probe.mjs'
import { loadRules, detectFingerprint } from './fingerprint.mjs'

const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? String(process.argv[i + 1] ?? '') : '' }
const has = (k) => process.argv.includes(k)
const asJson = has('--json')
const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const GRAPHD = process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766'
const FP_RULES = process.env.D2D_FP_RULES ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../assets/fingerprints/rules.json')
const CONCURRENCY = Number(process.env.D2D_RECON_CONCURRENCY ?? 200)
const BRUTE_BASE_CAP = 3 // company 模式多个候选域时的爆破上限(耗时护栏)

// ---------- 主流程 ----------
function readHostToken() {
  try { return fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim() } catch { return '' }
}

async function writeGraphSummary(base, snap) {
  const token = readHostToken()
  if (!token) throw new Error('缺 host-token(~/.config/d2d/host-token)')
  const live = (snap.live ?? []).slice(0, 20).map((l) => l.host)
  const fingers = [...new Set((snap.live ?? []).flatMap((l) => l.finger ?? []))].slice(0, 15)
  const evidence = `collect(${base}): 子域 ${snap.subs.all.length} / 存活 ${snap.live.length}(示例: ${live.join(',') || '-'})` +
    `/ 指纹 ${fingers.join(',') || '-'} / 泛解析嫌疑 IP ${snap.wildcardIps.length} — 候选资产, 人工确认归属后入 scope`
  const res = await fetch(`${GRAPHD}/write/signal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth': token },
    body: JSON.stringify({ type: 'asset-perimeter', weight: 1.0, evidence }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`graphd write ${res.status}`)
}

// company 模式: 借道 company-sweep(ICP) 拿候选域名
function icpDomains(company) {
  const script = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../ops/company-sweep.mjs')
  const out = execFileSync(process.execPath, [script, '--company', company, '--json'], { encoding: 'utf8', timeout: 30_000 })
  const j = JSON.parse(out)
  return Array.isArray(j?.domains) ? j.domains : []
}

function runNaabu(ips, ports) {
  if (!ips.length || !ports) return []
  let bin = ''
  try { bin = execFileSync('which', ['naabu'], { encoding: 'utf8' }).trim() } catch { return [] }
  return new Promise((resolve) => {
    const child = spawn(bin, ['-host', ips.join(','), '-p', ports, '-silent'], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    child.stdout.on('data', (d) => { out += d })
    child.on('close', () => {
      const pairs = out.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const m = l.match(/^([\d.]+):(\d+)$/)
        return m ? { ip: m[1], port: Number(m[2]) } : null
      }).filter(Boolean)
      resolve(pairs)
    })
    child.on('error', () => resolve([]))
  })
}

// ---------- 主流程 ----------
const company = arg('--company')
const domainArg = arg('--domain').toLowerCase()
if (!company && !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(domainArg)) {
  console.error('用法: collect.mjs --domain example.com | --company 某某网络 [--tier p1] [--skip-mapping] [--skip-brute] [--skip-probe] [--ports 80,443] [--write-graph] [--json]')
  process.exit(1)
}
const tier = ['p0', 'p1', 'p2'].includes(arg('--tier')) ? arg('--tier') : 'p1'
const startedAt = new Date().toISOString()
const bases = company ? [] : [domainArg]
if (company) {
  console.error(`[0/4] 企业面(ICP): ${company} …`)
  bases.push(...selectBases(icpDomains(company)))
  if (!bases.length) { console.error('ICP 无候选域名 — 配 D2D_ICP_API_KEY 后重跑或手动给 --domain'); process.exit(3) }
}
const base = bases[0]

const report = { base, company: company || undefined, startedAt, tier, subs: { mapping: [], passive: [], dict: [] }, live: [], ports: [], wildcardIps: [], stages: {} }

// Stage 1 测绘
if (!has('--skip-mapping')) {
  console.error(`[1/4] 测绘聚合: ${company ? `icp="${company}"` : `domain="${base}"`} …`)
  try {
    const r = await searchAll(company ? { icp: company, domain: base } : { domain: base }, { size: 1000, maxPages: 2 })
    report.subs.mapping = subdomainsOf(r.assets, base)
    report.stages.mapping = { perProvider: r.perProvider, assets: r.assets.length, mappingSubs: report.subs.mapping.length }
    console.error(`  测绘资产 ${r.assets.length} → 反哺子域 ${report.subs.mapping.length}`)
  } catch (e) {
    report.stages.mapping = { error: String(e.message).slice(0, 200) }
    console.error(`  跳过: ${e.message}`)
  }
}

// Stage 2 被动子域
console.error(`[2/4] 被动子域(crt.sh): ${bases.join(', ')} …`)
for (const b of bases) {
  try { report.subs.passive.push(...(await crtshSubs(b))) } catch (e) { report.stages.crtsh = String(e.message).slice(0, 120) }
}
report.subs.passive = [...new Set(report.subs.passive)]
console.error(`  crt.sh 子域 ${report.subs.passive.length}`)

// Stage 3 字典爆破
let resolvedAll = new Map()
if (!has('--skip-brute')) {
  const dict = loadDict('subdomain', tier)
  if (dict === null) console.error('[3/4] 字典缺失 — 跳过爆破(fetch-wordlists.mjs 可补)')
  else {
    const bruteBases = selectBases(bases, BRUTE_BASE_CAP)
    const words = candidateSubs(dict, base)
    console.error(`[3/4] 字典爆破(tier=${tier}): ${words.length} 候选 × ${bruteBases.length} 域 …`)
    const resolvers = loadResolvers()
    const ns = resolvers.length ? resolvers : ['223.5.5.5', '119.29.29.29', '8.8.8.8', '1.1.1.1']
    const resolved = await resolveBatch(words, ns, { concurrency: CONCURRENCY, onProgress: (d, left) => console.error(`  进度 ${d}(余 ${left})`) })
    const { wildcardIps, pruned } = pruneWildcard(resolved)
    report.wildcardIps = [...wildcardIps]
    resolvedAll = pruned
    report.subs.dict = [...pruned.keys()]
    console.error(`  解析成功 ${pruned.size} / 泛解析嫌疑 IP ${wildcardIps.size}`)
  }
}

const allSubs = [...new Set([...report.subs.mapping, ...report.subs.passive, ...report.subs.dict])]
report.subs.all = allSubs

// Stage 4 探活 + 指纹
if (!has('--skip-probe')) {
  console.error(`[4/4] 探活+指纹: ${allSubs.length} 子域 …`)
  let rules = []
  try { rules = loadRules(JSON.parse(fs.readFileSync(FP_RULES, 'utf8'))).rules } catch (e) { console.error(`  规则库不可读: ${e.message}`) }
  const probes = await probeHosts(allSubs, { concurrency: Math.min(CONCURRENCY, 100) })
  for (const [host, r] of probes) {
    if (!r?.evidence) continue
    const fingers = rules.length ? detectFingerprint(rules, r.evidence).map((x) => x.product) : []
    report.live.push({ host, url: r.evidence.url, scheme: r.scheme, status: r.evidence.status, title: r.evidence.title, server: r.evidence.headers?.server ?? '', tech: [...new Set([...(r.evidence.tech ?? []), ...fingers])], finger: fingers, faviconMd5: r.evidence.faviconMd5 })
  }
  console.error(`  存活 ${report.live.length} / 命中指纹 ${[...new Set(report.live.flatMap((l) => l.finger))].length} 种`)
}

// 端口(可选, 需 naabu)
if (has('--ports')) {
  const ips = [...new Set(report.live.flatMap((l) => resolvedAll.get(l.host) ?? []))]
  const pairs = await runNaabu(ips, arg('--ports'))
  report.ports = pairs
  console.error(`端口扫描(naabu): ${pairs.length} 条开放记录`)
}

// 快照落盘
const snapDir = path.join(DATA_DIR, 'assets', base)
fs.mkdirSync(snapDir, { recursive: true })
const snapFile = path.join(snapDir, `${Date.now()}.json`)
fs.writeFileSync(snapFile, JSON.stringify(report, null, 2))

if (has('--write-graph')) {
  try { await writeGraphSummary(base, report); console.error('已写 Signal_(asset-perimeter) 摘要') } catch (e) { console.error(`写图失败: ${e.message}`) }
}

if (asJson) console.log(JSON.stringify({ ...report, snapshot: snapFile }, null, 2))
else {
  console.log(`\n=== 收集完成: ${base} ===`)
  console.log(`子域: 测绘 ${report.subs.mapping.length} / crt.sh ${report.subs.passive.length} / 字典 ${report.subs.dict.length} / 合计去重 ${allSubs.length}`)
  console.log(`存活: ${report.live.length}; 指纹: ${[...new Set(report.live.flatMap((l) => l.finger))].join(', ') || '-'}`)
  for (const l of report.live.slice(0, 20)) console.log(`  [${l.status}] ${l.url}  ${l.title ? `«${l.title.slice(0, 40)}»` : ''}${l.finger.length ? ` ⛁ ${l.finger.join(',')}` : ''}`)
  if (report.wildcardIps.length) console.log(`泛解析嫌疑 IP(已剪枝): ${report.wildcardIps.join(', ')}`)
  console.log(`快照: ${snapFile}`)
  console.log('\n注: 候选资产 ≠ 授权范围 — 测试前人工确认归属并加入 engagement scope。')
}
