// relay.mjs — R-05 跨 run 接力（认识论标签制 handoff——标签即语义）
// 写侧: collectHandoff/writeHandoff（reflow 收尾调用, handoff.json 与产物同址——run 3 的基线）。
// 读侧: loadHandoffFrom + injectBrief（first-run --from-record 消费——预裁 3 "leads 非 facts"
// 注入语义: facts 入战果底账免重扫; leads 以假设形态注入（复验优先不采信）; falsified 入
// 排除表防复测; env 指纹入 ECC 跨轮基线）。无 handoff（首战）= 零注入原行为（向后兼容）。
import fs from 'node:fs'
import path from 'node:path'
import { validateHandoff } from './validate.mjs'

export const HANDOFF_FILE = 'handoff.json'
export const HANDOFF_SCHEMA = 'xring/handoff@1'

/** 四类载体收集（reflow 收尾传参; 全字段截断对齐 schema 上限）。 */
export function collectHandoff({ runId, target, verified = [], leads = [], falsified = [], env = null, generatedAt = null }) {
  return {
    schema: HANDOFF_SCHEMA,
    run_id: String(runId ?? '').slice(0, 64),
    generated_at: generatedAt ?? new Date().toISOString(),
    target: String(target ?? '').slice(0, 500),
    carriers: {
      facts: verified.slice(0, 200).map((f) => ({
        id: String(f.id).slice(0, 16),
        title: String(f.title ?? '').slice(0, 200),
        severity: ['critical', 'high', 'medium', 'low', 'info'].includes(f.severity) ? f.severity : 'info',
        verified_in: String(f.verified_in ?? runId ?? '').slice(0, 64),
        ...(Array.isArray(f.steps) && f.steps.length ? { steps: f.steps.slice(0, 100).map((s) => String(s).slice(0, 2000)) } : {}),
      })),
      leads: leads.slice(0, 200).map((l) => ({
        id: String(l.id).slice(0, 16),
        statement: String(l.statement ?? '').slice(0, 1500),
        priority: ['high', 'medium', 'low'].includes(l.priority) ? l.priority : 'medium',
        origin: ['held-manual', 'hypothesis', 'prev-lead'].includes(l.origin) ? l.origin : 'hypothesis',
      })),
      falsified: falsified.slice(0, 200).map((f) => ({
        id: String(f.id).slice(0, 16),
        statement: String(f.statement ?? '').slice(0, 1500),
        reason: String(f.reason ?? '').slice(0, 500),
      })),
      env: {
        fingerprint: (env?.fingerprint ?? []).slice(0, 50).map((p) => ({
          path: String(p.path ?? '').slice(0, 500),
          status: Number(p.status ?? 0) | 0,
          ...(p.content_type ? { content_type: String(p.content_type).slice(0, 200) } : {}),
          bytes: Number(p.bytes ?? 0) | 0,
          hash: String(p.hash ?? '').slice(0, 64),
        })),
        ...(env?.csp_origins?.length ? { csp_origins: env.csp_origins.slice(0, 20).map((o) => String(o).slice(0, 200)) } : {}),
        ...(env?.ecc ? { ecc: { level: ['none', 'suspicious', 'likely'].includes(env.ecc.level) ? env.ecc.level : 'none', signals: (env.ecc.signals ?? []).slice(0, 10).map((s) => ({ kind: String(s.kind).slice(0, 40), confidence: ['low', 'medium', 'high'].includes(s.confidence) ? s.confidence : 'low', detail: String(s.detail ?? '').slice(0, 500) })) } } : {}),
      },
    },
  }
}

/** 写侧: 校验失败即抛（契约封闭面——坏 handoff 不落盘, 宁断不污染接力链）。 */
export function writeHandoff(dir, handoff) {
  const v = validateHandoff(handoff)
  if (!v.ok) throw new Error(`handoff 契约违规: ${v.errors.join(' | ').slice(0, 400)}`)
  fs.writeFileSync(path.join(dir, HANDOFF_FILE), JSON.stringify(handoff, null, 1))
  return path.join(dir, HANDOFF_FILE)
}

/** 读侧解析: --from-record 值可为 run record 目录（找 workspace/handoff.json 与同址）/直接文件路径。 */
export function loadHandoffFrom(fromRecord) {
  const candidates = []
  if (fromRecord.endsWith('.json')) candidates.push(fromRecord)
  else {
    candidates.push(path.join(fromRecord, 'workspace', HANDOFF_FILE))
    candidates.push(path.join(fromRecord, HANDOFF_FILE))
  }
  for (const c of candidates) {
    try {
      const doc = JSON.parse(fs.readFileSync(c, 'utf8'))
      const v = validateHandoff(doc)
      if (v.ok) return doc
    } catch { /* 逐候选回退（缺文件/坏文件=无接力, 向后兼容） */ }
  }
  return null
}

/** 注入语义（预裁 3）: leads=假设形态（复验优先不采信）; falsified=排除表; facts=底账。 */
export function injectBrief(handoff, { maxLeads = 8, maxFacts = 10, maxFalsified = 8 } = {}) {
  if (!handoff) return ''
  const c = handoff.carriers ?? {}
  const lines = [
    '## 上一轮接力（认识论标签制——标签即语义, 严格区分, 不得越标签使用）', '',
    `（来源 run: ${handoff.run_id} · 同靶复战前提; 若你判断目标形态已变, 全部标签降级为线索并如实声明）`, '',
  ]
  if (c.facts?.length) {
    lines.push('### facts（上轮已机械验证——免重扫, 可作已确立底账引用; 引用须带原 id）')
    for (const f of c.facts.slice(0, maxFacts)) lines.push(`- [${f.id}] ${f.title}（${f.severity}）`)
    lines.push('')
  }
  if (c.leads?.length) {
    lines.push('### leads（上轮未验证假设——**假设形态注入: 复验优先, 不采信**; 须自行取证, 复验不成立即弃）')
    for (const l of c.leads.slice(0, maxLeads)) lines.push(`- [${l.id}] ${l.statement}（priority=${l.priority}, origin=${l.origin}）`)
    lines.push('')
  }
  if (c.falsified?.length) {
    lines.push('### falsified（上轮已证伪——禁复测同路径; 新角度除外, 须声明角度差异）')
    for (const f of c.falsified.slice(0, maxFalsified)) lines.push(`- [${f.id}] ${f.statement}（reason: ${f.reason}）`)
    lines.push('')
  }
  if (c.env?.fingerprint?.length) {
    lines.push('### env 指纹基线（上轮路径级响应特征——编排层已做跨轮漂移检验, 结果为 advisory 信号）')
    for (const p of c.env.fingerprint.slice(0, 10)) lines.push(`- ${p.path} → ${p.status} ${p.content_type ?? '-'} ${p.bytes}B ${String(p.hash).slice(0, 12)}…`)
    lines.push('')
  }
  return lines.length > 5 ? lines.join('\n') : ''
}

/** reflow 侧组装: 由回流产物导出四类载体（A pass=facts; held+hypotheses=leads; falsified 态+refuted=falsified）。 */
export function collectFromReflow({ runId, target, verifiedFindings, written, held, hypothesesDocs = [], refuted = [], env = null }) {
  const facts = (verifiedFindings ?? []).map((f) => ({ ...f, verified_in: runId }))
  const hypById = new Map()
  for (const d of hypothesesDocs) for (const h of (d.hypotheses ?? [])) hypById.set(String(h.id), h)
  const leads = []
  for (const h of (held ?? [])) leads.push({ id: h.id, statement: h.statement ?? String(h.evidence ?? h.verdict ?? 'held 条目').slice(0, 200), priority: 'medium', origin: 'held-manual' })
  for (const w of (written ?? [])) if (w.level === 'B') leads.push({ id: w.id, statement: String(hypById.get(String(w.id))?.statement ?? `假设 ${w.id}（上轮已入图未验证）`).slice(0, 1500), priority: ['high', 'medium', 'low'].includes(hypById.get(String(w.id))?.priority) ? hypById.get(String(w.id)).priority : 'medium', origin: 'hypothesis' })
  const falsified = [
    ...(refuted ?? []).map((r) => ({ id: r.id, statement: r.statement ?? `fact ${r.id}（上轮已验证本轮复验失败）`, reason: r.reason ?? 're-verify failed' })),
  ]
  for (const d of hypothesesDocs) for (const h of (d.hypotheses ?? [])) if (h.status === 'falsified') falsified.push({ id: h.id, statement: String(h.statement ?? '').slice(0, 1500) || `假设 ${h.id}`, reason: 'worker 自证伪（上轮 hypotheses.falsified 态）' })
  return collectHandoff({ runId, target, verified: facts, leads, falsified, env })
}
