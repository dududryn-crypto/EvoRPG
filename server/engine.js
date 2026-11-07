'use strict';
/**
 * Motor de progressão (v2). Todas as regras — atributos, XP, penalidades, metas semanais,
 * ofensiva e chefes — são calculadas aqui, no servidor, a partir dos dados registrados.
 * Todo XP/moeda passa por um livro-razão com chave única (sem recompensas duplicadas).
 */
const crypto = require('crypto');
const R = require('./rules');
const C = require('./catalog');
const G = require('./goaltypes');
const RK = require('./records');
const { bad, notFound, todayIn, addDays, weekday, mondayOf, daysBetween, dateRange } = require('./util');

const DERIVED_XP = ['goal', 'penalty', 'perfect_day', 'sleep_regularity'];
const metricOf = (unit) => (unit === 'horas_sono' ? 'horas' : unit);
const DERIVED_COINS = ['day', 'goal_week'];

function createEngine(db) {
  let cache = null;

  // ================= Perfil e datas =================
  function profile() {
    const p = db.one('SELECT * FROM profile WHERE id = 1');
    if (!p) return null;
    return { ...p, setup_done: !!p.setup_done, character: { ...C.DEFAULT_CHARACTER, ...JSON.parse(p.character) } };
  }
  function requireProfile() {
    const p = profile();
    if (!p) throw bad('Crie seu perfil antes de continuar.');
    return p;
  }
  function today() {
    if (db.fakeToday) return db.fakeToday; // usado apenas pelos testes automatizados
    const p = db.one('SELECT timezone FROM profile WHERE id = 1');
    return todayIn(p ? p.timezone : 'UTC');
  }
  function invalidate() { cache = null; }
  /** Alterações feitas no 1º dia do ciclo (segunda) valem para o ciclo atual; depois, só no próximo. */
  function changeEffectiveDate() {
    const t = today();
    const ws = mondayOf(t);
    return t === ws ? t : addDays(ws, 7);
  }

  // ================= Descanso =================
  function restWeekdaysAt(date, rules) {
    let w = [];
    for (const r of rules) if (r.effective_from <= date) w = JSON.parse(r.weekdays);
    return w;
  }
  function restInfo(date, ctx) {
    const rd = ctx.restDays.get(date);
    const rule = restWeekdaysAt(date, ctx.rules).includes(weekday(date));
    return { rest: rule || !!rd, reducesTarget: rule || (!!rd && rd.created_on < date), reason: rd ? rd.reason : rule ? 'Descanso semanal' : null };
  }

  // ================= Metas =================
  function loadGoals() {
    const vs = db.all('SELECT * FROM goal_versions ORDER BY effective_from, id');
    const byGoal = new Map();
    for (const v of vs) {
      if (!byGoal.has(v.goal_id)) byGoal.set(v.goal_id, []);
      byGoal.get(v.goal_id).push({ ...v, days: JSON.parse(v.days) });
    }
    return db.all('SELECT * FROM goals ORDER BY id').map((g) => ({
      ...g, ai_evaluation: g.ai_evaluation ? JSON.parse(g.ai_evaluation) : null, versions: byGoal.get(g.id) || [],
      criteria: JSON.parse(g.criteria || '[]'), params: JSON.parse(g.params || '{}'),
      weights: g.weights ? JSON.parse(g.weights) : null, analysis: g.analysis ? JSON.parse(g.analysis) : null,
      custom_fields: JSON.parse(g.custom_fields || '[]'), xp_factor: g.xp_factor || 1,
    }));
  }
  /** Distribuição de XP da meta: a definida pela análise individual (validada) ou, em metas antigas, a da categoria. */
  function weightsFor(goal) {
    if (goal.weights && Object.keys(goal.weights).length) return goal.weights;
    return G.weightsOf(goal.type);
  }
  /** Intensidade (1 a 3) de cada atributo, para exibição. */
  function intensityOf(w) {
    return Object.fromEntries(Object.entries(w).filter(([, x]) => x > 0).map(([k, x]) => [k, x >= 0.45 ? 3 : x >= 0.22 ? 2 : 1]));
  }
  function versionAt(goal, date) {
    let v = null;
    for (const x of goal.versions) if (x.effective_from <= date) v = x;
    return v;
  }
  function activeOn(goal, date) {
    return date >= goal.created_on && (!goal.archived_on || date < goal.archived_on) && (!goal.deadline || date <= goal.deadline);
  }
  function isMilestone(goal) { return !!G.GOAL_TYPES[goal.type].milestone; }
  function goalName(goal) {
    return goal.label || G.GOAL_TYPES[goal.type].name;
  }
  function totalDays(goal) {
    return goal.deadline ? Math.max(1, daysBetween(goal.created_on, goal.deadline) + 1) : 30;
  }
  function isCommitmentVer(ver, date) {
    if (ver.period === 'daily' || ver.period === 'times_per_week') return ver.days.includes(weekday(date));
    return false;
  }

  // ================= Dados registrados =================
  function loadData(from, to) {
    const records = new Map();
    for (const r of db.all('SELECT * FROM records WHERE date BETWEEN ? AND ? ORDER BY date, COALESCE(time, \'\'), id', from, to)) {
      const k = `${r.kind}|${r.date}`;
      if (!records.has(k)) records.set(k, []);
      records.get(k).push({ ...r, data: JSON.parse(r.data) });
    }
    const entries = new Map(db.all('SELECT * FROM day_entries WHERE date BETWEEN ? AND ?', from, to).map((r) => [`${r.goal_id}|${r.date}`, r]));
    const restDays = new Map(db.all('SELECT * FROM rest_days').map((r) => [r.date, r]));
    const rules = db.all('SELECT * FROM rest_rules ORDER BY effective_from');
    return { from, to, records, entries, restDays, rules, goals: loadGoals() };
  }

  function goalRecords(goal, date, ctx) {
    const type = G.GOAL_TYPES[goal.type];
    const K = RK.KINDS[type.kind];
    const params = { ...(type.params || {}), ...(goal.params || {}) };
    return (ctx.records.get(`${type.kind}|${date}`) || [])
      .filter((r) => (K.shared ? true : r.goal_id === goal.id))
      .filter((r) => !K.match || K.match(r.data, { params }));
  }

  /** Valor do dia na unidade da meta, calculado a partir dos registros detalhados. */
  function rawValue(goal, ver, date, ctx) {
    const type = G.GOAL_TYPES[goal.type];
    return RK.aggregate(type.kind, goalRecords(goal, date, ctx), metricOf(ver.unit));
  }

  /** Avaliação de um dia para uma meta (estado, cumprimento e se é compromisso). */
  function dayEval(goal, ver, date, ctx, t) {
    const entry = ctx.entries.get(`${goal.id}|${date}`) || null;
    const value = rawValue(goal, ver, date, ctx);
    const ri = restInfo(date, ctx);
    const commitment = isCommitmentVer(ver, date) && !ri.rest;
    const base = { value, entry, commitment, rest: ri.rest, compliance: 0, penaltyFactor: 0 };
    if (entry && entry.status === 'excused') return { ...base, state: 'excused' };
    if (entry && entry.status === 'missed') return { ...base, state: 'failed', penaltyFactor: 1 };
    if (ver.period === 'daily') {
      if (value === null) return { ...base, state: 'pending' };
      const c = R.compliance(ver.mode, value, ver.target);
      if (c >= 0.999) return { ...base, state: 'done', compliance: 1 };
      if (date >= t) return { ...base, state: value > 0 ? 'partial' : 'pending', compliance: c };
      if (c >= 0.5) return { ...base, state: 'partial', compliance: c };
      return { ...base, state: 'failed', compliance: c, penaltyFactor: 1 - c };
    }
    if (ver.period === 'times_per_week') {
      if (value !== null && value >= 1) return { ...base, state: 'done', compliance: 1 };
      return { ...base, state: 'pending' };
    }
    return { ...base, state: value !== null && value > 0 ? 'logged' : 'pending', commitment: false };
  }

  // ================= Plano e progresso semanal =================
  /**
   * Calcula o objetivo semanal de uma meta. Regras próprias por período:
   * diária = alvo × dias programados (descontando descansos cadastrados com antecedência);
   * vezes por semana = N sessões; semanal = alvo; mensal = alvo × 7/30.
   * cycle=true usa a versão vigente no início do ciclo e a semana inteira (regra do Boss Final).
   */
  function weekPlan(goal, ws, ctx, { cycle = false } = {}) {
    if (isMilestone(goal)) return null; // metas de marco não têm objetivo semanal
    const we = addDays(ws, 6);
    if (cycle) {
      if (goal.created_on > ws) return null;
      if (goal.archived_on && goal.archived_on <= ws) return null;
      if (goal.deadline && goal.deadline < ws) return null;
    }
    const start = cycle ? ws : (goal.created_on > ws ? goal.created_on : ws);
    let end = cycle ? we : (goal.archived_on && addDays(goal.archived_on, -1) < we ? addDays(goal.archived_on, -1) : we);
    if (goal.deadline && goal.deadline < end) end = goal.deadline;
    if (start > end) return null;
    const ver = versionAt(goal, start);
    if (!ver) return null;
    const type = G.GOAL_TYPES[goal.type];
    const days = dateRange(start, end);
    const frac = days.length / 7;
    let expected = [];
    let weeklyTarget;
    let fullEquiv;
    if (ver.period === 'daily') {
      expected = days.filter((d) => ver.days.includes(weekday(d)) && !restInfo(d, ctx).reducesTarget);
      weeklyTarget = ver.target * expected.length;
      fullEquiv = ver.target * ver.days.length;
    } else if (ver.period === 'times_per_week') {
      weeklyTarget = cycle && frac === 1 ? ver.target : Math.max(1, Math.round(ver.target * frac));
      expected = days.filter((d) => ver.days.includes(weekday(d)));
      fullEquiv = ver.target;
    } else if (ver.period === 'weekly') {
      weeklyTarget = ver.target * frac;
      fullEquiv = ver.target;
    } else if (ver.period === 'monthly') {
      weeklyTarget = (ver.target * 7 / 30) * frac;
      fullEquiv = ver.target * 7 / 30;
    } else {
      const td = totalDays(goal);
      weeklyTarget = (ver.target * 7 / td) * frac;
      fullEquiv = ver.target * 7 / td;
    }
    const factor = R.difficultyFactor(fullEquiv, type.units[ver.unit]);
    const capped = ver.period === 'daily' && !type.accumulate;
    return {
      goal, ver, type, ws, we, start, end, days, expected, weeklyTarget, factor, capped, frac,
      budget: type.budget * factor * frac * (goal.xp_factor || 1),
      empty: ver.period === 'daily' ? expected.length === 0 : !(weeklyTarget > 0),
    };
  }

  /** Progresso semanal acumulado até `upTo` (inclusive). raw pode passar de 1 (superação). */
  function progressUpTo(plan, upTo, ctx) {
    if (!plan || plan.empty) return { raw: 0, pct: 0, value: 0, target: 0, daysWithData: 0 };
    let daysWithData = 0;
    if (plan.capped) {
      let sumC = 0; let sumV = 0; let n = 0;
      for (const d of plan.expected) {
        if (d > upTo) continue;
        const v = rawValue(plan.goal, plan.ver, d, ctx);
        if (v !== null) { daysWithData++; sumV += v; n++; }
        sumC += R.compliance(plan.ver.mode, v, plan.ver.target);
      }
      const raw = sumC / plan.expected.length;
      return { raw, pct: Math.min(1, raw), value: sumC * plan.ver.target, avgValue: n ? sumV / n : null, target: plan.weeklyTarget, daysWithData, daysOk: null };
    }
    let total = 0;
    for (const d of plan.days) {
      if (d > upTo) continue;
      const v = rawValue(plan.goal, plan.ver, d, ctx);
      if (v !== null) { daysWithData++; total += v; }
    }
    const raw = total / plan.weeklyTarget;
    return { raw, pct: Math.min(1, raw), value: total, target: plan.weeklyTarget, daysWithData };
  }

  // ================= Ofensiva =================
  function firstGoalDate() {
    const r = db.one('SELECT MIN(created_on) d FROM goals');
    return r.d;
  }
  /**
   * Classifica cada dia: success (+1), broken (zera), neutral (descanso, sem compromissos
   * ou registro incompleto). Ausência de registro nunca quebra a ofensiva.
   */
  function streakSeries() {
    const t = today();
    if (cache && cache.today === t) return cache;
    const first = firstGoalDate() || t;
    const ctx = loadData(first < t ? first : t, t);
    const days = [];
    let streak = 0; let best = 0; let lastBreak = null; let streakBeforeBreak = 0;
    for (const date of dateRange(first < t ? first : t, t)) {
      const startStreak = streak;
      const ri = restInfo(date, ctx);
      const counts = { scheduled: 0, done: 0, failed: 0, pending: 0, partial: 0, excused: 0 };
      const evals = [];
      for (const g of ctx.goals) {
        if (!activeOn(g, date) || isMilestone(g)) continue;
        const ver = versionAt(g, date);
        if (!ver) continue;
        const ev = dayEval(g, ver, date, ctx, t);
        evals.push({ goal: g, ver, ev });
        if (!ev.commitment) continue;
        counts.scheduled++;
        if (ev.state === 'done') counts.done++;
        else if (ev.state === 'failed') counts.failed++;
        else if (ev.state === 'excused') counts.excused++;
        else if (ev.state === 'partial') counts.partial++;
        else counts.pending++;
      }
      let status = 'none';
      if (ri.rest) status = 'rest';
      else if (counts.scheduled) {
        if (counts.failed > 0) status = 'broken';
        else if (counts.pending === 0 && counts.partial === 0 && counts.done > 0) status = 'success';
        else if (counts.pending === 0 && counts.partial === 0) status = 'rest';
        else if (counts.pending === 0) status = 'partial';
        else status = 'pending';
      }
      if (status === 'success') streak += 1;
      else if (status === 'broken') { if (streak > 0) { lastBreak = date; streakBeforeBreak = streak; } streak = 0; }
      best = Math.max(best, streak);
      days.push({ date, status, counts, streakStart: startStreak, streak, multiplier: R.streakMultiplier(startStreak), rest: ri.rest, evals });
    }
    const byDate = new Map(days.map((d) => [d.date, d]));
    cache = { today: t, days, byDate, current: streak, best, lastBreak, streakBeforeBreak, ctx };
    return cache;
  }
  function multiplierFor(date) {
    const s = streakSeries();
    const d = s.byDate.get(date);
    return d ? d.multiplier : R.streakMultiplier(s.current);
  }

  // ================= Livro-razão =================
  function attrTotals() {
    const out = Object.fromEntries(R.ATTRIBUTES.map((a) => [a, 0]));
    for (const r of db.all('SELECT attribute, SUM(amount) s FROM xp_events GROUP BY attribute')) out[r.attribute] = r.s;
    return out;
  }
  function xpEvent(attribute, amount, { source, sourceId = null, day, reason, ukey, multiplier = 1 }) {
    if (!R.ATTRIBUTES.includes(attribute) || !amount) return;
    db.run('INSERT OR IGNORE INTO xp_events (attribute, amount, multiplier, source, source_id, day, reason, ukey) VALUES (?,?,?,?,?,?,?,?)',
      attribute, Math.round(amount), multiplier, source, sourceId, day, reason, ukey);
  }
  function coinEvent(amount, { source, sourceId = null, day, reason, ukey }) {
    if (!amount) return;
    db.run('INSERT OR IGNORE INTO coin_events (amount, source, source_id, day, reason, ukey) VALUES (?,?,?,?,?,?)', Math.round(amount), source, sourceId, day, reason, ukey);
  }
  function awardSplit(total, weights, meta, mult, totals) {
    const gained = Math.round(total * mult);
    const parts = R.splitByWeights(gained, weights);
    for (const [a, amt] of Object.entries(parts)) {
      xpEvent(a, amt, { ...meta, ukey: `${meta.ukey}:${a}`, multiplier: mult });
      if (totals) totals[a] = (totals[a] || 0) + amt;
    }
    return gained;
  }
  function penalize(parts, meta, totals) {
    for (const [a, amt] of Object.entries(parts)) {
      const applied = Math.min(amt, Math.max(0, totals[a] || 0));
      if (applied > 0) { xpEvent(a, -applied, { ...meta, ukey: `${meta.ukey}:${a}` }); totals[a] -= applied; }
    }
  }
  function coinBalance() { return db.one('SELECT COALESCE(SUM(amount),0) s FROM coin_events').s; }

  // ================= Recalcular recompensas =================
  /**
   * Recalcula de forma determinística XP, penalidades e moedas derivados das metas,
   * da semana de `from` até hoje. XP diário = parte do XP semanal conquistada naquele dia
   * (curva aplicada ao progresso semanal acumulado), multiplicada pela ofensiva.
   */
  function recomputeFrom(from) {
    invalidate();
    const t = today();
    if (from > t) return;
    const ws0 = mondayOf(from);
    db.run(`DELETE FROM xp_events WHERE source IN (${DERIVED_XP.map(() => '?').join(',')}) AND day >= ?`, ...DERIVED_XP, ws0);
    db.run(`DELETE FROM coin_events WHERE source IN (${DERIVED_COINS.map(() => '?').join(',')}) AND day >= ?`, ...DERIVED_COINS, ws0);
    const series = streakSeries();
    const ctx = series.ctx;
    const totals = attrTotals();
    for (let ws = ws0; ws <= mondayOf(t); ws = addDays(ws, 7)) {
      const plans = new Map();
      for (const g of ctx.goals) { const p = weekPlan(g, ws, ctx); if (p && !p.empty) plans.set(g.id, p); }
      const prev = new Map();
      const we = addDays(ws, 6);
      for (const d of dateRange(ws, we < t ? we : t)) {
        const day = series.byDate.get(d);
        const mult = day ? day.multiplier : 1;
        for (const plan of plans.values()) {
          if (d < plan.start || d > plan.end) continue;
          const gid = plan.goal.id;
          const pr = prev.get(gid) || { g: 0, raw: 0 };
          const prog = progressUpTo(plan, d, ctx);
          const gNow = R.xpCurve(prog.raw);
          const delta = Math.round(plan.budget * gNow) - Math.round(plan.budget * pr.g);
          if (delta > 0) {
            awardSplit(delta, weightsFor(plan.goal), { source: 'goal', sourceId: gid, day: d, reason: goalName(plan.goal), ukey: `g:${gid}:${d}` }, mult, totals);
          }
          if (prog.raw >= 1 && pr.raw < 1) {
            coinEvent(R.LIMITS.goalWeekCoins, { source: 'goal_week', sourceId: gid, day: d, reason: `Meta semanal cumprida: ${goalName(plan.goal)}`, ukey: `gw:${gid}:${ws}` });
          }
          prev.set(gid, { g: Math.max(gNow, pr.g), raw: Math.max(prog.raw, pr.raw) });
        }
        if (!day) continue;
        let doneCount = 0;
        for (const { goal, ev } of day.evals) {
          if (!ev.commitment) continue;
          if (ev.state === 'done') doneCount++;
          if (ev.state === 'failed' && ev.penaltyFactor > 0) {
            const plan = plans.get(goal.id) || weekPlan(goal, ws, ctx);
            if (!plan) continue;
            const count = plan.ver.period === 'times_per_week' ? plan.weeklyTarget : plan.expected.length;
            const total = Math.round(R.dayPenalty(plan.budget, count) * ev.penaltyFactor);
            penalize(R.penaltySplit(total, weightsFor(goal)), { source: 'penalty', sourceId: goal.id, day: d, reason: `Não cumprido: ${goalName(goal)}`, ukey: `pen:${goal.id}:${d}` }, totals);
          }
        }
        if (doneCount) coinEvent(Math.min(R.LIMITS.dailyCoinsCap, doneCount), { source: 'day', day: d, reason: `${doneCount} compromisso(s) cumprido(s)`, ukey: `day:${d}` });
        if (day.status === 'success') {
          const b = Math.round(R.LIMITS.perfectDayDisciplineBonus * mult);
          xpEvent('disciplina', b, { source: 'perfect_day', day: d, reason: 'Todos os compromissos do dia cumpridos', ukey: `perfect:${d}`, multiplier: mult });
          totals.disciplina += b;
        }
      }
      if (we < t && ctx.goals.some((g) => g.type === 'sono' && activeOn(g, we))) {
        const reg = sleepRegularity(ws, ctx);
        if (reg.regular) {
          xpEvent('disciplina', 10, { source: 'sleep_regularity', day: we, reason: 'Sono regular na semana', ukey: `sleepreg:${ws}:disciplina` });
          xpEvent('saude', 5, { source: 'sleep_regularity', day: we, reason: 'Sono regular na semana', ukey: `sleepreg:${ws}:saude` });
        }
      }
    }
  }

  /** Regularidade do sono: desvio-padrão do horário de dormir (≥5 noites, ≤45 min = regular). */
  function sleepRegularity(ws, ctx) {
    const mins = [];
    for (const d of dateRange(ws, addDays(ws, 6))) {
      const recs = ctx.records.get(`sono|${d}`) || [];
      const s = recs.length ? recs[recs.length - 1].data : null;
      if (!s || !s.bed_time) continue;
      const [h, m] = s.bed_time.split(':').map(Number);
      let x = h * 60 + m; if (x < 12 * 60) x += 1440; // depois da meia-noite conta como "tarde"
      mins.push(x);
    }
    if (mins.length < 2) return { nights: mins.length, std: null, regular: false };
    const mean = mins.reduce((a, b) => a + b, 0) / mins.length;
    const std = Math.sqrt(mins.reduce((a, b) => a + (b - mean) ** 2, 0) / mins.length);
    return { nights: mins.length, std: Math.round(std), regular: mins.length >= 5 && std <= R.LIMITS.sleepRegularityMaxStd };
  }

  function finalize() {
    const p = profile();
    if (!p) return;
    const t = today();
    if (p.finalized_until === t) return;
    db.tx(() => {
      recomputeFrom(p.finalized_until || t);
      db.run('UPDATE profile SET finalized_until = ? WHERE id = 1', t);
      checkAchievements();
    });
  }

  // ================= Registros =================
  function setEntry(goalId, { date, status, note }) {
    const t = today();
    const goal = loadGoals().find((g) => g.id === goalId);
    if (!goal) throw notFound('Meta não encontrada.');
    if (date > t) throw bad('Não é possível registrar no futuro.');
    if (daysBetween(date, t) > 30) throw bad('Registros retroativos são aceitos até 30 dias atrás.');
    if (!activeOn(goal, date) || !versionAt(goal, date)) throw bad('Essa meta não estava ativa nessa data.');
    if (status === 'value') throw bad('Use o registro detalhado da meta para informar valores.');
    if (isMilestone(goal)) throw bad('Metas de marco não têm compromissos diários.');
    db.tx(() => {
      if (status === 'clear') db.run('DELETE FROM day_entries WHERE goal_id = ? AND date = ?', goalId, date);
      else {
        db.run(`INSERT INTO day_entries (goal_id, date, status, value, note, updated_at) VALUES (?,?,?,NULL,?,datetime('now'))
                ON CONFLICT(goal_id, date) DO UPDATE SET status=excluded.status, value=NULL, note=excluded.note, updated_at=datetime('now')`,
        goalId, date, status, note || null);
      }
      recomputeFrom(date);
      checkAchievements();
    });
    return dayView(date);
  }

  // ================= Marcos (carga, peso) =================
  /**
   * Progresso de metas de marco: maior carga num exercício ou peso corporal-alvo.
   * baseline = valor anterior à criação da meta (ou o primeiro registro depois dela).
   */
  function milestoneProgress(goal, upTo) {
    const type = G.GOAL_TYPES[goal.type];
    const ver = goal.versions[goal.versions.length - 1];
    const target = ver.target;
    if (type.milestone === 'max_load') {
      const name = (goal.params.exercise || '').trim().toLowerCase();
      const ex = RK.exerciseStats(db.all("SELECT * FROM records WHERE kind = 'forca' AND date <= ? ORDER BY date, id", upTo).map((r) => ({ ...r, data: JSON.parse(r.data) })))
        .find((e) => e.name.toLowerCase() === name);
      const before = ex ? ex.sessions.filter((x) => x.date < goal.created_on && x.maxWeight > 0) : [];
      const after = ex ? ex.sessions.filter((x) => x.date >= goal.created_on && x.maxWeight > 0) : [];
      const baseline = before.length ? Math.max(...before.map((x) => x.maxWeight)) : (after[0]?.maxWeight ?? null);
      const best = after.length ? Math.max(...after.map((x) => x.maxWeight)) : null;
      let reachedOn = null;
      for (const x of after) if (x.maxWeight >= target) { reachedOn = x.date; break; }
      const pct = best === null ? 0 : baseline !== null && target > baseline ? Math.max(0, Math.min(1, (best - baseline) / (target - baseline))) : Math.min(1, best / target);
      return { kind: 'max_load', exercise: goal.params.exercise, baseline, current: best, target, pct: reachedOn ? 1 : pct, reachedOn, unit: 'kg', history: after.map((x) => ({ date: x.date, value: x.maxWeight })) };
    }
    const rows = db.all("SELECT date, data FROM records WHERE kind = 'corpo' AND date <= ? ORDER BY date, id", upTo).map((r) => ({ date: r.date, value: JSON.parse(r.data).weight_kg }));
    const before = rows.filter((r) => r.date <= goal.created_on);
    const after = rows.filter((r) => r.date >= goal.created_on);
    const baseline = before.length ? before[before.length - 1].value : (after[0]?.value ?? null);
    const current = rows.length ? rows[rows.length - 1].value : null;
    const lose = ver.mode !== 'min';
    let reachedOn = null;
    for (const r of after) if (lose ? r.value <= target : r.value >= target) { reachedOn = r.date; break; }
    let pct = 0;
    if (current !== null && baseline !== null && baseline !== target) pct = Math.max(0, Math.min(1, (lose ? baseline - current : current - baseline) / Math.abs(baseline - target)));
    return { kind: 'body_weight', baseline, current, target, pct: reachedOn ? 1 : pct, reachedOn, unit: 'kg', lose, history: after };
  }
  /** Concede (ou revoga) a recompensa única dos marcos conforme os registros atuais. */
  function syncMilestones() {
    const t = today();
    for (const g of loadGoals()) {
      if (!isMilestone(g) || g.archived_on) continue;
      const mp = milestoneProgress(g, t);
      const valid = mp.reachedOn && (!g.deadline || mp.reachedOn <= g.deadline);
      if (valid && !g.achieved_on) {
        db.run('UPDATE goals SET achieved_on = ? WHERE id = ?', mp.reachedOn, g.id);
        const mult = multiplierFor(mp.reachedOn);
        awardSplit(Math.round(G.GOAL_TYPES[g.type].budget * (g.xp_factor || 1)), weightsFor(g), { source: 'milestone', sourceId: g.id, day: mp.reachedOn, reason: `Marco alcançado: ${goalName(g)}`, ukey: `ms:${g.id}` }, mult);
        coinEvent(50, { source: 'milestone', sourceId: g.id, day: mp.reachedOn, reason: `Marco alcançado: ${goalName(g)}`, ukey: `ms:${g.id}` });
      } else if (!valid && g.achieved_on) {
        db.run('UPDATE goals SET achieved_on = NULL WHERE id = ?', g.id);
        db.run("DELETE FROM xp_events WHERE source = 'milestone' AND source_id = ?", g.id);
        db.run("DELETE FROM coin_events WHERE source = 'milestone' AND source_id = ?", g.id);
      }
    }
  }

  // ================= Registros detalhados =================
  function parseRecord(r) { return r ? { ...r, data: JSON.parse(r.data) } : null; }
  function validateRecord(kind, goalId, body) {
    const K = RK.KINDS[kind];
    if (!K) throw bad('Tipo de registro inválido.');
    let gid = null;
    if (!K.shared) {
      const g = loadGoals().find((x) => x.id === goalId);
      if (!g || G.GOAL_TYPES[g.type].kind !== kind) throw bad('Este registro precisa estar vinculado a uma meta compatível.');
      gid = g.id;
    }
    const data = K.parse(body || {});
    const custom = sanitizeCustom(body?.custom);
    if (custom) data.custom = custom;
    return { data, goal_id: gid };
  }
  /** Valores de campos personalizados: até 8 chaves simples, números finitos ou textos curtos. */
  function sanitizeCustom(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
    const out = {};
    for (const [k, val] of Object.entries(c).slice(0, 8)) {
      if (!/^[a-z0-9_]{1,30}$/.test(k) || val === null || val === '' || val === undefined) continue;
      if (typeof val === 'number' && Number.isFinite(val) && Math.abs(val) < 1e7) out[k] = Math.round(val * 100) / 100;
      else if (typeof val === 'string') out[k] = val.slice(0, 200);
    }
    return Object.keys(out).length ? out : null;
  }
  function checkDate(date) {
    const t = today();
    if (date > t) throw bad('Não é possível registrar no futuro.');
    if (daysBetween(date, t) > 30) throw bad('Registros que afetam metas são aceitos até 30 dias atrás.');
  }
  function afterRecords(...dates) {
    invalidate();
    recomputePRs();
    recomputeFrom(dates.sort()[0]);
    syncMilestones();
    checkAchievements();
  }
  function addRecord({ kind, goalId, date, time, data, note }) {
    checkDate(date);
    const r = validateRecord(kind, goalId, data);
    let id;
    db.tx(() => {
      if (RK.KINDS[kind].single) db.run('DELETE FROM records WHERE kind = ? AND date = ?', kind, date);
      id = Number(db.run('INSERT INTO records (kind, goal_id, date, time, data, note) VALUES (?,?,?,?,?,?)', kind, r.goal_id, date, time || null, JSON.stringify(r.data), note || null).lastInsertRowid);
      afterRecords(date);
    });
    return parseRecord(db.one('SELECT * FROM records WHERE id = ?', id));
  }
  function updateRecord(id, { date, time, data, note }) {
    const old = db.one('SELECT * FROM records WHERE id = ?', id);
    if (!old) throw notFound('Registro não encontrado.');
    checkDate(old.date); checkDate(date);
    const r = validateRecord(old.kind, old.goal_id, data);
    db.tx(() => {
      db.run("UPDATE records SET date = ?, time = ?, data = ?, note = ?, updated_at = datetime('now') WHERE id = ?", date, time || null, JSON.stringify(r.data), note || null, id);
      afterRecords(old.date, date);
    });
    return parseRecord(db.one('SELECT * FROM records WHERE id = ?', id));
  }
  function deleteRecord(id) {
    const old = db.one('SELECT * FROM records WHERE id = ?', id);
    if (!old) throw notFound('Registro não encontrado.');
    checkDate(old.date);
    db.tx(() => { db.run('DELETE FROM records WHERE id = ?', id); afterRecords(old.date); });
  }
  /** Registros que alimentam uma meta (mesmo tipo e filtros), mais recentes primeiro. */
  function recordsForGoal(goal, from, to, limit = 500) {
    const type = G.GOAL_TYPES[goal.type];
    const K = RK.KINDS[type.kind];
    const params = { ...(type.params || {}), ...(goal.params || {}) };
    const rows = K.shared
      ? db.all('SELECT * FROM records WHERE kind = ? AND date BETWEEN ? AND ? ORDER BY date DESC, id DESC', type.kind, from, to)
      : db.all('SELECT * FROM records WHERE kind = ? AND goal_id = ? AND date BETWEEN ? AND ? ORDER BY date DESC, id DESC', type.kind, goal.id, from, to);
    return rows.map(parseRecord).filter((r) => !K.match || K.match(r.data, { params })).slice(0, limit);
  }

  // ================= Visões =================
  function unitLabelOf(goal, ver) {
    return (goal?.params?.unit_label && ['quantidade', 'tarefas', 'sessoes'].includes(ver.unit)) ? goal.params.unit_label : G.UNITS[ver.unit].label;
  }
  function describe(ver, type, goal = null) {
    const u = unitLabelOf(goal, ver);
    const n = (x) => Math.round(x * 100) / 100;
    if (type.milestone === 'max_load') return { text: `${n(ver.target)} kg em ${goal?.params?.exercise || 'exercício'}${goal?.deadline ? ` até ${goal.deadline.split('-').reverse().join('/')}` : ''}`, milestone: true, total: ver.target };
    if (type.milestone === 'body_weight') return { text: `${ver.mode === 'min' ? 'Chegar a' : 'Reduzir para'} ${n(ver.target)} kg${goal?.deadline ? ` até ${goal.deadline.split('-').reverse().join('/')}` : ''}`, milestone: true, total: ver.target };
    if (ver.period === 'daily') {
      const k = ver.days.length;
      const prefix = ver.mode === 'max' ? 'até ' : ver.mode === 'range' ? '≈ ' : '';
      return { text: `${prefix}${n(ver.target)} ${u} por dia${k < 7 ? ` (${k} dias/semana)` : ''}`, day: ver.target, week: ver.target * k, month: ver.target * 30 * (k / 7), capped: !type.accumulate };
    }
    if (ver.period === 'times_per_week') return { text: `${n(ver.target)}× por semana`, day: 1, week: ver.target, month: (ver.target * 30) / 7, sessions: true };
    if (ver.period === 'weekly') return { text: `${n(ver.target)} ${u} por semana`, day: ver.target / 7, week: ver.target, month: (ver.target * 30) / 7 };
    if (ver.period === 'monthly') return { text: `${n(ver.target)} ${u} por mês`, day: ver.target / 30, week: (ver.target * 7) / 30, month: ver.target };
    const td = goal ? totalDays(goal) : 30;
    return { text: `${n(ver.target)} ${u} até ${goal?.deadline ? goal.deadline.split('-').reverse().join('/') : 'o prazo'}`, day: ver.target / td, week: (ver.target * 7) / td, month: (ver.target * 30) / td, total: ver.target, totalDays: td };
  }

  function rewardsInfo(goal, ver) {
    const type = G.GOAL_TYPES[goal.type];
    const wInt = intensityOf(goal.weights || weightsFor({ type: goal.type }));
    if (type.milestone) return { weights: wInt, distribution: goal.weights || G.weightsOf(goal.type), milestone: true, milestoneXp: Math.round(type.budget * (goal.xp_factor || 1)), weeklyXp: 0, weeklyXpMax: 0, factor: 1, penaltyPerMiss: 0, commitments: false };
    const fake = { ...goal, created_on: goal.created_on || today(), archived_on: null, versions: [{ ...ver, effective_from: '0000-01-01' }] };
    if (ver.period === 'total' && !fake.deadline) fake.deadline = addDays(fake.created_on, 29);
    const ctxLite = { restDays: new Map(), rules: [] };
    const ws = mondayOf(fake.created_on);
    const plan = weekPlan({ ...fake, created_on: '0000-01-01', deadline: null }, ws, ctxLite, { cycle: true }) || { budget: 0, factor: 1, weeklyTarget: 1, expected: [] };
    if (ver.period === 'total') { const td = totalDays(fake); const f = R.difficultyFactor((ver.target * 7) / td, type.units[ver.unit]); plan.budget = type.budget * f * (goal.xp_factor || 1); plan.factor = f; }
    const count = ver.period === 'times_per_week' ? plan.weeklyTarget : plan.expected.length;
    const commitments = ver.period === 'daily' || (ver.period === 'times_per_week' && ver.days.length > 0);
    return {
      weights: wInt, distribution: goal.weights || G.weightsOf(goal.type), xpFactor: goal.xp_factor || 1, weeklyXp: Math.round(plan.budget), weeklyXpMax: Math.round(plan.budget * R.xpCurve(1.4)), factor: Math.round(plan.factor * 100) / 100,
      penaltyPerMiss: commitments ? R.dayPenalty(plan.budget, count) : 0, commitments,
    };
  }

  function goalStatus(goal, t) {
    if (goal.archived_on && goal.archived_on <= t) return 'encerrada';
    if (isMilestone(goal) && goal.achieved_on) return 'alcancada';
    if (goal.deadline && goal.deadline < t) return 'expirada';
    return 'ativa';
  }

  function goalView(goal, ctx, t) {
    const type = G.GOAL_TYPES[goal.type];
    const ver = versionAt(goal, t) || goal.versions[goal.versions.length - 1];
    const pending = goal.versions.find((v) => v.effective_from > t) || null;
    const base = {
      id: goal.id, type: goal.type, typeName: type.name, group: type.group, kind: type.kind, name: goalName(goal), label: goal.label,
      description: goal.description, objective: goal.objective, notes: goal.notes, criteria: goal.criteria, deadline: goal.deadline, params: goal.params,
      created_on: goal.created_on, archived_on: goal.archived_on, achieved_on: goal.achieved_on, status: goalStatus(goal, t), milestone: !!type.milestone,
      version: ver, pending, history: goal.versions, targets: describe(ver, type, goal), rewards: rewardsInfo(goal, ver),
      ai_score: goal.ai_score, ai_evaluation: goal.ai_evaluation,
      source_text: goal.source_text || null, analysis: goal.analysis, analysis_source: goal.analysis_source || null, custom_fields: goal.custom_fields,
      unitLabel: unitLabelOf(goal, ver),
    };
    if (type.milestone) return { ...base, progress: milestoneProgress(goal, t) };
    const plan = weekPlan(goal, mondayOf(t), ctx);
    const week = progressUpTo(plan, t, ctx);
    const todayEval = activeOn(goal, t) && versionAt(goal, t) ? dayEval(goal, ver, t, ctx, t) : null;
    let total = null;
    if (ver.period === 'total' || ver.period === 'monthly') {
      const from = ver.period === 'total' ? goal.created_on : (t.slice(0, 8) + '01' > goal.created_on ? t.slice(0, 8) + '01' : goal.created_on);
      const to = ver.period === 'total' && goal.deadline && goal.deadline < t ? goal.deadline : t;
      const c2 = from < ctx.from ? loadData(from, to) : ctx;
      let sum = 0; for (const d of dateRange(from, to)) { const v = rawValue(goal, ver, d, c2); if (v !== null) sum += v; }
      const target = ver.period === 'total' ? ver.target : ver.target;
      total = { value: sum, target, pct: Math.min(1, sum / target), remaining: Math.max(0, target - sum), from, to };
    }
    return {
      ...base,
      today: todayEval ? { state: todayEval.state, value: todayEval.value, compliance: todayEval.compliance, commitment: todayEval.commitment, entry: todayEval.entry } : null,
      week: plan && !plan.empty ? { ...week, expectedDays: plan.expected.length, capped: plan.capped, start: plan.start, remaining: plan.capped ? null : Math.max(0, plan.weeklyTarget - week.value) } : null,
      total,
    };
  }

  function goalsView({ includeEnded = false } = {}) {
    const t = today();
    const ctx = loadData(addDays(mondayOf(t), -31), t);
    return ctx.goals.filter((g) => includeEnded || goalStatus(g, t) === 'ativa' || goalStatus(g, t) === 'alcancada').map((g) => goalView(g, ctx, t));
  }

  function dayView(date) {
    const t = today();
    const s = streakSeries();
    const ctx = loadData(addDays(mondayOf(date), -1), date > t ? date : t);
    const ri = restInfo(date, ctx);
    const xpRows = db.all("SELECT ukey, amount FROM xp_events WHERE day = ? AND source IN ('goal','penalty')", date);
    const items = [];
    for (const g of ctx.goals) {
      if (!activeOn(g, date) || isMilestone(g)) continue;
      const ver = versionAt(g, date);
      if (!ver) continue;
      const type = G.GOAL_TYPES[g.type];
      const ev = dayEval(g, ver, date, ctx, t);
      const plan = weekPlan(g, mondayOf(date), ctx);
      const week = progressUpTo(plan, date, ctx);
      let xp = 0;
      for (const r of xpRows) if (r.ukey.startsWith(`g:${g.id}:${date}:`) || r.ukey.startsWith(`pen:${g.id}:${date}:`)) xp += r.amount;
      items.push({
        goal: { id: g.id, type: g.type, name: goalName(g), group: type.group, kind: type.kind, typeName: type.name, params: { ...(type.params || {}), ...g.params }, custom_fields: g.custom_fields || [], unitLabel: unitLabelOf(g, ver) },
        version: ver, targets: describe(ver, type, g),
        eval: { state: ev.state, value: ev.value, compliance: ev.compliance, commitment: ev.commitment, note: ev.entry?.note || null, entryStatus: ev.entry?.status || null },
        records: goalRecords(g, date, ctx).map((r) => ({ id: r.id, time: r.time, data: r.data, note: r.note })),
        week: plan && !plan.empty ? { pct: week.pct, raw: week.raw, value: week.value, target: week.target, capped: plan.capped } : null,
        xp, penaltyPreview: plan && !plan.empty ? R.dayPenalty(plan.budget, ver.period === 'times_per_week' ? plan.weeklyTarget : plan.expected.length) : 0,
      });
    }
    return { date, today: t, rest: ri.rest, restReason: ri.reason, items, day: s.byDate.get(date) ? stripDay(s.byDate.get(date)) : null, multiplier: multiplierFor(date) };
  }
  function stripDay(d) { const { evals, ...rest } = d; return rest; }

  function pendingDays() {
    const s = streakSeries();
    return s.days.filter((d) => d.status === 'pending' && d.date < s.today && daysBetween(d.date, s.today) <= 7).map((d) => ({ date: d.date, pending: d.counts.pending }));
  }

  // ================= Ciclos e chefes =================
  function ensureCycle(ws) {
    let c = db.one('SELECT * FROM cycles WHERE week_start = ?', ws);
    if (!c) {
      db.run('INSERT OR IGNORE INTO cycles (week_start, week_end) VALUES (?, ?)', ws, addDays(ws, 6));
      c = db.one('SELECT * FROM cycles WHERE week_start = ?', ws);
    }
    return c;
  }

  /** Visão completa de um ciclo: metas válidas (congeladas no início), progresso, chefes e média. */
  function cycleView(cycle) {
    const t = today();
    const ws = cycle.week_start; const we = cycle.week_end;
    const ctx = loadData(addDays(ws, -1), we > t ? t : we);
    const upTo = we < t ? we : t;
    const ended = t > we;
    const started = t >= ws;
    const events = db.all('SELECT * FROM cycle_events WHERE cycle_id = ? ORDER BY id', cycle.id);
    const suspended = new Map(events.filter((e) => e.kind === 'suspend').map((e) => [e.goal_id, e]));
    const goals = [];
    for (const g of ctx.goals) {
      const plan = weekPlan(g, ws, ctx, { cycle: true });
      if (!plan) continue;
      const prog = started ? progressUpTo(plan, upTo, ctx) : { raw: 0, pct: 0, value: 0, target: plan.weeklyTarget, daysWithData: 0 };
      let status = 'valida';
      if (plan.empty) status = 'sem-dias';
      else if (suspended.has(g.id)) status = 'suspensa';
      goals.push({
        id: g.id, name: goalName(g), type: g.type, group: G.GOAL_TYPES[g.type].group, unit: plan.ver.unit, period: plan.ver.period, mode: plan.ver.mode,
        target: plan.weeklyTarget, dailyTarget: plan.ver.target, expectedDays: plan.expected.length, capped: plan.capped,
        value: prog.value, avgValue: prog.avgValue ?? null, raw: prog.raw, pct: prog.pct, daysWithData: prog.daysWithData,
        status, suspension: suspended.get(g.id) || null, targets: describe(plan.ver, plan.type, g),
      });
    }
    const included = goals.filter((x) => x.status === 'valida');
    const avg = R.finalBossAverage(included.map((x) => x.pct));
    const battles = JSON.parse(cycle.battles || '{}');
    const boss = (slot) => {
      const gid = cycle[`boss${slot}_goal`];
      const g = gid ? goals.find((x) => x.id === gid) : null;
      const goal = gid ? ctx.goals.find((x) => x.id === gid) : null;
      const arch = goal ? C.BOSS_ARCHETYPES[primaryAttr(weightsFor(goal))] : null;
      const b = battles[`b${slot}`] || null;
      return {
        slot, key: `b${slot}`, goal: g, name: arch ? arch.names[(gid + slot) % arch.names.length] : null, archetype: arch ? arch.archetype : null,
        pct: g ? g.pct : null, battle: b, status: b ? b.status : 'pending',
        canFight: !b && !!g && (ended || g.pct >= 1),
      };
    };
    const fb = battles.final || null;
    return {
      id: cycle.id, week_start: ws, week_end: we, today: t, started, ended, daysLeft: Math.max(0, daysBetween(t, we)),
      configOpen: t <= ws, goals, included: included.length, average: avg, threshold: R.LIMITS.finalThreshold,
      bosses: [boss(1), boss(2)],
      final: {
        key: 'final', name: 'Tirano da Inconstância', archetype: 'tyrant', average: avg, battle: fb, status: fb ? fb.status : 'pending',
        canFight: !fb && ended && included.length > 0, hpLeft: avg === null ? 1 : Math.max(0, 1 - avg / R.LIMITS.finalThreshold),
      },
      events, drops: dropsFor(cycle.id), report: cycle.report ? JSON.parse(cycle.report) : null, ai_report: cycle.ai_report ? JSON.parse(cycle.ai_report) : null,
    };
  }
  function primaryAttr(weights) {
    return Object.entries(weights).sort((a, b) => b[1] - a[1])[0][0];
  }

  function selectBoss(ws, slot, goalId) {
    const t = today();
    if (t > ws) throw bad('Os chefes deste ciclo só podem ser escolhidos até o primeiro dia (segunda-feira). Escolha os do próximo ciclo.');
    const cycle = ensureCycle(ws);
    if (goalId !== null) {
      const view = cycleView(cycle);
      const g = view.goals.find((x) => x.id === goalId);
      if (!g) throw bad('Essa meta não participa deste ciclo (precisa estar definida antes do início).');
      if (g.status !== 'valida') throw bad('Essa meta não é válida neste ciclo.');
      const other = cycle[`boss${slot === 1 ? 2 : 1}_goal`];
      if (other === goalId) throw bad('Essa meta já está vinculada ao outro chefe.');
    }
    db.run(`UPDATE cycles SET boss${slot}_goal = ? WHERE id = ?`, goalId, cycle.id);
    return cycleView(db.one('SELECT * FROM cycles WHERE id = ?', cycle.id));
  }

  function suspendGoal(cycleId, goalId, reason) {
    const cycle = db.one('SELECT * FROM cycles WHERE id = ?', cycleId);
    if (!cycle) throw notFound('Ciclo não encontrado.');
    const t = today();
    if (t < cycle.week_start || t > cycle.week_end) throw bad('Só é possível suspender metas durante o ciclo em andamento.');
    if (!reason || reason.trim().length < 10) throw bad('Descreva o motivo da suspensão (mínimo de 10 caracteres). Ele ficará registrado no relatório.');
    if (db.one("SELECT 1 FROM cycle_events WHERE cycle_id = ? AND kind = 'suspend'", cycleId)) throw bad('Apenas uma meta pode ser suspensa por ciclo.');
    if (cycle.boss1_goal === goalId || cycle.boss2_goal === goalId) throw bad('Metas vinculadas ao Boss 1 ou Boss 2 não podem ser suspensas.');
    const view = cycleView(cycle);
    if (!view.goals.find((x) => x.id === goalId && x.status === 'valida')) throw bad('Essa meta não é válida neste ciclo.');
    db.run("INSERT INTO cycle_events (cycle_id, kind, goal_id, reason, created_on) VALUES (?, 'suspend', ?, ?, ?)", cycleId, goalId, reason.trim().slice(0, 300), t);
    return cycleView(cycle);
  }

  function fight(cycleId, which) {
    const cycle = db.one('SELECT * FROM cycles WHERE id = ?', cycleId);
    if (!cycle) throw notFound('Ciclo não encontrado.');
    const view = cycleView(cycle);
    const battles = JSON.parse(cycle.battles || '{}');
    if (battles[which]) return { cycle: view, battle: battles[which], which, drop: dropsFor(cycleId)[which] || null };
    const t = today();
    let result;
    if (which === 'b1' || which === 'b2') {
      const b = view.bosses[which === 'b1' ? 0 : 1];
      if (!b.goal) throw bad('Nenhuma meta vinculada a este chefe.');
      if (!b.canFight) throw bad('A batalha fica disponível ao fim da semana ou quando a meta chegar a 100%.');
      const script = R.battleScript(b.goal.pct);
      result = { status: script.victory ? 'victory' : 'defeat', pct: b.goal.pct, damage: script.damage, script, name: b.name, archetype: b.archetype, goalId: b.goal.id, fought_on: t };
      if (script.victory) {
        const goal = loadGoals().find((g) => g.id === b.goal.id);
        awardSplit(R.LIMITS.boss12Xp, weightsFor(goal), { source: 'boss', sourceId: cycleId, day: t, reason: `Chefe derrotado: ${b.name}`, ukey: `boss:${cycleId}:${which}` }, multiplierFor(t));
        coinEvent(R.LIMITS.boss12Coins, { source: 'boss', sourceId: cycleId, day: t, reason: `Chefe derrotado: ${b.name}`, ukey: `boss:${cycleId}:${which}` });
      }
    } else if (which === 'final') {
      if (!view.ended) throw bad('O Boss Final só pode ser enfrentado depois que a semana terminar.');
      if (!view.included) throw bad('Nenhuma meta válida neste ciclo: não há Boss Final.');
      const avg = view.average;
      const victory = R.finalBossVictory(avg);
      const script = R.battleScript(victory ? 1 : Math.min(0.999, avg / R.LIMITS.finalThreshold), 8);
      result = { status: victory ? 'victory' : 'defeat', pct: avg, damage: script.damage, script, name: view.final.name, archetype: 'tyrant', fought_on: t };
      if (victory) {
        const mult = multiplierFor(t);
        xpEvent('disciplina', Math.round(R.LIMITS.finalBossXp * mult), { source: 'boss', sourceId: cycleId, day: t, reason: 'Boss Final derrotado', ukey: `boss:${cycleId}:final:disciplina`, multiplier: mult });
        coinEvent(R.LIMITS.finalBossCoins, { source: 'boss', sourceId: cycleId, day: t, reason: 'Boss Final derrotado', ukey: `boss:${cycleId}:final` });
      }
    } else throw bad('Chefe inválido.');
    battles[which] = result;
    let drop = null;
    db.tx(() => {
      db.run('UPDATE cycles SET battles = ? WHERE id = ?', JSON.stringify(battles), cycleId);
      if (result.status === 'victory') drop = rollDrop(cycleId, which, result.archetype, t);
      if (view.ended) db.run('UPDATE cycles SET report = ? WHERE id = ?', JSON.stringify(buildReport(db.one('SELECT * FROM cycles WHERE id = ?', cycleId))), cycleId);
      checkAchievements();
    });
    return { cycle: cycleView(db.one('SELECT * FROM cycles WHERE id = ?', cycleId)), battle: result, which, drop };
  }

  /** Relatório semanal: resultados, percentuais, média, XP, atributos, penalidades e comparação. */
  function buildReport(cycle) {
    const view = cycleView(cycle);
    const ws = cycle.week_start; const we = cycle.week_end;
    const xp = Object.fromEntries(R.ATTRIBUTES.map((a) => [a, 0]));
    let xpGain = 0;
    for (const r of db.all('SELECT attribute, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) g, SUM(amount) n FROM xp_events WHERE day BETWEEN ? AND ? GROUP BY attribute', ws, we)) { xp[r.attribute] = r.n; xpGain += r.g; }
    const penalties = db.all("SELECT day, reason, SUM(amount) amount FROM xp_events WHERE source = 'penalty' AND day BETWEEN ? AND ? GROUP BY ukey_prefix ORDER BY day".replace('ukey_prefix', "substr(ukey, 1, length(ukey) - length(attribute) - 1)"), ws, we);
    const prevCycle = db.one('SELECT * FROM cycles WHERE week_start = ?', addDays(ws, -7));
    let previous = null;
    if (prevCycle) {
      const pv = cycleView(prevCycle);
      const pxp = db.one('SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END),0) g FROM xp_events WHERE day BETWEEN ? AND ?', prevCycle.week_start, prevCycle.week_end).g;
      previous = { week_start: prevCycle.week_start, average: pv.average, xpGain: pxp, included: pv.included };
    }
    const included = view.goals.filter((g) => g.status === 'valida');
    const below = included.filter((g) => g.pct < 0.95).sort((a, b) => a.pct - b.pct);
    const br = (x) => (Math.round(x * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    const pctTxt = (p) => `${br(p * 100)}%`;
    const round = br;
    const unitLabel = (u) => G.UNITS[u].label;
    const recs = [];
    for (const g of below.slice(0, 4)) {
      if (!g.daysWithData) { recs.push(`${g.name}: nenhum registro na semana (contou 0%). Registre diariamente, mesmo valores parciais.`); continue; }
      if (g.capped) {
        recs.push(`${g.name}: ${pctTxt(g.pct)} — ${g.daysWithData} de ${g.expectedDays} dia(s) com registro, média de ${round(g.avgValue)} ${unitLabel(g.unit)} (meta ${g.mode === 'max' ? 'até ' : ''}${round(g.dailyTarget)} ${unitLabel(g.unit)}/dia).${g.daysWithData < g.expectedDays ? ' Dias sem registro contaram como 0%.' : ''}`);
      } else {
        const missing = Math.max(0, g.target - g.value);
        recs.push(`${g.name}: ${pctTxt(g.pct)} — registrado ${round(g.value)} de ${round(g.target)} ${unitLabel(g.unit)} (faltaram ${round(missing)}).${g.pct < 0.7 && g.value > 0 ? ` Um alvo mais próximo do registrado seria cerca de ${br(g.value * 1.15)} ${unitLabel(g.unit)} na semana.` : ''}`);
      }
    }
    const fb = JSON.parse(cycle.battles || '{}').final;
    let finalText;
    if (view.average === null) finalText = 'Nenhuma meta válida neste ciclo.';
    else if (R.finalBossVictory(view.average)) finalText = `Sua média semanal foi de ${pctTxt(view.average)}, acima dos 95% necessários: o Boss Final foi derrotado${fb ? '' : ' assim que você enfrentá-lo'}.`;
    else {
      const worst = below.slice(0, 2).map((g) => `${g.name.toLowerCase()} (${pctTxt(g.pct)})`).join(' e ');
      finalText = `Sua média semanal foi de ${pctTxt(view.average)}. Você precisava alcançar 95% para derrotar o Boss Final (faltaram ${br((0.95 - view.average) * 100)} pontos percentuais).${worst ? ` Seus principais pontos de dificuldade foram ${worst}.` : ''}`;
    }
    const notes = db.all(`SELECT e.date, e.status, e.note, e.goal_id FROM day_entries e WHERE e.date BETWEEN ? AND ? AND e.note IS NOT NULL AND e.note != '' ORDER BY e.date`, ws, we)
      .map((n) => ({ ...n, goal: view.goals.find((g) => g.id === n.goal_id)?.name || null }))
      .concat(db.all("SELECT date, kind, note, goal_id FROM records WHERE date BETWEEN ? AND ? AND note IS NOT NULL AND note != '' ORDER BY date", ws, we)
        .map((n) => ({ date: n.date, status: 'registro', note: n.note, goal: n.goal_id ? view.goals.find((g) => g.id === n.goal_id)?.name || null : RK.KINDS[n.kind].name })));
    return {
      week: { start: ws, end: we }, generated_on: today(),
      bosses: view.bosses.map((b) => ({ slot: b.slot, name: b.name, goal: b.goal ? b.goal.name : null, pct: b.pct, status: b.battle ? b.battle.status : (b.goal ? 'nao-enfrentado' : 'sem-meta') })),
      final: { average: view.average, threshold: R.LIMITS.finalThreshold, status: fb ? fb.status : 'nao-enfrentado', text: finalText, included: view.included },
      goals: view.goals.map((g) => ({ id: g.id, name: g.name, pct: g.pct, raw: g.raw, value: g.value, target: g.target, unit: g.unit, status: g.status, daysWithData: g.daysWithData, expectedDays: g.expectedDays, capped: g.capped, suspension: g.suspension })),
      xp, xpGain, penalties: penalties.map((p) => ({ day: p.day, reason: p.reason, amount: p.amount })),
      penaltyTotal: penalties.reduce((s, p) => s + p.amount, 0),
      previous, recommendations: recs, notes, events: view.events,
    };
  }
  function cycleReport(cycleId) {
    const cycle = db.one('SELECT * FROM cycles WHERE id = ?', cycleId);
    if (!cycle) throw notFound('Ciclo não encontrado.');
    const rep = buildReport(cycle);
    if (today() > cycle.week_end) db.run('UPDATE cycles SET report = ? WHERE id = ?', JSON.stringify(rep), cycleId);
    return rep;
  }

  // ================= Treinos e recordes =================
  function recomputePRs() {
    db.run("DELETE FROM xp_events WHERE source = 'pr'");
    const recs = db.all("SELECT * FROM records WHERE kind = 'forca' ORDER BY date, id").map(parseRecord);
    const perDay = new Map();
    const prs = [];
    for (const ex of RK.exerciseStats(recs)) for (const p of ex.prs) prs.push({ ...p, name: ex.name });
    prs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    for (const p of prs) {
      const used = perDay.get(p.date) || 0;
      if (used + R.LIMITS.prXp > R.LIMITS.prDailyCap) continue;
      const mult = multiplierFor(p.date);
      xpEvent('fisico', Math.round(R.LIMITS.prXp * mult), { source: 'pr', sourceId: p.record_id, day: p.date, reason: `Recorde pessoal: ${p.name} (${p.weight} kg)`, ukey: `pr:${p.record_id}:${p.name.toLowerCase()}`, multiplier: mult });
      perDay.set(p.date, used + R.LIMITS.prXp);
    }
    return prs.length;
  }

  // ================= Conquistas =================
  function bossVictories() {
    let total = 0; let finals = 0;
    for (const c of db.all('SELECT battles FROM cycles')) {
      const b = JSON.parse(c.battles || '{}');
      for (const [k, v] of Object.entries(b)) if (v.status === 'victory') { total++; if (k === 'final') finals++; }
    }
    return { total, finals };
  }
  function ownedItems() { return new Set(db.all('SELECT item_id FROM inventory').map((r) => r.item_id)); }
  function completeSkins(owned = ownedItems()) { return Object.values(C.SETS).filter((st) => st.items.every((id) => owned.has(id))).map((st) => st.key); }
  /** Concede todas as peças de uma skin. Retorna quantas peças eram novas. */
  function grantSkin(key, source) {
    const st = C.SETS[key];
    if (!st) return 0;
    let n = 0;
    for (const id of st.items) n += Number(db.run('INSERT OR IGNORE INTO inventory (item_id, source) VALUES (?, ?)', id, source).changes);
    return n;
  }

  /** Métricas usadas por conquistas e missões (todas calculadas a partir dos dados registrados). */
  function missionMetrics() {
    const t = today();
    const s = streakSeries();
    const totals = attrTotals();
    const totalXp = Object.values(totals).reduce((x, y) => x + Math.max(0, y), 0);
    const bv = bossVictories();
    const count = (sql) => db.one(sql).n;
    const ended = db.all('SELECT * FROM cycles WHERE week_end < ? ORDER BY week_start', t).map((c) => cycleView(c)).filter((c) => c.included > 0);
    let run = 0; let bestRun = 0;
    for (const c of ended) { run = c.average >= 0.8 ? run + 1 : 0; bestRun = Math.max(bestRun, run); }
    return {
      commitments: s.days.reduce((a, d) => a + d.counts.done, 0),
      perfectDays: s.days.filter((d) => d.status === 'success').length,
      bestStreak: s.best,
      goalWeeks: count("SELECT COUNT(*) n FROM coin_events WHERE source = 'goal_week'"),
      milestones: count('SELECT COUNT(*) n FROM goals WHERE achieved_on IS NOT NULL'),
      bosses: bv.total, finals: bv.finals,
      prs: count("SELECT COUNT(*) n FROM xp_events WHERE source = 'pr'"),
      workouts: count("SELECT COUNT(*) n FROM records WHERE kind IN ('forca','cardio')"),
      records: count('SELECT COUNT(*) n FROM records'),
      activeDays: count('SELECT COUNT(DISTINCT date) n FROM records'),
      maxAttrLevel: Math.max(...R.ATTRIBUTES.map((a) => R.attributeLevel(a, totals[a]).level)),
      charLevel: R.characterLevel(totalXp).level,
      consistentRun: bestRun,
      perfectWeeks: ended.filter((c) => c.included >= 3 && c.goals.filter((g) => g.status === 'valida').every((g) => g.pct >= 1)).length,
      skins: completeSkins().length,
    };
  }

  function checkAchievements() {
    const have = new Set(db.all('SELECT key FROM achievements').map((r) => r.key));
    const t = today();
    const m = missionMetrics();
    const bv = { total: m.bosses };
    for (let pass = 0; pass < 2; pass++) { // 2ª passada: skins recebidas podem completar missões de coleção
      for (const a of C.ACHIEVEMENTS) {
        if (have.has(a.key) || !(m[a.metric] >= a.target)) continue;
        db.run("INSERT OR IGNORE INTO achievements (key, unlocked_at, day) VALUES (?, datetime('now'), ?)", a.key, t);
        coinEvent(a.coins, { source: 'achievement', day: t, reason: `${a.mission ? 'Missão' : 'Conquista'}: ${a.name}`, ukey: `ach:${a.key}` });
        if (a.skin) grantSkin(a.skin, 'missao');
        have.add(a.key);
      }
      m.skins = completeSkins().length;
    }
    // Desbloqueios: conquistas, nível de personagem e chefes derrotados
    for (const it of C.ITEMS) {
      const u = it.unlock;
      if (!u) continue;
      const ok = (u.achievement && have.has(u.achievement)) || (u.level && m.charLevel >= u.level) || (u.bosses && bv.total >= u.bosses);
      if (ok) db.run("INSERT OR IGNORE INTO inventory (item_id, source) VALUES (?, 'desbloqueio')", it.id);
    }
    for (const a of C.ACHIEVEMENTS) {
      if (!have.has(a.key)) continue;
      for (const id of [a.item, a.title]) if (id) db.run("INSERT OR IGNORE INTO inventory (item_id, source) VALUES (?, 'conquista')", id);
      if (a.skin) grantSkin(a.skin, 'missao');
    }
  }

  // ================= Recompensas de chefes =================
  /**
   * Sorteio de skin ao vencer um chefe. Usa gerador criptográfico no servidor; o resultado é gravado
   * uma única vez por batalha (UNIQUE cycle_id+which) e nunca re-sorteado. O cliente não influencia nada.
   */
  function rollDrop(cycleId, which, archetype, t, rng = null) {
    const prev = db.one('SELECT * FROM reward_drops WHERE cycle_id = ? AND which = ?', cycleId, which);
    if (prev) return dropView(prev);
    const table = which === 'final' ? C.LOOT.final : C.LOOT.boss;
    const rnd = rng || (() => crypto.randomInt(0, 10000));
    const roll = rnd();
    const owned = ownedItems();
    const eligible = (rar) => Object.values(C.SETS).filter((st) => st.rarity === rar && (st.boss === 'any' || st.boss === archetype) && !st.items.every((id) => owned.has(id)));
    let res = { dropped: 0, rarity: null, skin: null, coins: 0, detail: null };
    if (roll < table.chance) {
      let r = rnd(); let rarity = 'comum';
      for (const [k, w] of Object.entries(table.weights)) { if (r < w) { rarity = k; break; } r -= w; }
      const order = C.RARITIES.map((x) => x.key);
      let pickRarity = rarity; let pool = eligible(rarity);
      for (let i = order.indexOf(rarity) - 1; !pool.length && i >= 0; i--) { pickRarity = order[i]; pool = eligible(pickRarity); }
      if (pool.length) {
        const excl = pool.filter((st) => st.boss === archetype);
        const from = excl.length && rnd() < C.LOOT.exclusiveShare ? excl : pool;
        const st = from[rnd() % from.length];
        grantSkin(st.key, 'chefe');
        res = { dropped: 1, rarity: pickRarity, skin: st.key, coins: 0, detail: pickRarity !== rarity ? `Raridade sorteada: ${rarity} (sem skins disponíveis; ajustada)` : null };
      } else {
        const coins = C.RARITY[rarity].compensation;
        coinEvent(coins, { source: 'boss', sourceId: cycleId, day: t, reason: 'Compensação: todas as skins sorteáveis já possuídas', ukey: `drop:${cycleId}:${which}` });
        res = { dropped: 0, rarity, skin: null, coins, detail: 'Coleção completa para este chefe: convertido em moedas.' };
      }
    }
    db.run('INSERT INTO reward_drops (cycle_id, which, dropped, rarity, skin, coins, roll, detail, created_on) VALUES (?,?,?,?,?,?,?,?,?)', cycleId, which, res.dropped, res.rarity, res.skin, res.coins, roll, res.detail, t);
    return dropView(db.one('SELECT * FROM reward_drops WHERE cycle_id = ? AND which = ?', cycleId, which));
  }
  function dropView(r) {
    if (!r) return null;
    const st = r.skin ? C.SETS[r.skin] : null;
    return { dropped: !!r.dropped, rarity: r.rarity, skin: st ? { key: st.key, name: st.name, rarity: st.rarity, desc: st.desc, items: st.items } : null, coins: r.coins, detail: r.detail };
  }
  function dropsFor(cycleId) { return Object.fromEntries(db.all('SELECT * FROM reward_drops WHERE cycle_id = ?', cycleId).map((r) => [r.which, dropView(r)])); }

  function attributesSummary() {
    const totals = attrTotals();
    const attrs = R.ATTRIBUTES.map((a) => ({ key: a, ...R.ATTRIBUTE_INFO[a], ...R.attributeLevel(a, totals[a]) }));
    const total = Object.values(totals).reduce((x, y) => x + Math.max(0, y), 0);
    return { attributes: attrs, character: R.characterLevel(total) };
  }

  return {
    profile, requireProfile, today, invalidate, changeEffectiveDate,
    loadGoals, versionAt, activeOn, goalName, loadData, rawValue, restInfo, weekPlan, progressUpTo, describe, rewardsInfo, isMilestone, totalDays,
    goalView, goalStatus, milestoneProgress, syncMilestones, addRecord, updateRecord, deleteRecord, recordsForGoal, goalRecords, parseRecord,
    streakSeries, multiplierFor, attrTotals, coinBalance, xpEvent, coinEvent,
    recomputeFrom, finalize, setEntry, dayView, goalsView, pendingDays, sleepRegularity,
    ensureCycle, cycleView, selectBoss, suspendGoal, fight, buildReport, cycleReport,
    recomputePRs, checkAchievements, attributesSummary, missionMetrics, grantSkin, completeSkins, ownedItems, weightsFor, intensityOf, rollDrop,
  };
}

module.exports = { createEngine };
