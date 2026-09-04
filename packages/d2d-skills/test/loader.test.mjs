import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseFrontmatter, loadSkillsDir, scoreSkills, SkillError, validateCard } from '../src/loader.mjs'

describe('parseFrontmatter 边界', () => {
  it('标准解析: 标量/布尔/数字/数组', () => {
    const { data, body } = parseFrontmatter('---\nname: ping\ncount: 3\nok: false\nallowed-tools: a, b ,c\n---\n# body\n')
    assert.equal(data.name, 'ping')
    assert.equal(data.count, 3)
    assert.equal(data.ok, false)
    assert.deepEqual(data['allowed-tools'], ['a', 'b', 'c'])
    assert.equal(body.trim(), '# body')
  })
  it('无 frontmatter → 空 data + 全文', () => {
    const { data, body } = parseFrontmatter('just text\n')
    assert.deepEqual(data, {})
    assert.equal(body, 'just text\n')
  })
  it('未闭合 --- → 不当 frontmatter', () => {
    const { data } = parseFrontmatter('---\nname: x')
    assert.deepEqual(data, {})
  })
  it('值内含冒号不受影响, 重复键取首个, 注释行跳过', () => {
    const { data } = parseFrontmatter('---\n# c\nwhen_to_use: a: b\nname: x\nname: y\n---\n')
    assert.equal(data['when_to_use'], 'a: b')
    assert.equal(data.name, 'x')
  })
  it('仅白名单字段 allowed-tools 做逗号切分; 其余含逗号值保持字符串', () => {
    const { data } = parseFrontmatter(
      '---\nname: x\ndescription: 对目标探测, 验证链路, 再出报告\nallowed-tools: Bash, Read ,WebFetch\ncategory: a,b\n---\n',
    )
    assert.deepEqual(data['allowed-tools'], ['Bash', 'Read', 'WebFetch'], '白名单字段切分为数组')
    assert.equal(data.description, '对目标探测, 验证链路, 再出报告', 'description 含逗号不拆(散文不是列表)')
    assert.equal(data.category, 'a,b', '非白名单字段一律保持字符串')
  })
})

describe('校验', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'skill-'))
  it('name 必须等于目录名', () => {
    assert.throws(() => validateCard({ name: 'a', description: 'd' }, '/x/b'), SkillError)
  })
  it('description 必填', () => {
    assert.throws(() => validateCard({ name: 'b' }, '/x/b'), SkillError)
  })
  it('description ≤ 200', () => {
    assert.throws(() => validateCard({ name: 'b', description: 'x'.repeat(201) }, '/x/b'), SkillError)
    assert.equal(validateCard({ name: 'b', description: 'ok' }, '/x/b')['user-invocable'], true, '缺省 user-invocable=true')
  })
  it('loadSkillsDir 跳过坏样本并收集 errors', () => {
    const root = tmp()
    fs.mkdirSync(path.join(root, 'good'))
    fs.writeFileSync(path.join(root, 'good', 'SKILL.md'), '---\nname: good\ndescription: fine\n---\n')
    fs.mkdirSync(path.join(root, 'bad'))
    fs.writeFileSync(path.join(root, 'bad', 'SKILL.md'), '---\nname: notbad\ndescription: x\n---\n')
    fs.mkdirSync(path.join(root, 'noskill'))
    const { cards, errors } = loadSkillsDir(root)
    assert.equal(cards.length, 1)
    assert.equal(cards[0].name, 'good')
    assert.equal(errors.length, 1)
    assert.ok(errors[0] instanceof SkillError)
  })
  it('scoreSkills: 打分/降序/0 分剔除/多关键词', () => {
    const cards = [
      { name: 'ping', category: 'recon', 'when_to_use': '连通性探测', description: '验证链路' },
      { name: 'recon-report', category: 'recon', 'when_to_use': '侦察完成后出报告', description: '汇总 recon 产出' },
      { name: 'unrelated', category: 'misc', 'when_to_use': '别的', description: '无关' },
    ]
    const r = scoreSkills(cards, ['recon', '报告'])
    assert.equal(r.length, 2, '0 分剔除')
    assert.equal(r[0].name, 'recon-report', 'name+category+when_to_use 多重命中分更高')
    assert.ok(r[0].score > r[1].score)
    assert.deepEqual(scoreSkills(cards, []), [])
  })
})
