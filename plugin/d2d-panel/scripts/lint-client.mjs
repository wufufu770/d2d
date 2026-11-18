#!/usr/bin/env node
// scripts/lint-client.mjs — E40-C2: 面板客户端静态闸(捕获 p-is-undefined 整类 ReferenceError)
// 为什么不直接 eslint lib/client.js: vendor.echarts.js(1MB minified) 会淹没输出; 为什么不逐
// 片段 lint: 片段共享 factory 作用域, 跨片段引用在单文件里才可解析。
// 形态 = buildClient() 的合成目标去掉 vendor 片段(vendor 是自包含 UMD chunk, 语法由上游保证),
// 用 eslint Linter API(flat config)内联校验:
//   error 级: no-undef / no-redeclare / no-dupe-keys / no-const-assign / no-unreachable /
//             no-func-assign / no-duplicate-case / no-import-assign / no-setter-return
//   warn 级: no-unused-vars(片段级"未用"多为跨视图共享声明, 只提示不拦截)
// 退出码: error 数 > 0 → 1(npm test 接线 — 静态闸不过即测试红)。
import { Linter } from 'eslint'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { ORDER, FRAG_DIR } = await import('./build-client.mjs')

// 合成目标: HEAD wrapper + 全片段(跳过 vendor*) + TAIL — 与 bundle 同作用域形态
const HEAD = fs.readFileSync(path.join(PKG, 'lib', 'client.js'), 'utf8').split('globalThis.__dshChunks__')[0]
const parts = ORDER.filter((f) => f !== 'vendor.echarts.js')
  .map((f) => fs.readFileSync(path.join(FRAG_DIR, f), 'utf8').replace(/\s+$/, '') + '\n')
const tail = '    return module.exports\n  },\n})\n'
const code = `${HEAD}\n${parts.join('\n')}${tail}`

const BROWSER_GLOBALS = ['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'location', 'history',
  'fetch', 'AbortController', 'AbortSignal', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'console', 'URL', 'URLSearchParams', 'Blob', 'CustomEvent',
  'getComputedStyle', 'structuredClone', 'crypto', 'performance', 'globalThis', 'React',
  'confirm', 'alert', 'prompt']

const linter = new Linter({ configType: 'flat' })
const messages = linter.verify(code, {
  languageOptions: {
    ecmaVersion: 2023,
    sourceType: 'script',
    globals: Object.fromEntries(BROWSER_GLOBALS.map((g) => [g, 'readonly'])),
  },
  // 片段里既有 `// eslint-disable-next-line react-hooks/exhaustive-deps` 指令(构建期来自
  // 上游书写习惯) — 本闸不装 react-hooks 插件, 提供同名空规则让指令可解析(零行为)。
  plugins: {
    'react-hooks': { rules: { 'exhaustive-deps': { create: () => ({}) }, 'rules-of-hooks': { create: () => ({}) } } },
  },
  rules: {
    'no-undef': 'error',
    'no-redeclare': 'error',
    'no-dupe-keys': 'error',
    'no-const-assign': 'error',
    'no-unreachable': 'error',
    'no-func-assign': 'error',
    'no-duplicate-case': 'error',
    'no-import-assign': 'error',
    'no-unsafe-negation': 'error',
    'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
  },
})

const errors = messages.filter((m) => m.severity === 2)
const warns = messages.filter((m) => m.severity === 1)
const lineOf = (src, offset) => src.slice(0, offset).split('\n').length
// E46-9: offset→片段映射 — 合成目标行号对开发者无意义(报 bundle 行号≠修复面), 映射回
// 片段文件+片段内行号(双标注: 合成行定位 + 片段:行修复面)。
const segIndex = []
let segAcc = HEAD.length
const segSources = []
for (const f of ORDER.filter((x) => x !== 'vendor.echarts.js')) {
  const src = fs.readFileSync(path.join(FRAG_DIR, f), 'utf8').replace(/\s+$/, '') + '\n'
  segIndex.push({ file: f, start: segAcc, end: segAcc + src.length, src })
  segSources.push(src)
  segAcc += src.length
}
const locate = (offset) => {
  const i = segIndex.findIndex((s) => offset >= s.start && offset < s.end)
  if (i === -1) return `${lineOf(code, offset)}(TAIL)`
  const localLine = lineOf(segSources[i], offset - segIndex[i].start)
  return `${lineOf(code, offset)}(${segIndex[i].file}:${localLine})`
}
for (const m of messages) {
  const tag = m.severity === 2 ? '✖' : 'ℹ'
  console.error(`${tag} [${m.ruleId}] 行 ${locate(m.offset)}: ${m.message}`)
}
console.error(`lint-client: ${errors.length} error / ${warns.length} warn(error 级规则=no-undef 整类 ReferenceError 静态捕获)`)
process.exit(errors.length > 0 ? 1 : 0)
