#!/usr/bin/env node
// scripts/tool-bridge.mjs — M3 工具执行体桥（一次性 Node 子进程）
//
// 为什么需要它：d2d 禁区 `plugin/pentest-dsh/tools/*.mjs` 与 `sanitize.js` 的执行体依赖
// `node:fs` / 全局 `fetch` / 进程环境，无法在 mods 的 `$` 世界（无 Node 直通、无 fs）内运行。
// 故由 mods 侧经 `$.process.run` 调起本脚本，把「操作 + 参数」交给真实禁区执行体，取回 JSON。
//
// 契约（stdin/stdout 全 JSON，单次一调）：
//   in : { op?, tool?, args?, eng?, runsBase?, graphdUrl?, token?, text?, source?, dataDir?, srcRoot? }
//        op 缺省 = 'tool'（执行 d2d 工具）；op='sanitize'（外部内容消毒编排）
//   out: { ok: true, text, ... } | { ok: false, error }
//   exit: ok→0, 否则 1（mods 侧据 exit code 与 stdout 分流）
//
// 环境 seam（AGENTS.md 纪律 10）：源仓根与运行目录都可注入，缺省回落本仓布局。
//   D2D_SRC_ROOT  禁区源仓根（含 tools/ 与 domain/）；缺省 = 本仓 plugin/pentest-dsh
//   D2D_DATA_DIR  运行数据根（runs/ 与 config/）；缺省 = ~/.d2d-data
//   D2D_GRAPH_URL / D2D_GRAPH_TOKEN  graphd 地址与凭据
//
// 主流程守卫（纪律 10）：被测试 import 时不得执行直跑体。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 源仓根解析：显式 env → 本仓相对布局（本仓 plugin/d2d-mods/scripts → plugin/pentest-dsh） */
export function resolveSrcRoot(env = process.env) {
  const explicit = env.D2D_SRC_ROOT
  if (explicit && fs.existsSync(path.join(explicit, 'tools', 'index.mjs'))) return explicit
  return path.resolve(__dirname, '..', '..', 'pentest-dsh')
}

/** graphd 只读查询通道（供 scan_status 等需要 q 的执行体）：返回 rows 数组，失败抛错。 */
function makeQuery({ graphdUrl, token, fetchImpl = globalThis.fetch }) {
  return async function q(cypher, params) {
    const res = await fetchImpl(`${graphdUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Auth': token } : {}) },
      body: JSON.stringify(params ? { cypher, params } : { cypher }),
      signal: AbortSignal.timeout(15_000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.ok === false) throw new Error(`/query HTTP ${res.status}: ${data?.error ?? ''}`)
    return Array.isArray(data?.rows) ? data.rows : []
  }
}

/**
 * 执行一个 d2d 工具（真实禁区执行体）。
 * @returns {Promise<{ok:boolean, text?:string, error?:string}>}
 */
export async function executeTool(req = {}) {
  const {
    tool = '', args = {}, eng = null,
    runsBase, graphdUrl = 'http://127.0.0.1:8766', token = '',
    dataDir = process.env.D2D_DATA_DIR ?? path.join(os.homedir(), '.d2d-data'),
    srcRoot = resolveSrcRoot(),
  } = req
  try {
    const load = (rel) => import(pathToFileURL(path.join(srcRoot, rel)).href)
    const [burp, jsScanner, frontier, scopeMod] = await Promise.all([
      load('tools/index.mjs'), load('tools/js-scanner.mjs'),
      load('tools/frontier.mjs'), load('domain/scope.mjs'),
    ])
    const { checkBash } = scopeMod
    const capsPath = path.join(dataDir, 'config', 'caps.json')

    // 捕获注册：三个注册器都经 tools.register(def) 交出执行体；defineTool 用恒等（此处只取 def）。
    const captured = new Map()
    const registry = { register: (def) => { captured.set(def.name, def) } }
    const defineTool = (def) => def

    const engObj = eng ? { name: eng.name ?? '', scope: eng.scope ?? '', target: eng.target ?? '' } : null
    const resolveEng = async () => ({ eng: engObj, healthy: true })
    // scope 门：逐字复用禁区 checkBash；eng 缺失时其自身 fail-closed（与 d2d 工具面同契约）
    const scopeCheck = (cmd, e) => checkBash(cmd, { eng: e ?? engObj, healthy: true })
    const capsCfg = () => { try { return JSON.parse(fs.readFileSync(capsPath, 'utf8')) } catch { return null } }
    const q = makeQuery({ graphdUrl, token })

    const shared = {
      runsBase: runsBase ?? process.env.P2P_RUNS_DIR ?? path.join(dataDir, 'runs'),
      resolveEng, checkBash: scopeCheck, capsCfg, q,
    }
    burp.registerBurpTools(registry, defineTool, shared)
    jsScanner.registerJsScanner(registry, defineTool, shared)
    frontier.registerFrontierTools(registry, defineTool, { ...shared, graphdUrl, token, whoami: () => 'd2d-mods' })

    const def = captured.get(tool)
    if (!def) return { ok: false, error: `未知工具: ${tool}（可桥: ${[...captured.keys()].join(', ')}）` }
    const text = await def.execute(args)
    return { ok: true, text: String(text ?? '') }
  } catch (err) {
    return { ok: false, error: `工具桥失败(${tool}): ${err?.stack ?? err?.message ?? String(err)}` }
  }
}

/**
 * 外部内容消毒编排（sanitize-ingest + sanitize + 词表 loader，均 node: 传染 → 走子进程）。
 * 逐字复用禁区实现，本函数只做装配。
 * @returns {Promise<{ok:boolean, text?:string, dropped?:boolean, alerts?:string[], via?:string[], error?:string}>}
 */
export async function executeSanitize(req = {}) {
  const {
    text = '', source = 'unknown', maxLen = 20_000,
    srcRoot = resolveSrcRoot(),
  } = req
  try {
    const load = (rel) => import(pathToFileURL(path.join(srcRoot, rel)).href)
    const [ingest, sanitizeMod, patternsMod] = await Promise.all([
      load('domain/sanitize-ingest.mjs'), load('sanitize.js'), load('config/injection-patterns.mjs'),
    ])
    let patterns = []
    try { patterns = patternsMod.hotJsPatterns() ?? [] } catch { patterns = [] }
    const r = ingest.sanitizeIngestExternal(String(text), {
      source: String(source), maxLen: Number(maxLen) || 20_000,
      sanitizeImpl: sanitizeMod.sanitizeUntrusted, patterns,
    })
    // ok=false = fail-closed 整条丢弃（semantics 见 sanitize-ingest 头注）——桥不翻转该语义
    return { ok: !!r.ok, text: String(r.text ?? ''), dropped: !r.ok, alerts: r.alerts ?? [], via: r.via ?? [] }
  } catch (err) {
    return { ok: false, dropped: true, error: `消毒桥失败: ${err?.stack ?? err?.message ?? String(err)}` }
  }
}

/**
 * turn.complete 回收编排（一次子进程做完两件 node: 事）：
 *   ① 外部内容消毒（sanitize-ingest + sanitize.js，node: 传染）
 *   ② provenance_hash（复用禁区 scheduler/distill-experience.mjs 的纯函数）
 * 为什么合并：每轮 spawn 回收只起一次子进程，避免两次 process 往返。
 * provenance 口径：provenanceHash(eng, trajectoryFingerprint(最小 summary) + \x1f + sha256(消毒后文本))
 *   —— 复用禁区两函数；文本摘要入指纹，保证同轮次同报告同哈希、异报告异哈希。
 * @returns {Promise<{ok:boolean, text?:string, dropped?:boolean, alerts?:string[],
 *                    provenanceHash?:string, error?:string}>}
 */
export async function executeTurnReport(req = {}) {
  const { text = '', source = 'agent-turn', eng = {}, isError = false, maxLen = 20_000,
    srcRoot = resolveSrcRoot() } = req
  try {
    const load = (rel) => import(pathToFileURL(path.join(srcRoot, rel)).href)
    const [ingest, sanitizeMod, patternsMod, distill, cryptoMod] = await Promise.all([
      load('domain/sanitize-ingest.mjs'), load('sanitize.js'), load('config/injection-patterns.mjs'),
      load('scheduler/distill-experience.mjs'), import('node:crypto'),
    ])
    let patterns = []
    try { patterns = patternsMod.hotJsPatterns() ?? [] } catch { patterns = [] }
    const r = ingest.sanitizeIngestExternal(String(text), {
      source: String(source), maxLen: Number(maxLen) || 20_000,
      sanitizeImpl: sanitizeMod.sanitizeUntrusted, patterns,
    })
    const clean = String(r.text ?? '')
    const engName = String(eng?.name ?? '')
    const fingerprint = distill.trajectoryFingerprint({ eng: engName, halted: !!isError, keyFailures: [] })
    const contentDigest = cryptoMod.createHash('sha256').update(clean).digest('hex')
    const provenanceHash = distill.provenanceHash(engName, `${fingerprint}\x1f${contentDigest}`)
    return { ok: !!r.ok, text: clean, dropped: !r.ok, alerts: r.alerts ?? [], provenanceHash }
  } catch (err) {
    return { ok: false, dropped: true, error: `turn-report 桥失败: ${err?.stack ?? err?.message ?? String(err)}` }
  }
}

/** 统一入口：按 op 分派。 */
export async function run(req = {}) {
  const op = String(req.op ?? 'tool')
  if (op === 'sanitize') return executeSanitize(req)
  if (op === 'turn-report') return executeTurnReport(req)
  return executeTool(req)
}

// ── 直跑主流程（守卫包住：被 import 时不执行）──────────────────────
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const readStdin = () => { try { return fs.readFileSync(0, 'utf8') } catch { return '' } }
  const raw = process.argv[2] && process.argv[2].trim() ? process.argv[2] : readStdin()
  let req
  try {
    req = JSON.parse(raw || '{}')
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, error: `入参非 JSON: ${e?.message ?? e}` }))
    process.exit(1)
  }
  run(req).then((r) => {
    process.stdout.write(JSON.stringify(r))
    process.exit(r.ok ? 0 : 1)
  }).catch((e) => {
    process.stdout.write(JSON.stringify({ ok: false, error: String(e?.stack ?? e) }))
    process.exit(1)
  })
}
