#!/usr/bin/env node
// wxapkg.mjs — 0913 小程序工具面: wxapkg 定位 + 解包(skyline wxapkg_locate/decompile 吸纳)
// 用法:
//   node scripts/wmpf/wxapkg.mjs locate --appid wx1234567890abcdef
//   node scripts/wmpf/wxapkg.mjs decompile --pkg /path/__APP__.wxapkg --out ./recon-pkg
// 纪律(与 wmpf-recon 角色对齐): 找不到包/未装解包工具 → 明确写 [反编译阻塞], 可继续动态轨
// 但不能宣称 API 格式已逆向; 禁止默认 hook 改包。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

// 已知微信小程序包缓存目录(平台差异大, WMPF_CACHE_DIR 可覆盖/追加, 分号分隔)
export function cacheDirs(home = os.homedir(), env = process.env) {
  const base = [
    `${home}/.local/share/WeChat`,
    `${home}/.local/share/wxwork`,
    `${home}/.config/WeChat`,
    `${home}/AppData/Roaming/Tencent/WeChat`,       // wine/兼容层常见
    `${home}/.wine/drive_c/users`,
    '/opt/wechat',
  ]
  if (env.WMPF_CACHE_DIR) base.unshift(...env.WMPF_CACHE_DIR.split(';').filter(Boolean))
  return base
}

// 定位: 在缓存目录里找匹配 appid(或全部)的 .wxapkg
export function locate({ appid = '', home = os.homedir(), env = process.env } = {}) {
  const hits = []
  const dirs = cacheDirs(home, env)
  for (const d of dirs) {
    let stack = [d]
    while (stack.length && hits.length < 200) {
      const cur = stack.pop()
      let ents = []
      try { ents = fs.readdirSync(cur, { withFileTypes: true }) } catch { continue }
      for (const e of ents) {
        const full = path.join(cur, e.name)
        if (e.isDirectory()) {
          if (appid && e.name.toLowerCase().includes(String(appid).toLowerCase())) {
            // appid 目录命中 → 优先扫其内
            stack.push(full)
          } else stack.push(full)
        } else if (e.name.endsWith('.wxapkg')) {
          if (!appid || full.toLowerCase().includes(String(appid).toLowerCase())) {
            let size = 0
            try { size = fs.statSync(full).size } catch {}
            hits.push({ path: full, size })
          }
        }
      }
    }
  }
  return hits
}

// 解包: 优先 unveilr / KillWxapkg, 未装则 [反编译阻塞](不冒充成功)
export function decompile(pkg, outDir) {
  if (!pkg || !fs.existsSync(pkg)) return { ok: false, reason: `[反编译阻塞] 包不存在: ${pkg}` }
  const tools = ['unveilr', 'KillWxapkg', 'wxappUnpacker']
  const bin = tools.find((t) => {
    try { spawnSync(t, ['--help'], { stdio: 'ignore' }); return true } catch { return false }
  })
  if (!bin) {
    return { ok: false, reason: `[反编译阻塞] 未安装解包工具(${tools.join('/')}) — 可继续动态轨, 但不能宣称 API 格式已逆向; 安装后重试: npm i -g unveilr` }
  }
  fs.mkdirSync(outDir, { recursive: true })
  const r = spawnSync(bin, [pkg, '--out', outDir], { encoding: 'utf8', timeout: 240_000, maxBuffer: 32e6 })
  if (r.status !== 0) return { ok: false, reason: `[反编译阻塞] ${bin} 退出码 ${r.status}: ${String(r.stderr ?? '').slice(0, 300)}` }
  return { ok: true, out: outDir, tool: bin }
}

if (process.argv[1]?.endsWith('wxapkg.mjs')) {
  const argv = process.argv.slice(2)
  const cmd = argv[0]
  const argOf = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
  if (cmd === 'locate') {
    const hits = locate({ appid: argOf('--appid') ?? '' })
    if (!hits.length) console.log('[反编译阻塞] 缓存目录未找到 .wxapkg — 确认 PC 端微信登录过目标小程序, 或设 WMPF_CACHE_DIR 指向缓存根')
    else for (const h of hits) console.log(`${h.path} (${Math.round(h.size / 1024)}KB)`)
  } else if (cmd === 'decompile') {
    const pkg = argOf('--pkg'), out = argOf('--out') ?? path.join(process.cwd(), 'wxapkg-out')
    const r = decompile(pkg, out)
    console.log(r.ok ? `✓ 解包完成: ${r.out} (tool=${r.tool})` : r.reason)
    process.exit(r.ok ? 0 : 3)
  } else {
    console.error('用法: wxapkg.mjs locate --appid <id> | decompile --pkg <path> --out <dir>')
    process.exit(2)
  }
}
