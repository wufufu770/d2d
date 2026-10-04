#!/usr/bin/env node
// scripts/brain/embed-model-fetch.mjs — R5 模型下载器(供应链纪律: 钉 URL+sha256 校验,
// 只落 DATA_DIR/models/ 外置目录, 不入仓不入 CI)。
// 源=HF 官方或 hf-mirror(国内可达), 文件四件(model.onnx/tokenizer.json/config.json/
// tokenizer_config.json)。校验失败即拒绝落位(供应链红线)。
// 用法: node scripts/brain/embed-model-fetch.mjs [--mirror] [--force]
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// sha256 钉值(基线建立=首次可信下载实测; 更换模型版本必须换表)。空=首次建立(下载后打印发值)。
const PINNED_SHA256 = {
  'model.onnx': '', // 基线: 见 scripts 首次运行输出
  'tokenizer.json': '',
  'config.json': '',
  'tokenizer_config.json': '',
}

const MODEL_REPO = 'Xenova/bge-small-zh-v1.5'
const MIRRORS = [
  (p) => `https://huggingface.co/${MODEL_REPO}/resolve/main/${p}`,
  (p) => `https://hf-mirror.com/${MODEL_REPO}/resolve/main/${p}`,
]
const MIRROR = process.argv.includes('--mirror') ? 1 : 0
const FORCE = process.argv.includes('--force')

function dataDir() {
  return process.env.D2D_DATA_DIR || `${os.homedir()}/.d2d-data`
}
const DEST = process.env.P2P_EMBED_MODEL_DIR ?? path.join(dataDir(), 'models', 'bge-small-zh-v1.5')

function fetchFile(url, dest, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      execFileSync('curl', ['-sL', '--fail', '-m', '600', '-o', dest, url], { stdio: ['ignore', 'ignore', 'inherit'] })
      return true
    } catch (e) {
      console.error(`  尝试 ${i} 失败: ${e?.message?.slice(0, 120)}`)
      if (i < attempts) execFileSync('sleep', ['10'])
    }
  }
  return false
}

function sha256(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirect) {
  fs.mkdirSync(DEST, { recursive: true })
  const summary = []
  for (const [file, pinned] of Object.entries(PINNED_SHA256)) {
    const dest = path.join(DEST, file)
    if (fs.existsSync(dest) && !FORCE && pinned && sha256(dest) === pinned) {
      console.log(`SKIP(已就位+校验过): ${file}`)
      summary.push({ file, status: 'skip' })
      continue
    }
    const url = MIRRORS[MIRROR](file)
    console.log(`下载 ${file} ← ${url}`)
    let ok = false
    for (const m of [MIRROR, 1 - MIRROR]) {
      if (fetchFile(MIRRORS[m](file), dest)) { ok = true; break }
    }
    if (!ok) { console.error(`✗ ${file} 下载失败(双源)——止损: 模型面降级登记, 检索链不受影响(降级链)`); process.exit(2) }
    const digest = sha256(dest)
    if (pinned && digest !== pinned) {
      fs.rmSync(dest)
      console.error(`✗ ${file} sha256 不匹配(供应链红线): got ${digest} want ${pinned}——已删除`)
      process.exit(3)
    }
    if (!pinned) console.log(`  【首次基线】${file} sha256=${digest} ← 写回 PINNED_SHA256 表`)
    summary.push({ file, status: 'downloaded', sha256: digest })
  }
  console.log(JSON.stringify({ dest: DEST, files: summary }, null, 1))
}
