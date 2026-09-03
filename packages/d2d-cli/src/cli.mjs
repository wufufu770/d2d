#!/usr/bin/env node
// @wufufu770/d2d-cli — 统一 CLI: 纯参数分发(node:util parseArgs)到各包导出, 本包不写业务。
import { parseArgs } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import { createClient, GRAPHD_DEFAULT_URL } from '../../d2d-graphd/src/index.mjs'
import { AGENT_MODEL } from '../../d2d-agents/src/index.mjs'
import { loadSkillsDir, scoreSkills } from '../../d2d-skills/src/loader.mjs'
import { HOOK_EVENTS } from '../../d2d-hooks/src/engine.mjs'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(PKG_ROOT, '..', '..')
const SKILLS_DIR = path.join(PKG_ROOT, '..', 'd2d-skills', 'skills')

function readVersion(pkgDir) {
  try { return JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version || '?' } catch { return '?' }
}

export const COMMANDS = ['version', 'list', 'doctor', 'graphd', 'agents', 'skills', 'hooks', 'osint-cred']

export async function run(argv = process.argv.slice(2), { out = console.log, fetchImpl = globalThis.fetch } = {}) {
  const [cmd, ...rest] = argv
  const { values } = parseArgs({
    args: rest,
    options: {
      'graphd-url': { type: 'string', default: process.env.GRAPHD_URL || GRAPHD_DEFAULT_URL },
      keyword: { type: 'string', default: '' },
      'host-token': { type: 'string', default: process.env.P2P_HOST_TOKEN || '' },
    },
    allowPositionals: true,
    strict: false,
  })
  switch (cmd) {
    case 'version': {
      out(`d2d-monorepo ${readVersion(REPO_ROOT)}`)
      for (const name of ['d2d-core', 'd2d-graphd', 'd2d-agents', 'd2d-skills', 'd2d-hooks', 'd2d-cli']) {
        out(`@wufufu770/${name} ${readVersion(path.join(REPO_ROOT, 'packages', name))}`)
      }
      return 0
    }
    case 'list': {
      out('workspace packages:')
      out('  plugin/pentest-dsh   — 三环调度器 dsh 插件(运行中)')
      out('  plugin/d2d-panel     — Web 面板(host 侧聚合)')
      for (const [n, d] of [
        ['d2d-core', '核心域函数转发'],
        ['d2d-graphd', 'graphd 客户端与启动指引'],
        ['d2d-agents', 'agent 形态转发'],
        ['d2d-skills', 'SKILL.md 加载器'],
        ['d2d-hooks', 'hook 引擎'],
        ['d2d-cli', '统一 CLI'],
      ]) out(`  packages/${n} — ${d}`)
      return 0
    }
    case 'doctor': {
      let fail = 0
      const [major] = process.versions.node.split('.').map(Number)
      if (major >= 20) out(`✔ node ${process.versions.node}`)
      else { fail++; out(`✘ node ${process.versions.node} (< 20, 建议 22)`) }
      try {
        const g = createClient({ baseUrl: values['graphd-url'], hostToken: values['host-token'], fetch: fetchImpl })
        await g.health()
        out(`✔ graphd ${values['graphd-url']} /health OK`)
      } catch (e) {
        fail++
        out(`✘ graphd ${values['graphd-url']} 不可达: ${e.message}`)
      }
      if (!process.env.P2P_HOST_TOKEN) out(`! P2P_HOST_TOKEN 未设置(token 不出 host, 仅本机使用)`)
      out(fail ? `doctor: ${fail} 项失败` : 'doctor: 全部通过')
      return fail ? 1 : 0
    }
    case 'graphd': {
      out(`graphd: ${values['graphd-url']}`)
      out('启动指引(本 CLI 不代装依赖): pip install -r requirements.txt && python3 graphd/app.py')
      return 0
    }
    case 'agents': {
      out(`rings: ${AGENT_MODEL.rings.join(' / ')}`)
      out(`capacity kinds: ${AGENT_MODEL.capacityKinds.join(', ')}`)
      out(`total agents: ${AGENT_MODEL.totalAgents}`)
      return 0
    }
    case 'skills': {
      const { cards, errors } = loadSkillsDir(SKILLS_DIR)
      for (const e of errors) out(`! ${e.message}`)
      const picked = values.keyword ? scoreSkills(cards, values.keyword.split(',')) : cards
      if (!picked.length) out('(no skills)')
      for (const c of picked) out(`${c.name} [${c.category ?? '-'}]${c.score ? ` score=${c.score}` : ''} — ${c.description}`)
      return 0
    }
    case 'hooks': {
      out(`events: ${HOOK_EVENTS.join(', ')}`)
      out('matcher: 缺省恒匹配 | 精确串 | "a|b" 多选 | /re/i 正则串')
      out('failMode: warn(默认) | block; hook 以当前用户权限执行, 不做 uid/gid 降级')
      return 0
    }
    case 'osint-cred': {
      const cards = path.join(REPO_ROOT, 'technique_cards.json')
      out(`OSINT 凭据/技术卡入口: ${cards}`)
      out(fs.existsSync(cards) ? `  (存在, ${JSON.parse(fs.readFileSync(cards, 'utf8')).length ?? '?'} 条) 使用方式见 docs/` : '  (文件不存在)')
      return 0
    }
    default:
      out(`d2d — 用法: d2d <${COMMANDS.join('|')}> [--graphd-url URL] [--keyword kw1,kw2]`)
      return cmd ? 1 : 0
  }
}

if (process.argv[1] && url.pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  run().then((code) => { process.exitCode = code })
}
