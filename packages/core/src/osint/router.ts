// @wufufu770/d2d-core — OSINT router
//
// Registers all 6 providers (FOFA, Hunter, Quake, RiskBird, ZoomEye, 0.zone).
// Provides:
//   • register(provider) / unregister(id) — registry CRUD
//   • listProviders() — return all registered ids
//   • query(source, q, opts) — single-provider query
//   • queryAll(q, opts) — fan-out to all providers in parallel, return array
//
// queryAll() is bounded by `concurrency` and tolerates failures (returns partial
// results). Each provider result preserves its own ok/error semantics — the
// router NEVER throws on a per-provider failure (matches #54 parallel-trigger
// contract: "single source failure must not block graph write").

import type { OsintProvider, OsintResult, OsintQueryOpts, OsintRouter, OsintRouterOpts, OsintItem } from './types.ts';
import { FofaProvider } from './providers/fofa.ts';
import { HunterProvider } from './providers/hunter.ts';
import { QuakeProvider } from './providers/quake.ts';
import { RiskBirdProvider } from './providers/riskbird.ts';
import { ZoomEyeProvider } from './providers/zoomeye.ts';
import { ZeroZoneProvider } from './providers/zero-zone.ts';

const DEFAULT_CONCURRENCY = 4;

/**
 * Build a router with the 6 default providers pre-registered.
 */
export function createRouter(opts: OsintRouterOpts = {}): OsintRouter {
  const providers = new Map<string, OsintProvider>();

  // Pre-register all 6 default providers
  for (const p of [
    new FofaProvider(),
    new HunterProvider(),
    new QuakeProvider(),
    new RiskBirdProvider(),
    new ZoomEyeProvider(),
    new ZeroZoneProvider(),
  ]) {
    providers.set(p.id, p);
  }

  return {
    register(p: OsintProvider): void {
      providers.set(p.id, p);
    },
    unregister(id: string): boolean {
      return providers.delete(id);
    },
    listProviders(): string[] {
      return Array.from(providers.keys());
    },
    async query(source: string, q: string, o: OsintQueryOpts = {}): Promise<OsintResult> {
      const p = providers.get(source);
      if (!p) {
        return {
          ok: false,
          source,
          items: [],
          error: `unknown source: ${source}`,
          durationMs: 0,
        };
      }
      const merged = { ...o, fetcher: o.fetcher ?? opts.fetcher };
      return await p.query(q, merged);
    },
    async queryAll(q: string, o: OsintQueryOpts = {}): Promise<OsintResult[]> {
      const all = Array.from(providers.values());
      const results: OsintResult[] = [];
      const concurrency = Math.max(1, all.length);
      // Simple bounded parallel: chunk into `concurrency` slots
      const queue = [...all];
      const running: Promise<void>[] = [];
      while (queue.length > 0 || running.length > 0) {
        while (running.length < concurrency && queue.length > 0) {
          const p = queue.shift()!;
          const task = p.query(q, { ...o, fetcher: o.fetcher ?? opts.fetcher })
            .then((r) => { results.push(r); })
            .catch((e: unknown) => {
              results.push({
                ok: false,
                source: p.id,
                items: [],
                error: e instanceof Error ? e.message : String(e),
                durationMs: 0,
              });
            })
            .finally(() => {
              const idx = running.indexOf(task);
              if (idx >= 0) running.splice(idx, 1);
            });
          running.push(task);
        }
        if (running.length > 0) {
          await Promise.race(running.map((t) => t.then(() => {})));
        }
      }
      return results;
    },
  };
}

/**
 * Deduplicate OsintItems by (type, value). Meta is preserved from the first
 * occurrence; subsequent duplicates drop their meta. Used by #54 graph-write
 * to keep the graph clean when multiple providers return the same finding.
 */
export function dedupeItems(items: OsintItem[]): OsintItem[] {
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
 * Flatten queryAll() results into a single deduped item list.
 */
export function flattenResults(results: OsintResult[]): OsintItem[] {
  return dedupeItems(results.flatMap((r) => r.items));
}

// Re-export for tests + downstream
export { FofaProvider, HunterProvider, QuakeProvider, RiskBirdProvider, ZoomEyeProvider, ZeroZoneProvider };