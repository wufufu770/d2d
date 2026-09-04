// @wufufu770/d2d-skills — 零依赖 SKILL.md 加载器: frontmatter 简单 YAML 子集解析 + 校验 + 打分选择。
import fs from 'node:fs'
import path from 'node:path'

export const SKILL_FIELDS = ['name', 'description', 'version', 'category', 'when_to_use', 'allowed-tools', 'user-invocable']

export class SkillError extends Error {
  constructor(dir, msg) {
    super(`[skill ${path.basename(dir)}] ${msg}`)
    this.name = 'SkillError'
    this.dir = dir
  }
}

// --- 包裹的 frontmatter → { data, body }。无 --- 或未闭合返回空 data + 全文 body。
export function parseFrontmatter(text) {
  const s = String(text)
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(s)
  if (!m) return { data: {}, body: s }
  const data = {}
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const i = line.indexOf(':')
    if (i <= 0) continue
    const key = line.slice(0, i).trim()
    let val = line.slice(i + 1).trim()
    if (!(key in data)) data[key] = coerce(val, key)
  }
  return { data, body: m[2] }
}

// 仅白名单字段做裸逗号切分(多工具列表); 其余含逗号值(description 等散文)必须保持字符串,
// 否则任意含逗号的句子都被误拆成数组。
const COMMA_LIST_FIELDS = new Set(['allowed-tools'])

function coerce(v, key) {
  if (v === '' || v === undefined) return ''
  if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean)
  if (COMMA_LIST_FIELDS.has(key) && v.includes(',')) return v.split(',').map((x) => x.trim()).filter(Boolean)
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^-?\d+$/.test(v)) return Number.parseInt(v, 10)
  return v
}

export function validateCard(card, dir) {
  if (!card.name) throw new SkillError(dir, '缺少 name')
  if (card.name !== path.basename(dir)) throw new SkillError(dir, `name(${card.name}) 必须等于目录名(${path.basename(dir)})`)
  if (!card.description) throw new SkillError(dir, '缺少 description')
  if (card.description.length > 200) throw new SkillError(dir, `description 超长(${card.description.length} > 200)`)
  if (!('user-invocable' in card)) card['user-invocable'] = true
  return card
}

export function loadSkill(dir) {
  const file = path.join(dir, 'SKILL.md')
  if (!fs.existsSync(file)) return null
  const { data } = parseFrontmatter(fs.readFileSync(file, 'utf8'))
  return validateCard(data, dir)
}

export function loadSkillsDir(root) {
  const cards = []
  const errors = []
  if (!fs.existsSync(root)) return { cards, errors }
  for (const ent of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!ent.isDirectory()) continue
    const dir = path.join(root, ent.name)
    try {
      const card = loadSkill(dir)
      if (card) cards.push(card)
    } catch (e) {
      errors.push(e)
    }
  }
  return { cards, errors }
}

const FIELDS_WEIGHT = [['name', 5], ['category', 3], ['when_to_use', 2], ['description', 1]]

// keywords: string | string[]。返回附 .score 的降序(稳定)列表, 0 分剔除。
export function scoreSkills(cards, keywords) {
  const kws = (Array.isArray(keywords) ? keywords : [keywords]).map((k) => String(k).toLowerCase()).filter(Boolean)
  const scored = []
  for (const card of cards) {
    let score = 0
    for (const [field, weight] of FIELDS_WEIGHT) {
      const hay = String(card[field] ?? '').toLowerCase()
      if (!hay) continue
      for (const kw of kws) if (hay.includes(kw)) { score += weight; break }
    }
    if (score > 0) scored.push({ ...card, score })
  }
  return scored.sort((a, b) => b.score - a.score)
}
