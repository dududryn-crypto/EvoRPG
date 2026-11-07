'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

loadEnv(path.join(__dirname, '..', '.env'));

const { open } = require('./db');
const { createEngine } = require('./engine');
const { createStats } = require('./stats');
const { buildRoutes } = require('./routes');
const { HttpError } = require('./util');
const { createAuth } = require('./auth');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
// Banco da versão de usuário único (antes das contas): a primeira conta criada herda uma cópia dele.
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'evolve.db');
const PUBLIC = path.join(__dirname, '..', 'public');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

/**
 * createApp({ dataDir, legacyFile }) → modo com contas (cadastro e login; cada usuário tem o próprio banco).
 * createApp('arquivo.db' | ':memory:') → modo de usuário único, sem login (usado pelos testes automatizados).
 */
function createApp(opts = { dataDir: DATA_DIR, legacyFile: DB_FILE }) {
  const multi = typeof opts === 'object' && opts !== null;
  const auth = multi ? createAuth(opts) : null;
  const contexts = new Map();
  function makeContext(file) {
    const db = open(file);
    const engine = createEngine(db);
    const stats = createStats(db, engine);
    return { db, engine, stats, routes: buildRoutes(db, engine, stats) };
  }
  function contextFor(userId) {
    if (!contexts.has(userId)) contexts.set(userId, makeContext(auth.userFile(userId)));
    return contexts.get(userId);
  }
  const single = multi ? null : makeContext(opts);
  const allRoutes = (single || makeContext(':memory:')).routes; // apenas para distinguir 404 de 405

  const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

  function send(res, status, body, headers = {}) {
    res.writeHead(status, {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
      ...headers,
    });
    res.end(body);
  }
  const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > 200 * 1024) { reject(new HttpError(413, 'Requisição muito grande.')); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try { const b = JSON.parse(Buffer.concat(chunks).toString('utf8')); resolve(b && typeof b === 'object' ? b : {}); } catch { reject(new HttpError(400, 'JSON inválido.')); }
      });
      req.on('error', reject);
    });
  }

  function serveStatic(req, res, pathname) {
    let rel = decodeURIComponent(pathname);
    if (rel === '/' || !path.extname(rel)) rel = '/index.html';
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Proibido');
    fs.readFile(file, (err, data) => {
      if (err) return send(res, 404, 'Não encontrado', { 'Content-Type': 'text/plain; charset=utf-8' });
      send(res, 200, data, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Método não permitido');
      return serveStatic(req, res, url.pathname);
    }
    try {
      // Protege contra requisições cross-site em operações que alteram dados.
      if (req.method !== 'GET' && req.headers['content-type'] && !req.headers['content-type'].includes('application/json')) throw new HttpError(415, 'Use application/json.');
      if (req.method !== 'GET' && req.headers.origin) {
        let host = null; try { host = new URL(req.headers.origin).host; } catch { /* inválido */ }
        if (host !== req.headers.host) throw new HttpError(403, 'Origem não permitida.');
      }
      // ---------- Contas ----------
      if (url.pathname.startsWith('/api/auth/')) {
        const user = multi ? auth.userFromRequest(req) : null;
        const route = `${req.method} ${url.pathname}`;
        if (route === 'GET /api/auth/me') return json(res, 200, { mode: multi ? 'contas' : 'unico', user });
        if (!multi) throw new HttpError(404, 'Contas desativadas neste modo.');
        const body = await readBody(req);
        if (route === 'POST /api/auth/register') {
          const r = auth.register(body, req);
          return send(res, 200, JSON.stringify({ user: r.user, adoptedLegacy: r.adoptedLegacy }), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': auth.cookie(r.token, req) });
        }
        if (route === 'POST /api/auth/login') {
          const r = auth.login(body, req);
          return send(res, 200, JSON.stringify({ user: r.user }), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': auth.cookie(r.token, req) });
        }
        if (route === 'POST /api/auth/logout') {
          auth.logout(user);
          return send(res, 200, JSON.stringify({ ok: true }), { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': auth.cookie('', req, 0) });
        }
        if (route === 'POST /api/auth/password') {
          if (!user) throw new HttpError(401, 'Entre na sua conta para continuar.');
          return json(res, 200, auth.changePassword(user, body, req));
        }
        throw new HttpError(404, 'Rota não encontrada.');
      }
      let ctx = single;
      if (multi) {
        const user = auth.userFromRequest(req);
        if (!user) throw new HttpError(401, 'Entre na sua conta para continuar.', { login: true });
        ctx = contextFor(user.id);
      }
      const { routes, engine } = ctx;
      const match = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
      if (!match) {
        const exists = allRoutes.some((r) => r.re.test(url.pathname));
        throw new HttpError(exists ? 405 : 404, exists ? 'Método não permitido.' : 'Rota não encontrada.');
      }
      const m = url.pathname.match(match.re);
      const params = Object.fromEntries(match.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const body = req.method === 'GET' ? {} : await readBody(req);
      engine.finalize(); // fecha dias anteriores antes de qualquer operação
      engine.invalidate();
      const result = await match.handler({ params, body, query: Object.fromEntries(url.searchParams), ip: req.socket.remoteAddress });
      json(res, 200, result);
    } catch (e) {
      if (e instanceof HttpError) return json(res, e.status, { error: e.message, details: e.details });
      console.error('[erro]', e);
      json(res, 500, { error: 'Erro interno do servidor.' });
    }
  });
  return single ? { server, db: single.db, engine: single.engine, auth: null } : { server, auth, contextFor };
}

if (require.main === module) {
  const { server } = createApp();
  server.listen(PORT, HOST, () => {
    console.log(`\n  ⚔  EvoRPG rodando em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`     Dados: ${DATA_DIR} (contas em auth.db, um banco por usuário em users/)`);
    console.log(`     IA (OpenAI): ${process.env.OPENAI_API_KEY ? 'ativada' : 'desativada — defina OPENAI_API_KEY no .env'}\n`);
  });
}

module.exports = { createApp };
