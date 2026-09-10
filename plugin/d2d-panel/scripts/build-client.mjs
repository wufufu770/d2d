#!/usr/bin/env node
// scripts/build-client.mjs — 把 lib/client/*.js 片段按固定顺序逐字节拼接为 lib/client.js
//
// 为什么要拼接: dsh 每个包只投递 exports["./client"] 这一个文件(dsh-client-modules 读取其
// 原始字节, 经 /plugins combo 路由下发); factory 内的 require 只解析平台模块表 / 其他插件包的
// boot-graph 行, 不支持相对路径 require, 也没有"每包多文件"机制。所以源码按卡片/视图拆在
// lib/client/ 下, 靠本脚本拼回单文件 —— 零依赖(node:fs)、无任何语法转换, "拼接即行为"。
//
// 片段约定: 每个片段 = factory 体的一段(4 空格缩进, 与 client.js 内层对齐), 顶层只放声明
//           (const / function); 全部片段共享同一 factory 作用域, 跨片段引用靠 ORDER 先声明。
// 用法:     node scripts/build-client.mjs          → 写出 lib/client.js
//           node scripts/build-client.mjs --check  → 只比对, 有漂移退出 1(test/client.test.mjs 同源守护)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const FRAG_DIR = path.join(PKG, 'lib', 'client')
export const OUT = path.join(PKG, 'lib', 'client.js')

/** 拼接顺序 = 声明顺序(load-bearing): 共享核心先, 卡片次, 视图装配, 最后 tab 注册。 */
export const ORDER = [
  'api.js', // 快照拉取 + 写端点
  'ui.js', // DSW 令牌样式 / 原语 / 轮询 hook / 格式化
  'cards.engagement.js', // Engagement 管理卡 + CountStrip
  'cards.ops.js', // Fleet / 策略库 / 黑名单 / 环容量 / 用量 / 性价比
  'cards.workers.js', // Workers 卡 + 鱼骨抽屉
  'view.ops.js', // 漏斗/缺口/经验库卡 + 模块开关 + OpsView 装配
  'view.findings.js', // 七态看板 + 人工裁决 + FindingsView 装配
  'router.js', // better-sidebar tab 注册(inject / apply / exports)
]

const HEAD = [
  '// lib/client.js — d2d-panel client 半(dsh web 浏览器侧)',
  '// 【生成物, 勿手改】由 scripts/build-client.mjs 按固定顺序逐字节拼接 lib/client/*.js 片段而成',
  '// (npm run build); test/client.test.mjs 守护"片段拼接 == 本文件"防漂移。改代码请改片段。',
  '// 格式: window.__ModuleLoader__.load({id, factory:(require)=>{...}}) — 生态静态插件',
  "// 客户端包标准格式(参照 dsh-sidebar-leap lib/client.js); require('react') 由宿主提供。",
  '// dsh 每包只投递 exports["./client"] 这一个文件(无相对 require / 无多文件机制), 故仍为单文件',
  '// 内联包(零构建工具链, 与 d2d 仓库哲学一致); 各源片段以区块注释分节。',
  '// 规范: DSH-better-sidebar docs/external-plugin-guide.md(v0.12.0+)',
  'window.__ModuleLoader__.load({',
  "  id: 'd2d-panel',",
  '  factory: (require) => {',
  '    const module = { exports: {} }',
  '    const exports = module.exports',
  "    const react = require('react')",
  '    const { createElement: h, useState, useEffect, useMemo, useCallback } = react',
  '',
].join('\n') + '\n'

const TAIL = '    return module.exports\n  },\n})\n'

/** 纯函数: 读片段 → 单文件源码字符串(不落盘)。片段目录与 ORDER 不一致即抛错(防新片段漏列)。 */
export function buildClient(dir = FRAG_DIR) {
  const present = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort()
  const listed = [...ORDER].sort()
  if (present.join('\n') !== listed.join('\n')) {
    throw new Error(`build-client: lib/client/ 片段与 ORDER 不一致\n  目录: ${present.join(', ')}\n  ORDER: ${listed.join(', ')}`)
  }
  const parts = ORDER.map((f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\s+$/, '') + '\n')
  return HEAD + parts.join('\n') + TAIL
}

function main(argv) {
  const out = buildClient()
  if (argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : ''
    if (cur !== out) {
      console.error('build-client: lib/client.js 与 lib/client/*.js 拼接结果不一致 — 请运行 npm run build')
      return 1
    }
    console.log('build-client: lib/client.js 与片段一致 ✓')
    return 0
  }
  fs.writeFileSync(OUT, out)
  console.log(`build-client: 写出 ${path.relative(process.cwd(), OUT)} (${out.split('\n').length - 1} 行, ${ORDER.length} 片段)`)
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)))
}
