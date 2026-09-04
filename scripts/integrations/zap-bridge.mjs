// zap-bridge.mjs — #57 OWASP ZAP JSON API 客户端 + Finding 转换 + 守护进程启停
// 仅 stdlib fetch / child_process, 不新增依赖。ZAP API 形态:
//   /JSON/core/view/version  → { version }
//   /JSON/spider/action/scan?url=&apikey= → { scan }
//   /JSON/spider/view/status?scanId= → { status }
//   /JSON/ascan/action/scan?url=&apikey= → { scan }
//   /JSON/ascan/view/status?scanId= → { status }
//   /JSON/alert/view/alerts?baseurl= → { alerts: [...] }
// listen 默认 127.0.0.1:8080(zap.sh -daemon -port)。
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'

const j = (u) => fetch(u).then((r) => r.json())
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- health ----------
export async function zapHealth({ baseUrl, fetchImpl = j }) {
  const r = await fetchImpl(`${baseUrl}/JSON/core/view/version/`)
  return { ok: true, version: r.version }
}

// ---------- alerts → Finding (#57) ----------
// severity 映射: zap High(risk=3)/Medium(2)/Low(1)/Informational(0) → High/Medium/Low/Info
// (复审#13: risk=0 不再压成 Low, 单独 Info 档)
function severityOf(alert) {
  const risk = Number(alert.risk ?? alert.riskcode ?? 0)
  if (risk >= 3) return 'High'
  if (risk === 2) return 'Medium'
  if (risk === 1) return 'Low'
  return 'Info'
}
export function alertsToFindings(alerts) {
  const rank = { High: 0, Medium: 1, Low: 2, Info: 3 }
  const byId = new Map() // 复审#13: 同 id(alert|url|param)去重聚合, 重复出现记 count
  for (const a of alerts ?? []) {
    const cwe = a.cwe ?? a.cweid ?? ''
    const param = a.param ?? a.attack ?? ''
    const url = a.url ?? ''
    const id = `f-zap-${crypto.createHash('sha256').update(`${a.alert ?? a.name}|${url}|${param}`).digest('hex').slice(0, 12)}`
    const repro = [cwe && `cwe:${cwe}`, url, param && `param:${param}`].filter(Boolean).join(' ')
    const prev = byId.get(id)
    if (prev) { prev.count = (prev.count ?? 1) + 1; continue }
    byId.set(id, {
      id, title: a.alert ?? a.name ?? 'zap alert',
      severity: severityOf(a),
      category: 'zap',
      repro,
      evidence: (a.evidence ?? '').slice(0, 200),
      source: 'zap',
    })
  }
  return [...byId.values()].sort((x, y) => rank[x.severity] - rank[y.severity])
}

// ---------- 编排: health → spider → 轮询 → ascan → 轮询 → alerts ----------
export async function zapScan({ baseUrl, target, apiKey = '', fetchImpl = j, pollMs = 1000, maxPolls = 60 }) {
  const enc = encodeURIComponent
  await zapHealth({ baseUrl, fetchImpl })
  const spiderStart = await fetchImpl(`${baseUrl}/JSON/spider/action/scan/?url=${enc(target)}&apikey=${enc(apiKey)}`)
  await pollStatus(`${baseUrl}/JSON/spider/view/status/?scanId=${spiderStart.scan}`, fetchImpl, pollMs, maxPolls)
  const ascanStart = await fetchImpl(`${baseUrl}/JSON/ascan/action/scan/?url=${enc(target)}&apikey=${enc(apiKey)}&scanId=${spiderStart.scan}`)
  await pollStatus(`${baseUrl}/JSON/ascan/view/status/?scanId=${ascanStart.scan}`, fetchImpl, pollMs, maxPolls)
  // 复审#12: alerts 拉取同样要带 apikey — 老实现漏带, 开启 API key 时静默 0 发现
  const alertResp = await fetchImpl(`${baseUrl}/JSON/alert/view/alerts/?baseurl=${enc(target)}&apikey=${enc(apiKey)}`)
  if (!alertResp || !Array.isArray(alertResp.alerts)) {
    // 复审#12: 响应缺 alerts 字段 → fail-loud, 不静默当 0 发现
    throw new Error('#57 alerts 响应缺少 alerts 数组(检查 apikey/权限/版本)')
  }
  return alertsToFindings(alertResp.alerts)
}

async function pollStatus(url, fetchImpl, pollMs, maxPolls) {
  for (let i = 0; i < maxPolls; i++) {
    const r = await fetchImpl(url)
    if (String(r.status) === '100') return
    await sleep(pollMs)
  }
  throw new Error(`#57 zap 轮询超时: ${url}`)
}

// ---------- 守护进程启停: zap.sh -daemon, SIGTERM→5s→SIGKILL ----------
export async function startZap({ zapPath = 'zap.sh', port = 8080, host = '127.0.0.1', spawnImpl = spawn } = {}) {
  let child
  try {
    child = spawnImpl(zapPath, ['-daemon', '-host', host, '-port', String(port)], { stdio: 'ignore' })
  } catch (e) {
    // 复审#11: spawn 同步异常同样并入状态, 不崩调用进程
    return {
      child: null, baseUrl: `http://${host}:${port}`,
      get ok() { return false }, get error() { return `spawn 失败: ${e?.message ?? e}` },
      stop: async () => {},
    }
  }
  let spawnError = null
  let spawnFailed = false
  // 复审#11: 立即挂 error 监听 — ENOENT 等错误不再是 unhandled 'error' 崩调用进程,
  // 失败并入返回状态(ok/error)
  child.on('error', (e) => { spawnFailed = true; spawnError = e })
  const stop = () => new Promise((resolve) => {
    // 复审#13: 已死进程(exitCode 或 signalCode 已定)或 spawn 已失败 → 立即返回, 不空等 5s
    // (用 != null: mock/异常子进程的 signalCode 可能是 undefined)
    if (spawnFailed || child.exitCode != null || child.signalCode != null) return resolve()
    const killer = setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, 5000)
    // 复审#13: SIGKILL 兜底后等 exit 事件再 resolve(不再发完即 resolve)
    child.once('exit', () => { clearTimeout(killer); resolve() })
    try { child.kill('SIGTERM') } catch { clearTimeout(killer); resolve() }
  })
  return {
    child, baseUrl: `http://${host}:${port}`, stop,
    get ok() { return !spawnFailed },
    get error() { return spawnError ? String(spawnError.message ?? spawnError) : null },
  }
}
