// 策略卡编译域模块 — 卡片不是文档, 是可编译的 worker 作战指令(借鉴 evidence-gate/strategy-card 方法论层)。
// 在 v0 知识卡字段(id/title/applies_to/validation_recipe/refs/variants)基础上增量扩展, 全部可选向后兼容:
//   signals[]           适用信号 — 何种观测应想起这张卡
//   negative_controls[] 阴性对照 — 什么观测应判定"不适用", 防止把模式硬套到不匹配的面
//   adaptation_prompt   一句可直接交给 worker 的作战指令(缺省时由 validation_recipe 充当)
//   tech[]              技术面标签(P1/M4 指纹反查键, 归一后与指纹命中做严格交集; 缺省回落 applies_to)
// 消费方: scheduler knowledgeBlock — 检索命中卡片编译成单行注入, 替代裸标题+配方拼接。

export function validateStrategyCard(card) {
  const errors = []
  const c = card ?? {}
  if (!String(c.id ?? '').trim()) errors.push('id required')
  if (!String(c.title ?? '').trim()) errors.push('title required')
  for (const k of ['applies_to', 'signals', 'negative_controls', 'variants', 'refs', 'tech']) {
    if (c[k] !== undefined && !Array.isArray(c[k])) errors.push(`${k} must be array`)
  }
  if (c.adaptation_prompt !== undefined && typeof c.adaptation_prompt !== 'string') errors.push('adaptation_prompt must be string')
  if (c.validation_recipe !== undefined && typeof c.validation_recipe !== 'string') errors.push('validation_recipe must be string')
  return { ok: errors.length === 0, errors }
}

const _seg = (label, val, cap) => {
  const s = String(val ?? '').replace(/\s+/g, ' ').trim()
  return s ? ` ${label}:${s.slice(0, cap)}` : ''
}

export function compileStrategyCard(card, { maxLen = 260 } = {}) {
  const c = card ?? {}
  const invalid = validateStrategyCard(c)
  if (!invalid.ok) return ''
  const signals = (c.signals?.length ? c.signals : c.applies_to ?? []).map((s) => String(s).trim()).filter(Boolean)
  const parts =
    `【${String(c.title).replace(/\s+/g, ' ').trim().slice(0, 40)}】` +
    _seg('信号', signals.slice(0, 6).join('/'), 80) +
    _seg('最小验证步', c.validation_recipe, 110) +
    _seg('阴性对照', (c.negative_controls ?? []).join(' ; '), 80) +
    _seg('worker指令', c.adaptation_prompt, 120)
  return parts.length > maxLen ? parts.slice(0, maxLen - 1) + '…' : parts
}
