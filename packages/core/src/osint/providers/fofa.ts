// FOFA (fofa.info) — HTTP provider
// API: https://fofa.info/api/v1/search/all?qbase64=<base64>&email=<email>&key=<key>&size=<n>
import { HttpProvider } from '../base.ts';
import type { OsintItem } from '../types.ts';

interface FofaResponse {
  errcode?: number;
  errmsg?: string;
  results?: string[][];
  size?: number;
}

export class FofaProvider extends HttpProvider {
  id = 'fofa';
  name = 'FOFA';
  requiredCredential = 'email:apikey (e.g. "user@example.com:abc123...")';

  protected buildUrl(c: string, q: string, limit: number): string {
    const [email, key] = c.split(':', 2);
    const qbase64 = Buffer.from(q, 'utf8').toString('base64');
    const size = Math.min(Math.max(limit, 1), 10_000);
    const params = new URLSearchParams({
      qbase64,
      email: email ?? '',
      key: key ?? '',
      size: String(size),
      fields: 'host,ip,port,protocol,domain,title',
    });
    return `https://fofa.info/api/v1/search/all?${params.toString()}`;
  }

  protected parse(json: unknown): OsintItem[] {
    const r = json as FofaResponse;
    if (r.errcode !== undefined && r.errcode !== 0) {
      return [];
    }
    const items: OsintItem[] = [];
    for (const row of r.results ?? []) {
      const [host, ip, port, protocol, domain, title] = row;
      if (host) items.push({ type: 'domain', value: host, meta: { source: 'fofa', title } });
      if (ip) items.push({ type: 'ip', value: ip, meta: { source: 'fofa' } });
      if (port) items.push({ type: 'port', value: String(port), meta: { source: 'fofa' } });
      if (domain && domain !== host) items.push({ type: 'subdomain', value: domain, meta: { source: 'fofa' } });
      if (protocol) items.push({ type: 'service', value: `${protocol}/${host ?? ''}`, meta: { source: 'fofa', port } });
    }
    return items;
  }
}