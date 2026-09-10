#!/usr/bin/env node
// scripts/lint.mjs — 跨平台语法门: 遍历 scripts/ 与 plugin/ 的 .mjs/.js 做 node --check(0909 替换 bash find 版)
// 约束: 只做语法检查; 语义 lint 见 CONTRIBUTING(计划引入 ESLint)
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCAN_DIRS = ['scripts', 'plugin']
const SKIP = new Set(['node_modules', '.git', 'artifacts', 'output', 'test'])

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (SKIP.has(ent.name)) continue
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else if (/\.(mjs|js)$/.test(ent.name) && !ent.name.endsWith('.min.js')) out.push(p)
  }
  return out
}

const files = SCAN_DIRS.flatMap((d) => {
  const p = path.join(ROOT, d)
  return fs.existsSync(p) ? walk(p) : []
})
let bad = 0
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' })
  if (r.status !== 0) {
    bad++
    console.error(`✗ ${path.relative(ROOT, f)}\n${(r.stderr || '').trim()}`)
  }
}
console.log(`lint: ${files.length} 个文件, ${bad} 个语法错误`)
process.exit(bad ? 1 : 0)
