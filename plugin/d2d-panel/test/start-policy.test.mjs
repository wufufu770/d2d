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

// ── C6(审计 0910): scope 逐条目与 target 同级 FORBIDDEN 校验 ──
// 旧版 scope 只 trim+截断: POST scope:'0.0.0.0/0,localhost,169.254.169.254' 直接入图,
// egress 网关动态 scope 并集后放行内网/云元数据。
test('validateStartRequest: scope 恶意条目全拒(C6 攻击 payload + 各保留段)', () => {
  for (const scope of [
    'demo-src.example.com,0.0.0.0/0,localhost,169.254.169.254', // 审计原始 payload
    'localhost',
    '169.254.169.254',
    '127.0.0.1',
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.1.0/24',
    '100.64.0.0/10',
    '0.0.0.0/1', // base 公网观感, 覆盖面吞掉 0/8 与 100.64/10
    '128.0.0.0/1', // 覆盖 169.254/16
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:10.0.0.5', // IPv4-mapped IPv6 点分形态
    '::ffff:7f00:1', // IPv4-mapped IPv6 Node 规范化(十六进制)形态
    '203.0.113.0/24', // base 公网观感, 段内是保留段(此处按面板口径一并拒)
  ]) {
    const v = validateStartRequest({ target: 'demo-src.example.com', scope })
    assert.equal(v.ok, false, `scope "${scope}" 应被拒`)
    assert.match(v.error, /scope 条目/, `${scope} 错误语应指出具体条目`)
  }
})

test('validateStartRequest: scope 正常条目过(域名/!排除/公网 IP/CIDR/公网 v6), 条目不整段误伤', () => {
  const v = validateStartRequest({ target: 'demo-src.example.com', scope: 'demo-src.example.com,!mail.demo-src.example.com,1.1.1.1,8.8.8.0/24,2606:4700::1111' })
  assert.equal(v.ok, true)
  assert.ok(v.scope.includes('!mail.demo-src.example.com'), '! 排除条目保留原样入库')
  assert.ok(v.scope.includes('8.8.8.0/24'))
  const v2 = validateStartRequest({ target: 'demo-src.example.com', scope: 'sub.demo-src.example.com,8.8.4.4' })
  assert.equal(v2.ok, true)
})

test('validateStartRequest: scope 非法形态拒(单段主机名/通配符/带 scheme/垃圾 CIDR)', () => {
  for (const scope of ['intranet', '*.demo-src.example.com', 'http://demo-src.example.com', '8.8.8.0/99']) {
    const v = validateStartRequest({ target: 'demo-src.example.com', scope })
    assert.equal(v.ok, false, `scope "${scope}" 应被拒`)
  }
})
