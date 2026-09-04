import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createInProcessAdapter, inprocessWorkerToken, AGENT_MODEL } from '../src/index.mjs'

describe('d2d-agents 转发导出', () => {
  it('createInProcessAdapter 是函数', () => {
    assert.equal(typeof createInProcessAdapter, 'function')
  })
  it('inprocessWorkerToken 返回字符串(宿主未设 P2P_WORKER_TOKEN 时为空串)', () => {
    const t = inprocessWorkerToken()
    assert.equal(typeof t, 'string')
  })
  it('AGENT_MODEL 描述三环 12 agent', () => {
    assert.equal(AGENT_MODEL.totalAgents, 12)
    assert.equal(AGENT_MODEL.rings.length, 3)
    assert.ok(AGENT_MODEL.capacityKinds.includes('recon'))
  })
  it('createInProcessAdapter 暴露与 adapter-dsh 一致的调度器契约', () => {
    const a = createInProcessAdapter({})
    for (const k of ['spawnWorker', 'killAllWorkers', 'registerGate']) {
      assert.equal(typeof a[k], 'function', `缺 ${k}`)
    }
  })
})
