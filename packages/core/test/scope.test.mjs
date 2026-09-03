// @wufufu770/d2d-core test - scope
import { test } from 'node:test';
import assert from 'node:assert';
import { parseScope, isInScope, isOutOfScope, mergeScopes, isGlobalDeny } from '../src/scope.mjs';

test('parseScope splits include and exclude', () => {
  const s = parseScope('ztgame.com,!mail.ztgame.com,!222.73.243.');
  assert.deepEqual(s.include, ['ztgame.com']);
  assert.deepEqual(s.exclude, ['mail.ztgame.com', '222.73.243.']);
  assert.equal(s.raw, 'ztgame.com,!mail.ztgame.com,!222.73.243.');
});

test('parseScope handles empty string', () => {
  const s = parseScope('');
  assert.deepEqual(s.include, []);
  assert.deepEqual(s.exclude, []);
});

test('parseScope handles only excludes', () => {
  const s = parseScope('!a.com,!b.com');
  assert.deepEqual(s.include, []);
  assert.deepEqual(s.exclude, ['a.com', 'b.com']);
});

test('parseScope trims whitespace', () => {
  const s = parseScope(' a.com , !b.com ');
  assert.deepEqual(s.include, ['a.com']);
  assert.deepEqual(s.exclude, ['b.com']);
});

test('isInScope: exact domain match', () => {
  const s = parseScope('ztgame.com');
  assert.ok(isInScope('ztgame.com', s));
  assert.equal(isInScope('example.com', s), false);
});

test('isInScope: subdomain match', () => {
  const s = parseScope('ztgame.com');
  assert.ok(isInScope('www.ztgame.com', s));
  assert.ok(isInScope('api.ztgame.com', s));
  assert.equal(isInScope('notztgame.com', s), false);
});

test('isInScope: prefix match (e.g. 10.0.)', () => {
  const s = parseScope('10.0.');
  assert.ok(isInScope('10.0.0.1', s));
  assert.equal(isInScope('10.1.0.1', s), false);
});

test('isOutOfScope: exclude precedence', () => {
  const s = parseScope('ztgame.com,!mail.ztgame.com');
  assert.equal(isInScope('mail.ztgame.com', s), false);
  assert.equal(isOutOfScope('mail.ztgame.com', s), true);
  assert.equal(isInScope('www.ztgame.com', s), true);
});

test('isInScope: not in any include pattern', () => {
  const s = parseScope('ztgame.com,!mail.ztgame.com');
  assert.equal(isInScope('other.com', s), false);
});

test('mergeScopes unions include and exclude', () => {
  const merged = mergeScopes('a.com,b.com', 'c.com', '!b.com,!d.com');
  assert.deepEqual(merged.include.sort(), ['a.com', 'b.com', 'c.com']);
  assert.deepEqual(merged.exclude.sort(), ['b.com', 'd.com']);
});

test('isGlobalDeny: private IPs', () => {
  assert.ok(isGlobalDeny('10.0.0.1'));
  assert.ok(isGlobalDeny('192.168.1.1'));
  assert.ok(isGlobalDeny('172.16.0.1'));
  assert.ok(isGlobalDeny('127.0.0.1'));
  assert.ok(isGlobalDeny('169.254.169.254'));
  assert.ok(isGlobalDeny('localhost'));
});

test('isGlobalDeny: public IPs not denied', () => {
  assert.equal(isGlobalDeny('8.8.8.8'), false);
  assert.equal(isGlobalDeny('1.1.1.1'), false);
  assert.equal(isGlobalDeny('203.0.113.1'), false);
});
