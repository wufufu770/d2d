// @wufufu770/d2d-agents - agent runner
import { validateAgentSpec } from '@wufufu770/d2d-core';

// HookEngine is optional (peer dep); fall back to no-op
class NoopHookEngine {
  async fire() { return { allowed: true, results: [] }; }
}

export class AgentRunner {
  constructor({ hooks, graphdClient, handlers = {}, log = console }) {
    this.hooks = hooks || new NoopHookEngine();
    this.graphd = graphdClient || null;
    this.handlers = handlers;
    this.log = log;
    this.runs = new Map();  // runId -> state
  }

  registerHandler(agentId, handler) {
    this.handlers[agentId] = handler;
  }

  async run(spec, inputs) {
    // 1. Validate spec
    const validation = validateAgentSpec(spec);
    if (!validation.success) {
      throw new Error(`invalid spec ${spec.id}: ${JSON.stringify(validation.error?.errors)}`);
    }

    // 2. Get handler
    const handler = this.handlers[spec.id];
    if (!handler) {
      throw new Error(`no handler registered for ${spec.id}`);
    }

    // 3. Create run state
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.runs.set(runId, { spec, inputs, status: 'running', startedAt: Date.now() });

    try {
      // 4. Run handler
      const result = await handler({ spec, inputs, runner: this, runId });

      // 5. Post hook
      await this.hooks.fire('PostToolUse', {
        agent: spec.id,
        runId,
        outputs: result,
      });

      // 6. Mark run done
      this.runs.set(runId, { ...this.runs.get(runId), status: 'done', outputs: result, endedAt: Date.now() });

      return result;
    } catch (err) {
      this.runs.set(runId, { ...this.runs.get(runId), status: 'failed', error: err.message, endedAt: Date.now() });
      throw err;
    }
  }

  getRun(runId) {
    return this.runs.get(runId);
  }

  listRuns() {
    return Array.from(this.runs.values());
  }
}
