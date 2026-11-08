import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

function stmt(db, sql, args = []) {
  return {
    bind: (...a) => stmt(db, sql, a),
    first(col) {
      const row = db.prepare(sql).get(...args);
      if (!row) return Promise.resolve(null);
      return Promise.resolve(col ? row[col] : { ...row });
    },
    all() {
      const rows = db.prepare(sql).all(...args).map((r) => ({ ...r }));
      return Promise.resolve({ results: rows });
    },
    run() {
      const r = db.prepare(sql).run(...args);
      return Promise.resolve({ meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } });
    },
  };
}

export function d1(path = ':memory:') {
  const db = new DatabaseSync(path);
  return {
    prepare: (sql) => stmt(db, sql),
    async batch(arr) {
      const out = [];
      db.exec('BEGIN');
      try {
        for (const s of arr) out.push(await s.run());
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      return out;
    },
    exec: (sql) => db.exec(sql),
  };
}

export function v3(db) {
  db.exec(readFileSync(new URL('../migrations/v3/0001_init.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/v3/0002_town.sql', import.meta.url), 'utf8'));
  return db;
}
