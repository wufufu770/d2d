// card-schema.mjs — T3-1-1 知识卡 JSON Schema 硬校验(纯函数零 IO)
// 审计定界(T3-1-0 项1, 260 张实测): 必填九字段 id/title/category/applies_to/validation_recipe/
// signals/negative_controls/adaptation_prompt/refs 在 seed20/v0/v2/v4/v5/v6 全量 100% 在场;
// domain 与 variants 为可选(v5/v6 各 5 张缺 domain — 现役 v2 完整); 错字段/缺必填直接挂,
// 不静默修复(校验失败处理路径 = 阻断 + 报告, 由调用方 CLI/CI 决定退出码)。
// export 兼容字段(本批新增, 均可选): provenance{source_url,source_type,collected_at} /
// version — 外部导出卡回灌时携带溯源不挂 Schema; 未定义字段一律拒绝(fail-closed)。
// 界限取实测值域放档(信号 2-6 → 上限 12 等), 类型/枚举/形状从严 — 放宽"数量"不放宽"形态"。

export const CARD_CATEGORIES = ['web', 'auth', 'logic', 'recon', 'files', 'client', 'crypto', 'mobile', 'ai', 'infra']
export const CARD_ID_RE = /^card:[a-z0-9-]+$/
export const SOURCE_TYPES = ['seed', 'study', 'insight', 'manual', 'external']

/** 字段规格: type=string|string[]|object; required=必填; max=长度/元素数上限(0=不限) */
export const CARD_SCHEMA = {
  id: { type: 'string', required: true, min: 6, max: 96, re: CARD_ID_RE, reMsg: '须匹配 card:<小写短横线slug>' },
  title: { type: 'string', required: true, min: 1, max: 160 },
  category: { type: 'string', required: true, enum: CARD_CATEGORIES },
  applies_to: { type: 'string[]', required: true, min: 1, max: 20, minEl: 1, maxEl: 64 },
  domain: { type: 'string', required: false, max: 64 },
  validation_recipe: { type: 'string', required: true, min: 1, max: 2000 },
  signals: { type: 'string[]', required: true, min: 1, max: 12, minEl: 1, maxEl: 160 },
  negative_controls: { type: 'string[]', required: true, min: 1, max: 8, minEl: 1, maxEl: 200 },
  adaptation_prompt: { type: 'string', required: true, min: 1, max: 500 },
  refs: { type: 'string[]', required: true, min: 1, max: 8, minEl: 1, maxEl: 200 },
  variants: {
    type: 'object[]', required: false, min: 1, max: 5,
    fields: {
      stack: { type: 'string', required: true, min: 1, max: 64 },
      payload_diff: { type: 'string', required: true, min: 1, max: 500 },
      ref: { type: 'string', required: false, max: 200 },
    },
  },
  // export 兼容字段(可选, 回灌不挂)
  provenance: {
    type: 'object', required: false,
    fields: {
      source_url: { type: 'string', required: false, max: 500 },
      source_type: { type: 'string', required: false, enum: SOURCE_TYPES },
      collected_at: { type: 'string', required: false, max: 40 },
    },
  },
  version: { type: 'string|number', required: false, max: 40 },
}

function checkStr(spec, v, label, errs) {
  if (typeof v !== 'string') { errs.push(`${label}: 类型须为 string(实为 ${v === null ? 'null' : typeof v})`); return }
  if (spec.min && v.length < spec.min) errs.push(`${label}: 长度 <${spec.min}`)
  if (spec.max && v.length > spec.max) errs.push(`${label}: 长度 >${spec.max}`)
  if (spec.re && !spec.re.test(v)) errs.push(`${label}: ${spec.reMsg}`)
  if (spec.enum && !spec.enum.includes(v)) errs.push(`${label}: 非法枚举 ${JSON.stringify(v)}(允许: ${spec.enum.join('|')})`)
}

function checkStrArr(spec, v, label, errs) {
  if (!Array.isArray(v)) { errs.push(`${label}: 类型须为 string[](实为 ${Array.isArray(v) ? 'array' : typeof v})`); return }
  if (spec.min && v.length < spec.min) errs.push(`${label}: 元素数 <${spec.min}`)
  if (spec.max && v.length > spec.max) errs.push(`${label}: 元素数 >${spec.max}`)
  for (let i = 0; i < v.length; i++) {
    const el = v[i]
    if (typeof el !== 'string') { errs.push(`${label}[${i}]: 元素类型须为 string`); continue }
    if ((spec.minEl && el.length < spec.minEl) || (spec.maxEl && el.length > spec.maxEl)) errs.push(`${label}[${i}]: 元素长度越界(${el.length})`)
  }
}

function checkObjArr(spec, v, label, errs) {
  if (!Array.isArray(v)) { errs.push(`${label}: 类型须为 object[]`); return }
  if (spec.min && v.length < spec.min) errs.push(`${label}: 元素数 <${spec.min}`)
  if (spec.max && v.length > spec.max) errs.push(`${label}: 元素数 >${spec.max}`)
  for (let i = 0; i < v.length; i++) {
    const el = v[i]
    if (!el || typeof el !== 'object' || Array.isArray(el)) { errs.push(`${label}[${i}]: 须为 object`); continue }
    for (const [k, fs] of Object.entries(spec.fields)) {
      if (el[k] === undefined) { if (fs.required) errs.push(`${label}[${i}].${k}: 缺必填`); continue }
      if (fs.type === 'string') checkStr(fs, el[k], `${label}[${i}].${k}`, errs)
    }
    for (const k of Object.keys(el)) if (!spec.fields[k]) errs.push(`${label}[${i}].${k}: 未定义字段`)
  }
}

function checkObj(spec, v, label, errs) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) { errs.push(`${label}: 类型须为 object`); return }
  for (const [k, fs] of Object.entries(spec.fields)) {
    if (v[k] === undefined) { if (fs.required) errs.push(`${label}.${k}: 缺必填`); continue }
    if (fs.type === 'string') checkStr(fs, v[k], `${label}.${k}`, errs)
    else if (fs.enum && typeof v[k] === 'string' && !fs.enum.includes(v[k])) errs.push(`${label}.${k}: 非法枚举 ${JSON.stringify(v[k])}`)
  }
  for (const k of Object.keys(v)) if (!spec.fields[k]) errs.push(`${label}.${k}: 未定义字段`)
}

/** 单卡校验 → {ok, errors[]}。未知顶层字段一律报错(fail-closed, 防静默漂移)。 */
export function validateCard(card) {
  const errs = []
  if (!card || typeof card !== 'object' || Array.isArray(card)) return { ok: false, errors: ['卡片须为 object'] }
  for (const [k, spec] of Object.entries(CARD_SCHEMA)) {
    const v = card[k]
    if (v === undefined || v === null) { if (spec.required) errs.push(`${k}: 缺必填`); continue }
    if (spec.type === 'string') checkStr(spec, v, k, errs)
    else if (spec.type === 'string[]') checkStrArr(spec, v, k, errs)
    else if (spec.type === 'object[]') checkObjArr(spec, v, k, errs)
    else if (spec.type === 'object') checkObj(spec, v, k, errs)
    else if (spec.type === 'string|number') {
      if (typeof v !== 'string' && typeof v !== 'number') errs.push(`${k}: 类型须为 string|number`)
      else if (spec.max && String(v).length > spec.max) errs.push(`${k}: 长度 >${spec.max}`)
    }
  }
  for (const k of Object.keys(card)) if (!CARD_SCHEMA[k]) errs.push(`${k}: 未定义字段(Schema 外字段禁止, 需先入 Schema)`)
  return { ok: errs.length === 0, errors: errs }
}

/** 卡数组批量校验 → {passed, failed, rows:[{id, ok, errors}]} */
export function validateCards(cards) {
  const rows = []
  let passed = 0, failed = 0
  for (const c of cards ?? []) {
    const r = validateCard(c)
    if (r.ok) passed++; else failed++
    rows.push({ id: String(c?.id ?? '(无id)'), ok: r.ok, errors: r.errors })
  }
  return { passed, failed, rows }
}
