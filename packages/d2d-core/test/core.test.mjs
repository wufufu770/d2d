import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DESTRUCTIVE, URL_RE, checkBash,
  CAP_KINDS, parseHotCaps, mergeCaps,
  normPattern, laplace,
} from '../src/index.mjs'

describe('d2d-core 转发导出存在性', () => {
  it('scope/caps/experience 的导出全部存在且类型正确', () => {
    assert.ok(Array.isArray(DESTRUCTIVE) && DESTRUCTIVE.length > 0)
    assert.ok(URL_RE instanceof RegExp)
    assert.equal(typeof checkBash, 'function')
    assert.deepEqual([...CAP_KINDS], ['recon', 'deep-dive', 'chain', 'verify', 'creative', 'link'])
    assert.equal(typeof parseHotCaps, 'function')
    assert.equal(typeof mergeCaps, 'function')
    assert.equal(typeof normPattern, 'function')
    assert.equal(typeof laplace, 'function')
  })
})

describe('d2d-core 转发行为正确性', () => {
  it('checkBash 拦截 rm -rf /', () => {
    const r = checkBash('rm -rf /', {})
    assert.ok(r, '应返回拦截原因')
  })
  it('checkBash 放行普通命令(带 scope)', () => {
    assert.equal(checkBash('ls -la /tmp', { scope: 'example.com' }), null)
  })
  it('parseHotCaps 白名单校验: 越界/未知键丢弃, 合法值保留', () => {
    const c = parseHotCaps({ caps: { recon: 99, verify: 4 }, deepParallel: 0, maxAgents: 3, bogus: 1 })
    assert.equal(c.caps.recon, undefined, '99 越界丢弃(非钳位)')
    assert.equal(c.caps.verify, 4)
    assert.equal(c.deepParallel, undefined, '0 不在文件合法区间, 丢弃')
    assert.equal(c.maxAgents, 3)
    assert.equal(c.bogus, undefined)
  })
  it('normPattern 归一到 succ:/fail: 前缀', () => {
    assert.match(normPattern('callback-forgery'), /^succ:/)
    assert.match(normPattern('fail:ew-ref-xss'), /^fail:/)
  })
  it('laplace 拉普拉斯先验边界', () => {
    assert.equal(laplace(0, 0), 0.5)
    assert.equal(laplace(1, 1), 0.67)
  })
})
