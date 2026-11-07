'use strict';
const crypto = require('node:crypto');
const R = require('./rules');
const C = require('./catalog');
const G = require('./goaltypes');
const RK = require('./records');
const ai = require('./ai');
const IP = require('./interpret');
const { bad, notFound, HttpError, v, addDays, daysBetween, mondayOf, weekday } = require('./util');

function buildRoutes(db, engine, stats) {
  const routes = [];
  const route = (method, pattern, handler) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, handler });
  };
  const rate = new Map();
  // Avaliações da IA ficam no servidor; o cliente só referencia o token (a nota não pode ser forjada).
  const evaluations = new Map();
  const analyses = new Map(); // token → análise validada no servidor (o cliente nunca envia pesos/atributos)
  function storeAnalysis(type, analysis, source) {
    const token = crypto.randomBytes(16).toString('hex');
    analyses.set(token, { type, analysis, source, expires: Date.now() + 3 * 3600 * 1000 });
    for (const [k, e] of analyses) if (e.expires < Date.now()) analyses.delete(k);
    return token;
  }
  function catalogForAi() {
    return Object.entries(G.GOAL_TYPES).map(([k, t]) => ({ type: k, nome: t.name, unidades: Object.keys(t.units), frequencias: t.periods, modos: t.modes || ['min'], registro: t.kind, marco: !!t.milestone, precisa: t.needs || [] }))
      .map((c) => ({ ...c, units: c.unidades }));
  }
  function cacheGet(key) { const r = db.one('SELECT result FROM goal_analysis_cache WHERE key = ?', key); return r ? JSON.parse(r.result) : null; }
  function cacheSet(key, val) { db.run('INSERT OR REPLACE INTO goal_analysis_cache (key, result) VALUES (?, ?)', key, JSON.stringify(val)); }
  /** Converte o rascunho da IA para o formato do servidor, validando com as mesmas regras de criação. */
  function draftFromAi(d, today) {
    const T = G.GOAL_TYPES[d.type];
    if (!T) return null;
    const body = {
      type: d.type, name: d.name, period: T.periods.includes(d.period) ? d.period : T.periods[0], target: d.target, unit: d.unit, mode: d.mode,
      days: d.days, params: { exercise: d.exercise || undefined, subject: d.subject || undefined, unit_label: d.unit_label || undefined },
      deadline: d.deadline_days ? addDays(today, Math.max(7, Math.min(730, d.deadline_days))) : (d.period === 'total' ? addDays(today, 90) : null),
      custom_fields: (d.custom_fields || []).map((f) => ({ label: f.label, type: f.type, unit: f.unit })),
    };
    try { const g = readGoal(body); return { ...g, name: g.label }; } catch { return null; }
  }
  function rateLimit(key, max, windowMs) {
    const now = Date.now();
    const arr = (rate.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) throw new HttpError(429, 'Muitas solicitações à IA em pouco tempo. Aguarde um minuto.');
    arr.push(now); rate.set(key, arr);
  }
  const dateNotFuture = (d, name = 'data') => {
    const date = v.date(d, name);
    const t = engine.today();
    if (date > t) throw bad('A data não pode estar no futuro.');
    if (daysBetween(date, t) > 365) throw bad('Data muito antiga.');
    return date;
  };
  function validTz(tz) {
    if (!tz) return 'America/Sao_Paulo';
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return String(tz).slice(0, 60); } catch { throw bad('Fuso horário inválido.'); }
  }

  // ================= Configuração e estado =================
  const catalog = () => ({
    types: Object.fromEntries(Object.entries(G.GOAL_TYPES).map(([k, t]) => [k, {
      name: t.name, group: t.group, weights: t.weights, budget: t.budget, kind: t.kind, params: t.params || {},
      units: Object.keys(t.units), periods: t.periods, modes: t.modes || ['min'], accumulate: !!t.accumulate, milestone: t.milestone || null, needs: t.needs || [], optional: t.optional || [],
    }])),
    groups: G.GROUPS, units: G.UNITS, periods: G.PERIODS, modes: G.MODES, templates: G.TEMPLATES,
    kinds: Object.fromEntries(Object.entries(RK.KINDS).map(([k, x]) => [k, { name: x.name, shared: x.shared }])),
    meals: RK.MEALS, muscleGroups: RK.MUSCLE_GROUPS,
  });
  const lootTable = () => ({
    boss: { chance: C.LOOT.boss.chance / 100, rarities: Object.fromEntries(Object.entries(C.LOOT.boss.weights).map(([k, w]) => [k, w / 100])) },
    final: { chance: C.LOOT.final.chance / 100, rarities: Object.fromEntries(Object.entries(C.LOOT.final.weights).map(([k, w]) => [k, w / 100])) },
    exclusiveShare: C.LOOT.exclusiveShare / 100,
  });
  const cosmetics = () => ({ rarities: C.RARITIES, slots: C.SLOTS, appearance: C.APPEARANCE, loot: lootTable(), archetypes: Object.fromEntries(Object.values(C.BOSS_ARCHETYPES).map((a) => [a.archetype, a.names[0]]).concat([['tyrant', 'Tirano da Inconstância']])), sets: Object.values(C.SETS), items: C.ITEMS.map((i) => ({ id: i.id, slot: i.slot, name: i.name, rarity: i.rarity, d: i.d, set: i.set })) });
  route('GET', '/api/config', () => ({
    app: 'EvoRPG', ai: ai.enabled(), model: ai.enabled() ? ai.model() : null, hasProfile: !!engine.profile(), migratedFrom: db.migratedFrom ? true : false,
    attributes: R.ATTRIBUTE_INFO, streakTable: R.STREAK_TABLE, limits: R.LIMITS, catalog: catalog(), cosmetics: cosmetics(),
  }));

  function state() {
    const p = engine.profile();
    if (!p) return { profile: null };
    const s = engine.streakSeries();
    const t = engine.today();
    const cyc = engine.cycleView(engine.ensureCycle(mondayOf(t)));
    return {
      profile: { name: p.name, timezone: p.timezone, created_at: p.created_at, created_on: p.created_on, rest_weekdays: restWeekdaysNow() },
      appearance: p.character,
      titleName: p.character.title && C.ITEM_BY_ID[p.character.title] ? C.ITEM_BY_ID[p.character.title].name : null,
      equippedRarity: Math.max(1, ...Object.values(p.character).map((id) => C.ITEM_BY_ID[id]?.rarity).filter(Boolean).map((r) => C.RARITY[r].tier)),
      goalsCount: engine.loadGoals().filter((g) => engine.goalStatus(g, t) === 'ativa').length,
      ...engine.attributesSummary(),
      coins: engine.coinBalance(),
      streak: {
        current: s.current, best: s.best, multiplier: R.streakMultiplier(s.current), next: R.nextStreakTier(s.current),
        lastBreak: s.lastBreak, lostStreak: s.streakBeforeBreak,
        last14: s.days.slice(-14).map((d) => ({ date: d.date, status: d.status })),
      },
      today: engine.dayView(t),
      pendingDays: engine.pendingDays(),
      cycle: {
        id: cyc.id, week_start: cyc.week_start, week_end: cyc.week_end, daysLeft: cyc.daysLeft, ended: cyc.ended, configOpen: cyc.configOpen,
        average: cyc.average, included: cyc.included, threshold: cyc.threshold,
        bosses: cyc.bosses.map((b) => ({ slot: b.slot, name: b.name, goal: b.goal ? { name: b.goal.name, pct: b.goal.pct } : null, status: b.status })),
        final: { status: cyc.final.status },
      },
      newAchievements: db.all('SELECT key, unlocked_at FROM achievements WHERE seen = 0').map((a) => ({ ...C.ACH_BY_KEY[a.key], ...a })),
      ai: ai.enabled(),
    };
  }
  function restWeekdaysNow() {
    const t = engine.today();
    let w = []; let next = null;
    for (const r of db.all('SELECT * FROM rest_rules ORDER BY effective_from')) {
      if (r.effective_from <= t) w = JSON.parse(r.weekdays); else next = { from: r.effective_from, weekdays: JSON.parse(r.weekdays) };
    }
    return { current: w, next };
  }
  route('GET', '/api/state', () => state());
  route('POST', '/api/achievements/seen', () => { db.run('UPDATE achievements SET seen = 1'); return { ok: true }; });

  route('POST', '/api/profile', ({ body }) => {
    if (engine.profile()) throw bad('O perfil já existe.');
    const name = v.str(body.name, 'nome', { required: true, max: 40 });
    const tz = validTz(body.timezone);
    const { todayIn } = require('./util');
    const t = db.fakeToday || todayIn(tz);
    db.run('INSERT INTO profile (id, name, timezone, character, created_on) VALUES (1, ?, ?, ?, ?)', name, tz, JSON.stringify(C.DEFAULT_CHARACTER), t);
    for (const id of C.FREE_ITEMS) db.run("INSERT OR IGNORE INTO inventory (item_id, source) VALUES (?, 'inicial')", id);
    engine.invalidate();
    return state();
  });
  route('PUT', '/api/profile', ({ body }) => {
    const p = engine.requireProfile();
    const name = body.name !== undefined ? v.str(body.name, 'nome', { required: true, max: 40 }) : p.name;
    const tz = body.timezone !== undefined ? validTz(body.timezone) : p.timezone;
    let effective = null;
    db.tx(() => {
      db.run('UPDATE profile SET name = ?, timezone = ? WHERE id = 1', name, tz);
      if (body.rest_weekdays !== undefined) {
        if (!Array.isArray(body.rest_weekdays)) throw bad('Dias de descanso inválidos.');
        const rest = [...new Set(body.rest_weekdays.map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
        if (rest.length > 2) throw bad('Defina no máximo 2 dias de descanso semanais.');
        if (JSON.stringify(rest) !== JSON.stringify(restWeekdaysNow().current) || restWeekdaysNow().next) {
          effective = engine.changeEffectiveDate();
          db.run('INSERT INTO rest_rules (effective_from, weekdays) VALUES (?, ?) ON CONFLICT(effective_from) DO UPDATE SET weekdays = excluded.weekdays', effective, JSON.stringify(rest));
          if (effective <= engine.today()) engine.recomputeFrom(effective);
        }
      }
    });
    return { ...state(), restEffective: effective };
  });

  // ================= Metas =================
  function readGoal(body, existing) {
    const type = existing ? existing.type : v.oneOf(body.type, 'categoria', Object.keys(G.GOAL_TYPES));
    const T = G.GOAL_TYPES[type];
    const t = engine.today();
    const period = v.oneOf(body.period, 'frequência', T.periods);
    const unit = period === 'times_per_week' ? 'sessoes' : v.oneOf(body.unit, 'unidade', Object.keys(T.units));
    if (!(unit in T.units)) throw bad('Unidade inválida para esta categoria.');
    const U = G.UNITS[unit];
    const mode = v.oneOf(body.mode, 'tipo de meta', T.modes || ['min'], { required: false, fallback: (T.modes || ['min'])[0] });
    let target = v.num(body.target, 'valor-alvo', { min: 0.01, max: 1e6, required: true });
    let deadline = body.deadline ? v.date(body.deadline, 'prazo') : null;
    if (period === 'total' && !deadline) throw bad('Metas "até o prazo" precisam de uma data de prazo.');
    if (deadline && !existing && deadline < t) throw bad('O prazo não pode estar no passado.');
    if (deadline && daysBetween(t, deadline) > 730) throw bad('Prazo máximo de 2 anos.');
    if (period === 'times_per_week') {
      if (!Number.isInteger(target) || target < 1 || target > 7) throw bad('Escolha de 1 a 7 vezes por semana.');
    } else if (!T.milestone) {
      const created = existing ? existing.created_on : t;
      const td = deadline ? Math.max(1, daysBetween(created, deadline) + 1) : 30;
      const perDay = period === 'daily' ? target : period === 'weekly' ? target / 7 : period === 'monthly' ? target / 30 : target / td;
      if (perDay > U.dayMax) throw bad(`Valor acima do limite aceito (${U.dayMax} ${U.label} por dia).`);
      if (period === 'daily' && target < U.min) throw bad(`Valor mínimo: ${U.min} ${U.label} por dia.`);
      if (U.int) target = Math.max(1, Math.round(target));
    } else if (target > U.dayMax) throw bad('Valor-alvo acima do limite.');
    let days = [];
    if (period === 'daily') days = Array.isArray(body.days) && body.days.length ? body.days : [0, 1, 2, 3, 4, 5, 6];
    else if (period === 'times_per_week') days = Array.isArray(body.days) ? body.days : [];
    days = [...new Set(days.map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
    if (period === 'daily' && !days.length) throw bad('Escolha ao menos um dia.');
    if (period === 'times_per_week' && days.length && days.length !== target) throw bad(`Escolha exatamente ${target} dia(s) ou nenhum (frequência livre).`);
    const params = {};
    for (const k of [...(T.needs || []), ...(T.optional || [])]) {
      const val = v.str(body.params?.[k], { exercise: 'exercício', subject: 'assunto' }[k] || k, { max: 60, required: (T.needs || []).includes(k) });
      if (val) params[k] = val;
    }
    if (['quantidade', 'tarefas', 'sessoes'].includes(unit) && body.params?.unit_label) {
      const lab = v.str(body.params.unit_label, 'rótulo da unidade', { max: 20 });
      if (lab && unit !== 'sessoes') params.unit_label = lab;
    }
    const custom_fields = readCustomFields(body.custom_fields);
    const criteria = Array.isArray(body.criteria) ? body.criteria.filter((c) => typeof c === 'string' && c.trim()).slice(0, 10).map((c) => c.trim().slice(0, 200)) : [];
    return {
      type, period, unit, mode, target, days, deadline, params, criteria, custom_fields,
      source_text: v.str(body.source_text, 'texto da meta', { max: 400 }),
      label: v.str(body.name ?? body.label, 'nome', { max: 60 }),
      description: v.str(body.description, 'descrição', { max: 500 }), objective: v.str(body.objective, 'objetivo', { max: 300 }), notes: v.str(body.notes, 'observações', { max: 500 }),
    };
  }
  function readCustomFields(list) {
    if (list === undefined || list === null) return [];
    if (!Array.isArray(list)) throw bad('Campos personalizados inválidos.');
    if (list.length > 6) throw bad('Máximo de 6 campos personalizados.');
    const seen = new Set();
    return list.map((f, i) => {
      const label = v.str(f?.label, `campo ${i + 1}`, { max: 40, required: true });
      let key = IP.norm(f.key || label).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || `campo_${i + 1}`;
      while (seen.has(key)) key += '_';
      seen.add(key);
      return { key, label, type: f.type === 'text' ? 'text' : 'number', unit: v.str(f.unit, 'unidade do campo', { max: 15 }) || null };
    });
  }
  /** Análise que será gravada na meta: a do token (se corresponder à mesma categoria) ou a análise local. */
  function analysisFor(g, token) {
    const entry = token ? analyses.get(token) : null;
    if (entry && entry.type === g.type) return { analysis: entry.analysis, source: entry.source };
    const text = g.source_text || [g.label, g.description, g.objective].filter(Boolean).join('. ');
    return { analysis: IP.analyzeLocal(g, text), source: 'local' };
  }
  function insertGoal(g, t, token) {
    const T = G.GOAL_TYPES[g.type];
    const active = engine.loadGoals().filter((x) => engine.goalStatus(x, t) === 'ativa');
    // Evita XP duplicado: duas metas da mesma categoria leriam os mesmos registros compartilhados.
    if (RK.KINDS[T.kind].shared && active.some((x) => x.type === g.type && JSON.stringify(x.params) === JSON.stringify(g.params))) {
      throw bad(`Você já tem uma meta ativa de ${T.name}${g.params.exercise ? ` para ${g.params.exercise}` : ''}. Ajuste a existente para evitar contar os mesmos registros duas vezes.`);
    }
    if (active.length >= 40) throw bad('Limite de 40 metas ativas.');
    const { analysis, source } = analysisFor(g, token);
    const id = Number(db.run(`INSERT INTO goals (type, label, description, objective, notes, criteria, deadline, params, created_on, source_text, weights, analysis, analysis_source, xp_factor, custom_fields)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    g.type, g.label, g.description, g.objective, g.notes, JSON.stringify(g.criteria), g.deadline, JSON.stringify(g.params), t,
    g.source_text, JSON.stringify(analysis.weights), JSON.stringify(analysis), source, analysis.xp_factor || 1, JSON.stringify(g.custom_fields || [])).lastInsertRowid);
    db.run('INSERT INTO goal_versions (goal_id, effective_from, period, target, unit, mode, days, reason) VALUES (?,?,?,?,?,?,?,?)',
      id, t, g.period, g.target, g.unit, g.mode, JSON.stringify(g.days), 'Criação');
    return id;
  }

  route('GET', '/api/goals', ({ query }) => { engine.requireProfile(); return engine.goalsView({ includeEnded: query.all === '1' }); });
  route('POST', '/api/goals/preview', ({ body }) => {
    const g = readGoal(body);
    const ver = { ...g, effective_from: '0000-01-01' };
    const an = analysisFor(g, body.analysis_token).analysis;
    const fake = { id: 0, type: g.type, created_on: engine.today(), deadline: g.deadline, params: g.params, weights: an.weights, xp_factor: an.xp_factor };
    return { targets: engine.describe(ver, G.GOAL_TYPES[g.type], fake), rewards: engine.rewardsInfo(fake, ver) };
  });
  route('POST', '/api/goals', ({ body }) => {
    engine.requireProfile();
    const g = readGoal(body);
    const t = engine.today();
    let id;
    const evalEntry = body.evaluation_token ? evaluations.get(body.evaluation_token) : null;
    db.tx(() => {
      id = insertGoal(g, t, body.analysis_token);
      if (evalEntry) db.run('UPDATE goals SET ai_score = ?, ai_evaluation = ? WHERE id = ?', evalEntry.ev.score, JSON.stringify(evalEntry.ev), id);
      engine.recomputeFrom(t);
      engine.syncMilestones();
    });
    if (body.evaluation_token) evaluations.delete(body.evaluation_token);
    if (body.analysis_token) analyses.delete(body.analysis_token);
    return { id, cycleNote: t === mondayOf(t) ? 'Entra no ciclo desta semana.' : 'Começa a contar XP hoje e entra nos chefes a partir do próximo ciclo.' };
  });
  route('PUT', '/api/goals/:id', ({ params, body }) => {
    const id = v.id(params.id);
    const t = engine.today();
    const goal = engine.loadGoals().find((g) => g.id === id && (!g.archived_on || g.archived_on > t));
    if (!goal) throw notFound('Meta não encontrada.');
    const g = readGoal(body, goal);
    const effective = goal.created_on === t ? t : engine.changeEffectiveDate();
    const reason = v.str(body.reason, 'motivo', { max: 200 });
    if ((g.deadline || null) !== (goal.deadline || null) && goal.versions[goal.versions.length - 1].period === 'total' && effective > t) {
      throw bad('O prazo de metas "até o prazo" só pode ser alterado no dia de configuração do ciclo (segunda-feira) ou no dia da criação.');
    }
    if (JSON.stringify({ ...g.params, unit_label: undefined }) !== JSON.stringify({ ...goal.params, unit_label: undefined })) throw bad('O exercício/assunto vinculado não pode ser alterado. Crie uma nova meta.');
    db.tx(() => {
      db.run('UPDATE goals SET label = ?, description = ?, objective = ?, notes = ?, criteria = ?, deadline = ?, custom_fields = ? WHERE id = ?', g.label, g.description, g.objective, g.notes, JSON.stringify(g.criteria), g.deadline, JSON.stringify(body.custom_fields !== undefined ? g.custom_fields : goal.custom_fields), id);
      db.run(`INSERT INTO goal_versions (goal_id, effective_from, period, target, unit, mode, days, reason) VALUES (?,?,?,?,?,?,?,?)
              ON CONFLICT(goal_id, effective_from) DO UPDATE SET period=excluded.period, target=excluded.target, unit=excluded.unit, mode=excluded.mode, days=excluded.days, reason=excluded.reason, created_at=datetime('now')`,
      id, effective, g.period, g.target, g.unit, g.mode, JSON.stringify(g.days), reason || 'Alteração');
      if (effective <= t) engine.recomputeFrom(effective);
      engine.syncMilestones();
    });
    return { effective_from: effective, immediate: effective <= t };
  });
  route('DELETE', '/api/goals/:id/pending', ({ params }) => {
    const id = v.id(params.id);
    const t = engine.today();
    const r = db.run('DELETE FROM goal_versions WHERE goal_id = ? AND effective_from > ?', id, t);
    if (!r.changes) throw notFound('Não há alteração agendada.');
    return { ok: true };
  });
  route('DELETE', '/api/goals/:id', ({ params }) => {
    const id = v.id(params.id);
    const t = engine.today();
    const goals = engine.loadGoals().filter((g) => !g.archived_on || g.archived_on > t);
    const goal = goals.find((g) => g.id === id);
    if (!goal) throw notFound('Meta não encontrada.');
    const cyc = db.one('SELECT * FROM cycles WHERE week_start = ?', mondayOf(t));
    if (cyc && (cyc.boss1_goal === id || cyc.boss2_goal === id) && t > cyc.week_start) throw bad('Esta meta está vinculada a um chefe deste ciclo. Remova-a após o fim da semana.');
    db.tx(() => {
      db.run('UPDATE goals SET archived_on = ? WHERE id = ?', t, id);
      engine.recomputeFrom(t);
    });
    return { ok: true, note: 'A meta foi encerrada (cancelada): não gera penalidades. Se fazia parte do ciclo atual, continua no cálculo do Boss Final desta semana para preservar a integridade.' };
  });
  route('POST', '/api/goals/evaluate', async ({ body, ip }) => {
    engine.requireProfile();
    const g = readGoal(body);
    rateLimit(`ai:${ip}`, 8, 60000);
    const T = G.GOAL_TYPES[g.type];
    const ver = { ...g, effective_from: '0000-01-01' };
    const tg = engine.describe(ver, T);
    const ev = await ai.evaluateGoal({
      tipo: T.name, categoria: G.GROUPS[T.group].name, frequencia: G.PERIODS[g.period], quantidade: g.target, unidade: G.UNITS[g.unit].label,
      modo: G.MODES[g.mode], dias_programados: g.days.map((d) => ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d]),
      meta_diaria_calculada: tg.day, meta_semanal_calculada: tg.week, meta_mensal_estimada: tg.month,
      nome: v.str(body.name, 'nome', { max: 60 }), descricao: v.str(body.description, 'descrição', { max: 500 }), objetivo: v.str(body.objective, 'objetivo', { max: 300 }),
      prazo: g.deadline, criterios_de_conclusao: g.criteria, parametros: g.params,
      regras_do_sistema: { atributos_afetados: T.weights, xp_semanal_referencia: T.budget, observacao: 'definidos pelo aplicativo' },
      contexto_do_usuario: v.str(body.context, 'contexto', { max: 400 }),
    });
    const token = crypto.randomBytes(16).toString('hex');
    evaluations.set(token, { ev, expires: Date.now() + 2 * 3600 * 1000 });
    for (const [k, e] of evaluations) if (e.expires < Date.now()) evaluations.delete(k);
    return { token, evaluation: ev };
  });

  /**
   * Criação simplificada: o usuário escreve a meta com as próprias palavras. O servidor interpreta (IA, se
   * configurada; senão, interpretador local), valida o rascunho e devolve uma análise individual com a
   * distribuição de XP entre atributos. O usuário confere/ajusta os campos; os atributos não são editáveis.
   */
  route('POST', '/api/goals/interpret', async ({ body, ip }) => {
    engine.requireProfile();
    const text = v.str(body.text, 'meta', { max: 400, required: true });
    if (text.length < 3) throw bad('Descreva a meta com um pouco mais de detalhe.');
    const t = engine.today();
    const local = IP.interpretLocal(text, t);
    let draft = { ...local.draft, label: local.draft.name };
    try { draft = { ...readGoal({ ...local.draft, source_text: text }), name: local.draft.name }; } catch { /* mantém o rascunho local para o usuário ajustar */ }
    let analysis = IP.analyzeLocal(draft, text, local);
    let source = 'local'; let assumed = local.assumed; let aiError = null;
    if (ai.enabled()) {
      const key = `interp:${IP.analysisKey({ type: '', period: '', unit: '', target: 0, name: text }, text)}`;
      try {
        let out = cacheGet(key);
        if (!out) { rateLimit(`ai:${ip}`, 10, 60000); out = await ai.interpretGoal({ text, catalog: catalogForAi(), today: t }); cacheSet(key, out); }
        const d2 = draftFromAi(out.draft, t);
        if (d2) { draft = d2; assumed = []; }
        analysis = IP.sanitizeAiAnalysis(out.analysis, draft, IP.analyzeLocal(draft, text, local));
        source = 'ia';
      } catch (e) { aiError = e.message; }
    }
    draft.source_text = text;
    const token = storeAnalysis(draft.type, analysis, source);
    return { token, source, aiError, assumed, vague: local.vague, draft, analysis, type: G.GOAL_TYPES[draft.type] ? { name: G.GOAL_TYPES[draft.type].name, kind: G.GOAL_TYPES[draft.type].kind } : null };
  });
  /** Reanálise após o usuário ajustar categoria, quantidade ou frequência. */
  route('POST', '/api/goals/analyze', async ({ body, ip }) => {
    engine.requireProfile();
    const g = readGoal(body);
    const text = g.source_text || [g.label, g.description, g.objective].filter(Boolean).join('. ');
    const local = IP.analyzeLocal(g, text);
    let analysis = local; let source = 'local'; let aiError = null;
    if (ai.enabled() && body.use_ai !== false) {
      const key = `an:${IP.analysisKey(g, text)}`;
      try {
        let out = cacheGet(key);
        if (!out) { rateLimit(`ai:${ip}`, 10, 60000); out = await ai.interpretGoal({ text: text || G.GOAL_TYPES[g.type].name, catalog: catalogForAi(), today: engine.today(), draft: { type: g.type, period: g.period, target: g.target, unit: g.unit, mode: g.mode, days: g.days, params: g.params } }); cacheSet(key, out); }
        analysis = IP.sanitizeAiAnalysis(out.analysis, g, local); source = 'ia';
      } catch (e) { aiError = e.message; }
    }
    return { token: storeAnalysis(g.type, analysis, source), source, aiError, analysis };
  });

  // ================= Registro diário =================
  route('GET', '/api/day', ({ query }) => {
    engine.requireProfile();
    return engine.dayView(query.date ? v.date(query.date, 'data') : engine.today());
  });
  route('POST', '/api/goals/:id/entry', ({ params, body }) => {
    engine.requireProfile();
    const status = v.oneOf(body.status, 'situação', ['missed', 'excused', 'clear']);
    return engine.setEntry(v.id(params.id), { date: v.date(body.date, 'data'), status, note: v.str(body.note, 'observação', { max: 300 }) });
  });
  route('GET', '/api/history', ({ query }) => {
    engine.requireProfile();
    const t = engine.today();
    const to = query.to ? v.date(query.to, 'até') : t;
    const from = query.from ? v.date(query.from, 'de') : addDays(to, -29);
    if (daysBetween(from, to) > 366) throw bad('Intervalo máximo de 1 ano.');
    const s = engine.streakSeries();
    const xp = db.all("SELECT ukey, amount FROM xp_events WHERE day BETWEEN ? AND ? AND source IN ('goal','penalty')", from, to);
    const xpBy = new Map();
    for (const e of xp) { const parts = e.ukey.split(':'); const k = `${parts[1]}|${parts[2]}`; xpBy.set(k, (xpBy.get(k) || 0) + e.amount); }
    return {
      from, to,
      days: s.days.filter((d) => d.date >= from && d.date <= to).reverse().map((d) => ({
        date: d.date, status: d.status, streak: d.streak, counts: d.counts, multiplier: d.multiplier,
        items: d.evals.filter((x) => x.ev.state !== 'pending' || x.ev.commitment).map((x) => ({
          goal: engine.goalName(x.goal), type: x.goal.type, unit: x.ver.unit, period: x.ver.period, target: x.ver.target, mode: x.ver.mode,
          state: x.ev.state, value: x.ev.value, commitment: x.ev.commitment, note: x.ev.entry?.note || null, xp: xpBy.get(`${x.goal.id}|${d.date}`) || 0,
        })),
      })),
    };
  });

  route('GET', '/api/rest-days', () => db.all('SELECT * FROM rest_days ORDER BY date DESC LIMIT 100'));
  route('POST', '/api/rest-days', ({ body }) => {
    engine.requireProfile();
    const date = v.date(body.date, 'data');
    const t = engine.today();
    if (daysBetween(date, t) > 30 || daysBetween(t, date) > 90) throw bad('Escolha uma data entre 30 dias atrás e 90 dias à frente.');
    db.tx(() => {
      db.run('INSERT OR REPLACE INTO rest_days (date, reason, created_on) VALUES (?, ?, ?)', date, v.str(body.reason, 'motivo', { max: 120 }), t);
      if (date <= t) engine.recomputeFrom(date);
    });
    return { ok: true, reducesTarget: date > t };
  });
  route('DELETE', '/api/rest-days/:date', ({ params }) => {
    const date = v.date(params.date, 'data');
    db.tx(() => { db.run('DELETE FROM rest_days WHERE date = ?', date); if (date <= engine.today()) engine.recomputeFrom(date); });
    return { ok: true };
  });

  // ================= Ciclos e chefes =================
  route('GET', '/api/cycles', () => {
    engine.requireProfile();
    const t = engine.today();
    const ws = mondayOf(t);
    const first = db.one('SELECT MIN(created_on) d FROM goals').d;
    if (first) for (let w = mondayOf(first); w < ws; w = addDays(w, 7)) engine.ensureCycle(w);
    const current = engine.cycleView(engine.ensureCycle(ws));
    const next = engine.cycleView(engine.ensureCycle(addDays(ws, 7)));
    const history = db.all('SELECT * FROM cycles WHERE week_start < ? ORDER BY week_start DESC LIMIT 12', ws).map((c) => engine.cycleView(c));
    return { current, next, history };
  });
  route('PUT', '/api/cycles/bosses', ({ body }) => {
    engine.requireProfile();
    const ws = v.date(body.week_start, 'semana');
    if (ws !== mondayOf(ws)) throw bad('Semana inválida.');
    const slot = v.num(body.slot, 'chefe', { min: 1, max: 2, int: true, required: true });
    const goalId = body.goal_id === null || body.goal_id === '' ? null : v.id(body.goal_id, 'meta');
    return engine.selectBoss(ws, slot, goalId);
  });
  route('POST', '/api/cycles/:id/suspend', ({ params, body }) => engine.suspendGoal(v.id(params.id), v.id(body.goal_id, 'meta'), v.str(body.reason, 'motivo', { max: 300, required: true })));
  route('POST', '/api/cycles/:id/fight', ({ params, body }) => engine.fight(v.id(params.id), v.oneOf(body.which, 'chefe', ['b1', 'b2', 'final'])));
  route('GET', '/api/cycles/:id/report', ({ params }) => engine.cycleReport(v.id(params.id)));
  route('POST', '/api/cycles/:id/ai-report', async ({ params, ip }) => {
    const id = v.id(params.id);
    const c = db.one('SELECT * FROM cycles WHERE id = ?', id);
    if (!c) throw notFound('Ciclo não encontrado.');
    if (engine.today() <= c.week_end) throw bad('A análise fica disponível depois do fim da semana.');
    if (c.ai_report) return JSON.parse(c.ai_report);
    rateLimit(`ai:${ip}`, 8, 60000);
    const rep = engine.cycleReport(id);
    const out = await ai.bossReport(rep, rep.final.status);
    db.run('UPDATE cycles SET ai_report = ? WHERE id = ?', JSON.stringify(out), id);
    return out;
  });

  // ================= Personagem, loja e conquistas =================
  function ownedSet() { return new Set(db.all('SELECT item_id FROM inventory').map((r) => r.item_id)); }
  const APP_FIELDS = { body: Object.keys(C.APPEARANCE.bodies), eyes: Object.keys(C.APPEARANCE.eyes), face: Object.keys(C.APPEARANCE.faces), hair: Object.keys(C.APPEARANCE.hair), beard: Object.keys(C.APPEARANCE.beards), skin: C.APPEARANCE.skins, hairColor: C.APPEARANCE.hairColors, eyeColor: C.APPEARANCE.eyeColors };
  const TWO_HANDED = new Set(['greatsword', 'odachi', 'scythe', 'bow', 'quarterstaff', 'magmablade', 'staff', 'vinestaff', 'astralstaff', 'lanternstaff', 'trident', 'clockspear']);
  /** Armas de duas mãos não combinam com escudo: o servidor ajusta e informa. */
  function handsRule(ch, body) {
    const w = C.ITEM_BY_ID[ch.weapon];
    const two = w && (TWO_HANDED.has(w.d.t) || w.d.big);
    if (!two || !ch.shield) return null;
    if (body.shield) { ch.weapon = 'wpn_training'; const owned = ownedSet(); if (!owned.has('wpn_training')) ch.weapon = null; return 'Escudo equipado: a arma de duas mãos foi trocada pela espada de treino.'; }
    ch.shield = null;
    return `${w.name} usa as duas mãos: o escudo foi guardado.`;
  }
  route('PUT', '/api/character', ({ body }) => {
    const p = engine.requireProfile();
    const owned = ownedSet();
    const ch = { ...p.character };
    for (const [field, opts] of Object.entries(APP_FIELDS)) {
      if (body[field] === undefined) continue;
      if (!opts.includes(body[field])) throw bad(`Opção inválida para ${field}.`);
      ch[field] = body[field];
    }
    for (const slot of Object.keys(C.SLOTS)) {
      if (body[slot] === undefined) continue;
      if (body[slot] === null) { if (['chest', 'legs', 'boots', 'weapon', 'title'].includes(slot)) throw bad('Este espaço não pode ficar vazio.'); ch[slot] = null; continue; }
      const item = C.ITEM_BY_ID[body[slot]];
      if (!item || item.slot !== slot) throw bad(`Item inválido para ${C.SLOTS[slot]}.`);
      if (!owned.has(item.id)) throw bad(`Você ainda não possui "${item.name}".`);
      ch[slot] = item.id;
    }
    const note = handsRule(ch, body);
    db.run('UPDATE profile SET character = ? WHERE id = 1', JSON.stringify(ch));
    return { character: ch, note };
  });
  route('POST', '/api/character/set', ({ body }) => {
    const p = engine.requireProfile();
    const set = C.SETS[body.set];
    if (!set) throw notFound('Conjunto não encontrado.');
    const owned = ownedSet();
    const ch = { ...p.character };
    let n = 0;
    for (const id of set.items) if (owned.has(id)) { ch[C.ITEM_BY_ID[id].slot] = id; n++; }
    if (!n) throw bad('Você ainda não possui nenhuma peça deste conjunto.');
    const slots = new Set(set.items.map((id) => C.ITEM_BY_ID[id].slot));
    if (!slots.has('shield')) ch.shield = null; // a skin completa substitui o visual anterior
    for (const sl of ['head', 'mask', 'gloves', 'cape', 'effect']) if (!slots.has(sl) && set.items.length >= 6) ch[sl] = null;
    const note = handsRule(ch, {});
    db.run('UPDATE profile SET character = ? WHERE id = 1', JSON.stringify(ch));
    return { character: ch, equipped: n, total: set.items.length, note };
  });
  const SOURCE_TEXT = (st) => {
    const out = [];
    if (st.shop) out.push('Loja');
    if (st.boss === 'any') out.push('Recompensa de qualquer chefe');
    else if (st.boss) out.push(`Exclusiva: ${st.boss === 'tyrant' ? 'Tirano da Inconstância (Boss Final)' : (Object.values(C.BOSS_ARCHETYPES).find((a) => a.archetype === st.boss)?.names.join(' / ') || st.boss)}`);
    if (st.mission) out.push(`Missão: ${C.ACH_BY_KEY[st.mission].name}`);
    if (st.key === 'paladino') out.push('Derrotar 5 chefes');
    if (st.key === 'sombrio') out.push('ou nível 10 de personagem');
    return out;
  };
  function unlockText(u, it) {
    if (it && it.set && it.price === null) { const st = C.SETS[it.set]; if (st && !st.shop) return SOURCE_TEXT(st).join(' · '); }
    if (!u) return null;
    if (u.achievement) return `${C.ACH_BY_KEY[u.achievement].mission ? 'Missão' : 'Conquista'}: ${C.ACH_BY_KEY[u.achievement].name}`;
    if (u.level) return `Nível ${u.level} de personagem`;
    if (u.bosses) return `Derrotar ${u.bosses} chefes`;
    return null;
  }
  function setPrice(st, owned) {
    if (!st.shop) return null;
    const missing = st.items.map((id) => C.ITEM_BY_ID[id]).filter((i) => !owned.has(i.id));
    const full = missing.reduce((a, i) => a + (i.price || C.RARITY[i.rarity].price || 0), 0);
    return Math.round((full * C.SET_DISCOUNT) / 10) * 10;
  }
  route('GET', '/api/shop', () => {
    engine.requireProfile();
    const owned = ownedSet();
    return {
      coins: engine.coinBalance(),
      loot: lootTable(),
      items: C.ITEMS.map((i) => ({ ...i, owned: owned.has(i.id), unlockText: unlockText(i.unlock, i), rarityTier: C.RARITY[i.rarity].tier })),
      sets: Object.values(C.SETS).map((st) => {
        const have = st.items.filter((id) => owned.has(id)).length;
        return { ...st, owned: have, complete: have === st.items.length, rarityTier: C.RARITY[st.rarity].tier, price: have === st.items.length ? null : setPrice(st, owned), fullPrice: setPrice(st, new Set()), sources: SOURCE_TEXT(st) };
      }).sort((a, b) => a.rarityTier - b.rarityTier),
    };
  });
  route('POST', '/api/shop/buy', ({ body }) => {
    engine.requireProfile();
    const item = C.ITEM_BY_ID[body.item_id];
    if (!item) throw notFound('Item não encontrado.');
    if (item.price === null) throw bad(`Este item não é vendido (${unlockText(item.unlock, item) || 'evento especial'}).`);
    db.tx(() => {
      if (db.one('SELECT 1 FROM inventory WHERE item_id = ?', item.id)) throw bad('Você já possui este item.');
      if (engine.coinBalance() < item.price) throw bad('Moedas insuficientes.');
      engine.coinEvent(-item.price, { source: 'shop', day: engine.today(), reason: `Compra: ${item.name}`, ukey: `buy:${item.id}` });
      db.run("INSERT INTO inventory (item_id, source) VALUES (?, 'loja')", item.id);
      engine.checkAchievements();
    });
    return { ok: true, coins: engine.coinBalance() };
  });
  /** Compra da skin completa: paga apenas as peças que faltam, com desconto. Preço calculado no servidor. */
  route('POST', '/api/shop/buy-set', ({ body }) => {
    engine.requireProfile();
    const st = C.SETS[body.set];
    if (!st) throw notFound('Skin não encontrada.');
    if (!st.shop) throw bad(`Esta skin não é vendida (${SOURCE_TEXT(st).join(' · ')}).`);
    let price;
    db.tx(() => {
      const owned = ownedSet();
      price = setPrice(st, owned);
      const missing = st.items.filter((id) => !owned.has(id));
      if (!missing.length) throw bad('Você já possui esta skin completa.');
      if (engine.coinBalance() < price) throw bad('Moedas insuficientes.');
      const n = db.one("SELECT COUNT(*) n FROM coin_events WHERE ukey LIKE ?", `buyset:${st.key}:%`).n;
      engine.coinEvent(-price, { source: 'shop', day: engine.today(), reason: `Compra da skin: ${st.name}`, ukey: `buyset:${st.key}:${n + 1}` });
      for (const id of missing) db.run("INSERT OR IGNORE INTO inventory (item_id, source) VALUES (?, 'loja')", id);
      engine.checkAchievements();
    });
    return { ok: true, paid: price, coins: engine.coinBalance() };
  });
  route('GET', '/api/drops', () => {
    engine.requireProfile();
    return db.all('SELECT d.*, c.week_start FROM reward_drops d JOIN cycles c ON c.id = d.cycle_id ORDER BY d.id DESC LIMIT 50').map((r) => ({
      week_start: r.week_start, which: r.which, dropped: !!r.dropped, rarity: r.rarity, coins: r.coins, detail: r.detail,
      skin: r.skin ? { key: r.skin, name: C.SETS[r.skin]?.name, rarity: C.SETS[r.skin]?.rarity } : null,
    }));
  });
  route('GET', '/api/achievements', () => {
    const got = new Map(db.all('SELECT * FROM achievements').map((a) => [a.key, a]));
    const m = engine.missionMetrics();
    return C.ACHIEVEMENTS.map((a) => ({
      ...a, itemName: a.item ? C.ITEM_BY_ID[a.item].name : null, titleName: a.title ? C.ITEM_BY_ID[a.title].name : null,
      skinName: a.skin ? C.SETS[a.skin].name : null, skinRarity: a.skin ? C.SETS[a.skin].rarity : null,
      progress: Math.min(a.target, m[a.metric] ?? 0), unlocked: got.has(a.key), unlocked_at: got.get(a.key)?.day || null,
    }));
  });

  // ================= Registros detalhados =================
  route('GET', '/api/records', ({ query }) => {
    engine.requireProfile();
    const t = engine.today();
    const to = query.to ? v.date(query.to, 'até') : t;
    const from = query.from ? v.date(query.from, 'de') : addDays(to, -30);
    if (query.goal_id) {
      const goal = engine.loadGoals().find((g) => g.id === Number(query.goal_id));
      if (!goal) throw notFound('Meta não encontrada.');
      return engine.recordsForGoal(goal, from, to, 300);
    }
    const kind = query.kind ? v.oneOf(query.kind, 'tipo', Object.keys(RK.KINDS)) : null;
    const rows = kind ? db.all('SELECT * FROM records WHERE kind = ? AND date BETWEEN ? AND ? ORDER BY date DESC, id DESC LIMIT 300', kind, from, to)
      : db.all('SELECT * FROM records WHERE date BETWEEN ? AND ? ORDER BY date DESC, id DESC LIMIT 300', from, to);
    return rows.map(engine.parseRecord);
  });
  route('GET', '/api/records/suggestions', () => {
    const recent = (kind, n = 200) => db.all('SELECT data FROM records WHERE kind = ? ORDER BY id DESC LIMIT ?', kind, n).map((r) => JSON.parse(r.data));
    const uniq = (arr) => [...new Map(arr.filter(Boolean).map((x) => [String(x).toLowerCase(), x])).values()].slice(0, 40);
    const forca = recent('forca');
    const lastByExercise = {};
    for (const d of forca) for (const e of d.exercises) if (!lastByExercise[e.name.toLowerCase()]) lastByExercise[e.name.toLowerCase()] = { name: e.name, group: e.group, sets: e.sets };
    return {
      exercises: Object.values(lastByExercise).slice(0, 60),
      books: uniq(recent('leitura').map((d) => d.book)).map((b) => ({ book: b, author: recent('leitura').find((d) => d.book === b)?.author || null })),
      subjects: uniq(recent('estudo').map((d) => d.subject)),
      lastWorkout: forca[0] || null,
    };
  });
  route('POST', '/api/records', ({ body }) => {
    engine.requireProfile();
    const kind = v.oneOf(body.kind, 'tipo de registro', Object.keys(RK.KINDS));
    return engine.addRecord({ kind, goalId: body.goal_id ? v.id(body.goal_id, 'meta') : null, date: v.date(body.date, 'data'), time: v.time(body.time, 'horário'), data: body.data, note: v.str(body.note, 'observações', { max: 500 }) });
  });
  route('PUT', '/api/records/:id', ({ params, body }) => engine.updateRecord(v.id(params.id), { date: v.date(body.date, 'data'), time: v.time(body.time, 'horário'), data: body.data, note: v.str(body.note, 'observações', { max: 500 }) }));
  route('DELETE', '/api/records/:id', ({ params }) => { engine.deleteRecord(v.id(params.id)); return { ok: true }; });

  // ================= Detalhes: análise com IA =================
  function dataPackage(goalId, period) {
    const st = stats.goalStats(goalId, period);
    if (!st) throw notFound('Meta não encontrada.');
    const g = st.goal;
    const pkg = {
      meta: { nome: g.name, categoria: g.typeName, definicao: g.targets.text, frequencia: G.PERIODS[g.version.period], unidade: st.unit, prazo: g.deadline, objetivo: g.objective, descricao: g.description, criterios: g.criteria, criada_em: g.created_on, status: g.status },
      periodo_analisado: st.period, hoje: engine.today(),
      resumo_calculado_pelo_servidor: st.summary || null, semanas: st.weeks || null, marco: st.milestone || null,
      serie_diaria_registrada: (st.daily || []).filter((d) => d.value !== null),
      especificos: { forca: st.strength ? { ...st.strength, exercicios: st.exercises } : undefined, cardio: st.cardio, leitura: st.reading, estudo: st.study, alimentacao: st.nutrition, hidratacao: st.hydration, sono: st.sleep, corpo: st.body, sessoes: st.sessions },
      registros_recentes: st.history.slice(0, 80).map((r) => ({ data: r.date, hora: r.time, campos: r.data, obs: r.note })),
      total_de_registros_no_periodo: st.recordCount,
    };
    return { pkg, st };
  }
  /** Relatório estruturado calculado sem IA (sempre disponível). */
  function computedReport(st) {
    const s2 = st.summary; const g = st.goal;
    const pos = []; const att = []; const tend = []; const recs = []; const lim = [];
    const stats2 = [];
    if (g.milestone) {
      const m = st.milestone;
      stats2.push({ rotulo: 'Valor atual', valor: m.current === null ? '—' : `${m.current} kg`, origem: 'registrado' }, { rotulo: 'Alvo', valor: `${m.target} kg`, origem: 'registrado' }, { rotulo: 'Progresso', valor: `${Math.round(m.pct * 100)}%`, origem: 'calculado' });
      if (m.current === null) lim.push('Ainda não há registros para esta meta de marco.');
      return { resumo: `Meta de marco: ${g.targets.text}. Progresso calculado de ${Math.round(m.pct * 100)}%${m.reachedOn ? `, alcançada em ${m.reachedOn}` : ''}.`, estatisticas: stats2, comparacao: '—', pontos_positivos: m.reachedOn ? ['Marco alcançado.'] : [], pontos_atencao: [], tendencias: [], recomendacoes: [], limitacoes: lim };
    }
    const nf = (x) => (x === null || x === undefined ? '—' : Number(x).toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
    stats2.push({ rotulo: 'Registros no período', valor: String(st.recordCount), origem: 'registrado' });
    stats2.push({ rotulo: `Total (${st.unit})`, valor: nf(s2.total), origem: 'calculado' });
    stats2.push({ rotulo: 'Média por dia', valor: `${nf(s2.avgPerDay)} ${st.unit}`, origem: 'calculado' });
    stats2.push({ rotulo: 'Dias com registro', valor: `${s2.daysWithData} de ${s2.totalDays}`, origem: 'calculado' });
    if (s2.completion !== null) stats2.push({ rotulo: 'Cumprimento médio semanal', valor: `${s2.completion}%`, origem: 'calculado' });
    if (s2.daysScheduled) stats2.push({ rotulo: 'Dias com meta atingida', valor: `${s2.daysMet} de ${s2.daysScheduled}`, origem: 'calculado' });
    const comp = s2.prevCompletion === null ? 'Sem dados suficientes no período anterior para comparar.' : `Cumprimento médio de ${nf(s2.completion ?? 0)}% contra ${nf(s2.prevCompletion)}% no período anterior.`;
    if (s2.trend === 'evoluindo') tend.push('Cumprimento em alta em relação ao período anterior.');
    if (s2.trend === 'regredindo') tend.push('Cumprimento em queda em relação ao período anterior.');
    if (s2.trend === 'estavel') tend.push('Cumprimento estável em relação ao período anterior.');
    if (s2.completion !== null && s2.completion >= 95) pos.push('Meta cumprida em pelo menos 95% das semanas analisadas.');
    if (s2.consistency >= 70) pos.push(`Registros em ${s2.consistency}% dos dias.`);
    if (s2.consistency < 40) att.push(`Registros em apenas ${s2.consistency}% dos dias do período.`);
    if (s2.completion !== null && s2.completion < 80) att.push(`Cumprimento médio abaixo de 80% (${s2.completion}%).`);
    if (st.strength) {
      if (st.strength.mostProgress) pos.push(`Maior progressão de carga: ${st.strength.mostProgress.name} (${st.strength.mostProgress.loadChange > 0 ? '+' : ''}${st.strength.mostProgress.loadChange} kg).`);
      if (st.strength.stagnant.length) att.push(`Sem aumento de carga no período: ${st.strength.stagnant.join(', ')}.`);
      if (st.strength.prs.length) pos.push(`${st.strength.prs.length} recorde(s) pessoal(is) no período.`);
    }
    if (st.reading && st.reading.pagesPerHour) stats2.push({ rotulo: 'Ritmo de leitura', valor: `${nf(st.reading.pagesPerHour)} págs/h`, origem: 'calculado' });
    if (st.sleep && st.sleep.bedStdMin !== null) (st.sleep.bedStdMin <= 45 ? pos : att).push(`Variação do horário de dormir: ${st.sleep.bedStdMin} min.`);
    if (s2.completion !== null && s2.completion < 80 && s2.avgPerDay > 0) recs.push('Considere ajustar o valor-alvo para algo mais próximo da média registrada e aumentar gradualmente.');
    if (s2.consistency < 70) recs.push('Registre diariamente, mesmo valores parciais: dias sem registro contam 0% nos chefes.');
    if (st.recordCount < 5) lim.push('Poucos registros no período: as tendências podem não ser representativas.');
    return { resumo: `${g.name}: ${st.recordCount} registro(s) no período, total de ${nf(s2.total)} ${st.unit} e média de ${nf(s2.avgPerDay)} ${st.unit}/dia.`, estatisticas: stats2, comparacao: comp, pontos_positivos: pos, pontos_atencao: att, tendencias: tend, recomendacoes: recs, limitacoes: lim };
  }
  const periodParam = (q) => { const p = q.period || '30'; if (p === 'all') return 'all'; const n = Number(p); if (![7, 30, 90].includes(n)) throw bad('Período inválido.'); return n; };
  route('GET', '/api/goals/:id/stats', ({ params, query }) => {
    engine.requireProfile();
    const st = stats.goalStats(v.id(params.id), periodParam(query));
    if (!st) throw notFound('Meta não encontrada.');
    return st;
  });
  route('GET', '/api/goals/:id/conversations', ({ params }) => db.all('SELECT c.*, (SELECT COUNT(*) FROM ai_messages m WHERE m.conversation_id = c.id) messages FROM ai_conversations c WHERE goal_id = ? ORDER BY updated_at DESC', v.id(params.id)));
  route('POST', '/api/goals/:id/conversations', ({ params }) => {
    const id = v.id(params.id);
    if (!engine.loadGoals().some((g) => g.id === id)) throw notFound('Meta não encontrada.');
    const r = db.run('INSERT INTO ai_conversations (goal_id, title) VALUES (?, ?)', id, 'Nova conversa');
    return db.one('SELECT * FROM ai_conversations WHERE id = ?', Number(r.lastInsertRowid));
  });
  route('GET', '/api/conversations/:id', ({ params }) => {
    const c = db.one('SELECT * FROM ai_conversations WHERE id = ?', v.id(params.id));
    if (!c) throw notFound('Conversa não encontrada.');
    return { ...c, messages: db.all('SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY id', c.id) };
  });
  route('DELETE', '/api/conversations/:id', ({ params }) => { db.run('DELETE FROM ai_conversations WHERE id = ?', v.id(params.id)); return { ok: true }; });
  route('POST', '/api/conversations/:id/messages', async ({ params, body, ip }) => {
    const c = db.one('SELECT * FROM ai_conversations WHERE id = ?', v.id(params.id));
    if (!c) throw notFound('Conversa não encontrada.');
    const content = v.str(body.content, 'mensagem', { required: true, max: 1500 });
    rateLimit(`ai:${ip}`, 12, 60000);
    const history = db.all('SELECT role, content FROM ai_messages WHERE conversation_id = ? ORDER BY id', c.id);
    const { pkg } = dataPackage(c.goal_id, body.period ? periodParam({ period: String(body.period) }) : 'all');
    const answer = await ai.goalChat(pkg, history, content);
    db.tx(() => {
      db.run("INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, 'user', ?)", c.id, content);
      db.run("INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, 'assistant', ?)", c.id, answer);
      db.run("UPDATE ai_conversations SET updated_at = datetime('now'), title = CASE WHEN title = 'Nova conversa' THEN ? ELSE title END WHERE id = ?", content.slice(0, 60), c.id);
    });
    return { messages: db.all('SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY id', c.id) };
  });
  route('GET', '/api/goals/:id/reports', ({ params }) => db.all('SELECT * FROM ai_reports WHERE goal_id = ? ORDER BY id DESC LIMIT 10', v.id(params.id)).map((r) => ({ ...r, stats: JSON.parse(r.stats), ai: r.ai ? JSON.parse(r.ai) : null })));
  route('POST', '/api/goals/:id/reports', async ({ params, body, ip }) => {
    const id = v.id(params.id);
    const period = periodParam({ period: String(body.period || 30) });
    const { pkg, st } = dataPackage(id, period);
    const computed = computedReport(st);
    let aiOut = null;
    if (ai.enabled() && body.ai !== false) { rateLimit(`ai:${ip}`, 12, 60000); aiOut = await ai.goalReport(pkg); }
    const r = db.run('INSERT INTO ai_reports (goal_id, period_days, stats, ai) VALUES (?,?,?,?)', id, period === 'all' ? 0 : period, JSON.stringify(computed), aiOut ? JSON.stringify(aiOut) : null);
    return { id: Number(r.lastInsertRowid), period, computed, ai: aiOut };
  });

  // ================= Evolução =================
  route('GET', '/api/stats/overview', ({ query }) => { engine.requireProfile(); return stats.overview(periodParam(query)); });
  route('GET', '/api/stats/radar', () => { engine.requireProfile(); return stats.radar([0, 7, 30, 90]); });
  route('GET', '/api/stats/weekly', ({ query }) => { engine.requireProfile(); return stats.weeklyAverages(Math.min(26, Math.max(2, Number(query.weeks) || 12))); });
  route('GET', '/api/xp-events', ({ query }) => {
    engine.requireProfile();
    return db.all('SELECT * FROM xp_events ORDER BY day DESC, id DESC LIMIT ?', Math.min(200, Number(query.limit) || 50));
  });
  route('GET', '/api/coin-events', () => db.all('SELECT * FROM coin_events ORDER BY id DESC LIMIT 50'));
  route('GET', '/api/export', () => {
    engine.requireProfile();
    const tables = ['profile', 'rest_rules', 'rest_days', 'goals', 'goal_versions', 'day_entries', 'records', 'xp_events', 'coin_events', 'cycles', 'cycle_events', 'achievements', 'inventory', 'ai_conversations', 'ai_messages', 'ai_reports'];
    return { exported_at: new Date().toISOString(), app: 'EvoRPG', version: '1.0.0-alpha', data: Object.fromEntries(tables.map((t) => [t, db.all(`SELECT * FROM ${t}`)])) };
  });

  return routes;
}

module.exports = { buildRoutes };
