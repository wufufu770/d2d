#!/usr/bin/env node
// retrieve-token.mjs — 对已授权(或即将授权)的设备码做长时重试取回令牌, 成功后立即补推 workflows
// 用法: node scripts/ops/retrieve-token.mjs <device_code> [最长等待秒, 默认600]
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
const CLIENT_ID = '178c6fc778ccc68e1d6a'
const REPO = 'wufufu770/d2d'
const BRANCH = 'main'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const deviceCode = process.argv[2]
const maxWaitMs = (parseInt(process.argv[3] ?? '600', 10) || 600) * 1000
if (!deviceCode) { console.error('用法: retrieve-token.mjs <device_code>'); process.exit(1) }

async function postOnce(params) {
  const r = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(15000),
  })
  return r.json()
}

const start = Date.now()
let token = null
let attempt = 0
while (Date.now() - start < maxWaitMs) {
  attempt++
  try {
    const r = await postOnce({
      client_id: CLIENT_ID, device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    })
    if (r.access_token) { token = r.access_token; console.log(`\n[尝试 ${attempt}] ✓ 令牌到手`); break }
    if (r.error === 'authorization_pending') { process.stdout.write('.'); }
    else if (r.error === 'slow_down') { await sleep(4000); process.stdout.write('s') }
    else if (r.error === 'expired_token') { console.log('\n设备码已过期 — 需重新发起授权'); process.exit(2) }
    else if (r.error) { console.log(`\n${r.error}: ${r.error_description ?? ''}`); }
  } catch (e) {
    process.stdout.write('x') // 网络抖动, 继续重试
  }
  await sleep(4000)
}
if (!token) { console.error('\n等待超时'); process.exit(3) }

// 立即补推 ci/publish
process.env.GH_TOKEN = token
const tip = execFileSync('gh', ['api', `repos/${REPO}/branches/${BRANCH}`, '--jq', '.commit.sha'], { encoding: 'utf8' }).trim()
console.log('\nmain tip:', tip)
const treeArgs = []
for (const rel of ['.github/workflows/ci.yml', '.github/workflows/publish.yml']) {
  const body = JSON.stringify({ content: fs.readFileSync(path.join(process.cwd(), rel), 'utf8'), encoding: 'utf-8' })
  const b = JSON.parse(execFileSync('gh', ['api', `repos/${REPO}/git/blobs`, '--input', '-'], { input: body, encoding: 'utf8' }))
  treeArgs.push('-f', `tree[][path]=${rel}`, '-f', 'tree[][mode]=100644', '-f', 'tree[][type]=blob', '-f', `tree[][sha]=${b.sha}`)
}
const tree = JSON.parse(execFileSync('gh', ['api', `repos/${REPO}/git/trees`, '-F', `base_tree=${tip}^{tree}`, ...treeArgs], { encoding: 'utf8' })).sha
const commit = JSON.parse(execFileSync('gh', ['api', `repos/${REPO}/git/commits`, '-F', 'message=ci: 补推 workflows(ci/publish)', '-F', `tree=${tree}`, '-F', `parents[]=${tip}`], { encoding: 'utf8' })).sha
console.log(execFileSync('gh', ['api', `repos/${REPO}/git/refs/heads/${BRANCH}`, '-X', 'PATCH', '-F', `sha=${commit}`, '-F', 'force=false', '--jq', '.object.sha'], { encoding: 'utf8' }))
console.log('✓ 仓库重构 100% 完成')
