// @wufufu770/d2d-graphd — 薄客户端: stdlib fetch 封装 graphd HTTP API, 零依赖。
// fetch 可注入(createClient({ fetch })), 便于测试零网络。

export class GraphdError extends Error {
  constructor(status, body, message) {
    super(message || `graphd HTTP ${status}: ${String(body).slice(0, 200)}`)
    this.name = 'GraphdError'
    this.status = status
    this.body = body
  }
}

const DEFAULT_BASE = 'http://127.0.0.1:8766'

export function createClient({ baseUrl = DEFAULT_BASE, hostToken = '', fetch: fetchImpl = globalThis.fetch } = {}) {
  const base = String(baseUrl).replace(/\/+$/, '')
  async function call(path, { method = 'GET', body } = {}) {
    const headers = { 'content-type': 'application/json' }
    if (hostToken) headers['authorization'] = `Bearer ${hostToken}`
    let res
    try {
      res = await fetchImpl(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    } catch (cause) {
      throw new GraphdError(0, '', `graphd 不可达(${base}): ${cause?.message || cause}`)
    }
    const text = await res.text()
    if (!res.ok) throw new GraphdError(res.status, text)
    try { return JSON.parse(text) } catch { return text }
  }
  return {
    baseUrl: base,
    health: () => call('/health'),
    query: (cypher, params = {}) => call('/query', { method: 'POST', body: { cypher, params } }),
    writeFinding: (finding) => call('/write/finding', { method: 'POST', body: finding }),
    writeSignal: (signal) => call('/write/signal', { method: 'POST', body: signal }),
    transition: ({ findingId, to, note = '' }) =>
      call('/write/transition', { method: 'POST', body: { findingId, to, note } }),
  }
}
