// snapshot.mjs — 快照聚合(host 半核心, 纯逻辑可单测)
// 数据流: graphd /query(host token 合法读通道, app.py:436-445) → 一条聚合 JSON → 浏览器
// 字段名与 graphd/app.py:51-65 schema 逐字对齐; 七态与 app.py:110 FINDING_STATES 一致。
// 契约见 docs/PANEL-UI-SPEC.md §5: 浏览器永不碰凭证; wire 不带 evidence 全文与 repro。

import fs from 'node:fs'
import os from 'node:os'

export const FINDING_STATES = ['candidate', 'triaged', 'verified', 'isolated', 'reported', 'accepted', 'rejected']
export const MACRO_GROUPS = [
  { key: 'active', label: '活跃', states: ['candidate', 'triaged'] },
  { key: 'verified', label: '已验证', states: ['verified', 'isolated'] },
  { key: 'delivered', label: '已交付', states: ['reported', 'accepted'] },
  { key: 'rejected', label: '已驳回', states: ['rejected'] },
]
export const ZOMBIE_MS = 30_000
const MAX = { title: 200, scope: 200, target: 200, workers: 50, findings: 200, signals: 20, exp: 12, checkpoint: 400, todo: 400, traj: 400, sigEvidence: 0 }

// 全部只读 MATCH; host token 通道下不触发 worker 只读白名单(本就放行)
const Q = {
  engActive: `MATCH (e:Engagement) WHERE e.status = 'active' RETURN e.name AS name, e.target AS target, e.scope AS scope, e.status AS status, e.created_at AS created_at ORDER BY coalesce(e.created_at, '') DESC LIMIT 1`,
  engLast: `MATCH (e:Engagement) RETURN e.name AS name, e.target AS target, e.scope AS scope, e.status AS status, e.created_at AS created_at ORDER BY coalesce(e.created_at, '') DESC LIMIT 1`,
  agents: `MATCH (a:AgentIdentity) RETURN a.worker_id AS worker_id, a.ring AS ring, a.chain AS chain, a.status AS status, a.checkpoint AS checkpoint, a.todo AS todo, a.updated_at AS updated_at ORDER BY coalesce(a.updated_at, '') DESC LIMIT ${MAX.workers}`,
  findingsByState: `MATCH (f:Finding) RETURN f.gate_status AS state, count(f) AS n`,
  findingsList: `MATCH (f:Finding) RETURN f.id AS id, f.title AS title, f.severity AS severity, f.cvss AS cvss, f.gate_status AS state, f.category AS category, f.ts AS ts, f.verified_at AS verified_at, f.last_transition AS last_transition ORDER BY coalesce(f.ts, '') DESC LIMIT ${MAX.findings}`,
  experienceTail: `MATCH (x:ExperienceWeight) RETURN x.id AS id, x.pattern AS pattern, x.stack AS stack, x.prior AS prior, x.hits AS hits, x.wins AS wins, x.target_type AS target_type ORDER BY coalesce(x.prior, 1.0) DESC, coalesce(x.hits, 0) DESC LIMIT ${MAX.exp}`,
  signalsTail: `MATCH (s:Signal_) WHERE s.status = 'open' RETURN s.id AS id, s.type AS type, s.weight AS weight, s.ts AS ts ORDER BY coalesce(s.ts, '') DESC LIMIT ${MAX.signals}`,
  cntEndpoints: `MATCH (e:Endpoint) RETURN count(e) AS n`,
  cntSignalsOpen: `MATCH (s:Signal_) WHERE s.status = 'open' RETURN count(s) AS n`,
  cntHypsOpen: `MATCH (h:Hypothesis) WHERE h.status = 'open' RETURN count(h) AS n`,
  cntExperience: `MATCH (x:ExperienceWeight) RETURN count(x) AS n`,
}

// ---------- 纯工具 ----------
function cap(v, n) {
  const t = String(v ?? '')
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}
function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
function fnum(v, digits = 1) {
  const n = num(v)
  return Math.round(n * 10 ** digits) / 10 ** digits
}

/** 七态计数 → 4 宏观列(PANEL-UI-SPEC §4.4)。未知态忽略。 */
export function groupStates(byState) {
  const out = {}
  for (const g of MACRO_GROUPS) out[g.key] = g.states.reduce((a, s) => a + num(byState?.[s]), 0)
  return out
}

/** worker 心跳 → 前端可复用的 zombie 判定(PANEL-UI-SPEC §4.6: 纯时钟, >30s)。
 *  ageMs = -1 表示无心跳时间戳(不判 zombie, 视图按未知渲染)。 */
export function markZombie(agents, nowMs) {
  return (agents ?? []).map((a) => {
    const ts = Date.parse(String(a.updated_at ?? '')) || 0
    const ageMs = ts ? Math.max(0, nowMs - ts) : -1
    const running = String(a.status ?? '') === 'running'
    return { ...a, ageMs, zombie: running && ageMs > ZOMBIE_MS }
  })
}

// ---------- graphd 客户端 ----------
/** host token: 环境变量优先, 其次 scheduler 同款 token 文件(I-017 路径)。 */
export function readHostToken(env = process.env) {
  if (env.P2P_HOST_TOKEN) return String(env.P2P_HOST_TOKEN).trim()
  const f = env.P2P_HOST_TOKEN_FILE ?? `${os.homedir()}/.config/d2d/host-token`
  try { return fs.readFileSync(f, 'utf8').trim() } catch { return '' }
}

/** 模型策略(A-2 外置): DATA_DIR/config/model-policies.json, 缺失返回 null(fleet 卡降级)。 */
export function readFleet(env = process.env) {
  const dir = env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
  try {
    const p = JSON.parse(fs.readFileSync(`${dir}/config/model-policies.json`, 'utf8'))
    const roles = {}
    for (const [k, v] of Object.entries(p?.roles ?? {})) {
      roles[k] = { primary: String(v?.primary ?? ''), backup: String(v?.backup ?? '') }
    }
    return { default: { primary: String(p?.default?.primary ?? ''), backup: String(p?.default?.backup ?? '') }, roles }
  } catch { return null }
}

export function createGraphdQuery({ graphdUrl, token, fetchImpl = fetch, timeoutMs = 5000 }) {
  return async function query(cypher, params = {}) {
    const res = await fetchImpl(`${graphdUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Auth': token } : {}) },
      body: JSON.stringify({ cypher, params }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.ok) throw new Error(`graphd: ${data?.error ?? `http ${res.status}`}`)
    return data.rows ?? []
  }
}

// ---------- 聚合 ----------
function projectEngagement(row) {
  if (!row) return null
  return {
    name: cap(row.name, MAX.title),
    target: cap(row.target, MAX.target),
    scope: cap(row.scope, MAX.scope),
    status: String(row.status ?? ''),
    created_at: String(row.created_at ?? ''),
  }
}

/**
 * buildSnapshot(query, { fleet }) → 聚合快照(一条响应, PANEL-UI-SPEC §5)。
 * query: async (cypher, params) => rows —— 任何一次图读取失败整体抛错(fail-closed,
 * 不下发过期/半截快照); 由 HTTP 层转 503。
 */
export async function buildSnapshot(query, { fleet = null } = {}) {
  const [engActiveRows, agents, byStateRows, findings, signals, endpoints, signalsOpen, hypsOpen, experience] = await Promise.all([
    query(Q.engActive),
    query(Q.agents),
    query(Q.findingsByState),
    query(Q.findingsList),
    query(Q.signalsTail),
    query(Q.cntEndpoints),
    query(Q.cntSignalsOpen),
    query(Q.cntHypsOpen),
    query(Q.cntExperience),
  ])
  // 无 active 时带出最近终态供上下文(PANEL-UI-SPEC §7: 不做历史切换)
  const engRows = engActiveRows?.length ? engActiveRows : await query(Q.engLast)

  const byState = {}
  for (const s of FINDING_STATES) byState[s] = 0
  for (const r of byStateRows ?? []) {
    const k = String(r?.state ?? '')
    if (k in byState) byState[k] = num(r?.n)
  }

  const now = new Date()
  return {
    ok: true,
    now: now.toISOString(),
    engagement: projectEngagement(engRows?.[0] ?? null),
    counts: {
      endpoints: num(endpoints?.[0]?.n),
      signals_open: num(signalsOpen?.[0]?.n),
      hypotheses_open: num(hypsOpen?.[0]?.n),
      findings: FINDING_STATES.reduce((a, s) => a + byState[s], 0),
      experience: num(experience?.[0]?.n),
    },
    findings: {
      byState,
      macro: groupStates(byState),
      list: (findings ?? []).map((f) => ({
        id: String(f?.id ?? ''),
        title: cap(f?.title, MAX.title),
        severity: String(f?.severity ?? 'info'),
        cvss: fnum(f?.cvss),
        state: String(f?.state ?? 'candidate'),
        category: String(f?.category ?? ''),
        ts: String(f?.ts ?? ''),
        verified_at: String(f?.verified_at ?? ''),
      })),
    },
    agents: markZombie((agents ?? []).map((a) => ({
      worker_id: String(a?.worker_id ?? ''),
      ring: String(a?.ring ?? ''),
      chain: String(a?.chain ?? ''),
      status: String(a?.status ?? ''),
      updated_at: String(a?.updated_at ?? ''),
    })), now.getTime()),
    signals: (signals ?? []).map((s) => ({
      id: String(s?.id ?? ''),
      type: String(s?.type ?? ''),
      weight: fnum(s?.weight),
      ts: String(s?.ts ?? ''),
    })),
    fleet, // null = 未配置模型策略(fleet 卡降级为空态)
  }
}
