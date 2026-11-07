'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
delete process.env.OPENAI_API_KEY;
const { createApp } = require('../server/index');
const { open } = require('../server/db');

async function start(opts) {
  const app = createApp(opts);
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const client = () => {
    let cookie = '';
    return async (method, p, body, headers = {}) => {
      const res = await fetch(base + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
      const sc = res.headers.get('set-cookie');
      if (sc) cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
      return { status: res.status, data: await res.json(), setCookie: sc };
    };
  };
  return { app, client, close: () => app.server.close() };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'evorpg-auth-'));

test('cadastro, login, sessão, isolamento de dados e troca de senha', async (t) => {
  const dir = tmp();
  const s = await start({ dataDir: dir, legacyFile: path.join(dir, 'nao-existe.db') });
  t.after(s.close);
  const a = s.client(); const b = s.client();

  assert.deepEqual((await a('GET', '/api/auth/me')).data, { mode: 'contas', user: null });
  assert.equal((await a('GET', '/api/state')).status, 401, 'dados exigem login');
  assert.equal((await a('POST', '/api/auth/register', { name: 'Ana', email: 'invalido', password: 'abc12345' })).status, 400);
  assert.equal((await a('POST', '/api/auth/register', { name: 'Ana', email: 'ana@x.com', password: 'curta1' })).status, 400);
  assert.equal((await a('POST', '/api/auth/register', { name: 'Ana', email: 'ana@x.com', password: 'somenteletras' })).status, 400);

  const reg = await a('POST', '/api/auth/register', { name: 'Ana', email: 'Ana@X.com ', password: 'segredo123' });
  assert.equal(reg.status, 200);
  assert.equal(reg.data.user.email, 'ana@x.com');
  assert.match(reg.setCookie, /HttpOnly/); assert.match(reg.setCookie, /SameSite=Lax/);
  assert.equal(reg.data.user.password_hash, undefined, 'hash nunca sai do servidor');
  const raw = reg.setCookie.split(';')[0].split('=')[1];
  const sess = s.app.auth.db.prepare('SELECT token_hash FROM sessions').all();
  assert.ok(sess.every((x) => x.token_hash !== raw), 'banco guarda apenas o hash do token');
  const stored = s.app.auth.db.prepare('SELECT password_hash FROM users').get().password_hash;
  assert.match(stored, /^scrypt\$/); assert.ok(!stored.includes('segredo123'));
  assert.equal((await b('POST', '/api/auth/register', { name: 'Outra', email: 'ana@x.com', password: 'segredo123' })).status, 409);

  // cada conta tem seus próprios dados
  assert.equal((await a('POST', '/api/profile', { name: 'Ana' })).status, 200);
  assert.equal((await a('POST', '/api/goals', { type: 'leitura', period: 'daily', target: 10, unit: 'paginas' })).status, 200);
  await b('POST', '/api/auth/register', { name: 'Bruno', email: 'bruno@x.com', password: 'outrasenha9' });
  assert.equal((await b('GET', '/api/config')).data.hasProfile, false);
  await b('POST', '/api/profile', { name: 'Bruno' });
  assert.deepEqual((await b('GET', '/api/goals')).data, []);
  assert.equal((await a('GET', '/api/goals')).data.length, 1);
  assert.ok(fs.existsSync(path.join(dir, 'users', 'u1.db')) && fs.existsSync(path.join(dir, 'users', 'u2.db')));

  // proteção de origem
  assert.equal((await a('POST', '/api/goals/preview', { type: 'leitura', period: 'daily', target: 5, unit: 'paginas' }, { Origin: 'https://site-malicioso.com' })).status, 403);

  // logout invalida a sessão
  assert.equal((await a('POST', '/api/auth/logout')).status, 200);
  assert.equal((await a('GET', '/api/state')).status, 401);
  assert.equal((await a('POST', '/api/auth/login', { email: 'ana@x.com', password: 'errada123' })).status, 401);
  assert.equal((await a('POST', '/api/auth/login', { email: 'ana@x.com', password: 'segredo123' })).status, 200);
  assert.equal((await a('GET', '/api/goals')).data.length, 1, 'dados preservados após novo login');

  // troca de senha encerra as outras sessões
  const a2 = s.client();
  await a2('POST', '/api/auth/login', { email: 'ana@x.com', password: 'segredo123' });
  assert.equal((await a('POST', '/api/auth/password', { current: 'errada', next: 'novaSenha77' })).status, 400);
  assert.equal((await a('POST', '/api/auth/password', { current: 'segredo123', next: 'novaSenha77' })).status, 200);
  assert.equal((await a('GET', '/api/state')).status, 200, 'sessão atual continua');
  assert.equal((await a2('GET', '/api/state')).status, 401, 'outra sessão encerrada');
  assert.equal((await a2('POST', '/api/auth/login', { email: 'ana@x.com', password: 'segredo123' })).status, 401);
  assert.equal((await a2('POST', '/api/auth/login', { email: 'ana@x.com', password: 'novaSenha77' })).status, 200);

  // limite de tentativas
  const c = s.client(); let last;
  for (let i = 0; i < 9; i++) last = await c('POST', '/api/auth/login', { email: 'bruno@x.com', password: `x${i}aaaaaa` });
  assert.equal(last.status, 429);
});

test('a primeira conta herda o progresso da versão sem contas', async (t) => {
  const dir = tmp();
  const legacy = path.join(dir, 'evolve.db');
  const old = open(legacy);
  old.run("INSERT INTO profile (id, name, timezone, character, created_on) VALUES (1, 'Herói antigo', 'UTC', '{}', '2026-01-01')");
  old.run("INSERT INTO coin_events (amount, source, day, ukey) VALUES (321, 'teste', '2026-01-01', 'legado')");
  old.close();
  const s = await start({ dataDir: dir, legacyFile: legacy });
  t.after(s.close);
  const a = s.client();
  const r = await a('POST', '/api/auth/register', { name: 'Eu', email: 'eu@x.com', password: 'minhasenha1' });
  assert.equal(r.data.adoptedLegacy, true);
  const st = await a('GET', '/api/state');
  assert.equal(st.data.profile.name, 'Herói antigo');
  assert.equal(st.data.coins, 321);
  assert.ok(fs.existsSync(legacy), 'arquivo original preservado');
  const b = s.client();
  const r2 = await b('POST', '/api/auth/register', { name: 'Outro', email: 'outro@x.com', password: 'minhasenha2' });
  assert.equal(r2.data.adoptedLegacy, false);
  assert.equal((await b('GET', '/api/config')).data.hasProfile, false);
});
