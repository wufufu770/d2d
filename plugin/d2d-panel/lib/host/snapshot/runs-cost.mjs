// snapshot/runs-cost.mjs — 运行事件/token 账本/性价比/转化率(拆分自 snapshot.mjs: 595-732, 逻辑零改动)
import fs from 'node:fs'
import os from 'node:os'
import { MAX } from './const.mjs'

/** 运行事件(scheduler run-log.jsonl + model-usage.jsonl 的面板投影) — 只读 tail, 任意一行坏行跳过。
 *  产出: { events: 轨迹事件(升序), usage: {model: 调度次数}, quotaHits: [model...] } */
export function readRunEvents({ engName, dataDir }, fsImpl = fs, env = process.env) {
  // 0913 审查 H19: engName 未消毒拼路径 — 白名单字符外的全部剥除(防 ../ 路径穿越读任意 jsonl)
  engName = String(engName ?? '').replace(/[^A-Za-z0-9._-]/g, '')
  const out = { events: [], usage: {}, quotaHits: [], resolved: {}, cost: { dispatches24h: 0, terminals24h: 0, workerMin24h: 0, steps24h: 0, quotaEvents24h: 0 } }
  const dir = env.D2D_DATA_DIR ?? dataDir ?? `${os.homedir()}/.d2d-data`
  // 与 scheduler.js RUNS_BASE 同口径: P2P_RUNS_DIR/D2D_RUNS_DIR 优先, 否则 DATA_DIR/runs
  const runs = env.D2D_RUNS_DIR ?? env.P2P_RUNS_DIR ?? `${dir}/runs`
  // model-usage.jsonl: 每 worker 派发一行 {ts, worker, role, model}
  // P2-10 起终态行还带 {event:'terminal', code, ms, quota, steps, tools, compactions} — 这里顺带算 24h 烧速
  const cutoff = Date.now() - 86_400_000
  try {
    const lines = fsImpl.readFileSync(`${runs}/model-usage.jsonl`, 'utf8').split('\n').filter(Boolean).slice(-MAX.usageLines)
    for (const ln of lines) {
      try {
        const r = JSON.parse(ln)
        const m = String(r?.model ?? '')
        if (m && !r?.event) {
          out.usage[m] = (out.usage[m] ?? 0) + 1
          // E44-F5: 实际生效模型面 — 每 dispatch 行 role→model, 后行覆盖前行=最新派发真相。
          // Fleet 卡用它显示真实在跑模型(policies 占位符 <provider>/<model> 不再裸奔)。
          const role = String(r?.role ?? '')
          if (role) out.resolved[role] = m
        }
        const t = r?.ts ? Date.parse(r.ts) : NaN
        if (Number.isFinite(t) && t >= cutoff) {
          if (!r?.event || r.event === 'dispatch') out.cost.dispatches24h++
          else if (r.event === 'terminal') {
            out.cost.terminals24h++
            out.cost.workerMin24h += Number(r.ms ?? 0) / 60_000
            out.cost.steps24h += Number(r.steps ?? 0) || 0
            if (r.quota) out.cost.quotaEvents24h++
          }
        }
      } catch { /* 已记因: 解析容错——model-usage 坏行跳过，不中断其余行烧速统计 */ }
    }
    out.cost.workerMin24h = Math.round(out.cost.workerMin24h)
  } catch { /* 已记因: 降级路径——账本文件缺失/不可读时烧速口径留零值 */ }
  // run-log.jsonl: dispatch/terminal/zero-write/handoff 事件(轨迹主线)
  if (engName) {
    try {
      const lines = fsImpl.readFileSync(`${runs}/${engName}/run-log.jsonl`, 'utf8').split('\n').filter(Boolean).slice(-MAX.runLogLines)
      for (const ln of lines) {
        try {
          const r = JSON.parse(ln)
          const ev = {
            ts: String(r?.ts ?? ''),
            kind: String(r?.event ?? ''),
            worker: String(r?.worker_id ?? ''),
            ring: String(r?.ring ?? ''),
            role: String(r?.role ?? ''),
            model: String(r?.model ?? ''),
            code: r?.code ?? null,
            quota: r?.quota ? String(r.quota) : '',
            reason: String(r?.reason ?? ''),
          }
          if (ev.kind) out.events.push(ev)
          if (ev.kind === 'terminal' && ev.quota && ev.model && !out.quotaHits.includes(ev.model)) out.quotaHits.push(ev.model)
        } catch { /* 已记因: 解析容错——run-log 坏行跳过，不影响其余轨迹事件 */ }
      }
    } catch { /* 已记因: 降级路径——轨迹文件缺失/不可读时事件列表留空 */ }
  }
  return out
}

// ── 阶段2: 性价比卡 — per-engagement token 账本聚合(runs/<eng>/model-usage.jsonl) ──
// 账本行是超集兼容形态(scheduler 既有 dispatch/terminal 行不含 token, 坏行跳过):
//   {ts, worker, role, model, event?, input_tokens?, output_tokens?}
// per-eng 账本缺失 → 回落全局 runs/model-usage.jsonl 按 worker 前缀过滤(worker id =
// '<eng>-<ring>-<suffix>', scheduler 同名口径); source 标账本来源, 卡片展示口径防误读。
export function readModelUsage({ engName, dataDir }, fsImpl = fs, env = process.env) {
  const out = { inputTokens: 0, outputTokens: 0, dispatches: 0, source: 'none' }
  const eng = String(engName ?? '').trim()
  if (!eng) return out
  const dir = env.D2D_DATA_DIR ?? dataDir ?? `${os.homedir()}/.d2d-data`
  const runs = env.D2D_RUNS_DIR ?? env.P2P_RUNS_DIR ?? `${dir}/runs`
  const posTok = (r, keys) => {
    for (const k of keys) {
      const n = Number(r?.[k])
      if (Number.isFinite(n) && n > 0) return n
    }
    return 0
  }
  const safeRead = (p) => {
    try { return fsImpl.readFileSync(p, 'utf8').split('\n').filter(Boolean).slice(-MAX.usageLines) } catch { return null }
  }
  let lines = safeRead(`${runs}/${eng.replace(/[/\\]/g, '_')}/model-usage.jsonl`)
  if (lines) out.source = 'per-eng'
  else {
    lines = safeRead(`${runs}/model-usage.jsonl`)
    if (lines) {
      out.source = 'global-filtered'
      const prefix = `${eng}-`
      lines = lines.filter((ln) => {
        try { return String(JSON.parse(ln)?.worker ?? '').startsWith(prefix) } catch { return false }
      })
    }
  }
  for (const ln of lines ?? []) {
    try {
      const r = JSON.parse(ln)
      if (r?.model && !r?.event) out.dispatches++
      out.inputTokens += posTok(r, ['input_tokens', 'inputTokens'])
      out.outputTokens += posTok(r, ['output_tokens', 'outputTokens'])
    } catch { /* 已记因: 解析容错——token 账本坏行跳过，不计入聚合 */ }
  }
  return out
}

/** 性价比纯计算(阶段2公式): 每 10 万 input tokens 的产出。tokens=0 → null(卡片渲染 '—',
 *  免除以零出假高效); 保留两位小数。总消耗 = input+output 原始 token 数(前端格式化)。 */
export function costEfficiency({ findingsTotal = 0, triagedTotal = 0, inputTokens = 0, outputTokens = 0, dispatches = 0, source = 'none' } = {}) {
  const per100k = (n) => (inputTokens > 0 ? Math.round(((n * 100_000) / inputTokens) * 100) / 100 : null)
  return {
    findings: Math.max(0, Math.round(Number(findingsTotal) || 0)),
    triaged: Math.max(0, Math.round(Number(triagedTotal) || 0)),
    inputTokens: Math.max(0, Math.round(Number(inputTokens) || 0)),
    outputTokens: Math.max(0, Math.round(Number(outputTokens) || 0)),
    dispatches: Math.max(0, Math.round(Number(dispatches) || 0)),
    source,
    findingsPer100k: per100k(findingsTotal),
    triagedPer100k: per100k(triagedTotal),
  }
}

/** 转化率度量(纯函数) — 与 graphd/gd/gates.py:1003-1028 frontier_conversion_rate 同名同义:
 *  两个闭环锚点列各自非空行数 / 总行数(空串/空白串 ref 记空, `v || ''` 与 gates str(v or '') 同义);
 *  空池三值全零(total=0, 两比率 0.0 — 无分母不产 NaN)。
 *  行形态: dict(按列名取, graphd /query 返回形态)或二元组 [a2h, h2c](gates 二元组支同义)。
 *  读侧消费(T2-1-2): 行来自 Q.frontierConversion(Frontier 按 selected eng 过滤); pytest 与本测试同锚。 */
export function computeConversion(rows) {
  let total = 0, a2h = 0, h2c = 0
  for (const r of rows ?? []) {
    const va = Array.isArray(r) ? r[0] : r?.accepted_to_hypothesis_ref
    const vc = Array.isArray(r) ? r[1] : r?.hypothesis_to_confirmed_ref
    total += 1
    if (String(va || '').trim()) a2h += 1
    if (String(vc || '').trim()) h2c += 1
  }
  return { total,
    accepted_to_hypothesis: total > 0 ? a2h / total : 0.0,
    hypothesis_to_confirmed: total > 0 ? h2c / total : 0.0 }
}
