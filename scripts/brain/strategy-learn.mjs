#!/usr/bin/env node
// strategy-learn.mjs — 0913 星表反哺: 从 URL/文件/文本主动学策略(/strategy learn 语义)
// 产出 = knowledge/inbox 草稿(人工审 + study 蒸馏 + promote 门禁, 对齐 d2d 学习闭环)。
// 用法:
//   node scripts/brain/strategy-learn.mjs --url https://blog.example.com/writeup [--category auth_bypass] [--source "标注"]
//   node scripts/brain/strategy-learn.mjs --file ./report.md [--category sqli]
//   node scripts/brain/strategy-learn.mjs --text "发现的绕过手法: ..." 
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import dns from 'node:dns/promises'

const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const INBOX = `${DATA_DIR}/knowledge/inbox`
const FETCH_TIMEOUT_MS = 20_000
const MAX_BYTES = 2 * 1024 * 1024

// 出站 URL 门禁: 仅 http/https; host 解析结果全部落在公网(拒绝 localhost/环回/私有/保留地址)。
// 与 egress-gateway 的出网治理同方向: 学习流量不该打内网。
export function assertSafeUrl(raw) {
  let u
  try { u = new URL(String(raw ?? '')) } catch { throw new Error(`非法 URL: ${String(raw).slice(0, 80)}`) }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(`仅允许 http/https, 得到 ${u.protocol}`)
  const h = u.hostname.toLowerCase()
  const localNames = ['localhost', 'localhost.localdomain']
  if (localNames.includes(h) || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) {
    throw new Error(`拒绝本地/保留主机名: ${h}`)
  }
  // IP 字面量当场判(不等 DNS 步): 环回/私有/保留地址一律拒
  if (isPrivateIp(h.replace(/^\[|\]$/g, ''))) throw new Error(`拒绝私有/保留地址: ${h}`)
  return u
}

const isPrivateIp = (ip) => {
  // IPv4-mapped IPv6 归一(::ffff:a.b.c.d) — 原实现对 ::ffff:169.254.169.254 漏判(0913 审查 C8)
  if (/^::ffff:/i.test(String(ip ?? ''))) ip = String(ip).replace(/^::ffff:/i, '')

  if (ip === '::1' || ip === '::') return true
  if (/^f[cd]/i.test(ip)) return true          // fc00::/7 unique local
  if (/^fe[89ab]/i.test(ip)) return true       // fe80::/10 link local
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

export async function resolvePublicHost(u) {
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    if (isPrivateIp(host)) throw new Error(`拒绝私有/保留地址: ${host}`)
    return host
  }
  if (host.includes(':')) {
    if (isPrivateIp(host)) throw new Error(`拒绝私有/保留地址: ${host}`)
    return host
  }
  const addrs = await dns.lookup(host, { all: true })
  if (!addrs.length) throw new Error(`DNS 解析为空: ${host}`)
  for (const a of addrs) if (isPrivateIp(a.address)) throw new Error(`DNS 解析到私有/保留地址 ${a.address} — 拒绝(SSRF 防线)`)
  return host
}

export function stripHtml(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function learn({ url, file, text, dataDir = DATA_DIR, category = '', source = '' }) {
  let body = '', origin = ''
  if (url) {
    const u = assertSafeUrl(url)
    await resolvePublicHost(u)
    // 0913 审查 C7: 关闭自动重定向 — 每一跳重做出站校验(防 302→元数据地址 SSRF), 至多 3 跳
    let target = u, hops = 0
    for (;;) {
      const res = await fetch(target, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'manual' })
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location')
        if (!loc || ++hops > 3) throw new Error(`重定向链异常(跳数 ${hops} 或缺失 location)`)
        target = new URL(loc, target)
        assertSafeUrl(target.href)
        await resolvePublicHost(target)
        continue
      }
      if (!res.ok) throw new Error(`fetch ${res.status}`)
      const buf2 = Buffer.from(await res.arrayBuffer())
      if (buf2.length > MAX_BYTES) throw new Error(`响应超限(${buf2.length} > ${MAX_BYTES})`)
      const ct = res.headers.get('content-type') ?? ''
      body = ct.includes('html') ? stripHtml(buf2.toString('utf8')) : buf2.toString('utf8')
      break
    }
    origin = String(url)
  } else if (file) {
    body = fs.readFileSync(file, 'utf8')
    origin = `file:${file}`
  } else if (text) {
    body = String(text)
    origin = 'text'
  } else {
    throw new Error('需要 --url / --file / --text 其一')
  }
  if (!body.trim()) throw new Error('内容为空')
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = path.join(dataDir, 'knowledge', 'inbox')
  fs.mkdirSync(dir, { recursive: true })
  const out = path.join(dir, `strategy-learn-${ts}.md`)
  const head = [
    `# 策略学习草稿(strategy-learn 语义)`, '',
    `> 来源: ${origin}${source ? ` | 标注: ${source}` : ''}${category ? ` | 建议类目: ${category}` : ''} | 抓取时间: ${new Date().toISOString()}`,
    `> 状态: 草稿(人工审) — study 蒸馏 + promote 门禁③(wins≥3) 后入库; 本文件是 draft, 不是已确认策略。`, '',
  ].join('\n')
  fs.writeFileSync(out, head + body.slice(0, 300_000) + '\n')
  return out
}

// CLI 入口(被 import 时不执行)
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('strategy-learn.mjs')) {
  const argv = process.argv.slice(2)
  const argOf = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
  const url = argOf('--url'), file = argOf('--file'), text = argOf('--text')
  const category = argOf('--category'), source = argOf('--source')
  if (!url && !file && !text) {
    console.error('用法: strategy-learn.mjs --url <url> | --file <path> | --text "<...>" [--category <类目>] [--source "<标注>"]')
    process.exit(2)
  }
  learn({ url, file, text, category, source })
    .then((out) => { console.log(`✓ 草稿已入收件箱(人工审): ${out}`); process.exit(0) })
    .catch((e) => { console.error(`✗ ${e?.message}`); process.exit(1) })
}
