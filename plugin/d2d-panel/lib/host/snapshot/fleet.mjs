// snapshot/fleet.mjs — 模型策略/dsh 目录/策略库(拆分自 snapshot.mjs: 392-593, 逻辑零改动)
import fs from 'node:fs'
import os from 'node:os'

/** 模型策略(A-2 外置): DATA_DIR/config/model-policies.json, 缺失/损坏时 policies 面空但仍
 *  返回 fleet(catalog 与 policies 文件无关——B11 批修复: 原 try 连带吞掉 catalog 导致
 *  fleet 卡整卡降级, dsh 侧已配厂商/模型在面板不可见)。*/
export function readFleet(env = process.env) {
  const dir = env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
  let p = null
  try {
    p = JSON.parse(fs.readFileSync(`${dir}/config/model-policies.json`, 'utf8'))
  } catch { /* 已记因: 模板未落(model-policies.json 缺失)/JSON 损坏 → policies 面空, catalog 照常加载 */ }
  const roles = {}
  for (const [k, v] of Object.entries(p?.roles ?? {})) {
    // 中危审计修复(0910): roles 键并入对象前过滤危险键(手改文件可带 __proto__/constructor)
    if (/^(?:__proto__|constructor|prototype)$/i.test(String(k))) continue
    roles[k] = { primary: String(v?.primary ?? ''), backup: String(v?.backup ?? '') }
  }
  const fleet = { default: { primary: String(p?.default?.primary ?? ''), backup: String(p?.default?.backup ?? '') }, roles, models: [], catalog: [] }
  // 候选模型并集: 已被引用过的模型 + dsh 已注册供应商/模型(issue: 换槽选择器此前只有已用模型, 其余全靠手填)
  const seen = new Set()
  for (const m of [fleet.default.primary, fleet.default.backup, ...Object.values(roles).flatMap((r) => [r.primary, r.backup])]) {
    if (m && !seen.has(m)) { seen.add(m); fleet.models.push(m) }
  }
  let catalog = []
  try { catalog = loadDshCatalog(env) } catch { /* 已记因: 降级路径——dsh 目录枚举失败时 catalog 置空，fleet 卡降级 */ }
  fleet.catalog = catalog
  for (const { provider, models } of catalog) {
    for (const id of models) {
      const m = `${provider}/${id}`
      if (m && !seen.has(m)) { seen.add(m); fleet.models.push(m) }
    }
  }
  return fleet
}

/** issue: Fleet 换槽候选只有已用模型 — 从 dsh 配置枚举已注册供应商/模型(零依赖缩进解析)。
 * 兼容两种缩进形态: ~/.dsh/settings.yaml(providers@2) 与 profiles/<profile>/cordis.patch.yml(providers@4)。
 * provider 行 = providers: 块内下一级的 `name:`; 模型 = 块内 `- id: <id>` 列表项; 缩出块即结束。*/
export function parseProviderModels(text) {
  const out = []
  const lines = String(text ?? '').split(/\r?\n/)
  let block = -1
  let prov = null
  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    const indent = raw.length - raw.replace(/^\s+/, '').length
    const body = raw.trim()
    if (prov !== null && (indent <= block || (indent === block + 2 && /^[A-Za-z0-9_-]+:\s*$/.test(body)))) {
      out.push(prov); prov = null // 出块 / 同级下一个 provider
    }
    if (prov === null && /^providers:\s*$/.test(body)) { block = indent; continue }
    if (prov === null && block >= 0 && indent === block + 2) {
      const m = body.match(/^([A-Za-z0-9_-]+):\s*$/)
      if (m) { prov = { provider: m[1], models: [] }; continue }
    }
    if (prov !== null) {
      const idm = body.match(/^-\s*id:\s*(.+?)\s*$/)
      if (idm) {
        const id = idm[1].replace(/^["']|["']$/g, '')
        if (id) prov.models.push(id)
      }
      const kem = body.match(/^apiKeyEnv:\s*(.+?)\s*$/)
      if (kem) prov.apiKeyEnv = kem[1].replace(/^["']|["']$/g, '')
    }
  }
  if (prov !== null) out.push(prov)
  return out
}

/** 凭据状态: dsh credentials 文件 refs 段的环境变量名集合(只取名字, 值不读不外传) + 进程环境兜底。*/
export function credentialEnvNames(env = process.env) {
  const home = env.DSH_HOME ?? `${os.homedir()}/.dsh`
  const names = new Set()
  try {
    let inRefs = false
    for (const raw of fs.readFileSync(`${home}/.credentials.yaml`, 'utf8').split(/\r?\n/)) {
      if (!raw.trim() || raw.trim().startsWith('#')) continue
      const indent = raw.length - raw.replace(/^\s+/, '').length
      const body = raw.trim()
      if (indent === 0) { inRefs = /^refs:\s*$/.test(body); continue }
      if (inRefs) {
        const m = body.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
        if (m) names.add(m[1])
      }
    }
  } catch { /* 已记因: 降级路径——凭据文件缺失/不可读时跳过 refs 收集，仅用进程环境兜底 */ }
  for (const k of Object.keys(env)) if (/API_KEY/.test(k)) names.add(k)
  return names
}

/** 凭据 refs 合并(纯函数供 pytest/node test) — dsh 管理的 {version, refs:{ENV: key}} 平文本形态:
 * 已有 refs: 段 → 在段尾插入新条目; 无 → 文件尾新建 refs: 段。env 名白名单校验。
 * 中危审计修复(0910): value 旧版原样插入 — 含 `: `/换行/` #` 时可注入任意 YAML 键(注入面)。
 * 现统一双引号包裹 + YAML 双引号转义(`\ " \r \n \t`), 值永远解析为单个标量字符串。*/
export function mergeCredentialRefs(text, envName, value) {
  if (!/^[A-Za-z0-9_]+$/.test(String(envName || ''))) throw new Error('invalid credential env name')
  const yq = String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
  const lines = String(text ?? '').split(/\r?\n/)
  let refsStart = -1, refsEnd = -1
  lines.forEach((l, i) => {
    if (i === 0) return
    const m = l.match(/^(\s*)([A-Za-z0-9_.-]+):\s*(.*)$/)
    if (!m) return
    if (m[1] === '' && m[2] === 'refs') refsStart = i
    else if (refsStart >= 0 && m[1].startsWith('  ')) refsEnd = i
  })
  const entry = `  ${envName}: "${yq}"`
  if (refsStart >= 0) lines.splice((refsEnd >= refsStart ? refsEnd : refsStart) + 1, 0, entry)
  else lines.push('refs:', entry)
  return lines.join('\n')
}

/** 汇总 dsh 配置里的供应商/模型(settings.yaml + profiles/<profile>/cordis.patch.yml), 按供应商排序去重。*/
export function loadDshCatalog(env = process.env) {
  const home = env.DSH_HOME ?? `${os.homedir()}/.dsh`
  const files = [`${home}/settings.yaml`]
  try {
    for (const e of fs.readdirSync(`${home}/profiles`)) {
      const p = `${home}/profiles/${e}/cordis.patch.yml`
      if (fs.existsSync(p)) files.push(p)
    }
  } catch { /* 已记因: 降级路径——profiles 目录缺失/不可读时仅读 settings.yaml */ }
  const refs = credentialEnvNames(env)
  const byProv = new Map() // provider → {models:Set, apiKeyEnv}
  for (const f of files) {
    try {
      for (const { provider, models, apiKeyEnv } of parseProviderModels(fs.readFileSync(f, 'utf8'))) {
        const cur = byProv.get(provider) ?? { models: new Set(), apiKeyEnv: '' }
        for (const m of models) cur.models.add(m)
        if (apiKeyEnv) cur.apiKeyEnv = apiKeyEnv
        byProv.set(provider, cur)
      }
    } catch { /* 已记因: 解析容错——单个配置文件缺失/损坏时跳过，继续枚举其余文件 */ }
  }
  return [...byProv.entries()]
    .map(([provider, cur]) => ({ provider, models: [...cur.models].sort(), apiKeyEnv: cur.apiKeyEnv || '',
      hasKey: cur.apiKeyEnv ? (refs.has(cur.apiKeyEnv) || Boolean(env[cur.apiKeyEnv])) : false }))
    .sort((a, b) => a.provider.localeCompare(b.provider))
}

/** 策略库(#89 吸纳竞品策略库浏览面): 知识卡全量(现役+影子) + verify 命中战果(wins/hits)。
 * source: current=confirmed(现役, 过三门禁) / shadow=default(影子待实战)。数据源=本地 brain 文件 + 图内战果。*/
export async function loadStrategies(env = process.env, query) {
  const dir = env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
  const out = []
  const seen = new Set()
  const pools = [
    ['confirmed', `${dir}/brain/current/techniques.json`],
    ['default', `${dir}/brain/shadow/techniques.json`],
  ]
  for (const [source, p] of pools) {
    try {
      for (const c of JSON.parse(fs.readFileSync(p, 'utf8')).cards ?? []) {
        if (seen.has(c.id)) continue
        seen.add(c.id)
        out.push({ id: c.id, title: c.title, category: c.category || 'general',
          applies_to: c.applies_to ?? [], source: source === 'current' ? 'confirmed' : source })
      }
    } catch (e) { console.error('[d2d-panel] loadStrategies pool:', source, e.message) }
  }
  let winsMap = {}
  try {
    const rows = await query(`MATCH (e:ExperienceWeight) WHERE e.id STARTS WITH 'card:' RETURN e.id AS id, e.wins AS w, e.hits AS h`)
    for (const r of rows ?? []) winsMap[String(r.id)] = { wins: Number(r.w) || 0, hits: Number(r.h) || 0 }
  } catch { /* 已记因: 降级路径——战果图查询失败时 wins/hits 置零，策略卡照常返回 */ }
  for (const s of out) s.stats = winsMap[s.id] ?? { wins: 0, hits: 0 }
  return out
}

const MODEL_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

/** 面板侧模型切换: 只改写 role 的 primary/backup 槽(默认槽与角色集合不动, 与 scheduler 口径一致)。
 *  原子写(tmp+rename); 空 model = 清除 backup(回到「无备·暂停」)。返回新 fleet。 */
export function writeFleet({ role, slot, model }, env = process.env) {
  const role_ = String(role ?? '').trim()
  const slot_ = String(slot ?? '') === 'backup' ? 'backup' : 'primary'
  const model_ = String(model ?? '').trim()
  if (!role_) throw new Error('role required')
  // 中危审计修复(0910): 原型污染 — role 直接作 p.roles 的键, `__proto__` 会把 {primary,backup}
  // 写进 Object.prototype(污染宿主进程全局), `constructor` 会命中函数对象。键限安全字符集 +
  // 显式黑名单(role 词形=模型角色 id: default/discovery/deep/creative/verify/study 等)。
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(role_) || /^(?:__proto__|constructor|prototype)$/i.test(role_)) {
    throw new Error(`bad role id "${role_.slice(0, 40)}"`)
  }
  if (model_ && !MODEL_RE.test(model_)) throw new Error(`bad model id "${model_}" (expect provider/model)`)
  const dir = env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
  const file = `${dir}/config/model-policies.json`
  let p = {}
  try { p = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { throw new Error(`model-policies.json unreadable: ${e?.message ?? e}`) }
  if (!p.roles || typeof p.roles !== 'object') p.roles = {}
  const cur = p.roles[role_] ?? { primary: '', backup: '' }
  cur[slot_] = model_
  p.roles[role_] = { primary: String(cur.primary ?? ''), backup: String(cur.backup ?? '') }
  fs.mkdirSync(`${dir}/config`, { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, JSON.stringify(p, null, 2))
  fs.renameSync(tmp, file)
  return readFleet(env)
}
