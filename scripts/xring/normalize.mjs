// scripts/xring/normalize.mjs — E34 契约归一化前置闸（worker 违约形态机械化兜底）
// 语义边界: 只做形态归一（id 形态/variants 上限/枚举域），零语义改写（steps/expected/observed
// 等内容字段不碰）；**合规输入恒等零改动**（changes=[]，对既有 run 零行为变化）。
// E35-r2 实证违约形态全集（三棒 A 级零入图根因）:
//   ①id 缺连字符 `F1..Fn`（槽1/2: 12+18 条 → 整份 repro_paths 被 schema 拒）
//   ②variants>5（槽3: 5 条 6/8/7/6/6 → 整份拒）
//   ③hypotheses status 串场 `pending`/`open`（handoff 语义域串入, 槽3 条目级拒）
//   ④hypotheses priority 串场 `critical`（severity 语义域串入, 槽3 条目级拒）
// 插入位: reflow 各文件段 validateAgainst 之前（读盘→归一→内存校验），归一化履历入事件流。

const FINDING_ID = /^F-[0-9]{1,4}$/
const HYP_ID = /^H-[0-9]{1,4}$/

/**
 * id 归一: 全合规且无重 → 恒等; 否则稳定保留合规唯一 id、其余按最小空位重映射
 * （保持 E11a#7 idReconcile 的连续无重语义; changes 记 from→to 全表供种子对照）。
 */
function remapIds(items, re, prefix, file, changes) {
  const ids = items.map((x) => String(x?.id ?? ''))
  if (ids.every((id) => re.test(id)) && new Set(ids).size === ids.length) return
  const used = new Set(ids.filter((id) => re.test(id)))
  const assigned = new Set()
  const nextFree = () => { let n = 1; while (used.has(`${prefix}-${n}`)) n++; return `${prefix}-${n}` }
  for (const x of items) {
    const from = String(x?.id ?? '')
    let to
    if (re.test(from) && !assigned.has(from)) { to = from; assigned.add(from) }
    else { to = nextFree(); used.add(to); assigned.add(to) }
    if (to !== from) { changes.push({ file, kind: 'id-remap', from, to }); x.id = to }
  }
}

/** 根元数据归一（run_id 非空串/generated_at date-time 格式——槽1 实证漏网形态）。 */
function normalizeRoot(doc, file, changes) {
  if (!doc || typeof doc !== 'object') return
  if (typeof doc.run_id !== 'string' || !doc.run_id) {
    changes.push({ file, kind: 'root-run_id', from: String(doc.run_id), to: 'unknown' })
    doc.run_id = 'unknown'
  }
  const g = String(doc.generated_at ?? '')
  const dtLike = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.test(g)
  if (!dtLike) {
    const to = new Date().toISOString()
    changes.push({ file, kind: 'root-generated_at', from: g.slice(0, 40), to })
    doc.generated_at = to
  } else if (!/(Z|[+-]\d{2}:?\d{2})$/.test(g)) {
    // 日期时间合规但缺时区（槽1 实证: `2026-10-23T12:35:35`——RFC3339 拒）→ 尾补 Z 保原时间语义
    const to = g.replace(' ', 'T') + 'Z'
    changes.push({ file, kind: 'root-generated_at-tz', from: g, to })
    doc.generated_at = to
  }
}

/** findings/repro_paths 归一（根元数据+id 形态+variants ≤5 裁切——竞速语义下保主力前 5 变体）。 */
export function normalizeRepro(doc, changes = []) {
  normalizeRoot(doc, 'repro_paths.json', changes)
  const findings = Array.isArray(doc?.findings) ? doc.findings : []
  remapIds(findings, FINDING_ID, 'F', 'repro_paths.json', changes)
  for (const f of findings) {
    if (Array.isArray(f?.variants) && f.variants.length > 5) {
      changes.push({ file: 'repro_paths.json', kind: 'variants-trim', id: f.id, from: f.variants.length, to: 5 })
      f.variants = f.variants.slice(0, 5)
    }
  }
  return { changes }
}

/** hypotheses 归一（根元数据+id 形态+status/priority 枚举域串场归位——未知值保守缺省）。 */
export function normalizeHypotheses(doc, changes = []) {
  normalizeRoot(doc, 'hypotheses.json', changes)
  const STATUS_MAP = { pending: 'probing', open: 'probing', done: 'confirmed', closed: 'confirmed' }
  const PRIORITY_MAP = { critical: 'high', info: 'low' }
  const hyps = Array.isArray(doc?.hypotheses) ? doc.hypotheses : []
  remapIds(hyps, HYP_ID, 'H', 'hypotheses.json', changes)
  for (const h of hyps) {
    const st = String(h?.status ?? '')
    if (st && !['untested', 'probing', 'falsified', 'confirmed'].includes(st)) {
      const to = STATUS_MAP[st] ?? 'untested'
      changes.push({ file: 'hypotheses.json', kind: 'status-remap', id: h.id, from: st, to })
      h.status = to
    }
    const pr = String(h?.priority ?? '')
    if (pr && !['high', 'medium', 'low'].includes(pr)) {
      const to = PRIORITY_MAP[pr] ?? 'medium'
      changes.push({ file: 'hypotheses.json', kind: 'priority-remap', id: h.id, from: pr, to })
      h.priority = to
    }
  }
  return { changes }
}

/** lessons 归一（根元数据+id 形态+failure_class 枚举——未知值保守归 cognitive: 环外兜底语义）。 */
export function normalizeLessons(doc, changes = []) {
  normalizeRoot(doc, 'lessons.json', changes)
  const CLASS_MAP = { technical: 'environment', tooling: 'resource', timeout: 'resource' }
  const lessons = Array.isArray(doc?.lessons) ? doc.lessons : []
  for (const l of lessons) {
    const fc = String(l?.failure_class ?? '')
    if (fc && !['resource', 'destructive', 'overreach', 'cognitive', 'environment'].includes(fc)) {
      const to = CLASS_MAP[fc] ?? 'cognitive'
      changes.push({ file: 'lessons.json', kind: 'class-remap', id: l.id, from: fc, to })
      l.failure_class = to
    }
  }
  return { changes }
}
