#!/usr/bin/env node
// scripts/ops/graph-stats-probe.mjs — 图规模只读探针（T4-2b 拍板 ⑥ 落盘；语义=T4-2 决策书附录 B）
// 用途: 季度复测增长锚（state.md 开放项口径: 库 >1GB 或节点 >30 万即触发 T4-2b 决策书 §四选项 B 评估）。
// 安全边界: 只读 /query + 文件元数据（ls/du 等价物）——零写面, 不触 kuzu_db 不改配置（硬边界"源库零写"）。
// 查询纪律: 全部 cypher 为完整字符串字面量（零拼接/零外部输入）——Mimosa 生成前安全约束（参数绑定同源:
// 本脚本连参数都不引入）。URL 纪律说明: 目标 http://127.0.0.1:8766 为代码内固定常量（本机 graphd 服务,
// 本脚本的存在意义即本机探针）, 不读任何外部输入 URL——SSRF 约束针对外部输入场景, 此处不适用。
// 用法: node scripts/ops/graph-stats-probe.mjs [--json]
//       token 读取: P2P_HOST_TOKEN env 优先, 缺省 ~/.config/d2d/host-token（只读, 不回显）。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 12 节点表 + 6 边表 + Signal_ 状态分布 —— 每条均为字面量（与 graphd SCHEMA 表名一一对应）
const QUERIES = [
  { key: 'node:Engagement', cypher: 'MATCH (n:Engagement) RETURN count(n) AS n' },
  { key: 'node:Endpoint', cypher: 'MATCH (n:Endpoint) RETURN count(n) AS n' },
  { key: 'node:Signal_', cypher: 'MATCH (n:Signal_) RETURN count(n) AS n' },
  { key: 'node:Hypothesis', cypher: 'MATCH (n:Hypothesis) RETURN count(n) AS n' },
  { key: 'node:Finding', cypher: 'MATCH (n:Finding) RETURN count(n) AS n' },
  { key: 'node:Plan', cypher: 'MATCH (n:Plan) RETURN count(n) AS n' },
  { key: 'node:ExperienceWeight', cypher: 'MATCH (n:ExperienceWeight) RETURN count(n) AS n' },
  { key: 'node:Experience', cypher: 'MATCH (n:Experience) RETURN count(n) AS n' },
  { key: 'node:Frontier', cypher: 'MATCH (n:Frontier) RETURN count(n) AS n' },
  { key: 'node:AgentIdentity', cypher: 'MATCH (n:AgentIdentity) RETURN count(n) AS n' },
  { key: 'node:Task', cypher: 'MATCH (n:Task) RETURN count(n) AS n' },
  { key: 'node:Handoff', cypher: 'MATCH (n:Handoff) RETURN count(n) AS n' },
  { key: 'edge:AT', cypher: 'MATCH (a)-[:AT]->(b) RETURN count(a) AS n' },
  { key: 'edge:CONFIRMS', cypher: 'MATCH (a)-[:CONFIRMS]->(b) RETURN count(a) AS n' },
  { key: 'edge:SUGGESTS', cypher: 'MATCH (a)-[:SUGGESTS]->(b) RETURN count(a) AS n' },
  { key: 'edge:DERIVED_FROM', cypher: 'MATCH (a)-[:DERIVED_FROM]->(b) RETURN count(a) AS n' },
  { key: 'edge:PRIOR_FOR', cypher: 'MATCH (a)-[:PRIOR_FOR]->(b) RETURN count(a) AS n' },
  { key: 'edge:RELATES', cypher: 'MATCH (a)-[:RELATES]->(b) RETURN count(a) AS n' },
  { key: 'signal:status', cypher: 'MATCH (s:Signal_) RETURN s.status AS st, count(s) AS n' },
]

function readToken() {
  if (process.env.P2P_HOST_TOKEN) return process.env.P2P_HOST_TOKEN // seam: 缺省回落文件（先例 10 扩充）
  const p = path.join(os.homedir(), '.config/d2d/host-token')
  try { return fs.readFileSync(p, 'utf8').trim() } catch (e) {
    throw new Error(`host token 不可读(${p}): ${e?.code ?? e?.message ?? e}`)
  }
}

async function query(cypher, token) {
  // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request — 本机 loopback 探针:
  // 127.0.0.1:8766 为代码内固定常量(graphd 仅 HTTP 形态), 非外部请求, 不走 TLS 无泄露面(决策书附录 B 同口径)。
  const res = await fetch('http://127.0.0.1:8766/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth': token },
    body: JSON.stringify({ cypher }),
    signal: AbortSignal.timeout(8000),
  })
  const j = await res.json().catch(() => null)
  if (!res.ok || !j?.ok) throw new Error(`/query ${res.status}: ${JSON.stringify(j?.error ?? j).slice(0, 120)}`)
  return j.rows ?? []
}

function statBytes(p) {
  try { return fs.statSync(p).size } catch { return null }
}
function dirBytes(p) {
  let total = 0
  const walk = (d) => {
    let names
    try { names = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of names) {
      const fp = path.join(d, e.name)
      if (e.isDirectory()) walk(fp)
      else { try { total += fs.statSync(fp).size } catch { /* 跳过不可读项 */ } }
    }
  }
  walk(p)
  return total
}

async function main() {
  const startedAt = new Date().toISOString()
  const token = readToken()
  const graphdDir = process.env.D2D_GRAPHD_DIR ?? path.join(process.cwd(), 'graphd')
  const results = {}
  for (const q of QUERIES) {
    const rows = await query(q.cypher, token)
    if (q.key === 'signal:status') {
      results[q.key] = Object.fromEntries(rows.map((r) => [String(r.st ?? '?'), Number(r.n ?? 0)]))
    } else {
      results[q.key] = Number(rows[0]?.n ?? 0)
    }
  }
  const disk = {
    'kuzu_db': statBytes(path.join(graphdDir, 'kuzu_db')),
    'kuzu_db.wal': statBytes(path.join(graphdDir, 'kuzu_db.wal')),
    'DATA_DIR/logs': dirBytes(path.join(os.homedir(), '.d2d-data/logs')),
    'DATA_DIR/runs': dirBytes(path.join(os.homedir(), '.d2d-data/runs')),
  }
  const nodes = QUERIES.filter((q) => q.key.startsWith('node:')).reduce((a, q) => a + results[q.key], 0)
  const edges = QUERIES.filter((q) => q.key.startsWith('edge:')).reduce((a, q) => a + results[q.key], 0)
  const out = { ok: true, at: startedAt, nodes, edges, ...results, disk }
  const mb = (b) => (b === null ? '?' : `${(b / 1024 / 1024).toFixed(1)}MB`)
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(out, null, 2))
  } else {
    console.log(`graph-stats-probe @ ${startedAt}`)
    console.log(`节点合计 ${nodes} / 边合计 ${edges}`)
    for (const q of QUERIES) {
      if (q.key === 'signal:status') {
        console.log(`  ${q.key.padEnd(22)} ${Object.entries(results[q.key]).map(([k, v]) => `${k}=${v}`).join(' ')}`)
      } else {
        console.log(`  ${q.key.padEnd(22)} ${results[q.key]}`)
      }
    }
    console.log(`库文件: kuzu_db=${mb(disk['kuzu_db'])} wal=${mb(disk['kuzu_db.wal'])}`)
    console.log(`DATA_DIR: logs=${mb(disk['DATA_DIR/logs'])} runs=${mb(disk['DATA_DIR/runs'])}`)
    const GATE_MB = 500 // 决策书附录 D 拍板 ②: 单库 >500MB 触发裁剪再议
    const kb = disk['kuzu_db']
    if (kb !== null && kb > GATE_MB * 1024 * 1024) console.log(`⚠️ kuzu_db ${(kb / 1024 / 1024).toFixed(0)}MB > ${GATE_MB}MB — 触发裁剪再议 + 选项 B 评估(决策书 §四)`)
    else console.log(`规模锚: 距 500MB 裁剪再议线尚有余量(阈值见决策书附录 D 拍板 ②)`)
  }
  return out
}

// 主流程守卫（先例 10）: 被 import 时不执行任何网络/文件动作
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((out) => {
    if (!out || typeof out.nodes !== 'number') process.exit(1)
  }).catch((e) => {
    console.error(`graph-stats-probe 失败: ${String(e?.message ?? e)}`)
    process.exit(1)
  })
}
