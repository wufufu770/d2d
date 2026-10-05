#!/usr/bin/env node
// scripts/xring/cli.mjs — X-Ring 命令面骨架（XR-P0 族 5）
// start：参数校验+启动确认显示（成本上界原值/货币化）；**本批不 spawn 真 worker（P1）**。
// status：记录面只读投影。stop：唯一干预例外（写 stop 事件，监控进程消费）。
// 显式优于隐式：--max-hours/--max-tokens 超硬上限 = 拒绝，绝不静默 clamp。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { BUDGET_LIMITS, XRING_MODES, readEvents, appendEvent } from './monitor.mjs'

const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`

/** 读 model-policies（与 scheduler.loadPolicies 同序：DATA_DIR → 仓内回退）。 */
export function loadPolicies(dataDir = DATA_DIR) {
  for (const p of [`${dataDir}/config/model-policies.json`, new URL('../../config/model-policies.example.json', import.meta.url).pathname]) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch {}
  }
  return { default: { primary: '', backup: '' }, roles: {} }
}

/**
 * start 参数解析与校验（纯函数；返回 {ok, errors, params}）。
 * 拒绝路径：--model 缺失/不在白名单；--max-hours/--max-tokens 非数/超硬上限（拒绝不 clamp）；
 * --mode 非法；bypass 无 --i-know-bypass 显式确认旗标（U2 拍板 1：无旗标拒绝+说明文案）。
 * mode 优先级：--mode 旗标 > P2P_XRING_MODE env（合法值才采纳）> 'queue' 缺省。
 */
export function parseStart(argv, policies = loadPolicies()) {
  const errors = []
  const get = (flag) => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const model = get('--model')
  const allowlist = policies.roles?.xring?.allowlist ?? []
  if (!model) errors.push('--model 必填（前沿模型准入，显式指定）')
  else if (!allowlist.includes(model)) errors.push(`--model "${model}" 不在 xring 准入白名单（内容归用户维护；当前白名单 ${JSON.stringify(allowlist)}）`)

  const modeFlag = get('--mode')
  const envMode = process.env.P2P_XRING_MODE
  let mode = 'queue'
  if (modeFlag !== undefined) {
    if (!XRING_MODES.includes(modeFlag)) errors.push(`--mode "${modeFlag}" 非法（可选 ${XRING_MODES.join('|')}）`)
    else mode = modeFlag
  } else if (envMode !== undefined) {
    if (!XRING_MODES.includes(envMode)) errors.push(`P2P_XRING_MODE "${envMode}" 非法（可选 ${XRING_MODES.join('|')}）`)
    else mode = envMode
  }
  if (mode === 'bypass' && !argv.includes('--i-know-bypass')) {
    errors.push('--mode bypass 需显式确认：追加 --i-know-bypass 旗标（B/C 产物绕过排队直达主图；A 级 verify 双签仍为硬线不豁免；确认你理解 bypass 的图卫生代价）')
  }

  const params = { model, mode, maxHours: BUDGET_LIMITS.maxHours.default, maxTokens: BUDGET_LIMITS.maxTokens.default }
  const mh = get('--max-hours')
  if (mh !== undefined) {
    const n = Number(mh)
    if (!Number.isFinite(n) || n <= 0) errors.push(`--max-hours "${mh}" 非正数`)
    else if (n > BUDGET_LIMITS.maxHours.cap) errors.push(`--max-hours ${n} 超硬上限 ${BUDGET_LIMITS.maxHours.cap}（拒绝，不 clamp）`)
    else params.maxHours = n
  }
  const mt = get('--max-tokens')
  if (mt !== undefined) {
    const n = Number(mt)
    if (!Number.isFinite(n) || n <= 0) errors.push(`--max-tokens "${mt}" 非正数`)
    else if (n > BUDGET_LIMITS.maxTokens.cap) errors.push(`--max-tokens ${n} 超硬上限 ${BUDGET_LIMITS.maxTokens.cap}（拒绝，不 clamp）`)
    else params.maxTokens = n
  }
  if (errors.length) return { ok: false, errors, params: null }
  return { ok: true, errors: [], params }
}

/**
 * 成本上界显示行（启动确认面）：单价有源则货币化，无源显示原值+注记（不硬凑货币）。
 * 单价源=PRICES 表（本批为空骨架——价格数据归用户维护，填入即自动货币化）。
 */
export const PRICES = Object.freeze({}) // provider/model → { inputPerM, outputPerM, currency }

export function costLine(model, maxHours, maxTokens) {
  const p = PRICES[model]
  if (p && Number.isFinite(p.inputPerM) && Number.isFinite(p.outputPerM)) {
    // 保守货币化：全部按 input 价计（无输出占比数据时的高估上界），单货币
    const upper = ((maxTokens / 1_000_000) * Math.max(p.inputPerM, p.outputPerM)).toFixed(2)
    return `成本上界 ≈ ${p.currency ?? 'USD'} ${upper}（${maxHours}h + ${maxTokens.toLocaleString()} token 上限×单价高估）`
  }
  return `成本上界（单价无源，原值显示）：${maxHours}h + ${maxTokens.toLocaleString()} token 上限——请按所选模型自行折价确认`
}

/** status：记录面只读投影。 */
export function status(runDir) {
  const eventsFile = path.join(runDir, 'events.jsonl')
  const events = readEvents(eventsFile)
  if (!events.length) return { ok: false, detail: `无记录: ${eventsFile}` }
  const last = events[events.length - 1]
  const budgetTicks = events.filter((e) => e.event === 'budget-tick')
  return {
    ok: true,
    lastEvent: last,
    budgetTicks: budgetTicks.length,
    lastBudget: budgetTicks[budgetTicks.length - 1]?.detail ?? 'n/a',
    stopped: events.some((e) => e.event === 'stop'),
  }
}

/** stop：唯一干预例外——写 stop 事件（监控进程轮询消费后执行终止）。 */
export function stop(runDir, reason = 'user') {
  const eventsFile = path.join(runDir, 'events.jsonl')
  if (!fs.existsSync(eventsFile)) return { ok: false, detail: `无运行记录: ${eventsFile}` }
  appendEvent(eventsFile, { event: 'stop-request', reason })
  return { ok: true, detail: 'stop-request 已写入（监控进程消费）' }
}

const isDirect = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isDirect) {
  const [cmd, ...rest] = process.argv.slice(2)
  if (cmd === 'start') {
    const r = parseStart(rest)
    if (!r.ok) {
      for (const e of r.errors) console.error('✗ ' + e)
      process.exit(1)
    }
    console.log('参数校验通过:', JSON.stringify(r.params))
    console.log(costLine(r.params.model, r.params.maxHours, r.params.maxTokens))
    console.log('启动确认：确认上界后执行。本批 skeleton 未接 spawn（P1）。')
    process.exit(0)
  }
  if (cmd === 'status') {
    console.log(JSON.stringify(status(rest[0] ?? ''), null, 1))
    process.exit(0)
  }
  if (cmd === 'stop') {
    const r = stop(rest[0] ?? '')
    console.log(JSON.stringify(r))
    process.exit(r.ok ? 0 : 1)
  }
  console.error('用法: cli.mjs start|status|stop …')
  process.exit(2)
}
