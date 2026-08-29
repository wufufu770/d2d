#!/bin/bash
# curate.sh — 知识自动策源: 拉取 config/curate.json 里的文章源 → 转 md 存 knowledge/inbox
# 用法: bash scripts/brain/curate.sh   (建议车道空闲时由 watchdog 调用或手动)
set -uo pipefail
REPO="${D2D:-$(cd "$(dirname "$0")/../.." && pwd)}"
DATA_DIR="${D2D_DATA_DIR:-$HOME/.d2d-data}"
INBOX="$DATA_DIR/knowledge/inbox"
CFG="$REPO/config/curate.json"
mkdir -p "$INBOX"
[ -f "$CFG" ] || { echo "无 $CFG — 写入 {\"sources\":[{\"url\":\"https://...\",\"name\":\"示例\"}]} 后重跑"; exit 0; }
node - "$CFG" "$INBOX" <<'EOF'
const fs = require('fs')
const { execFileSync } = require('child_process')
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const inbox = process.argv[3]
let n = 0
for (const s of cfg.sources ?? []) {
  const name = (s.name || s.url.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40)).replace(/[/\\]/g, '')
  const out = `${inbox}/${new Date().toISOString().slice(0, 10)}-${name}.md`
  if (fs.existsSync(out)) continue
  try {
    const body = execFileSync('curl', ['-sL', '-m', '30', s.url], { encoding: 'utf8', maxBuffer: 20e6 })
    // 极简 HTML→文本(策源粗提, 精炼由 study 阶段完成)
    const text = body.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s{3,}/g, '\n').trim()
    if (text.length < 500) throw new Error('内容过短')
    fs.writeFileSync(out, `# ${s.name ?? s.url}\n> source: ${s.url}\n\n${text.slice(0, 200_000)}\n`)
    n++
    console.log(`✓ ${out}`)
  } catch (e) { console.error(`✗ ${s.url}: ${e.message}`) }
}
console.log(`策源完成, 新增 ${n} 篇 → ${inbox}`)
EOF
