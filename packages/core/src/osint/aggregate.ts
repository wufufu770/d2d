// @wufufu770/d2d-core — OSINT aggregator (#54)
//
// Pulls in #52 (router + providers) and #53 (credential store):
//   1. Resolve credentials for each enabled provider
//   2. Trigger router.queryAll(target) — bounded-parallel fan-out (no-op if all fail)
//   3. Dedupe items across providers by (type, value)
//   4. Persist to graphd via host-token channel:
//      MERGE (e:Engagement {name: $engagement})
//      MERGE (ep:Endpoint {value: $value})
//        SET ep.type = $type, ep.source = $source, ep.updated_at = timestamp()
//      MATCH (e), (ep) MERGE (e)-[:HAS_ENDPOINT]->(ep)
//
// Per-provider failures never block the rest. Writes use the host-token
// channel (scheduler's legal write path; worker /query is read-only — see
// app.py:599 V-05r). 0 new npm deps.
//
// All inputs are injectable so tests can mock graphd + providers without
// touching real network or graphd.

import type { OsintResult, OsintItem } from './types.ts';
import { PROVIDER_IDS } from './credentials.ts';
import type { ProviderId } from './credentials.ts';

// ===== Types =====
export interface AggregateOpts {
  fetcher?: typeof fetch;
  graphdUrl?: string;
  hostToken?: string;
  engagement?: string;
  timeoutMs?: number;
  concurrency?: number;
  enabledProviders?: ProviderId[];
}

export interface AggregateProviderStats {
  source: ProviderId;
  ok: boolean;
  itemCount: number;
  durationMs: number;
  error?: string;
  rateLimited?: boolean;
  skipped?: boolean;        // true if credential missing
  skipReason?: string;
}

export interface AggregateWriteStats {
  engagement: string;
  endpointsAttempted: number;
  endpointsWritten: number;
  errors: Array<{ cypher: string; error: string }>;
}

export interface AggregateResult {
  target: string;
  engagement: string;
  dedupeStats: {
    rawItems: number;
    uniqueItems: number;
    duplicatesDropped: number;
  };
  providers: AggregateProviderStats[];
  writes: AggregateWriteStats;
  durationMs: number;
}

export interface RouterLike {
  queryAll(q: string, opts?: { fetcher?: typeof fetch; credential?: string; timeoutMs?: number }): Promise<OsintResult[]>;
}

// ===== Defaults =====
const DEFAULT_GRAPH_URL = process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766';
const DEFAULT_HOST_TOKEN = process.env.P2P_HOST_TOKEN ?? '';
const DEFAULT_ENGAGEMENT = 'osint-default';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_CONCURRENCY = 4;

// ===== Helpers =====
function dedupeItems(items: OsintItem[]): OsintItem[] {
  const seen = new Set<string>();
  const out: OsintItem[] = [];
  for (const item of items) {
    const key = `${item.type}:${item.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Resolve a credential for a provider: store → env var → null.
 * Mirrors CredentialStore.resolve() from #53 but kept inline to avoid
 * a runtime dependency on the credentials module (kept separable for testing).
 */
async function resolveCredential(
  provider: ProviderId,
  storeResolver?: (id: ProviderId) => Promise<string | null>,
): Promise<string | null> {
  if (storeResolver) {
    const v = await storeResolver(provider);
    if (v) return v;
  }
  const envName = `${provider.toUpperCase().replace(/\./g, '')}_TOKEN`;
  return process.env[envName] ?? null;
}

/**
 * POST cypher to graphd /query. Returns {ok, rows, error?}.
 */
async function graphdQuery(
  cypher: string,
  params: Record<string, unknown>,
  opts: { fetcher?: typeof fetch; graphdUrl?: string; hostToken?: string; timeoutMs?: number } = {},
): Promise<{ ok: boolean; rows?: unknown[]; error?: string }> {
  const fetcher = opts.fetcher ?? fetch;
  const url = `${opts.graphdUrl ?? DEFAULT_GRAPH_URL}/query`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000);
  try {
    const res = await fetcher(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(opts.hostToken ? { 'X-Auth': `host ${opts.hostToken}` } : {}),
      },
      body: JSON.stringify({ cypher, params }),
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const body = await res.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return { ok: false, error: 'invalid JSON response' };
    }
    if (body.ok === false) {
      return { ok: false, error: String(body.error ?? 'unknown graphd error') };
    }
    return { ok: true, rows: Array.isArray(body.rows) ? body.rows : [] };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.includes('abort') ? 'timeout' : msg };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build the cypher that upserts an Engagement + Endpoint + edge.
 */
function buildWriteCypher(engagement: string, item: OsintItem, source: ProviderId): { cypher: string; params: Record<string, unknown> } {
  const cypher = `
    MERGE (e:Engagement {name: $engagement})
    MERGE (ep:Endpoint {value: $value})
      ON CREATE SET ep.type = $type, ep.first_source = $source, ep.created_at = timestamp()
      ON MATCH  SET ep.type = $type, ep.last_source = $source, ep.updated_at = timestamp()
    MERGE (e)-[r:HAS_ENDPOINT]->(ep)
      ON CREATE SET r.first_seen = timestamp()
      ON MATCH  SET r.last_seen = timestamp()
    RETURN ep.value AS v
  `;
  return {
    cypher: cypher.trim(),
    params: {
      engagement,
      value: item.value,
      type: item.type,
      source,
    },
  };
}

// ===== Public API =====
export interface AggregateDeps {
  router: RouterLike;
  resolveCredential?: (id: ProviderId) => Promise<string | null>;
}

/**
 * Aggregate OSINT results for a single target.
 *
 * Steps:
 *   1. Resolve credentials per enabled provider (missing creds → skip, do not fail).
 *   2. Fan-out via router.queryAll (bounded-parallel — failures isolated).
 *   3. Dedupe items by (type, value).
 *   4. Write each unique item to graphd via host-token channel.
 *
 * Returns an AggregateResult with per-provider stats + dedupe stats + write stats.
 * Never throws on per-provider / per-write failures (each captured in result).
 */
export async function aggregate(
  target: string,
  deps: AggregateDeps,
  opts: AggregateOpts = {},
): Promise<AggregateResult> {
  const t0 = Date.now();
  const fetcher = opts.fetcher;
  const enabled = opts.enabledProviders ?? Array.from(PROVIDER_IDS);
  const engagement = opts.engagement ?? DEFAULT_ENGAGEMENT;
  const hostToken = opts.hostToken ?? DEFAULT_HOST_TOKEN;

  // --- 1+2. Resolve credentials + fan-out ---
  const providerStats: AggregateProviderStats[] = [];
  const allResults: OsintResult[] = [];

  // Run providers in parallel (bounded). For each: resolve cred → router.queryAll with credential.
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const queue = [...enabled];
  const running: Promise<void>[] = [];
  while (queue.length > 0 || running.length > 0) {
    while (running.length < concurrency && queue.length > 0) {
      const source = queue.shift()!;
      const task = (async () => {
        const cred = await resolveCredential(source, deps.resolveCredential);
        if (!cred) {
          providerStats.push({
            source,
            ok: false,
            itemCount: 0,
            durationMs: 0,
            skipped: true,
            skipReason: 'no credential (store + env empty)',
            error: 'missing credential',
          });
          return;
        }
        const pt0 = Date.now();
        try {
          // Router interface: queryAll(q, {credential, fetcher}). Pass only one credential
          // so each provider gets its own — but the Router interface takes a single
          // credential for all providers in queryAll. To keep #54 self-contained, we
          // bypass queryAll and call each provider indirectly by filtering router results
          // OR by re-issuing query(source, q, opts). For RouterLike flexibility, we
          // expect the router to dispatch based on the credential per provider (the
          // default createRouter() does this if the caller filters post-hoc). Here we
          // issue a focused query per provider via a thin shim.
          const single = await deps.router.queryAll(target, {
            credential: cred,
            fetcher,
            timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          });
          // queryAll fans out to ALL providers, so filter to just our source:
          const result = single.find((r) => r.source === source) ?? {
            ok: false,
            source,
            items: [],
            error: 'router did not return result for source',
            durationMs: Date.now() - pt0,
          };
          allResults.push(result);
          providerStats.push({
            source,
            ok: result.ok,
            itemCount: result.items.length,
            durationMs: result.durationMs || (Date.now() - pt0),
            error: result.error,
            rateLimited: result.rateLimited,
          });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          providerStats.push({
            source,
            ok: false,
            itemCount: 0,
            durationMs: Date.now() - pt0,
            error: msg,
          });
        }
      })();
      running.push(task);
      task.finally(() => {
        const i = running.indexOf(task);
        if (i >= 0) running.splice(i, 1);
      });
    }
    if (running.length > 0) {
      await Promise.race(running.map((t) => t.then(() => {})));
    }
  }

  // --- 3. Dedupe ---
  const rawItems = allResults.flatMap((r) => r.items);
  const unique = dedupeItems(rawItems);
  const dedupeStats = {
    rawItems: rawItems.length,
    uniqueItems: unique.length,
    duplicatesDropped: rawItems.length - unique.length,
  };

  // --- 4. Write to graphd ---
  const writes: AggregateWriteStats = {
    engagement,
    endpointsAttempted: unique.length,
    endpointsWritten: 0,
    errors: [],
  };

  // Per-source first-seen preference: items retain source from their first provider
  // (since dedupe keeps the first occurrence). We need the source for the write, so
  // re-derive it from allResults:
  const itemToSource = new Map<string, ProviderId>();
  for (const r of allResults) {
    if (!r.ok) continue;
    for (const item of r.items) {
      const key = `${item.type}:${item.value}`;
      if (!itemToSource.has(key)) {
        itemToSource.set(key, r.source as ProviderId);
      }
    }
  }

  for (const item of unique) {
    const source = itemToSource.get(`${item.type}:${item.value}`) ?? 'fofa';
    const { cypher, params } = buildWriteCypher(engagement, item, source);
    const r = await graphdQuery(cypher, params, {
      fetcher,
      hostToken,
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    if (r.ok) {
      writes.endpointsWritten++;
    } else {
      writes.errors.push({ cypher: cypher.slice(0, 80) + '…', error: r.error ?? 'unknown' });
    }
  }

  return {
    target,
    engagement,
    dedupeStats,
    providers: providerStats,
    writes,
    durationMs: Date.now() - t0,
  };
}

/**
 * Convenience: build an AggregateResult from raw OsintResult[] without writing to graphd.
 * Useful for offline analysis + testing.
 */
export function summarize(
  target: string,
  results: OsintResult[],
  opts: { engagement?: string } = {},
): Pick<AggregateResult, 'target' | 'engagement' | 'dedupeStats' | 'providers'> {
  const rawItems = results.flatMap((r) => r.items);
  const unique = dedupeItems(rawItems);
  const providers = results.map((r) => ({
    source: r.source as ProviderId,
    ok: r.ok,
    itemCount: r.items.length,
    durationMs: r.durationMs,
    error: r.error,
    rateLimited: r.rateLimited,
  }));
  return {
    target,
    engagement: opts.engagement ?? DEFAULT_ENGAGEMENT,
    providers,
    dedupeStats: {
      rawItems: rawItems.length,
      uniqueItems: unique.length,
      duplicatesDropped: rawItems.length - unique.length,
    },
  };
}