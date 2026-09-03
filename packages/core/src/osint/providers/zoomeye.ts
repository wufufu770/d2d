// ZoomEye (zoomeye.org) — HTTP provider
// API: https://api.zoomeye.org/v2/search?query=<urlencoded>&page=1&pagesize=<n>
// Header: Authorization: JWT <token>
import { HttpProvider } from '../base.ts';
import type { OsintItem } from '../types.ts';

interface ZoomEyeResponse {
  code?: number;
  message?: string;
  total?: number;
  matches?: Array<{
    ip?: string;
    portinfo?: { port?: number; service?: string };
    domain?: string;
    subdomain?: string;
    url?: string;
    cert?: string;
  }>;
}

export class ZoomEyeProvider extends HttpProvider {
  id = 'zoomeye';
  name = 'ZoomEye';
  requiredCredential = 'jwt-token';

  protected buildUrl(c: string, q: string, limit: number): string {
    const params = new URLSearchParams({
      query: q,
      page: '1',
      pagesize: String(Math.min(Math.max(limit, 1), 100)),
    });
    return `https://api.zoomeye.org/v2/search?${params.toString()}`;
  }

  async query(q: string, opts: Parameters<HttpProvider['query']>[1] = {}): ReturnType<HttpProvider['query']> {
    const credCheck = requireCred2(this.id, opts, this.requiredCredential);
    if ('ok' in credCheck) return credCheck;
    const t0 = Date.now();
    const fetcher = opts?.fetcher ?? fetch;
    const timeoutMs = opts?.timeoutMs ?? 15_000;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const url = this.buildUrl(credCheck.credential, q, opts?.limit ?? 100);
      const res = await fetcher(url, {
        signal: ctrl.signal,
        headers: { Authorization: `JWT ${credCheck.credential}` },
      });
      if (!res.ok) {
        return fail3(this.id, `HTTP ${res.status}`, { rateLimited: res.status === 429, quotaHit: res.status === 402, durationMs: Date.now() - t0 });
      }
      const json = await res.json() as ZoomEyeResponse;
      if (json.code !== undefined && json.code !== 0 && json.code !== 600) {
        return fail3(this.id, `zoomeye error: ${json.message ?? 'unknown'}`, { durationMs: Date.now() - t0 });
      }
      const items: OsintItem[] = [];
      for (const m of json.matches ?? []) {
        if (m.ip) items.push({ type: 'ip', value: m.ip, meta: { source: 'zoomeye', port: m.portinfo?.port, service: m.portinfo?.service } });
        if (m.domain) items.push({ type: 'domain', value: m.domain, meta: { source: 'zoomeye' } });
        if (m.subdomain) items.push({ type: 'subdomain', value: m.subdomain, meta: { source: 'zoomeye' } });
        if (m.url) items.push({ type: 'url', value: m.url, meta: { source: 'zoomeye' } });
        if (m.cert) items.push({ type: 'cert', value: m.cert, meta: { source: 'zoomeye' } });
      }
      return { ok: true, source: this.id, items, durationMs: Date.now() - t0, raw: json };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail3(this.id, msg, { durationMs: Date.now() - t0 });
    } finally {
      clearTimeout(timer);
    }
  }

  protected parse(_json: unknown): OsintItem[] { return []; }
}

function requireCred2(source: string, opts: any, required: string): { credential: string } | { ok: boolean; error?: string; items: any[]; source: string } {
  const c = opts?.credential;
  if (!c || typeof c !== 'string' || c.trim() === '') {
    return { ok: false, source, error: `missing credential: ${required}`, items: [] };
  }
  return { credential: c.trim() };
}
function fail3(source: string, error: string, opts: { rateLimited?: boolean; quotaHit?: boolean; durationMs?: number } = {}): { ok: boolean; source: string; error: string; rateLimited: boolean; quotaHit: boolean; durationMs: number; items: any[] } {
  return { ok: false, source, error, rateLimited: opts.rateLimited ?? false, quotaHit: opts.quotaHit ?? false, durationMs: opts.durationMs ?? 0, items: [] };
}