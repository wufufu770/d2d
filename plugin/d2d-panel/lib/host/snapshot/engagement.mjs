// snapshot/engagement.mjs — W5 选中/项目投影/快照聚合(拆分自 snapshot.mjs: 307-325 + 1049-1072 + 1226-1415, 逻辑零改动)
import fs from 'node:fs'
import os from 'node:os'
import { FINDING_STATES, MAX, cap, num, fnum, groupStates, markZombie } from './const.mjs'
import { Q, Q_FINDINGS_SEV } from './queries.mjs'
import { readDenylist, readApprovalSummary } from './graphd-client.mjs'
import { readCaps } from './caps.mjs'
import { loadStrategies } from './fleet.mjs'
import { readModelUsage, costEfficiency, computeConversion } from './runs-cost.mjs'
import { readXringRuns } from './xring.mjs'

// ── W5: 当前选中 engagement(面板/dsh 会话共享的"项目视图"开关) ──
// 纯视图概念: 切换只改本文件, 不启停任何 worker; 面板全部池子查询按它过滤, 切回旧项目记录全在。
export const selectedFile = (env = process.env) =>
  `${env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/config/selected-engagement.json`

export function readSelectedEngagement(env = process.env) {
  try { return String(JSON.parse(fs.readFileSync(selectedFile(env), 'utf8')).name ?? '').trim() } catch { return '' }
}

export function writeSelectedEngagement(name, env = process.env) {
  const n = String(name ?? '').trim()
  if (!n) throw new Error('engagement name required')
  fs.mkdirSync(`${env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/config`, { recursive: true })
  const tmp = `${selectedFile(env)}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, JSON.stringify({ name: n, updated_at: new Date().toISOString() }, null, 2) + '\n')
  fs.renameSync(tmp, selectedFile(env))
  return n
}

/** 总览补全(拍板 1): 每 engagement 性价比(活跃优先取 ≤8 — 逐 eng 文件尾读有成本, 不放大;
 *  其余行 cost=null 前端渲染 '—')。原地标注(列表既有顺序不动 — 排序仅用于挑选 ≤8 名单)。 */
export function attachEngCosts(engagements, readImpl = readModelUsage, max = 8) {
  const rows = engagements ?? []
  for (const e of rows) e.cost = null
  const order = [...rows].sort((a, b) => (b.status === 'active' ? 1 : 0) - (a.status === 'active' ? 1 : 0))
  for (const e of order.slice(0, max)) {
    const mu = readImpl({ engName: e.name })
    e.cost = { inputTokens: mu.inputTokens, outputTokens: mu.outputTokens, dispatches: mu.dispatches, source: mu.source }
  }
  return rows
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
 * buildSnapshot(query, { fleet, runEvents, modelUsage, eng }) → 聚合快照(一条响应, PANEL-UI-SPEC §5)。
 * query: async (cypher, params) => rows —— E44-F1 fail-honest: 单查询偶发失败(graphd 抖动/5s 超时)
 * 不再炸整页 503、也不再静默假零(workersByEng 旧态): 回落上拍成功值 + `_stale` 键列表明示;
 * 无上拍值(首拍即败)回落空集 + stale 标记。快照是读侧观测面, 秒级 stale 值 + 明示标记
 * 比整页不可用/假零都诚实(实证 2026-11-18: 卡体 workers=0 vs Workers 卡 3/5 同屏矛盾)。
 * runEvents: readRunEvents 产物(可选; 缺省时轨迹/用量区降级为空)。
 * modelUsage: readModelUsage 产物(可选; 缺省时性价比卡降级为空态)。
 * eng: 当前选中 engagement 名(W5 池子隔离过滤键; 空 = 无选中, 全部池子区为空)。
 */
const _snapCache = new Map() // key → 上拍成功 rows(host 进程长驻; key=查询名|eng)
export async function buildSnapshot(query, { fleet = null, runEvents = null, modelUsage = null, eng = '', approvalSummary } = {}) {
  const strategies = await loadStrategies(process.env, query).catch(() => [])
  const approvals = approvalSummary !== undefined ? approvalSummary : await readApprovalSummary()
  const staleKeys = new Set()
  const qs = (key, fn, params) => fn().then((rows) => { _snapCache.set(`${key}|${String(params?.eng ?? '')}`, rows); return rows })
    .catch(() => {
      const k = `${key}|${String(params?.eng ?? '')}`
      staleKeys.add(key)
      return _snapCache.get(k) ?? []
    })
  const [engListRows, byEngRows, workersByEngRows, agents, byStateRows, findings, signals, endpoints, signalsOpen, hypsOpen, experience, experienceTail, coverageRows, gapRows, handoffRows, frontierRows, sevRows, quarantineRows] = await Promise.all([
    qs('engList', () => query(Q.engList)),
    qs('findingsByEng', () => query(Q.findingsByEng)),
    qs('workersByEng', () => query(Q.workersByEng)),
    qs('agents', () => query(Q.agents, { eng }), { eng }),
    qs('findingsByState', () => query(Q.findingsByState, { eng }), { eng }),
    qs('findingsList', () => query(Q.findingsList, { eng }), { eng }),
    qs('signalsTail', () => query(Q.signalsTail, { eng }), { eng }),
    qs('cntEndpoints', () => query(Q.cntEndpoints, { eng }), { eng }),
    qs('cntSignalsOpen', () => query(Q.cntSignalsOpen, { eng }), { eng }),
    qs('cntHypsOpen', () => query(Q.cntHypsOpen, { eng }), { eng }),
    qs('cntExperience', () => query(Q.cntExperience)),
    qs('experienceTail', () => query(Q.experienceTail)),
    qs('coverage', () => query(Q.coverage, { eng }), { eng }),
    qs('gaps', () => query(Q.gaps, { eng }), { eng }),
    qs('handoffs', () => query(Q.handoffs, { eng }), { eng }),
    qs('frontierConversion', () => query(Q.frontierConversion, { eng }), { eng }), // T2-1-2: Frontier 两 ref 列按 selected eng(空选中 → 空池全零)
    qs('findingsSev', () => query(Q_FINDINGS_SEV)), // T3-3-2 总览补全: 每 engagement severity 计数(一条聚合喂全列表)
    qs('quarantine', () => query(Q.quarantine)), // WRAP-2 #18: 幻觉抽检浏览面(隔离池尾 12, 裁决回流经 adjudicate)
  ])

  // W5: 选中 = 显式 selected 文件 > 最新 active > 最新任意(历史回看)。每 engagement 进度聚合。
  const engRows = engListRows ?? []
  const selected = engRows.find((e) => String(e.name ?? '') === eng)
    ?? engRows.find((e) => String(e.status ?? '') === 'active')
    ?? engRows[0] ?? null
  const selName = String(selected?.name ?? '')
  const funnelOf = (name) => {
    const f = { active: 0, verified: 0, delivered: 0, 'needs-scope': 0, rejected: 0 }
    for (const r of byEngRows ?? []) {
      if (String(r.eng ?? '') !== String(name)) continue
      const s = String(r.state ?? '')
      if (s === 'candidate' || s === 'triaged') f.active += num(r.n)
      else if (s === 'verified' || s === 'isolated') f.verified += num(r.n)
      else if (s === 'reported' || s === 'accepted') f.delivered += num(r.n)
      else if (s in f) f[s] += num(r.n)
    }
    return f
  }
  const runningOf = (name) => {
    for (const r of workersByEngRows ?? []) if (String(r.eng ?? '') === String(name)) return num(r.n)
    return 0
  }
  // T3-3-2 总览补全: severity 按 eng 聚合(小写归一; 未知级别原样保留 — 渲染侧 sevColor 兜底)
  const sevOf = (name) => {
    const s = {}
    for (const r of sevRows ?? []) {
      if (String(r.eng ?? '') !== String(name)) continue
      const k = String(r.severity ?? 'info').toLowerCase()
      s[k] = (s[k] ?? 0) + num(r.n)
    }
    return s
  }
  const engagements = engRows.map((e) => ({
    name: cap(e.name, MAX.title),
    target: cap(e.target, MAX.target),
    scope: cap(e.scope, MAX.scope),
    status: String(e.status ?? ''),
    created_at: String(e.created_at ?? ''),
    objective: cap(e.objective, 300),
    instances: num(e.instances) || null,
    selected: String(e.name ?? '') === selName,
    progress: { ...funnelOf(String(e.name ?? '')), workers: runningOf(String(e.name ?? '')) },
    sev: sevOf(String(e.name ?? '')), // T3-3-2: {critical: n, high: n, ...}(总览卡 severity 列)
  }))

  const byState = {}
  for (const s of FINDING_STATES) byState[s] = 0
  for (const r of byStateRows ?? []) {
    const k = String(r?.state ?? '')
    if (k in byState) byState[k] = num(r?.n)
  }

  const now = new Date()
  const covTotal = num(coverageRows?.[0]?.total)
  const covCovered = num(coverageRows?.[0]?.covered)
  // R6.1: 黑名单可视 —— 全局 denylist.json + 当前 engagement scope 的 `!` 条目合并展示
  const scopeStr = String(selected?.scope ?? '')
  const denyFromScope = scopeStr.split(',').map((s) => s.trim()).filter((s) => s.startsWith('!')).map((s) => s.slice(1))
  const gd = readDenylist()
  const denylist = {
    domains: [...new Set([...gd.domains, ...denyFromScope])],
    cidr_prefix: [...gd.cidr_prefix],
  }
  // E44-F7: run 手动挑字段曾漏 resolved(Fleet 生效模型)与 cost(用量卡 24h 烧速条——
  // UsageCard 消费 runEvents.cost 的 dispatches24h/workerMin24h 形态, 非顶层 costEfficiency
  // 的性价比形态; 两者是不同产物, 修复时勿混用)
  return {
    ok: true,
    now: now.toISOString(),
    stale: [...staleKeys], // E44-F1: 本拍回落缓存的查询键(空=全部实时; 前端可标注)
    engagement: projectEngagement(selected),
    engagements, // W5: 全部 engagement + 进度(管理卡数据源)
    selected: selName,
    denylist,
    caps: readCaps(),
    counts: {
      endpoints: num(endpoints?.[0]?.n),
      signals_open: num(signalsOpen?.[0]?.n),
      hypotheses_open: num(hypsOpen?.[0]?.n),
      findings: FINDING_STATES.reduce((a, s) => a + byState[s], 0),
      experience: num(experience?.[0]?.n),
    },
    // 阶段2: 性价比卡 — 当前 engagement 产出 ÷ input tokens(产出=全部 findings 与 triaged 两个口径)
    cost: costEfficiency({
      findingsTotal: FINDING_STATES.reduce((a, s) => a + byState[s], 0),
      triagedTotal: byState.triaged ?? 0,
      inputTokens: modelUsage?.inputTokens ?? 0,
      outputTokens: modelUsage?.outputTokens ?? 0,
      dispatches: modelUsage?.dispatches ?? 0,
      source: modelUsage?.source ?? 'none',
    }),
    coverage: { total: covTotal, covered: covCovered },
    // T2-1-2 转化率卡(8.5-2): Frontier 闭环锚点非空比率 — {total, accepted_to_hypothesis,
    // hypothesis_to_confirmed}, 口径同 gates.py frontier_conversion_rate(total = 该 eng Frontier 行数)
    frontier: computeConversion(frontierRows),
    gaps: (gapRows ?? []).map((g) => String(g?.bc ?? '')).filter(Boolean),
    milestones: (handoffRows ?? []).map((h) => ({
      id: String(h?.id ?? ''),
      digest: cap(h?.digest, MAX.digest),
      model: String(h?.model ?? ''),
      created_at: String(h?.created_at ?? ''),
    })).reverse(), // 升序: 里程碑刻度按时间从左到右
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
        last_transition: cap(f?.last_transition, MAX.traj),
        // FIX-1 A1: 双签态透出 — disputed 行的仲裁入口显示条件(AdjudicateOps 分流; 其余行
        // 恒 ''/pending/signed 等, 零消费零影响)
        dual_sign: String(f?.dual_sign ?? ''),
        repairability: String(f?.repairability ?? ''), // E46-2: 可修复性三分类(审批卡片/报告端消费)
      })),
    },
    agents: markZombie((agents ?? []).map((a) => ({
      worker_id: String(a?.worker_id ?? ''),
      ring: String(a?.ring ?? ''),
      chain: String(a?.chain ?? ''),
      status: String(a?.status ?? ''),
      checkpoint: cap(a?.checkpoint, MAX.checkpoint),
      todo: cap(a?.todo, MAX.todo),
      updated_at: String(a?.updated_at ?? ''),
    })), now.getTime()),
    signals: (signals ?? []).map((s) => ({
      id: String(s?.id ?? ''),
      type: String(s?.type ?? ''),
      weight: fnum(s?.weight),
      ts: String(s?.ts ?? ''),
    })),
    experience: (experienceTail ?? []).map((x) => ({
      id: String(x?.id ?? ''),
      pattern: String(x?.pattern ?? ''),
      stack: String(x?.stack ?? ''),
      prior: fnum(x?.prior),
      hits: num(x?.hits),
      wins: num(x?.wins),
      target_type: String(x?.target_type ?? ''),
    })),
    fleet, // null = 未配置模型策略(fleet 卡降级为空态)
    strategies, // 策略库(#89 吸纳): 知识卡全量 + wins/hits 战果, 面板策略库浏览卡数据源
    run: {
      events: runEvents?.events ?? [],
      usage: runEvents?.usage ?? {},
      quotaHits: runEvents?.quotaHits ?? [],
      resolved: runEvents?.resolved ?? {}, // E44-F7: Fleet 生效模型面透传修复
      cost: runEvents?.cost ?? {}, // E44-F7: 用量卡 24h 烧速条(readRunEvents 形态)
    },
    // XR-P2: X-Ring 过程可见节(只读聚合, fail-soft 恒不抛 —— 记录面缺失=available:false 空形态)
    xring: (() => { try { return readXringRuns({}, fs, process.env) } catch (e) { return { available: false, base: '', activeCount: 0, runs: [], degraded: [String(e?.message ?? e).slice(0, 80)] } } })(),
    approvals, // 4-4 子批次 A: {mode, pending} | null(队列模块缺席降级) — 审批待办计数
    // WRAP-2 #18: 幻觉抽检浏览面(quarantined 池尾 12)——裁决入口同 tab 抽样浏览形态
    quarantine: (quarantineRows ?? []).map((x) => ({
      id: String(x?.id ?? ''),
      title: cap(x?.title, MAX.title),
      created_at: String(x?.created_at ?? ''),
    })),
  }
}
