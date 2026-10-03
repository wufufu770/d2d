#!/usr/bin/env node
// plugin/d2d-mods/scripts/sync-core.mjs — D3「内核单一真源」
//
// 原则：禁区（plugin/pentest-dsh/domain、roles、tools）**原样不动**；
//       本脚本把它们「镜像 / 派生」进 plugin/d2d-mods/src/，并写哈希清单。
//       mod 只读镜像，绝不反向改写禁区。
//
// 产物：
//   src/domain/*.mjs            纯净（无 node: 传染）域模块的逐字镜像
//   src/config/*.mjs            上述模块引用的、同样纯净的 config 依赖
//   src/roles.generated.js      24 个角色 JSON → 纯数据模块
//   src/tools.generated.js      8 个工具定义 → 元数据（name/description/inputSchema）
//   src/CORE_MANIFEST.json      各产物哈希 + 被排除的传染模块清单（供 CI 校验漂移）
//
// 用法：node scripts/sync-core.mjs           生成
//       node scripts/sync-core.mjs --check   只校验（CI；漂移即非零退出）

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')                 // plugin/d2d-mods
const REPO = path.resolve(ROOT, '..', '..')           // repo root
const DSH = path.join(REPO, 'plugin', 'pentest-dsh')
const SRC = path.join(ROOT, 'src')
const DOMAIN = path.join(DSH, 'domain')

const CHECK = process.argv.includes('--check')
const log = (...a) => console.log('[sync-core]', ...a)
const read = (p) => fs.readFileSync(p, 'utf8')
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')

// ── node: 传染闭包 ─────────────────────────────────────────────
// 直接 import node: 的模块，以及（传递地）import 了它们的模块，都不镜像 ——
// 它们在 mod 运行时（无 node: 面）无法加载，走 $.process.$ 桥（M3）。
const hasNodeImport = (file) => {
  const s = read(file)
  return /import[^\n]*from\s*['"]node:/.test(s) || /require\(\s*['"]node:/.test(s)
}
const directImports = (file) => {
  const out = []
  for (const m of read(file).matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const dep = path.resolve(path.dirname(file), m[1])
    if (fs.existsSync(dep)) out.push(dep)
  }
  return out
}
const _memo = new Map()
function tainted(file) {
  if (_memo.has(file)) return _memo.get(file)
  _memo.set(file, false) // 环保护：先置否，回溯到自身不误判
  let t = hasNodeImport(file)
  if (!t) for (const dep of directImports(file)) { if (tainted(dep)) { t = true; break } }
  _memo.set(file, t)
  return t
}

// ── 1) 收集待镜像的纯净模块（domain + 其引用的 DSH 内依赖）──────
function collectMirrors() {
  const mirrors = new Map()   // 绝对路径 → src 下相对路径
  const excluded = []
  const visit = (file) => {
    if (mirrors.has(file)) return
    if (tainted(file)) { excluded.push(path.relative(DSH, file)); return }
    const rel = path.relative(DSH, file)          // 例：domain/scope.mjs
    mirrors.set(file, rel)
    for (const dep of directImports(file)) visit(dep)
  }
  for (const f of fs.readdirSync(DOMAIN).filter((x) => x.endsWith('.mjs')).sort()) {
    visit(path.join(DOMAIN, f))
  }
  return { mirrors, excluded: excluded.sort() }
}

// ── 2) 角色 JSON → 纯数据模块 ───────────────────────────────────
function generateRoles() {
  const dir = path.join(DSH, 'roles')
  const roles = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(read(path.join(dir, f))))
  const body = roles.map((r) => '  ' + JSON.stringify(r)).join(',\n')
  return `// 由 scripts/sync-core.mjs 生成 —— 请勿手改（改 roles/*.json 后重跑）
// 源：plugin/pentest-dsh/roles/*.json（禁区，只读）
export const ROLES = [
${body},
]
`
}

// ── 3) d2d 工具定义 → 元数据（JSON Schema）──────────────────────
// 在 Node 侧调用禁区里的注册器，捕获 def，只取元数据；执行体属 M3 接线，不入镜像。
async function generateTools() {
  const { registerBurpTools } = await import(path.join(DSH, 'tools', 'index.mjs'))
  const { registerJsScanner } = await import(path.join(DSH, 'tools', 'js-scanner.mjs'))
  const { registerFrontierTools } = await import(path.join(DSH, 'tools', 'frontier.mjs'))

  const captured = []
  const tools = { register: (def) => captured.push(def) }
  const defineTool = (def) => def
  registerBurpTools(tools, defineTool, {})
  registerJsScanner(tools, defineTool, {})
  registerFrontierTools(tools, defineTool, {})

  const paramsToSchema = (params = {}) => {
    const properties = {}
    const required = []
    for (const [k, v] of Object.entries(params)) {
      const p = { type: v.type || 'string' }
      if (v.description) p.description = String(v.description)
      if (v.items) p.items = v.items
      properties[k] = p
      if (v.required) required.push(k)
    }
    return { type: 'object', properties, required }
  }
  const meta = captured.map((d) => ({
    name: String(d.name),
    description: String(d.description ?? ''),
    inputSchema: paramsToSchema(d.parameters),
  }))
  const body = meta.map((m) => '  ' + JSON.stringify(m)).join(',\n')
  return `// 由 scripts/sync-core.mjs 生成 —— 请勿手改（改 tools/*.mjs 后重跑）
// 源：plugin/pentest-dsh/tools/*.mjs（禁区，只读）；仅元数据，执行体在 M3 接线。
export const TOOLS = [
${body},
]
`
}

// ── 主流程 ─────────────────────────────────────────────────────
async function main() {
  const { mirrors, excluded } = collectMirrors()
  const files = new Map()          // src 相对路径 → 内容
  for (const [abs, rel] of mirrors) files.set(rel, read(abs))
  files.set('roles.generated.js', generateRoles())
  files.set('tools.generated.js', await generateTools())

  const manifest = {
    generatedBy: 'plugin/d2d-mods/scripts/sync-core.mjs',
    sources: ['plugin/pentest-dsh/domain', 'plugin/pentest-dsh/roles/*.json', 'plugin/pentest-dsh/tools'],
    mirrored: [...files.keys()].sort().map((rel) => ({ path: rel, sha256: sha(files.get(rel)) })),
    excludedTainted: excluded,   // node: 传染，走 $.process 桥（M3），非缺陷
  }
  files.set('CORE_MANIFEST.json', JSON.stringify(manifest, null, 2) + '\n')

  if (CHECK) {
    let drift = 0
    for (const [rel, content] of files) {
      const abs = path.join(SRC, rel)
      if (!fs.existsSync(abs)) { log('缺失:', rel); drift++; continue }
      if (read(abs) !== content) { log('漂移:', rel); drift++ }
    }
    if (drift) { log(`校验失败：${drift} 处漂移`); process.exit(1) }
    log(`校验通过：${files.size} 个产物与禁区一致`)
    return
  }

  for (const [rel, content] of files) {
    const abs = path.join(SRC, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  log(`已生成 ${files.size} 个产物；排除 ${excluded.length} 个 node: 传染模块（M3 走 $.process）`)
  for (const e of excluded) log('  · 排除', e)
}

main().catch((e) => { console.error('[sync-core] 失败:', e); process.exit(1) })
