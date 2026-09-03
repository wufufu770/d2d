// @wufufu770/d2d-core test - OSINT router
// Run with: node --experimental-strip-types --test test/osint/router.test.ts

import { test } from 'node:test';
import assert from 'node:assert';
import { createRouter, dedupeItems, flattenResults, type OsintProvider, type OsintResult } from '../../src/osint/index.ts';

test('createRouter: lists 6 default providers', () => {
  const r = createRouter();
  const ids = r.listProviders();
  assert.equal(ids.length, 6);
  for (const id of ['fofa', 'hunter', 'quake', 'riskbird', 'zoomeye', '0.zone']) {
    assert.ok(ids.includes(id), `missing provider: ${id}`);
  }
});

test('createRouter: register adds custom provider', () => {
  const r = createRouter();
  const custom: OsintProvider = {
    id: 'custom-foo',
    name: 'Custom Foo',
    requiredCredential: 'apikey',
    async query(q, opts): Promise<OsintResult> {
      return { ok: true, source: 'custom-foo', items: [{ type: 'ip', value: q }], durationMs: 1 };
    },
  };
  r.register(custom);
  assert.ok(r.listProviders().includes('custom-foo'));
});

test('createRouter: unregister removes provider', () => {
  const r = createRouter();
  assert.ok(r.unregister('hunter'));
  assert.ok(!r.listProviders().includes('hunter'));
});

test('createRouter: query unknown source returns fail', async () => {
  const r = createRouter();
  const result = await r.query('does-not-exist', 'x');
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /unknown source/);
});

test('createRouter: query routes to provider', async () => {
  const r = createRouter();
  // Mock fetcher for fofa
  const result = await r.query('fofa', 'example.com', {
    credential: 'user@x.com:abc',
    fetcher: async () => ({
      status: 200, ok: true,
      json: async () => ({ errcode: 0, results: [['example.com', '1.2.3.4', '443', 'https']] }),
    } as Response),
  });
  assert.equal(result.ok, true);
  assert.equal(result.source, 'fofa');
  assert.ok(result.items.length > 0);
});

test('createRouter: queryAll fans out to all providers', async () => {
  // Mock fetcher that always succeeds with empty payload
  const fetcher = async (url: string) => {
    if (url.includes('hunter.io')) {
      return { status: 200, ok: true, json: async () => ({ data: { domain: 'x', emails: [] } }) } as Response;
    }
    return { status: 200, ok: true, json: async () => ({}) } as Response;
  };
  const r = createRouter({ fetcher });
  const results = await r.queryAll('test', {
    credential: 'k',
  });
  assert.equal(results.length, 6);
  for (const result of results) {
    assert.ok(['fofa', 'hunter', 'quake', 'riskbird', 'zoomeye', '0.zone'].includes(result.source));
  }
});

test('createRouter: queryAll tolerates per-provider failures', async () => {
  const fetcher = async () => ({ status: 500, ok: false, json: async () => ({}) } as Response);
  const r = createRouter({ fetcher });
  const results = await r.queryAll('test', { credential: 'k' });
  assert.equal(results.length, 6);
  // All should have failed but no exception thrown
  for (const result of results) {
    assert.equal(result.ok, false);
  }
});

test('dedupeItems: collapses duplicates by type+value', () => {
  const items = [
    { type: 'ip' as const, value: '1.1.1.1', meta: { source: 'a' } },
    { type: 'ip' as const, value: '1.1.1.1', meta: { source: 'b' } },
    { type: 'ip' as const, value: '2.2.2.2' },
    { type: 'domain' as const, value: 'foo.com' },
    { type: 'domain' as const, value: 'foo.com' },
  ];
  const deduped = dedupeItems(items);
  assert.equal(deduped.length, 3);
  assert.equal(deduped[0].meta?.source, 'a', 'first occurrence wins');
});

test('flattenResults: combines + dedupes items from queryAll output', () => {
  const r1: OsintResult = { ok: true, source: 'a', items: [{ type: 'ip', value: '1.1.1.1' }], durationMs: 0 };
  const r2: OsintResult = { ok: true, source: 'b', items: [{ type: 'ip', value: '1.1.1.1' }, { type: 'ip', value: '2.2.2.2' }], durationMs: 0 };
  const r3: OsintResult = { ok: false, source: 'c', items: [], durationMs: 0, error: 'fail' };
  const flat = flattenResults([r1, r2, r3]);
  assert.equal(flat.length, 2);
  assert.equal(flat[0].value, '1.1.1.1');
  assert.equal(flat[1].value, '2.2.2.2');
});

test('createRouter: queryAll with empty registry returns []', async () => {
  const r = createRouter();
  // Unregister all
  for (const id of r.listProviders()) r.unregister(id);
  const results = await r.queryAll('test', { credential: 'k' });
  assert.equal(results.length, 0);
});