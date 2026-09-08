// wordlists.mjs — 内置字典资产加载器(skyline 资产面采纳 P1/M3)
// 职责: ①按 kind(subdomain/path)+tier(p0/p1/p2) 解析字典文件并流式解压 ②resolver 池
//       (可信集 + trickest 池 24h 缓存) ③manifest sha256 完整性校验(解压后哈希, 供应链防线)。
// 缺文件一律返回 null(不抛) — 调用方跳过该阶段并告警, 字典缺失不阻塞收集流程。
// 用法(库): import { loadDict, loadResolvers, verifyManifest } from '.../wordlists.mjs'
// 用法(CLI): node wordlists.mjs list | verify | show <kind> <tier> [limit]
import zlib from 'node:zlib'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
export const WORDLISTS_DIR = process.env.D2D_WORDLISTS_DIR ?? path.join(REPO_ROOT, 'assets/wordlists')
const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const RESOLVER_CACHE = `${DATA_DIR}/cache/resolvers.txt`
const RESOLVER_TTL_MS = 24 * 3600_000
const RESOLVER_POOL_URL = process.env.D2D_RESOLVER_POOL_URL ?? 'https://raw.githubusercontent.com/trickest/resolvers/main/resolvers.txt'
const RESOLVER_POOL_URL_MIRROR = 'https://cdn.jsdelivr.net/gh/trickest/resolvers@main/resolvers.txt'

const TIERS = ['p0', 'p1', 'p2']
const KINDS = ['subdomain', 'path']

// ---- 纯函数: manifest 校验(未知键忽略, 缺 file/kind/tier 的条目丢弃) ----
export function parseManifest(j) {
  const files = Array.isArray(j?.files) ? j.files : []
  const out = []
  for (const f of files) {
    if (typeof f?.file !== 'string' || !f.file || !KINDS.includes(f?.kind) || !TIERS.includes(f?.tier)) continue
    out.push({ file: f.file, tier: f.tier, kind: f.kind, entries: Number(f.entries) || 0, source: String(f.source ?? ''), sha256: String(f.sha256 ?? '') })
  }
  return out
}

function readMaybeGzip(file) {
  const buf = fs.readFileSync(file)
  // gzip 魔数 1f 8b; 仅 .gz 后缀强制走解压(损坏即抛→上层跳过该文件), 明文兜底只给无后缀文件
  if (file.endsWith('.gz')) return zlib.gunzipSync(buf)
  return buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf
}

function linesOf(buf) {
  const seen = new Set()
  const out = []
  for (const raw of buf.toString('utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (seen.has(line)) continue
    seen.add(line)
    out.push(line)
  }
  return out
}

// kind: 'subdomain' | 'path'; tier: 'p0'|'p1'|'p2'(低于 tier 的也并入 — p1 = p0+p1, 深扫全覆盖)
export function loadDict(kind, tier = 'p1', { dir = WORDLISTS_DIR } = {}) {
  if (!KINDS.includes(kind) || !TIERS.includes(tier)) return null
  const sub = kind === 'subdomain' ? 'subdomains' : 'paths'
  const max = TIERS.indexOf(tier)
  const seen = new Set()
  const merged = []
  let missing = false
  let names = []
  try { names = fs.readdirSync(path.join(dir, sub)) } catch { return null } // 目录缺失 → 调用方跳过该阶段
  for (let i = 0; i <= max; i++) {
    const t = TIERS[i]
    for (const f of names.filter((n) => n.startsWith(`${t}-`) && n.endsWith('.txt.gz')).sort()) {
      try {
        for (const line of linesOf(readMaybeGzip(path.join(dir, sub, f)))) {
          if (!seen.has(line)) { seen.add(line); merged.push(line) }
        }
      } catch { missing = true } // 单文件损坏不拖垮其余档位
    }
  }
  if (!merged.length) return missing ? null : []
  return merged
}

// ---- resolver 池: 可信集(仓库自带) ∪ trickest 池(24h 缓存, 拉取失败静默降级可信集) ----
export function parseResolverLine(line) {
  const s = String(line ?? '').trim()
  if (!s || s.startsWith('#')) return ''
  // 放行 IP(八位组 0-255) / IP:port / DoH URL(dnsx 三种格式都吃); 其余(域名裸写等)丢弃防注入
  const oct = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
  if (new RegExp(`^${oct}(\\.${oct}){3}$`).test(s)) return s
  if (new RegExp(`^${oct}(\\.${oct}){3}:(\\d{1,5})$`).test(s)) return s
  if (/^https:\/\/[a-z0-9.-]+(:\d{1,5})?\/dns-query$/i.test(s)) return s
  return ''
}

export function loadResolvers({ dir = WORDLISTS_DIR, cache = RESOLVER_CACHE, now = Date.now() } = {}) {
  const seen = new Set()
  const out = []
  const push = (buf) => {
    for (const line of buf.toString('utf8').split(/\r?\n/)) {
      const v = parseResolverLine(line)
      if (v && !seen.has(v)) { seen.add(v); out.push(v) }
    }
  }
  try { push(fs.readFileSync(path.join(dir, 'resolvers/trusted.txt'))) } catch { /* 仓库不完整时仍可用缓存池 */ }
  try {
    const st = fs.statSync(cache)
    if (now - st.mtimeMs < RESOLVER_TTL_MS) push(fs.readFileSync(cache))
  } catch { /* 无缓存/过期 → 只用可信集 */ }
  return out
}

// 拉取 trickest 池入缓存(https-only, 带镜像兜底; 失败返回 false 不阻塞)
export async function refreshResolverCache({ cache = RESOLVER_CACHE, timeoutMs = 15000 } = {}) {
  for (const url of [RESOLVER_POOL_URL, RESOLVER_POOL_URL_MIRROR]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
      if (!res.ok) continue
      const body = Buffer.from(await res.arrayBuffer())
      const valid = body.toString('utf8').split(/\r?\n/).map(parseResolverLine).filter(Boolean)
      if (valid.length < 100) continue // 镜像被篡改/截断的兜底
      fs.mkdirSync(path.dirname(cache), { recursive: true })
      fs.writeFileSync(cache, valid.join('\n') + '\n')
      return { ok: true, count: valid.length, cache }
    } catch { /* 试下一个源 */ }
  }
  return { ok: false }
}

// ---- 完整性: 解压后 sha256 对 manifest(哈希锚定原始 txt, gzip 时间戳变化不影响) ----
export function verifyManifest({ dir = WORDLISTS_DIR } = {}) {
  let manifest
  try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) } catch (e) {
    return { ok: false, error: `manifest.json 不可读: ${e.message}`, rows: [] }
  }
  const rows = []
  let ok = true
  for (const f of parseManifest(manifest)) {
    if (!f.sha256) { rows.push({ file: f.file, ok: true, note: '无锚(自维护)' }); continue }
    let actual = ''
    try { actual = crypto.createHash('sha256').update(readMaybeGzip(path.join(dir, f.file))).digest('hex') } catch { /* 缺文件 */ }
    const match = actual === f.sha256
    if (!match) ok = false
    rows.push({ file: f.file, ok: match, note: match ? '' : `sha256 不匹配(actual=${actual.slice(0, 12)}… expected=${f.sha256.slice(0, 12)}…)` })
  }
  return { ok, rows }
}

// ---- CLI ----
if (process.argv[1] && process.argv[1].endsWith('wordlists.mjs')) {
  const cmd = process.argv[2] ?? 'list'
  if (cmd === 'list') {
    const m = JSON.parse(fs.readFileSync(path.join(WORDLISTS_DIR, 'manifest.json'), 'utf8'))
    for (const f of parseManifest(m)) console.log(`${f.tier}  ${f.kind.padEnd(9)} ${String(f.entries).padStart(7)}  ${f.file}`)
  } else if (cmd === 'verify') {
    const r = verifyManifest()
    for (const row of r.rows) console.log(`${row.ok ? '✓' : '✗'} ${row.file} ${row.note}`)
    process.exit(r.ok ? 0 : 1)
  } else if (cmd === 'show') {
    const dict = loadDict(process.argv[3] ?? 'subdomain', process.argv[4] ?? 'p1')
    if (dict === null) { console.error('字典缺失 — 先跑 fetch-wordlists.mjs'); process.exit(2) }
    const limit = Number(process.argv[5] ?? 20)
    console.log(`# ${dict.length} 条(显示前 ${limit})`)
    for (const line of dict.slice(0, limit)) console.log(line)
  } else if (cmd === 'refresh-resolvers') {
    refreshResolverCache().then((r) => { console.log(r.ok ? `✓ resolver 池已缓存(${r.count} 条)` : '! 拉取失败 — 用可信集'); process.exit(r.ok ? 0 : 1) })
  } else {
    console.error('用法: wordlists.mjs list | verify | show <kind> <tier> [limit] | refresh-resolvers')
    process.exit(1)
  }
}
