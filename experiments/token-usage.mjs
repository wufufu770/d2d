#!/usr/bin/env node
// experiments/token-usage.mjs — 历史 token 回溯器(T2-1-3, 只读编排)。
//
// 解决的问题: ~/.d2d-data/runs/model-usage.jsonl 的 terminal 行 0 条带 token(实测 1261 条全缺,
// 0929 复核) — 根因是 workers.mjs readSessionTokens 只找旧名 session.jsonl.zstd, 而 dsh v3 会话
// 实际写 session.v3.jsonl.zstd(实测 ~/.dsh/sessions/ 下旧名 1898 / v3 名 1382, 且可共存于同一
// session-* 子目录)。workers.mjs 的活体修复已随本批落地; 本文件把同样的定位+解析约定独立实现,
// 用于**历史** engagement 的 token 回溯(账本上没落的数, 从会话文件里如实例证回来)。
//
// 回溯路径: model-usage.jsonl 按 worker 前缀(=eng 名开头, worker_id 形如 `<eng>-<ring>-<rand>`,
// scheduler.js:422)分组 → 每 worker 在 ~/.dsh/sessions/<cwd 编码>/<session-uuid>/ 下找会话文件
// (v3+旧名候选, v3 优先) → unzstd 解压 → 只计 assistant/message 行的 data.usage 累计
// (每次 LLM 响应的增量; chunk/attempt 行是同一次响应的副本, 计入会双算 —— 与 workers.mjs
// readSessionTokens 同口径)。
//
// 不造假边界: worker↔session 关联失败(worker 一个会话文件都找不到)时该 worker 计 0 并计入
// missing; 全部 worker 都找不到(关联键整体缺失)→ degraded=true, 上层应把 token 效率列标 n/a。
// 解析失败(unzstd 缺失/解压错)同 missing 处理, 绝不编数。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

// 与 plugin/pentest-dsh/scheduler/workers.mjs SESSION_FILE_CANDIDATES 同款约定(v3 优先, 旧名兼容);
// 独立声明以保持 experiments/ 零业务依赖的编排边界, 测试侧断言两者一致。
export const SESSION_FILE_CANDIDATES = ['session.v3.jsonl.zstd', 'session.jsonl.zstd']

// ── 纯函数: worker 前缀分组 — terminal 行按 worker.startsWith(eng) 归组, 去重保序 ──
// 空 eng 直接返回空(空串前缀会误收全量账本, 防呆)。
export function listLedgerWorkers(usageLines, eng) {
  if (!eng) return []
  const seen = new Set()
  const out = []
  for (const line of Array.isArray(usageLines) ? usageLines : []) {
    const w = String(line?.worker ?? '')
    if (line?.event !== 'terminal' || !w.startsWith(eng) || seen.has(w)) continue
    seen.add(w)
    out.push(w)
  }
  return out
}

// ── 纯函数: 单个 session-* 子目录里的会话文件候选选择(v3 优先, 无则旧名, 都无 → null) ──
export function pickSessionFile(entries, candidates = SESSION_FILE_CANDIDATES) {
  for (const name of candidates) {
    if ((Array.isArray(entries) ? entries : []).includes(name)) return name
  }
  return null
}

// ── 纯函数: 会话文本 → usage 累计(只计 assistant/message 行 data.usage, 防副本双算) ──
// 返回 { inputTokens, outputTokens, messages(计到 usage 的响应条数) }; 无 usage 数据 → 全 0。
export function parseSessionUsage(text) {
  let inputTokens = 0
  let outputTokens = 0
  let messages = 0
  for (const line of String(text ?? '').split('\n')) {
    if (!line.includes('"type":"assistant/message"')) continue
    let j
    try { j = JSON.parse(line) } catch { continue }
    const u = j?.data?.usage
    if (!u || !Number.isFinite(Number(u.inputTokens)) && !Number.isFinite(Number(u.outputTokens))) continue
    messages++
    inputTokens += Number(u.inputTokens) || 0
    outputTokens += Number(u.outputTokens) || 0
  }
  return { inputTokens, outputTokens, messages }
}

// ── 定位: sessionsDir 下目录名含 worker_id 的全部会话文件(v3 优先; 多 session-* 子目录全收) ──
// 注: 与 workers.mjs readSessionTokens"最后一处命中"不同, 回溯是统计场景, 命中多份就全量累加。
export function findWorkerSessionFiles(sessionsDir, wid) {
  const files = []
  let dirs
  try { dirs = fs.readdirSync(sessionsDir) } catch { return files }
  for (const d of dirs) {
    if (!d.includes(wid)) continue
    const dir = path.join(sessionsDir, d)
    let subs
    try { subs = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const s of subs) {
      let entries
      try { entries = fs.readdirSync(path.join(dir, s.name)) } catch { continue } // 文件型条目(如 session.lock)/无权限 → 跳过
      const picked = pickSessionFile(entries)
      if (picked) files.push(path.join(dir, s.name, picked))
    }
  }
  return files
}

function unzstd(file) {
  const r = spawnSync('unzstd', ['-c', file], { maxBuffer: 2e8, encoding: 'utf8' })
  if (r.status !== 0 || !r.stdout) return null
  return r.stdout
}

// ── 回溯主入口: 给定 eng 名 → { workers, sessionsFound, missing, inputTokens, outputTokens,
//      degraded, reason }。所有 IO 可注入(ledgerLines/sessionsDir/读文件函数), 测试不碰真目录。──
export function backtrackEngTokens({ eng, ledgerLines, sessionsDir, unzstdFn = unzstd } = {}) {
  if (!eng || typeof eng !== 'string') throw new Error('backtrackEngTokens: eng 名必填')
  const wids = listLedgerWorkers(ledgerLines, eng)
  const missing = []
  let sessionsFound = 0
  let inputTokens = 0
  let outputTokens = 0
  for (const wid of wids) {
    const files = findWorkerSessionFiles(sessionsDir, wid)
    const hits = files.filter((f) => { const t = unzstdFn(f); if (!t) return false; const u = parseSessionUsage(t); inputTokens += u.inputTokens; outputTokens += u.outputTokens; return true })
    if (hits.length) sessionsFound += hits.length
    else missing.push(wid)
  }
  const degraded = wids.length > 0 && sessionsFound === 0
  const reason = wids.length === 0
    ? `账本 model-usage.jsonl 无前缀 ${eng} 的 terminal worker — 无从回溯`
    : degraded
      ? `${wids.length} 个 worker 全部未找到会话文件(缺 session 映射或已清理) — token 列降级 n/a`
      : missing.length
        ? `部分回溯: ${sessionsFound} 个会话文件命中, ${missing.length} 个 worker 未命中(${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''})`
        : `全部命中: ${wids.length} 个 worker / ${sessionsFound} 个会话文件, 无降级`
  return { workers: wids.length, sessionsFound, missing, inputTokens, outputTokens, degraded, reason }
}

// ── CLI(调试用): node experiments/token-usage.mjs <eng名> ──
async function main(argv) {
  const eng = argv[0]
  if (!eng) { console.error('用法: node experiments/token-usage.mjs <eng名>'); process.exit(2) }
  const runsDir = process.env.P2P_RUNS_DIR ?? path.join(process.env.D2D_DATA_DIR ?? path.join(os.homedir(), '.d2d-data'), 'runs')
  const ledgerFile = path.join(runsDir, 'model-usage.jsonl')
  const ledgerLines = fs.existsSync(ledgerFile)
    ? fs.readFileSync(ledgerFile, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
    : []
  const sessionsDir = path.join(os.homedir(), '.dsh', 'sessions')
  const r = backtrackEngTokens({ eng, ledgerLines, sessionsDir })
  console.log(JSON.stringify(r, null, 2))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main(process.argv.slice(2))
