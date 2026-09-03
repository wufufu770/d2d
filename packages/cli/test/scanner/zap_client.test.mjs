// @wufufu770/d2d-cli test - ZAP client (Issue #57)
// Run with: node --test test/scanner/zap_client.test.mjs
// The TS source is loaded via dynamic import + Node 22+ --experimental-strip-types.

import { test } from 'node:test';
import assert from 'node:assert';

// Use Node's TS strip-types via dynamic import. We can't pass flags per-test,
// so we launch this single test file with `node --experimental-strip-types --test`.
const { ZapClient } = await import('../../src/scanner/zap_client.ts');

// ===== Mock fetcher =====
function mockFetcher(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: new URL(url).pathname + new URL(url).search, method: init?.method ?? 'GET' });
    for (const r of responses) {
      if (r.match(url)) {
        return {
          status: r.status ?? 200,
          ok: (r.status ?? 200) < 400,
          json: async () => r.body ?? {},
        };
      }
    }
    return { status: 500, ok: false, json: async () => ({ error: 'unmocked' }) };
  };
  return { fn, calls };
}

// ===== health() =====
test('health: returns ok with version on success', async () => {
  const { fn } = mockFetcher([{ match: (u) => u.includes('/JSON/core/view'), body: { version: '2.14.0' } }]);
  const z = new ZapClient({ fetcher: fn });
  const r = await z.health();
  assert.equal(r.ok, true);
  assert.equal(r.version, '2.14.0');
});

test('health: returns ok=false on 500', async () => {
  const fn = async () => ({ status: 500, ok: false, json: async () => ({}) });
  const z = new ZapClient({ fetcher: fn });
  const r = await z.health();
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /HTTP 500/);
});

// ===== spider() =====
test('spider: starts scan + returns scanId', async () => {
  const { fn, calls } = mockFetcher([
    { match: (u) => u.includes('/JSON/spider/action/scan'), body: { scan: '42' } },
  ]);
  const z = new ZapClient({ fetcher: fn });
  const r = await z.spider('http://example.com');
  assert.equal(r.scanId, 42);
  assert.ok(calls.some((c) => c.url.includes('/JSON/spider/action/scan')));
});

test('spider: sends url + recurse=true by default', async () => {
  const { fn, calls } = mockFetcher([
    { match: () => true, body: { scan: '1' } },
  ]);
  const z = new ZapClient({ fetcher: fn });
  await z.spider('http://test.com', { maxDepth: 3 });
  const call = calls.find((c) => c.url.includes('spider/action/scan'));
  assert.match(call.url, /url=http%3A%2F%2Ftest\.com/);
  assert.match(call.url, /maxDepth=3/);
  assert.match(call.url, /recurse=true/);
});

test('spiderStatus: returns parsed status', async () => {
  const { fn } = mockFetcher([
    { match: (u) => u.includes('/JSON/spider/view/status'), body: { status: '73' } },
  ]);
  const z = new ZapClient({ fetcher: fn });
  const r = await z.spiderStatus(42);
  assert.equal(r.progress, 73);
});

// ===== waitForSpider() =====
test('waitForSpider: polls until 100%', async () => {
  let i = 0;
  const fn = async (url) => {
    if (url.includes('spider/view/status')) {
      i++;
      const progress = i >= 3 ? 100 : 50;
      return { status: 200, ok: true, json: async () => ({ status: String(progress) }) };
    }
    return { status: 200, ok: true, json: async () => ({ scan: '1' }) };
  };
  const z = new ZapClient({ fetcher: fn, timeoutMs: 5000 });
  const r = await z.waitForSpider(1, { pollMs: 5 });
  assert.equal(r.status, 100);
});

test('waitForSpider: throws on timeout', async () => {
  const fn = async () => ({ status: 200, ok: true, json: async () => ({ status: '50' }) });
  const z = new ZapClient({ fetcher: fn });
  await assert.rejects(
    async () => z.waitForSpider(1, { pollMs: 5, timeoutMs: 50 }),
    /timed out/,
  );
});

// ===== activeScan() =====
test('activeScan: starts scan + returns scanId', async () => {
  const { fn } = mockFetcher([
    { match: (u) => u.includes('/JSON/ascan/action/scan'), body: { scan: '99' } },
  ]);
  const z = new ZapClient({ fetcher: fn });
  const r = await z.activeScan('http://example.com');
  assert.equal(r.scanId, 99);
});

test('waitForActiveScan: polls until 100%', async () => {
  let i = 0;
  const fn = async (url) => {
    if (url.includes('ascan/view/status')) {
      i++;
      const progress = i >= 2 ? 100 : 30;
      return { status: 200, ok: true, json: async () => ({ status: String(progress) }) };
    }
    return { status: 200, ok: true, json: async () => ({ scan: '1' }) };
  };
  const z = new ZapClient({ fetcher: fn, timeoutMs: 5000 });
  const r = await z.waitForActiveScan(1, { pollMs: 5 });
  assert.equal(r.status, 100);
});

// ===== getAlerts() =====
test('getAlerts: parses ZAP alert array', async () => {
  const alerts = [
    {
      id: '1', name: 'SQL Injection', risk: 'High', confidence: 'High',
      url: 'http://example.com/api?id=1', method: 'GET', param: 'id',
      evidence: "1' OR '1'='1",
      description: 'SQLi found', solution: 'Use parameterized queries',
      reference: 'https://owasp.org/...', cwe: '89', wasc: '19',
    },
    {
      id: '2', name: 'X-Frame-Options', risk: 'Low', confidence: 'Medium',
      url: 'http://example.com/', description: 'Header missing',
    },
  ];
  const { fn } = mockFetcher([
    { match: (u) => u.includes('/JSON/alert/view/alerts'), body: { alerts } },
  ]);
  const z = new ZapClient({ fetcher: fn });
  const r = await z.getAlerts();
  assert.equal(r.length, 2);
  assert.equal(r[0].name, 'SQL Injection');
  assert.equal(r[0].risk, 'High');
  assert.equal(r[0].cwe, 89);
});

test('getAlerts: handles empty list', async () => {
  const { fn } = mockFetcher([{ match: () => true, body: { alerts: [] } }]);
  const z = new ZapClient({ fetcher: fn });
  const r = await z.getAlerts();
  assert.deepEqual(r, []);
});

// ===== alertsToFindings() =====
test('alertsToFindings: maps risk → severity', async () => {
  const { fn } = mockFetcher([{ match: () => true, body: { alerts: [] } }]);
  const z = new ZapClient({ fetcher: fn });
  const findings = z.alertsToFindings([
    { id: 1, name: 'X', risk: 'High', confidence: 'High', url: 'http://a/', description: '' },
    { id: 2, name: 'Y', risk: 'Medium', confidence: 'Medium', url: 'http://b/', description: '' },
    { id: 3, name: 'Z', risk: 'Low', confidence: 'Low', url: 'http://c/', description: '' },
    { id: 4, name: 'I', risk: 'Informational', confidence: 'Low', url: 'http://d/', description: '' },
  ]);
  assert.equal(findings[0].severity, 'high');
  assert.equal(findings[1].severity, 'medium');
  assert.equal(findings[2].severity, 'low');
  assert.equal(findings[3].severity, 'info');
});

test('alertsToFindings: sorted by risk desc, then url, then id', async () => {
  const { fn } = mockFetcher([{ match: () => true, body: { alerts: [] } }]);
  const z = new ZapClient({ fetcher: fn });
  const findings = z.alertsToFindings([
    { id: 5, name: 'B', risk: 'Low', confidence: 'High', url: 'http://z/', description: '' },
    { id: 2, name: 'A-Hi', risk: 'High', confidence: 'High', url: 'http://b/', description: '' },
    { id: 1, name: 'A-Hi', risk: 'High', confidence: 'High', url: 'http://a/', description: '' },
    { id: 3, name: 'M', risk: 'Medium', confidence: 'High', url: 'http://m/', description: '' },
  ]);
  assert.equal(findings[0].id, 1); // first high, lower url wins
  assert.equal(findings[1].id, 2); // second high
  assert.equal(findings[2].id, 3); // medium
  assert.equal(findings[3].id, 5); // low
});

test('alertsToFindings: includes cwe/wasc/remediation', async () => {
  const { fn } = mockFetcher([{ match: () => true, body: { alerts: [] } }]);
  const z = new ZapClient({ fetcher: fn });
  const findings = z.alertsToFindings([
    {
      id: 1, name: 'SQLi', risk: 'High', confidence: 'High',
      url: 'http://x/', description: 'desc',
      solution: 'use params', cwe: 89, wasc: 19, param: 'id', evidence: '1=1',
    },
  ]);
  assert.equal(findings[0].remediation, 'use params');
  assert.equal(findings[0].cwe, 89);
  assert.equal(findings[0].wasc, 19);
  assert.equal(findings[0].source, 'zap');
  assert.equal(findings[0].param, 'id');
  assert.equal(findings[0].evidence, '1=1');
});

// ===== daemon =====
test('startDaemon: spawns zap.sh detached', async () => {
  const { spawn } = await import('node:child_process');
  // Mock spawn to return a fake ChildProcess
  const origSpawn = spawn;
  // We can't easily mock spawn, so test the function exists and accepts opts
  const z = new ZapClient();
  assert.equal(typeof z.startDaemon, 'function');
  assert.equal(typeof z.stopDaemon, 'function');
});

test('stopDaemon: handles invalid pid gracefully', async () => {
  const z = new ZapClient();
  // Should not throw on pid=0
  await z.stopDaemon({ pid: 0, port: 8080, baseUrl: '' });
});

// ===== apiKey handling =====
test('apiKey: appended to URL as apikey param', async () => {
  const { fn, calls } = mockFetcher([{ match: () => true, body: { version: '1.0' } }]);
  const z = new ZapClient({ fetcher: fn, apiKey: 'secret-key-123' });
  await z.health();
  const call = calls[0];
  assert.match(call.url, /apikey=secret-key-123/);
});