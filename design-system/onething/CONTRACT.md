# onething v2 API contract (shared by backend and frontend)

Existing generic REST stays: GET /api/all, POST/PATCH/DELETE /api/{table}[/{id}], header x-pin.
GET /api/all returns every table below too.

## New tables (schema.sql, CREATE IF NOT EXISTS)
- areas(id, name TEXT NOT NULL, color TEXT, sort INTEGER DEFAULT 0)
- goals(id, area_id INTEGER, title TEXT NOT NULL, why TEXT, done INTEGER DEFAULT 0)
- steps(id, goal_id INTEGER NOT NULL, title TEXT NOT NULL, done INTEGER DEFAULT 0, sort INTEGER DEFAULT 0)
- today(id, day TEXT NOT NULL, ref_kind TEXT, ref_id INTEGER, title TEXT NOT NULL, sort INTEGER DEFAULT 0, done INTEGER DEFAULT 0)
  ref_kind in 'task' | 'step' | 'dump' | null. Max 3 per day is enforced in the UI only.
- routines(id, name TEXT NOT NULL, part TEXT DEFAULT 'am')   part in 'am' | 'pm'
- rsteps(id, routine_id INTEGER NOT NULL, title TEXT NOT NULL, sort INTEGER DEFAULT 0)
- rlog(id, rstep_id INTEGER NOT NULL, day TEXT NOT NULL, UNIQUE(rstep_id, day))
- notes(id, area_id INTEGER, text TEXT NOT NULL)

## Migration (migrations/001_v2.sql, run once on remote)
- ALTER TABLE tasks ADD COLUMN area_id INTEGER;
- ALTER TABLE habits ADD COLUMN area_id INTEGER;
- Seed areas only if empty: Study, Health, Money, People, Self, Home.
Keep schema.sql CREATE statements for old tables unchanged; the migration adds columns. Fresh install = schema.sql then migration.

## Columns allowed in worker table map
- tasks gains area_id, habits gains area_id.
- rlog behaves like hlog: INSERT OR IGNORE, and DELETE /api/rlog?rstep_id=&day=.

## Cascades on DELETE
- goals -> steps. routines -> rsteps and their rlog. rsteps -> rlog.
- areas -> set area_id NULL on tasks, habits, goals, notes.

## AI (Workers AI, wrangler.toml [ai] binding = "AI", model @cf/meta/llama-3.3-70b-instruct-fp8-fast)
- POST /api/ai/breakdown  body {title}  -> {steps: ["...", ...]}  (3 to 7 tiny steps, each under 10 words, first one takes under 5 minutes)
- POST /api/ai/plan       body {day}    -> {picks: [{ref_kind, ref_id, title, why}]}  (max 3; server reads open tasks with due dates, open goal steps, open dump items)
- On AI failure: 502 {error}. Frontend shows a quiet message, never blocks.

## Bug fixes in worker
- Table lookup uses Object.hasOwn(T, t) so /api/constructor returns 404.
- POST rows that are null or non-objects return 400.
