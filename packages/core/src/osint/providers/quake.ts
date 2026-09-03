// Quake (quake.360.cn) — HTTP provider
// API: https://quake.360.net/api/v3/search/quake_service?query=<query>&start=0&size=<n>
// Header: X-QuakeToken: <key>
import { HttpProvider } from '../base.ts';
import type { OsintItem } from '../types.ts';

interface QuakeResponse {
  code?: number;
  message?: string;
  data?: string[]; // array of newline-separated JSONL
}

interface QuakeItem {
  ip?: string;
  port?: number;
  service?: { name?: string; http?: { host?: string } };
  location?: { country?: string };
}

export class QuakeProvider extends HttpProvider {
  id = 'quake';
  name = 'Quake (360)';
  requiredCredential = 'apikey (X-QuakeToken)';

  protected buildUrl(c: string, q: string, limit: number): string {
    const params = new URLSearchParams({
      query: q,
      start: '0',
      size: String(Math.min(Math.max(limit, 1), 100)),
    });
    return `https://quake.360.net/api/v3/search/quake_service?${params.toString()}`;
  }

  async query(q: string, opts: Parameters<HttpProvider['query']>[1] = {}): ReturnType<HttpProvider['query']> {
    // Override to add X-QuakeToken header
    const credCheck = requireCredFor(this.id, opts, this.requiredCredential);
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
        headers: { 'X-QuakeToken': credCheck.credential },
      });
      if (!res.ok) {
        return fail2(this.id, `HTTP ${res.status}`, { rateLimited: res.status === 429, quotaHit: res.status === 402, durationMs: Date.now() - t0 });
      }
      const json = await res.json() as QuakeResponse;
      if (json.code !== 0) {
        return fail2(this.id, `quake error: ${json.message ?? 'unknown'}`, { durationMs: Date.now() - t0 });
      }
      const items: OsintItem[] = [];
      for (const line of json.data ?? []) {
        try {
          const j = JSON.parse(line) as QuakeItem;
          if (j.ip) items.push({ type: 'ip', value: j.ip, meta: { source: 'quake', port: j.port, service: j.service?.name } });
        } catch { /* skip malformed line */ }
      }
      return { ok: true, source: this.id, items, durationMs: Date.now() - t0, raw: json };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail2(this.id, msg, { durationMs: Date.now() - t0 });
    } finally {
      clearTimeout(timer);
    }
  }

  protected parse(_json: unknown): OsintItem[] { return []; } // unused (overridden)
}

// Local re-exports (avoids circular import with base.ts)
function requireCredFor(source: string, opts: any, required: string): { credential: string } | { ok: boolean; error?: string; rateLimited?: boolean; quotaHit?: boolean; durationMs: number; items: any[]; source: string } {
  const c = opts?.credential;
  if (!c || typeof c !== 'string' || c.trim() === '') {
    return { ok: false, source, error: `missing credential: ${required}`, items: [], rateLimited: false, quotaHit: false, durationMs: 0 };
  }
  return { credential: c.trim() };
}
function fail2(source: string, error: string, opts: { rateLimited?: boolean; quotaHit?: boolean; durationMs?: number } = {}): { ok: boolean; source: string; error: string; rateLimited: boolean; quotaHit: boolean; durationMs: number; items: any[] } {
  return { ok: false, source, error, rateLimited: opts.rateLimited ?? false, quotaHit: opts.quotaHit ?? false, durationMs: opts.durationMs ?? 0, items: [] };
}