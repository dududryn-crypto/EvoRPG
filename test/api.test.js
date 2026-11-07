'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
delete process.env.OPENAI_API_KEY;
const { createApp } = require('../server/index');
const { addDays } = require('../server/util');

const SUN = '2026-03-01'; // domingo
const MON = '2026-03-02'; // início do ciclo

function harness() {
  const h = {};
  h.start = async () => {
    ({ server: h.server, db: h.db } = createApp(':memory:'));
    await new Promise((r) => h.server.listen(0, '127.0.0.1', r));
    h.base = `http://127.0.0.1:${h.server.address().port}`;
  };
  h.api = async (method, path, body) => {
    const res = await fetch(h.base + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() };
  };
  h.ok = async (...a) => { const r = await h.api(...a); assert.equal(r.status, 200, `${a[0]} ${a[1]} → ${JSON.stringify(r.data)}`); return r.data; };
  h.day = (d) => { h.db.fakeToday = d; };
  h.rec = (kind, date, data, extra = {}) => h.ok('POST', '/api/records', { kind, date, data, ...extra });
  return h;
}
const xpOf = (s, k) => s.attributes.find((a) => a.key === k).xp;

test('metas livres e registros detalhados', async (t) => {
  const h = harness(); await h.start();
  t.after(() => h.server.close());
  h.day(SUN);
  let ids = {};

  await t.test('nenhuma meta é obrigatória', async () => {
    const s = await h.ok('POST', '/api/profile', { name: 'Ana' });
    assert.equal(s.goalsCount, 0);
    assert.ok(!('setupDone' in s));
    const g = await h.ok('GET', '/api/goals');
    assert.deepEqual(g, []);
  });

  await t.test('cadastro completo com conversão automática', async () => {
    const r = await h.ok('POST', '/api/goals', { type: 'leitura', name: 'Ler todo dia', description: 'Hábito de leitura', objective: 'Terminar 2 livros', notes: 'à noite', criteria: ['30 páginas registradas'], period: 'daily', target: 30, unit: 'paginas' });
    ids.leitura = r.id;
    ids.musc = (await h.ok('POST', '/api/goals', { type: 'musculacao', period: 'times_per_week', target: 4, days: [1, 2, 4, 5] })).id;
    ids.agua = (await h.ok('POST', '/api/goals', { type: 'agua', period: 'daily', target: 3, unit: 'L' })).id;
    const goals = await h.ok('GET', '/api/goals');
    const g = (id) => goals.find((x) => x.id === id);
    assert.deepEqual([g(ids.leitura).targets.day, g(ids.leitura).targets.week, g(ids.leitura).targets.month], [30, 210, 900]);
    assert.equal(g(ids.leitura).name, 'Ler todo dia');
    assert.deepEqual(g(ids.leitura).criteria, ['30 páginas registradas']);
    assert.equal(g(ids.musc).targets.week, 4);
    assert.equal(g(ids.agua).targets.week, 21);
    const p = await h.ok('POST', '/api/goals/preview', { type: 'leitura', period: 'total', target: 300, unit: 'paginas', deadline: addDays(SUN, 29) });
    assert.equal(p.targets.week, 70);
    const noDeadline = await h.api('POST', '/api/goals/preview', { type: 'leitura', period: 'total', target: 300, unit: 'paginas' });
    assert.equal(noDeadline.status, 400);
  });

  await t.test('atributos e XP são do sistema; duplicata que contaria registros duas vezes é recusada', async () => {
    const r = await h.ok('POST', '/api/goals', { type: 'estudo', period: 'daily', target: 60, unit: 'minutos', params: { subject: 'Inglês' }, attributes: { social: 3 }, xp_reward: 9999 });
    const goals = await h.ok('GET', '/api/goals');
    const created = goals.find((x) => x.id === r.id);
    // O cliente tentou impor { social: 3 } e XP 9999: o servidor ignora e usa a própria análise.
    assert.equal(created.rewards.weights.intelectual, 3);
    assert.notEqual(created.rewards.weights.social, 3);
    assert.deepEqual(created.rewards.distribution, created.analysis.weights);
    assert.ok(created.rewards.weeklyXp < 300);
    await h.ok('POST', '/api/goals', { type: 'estudo', period: 'daily', target: 30, unit: 'minutos', params: { subject: 'Matemática' } });
    const dup = await h.api('POST', '/api/goals', { type: 'leitura', period: 'weekly', target: 100, unit: 'paginas' });
    assert.equal(dup.status, 400);
  });

  await t.test('registro de leitura com livro e páginas alimenta a meta', async () => {
    h.day(MON);
    const before = await h.ok('GET', '/api/state');
    await h.rec('leitura', MON, { book: 'O Hobbit', author: 'Tolkien', pages: 20, minutes: 30 });
    await h.rec('leitura', MON, { book: 'O Hobbit', pages: 10 });
    const day = await h.ok('GET', `/api/day?date=${MON}`);
    const it = day.items.find((i) => i.goal.id === ids.leitura);
    assert.equal(it.eval.state, 'done');
    assert.equal(it.records.length, 2);
    const s1 = await h.ok('GET', '/api/state');
    const s2 = await h.ok('GET', '/api/state');
    assert.ok(xpOf(s1, 'intelectual') > xpOf(before, 'intelectual'));
    assert.deepEqual(s1.attributes, s2.attributes, 'recalcular não duplica XP');
  });

  await t.test('hidratação por quantidade e unidade', async () => {
    await h.ok('POST', '/api/records', { kind: 'hidratacao', date: MON, time: '09:30', data: { amount: 500, unit: 'ml' } });
    await h.ok('POST', '/api/records', { kind: 'hidratacao', date: MON, time: '14:00', data: { amount: 2.5, unit: 'L' } });
    const day = await h.ok('GET', `/api/day?date=${MON}`);
    assert.equal(day.items.find((i) => i.goal.id === ids.agua).eval.value, 3);
  });

  await t.test('sessão genérica exige meta compatível; registro inválido é recusado', async () => {
    const r = await h.api('POST', '/api/records', { kind: 'sessao', date: MON, data: { minutes: 10 } });
    assert.equal(r.status, 400);
    const bad = await h.api('POST', '/api/records', { kind: 'leitura', date: MON, data: {} });
    assert.equal(bad.status, 400);
    const fut = await h.api('POST', '/api/records', { kind: 'leitura', date: addDays(MON, 3), data: { pages: 5 } });
    assert.equal(fut.status, 400);
  });

  await t.test('treino detalhado, recorde pessoal e meta de carga (marco)', async () => {
    const carga = await h.ok('POST', '/api/goals', { type: 'carga', name: 'Supino 60', period: 'total', target: 60, unit: 'kg', params: { exercise: 'Supino reto' }, deadline: addDays(MON, 60) });
    await h.rec('forca', MON, { modality: 'musculacao', duration_min: 60, exercises: [{ name: 'Supino reto', group: 'Peito', sets: [{ reps: 10, weight: 40 }, { reps: 8, weight: 45 }, { reps: 6, weight: 50 }] }] });
    h.day(addDays(MON, 3));
    const s0 = await h.ok('GET', '/api/state');
    const r = await h.rec('forca', addDays(MON, 3), { modality: 'musculacao', exercises: [{ name: 'supino reto', group: 'Peito', sets: [{ reps: 5, weight: 60 }] }] });
    const s1 = await h.ok('GET', '/api/state');
    assert.ok(xpOf(s1, 'fisico') - xpOf(s0, 'fisico') >= 113 + 8, 'recorde + marco (3/4 de 150 em Físico)');
    assert.ok(xpOf(s1, 'disciplina') - xpOf(s0, 'disciplina') >= 37);
    let goals = await h.ok('GET', '/api/goals');
    assert.equal(goals.find((g) => g.id === carga.id).status, 'alcancada');
    const st = await h.ok('GET', `/api/goals/${ids.musc}/stats?period=30`);
    const sup = st.exercises.find((e) => e.name.toLowerCase() === 'supino reto');
    assert.equal(sup.best, 60);
    assert.equal(st.strength.prs.length, 1);
    await h.ok('DELETE', `/api/records/${r.id}`);
    goals = await h.ok('GET', '/api/goals');
    assert.equal(goals.find((g) => g.id === carga.id).status, 'ativa', 'remover o registro revoga o marco');
    const s2 = await h.ok('GET', '/api/state');
    assert.equal(xpOf(s2, 'fisico'), xpOf(s0, 'fisico'));
  });

  await t.test('ausência de registro não é falha; descumprimento penaliza; cancelamento não penaliza', async () => {
    h.day(addDays(MON, 5));
    const s0 = await h.ok('GET', '/api/state');
    assert.ok(s0.pendingDays.length > 0);
    await h.ok('POST', `/api/goals/${ids.leitura}/entry`, { date: addDays(MON, 4), status: 'missed', note: 'viagem' });
    const s1 = await h.ok('GET', '/api/state');
    assert.ok(xpOf(s1, 'disciplina') < xpOf(s0, 'disciplina'));
    assert.equal(s1.streak.current, 0);
    for (const a of s1.attributes) assert.ok(a.xp >= 0);
    await h.ok('DELETE', `/api/goals/${ids.agua}`);
    const goals = await h.ok('GET', '/api/goals');
    assert.ok(!goals.some((g) => g.id === ids.agua));
  });

  await t.test('estatísticas por meta e relatório automático sem IA', async () => {
    const st = await h.ok('GET', `/api/goals/${ids.leitura}/stats?period=7`);
    assert.equal(st.reading.books[0].book, 'O Hobbit');
    assert.equal(st.reading.pages, 30);
    assert.ok(st.daily.some((d) => d.value === null), 'dias sem registro ficam nulos');
    const rep = await h.ok('POST', `/api/goals/${ids.leitura}/reports`, { period: 30 });
    assert.equal(rep.ai, null);
    assert.ok(rep.computed.estatisticas.length > 0);
    assert.ok(rep.computed.estatisticas.every((e) => ['registrado', 'calculado', 'estimativa'].includes(e.origem)));
    const conv = await h.ok('POST', `/api/goals/${ids.leitura}/conversations`);
    const msg = await h.api('POST', `/api/conversations/${conv.id}/messages`, { content: 'Quantas páginas li?' });
    assert.equal(msg.status, 503);
    assert.match(msg.data.error, /OPENAI_API_KEY/);
    const ov = await h.ok('GET', '/api/stats/overview?period=7');
    assert.equal(ov.attributes.length, 6);
    assert.ok(Array.isArray(ov.goals));
  });
});

test('Boss Final: média aritmética simples ≥ 95%', async (t) => {
  const h = harness(); await h.start();
  t.after(() => h.server.close());
  h.day(SUN);
  await h.ok('POST', '/api/profile', { name: 'B' });
  const mk = async (b) => (await h.ok('POST', '/api/goals', b)).id;
  const id = {
    leitura: await mk({ type: 'leitura', period: 'daily', target: 30, unit: 'paginas' }),
    musc: await mk({ type: 'musculacao', period: 'times_per_week', target: 4, days: [1, 2, 4, 5] }),
    agua: await mk({ type: 'agua', period: 'daily', target: 3, unit: 'L' }),
    cal: await mk({ type: 'calorias', period: 'daily', target: 2000, unit: 'kcal', mode: 'max' }),
    sono: await mk({ type: 'sono', period: 'daily', target: 8, unit: 'horas_sono' }),
  };
  async function week(ws, { pages, water, kcal, sleep, workouts }) {
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i); h.day(d);
      if (pages?.[i]) await h.rec('leitura', d, { pages: pages[i] });
      if (water?.[i]) await h.rec('hidratacao', d, { amount: water[i], unit: 'L' });
      if (kcal?.[i]) await h.rec('refeicao', d, { meal: 'almoco', calories: kcal[i] });
      if (sleep?.[i]) await h.rec('sono', d, { hours: sleep[i], bed_time: '23:00' });
      if (workouts?.includes(i)) await h.rec('forca', d, { modality: 'musculacao', duration_min: 50, exercises: [{ name: 'Agachamento', sets: [{ reps: 8, weight: 60 }] }] });
    }
  }
  await t.test('escolha dos chefes 1 e 2 até segunda-feira', async () => {
    h.day(MON);
    await h.ok('PUT', '/api/cycles/bosses', { week_start: MON, slot: 1, goal_id: id.leitura });
    await h.ok('PUT', '/api/cycles/bosses', { week_start: MON, slot: 2, goal_id: id.musc });
    h.day(addDays(MON, 1));
    assert.equal((await h.api('PUT', '/api/cycles/bosses', { week_start: MON, slot: 1, goal_id: id.agua })).status, 400);
  });
  await t.test('exemplo 1 → 97% → vitória', async () => {
    await week(MON, { pages: Array(7).fill(30), water: Array(7).fill(2.7), kcal: [1800, 1800, 1800, 1800, 1800, 1800, 2350], sleep: Array(7).fill(8), workouts: [0, 1, 3, 4] });
    h.day(addDays(MON, 7));
    const { history } = await h.ok('GET', '/api/cycles');
    const c = history.find((x) => x.week_start === MON);
    assert.equal(Math.round(c.average * 100), 97);
    assert.equal((await h.ok('POST', `/api/cycles/${c.id}/fight`, { which: 'final' })).battle.status, 'victory');
  });
  await t.test('exemplo 2 → 93% → derrota explicada', async () => {
    const W2 = addDays(MON, 7);
    await week(W2, { pages: [30, 30, 30, 30, 30, 30, 9], water: Array(7).fill(3), kcal: [1800, 1800, 1800, 1800, 1800, 2700, 2700], sleep: [8, 8, 8, 8, 8, 8, 5.2], workouts: [0, 1, 3, 4] });
    h.day(addDays(W2, 7));
    const { history } = await h.ok('GET', '/api/cycles');
    const c = history.find((x) => x.week_start === W2);
    assert.equal(Math.round(c.average * 100), 93);
    assert.equal((await h.ok('POST', `/api/cycles/${c.id}/fight`, { which: 'final' })).battle.status, 'defeat');
    const rep = await h.ok('GET', `/api/cycles/${c.id}/report`);
    assert.match(rep.final.text, /93%/);
    assert.match(rep.final.text, /calorias \(80%\)/);
  });
  await t.test('metas de marco não entram na média semanal', async () => {
    h.day(addDays(MON, 13));
    await h.ok('POST', '/api/goals', { type: 'peso', period: 'total', target: 75, unit: 'kg', mode: 'max', deadline: addDays(MON, 90) });
    h.day(addDays(MON, 14));
    const { current } = await h.ok('GET', '/api/cycles');
    assert.ok(!current.goals.some((g) => g.type === 'peso'));
  });
});

test('personagem: raridades, conjuntos e desbloqueios', async (t) => {
  const h = harness(); await h.start();
  t.after(() => h.server.close());
  h.day(SUN);
  await h.ok('POST', '/api/profile', { name: 'C' });
  const shop = await h.ok('GET', '/api/shop');
  assert.ok(shop.items.length >= 90);
  assert.equal(new Set(shop.items.map((i) => i.rarity)).size, 6);
  assert.ok(shop.sets.length >= 11);
  await t.test('aparência base livre e validada', async () => {
    const r = await h.ok('PUT', '/api/character', { body: 'broad', hair: 'topknot', beard: 'full', eyes: 'sharp', eyeColor: '#2563eb' });
    assert.equal(r.character.hair, 'topknot');
    assert.equal((await h.api('PUT', '/api/character', { hair: 'invalido' })).status, 400);
  });
  await t.test('item não possuído não pode ser equipado nem comprado sem moedas', async () => {
    assert.equal((await h.api('PUT', '/api/character', { head: 'k_head' })).status, 400);
    assert.equal((await h.api('POST', '/api/shop/buy', { item_id: 'k_head' })).status, 400);
    assert.equal((await h.api('POST', '/api/shop/buy', { item_id: 'c_head' })).status, 400, 'mítico só por desafio');
  });
  await t.test('conquista desbloqueia item e título; conjunto equipa peças possuídas', async () => {
    h.db.run("INSERT INTO coin_events (amount, source, day, ukey) VALUES (1000, 'teste', ?, 'teste')", SUN);
    await h.ok('POST', '/api/shop/buy', { item_id: 'g_head' });
    await h.ok('POST', '/api/shop/buy', { item_id: 'g_weapon' });
    const r = await h.ok('POST', '/api/character/set', { set: 'guerreiro' });
    assert.equal(r.equipped, 2);
    assert.equal(r.character.head, 'g_head');
    const g = (await h.ok('POST', '/api/goals', { type: 'leitura', period: 'daily', target: 5, unit: 'paginas' })).id;
    h.day(MON);
    await h.rec('leitura', MON, { pages: 5 });
    const ach = await h.ok('GET', '/api/achievements');
    assert.ok(ach.find((a) => a.key === 'first_activity').unlocked);
    assert.ok(g);
  });
});
