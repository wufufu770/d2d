// skill-schema.mjs — T3-2-2 skill 对象 Schema(纯函数零 IO; 对齐 card-schema.mjs fail-closed 风格)
// skill = 步骤化程序性知识(MUSE 式), 与 Experience(图内单次教训)/知识卡(what/when 技法)分工:
//   经验→卡是"打过的教训变打法", 卡→skill 是"打法变可执行程序(含 per-skill memory 迭代面)"。
//   升格建议口径: 同主题经验 ≥2 条或知识卡 wins≥2 → 抽取候选(管道 distill.mjs 依此预筛)。
// 存储形态(T3-2-0 审计项 2): ${DATA_DIR}/brain/skills/<skill-id>/SKILL.md(front-matter+正文)
//   + memory.md(实战笔记迭代面) + state.json(status/times)。状态机 quarantined→shadow→current
//   →deprecated(对齐 brain 版本语义; 通道 scripts/brain/skill-promote.mjs 平行新建, 不改既有链路)。
// 三门 skill 版(skill-promote 侧判定): ①结构门=本 Schema+EVIL 扫描(hard) ②历史复盘门=signal_affinity
//   撞已证伪方向隔离(hard, 语义照 promote.mjs historyGate) ③实战证据门=evidence 非空(soft —
//   skill 的 wins 自动归因未建, 全量归因登记开放项)。

export const SKILL_ID_RE = /^skill:[a-z0-9-]+$/
export const SKILL_CATEGORIES = ['web', 'auth', 'logic', 'recon', 'files', 'client', 'crypto', 'mobile', 'ai', 'infra']
export const SKILL_STATUSES = ['quarantined', 'shadow', 'current', 'deprecated']

/** SKILL.md front-matter 字段规格(必填从严; 正文侧约束由 skill-promote 结构门另行检查) */
export const SKILL_SCHEMA = {
  id: { type: 'string', required: true, min: 7, max: 96, re: SKILL_ID_RE, reMsg: '须匹配 skill:<小写短横线slug>' },
  title: { type: 'string', required: true, min: 1, max: 120 },
  category: { type: 'string', required: true, enum: SKILL_CATEGORIES },
  version: { type: 'string|number', required: true, max: 20 },
  status: { type: 'string', required: true, enum: SKILL_STATUSES },
  // 角色-卡绑定键(T3-2-2 审计项 3): signal_affinity 词面与卡 applies_to/signals 重叠度 = 过滤依据
  signal_affinity: { type: 'string[]', required: true, min: 0, max: 20, minEl: 1, maxEl: 64 },
  rings: { type: 'string[]', required: false, min: 0, max: 4, minEl: 1, maxEl: 20 },
  // 实战证据(soft 门): 引用来源(经验 id/verify 信号/人工填写的实战出处)
  evidence: { type: 'string[]', required: false, min: 0, max: 10, minEl: 1, maxEl: 200 },
  refs: { type: 'string[]', required: true, min: 1, max: 8, minEl: 1, maxEl: 200 },
  created_at: { type: 'string', required: false, max: 40 },
  promoted_at: { type: 'string', required: false, max: 40 },
}

function checkStr(spec, v, label, errs) {
  if (typeof v !== 'string') { errs.push(`${label}: 类型须为 string(实为 ${v === null ? 'null' : typeof v})`); return }
  if (spec.min && v.length < spec.min) errs.push(`${label}: 长度 <${spec.min}`)
  if (spec.max && v.length > spec.max) errs.push(`${label}: 长度 >${spec.max}`)
  if (spec.re && !spec.re.test(v)) errs.push(`${label}: ${spec.reMsg}`)
  if (spec.enum && !spec.enum.includes(v)) errs.push(`${label}: 非法枚举 ${JSON.stringify(v)}(允许: ${spec.enum.join('|')})`)
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

/** front-matter 对象校验 → {ok, errors[]}(未定义字段 fail-closed) */
export function validateSkill(fm) {
  const errs = []
  if (!fm || typeof fm !== 'object' || Array.isArray(fm)) return { ok: false, errors: ['skill front-matter 须为 object'] }
  for (const [k, spec] of Object.entries(SKILL_SCHEMA)) {
    const v = fm[k]
    if (v === undefined || v === null) { if (spec.required) errs.push(`${k}: 缺必填`); continue }
    if (spec.type === 'string') checkStr(spec, v, k, errs)
    else if (spec.type === 'string[]') checkStrArr(spec, v, k, errs)
    else if (spec.type === 'string|number') {
      if (typeof v !== 'string' && typeof v !== 'number') errs.push(`${k}: 类型须为 string|number`)
      else if (spec.max && String(v).length > spec.max) errs.push(`${k}: 长度 >${spec.max}`)
    }
  }
  for (const k of Object.keys(fm)) if (!SKILL_SCHEMA[k]) errs.push(`${k}: 未定义字段(Schema 外字段禁止)`)
  return { ok: errs.length === 0, errors: errs }
}

/** SKILL.md 解析: --- front-matter(简化 YAML 键值/数组) --- + 正文 → {fm, body}; 解析失败 → null */
export function parseSkillMd(text) {
  const s = String(text ?? '')
  const m = s.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return null
  const fm = {}
  let cur = null
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.replace(/\t/g, '  ')
    if (/^\s*-\s+/.test(line) && cur) { fm[cur].push(line.replace(/^\s*-\s+/, '').trim().replace(/^["']|["']$/g, '')); continue }
    const kv = line.match(/^([a-z_]+):\s*(.*)$/)
    if (!kv) continue
    const [, k, v] = kv
    if (v === '' || v === undefined) { fm[k] = []; cur = k } // 数组开端(后续 - 行归属)
    else { fm[k] = v.replace(/^["']|["']$/g, ''); cur = null }
  }
  return { fm, body: m[2].trim() }
}

/** 结构门②内容纪律: 正文必含小节(触发/步骤/验证/阴性 至少其三) + EVIL 注入扫描全卡 */
const EVIL = [
  /ignore\s+[\w\s]{0,24}?instructions/i, /disregard\s+[\w\s]{0,20}?instructions/i,
  /rm\s+-rf?\s+\//, /mkfs/, /dd\s+[^|]*of=\/dev\//, /shutdown|reboot|halt/i,
  /DROP\s+(TABLE|DATABASE)/i, /curl[^|]*\|\s*(ba)?sh/,
]

/** skill 结构门(promote ①门判定纯函数): front-matter Schema + 正文小节齐备性 + EVIL 扫描 */
export function validateSkillFull(text) {
  const parsed = parseSkillMd(text)
  if (!parsed) return { ok: false, errors: ['SKILL.md 缺 front-matter(--- 包围)'] }
  const r = validateSkill(parsed.fm)
  const errs = [...r.errors]
  const body = parsed.body
  const sections = ['触发', '步骤', '验证', '阴性'].filter((k) => body.includes(k))
  if (sections.length < 3) errs.push(`正文小节不足(含 ${sections.length}/4: 触发/步骤/验证/阴性 至少其三)`)
  if (!body || body.length < 50) errs.push('正文过短(<50 字符, 非程序性知识)')
  for (const re of EVIL) if (re.test(text)) { errs.push('注入/破坏性内容(EVIL 扫描)'); break }
  return { ok: errs.length === 0, errors: errs, fm: parsed.fm, body }
}
