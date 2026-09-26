#!/usr/bin/env node
// experiments/ab-compare.mjs — 3.5-5b A/B 对比实验脚手架(纯编排, 不改业务代码)。
//
// 目的: 同一授权目标分别以「A 组: 经验蒸馏开(P2P_DISTILL_LLM=on) + 经验注入开」与
// 「B 组: 蒸馏关 + 注入关(P2P_EXPERIENCE_INJECT=0)」各跑 runs_per_group 个 engagement,
// 供 collect-results.mjs 按 eng 前缀(ab-a-N / ab-b-N)拉取差异报告。
//
// 编排边界(与业务的分界): 本脚本只做 ①读配置并校验 ②规划 eng 名与环境变量 ③经既有派发机制
// 发起 —— 派发选择「spawn 宿主 runner 进程带 env」(scripts/engagement-run.mjs, 其文件头即契约:
// 图上 status='requested' 节点 → 本脚本写 requested 节点 → spawn 该 runner 认领并跑到终态;
// scheduler 与 experience-ref 在 runner 进程内创建, env 直接继承)。调度/检索/蒸馏业务逻辑零复刻。
//
// 形态: 缺省 --dry-run(打印将执行的动作, 不写图不派发 — CI/测试不依赖真实目标与 LLM);
// 真跑必须显式 --live。凭据(LLM API key)只从环境变量读取, 本目录源码/示例/测试不含任何凭据字面量。
//
// Mimosa 约束: 脚本发起的 HTTP 请求仅 http/https; 启动时校验 config 目标 host
// (拒绝 localhost/环回/私有/保留地址); authorized 非 true 的目标拒绝启动。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ── 目标 host 校验(明显非法即拒绝: 环回/私有/保留/单标签; 明细见 README 合规声明) ──
export function assertTargetHost(hostname) {
  const h = String(hostname ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (!h) throw new Error('目标 host 为空')
  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1' || h === 'local') throw new Error(`拒绝 localhost/环回目标: ${h}`)
  if (/^127\./.test(h)) throw new Error(`拒绝环回地址: ${h}`)
  if (/^0\./.test(h) || h === '0.0.0.0') throw new Error(`拒绝未指定地址: ${h}`)
  if (/^169\.254\./.test(h)) throw new Error(`拒绝链路本地地址: ${h}`)
  if (/^10\./.test(h)) throw new Error(`拒绝私有地址: ${h}`)
  if (/^192\.168\./.test(h)) throw new Error(`拒绝私有地址: ${h}`)
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) throw new Error(`拒绝私有地址: ${h}`)
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) throw new Error(`拒绝保留地址(CGNAT): ${h}`)
  if (/^19[89]\./.test(h) || /^22[4-9]\./.test(h) || /^2[3-5]\d\./.test(h)) throw new Error(`拒绝保留/组播地址: ${h}`)
  if (h.includes(':')) throw new Error(`拒绝 IPv6/多冒号目标(如需请用域名并确认授权): ${h}`) // 环回/链路本地 IPv6 与 ULA 一律不解析放行
  if (!h.includes('.')) throw new Error(`拒绝无点单标签 host(无法校验公网授权属性): ${h}`)
  return h
}

// ── 配置校验: 任何一条不满足都拒绝启动(逐条给出原因) ─────────────────────────────
export function validateConfig(cfg) {
  const reasons = []
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw new Error('config 必须是对象')
  const targets = cfg.targets
  if (!Array.isArray(targets) || targets.length === 0) reasons.push('targets 必须是非空数组')
  else targets.forEach((t, i) => {
    const tag = `targets[${i}]`
    if (!t || typeof t !== 'object') { reasons.push(`${tag}: 非对象`); return }
    if (!String(t.name ?? '').trim()) reasons.push(`${tag}: 缺 name`)
    let u
    try { u = new URL(String(t.url ?? '')) } catch { reasons.push(`${tag}: url 非法(${t.url ?? '缺'})`); return }
    if (!['http:', 'https:'].includes(u.protocol)) reasons.push(`${tag}: url 仅允许 http/https(得到 ${u.protocol})`)
    try { assertTargetHost(u.hostname) } catch (e) { reasons.push(`${tag}: ${e.message}`) }
    if (t.authorized !== true) reasons.push(`${tag}: authorized 必须为 true(未授权目标拒绝启动)`)
    if (t.scope != null && !String(t.scope).trim()) reasons.push(`${tag}: scope 为空(留空请删除该字段, 由 url host 兜底)`)
  })
  const rpg = cfg.runs_per_group
  if (!Number.isInteger(rpg) || rpg < 1 || rpg > 20) reasons.push(`runs_per_group 必须是 1..20 的整数(得到 ${JSON.stringify(rpg)})`)
  for (const g of ['group_a', 'group_b']) {
    const o = cfg[g]
    if (!o || typeof o !== 'object') { reasons.push(`${g}: 缺组配置(enable_distill/enable_injection)`); continue }
    for (const k of ['enable_distill', 'enable_injection']) {
      if (typeof o[k] !== 'boolean') reasons.push(`${g}.${k} 必须是 boolean(得到 ${JSON.stringify(o[k])})`)
    }
  }
  if (!String(cfg.output_dir ?? '').trim()) reasons.push('缺 output_dir')
  if (reasons.length) throw new Error(`配置校验失败, 拒绝启动:\n  - ${reasons.join('\n  - ')}`)
  return cfg
}

export function loadConfig(file) {
  return validateConfig(JSON.parse(fs.readFileSync(file, 'utf8')))
}

// ── 组环境变量差量(编排只设 env, 不碰业务): distill 走 P2P_DISTILL_LLM(3.5-2 既有开关,
//    distill-experience.mjs:397), 注入走 P2P_EXPERIENCE_INJECT(3.5-5b 新开关, experience-ref.mjs 入口早退;
//    注入默认开 → 开=unset 而非显式置 1, 防未来出现其它非 0 语义)。─────────────────────────
export function groupEnvDelta(group, gcfg = {}) {
  if (group === 'a') {
    return gcfg.enable_distill
      ? { set: { P2P_DISTILL_LLM: 'on' }, unset: ['P2P_EXPERIENCE_INJECT'] }
      : { set: {}, unset: ['P2P_DISTILL_LLM', 'P2P_EXPERIENCE_INJECT'] }
  }
  return gcfg.enable_injection
    ? { set: { P2P_EXPERIENCE_INJECT: '1' }, unset: ['P2P_DISTILL_LLM'] }
    : { set: { P2P_EXPERIENCE_INJECT: '0' }, unset: ['P2P_DISTILL_LLM'] }
}

// 纯函数: base 复制后先 unset 后 set, 不改 base
export function composeEnv(base, delta) {
  const env = { ...base }
  for (const k of delta.unset ?? []) delete env[k]
  for (const [k, v] of Object.entries(delta.set ?? {})) env[k] = v
  return env
}

// ── 规划: 逐组逐 run → eng 名 ab-a-N / ab-b-N(3.5-5b 隔离前缀, 命中 H19 白名单 ^[A-Za-z0-9._-]+$);
//    多目标时第 N 个 run 轮用 targets[(N-1) % len]。────────────────────────────────────────
export function planRuns(cfg) {
  const runs = []
  for (const [group, gkey] of [['a', 'group_a'], ['b', 'group_b']]) {
    for (let n = 1; n <= cfg.runs_per_group; n++) {
      const target = cfg.targets[(n - 1) % cfg.targets.length]
      const u = new URL(String(target.url))
      runs.push({
        group, runIndex: n,
        engName: `ab-${group}-${n}`,
        target: { name: String(target.name), url: String(target.url), scope: String(target.scope ?? u.hostname), objective: String(target.objective ?? '') },
        envDelta: groupEnvDelta(group, cfg[gkey]),
        cmd: [process.execPath, [path.join(REPO, 'scripts', 'engagement-run.mjs'), '--name', `ab-${group}-${n}`]],
      })
    }
  }
  return runs
}

// ── 派发编排(live): 先写 requested 节点(engagement-run.mjs 文件头契约的生产侧), 再 spawn 宿主 runner。
//    图 IO 仅此一处, cypher 形态与 runner 读取字段(engagement-run.mjs:43)对齐; 不复刻任何调度逻辑。
async function startLive(run, { graphQuery, spawnFn, baseEnv, log }) {
  const existing = await graphQuery(`MATCH (e:Engagement {name:$n}) RETURN e.status AS s`, { n: run.engName })
  if (existing?.length && !['frozen', 'superseded'].includes(String(existing[0].s))) {
    throw new Error(`engagement ${run.engName} 已存在(status=${existing[0].s}) — 拒绝重复创建, 清理或换名后重试`)
  }
  await graphQuery(
    `CREATE (e:Engagement {name:$n, target:$t, scope:$s, auth:'declared', status:'requested', created_at:$ts, instances:$i, objective:$o})`,
    { n: run.engName, t: run.target.url, s: run.target.scope, ts: new Date().toISOString(), i: 2, o: run.target.objective },
  )
  const env = composeEnv(baseEnv, run.envDelta)
  log(`[ab-compare] live: engagement ${run.engName} 已置 requested(target=${run.target.url}), spawn 宿主 runner`)
  const [cmd, args] = [run.cmd[0], run.cmd[1]]
  return spawnFn(cmd, args, { env })
}

// ── 主编排: dry-run(缺省)只打印计划; live 才真发。deps 全注入(测试全 mock)。──────────────
export async function runCompare(cfg, opts = {}) {
  const live = opts.live === true
  const log = opts.log ?? ((m) => console.log(m))
  const spawnFn = opts.spawnFn ?? (() => { throw new Error('live 模式需注入 spawnFn') })
  const graphQuery = opts.graphQuery ?? (() => { throw new Error('live 模式需注入 graphQuery') })
  const baseEnv = opts.baseEnv ?? process.env
  const plan = planRuns(cfg)
  if (!live) {
    log(`[ab-compare] dry-run(缺省可测形态): 共规划 ${plan.length} 个 run(A/B 各 ${cfg.runs_per_group}); 未写图未派发。真跑请加 --live`)
    for (const r of plan) {
      const setDesc = Object.entries(r.envDelta.set).map(([k, v]) => `${k}=${v}`).join(' ') || '(无)'
      log(`  ${r.engName}: 目标=${r.target.url} scope=${r.target.scope} → 写 requested 节点 → spawn ${path.basename(r.cmd[1][0])} ${r.cmd[1].slice(1).join(' ')} | env 置 ${setDesc} | env 删 ${r.envDelta.unset.join(',') || '(无)'}`)
    }
    return { live: false, plan }
  }
  const results = []
  for (const r of plan) {
    try {
      const child = await startLive(r, { graphQuery, spawnFn, baseEnv, log })
      results.push({ ...r, ok: true, spawned: Boolean(child) })
    } catch (e) {
      log(`[ab-compare] ${r.engName} 派发失败: ${e?.message ?? e}`)
      results.push({ ...r, ok: false, error: String(e?.message ?? e) })
    }
  }
  const failed = results.filter((r) => !r.ok).length
  log(`[ab-compare] live 完成: ${results.length - failed}/${results.length} 派发成功; 结果收集: node experiments/collect-results.mjs --config <config.json>`)
  return { live: true, plan, results, failed }
}

// ── CLI 入口 ────────────────────────────────────────────────────────────────────
async function main(argv) {
  const live = argv.includes('--live')
  const ci = argv.indexOf('--config')
  const cfgPath = path.resolve(ci !== -1 ? argv[ci + 1] : path.join(REPO, 'experiments', 'config.json'))
  if (!fs.existsSync(cfgPath)) {
    console.error(`[ab-compare] 配置不存在: ${cfgPath} — 先复制 config.example.json 为 config.json 并填入【授权】目标`)
    process.exit(2)
  }
  let cfg
  try {
    cfg = loadConfig(cfgPath)
  } catch (e) {
    console.error(`[ab-compare] ${e.message}`)
    console.error('[ab-compare] 拒绝启动 — 修正 experiments/config.json 后重试')
    process.exit(2)
  }
  if (!live) console.error('[ab-compare] 未指定 --live → dry-run 模式(只打印动作不真发)')
  await runCompare(cfg, {
    live,
    baseEnv: process.env,
    ...(live ? await liveDeps() : {}),
  })
}

// live 依赖: graphd 查询(仅 http/https)与 spawn; token 走 P2P_HOST_TOKEN_FILE(env, 同宿主 runner)
async function liveDeps() {
  const GRAPHD = process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766'
  if (!['http:', 'https:'].includes(new URL(GRAPHD).protocol)) { console.error(`[ab-compare] graphd 仅允许 http/https: ${GRAPHD}`); process.exit(2) }
  const token = (() => { try { return fs.readFileSync(process.env.P2P_HOST_TOKEN_FILE ?? `${process.env.HOME}/.config/d2d/host-token`, 'utf8').trim() } catch { return '' } })()
  const graphQuery = async (cypher, params = {}) => {
    const res = await fetch(`${GRAPHD}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Auth': token } : {}) },
      body: JSON.stringify({ cypher, params }),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.ok) throw new Error(`graphd: ${data?.error ?? `http ${res.status}`}`)
    return data.rows ?? []
  }
  const { spawn } = await import('node:child_process')
  const spawnFn = (cmd, args, { env }) => {
    const c = spawn(cmd, args, { env, stdio: 'inherit' })
    console.log(`[ab-compare] runner pid=${c.pid} (eng 终态由 runner 自行落到图; 本脚本不等待, 逐个串行派发)`)
    return { pid: c.pid }
  }
  return { graphQuery, spawnFn }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main(process.argv.slice(2))
