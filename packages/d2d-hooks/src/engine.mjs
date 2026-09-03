// @wufufu770/d2d-hooks — hook 引擎: 7 事件枚举 + matcher + sync 执行(warn|block)。
// 子进程执行经 spawnProcess 注入, 默认 child_process.spawnSync; runHooks 为纯逻辑可测。

export const HOOK_EVENTS = [
  'session-start',
  'session-end',
  'pre-worker-spawn',
  'post-worker-terminal',
  'pre-write',
  'finding-verified',
  'error',
]

// matcher 解析: undefined|'always' → 恒匹配; 'a|b' → 多选; '/…/flags' → 正则; 其余精确等值。
export function makeMatcher(matcher) {
  if (matcher === undefined || matcher === null || matcher === 'always' || matcher === '') return () => true
  const s = String(matcher)
  const re = /^\/(.*)\/([a-z]*)$/s.exec(s)
  if (re) {
    let regex
    try { regex = new RegExp(re[1], re[2]) } catch { /* 非法正则退化为精确匹配 */ return (v) => v === s }
    return (v) => regex.test(v)
  }
  if (s.includes('|')) {
    const alts = s.split('|').map((x) => x.trim()).filter(Boolean)
    return (v) => alts.includes(v)
  }
  return (v) => v === s
}

export function hookMatches(hook, event, ctx = {}) {
  if (hook.event !== event) return false
  const subject = ctx.tool ?? ctx.kind ?? ''
  return makeMatcher(hook.matcher)(subject)
}

import { spawnSync as _spawnSync } from 'node:child_process'

const DEFAULT_SPAWN = (command, ctx) => {
  // 默认实现: 同步 shell 执行(仅当调用方未注入 spawnProcess 时)。ctx 经 env 暴露, 不做字符串插值。
  return _spawnSync(command, {
    shell: true,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, D2D_HOOK_EVENT: ctx.event || '', D2D_HOOK_TOOL: ctx.tool || '' },
  })
}

// runHooks(event, ctx, hooks, {spawnProcess, log}) → { blocked, warnings, results }
// failMode: 'warn'(默认, 失败记 warning 继续) | 'block'(失败即 blocked: true 并停)。
export function runHooks(event, ctx = {}, hooks = [], { spawnProcess = DEFAULT_SPAWN, log = () => {} } = {}) {
  const out = { blocked: false, warnings: [], results: [] }
  for (const hook of hooks) {
    if (!hook || !hookMatches(hook, event, ctx)) continue
    let ok = true
    let detail = ''
    try {
      const r = spawnProcess(hook.command, { ...ctx, event })
      ok = r === undefined ? true : !(r.error || r.status !== 0)
      detail = r?.error?.message ?? (typeof r?.stderr === 'string' ? r.stderr.trim() : '') ?? ''
    } catch (e) {
      ok = false
      detail = e?.message || String(e)
    }
    out.results.push({ hook: hook.command, ok, detail })
    if (!ok) {
      if ((hook.failMode || 'warn') === 'block') {
        out.blocked = true
        out.warnings.push(`${hook.command}: ${detail || 'hook 失败, 已阻断'}`)
        log(`[hook:block] ${event} ${hook.command} ${detail}`)
        break
      }
      out.warnings.push(`${hook.command}: ${detail || 'hook 失败(仅告警)'}`)
      log(`[hook:warn] ${event} ${hook.command} ${detail}`)
    }
  }
  return out
}
