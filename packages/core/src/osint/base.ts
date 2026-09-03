// @wufufu770/d2d-core — OSINT provider base class
//
// Shared helpers:
//   • HttpProvider    — wraps fetch with timeout, rate-limit detection, JSON parsing
//   • CliProvider     — spawns a binary via child_process, parses YAML/JSON output
//   • requireCred()   — validates credential presence, returns normalized result
//
// Each provider extends one of these and implements ~5 lines of provider-specific glue.

import { spawn } from 'node:child_process';
import type { OsintItem, OsintResult, OsintQueryOpts, OsintProvider } from './types.ts';

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_LIMIT = 100;

function nowMs(): number { return Date.now(); }

/**
 * Build a failure result (never throws).
 */
export function fail(
  source: string,
  error: string,
  opts: { rateLimited?: boolean; quotaHit?: boolean; durationMs?: number } = {},
): OsintResult {
  return {
    ok: false,
    source,
    items: [],
    error,
    rateLimited: opts.rateLimited ?? false,
    quotaHit: opts.quotaHit ?? false,
    durationMs: opts.durationMs ?? 0,
  };
}

/**
 * Build a success result.
 */
export function ok(
  source: string,
  items: OsintItem[],
  opts: { durationMs?: number; raw?: unknown } = {},
): OsintResult {
  return {
    ok: true,
    source,
    items,
    durationMs: opts.durationMs ?? 0,
    raw: opts.raw,
  };
}

/**
 * Validate a credential string. Returns the normalized credential or a fail() result.
 */
export function requireCred(
  source: string,
  opts: OsintQueryOpts | undefined,
  requiredCredential: string,
): { credential: string } | OsintResult {
  const c = opts?.credential;
  if (!c || typeof c !== 'string' || c.trim() === '') {
    return fail(source, `missing credential: ${requiredCredential}`);
  }
  return { credential: c.trim() };
}

/**
 * HTTP-based provider base. Subclasses implement:
 *   buildUrl(credential, query, limit): string
 *   parse(json): OsintItem[]
 */
export abstract class HttpProvider implements OsintProvider {
  abstract id: string;
  abstract name: string;
  abstract requiredCredential: string;
  protected abstract buildUrl(c: string, q: string, limit: number): string;
  protected abstract parse(json: unknown): OsintItem[];

  async query(q: string, opts: OsintQueryOpts = {}): Promise<OsintResult> {
    const credCheck = requireCred(this.id, opts, this.requiredCredential);
    if ('ok' in credCheck) return credCheck;
    const t0 = nowMs();
    const fetcher = opts.fetcher ?? fetch;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const limit = opts.limit ?? DEFAULT_LIMIT;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const url = this.buildUrl(credCheck.credential, q, limit);
      const res = await fetcher(url, { signal: ctrl.signal });
      const status = res.status;
      if (status === 429) {
        return fail(this.id, 'rate limited (HTTP 429)', { rateLimited: true, durationMs: nowMs() - t0 });
      }
      if (status === 401 || status === 403) {
        return fail(this.id, `auth failed (HTTP ${status})`, { durationMs: nowMs() - t0 });
      }
      if (status === 402) {
        return fail(this.id, 'quota exhausted (HTTP 402)', { quotaHit: true, durationMs: nowMs() - t0 });
      }
      if (!res.ok) {
        return fail(this.id, `HTTP ${status}`, { durationMs: nowMs() - t0 });
      }
      const json = await res.json().catch(() => null);
      if (json == null) {
        return fail(this.id, 'invalid JSON response', { durationMs: nowMs() - t0 });
      }
      const items = this.parse(json);
      return ok(this.id, items, { durationMs: nowMs() - t0, raw: json });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const isAbort = msg.includes('abort') || msg.includes('AbortError');
      return fail(this.id, isAbort ? `timeout after ${timeoutMs}ms` : msg, { durationMs: nowMs() - t0 });
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * CLI-based provider base. Subclasses implement:
 *   buildArgs(credential, query, limit): string[]
 *   parse(stdout): OsintItem[]
 */
export abstract class CliProvider implements OsintProvider {
  abstract id: string;
  abstract name: string;
  abstract requiredCredential: string;
  protected abstract buildArgs(c: string, q: string, limit: number): string[];
  protected abstract parse(stdout: string): OsintItem[];

  async query(q: string, opts: OsintQueryOpts = {}): Promise<OsintResult> {
    const credCheck = requireCred(this.id, opts, this.requiredCredential);
    if ('ok' in credCheck) return credCheck;
    const t0 = nowMs();
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const limit = opts.limit ?? DEFAULT_LIMIT;
    const args = this.buildArgs(credCheck.credential, q, limit);

    return await new Promise<OsintResult>((resolve) => {
      const child = spawn(this.binary, args, { timeout: timeoutMs });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      child.on('error', (e) => {
        resolve(fail(this.id, `spawn error: ${e.message}`, { durationMs: nowMs() - t0 }));
      });
      child.on('close', (code) => {
        const durationMs = nowMs() - t0;
        if (code !== 0) {
          const lower = stderr.toLowerCase();
          const rateLimited = lower.includes('rate limit') || lower.includes('too many');
          const quotaHit = lower.includes('quota') || lower.includes('credit');
          resolve(fail(this.id, `cli exit ${code}: ${stderr.slice(0, 200)}`, { rateLimited, quotaHit, durationMs }));
          return;
        }
        try {
          const items = this.parse(stdout);
          resolve(ok(this.id, items, { durationMs }));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          resolve(fail(this.id, `parse error: ${msg}`, { durationMs }));
        }
      });
    });
  }

  protected get binary(): string {
    return this.id;
  }
}