// 0.zone (0.zone) — HTTP provider
// API: https://0.zone/api/v1/search?q=<query>&token=<token>
import { HttpProvider } from '../base.ts';
import type { OsintItem } from '../types.ts';

interface ZeroZoneResponse {
  status?: number;
  message?: string;
  data?: {
    total?: number;
    list?: Array<{
      ip?: string;
      domain?: string;
      url?: string;
      title?: string;
      port?: number;
      server?: string;
    }>;
  };
}

export class ZeroZoneProvider extends HttpProvider {
  id = '0.zone';
  name = '0.zone';
  requiredCredential = 'token';

  protected buildUrl(c: string, q: string, limit: number): string {
    const params = new URLSearchParams({
      q,
      token: c,
      page: '1',
      page_size: String(Math.min(Math.max(limit, 1), 100)),
    });
    return `https://0.zone/api/v1/search?${params.toString()}`;
  }

  protected parse(json: unknown): OsintItem[] {
    const r = json as ZeroZoneResponse;
    const items: OsintItem[] = [];
    for (const row of r.data?.list ?? []) {
      if (row.ip) items.push({ type: 'ip', value: row.ip, meta: { source: '0.zone', port: row.port, server: row.server } });
      if (row.domain) items.push({ type: 'domain', value: row.domain, meta: { source: '0.zone', title: row.title } });
      if (row.url) items.push({ type: 'url', value: row.url, meta: { source: '0.zone', title: row.title } });
    }
    return items;
  }
}