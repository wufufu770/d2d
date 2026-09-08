// probe.mjs — 存活探测与证据采集(P1/M2): host → {https, http} 双协议试探, 采集指纹证据。
// 轻量优先: body 截 256KB、favicon 按需(只取 64KB 算 md5)、单 host 总预算 2 次请求。
// 证据形状与 fingerprint.mjs 的 detectFingerprint 对齐; 探测目标一律来自收集阶段(scope 前的
// 候选资产 — 只发 GET, 不带 payload, 不做漏洞验证; 真正的测试在 worker 授权 scope 后)。
export function extractTitle(html) {
  const m = String(html ?? '').match(/<title[^>]*>([\s\S]{0,2000}?)<\/title>/i)
  if (!m) return ''
  return m[1]
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(Number(d)) } catch { return ' ' } })
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

// 技术栈提示(轻量): server/x-powered-by 头 — 与指纹引擎互补, 进 Endpoint.tech
export function techHints(headers = {}) {
  const out = new Set()
  const pick = (v) => String(v ?? '').trim().toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    const key = k.toLowerCase()
    if (key === 'server' && pick(v) && pick(v) !== 'cloudflare') out.add(pick(v).split('/')[0])
    if (key === 'x-powered-by') for (const t of pick(v).split(/[,/]/)) { if (t.trim()) out.add(t.trim().split(' ')[0]) }
  }
  return [...out]
}

async function fetchEvidence(url, { timeoutMs, fetchImpl, wantFavicon }) {
  const res = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })
  let body = ''
  const ct = String(res.headers.get('content-type') ?? '')
  if (/text\/html|text\/plain|application\/(json|xhtml|xml)/i.test(ct) || !ct) {
    const buf = Buffer.from(await res.arrayBuffer())
    body = buf.subarray(0, 256 * 1024).toString('utf8')
  }
  let faviconMd5 = ''
  if (wantFavicon) {
    try {
      const fr = await fetchImpl(new URL('/favicon.ico', res.url || url).toString(), { redirect: 'follow', signal: AbortSignal.timeout(Math.min(timeoutMs, 5000)) })
      if (fr.ok) faviconMd5 = (await import('node:crypto')).createHash('md5').update(Buffer.from(await fr.arrayBuffer())).digest('hex')
    } catch { /* favicon 缺失常态 */ }
  }
  const headers = {}
  for (const [k, v] of res.headers) headers[k.toLowerCase()] = v
  return {
    url: String(res.url || url),
    status: res.status,
    title: extractTitle(body),
    headers,
    body,
    faviconMd5,
    contentType: ct,
    tech: techHints(headers),
  }
}

// → Map(host → {scheme, evidence}|{error}) — https 优先(成功即用), 失败降 http; 双败记 error。
export async function probeHosts(hosts, { concurrency = 50, timeoutMs = 8000, fetchImpl = fetch, wantFavicon = true, onProgress = null } = {}) {
  const list = [...hosts]
  const results = new Map()
  let done = 0
  async function worker() {
    for (;;) {
      const host = list.shift()
      if (host === undefined) return
      let ev = null
      for (const scheme of ['https', 'http']) {
        try {
          const e = await fetchEvidence(`${scheme}://${host}/`, { timeoutMs, fetchImpl, wantFavicon })
          if (e.status && e.status < 600) { ev = { scheme, evidence: e }; break }
        } catch { /* 下一个协议 */ }
      }
      results.set(host, ev ?? { error: '不可达(https/http 均失败)' })
      done++
      if (onProgress && done % 100 === 0) onProgress(done, results.size)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, list.length)) }, worker))
  return results
}
