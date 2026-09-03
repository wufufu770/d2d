// @wufufu770/d2d-core - AgentSpec (v0.2.0: 12 agent MVP)
import { z } from 'zod';

// ===== Zod schemas =====

export const AgentModeSchema = z.enum(['process', 'in-process', 'async-process']);

export const AgentRoleSchema = z.enum([
  'orchestrator', 'collector', 'discovery', 'model', 'deep',
  'creative', 'judge', 'report', 'supervisor', 'plan', 'gate',
]);

export const RingSchema = z.enum(['ring0', 'ring1', 'ring2', 'ring3', 'all']);

export const BudgetSchema = z.object({
  maxLLMCalls: z.number().int().nonnegative(),
  maxWallMs: z.number().int().nonnegative(),
  maxToolCalls: z.number().int().nonnegative(),
});

export const AgentSpecSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  label: z.string().min(1),
  role: AgentRoleSchema,
  ring: RingSchema,
  mode: AgentModeSchema,
  tokens: z.number().int().min(1000).max(200000),
  triggers: z.array(z.string()),
  promptFile: z.string().min(1),
  skills: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  budget: BudgetSchema,
  inputs: z.record(z.any()).default({}),
  outputs: z.record(z.any()).default({}),
  nextOn: z.array(z.string()).default([]),
  fallbackNext: z.array(z.string()).default([]),
  deps: z.array(z.string()).default([]),
  isSupervisor: z.boolean().default(false),
});

// ===== 12 Agent Specs (v0.2.0 MVP) =====

export const AGENT_SPECS = [
  // ring1: discovery
  {
    id: 'recon-orchestrator',
    label: '侦察调度器',
    role: 'orchestrator',
    ring: 'ring1',
    mode: 'process',
    tokens: 32000,
    triggers: ['/pentest', 'P2P_INPROCESS=1'],
    promptFile: 'agents/recon-orchestrator/prompt.md',
    skills: ['pentest'],
    tools: ['Bash', 'WebFetch', 'WebSearch', 'Read', 'Grep', 'Glob', 'TodoWrite',
            'dsh.target.add', 'dsh.target.list', 'dsh.osint.scan'],
    budget: { maxLLMCalls: 100, maxWallMs: 30 * 60_000, maxToolCalls: 250 },
    inputs: { target: 'string', scope: 'string?', instances: 'number?' },
    outputs: { engagement_id: 'string', chains: 'ChainSpec[]' },
    nextOn: ['supervisor-loop'],
    fallbackNext: ['recon-orchestrator'],
    isSupervisor: false,
    deps: [],
  },
  {
    id: 'enterprise-collector',
    label: '企业情报收集',
    role: 'collector',
    ring: 'ring1',
    mode: 'process',
    tokens: 32000,
    triggers: ['kind=enterprise|mixed'],
    promptFile: 'agents/enterprise-collector/prompt.md',
    skills: ['osint-corporate', 'osint-riskbird', 'osint-icp'],
    tools: ['Bash', 'WebFetch', 'dsh.osint.query'],
    budget: { maxLLMCalls: 60, maxWallMs: 10 * 60_000, maxToolCalls: 100 },
    inputs: { seed: 'string' },
    outputs: { profile: 'CorporateProfile', subs: 'Subsidiary[]', rootDomains: 'string[]' },
    nextOn: ['supervisor-loop'],
    fallbackNext: ['recon-orchestrator'],
    isSupervisor: false,
    deps: ['recon-orchestrator'],
  },
  {
    id: 'module-worker',
    label: '通用执行 worker',
    role: 'discovery',
    ring: 'ring1',
    mode: 'process',
    tokens: 16000,
    triggers: ['chain=core-features|auth|api-surface|tech-stack|business-logic'],
    promptFile: 'agents/module-worker/prompt.md',
    skills: [],
    tools: ['Bash', 'Read', 'Grep', 'Glob', 'WebFetch', 'TodoWrite',
            'dsh.endpoint.add', 'dsh.signal.write'],
    budget: { maxLLMCalls: 60, maxWallMs: 20 * 60_000, maxToolCalls: 120 },
    inputs: { chain: 'string', target: 'string', scope: 'string' },
    outputs: { endpoints: 'Endpoint[]', signals: 'Signal[]' },
    nextOn: ['supervisor-loop'],
    fallbackNext: ['recon-orchestrator'],
    isSupervisor: false,
    deps: ['recon-orchestrator'],
  },
  // model (all rings)
  {
    id: 'model-worker',
    label: '模型推理 worker',
    role: 'model',
    ring: 'all',
    mode: 'in-process',
    tokens: 16000,
    triggers: ['task=hypothesis|plan|judge|summarize'],
    promptFile: 'agents/model-worker/prompt.md',
    skills: [],
    tools: [],
    budget: { maxLLMCalls: 30, maxWallMs: 8 * 60_000, maxToolCalls: 0 },
    inputs: { task: 'object', payload: 'object' },
    outputs: { result: 'object' },
    nextOn: [],
    fallbackNext: [],
    isSupervisor: false,
    deps: [],
  },
  // ring1 → ring2 transition
  {
    id: 'modeling-agent',
    label: '假设生成',
    role: 'discovery',
    ring: 'ring1',
    mode: 'in-process',
    tokens: 8000,
    triggers: ['signal-threshold=10'],
    promptFile: 'agents/modeling-agent/prompt.md',
    skills: ['strategy-pattern-match'],
    tools: ['TodoWrite'],
    budget: { maxLLMCalls: 15, maxWallMs: 3 * 60_000, maxToolCalls: 5 },
    inputs: { signals: 'Signal[]', endpoints: 'Endpoint[]' },
    outputs: { hypotheses: 'Hypothesis[]' },
    nextOn: ['exploration-loop'],
    fallbackNext: ['supervisor-loop'],
    isSupervisor: false,
    deps: ['module-worker'],
  },
  // ring2: deep
  {
    id: 'exploration-loop',
    label: '探索循环',
    role: 'deep',
    ring: 'ring2',
    mode: 'process',
    tokens: 16000,
    triggers: ['hypothesis-status=open'],
    promptFile: 'agents/exploration-loop/prompt.md',
    skills: [],
    tools: ['Bash', 'Read', 'Grep', 'WebFetch',
            'dsh.endpoint.add', 'dsh.signal.write', 'dsh.finding.write'],
    budget: { maxLLMCalls: 80, maxWallMs: 25 * 60_000, maxToolCalls: 200 },
    inputs: { hypothesis: 'Hypothesis' },
    outputs: { newSignals: 'Signal[]', newEndpoints: 'Endpoint[]' },
    nextOn: ['attack-loop'],
    fallbackNext: ['supervisor-loop'],
    isSupervisor: false,
    deps: ['modeling-agent'],
  },
  {
    id: 'attack-loop',
    label: '攻击循环',
    role: 'deep',
    ring: 'ring2',
    mode: 'process',
    tokens: 16000,
    triggers: ['signal=positive-confirm'],
    promptFile: 'agents/attack-loop/prompt.md',
    skills: [],
    tools: ['Bash', 'Read', 'Grep', 'WebFetch',
            'dsh.finding.write', 'dsh.finding.transition'],
    budget: { maxLLMCalls: 100, maxWallMs: 30 * 60_000, maxToolCalls: 250 },
    inputs: { signal: 'Signal' },
    outputs: { finding: 'Finding' },
    nextOn: ['vuln-impact-judge'],
    fallbackNext: ['supervisor-loop'],
    isSupervisor: false,
    deps: ['exploration-loop'],
  },
  {
    id: 'deep-dive-hunter',
    label: '高危专攻',
    role: 'deep',
    ring: 'ring3',
    mode: 'process',
    tokens: 16000,
    triggers: ['finding-severity=P0|P1'],
    promptFile: 'agents/deep-dive-hunter/prompt.md',
    skills: [],
    tools: ['Bash', 'Read', 'Grep', 'WebFetch', 'WebSearch',
            'dsh.finding.write', 'dsh.finding.attach-evidence'],
    budget: { maxLLMCalls: 120, maxWallMs: 50 * 60_000, maxToolCalls: 350 },
    inputs: { finding: 'Finding' },
    outputs: { pocBundle: 'PoCBundle', evidence: 'Evidence[]' },
    nextOn: ['vuln-impact-judge'],
    fallbackNext: ['supervisor-loop'],
    isSupervisor: false,
    deps: ['attack-loop'],
  },
  {
    id: 'vuln-impact-judge',
    label: '影响研判',
    role: 'judge',
    ring: 'ring3',
    mode: 'in-process',
    tokens: 8000,
    triggers: ['finding-status=verified'],
    promptFile: 'agents/vuln-impact-judge/prompt.md',
    skills: [],
    tools: ['TodoWrite', 'Read'],
    budget: { maxLLMCalls: 8, maxWallMs: 2 * 60_000, maxToolCalls: 3 },
    inputs: { finding: 'Finding', engagement_context: 'object' },
    outputs: { impact: 'object', cvss_v3: 'object', confidence: 'string' },
    nextOn: ['vuln-report-writer'],
    fallbackNext: ['supervisor-loop'],
    isSupervisor: false,
    deps: ['attack-loop', 'deep-dive-hunter'],
  },
  {
    id: 'vuln-report-writer',
    label: '单条报告',
    role: 'report',
    ring: 'ring3',
    mode: 'in-process',
    tokens: 8000,
    triggers: ['impact-judged'],
    promptFile: 'agents/vuln-report-writer/prompt.md',
    skills: [],
    tools: ['TodoWrite', 'Read'],
    budget: { maxLLMCalls: 5, maxWallMs: 2 * 60_000, maxToolCalls: 2 },
    inputs: { finding: 'Finding', impact: 'object' },
    outputs: { reportMd: 'string' },
    nextOn: ['supervisor-loop'],
    fallbackNext: ['recon-orchestrator'],
    isSupervisor: false,
    deps: ['vuln-impact-judge'],
  },
  {
    id: 'corp-report-writer',
    label: '企业报告',
    role: 'report',
    ring: 'ring0',
    mode: 'in-process',
    tokens: 16000,
    triggers: ['engagement-status=closing', '/pentest-report'],
    promptFile: 'agents/corp-report-writer/prompt.md',
    skills: [],
    tools: ['TodoWrite', 'Bash', 'Read'],
    budget: { maxLLMCalls: 30, maxWallMs: 15 * 60_000, maxToolCalls: 50 },
    inputs: { engagement: 'Engagement', findings: 'Finding[]' },
    outputs: { reportHtml: 'string', reportPdf: 'string' },
    nextOn: ['supervisor-loop'],
    fallbackNext: ['recon-orchestrator'],
    isSupervisor: false,
    deps: ['vuln-report-writer'],
  },
  // ring0: supervisor
  {
    id: 'supervisor-loop',
    label: 'Ring Supervisor',
    role: 'supervisor',
    ring: 'ring0',
    mode: 'in-process',
    tokens: 4000,
    triggers: ['tick=30s', 'worker-event', 'finding-event', 'engagement-event'],
    promptFile: 'agents/supervisor-loop/prompt.md',
    skills: [],
    tools: ['dsh.engagement.*', 'dsh.worker.*', 'dsh.finding.transition'],
    budget: { maxLLMCalls: 0, maxWallMs: 60 * 60_000, maxToolCalls: 1000 },
    inputs: { event: 'object' },
    outputs: { decision: 'RoutingDecision' },
    nextOn: [],
    fallbackNext: ['recon-orchestrator'],
    isSupervisor: true,
    deps: [],
  },
];

// ===== Loader =====

export function loadAgentSpecs() {
  return AGENT_SPECS;
}

export function getAgentSpec(id) {
  return AGENT_SPECS.find(s => s.id === id) || null;
}

export function validateAgentSpec(spec) {
  return AgentSpecSchema.safeParse(spec);
}

export function validateAllAgentSpecs() {
  const errors = [];
  for (const spec of AGENT_SPECS) {
    const result = validateAgentSpec(spec);
    if (!result.success) {
      errors.push({ id: spec.id, errors: result.error.errors });
    }
  }
  return errors;
}

// ===== Dependency cycle detection =====
export function detectCycles() {
  const idToSpec = new Map(AGENT_SPECS.map(s => [s.id, s]));
  const visited = new Set();
  const stack = new Set();
  const cycles = [];

  function dfs(id, path) {
    if (stack.has(id)) {
      const cycleStart = path.indexOf(id);
      cycles.push([...path.slice(cycleStart), id]);
      return;
    }
    if (visited.has(id)) return;
    visited.add(id);
    stack.add(id);
    const spec = idToSpec.get(id);
    if (spec) {
      for (const dep of spec.deps) {
        dfs(dep, [...path, id]);
      }
    }
    stack.delete(id);
  }

  for (const spec of AGENT_SPECS) {
    if (!visited.has(spec.id)) {
      dfs(spec.id, []);
    }
  }
  return cycles;
}

// ===== NextOn resolution =====
export function resolveNextOn(spec) {
  return [...spec.nextOn, ...spec.fallbackNext];
}
