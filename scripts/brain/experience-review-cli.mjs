#!/usr/bin/env node
// experience-review-cli.mjs — 3.5-4-3 人工审计接口 CLI(经验隔离池晋级/退役; 确定性无交互)
// 形态沿 scripts/brain/promote.mjs(--graph 端口 + ~/.config/d2d/host-token 先例; 纯 argv 驱动,
// 无任何 prompt)。转态写通道 = /write/experience-transition(host-only, graphd/app.py), 状态机
//(gd/gates.py EXPERIENCE_TRANSITIONS)仅两条合法迁移:
//   promote <id>  quarantined → active      (晋级出池 — 跨 engagement 佐证评审的人工通道)
//   reject  <id>  active → deprecated       (退役否决 — 状态机单向, 隔离行须经 promote 出池后才可
//                                            reject; 对 quarantined 条目直接 reject 会被端点
//                                            400 illegal transition 原样回显, 绝不绕状态机)
// 用法:
//   experience-review-cli.mjs list                         列 quarantined 隔离池(id/title/category/eng_id/created_at)
//   experience-review-cli.mjs promote <id> --note <text>   隔离 → active(reviewer_note 必填 1-80 字)
//   experience-review-cli.mjs reject  <id> --note <text>   active → deprecated(reviewer_note 必填 1-80 字)
//   experience-review-cli.mjs --status                     池概况(quarantined/active/deprecated 三态计数)
// 选项: --graph <port>(缺省 8766, promote.mjs 同名先例)
// 退出码: 0 成功 / 1 graphd 或转态被拒 / 2 用法错误(缺参数/非法 note)。reviewer_note 从 --note 取。
// 读通道 = /query/experience(status 单值过滤, graphd/app.py:1066+); 全部参数绑定, 无拼串。
import fs from 'node:fs'
import os from 'node:os'
import { pathToFileURL } from 'node:url'

const USAGE = `用法: experience-review-cli.mjs list | promote <id> --note <text> | reject <id> --note <text> | --status [--graph <port>]
转态: promote=quarantined→active(晋级出池); reject=active→deprecated(退役; 状态机单向, 隔离行须先 promote)。
reviewer_note 必填 1-80 字(--note)。host token 读 ~/.config/d2d/host-token(promote.mjs 先例)。`

// ── 纯函数层(单测真源): argv 解析 / 载荷构造 / note 校验 ─────────────────────────
// gates.experience_transition_gate 同口径: reviewer_note strip 后 1-80 字符, 越界即抛(用法错误)。
export function validateNote(note) {
  const n = String(note ?? '').trim()
  if (!n || n.length > 80) throw new RangeError(`--note 必填且 1-80 字符(当前 ${n.length} 字): 为什么转态(可追溯)`)
  return n
}

export function parseArgs(argv = []) {
  const a = [...(argv ?? [])].map(String)
  const gi = a.indexOf('--graph')
  const graph = gi > -1 ? String(a[gi + 1] || '8766') : '8766'
  const ni = a.indexOf('--note')
  const note = ni > -1 ? String(a[ni + 1] ?? '') : ''
  // 选项值剔除仅在选项在位时生效(gi/ni = -1 时其 +1 会误剔首位置参数 — promote.mjs:27 同类旧坑)
  const rest = a.filter((x, i) => {
    if (x === '--graph' || x === '--note') return false
    if (gi > -1 && i === gi + 1) return false
    if (ni > -1 && i === ni + 1) return false
    return true
  })
  const cmd = rest[0] ?? ''
  const id = rest[1] ?? ''
  return { cmd, id, note, graph }
}

// 转态载荷(promote→active / reject→deprecated; 与 experience-review.mjs 自动评审同通道同字段)
export function buildTransitionPayload({ action, id, note }) {
  const nid = String(id ?? '').trim()
  if (!nid) throw new RangeError('experience id 必填: promote <id> / reject <id>')
  const target = action === 'promote' ? 'active' : action === 'reject' ? 'deprecated' : ''
  if (!target) throw new RangeError(`未知动作: ${action}(仅 promote|reject)`)
  return { experience_id: nid, target_status: target, reviewer_note: validateNote(note) }
}

// 隔离池拉取载荷(列 quarantined; min_utility_score=0 全量, limit 顶格评审同款量级)
export function buildListPayload() {
  return { status: 'quarantined', min_utility_score: 0, limit: 10_000 }
}

// --status 概况载荷: 三态逐一计数(status 单值过滤故三次查询, distill fetchExistingPool 先例)
export function buildStatusPayloads() {
  return ['quarantined', 'active', 'deprecated'].map((status) => ({ status, min_utility_score: 0, limit: 1 }))
}

// ── IO 层(可注入): token 读取 + fetch 传输 ───────────────────────────────────────
// host token: ~/.config/d2d/host-token(promote.mjs gq / migrate-experience-class.mjs 同一先例;
// 文件属操作员主机侧密钥, 不入库不入日志)。缺文件→确定性报错退出 1。
export function readHostToken({ homedir = os.homedir(), readFile = (p) => fs.readFileSync(p, 'utf8') } = {}) {
  const p = `${homedir}/.config/d2d/host-token`
  try {
    const tok = String(readFile(p) ?? '').trim()
    if (!tok) throw new Error('空 token')
    return tok
  } catch (e) {
    throw new Error(`host-token 不可读(${p}): ${String(e?.message ?? e).slice(0, 120)} — 先完成 graphd 安装(生成 host-token)`)
  }
}

export async function postJson({ base, path, payload, token, timeoutMs = 10_000, fetchLike = null }) {
  const url = new URL(path, base)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('非 http(s) graphd 地址')
  const doFetch = fetchLike ?? fetch
  const res = await doFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Auth': token } : {}) },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}

// ── 编排(返回退出码; 全部确定性输出, 零交互) ─────────────────────────────────────
export async function main(argv = [], deps = {}) {
  const { graph: _g, fetchLike, homedir, readFile, stdout = console.log, stderr = console.error } = deps
  const graph = _g ?? parseArgs(argv).graph
  const base = `http://127.0.0.1:${graph}`
  let args
  try {
    args = parseArgs(argv)
    if (args.cmd !== 'list' && args.cmd !== 'promote' && args.cmd !== 'reject' && args.cmd !== '--status') {
      stderr(USAGE)
      return 2
    }
  } catch (e) {
    stderr(USAGE)
    return 2
  }
  const touched = []
  try {
    const token = deps.token ?? readHostToken({ homedir, readFile })
    // list — 列 quarantined 隔离池
    if (args.cmd === 'list') {
      const r = await postJson({ base, path: '/query/experience', payload: buildListPayload(), token, fetchLike })
      if (r.status !== 200 || !r.data?.ok) {
        stderr(`❌ 拉取隔离池失败: status=${r.status} ${String(r.data?.error ?? '').slice(0, 160)}`)
        return 1
      }
      const rows = Array.isArray(r.data.experiences) ? r.data.experiences : []
      stdout(`隔离池(quarantined)共 ${rows.length}${r.data.truncated ? '+(truncated)' : ''} 条:`)
      for (const x of rows) {
        touched.push(String(x.id ?? ''))
        stdout(`${String(x.id ?? '?')}  [${String(x.category ?? '?')}]  eng=${String(x.eng_id ?? '')}  ${String(x.created_at ?? '')}  ${String(x.title ?? '').slice(0, 60)}`)
      }
      return 0
    }
    // --status — 池概况(三态计数)
    if (args.cmd === '--status') {
      const counts = {}
      for (const p of buildStatusPayloads()) {
        const r = await postJson({ base, path: '/query/experience', payload: p, token, fetchLike })
        if (r.status !== 200 || !r.data?.ok) {
          stderr(`❌ 拉取 ${p.status} 池失败: status=${r.status} ${String(r.data?.error ?? '').slice(0, 160)}`)
          return 1
        }
        counts[p.status] = Number(r.data.count ?? (Array.isArray(r.data.experiences) ? r.data.experiences.length : 0))
      }
      stdout(`经验池概况: quarantined(待评审)=${counts.quarantined} / active(现役)=${counts.active} / deprecated(退役)=${counts.deprecated}`)
      return 0
    }
    // promote/reject — /write/experience-transition(同通道, 目标态不同)
    const action = args.cmd
    const payload = buildTransitionPayload({ action, id: args.id, note: args.note })
    const r = await postJson({ base, path: '/write/experience-transition', payload, token, fetchLike })
    if (r.status !== 200 || !r.data?.ok) {
      stderr(`❌ ${action} ${payload.experience_id} 被拒: status=${r.status} ${String(r.data?.error ?? '').slice(0, 200)}`)
      return 1
    }
    stdout(`✅ ${r.data.id ?? payload.experience_id}: ${r.data.from ?? '?'} → ${r.data.to ?? payload.target_status}(note: ${payload.reviewer_note})`)
    return 0
  } catch (e) {
    stderr(`❌ ${String(e?.message ?? e).slice(0, 200)}`)
    return e instanceof RangeError ? 2 : 1
  }
}

// 直执行守卫(被 import 做函数级测试时不触发任何 IO)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => { console.error(`❌ ${String(e?.message ?? e).slice(0, 200)}`); process.exit(1) })
}
