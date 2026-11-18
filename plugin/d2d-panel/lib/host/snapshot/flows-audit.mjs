// snapshot/flows-audit.mjs — 桑基/审计/工具调用/链路/前沿池/配置总览(拆分自 snapshot.mjs: 784-1047, 逻辑零改动)
// 写入方实锚: graphd/gd/transition_log.py 恒 8 字段 append-only, 无轮转 — 尾读+时间窗,
// 严禁整文件进面板热路径(先例 10: 写新面先想「CI/他机没有这个文件会怎样」→ fail-soft)。
import fs from 'node:fs'
import os from 'node:os'
import { MAX, cap, num, fnum } from './const.mjs'
import { FLOWS, CHAIN, Q_CHAIN, Q_FRONTIER_POOL, Q } from './queries.mjs'
import { Q_VIZ, vizHostOf } from './viz-data.mjs'

/** 整数钳位(非数值回缺省 — clampLaneDays 泛化)。 */
function clampInt(v, min, max, dflt) {
  const n = parseInt(v, 10)
  if (!Number.isFinite(n)) return dflt
  return Math.min(max, Math.max(min, n))
}

/** 时间窗钳位(1..FLOWS.daysMax)。 */
export function clampFlowDays(v) {
  const n = parseInt(v, 10)
  if (!Number.isFinite(n) || n <= 0) return FLOWS.daysDefault
  return Math.min(n, FLOWS.daysMax)
}

/** 逐节点流量聚合(纯函数): from→to 对计数, 族按 node_id 前缀分(f-/exp-/fr-);
 *  from===to 防御性跳过(FSM 不产生, 手动通道 /write/transition-log 脏行不硬凑视觉)。 */
export function aggregateTransitions(rows, { family = 'all' } = {}) {
  const links = []
  const index = new Map()
  for (const r of rows ?? []) {
    const from = String(r?.from_status ?? '')
    const to = String(r?.to_status ?? '')
    if (!from || !to || from === to) continue
    const fam = FLOWS.familyOf(r?.node_id)
    if (family !== 'all' && fam !== family) continue
    const key = `${fam}|${from}|${to}`
    let l = index.get(key)
    if (!l) { l = { family: fam, from, to, count: 0 }; index.set(key, l); links.push(l) }
    l.count++
  }
  return links.sort((a, b) => b.count - a.count)
}

/** 桑基数据(尾读+窗口+族过滤+聚合): 文件缺失/不可读 → 200 空态+degraded 记因(fail-soft),
 *  坏行跳过(readRunEvents 同款纪律)。rows 均为合法迁移事件(非法迁移走 audit.log)。 */
export function readTransitionFlows({ days = FLOWS.daysDefault, family = 'all', nowMs = Date.now() } = {}, fsImpl = fs, env = process.env) {
  const windowDays = clampFlowDays(days)
  const fam = FLOWS.families.includes(family) || family === 'all' ? String(family) : 'all'
  const out = { links: [], linesRead: 0, matched: 0, windowDays, family: fam, degraded: [] }
  const dir = env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
  const file = env.P2P_TRANSITION_LOG ?? `${dir}/logs/transition-log.jsonl`
  const since = nowMs - windowDays * 86_400_000
  let lines
  try {
    lines = fsImpl.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-MAX.sankeyLines)
  } catch (e) {
    out.degraded.push(`transition-log 不可读: ${String(e?.code ?? e?.message ?? e).slice(0, 80)}`)
    return out
  }
  out.linesRead = lines.length
  const rows = []
  for (const ln of lines) {
    try {
      const r = JSON.parse(ln)
      const t = Date.parse(r?.timestamp ?? '')
      if (Number.isFinite(t) && t < since) continue
      rows.push(r)
    } catch { /* 坏行跳过 */ }
  }
  out.matched = rows.length
  out.links = aggregateTransitions(rows, { family: fam })
  return out
}

/** 审计时间线(双源合并尾读): audit.log({ts,kind,detail} — auth-fail/transition-illegal/
 *  denylist-hit/frontier-* 等)+ transition-log.jsonl(转态成功) — 非法迁移只进 audit.log,
 *  合流才是完整审计面。kind 过滤精确匹配; 降序取尾 limit。文件面 fail-soft。 */
export function readAuditTail({ limit = 200, kind = '' } = {}, fsImpl = fs, env = process.env) {
  const lim = clampInt(limit, 1, 500, 200)
  const dir = env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
  const events = []
  const degraded = []
  try {
    const file = env.P2P_AUDIT_LOG ?? `${dir}/logs/audit.log`
    const lines = fsImpl.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-MAX.auditLines)
    for (const ln of lines) {
      try {
        const r = JSON.parse(ln)
        if (!r?.ts || !r?.kind) continue
        events.push({ ts: String(r.ts), source: 'audit', kind: String(r.kind), detail: r?.detail ?? null })
      } catch { /* 坏行跳过 */ }
    }
  } catch (e) { degraded.push(`audit.log 不可读: ${String(e?.code ?? e?.message ?? e).slice(0, 80)}`) }
  try {
    const tfile = env.P2P_TRANSITION_LOG ?? `${dir}/logs/transition-log.jsonl`
    const lines = fsImpl.readFileSync(tfile, 'utf8').split('\n').filter(Boolean).slice(-MAX.auditTransLines)
    for (const ln of lines) {
      try {
        const r = JSON.parse(ln)
        if (!r?.timestamp) continue
        events.push({
          ts: String(r.timestamp), source: 'transition', kind: 'transition',
          detail: { node_id: String(r?.node_id ?? ''), from_status: String(r?.from_status ?? ''), to_status: String(r?.to_status ?? ''), actor: String(r?.actor ?? ''), reason: cap(r?.reason, 160) },
        })
      } catch { /* 坏行跳过 */ }
    }
  } catch (e) { degraded.push(`transition-log 不可读: ${String(e?.code ?? e?.message ?? e).slice(0, 80)}`) }
  const kinds = [...new Set(events.map((e) => e.kind))].sort()
  const filtered = kind ? events.filter((e) => e.kind === String(kind)) : events
  filtered.sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
  return { events: filtered.slice(0, lim), kinds, total: filtered.length, degraded }
}

/** run-log 其余键序列化截尾(事件词表非穷尽 — kind 白名单外的字段兜底渲染, 不丢关键线索)。 */
function extraOf(r) {
  const known = new Set(['ts', 'event', 'worker_id', 'ring', 'role', 'model', 'code', 'quota', 'reason', 'tool', 'command', 'cmd'])
  const rest = {}
  for (const k of Object.keys(r ?? {})) if (!known.has(k)) rest[k] = r[k]
  const s = JSON.stringify(rest)
  return s && s !== '{}' ? cap(s, 200) : ''
}

/** 工具调用明细(run-log 全事件投影 + per-worker 工具量): readRunEvents 同款尾读纪律 +
 *  H19 同款 engName 消毒; 明细投影放宽(kind 全集/tool/command/extra), 坏行跳过。fail-soft。 */
export function readToolCalls({ engName, limit = 200, kind = '' } = {}, fsImpl = fs, env = process.env) {
  const out = { eng: '', events: [], kinds: [], toolTotals: [], truncated: false, degraded: [] }
  const eng = String(engName ?? '').replace(/[^A-Za-z0-9._-]/g, '')
  out.eng = eng
  if (!eng) return out
  const lim = clampInt(limit, 1, MAX.toolLines, 200)
  const dir = env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
  const runs = env.D2D_RUNS_DIR ?? env.P2P_RUNS_DIR ?? `${dir}/runs`
  let lines
  try {
    lines = fsImpl.readFileSync(`${runs}/${eng}/run-log.jsonl`, 'utf8').split('\n').filter(Boolean).slice(-MAX.toolLines)
  } catch (e) {
    out.degraded.push(`run-log 不可读: ${String(e?.code ?? e?.message ?? e).slice(0, 80)}`)
    return out
  }
  const all = []
  for (const ln of lines) {
    try {
      const r = JSON.parse(ln)
      const evKind = String(r?.event ?? '')
      if (!evKind) continue
      all.push({
        ts: String(r?.ts ?? ''), kind: evKind,
        worker: String(r?.worker_id ?? ''), ring: String(r?.ring ?? ''), role: String(r?.role ?? ''), model: String(r?.model ?? ''),
        code: r?.code ?? null, quota: r?.quota ? String(r.quota) : '', reason: cap(r?.reason, 160),
        tool: String(r?.tool ?? ''), command: cap(r?.command ?? r?.cmd, 160), extra: extraOf(r),
      })
    } catch { /* 坏行跳过 */ }
  }
  out.kinds = [...new Set(all.map((e) => e.kind))].sort()
  const filtered = kind ? all.filter((e) => e.kind === String(kind)) : all
  out.truncated = filtered.length > lim
  out.events = filtered.slice(-lim)
  // per-worker 工具量(model-usage.jsonl terminal 行 tools 字段 — scheduler.js 终态行实锚)
  const totals = new Map()
  try {
    const ml = fsImpl.readFileSync(`${runs}/${eng}/model-usage.jsonl`, 'utf8').split('\n').filter(Boolean).slice(-MAX.usageLines)
    for (const ln of ml) {
      try {
        const r = JSON.parse(ln)
        if (r?.event !== 'terminal') continue
        const w = String(r?.worker ?? '')
        if (!w) continue
        const cur = totals.get(w) ?? { worker: w, tools: 0, terminals: 0 }
        cur.tools += Number(r?.tools) || 0
        cur.terminals += 1
        totals.set(w, cur)
      } catch { /* 坏行跳过 */ }
    }
  } catch { /* 账本缺失 → toolTotals 空(降级不记因: 明细主源不受影响) */ }
  out.toolTotals = [...totals.values()].sort((a, b) => b.tools - a.tools).slice(0, 20)
  return out
}

/** 探索链路(纯函数): Task 看板(/pentest-tasks 对等)+ worker/信号/端点/漏洞节点 + 四族边。
 *  查询抛错整体上抛(路由层 503 fail-closed) — buildStarmap 同款; 边两端不在取数集内则不画。 */
export async function buildChain(q, { eng } = {}) {
  const [taskRows, agentRows, sigRows, derivedRows, atRows, confirmsRows, suggestsRows, epRows, findingRows] = await Promise.all([
    q(Q_CHAIN.tasks, { eng }),
    q(Q.agents, { eng }),
    q(Q_VIZ.starmapSignals, { eng }),
    q(Q_VIZ.starmapDerived, { eng }),
    q(Q_CHAIN.at, { eng }),
    q(Q_CHAIN.confirms, { eng }),
    q(Q_CHAIN.suggests, { eng }),
    q(Q_CHAIN.endpoints, { eng }),
    q(Q_CHAIN.findings, { eng }),
  ])
  const pair = (rows) => {
    const seen = new Set()
    const out = []
    for (const r of rows ?? []) {
      const a = String(r?.a ?? ''), b = String(r?.b ?? '')
      if (!a || !b) continue
      const k = `${a}->${b}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ a, b })
    }
    return out
  }
  return {
    tasks: (taskRows ?? []).map((r) => ({
      id: String(r?.id ?? ''), kind: String(r?.kind ?? ''), status: String(r?.status ?? ''),
      link_id: String(r?.link_id ?? ''), claimed_by: String(r?.claimed_by ?? ''), created_at: String(r?.created_at ?? ''),
    })),
    workers: (agentRows ?? []).map((r) => ({ worker_id: String(r?.worker_id ?? ''), ring: String(r?.ring ?? ''), chain: String(r?.chain ?? ''), status: String(r?.status ?? '') })),
    signals: (sigRows ?? []).map((r) => ({ id: String(r?.id ?? ''), type: String(r?.type ?? ''), weight: num(r?.weight), ts: String(r?.ts ?? ''), host: vizHostOf(r?.evidence) })),
    endpoints: (epRows ?? []).map((r) => ({ id: String(r?.id ?? ''), url: cap(r?.url, 160), method: String(r?.method ?? '') })),
    findings: (findingRows ?? []).map((r) => ({ id: String(r?.id ?? ''), title: cap(r?.title, MAX.title), severity: String(r?.severity ?? 'info'), state: String(r?.state ?? 'candidate') })),
    edges: { derived: pair(derivedRows), at: pair(atRows), confirms: pair(confirmsRows), suggests: pair(suggestsRows) },
    caps: { tasks: CHAIN.tasks, findings: CHAIN.findings, endpoints: CHAIN.endpoints, edges: CHAIN.edges },
  }
}

/** 前沿提案池(纯函数): Frontier 按 eng_id 全态列表(评审态/提案人/价值分/闭环 ref)。
 *  评审操作走 frontierTransition 代理(graphd FSM 门在服务端, 面板只透传)。 */
export async function buildFrontierPool(q, { eng } = {}) {
  const rows = await q(Q_FRONTIER_POOL, { eng })
  const pool = (rows ?? []).map((r) => ({
    id: String(r?.id ?? ''),
    direction: cap(r?.direction, MAX.title),
    status: String(r?.status ?? 'proposed'),
    proposed_by: String(r?.proposed_by ?? ''),
    created_at: String(r?.created_at ?? ''),
    value_score: fnum(r?.value_score),
    review_note: cap(r?.review_note, 160),
    hypothesis_ref: String(r?.hypothesis_ref ?? ''),
  }))
  const byStatus = {}
  for (const p of pool) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1
  return { pool, total: pool.length, byStatus }
}

/** 面板侧前沿评审: 代理 graphd /write/frontier-transition(host token 通道, 迁移门+review_note
 *  审计在 graphd 校验)。transitionFinding 同款形态; reviewer 由 host 半钉死 'panel'。 */
export async function frontierTransition({ graphdUrl, token, frontierId, targetStatus, reviewNote }, fetchImpl = fetch, timeoutMs = 8000) {
  const res = await fetchImpl(`${graphdUrl}/write/frontier-transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Auth': token } : {}) },
    body: JSON.stringify({ frontier_id: String(frontierId ?? ''), target_status: String(targetStatus ?? ''), reviewer: 'panel', review_note: String(reviewNote ?? '') }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.ok) throw new Error(String(data?.error ?? `graphd http ${res.status}`))
  return data
}

/** 配置总览(只读本地文件面): 通知通道(configured/method — webhook_url 内嵌推送 token,
 *  wire 纪律绝不回显值)+ 暂停清单(paused-<eng>.json)。fail-soft: 缺失=未配置不记因。 */
export function readConfigOverview(fsImpl = fs, env = process.env) {
  const dir = env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
  const out = { notify: { configured: false, method: '', has_webhook: false }, paused: [], degraded: [] }
  try {
    const raw = JSON.parse(fsImpl.readFileSync(`${dir}/config/notify.json`, 'utf8'))
    out.notify = { configured: true, method: String(raw?.method ?? 'POST'), has_webhook: Boolean(raw?.webhook_url) }
  } catch (e) {
    if (e?.code !== 'ENOENT') out.degraded.push(`notify.json 不可读: ${String(e?.message ?? e).slice(0, 80)}`)
  }
  try {
    out.paused = fsImpl.readdirSync(`${dir}/config`)
      .filter((f) => f.startsWith('paused-') && f.endsWith('.json'))
      .map((f) => f.slice('paused-'.length, -'.json'.length))
  } catch { /* 目录缺失 = 无暂停项 */ }
  return out
}
