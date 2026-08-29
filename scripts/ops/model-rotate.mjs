#!/usr/bin/env node
// model-rotate.mjs — 模型管道运维: list / set <role>=<provider/model> / unset <role> / sync
// 切换语义(用户指定): 手动 set 立即生效(下一 worker 起用); 额度到限自动降级仅切 policies 里该角色的 backup。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const REPO = process.env.D2D ?? `${os.homedir()}/d2d`
const POLICY = `${REPO}/config/model-policies.json`
const SETTINGS = `${process.env.DSH_HOME ?? `${os.homedir()}/.dsh`}/settings.yaml`
const MODELS_JSON = `${REPO}/scripts/ops/models.json`

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }
const writeJson = (p, obj) => fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n')

function list() {
  const pol = readJson(POLICY) ?? {}
  const reg = readJson(MODELS_JSON)?.models ?? []
  console.log('== 模型策略(config/model-policies.json, 可直接编辑) ==')
  console.log(`default: primary=${pol.default?.primary ?? '(dsh 默认)'} backup=${pol.default?.backup ?? '(空=不降级)'}`)
  for (const [role, r] of Object.entries(pol.roles ?? {}))
    console.log(`${String(role).padEnd(10)} primary=${r.primary ?? ''}  backup=${r.backup || '(空=暂停+通知)'}`)
  console.log('\n== 注册表(scripts/ops/models.json) ==')
  for (const m of reg) console.log(`${m.id}  vision=${m.vision ? '✓' : '✗'} ctx=${m.ctx}  ${m.notes ?? ''}`)
}

function set(roleEq) {
  const [role, model] = String(roleEq ?? '').split('=')
  if (!role || !model || !/^[^/]+\/.+/.test(model)) {
    console.error('用法: model-rotate.mjs set <role>=<provider/model>   例: set deep=opencode-go/mimo-v2.5')
    process.exit(1)
  }
  const pol = readJson(POLICY) ?? { default: { primary: '', backup: '' }, roles: {} }
  pol.roles ??= {}
  pol.roles[role] ??= { primary: '', backup: '' }
  pol.roles[role].primary = model
  writeJson(POLICY, pol)
  console.log(`已切换 ${role} primary → ${model} (下一 worker 起用; 存量 worker 不中断)`)
}

function unset(role) {
  const pol = readJson(POLICY)
  if (!pol?.roles?.[role]) return console.error(`无此角色: ${role}`)
  delete pol.roles[role]
  writeJson(POLICY, pol)
  console.log(`${role} 已回退 default 策略`)
}

// 从 ~/.dsh/settings.yaml 重新生成注册表(vision 默认 false, 由用户手工修订)
// settings.yaml 结构: llm-pi-ai: → providers:(2) → <provider>:(4) → models:(6) → - id:(6) → contextWindow:(8)
function sync() {
  const text = fs.readFileSync(SETTINGS, 'utf8')
  const reg = readJson(MODELS_JSON) ?? { models: [] }
  const known = new Map((reg.models ?? []).map((m) => [m.id, m]))
  const models = []
  let provider = ''
  let cur = null
  for (const ln of text.split(/\r?\n/)) {
    const pm = ln.match(/^ {4}([a-zA-Z0-9_-]+):\s*$/)
    if (pm) { provider = pm[1]; cur = null; continue }
    const im = ln.match(/^ {6}- id:\s*(\S+)/)
    if (im && provider) {
      const id = `${provider}/${im[1]}`
      const prev = known.get(id) ?? {}
      cur = { id, vision: prev.vision ?? false, ctx: prev.ctx ?? 0, notes: prev.notes ?? '' }
      models.push(cur)
      continue
    }
    const cm = cur && ln.match(/^ {8}contextWindow:\s*(\d+)/)
    if (cm) cur.ctx = Number(cm[1])
  }
  writeJson(MODELS_JSON, { _说明: '由 model-rotate.mjs sync 生成, vision/notes 请手工修订', models })
  console.log(`注册表已同步 ${models.length} 个模型 → ${MODELS_JSON}`)
}

const [, , cmd, arg] = process.argv
if (cmd === 'list' || !cmd) list()
else if (cmd === 'set') set(arg)
else if (cmd === 'unset') unset(arg)
else if (cmd === 'sync') sync()
else { console.error('用法: model-rotate.mjs list|set|unset|sync'); process.exit(1) }
