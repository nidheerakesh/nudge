import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = new URL('../', import.meta.url);
const P = (p) => fileURLToPath(new URL(p, root));
const USER_TABLES = ['courses', 'assessments', 'topics', 'assess_topics', 'tasks', 'blocks', 'sessions', 'habits', 'hlog', 'notes', 'prefs'];

function migrated() {
  const sql = execFileSync(process.execPath, [P('scripts/migrate-v2.mjs'), P('test/fixtures/v2.sql'), '--user', '1', '--today', '2026-11-08'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(P('migrations/v3/0001_init.sql'), 'utf8'));
  db.exec(sql);
  return { db, sql };
}

const cnt = (db, t, where = '1=1') => db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE ${where}`).get().n;

test('v2 export migrates to exact v3 counts', () => {
  const { db, sql } = migrated();
  assert.doesNotMatch(sql, /^(BEGIN|COMMIT|PRAGMA)/m);
  assert.equal(cnt(db, 'courses'), 2);
  assert.equal(cnt(db, 'assessments'), 2);
  assert.equal(cnt(db, 'assess_topics'), 2);
  assert.equal(cnt(db, 'topics'), 4);
  assert.equal(cnt(db, 'topics', "status = 'done'"), 1);
  assert.equal(cnt(db, 'tasks'), 4);
  assert.equal(cnt(db, 'blocks'), 2);
  assert.equal(cnt(db, 'blocks', "day < '2026-11-08'"), 0);
  assert.equal(cnt(db, 'sessions'), 2);
  assert.equal(cnt(db, 'sessions', "end_kind = 'abandoned'"), 1);
  assert.equal(cnt(db, 'habits'), 1);
  assert.equal(cnt(db, 'hlog'), 2);
  assert.equal(cnt(db, 'notes'), 4);
  assert.equal(cnt(db, 'prefs'), 1);
  assert.equal(cnt(db, 'prefs', "k = 'theme'"), 1);
});

test('every migrated row belongs to user 1', () => {
  const { db } = migrated();
  for (const t of USER_TABLES) assert.equal(cnt(db, t, 'user_id <> 1'), 0, t);
});

test('goal note keeps done and open steps', () => {
  const { db } = migrated();
  const body = db.prepare("SELECT body FROM notes WHERE title = 'Pass Algorithms'").get().body;
  assert.match(body, /- \[x\]/);
  assert.match(body, /- \[ \]/);
});

test('single quote in a title survives', () => {
  const { db } = migrated();
  assert.equal(cnt(db, 'tasks', "title = 'Email O''Brien about lab'"), 1);
  const title = db.prepare("SELECT title FROM tasks WHERE id = 2").get().title;
  assert.equal(title, "Email O'Brien about lab");
});

test('make-user.mjs passes syntax check', () => {
  execFileSync(process.execPath, ['--check', P('scripts/make-user.mjs')], { stdio: 'pipe' });
});
