// @wufufu770/d2d-agents - event dispatcher (resolves nextOn + fallbackNext)
import { resolveNextOn } from '@wufufu770/d2d-core';

class NoopHookEngine {
  async fire() { return { allowed: true, results: [] }; }
}

export class Dispatcher {
  constructor({ runner, hooks, graphdClient = null, log = console }) {
    this.runner = runner;
    this.hooks = hooks || new NoopHookEngine();
    this.graphd = graphdClient;
    this.log = log;
    this.visited = new Set();  // cycle detection
  }

  reset() {
    this.visited = new Set();
  }

  async dispatch(spec, context) {
    // Cycle / re-entry guard
    if (this.visited.has(spec.id)) {
      this.log.warn(`[dispatcher] cycle detected: ${spec.id}, breaking`);
      return null;
    }
    this.visited.add(spec.id);

    // Hook: SessionStart
    if (context.engagement_id && !context._sessionStarted) {
      const hookResult = await this.hooks.fire('SessionStart', {
        target: context.target,
        scope: context.scope,
        engagement_id: context.engagement_id,
      });
      if (!hookResult.allowed) {
        throw new Error(`SessionStart blocked: ${hookResult.reason}`);
      }
      context._sessionStarted = true;
    }

    // Run current agent
    const result = await this.runner.run(spec, context);

    // Resolve next agents (nextOn + fallbackNext)
    const nextAgents = resolveNextOn(spec);
    if (nextAgents.length === 0) {
      return result;
    }

    // Try each in order; on success, run next agent directly (not via dispatch)
    // to prevent infinite recursion through supervisor's fallback
    for (const nextId of nextAgents) {
      if (this.visited.has(nextId)) {
        this.log.warn(`[dispatcher] skipping already-visited ${nextId}`);
        continue;
      }
      try {
        const hookResult = await this.hooks.fire('WorkerSpawn', {
          spec: spec.id,
          worker_id: nextId,
          engagement_id: context.engagement_id,
        });
        if (!hookResult.allowed) {
          this.log.warn(`[dispatcher] WorkerSpawn blocked: ${hookResult.reason}, skipping ${nextId}`);
          continue;
        }

        const nextSpec = this._getSpec(nextId);
        if (!nextSpec) {
          this.log.warn(`[dispatcher] no spec for ${nextId}, skipping`);
          continue;
        }

        // Recursive dispatch (but cycle guard prevents infinite loop)
        return await this.dispatch(nextSpec, { ...context, _previousResult: result });
      } catch (err) {
        this.log.warn(`[dispatcher] ${nextId} failed: ${err.message}, trying next`);
        // continue to next nextOn
      }
    }

    // All next agents either already visited or exhausted — return current result
    this.log.warn(`[dispatcher] no more next agents for ${spec.id}, returning current result`);
    return result;
  }

  _getSpec(agentId) {
    return this.registry?.get(agentId) || null;
  }
}
