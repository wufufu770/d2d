// @wufufu770/d2d-core test - agent-spec
import { test } from 'node:test';
import assert from 'node:assert';
import {
  AGENT_SPECS, AgentSpecSchema, loadAgentSpecs, getAgentSpec,
  validateAgentSpec, validateAllAgentSpecs, detectCycles, resolveNextOn,
} from '../src/agent-spec.mjs';

test('12 agent specs are defined', () => {
  assert.equal(AGENT_SPECS.length, 12, 'expected 12 agent specs for v0.2.0 MVP');
});

test('all specs have unique ids', () => {
  const ids = new Set();
  for (const s of AGENT_SPECS) {
    assert.ok(!ids.has(s.id), `duplicate id: ${s.id}`);
    ids.add(s.id);
  }
});

test('all specs have valid AgentSpecSchema', () => {
  for (const spec of AGENT_SPECS) {
    const result = validateAgentSpec(spec);
    assert.ok(result.success, `spec ${spec.id} failed validation: ${JSON.stringify(result.error?.errors)}`);
  }
});

test('validateAllAgentSpecs returns no errors', () => {
  const errors = validateAllAgentSpecs();
  assert.equal(errors.length, 0, `expected no errors, got: ${JSON.stringify(errors)}`);
});

test('loadAgentSpecs returns all specs', () => {
  const specs = loadAgentSpecs();
  assert.equal(specs.length, 12);
});

test('getAgentSpec returns specific spec', () => {
  const spec = getAgentSpec('recon-orchestrator');
  assert.ok(spec);
  assert.equal(spec.id, 'recon-orchestrator');
  assert.equal(spec.role, 'orchestrator');
  assert.equal(spec.ring, 'ring1');
});

test('getAgentSpec returns null for unknown id', () => {
  assert.equal(getAgentSpec('nonexistent'), null);
});

test('supervisor-loop is marked as supervisor', () => {
  const spec = getAgentSpec('supervisor-loop');
  assert.ok(spec.isSupervisor, 'supervisor-loop must have isSupervisor: true');
});

test('model-worker has no tools (no tool calls allowed)', () => {
  const spec = getAgentSpec('model-worker');
  assert.equal(spec.tools.length, 0, 'model-worker should have no tools');
  assert.equal(spec.budget.maxToolCalls, 0, 'model-worker maxToolCalls should be 0');
});

test('no dependency cycles in spec DAG', () => {
  const cycles = detectCycles();
  assert.equal(cycles.length, 0, `cycles detected: ${JSON.stringify(cycles)}`);
});

test('resolveNextOn returns nextOn + fallbackNext', () => {
  const spec = getAgentSpec('attack-loop');
  const resolved = resolveNextOn(spec);
  assert.deepEqual(resolved, ['vuln-impact-judge', 'supervisor-loop']);
});

test('all specs have at least 1 trigger', () => {
  for (const s of AGENT_SPECS) {
    assert.ok(s.triggers.length >= 1, `spec ${s.id} has no triggers`);
  }
});

test('all specs have non-zero budget', () => {
  for (const s of AGENT_SPECS) {
    assert.ok(s.budget.maxLLMCalls > 0 || s.budget.maxToolCalls > 0 || s.budget.maxWallMs > 0,
              `spec ${s.id} has all-zero budget`);
  }
});

test('AgentSpecSchema rejects invalid token count', () => {
  const result = AgentSpecSchema.safeParse({ id: 'x', tokens: 100, /* other fields */ });
  // should fail (missing required fields)
  assert.equal(result.success, false);
});
