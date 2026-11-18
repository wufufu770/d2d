// snapshot/viz-data.mjs — T3-3-1 viz 数据面(拆分自 snapshot.mjs: 91-210, 逻辑零改动)
// 护栏参数(t3-3-plan §1 定稿): 星图服务端取数 LIMIT 500 / 泳道明细 LIMIT 200 / 文本截断。
// 渲染上限(节点 200/边 300)是 client 侧职责, 服务端只给 total 供截断提示。
import { cap, num } from './const.mjs'

export const VIZ = {
  starmapNodes: 500,
  hypItems: 200,
  hypLaneDaysDefault: 14,
  hypLaneDaysMax: 90,
  textCap: 160,
}
// 覆盖象限 21 格枚举(与 plugin/pentest-dsh/domain/allocator.mjs:363-364 同源 — 面板侧
// 静态副本, 避免跨包 import 连坐; 枚举由 graphd 写入侧软校验钉死, 漂移即失真)。
export const COVERAGE_SURFACES = ['request', 'response', 'js', 'business', 'flow', 'apk', 'mini']
export const COVERAGE_BOUNDARIES = ['outer', 'inner', 'cross']

// E40-D1: 拆分后 flows-audit(buildChain 复用星图取数查询)同需 — 导出面唯一新增
export const Q_VIZ = {
  starmapSignals: `MATCH (s:Signal_) WHERE s.eng = $eng AND s.status = 'open' RETURN s.id AS id, s.type AS type, s.weight AS weight, s.verify_tries AS tries, s.ts AS ts, s.evidence AS evidence ORDER BY coalesce(s.ts, '') DESC LIMIT ${VIZ.starmapNodes}`,
  starmapEndpoints: `MATCH (e:Endpoint) WHERE e.eng = $eng RETURN e.id AS id, e.url AS url, e.tech AS tech, e.business_chain AS chain, e.coverage_votes AS votes, e.exhausted AS exhausted ORDER BY e.coverage_votes DESC, coalesce(e.url, '') LIMIT 200`,
  starmapAt: `MATCH (s:Signal_)-[:AT]->(e:Endpoint) WHERE s.eng = $eng RETURN s.id AS sid, e.id AS eid, e.url AS eurl, e.tech AS etech, e.business_chain AS echain, e.coverage_votes AS evotes, e.exhausted AS eexhausted LIMIT 1000`,
  starmapDerived: `MATCH (a:Signal_)-[:DERIVED_FROM]->(b:Signal_) WHERE a.eng = $eng RETURN a.id AS a, b.id AS b LIMIT 1000`,
  covHeat: `MATCH (s:Signal_) WHERE s.eng = $eng AND s.surface <> '' AND s.boundary <> '' RETURN s.surface AS su, s.boundary AS bo, count(s) AS n`,
  hypByStatus: `MATCH (h:Hypothesis) WHERE h.eng = $eng RETURN h.status AS status, count(h) AS n`,
  hypItems: `MATCH (h:Hypothesis) WHERE h.eng = $eng AND coalesce(h.ts, '') > $since RETURN h.id AS id, h.text AS text, h.strategy AS strategy, h.status AS status, h.ts AS ts ORDER BY coalesce(h.ts, '') DESC LIMIT ${VIZ.hypItems}`,
}

/** evidence 文本提 hostname(starmap-tick.mjs:25 同款; wire 不带 evidence 全文, 只外传 host)。 */
export function vizHostOf(ev) {
  try { return new URL((String(ev ?? '').match(/https?:\/\/[^\s"']+/) ?? [''])[0]).hostname.toLowerCase() } catch { return '' }
}

/** runLog candidate-links 事件 pairs 解析('aId(aType)~bId(bType)@host' 字符串数组 → 结构化;
 *  解析失败整条丢弃不中断 — starmap-tick.mjs:58 产出, 候选连线唯一持久源[内存态重启即丢])。 */
export function parseCandidatePairs(pairs) {
  const out = []
  for (const p of Array.isArray(pairs) ? pairs : []) {
    const m = /^(.+)\(([^)]*)\)~(.+)\(([^)]*)\)@(.+)$/.exec(String(p ?? ''))
    if (m) out.push({ a: m[1], aType: m[2], b: m[3], bType: m[4], host: m[5] })
  }
  return out
}

/** 泳道时间窗钳位(1..VIZ.hypLaneDaysMax; 非法回缺省 — writeCaps 钳位先例)。 */
export function clampLaneDays(v) {
  const n = parseInt(v, 10)
  if (!Number.isFinite(n) || n <= 0) return VIZ.hypLaneDaysDefault
  return Math.min(n, VIZ.hypLaneDaysMax)
}

/** URL 提短标签(host + 末段路径 ≤14 字符; 端点节点 label 用)。 */
export function vizEpLabel(url) {
  const host = vizHostOf(url)
  let path = ''
  try { path = new URL(String(url ?? '')).pathname } catch { path = '' }
  const tail = path.length > 14 ? path.slice(-13) : path
  return `${host}${tail && tail !== '/' ? tail : ''}`
}

/** E44-V2 星图折叠(纯函数, reArtex digest 折叠同构): 低权重(weight<2)open 信号按 type
 *  收进聚合节点(大图降噪——66+ 信号全平铺=匿名彩点海); 高权重保持独立。AT 边折叠:
 *  成员→endpoint 去重为 组→endpoint; DERIVED 边只保留两端独立节点(组节点不参与)。
 *  返回 { nodes, edges, folded }: nodes=[endpoint..., 独立 signal..., 聚合 group...]。 */
export function assembleStarmap(epNodes, sigNodes, atPairs, derivedPairs, { foldBelow = 2 } = {}) {
  const eps = (epNodes ?? []).map((n) => ({ ...n, kind: 'endpoint' }))
  const sigs = (sigNodes ?? []).map((n) => ({ ...n, kind: 'signal' }))
  const sigById = new Map(sigs.map((s) => [s.id, s]))
  const lowIds = new Set(sigs.filter((s) => (num(s.weight) || 1) < foldBelow).map((s) => s.id))
  const groups = new Map() // type → {kind:'group', id, type, count, hosts:Set}
  for (const s of sigs) {
    if (!lowIds.has(s.id)) continue
    const g = groups.get(s.type) ?? { kind: 'group', id: `grp-${String(s.type).slice(0, 24)}`, type: String(s.type ?? ''), count: 0, sample: s }
    g.count += 1
    groups.set(s.type, g)
  }
  const grpByType = (t) => groups.get(t)
  const nodes = [...eps, ...sigs.filter((s) => !lowIds.has(s.id)), ...groups.values()]
  const nodeIds = new Set(nodes.map((n) => n.id))
  const edges = []
  const seenEdge = new Set()
  const pushEdge = (a, b, kind) => {
    if (!nodeIds.has(a) || !nodeIds.has(b) || a === b) return
    const k = `${a}|${b}|${kind}`
    if (seenEdge.has(k)) return
    seenEdge.add(k)
    edges.push({ a, b, kind })
  }
  for (const p of atPairs ?? []) {
    const sid = String(p.sid ?? '')
    const eid = String(p.eid ?? '')
    const s = sigById.get(sid)
    if (!s) continue
    if (lowIds.has(sid)) {
      const g = grpByType(s.type)
      if (g) pushEdge(g.id, eid, 'at')
    } else pushEdge(sid, eid, 'at')
  }
  for (const d of derivedPairs ?? []) {
    const a = String(d.a ?? '')
    const b = String(d.b ?? '')
    if (lowIds.has(a) || lowIds.has(b)) continue // 组节点不参与意图链
    pushEdge(a, b, 'derived')
  }
  return { nodes, edges, folded: [...groups.values()].reduce((a, g) => a + g.count, 0) }
}

/** viz 星图数据(纯函数): E44-V2 双层图 = Endpoint 资产节点 + open 信号节点(低权重按 type
 *  折叠聚合) + AT 关联边 + DERIVED_FROM 意图链边 + runLog 候选连线。evidence 只出
 *  evHead 截断(textCap)不出全文。查询抛错整体上抛(路由层 503 fail-closed)。 */
export async function buildStarmap(q, { eng, runEvents = { events: [] } } = {}) {
  const [sigRows, epRows, atRows, derivedRows] = await Promise.all([
    q(Q_VIZ.starmapSignals, { eng }),
    q(Q_VIZ.starmapEndpoints, { eng }),
    q(Q_VIZ.starmapAt, { eng }),
    q(Q_VIZ.starmapDerived, { eng }),
  ])
  const sigNodes = (sigRows ?? []).map((r) => ({
    id: String(r.id ?? ''), type: String(r.type ?? ''), weight: num(r.weight), tries: num(r.tries),
    ts: String(r.ts ?? ''), host: vizHostOf(r.evidence), evHead: cap(r.evidence, VIZ.textCap),
  }))
  const epNodes = (epRows ?? []).map((r) => ({
    id: String(r.id ?? ''), url: cap(r.url, 160), tech: cap(r.tech, 40), chain: cap(r.chain, 40),
    votes: num(r.votes), exhausted: Boolean(r.exhausted), host: vizHostOf(r.url), label: vizEpLabel(r.url),
  }))
  // E44-V2b: 端点节点跨 eng 共享(按 URL 幂等, eng=首见归属) — AT 边指向的端点可能首见于
  // 历史 engagement(实证: e43b 的 5 条 AT 边端点全属 79/8r/e42) → 按 e.eng 过滤取不到 =
  // AT 边全丢。补集: 边自带端点属性, 不在 epNodes 的补进来(星图显示资产本体, URL 同=同资产)。
  const epIds = new Set(epNodes.map((n) => n.id))
  const atEpExtra = new Map()
  for (const r of atRows ?? []) {
    const eid = String(r.eid ?? '')
    if (!eid || epIds.has(eid) || atEpExtra.has(eid)) continue
    atEpExtra.set(eid, {
      id: eid, url: cap(r.eurl, 160), tech: cap(r.etech, 40), chain: cap(r.echain, 40),
      votes: num(r.evotes), exhausted: Boolean(r.eexhausted), host: vizHostOf(r.eurl), label: vizEpLabel(r.eurl),
      firstSeenElsewhere: true, // 溯源标注(tooltip 提示首见于其他 engagement)
    })
  }
  epNodes.push(...atEpExtra.values())
  const atPairs = (atRows ?? []).map((r) => ({ sid: String(r.sid ?? ''), eid: String(r.eid ?? '') }))
  const derivedPairs = (derivedRows ?? []).map((r) => ({ a: String(r.a ?? ''), b: String(r.b ?? '') }))
  const { nodes, edges, folded } = assembleStarmap(epNodes, sigNodes, atPairs, derivedPairs)
  // 候选连线(runLog 事件流; 内存态重启即丢 — tail 窗口内至多数条、每条 ≤5 对)
  const candidates = (runEvents?.events ?? [])
    .filter((e) => String(e?.kind ?? e?.event ?? '') === 'candidate-links')
    .flatMap((e) => parseCandidatePairs(e.pairs))
  return {
    nodes, edges, candidates,
    total: sigNodes.length, epTotal: epNodes.length, folded,
    truncated: sigNodes.length >= VIZ.starmapNodes || epNodes.length >= 200,
  }
}

/** viz 覆盖热力(纯函数): 21 格填充(枚举外坐标已在服务端 WHERE 剔除; 格序按枚举稳定)。 */
export async function buildCoverage(q, { eng } = {}) {
  const heatRows = await q(Q_VIZ.covHeat, { eng })
  const heatMap = new Map((heatRows ?? []).map((r) => [`${String(r.su)}|${String(r.bo)}`, num(r.n)]))
  const cells = []
  for (const su of COVERAGE_SURFACES) for (const bo of COVERAGE_BOUNDARIES) cells.push({ su, bo, n: heatMap.get(`${su}|${bo}`) ?? 0 })
  return { surfaces: COVERAGE_SURFACES, boundaries: COVERAGE_BOUNDARIES, cells, total: cells.reduce((a, c) => a + c.n, 0) }
}

/** viz 假设泳道(纯函数): 生命周期 open→claimed→confirmed|refuted|suspected(app.py:849);
 *  时间窗 $since 参数绑定(钳位 clampLaneDays)。 */
export async function buildHypLane(q, { eng, days = VIZ.hypLaneDaysDefault, nowMs = Date.now() } = {}) {
  const since = new Date(Math.max(0, nowMs - clampLaneDays(days) * 86_400_000)).toISOString()
  const [statusRows, itemRows] = await Promise.all([
    q(Q_VIZ.hypByStatus, { eng }),
    q(Q_VIZ.hypItems, { eng, since }),
  ])
  const byStatus = { open: 0, claimed: 0, confirmed: 0, refuted: 0, suspected: 0 }
  for (const r of statusRows ?? []) { const k = String(r.status ?? ''); if (k in byStatus) byStatus[k] = num(r.n) }
  const items = (itemRows ?? []).map((r) => ({
    id: String(r.id ?? ''), text: cap(r.text, VIZ.textCap), strategy: cap(r.strategy, 60),
    status: String(r.status ?? 'open'), ts: String(r.ts ?? ''),
  }))
  return { byStatus, items, windowDays: clampLaneDays(days) }
}

/** 能力看板数据(纯静态读: manifest 符号 + baselines 键计数 + 工具清单推导; 零 graphd 查询)。
 *  缺席降级: 各源独立 try/catch, 缺什么 degraded 记什么(看板卡非关键路径, fail-soft)。 */
export function buildCapability({ manifest, baselinesRaw } = {}) {
  const degraded = []
  let exports = null, forms = null, manifestValid = null
  try {
    if (!manifest || !Array.isArray(manifest.exports)) throw new Error('manifest 形态非法')
    forms = Array.isArray(manifest.forms) ? manifest.forms : null
    manifestValid = true
    exports = manifest.exports.map((e) => ({ form: String(e.form ?? ''), id: String(e.id ?? ''), status: String(e.status ?? ''), impl: String(e.impl ?? ''), note: String(e.note ?? '') }))
  } catch (e) { degraded.push(`manifest: ${String(e?.message ?? e).slice(0, 80)}`) }
  let baselineKeys = null, baselineVersion = null, tools = null
  try {
    const j = typeof baselinesRaw === 'string' ? JSON.parse(baselinesRaw) : baselinesRaw
    if (!j || !Array.isArray(j.baselines)) throw new Error('baselines 形态非法')
    baselineVersion = String(j.version ?? '')
    baselineKeys = j.baselines.length
    tools = [...new Set(j.baselines.map((b) => String(b.tool ?? '').split('.')[0]))].filter(Boolean).sort()
  } catch (e) { degraded.push(`baselines: ${String(e?.message ?? e).slice(0, 80)}`) }
  return {
    manifest: exports ? { generated: String(manifest.generated ?? ''), forms, exports } : null,
    manifestValid,
    baselines: baselineKeys === null ? null : { version: baselineVersion, keys: baselineKeys, tools },
    degraded,
  }
}
