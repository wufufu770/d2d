// @wufufu770/d2d-core - Finding 7-态状态机

// 7 states: candidate → triaged → verified → isolated → reported → accepted → rejected
export const FINDING_STATES = [
  'candidate',
  'triaged',
  'verified',
  'isolated',
  'reported',
  'accepted',
  'rejected',
];

// Allowed transitions (whitelist)
const TRANSITIONS = {
  candidate: ['triaged', 'rejected'],
  triaged:   ['verified', 'rejected', 'candidate'],  // back to candidate if re-classify
  verified:  ['isolated', 'rejected', 'triaged'],    // back if re-triage needed
  isolated:  ['reported', 'rejected', 'verified'],
  reported:  ['accepted', 'rejected', 'verified'],
  accepted:  ['reported'],  // reopen if re-reported
  rejected:  ['candidate'],  // reopen if re-found
};

export function canTransition(from, to) {
  if (!FINDING_STATES.includes(from)) return false;
  if (!FINDING_STATES.includes(to)) return false;
  if (from === to) return false;
  return TRANSITIONS[from]?.includes(to) || false;
}

export function transitionFinding(finding, to, actor, reason = '') {
  if (!canTransition(finding.status, to)) {
    throw new Error(`invalid transition: ${finding.status} → ${to}`);
  }
  const now = Date.now() / 1000;
  return {
    ...finding,
    status: to,
    last_transition: now,
    transition_actor: actor,
    transition_reason: reason,
    history: [
      ...(finding.history || []),
      { from: finding.status, to, at: now, actor, reason },
    ],
  };
}

export function createFinding(seed = {}) {
  const id = seed.id || 'F-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return {
    id,
    status: 'candidate',
    severity: seed.severity || 'P3',
    title: seed.title || '',
    evidence: seed.evidence || null,
    repro: seed.repro || null,
    category: seed.category || null,
    created_at: Date.now() / 1000,
    last_transition: Date.now() / 1000,
    transition_actor: 'system',
    transition_reason: 'initial creation',
    history: [],
    ...seed,
  };
}

export function isTerminal(state) {
  return state === 'accepted' || state === 'rejected';
}

export function progressPercent(state) {
  const map = {
    candidate: 14, triaged: 28, verified: 42, isolated: 57,
    reported: 71, accepted: 100, rejected: 100,
  };
  return map[state] || 0;
}
