#!/usr/bin/env node
// cleanup-main.mjs — 从 main 树删除发布垃圾路径(.pytest_cache/.release-message 等 blob 文件)
import { execFileSync } from 'node:child_process'
const REPO = 'wufufu770/d2d'
const BRANCH = 'main'
const ghApi = (args, input) => execFileSync('gh', ['api', ...args], { input, encoding: 'utf8', maxBuffer: 1e9 })

const tip = ghApi([`repos/${REPO}/branches/${BRANCH}`, '--jq', '.commit.sha']).trim()
console.log('tip:', tip)
const baseTree = ghApi([`repos/${REPO}/git/commits/${tip}`, '--jq', '.tree.sha']).trim()
console.log('base tree:', baseTree)

// 只删除 blob 文件路径(目录项随文件消失)
const junkFiles = [
  '.pytest_cache/.gitignore',
  '.pytest_cache/CACHEDIR.TAG',
  '.pytest_cache/README.md',
  '.pytest_cache/v/cache/lastfailed',
  '.pytest_cache/v/cache/nodeids',
  '.release-message',
]
const payload = JSON.stringify({
  base_tree: baseTree,
  tree: junkFiles.map((p) => ({ path: p, mode: '100644', type: 'blob', sha: null })),
})
const tree = JSON.parse(ghApi([`repos/${REPO}/git/trees`, '--input', '-'], payload)).sha
console.log('new tree:', tree)
const commit = JSON.parse(ghApi([`repos/${REPO}/git/commits`, '-F', 'message=chore: 删除 .pytest_cache 与 .release-message 发布垃圾', '-F', `tree=${tree}`, '-F', `parents[]=${tip}`], '')).sha
console.log(ghApi([`repos/${REPO}/git/refs/heads/${BRANCH}`, '-X', 'PATCH', '-F', `sha=${commit}`, '-F', 'force=false', '--jq', '.object.sha']))
