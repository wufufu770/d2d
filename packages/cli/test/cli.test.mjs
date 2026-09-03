// @wufufu770/d2d-cli test
import { test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(__dirname, '..', 'src', 'index.mjs');

function run(args, opts = {}) {
  return spawnSync('node', [CLI, ...args], { encoding: 'utf8', ...opts });
}

test('version command', () => {
  const r = run(['version']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /d2d-cli 0\.2\.0/);
});

test('help command', () => {
  const r = run(['help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage: d2d/);
  assert.match(r.stdout, /doctor/);
  assert.match(r.rdout || r.stdout, /install/);  // ok if either
  assert.ok(r.stdout.includes('install'));
});

test('agents command lists 12', () => {
  const r = run(['agents']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /recon-orchestrator/);
  assert.match(r.stdout, /supervisor-loop/);
  // 12 agent lines (excluding header)
  const lines = r.stdout.split('\n').filter(l => l.match(/^\s+[a-z]/));
  assert.equal(lines.length, 12);
});

test('skills command lists 5', () => {
  const r = run(['skills']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /pentest/);
  assert.match(r.stdout, /sqli-detector/);
  assert.match(r.stdout, /ssrf-hunter/);
  assert.match(r.stdout, /xss-detect/);
  assert.match(r.stdout, /auth-bypass-finder/);
});

test('hooks command lists 7', () => {
  const r = run(['hooks']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /PreToolUse/);
  assert.match(r.stdout, /PostToolUse/);
  assert.match(r.stdout, /FindingWrite/);
  assert.match(r.stdout, /SessionStart/);
  assert.match(r.stdout, /WorkerSpawn/);
  assert.match(r.stdout, /FindingStateTransition/);
  assert.match(r.stdout, /EngagementLifecycle/);
});

test('unknown command exits 1', () => {
  const r = run(['foo-bar-baz']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /unknown command/);
});
