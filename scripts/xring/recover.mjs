// scripts/xring/recover.mjs — X-Ring 生命周期管理（XR-P3 族 3/拍板 3+5+6）
// 孤儿回收: running 态 run 且 worker 确死（pid ESRCH）或心跳超时（host 重启形态）→
// 标 stopped reason=orphaned + 尝试回流遗留 workspace 工件（数据保全优先; 档位尊重
// monitor-start 落档——off=只标不回流; schema 外工件不碰不炸）。
// stray worker: liveWorkerPids 对照 running run 记录 pid → **报告不擅杀**（杀归显式 stop）。
// 心跳: budget-tick 即心跳（拍板 6）; running 且心跳超时但 pid 活着 = monitor 失联裸奔形态
// → stale 警告建议 stop，不自动标记（自动耦合杀=PDEATHSIG 调查项登记非必做）。
import fs from 'node:fs'
import path from 'node:path'
import { readXringRuns } from '../../plugin/d2d-panel/lib/host/snapshot.mjs'
import { readEvents, appendEvent } from './monitor.mjs'
import { reflow } from './reflow.mjs'

/** 心跳超时阈（生产 poll 30s → 4 拍无心跳=monitor 失联）; env P2P_XRING_STALE_MS 可调。 */
export const STALE_AFTER_MS_DEFAULT = 120_000

function pidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e?.code === 'EPERM' // EPERM=进程存在（他主）仍算活
  }
}

/**
 * worker pid/workspace 提取: 优先 worker.json 旁记录（XR-P4④——events 尾窗 400 行在
 * 超长 run 会滚出 worker-spawned 行）; 回退 worker-spawned 事件（P3 形态兼容）。
 */
function workerOf(runDir, events) {
  try {
    const side = JSON.parse(fs.readFileSync(path.join(runDir, 'worker.json'), 'utf8'))
    if (Number.isFinite(Number(side.pid)) || side.workspace) {
      return { pid: Number(side.pid) || null, workspace: side.workspace ? String(side.workspace) : null }
    }
  } catch { /* 旁记录缺/坏=回退事件形态 */ }
  const w = [...events].reverse().find((e) => e.event === 'worker-spawned')
  return w ? { pid: Number(w.pid) || null, workspace: w.workspace ? String(w.workspace) : null } : { pid: null, workspace: null }
}

/**
 * 扫 recordRoot 执行孤儿回收与失联检测。
 * opts: { recordRoot, staleAfterMs?, nowMs?, graphdUrl?, hostToken?, reflowFn?, livePids? }
 * reflowFn/livePids 注入点=测试; 缺省真 reflow（graphdUrl/hostToken 缺省 env P2P_GRAPHD/
 * P2P_HOST_TOKEN——凭据只从环境读, 不落源码）与 liveWorkerPids()。
 * 返回 { orphaned, stale, strays, active } —
 *   orphaned: [{eng, runId, why: 'pid-dead'|'heartbeat-stale', reflow: {...}|null, note?}]
 *   stale:    [{eng, runId, idleMs}]（running+心跳超时但 pid 活/未知且新鲜——只警告）
 *   strays:   [{pid}]（活 worker 进程不属于任何 running run——报告不杀）
 *   active:   [{eng, runId}]（健康 running——单活跃守卫用）
 */
export async function recoverRuns(opts) {
  const { recordRoot, graphdUrl = process.env.P2P_GRAPHD ?? '', hostToken = process.env.P2P_HOST_TOKEN ?? '', reflowFn = reflow, livePids = null } = opts
  const staleAfterMs = opts.staleAfterMs ?? (Number(process.env.P2P_XRING_STALE_MS) || STALE_AFTER_MS_DEFAULT)
  const nowMs = opts.nowMs ?? Date.now()
  const snap = readXringRuns({ base: recordRoot }, fs, process.env)
  const orphaned = []
  const stale = []
  const active = []
  const liveRunPids = new Set()
  for (const run of snap.runs) {
    if (run.status !== 'running') continue
    const events = readEvents(path.join(recordRoot, run.eng, run.runId, 'events.jsonl'), 400)
    const { pid, workspace } = workerOf(path.join(recordRoot, run.eng, run.runId), events)
    if (pid && pidAlive(pid)) liveRunPids.add(pid)
    const lastEv = events[events.length - 1]
    const idleMs = lastEv?.ts ? Math.max(0, nowMs - Date.parse(lastEv.ts)) : null
    const heartbeatStale = idleMs !== null && idleMs > staleAfterMs
    const pidDead = pid !== null && !pidAlive(pid)
    if (pidDead || (pid === null && heartbeatStale)) {
      // 孤儿: worker 确死 / host 重启过（pid 不可知+心跳超时）。标 stopped + 数据保全回流。
      appendEvent(path.join(recordRoot, run.eng, run.runId, 'events.jsonl'), {
        event: 'stop', reason: 'orphaned', detail: pidDead ? `worker pid ${pid} dead` : `heartbeat stale ${Math.round((idleMs ?? 0) / 1000)}s`,
      })
      let rf = null
      let note
      if (run.mode === 'off') note = 'mode=off——只标不回流（零图写档）'
      else if (!workspace) note = 'workspace 未知（无 worker-spawned 事件）——遗留工件需人工定位'
      else if (!graphdUrl || !hostToken) note = 'graphd 凭据缺（env P2P_GRAPHD/P2P_HOST_TOKEN）——标记完成, 回流跳过'
      else rf = await reflowFn({ workspace, runId: run.runId, graphdUrl, hostToken, eventsFile: path.join(recordRoot, run.eng, run.runId, 'events.jsonl'), eng: run.eng, mode: run.mode ?? 'queue' })
      orphaned.push({ eng: run.eng, runId: run.runId, why: pidDead ? 'pid-dead' : 'heartbeat-stale', reflow: rf, note })
    } else if (heartbeatStale) {
      // monitor 失联但 worker 活着（裸奔形态）——只警告, 干预归显式 stop（拍板 6）
      stale.push({ eng: run.eng, runId: run.runId, idleMs })
      active.push({ eng: run.eng, runId: run.runId })
    } else {
      active.push({ eng: run.eng, runId: run.runId })
    }
  }
  // stray worker: 活进程 - live run 记录 pid = 报告对象（不擅杀）
  const strays = (livePids ?? []).filter((p) => !liveRunPids.has(p)).map((p) => ({ pid: p }))
  return { orphaned, stale, strays, active }
}
