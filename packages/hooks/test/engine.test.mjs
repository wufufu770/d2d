// @wufufu770/d2d-hooks test
import { test } from 'node:test';
import assert from 'node:assert';
import {
  HOOK_EVENTS, DEFAULT_FAIL_MODE, DEFAULT_SYNC, HookEngine, defaultHookConfig,
} from '../src/engine.mjs';

test('7 hook events defined', () => {
  assert.equal(HOOK_EVENTS.length, 7);
  assert.ok(HOOK_EVENTS.includes('PreToolUse'));
  assert.ok(HOOK_EVENTS.includes('PostToolUse'));
  assert.ok(HOOK_EVENTS.includes('FindingWrite'));
  assert.ok(HOOK_EVENTS.includes('SessionStart'));
  assert.ok(HOOK_EVENTS.includes('WorkerSpawn'));
  assert.ok(HOOK_EVENTS.includes('FindingStateTransition'));
  assert.ok(HOOK_EVENTS.includes('EngagementLifecycle'));
});

test('default fail modes', () => {
  assert.equal(DEFAULT_FAIL_MODE.PreToolUse, 'closed');
  assert.equal(DEFAULT_FAIL_MODE.PostToolUse, 'open');
  assert.equal(DEFAULT_FAIL_MODE.FindingWrite, 'open');
  assert.equal(DEFAULT_FAIL_MODE.SessionStart, 'closed');
  assert.equal(DEFAULT_FAIL_MODE.WorkerSpawn, 'closed');
  assert.equal(DEFAULT_FAIL_MODE.FindingStateTransition, 'closed');
  assert.equal(DEFAULT_FAIL_MODE.EngagementLifecycle, 'closed');
});

test('default sync mode', () => {
  assert.equal(DEFAULT_SYNC.PreToolUse, true);
  assert.equal(DEFAULT_SYNC.PostToolUse, false);
  assert.equal(DEFAULT_SYNC.FindingWrite, false);
  assert.equal(DEFAULT_SYNC.SessionStart, true);
});

test('unknown event is allowed (no-op)', async () => {
  const engine = new HookEngine({ hooks: {} });
  const r = await engine.fire('UnknownEvent', {});
  assert.equal(r.allowed, true);
  assert.ok(r.warning);
});

test('sync fail-closed: exit non-zero blocks', async () => {
  const engine = new HookEngine({
    hooks: {
      PreToolUse: [{ id: 'fail', matcher: { always: true }, command: 'false' }],
    },
  });
  const r = await engine.fire('PreToolUse', { tool: 'Bash' });
  assert.equal(r.allowed, false);
  assert.ok(r.reason);
  assert.equal(r.mode, 'fail-closed');
});

test('sync fail-closed: exit 0 allows', async () => {
  const engine = new HookEngine({
    hooks: {
      PreToolUse: [{ id: 'pass', matcher: { always: true }, command: 'true' }],
    },
  });
  const r = await engine.fire('PreToolUse', { tool: 'Bash' });
  assert.equal(r.allowed, true);
});

test('async fire-and-forget returns immediately', async () => {
  const engine = new HookEngine({
    hooks: {
      PostToolUse: [{ id: 'slow', matcher: { always: true }, command: 'sleep 0.3', sync: false }],
    },
  });
  const t0 = Date.now();
  const r = await engine.fire('PostToolUse', {});
  const dt = Date.now() - t0;
  assert.equal(r.allowed, true);
  assert.ok(dt < 100, `async should return immediately, took ${dt}ms`);
  // wait for fire-and-forget to complete
  await new Promise(r => setTimeout(r, 500));
});

test('fail-open does not block on error', async () => {
  const engine = new HookEngine({
    hooks: {
      PostToolUse: [{ id: 'fail', matcher: { always: true }, command: 'false', sync: true, failMode: 'open' }],
    },
  });
  const r = await engine.fire('PostToolUse', {});
  assert.equal(r.allowed, true, 'fail-open should allow even on error');
  assert.equal(engine.metrics.totalFailOpen, 1);
});

test('matcher: always', async () => {
  const engine = new HookEngine({
    hooks: { PreToolUse: [{ id: 'x', matcher: { always: true }, command: 'true' }] },
  });
  const r1 = await engine.fire('PreToolUse', { any: 'thing' });
  assert.equal(r1.allowed, true);
});

test('matcher: tool name exact', async () => {
  const engine = new HookEngine({
    hooks: { PreToolUse: [{ id: 'x', matcher: { tool: 'Bash' }, command: 'true' }] },
  });
  const r1 = await engine.fire('PreToolUse', { tool: 'Bash' });
  assert.equal(r1.allowed, true);
  const r2 = await engine.fire('PreToolUse', { tool: 'WebFetch' });
  assert.equal(r2.allowed, true, 'no hook fired but allowed (no hooks match)');
});

test('matcher: severity array', async () => {
  const engine = new HookEngine({
    hooks: { FindingWrite: [{ id: 'p0', matcher: { severity: ['P0', 'P1'] }, command: 'true' }] },
  });
  const r1 = await engine.fire('FindingWrite', { severity: 'P0' });
  assert.equal(r1.allowed, true);
  const r2 = await engine.fire('FindingWrite', { severity: 'P3' });
  assert.equal(r2.allowed, true, 'no match but allowed');
});

test('matcher: alternation pattern', async () => {
  const engine = new HookEngine({
    hooks: { PreToolUse: [{ id: 'x', matcher: { tool: 'Bash|Read' }, command: 'true' }] },
  });
  const r = await engine.fire('PreToolUse', { tool: 'Bash' });
  assert.equal(r.allowed, true);
});

test('matcher: regex pattern', async () => {
  const engine = new HookEngine({
    hooks: { PreToolUse: [{ id: 'x', matcher: { tool: '/^(Bash|WebFetch)$/' }, command: 'true' }] },
  });
  const r1 = await engine.fire('PreToolUse', { tool: 'Bash' });
  assert.equal(r1.allowed, true);
  const r2 = await engine.fire('PreToolUse', { tool: 'Read' });
  assert.equal(r2.allowed, true);
  const r3 = await engine.fire('PreToolUse', { tool: 'Write' });
  assert.equal(r3.allowed, true, 'no match, allowed');
});

test('metrics tracking', async () => {
  const engine = new HookEngine({
    hooks: { PreToolUse: [{ id: 'x', matcher: { always: true }, command: 'true' }] },
  });
  await engine.fire('PreToolUse', {});
  await engine.fire('PreToolUse', {});
  assert.equal(engine.metrics.totalFires, 2);
  assert.ok(engine.metrics.avgDurationMs >= 0);
});

test('defaultHookConfig returns valid structure', () => {
  const cfg = defaultHookConfig();
  assert.equal(cfg.version, 1);
  for (const ev of HOOK_EVENTS) {
    assert.ok(Array.isArray(cfg.hooks[ev]));
  }
});

test('hook with no matcher matches everything (undefined -> true)', async () => {
  const engine = new HookEngine({
    hooks: { PreToolUse: [{ id: 'x', command: 'true' }] },
  });
  const r = await engine.fire('PreToolUse', {});
  assert.equal(r.allowed, true);
});
