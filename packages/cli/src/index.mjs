#!/usr/bin/env node
// @wufufu770/d2d-cli - unified d2d CLI
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawnSync } from 'node:child_process';

const VERSION = '0.2.0';
const D2D_PACKAGES = [
  '@wufufu770/d2d-core',
  '@wufufu770/d2d-graphd',
  '@wufufu770/d2d-agents',
  '@wufufu770/d2d-skills',
  '@wufufu770/d2d-hooks',
  '@wufufu770/d2d-cli',
];

function log(msg) { process.stdout.write(msg + '\n'); }
function err(msg) { process.stderr.write(msg + '\n'); }
function die(msg) { err('error: ' + msg); process.exit(1); }

function parseArgs(argv) {
  const args = argv.slice(2);
  const cmd = args[0];
  const rest = args.slice(1);
  return { cmd, args: rest };
}

function findGlobalRoot() {
  // Walk up from cwd to find package.json with d2d deps
  let dir = process.cwd();
  while (dir !== '/') {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.dependencies && Object.keys(pkg.dependencies).some(d => d.startsWith('@wufufu770/d2d-'))) {
          return dir;
        }
      } catch {}
    }
    dir = path.dirname(dir);
  }
  return null;
}

function cmdVersion() {
  log(`@wufufu770/d2d-cli ${VERSION}`);
  log(`Node ${process.version}`);
  log(`Platform ${process.platform}/${process.arch}`);
}

function cmdList() {
  log('Installed @wufufu770/d2d-* packages:');
  for (const pkg of D2D_PACKAGES) {
    try {
      const v = execSync(`npm ls ${pkg} --depth=0 2>/dev/null`, { encoding: 'utf8' });
      const installed = v.includes(pkg);
      log(`  ${installed ? '✓' : '✗'} ${pkg}`);
    } catch {
      log(`  ? ${pkg} (status unknown)`);
    }
  }
}

function cmdDoctor() {
  log('d2d doctor:');
  const checks = [
    { name: 'node >= 18', ok: parseInt(process.versions.node) >= 18 },
    { name: 'python3', ok: spawnSync('python3', ['--version']).status === 0 },
    { name: 'pip', ok: spawnSync('python3', ['-m', 'pip', '--version']).status === 0 },
    { name: 'kuzu', ok: spawnSync('python3', ['-c', 'import kuzu']).status === 0 },
    { name: 'pnpm', ok: spawnSync('pnpm', ['--version']).status === 0 },
  ];
  for (const c of checks) {
    log(`  ${c.ok ? '✓' : '✗'} ${c.name}`);
  }

  // Check host-key
  const keyPath = path.join(os.homedir(), '.config', 'd2d', 'host-key.pub');
  log(`  ${fs.existsSync(keyPath) ? '✓' : '✗'} host-key (${keyPath})`);

  // Summary
  const failed = checks.filter(c => !c.ok).length;
  if (failed === 0) {
    log('\nAll checks passed.');
  } else {
    log(`\n${failed} check(s) failed. See above.`);
    process.exit(1);
  }
}

function cmdInstall(args) {
  log('Installing d2d sub-packages...');
  const root = findGlobalRoot();
  if (!root) {
    die('d2d project root not found (no package.json with @wufufu770/d2d-* deps)');
  }
  log(`Project root: ${root}`);
  // Delegate to pnpm install
  const r = spawnSync('pnpm', ['install', ...args], { cwd: root, stdio: 'inherit' });
  process.exit(r.status || 0);
}

function cmdUpdate() {
  return cmdInstall(['--latest']);
}

function cmdInit() {
  const configDir = path.join(os.homedir(), '.config', 'd2d');
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  log(`✓ Config dir: ${configDir}`);

  // Generate host-key (if not present)
  const { generateKeyPairSync, createPublicKey, createHash } = require('node:crypto');
  const privPath = path.join(configDir, 'host-key');
  const pubPath = path.join(configDir, 'host-key.pub');
  if (fs.existsSync(privPath)) {
    log('✓ host-key already exists');
  } else {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
    fs.writeFileSync(privPath, privPem, { mode: 0o600 });
    fs.writeFileSync(pubPath, pubPem, { mode: 0o644 });
    const der = publicKey.export({ type: 'spki', format: 'der' });
    const fp = createHash('sha256').update(der).digest('hex');
    fs.writeFileSync(path.join(configDir, 'host-key.fp'), fp + '\n', { mode: 0o644 });
    log(`✓ host-key generated: ${privPath}`);
    log(`  fingerprint: ${fp}`);
  }

  // Create data dir
  const dataDir = path.join(os.homedir(), '.d2d-data');
  fs.mkdirSync(path.join(dataDir, 'config'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'findings'), { recursive: true });
  log(`✓ Data dir: ${dataDir}`);

  log('\nd2d init complete.');
}

function cmdHelp() {
  log(`@wufufu770/d2d-cli ${VERSION}

Usage: d2d <command> [args]

Commands:
  version              show version
  list                 list installed d2d sub-packages
  doctor               check environment (node/python3/kuzu/pnpm/host-key)
  install [args...]    install all d2d sub-packages (alias: pnpm install)
  update               update all d2d sub-packages
  init                 initialize d2d (config dir + host-key + data dir)
  agents               list 12 agent specs
  skills               list available skills
  hooks                list 7 hook events
  help                 show this help
`);
}

function cmdAgents() {
  // 12 agent specs (v0.2.0 MVP)
  const agents = [
    ['recon-orchestrator', 'ring1', 'process', '32K', '侦察调度器'],
    ['enterprise-collector', 'ring1', 'process', '32K', '企业情报收集'],
    ['module-worker', 'ring1', 'process', '16K', '通用执行 worker'],
    ['model-worker', 'all', 'in-process', '16K', '模型推理 worker'],
    ['modeling-agent', 'ring1', 'in-process', '8K', '假设生成'],
    ['exploration-loop', 'ring2', 'process', '16K', '探索循环'],
    ['attack-loop', 'ring2', 'process', '16K', '攻击循环'],
    ['deep-dive-hunter', 'ring3', 'process', '16K', '高危专攻'],
    ['vuln-impact-judge', 'ring3', 'in-process', '8K', '影响研判'],
    ['vuln-report-writer', 'ring3', 'in-process', '8K', '单条报告'],
    ['corp-report-writer', 'ring0', 'in-process', '16K', '企业报告'],
    ['supervisor-loop', 'ring0', 'in-process', '4K', 'Ring Supervisor'],
  ];
  log('12 Agent Specs (v0.2.0 MVP):');
  for (const [id, ring, mode, tokens, label] of agents) {
    log(`  ${id.padEnd(22)} ring=${ring.padEnd(5)} mode=${mode.padEnd(12)} tokens=${tokens.padEnd(5)} ${label}`);
  }
}

function cmdSkills() {
  const skills = ['pentest', 'sqli-detector', 'ssrf-hunter', 'xss-detect', 'auth-bypass-finder'];
  log('5 Starter Skills:');
  for (const s of skills) {
    log(`  ${s}`);
  }
  log('\n(v0.3.0: 12+ skills, OSINT independent skills)');
}

function cmdHooks() {
  const hooks = [
    ['PreToolUse', 'sync', 'closed', 'worker 调 tool 前（scope + 破坏性命令拦截）'],
    ['PostToolUse', 'async', 'open', 'worker 调 tool 后（审计）'],
    ['FindingWrite', 'async', 'open', 'finding 入 graphd（通知 + verify 派发）'],
    ['SessionStart', 'sync', 'closed', 'engagement 创建（scope 校验）'],
    ['WorkerSpawn', 'sync', 'closed', 'v0.2.0-rc: token 桥 + env 注入'],
    ['FindingStateTransition', 'sync', 'closed', 'v0.2.0-rc: 状态机迁移'],
    ['EngagementLifecycle', 'sync', 'closed', 'v0.2.0-rc: corp-report 触发'],
  ];
  log('7 Hook Events:');
  for (const [name, sync, fail, desc] of hooks) {
    log(`  ${name.padEnd(26)} sync=${sync.padEnd(5)} fail=${fail.padEnd(6)} ${desc}`);
  }
}

function cmdGraphd(args) {
  // Delegate to d2d-graphd
  const which = spawnSync('which', ['d2d-graphd']);
  if (which.status !== 0) {
    die('d2d-graphd not installed. Run: pnpm install');
  }
  const r = spawnSync('d2d-graphd', args, { stdio: 'inherit' });
  process.exit(r.status || 0);
}

// ===== Main =====
const { cmd, args } = parseArgs(process.argv);

switch (cmd) {
  case 'version':
  case '--version':
  case '-v':
    cmdVersion();
    break;
  case 'list':
  case 'ls':
    cmdList();
    break;
  case 'doctor':
    cmdDoctor();
    break;
  case 'install':
  case 'i':
    cmdInstall(args);
    break;
  case 'update':
  case 'up':
    cmdUpdate();
    break;
  case 'init':
    cmdInit();
    break;
  case 'agents':
    cmdAgents();
    break;
  case 'skills':
    cmdSkills();
    break;
  case 'hooks':
    cmdHooks();
    break;
  case 'graphd':
    cmdGraphd(args);
    break;
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    cmdHelp();
    break;
  default:
    err(`unknown command: ${cmd}`);
    cmdHelp();
    process.exit(1);
}
