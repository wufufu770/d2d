// @wufufu770/d2d-core test - OSINT aggregator (#54)
// Run with: node --experimental-strip-types --test test/osint/aggregate.test.ts

import { test } from 'node:test';
import assert from 'node:assert';
import { aggregate, summarize } from '../../src/osint/aggregate.ts';
import type { OsintResult } from '../../src/osint/types.ts';

// ===== Mock helpers =====
function mockRouter(results: OsintResult[]) {
  return {
    async queryAll(_q: string, _opts?: any): Promise<OsintResult[]> {
      return results;
    },
  };
}

function mockGraphd(opts: { failWrite?: boolean } = {}) {
  const writes: Array<{ cypher: string; params: any }> = [];
  const fetcher = async (url: string, init?: any) => {
    if (url.endsWith('/query') && init?.method === 'POST') {
      const body = JSON.parse(init.body);
      writes.push({ cypher: body.cypher, params: body.params });
      if (opts.failWrite) {
        return { status: 500, ok: false, json: async () => ({ ok: false, error: 'simulated failure' }) } as Response;
      }
      return { status: 200, ok: true, json: async () => ({ ok: true, rows: [{ v: body.params.value }] }) } as Response;
    }
    return { status: 404, ok: false, json: async () => ({}) } as Response;
  };
  return { fetcher: fetcher as typeof fetch, writes };
}

// ===== summarize() =====
test('summarize: dedupes items across providers', () => {
  const results: OsintResult[] = [
    { ok: true, source: 'fofa', items: [{ type: 'ip', value: '1.1.1.1' }, { type: 'domain', value: 'a.com' }], durationMs: 10 },
    { ok: true, source: 'hunter', items: [{ type: 'ip', value: '1.1.1.1' }, { type: 'email', value: 'a@a.com' }], durationMs: 5 },
    { ok: true, source: 'quake', items: [{ type: 'domain', value: 'a.com' }], durationMs: 7 },
  ];
  const s = summarize('test.com', results);
  assert.equal(s.dedupeStats.rawItems, 5);
  assert.equal(s.dedupeStats.uniqueItems, 3);
  assert.equal(s.dedupeStats.duplicatesDropped, 2);
});

test('summarize: handles failed providers gracefully', () => {
  const results: OsintResult[] = [
    { ok: false, source: 'fofa', items: [], error: 'timeout', durationMs: 0 },
    { ok: true, source: 'hunter', items: [{ type: 'ip', value: '2.2.2.2' }], durationMs: 10 },
  ];
  const s = summarize('x', results);
  assert.equal(s.dedupeStats.uniqueItems, 1);
  assert.equal(s.providers.length, 2);
  assert.equal(s.providers[0].ok, false);
});

// ===== aggregate() — happy path =====
test('aggregate: 3 providers with overlapping items → dedupe + graphd write', async () => {
  const router = mockRouter([
    { ok: true, source: 'fofa', items: [
      { type: 'ip', value: '1.1.1.1' },
      { type: 'domain', value: 'example.com' },
    ], durationMs: 10 },
    { ok: true, source: 'hunter', items: [
      { type: 'ip', value: '1.1.1.1' },     // dup
      { type: 'email', value: 'a@example.com' },
    ], durationMs: 5 },
    { ok: true, source: 'quake', items: [
      { type: 'domain', value: 'example.com' }, // dup
      { type: 'subdomain', value: 'api.example.com' },
    ], durationMs: 7 },
  ]);
  const credMap: Record<string, string> = { fofa: 'k1', hunter: 'k2', quake: 'k3' };
  const { fetcher, writes } = mockGraphd();
  const resolveCredential = async (id: string) => credMap[id] ?? null;

  const r = await aggregate('example.com', { router, resolveCredential }, {
    fetcher, graphdUrl: 'http://test', hostToken: 'tok', engagement: 'eng1',
  });

  // Dedupe: 6 raw → 4 unique
  assert.equal(r.dedupeStats.rawItems, 6);
  assert.equal(r.dedupeStats.uniqueItems, 4);
  assert.equal(r.dedupeStats.duplicatesDropped, 2);
  // Writes
  assert.equal(r.writes.engagement, 'eng1');
  assert.equal(r.writes.endpointsAttempted, 4);
  assert.equal(r.writes.endpointsWritten, 4);
  assert.equal(r.writes.errors.length, 0);
  assert.equal(writes.length, 4);
  // Each write should be a MERGE for an Endpoint
  for (const w of writes) {
    assert.match(w.cypher, /MERGE \(ep:Endpoint \{value: \$value\}\)/);
    assert.match(w.cypher, /HAS_ENDPOINT/);
  }
  // Provider stats
  assert.equal(r.providers.length, 6); // all 6 attempted
  const okProviders = r.providers.filter((p) => p.ok);
  assert.equal(okProviders.length, 3);
});

// ===== aggregate() — credential missing =====
test('aggregate: missing credential for a provider → skipped (not failed)', async () => {
  const router = mockRouter([
    { ok: true, source: 'fofa', items: [{ type: 'ip', value: '1.1.1.1' }], durationMs: 10 },
    { ok: false, source: 'hunter', items: [], error: 'auth failed', durationMs: 5 },
  ]);
  const credMap: Record<string, string> = { fofa: 'k1' }; // hunter missing
  const { fetcher, writes } = mockGraphd();
  const resolveCredential = async (id: string) => credMap[id] ?? null;

  const r = await aggregate('test', { router, resolveCredential }, {
    fetcher, graphdUrl: 'http://test', hostToken: 'tok',
    enabledProviders: ['fofa', 'hunter'],
  });

  // Both attempted
  assert.equal(r.providers.length, 2);
  // Only fofa wrote
  assert.equal(r.writes.endpointsWritten, 1);
  assert.equal(writes.length, 1);
});

// ===== aggregate() — graphd unreachable =====
test('aggregate: graphd 5xx → writes.errors captured, summary still returned', async () => {
  const router = mockRouter([
    { ok: true, source: 'fofa', items: [{ type: 'ip', value: '1.1.1.1' }], durationMs: 10 },
  ]);
  const { fetcher } = mockGraphd({ failWrite: true });
  const resolveCredential = async (id: string) => `cred-${id}`;

  const r = await aggregate('test', { router, resolveCredential }, {
    fetcher, graphdUrl: 'http://test', hostToken: 'tok',
    enabledProviders: ['fofa'],
  });

  assert.equal(r.providers[0].ok, true);
  assert.equal(r.writes.endpointsWritten, 0);
  assert.equal(r.writes.errors.length, 1);
  assert.match(r.writes.errors[0].error, /simulated failure|HTTP 500/);
});

// ===== aggregate() — graphd connection refused =====
test('aggregate: graphd connection refused → timeout/error in writes', async () => {
  const router = mockRouter([
    { ok: true, source: 'fofa', items: [{ type: 'ip', value: '1.1.1.1' }], durationMs: 10 },
  ]);
  const fetcher: typeof fetch = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  const resolveCredential = async () => 'cred';

  const r = await aggregate('test', { router, resolveCredential }, {
    fetcher, graphdUrl: 'http://test', hostToken: 'tok',
    enabledProviders: ['fofa'],
  });

  assert.equal(r.writes.endpointsWritten, 0);
  assert.ok(r.writes.errors.length > 0, 'should have at least one write error');
});

// ===== aggregate() — only enabled providers run =====
test('aggregate: enabledProviders filter restricts to subset', async () => {
  const router = mockRouter([]);
  const { fetcher } = mockGraphd();
  const resolveCredential = async () => 'k';

  const r = await aggregate('test', { router, resolveCredential }, {
    fetcher, graphdUrl: 'http://test', hostToken: 'tok',
    enabledProviders: ['fofa', 'hunter'],
  });

  assert.equal(r.providers.length, 2);
  assert.ok(r.providers.every((p) => ['fofa', 'hunter'].includes(p.source)));
});

// ===== aggregate() — env-var credential fallback =====
test('aggregate: env var fallback when store missing', async () => {
  const router = mockRouter([
    { ok: true, source: 'fofa', items: [{ type: 'ip', value: '1.1.1.1' }], durationMs: 10 },
  ]);
  const { fetcher } = mockGraphd();
  process.env.FOFA_TOKEN = 'env-fallback';
  try {
    const r = await aggregate('test', { router /* no resolveCredential */ }, {
      fetcher, graphdUrl: 'http://test', hostToken: 'tok',
      enabledProviders: ['fofa'],
    });
    assert.equal(r.providers[0].ok, true);
    assert.equal(r.providers[0].skipped, undefined);
  } finally {
    delete process.env.FOFA_TOKEN;
  }
});

// ===== aggregate() — first-source-wins provenance =====
test('aggregate: dedupe preserves first-source provenance in write params', async () => {
  const router = mockRouter([
    { ok: true, source: 'fofa', items: [{ type: 'ip', value: '1.1.1.1' }], durationMs: 10 },
    { ok: true, source: 'hunter', items: [{ type: 'ip', value: '1.1.1.1' }], durationMs: 5 },
  ]);
  const { fetcher, writes } = mockGraphd();
  const resolveCredential = async (id: string) => `cred-${id}`;

  await aggregate('test', { router, resolveCredential }, {
    fetcher, graphdUrl: 'http://test', hostToken: 'tok',
    enabledProviders: ['fofa', 'hunter'],
  });

  assert.equal(writes.length, 1, 'only 1 unique item → 1 write');
  assert.equal(writes[0].params.source, 'fofa', 'first provider wins');
});

// ===== aggregate() — empty items =====
test('aggregate: zero items → zero writes, no errors', async () => {
  const router = mockRouter([
    { ok: true, source: 'fofa', items: [], durationMs: 10 },
    { ok: true, source: 'hunter', items: [], durationMs: 5 },
  ]);
  const { fetcher, writes } = mockGraphd();
  const resolveCredential = async () => 'k';

  const r = await aggregate('test', { router, resolveCredential }, {
    fetcher, graphdUrl: 'http://test', hostToken: 'tok',
  });

  assert.equal(r.writes.endpointsWritten, 0);
  assert.equal(writes.length, 0);
  assert.equal(r.dedupeStats.uniqueItems, 0);
});

// ===== aggregate() — provider throw =====
test('aggregate: provider throws → captured as error, others proceed', async () => {
  const router = {
    async queryAll(): Promise<OsintResult[]> {
      throw new Error('router explosion');
    },
  };
  const { fetcher } = mockGraphd();
  const resolveCredential = async () => 'k';

  const r = await aggregate('test', { router, resolveCredential }, {
    fetcher, graphdUrl: 'http://test', hostToken: 'tok',
    enabledProviders: ['fofa'],
  });

  // Provider was attempted; failure captured
  assert.equal(r.providers.length, 1);
  assert.equal(r.providers[0].ok, false);
  assert.match(r.providers[0].error ?? '', /router explosion/);
});

// ===== aggregate() — all 6 providers run by default =====
test('aggregate: defaults to all 6 providers', async () => {
  const router = mockRouter([]);
  const { fetcher } = mockGraphd();
  const resolveCredential = async () => null;  // all skipped

  const r = await aggregate('test', { router, resolveCredential }, {
    fetcher, graphdUrl: 'http://test', hostToken: 'tok',
  });

  assert.equal(r.providers.length, 6);
  assert.ok(r.providers.every((p) => p.skipped === true));
});

// ===== aggregate() — engagement name in writes =====
test('aggregate: writes include engagement name + endpoint value/type', async () => {
  const router = mockRouter([
    { ok: true, source: 'fofa', items: [{ type: 'subdomain', value: 'api.x.com' }], durationMs: 10 },
  ]);
  const { fetcher, writes } = mockGraphd();
  const resolveCredential = async () => 'k';

  await aggregate('test', { router, resolveCredential }, {
    fetcher, graphdUrl: 'http://test', hostToken: 'tok',
    enabledProviders: ['fofa'], engagement: 'my-engagement',
  });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].params.engagement, 'my-engagement');
  assert.equal(writes[0].params.value, 'api.x.com');
  assert.equal(writes[0].params.type, 'subdomain');
  assert.equal(writes[0].params.source, 'fofa');
});