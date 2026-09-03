// @wufufu770/d2d-core test - checkpoint
import { test } from 'node:test';
import assert from 'node:assert';
import { CheckpointStore, isPersistent } from '../src/checkpoint.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('CheckpointStore: in-memory basic put/get', () => {
  const store = new CheckpointStore();
  store.put('thread-1', { step: 1, data: 'hello' });
  const result = store.get('thread-1');
  assert.ok(result, 'should have a result');
  assert.deepEqual(result.state, { step: 1, data: 'hello' });
});

test('CheckpointStore: get returns null for unknown thread', () => {
  const store = new CheckpointStore();
  assert.equal(store.get('unknown'), null);
});

test('CheckpointStore: list returns history', () => {
  const store = new CheckpointStore();
  store.put('thread-1', { step: 1 });
  store.put('thread-1', { step: 2 });
  const list = store.list('thread-1');
  assert.ok(list.length >= 1);
});

test('CheckpointStore: delete', () => {
  const store = new CheckpointStore();
  store.put('thread-1', { x: 1 });
  store.delete('thread-1');
  assert.equal(store.get('thread-1'), null);
});

test('CheckpointStore: SQLite persistence (if available)', () => {
  if (!isPersistent()) {
    // better-sqlite3 not installed — skip SQLite-specific test
    return;
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-test-'));
  try {
    const dbPath = path.join(tmpDir, 'test.db');
    const store1 = new CheckpointStore(dbPath);
    store1.put('thread-A', { data: 'persistent' });
    store1.close();

    const store2 = new CheckpointStore(dbPath);
    const result = store2.get('thread-A');
    assert.ok(result, 'should retrieve from persisted DB');
    assert.deepEqual(result.state, { data: 'persistent' });
    store2.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('isPersistent is a boolean', () => {
  assert.equal(typeof isPersistent(), 'boolean');
});
