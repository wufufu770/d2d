// browser-detect.mjs — #45 浏览器复用检测 + 统一控制接口
// 决策: dsh builtin browser(~/.dsh/profiles/web 的 dsh-builtin-browser 痕迹)优先 →
//       playwright 可用(动态 import, 不装依赖) → none。
// 统一接口 unifiedBrowser(plan): builtin 模式桩化(真实实例由调用方注入),
// playwright 模式动态 import('playwright')。检测逻辑纯函数化, fs/playwright 均可注入。
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

// 检测 dsh builtin browser: ~/.dsh/profiles/web 下有插件痕迹(目录/包描述文件)
export function detectBuiltin({ home = os.homedir(), fsImpl = { existsSync, readdirSync } } = {}) {
  const dir = join(home, '.dsh', 'profiles', 'web')
  if (!fsImpl.existsSync(dir)) return { available: false }
  let entries = []
  try { entries = fsImpl.readdirSync(dir) } catch { return { available: false } }
  const hasPlugin =
    entries.includes('dsh-builtin-browser') ||
    entries.some((e) => e === 'plugin.json' || e === 'package.json')
  return { available: hasPlugin, dir }
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

// 统一控制接口 — 调用方拿到一致的 { start, navigate, click, fill, screenshot }
export function unifiedBrowser(plan, { builtinInstance, playwrightImport } = {}) {
  if (plan.mode === 'builtin') {
    // builtin 模式桩化: 真实实例由调用方注入; 未注入时方法为 no-op 桩
    const inst = builtinInstance ?? {
      start: async () => ({ ok: false, stub: true }), navigate: async () => ({ ok: false, stub: true }),
      click: async () => ({ ok: false, stub: true }), fill: async () => ({ ok: false, stub: true }),
      screenshot: async () => null,
    }
    return { mode: 'builtin', ...inst }
  }
  if (plan.mode === 'playwright') {
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
    }
  }
  return {
    mode: 'none',
    start: async () => ({ ok: false, reason: plan.reason }), navigate: async () => { throw new Error('#45 无可用浏览器') },
    click: async () => { throw new Error('#45 无可用浏览器') }, fill: async () => { throw new Error('#45 无可用浏览器') },
    screenshot: async () => null,
  }
}
