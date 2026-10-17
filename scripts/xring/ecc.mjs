// ecc.mjs — R-03 环境一致性检验（ECC: Environment Consistency Check）
// 预裁 1: **advisory 信号而非硬闸**——信号入环境画像+任务书注入+报告 caveat, worker 据此
// 自行降档（Phase 3 实证 worker 自处理能力; 误报不应杀死合法 run）。auto-stop 形态否决。
// 判据=L-3/L-4 冻结口径: 单轮异构路径指纹趋同+同路径双探翻转（L-3）+安全头暴露非目标
// origin（L-4）; 跨轮=当前指纹 vs handoff 基线漂移（消费 R-05 基线——形态突变机械化）。
import http from 'node:http'
import https from 'node:https'
import { createHash } from 'node:crypto'

export const DEFAULT_PROBE_PATHS = ['/', '/api/health', '/static/app.js', '/admin/', '/api/items']

function rawGet(urlStr, { insecure = false, timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return reject(new Error(`协议非 http/https: ${u.protocol}`))
    const mod = u.protocol === 'https:' ? https : http
    const req = mod.request(u, { method: 'GET', rejectUnauthorized: insecure ? false : undefined, timeout: timeoutMs, headers: { connection: 'close' } }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('timeout', () => { req.destroy(new Error('timeout')) })
    req.on('error', reject)
    req.end()
  })
}

/** 指纹探针: 异构路径逐个 GET, 路径级响应特征（status/content_type/bytes/sha256）; 首路径双探翻转检测。 */
export async function probeFingerprint({ targetBase, paths = DEFAULT_PROBE_PATHS, insecure = false, doubleProbe = true, timeoutMs = 8000 } = {}) {
  const base = new URL(targetBase)
  const probes = []
  for (const p of paths.slice(0, 20)) {
    try {
      const r = await rawGet(new URL(p, base).href, { insecure, timeoutMs })
      probes.push({
        path: p,
        status: r.status,
        content_type: String(r.headers['content-type'] ?? '').slice(0, 200),
        bytes: r.body.length,
        hash: createHash('sha256').update(r.body).digest('hex'),
      })
    } catch (e) {
      probes.push({ path: p, status: 0, bytes: 0, hash: 'error:' + String(e?.message ?? e).slice(0, 24) })
    }
  }
  let double = null
  if (doubleProbe && probes[0]) {
    try {
      const r2 = await rawGet(new URL(probes[0].path, base).href, { insecure, timeoutMs })
      const h2 = createHash('sha256').update(r2.body).digest('hex')
      double = { path: probes[0].path, flip: h2 !== probes[0].hash || r2.status !== probes[0].status }
    } catch { double = { path: probes[0].path, flip: null } }
  }
  return { probes, double, headers: (await (async () => { try { const r = await rawGet(new URL('/', base).href, { insecure, timeoutMs }); return r.headers } catch { return {} } })()) }
}

/** 单轮判据（L-3）: 异构路径响应指纹趋同=同响应嫌疑。趋同组覆盖 ≥minConverge 条且 ≥ 半数路径触发。 */
export function assessSingleRound(probes, { minConverge = 3 } = {}) {
  const ok = (probes ?? []).filter((p) => p.status > 0)
  if (ok.length < minConverge) return null
  const groups = new Map()
  for (const p of ok) {
    const k = `${p.status}|${p.hash}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(p)
  }
  const [bestKey, best] = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)[0]
  if (best.length < minConverge || best.length * 2 < ok.length) return null
  const confidence = best.length === ok.length ? 'high' : (best.length * 3 >= ok.length * 2 ? 'medium' : 'low')
  return {
    kind: 'homogeneous-response',
    confidence,
    detail: `${best.length}/${ok.length} 异构路径同指纹（${bestKey.split('|')[0]} ${String(best[0].bytes)}B ${String(best[0].hash).slice(0, 12)}…）——同响应/tarpit 嫌疑`,
  }
}

/** 双探翻转（L-3 实证形态）: 同路径秒级复读指纹漂移=运行中形态切换前兆。 */
export function assessDoubleProbe(double) {
  if (!double || double.flip !== true) return null
  return { kind: 'fingerprint-drift', confidence: 'medium', detail: `同路径双探翻转（${double.path}）——运行中形态切换嫌疑` }
}

/** 跨轮判据: 当前指纹 vs handoff 基线（R-05 env.fingerprint）——共享路径漂移比 ≥driftRatio 触发。 */
export function assessCrossRound(probes, baseline, { baselineRun = null, driftRatio = 0.5, minShared = 2 } = {}) {
  if (!Array.isArray(baseline) || baseline.length === 0) return null
  const baseMap = new Map(baseline.map((b) => [String(b.path), b]))
  let shared = 0, changed = 0
  for (const p of probes ?? []) {
    const b = baseMap.get(String(p.path))
    if (!b || p.status === 0) continue
    shared++
    if (String(p.hash) !== String(b.hash) || Number(p.status) !== Number(b.status)) changed++
  }
  if (shared < minShared) return null
  const ratio = changed / shared
  if (ratio < driftRatio) return null
  return {
    kind: 'fingerprint-drift',
    confidence: ratio >= 0.75 ? 'high' : 'medium',
    detail: `跨轮漂移 vs ${baselineRun ?? '基线'}: ${changed}/${shared} 基线路径指纹已变——目标形态突变嫌疑`,
  }
}

/** 安全头外部 origin（L-4 实证形态）: CSP 指令暴露非目标 origin=deception/lab 部署线索。 */
export function foreignOriginSignals(headers, targetOrigin) {
  const csp = String(headers?.['content-security-policy'] ?? headers?.['Content-Security-Policy'] ?? '')
  if (!csp) return { origins: [], signal: null }
  const origins = new Set()
  for (const directive of csp.split(';')) {
    for (const token of directive.trim().split(/\s+/)) {
      if (/^https?:\/\//i.test(token)) {
        try { const o = new URL(token).origin; if (o !== targetOrigin) origins.add(o) } catch { /* 非 URL token 忽略 */ }
      }
    }
  }
  const list = [...origins]
  return {
    origins: list,
    signal: list.length ? { kind: 'foreign-origin', confidence: 'medium', detail: `CSP 暴露非目标 origin: ${list.slice(0, 3).join(', ')}——lab/deployment 拓扑线索` } : null,
  }
}

/** 信号汇诊（advisory 汇总——不产生任何阻断决策）。level: none/suspicious/likely。 */
export function assess({ probes, double = null, headers = {}, targetOrigin, baseline = null, baselineRun = null } = {}) {
  const signals = []
  const s1 = assessSingleRound(probes)
  if (s1) signals.push(s1)
  const s2 = assessDoubleProbe(double)
  if (s2) signals.push(s2)
  const s3 = assessCrossRound(probes, baseline, { baselineRun })
  if (s3) signals.push(s3)
  const fo = foreignOriginSignals(headers, targetOrigin)
  if (fo.signal) signals.push(fo.signal)
  const high = signals.some((s) => s.confidence === 'high')
  const level = signals.length === 0 ? 'none' : (high || signals.length >= 2 ? 'likely' : 'suspicious')
  return { level, signals, foreignOrigins: fo.origins, checkedAt: new Date().toISOString() }
}

/** 一站式: 探针+汇诊（first-run 探针期调用）。返回含 probes（handoff env.fingerprint 数据源）。 */
export async function assessTarget({ targetBase, paths = DEFAULT_PROBE_PATHS, insecure = false, baseline = null, baselineRun = null, timeoutMs = 8000 } = {}) {
  const targetOrigin = new URL(targetBase).origin
  const { probes, double, headers } = await probeFingerprint({ targetBase, paths, insecure, timeoutMs })
  const r = assess({ probes, double, headers, targetOrigin, baseline, baselineRun })
  return { ...r, probes }
}

/** 任务书 advisory 节（预裁 1: 信号呈现+自行降档建议, 非流程指令）。 */
export function briefSection(eccResult) {
  if (!eccResult || (eccResult.level === 'none' && !(eccResult.signals ?? []).length)) {
    return ['## 环境一致性信号（ECC——advisory 非硬闸）', '', '- 无信号（环境一致性未见异常; 上轮结论按标签语义正常使用）。'].join('\n')
  }
  const L = ['## 环境一致性信号（ECC——advisory 非硬闸; **自行判断并降档**）', '', `- 级别: **${eccResult.level}**`]
  for (const s of eccResult.signals ?? []) L.push(`- [${s.kind}/${s.confidence}] ${s.detail}`)
  L.push(
    '',
    '应对建议（非指令）: 环境可疑语境下, 上轮结论按标签语义降档使用; 每条结论重新取证后再采信;',
    '发现全路径同响应形态时优先做环境确认（同路径秒级复读/异构路径比对）, 避免在 tarpit 上消耗预算。',
  )
  return L.join('\n')
}
