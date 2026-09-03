// @wufufu770/d2d-core — OSINT types (shared by all providers + router)
//
// Uniform contract: every provider returns an OsintResult regardless of upstream shape.
// This is the v0.3.0-M5 foundation — providers can be swapped, mocked, or fall through
// to each other without changing the consumer surface.

export type OsintItemType =
  | 'ip'
  | 'domain'
  | 'subdomain'
  | 'service'
  | 'url'
  | 'cert'
  | 'email'
  | 'asn'
  | 'port';

export interface OsintItem {
  type: OsintItemType;
  value: string;
  meta?: Record<string, unknown>;
}

export interface OsintResult {
  ok: boolean;
  source: string;
  items: OsintItem[];
  error?: string;
  rateLimited?: boolean;
  quotaHit?: boolean;
  durationMs: number;
  raw?: unknown;
}

export interface OsintQueryOpts {
  limit?: number;
  timeoutMs?: number;
  credential?: string;
  fetcher?: typeof fetch;
}

export interface OsintProvider {
  id: string;
  name: string;
  requiredCredential: string;
  query(q: string, opts?: OsintQueryOpts): Promise<OsintResult>;
}

export interface OsintRouterOpts {
  fetcher?: typeof fetch;
  defaultTimeoutMs?: number;
  defaultLimit?: number;
}

export interface OsintRouter {
  register(p: OsintProvider): void;
  unregister(id: string): boolean;
  listProviders(): string[];
  query(source: string, q: string, opts?: OsintQueryOpts): Promise<OsintResult>;
  queryAll(q: string, opts?: OsintQueryOpts): Promise<OsintResult[]>;
}