// index.mjs — d2d-panel host 半(dsh 插件宿主入口)
// 路由: ctx.webServer.register({kind:'prefix', path:'/d2d/api'}) — 与 dsh /api 同一道
// 浏览器信任栅栏(Host loopback/受信 + sec-fetch-site + Origin 同源), 同源零跨域,
// token 全程留 host 侧。机制参照 dsh-sidebar-leap 宿主半(生态已验证模式)。
import { buildSnapshot, createGraphdQuery, readHostToken, readFleet, writeFleet, readRunEvents, readModelUsage, transitionFinding, adjudicate, writeDenylist, readCaps, writeCaps, loadDshCatalog, mergeCredentialRefs, readSelectedEngagement, writeSelectedEngagement, buildStarmap, buildCoverage, buildHypLane, buildCapability, readTransitionFlows, readAuditTail, readToolCalls, buildChain, buildFrontierPool, frontierTransition, readConfigOverview, attachEngCosts } from './snapshot.mjs'
import { validateStartRequest } from './start-policy.mjs'
import fs from 'node:fs'
import os from 'node:os'

export const name = 'd2d-panel'
export const inject = ['webServer', 'webRuntime'] // 无 sessions 依赖: 快照只读 graphd, 不碰会话存储

const MICRO_CACHE_MS = 500 // 微缓存 + 单飞: 并发请求合并为一次图读取(_lock 争用最小)
const BODY_MAX = 8 * 1024 // 写端点请求体上限(模型 id / 转移理由都是百字节级)

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > BODY_MAX) { reject(new Error('body too large')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch (e) { reject(new Error('bad json body')) }
    })
    req.on('error', reject)
  })
}

/** 浏览器信任栅栏(port of dsh-sidebar-leap isTrustedApiRequest 同口径)。 */
function isTrustedApiRequest(req, trustedHosts = []) {
  const host = String(req.headers?.host ?? '')
  if (!host) return false
  const m = host.match(/^\[([^\]]+)\](?::(\d+))?$/) || host.match(/^([^:]+)(?::(\d+))?$/)
  if (!m) return false
  const hostname = String(m[1]).toLowerCase()
  const isLoop = hostname === 'localhost' || hostname === '::1' || /^127\.\d+\.\d+\.\d+$/.test(hostname)
  const trusted = (trustedHosts ?? []).some((t) => {
    const tm = String(t ?? '').match(/^\[([^\]]+)\]/) || String(t ?? '').match(/^([^:]+)/)
    return tm ? String(tm[1]).toLowerCase() === hostname : false
  })
  if (!isLoop && !trusted) return false
  if (String(req.headers?.['sec-fetch-site'] ?? '') === 'cross-site') return false
  const origin = req.headers?.origin
  if (origin === undefined) return true
  try { return new URL(origin).host === host } catch { return false }
}

export function apply(ctx, config = {}) {
  const log = (...a) => { try { ctx?.log?.(...a) } catch { /* 宿主日志面可选 */ } }
  const graphdUrl = String(config.graphdUrl ?? process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766')
  const query = createGraphdQuery({ graphdUrl, token: readHostToken() })

  let cache = null
  let inFlight = null
  async function snapshot() {
    if (cache && Date.now() - cache.ts < MICRO_CACHE_MS) return cache.val
    if (inFlight) return inFlight
    inFlight = (async () => {
      // W5: 当前选中 engagement — 面板全部池子查询/轨迹区都按它过滤。selected 文件缺失
      // (首次使用/未选过)时兜底最新 active, 再兜底最新任意 — 保证首屏就有数据可看。
      let eng = readSelectedEngagement()
      if (!eng) {
        try {
          const act = await query(`MATCH (e:Engagement) WHERE e.status = 'active' RETURN e.name AS name ORDER BY coalesce(e.created_at, '') DESC LIMIT 1`)
          eng = String(act?.[0]?.name ?? '')
          if (!eng) {
            const last = await query(`MATCH (e:Engagement) RETURN e.name AS name ORDER BY coalesce(e.created_at, '') DESC LIMIT 1`)
            eng = String(last?.[0]?.name ?? '')
          }
        } catch { /* 轨迹区/池子区降级为空, 快照主体不受影响 */ }
      }
      const runEvents = eng ? readRunEvents({ engName: eng }) : { events: [], usage: {}, quotaHits: [] }
      // 阶段2: 性价比卡 — per-engagement token 账本(runs/<eng>/model-usage.jsonl, 全局账本按 worker 前缀回落)
      const modelUsage = eng ? readModelUsage({ engName: eng }) : null
      const val = await buildSnapshot(query, { fleet: readFleet(), runEvents, modelUsage, eng })
      // T3-3-2 总览补全: 每 engagement 性价比(活跃优先 ≤8, 原地标注 — fs 尾读有成本不放大)
      attachEngCosts(val.engagements)
      cache = { ts: Date.now(), val }
      return val
    })().finally(() => { inFlight = null })
    return inFlight
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/d2d/api',
    handler: async (req, res) => {
      const send = (code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify(obj))
      }
      if (!isTrustedApiRequest(req, ctx.webRuntime?.trustedHosts ?? [])) {
        return send(403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
      }
      const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
      const method = pathname.startsWith('/d2d/api/') ? pathname.slice('/d2d/api/'.length) : undefined
      if (method === undefined || method.includes('/')) {
        return send(404, { ok: false, error: { code: 'not-found', message: 'unknown d2d API method' } })
      }
      if (method === 'health') {
        return send(200, { ok: true, service: 'd2d-panel', graphd: graphdUrl })
      }
      if (method === 'snapshot') {
        if (req.method !== 'GET') return send(405, { ok: false, error: { code: 'method-error', message: 'method not allowed (read-only)' } })
        try {
          return send(200, await snapshot())
        } catch (e) {
          // fail-closed: graphd 不可达/忙 → 503, 不下发过期快照(PANEL-UI-SPEC §4.7)
          return send(503, { ok: false, error: { code: 'graphd-unreachable', message: `fail-closed: ${String(e?.message ?? e).slice(0, 140)}` } })
        }
      }
      // ---- 写端点: 面板交互(fleet 模型切换 / finding 人工裁决 / 供应商凭据落盘) ----
      // H17 修复(外部审计): credential 块原嵌在 `fleet || transition` 分支内 — method 为 'credential'
      // 时外层条件恒假, 整块死代码, POST /d2d/api/credential 恒 404。外层门放入 credential 即可
      // (共用 POST 校验 + readBody), 分支内按 method 分派顺序不变。
      if (method === 'fleet' || method === 'transition' || method === 'credential') {
        if (req.method !== 'POST') return send(405, { ok: false, error: { code: 'method-error', message: 'POST required' } })
        let body
        try { body = await readBody(req) } catch (e) {
          return send(400, { ok: false, error: { code: 'bad-request', message: String(e?.message ?? e) } })
        }
        if (method === 'fleet') {
          try {
            const fleet = writeFleet({ role: body.role, slot: body.slot, model: body.model })
            cache = null // 策略已变, 快照立即失效
            return send(200, { ok: true, fleet })
          } catch (e) {
            return send(400, { ok: false, error: { code: 'fleet-write-error', message: String(e?.message ?? e).slice(0, 160) } })
          }
        }
        // 供应商凭据落盘(#89 吸纳竞品无痕切换): 面板贴 key → 写 dsh credentials refs(0600), 值不回显不入日志
        if (method === 'credential') {
          try {
            const cat = loadDshCatalog(process.env)
            const p = cat.find((x) => x.provider === body.provider)
            if (!p?.apiKeyEnv) return send(400, { ok: false, error: { code: 'unknown-provider', message: `unknown provider: ${body.provider}` } })
            const key = String(body.key ?? '').trim()
            if (key.length < 8) return send(400, { ok: false, error: { code: 'bad-request', message: 'key too short' } })
            const home = process.env.DSH_HOME ?? `${os.homedir()}/.dsh`
            const credPath = `${home}/.credentials.yaml`
            const merged = mergeCredentialRefs(fs.readFileSync(credPath, 'utf8'), p.apiKeyEnv, key)
            fs.writeFileSync(credPath, merged, { mode: 0o600 })
            // writeFileSync 的 mode 只在新建时生效 — 预存文件可能是宽松权限, 密钥落盘后强制收口 0600
            fs.chmodSync(credPath, 0o600)
            cache = null
            return send(200, { ok: true, provider: body.provider, env: p.apiKeyEnv })
          } catch (e) {
            return send(400, { ok: false, error: { code: 'credential-write-error', message: String(e?.message ?? e).slice(0, 160) } })
          }
        }
        try {
          const r = await transitionFinding({ graphdUrl, token: readHostToken(), id: body.id, to: body.to, actor: body.actor, reason: body.reason })
          cache = null // 状态已变, 快照立即失效
          return send(200, { ok: true, transition: r })
        } catch (e) {
          return send(400, { ok: false, error: { code: 'transition-error', message: String(e?.message ?? e).slice(0, 160) } })
        }
      }
      if (method === 'adjudicate') {
        // WRAP-2: 裁决回灌统一入口(一处入口两路分流; kind/action/id/operator/reason;
        // host-only+审计+既有门在 graphd /write/adjudicate 校验, 面板纯代理)。
        // B 层复核 FAIL 修复: 自带 POST 守卫+readBody(body 原越界引用 transition 块作用域
        // ——面板回灌链路恒 400 断链; 路由驱动测试防回归)。
        if (req.method !== 'POST') return send(405, { ok: false, error: { code: 'method-error', message: 'POST required' } })
        let body
        try { body = await readBody(req) } catch (e) {
          return send(400, { ok: false, error: { code: 'bad-request', message: String(e?.message ?? e) } })
        }
        try {
          const r = await adjudicate({ graphdUrl, token: readHostToken(), kind: body.kind, action: body.action, id: body.id, operator: body.operator, reason: body.reason })
          cache = null // 裁决即状态变更, 快照立即失效
          return send(200, { ok: true, adjudication: r })
        } catch (e) {
          return send(400, { ok: false, error: { code: 'adjudicate-error', message: String(e?.message ?? e).slice(0, 160) } })
        }
      }
      // ---- R6.3: 黑名单卡片 CRUD(改文件 + graphd 热重载) ----
      if (method === 'denylist') {
        if (req.method !== 'POST') return send(405, { ok: false, error: { code: 'method-error', message: 'POST required' } })
        let body
        try { body = await readBody(req) } catch (e) {
          return send(400, { ok: false, error: { code: 'bad-request', message: String(e?.message ?? e) } })
        }
        try {
          const r = await writeDenylist({ ...body, graphdUrl, token: readHostToken() })
          cache = null // 名单已变, 快照立即失效
          return send(200, { ok: true, denylist: r })
        } catch (e) {
          return send(400, { ok: false, error: { code: 'denylist-write-error', message: String(e?.message ?? e).slice(0, 160) } })
        }
      }
      // ---- W4: 容量热调卡片(GET 读 caps.json / POST 写覆盖, 调度器下个 tick 生效) ----
      if (method === 'caps') {
        if (req.method === 'GET') return send(200, { ok: true, caps: readCaps() })
        if (req.method !== 'POST') return send(405, { ok: false, error: { code: 'method-error', message: 'POST/GET required' } })
        let body
        try { body = await readBody(req) } catch (e) {
          return send(400, { ok: false, error: { code: 'bad-request', message: String(e?.message ?? e) } })
        }
        try {
          const r = writeCaps({ updates: body?.updates })
          cache = null // 容量已变, 快照立即失效
          return send(200, { ok: true, caps: r })
        } catch (e) {
          return send(400, { ok: false, error: { code: 'caps-write-error', message: String(e?.message ?? e).slice(0, 160) } })
        }
      }
      // ---- T3-3-1 viz 数据面 ×4(GET 只读; 各自独立微缓存 — 与主快照互不牵动, viz 503 不炸 ops/findings) ----
      // graphd 零改动零新增 endpoint: 全部走既有 /query host-token 通道($eng 参数绑定);
      // wire 契约继承: 不带 evidence 全文/repro(host 半提 hostname, snapshot.mjs build*)。
      // capability 路由零 graphd(纯本地静态读) → fail-soft 恒 200 + degraded 记因, 与
      // graphd 依赖路由的 503 fail-closed 语义区分(看板卡非关键路径)。
      const vizEng = async () => {
        const local = readSelectedEngagement()
        if (local) return local
        // 无 selected 文件: 查 graphd 兜底 — **graphd 不可达必须上抛**(路由层 503 fail-closed),
        // 不可静默吞成空 eng 返回 200 空态(首版缺陷: CI 无 selected 文件暴露; 本机有文件掩盖)。
        const act = await query(`MATCH (e:Engagement) WHERE e.status = 'active' RETURN e.name AS name ORDER BY coalesce(e.created_at, '') DESC LIMIT 1`)
        return String(act?.[0]?.name ?? '')
      }
      const microCaches = new Map() // key → {c, f}: 每路由独立 500ms 缓存槽(viz ×4 与主快照互不牵动)
      const microCache = (key, fn) => {
        if (!microCaches.has(key)) microCaches.set(key, { c: null, f: null })
        const slot = microCaches.get(key)
        return async (...args) => {
          if (slot.c && Date.now() - slot.c.ts < MICRO_CACHE_MS) return slot.c.val
          if (slot.f) return slot.f
          slot.f = (async () => {
            const val = await fn(...args)
            slot.c = { ts: Date.now(), val }
            return val
          })().finally(() => { slot.f = null })
          return slot.f
        }
      }
      const vizRoute = async (name, fn) => {
        if (req.method !== 'GET') { send(405, { ok: false, error: { code: 'method-error', message: 'method not allowed (read-only)' } }); return }
        try {
          // await 到 send 完成(非 fire-and-forget) — 测试驱动与慢链路下响应写入必然可见
          const eng = await vizEng()
          if (!eng) return send(200, { ok: true, eng: '', [name]: null })
          const sp = new URL(req.url ?? '/', 'http://dsh.internal').searchParams
          return send(200, { ok: true, eng, [name]: await microCache(`viz:${name}`, fn)(eng, sp) })
        } catch (e) {
          return send(503, { ok: false, error: { code: 'graphd-unreachable', message: `fail-closed: ${String(e?.message ?? e).slice(0, 140)}` } })
        }
      }
      if (method === 'starmap') return vizRoute('starmap', (eng) => buildStarmap(query, { eng, runEvents: readRunEvents({ engName: eng }) }))
      if (method === 'coverage') return vizRoute('coverage', (eng) => buildCoverage(query, { eng }))
      if (method === 'hypotheses') return vizRoute('hypotheses', (eng, sp) => buildHypLane(query, { eng, days: sp.get('days') ?? undefined }))
      if (method === 'capability') {
        if (req.method !== 'GET') return send(405, { ok: false, error: { code: 'method-error', message: 'method not allowed (read-only)' } })
        try {
          const run = microCache('capability', async () => {
            let manifest = null
            let baselinesRaw = null
            try { manifest = (await import('../../../pentest-dsh/export/manifest.mjs')).EXPORT_MANIFEST } catch { manifest = null }
            try { baselinesRaw = fs.readFileSync(new URL('../../../pentest-dsh/config/description-baselines.json', import.meta.url), 'utf8') } catch { baselinesRaw = null }
            return { ok: true, capability: buildCapability({ manifest, baselinesRaw }) }
          })()
          return send(200, await run)
        } catch (e) {
          return send(200, { ok: true, capability: { degraded: [`capability: ${String(e?.message ?? e).slice(0, 120)}`], manifest: null, baselines: null } })
        }
      }
      // ---- T3-3-2 收官批: 9 标签页数据面 ----
      // 桑基(transition-log host 侧聚合; 全局事件流无 eng 维度, 与 vizRoute 的 eng 解耦;
      // 文件面 fail-soft — readTransitionFlows 内部永不抛, 缺文件回空态+degraded 记因)。
      if (method === 'transition-flows') {
        if (req.method !== 'GET') return send(405, { ok: false, error: { code: 'method-error', message: 'method not allowed (read-only)' } })
        const sp = new URL(req.url ?? '/', 'http://dsh.internal').searchParams
        const days = sp.get('days') ?? undefined
        const family = sp.get('family') ?? 'all'
        // 缓存键含参数: 500ms 微缓存窗口内不同 days/family 不互串(vizRoute 的 name 键对带参路由的已知收窄)
        return send(200, { ok: true, flows: await microCache(`flows:${days}:${family}`, () => readTransitionFlows({ days, family }))() })
      }
      // 工具调用明细(run-log 全事件投影; eng 缺省=selected 文件, 纯本地不回退 graphd — fail-soft 语义一致)
      if (method === 'toolcalls') {
        if (req.method !== 'GET') return send(405, { ok: false, error: { code: 'method-error', message: 'method not allowed (read-only)' } })
        const sp = new URL(req.url ?? '/', 'http://dsh.internal').searchParams
        const eng = String(sp.get('eng') ?? '') || readSelectedEngagement() || ''
        const limit = sp.get('limit') ?? undefined
        const kind = sp.get('kind') ?? ''
        return send(200, { ok: true, toolcalls: await microCache(`toolcalls:${eng}:${limit}:${kind}`, () => readToolCalls({ engName: eng, limit, kind }))() })
      }
      // 审计时间线(audit.log + transition-log 双源合并; 非法迁移只在 audit.log — 合流才完整)
      if (method === 'audit') {
        if (req.method !== 'GET') return send(405, { ok: false, error: { code: 'method-error', message: 'method not allowed (read-only)' } })
        const sp = new URL(req.url ?? '/', 'http://dsh.internal').searchParams
        const limit = sp.get('limit') ?? undefined
        const kind = sp.get('kind') ?? ''
        return send(200, { ok: true, audit: await microCache(`audit:${limit}:${kind}`, () => readAuditTail({ limit, kind }))() })
      }
      // 配置总览(通知通道脱敏形态 + 暂停清单; 只读 — notify 写面登记后续)
      if (method === 'configx') {
        if (req.method !== 'GET') return send(405, { ok: false, error: { code: 'method-error', message: 'method not allowed (read-only)' } })
        return send(200, { ok: true, config: await microCache('configx', () => readConfigOverview())() })
      }
      // 探索链路/前沿提案池: 图依赖路由 — vizRoute 统一 fail-closed 503(graphd 不可达不下发空态)
      if (method === 'chain') return vizRoute('chain', (eng) => buildChain(query, { eng }))
      if (method === 'frontier') return vizRoute('frontier', (eng) => buildFrontierPool(query, { eng }))
      // 前沿评审转态代理: reviewer 钉死 'panel'(graphd 迁移门+review_note 审计在服务端校验)
      if (method === 'frontier-transition') {
        if (req.method !== 'POST') return send(405, { ok: false, error: { code: 'method-error', message: 'POST required' } })
        let body
        try { body = await readBody(req) } catch (e) {
          return send(400, { ok: false, error: { code: 'bad-request', message: String(e?.message ?? e) } })
        }
        const fid = String(body?.frontier_id ?? '').trim()
        const to = String(body?.target_status ?? '').trim().toLowerCase()
        const note = String(body?.review_note ?? '').trim()
        if (!fid) return send(400, { ok: false, error: { code: 'bad-request', message: 'frontier_id 必填' } })
        if (!['accepted', 'rejected', 'explored'].includes(to)) return send(400, { ok: false, error: { code: 'bad-request', message: 'target_status 必须是 accepted|rejected|explored' } })
        try {
          const r = await frontierTransition({ graphdUrl, token: readHostToken(), frontierId: fid, targetStatus: to, reviewNote: note })
          cache = null // 提案池已变, 快照立即失效
          return send(200, { ok: true, transition: r })
        } catch (e) {
          return send(400, { ok: false, error: { code: 'frontier-transition-error', message: String(e?.message ?? e).slice(0, 160) } })
        }
      }
      // ---- 4-4 子批次 A: 通道①审批面 — GET 列 pending(+计数/模式), POST {id,decision,decided_by} 裁决。
      // 鉴权/写端点模式复用上方既有门(trustedHosts + POST + readBody + BODY_MAX)。队列模块
      // 复用 pentest-dsh/scheduler/approvals.mjs(同仓库兄弟包链接部署, 单一格式源); 缺席时
      // fail-soft 降级 503(审批执行面在 worker 侧 fail-closed, 不受面板可用性影响)。
      if (method === 'approval') {
        let ap
        try { ap = await import('../../../pentest-dsh/scheduler/approvals.mjs') } catch (e) {
          return send(503, { ok: false, error: { code: 'approval-queue-unavailable', message: `审批队列模块不可用: ${String(e?.message ?? e).slice(0, 140)}` } })
        }
        if (req.method === 'GET') {
          return send(200, { ok: true, mode: ap.approvalMode(), count: ap.pendingCount(), approvals: ap.listPending() })
        }
        if (req.method !== 'POST') return send(405, { ok: false, error: { code: 'method-error', message: 'POST required' } })
        let body
        try { body = await readBody(req) } catch (e) {
          return send(400, { ok: false, error: { code: 'bad-request', message: String(e?.message ?? e) } })
        }
        const id = String(body?.id ?? '').trim()
        const decision = String(body?.decision ?? '').trim()
        const decidedBy = String(body?.decided_by ?? 'panel-human').trim() || 'panel-human'
        if (!id) return send(400, { ok: false, error: { code: 'bad-request', message: 'id 必填' } })
        if (!['approved', 'rejected'].includes(decision)) return send(400, { ok: false, error: { code: 'bad-request', message: 'decision 必须是 approved|rejected' } })
        try {
          const r = ap.decideTicket({ id, decision, decidedBy })
          cache = null // 队列已变, 快照立即失效
          return send(200, { ok: true, approval: r })
        } catch (e) {
          const code = e?.code === 'terminal' ? 'already-terminal' : 'decide-error'
          return send(e?.code === 'terminal' ? 409 : 400, { ok: false, error: { code, message: String(e?.message ?? e).slice(0, 160) } })
        }
      }
      // ---- W5: engagement 管理面 — 多 src 项目并行/切换/回看 ----
      // start: 新建 requested 节点(web 宿主调度器空闲时 ≤15s in-process 采纳, 忙时派独立 runner);
      //        多开放行(同 target 唯一 + active 总数上限), 新建即选中。
      // resume: frozen/completed → requested(同节点复用, 历史记录全保留)。
      // select: 切换面板视图(纯文件写, 不启停任何 worker)。
      if (method === 'eng') {
        if (req.method !== 'POST') return send(405, { ok: false, error: { code: 'method-error', message: 'POST required' } })
        let body
        try { body = await readBody(req) } catch (e) {
          return send(400, { ok: false, error: { code: 'bad-request', message: String(e?.message ?? e) } })
        }
        const op = String(body.op ?? '')
        try {
          if (op === 'select') {
            const n = String(body.name ?? '').trim()
            const ex = await query(`MATCH (e:Engagement {name:$n}) RETURN e.name AS name`, { n })
            if (!ex[0]?.name) return send(404, { ok: false, error: { code: 'not-found', message: `engagement 不存在: ${n}` } })
            writeSelectedEngagement(n)
            cache = null
            return send(200, { ok: true, selected: n, note: '面板已切换视图 — 池子/战果/轨迹按该 engagement 过滤' })
          }
          if (op === 'resume') {
            const n = String(body.name ?? '').trim()
            const ex = await query(`MATCH (e:Engagement {name:$n}) RETURN e.name AS name, e.status AS st`, { n })
            if (!ex[0]?.name) return send(404, { ok: false, error: { code: 'not-found', message: `engagement 不存在: ${n}` } })
            if (!['frozen', 'completed', 'superseded', 'exhausted'].includes(String(ex[0].st))) {
              return send(409, { ok: false, error: { code: 'bad-status', message: `${n} 状态 ${ex[0].st} 不可续跑(仅终态可 resume)` } })
            }
            await query(`MATCH (e:Engagement {name:$n}) SET e.status='requested', e.cancel='false'`, { n })
            writeSelectedEngagement(n)
            cache = null
            return send(200, { ok: true, name: n, note: '已重新入队 — 调度器 ≤15s 采纳(历史记录保留)' })
          }
          return send(400, { ok: false, error: { code: 'bad-request', message: 'op 必须是 select/resume' } })
        } catch (e) {
          return send(503, { ok: false, error: { code: 'graphd-error', message: String(e?.message ?? e).slice(0, 160) } })
        }
      }
      // ---- 0906: engagement 启停 — start 写 requested 队列节点(web 宿主调度器 ≤15s 采纳),
      //      stop 置 cancel 令牌(调度器栅栏自停, 走既有 P0 取消流程)。目标政策见 start-policy.mjs。
      if (method === 'start' || method === 'stop') {
        if (req.method !== 'POST') return send(405, { ok: false, error: { code: 'method-error', message: 'POST required' } })
        let body
        try { body = await readBody(req) } catch (e) {
          return send(400, { ok: false, error: { code: 'bad-request', message: String(e?.message ?? e) } })
        }
        try {
          if (method === 'start') {
            const v = validateStartRequest(body)
            if (!v.ok) return send(400, { ok: false, error: { code: 'bad-request', message: v.error } })
            // W5 多开: 只拦同目标重复 + 总量上限(不再"同一时刻只允许一个")
            const dup = await query(`MATCH (e:Engagement) WHERE e.status IN ['active','requested'] AND e.target=$t RETURN e.name AS n LIMIT 1`, { t: v.target })
            if (dup[0]?.n) return send(409, { ok: false, error: { code: 'engagement-exists', message: `同目标 engagement ${dup[0].n} 已在跑/排队 — 续跑用「续跑」按钮` } })
            const actives = await query(`MATCH (e:Engagement) WHERE e.status IN ['active','requested'] RETURN count(e) AS n`)
            if (Number(actives[0]?.n ?? 0) >= 4) return send(409, { ok: false, error: { code: 'too-many', message: `已有 ${actives[0].n} 个并行 engagement(上限 4) — 先停掉部分再开` } })
            await query(`CREATE (e:Engagement {name:$n, target:$t, scope:$s, auth:'declared', status:'requested', created_at:$ts, instances:$i, objective:$o})`, {
              n: v.name, t: v.target, s: v.scope, ts: new Date().toISOString(), i: v.instances, o: v.objective,
            })
            writeSelectedEngagement(v.name)
            cache = null
            return send(200, { ok: true, name: v.name, note: '已入队 — 调度器 ≤15s 采纳(多开: 已有项目在跑时自动派独立 runner)' })
          }
          const n = String(body.name ?? '').trim() || readSelectedEngagement()
          if (!n) return send(409, { ok: false, error: { code: 'no-active', message: '无选中 engagement — 先在列表里选择' } })
          const ex = await query(`MATCH (e:Engagement {name:$n}) RETURN e.name AS name, e.status AS st, e.leased_by AS lb, e.lease_at AS la`, { n })
          if (!ex[0]?.name) return send(404, { ok: false, error: { code: 'not-found', message: `engagement 不存在: ${n}` } })
          if (ex[0].st !== 'active' && ex[0].st !== 'requested') return send(409, { ok: false, error: { code: 'bad-status', message: `${n} 状态 ${ex[0].st} 非运行态, 无需停止` } })
          await query(`MATCH (e:Engagement {name:$n}) SET e.cancel='true'`, { n })
          // 租约已死(持有者心跳超 TTL 或无租约) → 调度器不在了, cancel 永远没人消费 —
          // 直接落 frozen + 写 per-eng 暂停文件(在跑的孤儿 worker 下次写图 409 自行收尾)。
          const LEASE_TTL_MS = 120_000 // 与 scheduler LEASE_TTL_MS 同口径
          const leaseAge = Date.now() - Number(ex[0].la ?? 0)
          let frozen = false
          if (!ex[0].lb || !Number.isFinite(leaseAge) || leaseAge > LEASE_TTL_MS) {
            await query(`MATCH (e:Engagement {name:$n}) SET e.status='frozen', e.leased_by='', e.lease_at=0`, { n })
            try {
              const dir = `${process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/config`
              fs.mkdirSync(dir, { recursive: true })
              fs.writeFileSync(`${dir}/paused-${String(n).replace(/[/\\]/g, '_')}.json`, JSON.stringify({ paused: true, eng: n, by: 'panel-stop', at: new Date().toISOString() }))
            } catch { /* 文件失败不阻断: frozen 状态栅栏仍在 */ }
            frozen = true
          }
          cache = null
          return send(200, { ok: true, stopped: n, frozen, note: frozen
            ? `已冻结 ${n}(原租约持有者已死亡) — 孤儿 worker 下次写图 409 自行收尾`
            : `cancel 令牌已置 — 该 engagement 的调度器栅栏自停(其他项目不受影响)` })
        } catch (e) {
          return send(503, { ok: false, error: { code: 'graphd-error', message: String(e?.message ?? e).slice(0, 160) } })
        }
      }
      return send(404, { ok: false, error: { code: 'not-found', message: `unknown d2d API method "${method}"` } })
    },
  }), 'd2d-panel: /d2d/api routes')
  log(`d2d-panel: /d2d/api mounted (graphd ${graphdUrl})`)
}
