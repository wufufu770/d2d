#!/usr/bin/env node
// push-workflows.mjs — PAT 获得 Workflows:write 后补推 ci/publish 两个 workflow 文件
// 前置: GitHub Settings → Developer settings → Fine-grained tokens → 编辑当前 token →
//       Repository permissions → Workflows: Read and write(或改用 classic token + workflow scope)
// 用法: node scripts/ops/push-workflows.mjs
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const REPO = 'wufufu770/d2d'
const BRANCH = 'main'
const FILES = ['.github/workflows/ci.yml', '.github/workflows/publish.yml']
const gh = (args, input) => execFileSync('gh', ['api', ...args], { input, encoding: 'utf8', maxBuffer: 1e9 })

const tip = gh([`repos/${REPO}/branches/${BRANCH}`, '--jq', '.commit.sha']).trim()
console.log('当前', BRANCH, 'tip:', tip)

const treeArgs = []
for (const rel of FILES) {
  const local = path.join(process.cwd(), rel)
  const body = JSON.stringify({ content: fs.readFileSync(local, 'utf8'), encoding: 'utf-8' })
  const b = JSON.parse(gh(['repos/' + REPO + '/git/blobs', '--input', '-'], body))
  treeArgs.push('-f', `tree[][path]=${rel}`, '-f', 'tree[][mode]=100644', '-f', 'tree[][type]=blob', '-f', `tree[][sha]=${b.sha}`)
}
const tree = JSON.parse(gh(['repos/' + REPO + '/git/trees', '-F', `base_tree=${tip}^{tree}`, ...treeArgs], '')).sha
const commit = JSON.parse(gh(['repos/' + REPO + '/git/commits', '-F', 'message=ci: 补推 workflows(ci/publish) — Workflows 权限到位', '-F', `tree=${tree}`, '-F', `parents[]=${tip}`], '')).sha
console.log(gh([`repos/${REPO}/git/refs/heads/${BRANCH}`, '-X', 'PATCH', '-F', `sha=${commit}`, '-F', 'force=false', '--jq', '.object.sha']))
