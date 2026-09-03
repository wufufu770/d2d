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
// severity 映射: zap High(risk=3)/Medium(2)/Low(1)/Informational(0) → High/Medium/Low
function severityOf(alert) {
  const risk = Number(alert.risk ?? alert.riskcode ?? 0)
  if (risk >= 3) return 'High'
  if (risk === 2) return 'Medium'
  return 'Low'
}
export function alertsToFindings(alerts) {
  const rank = { High: 0, Medium: 1, Low: 2 }
  return (alerts ?? [])
    .map((a) => {
      const cwe = a.cwe ?? a.cweid ?? ''
      const param = a.param ?? a.attack ?? ''
      const url = a.url ?? ''
      const id = `f-zap-${crypto.createHash('sha256').update(`${a.alert ?? a.name}|${url}|${param}`).digest('hex').slice(0, 12)}`
      const repro = [cwe && `cwe:${cwe}`, url, param && `param:${param}`].filter(Boolean).join(' ')
      return {
        id, title: a.alert ?? a.name ?? 'zap alert',
        severity: severityOf(a),
        category: 'zap',
        repro,
        evidence: (a.evidence ?? '').slice(0, 200),
        source: 'zap',
      }
    })
    .sort((x, y) => rank[x.severity] - rank[y.severity])
}

// ---------- 编排: health → spider → 轮询 → ascan → 轮询 → alerts ----------
export async function zapScan({ baseUrl, target, apiKey = '', fetchImpl = j, pollMs = 1000, maxPolls = 60 }) {
  const enc = encodeURIComponent
  await zapHealth({ baseUrl, fetchImpl })
  const spiderStart = await fetchImpl(`${baseUrl}/JSON/spider/action/scan/?url=${enc(target)}&apikey=${enc(apiKey)}`)
  await pollStatus(`${baseUrl}/JSON/spider/view/status/?scanId=${spiderStart.scan}`, fetchImpl, pollMs, maxPolls)
  const ascanStart = await fetchImpl(`${baseUrl}/JSON/ascan/action/scan/?url=${enc(target)}&apikey=${enc(apiKey)}&scanId=${spiderStart.scan}`)
  await pollStatus(`${baseUrl}/JSON/ascan/view/status/?scanId=${ascanStart.scan}`, fetchImpl, pollMs, maxPolls)
  const alertResp = await fetchImpl(`${baseUrl}/JSON/alert/view/alerts/?baseurl=${enc(target)}`)
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
  const child = spawnImpl(zapPath, ['-daemon', '-host', host, '-port', String(port)], { stdio: 'ignore' })
  const stop = () => new Promise((resolve) => {
    if (child.exitCode !== null) return resolve()
    const killer = setTimeout(() => { try { child.kill('SIGKILL') } catch {} ; resolve() }, 5000)
    child.once('exit', () => { clearTimeout(killer); resolve() })
    try { child.kill('SIGTERM') } catch { resolve() }
  })
  return { child, baseUrl: `http://${host}:${port}`, stop }
}
