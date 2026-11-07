'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../server/rules');
const { sanitizeEvaluation } = require('../server/ai');

test('curva de níveis: Disciplina é a mais difícil', () => {
  assert.equal(R.attributeLevel('fisico', 0).level, 1);
  assert.equal(R.attributeLevel('fisico', 80).level, 2);
  assert.equal(R.attributeLevel('disciplina', 80).level, 1);
  assert.ok(R.attributeLevel('disciplina', 5000).level < R.attributeLevel('fisico', 5000).level);
});
test('tabela de ofensiva', () => {
  assert.equal(R.streakMultiplier(0), 1);
  assert.equal(R.streakMultiplier(3), 1.05);
  assert.equal(R.streakMultiplier(29), 1.25);
  assert.equal(R.streakMultiplier(100), 1.75);
});
test('divisão de XP preserva o total', () => {
  const parts = R.splitByWeights(17, R.normalizeWeights({ fisico: 3, saude: 1, disciplina: 1 }));
  assert.equal(Object.values(parts).reduce((a, b) => a + b, 0), 17);
});
test('cumprimento por modo', () => {
  assert.equal(R.compliance('min', 15, 30), 0.5);
  assert.equal(R.compliance('max', 1800, 2000), 1);
  assert.ok(Math.abs(R.compliance('max', 2350, 2000) - 0.65) < 1e-9);
  assert.equal(R.compliance('range', 150, 140), 1);
  assert.equal(R.compliance('min', null, 30), 0);
});
test('média do Boss Final: simples e limitada a 100%', () => {
  assert.equal(Math.round(R.finalBossAverage([1, 1, 0.9, 0.95, 1]) * 100), 97);
  assert.equal(R.finalBossVictory(R.finalBossAverage([1, 1, 0.9, 0.95, 1])), true);
  assert.equal(Math.round(R.finalBossAverage([1, 0.9, 1, 0.8, 0.95]) * 100), 93);
  assert.equal(R.finalBossVictory(R.finalBossAverage([1, 0.9, 1, 0.8, 0.95])), false);
  assert.equal(R.finalBossAverage([3, 0.5]), 0.75, 'superação não compensa');
  assert.equal(R.finalBossVictory(0.95), true);
});
test('penalidade: metade em Disciplina', () => {
  const p = R.penaltySplit(20, { fisico: 3, saude: 1 });
  assert.equal(p.disciplina + p.fisico + (p.saude || 0), 20);
  assert.ok(p.disciplina >= 10);
});
test('batalha determinística', () => {
  assert.deepEqual(R.battleScript(0.4), R.battleScript(0.4));
  assert.equal(R.battleScript(0.4).damage, 40);
  assert.equal(R.battleScript(0).victory, false);
  assert.equal(R.battleScript(1.3).victory, true);
});
test('resposta da IA é validada e limitada', () => {
  const e = sanitizeEvaluation({ score: 42, difficulty: 99, suggested_target: -5, issues: 'x', recommended_xp: 9999 });
  assert.equal(e.score, 10);
  assert.equal(e.difficulty, 10);
  assert.equal(e.suggested_target, null);
  assert.ok(!('recommended_xp' in e), 'IA não define XP');
});
