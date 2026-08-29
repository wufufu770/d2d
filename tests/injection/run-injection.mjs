#!/usr/bin/env node
// V-17/R6 注入回归靶: ①动态断言——全部样本过 sanitizeUntrusted 后不得残留可执行结构
// ②静态断言——scheduler.js 四个已知入 prompt 注入点必须包 sanitizeUntrusted
import { readFileSync } from 'node:fs'
import { sanitizeUntrusted } from '../../plugin/pentest-dsh/sanitize.js'
let fail = 0
const samples = readFileSync(new URL('./samples.md', import.meta.url), 'utf8')
  .split('\n').filter((l) => /^\d+\.\s/.test(l)).map((l) => l.slice(l.indexOf(':') + 1).trim().replace(/\\r\\n/g, '\r\n'))
// 消毒层契约: 指令覆盖文本被替换, shell 执行结构被实体化; 执行类内容(rm/file://DETACH)由
// checkBash/validator/graphd 各层负责 —— 分层断言, 不越层
const EVIL = [/ignore\s+(all\s+)?previous/i, /\$\(/, /\$\{/, /`/, /\bsystem\s*prompt\b/i, /必须忽略/]
for (const [i, s] of samples.entries()) {
  const out = sanitizeUntrusted(s)
  const leaked = EVIL.filter((re) => re.test(out))
  if (leaked.length) { console.log(`FAIL sample#${i + 1} leaked=${leaked.map(String)}`); fail++ }
  else console.log(`ok   sample#${i + 1}`)
}
// 静态: 已知注入点(env 插值/focus/ev)必须在 task 组装前过 sanitizeUntrusted
const sched = readFileSync(new URL('../../plugin/pentest-dsh/scheduler.js', import.meta.url), 'utf8')
const wrapped = ['P2P_PROXY_URL'].filter((k) => new RegExp(`sanitizeUntrusted\\(String\\(process\\.env\\.${k}`, 'i').test(sched))
const gapWrapped = /sanitizeUntrusted\(gapHints\)/.test(sched)
const focusWrapped = /\\n重点: \$\{sanitizeUntrusted\(String\(focus\)\)\}/.test(sched)
const personaWrapped = /sanitizeUntrusted\(String\(role\.persona \?\? ''\)\)/.test(sched)
console.log(`static env-wrapped=${wrapped.length}/2 focus=${focusWrapped} persona=${personaWrapped}`)
console.log(`static gap-hints-wrapped=${gapWrapped}`)
if (wrapped.length !== 1 || !gapWrapped || !focusWrapped || !personaWrapped) { console.log('FAIL static'); fail++ }
console.log(fail ? `RESULT: ${fail} FAILURES` : 'RESULT: ALL PASS')
process.exit(fail ? 1 : 0)
