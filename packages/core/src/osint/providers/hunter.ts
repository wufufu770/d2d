// Hunter (hunter.io) — HTTP provider
// API: https://api.hunter.io/v2/domain-search?domain=<q>&api_key=<key>
import { HttpProvider } from '../base.ts';
import type { OsintItem } from '../types.ts';

interface HunterResponse {
  data?: {
    domain?: string;
    emails?: Array<{ value: string; type?: string }>;
  };
  errors?: Array<{ details?: string }>;
}

export class HunterProvider extends HttpProvider {
  id = 'hunter';
  name = 'Hunter.io';
  requiredCredential = 'apikey';

  protected buildUrl(c: string, q: string, limit: number): string {
    const params = new URLSearchParams({
      domain: q,
      api_key: c,
      limit: String(Math.min(Math.max(limit, 1), 100)),
    });
    return `https://api.hunter.io/v2/domain-search?${params.toString()}`;
  }

  protected parse(json: unknown): OsintItem[] {
    const r = json as HunterResponse;
    const items: OsintItem[] = [];
    const domain = r.data?.domain;
    if (domain) items.push({ type: 'domain', value: domain, meta: { source: 'hunter' } });
    for (const e of r.data?.emails ?? []) {
      items.push({ type: 'email', value: e.value, meta: { source: 'hunter', type: e.type } });
    }
    return items;
  }
}