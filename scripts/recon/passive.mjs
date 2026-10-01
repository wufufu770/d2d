// passive.mjs — 被动子域源(P1/M2/T3-2-1): 证书透明日志(crt.sh) + Hackertarget 免费层 — 公开只读源, 不碰目标。
// T3-2-1 网关化: 外部源请求统一走 osintGet — 经 egress 网关(P2P_PROXY_URL, curl --proxy, scope 门/
//   令牌桶/审计全生效; adapter-dsh.mjs:203-212 worker env 注入同款语义), 网关不可达 → 降级直连 fetch
//   (既有直连行为, SSH 直启无网关环境先例); P2P_PROXY_URL=off 显式直连(无网关自治网络)。
//   情报源主机在网关 OSINT_HOSTS 豁免面(scope 外放行, egress-gateway.mjs; D2D_EGRESS_OSINT_HOSTS 可增补)。
// 限速纪律: 保守三重保证 — collect Stage2 每域一次(天然低频) + 网关 per-host 令牌桶(P2P_PROXY_RATE)
//   + 上游 429/503 自动 penalty 退避(T2-2b-1); 免费层源不做更细 per-host 速率配置(越界)。
import { execFile } from 'node:child_process'

const URL_OK = /^https:\/\// // 安全约束: 情报源查询仅 https; host 由代码常量构造, domain 参数另有归属正则校验

/** osint 通道 GET: 网关代理(curl --proxy)优先, 失败降级直连 fetch。opts.fetchImpl 仅供测试注入。 */
export async function osintGet(url, { timeoutMs = 20000, proxy, fetchImpl } = {}) {
  if (!URL_OK.test(String(url ?? ''))) throw new Error(`osint: 非 https URL 拒绝`)
  if (fetchImpl) {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) }) // 测试注入(mock/直连模拟)
    return { ok: res.ok, status: res.status, text: await res.text(), via: 'mock' }
  }
  const px = String(proxy ?? process.env.P2P_PROXY_URL ?? 'http://127.0.0.1:8888').trim()
  if (px && !/^(off|none)$/i.test(px)) {
    try {
      const text = await new Promise((resolve, reject) => {
        execFile('curl', ['-s', '--max-time', String(Math.ceil(timeoutMs / 1000)), '--proxy', px, url],
          { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout)))
      })
      return { ok: true, status: 200, text, via: 'gateway' }
    } catch {
      // 网关不可达(SSH 直启/网关未启) → 降级直连(既有行为; adapter-dsh.mjs:203 旁路先例)
    }
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  return { ok: res.ok, status: res.status, text: await res.text(), via: 'direct' }
}

const SUB_RE = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/

/** 归属校验+去重(两源共用): 仅收 base 的子域, 剥 *. 前缀, 排除 base 本身与非法字符 */
function collectSubs(into, base, candidate) {
  const n = String(candidate ?? '').trim().toLowerCase().replace(/^\*\./, '')
  if (!n || n.includes(' ') || !n.endsWith(`.${base}`)) return
  if (n === base || !SUB_RE.test(n)) return
  into.add(n)
}

// 证书透明日志(crt.sh): JSON 输出, 响应可能极慢/超大 — 上限 5000 条; 输出去重子域列表(小写)。
export async function crtshSubs(domain, { fetchImpl, timeoutMs = 20000, limit = 5000, proxy } = {}) {
  const base = String(domain ?? '').trim().toLowerCase().replace(/\.$/, '')
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(base)) throw new Error(`domain 非法: ${base}`)
  const url = `https://crt.sh/?q=%25.${encodeURIComponent(base)}&output=json`
  const r = await osintGet(url, { timeoutMs, proxy, fetchImpl })
  if (!r.ok) throw new Error(`crt.sh http ${r.status}`)
  let rows = []
  try { rows = JSON.parse(r.text) } catch { throw new Error('crt.sh 响应非 JSON(可能被限流页顶替)') }
  const out = new Set()
  for (const row of Array.isArray(rows) ? rows : []) {
    for (const n of String(row?.name_value ?? '').split(/\n/)) {
      collectSubs(out, base, n)
      if (out.size >= limit) return [...out]
    }
  }
  return [...out]
}

// Hackertarget 免费层(hostsearch): 无 key, 响应文本行 "host,ip"; 免费配额超限 → HTTP 200 +
//   体含 "API count exceeded"(识别后抛专用错误, 调用方静默降级不硬凑); 官方限速不明 → 保守
//   依赖调用低频(每域一次)+网关令牌桶。输出与 crtshSubs 同形态(去重子域列表)。
export async function hackertargetSubs(domain, { fetchImpl, timeoutMs = 15000, limit = 5000, proxy } = {}) {
  const base = String(domain ?? '').trim().toLowerCase().replace(/\.$/, '')
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(base)) throw new Error(`domain 非法: ${base}`)
  const url = `https://api.hackertarget.com/hostsearch/?q=${encodeURIComponent(base)}`
  const r = await osintGet(url, { timeoutMs, proxy, fetchImpl })
  if (!r.ok) throw new Error(`hackertarget http ${r.status}`)
  if (/API count exceeded/i.test(r.text)) throw new Error('hackertarget: API count exceeded(免费配额耗尽)')
  if (/error check your search query/i.test(r.text)) throw new Error('hackertarget: 查询被拒(参数或配额)')
  const out = new Set()
  for (const line of r.text.split(/\r?\n/)) {
    const host = line.split(',')[0] // "sub.host,ip" 行格式; 仅取 host 列(归属校验兜住噪声)
    collectSubs(out, base, host)
    if (out.size >= limit) return [...out]
  }
  return [...out]
}
