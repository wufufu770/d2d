// @wufufu770/d2d-core test - fsm
import { test } from 'node:test';
import assert from 'node:assert';
import {
  FINDING_STATES, canTransition, transitionFinding, createFinding,
  isTerminal, progressPercent,
} from '../src/fsm.mjs';

test('7 finding states defined', () => {
  assert.equal(FINDING_STATES.length, 7);
  assert.deepEqual(FINDING_STATES, [
    'candidate', 'triaged', 'verified', 'isolated', 'reported', 'accepted', 'rejected'
  ]);
});

test('valid forward transitions', () => {
  assert.ok(canTransition('candidate', 'triaged'));
  assert.ok(canTransition('triaged', 'verified'));
  assert.ok(canTransition('verified', 'isolated'));
  assert.ok(canTransition('isolated', 'reported'));
  assert.ok(canTransition('reported', 'accepted'));
});

test('rejection path from any state', () => {
  assert.ok(canTransition('candidate', 'rejected'));
  assert.ok(canTransition('triaged', 'rejected'));
  assert.ok(canTransition('verified', 'rejected'));
  assert.ok(canTransition('isolated', 'rejected'));
  assert.ok(canTransition('reported', 'rejected'));
});

test('back transitions allowed', () => {
  assert.ok(canTransition('triaged', 'candidate'), 'triaged back to candidate');
  assert.ok(canTransition('verified', 'triaged'), 'verified back to triaged');
  assert.ok(canTransition('isolated', 'verified'), 'isolated back to verified');
  assert.ok(canTransition('reported', 'verified'), 'reported back to verified');
  assert.ok(canTransition('accepted', 'reported'), 'accepted back to reported');
  assert.ok(canTransition('rejected', 'candidate'), 'rejected back to candidate');
});

test('self-transition rejected', () => {
  for (const s of FINDING_STATES) {
    assert.equal(canTransition(s, s), false, `self-transition ${s} → ${s} should be rejected`);
  }
});

test('invalid forward transition (skipping)', () => {
  assert.equal(canTransition('candidate', 'verified'), false, 'cannot skip triaged');
  assert.equal(canTransition('candidate', 'isolated'), false, 'cannot skip multiple');
  assert.equal(canTransition('triaged', 'isolated'), false, 'cannot skip verified');
  assert.equal(canTransition('verified', 'reported'), false, 'cannot skip isolated');
});

test('invalid from terminal state', () => {
  // accepted can only go to reported (reopen)
  assert.equal(canTransition('accepted', 'triaged'), false);
  assert.equal(canTransition('accepted', 'verified'), false);
  assert.equal(canTransition('accepted', 'rejected'), false);
});

test('unknown state returns false', () => {
  assert.equal(canTransition('foo', 'triaged'), false);
  assert.equal(canTransition('candidate', 'bar'), false);
});

test('transitionFinding returns updated finding', () => {
  const f = createFinding({ id: 'F-1', title: 'test' });
  const updated = transitionFinding(f, 'triaged', 'tester', 'looks valid');
  assert.equal(updated.status, 'triaged');
  assert.equal(updated.transition_actor, 'tester');
  assert.equal(updated.transition_reason, 'looks valid');
  assert.equal(updated.history.length, 1);
  assert.equal(updated.history[0].from, 'candidate');
  assert.equal(updated.history[0].to, 'triaged');
});

test('transitionFinding throws on invalid transition', () => {
  const f = createFinding({ id: 'F-1' });
  assert.throws(() => transitionFinding(f, 'isolated', 'tester'),
                /invalid transition/);
});

test('createFinding defaults to candidate state', () => {
  const f = createFinding({ id: 'F-1' });
  assert.equal(f.status, 'candidate');
  assert.equal(f.id, 'F-1');
  assert.equal(f.transition_actor, 'system');
  assert.equal(f.history.length, 0);
});

test('isTerminal returns true for accepted/rejected', () => {
  assert.ok(isTerminal('accepted'));
  assert.ok(isTerminal('rejected'));
  assert.equal(isTerminal('candidate'), false);
  assert.equal(isTerminal('verified'), false);
});

test('progressPercent returns 0-100', () => {
  for (const s of FINDING_STATES) {
    const p = progressPercent(s);
    assert.ok(p >= 0 && p <= 100, `progress for ${s} = ${p}`);
  }
  assert.equal(progressPercent('accepted'), 100);
  assert.equal(progressPercent('rejected'), 100);
  assert.equal(progressPercent('candidate'), 14);
});
