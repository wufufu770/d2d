// @wufufu770/d2d-core test - OSINT providers
// Each provider gets ≥3 tests: success / fail-no-credential / rate-limit.
// Run with: node --experimental-strip-types --test test/osint/providers.test.ts

import { test } from 'node:test';
import assert from 'node:assert';
import {
  FofaProvider,
  HunterProvider,
  QuakeProvider,
  RiskBirdProvider,
  ZoomEyeProvider,
  ZeroZoneProvider,
} from '../../src/osint/router.ts';

// ===== Helper: build a mock fetch with canned responses =====
function mockFetch(responses: Array<{ match: (url: string, init?: RequestInit) => boolean; status: number; body?: unknown }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    for (const r of responses) {
      if (r.match(url, init)) {
        return {
          status: r.status,
          ok: r.status >= 200 && r.status < 300,
          json: async () => r.body ?? {},
        } as Response;
      }
    }
    return { status: 500, ok: false, json: async () => ({ error: 'unmocked' }) } as Response;
  };
  return { fn: fn as typeof fetch, calls };
}

// ===== FOFA =====
test('FOFA: success returns parsed items', async () => {
  const { fn } = mockFetch([{
    match: (u) => u.includes('fofa.info'),
    status: 200,
    body: {
      errcode: 0,
      results: [
        ['example.com', '1.2.3.4', '443', 'https', 'example.com', 'Test Site'],
        ['test.com', '5.6.7.8', '80', 'http', 'sub.test.com', 'Sub'],
      ],
    },
  }]);
  const r = await new FofaProvider().query('example.com', { credential: 'user@x.com:abc', fetcher: fn });
  assert.equal(r.ok, true);
  assert.equal(r.source, 'fofa');
  assert.ok(r.items.length > 0, 'should have items');
  const domains = r.items.filter((i) => i.type === 'domain').map((i) => i.value);
  assert.ok(domains.includes('example.com'));
  const ips = r.items.filter((i) => i.type === 'ip').map((i) => i.value);
  assert.ok(ips.includes('1.2.3.4'));
});

test('FOFA: missing credential returns fail()', async () => {
  const r = await new FofaProvider().query('example.com');
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /missing credential/);
  assert.equal(r.items.length, 0);
});

test('FOFA: HTTP 429 surfaces rateLimited flag', async () => {
  const { fn } = mockFetch([{ match: () => true, status: 429, body: {} }]);
  const r = await new FofaProvider().query('x', { credential: 'a:b', fetcher: fn });
  assert.equal(r.ok, false);
  assert.equal(r.rateLimited, true);
});

// ===== Hunter =====
test('Hunter: success returns emails + domain', async () => {
  const { fn } = mockFetch([{
    match: (u) => u.includes('hunter.io'),
    status: 200,
    body: { data: { domain: 'example.com', emails: [{ value: 'a@x.com' }, { value: 'b@x.com' }] } },
  }]);
  const r = await new HunterProvider().query('example.com', { credential: 'hk-xxx', fetcher: fn });
  assert.equal(r.ok, true);
  assert.equal(r.items.filter((i) => i.type === 'email').length, 2);
  assert.equal(r.items.find((i) => i.type === 'domain')?.value, 'example.com');
});

test('Hunter: missing credential', async () => {
  const r = await new HunterProvider().query('example.com');
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /missing credential/);
});

test('Hunter: HTTP 402 quota hit', async () => {
  const { fn } = mockFetch([{ match: () => true, status: 402, body: { errors: [{ details: 'no credits' }] } }]);
  const r = await new HunterProvider().query('x', { credential: 'k', fetcher: fn });
  assert.equal(r.ok, false);
  assert.equal(r.quotaHit, true);
});

// ===== Quake =====
test('Quake: success parses JSONL data array', async () => {
  const jsonl = JSON.stringify({ ip: '1.1.1.1', port: 80, service: { name: 'http' } });
  const { fn } = mockFetch([{
    match: (u) => u.includes('quake.360.net'),
    status: 200,
    body: { code: 0, data: [jsonl, jsonl] },
  }]);
  const r = await new QuakeProvider().query('port:80', { credential: 'qt-xxx', fetcher: fn });
  assert.equal(r.ok, true);
  assert.equal(r.source, 'quake');
  assert.equal(r.items.filter((i) => i.type === 'ip').length, 2);
});

test('Quake: missing credential', async () => {
  const r = await new QuakeProvider().query('port:80');
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /missing credential/);
});

test('Quake: HTTP 429 rate-limited', async () => {
  const { fn } = mockFetch([{ match: () => true, status: 429, body: {} }]);
  const r = await new QuakeProvider().query('x', { credential: 'k', fetcher: fn });
  assert.equal(r.ok, false);
  assert.equal(r.rateLimited, true);
});

// ===== RiskBird =====
test('RiskBird: success returns mixed item types', async () => {
  const { fn } = mockFetch([{
    match: (u) => u.includes('riskbird.com'),
    status: 200,
    body: {
      code: 0,
      data: [
        { ip: '9.9.9.9', domain: 'foo.com', subdomain: 'a.foo.com', url: 'https://a.foo.com', cert: 'sha256-x', asn: 12345 },
      ],
    },
  }]);
  const r = await new RiskBirdProvider().query('foo.com', { credential: 'rb-xxx', fetcher: fn });
  assert.equal(r.ok, true);
  const types = new Set(r.items.map((i) => i.type));
  assert.ok(types.has('ip'));
  assert.ok(types.has('domain'));
  assert.ok(types.has('subdomain'));
  assert.ok(types.has('url'));
  assert.ok(types.has('cert'));
  assert.ok(types.has('asn'));
});

test('RiskBird: missing credential', async () => {
  const r = await new RiskBirdProvider().query('foo.com');
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /missing credential/);
});

test('RiskBird: HTTP 500 generic fail', async () => {
  const { fn } = mockFetch([{ match: () => true, status: 500, body: { error: 'oops' } }]);
  const r = await new RiskBirdProvider().query('x', { credential: 'k', fetcher: fn });
  assert.equal(r.ok, false);
  assert.equal(r.rateLimited, false);
});

// ===== ZoomEye =====
test('ZoomEye: success parses matches array', async () => {
  const { fn } = mockFetch([{
    match: (u) => u.includes('zoomeye.org'),
    status: 200,
    body: {
      code: 0,
      total: 1,
      matches: [{
        ip: '2.2.2.2', portinfo: { port: 8080, service: 'http' },
        domain: 'bar.com', subdomain: 'x.bar.com', url: 'https://x.bar.com', cert: 'cert-x',
      }],
    },
  }]);
  const r = await new ZoomEyeProvider().query('app:nginx', { credential: 'jwt-xxx', fetcher: fn });
  assert.equal(r.ok, true);
  const types = new Set(r.items.map((i) => i.type));
  assert.ok(types.has('ip'));
  assert.ok(types.has('domain'));
});

test('ZoomEye: missing credential', async () => {
  const r = await new ZoomEyeProvider().query('app:nginx');
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /missing credential/);
});

test('ZoomEye: HTTP 429 rate-limited', async () => {
  const { fn } = mockFetch([{ match: () => true, status: 429, body: {} }]);
  const r = await new ZoomEyeProvider().query('x', { credential: 'k', fetcher: fn });
  assert.equal(r.ok, false);
  assert.equal(r.rateLimited, true);
});

// ===== 0.zone =====
test('0.zone: success parses data.list', async () => {
  const { fn } = mockFetch([{
    match: (u) => u.includes('0.zone'),
    status: 200,
    body: {
      status: 0,
      data: {
        total: 2,
        list: [
          { ip: '3.3.3.3', domain: 'baz.com', url: 'https://baz.com', title: 'Baz', port: 443, server: 'nginx' },
          { ip: '4.4.4.4', domain: 'baz2.com', url: 'https://baz2.com', title: 'Baz2', port: 80 },
        ],
      },
    },
  }]);
  const r = await new ZeroZoneProvider().query('host=baz.com', { credential: 'tok-xxx', fetcher: fn });
  assert.equal(r.ok, true);
  assert.equal(r.items.filter((i) => i.type === 'ip').length, 2);
  assert.ok(r.items.find((i) => i.meta?.title === 'Baz'));
});

test('0.zone: missing credential', async () => {
  const r = await new ZeroZoneProvider().query('host=x.com');
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /missing credential/);
});

test('0.zone: HTTP 403 auth failed (no rateLimit flag)', async () => {
  const { fn } = mockFetch([{ match: () => true, status: 403, body: {} }]);
  const r = await new ZeroZoneProvider().query('x', { credential: 'k', fetcher: fn });
  assert.equal(r.ok, false);
  assert.equal(r.rateLimited, false);
  assert.match(r.error ?? '', /auth failed|HTTP 403/);
});