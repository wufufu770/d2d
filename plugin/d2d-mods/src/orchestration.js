// src/orchestration.js — 三环派生的**纯**逻辑（不接触 $）
// 为什么单列：mods 的 `$` 不得跨 import（见 docs/mods-port-plan.md §2 硬约束），
// 故「拼派发参数 / 解析 turn 回收 / 组经验写体」这类可离线单测的逻辑放这里，
// 真正的 `$.agent.spawn` / `$.http.fetch` 一律留在 hooks/register.js 调用点字面拼写。
//
// 口径：本文件是 d2d `scheduler/loop.mjs` 三环编排的**极简替代**——
// 只做「按环取主力角色 → 派一个 lead」这一步；分配器（allocator/环内并行/收敛判定）
// 属 M4，不在本批。角色 id 逐字取自禁区 roles/*.json（sync-core 已镜像进 roles.generated.js）。

/** 三环 → 领队角色（角色 id 必须存在于 roles.generated.js）。 */
export const RING_LEAD = {
  discovery: 'recon-generalist',
  deep: 'exploit-chainer',
  creative: 'redteam-theorist',
}

/** 环的固定顺序（派发与状态行展示共用）。 */
export const RINGS = ['discovery', 'deep', 'creative']

/** 每环一句话职责（进 brief，给 lead 定调）。 */
const RING_BRIEF = {
  discovery: '资产与攻击面发现：画目标资产地图、路由约定、技术栈指纹、业务功能分区；轻探测为主，不漏。',
  deep: '深度利用：对已确认的攻击面做链式升级，从入口到影响面；每步留可复现证据。',
  creative: '创造性探索：证据枯竭或出现反常信号时，提出值得追的新方向（走 propose_direction），供主控评审。',
}

/**
 * 拼单个环的派发 brief。
 * @param {{ring:string, role:string, engagement?:string, scope?:string, objective?:string}} o
 * @returns {string}
 */
export function buildRingBrief(o = {}) {
  const ring = String(o.ring ?? '')
  const role = String(o.role ?? '')
  const scope = String(o.scope ?? '').trim()
  const eng = String(o.engagement ?? '').trim()
  const objective = String(o.objective ?? '').trim()
  const lines = [
    `[d2d/${ring}] 你是 ${role}（${ring} 环 lead）。`,
    RING_BRIEF[ring] ? RING_BRIEF[ring] : '',
    eng ? `engagement: ${eng}` : '',
    scope ? `授权 scope: ${scope}（越界一律拒绝）` : '授权 scope: 未提供 —— 未确认授权前不得出网',
    objective ? `本轮目标: ${objective}` : '',
    '纪律：出网/横向动作必过 d2d 工具与门；证据回写工具结果；完成后给出结论 + 证据要点。',
  ]
  return lines.filter(Boolean).join('\n')
}

/**
 * 生成三条环的派发参数（纯数据，供 register.js 逐条 $.agent.spawn）。
 * @returns {Array<{ring:string, role:string, prompt:string}>}
 */
export function buildRingSpawns(o = {}) {
  return RINGS.map((ring) => {
    const role = RING_LEAD[ring]
    return { ring, role, prompt: buildRingBrief({ ...o, ring, role }) }
  })
}

/**
 * 从 $.agent.spawn 的返回里取 agentId（宿主版本字段名可能不同，做兼容）。
 * @returns {string} 取不到返回空串（调用方据此决定是否入表追踪）
 */
export function parseSpawnAgentId(result) {
  if (!result || typeof result !== 'object') return ''
  const cands = [result.agentId, result.agent_id, result.id, result.agent?.id]
  for (const c of cands) if (typeof c === 'string' && c.trim()) return c.trim()
  return ''
}

/**
 * 从 turn.complete 事件取「谁 + 最终文本 + 是否失败」。字段名做兼容（不同宿主版本）。
 * @returns {{agentId:string, text:string, isError:boolean, refused:boolean}}
 */
export function extractTurnReport(e) {
  const ev = e && typeof e === 'object' ? e : {}
  const agentId = parseSpawnAgentId(ev) || parseSpawnAgentId(ev.agent ?? {})
  // answer 优先：宿主 turn.complete 事件契约 = { agentId, answer:<string>, usage? }（Phase 2 实证，
  // 见 docs/mods-port-plan.md §API）。其余键名保留以兼容宿主版本差异。
  const textCands = [ev.answer, ev.message, ev.finalMessage, ev.text, ev.result, ev.output]
  let text = ''
  for (const c of textCands) {
    if (typeof c === 'string' && c.trim()) { text = c; break }
    if (c && typeof c === 'object' && typeof c.text === 'string') { text = c.text; break }
  }
  const refused = !!ev.refusal
  const isError = ev.isError === true || ev.error !== undefined || refused
  return { agentId, text: String(text ?? ''), isError, refused }
}

/** 失败 → failure，成功 → success（graphd /write/experience 的 category 枚举）。 */
export function classifyCategory(isError) {
  return isError ? 'failure' : 'success'
}

/**
 * 组 /write/experience 写体（graphd 契约：title 1-64 / content 1-512 / category 枚举 /
 * provenance_hash 必填非空；status/utility_score 由服务端定，调用方不得传）。
 * 纯函数，便于离线断言「长度钳制 + 枚举 + 必填」。
 * @returns {{ok:true, body:object} | {ok:false, error:string}}
 */
export function buildExperiencePayload(o = {}) {
  const provenanceHash = String(o.provenanceHash ?? '').trim()
  if (!provenanceHash) return { ok: false, error: 'provenance_hash 缺失（经验回流溯源指纹必填）' }
  const category = String(o.category ?? '').trim().toLowerCase()
  if (!['success', 'failure', 'pitfall'].includes(category)) {
    return { ok: false, error: `invalid category: ${category || '(empty)'}` }
  }
  const title = String(o.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 64)
  if (!title) return { ok: false, error: 'title 为空' }
  const content = String(o.content ?? '').trim().slice(0, 512)
  if (!content) return { ok: false, error: 'content 为空' }
  return {
    ok: true,
    body: {
      eng_id: String(o.engId ?? ''),
      category,
      title,
      content,
      scope: String(o.scope ?? ''),
      provenance_hash: provenanceHash,
      evidence_ref: '',
    },
  }
}

/**
 * session.append 事件是否来自「不可信外部来源」（工具结果 / 子代理 / 观察者）。
 *
 * 为什么需要闸：`session.append` 对**每一个**入库行触发，含用户自身输入、助手输出、引擎通知。
 * d2d 的 sanitize-ingest 语义是「外部内容消毒」，对宿主自身对话套用会①把用户原话标上
 * `[external:…]` 破坏正常对话，②每行白起一个 node 子进程。故只对下列来源消毒：
 *   door ∈ {tool-result, tool-message}  —— 工具执行结果（web/curl 取回的目标内容）
 *   origin.kind ∈ {peer, observer}       —— 子代理 / 观察者回流的行
 * door/origin 形状经 2.1.287 二进制实锚（host `appendInputOf`/`doorOf`）。
 * @returns {boolean}
 */
export function isUntrustedAppend(e) {
  const ev = e && typeof e === 'object' ? e : {}
  const door = String(ev.door ?? '')
  const origin = ev.origin && typeof ev.origin === 'object' ? ev.origin : {}
  const kind = String(origin.kind ?? '')
  return door === 'tool-result' || door === 'tool-message' || kind === 'peer' || kind === 'observer'
}

/**
 * fail-closed 占位文本：消毒判定为「丢弃」（注入高危/超长/空）或消毒桥失败时，
 * 用它替换原文本 —— **绝不把原始不可信文本放行**（d2d sanitize-ingest 的 fail-closed 语义）。
 * @returns {string}
 */
export function droppedMarker(info = {}) {
  const alerts = Array.isArray(info.alerts) ? info.alerts.filter(Boolean) : []
  const why = alerts.length ? alerts.join(',') : (info.error || 'fail-closed')
  return `[d2d 已拦截外部内容：${String(why).slice(0, 80)}]`
}

/** 状态行文案（纯函数，便于离线断言）。 */
export function statusLine(s = {}) {
  const tracked = Number(s.tracked ?? 0)
  const done = Number(s.done ?? 0)
  const failed = Number(s.failed ?? 0)
  const calls = Number(s.toolCalls ?? 0)
  const denies = Number(s.gateDenies ?? 0)
  return `d2d: 环 ${done}/${tracked} 完成${failed ? `（${failed} 失败）` : ''} · ${calls} 调用 / ${denies} 拦截`
}
