// retest-tri.mjs — 复测结论三态+入图层(E38/1.7.0 P1, reArtex 语义移植)
// 与既有 retest.mjs(retestFacts 重放执行层, first-run 消费)正交: 本模块只做"结论显式化+入图+工单闭环",
// 重放执行仍在 retestFacts(verifyRunner)或外部执行器(SRC 平台 payload 显式携带)。
// 三态: reproducible(仍可复现)|fixed(已修复)|unconfirmable(无法确认)
// 写回映射(graphd /write/verification, kind='retest' 上游枚举已收录):
//   pass → reproducible → verdict='pass';  fail → fixed → verdict='fail';
//   manual/异常/未知词 → unconfirmable → verdict='held-unreviewed'(fail-closed 归人工)
// run_id=retest-<ts> 去重门键(同键重放=端点幂等拒重, 编排重试安全); VERIFIED_BY 边端点自动挂。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const RETRI_STATES = ['reproducible', 'fixed', 'unconfirmable']
const WIRE_VERDICT = { reproducible: 'pass', fixed: 'fail', unconfirmable: 'held-unreviewed' }
const LABEL = { reproducible: '仍可复现', fixed: '已修复', unconfirmable: '无法确认' }

/** 判定映射(纯函数): verify-runner 词表(pass/fail/manual) → 三态 + wire 词。未知词 fail-closed。 */
export function classifyRetest({ verdict, error } = {}) {
  const v = String(verdict ?? '').trim().toLowerCase()
  if (error || v === '' || v === 'manual') return { triState: 'unconfirmable', wireVerdict: WIRE_VERDICT.unconfirmable, label: LABEL.unconfirmable }
  if (v === 'pass') return { triState: 'reproducible', wireVerdict: WIRE_VERDICT.reproducible, label: LABEL.reproducible }
  if (v === 'fail') return { triState: 'fixed', wireVerdict: WIRE_VERDICT.fixed, label: LABEL.fixed }
  return { triState: 'unconfirmable', wireVerdict: WIRE_VERDICT.unconfirmable, label: LABEL.unconfirmable }
}

/** 复测结论编排: 取判定 → 分类 → 写回 Verification → 返回结论。
 *  replayImpl: async () => { verdict, evidence?, error? } — 重放注入(外部执行器/测试)。
 *  graphWrite: async (payload) => void — /write/verification 投递注入(单测记录器; CLI 为真 fetch)。 */
export async function runRetest({ findingRef, runId, replayImpl, graphWrite, now = () => new Date().toISOString(), evidenceCap = 500 } = {}) {
  if (!findingRef) throw new Error('findingRef required (复测结论必须挂靠 Finding)')
  if (!runId) throw new Error('runId required (去重门键)')
  let replayOutcome
  try {
    replayOutcome = await replayImpl()
  } catch (e) {
    replayOutcome = { verdict: 'manual', error: String(e?.message ?? e).slice(0, 200) }
  }
  const { triState, wireVerdict, label } = classifyRetest(replayOutcome)
  const evidence = String(replayOutcome?.evidence ?? '').slice(0, evidenceCap)
  const note = `retest tri-state: ${triState}(${label})${replayOutcome?.error ? ` — ${replayOutcome.error}` : ''}${evidence ? ` — ${evidence}` : ''}`.slice(0, 500)
  const payload = {
    kind: 'retest', verdict: wireVerdict, run_id: runId, finding_ref: findingRef,
    executor: 'retest-tri', ts: now(), note,
  }
  if (graphWrite) await graphWrite(payload)
  return { findingRef, triState, label, wireVerdict, note, payload }
}

/** WorkItems 收口(独立 CLI 进程与宿主轮询共享 workitems.json 单一事实源 — 原子写+低频;
 *  并发形态=last-write-wins, devlog E38 记因)。须 assigned 态(panel 放行后)。 */
export function completeWorkitem(wiFile, id, { triState, note } = {}, { now = () => new Date().toISOString() } = {}) {
  let data
  try { data = JSON.parse(fs.readFileSync(wiFile, 'utf8')) } catch { throw new Error(`workitems 文件不可读: ${wiFile}`) }
  const item = (data.items ?? []).find((w) => w.id === id)
  if (!item) throw new Error(`workitem 不存在: ${id}`)
  if (item.status !== 'assigned') throw new Error(`workitem ${id} 状态=${item.status}, 须 assigned 才能收口`)
  item.status = 'done'
  item.updatedAt = now()
  item.disposition = { decision: triState ?? 'retest-done', reason: String(note ?? '').slice(0, 200) }
  item.history.push({ at: item.updatedAt, status: 'done', actor: 'retest-tri', note: `复测三态=${triState}` })
  const tmp = `${wiFile}.tmp-${process.pid}`
  fs.mkdirSync(path.dirname(wiFile), { recursive: true })
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
  fs.renameSync(tmp, wiFile)
  return item
}

// ── CLI(薄壳: 真网络面集中于此, 模块面零 I/O) ─────────────────────────────────
function readHostToken() {
  try { return fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim() } catch { return '' }
}

async function cliMain(argv) {
  const has = (f) => argv.includes(f)
  const arg = (f) => (has(f) ? argv[argv.indexOf(f) + 1] : undefined)
  if (has('--help') || !arg('--finding')) {
    console.log('用法: node scripts/xring/retest-tri.mjs --finding F-1 [--replay-result pass|fail|manual] [--run-id retest-x] [--complete-workitem wi-xxx] [--dry-run]')
    process.exit(has('--finding') ? 0 : 2)
  }
  const findingRef = String(arg('--finding'))
  const graphdUrl = process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766'
  const token = readHostToken()
  if (!token && !has('--dry-run')) { console.error('✗ host-token 不可读(~/.config/d2d/host-token) — graphd 写面需要'); process.exit(2) }
  const runId = String(arg('--run-id') ?? `retest-${Date.now().toString(36)}`)
  const graphWrite = has('--dry-run')
    ? async (payload) => console.log('[dry-run] /write/verification payload:', JSON.stringify(payload, null, 2))
    : async (payload) => {
        const res = await fetch(`${graphdUrl}/write/verification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Auth': token },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15000),
        })
        const j = await res.json().catch(() => ({}))
        if (!res.ok || !j?.ok) throw new Error(`verification write HTTP ${res.status}: ${JSON.stringify(j).slice(0, 160)}`)
        console.log(`[retest-tri] Verification 落图 id=${j.id ?? '(dup)'} duplicate=${j.duplicate ?? false}`)
      }
  const r = await runRetest({
    findingRef,
    runId,
    replayImpl: async () => ({ verdict: arg('--replay-result') ?? 'manual', evidence: '外部执行器提供(--replay-result)' }),
    graphWrite,
  })
  console.log(`[retest-tri] ${findingRef} → 三态=${r.triState}(${r.label}) wire=${r.wireVerdict}`)
  const wi = arg('--complete-workitem')
  if (wi) {
    const wiFile = process.env.D2D_DATA_DIR ? `${process.env.D2D_DATA_DIR}/workitems.json` : `${os.homedir()}/.d2d-data/workitems.json`
    completeWorkitem(wiFile, wi, { triState: r.triState, note: r.note })
    console.log(`[retest-tri] workitem ${wi} → done(三态已回写)`)
  }
}

const isMain = process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href
if (isMain) await cliMain(process.argv.slice(2)).catch((e) => { console.error(`✗ ${e.message}`); process.exit(1) })
