#!/usr/bin/env node
// scripts/wf/lint.mjs — WF-1 层 2 预检 linter：工作流脚本提交前静态审。
// 需求文档：docs/wf-incident-catalog.md §二（每条规则锚定既登记事故；历史事故 fixture 检出率 100% 硬指标）。
// 规则：R1 locale 覆盖 / R2 静默旗标吞检查输出 / R3 行注释注入代码串 / R4 grep -c 退出码纪律 /
//       R5 regen 后漏 re-add / R6 regen 前漏 add -A / R7 push 无探测 / R8 push 无祖先守卫 /
//       R9 终态核验无分类或无界 / R10 钩子禁用旗标（AGENTS 17）/ R11 命令白名单（告警）/
//       R13 agent 约束样板缺失 / R14 同参 world.run 重复（告警——journal 重放风险）。
// 用法：node scripts/wf/lint.mjs <file.dwf.ts> [...more]   （exit 1=有 error）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CMD_ALLOWLIST = new Set(['git', 'node', 'bash', 'sleep', 'curl', 'sha256sum', 'gh', 'ls', 'cat', 'grep'])

// ── string 感知扫描器：提取 world.run(...) 调用（平衡括号，正确跳过字符串/注释/模板字面量）──
export function extractWorldRuns(src) {
  const runs = []
  const n = src.length
  let i = 0
  let line = 1
  const state = { sq: false, dq: false, bt: false, expr: 0, lc: false, bc: false }
  const depth = { paren: 0, brace: 0 }
  const aliases = new Set()
  let callStart = -1
  let callText = ''
  while (i < n) {
    const c = src[i]
    const c2 = src.slice(i, i + 2)
    if (state.lc || state.bc) {
      if (state.lc && c === '\n') state.lc = false
      if (state.bc && c2 === '*/') { state.bc = false; i += 2; line++; continue }
      if (c === '\n') line++
      i++
      continue
    }
    if (state.sq) { if (c === '\\') i++; else if (c === "'") state.sq = false; if (c === '\n') line++; i++; continue }
    if (state.dq) { if (c === '\\') i++; else if (c === '"') state.dq = false; if (c === '\n') line++; i++; continue }
    if (state.bt) {
      if (c === '\\') { i += 2; continue }
      if (c === '$' && src[i + 1] === '{') { state.expr++; depth.brace++; i += 2; continue }
      if (c === '}' && state.expr > 0) { state.expr--; depth.brace--; i++; continue }
      if (c === '`' && state.expr === 0) state.bt = false
      if (c === '\n') line++
      i++
      continue
    }
    if (c2 === '//') { state.lc = true; i += 2; continue }
    if (c2 === '/*') { state.bc = true; i += 2; continue }
    if (c === "'") { state.sq = true; i++; continue }
    if (c === '"') { state.dq = true; i++; continue }
    if (c === '`') { state.bt = true; i++; continue }
    // WF-2 R2a: 正则字面量状态——`/` 在 regex 可前缀上下文（= ( , : [ ! & | ? ; { 或行首）开启，
    // 跳到未转义闭 `/`；冷读致盲样本 `const re = /'/;` 引号被吞进 regex 不再破坏字符串状态机。
    if (c === '/' && src[i + 1] !== '/' && src[i + 1] !== '*') {
      const prev = src.slice(0, i).replace(/[ \t]+$/, '').at(-1)
      if (prev === undefined || '=(,:[!&|?;{}+-'.includes(prev)) {
        i++
        while (i < n && src[i] !== '/') { if (src[i] === '\\') i++; if (src[i] === '\n') line++; i++ }
        i++
        continue
      }
    }
    if (src.slice(i, i + 10) === 'world.run(' && depth.paren === 0) {
      callStart = i
      depth.paren = 1
      i += 10
      continue
    }
    // WF-2 R2b: 别名登记——`const|let|var X = world.run` 后 `X(` 与 world.run( 同权入扫描面
    const aliasM = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*world\.run\s*$/.exec(src.slice(i, i + 120).split('\n')[0])
    if (aliasM && depth.paren === 0) { aliases.add(aliasM[1]); i++; continue }
    let aliasHit = -1
    for (const al of aliases) {
      if (src.startsWith(al + '(', i) && depth.paren === 0) { aliasHit = al.length; break }
    }
    if (aliasHit > 0) {
      callStart = i
      depth.paren = 1
      i += aliasHit + 1
      continue
    }
    if (callStart >= 0) {
      if (c === '(') depth.paren++
      else if (c === ')') {
        depth.paren--
        if (depth.paren === 0) {
          callText = src.slice(callStart, i + 1)
          runs.push({ callText, line: lineAt(src, callStart) })
          callStart = -1
        }
      }
    }
    if (c === '\n') line++
    i++
  }
  return runs
}

function lineAt(src, idx) {
  let l = 1
  for (let k = 0; k < idx; k++) if (src[k] === '\n') l++
  return l
}

// 提取 world.run 调用文本内的字符串字面量内容（sq/dq/bt；bt 内含 ${} 原样保留）
export function stringsIn(callText) {
  const out = []
  let i = 0
  const n = callText.length
  while (i < n) {
    const c = callText[i]
    if (c === "'") {
      let j = i + 1
      let s = ''
      while (j < n && callText[j] !== "'") { if (callText[j] === '\\' && j + 1 < n) { s += callText[j] + callText[j + 1]; j += 2 } else { s += callText[j]; j++ } }
      out.push({ quote: 'sq', content: s })
      i = j + 1
      continue
    }
    if (c === '"') {
      let j = i + 1
      let s = ''
      while (j < n && callText[j] !== '"') { if (callText[j] === '\\' && j + 1 < n) { s += callText[j] + callText[j + 1]; j += 2 } else { s += callText[j]; j++ } }
      out.push({ quote: 'dq', content: s })
      i = j + 1
      continue
    }
    if (c === '`') {
      let j = i + 1
      let s = ''
      let expr = 0
      while (j < n) {
        if (callText[j] === '\\') { s += callText[j + 1]; j += 2; continue }
        if (callText[j] === '$' && callText[j + 1] === '{') { expr++; s += '${}'; j += 2; continue }
        if (callText[j] === '}' && expr > 0) { expr--; j++; continue }
        if (callText[j] === '`' && expr === 0) break
        s += callText[j]
        j++
      }
      out.push({ quote: 'bt', content: s })
      i = j + 1
      continue
    }
    i++
  }
  return out
}

function parseCall(callText) {
  const strs = stringsIn(callText)
  const cmd = strs[0]?.content ?? ''
  return { cmd, strs }
}

const hasGuardTail = (s) => /;\s*true\b|;\s*echo rc=|\|\|\s*true\b|\|\|\s*:/.test(s)

export function lintScript(src) {
  const errors = []
  const warnings = []
  const err = (rule, line, msg) => errors.push({ rule, line, msg })
  const warn = (rule, line, msg) => warnings.push({ rule, line, msg })
  const runs = extractWorldRuns(src)

  let sawAddA = false
  let sawLsRemote = false
  let sawAncestor = false
  let pendingRegenNeedsReadd = -1 // 索引：最近一次 regen 之后、下一个 commit 之前须见 add manifest
  const events = []
  const callSigs = new Map()

  for (const [idx, r] of runs.entries()) {
    const { cmd, strs } = parseCall(r.callText)
    const contents = strs.map((s) => s.content)
    const all = contents.join('\n')
    // R1 locale 覆盖（B1：LC_ALL=C sort 破 comm 口径）
    const localeHit = /\b(LC_ALL|LANG|LC_COLLATE|LANGUAGE)=/.exec(all)
    if (localeHit) err('R1', r.line, `locale 覆盖进命令串（${localeHit[1]}=）——改变下游比较/排序口径（catalog B1）`)
    // R2 静默旗标吞检查输出（B2）
    if (/--quiet|(^|\s)-q(\s|$)/.test(all) && (/grep\s+-c/.test(all) || /sha256sum/.test(all))) {
      err('R2', r.line, '--quiet/-q 与 stdout 计数或 sha256sum 同串——检查输出契约被旗标静默（catalog B2）')
    }
    // R3 行注释注入代码串（B3）——源码形态含转义 \n（运行时变真换行吞包装收口）
    for (const s of strs) {
      if (/(^|\n|\\n)[ \t]*\/\//.test(s.content)) err('R3', r.line, `字符串内行注释注入——吞包装收口风险（catalog B3）: ${s.content.slice(0, 60)}`)
    }
    // R4 grep -c 退出码纪律（D1/G）
    if (/grep\s+(-c|--count)/.test(all) && !hasGuardTail(all)) {
      err('R4', r.line, 'grep -c 无退出码守卫（; true / echo rc=）——零匹配 exit 1 劫持 stdout 判据（catalog D1/G）')
    }
    // R10 钩子禁用旗标（F/AGENTS 17）
    if (/--no-verify|core\.hooksPath|core\.hooks\b/.test(all)) {
      err('R10', r.line, '钩子禁用旗标=违反 L3 门纪律（AGENTS 17）')
    }
    // B8d: .git/config 直写（printf 追加重定向形态——持久 hooksPath/配置污染通道，AGENTS 17 同族）
    if (/\.git\/?config\b/.test(all) && /(>>|>)/.test(all)) {
      err('R10', r.line, '.git/config 直写面——持久钩子/配置污染通道（AGENTS 17 同族）')
    }
    // R11 命令白名单（F 相邻——告警）
    if (cmd && !CMD_ALLOWLIST.has(cmd)) warn('R11', r.line, `命令 ${cmd} 在白名单外——确认是否应进工作流通道`)
    // R14 同参重复（A：journal 重放风险——告警）
    const sig = r.callText.replace(/\s+/g, ' ')
    callSigs.set(sig, (callSigs.get(sig) ?? 0) + 1)

    // 事件序列（R5/R6/R7/R8）
    // WF-2 B8b: regen 判定走内容（createHash+manifest）不限 cmd——`bash -lc "node -e …"` 包装形态同入事件面
    if (/manifest\.sha256/.test(all) && /createHash/.test(all)) {
      events.push({ type: 'regen', idx, line: r.line })
      pendingRegenNeedsReadd = idx
    }
    if (cmd === 'git' && all.includes('add') && all.includes('manifest.sha256')) {
      events.push({ type: 'add-manifest', idx, line: r.line })
      if (pendingRegenNeedsReadd >= 0) pendingRegenNeedsReadd = -1
    }
    if (cmd === 'git' && contents.includes('commit')) {
      events.push({ type: 'commit', idx, line: r.line })
      if (pendingRegenNeedsReadd >= 0) { err('R5', r.line, 'regen 与 commit 之间无 git add manifest.sha256——manifest 更新漏入库（catalog D2）') }
    }
    // B8f: add -A 长选项 --all 同权（R6 误报源——git add --all 是合法 add -A）
    if (cmd === 'git' && all.includes('add') && (all.includes('-A') || all.includes('--all'))) { events.push({ type: 'add-A', idx, line: r.line }); sawAddA = true }
    if (cmd === 'git' && all.includes('ls-remote')) { events.push({ type: 'ls-remote', idx, line: r.line }); sawLsRemote = true }
    // WF-2 R3: push 判定去 refs/heads 硬约束——`git push origin main` 简写形态同入事件面（保守方向：多要求守卫）
    if (cmd === 'git' && all.includes('push')) { events.push({ type: 'push', idx, line: r.line }) }
    if (cmd === 'git' && all.includes('merge-base') && all.includes('--is-ancestor')) { events.push({ type: 'ancestor', idx, line: r.line }); sawAncestor = true }
  }

  const firstRegen = events.find((e) => e.type === 'regen')
  if (firstRegen && !sawAddA) err('R6', firstRegen.line, 'regen 之前无 git add -A——ls-files 口径漏 untracked（catalog D3/AGENTS 16②）')
  const firstPush = events.find((e) => e.type === 'push')
  if (firstPush) {
    if (!sawLsRemote) err('R7', firstPush.line, 'git push 前无 ls-remote 探测——网络窗口盲推（catalog C）')
    if (!sawAncestor) err('R8', firstPush.line, 'git push 前无 merge-base --is-ancestor 祖先守卫——远端漂移不可见（catalog C）')
    // R9 终态/探测分类锚（E）
    if (!src.includes('[wf:lib:probe-classify]')) err('R9', firstPush.line, '推送面无探针分类锚 [wf:lib:probe-classify]——窗口态与确定性失配未分型（catalog E）')
  }
  const unbounded = /\bwhile\s*\(\s*true\s*\)|\bfor\s*\(\s*;\s*;\s*\)/.exec(src)
  if (unbounded) err('R9', lineAt(src, unbounded.index), '无界循环（while(true)/for(;;)）——终态核验/重试必须有界（catalog E）')
  // R13 agent 约束样板（拍板 1）
  const agentRe = /(?<![.\w])agent\s*\(/g
  let m
  while ((m = agentRe.exec(src))) {
    const window = src.slice(m.index, m.index + 900)
    if (!/L3/.test(window) || !/(S3|绝不|不得)/.test(window)) {
      err('R13', lineAt(src, m.index), 'agent() 调用附近缺约束样板（L3/策略表 S3/绝不）——agent 必须绑定 scope 与红线（拍板 1）')
    }
  }
  for (const [sig, count] of callSigs) {
    if (count > 1) warn('R14', 0, `同参 world.run 出现 ${count} 次（AmendWorkflow 重入=journal 重放风险——catalog A）: ${sig.slice(0, 90)}`)
  }
  return { errors, warnings, runs: runs.length }
}

export function lintFile(file) {
  const src = fs.readFileSync(file, 'utf8')
  const res = lintScript(src)
  for (const e of res.errors) console.error(`✗ [${e.rule}] ${path.basename(file)}:${e.line} ${e.msg}`)
  for (const w of res.warnings) console.error(`⚠ [${w.rule}] ${path.basename(file)} ${w.msg}`)
  return res
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const files = process.argv.slice(2)
  if (!files.length) { console.error('用法: node scripts/wf/lint.mjs <file.dwf.ts> [...]'); process.exit(2) }
  let bad = 0
  for (const f of files) { const r = lintFile(f); if (r.errors.length) bad++ }
  console.log(`wf-lint: ${files.length} 文件, ${bad} 个 error`)
  process.exit(bad ? 1 : 0)
}
