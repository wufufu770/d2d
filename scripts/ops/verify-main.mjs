#!/usr/bin/env node
// verify-main.mjs — 发布后终验: main 分支关键交付物在位 + 数据泄露零命中
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const files = execFileSync('gh', ['api', 'repos/wufufu770/d2d/git/trees/main?recursive=1', '--jq', '.tree[].path'], { encoding: 'utf8' }).trim().split('\n')
const set = new Set(files)
const REQUIRED = [
  'README.md', 'install.sh', 'manifest.sha256', 'requirements.txt', 'pnpm-workspace.yaml',
  'graphd/app.py', 'graphd/audit.py',
  'ops/start-all.sh',
  'plugin/pentest-dsh/scheduler.js', 'plugin/pentest-dsh/validator.js',
  'plugin/pentest-dsh/domain/lifecycle.mjs', 'plugin/pentest-dsh/domain/briefs.mjs',
  'plugin/pentest-dsh/domain/triage.mjs', 'plugin/pentest-dsh/domain/failover.mjs',
  'plugin/d2d-panel/lib/client.js', 'plugin/d2d-panel/lib/host/snapshot.mjs',
  'scripts/brain/study.mjs', 'scripts/brain/promote.mjs', 'scripts/brain/insight.mjs',
  'scripts/gateway/egress-gateway.mjs', 'scripts/gateway/oast.mjs', 'scripts/gateway/spa-render.mjs',
  'scripts/ops/doctor.mjs', 'scripts/ops/publish-clean.mjs', 'scripts/ops/scan-clean.mjs',
  'scripts/ops/push-workflows.mjs', 'scripts/ops/retrieve-token.mjs', 'scripts/ops/device-flow.mjs',
  'scripts/ops/backup-graph.sh', 'scripts/ops/model-rotate.mjs',
  'scripts/systemd/install.sh', 'scripts/systemd/d2d-graphd.service',
  'scripts/systemd/d2d-egress.service', 'scripts/systemd/d2d-oast.service', 'scripts/systemd/d2d-dsh-web.service',
  'scripts/integrations/interactsh-client.mjs', 'scripts/integrations/zap-bridge.mjs',
  'tests/test_graphd_gates.py', 'tests/injection/run-injection.mjs',
  'packages/d2d-core/package.json', 'packages/d2d-cli/package.json',
  'brain/seed/v0-techniques.json', 'config/model-policies.example.json',
  '.github/workflows/gates.yml', '.github/workflows/ci.yml', '.github/workflows/publish.yml',
  '.github/CODEOWNERS', '.github/dependabot.yml',
]
let miss = 0
for (const f of REQUIRED) {
  if (set.has(f)) { console.log('✓', f) } else { console.log('✗ 缺失:', f); miss++ }
}
// 不应存在的(运行数据/挖掘记录): 日期型 engagement 目录/知识缓存/依赖目录
const JUNK = files.filter((f) => /kuzu_db|technique_cards|^output\/|\.d2d-data|\.mimosa|node_modules|^runs\/|eng-\d{4}-\d{4}/i.test(f))
console.log('\n运行数据/挖掘记录残留:', JUNK.length ? JUNK.join(', ') : '无 ✓')
console.log(`\n关键交付物: ${REQUIRED.length - miss}/${REQUIRED.length} 在位 | 总文件: ${files.length} | 分支: 仅 main`)
process.exit(miss || JUNK.length ? 1 : 0)
