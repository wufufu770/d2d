// @wufufu770/d2d-agents test
import { test } from 'node:test';
import assert from 'node:assert';
import { AgentRunner } from '../src/runner.mjs';
import { Dispatcher } from '../src/dispatcher.mjs';
import { HANDLERS, listHandlers, getHandler } from '../src/handlers/pentest.mjs';
import { getAgentSpec, AGENT_SPECS } from '@wufufu770/d2d-core';

test('12 handlers defined', () => {
  assert.equal(listHandlers().length, 12);
});

test('getHandler returns handler for valid agent', () => {
  assert.equal(typeof getHandler('recon-orchestrator'), 'function');
  assert.equal(getHandler('nonexistent'), null);
});

test('AgentRunner.run executes a handler', async () => {
  const runner = new AgentRunner({ handlers: HANDLERS });
  const spec = getAgentSpec('recon-orchestrator');
  const result = await runner.run(spec, { target: 'https://x.com', scope: 'authorized' });
  assert.ok(result.engagement_id);
  assert.equal(result.chains.length, 5);
});

test('AgentRunner.run throws for invalid spec', async () => {
  const runner = new AgentRunner({ handlers: HANDLERS });
  const badSpec = { id: 'bad', label: 'x' };
  await assert.rejects(async () => {
    await runner.run(badSpec, {});
  }, /invalid spec/);
});

test('AgentRunner.run throws for missing handler', async () => {
  const runner = new AgentRunner({ handlers: {} });
  const spec = getAgentSpec('recon-orchestrator');
  await assert.rejects(async () => {
    await runner.run(spec, {});
  }, /no handler/);
});

test('AgentRunner tracks runs', async () => {
  const runner = new AgentRunner({ handlers: HANDLERS });
  const spec = getAgentSpec('model-worker');
  const r = await runner.run(spec, { task: 'hypothesis' });
  const runs = runner.listRuns();
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, 'done');
  assert.deepEqual(runs[0].outputs, r);
});

test('AgentRunner.run fires PostToolUse hook (custom or noop)', async () => {
  const hookEvents = [];
  const hooks = {
    async fire(event, ctx) {
      hookEvents.push({ event, ctx });
      return { allowed: true };
    },
  };
  const runner = new AgentRunner({ hooks, handlers: HANDLERS });
  const spec = getAgentSpec('recon-orchestrator');
  await runner.run(spec, { target: 'x.com' });
  const postToolUse = hookEvents.find(e => e.event === 'PostToolUse');
  assert.ok(postToolUse, 'PostToolUse hook should have fired');
  assert.equal(postToolUse.ctx.agent, 'recon-orchestrator');
});

test('AgentRunner without hooks uses noop', async () => {
  const runner = new AgentRunner({ handlers: HANDLERS });
  const spec = getAgentSpec('recon-orchestrator');
  const result = await runner.run(spec, { target: 'x.com' });
  assert.ok(result.engagement_id);
});

test('Dispatcher routes nextOn chain', async () => {
  const hooks = { async fire() { return { allowed: true }; } };
  const runner = new AgentRunner({ hooks, handlers: HANDLERS });
  const dispatcher = new Dispatcher({ runner, hooks });
  dispatcher.registry = { get: (id) => AGENT_SPECS.find(s => s.id === id) };

  const spec = getAgentSpec('recon-orchestrator');
  const result = await dispatcher.dispatch(spec, { target: 'x.com' });
  assert.ok(result, 'dispatch should return final result');
});

test('Dispatcher falls through to fallback on failure', async () => {
  const hooks = { async fire() { return { allowed: true }; } };
  const brokenHandlers = {
    ...HANDLERS,
    'vuln-impact-judge': () => { throw new Error('mock failure'); },
  };
  const runner = new AgentRunner({ hooks, handlers: brokenHandlers });
  const dispatcher = new Dispatcher({ runner, hooks });
  dispatcher.registry = { get: (id) => AGENT_SPECS.find(s => s.id === id) };

  const spec = getAgentSpec('attack-loop');
  const result = await dispatcher.dispatch(spec, { target: 'x.com' });
  assert.ok(result, 'should fall through to fallback');
});

test('12 agent specs all have handlers', () => {
  for (const spec of AGENT_SPECS) {
    assert.ok(getHandler(spec.id), `no handler for ${spec.id}`);
  }
});

test('all handlers return valid outputs', async () => {
  const runner = new AgentRunner({ handlers: HANDLERS });
  const samples = [
    ['recon-orchestrator', { target: 'x.com' }],
    ['module-worker', { chain: 'core-features' }],
    ['model-worker', { task: 'hypothesis' }],
    ['modeling-agent', { signals: [], endpoints: [] }],
    ['vuln-impact-judge', { finding: { id: 'F-1' } }],
    ['vuln-report-writer', { finding: { title: 'x' } }],
    ['corp-report-writer', { engagement: {}, findings: [] }],
    ['supervisor-loop', { event: { type: 'tick' } }],
  ];
  for (const [agentId, inputs] of samples) {
    const spec = getAgentSpec(agentId);
    const result = await runner.run(spec, inputs);
    assert.ok(result, `${agentId} returned no result`);
    assert.equal(typeof result, 'object', `${agentId} should return object`);
  }
});
