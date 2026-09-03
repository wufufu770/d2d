// @wufufu770/d2d-core - Cypher 只读校验
// V-07: validate that queries are read-only (no DDL, no DROP, no DELETE without WHERE)

const FORBIDDEN_KEYWORDS = [
  // DDL
  'CREATE', 'DROP', 'ALTER', 'TRUNCATE',
  // DML destructive
  'DELETE',  // without WHERE context — checked semantically below
  'SET ',  // SET property updates are write
  'REMOVE',  // Cypher delete
  'MERGE',  // can be both, allow only with constraints
  'CALL',  // procedures
  'CREATE INDEX', 'DROP INDEX',
];

const DESTRUCTIVE_NO_WHERE = [
  /DELETE\s+[^[]*\b(?!WHERE)/i,  // DELETE without WHERE
  /DETACH\s+DELETE/i,             // DETACH DELETE = delete nodes+edges
  /REMOVE\s+[a-z]/i,              // REMOVE property
];

export function isReadOnly(cypher) {
  if (!cypher || typeof cypher !== 'string') return false;
  const upper = cypher.toUpperCase();
  // Check for write keywords
  for (const kw of FORBIDDEN_KEYWORDS) {
    if (upper.includes(kw)) return false;
  }
  // Check for destructive patterns
  for (const pat of DESTRUCTIVE_NO_WHERE) {
    if (pat.test(cypher)) return false;
  }
  // Must start with read patterns: MATCH / RETURN
  const trimmed = cypher.trim();
  if (!trimmed.toUpperCase().startsWith('MATCH') &&
      !trimmed.toUpperCase().startsWith('RETURN') &&
      !trimmed.toUpperCase().startsWith('WITH')) {
    return false;
  }
  return true;
}

export function validateCypherQuery(cypher) {
  if (!cypher || typeof cypher !== 'string') {
    return { ok: false, reason: 'empty or invalid type' };
  }
  if (cypher.length > 10000) {
    return { ok: false, reason: 'query too long (>10KB)' };
  }
  if (!isReadOnly(cypher)) {
    return { ok: false, reason: 'query contains write keywords or is not a read query' };
  }
  return { ok: true };
}

// Extract node labels from MATCH clause (for whitelist check)
export function extractReferencedLabels(cypher) {
  const labelRe = /\(\s*[a-zA-Z_][\w]*\s*:\s*([A-Z][\w]*)/g;
  const labels = new Set();
  let m;
  while ((m = labelRe.exec(cypher)) !== null) {
    labels.add(m[1]);
  }
  return [...labels];
}

// Whitelist of allowed labels (graphd schema)
export const ALLOWED_LABELS = [
  'Engagement', 'Endpoint', 'Signal_', 'Hypothesis',
  'Finding', 'AgentIdentity', 'WorkerIdentity', 'ExperienceWeight',
];

export function validateLabels(cypher) {
  const referenced = extractReferencedLabels(cypher);
  const unknown = referenced.filter(l => !ALLOWED_LABELS.includes(l));
  if (unknown.length > 0) {
    return { ok: false, reason: `unknown labels: ${unknown.join(', ')}` };
  }
  return { ok: true };
}
