// A-1 拆分: 环容量热调纯函数 — 面板卡片写 DATA_DIR/config/caps.json, 调度器每 tick 读入并覆盖 env 基准。
// 合并优先级: caps.json > P2P_* env > 内置默认; 本模块只做候选解析(白名单键/整数钳位), 文件 IO 留在编排层。
export const CAP_KINDS = ['recon', 'deep-dive', 'chain', 'verify', 'creative', 'link']
// 各旋钮安全区间: kind cap 与 env 钳位一致; deepParallel 0=自动故文件里 1 起; 水位与 BACKLOG_WM env 钳位一致
const _RANGE = {
  kind: [1, 8],
  deepParallel: [1, 8],
  maxAgents: [1, 8],
  backlogWatermark: [5, 500],
}
const _int = (v) => {
  if (typeof v === 'number') return Number.isInteger(v) ? v : NaN
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return Number.parseInt(v.trim(), 10)
  return NaN
}
const _clampOk = (v, [lo, hi]) => v >= lo && v <= hi

// 解析 caps.json JSON → { caps?:{kind:n}, deepParallel?, maxAgents?, backlogWatermark? }
// 未知键/非整数/越界一律丢弃(面板写侧已钳位, 此处对手工编辑兜底); 全空返回 {} 即"完全跟随 env"。
export function parseHotCaps(j) {
  const out = {}
  const caps = {}
  for (const k of CAP_KINDS) {
    const n = _int(j?.caps?.[k])
    if (_clampOk(n, _RANGE.kind)) caps[k] = n
  }
  if (Object.keys(caps).length) out.caps = caps
  for (const key of ['deepParallel', 'maxAgents', 'backlogWatermark']) {
    const n = _int(j?.[key])
    if (_clampOk(n, _RANGE[key])) out[key] = n
  }
  return out
}

// 调度器侧合并: hot 覆盖 env 基准, 缺省回落。返回 { caps, deepParallel, maxAgents, backlogWatermark }。
export function mergeCaps(hot, base) {
  return {
    caps: { verify: base.capVerify, ...(hot.caps ?? {}) },
    deepParallel: hot.deepParallel ?? base.deepParallel,
    maxAgents: hot.maxAgents ?? base.maxAgents,
    backlogWatermark: hot.backlogWatermark ?? base.backlogWm,
  }
}
