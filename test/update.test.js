'use strict';
// Atualização: criação de metas em linguagem natural, análise individual de atributos,
// campos personalizados, skins (loja, chefes, missões) e regras anti-manipulação.
const test = require('node:test');
const assert = require('node:assert/strict');
delete process.env.OPENAI_API_KEY;
const { createApp } = require('../server/index');
const C = require('../server/catalog');
const IP = require('../server/interpret');

const SUN = '2026-03-01';
const MON = '2026-03-02';

function harness() {
  const h = {};
  h.start = async () => {
    ({ server: h.server, db: h.db, engine: h.engine } = createApp(':memory:'));
    await new Promise((r) => h.server.listen(0, '127.0.0.1', r));
    h.base = `http://127.0.0.1:${h.server.address().port}`;
  };
  h.api = async (method, path, body) => {
    const res = await fetch(h.base + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() };
  };
  h.ok = async (...a) => { const r = await h.api(...a); assert.equal(r.status, 200, `${a[0]} ${a[1]} → ${JSON.stringify(r.data)}`); return r.data; };
  h.day = (d) => { h.db.fakeToday = d; };
  return h;
}

test('interpretação local de metas escritas em linguagem natural', () => {
  const cases = [
    ['Quero ler 30 páginas por dia', 'leitura', 'daily', 30, 'paginas'],
    ['Quero treinar musculação quatro vezes por semana', 'musculacao', 'times_per_week', 4, 'sessoes'],
    ['Quero caminhar 5 km diariamente', 'caminhada', 'daily', 5, 'km'],
    ['Quero estudar matemática durante duas horas por dia', 'estudo', 'daily', 2, 'horas'],
    ['Escrever 500 palavras por dia', 'criatividade', 'daily', 500, 'quantidade'],
  ];
  for (const [text, type, period, target, unit] of cases) {
    const { draft } = IP.interpretLocal(text, SUN);
    assert.deepEqual([draft.type, draft.period, draft.target, draft.unit], [type, period, target, unit], text);
  }
  const vague = IP.interpretLocal('Quero melhorar minha alimentação', SUN);
  assert.equal(vague.draft.type, 'alimentacao');
  assert.ok(vague.assumed.includes('target'), 'valor presumido é sinalizado');
  assert.equal(IP.interpretLocal('Quero estudar matemática durante duas horas por dia', SUN).draft.params.subject, 'Matemática');
});

test('análise individual: atributos dependem da finalidade da meta e são coerentes', () => {
  const an = (text) => { const r = IP.interpretLocal(text, SUN); return IP.analyzeLocal(r.draft, text, r); };
  const top = (a) => a.attributes[0].attribute;
  assert.equal(top(an('Quero treinar musculação 4 vezes por semana')), 'fisico');
  const walk = an('Quero caminhar 5 km diariamente');
  assert.equal(top(walk), 'saude');
  assert.ok(walk.weights.fisico > 0, 'caminhada também desenvolve Físico');
  const english = an('Quero aprender inglês conversando com amigos');
  assert.ok(english.weights.intelectual > 0 && english.weights.social > 0, 'idioma: Intelectual e Social');
  const book = an('Quero escrever um livro');
  assert.equal(top(book), 'criatividade');
  // mesma meta → mesma análise (determinística)
  assert.deepEqual(an('Quero ler 30 páginas por dia').weights, an('Quero ler 30 páginas por dia').weights);
  for (const a of [walk, english, book]) {
    assert.equal(Math.round(Object.values(a.weights).reduce((x, y) => x + y, 0) * 100), 100, 'distribuição soma 100%');
    for (const k of ['clarity', 'difficulty', 'complexity', 'frequency', 'viability', 'consistency', 'relevance']) assert.ok(a[k].score >= 1 && a[k].score <= 10);
    assert.ok(a.xp_factor >= 0.9 && a.xp_factor <= 1.1);
  }
});

test('resposta da IA é validada: atributos inválidos ignorados e âncora da categoria preservada', () => {
  const r = IP.interpretLocal('Quero ler 30 páginas por dia', SUN);
  const local = IP.analyzeLocal(r.draft, 'x', r);
  const ai = { attributes: [{ attribute: 'social', weight: 100, reason: 'tentativa de manipulação' }, { attribute: 'hack', weight: 999 }], difficulty: { score: 99 }, complexity: { score: 10 } };
  const out = IP.sanitizeAiAnalysis(ai, r.draft, local);
  assert.ok(out.weights.intelectual >= 0.3, 'a referência da categoria continua presente');
  assert.ok(!('hack' in out.weights));
  assert.equal(out.difficulty.score, 10);
  assert.ok(out.xp_factor <= 1.1);
});

test('fluxo completo: interpretar → criar → pesos gravados; cliente não manipula atributos', async (t) => {
  const h = harness(); await h.start(); t.after(() => h.server.close());
  h.day(SUN);
  await h.ok('POST', '/api/profile', { name: 'N' });
  const r = await h.ok('POST', '/api/goals/interpret', { text: 'Quero escrever 500 palavras por dia do meu livro' });
  assert.equal(r.source, 'local');
  assert.equal(r.draft.type, 'criatividade');
  assert.equal(r.analysis.attributes[0].attribute, 'criatividade');
  const created = await h.ok('POST', '/api/goals', { ...r.draft, name: 'Escrever o livro', analysis_token: r.token, weights: { fisico: 1 }, xp_factor: 5,
    custom_fields: [{ label: 'Capítulo', type: 'text' }, { label: 'Revisões', type: 'number' }] });
  const g = (await h.ok('GET', '/api/goals')).find((x) => x.id === created.id);
  assert.deepEqual(g.rewards.distribution, r.analysis.weights, 'pesos vêm da análise do servidor');
  assert.ok(!g.rewards.distribution.fisico);
  assert.equal(g.rewards.xpFactor, r.analysis.xp_factor);
  assert.equal(g.unitLabel, 'palavras');
  assert.equal(g.custom_fields.length, 2);
  assert.equal(g.source_text, 'Quero escrever 500 palavras por dia do meu livro');
  // registro com campos personalizados e estatística
  h.day(MON);
  await h.ok('POST', '/api/records', { kind: 'sessao', goal_id: g.id, date: MON, data: { quantity: 600, minutes: 40, custom: { capitulo: 'Cap. 3', revisoes: 2, 'chave inválida': 1 } } });
  const st = await h.ok('GET', `/api/goals/${g.id}/stats?period=7`);
  assert.equal(st.custom.find((c) => c.key === 'revisoes').total, 2);
  assert.equal(st.custom.find((c) => c.key === 'capitulo').recent[0], 'Cap. 3');
  const s = await h.ok('GET', '/api/state');
  assert.ok(s.attributes.find((a) => a.key === 'criatividade').xp > 0, 'XP vai para Criatividade');
  assert.equal(s.attributes.find((a) => a.key === 'fisico').xp, 0, 'nenhum XP em Físico');
  // token de outra categoria não é aproveitado
  const other = await h.ok('POST', '/api/goals/interpret', { text: 'Quero meditar 10 minutos por dia' });
  const g2 = await h.ok('POST', '/api/goals', { type: 'social', period: 'times_per_week', target: 2, analysis_token: other.token });
  const v2 = (await h.ok('GET', '/api/goals')).find((x) => x.id === g2.id);
  assert.equal(v2.analysis.attributes[0].attribute, 'social');
  // reanálise após ajuste
  const re = await h.ok('POST', '/api/goals/analyze', { type: 'leitura', period: 'daily', target: 40, unit: 'paginas', source_text: 'ler mais' });
  assert.ok(re.token && re.analysis.weights.intelectual > 0);
});

test('skins: compra da skin completa, exclusivas não vendidas e regra das duas mãos', async (t) => {
  const h = harness(); await h.start(); t.after(() => h.server.close());
  h.day(SUN);
  await h.ok('POST', '/api/profile', { name: 'S' });
  const shop = await h.ok('GET', '/api/shop');
  assert.deepEqual(C.RARITIES.map((r) => r.name), ['Comum', 'Rara', 'Épica', 'Lendária', 'Mística', 'Secreta']);
  for (const r of C.RARITIES) assert.ok(shop.sets.filter((s) => s.rarity === r.key).length >= 3, `várias skins ${r.name}`);
  assert.ok(shop.sets.length >= 35);
  assert.ok(shop.sets.filter((s) => s.rarity === 'secreta').every((s) => !s.shop), 'secretas fora da loja');
  const viking = shop.sets.find((s) => s.key === 'viking');
  assert.equal((await h.api('POST', '/api/shop/buy-set', { set: 'viking' })).status, 400, 'sem moedas');
  h.db.run("INSERT INTO coin_events (amount, source, day, ukey) VALUES (5000, 'teste', ?, 'teste')", SUN);
  const bought = await h.ok('POST', '/api/shop/buy-set', { set: 'viking' });
  assert.equal(bought.paid, viking.price);
  assert.equal(bought.coins, 5000 - viking.price);
  assert.ok(viking.price < viking.items.length * C.RARITY.rara.price, 'skin completa tem desconto');
  assert.equal((await h.api('POST', '/api/shop/buy-set', { set: 'viking' })).status, 400, 'não compra duas vezes');
  for (const k of ['vazio', 'relojoeiro', 'draconico', 'ronin']) assert.equal((await h.api('POST', '/api/shop/buy-set', { set: k })).status, 400, `${k} não é vendida`);
  const eq = await h.ok('POST', '/api/character/set', { set: 'viking' });
  assert.equal(eq.character.weapon, 'vk_weapon');
  assert.equal(eq.character.shield, null, 'machado grande (duas mãos) não usa escudo');
  assert.ok(eq.note);
  await h.ok('POST', '/api/shop/buy-set', { set: 'recruta' });
  const r2 = await h.ok('PUT', '/api/character', { weapon: 'rc_weapon', shield: 'rc_shield' });
  assert.equal(r2.character.shield, 'rc_shield', 'lança + broquel é permitido');
});

test('recompensas de chefes: sorteio no servidor, uma vez por batalha, respeitando raridade e exclusividade', async (t) => {
  const h = harness(); await h.start(); t.after(() => h.server.close());
  h.day(SUN);
  await h.ok('POST', '/api/profile', { name: 'B' });
  const cyc = h.engine.ensureCycle(MON);
  const seq = (...vals) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };
  // 1) roll abaixo da chance, raridade comum → skin comum de qualquer chefe
  const d1 = h.engine.rollDrop(cyc.id, 'b1', 'golem', MON, seq(0, 0, 0, 0));
  assert.equal(d1.dropped, true);
  assert.equal(d1.skin.rarity, 'comum');
  const inv = new Set(h.db.all('SELECT item_id FROM inventory').map((r) => r.item_id));
  assert.ok(C.SETS[d1.skin.key].items.every((id) => inv.has(id)), 'todas as peças entregues');
  // 2) repetir a mesma batalha não sorteia de novo
  const again = h.engine.rollDrop(cyc.id, 'b1', 'golem', MON, seq(0, 0, 0, 0));
  assert.deepEqual(again, d1);
  // 3) roll acima da chance → nada
  const d2 = h.engine.rollDrop(cyc.id, 'b2', 'golem', MON, seq(9999));
  assert.equal(d2.dropped, false);
  assert.equal(d2.coins, 0);
  // 4) Boss Final, raridade secreta → a única secreta de chefe é a exclusiva do Tirano
  const d3 = h.engine.rollDrop(cyc.id, 'final', 'tyrant', MON, seq(0, 9999, 0, 0));
  assert.equal(d3.skin.key, 'vazio');
  // 5) secreta sorteada em chefe comum: não há secreta disponível → desce para a próxima raridade
  const c2 = h.engine.ensureCycle('2026-03-09');
  const d4 = h.engine.rollDrop(c2.id, 'b1', 'siren', MON, seq(0, 9999, 0, 0));
  assert.equal(d4.skin.rarity, 'mistica');
  assert.notEqual(C.SETS[d4.skin.key].boss, 'tyrant', 'exclusiva de outro chefe não cai');
  // tabelas somam 100%
  for (const tb of [C.LOOT.boss, C.LOOT.final]) assert.equal(Object.values(tb.weights).reduce((a, b) => a + b, 0), 10000);
  assert.ok(C.LOOT.boss.weights.secreta < C.LOOT.boss.weights.mistica && C.LOOT.boss.weights.mistica < C.LOOT.boss.weights.lendaria);
});

test('missões: progresso calculado no servidor e skin entregue ao concluir', async (t) => {
  const h = harness(); await h.start(); t.after(() => h.server.close());
  h.day(SUN);
  await h.ok('POST', '/api/profile', { name: 'M' });
  let ach = await h.ok('GET', '/api/achievements');
  const m = ach.find((a) => a.key === 'm_primeira_semana');
  assert.equal(m.skin, 'escudeiro');
  assert.equal(m.progress, 0);
  for (let i = 0; i < 3; i++) h.db.run("INSERT INTO coin_events (amount, source, day, ukey) VALUES (1, 'goal_week', ?, ?)", SUN, `gw:${i}`);
  h.engine.checkAchievements();
  ach = await h.ok('GET', '/api/achievements');
  assert.ok(ach.find((a) => a.key === 'm_primeira_semana').unlocked);
  const shop = await h.ok('GET', '/api/shop');
  assert.ok(shop.sets.find((s) => s.key === 'escudeiro').complete, 'skin da missão entregue');
  const drops = await h.ok('GET', '/api/drops');
  assert.deepEqual(drops, []);
});
