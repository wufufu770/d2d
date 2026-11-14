#!/usr/bin/env node
// scripts/e2e/run.mjs — d2d 全栈 E2E 驱动(E39-B1-1 入仓化; 原型=E38-E2E /tmp 驱动)
// 用法: node scripts/e2e/run.mjs [--suite a|b|c|d|align|all] [--base http://127.0.0.1:8899]
//       [--token <web 登录 token>] [--out coverage/e2e-results.json]
// 前置: a/b/d 套件需全栈在跑(graphd :8766 + dsh web)且 host-token 文件就绪;
//       align 套件零栈依赖(纯静态 diff)——前后端功能对齐的机器级闸(E39 纪律执行点)。
// 套件:
//   a 数据面全路由  b WorkItems 生命周期  c 双图锚点  d engagement 启动流
// 退出码: 0=全过 / 1=有失败 / 2=前置不满足(服务未起/token 缺)。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const arg = (f) => (has(f) ? argv[argv.indexOf(f) + 1] : undefined)
const SUITE = arg('--suite') ?? 'all'
const BASE = arg('--base') ?? 'http://127.0.0.1:8899'
const OUT = arg('--out') ?? 'coverage/e2e-results.json'
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const GRAPHD = process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766'
const INBOX = process.env.D2D_DATA_DIR ? `${process.env.D2D_DATA_DIR}/sources/inbox` : `${os.homedir()}/.d2d-data/sources/inbox`

// ── align 套件(静态, 零栈): host 路由 ↔ client 数据消费 diff ──
// 已知动态取数形态白名单(view.viz.js fetchVizMethod 模板字面量——静态正则不可解析):
// 守卫=若 viz 文件失去该形态即判漂移。
const DYNAMIC_METHODS = ['starmap', 'coverage', 'hypotheses', 'capability', 'transition-flows']
const DIAGNOSTIC = new Set(['health']) // 诊断面豁免(无 UI 入口是设计)

function staticAlign() {
  const hostSrc = fs.readFileSync(path.join(REPO, 'plugin/d2d-panel/lib/host/index.mjs'), 'utf8')
  const routes = [...hostSrc.matchAll(/method === '([a-z-]+)'/g)].map((m) => m[1])
  let client = ''
  const fragDir = path.join(REPO, 'plugin/d2d-panel/lib/client')
  for (const f of fs.readdirSync(fragDir).filter((f) => f.endsWith('.js'))) {
    client += fs.readFileSync(path.join(fragDir, f), 'utf8')
  }
  const consumed = new Set([
    ...[...client.matchAll(/(?:fetchApi|postJson)\('([a-z-]+)/g)].map((m) => m[1]), // 前缀捕获(允许 '?ref=' 查询后缀形态)
    ...[...client.matchAll(/\/d2d\/api\/([a-z-]+)/g)].map((m) => m[1]), // 直连 fetch 字面量形态(snapshot/audit/toolcalls 等)
  ])
  // 模板字面量取数守卫: fetch(`/d2d/api/${method}`) 形态必须仍存在于 viz 片段
  const vizSrc = fs.readFileSync(path.join(fragDir, 'view.viz.js'), 'utf8')
  const vizGuard = /fetch\(`\/d2d\/api\/\$\{method\}`\)/.test(vizSrc) || /fetchVizMethod/.test(vizSrc)
  const backOnly = routes.filter((r) => !consumed.has(r) && !DIAGNOSTIC.has(r) && !DYNAMIC_METHODS.includes(r))
  const frontOnly = [...consumed].filter((c) => !routes.includes(c))
  return { routes, consumed: [...consumed], backOnly, frontOnly, vizGuard }
}

// ── 共用: cookie 会话 + 断言收集 ──
const results = []
const t = (name, pass, detail = '') => { results.push({ suite: SUITE, name, pass, detail }); console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let COOKIE = ''
const HOSTTOK = process.env.P2P_HOST_TOKEN ?? (() => {
  try { return fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim() } catch { return '' }
})()

async function api(method, body, httpMethod) {
  const r = await fetch(`${BASE}/d2d/api/${method}`, {
    headers: { cookie: COOKIE, ...(body ? { 'content-type': 'application/json' } : {}) },
    method: httpMethod ?? (body ? 'POST' : 'GET'),
    body: body ? JSON.stringify(body) : undefined,
  })
  let j = null
  try { j = await r.json() } catch {}
  return { status: r.status, j }
}
async function graphd(cypher, params) {
  const r = await fetch(`${GRAPHD}/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-auth': HOSTTOK },
    body: JSON.stringify({ cypher, ...(params ? { parameters: params } : {}) }),
  })
  const j = await r.json().catch(() => ({}))
  return j?.rows ?? []
}
async function login() {
  const TOKEN = arg('--token') ?? process.env.P2P_WEB_TOKEN
  if (!TOKEN) throw new Error('缺 web 登录 token — 传 --token 或设 P2P_WEB_TOKEN(取自 dsh web 启动日志)')
  const r = await fetch(`${BASE}/?token=${TOKEN}`)
  const setCookie = r.headers.get('set-cookie') ?? ''
  const ck = setCookie.match(/dsh-auth[^=]*=[^;]+/i)?.[0]
  if (!ck) throw new Error('登录未取得会话 cookie(token 失效或服务未起)')
  COOKIE = ck
}
async function preflight() {
  const gh = await fetch(`${GRAPHD}/health`).then((r) => r.ok).catch(() => false)
  const web = await fetch(`${BASE}/`).then((r) => r.status).catch(() => 0)
  if (!gh || web === 0) {
    console.error(`✗ 前置不满足: graphd=${gh ? 'ok' : '不可达'} / dsh web=${web || '不可达'} — 先起栈或用 --suite align`)
    process.exit(2)
  }
}

// ── Suite A: 数据面全路由 ──
async function suiteA() {
  await login()
  for (const m of ['snapshot', 'health', 'workitems', 'approval', 'starmap', 'coverage', 'hypotheses', 'capability', 'transition-flows', 'chain', 'audit', 'toolcalls', 'configx']) {
    try {
      const { status, j } = await api(m)
      t(`A·${m}`, status === 200 && j?.ok === true, `status=${status}`)
    } catch (e) { t(`A·${m}`, false, e.message) }
  }
}

// ── Suite B: WorkItems 生命周期 ──
async function suiteB() {
  await login()
  try {
    await graphd("MERGE (f:Finding {id:'F-E2E-1'}) SET f.title='E2E 复测目标', f.severity='high', f.gate_status='verified', f.ts='2026-11-14T00:00:00Z', f.eng=''")
    t('B·建档 F-E2E-1', true, 'graphd host-token MERGE')
  } catch (e) { t('B·建档 F-E2E-1', false, e.message) }
  fs.mkdirSync(INBOX, { recursive: true })
  fs.writeFileSync(`${INBOX}/e2e-b.json`, JSON.stringify({ source: 'e2e', kind: 'manual', id: `e2e-b-${Date.now() % 100000}`, title: 'E2E 影子投递工单', author: 'alice' }))
  let picked = null
  for (let i = 0; i < 16 && !picked; i++) {
    await sleep(5000)
    const { j } = await api('workitems')
    picked = (j?.items ?? []).find((w) => w.source === 'e2e')
  }
  t('B·投递箱拾取(≤80s)', Boolean(picked), picked ? `status=${picked.status}` : '超时')
  t('B·影子判定', picked?.status === 'eval_shadowed', `status=${picked?.status}`)
  const { j: cr } = await api('workitems', { action: 'create', kind: 'retest', title: 'E2E 复测 F-E2E-1', externalId: 'F-E2E-1', payload: { replay_result: 'pass' } })
  t('B·面板建复测单', cr?.ok === true && ['eval_shadowed', 'needs_human'].includes(cr?.item?.status), `status=${cr?.item?.status}`)
  const wiId = cr?.item?.id
  if (!wiId) return
  const to = cr.item.status === 'eval_shadowed' ? 'accepted' : cr.item.status === 'needs_human' ? 'assigned' : null
  const { j: tr } = await api('workitems', { id: wiId, to, note: 'E2E 放行' })
  t(`B·放行 ${cr.item.status}→${to}`, tr?.ok === true, `status=${tr?.item?.status}`)
  let done = null
  for (let i = 0; i < 10 && !done; i++) {
    await sleep(5000)
    const { j } = await api('workitems')
    done = (j?.items ?? []).find((w) => w.id === wiId && w.status === 'done')
  }
  t('B·派发→CLI 复测→done(≤50s)', Boolean(done), done ? `disposition=${done.disposition?.decision}` : '超时未收口')
  t('B·三态回写', done?.disposition?.decision === 'reproducible', `note=${String(done?.disposition?.reason ?? '').slice(0, 60)}`)
  const ver = await graphd("MATCH (v:Verification {kind:'retest', verdict:'pass', finding_ref:'F-E2E-1'}) RETURN count(v) AS n")
  t('B·Verification 入图', Number(ver[0]?.n ?? 0) >= 1, `count=${ver[0]?.n}`)
  const edge = await graphd("MATCH (f:Finding {id:'F-E2E-1'})-[:VERIFIED_BY]->(v:Verification) RETURN count(v) AS n")
  t('B·VERIFIED_BY 边', Number(edge[0]?.n ?? 0) >= 1, `count=${edge[0]?.n}`)
}

// ── Suite C: 双图锚点 ──
async function suiteC() {
  await login()
  try {
    await graphd("MERGE (a:Asset {id:'a-e2e'}) SET a.kind='target', a.identifier='https://e2e.example.com'")
    await graphd("MERGE (ep:Endpoint {id:'ep-e2e'}) SET ep.url='https://e2e.example.com/', ep.method='GET', ep.eng=''")
    await graphd("MERGE (f:Finding {id:'F-anchor'}) SET f.title='锚点目标', f.severity='low', f.gate_status='candidate', f.ts='t', f.eng=''")
    await graphd("MERGE (tk:Task {id:'tk-e2e'}) SET tk.kind='probe', tk.payload='{}', tk.eng=''")
    t('C·建档四件', true, 'graphd MERGE')
  } catch (e) { t('C·建档四件', false, e.message) }
  const { status, j } = await api('anchors', { anchor: 'finding', from_ref: 'F-anchor', asset_id: 'a-e2e' })
  t('C·FINDING_ON 写(面板代理)', status === 200 && j?.ok === true && j?.created === true, `created=${j?.created}`)
  const { j: j2 } = await api('anchors', { anchor: 'finding', from_ref: 'F-anchor', asset_id: 'a-e2e' })
  t('C·幂等重放', j2?.ok === true && j2?.created === false)
  const { status: s3 } = await api('anchors', { anchor: 'finding', from_ref: 'F-ghost', asset_id: 'a-e2e' })
  t('C·幽灵 404 fail-closed', s3 === 404, `status=${s3}`)
  const { j: j4 } = await api('anchors', { anchor: 'task', from_ref: 'tk-e2e', asset_id: 'a-e2e' })
  t('C·TOUCHED 写', j4?.ok === true && j4?.edge === 'TOUCHED')
  const rev = await graphd("MATCH (f:Finding)-[:FINDING_ON]->(a:Asset {id:'a-e2e'}) RETURN f.id AS fid")
  t('C·资产反查(发现面)', (rev ?? []).some((r) => r.fid === 'F-anchor'))
  const rev2 = await graphd("MATCH (tk:Task)-[:TOUCHED]->(a:Asset {id:'a-e2e'}) RETURN count(tk) AS n")
  t('C·资产反查(任务面)', Number(rev2[0]?.n ?? 0) >= 1)
}

// ── Suite D: engagement 启动流 ──
async function suiteD() {
  await login()
  const { status: sBad } = await api('start', { scope: '127.0.0.1' })
  t('D·环回拒绝→400(安全设计)', sBad === 400, `status=${sBad}`)
  const { status: sOk, j } = await api('start', { target: 'http://e2e.example.com', scope: 'e2e.example.com', instances: 1 })
  t('D·公网形态入队 requested', sOk === 200 && j?.ok === true, `name=${j?.name}`)
  if (j?.name) {
    await sleep(18000)
    const eng = await graphd('MATCH (e:Engagement {name:$n}) RETURN e.status AS st', { n: j.name })
    t('D·调度器采纳(≤15s+buffer)', (eng[0]?.st ?? '') !== '', `status=${eng[0]?.st}(无模型凭据 worker error=预期)`)
    const { status: sStop, j: jStop } = await api('stop', { name: j.name })
    t('D·stop 栅栏自停', sStop === 200 && jStop?.ok === true, String(jStop?.note ?? '').slice(0, 40))
    await sleep(8000)
    const fin = await graphd('MATCH (e:Engagement {name:$n}) RETURN e.status AS st', { n: j.name })
    t('D·异步终态 frozen', fin[0]?.st === 'frozen', `status=${fin[0]?.st}`)
  }
}

// ── 编排 ──
console.log(`d2d E2E — suite=${SUITE} base=${BASE}`)
if (SUITE === 'align') {
  const a = staticAlign()
  t('align·viz 动态取数守卫', a.vizGuard, 'view.viz.js fetchVizMethod 形态在位')
  t('align·后端有路由无消费', a.backOnly.length === 0, a.backOnly.length ? `缺 UI 入口: ${a.backOnly.join(',')}` : '零缺口')
  t('align·前端有消费无路由', a.frontOnly.length === 0, a.frontOnly.length ? `缺后端路由: ${a.frontOnly.join(',')}` : '零缺口')
  console.log(`对齐矩阵: 路由 ${a.routes.length} / 消费点 ${a.consumed.length} / 动态白名单 ${DYNAMIC_METHODS.length}`)
  results.push(...a.backOnly.map((m) => ({ suite: 'align', name: `align·${m}`, pass: false, detail: 'backend-only' })))
} else {
  if (SUITE === 'all' || SUITE === 'a' || SUITE === 'b' || SUITE === 'c' || SUITE === 'd') await preflight()
  if (SUITE === 'all' || SUITE === 'a') await suiteA()
  if (SUITE === 'all' || SUITE === 'b') await suiteB()
  if (SUITE === 'all' || SUITE === 'c') await suiteC()
  if (SUITE === 'all' || SUITE === 'd') await suiteD()
}
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify({ suite: SUITE, at: new Date().toISOString(), results }, null, 1))
const pass = results.filter((r) => r.pass).length
console.log(`\n══ E2E 汇总(${SUITE}): ${pass}/${results.length} 通过 — 结果 ${OUT}`)
process.exit(results.some((r) => !r.pass) ? 1 : 0)
