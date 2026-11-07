'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_VERSION = 4;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  character TEXT NOT NULL DEFAULT '{}',
  setup_done INTEGER NOT NULL DEFAULT 0,
  finalized_until TEXT,
  created_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Dias de descanso semanais fixos, versionados (mudanças valem a partir do próximo ciclo).
CREATE TABLE IF NOT EXISTS rest_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  effective_from TEXT NOT NULL UNIQUE,
  weekdays TEXT NOT NULL
);
-- Dias de descanso avulsos. Só reduzem a meta semanal se cadastrados ANTES do dia.
CREATE TABLE IF NOT EXISTS rest_days (
  date TEXT PRIMARY KEY,
  reason TEXT,
  created_on TEXT NOT NULL
);

-- Metas do usuário. Tipo, atributos e XP vêm do catálogo do sistema.
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  label TEXT,
  description TEXT,
  objective TEXT,
  notes TEXT,
  criteria TEXT NOT NULL DEFAULT '[]',
  deadline TEXT,
  params TEXT NOT NULL DEFAULT '{}',
  created_on TEXT NOT NULL,
  archived_on TEXT,
  achieved_on TEXT,
  ai_score REAL,
  ai_evaluation TEXT,
  source_text TEXT,            -- frase original do usuário ("Quero ler 30 páginas por dia")
  weights TEXT,                -- distribuição de XP por atributo definida pela análise (sistema/IA), validada no servidor
  analysis TEXT,               -- análise estruturada da meta (clareza, dificuldade, atributos e justificativas)
  analysis_source TEXT,        -- 'ia' | 'local'
  xp_factor REAL NOT NULL DEFAULT 1, -- ajuste de complexidade (0,9–1,1) definido pela análise
  custom_fields TEXT NOT NULL DEFAULT '[]', -- campos personalizados de registro
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Cada alteração cria uma nova versão com data de vigência (histórico auditável).
CREATE TABLE IF NOT EXISTS goal_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  effective_from TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('daily','times_per_week','weekly','monthly','total')),
  target REAL NOT NULL,
  unit TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'min' CHECK (mode IN ('min','max','range')),
  days TEXT NOT NULL DEFAULT '[]',
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (goal_id, effective_from)
);

-- Registros diários de metas manuais e marcações (não cumpri / exceção) de qualquer meta.
CREATE TABLE IF NOT EXISTS day_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('value','missed','excused')),
  value REAL,
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (goal_id, date)
);
CREATE INDEX IF NOT EXISTS idx_entries_date ON day_entries(date);

-- Livro-razão de XP (ukey impede recompensas duplicadas).
CREATE TABLE IF NOT EXISTS xp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attribute TEXT NOT NULL,
  amount INTEGER NOT NULL,
  multiplier REAL NOT NULL DEFAULT 1,
  source TEXT NOT NULL,
  source_id INTEGER,
  day TEXT NOT NULL,
  reason TEXT,
  ukey TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_xp_day ON xp_events(day);
CREATE INDEX IF NOT EXISTS idx_xp_source ON xp_events(source, source_id);

CREATE TABLE IF NOT EXISTS coin_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount INTEGER NOT NULL,
  source TEXT NOT NULL,
  source_id INTEGER,
  day TEXT NOT NULL,
  reason TEXT,
  ukey TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ciclo semanal (segunda a domingo): Boss 1, Boss 2 e Boss Final.
CREATE TABLE IF NOT EXISTS cycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT NOT NULL UNIQUE,
  week_end TEXT NOT NULL,
  boss1_goal INTEGER REFERENCES goals(id),
  boss2_goal INTEGER REFERENCES goals(id),
  battles TEXT NOT NULL DEFAULT '{}',
  report TEXT,
  ai_report TEXT
);
-- Registro de alterações excepcionais dentro de um ciclo.
CREATE TABLE IF NOT EXISTS cycle_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id INTEGER NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  goal_id INTEGER,
  reason TEXT NOT NULL,
  created_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Registros detalhados (campos em JSON, adaptados a cada tipo de meta).
CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  goal_id INTEGER REFERENCES goals(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  time TEXT,
  data TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_records_kind ON records(kind, date);
CREATE INDEX IF NOT EXISTS idx_records_goal ON records(goal_id, date);

-- Conversas com a IA (aba Detalhes) e relatórios gerados.
CREATE TABLE IF NOT EXISTS ai_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ai_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ai_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  period_days INTEGER NOT NULL,
  stats TEXT NOT NULL,
  ai TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS achievements (
  key TEXT PRIMARY KEY,
  unlocked_at TEXT NOT NULL,
  day TEXT NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS inventory (
  item_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  acquired_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Recompensas sorteadas pelo servidor ao derrotar chefes (uma por batalha; nunca re-sorteadas).
CREATE TABLE IF NOT EXISTS reward_drops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_id INTEGER NOT NULL,
  which TEXT NOT NULL,
  dropped INTEGER NOT NULL,
  rarity TEXT,
  skin TEXT,
  coins INTEGER NOT NULL DEFAULT 0,
  roll INTEGER NOT NULL,
  detail TEXT,
  created_on TEXT NOT NULL,
  UNIQUE (cycle_id, which)
);
-- Cache de análises de metas: metas equivalentes recebem a mesma análise (coerência e custo).
CREATE TABLE IF NOT EXISTS goal_analysis_cache (
  key TEXT PRIMARY KEY,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const LEGACY_SCHEMA = `
CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  muscle_group TEXT
);
CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  modality TEXT NOT NULL DEFAULT 'musculacao',
  duration_min INTEGER,
  distance_km REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_workouts_date ON workouts(date);
CREATE TABLE IF NOT EXISTS workout_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  set_no INTEGER NOT NULL,
  reps INTEGER NOT NULL,
  weight REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'custom',
  aggregation TEXT NOT NULL DEFAULT 'sum' CHECK (aggregation IN ('sum','last')),
  direction TEXT NOT NULL DEFAULT 'min' CHECK (direction IN ('min','max','none')),
  daily_target REAL,
  weekly_target REAL,
  builtin INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS metric_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric_id INTEGER NOT NULL REFERENCES metrics(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  value REAL NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_metric_logs ON metric_logs(metric_id, date);

CREATE TABLE IF NOT EXISTS sleep_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  bed_time TEXT,
  wake_time TEXT,
  hours REAL NOT NULL,
  quality INTEGER,
  notes TEXT
);

`;


function decorate(db) {
  db.tx = (fn) => {
    if (db.inTx) return fn();
    db.exec('BEGIN IMMEDIATE');
    db.inTx = true;
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* já encerrada */ }
      throw e;
    } finally { db.inTx = false; }
  };
  db.one = (sql, ...p) => db.prepare(sql).get(...p);
  db.all = (sql, ...p) => db.prepare(sql).all(...p);
  db.run = (sql, ...p) => db.prepare(sql).run(...p);
  return db;
}

function isV1(file) {
  if (file === ':memory:' || !fs.existsSync(file)) return false;
  const old = new DatabaseSync(file);
  try {
    const cols = old.prepare("SELECT name FROM pragma_table_info('activities')").all().map((r) => r.name);
    const hasMeta = old.prepare("SELECT 1 FROM sqlite_master WHERE name = 'meta'").get();
    return cols.includes('attributes') && !hasMeta;
  } finally { old.close(); }
}

/**
 * Migra um banco da Alpha 1.0 para o novo modelo.
 * Mantém perfil, aparência, XP e moedas já conquistados, conquistas, inventário,
 * treinos, métricas, sono e dias de descanso. Atividades/metas antigas (com atributos
 * escolhidos pelo usuário) não são convertidas: o novo sistema define essas regras.
 */
function migrateV1(file) {
  const backup = file.replace(/\.db$/, '') + `.v1-backup-${Date.now()}.db`;
  fs.renameSync(file, backup);
  for (const ext of ['-wal', '-shm']) if (fs.existsSync(file + ext)) fs.renameSync(file + ext, backup + ext);
  const old = new DatabaseSync(backup);
  const db = decorate(new DatabaseSync(file));
  db.exec(SCHEMA);
  db.exec(LEGACY_SCHEMA);
  const copy = (table, cols, map = (r) => r) => {
    const rows = old.prepare(`SELECT * FROM ${table}`).all();
    const st = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
    for (const r of rows) { const m = map(r); st.run(...cols.map((c) => m[c] ?? null)); }
  };
  db.tx(() => {
    copy('profile', ['id', 'name', 'timezone', 'character', 'setup_done', 'created_on', 'created_at'], (r) => ({ ...r, setup_done: 0, created_on: (r.created_at || '').slice(0, 10) }));
    const p = old.prepare('SELECT rest_weekdays, created_at FROM profile').get();
    if (p && p.rest_weekdays && p.rest_weekdays !== '[]') db.run('INSERT INTO rest_rules (effective_from, weekdays) VALUES (?, ?)', '0000-01-01', p.rest_weekdays);
    copy('rest_days', ['date', 'reason', 'created_on'], (r) => ({ ...r, created_on: '0000-01-01' }));
    copy('xp_events', ['id', 'attribute', 'amount', 'multiplier', 'source', 'source_id', 'day', 'reason', 'ukey', 'created_at'], (r) => ({ ...r, source: `v1_${r.source}`, ukey: `v1:${r.ukey}` }));
    copy('coin_events', ['id', 'amount', 'source', 'source_id', 'day', 'reason', 'ukey', 'created_at'], (r) => ({ ...r, source: `v1_${r.source}`, ukey: `v1:${r.ukey}` }));
    copy('exercises', ['id', 'name', 'muscle_group']);
    copy('workouts', ['id', 'date', 'modality', 'duration_min', 'notes', 'created_at'], (r) => ({ ...r, modality: 'musculacao' }));
    copy('workout_sets', ['id', 'workout_id', 'exercise_id', 'set_no', 'reps', 'weight']);
    copy('metrics', ['id', 'key', 'name', 'unit', 'category', 'aggregation', 'direction', 'daily_target', 'weekly_target', 'builtin']);
    copy('metric_logs', ['id', 'metric_id', 'date', 'value', 'note', 'created_at']);
    copy('sleep_logs', ['id', 'date', 'bed_time', 'wake_time', 'hours', 'quality', 'notes']);
    copy('achievements', ['key', 'unlocked_at', 'day', 'seen']);
    copy('inventory', ['item_id', 'source', 'acquired_at']);
  });
  old.close();
  return { db, backup };
}

function columns(db, table) { return db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all().map((r) => r.name); }
function tableExists(db, table) { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(table); }

/**
 * Migração v2 (Alpha 1.1) → v3 (EvoRPG): converte treinos, métricas, sono e valores
 * manuais em registros detalhados; adapta aparência e inventário ao novo catálogo.
 * Nenhum XP, moeda, conquista ou histórico de metas é perdido.
 */
function migrateV2toV3(db) {
  const C = require('./catalog');
  for (const [col, ddl] of [['description', 'TEXT'], ['objective', 'TEXT'], ['notes', 'TEXT'], ['criteria', "TEXT NOT NULL DEFAULT '[]'"], ['deadline', 'TEXT'], ['params', "TEXT NOT NULL DEFAULT '{}'"], ['achieved_on', 'TEXT']]) {
    if (!columns(db, 'goals').includes(col)) db.exec(`ALTER TABLE goals ADD COLUMN ${col} ${ddl}`);
  }
  const ins = db.prepare('INSERT INTO records (kind, goal_id, date, time, data, note) VALUES (?,?,?,?,?,?)');
  db.tx(() => {
    // Recria goal_versions para aceitar o período "total" (até o prazo).
    const ddl = db.one("SELECT sql FROM sqlite_master WHERE name = 'goal_versions'").sql;
    if (!ddl.includes("'total'")) {
      db.exec(`CREATE TABLE goal_versions_v3 (
        id INTEGER PRIMARY KEY AUTOINCREMENT, goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE, effective_from TEXT NOT NULL,
        period TEXT NOT NULL CHECK (period IN ('daily','times_per_week','weekly','monthly','total')), target REAL NOT NULL, unit TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'min' CHECK (mode IN ('min','max','range')), days TEXT NOT NULL DEFAULT '[]', reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (goal_id, effective_from));
        INSERT INTO goal_versions_v3 SELECT id, goal_id, effective_from, period, target, unit, mode, days, reason, created_at FROM goal_versions;
        DROP TABLE goal_versions; ALTER TABLE goal_versions_v3 RENAME TO goal_versions;`);
    }
    if (tableExists(db, 'workouts')) {
      const strength = ['musculacao', 'calistenia'];
      for (const w of db.all('SELECT * FROM workouts')) {
        if (strength.includes(w.modality)) {
          const sets = db.all('SELECT s.*, e.name, e.muscle_group FROM workout_sets s JOIN exercises e ON e.id = s.exercise_id WHERE s.workout_id = ? ORDER BY s.id', w.id);
          const ex = new Map();
          for (const st of sets) { if (!ex.has(st.name)) ex.set(st.name, { name: st.name, group: st.muscle_group || null, sets: [] }); ex.get(st.name).sets.push({ reps: st.reps, weight: st.weight, rest_s: null }); }
          ins.run('forca', null, w.date, null, JSON.stringify({ modality: w.modality, duration_min: w.duration_min, exercises: [...ex.values()] }), w.notes);
        } else {
          ins.run('cardio', null, w.date, null, JSON.stringify({ modality: w.modality, duration_min: w.duration_min, distance_km: w.distance_km ?? null, steps: null }), w.notes);
        }
      }
    }
    if (tableExists(db, 'metric_logs')) {
      const nut = { calorias: 'calories', proteinas: 'protein', carboidratos: 'carbs', gorduras: 'fat' };
      for (const l of db.all('SELECT l.*, m.key FROM metric_logs l JOIN metrics m ON m.id = l.metric_id')) {
        if (l.key === 'agua') ins.run('hidratacao', null, l.date, null, JSON.stringify({ amount: l.value, unit: 'L', liters: l.value }), l.note);
        else if (nut[l.key]) ins.run('refeicao', null, l.date, null, JSON.stringify({ meal: 'outro', description: null, calories: null, protein: null, carbs: null, fat: null, [nut[l.key]]: l.value }), l.note);
        else if (l.key === 'peso') ins.run('corpo', null, l.date, null, JSON.stringify({ weight_kg: l.value, waist_cm: null }), l.note);
      }
    }
    if (tableExists(db, 'sleep_logs')) {
      for (const s of db.all('SELECT * FROM sleep_logs')) ins.run('sono', null, s.date, null, JSON.stringify({ bed_time: s.bed_time, wake_time: s.wake_time, hours: s.hours, quality: s.quality }), s.notes);
    }
    // Unidades renomeadas
    const unitMap = { g: null, encontros: 'quantidade', licoes: 'quantidade', obras: 'quantidade', capitulos: 'sessoes' };
    const nutUnit = { proteinas: 'proteina', carboidratos: 'carbo', gorduras: 'gordura' };
    for (const v of db.all('SELECT v.*, g.type FROM goal_versions v JOIN goals g ON g.id = v.goal_id')) {
      let unit = v.unit;
      if (unit === 'g') unit = nutUnit[v.type] || 'quantidade';
      else if (unitMap[unit]) unit = unitMap[unit];
      if (unit !== v.unit) db.run('UPDATE goal_versions SET unit = ? WHERE id = ?', unit, v.id);
    }
    // Valores manuais viram registros detalhados
    const kindOf = { leitura: 'leitura', estudo: 'estudo' };
    for (const e of db.all("SELECT e.*, g.type FROM day_entries e JOIN goals g ON g.id = e.goal_id WHERE e.status = 'value'")) {
      const ver = db.one('SELECT unit FROM goal_versions WHERE goal_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1', e.goal_id, e.date) || { unit: 'sessoes' };
      const k = kindOf[e.type] || 'sessao';
      let data;
      if (k === 'leitura') data = { book: null, author: null, pages: ver.unit === 'paginas' ? e.value : null, minutes: ver.unit === 'minutos' ? e.value : null };
      else if (k === 'estudo') data = { subject: null, minutes: ver.unit === 'horas' ? e.value * 60 : ver.unit === 'minutos' ? e.value : 30, content: null, exercises: null, performance: null };
      else data = { minutes: ver.unit === 'minutos' ? e.value : ver.unit === 'horas' ? e.value * 60 : null, quantity: ['quantidade', 'tarefas'].includes(ver.unit) ? e.value : null, description: null, done: true };
      if (k === 'sessao' && ver.unit === 'sessoes') { for (let i = 0; i < Math.max(1, Math.round(e.value)); i++) ins.run(k, e.goal_id, e.date, null, JSON.stringify(data), e.note); }
      else ins.run(k, k === 'sessao' ? e.goal_id : null, e.date, null, JSON.stringify(data), e.note);
    }
    db.run("DELETE FROM day_entries WHERE status = 'value'");
    // Aparência e inventário
    const p = db.one('SELECT character FROM profile WHERE id = 1');
    if (p) {
      const old = JSON.parse(p.character || '{}');
      const ch = { ...C.DEFAULT_CHARACTER };
      if (old.skin) ch.skin = old.skin;
      if (old.hairColor) ch.hairColor = old.hairColor;
      if (old.hair && C.LEGACY_HAIR[old.hair]) ch.hair = C.LEGACY_HAIR[old.hair];
      if (old.face === 'face_beard') ch.beard = 'full';
      if (old.face === 'face_scar') ch.face = 'scar';
      if (old.face === 'face_warpaint') ch.face = 'warpaint';
      if (old.face === 'face_determined') ch.face = 'determined';
      const items = db.all('SELECT item_id FROM inventory').map((r) => r.item_id);
      db.run('DELETE FROM inventory');
      for (const id of C.FREE_ITEMS) db.run("INSERT OR IGNORE INTO inventory (item_id, source) VALUES (?, 'inicial')", id);
      for (const id of items) { const n = C.LEGACY_ITEMS[id]; if (n) db.run("INSERT OR IGNORE INTO inventory (item_id, source) VALUES (?, 'migracao')", n); }
      for (const field of ['outfit', 'armor', 'accessory', 'weapon', 'effect']) {
        const n = C.LEGACY_ITEMS[old[field]];
        if (n) ch[C.ITEM_BY_ID[n].slot] = n;
      }
      db.run('UPDATE profile SET character = ?, setup_done = 1 WHERE id = 1', JSON.stringify(ch));
    }
  });
}

/** v3 → v4: análise individual de metas, campos personalizados e recompensas de chefes. Apenas acrescenta colunas/tabelas. */
function migrateToV4(db) {
  const cols = columns(db, 'goals');
  const add = [['source_text', 'TEXT'], ['weights', 'TEXT'], ['analysis', 'TEXT'], ['analysis_source', 'TEXT'], ['xp_factor', 'REAL NOT NULL DEFAULT 1'], ['custom_fields', "TEXT NOT NULL DEFAULT '[]'"]];
  for (const [c, def] of add) if (!cols.includes(c)) db.exec(`ALTER TABLE goals ADD COLUMN ${c} ${def}`);
}

function open(file) {
  let migrated = null;
  let db;
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  if (isV1(file)) {
    const r = migrateV1(file);
    db = r.db; migrated = r.backup;
  } else {
    db = decorate(new DatabaseSync(file));
  }
  const hasMeta = tableExists(db, 'meta');
  const version = hasMeta ? Number(db.one("SELECT value FROM meta WHERE key = 'schema_version'")?.value || 0) : 0;
  const hasProfile = tableExists(db, 'profile');
  if (hasProfile && version < SCHEMA_VERSION && !migrated && file !== ':memory:') {
    try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* ignora */ }
    migrated = file.replace(/\.db$/, '') + `.v${version || 2}-backup-${Date.now()}.db`;
    fs.copyFileSync(file, migrated);
  }
  if (hasProfile && version < 3) {
    if (tableExists(db, 'goals')) migrateToV4(db); // colunas novas antes do SCHEMA (índices/consultas)
    db.exec(SCHEMA);
    migrateV2toV3(db);
  } else {
    if (tableExists(db, 'goals')) migrateToV4(db);
    db.exec(SCHEMA);
  }
  migrateToV4(db);
  db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', 'schema_version', String(SCHEMA_VERSION));
  db.migratedFrom = migrated;
  return db;
}

module.exports = { open, SCHEMA_VERSION, LEGACY_SCHEMA };
