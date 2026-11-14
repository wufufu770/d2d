// host-fence.test.mjs — 浏览器信任栅栏回归(E39: 回环 ∪ 本机接口地址 ∪ trustedHosts 三层闸)
// 栅栏是面板安全第一层: 谁有资格声明 authority; 第 2/3 层(sec-fetch-site/Origin)在本面之后。
import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import { isTrustedApiRequest } from '../lib/host/index.mjs'

/** 取本机一个非内部 IPv4(无则跳过相关断言——纯回环环境不跑 LAN 面)。 */
function lanAddr() {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a?.family === 'IPv4' && !a.internal) return a.address
    }
  }
  return null
}

test('fence: 回环 Host 放行(缺省 127.0.0.1 绑定形态行为不变)', () => {
  assert.equal(isTrustedApiRequest({ headers: { host: '127.0.0.1:8899' } }), true)
  assert.equal(isTrustedApiRequest({ headers: { host: 'localhost:8899' } }), true)
})

test('fence: 本机接口地址 Host 放行(LAN 绑定形态——宿主机浏览器同款)', () => {
  const lan = lanAddr()
  if (!lan) return assert.ok(true, '无 LAN 接口, 跳过')
  assert.equal(isTrustedApiRequest({ headers: { host: `${lan}:8899` } }), true, `Host=${lan}(本机接口)应放行`)
})

test('fence: 外部 IP Host 拒(伪造他人/非本机 authority)', () => {
  assert.equal(isTrustedApiRequest({ headers: { host: '203.0.113.9:8899' } }), false, 'TEST-NET-3 非本机地址')
  assert.equal(isTrustedApiRequest({ headers: { host: '10.250.250.250:8899' } }), false, '私有段非本机地址')
})

test('fence: sec-fetch-site cross-site 恒拒(第 2 层闸不因 LAN 放行而松动)', () => {
  const lan = lanAddr() ?? '127.0.0.1'
  assert.equal(isTrustedApiRequest({ headers: { host: `${lan}:8899`, 'sec-fetch-site': 'cross-site' } }), false)
})

test('fence: Origin 与 Host 不同源拒(第 3 层闸)', () => {
  const lan = lanAddr() ?? '127.0.0.1'
  assert.equal(isTrustedApiRequest({ headers: { host: `${lan}:8899`, origin: `http://evil.example:8899` } }), false)
  assert.equal(isTrustedApiRequest({ headers: { host: `${lan}:8899`, origin: `http://${lan}:8899` } }), true)
})

test('fence: 显式 trustedHosts 放行(域名形态), 空 host 恒拒', () => {
  assert.equal(isTrustedApiRequest({ headers: { host: 'panel.corp.lan:8899' } }, ['panel.corp.lan']), true)
  assert.equal(isTrustedApiRequest({ headers: {} }), false)
})
