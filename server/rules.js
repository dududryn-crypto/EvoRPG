'use strict';
/**
 * Regras puras de progressão do Evolve RPG.
 * Nenhuma função aqui acessa o banco: tudo é determinístico e testável.
 */

const ATTRIBUTES = ['saude', 'fisico', 'intelectual', 'disciplina', 'social', 'criatividade'];

const ATTRIBUTE_INFO = {
  saude:        { name: 'Saúde',        color: '#4ade80' },
  fisico:       { name: 'Físico',       color: '#f87171' },
  intelectual:  { name: 'Intelectual',  color: '#60a5fa' },
  disciplina:   { name: 'Disciplina',   color: '#c084fc' },
  social:       { name: 'Social',       color: '#fbbf24' },
  criatividade: { name: 'Criatividade', color: '#f472b6' },
};

// ---------- Curvas de nível ----------
// XP necessário para ir do nível L para L+1 = base * L^1.4
// Disciplina exige 60% mais XP por nível: é o atributo mais difícil de evoluir.
const ATTR_BASE = 80;
const ATTR_DIFFICULTY = { disciplina: 1.6 };
const CHAR_BASE = 300;

function stepXp(level, base) {
  return Math.round(base * Math.pow(level, 1.4));
}

function levelFromXp(xp, base) {
  let level = 1;
  let floor = 0;
  xp = Math.max(0, Math.floor(xp || 0));
  for (;;) {
    const need = stepXp(level, base);
    if (xp < floor + need) {
      return { level, xp, levelStart: floor, levelEnd: floor + need, intoLevel: xp - floor, needed: need, progress: (xp - floor) / need };
    }
    floor += need;
    level += 1;
    if (level > 999) return { level, xp, levelStart: floor, levelEnd: floor, intoLevel: 0, needed: 0, progress: 1 };
  }
}

function attributeLevel(attr, xp) {
  return levelFromXp(xp, ATTR_BASE * (ATTR_DIFFICULTY[attr] || 1));
}

function characterLevel(totalXp) {
  return levelFromXp(totalXp, CHAR_BASE);
}

// ---------- Ofensiva ----------
const STREAK_TABLE = [
  { days: 100, mult: 1.75 },
  { days: 60, mult: 1.55 },
  { days: 30, mult: 1.40 },
  { days: 14, mult: 1.25 },
  { days: 7, mult: 1.15 },
  { days: 3, mult: 1.05 },
  { days: 0, mult: 1.00 },
];

function streakMultiplier(streak) {
  for (const row of STREAK_TABLE) if (streak >= row.days) return row.mult;
  return 1;
}

function nextStreakTier(streak) {
  const asc = [...STREAK_TABLE].reverse();
  for (const row of asc) if (row.days > streak) return row;
  return null;
}

// ---------- Metas (regras fixas do sistema) ----------
const LIMITS = {
  perfectDayDisciplineBonus: 6,
  dailyCoinsCap: 15,
  goalWeekCoins: 10,
  prXp: 8,
  prDailyCap: 24,
  boss12Xp: 40,
  boss12Coins: 40,
  finalBossXp: 60,
  finalBossCoins: 100,
  finalThreshold: 0.95,
  sleepRegularityMaxStd: 45, // minutos
};

/** Normaliza pesos de atributos para somarem 1, descartando inválidos. */
function normalizeWeights(weights) {
  const out = {};
  let sum = 0;
  for (const a of ATTRIBUTES) {
    const w = Number(weights && weights[a]);
    if (Number.isFinite(w) && w > 0) { out[a] = w; sum += w; }
  }
  if (sum <= 0) return null;
  for (const a of Object.keys(out)) out[a] = out[a] / sum;
  return out;
}

/** Divide um total inteiro entre atributos (maiores restos), preservando a soma. */
function splitByWeights(total, weights) {
  const entries = Object.entries(weights || {});
  if (!entries.length || total <= 0) return {};
  const parts = entries.map(([a, w]) => [a, Math.floor(total * w), total * w - Math.floor(total * w)]);
  let rest = total - parts.reduce((s, p) => s + p[1], 0);
  parts.sort((x, y) => y[2] - x[2]);
  for (let i = 0; i < parts.length && rest > 0; i++, rest--) parts[i][1] += 1;
  const out = {};
  for (const [a, v] of parts) if (v > 0) out[a] = v;
  return out;
}

/**
 * Cumprimento de um dia (0..1) conforme o modo da meta.
 * min: proporcional; max: dentro do limite = 100% (valores muito baixos indicam registro incompleto);
 * range: dentro de ±10% = 100%, perdendo 2 pontos percentuais por ponto fora da faixa.
 */
function compliance(mode, value, target) {
  if (value === null || value === undefined || !(target > 0)) return 0;
  if (mode === 'max') {
    if (value > target) return Math.max(0, 1 - 2 * ((value - target) / target));
    return Math.min(1, value / (0.6 * target));
  }
  if (mode === 'range') {
    const lo = target * 0.9; const hi = target * 1.1;
    if (value >= lo && value <= hi) return 1;
    const dist = value < lo ? lo - value : value - hi;
    return Math.max(0, 1 - 2 * (dist / target));
  }
  return Math.max(0, Math.min(1, value / target));
}

/** Curva de XP semanal: 100% da meta = 1; superar dá bônus de até +20% (metade da taxa, até 140%). */
function xpCurve(p) {
  return Math.min(p, 1) + 0.5 * Math.min(Math.max(p - 1, 0), 0.4);
}

/** Fator de dificuldade pela quantidade semanal (impede metas triviais de render o mesmo XP). */
function difficultyFactor(weeklyAmount, ref) {
  if (!ref || !(weeklyAmount > 0)) return 1;
  return Math.max(0.6, Math.min(1.4, Math.sqrt(weeklyAmount / ref)));
}

/** Penalidade de um compromisso diário não cumprido. */
function dayPenalty(budget, expectedCount) {
  return Math.max(2, Math.min(20, Math.round((0.6 * budget) / Math.max(1, expectedCount))));
}

/** Penalidade distribuída: metade sempre em Disciplina, o restante nos atributos do tipo. */
function penaltySplit(total, weights) {
  total = Math.round(total);
  if (total <= 0) return {};
  const disc = Math.ceil(total / 2);
  const others = { ...weights };
  delete others.disciplina;
  const norm = normalizeWeights(others);
  const out = norm ? splitByWeights(total - disc, norm) : {};
  out.disciplina = (out.disciplina || 0) + (norm ? disc : total);
  return out;
}

/** Média aritmética simples dos percentuais (cada um limitado a 100%). */
function finalBossAverage(pcts) {
  if (!pcts.length) return null;
  return pcts.reduce((s, p) => s + Math.max(0, Math.min(1, p)), 0) / pcts.length;
}
function finalBossVictory(avg) {
  return avg !== null && avg + 1e-9 >= LIMITS.finalThreshold;
}

// ---------- Chefes ----------
/**
 * Roteiro de batalha determinístico: o dano é exatamente o progresso registrado.
 */
function battleScript(progress, maxHits = 6) {
  const p = Math.max(0, Math.min(1, progress));
  const damage = Math.round(p * 1000) / 10; // % de vida com 1 casa decimal
  const victory = p >= 1;
  const hits = damage <= 0 ? 0 : Math.max(1, Math.min(maxHits, Math.round(p * maxHits)));
  const steps = [];
  let remaining = damage;
  for (let i = 0; i < hits; i++) {
    const dmg = i === hits - 1 ? Math.round(remaining * 10) / 10 : Math.round((damage / hits) * 10) / 10;
    remaining = Math.round((remaining - dmg) * 10) / 10;
    steps.push({ actor: 'player', type: 'attack', damage: dmg });
    if (!victory || i < hits - 1) {
      steps.push({ actor: 'boss', type: 'attack', damage: 0 });
    }
  }
  if (victory) steps.push({ actor: 'boss', type: 'defeat' }, { actor: 'player', type: 'victory' });
  else {
    steps.push({ actor: 'boss', type: 'final_attack' }, { actor: 'player', type: 'defeat' });
  }
  return { progress: p, damage, victory, bossHpLeft: Math.round((100 - damage) * 10) / 10, steps };
}

module.exports = {
  ATTRIBUTES, ATTRIBUTE_INFO, LIMITS, STREAK_TABLE,
  stepXp, levelFromXp, attributeLevel, characterLevel, streakMultiplier, nextStreakTier,
  normalizeWeights, splitByWeights, compliance, xpCurve, difficultyFactor, dayPenalty, penaltySplit,
  finalBossAverage, finalBossVictory, battleScript,
};
