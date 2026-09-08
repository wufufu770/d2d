#!/usr/bin/env node
// publish-clean.mjs — 把干净导出目录推成 GitHub 仓库 main 的全新内容(整仓重构)
// 用法: node scripts/ops/publish-clean.mjs <导出目录> <目标分支,默认 main>
// 语义: 以目标分支当前 tip 为 parent(快进, 不强推不毁历史), tree = 导出目录全量内容。
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const EXPORT = process.argv[2]
const BRANCH = process.argv[3] ?? 'main'
if (!EXPORT || !fs.existsSync(EXPORT)) { console.error('用法: publish-clean.mjs <导出目录> [分支]'); process.exit(1) }
const REPO = 'wufufu770/d2d'
const gh = (args, input) => execFileSync('gh', ['api', ...args], { input, encoding: 'utf8', maxBuffer: 1e9 })

const tip = gh([`repos/${REPO}/branches/${BRANCH}`, '--jq', '.commit.sha']).trim()
console.log('当前', BRANCH, 'tip:', tip)

// PUBLISH_SKIP: 发布垃圾不入树(发布说明读自仓库外, 不随树上传)
const SKIP_FILES = new Set(['.release-message'])
function walk(dir, base = '') {
  const entries = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, ent.name)
    const rel = base ? `${base}/${ent.name}` : ent.name
    if (ent.isDirectory()) entries.push(...walk(p, rel))
    else if (!SKIP_FILES.has(rel)) entries.push({ path: rel, file: p })
  }
  return entries
}
const files = walk(EXPORT)
console.log('待发布文件:', files.length)

// 逐文件上传 blob(内容→SHA), 网络抖动重试 3 次
const ghRetry = (args, input, label) => {
  for (let a = 1; a <= 3; a++) {
    try { return execFileSync('gh', ['api', ...args], { input, encoding: 'utf8', maxBuffer: 1e9 }) }
    catch (e) {
      if (a === 3) { console.error(`\n✗ ${label}: ${String(e.message).slice(0, 200)}`); process.exit(1) }
      execFileSync('sleep', ['3'])
    }
  }
}
// 逐文件上传 blob → 收集 {path, sha}; 然后一次性创建完整树(不带 base_tree = 彻底替换 main 内容)
const entries = []
for (const f of files) {
  const body = JSON.stringify({ content: fs.readFileSync(f.file, 'utf8'), encoding: 'utf-8' })
  const b = JSON.parse(ghRetry(['repos/' + REPO + '/git/blobs', '--input', '-'], body, f.path))
  entries.push({ path: f.path, mode: '100644', type: 'blob', sha: b.sha })
  process.stdout.write(`.`)
}
console.log('')
const tree = JSON.parse(gh(['repos/' + REPO + '/git/trees', '--input', '-'], JSON.stringify({ tree: entries }))).sha
console.log('tree:', tree)
const message = fs.readFileSync(path.join(EXPORT, '.release-message'), 'utf8').trim()
const commit = JSON.parse(gh(['repos/' + REPO + '/git/commits', '-F', `message=${message}`, '-F', `tree=${tree}`, '-F', `parents[]=${tip}`], '')).sha
console.log('commit:', commit)
console.log(gh([`repos/${REPO}/git/refs/heads/${BRANCH}`, '-X', 'PATCH', '-F', `sha=${commit}`, '-F', 'force=false', '--jq', '.object.sha']))
