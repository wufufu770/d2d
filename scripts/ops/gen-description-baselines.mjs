#!/usr/bin/env node
// gen-description-baselines.mjs — T3-2-3 description 基线生成(description-audit.mjs 文件头口径的实现)
// 口径: 传**恒等 defineTool**(记录 def 原样返回)运行时捕获 registerBurpTools/registerJsScanner/
//   registerFrontierTools/registerBrowserAttackTools 注册的全部工具 def → 工具级/参数级 sha256
//   → 合并进 config/description-baselines.json(保留既有 p2p_* 条目 — 内联 auditedDefineTool
//   注册的宿主管理工具不经 registerXxx 形态, 既有哈希照抄)。**严禁手改哈希**; 工具 description
//   变更后重跑本脚本 regen(与源值漂移即失钉扎意义)。p2p_js_scan 收编(开放项 8)由此覆盖。
// 用法: node scripts/ops/gen-description-baselines.mjs [--check]  (--check 仅比对不落盘, CI/验收用)
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const BASELINES = path.join(REPO, 'plugin/pentest-dsh/config/description-baselines.json')
const sha = (s) => createHash('sha256').update(String(s ?? ''), 'utf8').digest('hex')

// 恒等 defineTool: 记录 def(工具级+参数级 description)并原样返回 — 注册面照常 register。
const captured = []
const identityDefineTool = (def) => { captured.push(def); return def }
const fakeTools = { register: () => {} } // 恒等面: register 侧无副作用

import { pathToFileURL } from 'node:url'
const __isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

const registerPaths = [
  ['tools/index.mjs', 'registerBurpTools'],
  ['tools/js-scanner.mjs', 'registerJsScanner'],
  ['tools/frontier.mjs', 'registerFrontierTools'],
  ['scheduler/browser-attack-tools.mjs', 'registerBrowserAttackTools'],
]
for (const [rel, fnName] of registerPaths) {
  const mod = await import(path.join(REPO, 'plugin/pentest-dsh', rel))
  if (typeof mod[fnName] !== 'function') { console.error(`⚠ ${rel} 无 ${fnName}, 跳过`); continue }
  mod[fnName](fakeTools, identityDefineTool, {
    graphdUrl: 'http://127.0.0.1:8766',
    resolveEng: async () => null,
    runLog: () => {},
    log: () => {},
  })
}

// 捕获 → 基线条目(工具级 + 参数级)
const fresh = new Map()
for (const def of captured) {
  if (!def?.name) continue
  fresh.set(def.name, sha(def.description))
  for (const [p, spec] of Object.entries(def.parameters ?? {})) {
    if (spec?.description !== undefined) fresh.set(`${def.name}.${p}`, sha(spec.description))
  }
}
console.error(`捕获 ${captured.length} 个工具 def → ${fresh.size} 条基线键`)

// 合并: 既有条目保留(p2p_* 内联注册族), 新族条目覆盖
const cur = JSON.parse(fs.readFileSync(BASELINES, 'utf8'))
const existing = new Map(cur.baselines.map((b) => [b.tool, b.sha256]))
let added = 0, updated = 0
for (const [k, h] of fresh) {
  if (!existing.has(k)) { existing.set(k, h); added++ }
  else if (existing.get(k) !== h) { existing.set(k, h); updated++ }
}
const out = { version: cur.version ?? 'v1', baselines: [...existing.entries()].map(([tool, sha256]) => ({ tool, sha256 })).sort((a, b) => a.tool.localeCompare(b.tool)) }

if (!__isMain) {
  // 被 import(如测试复用捕获逻辑) → 只暴露函数, 主流程不执行
} else if (process.argv.includes('--check')) {
  const curMap = new Map(cur.baselines.map((b) => [b.tool, b.sha256]))
  const drift = [...fresh.entries()].filter(([k, h]) => curMap.get(k) !== h)
  console.log(drift.length ? `❌ 基线漂移 ${drift.length} 条: ${drift.slice(0, 5).map(([k]) => k).join(', ')}` : '✅ 基线一致(四族捕获全匹配)')
  process.exit(drift.length ? 1 : 0)
}
fs.writeFileSync(BASELINES, JSON.stringify(out, null, 1) + '\n')
console.log(`✅ 基线已 regen: 共 ${out.baselines.length} 条(新增 ${added}, 更新 ${updated}, 保留既有 ${out.baselines.length - added - updated})`)
