// RiskBird (riskbird.com) — HTTP provider
// API: https://api.riskbird.com/api/v1/search?query=<q>&apikey=<key>
// Simplified contract: returns {data: [{ip, port, domain, ...}]}
import { HttpProvider } from '../base.ts';
import type { OsintItem } from '../types.ts';

interface RiskBirdResponse {
  code?: number;
  msg?: string;
  data?: Array<{
    ip?: string;
    domain?: string;
    subdomain?: string;
    port?: number;
    url?: string;
    cert?: string;
    asn?: number | string;
  }>;
}

export class RiskBirdProvider extends HttpProvider {
  id = 'riskbird';
  name = 'RiskBird';
  requiredCredential = 'apikey';

  protected buildUrl(c: string, q: string, limit: number): string {
    const params = new URLSearchParams({
      query: q,
      apikey: c,
      limit: String(Math.min(Math.max(limit, 1), 200)),
    });
    return `https://api.riskbird.com/api/v1/search?${params.toString()}`;
  }

  protected parse(json: unknown): OsintItem[] {
    const r = json as RiskBirdResponse;
    const items: OsintItem[] = [];
    for (const row of r.data ?? []) {
      if (row.ip) items.push({ type: 'ip', value: row.ip, meta: { source: 'riskbird' } });
      if (row.domain) items.push({ type: 'domain', value: row.domain, meta: { source: 'riskbird' } });
      if (row.subdomain) items.push({ type: 'subdomain', value: row.subdomain, meta: { source: 'riskbird' } });
      if (row.url) items.push({ type: 'url', value: row.url, meta: { source: 'riskbird' } });
      if (row.cert) items.push({ type: 'cert', value: row.cert, meta: { source: 'riskbird' } });
      if (row.asn !== undefined) items.push({ type: 'asn', value: String(row.asn), meta: { source: 'riskbird' } });
    }
    return items;
  }
}