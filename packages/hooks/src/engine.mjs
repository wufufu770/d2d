// @wufufu770/d2d-hooks - 7 hook events + engine (v0.2.0: 4 core, v0.2.0-rc: +3)
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

// ===== 7 hook events =====
export const HOOK_EVENTS = [
  'PreToolUse',              // v0.2.0 core (sync, fail-closed)
  'PostToolUse',             // v0.2.0 core (async, fail-open)
  'FindingWrite',            // v0.2.0 core (async, fail-open)
  'SessionStart',            // v0.2.0 core (sync, fail-closed)
  'WorkerSpawn',             // v0.2.0-rc (sync, fail-closed)
  'FindingStateTransition',  // v0.2.0-rc (sync, fail-closed)
  'EngagementLifecycle',     // v0.2.0-rc (sync, fail-closed)
];

// Default fail modes per event
export const DEFAULT_FAIL_MODE = {
  PreToolUse: 'closed',
  PostToolUse: 'open',
  FindingWrite: 'open',
  SessionStart: 'closed',
  WorkerSpawn: 'closed',
  FindingStateTransition: 'closed',
  EngagementLifecycle: 'closed',
};

export const DEFAULT_SYNC = {
  PreToolUse: true,
  PostToolUse: false,
  FindingWrite: false,
  SessionStart: true,
  WorkerSpawn: true,
  FindingStateTransition: true,
  EngagementLifecycle: true,
};

// ===== Hook config schema =====
export const HookConfigSchema = {
  // matcher fields
  tool: 'string?',
  command_pattern: 'string?',
  scope: 'string?',
  severity: 'string|string[]?',
  event: 'string?',
  always: 'boolean?',
  // action fields
  id: 'string',
  command: 'string',
  args: 'string[]?',
  timeout: 'number?',
  sync: 'boolean?',
  failMode: "'closed'|'open'?",
  blockOnExitCode: 'number[]?',
  blockMessage: 'string?',
  env: 'object?',
};

// ===== HookEngine =====
export class HookEngine {
  constructor(configOrPath) {
    if (typeof configOrPath === 'string') {
      this.config = JSON.parse(readFileSync(configOrPath, 'utf8'));
    } else {
      this.config = configOrPath || { hooks: {} };
    }
    this.hooks = this.config.hooks || {};
    this.results = [];
    this.metrics = {
      totalFires: 0,
      totalBlocked: 0,
      totalFailOpen: 0,
      totalFailClosed: 0,
      avgDurationMs: 0,
      durations: [],
    };
  }

  async fire(event, context) {
    if (!HOOK_EVENTS.includes(event)) {
      return { allowed: true, results: [], warning: `unknown event: ${event}` };
    }
    const eventHooks = this.hooks[event] || [];
    const results = [];

    for (const hook of eventHooks) {
      if (!this._match(hook.matcher, context)) continue;

      const sync = hook.sync !== undefined ? hook.sync : DEFAULT_SYNC[event];
      const failMode = hook.failMode || DEFAULT_FAIL_MODE[event];

      if (!sync) {
        // fire-and-forget
        this._runHook(hook, event, context).catch(e => {
          // best-effort log
          if (typeof process !== 'undefined' && process.stderr) {
            process.stderr.write(`[d2d-hook] async ${event}/${hook.id} failed: ${e.message}\n`);
          }
        });
        continue;
      }

      const result = await this._runHook(hook, event, context);
      results.push(result);

      // sync + fail-closed: 任何 blockOnExitCode 或 error → 拒绝
      if (failMode === 'closed') {
        const blocked = hook.blockOnExitCode?.includes(result.exitCode);
        const errored = result.exitCode !== 0;
        if (blocked || errored) {
          this.metrics.totalBlocked++;
          this.metrics.totalFailClosed++;
          return {
            allowed: false,
            reason: hook.blockMessage || result.stderr || `hook '${hook.id}' failed (exit ${result.exitCode})`,
            hookId: hook.id,
            mode: 'fail-closed',
          };
        }
      } else if (failMode === 'open' && result.exitCode !== 0) {
        this.metrics.totalFailOpen++;
      }
    }

    return { allowed: true, results };
  }

  _match(matcher, context) {
    if (!matcher) return true;
    if (matcher.always) return true;
    for (const [k, v] of Object.entries(matcher)) {
      const ctxVal = context[k];
      if (ctxVal === undefined) return false;
      if (Array.isArray(v)) {
        if (!v.some(item => this._matchSingle(item, ctxVal))) return false;
      } else {
        if (!this._matchSingle(v, ctxVal)) return false;
      }
    }
    return true;
  }

  _matchSingle(pattern, value) {
    if (typeof pattern === 'string' && pattern.startsWith('/') && pattern.endsWith('/')) {
      try { return new RegExp(pattern.slice(1, -1)).test(String(value)); } catch { return false; }
    }
    if (typeof pattern === 'string' && pattern.includes('|')) {
      return pattern.split('|').some(p => String(value) === p || String(value).includes(p));
    }
    return String(value).includes(String(pattern));
  }

  async _runHook(hook, event, context) {
    const startTs = Date.now();
    const ctxFile = path.join(os.tmpdir(), `d2d-hook-${process.pid}-${randomBytes(4).toString('hex')}.json`);
    mkdirSync(path.dirname(ctxFile), { recursive: true });
    writeFileSync(ctxFile, JSON.stringify({ event, context, hookId: hook.id, ts: startTs }));

    const childEnv = {
      ...process.env,
      D2D_HOOK_EVENT: event,
      D2D_HOOK_ID: hook.id,
      D2D_HOOK_CONTEXT: ctxFile,
      D2D_DATA_DIR: process.env.D2D_DATA_DIR || '',
      D2D_ENGAGEMENT_ID: context.engagement_id || '',
      ...(hook.env || {}),
    };

    return new Promise((resolve) => {
      let stdout = '', stderr = '';
      let settled = false;

      const finish = (exitCode, signal) => {
        if (settled) return;
        settled = true;
        try { unlinkSync(ctxFile); } catch {}
        const durationMs = Date.now() - startTs;
        const result = {
          hookId: hook.id,
          event,
          exitCode: exitCode ?? (signal ? 128 + 99 : 1),
          signal,
          stdout: stdout.slice(0, 64 * 1024),
          stderr: stderr.slice(0, 64 * 1024),
          durationMs,
        };
        this.results.push(result);
        this.metrics.totalFires++;
        this.metrics.durations.push(durationMs);
        this.metrics.avgDurationMs = this.metrics.durations.reduce((a, b) => a + b, 0) / this.metrics.durations.length;
        resolve(result);
      };

      const child = spawn(hook.command, hook.args || [], {
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: hook.timeout || 30000,
        uid: process.getuid?.(),
        gid: process.getgid?.(),
        cwd: os.tmpdir(),
      });

      child.stdout.on('data', d => { stdout += d.toString(); });
      child.stderr.on('data', d => { stderr += d.toString(); });
      child.on('close', (code, signal) => finish(code, signal));
      child.on('error', (err) => {
        stderr += `\nspawn error: ${err.message}`;
        finish(127, null);
      });
    });
  }
}

// ===== Default config =====
export function defaultHookConfig() {
  return {
    $schema: 'https://d2d.dev/schemas/hooks/v1.json',
    version: 1,
    hooks: {
      PreToolUse: [],
      PostToolUse: [],
      FindingWrite: [],
      SessionStart: [],
      WorkerSpawn: [],
      FindingStateTransition: [],
      EngagementLifecycle: [],
    },
  };
}
