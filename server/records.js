'use strict';
/**
 * Tipos de registro detalhado. Cada tipo define seus campos, a validação e como
 * extrair valores numéricos (métricas) usados pelas metas. Os dados ficam em JSON
 * na tabela `records`, então novos tipos não exigem mudanças no banco.
 */
const { bad, v } = require('./util');

const MODALITIES_STRENGTH = ['musculacao', 'calistenia'];
const MODALITIES_CARDIO = ['caminhada', 'corrida', 'ciclismo', 'natacao', 'esporte', 'outro_exercicio'];
const MEALS = { cafe: 'Café da manhã', almoco: 'Almoço', jantar: 'Jantar', lanche: 'Lanche', outro: 'Outro' };
const MUSCLE_GROUPS = ['Peito', 'Costas', 'Ombros', 'Bíceps', 'Tríceps', 'Pernas', 'Glúteos', 'Abdômen', 'Corpo inteiro', 'Outro'];

const num = (val, name, opts) => v.num(val, name, opts);

const KINDS = {
  forca: {
    name: 'Treino de força',
    shared: true,
    parse(d) {
      const modality = v.oneOf(d.modality, 'modalidade', MODALITIES_STRENGTH, { required: false, fallback: 'musculacao' });
      const exercises = Array.isArray(d.exercises) ? d.exercises : [];
      if (exercises.length > 30) throw bad('Máximo de 30 exercícios por treino.');
      const ex = exercises.map((e, i) => {
        const sets = Array.isArray(e.sets) ? e.sets : [];
        if (sets.length > 20) throw bad('Máximo de 20 séries por exercício.');
        return {
          name: v.str(e.name, `exercício ${i + 1}`, { required: true, max: 60 }),
          group: v.str(e.group, 'grupo muscular', { max: 30 }),
          sets: sets.map((s, j) => ({
            reps: num(s.reps, `repetições (série ${j + 1})`, { min: 1, max: 500, int: true, required: true }),
            weight: num(s.weight, `carga (série ${j + 1})`, { min: 0, max: 2000 }) || 0,
            rest_s: num(s.rest_s, 'descanso', { min: 0, max: 1800, int: true }),
          })),
        };
      });
      const duration = num(d.duration_min, 'duração', { min: 1, max: 600, int: true });
      if (!ex.length && !duration) throw bad('Registre ao menos um exercício ou a duração do treino.');
      return { modality, duration_min: duration, exercises: ex };
    },
    metrics: {
      sessoes: () => 1,
      minutos: (d) => d.duration_min || 0,
      volume: (d) => d.exercises.reduce((s, e) => s + e.sets.reduce((a, x) => a + x.reps * x.weight, 0), 0),
      series: (d) => d.exercises.reduce((s, e) => s + e.sets.length, 0),
    },
    match: (d, goal) => !goal.params?.modality || d.modality === goal.params.modality,
  },
  cardio: {
    name: 'Atividade aeróbica',
    shared: true,
    parse(d) {
      const modality = v.oneOf(d.modality, 'modalidade', MODALITIES_CARDIO);
      const r = {
        modality,
        duration_min: num(d.duration_min, 'tempo', { min: 1, max: 1440, int: true }),
        distance_km: num(d.distance_km, 'distância', { min: 0.01, max: 500 }),
        steps: num(d.steps, 'passos', { min: 1, max: 200000, int: true }),
      };
      if (!r.duration_min && !r.distance_km && !r.steps) throw bad('Informe tempo, distância ou passos.');
      return r;
    },
    metrics: { sessoes: () => 1, minutos: (d) => d.duration_min || 0, km: (d) => d.distance_km || 0, passos: (d) => d.steps || 0 },
    match: (d, goal) => !goal.params?.modality || d.modality === goal.params.modality,
  },
  leitura: {
    name: 'Leitura',
    shared: true,
    parse(d) {
      const r = { book: v.str(d.book, 'livro', { max: 120 }), author: v.str(d.author, 'autor', { max: 80 }), pages: num(d.pages, 'páginas', { min: 1, max: 2000, int: true }), minutes: num(d.minutes, 'tempo', { min: 1, max: 1440, int: true }) };
      if (!r.pages && !r.minutes) throw bad('Informe páginas lidas ou tempo de leitura.');
      return r;
    },
    metrics: { paginas: (d) => d.pages || 0, minutos: (d) => d.minutes || 0, sessoes: () => 1 },
  },
  estudo: {
    name: 'Estudo',
    shared: true,
    parse(d) {
      return {
        subject: v.str(d.subject, 'assunto', { max: 80 }), minutes: num(d.minutes, 'tempo', { min: 1, max: 1440, int: true, required: true }),
        content: v.str(d.content, 'conteúdo', { max: 300 }), exercises: num(d.exercises, 'exercícios', { min: 0, max: 1000, int: true }),
        performance: num(d.performance, 'desempenho', { min: 0, max: 100 }),
      };
    },
    metrics: { minutos: (d) => d.minutes, horas: (d) => d.minutes / 60, sessoes: () => 1, exercicios: (d) => d.exercises || 0 },
    match: (d, goal) => !goal.params?.subject || (d.subject || '').toLowerCase().includes(goal.params.subject.toLowerCase()),
  },
  refeicao: {
    name: 'Refeição',
    shared: true,
    parse(d) {
      const r = {
        meal: v.oneOf(d.meal, 'refeição', Object.keys(MEALS), { required: false, fallback: 'outro' }), description: v.str(d.description, 'descrição', { max: 200 }),
        calories: num(d.calories, 'calorias', { min: 0, max: 10000 }), protein: num(d.protein, 'proteínas', { min: 0, max: 1000 }),
        carbs: num(d.carbs, 'carboidratos', { min: 0, max: 2000 }), fat: num(d.fat, 'gorduras', { min: 0, max: 1000 }),
      };
      if ([r.calories, r.protein, r.carbs, r.fat].every((x) => x === null)) throw bad('Informe pelo menos um valor nutricional.');
      return r;
    },
    metrics: { kcal: (d) => d.calories, proteina: (d) => d.protein, carbo: (d) => d.carbs, gordura: (d) => d.fat, refeicoes: () => 1 },
  },
  hidratacao: {
    name: 'Hidratação',
    shared: true,
    parse(d) {
      const unit = v.oneOf(d.unit, 'unidade', ['ml', 'L'], { required: false, fallback: 'ml' });
      const amount = num(d.amount, 'quantidade', { min: unit === 'L' ? 0.05 : 50, max: unit === 'L' ? 10 : 10000, required: true });
      return { amount, unit, liters: unit === 'L' ? amount : amount / 1000 };
    },
    metrics: { L: (d) => d.liters, ml: (d) => d.liters * 1000 },
  },
  sono: {
    name: 'Sono',
    shared: true,
    single: true,
    parse(d) {
      const bed = v.time(d.bed_time, 'horário de dormir');
      const wake = v.time(d.wake_time, 'horário de acordar');
      let hours = num(d.hours, 'horas de sono', { min: 0, max: 24 });
      if (hours === null) {
        if (!bed || !wake) throw bad('Informe as horas de sono ou os horários de dormir e acordar.');
        const [bh, bm] = bed.split(':').map(Number); const [wh, wm] = wake.split(':').map(Number);
        let mins = wh * 60 + wm - (bh * 60 + bm); if (mins <= 0) mins += 1440;
        hours = Math.round((mins / 60) * 100) / 100;
      }
      return { bed_time: bed, wake_time: wake, hours, quality: num(d.quality, 'qualidade', { min: 1, max: 5, int: true }) };
    },
    metrics: { horas: (d) => d.hours },
    aggregate: 'max',
  },
  corpo: {
    name: 'Medidas corporais',
    shared: true,
    parse(d) { return { weight_kg: num(d.weight_kg, 'peso', { min: 20, max: 400, required: true }), waist_cm: num(d.waist_cm, 'cintura', { min: 30, max: 300 }) }; },
    metrics: { kg: (d) => d.weight_kg },
    aggregate: 'last',
  },
  sessao: {
    name: 'Sessão',
    shared: false, // pertence a uma meta específica
    parse(d) {
      const r = { minutes: num(d.minutes, 'tempo', { min: 1, max: 1440, int: true }), quantity: num(d.quantity, 'quantidade', { min: 0, max: 100000 }), description: v.str(d.description, 'descrição', { max: 300 }), done: d.done === undefined ? true : v.bool(d.done) };
      return r;
    },
    metrics: { minutos: (d) => d.minutes || 0, horas: (d) => (d.minutes || 0) / 60, sessoes: (d) => (d.done ? 1 : 0), quantidade: (d) => d.quantity || 0, tarefas: (d) => d.quantity || (d.done ? 1 : 0) },
  },
};

/** Valor de uma métrica para um conjunto de registros do mesmo dia. */
function aggregate(kind, records, metric) {
  const K = KINDS[kind];
  const fn = K.metrics[metric];
  if (!fn) return null;
  if (!records.length) return null;
  const vals = records.map((r) => fn(r.data)).filter((x) => x !== null && x !== undefined);
  if (!vals.length) return null;
  if (K.aggregate === 'max') return Math.max(...vals);
  if (K.aggregate === 'last') return vals[vals.length - 1];
  return vals.reduce((a, b) => a + b, 0);
}

/** Melhor carga e 1RM estimado por exercício a partir dos registros de força. */
function exerciseStats(records) {
  const map = new Map();
  for (const r of records) {
    for (const e of r.data.exercises || []) {
      const key = e.name.trim().toLowerCase();
      if (!map.has(key)) map.set(key, { name: e.name.trim(), group: e.group || null, sessions: [] });
      let maxW = 0; let vol = 0; let reps = 0; let est = 0;
      for (const s of e.sets) { maxW = Math.max(maxW, s.weight); vol += s.reps * s.weight; reps += s.reps; if (s.weight > 0) est = Math.max(est, s.weight * (1 + s.reps / 30)); }
      map.get(key).sessions.push({ date: r.date, record_id: r.id, maxWeight: maxW, volume: vol, reps, sets: e.sets.length, est1rm: Math.round(est * 10) / 10 });
    }
  }
  for (const ex of map.values()) {
    ex.sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.record_id - b.record_id));
    let best = null; ex.prs = [];
    for (const s of ex.sessions) {
      if (s.maxWeight > 0 && best !== null && s.maxWeight > best) ex.prs.push({ date: s.date, weight: s.maxWeight, previous: best, record_id: s.record_id });
      if (s.maxWeight > 0 && (best === null || s.maxWeight > best)) best = s.maxWeight;
    }
    ex.best = best;
  }
  return [...map.values()];
}

module.exports = { KINDS, MEALS, MUSCLE_GROUPS, MODALITIES_STRENGTH, MODALITIES_CARDIO, aggregate, exerciseStats };
