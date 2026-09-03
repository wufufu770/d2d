// @wufufu770/d2d-cli — OAST / interactsh client (Issue #58)
//
// Out-of-band Application Security Testing: detect blind vulnerabilities
// (blind XSS, blind SSRF, blind SQLi OOB, blind RCE OOB, etc.) by registering
// a callback hostname and observing inbound requests to it.
//
// Protocol: WebSocket-based interactsh protocol (https://github.com/projectdiscovery/interactsh).
// Compatible with the public oast.pro / oast.live / interact.sh servers and
// self-hosted interactsh servers (no client-side deps).
//
// 0 new npm deps — uses Node 22+ built-in fetch + WebSocket.

const DEFAULT_SERVER = 'oast.pro';
const DEFAULT_WS_PATH = '/interactsh/v1/sessions';
const DEFAULT_POLL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 30_000;

// ===== Types =====
export type OastProtocol = 'http' | 'dns' | 'smtp' | 'smtps' | 'tcp' | 'tls' | 'ldap';

export interface OastCallback {
  id: string;
  protocol: OastProtocol;
  timestamp: string;
  source: string;
  url?: string;
  request?: string;
  response?: string;
  raw?: unknown;
}

export interface OastSession {
  id: string;
  token: string;        // unique correlation token
  hostname: string;     // full e.g. abc123xyz.oast.pro
  server: string;
  startedAt: string;
}

export interface OastClientOpts {
  server?: string;      // default 'oast.pro'
  wssUrl?: string;      // default wss://<server>
  fetcher?: typeof fetch;
  pollMs?: number;
  timeoutMs?: number;
}

export interface PulseResult {
  triggered: boolean;
  callback?: OastCallback;
  hostname: string;
  durationMs: number;
}

// ===== Client =====
export class OastClient {
  private server: string;
  private wssUrl: string;
  private fetcher: typeof fetch;
  private pollMs: number;
  private timeoutMs: number;
  private sessions: Map<string, WebSocket> = new Map();

  constructor(opts: OastClientOpts = {}) {
    this.server = opts.server ?? DEFAULT_SERVER;
    this.wssUrl = opts.wssUrl ?? `wss://${this.server}`;
    this.fetcher = opts.fetcher ?? fetch;
    this.pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Register a new session via WebSocket. The server returns a unique
   * correlation token + hostname. All WebSocket events from this point are
   * scoped to this session.
   *
   * The native Node WebSocket is used; no extra dependency.
   */
  async createSession(opts: { token?: string } = {}): Promise<OastSession> {
    const ws = new WebSocket(`${this.wssUrl}${DEFAULT_WS_PATH}`);
    const id = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        try { ws.close(); } catch { /* ignore */ }
        reject(new Error(`oast session registration timeout after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      ws.addEventListener('open', () => {
        const payload = opts.token
          ? JSON.stringify({ NewRegistrationRequest: { token: opts.token } })
          : JSON.stringify({ NewRegistrationRequest: {} });
        ws.send(payload);
      });
      ws.addEventListener('message', (ev) => {
        try {
          const data = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
          if (data.NewRegistrationResponse) {
            clearTimeout(timer);
            resolve(String(data.NewRegistrationResponse.SessionID ?? ''));
          }
        } catch (e) {
          clearTimeout(timer);
          reject(e);
        }
      });
      ws.addEventListener('error', (e) => {
        clearTimeout(timer);
        reject(new Error(`WebSocket error: ${(e as ErrorEvent).message ?? 'unknown'}`));
      });
    });

    const session: OastSession = {
      id,
      token: opts.token ?? id,
      hostname: `${id}.${this.server}`,
      server: this.server,
      startedAt: new Date().toISOString(),
    };
    this.sessions.set(id, ws);
    return session;
  }

  /**
   * Poll for callbacks received since a given timestamp (or session start).
   * Returns the parsed callback events.
   */
  async poll(session: OastSession, opts: { since?: string; timeoutMs?: number } = {}): Promise<OastCallback[]> {
    const ws = this.sessions.get(session.id);
    if (!ws) throw new Error(`session ${session.id} not found in registry`);
    const since = opts.since ?? session.startedAt;
    const tEnd = Date.now() + (opts.timeoutMs ?? this.timeoutMs);
    const callbacks: OastCallback[] = [];

    return await new Promise<OastCallback[]>((resolve) => {
      const cleanup = () => {
        ws.removeEventListener('message', handler);
        clearTimeout(timer);
      };
      const handler = (ev: MessageEvent) => {
        try {
          const data = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
          if (data.Interaction) {
            const i = data.Interaction;
            if (i.UniqueID && (!i.Timestamp || i.Timestamp >= since)) {
              callbacks.push(parseCallback(i));
            }
          }
        } catch {
          // ignore malformed messages
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve(callbacks);
      }, Math.min(this.pollMs, tEnd - Date.now()));

      ws.addEventListener('message', handler);

      // Send a poll request to nudge the server
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ PollRequest: {} }));
        }
      } catch {
        // socket may not be ready — callback handler will pick up later messages
      }
    });
  }

  /**
   * Close the WebSocket and remove the session.
   */
  async closeSession(session: OastSession): Promise<void> {
    const ws = this.sessions.get(session.id);
    if (!ws) return;
    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    } catch { /* ignore */ }
    this.sessions.delete(session.id);
  }

  /**
   * Generate a unique OOB hostname for a session. Use this when you need to
   * plant a token in the target (e.g., as a URL parameter that gets fetched
   * by the target app).
   */
  generateHostname(session: OastSession, suffix: string = ''): string {
    const token = Math.random().toString(36).slice(2, 12).toLowerCase();
    const safeSuffix = suffix.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 32);
    return `${session.id}-${token}${safeSuffix ? '-' + safeSuffix : ''}.${session.server}`.toLowerCase();
  }

  /**
   * pulseTest: send a HEAD request to a generated OOB hostname and verify
   * the callback arrives. Useful for:
   *   • sanity-checking the OOB channel ("is oast.pro reachable from this host?")
   *   • verifying a hostname is resolvable before planting it in the target
   *
   * Returns `{triggered, callback?, hostname, durationMs}`.
   */
  async pulseTest(session: OastSession, opts: { timeoutMs?: number } = {}): Promise<PulseResult> {
    const t0 = Date.now();
    const hostname = this.generateHostname(session, 'pulse');
    const url = `http://${hostname}/pulse-${Date.now()}`;
    let triggered = false;
    try {
      // Don't fail on network errors — that's expected if DNS doesn't resolve
      await this.fetcher(url, { method: 'HEAD' }).catch(() => null);
    } catch { /* expected */ }

    const since = new Date().toISOString();
    const callback = await this.waitForHostname(session, hostname, opts);
    if (callback) triggered = true;
    return { triggered, callback, hostname, durationMs: Date.now() - t0 };
  }

  /**
   * Wait for a callback matching a specific hostname. Returns the first match
   * or null if timeout expires.
   */
  async waitForHostname(
    session: OastSession,
    hostname: string,
    opts: { timeoutMs?: number } = {},
  ): Promise<OastCallback | null> {
    const deadline = Date.now() + (opts.timeoutMs ?? this.timeoutMs);
    while (Date.now() < deadline) {
      const callbacks = await this.poll(session, { timeoutMs: Math.min(this.pollMs, deadline - Date.now()) });
      for (const cb of callbacks) {
        if ((cb.url && cb.url.includes(hostname)) || cb.source.includes(hostname)) {
          return cb;
        }
      }
    }
    return null;
  }
}

// ===== Helpers =====
function parseCallback(raw: any): OastCallback {
  const proto = String(raw.Protocol ?? '').toLowerCase();
  return {
    id: String(raw.UniqueID ?? ''),
    protocol: normalizeProtocol(proto),
    timestamp: String(raw.Timestamp ?? new Date().toISOString()),
    source: String(raw.RemoteAddress ?? raw.Source ?? ''),
    url: raw.FullURL ? String(raw.FullURL) : undefined,
    request: raw.RawRequest ? String(raw.RawRequest) : undefined,
    response: raw.RawResponse ? String(raw.RawResponse) : undefined,
    raw,
  };
}

function normalizeProtocol(p: string): OastProtocol {
  const allowed: OastProtocol[] = ['http', 'dns', 'smtp', 'smtps', 'tcp', 'tls', 'ldap'];
  return (allowed.includes(p as OastProtocol) ? p : 'tcp') as OastProtocol;
}

// Re-export for tests
export { DEFAULT_SERVER, DEFAULT_POLL_MS, DEFAULT_TIMEOUT_MS };