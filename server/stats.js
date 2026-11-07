'use strict';
/**
 * Estatísticas da aba Evolução e dados para a IA (aba Detalhes).
 * Tudo é calculado a partir de registros reais; dias sem registro ficam nulos.
 */
const R = require('./rules');
const G = require('./goaltypes');
const RK = require('./records');
const { addDays, dateRange, mondayOf, daysBetween } = require('./util');

const r1 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const sum = (a) => a.reduce((s, x) => s + x, 0);

function createStats(db, engine) {
  function cumulativeXp(until) {
    const out = Object.fromEntries(R.ATTRIBUTES.map((a) => [a, 0]));
    for (const r of db.all('SELECT attribute, SUM(amount) s FROM xp_events WHERE day <= ? GROUP BY attribute', until)) out[r.attribute] = r.s;
    return out;
  }
  function periodBounds(days) {
    const t = engine.today();
    if (days === 'all') {
      const first = db.one('SELECT MIN(d) d FROM (SELECT MIN(created_on) d FROM goals UNION SELECT MIN(day) FROM xp_events UNION SELECT MIN(date) FROM records)').d || t;
      const n = Math.max(1, daysBetween(first, t) + 1);
      return { from: first, to: t, n, prevFrom: null, prevTo: null };
    }
    return { from: addDays(t, -(days - 1)), to: t, n: days, prevFrom: addDays(t, -(2 * days - 1)), prevTo: addDays(t, -days) };
  }

  /** Média aritmética simples semanal (mesma regra do Boss Final). */
  function weeklyAverages(n) {
    const t = engine.today();
    const out = [];
    const ws0 = mondayOf(addDays(t, -7 * (n - 1)));
    const ctx = engine.loadData(addDays(ws0, -1), t);
    const suspended = new Map();
    for (const e of db.all("SELECT c.week_start, e.goal_id FROM cycle_events e JOIN cycles c ON c.id = e.cycle_id WHERE e.kind = 'suspend'")) {
      if (!suspended.has(e.week_start)) suspended.set(e.week_start, new Set());
      suspended.get(e.week_start).add(e.goal_id);
    }
    for (let ws = ws0; ws <= mondayOf(t); ws = addDays(ws, 7)) {
      const we = addDays(ws, 6);
      const items = [];
      for (const g of ctx.goals) {
        const plan = engine.weekPlan(g, ws, ctx, { cycle: true });
        if (!plan || plan.empty || suspended.get(ws)?.has(g.id)) continue;
        items.push({ id: g.id, pct: engine.progressUpTo(plan, we < t ? we : t, ctx).pct });
      }
      out.push({ week: ws, average: R.finalBossAverage(items.map((x) => x.pct)), goals: items, partial: we >= t });
    }
    return out;
  }

  // ================= Visão geral =================
  function overview(days) {
    const b = periodBounds(days);
    const s = engine.streakSeries();
    const summ = engine.attributesSummary();
    const startXp = cumulativeXp(addDays(b.from, -1));
    const nowXp = cumulativeXp(b.to);
    const attrs = R.ATTRIBUTES.map((a) => {
      const l0 = R.attributeLevel(a, startXp[a]); const l1 = R.attributeLevel(a, nowXp[a]);
      return { key: a, name: R.ATTRIBUTE_INFO[a].name, color: R.ATTRIBUTE_INFO[a].color, levelStart: r2(l0.level + l0.progress), levelNow: r2(l1.level + l1.progress), xpGained: nowXp[a] - startXp[a] };
    });
    const xpIn = (from, to) => db.one('SELECT COALESCE(SUM(amount),0) s FROM xp_events WHERE day BETWEEN ? AND ?', from, to).s;
    const consistency = (from, to) => {
      let done = 0; let den = 0;
      for (const d of dateRange(from, to)) {
        const day = s.byDate.get(d);
        if (!day || day.rest || !day.counts.scheduled) continue;
        const dd = day.counts.scheduled - day.counts.excused;
        if (dd <= 0 || day.counts.pending === dd) continue;
        done += day.counts.done; den += dd;
      }
      return den ? Math.round((done / den) * 100) : null;
    };
    const cur = { xp: xpIn(b.from, b.to), consistency: consistency(b.from, b.to), perfectDays: s.days.filter((d) => d.date >= b.from && d.status === 'success').length };
    const prev = b.prevFrom ? { xp: xpIn(b.prevFrom, b.prevTo), consistency: consistency(b.prevFrom, b.prevTo), perfectDays: s.days.filter((d) => d.date >= b.prevFrom && d.date <= b.prevTo && d.status === 'success').length } : null;

    // série de XP acumulado (amostrada para no máximo ~90 pontos)
    const total = (x) => R.ATTRIBUTES.reduce((a, k) => a + Math.max(0, x[k]), 0);
    const daily = db.all('SELECT day, SUM(amount) s FROM xp_events WHERE day BETWEEN ? AND ? GROUP BY day', b.from, b.to);
    const dm = new Map(daily.map((r) => [r.day, r.s]));
    let run = total(startXp);
    const xpSeries = [];
    const dates = dateRange(b.from, b.to);
    const step = Math.max(1, Math.ceil(dates.length / 90));
    dates.forEach((d, i) => { run += dm.get(d) || 0; if (i % step === 0 || i === dates.length - 1) xpSeries.push({ date: d, xp: Math.max(0, run) }); });

    // metas: progresso e tendência no período
    const goals = engine.goalsView().map((g) => {
      const gs = goalSeries(g.id, b.from, b.to);
      const prevGs = b.prevFrom ? goalSeries(g.id, b.prevFrom, b.prevTo) : null;
      const trend = !prevGs || prevGs.completion === null || gs.completion === null ? null : r1((gs.completion - prevGs.completion) * 100);
      return {
        id: g.id, name: g.name, type: g.type, typeName: g.typeName, group: g.group, milestone: g.milestone, status: g.status,
        completion: g.milestone ? g.progress.pct : gs.completion, previous: prevGs ? prevGs.completion : null, trend,
        progressText: g.milestone ? `${br(r1(g.progress.current))} / ${br(g.progress.target)} kg` : g.week ? `${br(r1(g.week.value))} / ${br(r1(g.week.target))} ${G.UNITS[g.version.unit].label} na semana` : g.targets.text,
        weekPct: g.week ? g.week.pct : null, records: gs.records,
      };
    });
    const best = goals.filter((g) => g.trend !== null).sort((a, b2) => b2.trend - a.trend).slice(0, 3);
    const wk = weeklyAverages(Math.min(8, Math.max(2, Math.ceil(b.n / 7))));
    return {
      period: days, from: b.from, to: b.to,
      character: summ.character, totalXp: total(nowXp), attributes: attrs, xpSeries,
      current: cur, previous: prev, streak: { current: s.current, best: s.best },
      weekly: wk.map((w) => ({ week: w.week, average: w.average, partial: w.partial, goals: w.goals.length })),
      goals, bestGoals: best,
    };
  }

  /** Cumprimento médio (0..1) de uma meta nos dias/semanas de um intervalo. */
  const br = (x) => (x === null || x === undefined ? '—' : Number(x).toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
  function goalSeries(goalId, from, to) {
    const goal = engine.loadGoals().find((g) => g.id === goalId);
    if (!goal || engine.isMilestone(goal)) return { completion: null, records: 0 };
    if (to < goal.created_on) return { completion: null, records: 0 }; // período anterior à criação da meta
    const ctx = engine.loadData(addDays(mondayOf(from), -1), to);
    const pcts = [];
    for (let ws = mondayOf(from); ws <= to; ws = addDays(ws, 7)) {
      if (addDays(ws, 6) < goal.created_on) continue; // a meta ainda não existia
      const plan = engine.weekPlan(goal, ws, ctx);
      if (!plan || plan.empty) continue;
      const we = addDays(ws, 6);
      pcts.push(engine.progressUpTo(plan, we < to ? we : to, ctx).pct * (we <= to ? 1 : 1));
    }
    let records = 0;
    for (const d of dateRange(from, to)) records += engine.goalRecords(goal, d, ctx).length;
    return { completion: pcts.length ? avg(pcts) : null, records };
  }

  // ================= Página individual da meta =================
  /**
   * Estatísticas específicas por tipo. `days` = 7 | 30 | 90 | 'all'.
   * Separa valores registrados de cálculos derivados.
   */
  function goalStats(goalId, days = 30) {
    const goal = engine.loadGoals().find((g) => g.id === goalId);
    if (!goal) return null;
    const t = engine.today();
    const type = G.GOAL_TYPES[goal.type];
    const view = engine.goalView(goal, engine.loadData(addDays(mondayOf(t), -31), t), t);
    const allFrom = goal.created_on < addDays(t, -365) ? addDays(t, -365) : addDays(goal.created_on, -30);
    const from = days === 'all' ? allFrom : addDays(t, -(days - 1));
    const n = Math.max(1, daysBetween(from, t) + 1);
    const prevFrom = addDays(from, -n); const prevTo = addDays(from, -1);
    const ctx = engine.loadData(addDays(mondayOf(prevFrom), -1), t);
    const ver = view.version;
    const unit = G.UNITS[ver.unit].label;
    const out = { goal: view, period: { days, from, to: t, prevFrom, prevTo }, unit, kind: type.kind };

    const recs = engine.recordsForGoal(goal, from, t, 5000);
    const prevRecs = engine.recordsForGoal(goal, prevFrom, prevTo, 5000);
    out.recordCount = recs.length;
    out.history = recs.slice(0, 60);

    if (!type.milestone) {
      const series = dateRange(from, t).map((d) => {
        const vv = versionAt(goal, d);
        if (!vv || !engine.activeOn(goal, d)) return { date: d, value: null, met: null };
        const value = engine.rawValue(goal, vv, d, ctx);
        const met = vv.period === 'daily' && value !== null ? R.compliance(vv.mode, value, vv.target) >= 0.999 : null;
        return { date: d, value: value === null ? null : r2(value), met };
      });
      out.daily = series;
      const vals = series.filter((x) => x.value !== null).map((x) => x.value);
      const prevVals = dateRange(prevFrom, prevTo).map((d) => { const vv = versionAt(goal, d); return vv && engine.activeOn(goal, d) ? engine.rawValue(goal, vv, d, ctx) : null; }).filter((x) => x !== null);
      out.summary = {
        daysWithData: vals.length, totalDays: n,
        total: r2(sum(vals)), prevTotal: prevVals.length ? r2(sum(prevVals)) : null,
        avgPerDayWithData: r2(avg(vals)), avgPerDay: r2(sum(vals) / n), prevAvgPerDay: prevVals.length ? r2(sum(prevVals) / n) : null,
        avgPerWeek: r2((sum(vals) / n) * 7),
        best: vals.length ? series.filter((x) => x.value !== null).reduce((a, b) => (b.value > a.value ? b : a)) : null,
        daysMet: series.filter((x) => x.met).length, daysScheduled: series.filter((x) => x.met !== null).length,
        consistency: r1((vals.length / n) * 100),
      };
      // semanas
      const weeks = [];
      for (let ws = mondayOf(from); ws <= t; ws = addDays(ws, 7)) {
        const plan = engine.weekPlan(goal, ws, ctx);
        const we = addDays(ws, 6);
        let wsum = 0; let wn = 0;
        for (const d of dateRange(ws, we < t ? we : t)) { const vv = versionAt(goal, d); if (!vv) continue; const x = engine.rawValue(goal, vv, d, ctx); if (x !== null) { wsum += x; wn++; } }
        const prog = plan && !plan.empty ? engine.progressUpTo(plan, we < t ? we : t, ctx) : null;
        weeks.push({ week: ws, total: r2(wsum), daysWithData: wn, pct: prog ? r2(prog.pct) : null, target: prog ? r2(prog.target) : null, partial: we >= t });
      }
      out.weeks = weeks;
      const bestWeek = weeks.filter((w) => w.daysWithData).reduce((a, b) => (!a || b.total > a.total ? b : a), null);
      out.summary.bestWeek = bestWeek;
      const curC = goalSeries(goal.id, from, t).completion; const prevC = goalSeries(goal.id, prevFrom, prevTo).completion;
      out.summary.completion = curC === null ? null : r1(curC * 100);
      out.summary.prevCompletion = prevC === null ? null : r1(prevC * 100);
      out.summary.trend = trendOf(curC, prevC);
    } else {
      out.milestone = view.progress;
    }

    // ---------- específicos por tipo ----------
    if (type.kind === 'forca') {
      const allStrength = db.all("SELECT * FROM records WHERE kind = 'forca' ORDER BY date, id").map(engine.parseRecord)
        .filter((r) => !type.params?.modality || r.data.modality === type.params.modality || type.milestone);
      const exs = RK.exerciseStats(allStrength);
      out.exercises = exs.map((e) => {
        const inP = e.sessions.filter((x) => x.date >= from);
        const before = e.sessions.filter((x) => x.date < from && x.maxWeight > 0);
        const startBest = before.length ? Math.max(...before.map((x) => x.maxWeight)) : (inP[0]?.maxWeight ?? null);
        const endBest = inP.length ? Math.max(...inP.map((x) => x.maxWeight)) : null;
        return {
          name: e.name, group: e.group, best: e.best, sessionsInPeriod: inP.length, volumeInPeriod: r1(sum(inP.map((x) => x.volume))),
          loadChange: endBest !== null && startBest !== null ? r1(endBest - startBest) : null, startBest, endBest,
          lastDate: e.sessions.length ? e.sessions[e.sessions.length - 1].date : null,
          prs: e.prs.filter((p) => p.date >= from), series: e.sessions.filter((x) => x.date >= from).map((x) => ({ date: x.date, maxWeight: x.maxWeight, est1rm: x.est1rm, volume: x.volume, reps: x.reps })),
          stagnant: inP.length >= 3 && endBest !== null && startBest !== null && endBest <= startBest,
        };
      }).filter((e) => e.sessionsInPeriod || (type.milestone && e.name.toLowerCase() === (goal.params.exercise || '').toLowerCase()))
        .sort((a, b) => b.sessionsInPeriod - a.sessionsInPeriod);
      const prs = out.exercises.flatMap((e) => e.prs.map((p) => ({ ...p, exercise: e.name })));
      out.strength = {
        sessions: recs.length, prevSessions: prevRecs.length,
        volume: r1(sum(recs.map((r) => RK.KINDS.forca.metrics.volume(r.data)))), prevVolume: r1(sum(prevRecs.map((r) => RK.KINDS.forca.metrics.volume(r.data)))),
        prs: prs.sort((a, b) => (a.date < b.date ? 1 : -1)),
        mostProgress: out.exercises.filter((e) => e.loadChange !== null).sort((a, b) => b.loadChange - a.loadChange)[0] || null,
        stagnant: out.exercises.filter((e) => e.stagnant).map((e) => e.name),
        groups: Object.entries(recs.flatMap((r) => r.data.exercises).reduce((m, e) => { const k = e.group || 'Sem grupo'; m[k] = (m[k] || 0) + e.sets.length; return m; }, {})).map(([k, v2]) => ({ group: k, sets: v2 })),
        weeklyVolume: weeksOf(from, t).map((ws) => ({ week: ws, volume: r1(sum(recs.filter((r) => r.date >= ws && r.date <= addDays(ws, 6)).map((r) => RK.KINDS.forca.metrics.volume(r.data)))), sessions: recs.filter((r) => r.date >= ws && r.date <= addDays(ws, 6)).length })),
      };
    }
    if (type.kind === 'cardio') {
      const tot = (rs, k) => r2(sum(rs.map((r) => r.data[k] || 0)));
      const paces = recs.filter((r) => r.data.distance_km && r.data.duration_min).map((r) => ({ date: r.date, pace: r2(r.data.duration_min / r.data.distance_km) }));
      out.cardio = {
        sessions: recs.length, prevSessions: prevRecs.length, km: tot(recs, 'distance_km'), prevKm: tot(prevRecs, 'distance_km'),
        minutes: tot(recs, 'duration_min'), prevMinutes: tot(prevRecs, 'duration_min'), steps: tot(recs, 'steps'),
        avgPace: paces.length ? r2(avg(paces.map((p) => p.pace))) : null, bestPace: paces.length ? Math.min(...paces.map((p) => p.pace)) : null, paces: paces.reverse(),
        longest: recs.filter((r) => r.data.distance_km).reduce((a, b) => (!a || b.data.distance_km > a.data.distance_km ? b : a), null),
      };
    }
    if (type.kind === 'leitura') {
      const books = new Map();
      for (const r of [...recs].reverse()) {
        const k = (r.data.book || 'Sem título').trim();
        if (!books.has(k)) books.set(k, { book: k, author: r.data.author, pages: 0, minutes: 0, first: r.date, last: r.date, sessions: 0 });
        const bk = books.get(k); bk.pages += r.data.pages || 0; bk.minutes += r.data.minutes || 0; bk.last = r.date; bk.sessions++;
      }
      const pages = sum(recs.map((r) => r.data.pages || 0)); const mins = sum(recs.map((r) => r.data.minutes || 0));
      const timed = recs.filter((r) => r.data.pages && r.data.minutes);
      out.reading = {
        pages, prevPages: sum(prevRecs.map((r) => r.data.pages || 0)), minutes: mins, prevMinutes: sum(prevRecs.map((r) => r.data.minutes || 0)),
        pagesPerHour: timed.length ? r1(sum(timed.map((r) => r.data.pages)) / (sum(timed.map((r) => r.data.minutes)) / 60)) : null,
        books: [...books.values()].map((b) => ({ ...b, daysSpan: daysBetween(b.first, b.last) + 1 })),
      };
    }
    if (type.kind === 'estudo') {
      const subj = new Map();
      for (const r of recs) { const k = r.data.subject || 'Sem assunto'; subj.set(k, (subj.get(k) || 0) + r.data.minutes); }
      const perf = recs.filter((r) => r.data.performance !== null && r.data.performance !== undefined);
      out.study = {
        minutes: sum(recs.map((r) => r.data.minutes)), prevMinutes: sum(prevRecs.map((r) => r.data.minutes)), sessions: recs.length,
        exercises: sum(recs.map((r) => r.data.exercises || 0)), avgPerformance: perf.length ? r1(avg(perf.map((r) => r.data.performance))) : null,
        prevAvgPerformance: (() => { const p = prevRecs.filter((r) => r.data.performance !== null && r.data.performance !== undefined); return p.length ? r1(avg(p.map((r) => r.data.performance))) : null; })(),
        subjects: [...subj.entries()].map(([s2, m]) => ({ subject: s2, minutes: m })).sort((a, b) => b.minutes - a.minutes),
      };
    }
    if (type.kind === 'refeicao') {
      const byDay = new Map();
      for (const r of recs) { const d = byDay.get(r.date) || { kcal: 0, p: 0, c: 0, f: 0, meals: 0 }; d.kcal += r.data.calories || 0; d.p += r.data.protein || 0; d.c += r.data.carbs || 0; d.f += r.data.fat || 0; d.meals++; byDay.set(r.date, d); }
      const ds = [...byDay.values()];
      const meals = {}; for (const r of recs) meals[r.data.meal] = (meals[r.data.meal] || 0) + 1;
      out.nutrition = { days: ds.length, avgKcal: r1(avg(ds.map((d) => d.kcal))), avgProtein: r1(avg(ds.map((d) => d.p))), avgCarbs: r1(avg(ds.map((d) => d.c))), avgFat: r1(avg(ds.map((d) => d.f))), avgMeals: r1(avg(ds.map((d) => d.meals))), meals };
    }
    if (type.kind === 'hidratacao') {
      const hours = {}; for (const r of recs) if (r.time) { const h = r.time.slice(0, 2); hours[h] = (hours[h] || 0) + r.data.liters; }
      out.hydration = { avgLiters: out.summary.avgPerDayWithData !== null && ver.unit === 'ml' ? r2(out.summary.avgPerDayWithData / 1000) : out.summary.avgPerDayWithData, byHour: Object.entries(hours).map(([h, l]) => ({ hour: h, liters: r2(l) })).sort((a, b) => a.hour.localeCompare(b.hour)) };
    }
    if (type.kind === 'sono') {
      const toMin = (x) => { if (!x) return null; const [h, m] = x.split(':').map(Number); let v2 = h * 60 + m; return v2; };
      const beds = recs.map((r) => toMin(r.data.bed_time)).filter((x) => x !== null).map((x) => (x < 720 ? x + 1440 : x));
      const wakes = recs.map((r) => toMin(r.data.wake_time)).filter((x) => x !== null);
      const fmt = (m) => (m === null ? null : `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`);
      const mb = avg(beds); const sd = beds.length > 1 ? Math.sqrt(avg(beds.map((x) => (x - mb) ** 2))) : null;
      out.sleep = { avgHours: r2(avg(recs.map((r) => r.data.hours))), prevAvgHours: r2(avg(prevRecs.map((r) => r.data.hours))), avgQuality: r1(avg(recs.filter((r) => r.data.quality).map((r) => r.data.quality))), avgBed: fmt(mb), avgWake: fmt(avg(wakes)), bedStdMin: sd === null ? null : Math.round(sd) };
    }
    if (type.kind === 'corpo') {
      out.body = { series: db.all("SELECT date, data FROM records WHERE kind = 'corpo' AND date >= ? ORDER BY date, id", from).map((r) => ({ date: r.date, weight: JSON.parse(r.data).weight_kg })) };
    }
    if (type.kind === 'sessao') {
      out.sessions = { count: recs.length, prevCount: prevRecs.length, minutes: sum(recs.map((r) => r.data.minutes || 0)), quantity: sum(recs.map((r) => r.data.quantity || 0)), notes: recs.filter((r) => r.data.description).slice(0, 10).map((r) => ({ date: r.date, text: r.data.description })) };
    }
    // campos personalizados definidos pelo usuário (somente valores registrados)
    if (goal.custom_fields && goal.custom_fields.length) {
      out.custom = goal.custom_fields.map((f) => {
        const vals = recs.map((r) => r.data.custom?.[f.key]).filter((x) => x !== undefined && x !== null && x !== '');
        if (f.type === 'number') { const nums = vals.map(Number).filter(Number.isFinite); return { ...f, count: nums.length, total: r2(sum(nums)), avg: nums.length ? r2(sum(nums) / nums.length) : null, last: nums.length ? nums[nums.length - 1] : null }; }
        return { ...f, count: vals.length, recent: vals.slice(-5).reverse() };
      });
    }
    return out;
    function versionAt(g, d) { return engine.versionAt(g, d); }
  }

  function weeksOf(from, to) { const out = []; for (let ws = mondayOf(from); ws <= to; ws = addDays(ws, 7)) out.push(ws); return out; }
  function trendOf(cur, prev) {
    if (cur === null || prev === null) return 'sem-dados';
    const d = cur - prev;
    if (Math.abs(d) < 0.05) return 'estavel';
    return d > 0 ? 'evoluindo' : 'regredindo';
  }

  function radar(offsets) {
    const t = engine.today();
    return offsets.map((off) => {
      const d = addDays(t, -off);
      const xp = cumulativeXp(d);
      return { offset: off, date: d, values: R.ATTRIBUTES.map((a) => { const lv = R.attributeLevel(a, xp[a]); return r2(lv.level + lv.progress); }), xp: R.ATTRIBUTES.map((a) => xp[a]) };
    });
  }

  return { overview, goalStats, goalSeries, weeklyAverages, radar };
}

module.exports = { createStats };
