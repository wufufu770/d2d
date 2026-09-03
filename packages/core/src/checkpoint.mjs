// @wufufu770/d2d-core - SQLite state checkpoint (v0.2.0: simple, MVP)
// Optional: better-sqlite3 if available; else in-memory fallback

import fs from 'node:fs';
import path from 'node:path';

// Lazy loader for better-sqlite3
let _Database = null;
let _sqliteCheckDone = false;
let _sqliteAvailable = false;

function _loadSqlite() {
  if (_sqliteCheckDone) return _sqliteAvailable;
  _sqliteCheckDone = true;
  try {
    // require so it can fail at runtime
    _Database = require('better-sqlite3');
    _sqliteAvailable = true;
  } catch {
    _sqliteAvailable = false;
  }
  return _sqliteAvailable;
}

const _memory = new Map();

export class CheckpointStore {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.useFile = dbPath ? _loadSqlite() : false;
    if (this.useFile) {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      this.db = new _Database(dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS checkpoints (
          thread_id TEXT NOT NULL,
          step INTEGER NOT NULL,
          state TEXT NOT NULL,
          ts INTEGER NOT NULL,
          PRIMARY KEY (thread_id, step)
        );
        CREATE INDEX IF NOT EXISTS idx_thread_step ON checkpoints(thread_id, step DESC);
      `);
      this.insertStmt = this.db.prepare(
        'INSERT OR REPLACE INTO checkpoints (thread_id, step, state, ts) VALUES (?, ?, ?, ?)'
      );
      this.getStmt = this.db.prepare(
        'SELECT state, ts, step FROM checkpoints WHERE thread_id = ? ORDER BY step DESC LIMIT 1'
      );
    }
  }

  put(threadId, state) {
    if (!this.useFile) {
      _memory.set(threadId, { state, ts: Date.now(), step: Date.now() });
      return;
    }
    this.insertStmt.run(threadId, Date.now(), JSON.stringify(state), Date.now());
  }

  get(threadId) {
    if (!this.useFile) {
      return _memory.get(threadId) || null;
    }
    const row = this.getStmt.get(threadId);
    if (!row) return null;
    return { state: JSON.parse(row.state), ts: row.ts, step: row.step };
  }

  list(threadId) {
    if (!this.useFile) {
      const result = _memory.get(threadId);
      return result ? [result] : [];
    }
    const stmt = this.db.prepare(
      'SELECT state, ts, step FROM checkpoints WHERE thread_id = ? ORDER BY step DESC'
    );
    return stmt.all(threadId).map(r => ({ state: JSON.parse(r.state), ts: r.ts, step: r.step }));
  }

  delete(threadId) {
    if (!this.useFile) {
      _memory.delete(threadId);
      return;
    }
    this.db.prepare('DELETE FROM checkpoints WHERE thread_id = ?').run(threadId);
  }

  close() {
    if (this.useFile && this.db) this.db.close();
  }
}

export function isPersistent() {
  return _loadSqlite();
}
