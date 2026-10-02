// hooks/register.js — d2d-mods 的唯一 hooks 模块（M3：编排 · 工具桥 · 消毒 · 状态行）
// 形状：export function register(on)；每个 hook 为 async ($, e, next) => …
//
// ⚠️ 硬约束（claude plugin validate 实证）：
//   1) hooks.json 的 `modules` 每插件只允许一项（第二项被拒）→ 全部 hook 必须在本文件；
//   2) $ 只能在「本文件内声明的函数」之间传递，绝不跨 import，且始终字面拼写 $.noun.event(...)。
//   故「纯逻辑」放 src/（只读镜像 / 生成数据），「$ 调用」一律留在本文件。
//
// 分工：M1 = 1 命令 + 1 工具 + 1 门 + 状态行；M2 = 8 工具 × 24 角色全注册 + 门族全接线
//（Bash → domain/scope.checkBash 逐字镜像；CC 工具 → domain/tool-gate.classifyToolGate）。
// M3 = 工具**执行体**桥（$.process.run → scripts/tool-bridge.mjs，真实禁区执行体）+ 三环派生
//（$.agent.spawn）+ turn.complete 收答写 graphd + session.append 消毒接缝。

import { DEFAULT_BASE_URL, buildUrl, buildInit, decodeResponse } from '../src/graphd-client.js'
import { ROLES } from '../src/roles.generated.js'
import { TOOLS } from '../src/tools.generated.js'
import { checkBash } from '../src/domain/scope.mjs'
import { classifyToolGate } from '../src/domain/tool-gate.mjs'
import {
  buildRingSpawns, parseSpawnAgentId, extractTurnReport,
  classifyCategory, buildExperiencePayload, statusLine,
  isUntrustedAppend, droppedMarker,
} from '../src/orchestration.js'
import { buildPaneTree, foldRingState } from '../src/pane.js'

// 工具执行体桥脚本位置（同仓 scripts/，与 hooks/ 同级）。$ 世界无 path/process，用 import.meta.url 定位。
const BRIDGE_PATH = new URL('../scripts/tool-bridge.mjs', import.meta.url).pathname

// 模块级状态：每次加载/热重载都会重置（官方语义，勿依赖跨重载留存）
let baseUrl = DEFAULT_BASE_URL
let token = ''
let srcRoot = ''       // 禁区源仓根（工具桥用；D2D_SRC_ROOT 注入，空=桥内自解析）
let runsBase = ''      // 运行数据根 runs/（工具桥用；D2D_DATA_DIR/runs，空=桥内缺省）
let toolCalls = 0
let gateDenies = 0
let bridged = 0        // 经工具桥执行的 d2d 工具次数
let statusText = 'd2d: 未初始化'
let engCache = { eng: null, healthy: true, ts: 0 }
let ringRuns = []      // 最近一次三环派发：[{ ring, role, agentId }]
let agentRing = new Map()  // agentId → ring（turn.complete 回收时定位环）
let rings = { discovery: 'idle', deep: 'idle', creative: 'idle' }
let ringsDone = 0      // turn.complete 收到且写库成功的轮数
let ringsFailed = 0    // 失败/拒答的轮数
let lastError = ''     // 最近一次错误（进 Pane 与状态行）

// 取当前 active engagement（与 d2d scheduler/state.mjs resolveEngagement 同款查询，60s 缓存）。
const ENG_QUERY = "MATCH (e:Engagement) WHERE e.status='active' RETURN e.scope AS s, e.name AS n ORDER BY coalesce(e.created_at, '') DESC LIMIT 1"

// Claude Code 工具名 → dsh 工具名映射：让 domain/tool-gate.classifyToolGate（按 dsh 名分类）
// 能门住 CC 的对应工具。缺项（CC 无对应物）不映射。
// 只做「名字翻译」，判定逻辑一律来自禁区镜像 tool-gate.mjs。
function gateVerdict(ccName, input) {
  const dshName = { WebFetch: 'web_fetch', WebSearch: 'web_search', Task: 'subagent', Skill: 'skill' }[ccName]
  return dshName ? classifyToolGate(dshName, input ?? {}) : { kind: 'allow' }
}

// graphd 请求 —— 同文件封装，$ 在此字面拼写（唯一允许发请求的地方）
async function graphd($, pathname, body) {
  let res
  try {
    res = await $.http.fetch(buildUrl(baseUrl, pathname), buildInit(token, body))
  } catch (err) {
    // 吞错必须记因（AGENTS.md 纪律 10）：失败原因进返回值，供排障与 fail-closed 分流
    return { ok: false, status: 0, error: 'fetch failed: ' + (err?.message ?? String(err)) }
  }
  return decodeResponse(res)
}

// 解析当前 engagement。优先级：D2D_ENG_SCOPE（env 注入，测试/离线用）→ graphd active。
// 无 engagement 时回落「本机模式」哨兵 scope=127.0.0.1：既保留 checkBash 全部硬规则，
// 又不把顶层会话的普通本地命令（ls/git status）一刀切误杀（d2d 的 worker 恒在 eng 内，
// 顶层 host 会话则可能没有——此为 mod 的 host 语义，见 docs/mods-port-plan.md）。
async function resolveEng($) {
  if (engCache.ts > Date.now() - 60_000) return engCache
  const envScope = await $.env.get('D2D_ENG_SCOPE')
  let eng = null
  let healthy = true
  if (envScope && String(envScope).trim()) {
    eng = { name: '(env)', scope: String(envScope), target: '' }
  } else {
    const r = await graphd($, '/query', { cypher: ENG_QUERY })
    if (!r.ok) healthy = false
    else {
      const row = r.data?.rows?.[0]
      if (row?.s) eng = { name: String(row.n ?? ''), scope: String(row.s), target: '' }
    }
  }
  if (!eng) eng = { name: '(no-engagement)', scope: '127.0.0.1', target: '' }
  engCache = { eng, healthy, ts: Date.now() }
  return engCache
}

// 工具桥调用 —— 唯一 `$.process.run` 拼写点。$ 世界无 fs/子进程，故一切 node: 传染执行体
// （禁区 tools/*.mjs）都经此一次性子进程；返回 {ok,text|error}。
// ⚠️ 签名实证：`$.process.run(argv: string[], init?)` —— 单个 argv 数组（命令在首位），
// 不是 `(cmd, args)` 形式（Phase 2 审计补记：错形被宿主校验拒「takes argv, a non-empty list」）。
// 返回形态 {stdout,stderr,exitCode}；非零退出可能被宿主抛错，此时 err 上仍可能带 stdout。
async function bridge($, payload) {
  let out
  try {
    out = await $.process.run(['node', BRIDGE_PATH, JSON.stringify(payload)], { timeoutMs: 180000 })
  } catch (err) {
    const raw = err?.stdout ?? err?.output
    if (raw) {
      try { return JSON.parse(String(raw)) } catch { /* 落到底下记因 */ }
    }
    return { ok: false, error: 'process.run 失败: ' + (err?.message ?? String(err)) }
  }
  bridged += 1   // 桥调用计数（工具/消毒/回收共用同一子进程通道，单点计数）
  const text = typeof out === 'string' ? out
    : (out?.stdout ?? out?.output ?? out?.result ?? '')
  try {
    return JSON.parse(String(text))
  } catch {
    return { ok: false, error: '工具桥输出无法解析: ' + String(text).slice(0, 300) }
  }
}

// 执行 d2d 工具（真实禁区执行体）：拼入当前 engagement 与 graphd 凭据，交子进程运行。
async function bridgeTool($, tool, args) {
  const { eng } = await resolveEng($)
  const payload = { op: 'tool', tool, args: args ?? {}, eng, graphdUrl: baseUrl, token }
  if (srcRoot) payload.srcRoot = srcRoot
  if (runsBase) payload.runsBase = runsBase
  const r = await bridge($, payload)
  if (!r.ok) return `工具桥错误(${tool}): ${r.error}`
  return r.text ?? ''
}

// 消毒桥（sanitize-ingest 编排 + sanitize.js 真实实现，均 node: 传染 → 走子进程）。
async function bridgeSanitize($, text, source) {
  return bridge($, { op: 'sanitize', text: String(text ?? ''), source: String(source ?? 'unknown') })
}

// 工具调用入口（8 个 d2d 工具共用）：剥掉宿主元数据，把参数交工具桥；成功返回 {result}。
async function runD2dTool($, tool, e) {
  const args = { ...(e ?? {}) }
  delete args.tool
  const text = await bridgeTool($, tool, args)
  return { result: text }
}

// 状态快照（Pane 与状态行共用；纯数据，交 src/pane.js 渲染）。
function snapshot() {
  return {
    graphdHealthy: engCache.healthy,
    engName: engCache.eng?.name ?? '',
    scope: engCache.eng?.scope ?? '',
    rings, toolCalls, gateDenies, bridged, lastError,
  }
}

// 写 graphd（POST）。吞错记因（纪律 10）：失败原因进返回值供排障与 fail-closed 分流。
async function writeGraphd($, pathname, body) {
  const r = await graphd($, pathname, body)
  return r
}

// turn.complete 的「原样放行」。宿主 core 缺省实现 = (e)=>({text:e.answer, ...(e.usage&&{usage:e.usage})})。
// ⚠️ 用户插件**不能** next.to(e,'core')（parser 直接拒：next.to 仅限 managed 插件），
// 也不能 next(e)（测试/无 core 实现时抛「no implementation for turn.complete」）。
// 故放行的唯一可行形态 = 返回该事件的等价结果对象（Phase 2 实证）。
function turnPassthrough(e) {
  const ev = e && typeof e === 'object' ? e : {}
  return ev.usage ? { text: ev.answer, usage: ev.usage } : { text: ev.answer }
}

export function register(on) {
  // ── session.start：读配置、注册命令/工具/角色 ──────────────────
  on('session.start', async ($, e, next) => {
    baseUrl = (await $.env.get('D2D_GRAPH_URL')) || DEFAULT_BASE_URL
    token = (await $.env.get('D2D_GRAPH_TOKEN')) || ''
    // 工具桥 seam（纪律 10）：源仓根与运行数据根均可注入，缺省由桥内按本仓布局自解析。
    srcRoot = (await $.env.get('D2D_SRC_ROOT')) || ''
    const dataDir = (await $.env.get('D2D_DATA_DIR')) || ''
    runsBase = dataDir ? String(dataDir).replace(/\/+$/, '') + '/runs' : ''

    await $.command.register({
      name: 'd2d',
      description: '显示 d2d engagement 状态',
      argumentHint: '[health]',
    })
    await $.command.register({
      name: 'd2d-run',
      description: '派发 d2d 三环（discovery/deep/creative）并行探索，目标为参数',
      argumentHint: '<本轮目标>',
    })

    // 1 个内置状态工具 + 8 个 d2d 工具（元数据来自 src/tools.generated.js）
    await $.tool.register({
      name: 'p2p_status',
      description: '读取 d2d graphd 黑板状态',
      inputSchema: { type: 'object', properties: {}, required: [] },
    })
    for (const t of TOOLS) await $.tool.register(t)

    // 24 个角色 → AgentSpec（执行/派生编排在 M3）。
    // 名字限「字母/数字/_/-，≤64」——故用 `d2d-<roleId>`（roleId 本身即此形态）。
    for (const r of ROLES) {
      await $.agent.register({
        name: 'd2d-' + r.id,
        description: `${r.display_name}（${(r.rings ?? []).join('/')}）`,
        prompt: r.persona,
      })
    }

    statusText = `d2d: 已注册 ${TOOLS.length} 工具 / ${ROLES.length} 角色`
    $.ui.status(statusText)
    return next(e)
  })

  // ── /d2d —— 探 graphd 连通性 + 当前 engagement ─────────────────
  on('command.run', { command: 'd2d' }, async ($) => {
    const r = await graphd($, '/health')
    if (!r.ok) {
      statusText = 'd2d: graphd 离线 (' + r.status + ')'
    } else {
      const { eng } = await resolveEng($)
      statusText = `d2d: graphd 在线 · engagement=${eng.name} scope=${eng.scope}`
    }
    $.ui.invalidate('ui.render')
    return { text: statusText }
  })

  // ── 工具 p2p_status → 完整名 mcp__d2d-mods__p2p_status ─────────
  on('tool.call', { tool: 'mcp__d2d-mods__p2p_status' }, async ($) => {
    const r = await graphd($, '/health')
    const { eng, healthy } = await resolveEng($)
    return { result: JSON.stringify({ health: r, engagement: eng, graphdHealthy: healthy }) }
  })

  // ── /d2d-run —— 三环并行派发（$.agent.spawn 恒后台；答案经 turn.complete 回收）──
  on('command.run', { command: 'd2d-run' }, async ($, e) => {
    const { eng } = await resolveEng($)
    const objective = String(e?.args ?? e?.argument ?? '').trim()
    const spawns = buildRingSpawns({ engagement: eng.name, scope: eng.scope, objective })
    const started = []
    for (const s of spawns) {
      try {
        const res = await $.agent.spawn({ name: 'd2d-' + s.role, prompt: s.prompt })
        const agentId = parseSpawnAgentId(res)
        if (agentId) agentRing.set(agentId, s.ring)
        rings = foldRingState(rings, { ring: s.ring, kind: 'spawn' })
        started.push({ ring: s.ring, role: s.role, agentId })
      } catch (err) {
        rings = foldRingState(rings, { ring: s.ring, kind: 'failed' })
        lastError = `${s.ring} 派发失败: ${err?.message ?? String(err)}`
      }
    }
    ringRuns = started
    statusText = statusLine({ tracked: spawns.length, done: ringsDone, failed: ringsFailed, toolCalls, gateDenies })
    $.ui.invalidate('ui.render')
    const ringsText = started.map((x) => x.ring).join('/') || '（全部失败）'
    return { text: `d2d-run: 派发 ${started.length}/${spawns.length} 环 · ${ringsText}${lastError ? ' · ' + lastError : ''}` }
  })

  // ── 8 个 d2d 工具执行体 → 工具桥（$.process.run 一次性子进程跑禁区执行体）──
  // hook 必须字面（工厂/循环被 validator 拒）→ 逐个显式列出。
  on('tool.call', { tool: 'mcp__d2d-mods__burp_http_log' }, async ($, e) => runD2dTool($, 'burp_http_log', e))
  on('tool.call', { tool: 'mcp__d2d-mods__burp_repeater' }, async ($, e) => runD2dTool($, 'burp_repeater', e))
  on('tool.call', { tool: 'mcp__d2d-mods__burp_intruder' }, async ($, e) => runD2dTool($, 'burp_intruder', e))
  on('tool.call', { tool: 'mcp__d2d-mods__burp_decoder' }, async ($, e) => runD2dTool($, 'burp_decoder', e))
  on('tool.call', { tool: 'mcp__d2d-mods__burp_comparer' }, async ($, e) => runD2dTool($, 'burp_comparer', e))
  on('tool.call', { tool: 'mcp__d2d-mods__burp_scan_status' }, async ($, e) => runD2dTool($, 'burp_scan_status', e))
  on('tool.call', { tool: 'mcp__d2d-mods__p2p_js_scan' }, async ($, e) => runD2dTool($, 'p2p_js_scan', e))
  on('tool.call', { tool: 'mcp__d2d-mods__propose_direction' }, async ($, e) => runD2dTool($, 'propose_direction', e))

  // ── turn.complete —— 收本插件派出的 agent 终答：消毒 + provenance → 写 graphd 经验 ──
  // 事件契约（Phase 2 实证）：{ agentId, answer:<string>, usage? }；hook 以返回结果对象放行
  // （不能 next，见 turnPassthrough 注）。非本插件派发的 turn（agentRing 无记录）原样放行，不污染顶层会话。
  on('turn.complete', async ($, e) => {
    const rep = extractTurnReport(e)
    const ring = rep.agentId ? agentRing.get(rep.agentId) : undefined
    if (!ring) return turnPassthrough(e)
    agentRing.delete(rep.agentId)
    const { eng } = await resolveEng($)
    // 消毒 + provenance 一次子进程（sanitize-ingest/sanitize.js/distill 均 node: 传染）
    const br = await bridge($, {
      op: 'turn-report', text: rep.text, source: 'd2d-' + ring,
      eng: { name: eng.name }, isError: rep.isError,
    })
    const clean = br.ok ? String(br.text ?? '') : ''
    if (br.ok && clean.trim()) {
      const payload = buildExperiencePayload({
        engId: eng.name,
        category: classifyCategory(rep.isError),
        title: `[d2d/${ring}] ${clean.replace(/\s+/g, ' ').trim()}`,
        content: clean,
        scope: eng.scope,
        provenanceHash: br.provenanceHash,
      })
      if (!payload.ok) {
        lastError = payload.error
      } else {
        const w = await writeGraphd($, '/write/experience', payload.body)
        if (!w.ok) lastError = `经验写入失败: ${w.error ?? w.status}`
      }
    } else if (!br.ok) {
      lastError = `消毒失败: ${br.error}`
    }
    rings = foldRingState(rings, { ring, kind: rep.isError ? 'failed' : 'done' })
    if (rep.isError) ringsFailed += 1
    else ringsDone += 1
    statusText = statusLine({ tracked: ringRuns.length || 3, done: ringsDone, failed: ringsFailed, toolCalls, gateDenies })
    $.ui.invalidate('ui.render')
    return turnPassthrough(e)
  })

  // ── session.append —— 不可信外部内容消毒接缝（工具结果 / 子代理行）────────
  // 事件契约（2.1.287 二进制实锚，host `appendInputOf`）：{ message:{ type, content }, door, origin, uuid, agentId? }
  // content 为 string 或 block 数组。⚠️ 该事件是**中间件**：宿主 core 读 next(e) 传下去的
  // e.message.content 决定入库行（「the answer is the row as stored」），故必须 next(改写后的副本)；
  // 且事件对象**冻结**（实测 Object.isFrozen=true，就地赋值抛「readonly property」）→ 一律造新对象。
  // ⚠️ 闸的必要性见 isUntrustedAppend 注：session.append 对每个入库行都触发，若不加闸会把宿主
  // 自身对话（用户原话/助手输出）也标成外部内容并逐行起子进程。
  on('session.append', async ($, e, next) => {
    if (!isUntrustedAppend(e)) return next(e)
    const content = e.message?.content
    // 单块消毒：空白不送（消毒器 empty-guard 会误丢）；ok=false（丢弃/桥失败）一律换占位，原文不放行。
    const one = async (t) => {
      const s0 = String(t ?? '')
      if (!s0.trim()) return s0
      const s = await bridgeSanitize($, s0, 'session-append')
      return s.ok ? String(s.text ?? '') : droppedMarker(s)
    }
    let nextEvent = e
    if (typeof content === 'string') {
      nextEvent = { ...e, message: { ...e.message, content: await one(content) } }
    } else if (Array.isArray(content)) {
      const blocks = []
      for (const b of content) {
        blocks.push(b && b.type === 'text' && typeof b.text === 'string' ? { ...b, text: await one(b.text) } : b)
      }
      nextEvent = { ...e, message: { ...e.message, content: blocks } }
    }
    $.ui.invalidate('ui.render')
    return next(nextEvent)
  })

  // ── 门①：Bash → domain/scope.checkBash（禁区契约，逐字镜像）────
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const cmd = String(e.command ?? '')
    const { eng, healthy } = await resolveEng($)
    const reason = checkBash(cmd, { eng, healthy })
    if (reason) {
      gateDenies += 1
      $.ui.invalidate('ui.render')
      return { deny: 'd2d-gate: ' + reason }
    }
    toolCalls += 1
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // ── 门②：出网/横向/编排类工具 → domain/tool-gate.classifyToolGate ─
  // 每个 CC 工具名一个**字面** hook（mods 要求 hook 为函数字面量/同文件具名函数，
  // 工厂函数与动态循环均被拒）。ask 决策在 tool.check（mods 权限裁决面）。
  on('tool.check', { tool: 'WebFetch' }, async ($, e) => {
    const v = gateVerdict('WebFetch', e?.input ?? e?.args)
    if (v.kind === 'deny') { gateDenies += 1; return { decision: 'deny', reason: v.reason } }
    return v.kind === 'ask' ? { decision: 'ask', reason: v.reason } : { decision: 'allow' }
  })
  on('tool.check', { tool: 'WebSearch' }, async ($, e) => {
    const v = gateVerdict('WebSearch', e?.input ?? e?.args)
    if (v.kind === 'deny') { gateDenies += 1; return { decision: 'deny', reason: v.reason } }
    return v.kind === 'ask' ? { decision: 'ask', reason: v.reason } : { decision: 'allow' }
  })
  on('tool.check', { tool: 'Task' }, async ($, e) => {
    const v = gateVerdict('Task', e?.input ?? e?.args)
    if (v.kind === 'deny') { gateDenies += 1; return { decision: 'deny', reason: v.reason } }
    return v.kind === 'ask' ? { decision: 'ask', reason: v.reason } : { decision: 'allow' }
  })
  on('tool.check', { tool: 'Skill' }, async ($, e) => {
    const v = gateVerdict('Skill', e?.input ?? e?.args)
    if (v.kind === 'deny') { gateDenies += 1; return { decision: 'deny', reason: v.reason } }
    return v.kind === 'ask' ? { decision: 'ask', reason: v.reason } : { decision: 'allow' }
  })

  // ── 状态行：spinner 后缀挂 d2d 计数 ────────────────────────────
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    return next({ ...e, props: { ...e.props, suffix: ` · d2d: ${toolCalls} 调用 / ${gateDenies} 拦截` } })
  })
}
