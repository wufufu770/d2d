import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

// inline-build 回归(复审 HIGH): copyRewrite 曾每次只拿单条目 inlined 映射(opts.inlined[abs] 恒
// undefined) → 改写完全失效; 且恒加 './' 前缀对子目录文件路径错误。
// 最小双文件场景: 包内 src/index.mjs(子目录) import 包外 plugin 源码 → 产物 import 必须改写为
// 产物内真实相对路径(带 ../), 且产物可被动态 import(零仓库依赖)。
const SCRIPT = fileURLToPath(new URL('../../../scripts/pack/inline-build.mjs', import.meta.url))

describe('scripts/pack/inline-build.mjs import 改写', () => {
  it('包内文件 import 包外 plugin 源码 → 产物改写为真实相对路径且可被 import', async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-inline-'))
    try {
      fs.mkdirSync(path.join(repo, 'packages/demo-pkg/src'), { recursive: true })
      fs.mkdirSync(path.join(repo, 'plugin/ext'), { recursive: true })
      fs.writeFileSync(path.join(repo, 'packages/demo-pkg/package.json'),
        JSON.stringify({ name: 'demo-pkg', version: '0.1.0', description: 'fixture', type: 'module', private: true }))
      fs.writeFileSync(path.join(repo, 'plugin/ext/tool.mjs'), 'export function tool() { return "tool-ok" }\n')
      fs.writeFileSync(path.join(repo, 'packages/demo-pkg/src/index.mjs'),
        "import { tool } from '../../../plugin/ext/tool.mjs'\nexport const greeting = tool()\n")

      const dist = path.join(repo, 'dist')
      execFileSync(process.execPath, [SCRIPT, '--out', dist, 'demo-pkg'],
        { env: { ...process.env, D2D_INLINE_BUILD_REPO: repo }, cwd: repo })

      const built = fs.readFileSync(path.join(dist, 'demo-pkg/src/index.mjs'), 'utf8')
      assert.match(built, /from\s*'\.\.\/vendor\/plugin\/ext\/tool\.mjs'/,
        '改写为产物内真实相对路径: src/ 子目录引用 vendor/ 必须带 ../(恒加 ./ 前缀是错的)')
      assert.ok(!built.includes('../../../plugin/'), '不得残留指向仓库外的说明符')
      assert.ok(fs.existsSync(path.join(dist, 'demo-pkg/vendor/plugin/ext/tool.mjs')), '依赖已内联进 vendor/')

      const meta = JSON.parse(fs.readFileSync(path.join(dist, 'demo-pkg/package.json'), 'utf8'))
      assert.equal(meta.private, undefined, '发布形态删除 private')

      const m = await import(pathToFileURL(path.join(dist, 'demo-pkg/src/index.mjs')).href)
      assert.equal(m.greeting, 'tool-ok', '产物可被动态 import 且语义不变')
    } finally {
      fs.rmSync(repo, { recursive: true, force: true })
    }
  })
})
