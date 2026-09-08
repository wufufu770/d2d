#!/usr/bin/env node
// fetch-wordlists.mjs — 字典更新/校验器(P1/M3 配套, 安装与日常更新共用)
// 职责: 按 manifest.json 的 source_url 重下原始 txt → gunzip 校验 sha256 → gzip -9 回写 .gz。
//       manifest 里的 sha256 是发布时锚定的供应链基线 — 上游文件变化会在这里被拦下(不静默替换),
//       升级字典 = 改 manifest 的 sha256 + entries 并 review diff, 与代码变更同级。
// 网络: 仅 https; raw.githubusercontent 不可达时自动切 jsdelivr 镜像; 失败不阻塞退出 0 之外的语义 —
//       部分 successes 部分失败时 exit 3, 全失败 exit 2。
// 用法: node fetch-wordlists.mjs [--check]   # --check 只校验现有文件哈希, 不下载
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const WORDLISTS_DIR = process.env.D2D_WORDLISTS_DIR ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../assets/wordlists')
const CHECK_ONLY = process.argv.includes('--check')
const TIMEOUT_MS = 60_000
const MIRRORS = (u) => {
  const m = String(u ?? '').match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(.+)$/)
  return m ? [u, `https://cdn.jsdelivr.net/gh/${m[1]}/${m[2]}@${m[3].replace(/\/master\//, '/').replace(/\/main\//, '/')}`] : [u]
}

async function fetchRaw(url) {
  let lastErr
  for (const u of MIRRORS(url)) {
    try {
      const res = await fetch(u, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (res.ok) return Buffer.from(await res.arrayBuffer())
      lastErr = new Error(`http ${res.status}`)
    } catch (e) { lastErr = e }
  }
  throw lastErr ?? new Error('无可用源')
}

const manifest = JSON.parse(fs.readFileSync(path.join(WORDLISTS_DIR, 'manifest.json'), 'utf8'))
const targets = (manifest.files ?? []).filter((f) => f.source_url && f.sha256)
if (CHECK_ONLY) {
  let bad = 0
  for (const f of targets) {
    try {
      const raw = zlib.gunzipSync(fs.readFileSync(path.join(WORDLISTS_DIR, f.file)))
      const ok = crypto.createHash('sha256').update(raw).digest('hex') === f.sha256
      console.log(`${ok ? '✓' : '✗'} ${f.file}`)
      if (!ok) bad++
    } catch { console.log(`✗ ${f.file} 缺失`); bad++ }
  }
  process.exit(bad ? 1 : 0)
}

let okCount = 0, failCount = 0
for (const f of targets) {
  process.stdout.write(`… ${f.file}`)
  try {
    const raw = await fetchRaw(f.source_url)
    const actual = crypto.createHash('sha256').update(raw).digest('hex')
    if (actual !== f.sha256) {
      console.log(` ✗ 上游哈希变化(actual=${actual.slice(0, 12)}…) — 拒绝替换, 请 review 后更新 manifest`)
      failCount++
      continue
    }
    const gz = zlib.gzipSync(raw, { level: 9 })
    fs.writeFileSync(path.join(WORDLISTS_DIR, f.file), gz)
    console.log(` ✓ ${raw.toString('utf8').split('\n').length} 条`)
    okCount++
  } catch (e) {
    console.log(` ! 拉取失败(${e.message}) — 保留现有文件`)
    failCount++
  }
}
console.log(`\n完成: ${okCount} 更新 / ${failCount} 失败(失败项保留原文件, 不影响使用)`)
process.exit(failCount && !okCount ? 2 : failCount ? 3 : 0)
