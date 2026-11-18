// snapshot/caps.mjs — W4 容量热调(拆分自 snapshot.mjs: 326-390, 逻辑零改动)
import fs from 'node:fs'
import os from 'node:os'

/** W4: 容量热调(caps.json) — 面板容量卡片的读写源; 调度器每 tick 热读同一文件, 免重启生效。 */
export function readCaps(env = process.env) {
  try {
    const p = env.P2P_CAPS_FILE ?? `${env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/config/caps.json`
    const d = JSON.parse(fs.readFileSync(p, 'utf8'))
    return {
      caps: (d.caps && typeof d.caps === 'object') ? d.caps : {},
      deepParallel: d.deepParallel ?? null,
      maxAgents: d.maxAgents ?? null,
      backlogWatermark: d.backlogWatermark ?? null,
      // 0916: engagement 三门收敛节原样透传(读侧白名单解析在 domain/allocator.mjs parseRingTuning)
      engConverge: (d.engConverge && typeof d.engConverge === 'object' && !Array.isArray(d.engConverge)) ? d.engConverge : null,
      updated_at: String(d.updated_at ?? ''),
    }
  } catch { return { caps: {}, deepParallel: null, maxAgents: null, backlogWatermark: null, engConverge: null, updated_at: '' } }
}

const _CAP_KINDS = ['recon', 'deep-dive', 'chain', 'verify', 'creative', 'link']
const _CAP_RANGE = { kind: [1, 8], deepParallel: [1, 8], maxAgents: [1, 8], backlogWatermark: [5, 500] }
// 0916: engConverge 键表与 domain/allocator.mjs _ENG_CONVERGE_RANGE 同源(白名单+钳位)
const _ENG_CONVERGE_RANGE = {
  findingStableRounds: [1, 20], minVerified: [0, 1000], maxOpenFrontier: [0, 1000], noveltyFloor: [0, 1000],
  staleSignalTtlMin: [5, 240], softDeadlineMin: [10, 720], hardDeadlineMin: [15, 1440],
}
const _capInt = (v, [lo, hi]) => {
  const n = Number.parseInt(v, 10)
  if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`须为 ${lo}-${hi} 的整数, 得到 "${v}"`)
  return n
}

/** W4: 容量卡片写侧 — updates = { caps?:{kind:n}, deepParallel?, maxAgents?, backlogWatermark?, engConverge? };
 *  值 '' / null = 清除该覆盖(调度器回落 env); 钳位与 domain/caps.mjs 读侧一致, 越界直接报错。 */
export function writeCaps({ updates }, env = process.env) {
  const p = env.P2P_CAPS_FILE ?? `${env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/config/caps.json`
  const cur = readCaps(env)
  const next = { caps: { ...cur.caps }, deepParallel: cur.deepParallel, maxAgents: cur.maxAgents, backlogWatermark: cur.backlogWatermark }
  if (cur.engConverge) next.engConverge = { ...cur.engConverge }   // 非本次写入的节原样保留(原实现会整节点丢失)
  const u = updates && typeof updates === 'object' ? updates : {}
  if (u.caps !== undefined && typeof u.caps !== 'object') throw new Error('caps 必须是对象')
  if (u.engConverge !== undefined && (typeof u.engConverge !== 'object' || u.engConverge === null || Array.isArray(u.engConverge))) throw new Error('engConverge 必须是对象')
  for (const [k, v] of Object.entries(u.caps ?? {})) {
    if (!_CAP_KINDS.includes(k)) throw new Error(`未知环节 "${k}"(可选: ${_CAP_KINDS.join('/')})`)
    if (v === '' || v === null) delete next.caps[k]
    else next.caps[k] = _capInt(v, _CAP_RANGE.kind)
  }
  for (const [k, v] of Object.entries(u.engConverge ?? {})) {
    const range = _ENG_CONVERGE_RANGE[k]
    if (!range) throw new Error(`未知 engConverge 键 "${k}"(可选: ${Object.keys(_ENG_CONVERGE_RANGE).join('/')})`)
    if (!next.engConverge) next.engConverge = {}
    if (v === '' || v === null) delete next.engConverge[k]
    else next.engConverge[k] = _capInt(v, range)
  }
  if (next.engConverge && !Object.keys(next.engConverge).length) delete next.engConverge
  for (const key of ['deepParallel', 'maxAgents', 'backlogWatermark']) {
    if (u[key] === undefined) continue
    next[key] = (u[key] === '' || u[key] === null) ? null : _capInt(u[key], _CAP_RANGE[key])
  }
  if (!Object.keys(next.caps).length) delete next.caps
  next.updated_at = new Date().toISOString()
  fs.mkdirSync(`${env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/config`, { recursive: true })
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n')
  fs.renameSync(tmp, p)
  return readCaps(env)
}
