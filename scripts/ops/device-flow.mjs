#!/usr/bin/env node
// device-flow.mjs — github.com 网络抖动环境下带重试的 OAuth 设备码流程 + 补推 workflows
// 用途: 为 gh CLI 换取带 workflow scope 的令牌(仅内存保存, 不落盘), 立即补推 ci/publish。
// 0905 实证: github.com:443 间歇性 connection reset, 官方 gh auth refresh 的单次轮询会被打断。
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
// gh CLI 的公共 OAuth client_id(开源项目内嵌值, 非机密)
const CLIENT_ID = '178c6fc778ccc68e1d6a'
const REPO = 'wufufu770/d2d'
const BRANCH = 'main'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function post(url, params) {
  for (let a = 1; a <= 20; a++) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(20000),
      })
      const j = await r.json()
      if (j.error) return { error: j.error, error_description: j.error_description }
      return j
    } catch (e) {
      console.log(`[网络重试 ${a}/20] ${e.message.slice(0, 60)}`)
      await sleep(4000)
    }
  }
  return { error: 'network_exhausted' }
}

// 1. 申请设备码
let code
for (let a = 1; a <= 6; a++) {
  code = await post('https://github.com/login/device/code', {
    client_id: CLIENT_ID, scope: 'repo workflow gist read:org',
  })
  if (!code.error) break
  console.log(`设备码申请失败(${code.error}), 8s 后重试...`)
  await sleep(8000)
}
if (!code?.device_code) { console.error('无法申请设备码:', JSON.stringify(code)); process.exit(1) }
console.log('\n========================================')
console.log('① 打开: https://github.com/login/device')
console.log('② 输入一次性代码:', code.user_code)
console.log('========================================\n')

// 2. 轮询令牌(15 分钟窗口)
const start = Date.now()
let token = null
while (Date.now() - start < 15 * 60_000) {
  await sleep((code.interval ?? 5) * 1000)
  const r = await post('https://github.com/login/oauth/access_token', {
    client_id: CLIENT_ID, device_code: code.device_code,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  })
  if (r.access_token) {
    token = r.access_token
    console.log('✓ 已获取 workflow scope 令牌(仅本次内存使用, 不落盘)')
    break
  }
  if (r.error === 'authorization_pending') { process.stdout.write('.'); continue }
  if (r.error === 'slow_down') { await sleep(5000); continue }
  if (r.error === 'network_exhausted') { process.stdout.write('x'); continue }
  console.error('授权失败:', r.error, r.error_description ?? '')
  process.exit(1)
}
if (!token) { console.error('超时(15 分钟)'); process.exit(1) }

// 3. 立即补推 ci/publish 两个 workflow 文件
process.env.GH_TOKEN = token
const tip = execFileSync('gh', ['api', `repos/${REPO}/branches/${BRANCH}`, '--jq', '.commit.sha'], { encoding: 'utf8' }).trim()
console.log('main tip:', tip)
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
