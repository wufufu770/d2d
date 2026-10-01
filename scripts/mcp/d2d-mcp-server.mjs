// d2d-mcp-server.mjs — T3-2-4 对外只读 MCP server(原生 stdio JSON-RPC 零依赖; MCP 骨架转实质)
// 选型(审计项 1): 零成本约束下不引入 @modelcontextprotocol/sdk(重依赖) — MCP stdio 传输本质是
//   换行分隔 JSON-RPC 2.0, 最小面(initialize/tools/list/tools/call)原生实现。
// 安全底线 1: **写通道不外放** — 工具面仅两个只读查询; isReadOnlyCypher 镜像预检(与 index.js V-07
//   同口径: 首词白名单+变更关键字全文扫) + graphd host_query_gate 权威兜底(双保险); 越界请求
//   拒绝并留痕(stderr + 审计 JSONL)。
// 回退开关: P2P_MCP_SERVER === '0' → 启动即退出(缺省启用)。主流程守卫(import 双形态纪律 T3-2-3)。
// CLI 用法: node scripts/mcp/d2d-mcp-server.mjs [--graph 8766]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const VERSION = '1.0.0'
const SERVER_INFO = { name: 'd2d', version: VERSION }
// V-07 同口径镜像(index.js isReadOnlyCypher): 首词白名单 + 变更关键字全文扫(大小写不敏感)。
// 镜像理由: index.js import 有插件注册副作用, server 需零副作用独立进程; graphd 为最终权威。
const MUTATION_RE = /\b(CREATE|MERGE|SET|DELETE|DETACH|DROP|REMOVE|COPY|EXPORT|IMPORT|ATTACH)\b/i
export function isReadOnlyCypher(cy) {
  return /^(MATCH|RETURN|WITH|CALL)\b/i.test(String(cy ?? '').trim()) && !MUTATION_RE.test(String(cy ?? ''))
}

const AUDIT_LOG = `${process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/logs/mcp-server-audit.jsonl`
/** 审计留痕(越界拒绝/调用记录; 失败静默 — 审计不影响响应) */
export function auditEvent(kind, detail) {
  try {
    fs.mkdirSync(path.dirname(AUDIT_LOG), { recursive: true })
    fs.appendFileSync(AUDIT_LOG, JSON.stringify({ ts: new Date().toISOString(), kind, ...detail }) + '\n')
  } catch { /* 审计失败不影响协议响应 */ }
}

/** 工具面白名单(只读性证明): 全部经 isReadOnlyCypher 预检 + graphd 权威; 零写操作暴露 */
export const TOOL_DEFS = [
  {
    name: 'd2d_graph_read',
    description: '向 d2d 共享状态层(Kuzu 图)执行只读 Cypher 查询(MATCH/RETURN/WITH; 变更语句拒绝)。写通道不外放。',
    inputSchema: { type: 'object', properties: { cypher: { type: 'string', description: '只读 Cypher(首词 MATCH/RETURN/WITH)' } }, required: ['cypher'] },
    readonly: true,
  },
  {
    name: 'd2d_findings_summary',
    description: 'd2d findings 摘要读取(id/title/severity/gate_status, 上限 50 条; 纯只读聚合)。',
    inputSchema: { type: 'object', properties: { eng: { type: 'string', description: 'engagement 名过滤(可空=全部)' } }, required: [] },
    readonly: true,
  },
]

/** graphd 只读查询(fetch 注入可测; server 持 host token — graphd host_query_gate CALL 禁兜底) */
export async function graphQuery(graphdUrl, cypher, { fetchImpl = fetch } = {}) {
  const token = fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim()
  const res = await fetchImpl(`${graphdUrl}/query`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth': token },
    body: JSON.stringify({ cypher }), signal: AbortSignal.timeout(10000),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.ok) throw new Error(`graphd query ${res.status}: ${String(j.error ?? '').slice(0, 160)}`)
  return j.rows ?? []
}

/** 工具执行(越界拒绝留痕; 写请求在预检即拒, 零图 IO) */
export async function executeTool(name, args, { graphdUrl, fetchImpl, audit = auditEvent } = {}) {
  if (!TOOL_DEFS.some((t) => t.name === name)) {
    audit('tool-unknown', { tool: name })
    return { isError: true, content: [{ type: 'text', text: `未知工具: ${name}(白名单外拒绝)` }] }
  }
  if (name === 'd2d_graph_read') {
    const cy = String(args?.cypher ?? '')
    if (!isReadOnlyCypher(cy)) {
      audit('write-rejected', { tool: name, cypher_head: cy.slice(0, 120), sha: createHash('sha256').update(cy).digest('hex').slice(0, 12) })
      return { isError: true, content: [{ type: 'text', text: '拒绝: 仅允许只读查询(MATCH/RETURN/WITH 首词且全文不含变更关键字) — 写通道不外放' }] }
    }
    try {
      const rows = await graphQuery(graphdUrl, cy, { fetchImpl })
      return { content: [{ type: 'text', text: JSON.stringify(rows).slice(0, 20000) }] }
    } catch (e) {
      return { isError: true, content: [{ type: 'text', text: `查询失败: ${String(e?.message ?? e).slice(0, 160)}` }] }
    }
  }
  if (name === 'd2d_findings_summary') {
    const eng = String(args?.eng ?? '').trim()
    const cy = eng
      ? `MATCH (f:Finding) WHERE f.eng = '${eng.replaceAll("'", '')}' RETURN f.id AS id, f.title AS title, f.severity AS severity, f.gate_status AS gate ORDER BY f.id LIMIT 50`
      : 'MATCH (f:Finding) RETURN f.id AS id, f.title AS title, f.severity AS severity, f.gate_status AS gate ORDER BY f.id LIMIT 50'
    try {
      const rows = await graphQuery(graphdUrl, cy, { fetchImpl })
      return { content: [{ type: 'text', text: JSON.stringify(rows).slice(0, 20000) }] }
    } catch (e) {
      return { isError: true, content: [{ type: 'text', text: `查询失败: ${String(e?.message ?? e).slice(0, 160)}` }] }
    }
  }
  return { isError: true, content: [{ type: 'text', text: `未知工具: ${name}` }] }
}

/** JSON-RPC 消息处理(纯函数导出供测试; send 注入输出通道) */
export async function handleMessage(msg, { graphdUrl, send, audit = auditEvent, fetchImpl } = {}) {
  const reply = (id, result) => send({ jsonrpc: '2.0', id, result })
  const err = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } })
  try {
    if (!msg || msg.jsonrpc !== '2.0') return err(msg?.id ?? null, -32600, 'Invalid Request')
    if (msg.method === 'initialize') {
      return reply(msg.id, { protocolVersion: msg.params?.protocolVersion ?? '2024-11-05', capabilities: { tools: {} }, serverInfo: SERVER_INFO })
    }
    if (msg.method === 'notifications/initialized' || String(msg.method ?? '').startsWith('notifications/')) return undefined // 通知无响应
    if (msg.method === 'tools/list') {
      return reply(msg.id, { tools: TOOL_DEFS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) })
    }
    if (msg.method === 'tools/call') {
      const name = String(msg.params?.name ?? '')
      audit('tool-call', { tool: name, args_head: JSON.stringify(msg.params?.arguments ?? {}).slice(0, 200) })
      const result = await executeTool(name, msg.params?.arguments ?? {}, { graphdUrl, fetchImpl, audit })
      return reply(msg.id, result)
    }
    if (msg.method === 'ping') return reply(msg.id, {})
    return err(msg.id, -32601, `Method not found: ${String(msg.method ?? '')}`)
  } catch (e) {
    return err(msg?.id ?? null, -32603, `Internal error: ${String(e?.message ?? e).slice(0, 160)}`)
  }
}

/** 主流程守卫(T3-2-3 教训: 被 import 零副作用) */
const __isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (__isMain) {
  if (String(process.env.P2P_MCP_SERVER ?? '') === '0') {
    console.error('[d2d-mcp-server] P2P_MCP_SERVER=0 — server 关闭, 退出')
    process.exit(0)
  }
  const _gi = process.argv.indexOf('--graph')
  const graphdUrl = `http://127.0.0.1:${_gi > -1 ? (process.argv[_gi + 1] || '8766') : (process.env.P2P_GRAPHD_PORT ?? '8766')}`
  const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n')
  auditEvent('server-start', { pid: process.pid, graphdUrl })
  let buf = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    buf += chunk
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line) continue
      let msg
      try { msg = JSON.parse(line) } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); continue }
      handleMessage(msg, { graphdUrl, send }).catch((e) => send({ jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32603, message: String(e?.message ?? e).slice(0, 160) } }))
    }
  })
  process.stdin.on('end', () => { auditEvent('server-stop', { pid: process.pid }); process.exit(0) })
  console.error(`[d2d-mcp-server] stdio 已就绪(graphd=${graphdUrl}; 工具面 ${TOOL_DEFS.length} 个只读; 写通道不外放)`)
}
