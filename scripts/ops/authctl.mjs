#!/usr/bin/env node
// authctl.mjs — T3-3-3 授权契约 CLI: 密钥生成/轮换/列表 + 契约签发/验签
// 用法:
//   node scripts/ops/authctl.mjs keygen                          生成密钥对(kid=公钥指纹前16hex; pkcs8/spki 0600, 目录 0700)
//   node scripts/ops/authctl.mjs keys                            列出 auth-signing/ 全部 kid(公钥侧; 私钥只报存在)
//   node scripts/ops/authctl.mjs issue --target X --scope S --principal P \
//        [--days 30] [--key KID] [--objective O] [--out FILE]     签发契约(缺省 --key=最新 kid; 缺省 out=<contracts>/<id>.json 0600)
//   node scripts/ops/authctl.mjs verify --target X [--scope S]   手动验签(走 verifyAuthContract 全链; 退出码 0=放行语义 1=拒)
// 纪律: 主流程守卫(先例 10 — 被 import 零副作用); 密钥只落 ~/.config/d2d/auth-signing(0700/0600,
//   白名单校验对齐 graphd _safe_token_path); 吞错记因(先例 10 扩充口径); 凭据零字面量(运行时生成)。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generateSigningPair, kidOf, signContract, authContractDirs, authContractMode } from '../../plugin/pentest-dsh/domain/auth-contract.mjs'

const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? String(process.argv[i + 1] ?? '') : '' }
const has = (k) => process.argv.includes(k)
const fail = (msg) => { console.error(`[authctl] 错误: ${msg}`); process.exit(1) }

/** 目录建立 + 白名单校验(镜像 graphd gd/auth.py:56-58 判定 — realpath 必须落在 ~/.config/d2d 内)。 */
function ensureSigningDir(env = process.env) {
  const dirs = authContractDirs(env)
  const base = path.resolve(env.P2P_AUTH_BASE_DIR ?? path.join(env.HOME ?? os.homedir(), '.config', 'd2d'))
  try {
    fs.mkdirSync(dirs.signing, { recursive: true, mode: 0o700 })
    fs.chmodSync(dirs.signing, 0o700) // 已存在不放宽(#24: 父目录 775 登记不修, 子目录收窄)
    if (!fs.realpathSync(dirs.signing).startsWith(fs.realpathSync(base) + path.sep)) fail(`密钥目录越界: ${dirs.signing}`)
  } catch (e) {
    fail(`密钥目录建立失败: ${String(e?.message ?? e).slice(0, 120)}`)
  }
  return dirs
}

/** 密钥对落盘(O_EXCL 防覆盖; 0600; 返回 kid — 对齐 graphd _write_token_file 形态)。 */
function writeKeyPair(dirs) {
  const { publicKeyPem, privateKeyPem } = generateSigningPair()
  const kid = kidOf(publicKeyPem)
  for (const [name, pem] of [[`${kid}.pkcs8.pem`, privateKeyPem], [`${kid}.spki.pem`, publicKeyPem]]) {
    const f = path.join(dirs.signing, name)
    try {
      fs.writeFileSync(f, pem + '\n', { flag: 'wx', mode: 0o600 }) // wx = O_EXCL: kid 碰撞即失败不覆盖
      fs.chmodSync(f, 0o600)
    } catch (e) {
      fail(`密钥落盘失败(${name}): ${String(e?.message ?? e).slice(0, 120)}`)
    }
  }
  return kid
}

function cmdKeygen() {
  const dirs = ensureSigningDir()
  const kid = writeKeyPair(dirs)
  console.log(`[authctl] 密钥对已生成 kid=${kid}(pkcs8+spki @ ${dirs.signing}, 0600)`)
}

function cmdKeys() {
  const dirs = authContractDirs()
  let files = []
  try { files = fs.readdirSync(dirs.signing).filter((f) => f.endsWith('.spki.pem')) } catch { fail(`密钥目录不可读: ${dirs.signing}`) }
  if (!files.length) { console.log('[authctl] (无密钥 — 先 keygen)'); return }
  for (const f of files) {
    const kid = f.replace('.spki.pem', '')
    const pk = path.join(dirs.signing, `${kid}.pkcs8.pem`)
    let fp = ''
    try { fp = kidOf(fs.readFileSync(path.join(dirs.signing, f), 'utf8')) } catch { fp = '(不可读)' }
    console.log(`kid=${kid} 私钥=${fs.existsSync(pk) ? '在' : '缺'} 指纹=${fp}`)
  }
}

function cmdIssue() {
  const target = arg('--target').toLowerCase()
  const scope = arg('--scope')
  const principal = arg('--principal') || envPrincipal() || ''
  if (!target || !scope || !principal) fail('issue 需要 --target/--scope/--principal(缺 principal 时读 AUTH_PRINCIPAL env)')
  const dirs = ensureSigningDir()
  const kid = arg('--key') || latestKid(dirs)
  if (!kid) fail('无可用密钥 — 先 keygen')
  const spki = path.join(dirs.signing, `${kid}.spki.pem`)
  const pkcs8 = path.join(dirs.signing, `${kid}.pkcs8.pem`)
  if (!fs.existsSync(spki) || !fs.existsSync(pkcs8)) fail(`kid ${kid} 密钥材料不全`)
  const days = Math.min(Math.max(parseInt(arg('--days') || '30', 10) || 30, 1), 3650)
  const issued = new Date()
  const expires = new Date(issued.getTime() + days * 86_400_000)
  const contract_id = `ac-${issued.toISOString().slice(0, 10).replaceAll('-', '')}-${kid.slice(0, 6)}`
  const contract = signContract({ contract_id, target, scope, principal, objective: arg('--objective'), key_id: kid, issued_at: issued.toISOString(), expires_at: expires.toISOString() }, fs.readFileSync(pkcs8, 'utf8'))
  const out = arg('--out') || path.join(authContractDirs().contracts, `${contract_id}.json`)
  fs.mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 })
  fs.writeFileSync(out, JSON.stringify(contract, null, 1), { mode: 0o600 })
  console.log(`[authctl] 契约已签发 ${contract_id}(target=${target} scope=${scope} 窗口=${days}d kid=${kid})`)
  console.log(`  → ${out}(0600); 验签: node scripts/ops/authctl.mjs verify --target ${target}`)
}

function cmdVerify() {
  const target = arg('--target').toLowerCase()
  const scope = arg('--scope') || ''
  if (!target) fail('verify 需要 --target')
  import('../../plugin/pentest-dsh/domain/auth-contract.mjs').then(async (m) => {
    const r = await m.verifyAuthContract({ target, scope })
    const mode = authContractMode()
    console.log(`[authctl] state=${r.state} mode=${mode}${r.reason ? ` 原因=${r.reason}` : ''}${r.contract ? ` 契约=${r.contract.contract_id}(principal=${r.contract.principal}, 窗口至 ${r.contract.expires_at})` : ''}`)
    // 退出码按灰度矩阵的放行语义: ok/vanished/off+missing → 0(放行); 其余 → 1(拒)
    const allow = r.state === 'ok' || r.state === 'vanished' || (r.state === 'missing' && mode === 'off')
    process.exit(allow ? 0 : 1)
  })
}

function envPrincipal() {
  try { return String(process.env.AUTH_PRINCIPAL ?? '').trim() } catch { return '' }
}
function latestKid(dirs) {
  let files = []
  try { files = fs.readdirSync(dirs.signing).filter((f) => f.endsWith('.spki.pem')).sort() } catch { return '' }
  if (!files.length) return ''
  // 最新 = mtime 最大(轮换语义: 新钥时间新)
  return files.map((f) => ({ f, m: fs.statSync(path.join(dirs.signing, f)).mtimeMs })).sort((a, b) => b.m - a.m)[0].f.replace('.spki.pem', '')
}

const cmd = process.argv[2] ?? ''
const __isMain = process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href // 先例 10: 主流程守卫
if (__isMain) {
  try {
    if (cmd === 'keygen') cmdKeygen()
    else if (cmd === 'keys') cmdKeys()
    else if (cmd === 'issue') cmdIssue()
    else if (cmd === 'verify') cmdVerify()
    else {
      console.log('用法: authctl.mjs keygen | keys | issue --target T --scope S --principal P [--days N] [--key KID] | verify --target T [--scope S]')
      process.exit(cmd ? 1 : 2)
    }
  } catch (e) {
    fail(String(e?.message ?? e).slice(0, 160)) // 吞错记因(先例 10 扩充口径)
  }
}
