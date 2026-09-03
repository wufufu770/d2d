// @wufufu770/d2d-cli test - OAST / interactsh client (Issue #58)
// Run with: node --experimental-strip-types --test test/scanner/oast/interactsh_client.test.mjs

import { test } from 'node:test';
import assert from 'node:assert';

const { OastClient, DEFAULT_SERVER } = await import('../../../src/scanner/oast/interactsh_client.ts');

// ===== Mock WebSocket =====
function mockWebSocket(opts: { failOpen?: boolean; sessionId?: string } = {}) {
  const listeners: Record<string, Array<(...args: any[]) => void>> = {};
  const sent: string[] = [];
  let readyState = 0; // CONNECTING
  const ws: any = {
    addEventListener(ev: string, cb: any) {
      (listeners[ev] ??= []).push(cb);
    },
    removeEventListener(ev: string, cb: any) {
      const arr = listeners[ev];
      if (!arr) return;
      const i = arr.indexOf(cb);
      if (i >= 0) arr.splice(i, 1);
    },
    send(data: string) { sent.push(data); },
    close() { readyState = 3; (listeners.close ?? []).forEach((cb) => cb()); },
    triggerOpen() {
      readyState = 1;
      (listeners.open ?? []).forEach((cb) => cb());
    },
    triggerMessage(data: any) {
      const str = typeof data === 'string' ? data : JSON.stringify(data);
      (listeners.message ?? []).forEach((cb) => ({ data: str }));
      // Properly invoke listeners with MessageEvent shape
      for (const cb of listeners.message ?? []) {
        cb({ data: str });
      }
    },
    get sent() { return sent; },
    get readyState() { return readyState; },
    set readyState(v: number) { readyState = v; },
  };

  // Schedule auto-open after a tick (microtask) to mimic real WebSocket
  Promise.resolve().then(() => {
    if (opts.failOpen) {
      (listeners.error ?? []).forEach((cb) => cb({ message: 'connect refused' }));
    } else {
      ws.triggerOpen();
      // Auto-reply with NewRegistrationResponse
      const sessionId = opts.sessionId ?? 'test-session-abc123';
      ws.triggerMessage({ NewRegistrationResponse: { SessionID: sessionId } });
    }
  });

  return ws;
}

// ===== Helper to inject the WebSocket constructor =====
async function withMockWs(mockWsInstance: any, fn: () => Promise<void>) {
  const RealWS = (globalThis as any).WebSocket;
  class FakeWS {
    addEventListener = mockWsInstance.addEventListener;
    removeEventListener = mockWsInstance.removeEventListener;
    send = mockWsInstance.send;
    close = mockWsInstance.close;
    get readyState() { return mockWsInstance.readyState; }
    set readyState(v) { mockWsInstance.readyState = v; }
  }
  (globalThis as any).WebSocket = FakeWS;
  try { await fn(); }
  finally { (globalThis as any).WebSocket = RealWS; }
}

// ===== createSession() =====
test('createSession: returns session with id + token + hostname', async () => {
  const mock = mockWebSocket();
  await withMockWs(mock, async () => {
    const client = new OastClient({ server: 'oast.pro' });
    const session = await client.createSession();
    assert.equal(session.id, 'test-session-abc123');
    assert.equal(session.token, session.id);
    assert.match(session.hostname, /^test-session-abc123\.oast\.pro$/);
    assert.match(session.startedAt, /^\d{4}-\d{2}-\d{2}T/);
  });
});

test('createSession: custom token preserved', async () => {
  const mock = mockWebSocket();
  await withMockWs(mock, async () => {
    const client = new OastClient();
    const session = await client.createSession({ token: 'my-token' });
    assert.equal(session.token, 'my-token');
  });
});

test('createSession: throws on connection error', async () => {
  const mock = mockWebSocket({ failOpen: true });
  await withMockWs(mock, async () => {
    const client = new OastClient({ timeoutMs: 100 });
    await assert.rejects(async () => client.createSession(), /WebSocket error/);
  });
});

test('createSession: timeout when server never responds', async () => {
  // Mock WS that opens but never sends a registration response
  const listeners: Record<string, Array<any>> = {};
  const fakeWs: any = {
    addEventListener(ev: string, cb: any) { (listeners[ev] ??= []).push(cb); },
    removeEventListener() {},
    send() {},
    close() {},
    get readyState() { return 1; },
    set readyState(v) {},
  };
  Promise.resolve().then(() => (listeners.open ?? []).forEach((cb) => cb()));
  await withMockWs(fakeWs, async () => {
    const client = new OastClient({ timeoutMs: 50 });
    await assert.rejects(async () => client.createSession(), /timeout/);
  });
});

// ===== generateHostname() =====
test('generateHostname: produces unique subdomains', () => {
  const client = new OastClient();
  const session = { id: 'sess', token: 'tok', hostname: 'sess.oast.pro', server: 'oast.pro', startedAt: '' };
  const h1 = client.generateHostname(session);
  const h2 = client.generateHostname(session);
  assert.notEqual(h1, h2, 'each call should produce a unique token');
  assert.match(h1, /^sess-[a-z0-9]{10}\.oast\.pro$/);
});

test('generateHostname: suffix is sanitized', () => {
  const client = new OastClient();
  const session = { id: 'sess', token: 'tok', hostname: 'sess.oast.pro', server: 'oast.pro', startedAt: '' };
  const h = client.generateHostname(session, '!@#$% XSS<>');
  assert.match(h, /^[a-z0-9-]+\.oast\.pro$/);
  // Only safe chars in the suffix
  assert.ok(!h.includes('@'));
  assert.ok(!h.includes('$'));
  assert.ok(!h.includes('<'));
});

test('generateHostname: empty suffix works', () => {
  const client = new OastClient();
  const session = { id: 'sess', token: 'tok', hostname: 'sess.oast.pro', server: 'oast.pro', startedAt: '' };
  const h = client.generateHostname(session);
  assert.ok(!h.includes('--'), 'no double dash with empty suffix');
});

// ===== poll() =====
test('poll: returns parsed callbacks', async () => {
  const mock = mockWebSocket();
  await withMockWs(mock, async () => {
    const client = new OastClient();
    const session = await client.createSession();
    // Simulate a callback after a short delay
    setTimeout(() => {
      mock.triggerMessage({
        Interaction: {
          UniqueID: 'cb-1',
          Protocol: 'http',
          Timestamp: new Date().toISOString(),
          RemoteAddress: '1.2.3.4',
          FullURL: 'http://sess-test.oast.pro/x?cb=1',
          RawRequest: 'GET /x HTTP/1.1',
          RawResponse: 'HTTP/1.1 200 OK',
        },
      });
    }, 10);
    const cbs = await client.poll(session, { timeoutMs: 1000 });
    assert.equal(cbs.length, 1);
    assert.equal(cbs[0].id, 'cb-1');
    assert.equal(cbs[0].protocol, 'http');
    assert.equal(cbs[0].source, '1.2.3.4');
    assert.match(cbs[0].url ?? '', /sess-test\.oast\.pro/);
  });
});

test('poll: returns empty when no callbacks', async () => {
  const mock = mockWebSocket();
  await withMockWs(mock, async () => {
    const client = new OastClient();
    const session = await client.createSession();
    const cbs = await client.poll(session, { timeoutMs: 50 });
    assert.deepEqual(cbs, []);
  });
});

test('poll: filters out callbacks before since timestamp', async () => {
  const mock = mockWebSocket();
  await withMockWs(mock, async () => {
    const client = new OastClient();
    const session = await client.createSession();
    setTimeout(() => {
      mock.triggerMessage({
        Interaction: {
          UniqueID: 'cb-old',
          Protocol: 'http',
          Timestamp: '2020-01-01T00:00:00Z',
          RemoteAddress: '1.1.1.1',
        },
      });
    }, 10);
    const cbs = await client.poll(session, { timeoutMs: 100, since: '2025-01-01T00:00:00Z' });
    assert.equal(cbs.length, 0, 'old timestamp filtered out');
  });
});

test('poll: unknown protocol falls back to tcp', async () => {
  const mock = mockWebSocket();
  await withMockWs(mock, async () => {
    const client = new OastClient();
    const session = await client.createSession();
    setTimeout(() => {
      mock.triggerMessage({
        Interaction: {
          UniqueID: 'cb-x',
          Protocol: 'futuristic-protocol',
          Timestamp: new Date().toISOString(),
          RemoteAddress: '5.5.5.5',
        },
      });
    }, 10);
    const cbs = await client.poll(session, { timeoutMs: 200 });
    assert.equal(cbs.length, 1);
    assert.equal(cbs[0].protocol, 'tcp');
  });
});

// ===== closeSession() =====
test('closeSession: removes session from registry', async () => {
  const mock = mockWebSocket();
  await withMockWs(mock, async () => {
    const client = new OastClient();
    const session = await client.createSession();
    await client.closeSession(session);
    await assert.rejects(async () => client.poll(session), /not found in registry/);
  });
});

test('closeSession: no-op for unknown session', async () => {
  const client = new OastClient();
  await client.closeSession({ id: 'never-existed', token: '', hostname: '', server: '', startedAt: '' });
  // Should not throw
});

// ===== pulseTest() =====
test('pulseTest: returns hostname even if no callback (best-effort)', async () => {
  const mock = mockWebSocket();
  const fakeFetch = async () => {
    throw new TypeError('ENOTFOUND');
  };
  await withMockWs(mock, async () => {
    const client = new OastClient({ fetcher: fakeFetch as any, timeoutMs: 50 });
    const session = await client.createSession();
    const r = await client.pulseTest(session, { timeoutMs: 50 });
    assert.equal(r.triggered, false);
    assert.match(r.hostname, /\.oast\.pro$/);
    assert.ok(r.durationMs >= 0);
  });
});

test('pulseTest: triggered=true when callback matches hostname', async () => {
  const mock = mockWebSocket();
  let generatedHost = '';
  // Inject a fetcher that fails fast (simulating real OOB where HEAD is unreachable).
  const fakeFetch = async () => { throw new TypeError('DNS not found'); };
  await withMockWs(mock, async () => {
    const client = new OastClient({ fetcher: fakeFetch as any, timeoutMs: 200 });
    const session = await client.createSession();
    // Spy: capture generated hostname by intercepting pulseTest's flow
    const origGen = client.generateHostname.bind(client);
    client.generateHostname = (sess: any, suffix?: string) => {
      generatedHost = origGen(sess, suffix);
      return generatedHost;
    };
    // Schedule a matching callback shortly after
    setTimeout(() => {
      mock.triggerMessage({
        Interaction: {
          UniqueID: 'pulse-cb',
          Protocol: 'http',
          Timestamp: new Date().toISOString(),
          RemoteAddress: '9.9.9.9',
          FullURL: `http://${generatedHost}/pulse`,
        },
      });
    }, 30);
    const r = await client.pulseTest(session, { timeoutMs: 200 });
    assert.equal(r.triggered, true);
    assert.ok(r.callback);
    assert.match(r.hostname, /\.oast\.pro$/);
  });
});

// ===== waitForHostname() =====
test('waitForHostname: returns null on timeout', async () => {
  const mock = mockWebSocket();
  await withMockWs(mock, async () => {
    const client = new OastClient({ timeoutMs: 50 });
    const session = await client.createSession();
    const r = await client.waitForHostname(session, 'never-arrives.example.com', { timeoutMs: 50 });
    assert.equal(r, null);
  });
});

test('waitForHostname: returns first matching callback', async () => {
  const mock = mockWebSocket();
  await withMockWs(mock, async () => {
    const client = new OastClient({ timeoutMs: 200 });
    const session = await client.createSession();
    const target = 'specific-token.oast.pro';
    setTimeout(() => {
      mock.triggerMessage({
        Interaction: {
          UniqueID: 'specific',
          Protocol: 'http',
          Timestamp: new Date().toISOString(),
          RemoteAddress: '7.7.7.7',
          FullURL: `http://${target}/api?id=1`,
        },
      });
    }, 30);
    const r = await client.waitForHostname(session, target, { timeoutMs: 200 });
    assert.ok(r);
    assert.equal(r.id, 'specific');
    assert.match(r.url ?? '', /specific-token\.oast\.pro/);
  });
});

// ===== Defaults =====
test('default server is oast.pro', () => {
  const client = new OastClient();
  assert.equal((client as any).server, DEFAULT_SERVER);
});

