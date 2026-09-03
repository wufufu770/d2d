// @wufufu770/d2d-cli — OWASP ZAP client (Issue #57)
//
// HTTP API client for OWASP ZAP (zaproxy.org). Wraps:
//   • /JSON/core/view/version — health check
//   • /JSON/spider/action/scan + /JSON/spider/view/status
//   • /JSON/ascan/action/scan + /JSON/ascan/view/status
//   • /JSON/alert/view/alerts
//
// Plus optional ZAP daemon orchestration (start/stop via zap.sh).
// 0 new npm deps — uses Node 22+ built-in fetch.
//
// All API calls are JSON-RPC over HTTP. apiKey is sent as ?apikey=<key>.

// ===== Types =====
export interface ZapOpts {
  baseUrl?: string;          // default http://127.0.0.1:8080
  apiKey?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

export type ZapRisk = 'High' | 'Medium' | 'Low' | 'Informational';

export interface ZapAlert {
  id: number;
  name: string;
  risk: ZapRisk;
  confidence: string;
  url: string;
  method?: string;
  param?: string;
  evidence?: string;
  description: string;
  solution?: string;
  reference?: string;
  cwe?: number;
  wasc?: number;
}

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface FindingShape {
  id: number;            // ZAP alert id (preserved for dedupe)
  title: string;
  severity: FindingSeverity;
  url: string;
  method?: string;
  param?: string;
  evidence?: string;
  description: string;
  remediation?: string;
  source: 'zap';
  cwe?: number;
  wasc?: number;
}

export interface SpiderScanResult {
  scanId: number;
}

export interface ActiveScanResult {
  scanId: number;
}

export interface ScanStatus {
  status: number;          // ZAP internal code: 0..100 (progress %), or completion code
  progress: number;        // mirror of status (ZAP returns "status" as percent during a scan)
}

export interface WaitOpts {
  pollMs?: number;
  timeoutMs?: number;
}

export interface DaemonOpts {
  port?: number;           // default 8080
  extraArgs?: string[];
  javaOpts?: string[];
  cwd?: string;
  logPath?: string;
  pidPath?: string;
}

export interface DaemonHandle {
  pid: number;
  port: number;
  baseUrl: string;
  logPath?: string;
  pidPath?: string;
}

// ===== Defaults =====
const DEFAULT_BASE_URL = 'http://127.0.0.1:8080';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_MS = 2000;
const DEFAULT_DAEMON_PORT = 8080;
const SCAN_COMPLETE = 100;

// ===== Client =====
export class ZapClient {
  private baseUrl: string;
  private apiKey: string;
  private fetcher: typeof fetch;
  private timeoutMs: number;

  constructor(opts: ZapOpts = {}) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.apiKey = opts.apiKey ?? '';
    this.fetcher = opts.fetcher ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async call<T = unknown>(
    component: string,
    action: string,
    params: Record<string, string | number | boolean> = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/JSON/${component}/${action}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
    if (this.apiKey) url.searchParams.set('apikey', this.apiKey);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetcher(url.toString(), { signal: ctrl.signal });
      if (!res.ok) {
        throw new Error(`ZAP ${component}/${action} → HTTP ${res.status}`);
      }
      const json = await res.json().catch(() => null) as any;
      if (!json) throw new Error(`ZAP ${component}/${action} → invalid JSON`);
      // ZAP wraps every response under a top-level field; return the entire payload
      // so callers can pick the named key.
      return json as T;
    } finally {
      clearTimeout(timer);
    }
  }

  // === Health ===
  async health(): Promise<{ ok: boolean; version?: string; error?: string }> {
    try {
      const r = await this.call<{ version: string }>('core', 'view/version');
      return { ok: true, version: String(r.version ?? '') };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  // === Spider (passive crawl) ===
  async spider(target: string, opts: { maxDepth?: number; recurse?: boolean } = {}): Promise<SpiderScanResult> {
    const r = await this.call<{ scan: string | number }>('spider', 'action/scan', {
      url: target,
      maxDepth: opts.maxDepth ?? 5,
      recurse: opts.recurse ?? true,
    });
    return { scanId: Number(r.scan) };
  }

  async spiderStatus(scanId: number): Promise<ScanStatus> {
    const r = await this.call<{ status: string }>('spider', 'view/status', { scanId });
    const progress = Number(r.status);
    return { status: progress, progress };
  }

  async waitForSpider(scanId: number, opts: WaitOpts = {}): Promise<{ status: number }> {
    const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
    const timeoutMs = opts.timeoutMs ?? this.timeoutMs;
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const s = await this.spiderStatus(scanId);
      if (s.progress >= SCAN_COMPLETE) return { status: s.progress };
      await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new Error(`spider ${scanId} timed out after ${timeoutMs}ms`);
  }

  // === Active scan (vulnerability probes) ===
  async activeScan(target: string, opts: { recurse?: boolean; inScopeOnly?: boolean } = {}): Promise<ActiveScanResult> {
    const r = await this.call<{ scan: string | number }>('ascan', 'action/scan', {
      url: target,
      recurse: opts.recurse ?? true,
      inScopeOnly: opts.inScopeOnly ?? false,
    });
    return { scanId: Number(r.scan) };
  }

  async activeScanStatus(scanId: number): Promise<ScanStatus> {
    const r = await this.call<{ status: string }>('ascan', 'view/status', { scanId });
    const progress = Number(r.status);
    return { status: progress, progress };
  }

  async waitForActiveScan(scanId: number, opts: WaitOpts = {}): Promise<{ status: number }> {
    const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
    const timeoutMs = opts.timeoutMs ?? this.timeoutMs;
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const s = await this.activeScanStatus(scanId);
      if (s.progress >= SCAN_COMPLETE) return { status: s.progress };
      await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new Error(`active scan ${scanId} timed out after ${timeoutMs}ms`);
  }

  // === Alerts ===
  async getAlerts(baseUrl?: string): Promise<ZapAlert[]> {
    const originalBase = this.baseUrl;
    if (baseUrl) this.baseUrl = baseUrl.replace(/\/$/, '');
    try {
      const r = await this.call<{ alerts: any[] }>('alert', 'view/alerts');
      return (r.alerts ?? []).map((a: any): ZapAlert => ({
        id: Number(a.id ?? 0),
        name: String(a.name ?? ''),
        risk: normalizeRisk(a.risk),
        confidence: String(a.confidence ?? ''),
        url: String(a.url ?? ''),
        method: a.method ? String(a.method) : undefined,
        param: a.param ? String(a.param) : undefined,
        evidence: a.evidence ? String(a.evidence) : undefined,
        description: String(a.description ?? ''),
        solution: a.solution ? String(a.solution) : undefined,
        reference: a.reference ? String(a.reference) : undefined,
        cwe: a.cwe !== undefined ? Number(a.cwe) : undefined,
        wasc: a.wasc !== undefined ? Number(a.wasc) : undefined,
      }));
    } finally {
      this.baseUrl = originalBase;
    }
  }

  // === Conversion: ZAP risk → d2d severity ===
  riskToSeverity(risk: ZapRisk): FindingSeverity {
    switch (risk) {
      case 'High': return 'high';
      case 'Medium': return 'medium';
      case 'Low': return 'low';
      case 'Informational': return 'info';
    }
  }

  /**
   * Convert ZAP alerts to d2d FindingShape (consumed by graphd write layer).
   * Findings are returned in stable order (by risk desc, then url, then id).
   */
  alertsToFindings(alerts: ZapAlert[]): FindingShape[] {
    const order: Record<ZapRisk, number> = { High: 0, Medium: 1, Low: 2, Informational: 3 };
    const sorted = [...alerts].sort((a, b) => {
      const dr = (order[a.risk] ?? 9) - (order[b.risk] ?? 9);
      if (dr !== 0) return dr;
      const du = a.url.localeCompare(b.url);
      if (du !== 0) return du;
      return a.id - b.id;
    });
    return sorted.map((a): FindingShape => ({
      id: a.id,
      title: a.name,
      severity: this.riskToSeverity(a.risk),
      url: a.url,
      method: a.method,
      param: a.param,
      evidence: a.evidence,
      description: a.description,
      remediation: a.solution,
      source: 'zap',
      cwe: a.cwe,
      wasc: a.wasc,
    }));
  }

  // === Daemon orchestration ===
  /**
   * Start ZAP daemon (requires `zap.sh` in PATH or explicit path).
   * Spawns detached; returns PID + port. Caller responsible for stopDaemon().
   */
  async startDaemon(opts: DaemonOpts = {}, zapSh: string = 'zap.sh'): Promise<DaemonHandle> {
    // Lazy import to avoid bringing node:child_process in environments that
    // only use the API client (e.g., CI runs against an already-running ZAP).
    const { spawn } = await import('node:child_process');
    const port = opts.port ?? DEFAULT_DAEMON_PORT;
    const args = [
      '-daemon',
      '-port', String(port),
      '-config', 'api.disablekey=true',
      ...(opts.extraArgs ?? []),
    ];
    const env = {
      ...process.env,
      JAVA_OPTS: opts.javaOpts?.join(' ') ?? process.env.JAVA_OPTS ?? '',
    };
    const logFd = opts.logPath ? (await import('node:fs')).openSync(opts.logPath, 'a') : 'ignore';
    const child = spawn(zapSh, args, {
      cwd: opts.cwd,
      env,
      detached: true,
      stdio: ['ignore', logFd, logFd],
    });
    child.unref();
    if (opts.pidPath) {
      const fs = await import('node:fs');
      fs.writeFileSync(opts.pidPath, String(child.pid ?? 0) + '\n', { mode: 0o600 });
    }
    return {
      pid: child.pid ?? 0,
      port,
      baseUrl: `http://127.0.0.1:${port}`,
      logPath: opts.logPath,
      pidPath: opts.pidPath,
    };
  }

  /**
   * Stop a ZAP daemon by PID. Sends SIGTERM, escalates to SIGKILL after 5s.
   */
  async stopDaemon(handle: DaemonHandle): Promise<void> {
    if (!handle.pid) return;
    const { kill } = await import('node:child_process');
    try {
      kill(handle.pid, 'SIGTERM');
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 500));
        try { kill(handle.pid, 0); } catch { return; } // already dead
      }
      kill(handle.pid, 'SIGKILL');
    } catch {
      // already dead
    }
  }
}

// ===== Helpers =====
function normalizeRisk(raw: unknown): ZapRisk {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'high') return 'High';
  if (s === 'medium') return 'Medium';
  if (s === 'low') return 'Low';
  return 'Informational';
}

// Re-export for tests
export { DEFAULT_BASE_URL, SCAN_COMPLETE };