// mcp-discovery.mjs — T3-2-4 对内配置驱动发现(纯函数为主; 配置即边界, 零运行时自动发现)
// 安全底线 3/4: 只认 config/mcp-servers.json 清单(不合法 → fail-closed 拒绝发现);
//   P2P_MCP_CLIENT === '0' → 发现与调用双双失效(缺省启用; 与 P2P_MCP_SERVER 正交)。
// Mimosa 约束: 外部 endpoint 发请求前 host 校验 — 仅 http/https, 缺省拒绝 localhost/环回/
//   私有/保留段; 配置显式 allowPrivate:true 才放行(操作员显式决定 + 审计留痕)。
// 调用协议: 远程 MCP = HTTP JSON-RPC(initialize/tools/call; v1 单 endpoint 单请求无会话态 —
//   会话化登记开放项)。**外部响应必须过 sanitizeIngestExternal 才可消费/入图**(调用方义务)。

const PRIVATE_HOST_RE = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0$|\[::1\]$|::1$|\[fc|fc|fd|fe80)/i
const RESERVED_HOST_RE = /^(22[4-9]|2[3-9]\d)\./ // 组播/保留 224.0.0.0-255.255.255.255 段首字节

/** endpoint 校验(fail-closed): 仅 http/https; allowPrivate !== true 时拒绝环回/私有/保留段 */
export function assertMcpEndpoint(url, { allowPrivate = false } = {}) {
  let u
  try { u = new URL(String(url ?? '')) } catch { throw new Error(`endpoint 非法 URL: ${url}`) }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error(`endpoint 协议拒绝: ${u.protocol}(仅 http/https)`)
  const h = u.hostname.toLowerCase()
  if (!allowPrivate && (PRIVATE_HOST_RE.test(h) || RESERVED_HOST_RE.test(h))) {
    throw new Error(`endpoint 主机拒绝(私有/保留段, 显式 allowPrivate:true 才放行): ${h}`)
  }
  return { protocol: u.protocol.replace(':', ''), host: h }
}

/** 配置加载校验(fail-closed): {servers:[{name,endpoint,allowPrivate?,tools[]}]} → 合法清单或抛错
 * 校验: name 白名单字符 / endpoint assertMcpEndpoint / tools 非空数组且 [a-z0-9_] 命名。 */
export function loadMcpServers(doc, { now = Date.now() } = {}) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.servers)) throw new Error('mcp-servers.json 须为 {servers:[…]}')
  const out = []
  for (const s of doc.servers) {
    const name = String(s?.name ?? '')
    if (!/^[a-z0-9_-]{1,40}$/.test(name)) throw new Error(`server name 非法: ${name}`)
    const { protocol, host } = assertMcpEndpoint(s?.endpoint, { allowPrivate: s?.allowPrivate === true })
    const tools = Array.isArray(s?.tools) ? s.tools.map(String) : []
    if (!tools.length || tools.some((t) => !/^[a-z0-9_.-]{1,64}$/.test(t))) throw new Error(`server ${name} tools 白名单非法`)
    out.push({ name, endpoint: String(s.endpoint), transport: String(s?.transport ?? 'http'), allowPrivate: s?.allowPrivate === true, tools, protocol, host, loaded_at: now })
  }
  return out
}

/** 健康探针(initialize 握手; fetchImpl 注入可测; 失败 → {available:false} 降级不抛) */
export async function probeMcpServer(server, { fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  try {
    const res = await fetchImpl(server.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'd2d', version: '1.0.0' } } }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const j = await res.json().catch(() => ({}))
    if (res.ok && j?.result?.serverInfo) return { available: true, serverInfo: j.result.serverInfo }
    return { available: false, reason: `http ${res.status}` }
  } catch (e) {
    return { available: false, reason: String(e?.message ?? e).slice(0, 120) }
  }
}

/** 远程工具调用: tools/call → 响应文本**必须过 sanitizeIngestExternal**(安全底线 2 — 本函数
 * 返回 {ok, text, alerts, source} 已带消毒; 调用方不得绕过直接消费原始响应)。fetchImpl 注入可测。 */
export async function callExternalTool(server, tool, args = {}, { fetchImpl = fetch, timeoutMs = 15000, sanitizeImpl } = {}) {
  const { sanitizeIngestExternal } = await import('./sanitize-ingest.mjs')
  try {
    if (!server.tools.includes(String(tool))) return { ok: false, text: '', alerts: ['tool-not-whitelisted'], source: server.name }
    const res = await fetchImpl(server.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: args } }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const j = await res.json().catch(() => ({}))
    const raw = j?.result?.content?.map((c) => String(c?.text ?? '')).join('\n') ?? (j?.error ? `error: ${String(j.error.message ?? '').slice(0, 200)}` : '')
    // source 用 '.' 分隔('mcp.intel'): 归一白名单保留 '.' → 标记可读且不受剥除影响
    return { ...sanitizeIngestExternal(raw, { source: `mcp.${server.name}`, sanitizeImpl }), source: server.name }
  } catch (e) {
    return { ok: false, text: '', alerts: [`call-error:${String(e?.message ?? e).slice(0, 100)}`], source: server.name }
  }
}

/** 配置文件路径(调用方注入 DATA_DIR) */
export function mcpServersPath(dataDir) {
  return `${dataDir ?? process.env.D2D_DATA_DIR ?? `${(process.env.HOME ?? '')}`}/config/mcp-servers.json`
}
