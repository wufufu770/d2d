// match-site.mjs — 站点经验库(skyline web-access 采纳): site-patterns/<domain>.md 按 host 匹配注入。
// 用途: 调度器派发 discovery/deep worker 时, 目标 host 命中经验文件则把正文注入简报(站点专属打法)。
// 用法(库): import { matchSite } from '.../match-site.mjs'; matchSite('gamm3.ztgame.com') → 正文 | ''
// 用法(CLI): node match-site.mjs <host或URL>
// pattern 文件格式(site-patterns/ 下一个域一个 .md):
//   aliases: 别名1,别名2        ← 可选首行, 逗号分隔的附加匹配域名
//   (其余为经验正文 markdown — 登录入口/接口习惯/已知坑/有效 payload 形态)
// 原则: 只放"如何更高效地测这个站点"的经验, 不放未验证结论; 挖掘产物的沉淀走知识脑卡片。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'site-patterns')
// 本地经验库(D2D_SITE_PATTERNS, 不进 git 的真实目标经验)优先, 仓库自带样例次之。
// env 在每次调用时读取(测试可注入, 不做模块加载期缓存)。
const dirs = () => [process.env.D2D_SITE_PATTERNS, DIR].filter(Boolean)

export function matchSite(query) {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return ''
  const host = q.replace(/^[a-z]+:\/\//, '').split('/')[0].split(':')[0]
  if (!host) return ''
  for (const dir of dirs()) {
    if (!dir || !fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir).sort()) {
      if (!f.endsWith('.md') || f === 'README.md') continue
      const raw = fs.readFileSync(path.join(dir, f), 'utf8')
      const aliases = (raw.match(/^aliases:\s*(.+)$/m)?.[1] ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
      const domain = f.replace(/\.md$/, '').toLowerCase()
      const hit = (d) => host === d || host.endsWith(`.${d}`)
      if (hit(domain) || aliases.some(hit)) return raw
    }
  }
  return ''
}

// CLI 直查: node match-site.mjs <host>
if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  const hit = matchSite(process.argv[2] ?? '')
  process.stdout.write(hit || '')
}
