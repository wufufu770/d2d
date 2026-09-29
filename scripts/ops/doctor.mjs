#!/usr/bin/env node
// doctor.mjs — d2d 运行环境自检(借鉴 openclaude doctor:runtime)
// 用法: node scripts/ops/doctor.mjs [--fix]
// 检查: graphd 健康+生命周期列 / 令牌 / 模型策略+余额探针 / 暂停开关 / 守护单元 / 知识脑包 / 学习队列
// 0905 教训: 额度 402、Engagement 缺列、E2BIG、token 失效——任何一个都能让整轮白跑, doctor 一次全查。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const REPO = process.env.D2D ?? path.resolve(import.meta.dirname ?? '.', '../..')
const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const GRAPH = process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766'
const rows = []
const check = (name, ok, detail = '') => rows.push({ name, ok, detail })
// WARN 级检查(T2-2b-1): 提示问题但不计入阻断(exit 0) — 照 doctor 现有 check 风格, 仅多 warn 标记
const checkWarn = (name, ok, detail = '') => rows.push({ name, ok, warn: true, detail })

// 1. graphd 健康
let graphdOk = false
try {
  const r = await fetch(`${GRAPH}/health`, { signal: AbortSignal.timeout(4000) })
  graphdOk = (await r.json()).ok === true
} catch {}
check('graphd 健康', graphdOk, GRAPH)

// 2. host token + 生命周期列(0905 实证: 缺列时栅栏/租约/取消整体静默失效)
let tok = ''
try { tok = fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim() } catch {}
check('host-token 可读', Boolean(tok))
const q = async (cypher) => {
  const r = await fetch(`${GRAPH}/query`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth': tok },
    body: JSON.stringify({ cypher }), signal: AbortSignal.timeout(6000),
  })
  return r.json()
}
if (tok && graphdOk) {
  try {
    const res = await q("MATCH (e:Engagement) RETURN e.cancel AS c LIMIT 1")
    check('Engagement 生命周期列(cancel/leased_by/lease_at)', res.ok === true, res.ok ? '' : JSON.stringify(res.error ?? '').slice(0, 80))
  } catch (e) { check('Engagement 生命周期列', false, e.message) }
  try {
    const a = await q("MATCH (e:Engagement) WHERE e.status='active' RETURN count(e) AS c")
    check('无僵尸 active engagement', Number(a.rows?.[0]?.c ?? 0) === 0, `active=${a.rows?.[0]?.c}`)
  } catch (e) { check('engagement 状态查询', false, e.message) }
}

// 3. 全局暂停开关状态
const paused = (() => { try { return JSON.parse(fs.readFileSync(`${DATA_DIR}/config/paused.json`, 'utf8')).paused } catch { return false } })()
check('写通道暂停开关', !paused, paused ? 'paused.json 存在 — 新 engagement 启动时自动解除' : '')

// 3.5 TLS/企业代理兜底(M6): 代理可达 / CA bundle 可解析 / 放宽开关污染 / NO_PROXY 保护区
// 原则(业界共识: Claude Code network-config / gh CLI): 默认严格 + 注入 CA, 不做全局放宽
{
  const ca = String(process.env.D2D_CA_BUNDLE ?? '').trim()
  if (ca) {
    let pemOk = false, count = 0
    try {
      const text = fs.readFileSync(ca, 'utf8')
      count = (text.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length
      pemOk = count > 0
    } catch {}
    check('D2D_CA_BUNDLE 证书包可解析', pemOk, pemOk ? `${count} 张证书` : '文件缺失或非 PEM — curl --cacert 会全量拒连')
  }
  const relaxed = String(process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? '') === '0'
  check('NODE_TLS_REJECT_UNAUTHORIZED 未被放宽', !relaxed, relaxed ? '=0 会全局放行 MITM — 删除该 env, 用 D2D_CA_BUNDLE/NODE_EXTRA_CA_CERTS 注入企业根证书' : '')
  const px = String(process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.D2D_UPSTREAM_PROXY ?? '').trim()
  if (px) {
    const reachable = await new Promise((resolve) => {
      const m = px.replace(/^https?:\/\//i, '').match(/^([^:]+)(?::(\d+))?$/)
      if (!m) return resolve(false)
      import('node:net').then(({ default: net }) => {
        const s = net.connect(Number(m[2] ?? 8080), m[1], () => { s.destroy(); resolve(true) })
        s.on('error', () => resolve(false))
        s.setTimeout(3000, () => { s.destroy(); resolve(false) })
      })
    })
    check('企业代理可达', reachable, `${px}(TCP 连不上时 worker 出网全失败 — 查代理地址/VPN)`)
  }
  const noproxy = String(process.env.NO_PROXY ?? process.env.no_proxy ?? '')
  check('NO_PROXY 保护区含回环', noproxy === '' || /127\.0\.0\.1|localhost/.test(noproxy), noproxy ? (noproxy.includes('127.0.0.1') ? 'OK' : '缺 127.0.0.1 — graphd/CDP 写通道会被推进代理') : '未配置(worker 侧由 adapter 默认注入, 无需处理)')
}

// 3.6 T2-2b-1 网关解密面证书(WARN 级, 不阻断): D2D_EGRESS_MITM=1 时解密 CA 就绪性 + worker 注入条件
{
  const mitmOn = String(process.env.D2D_EGRESS_MITM ?? '') === '1'
  const caDir = path.join(DATA_DIR, 'mitm')
  const caCrt = path.join(caDir, 'ca.crt'), caKey = path.join(caDir, 'ca.key')
  if (mitmOn) {
    const crtOk = fs.existsSync(caCrt)
    const key0600 = (() => { try { return (fs.statSync(caKey).mode & 0o777) === 0o600 } catch { return false } })()
    checkWarn('egress 解密面 CA(D2D_EGRESS_MITM=1)', crtOk && key0600, !crtOk
      ? `缺 ${caCrt} — 解密面按 SNI 签叶子会失败回退直通; 先跑 tls-intercept 的 ensureCA(共享模块 scripts/gateway/tls-intercept.mjs, 需 openssl 在 PATH)自动生成`
      : !key0600 ? `ca.key 权限非 0600 — 私钥过宽, chmod 600 ${caKey}` : `${caCrt} 在, ca.key 0600`)
    const nxa = String(process.env.NODE_EXTRA_CA_CERTS ?? '').trim()
    checkWarn('worker 证书注入条件(NODE_EXTRA_CA_CERTS)', true, crtOk
      ? (nxa ? `宿主 env 已设 ${nxa}; adapter-dsh 另按 ${caCrt} 存在性向 worker 进程自动注入 NODE_EXTRA_CA_CERTS 与 CURL_CA_BUNDLE 合并`
        : `ca.crt 在 — adapter-dsh 启动 worker 时自动注入; 宿主侧手动跑 Node 客户端需自行 export NODE_EXTRA_CA_CERTS=${caCrt}`)
      : `缺 ${caCrt} — worker 不注入网关 CA, D2D_EGRESS_MITM=1 下 TLS 校验将失败; 先跑 tls-intercept ensureCA 生成`)
  } else {
    checkWarn('egress 解密面 CA', true, 'D2D_EGRESS_MITM 未启用(CONNECT 直通, 默认) — 解密面检查跳过')
  }
}

// 4. 模型策略: 占位符/空值检测(#3) + study 角色可达
const pol = (() => { try { return JSON.parse(fs.readFileSync(`${DATA_DIR}/config/model-policies.json`, 'utf8')) } catch { return null } })()
check('model-policies.json 存在', Boolean(pol))
const placeholder = pol ? ['discovery', 'deep', 'creative', 'verify', 'study'].map((r) => pol.roles?.[r]?.primary ?? pol.default?.primary ?? '').filter((m) => !m || m.includes('<') || !m.includes('/')) : ['(文件缺失)']
check('模型策略无占位符', placeholder.length === 0, placeholder.join(', '))

// 5. 主模型余额探针(可选): 默认不内置任何厂商端点 — 配置以下 env 才启用探针
//    DOCTOR_PROBE_URL (OpenAI 兼容 chat/completions 地址) / DOCTOR_PROBE_KEY / DOCTOR_PROBE_MODEL
const probeUrl = process.env.DOCTOR_PROBE_URL ?? ''
const probeKey = process.env.DOCTOR_PROBE_KEY ?? ''
const probeModel = process.env.DOCTOR_PROBE_MODEL ?? ''
if (probeUrl && probeKey && probeModel) {
  try {
    const r = await fetch(probeUrl, {
      method: 'POST', headers: { Authorization: `Bearer ${probeKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: probeModel, messages: [{ role: 'user', content: 'hi' }], max_tokens: 4 }),
      signal: AbortSignal.timeout(15000),
    })
    const j = await r.json()
    const dead = j?.error && (String(j.error.http_code ?? '') === '402' || /insufficient|balance|余额/i.test(JSON.stringify(j.error)))
    check(`主模型余额探针(${probeModel})`, !dead, dead ? '402 无余额 — 建议切槽或充值' : 'OK')
  } catch (e) { check('主模型余额探针', false, e.message.slice(0, 60)) }
} else check('主模型余额探针', true, '未配置 DOCTOR_PROBE_* — 跳过(可选)')

// 6. systemd 守护单元
for (const u of ['d2d-graphd', 'd2d-dsh-web', 'd2d-egress', 'd2d-oast']) {
  try {
    const s = execFileSync('systemctl', ['--user', 'is-active', u], { encoding: 'utf8' }).trim()
    check(`单元 ${u}`, s === 'active', s)
  } catch { check(`单元 ${u}`, false, '未安装/非 active — 建议装 systemd 单元') }
}

// 7. 知识脑三层可解析 + 学习队列
for (const d of ['current', 'staged', 'shadow']) {
  try {
    const n = JSON.parse(fs.readFileSync(`${DATA_DIR}/brain/${d}/techniques.json`, 'utf8')).cards.length
    check(`知识脑 ${d} 包可解析`, true, `${n} 卡`)
  } catch (e) { check(`知识脑 ${d} 包可解析`, false, e.message.slice(0, 50)) }
}
let inboxN = 0
try { inboxN = fs.readdirSync(`${DATA_DIR}/knowledge/inbox`).filter((f) => /\.(md|txt|markdown)$/i.test(f)).length } catch {}
check('学习队列状态', true, inboxN ? `inbox 待蒸馏 ${inboxN} 篇(下次 auto-study 消化)` : 'inbox 空(已消化)')

// ---- 汇总 ----
const bad = rows.filter((r) => !r.ok && !r.warn) // WARN 级不阻断
for (const r of rows) console.log(`${r.ok ? '✓' : r.warn ? '⚠' : '✗'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`)
console.log(`\n${rows.length - rows.filter((r) => !r.ok).length}/${rows.length} 项通过${bad.length ? `；${bad.length} 项异常需处理` : '，全部健康'}${rows.some((r) => !r.ok && r.warn) ? '（另有 WARN 提示项, 不阻断）' : ''}`)
process.exit(bad.length ? 1 : 0)
