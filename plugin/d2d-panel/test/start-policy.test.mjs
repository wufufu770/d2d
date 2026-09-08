import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { validateStartRequest } from '../lib/host/start-policy.mjs'

test('validateStartRequest: 公网域名通过并补全格式', () => {
  const v = validateStartRequest({ target: 'demo-src.example.com' })
  assert.equal(v.ok, true)
  assert.equal(v.target, 'https://demo-src.example.com')
  assert.equal(v.host, 'demo-src.example.com')
  assert.equal(v.scope, 'demo-src.example.com') // scope 缺省 = 主机名
  assert.equal(v.instances, 2)
  assert.match(v.name, /^eng-\d{4}-\d{4}-demo-src(-example)?-[\w]{2}$/)
})

test('validateStartRequest: http 显式 scheme 保留, 自定义 scope/objective 透传', () => {
  const v = validateStartRequest({ target: 'http://demo-src.example.com', scope: 'demo-src.example.com,!mail.demo-src.example.com', instances: 3, objective: 'SRC 漏洞挖掘' })
  assert.equal(v.ok, true)
  assert.equal(v.target, 'http://demo-src.example.com')
  assert.ok(v.scope.includes('!mail'))
  assert.equal(v.instances, 3)
  assert.equal(v.objective, 'SRC 漏洞挖掘')
})

test('validateStartRequest: 环回/私有/保留段全拒(fail-closed)', () => {
  for (const t of ['localhost', '127.0.0.1', 'http://127.0.0.1:8080', '10.0.0.5', '192.168.1.10',
    '172.16.0.9', '172.31.255.1', '169.254.169.254', '0.0.0.0', '100.64.0.1',
    'DEMO-LOCAL', 'https://[::1]:3000', 'fd00::1']) {
    const v = validateStartRequest({ target: t })
    assert.equal(v.ok, false, `${t} 应被拒绝`)
  }
  // 明确错误语的子集(IPv6 裸地址先撞 URL 解析, 错误语不同)
  for (const t of ['localhost', '127.0.0.1', '10.0.0.5', '192.168.1.10', '169.254.169.254', 'https://[::1]:3000']) {
    const v = validateStartRequest({ target: t })
    assert.ok(/环回|私有|保留|公网/.test(v.error), `${t} 错误语不明确: ${v.error}`)
  }
})

test('validateStartRequest: 单段主机名拒绝(本地别名), 空目标拒绝, 非 http(s) scheme 拒绝', () => {
  assert.equal(validateStartRequest({ target: 'kali-box' }).ok, false)
  assert.equal(validateStartRequest({}).ok, false)
  assert.equal(validateStartRequest({ target: 'ftp://demo-src.example.com' }).ok, false)
})

test('validateStartRequest: instances 收敛 1..4, 非法值回退 2', () => {
  assert.equal(validateStartRequest({ target: 'demo-src.example.com', instances: 99 }).instances, 4)
  assert.equal(validateStartRequest({ target: 'demo-src.example.com', instances: 0 }).instances, 2)
  assert.equal(validateStartRequest({ target: 'demo-src.example.com', instances: 'x' }).instances, 2)
  assert.equal(validateStartRequest({ target: 'demo-src.example.com', instances: 1 }).instances, 1)
})
