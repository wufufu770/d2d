// browser-detect.mjs — #45 浏览器复用检测 + 统一控制接口
// 决策: dsh builtin browser(~/.dsh/profiles/web 的 dsh-builtin-browser 痕迹)优先 →
//       playwright 可用(动态 import, 不装依赖) → none。
// 统一接口 unifiedBrowser(plan): builtin 模式桩化(真实实例由调用方注入),
// playwright 模式动态 import('playwright')。检测逻辑纯函数化, fs/playwright 均可注入。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

const BUILTIN_MARK = 'dsh-builtin-browser'
const MANIFESTS = ['plugin.json', 'package.json']

// 检测 dsh builtin browser: ~/.dsh/profiles/web 下有 dsh-builtin-browser 痕迹
// 复审#15: 判定收紧 — 只认 dsh-builtin-browser 目录名, 或 manifest(plugin.json/
// package.json) 内容里声明了该名字; 不再"见 plugin.json 就认"(任意插件都命中)。
export function detectBuiltin({ home = os.homedir(), fsImpl = { existsSync, readdirSync, readFileSync } } = {}) {
  const dir = join(home, '.dsh', 'profiles', 'web')
  if (!fsImpl.existsSync(dir)) return { available: false }
  let entries = []
  try { entries = fsImpl.readdirSync(dir) } catch { return { available: false } }
  if (entries.includes(BUILTIN_MARK)) return { available: true, dir }
  for (const m of MANIFESTS) {
    if (!entries.includes(m)) continue
    try {
      const parsed = JSON.parse(fsImpl.readFileSync(join(dir, m), 'utf8'))
      const name = [parsed?.name, parsed?.plugin?.name].find((v) => typeof v === 'string') ?? ''
      if (name.includes(BUILTIN_MARK)) return { available: true, dir }
    } catch { continue } // 坏 manifest/读失败不算命中, 也不上抛
  }
  return { available: false, dir }
}

// 检测 playwright: 动态 import, 失败即不可用(绝不触发安装)
export async function detectPlaywright({ importImpl = (m) => import(m) } = {}) {
  try {
    const pw = await importImpl('playwright')
    return { available: true, api: pw }
  } catch {
    return { available: false }
  }
}

export async function detectBrowser(opts = {}) {
  const builtin = detectBuiltin(opts)
  const playwright = await detectPlaywright(opts)
  return { builtin, playwright }
}

// 决策表: builtin > playwright > none
export function browserPlan(detectResult) {
  if (detectResult?.builtin?.available) {
    return { mode: 'builtin', reason: `#45 dsh builtin browser 在 ${detectResult.builtin.dir} 可用, 优先复用` }
  }
  if (detectResult?.playwright?.available) {
    return { mode: 'playwright', reason: '#45 playwright 可用(动态 import 成功)' }
  }
  return { mode: 'none', reason: '#45 builtin 痕迹与 playwright 均不可用' }
}

// 统一控制接口 — 调用方拿到一致的 { start, navigate, click, fill, screenshot, close, dispose }
// (复审#15: 补 close/dispose, 调用方能确定性释放浏览器)
export function unifiedBrowser(plan, { builtinInstance, playwrightImport } = {}) {
  if (plan.mode === 'builtin') {
    // builtin 模式桩化: 真实实例由调用方注入; 未注入时方法为 no-op 桩
    const inst = {
      start: async () => ({ ok: false, stub: true }), navigate: async () => ({ ok: false, stub: true }),
      click: async () => ({ ok: false, stub: true }), fill: async () => ({ ok: false, stub: true }),
      screenshot: async () => null,
      close: async () => ({ ok: false, stub: true }), dispose: async () => ({ ok: false, stub: true }),
      ...(builtinInstance ?? {}),
    }
    return { mode: 'builtin', ...inst }
  }
  if (plan.mode === 'playwright') {
    const closeBrowser = async (ctx) => { try { await ctx?.browser?.close?.() } catch {} }
    return {
      mode: 'playwright',
      start: async () => {
        const pw = await (playwrightImport ? playwrightImport() : import('playwright'))
        const browser = await pw.chromium.launch()
        const page = await browser.newPage()
        return { browser, page }
      },
      navigate: async (ctx, url) => ctx.page.goto(url),
      click: async (ctx, sel) => ctx.page.click(sel),
      fill: async (ctx, sel, val) => ctx.page.fill(sel, val),
      screenshot: async (ctx, path) => ctx.page.screenshot({ path }),
      close: closeBrowser, // 关 browser(连带 page)
      dispose: closeBrowser,
    }
  }
  return {
    mode: 'none',
    start: async () => ({ ok: false, reason: plan.reason }), navigate: async () => { throw new Error('#45 无可用浏览器') },
    click: async () => { throw new Error('#45 无可用浏览器') }, fill: async () => { throw new Error('#45 无可用浏览器') },
    screenshot: async () => null,
    close: async () => {}, dispose: async () => {}, // 无浏览器: 空操作即可确定性释放
  }
}
