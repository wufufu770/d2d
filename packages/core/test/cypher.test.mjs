// @wufufu770/d2d-core test - cypher
import { test } from 'node:test';
import assert from 'node:assert';
import { isReadOnly, validateCypherQuery, extractReferencedLabels, validateLabels, ALLOWED_LABELS } from '../src/cypher.mjs';

test('MATCH ... RETURN is read-only', () => {
  assert.ok(isReadOnly('MATCH (n:Engagement) RETURN n'));
  assert.ok(isReadOnly('MATCH (f:Finding) WHERE f.status = $status RETURN f'));
  assert.ok(isReadOnly('MATCH (e:Endpoint)-[r:AT]->(s:Signal_) RETURN e, r, s'));
});

test('WITH is read-only', () => {
  assert.ok(isReadOnly('MATCH (n) WITH n LIMIT 10 RETURN n'));
});

test('CREATE blocked', () => {
  assert.equal(isReadOnly('CREATE (n:Engagement) RETURN n'), false);
  assert.equal(isReadOnly('MATCH (n) CREATE (m:New)'), false);
});

test('DELETE blocked (without WHERE)', () => {
  assert.equal(isReadOnly('MATCH (n) DELETE n'), false);
  assert.equal(isReadOnly('MATCH (n:Finding) DELETE n'), false);
});

test('DELETE without WHERE blocked', () => {
  assert.equal(isReadOnly('MATCH (n:Finding) DELETE'), false);
});

test('SET blocked', () => {
  assert.equal(isReadOnly('MATCH (n:Finding) SET n.status = $s RETURN n'), false);
});

test('REMOVE blocked', () => {
  assert.equal(isReadOnly('MATCH (n) REMOVE n.prop RETURN n'), false);
});

test('DROP blocked', () => {
  assert.equal(isReadOnly('DROP INDEX my_index'), false);
  assert.equal(isReadOnly('CREATE INDEX foo ON :Bar(prop)'), false);
});

test('MERGE blocked (can be write)', () => {
  assert.equal(isReadOnly('MERGE (n:Engagement {id: $id}) RETURN n'), false);
});

test('CALL procedures blocked', () => {
  assert.equal(isReadOnly('CALL db.propertyKeys()'), false);
});

test('DETACH DELETE blocked', () => {
  assert.equal(isReadOnly('MATCH (n) DETACH DELETE n'), false);
});

test('empty / non-string input', () => {
  assert.equal(isReadOnly(''), false);
  assert.equal(isReadOnly(null), false);
  assert.equal(isReadOnly(undefined), false);
});

test('too-long query rejected', () => {
  const long = 'MATCH (n) RETURN n ' + ' '.repeat(20000);
  const result = validateCypherQuery(long);
  assert.equal(result.ok, false);
  assert.match(result.reason, /too long/i);
});

test('validateCypherQuery overall', () => {
  assert.equal(validateCypherQuery('MATCH (n) RETURN n').ok, true);
  assert.equal(validateCypherQuery('CREATE (n)').ok, false);
});

test('extractReferencedLabels', () => {
  const labels = extractReferencedLabels('MATCH (n:Engagement)-[r:AT]->(f:Finding) RETURN n, r, f');
  // node labels only (not relationship types)
  assert.ok(labels.includes('Engagement'));
  assert.ok(labels.includes('Finding'));
  assert.equal(labels.includes('AT'), false, 'AT is a relationship type, not a node label');
});

test('validateLabels: known OK', () => {
  const result = validateLabels('MATCH (n:Engagement) RETURN n');
  assert.equal(result.ok, true);
});

test('validateLabels: unknown rejected', () => {
  const result = validateLabels('MATCH (n:SecretLabel) RETURN n');
  assert.equal(result.ok, false);
  assert.match(result.reason, /SecretLabel/);
});

test('ALLOWED_LABELS contains expected graphd schema', () => {
  assert.ok(ALLOWED_LABELS.includes('Engagement'));
  assert.ok(ALLOWED_LABELS.includes('Endpoint'));
  assert.ok(ALLOWED_LABELS.includes('Signal_'));
  assert.ok(ALLOWED_LABELS.includes('Hypothesis'));
  assert.ok(ALLOWED_LABELS.includes('Finding'));
  assert.ok(ALLOWED_LABELS.includes('AgentIdentity'));
});
