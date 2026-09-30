// business-card.mjs — BG-1 业务闸第一段: 业务形态卡 Schema + 三纯函数(零 IO 零图写入)
// 拍板四字段为核: business_workflow(业务工作流) / expected_constraints(预期约束) /
//   param_semantics(参数语义) / known_gaps(已识别缺口) — schema 可扩展, 四字段不可删。
// 边界结论(BG-1-0 审计项 4): 业务卡是 engagement 级一次性工作对象(生成物落
//   runs/<eng>/business-card.json), 不是可复用长期知识 → 不入知识脑存储/晋级/检索链路;
//   与 coverage 象限分工: 业务闸管「有没有看业务」, 象限管「看得均不均」; 与偏科检测
//   (domain/bias-detector.mjs 四维 param/workflow/race/execution)在业务逻辑面衔接。
// 纯函数纪律: 无 IO/无图写入/时钟经 opts.now 注入; 供 BG-2 scheduler 集成(授权后)与单测。

// ── Schema(风格对齐 domain/card-schema.mjs: 必填/类型/枚举从严, 未定义字段 fail-closed) ──
export const BUSINESS_CARD_ID_RE = /^bizcard:[a-z0-9-]+$/
export const BUSINESS_CARD_SCHEMA = {
  id: { type: 'string', required: true, min: 9, max: 96, re: BUSINESS_CARD_ID_RE, reMsg: '须匹配 bizcard:<小写短横线slug>' },
  eng: { type: 'string', required: true, min: 1, max: 80 },
  title: { type: 'string', required: true, min: 1, max: 120 },
  // 四字段为核(拍板, 不可删)
  business_workflow: { type: 'string', required: true, min: 1, max: 2000 },
  expected_constraints: { type: 'string[]', required: true, min: 0, max: 12, minEl: 1, maxEl: 200 },
  param_semantics: { type: 'string[]', required: true, min: 0, max: 20, minEl: 1, maxEl: 200 },
  known_gaps: { type: 'string[]', required: true, min: 0, max: 12, minEl: 1, maxEl: 200 },
  // 扩展字段(可选)
  evidence: { type: 'string[]', required: false, min: 0, max: 10, minEl: 1, maxEl: 160 },
  generated_by: { type: 'string', required: false, max: 80 },
  created_at: { type: 'string', required: false, max: 40 },
}

function checkStr(spec, v, label, errs) {
  if (typeof v !== 'string') { errs.push(`${label}: 类型须为 string(实为 ${v === null ? 'null' : typeof v})`); return }
  if (spec.min && v.length < spec.min) errs.push(`${label}: 长度 <${spec.min}`)
  if (spec.max && v.length > spec.max) errs.push(`${label}: 长度 >${spec.max}`)
  if (spec.re && !spec.re.test(v)) errs.push(`${label}: ${spec.reMsg}`)
}

function checkStrArr(spec, v, label, errs) {
  if (!Array.isArray(v)) { errs.push(`${label}: 类型须为 string[]`); return }
  if (spec.min && v.length < spec.min) errs.push(`${label}: 元素数 <${spec.min}`)
  if (spec.max && v.length > spec.max) errs.push(`${label}: 元素数 >${spec.max}`)
  for (let i = 0; i < v.length; i++) {
    const el = v[i]
    if (typeof el !== 'string') { errs.push(`${label}[${i}]: 元素类型须为 string`); continue }
    if ((spec.minEl && el.length < spec.minEl) || (spec.maxEl && el.length > spec.maxEl)) errs.push(`${label}[${i}]: 元素长度越界(${el.length})`)
  }
}

/** 单卡校验 → {ok, errors[]}(未定义字段 fail-closed, 与 card-schema.mjs 同哲学) */
export function validateBusinessCard(card) {
  const errs = []
  if (!card || typeof card !== 'object' || Array.isArray(card)) return { ok: false, errors: ['业务形态卡须为 object'] }
  for (const [k, spec] of Object.entries(BUSINESS_CARD_SCHEMA)) {
    const v = card[k]
    if (v === undefined || v === null) { if (spec.required) errs.push(`${k}: 缺必填`); continue }
    if (spec.type === 'string') checkStr(spec, v, k, errs)
    else if (spec.type === 'string[]') checkStrArr(spec, v, k, errs)
  }
  for (const k of Object.keys(card)) if (!BUSINESS_CARD_SCHEMA[k]) errs.push(`${k}: 未定义字段(Schema 外字段禁止)`)
  return { ok: errs.length === 0, errors: errs }
}

// ── 覆盖评估阈值(默认值; BG-2 接线时可经 ringTuning 覆写) ──
export const GATE_DEFAULTS = { minEndpoints: 8, minSignals: 5 }
const DEEP_KINDS = ['deep-dive', 'chain'] // 深环任务 kind(loop.mjs allocateOnce 深环枚举的挖掘子集)

/** 完整度: 四字段非空计数(known_gaps 空数组计半, 缺口留白是常态不是缺陷) */
export function cardCompleteness(card) {
  if (!card || typeof card !== 'object') return 0
  let s = 0
  if (String(card.business_workflow ?? '').trim()) s += 1
  if ((card.expected_constraints ?? []).length) s += 1
  if ((card.param_semantics ?? []).length) s += 1
  s += (card.known_gaps ?? []).length ? 1 : 0.5
  return s / 4
}

/** 覆盖评估(纯函数; endpoints/signals 为调用方拉好的图数据行数组)
 * → {gated, ready, completeness, material, gaps[]}
 *   gated = 应生成卡而未生成(素材达标 && 无卡) — BG-2 提醒块与派发闸的判定源
 *   ready = 有卡且完整度 ≥0.75 — 深环放行条件
 *   material = 素材充分性(端点/信号量), 素材不足时不催卡(防空转) */
export function assessBusinessCoverage({ card = null, endpoints = [], signals = [] }, { thresholds = {} } = {}) {
  const cfg = { ...GATE_DEFAULTS, ...(thresholds ?? {}) }
  const nEp = (endpoints ?? []).length
  const nSig = (signals ?? []).length
  const material = { endpoints: nEp, signals: nSig, sufficient: nEp >= cfg.minEndpoints || nSig >= cfg.minSignals }
  const exists = Boolean(card) && validateBusinessCard(card).ok
  const completeness = exists ? cardCompleteness(card) : 0
  const gaps = []
  if (!exists) {
    if (material.sufficient) gaps.push('业务形态卡未生成 — discovery 素材已达标, 应先蒸馏业务卡再进深环')
    return { gated: material.sufficient, ready: false, completeness: 0, material, gaps }
  }
  if (completeness < 0.75) gaps.push(`业务形态卡完整度不足(${Math.round(completeness * 100)}% < 75%) — 补齐四字段后再派深环`)
  return { gated: false, ready: completeness >= 0.75, completeness, material, gaps }
}

/** 提醒块(BG-2 注入用): gated 且有缺口 → 单行 <business_gate> 块; 否则 ''(派发零影响, 照 bias-block 形态)
 * content 恒为调用方素材摘要(防注入: 由本函数白名单拼装, 不透传原始 URL/信号文本)。 */
export function buildGateReminder(assessment, { eng = '' } = {}) {
  if (!assessment?.gated || !assessment.gaps?.length) return ''
  const tail = assessment.material.sufficient ? `端点 ${assessment.material.endpoints}/信号 ${assessment.material.signals}` : ''
  const scope = eng ? `[${String(eng).slice(0, 40)}] ` : ''
  return `\n<business_gate> 业务闸提醒: ${scope}${assessment.gaps.join('; ')}${tail ? `(素材: ${tail})` : ''} — 深环派发前请先产出业务形态卡(业务工作流/预期约束/参数语义/已识别缺口)</business_gate>`
}

/** 深环派发闸(BG-2 检查用): 深环 kind 且卡未就绪 → true(拦)。
 * kinds 缺省取挖掘子集(deep-dive/chain); verify/link 不拦(验证与链路复用不依赖业务卡)。 */
export function shouldGateDeepDispatch(card, { kinds = DEEP_KINDS, taskKind = 'deep-dive' } = {}) {
  const deep = (kinds ?? []).includes(String(taskKind ?? ''))
  if (!deep) return false
  const exists = Boolean(card) && validateBusinessCard(card).ok
  if (!exists) return true
  return cardCompleteness(card) < 0.75
}
