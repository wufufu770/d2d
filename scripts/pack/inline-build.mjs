#!/usr/bin/env node
// inline-build.mjs — 把 packages/* 薄包装与其依赖的 plugin/ 源码打包成可独立发布的包目录。
//
// 解决「private:true 的源码包 vs 发布」矛盾: 源码包用相对路径引用仓库内 plugin/ 模块,
// 原样 publish 后路径失效。本脚本读依赖图, 逐文件拷贝并改写 import 路径:
//   ../../plugin/pentest-dsh/domain/x.mjs → ./vendor/pentest-dsh/domain/x.mjs
//   ../../d2d-skills/src/loader.mjs       → ./vendor/packages/d2d-skills/src/loader.mjs
// 被依赖的仓库内模块也递归内联进 vendor/(本地相对 import 一并拷贝)。
//
// 用法: node scripts/pack/inline-build.mjs [--out dist] [pkg ...]
// 产物: dist/<name>/(改写后的源码 + vendor/ + 发布形态 package.json: private 删除)。
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
// D2D_INLINE_BUILD_REPO: 测试注入最小 fixture 仓库用(默认取脚本所在仓库根)
const REPO = path.resolve(process.env.D2D_INLINE_BUILD_REPO || path.join(__dirname, '..', '..'))
const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const DIST = outIdx >= 0 ? path.resolve(REPO, args[outIdx + 1] || 'dist') : path.join(REPO, 'dist')
const wanted = args.filter((a, i) => a !== '--out' && i !== outIdx + 1)
const PKGS_DIR = path.join(REPO, 'packages')

function listPackages() {
  return fs.readdirSync(PKGS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(PKGS_DIR, e.name, 'package.json')))
    .map((e) => e.name)
}

// 递归收集 file 的仓库内相对依赖(以 ../ 开头且落在 REPO 内的 import)。
function depsOf(file, repoFiles) {
  const src = fs.readFileSync(file, 'utf8')
  const re = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(src))) {
    const spec = m[1] || m[2] || m[3]
    if (!spec || !spec.startsWith('.')) continue
    const abs = path.resolve(path.dirname(file), spec)
    const rel = path.relative(REPO, abs)
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue // 仓库外/裸包名: 跳过
    if (!fs.existsSync(abs) && !fs.existsSync(abs + '.mjs')) continue
    const target = fs.existsSync(abs) && fs.statSync(abs).isDirectory() ? path.join(abs, 'index.mjs') : (fs.existsSync(abs) ? abs : abs + '.mjs')
    if (!repoFiles.has(target)) {
      repoFiles.set(target, path.relative(REPO, target))
      depsOf(target, repoFiles)
    }
  }
}

function copyRewrite(srcFile, opts) {
  let src = fs.readFileSync(srcFile, 'utf8')
  const destFile = path.join(opts.pkgDist, opts.destRel.get(srcFile))
  // 改写跨包/指向 plugin 的相对 import → 产物内真实相对路径(POSIX 化, 浏览器/npm 语义统一)。
  // opts.destRel 是本次构建的全量 file → destRel 映射: 单条目映射会让任意依赖查不到而漏改写。
  src = src.replace(/(from\s*|import\s*\(\s*|import\s*)(['"])(\.\.[^'"]*)\2/g, (full, pre, q, spec) => {
    const base = path.resolve(path.dirname(srcFile), spec)
    // depsOf 同款候选: 原样 / 补 .mjs / 目录 index(源码里存在无扩展名 import)
    const target = [base, base + '.mjs', path.join(base, 'index.mjs')].find((c) => opts.destRel.has(c))
    if (!target) return full // 仓库外/裸包名: 原样保留
    let newSpec = path.relative(path.dirname(destFile), path.join(opts.pkgDist, opts.destRel.get(target)))
      .split(path.sep).join('/')
    if (!newSpec.startsWith('.')) newSpec = `./${newSpec}` // 同目录引用必须带 ./ 才是合法相对说明符
    return `${pre}${q}${newSpec}${q}`
  })
  fs.mkdirSync(path.dirname(destFile), { recursive: true })
  fs.writeFileSync(destFile, src)
}

function buildPkg(name) {
  const pkgDir = path.join(PKGS_DIR, name)
  const meta = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
  const distDir = path.join(DIST, name)
  fs.rmSync(distDir, { recursive: true, force: true })
  fs.mkdirSync(distDir, { recursive: true })

  // 依赖图: 自身源码 + 递归内联的仓库内依赖
  const inlined = new Map()
  for (const f of walk(pkgDir, ['node_modules'])) {
    inlined.set(f, path.relative(REPO, f))
  }
  for (const f of [...inlined.keys()]) depsOf(f, inlined)

  // 发布形态 package.json: 去掉 private/publishConfig 注释, 路径不变
  const pubMeta = { ...meta }
  delete pubMeta.private
  delete pubMeta.publishConfig
  pubMeta.description = `${meta.description} (inline-build 产物: vendor/ 内联仓库内依赖源码)`
  fs.writeFileSync(path.join(distDir, 'package.json'), JSON.stringify(pubMeta, null, 2) + '\n')

  // 全量 file → destRel 映射(自身文件落包内相对位置, 依赖落 vendor/) — 一次性算好,
  // copyRewrite 改写 import 时要查任意内联目标的位置, 单条目映射会导致改写完全失效
  const destRel = new Map()
  for (const [file, rel] of inlined) {
    destRel.set(file, rel.startsWith(`packages${path.sep}${name}`)
      ? path.relative(path.join(REPO, 'packages', name), file)
      : path.join('vendor', rel))
  }
  for (const file of inlined.keys()) copyRewrite(file, { destRel, pkgDist: distDir })
  console.log(`inline-build: ${name} → ${path.relative(REPO, distDir)} (${inlined.size} files)`)
}

function walk(dir, skip = []) {
  const out = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (skip.includes(ent.name) || ent.name.startsWith('.') || ent.name === 'dist') continue
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) out.push(...walk(p, skip))
    else if (/\.(mjs|js|json|md)$/.test(ent.name) && !/package(-lock)?\.json|bun\.lock/.test(ent.name)) out.push(p)
  }
  return out
}

const all = listPackages()
const targets = wanted.length ? all.filter((n) => wanted.includes(n)) : all
fs.rmSync(DIST, { recursive: true, force: true })
fs.mkdirSync(DIST, { recursive: true })
for (const name of targets) buildPkg(name)
console.log(`inline-build: ${targets.length} 包完成 → ${path.relative(REPO, DIST)}`)
