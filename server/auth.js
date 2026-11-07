'use strict';
/**
 * Contas e sessões.
 * - Senhas: scrypt (sal aleatório de 16 bytes, chave de 64 bytes), comparação em tempo constante.
 * - Sessões: token aleatório de 32 bytes num cookie HttpOnly + SameSite=Lax; no banco fica só o SHA-256 do token.
 * - Cada conta tem o próprio banco SQLite (data/users/u<id>.db), então os dados de um usuário nunca se misturam com os de outro.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { HttpError } = require('./util');

const SESSION_DAYS = 30;
const COOKIE = 'evorpg_sid';
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const AUTH_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
`;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
function verifyPassword(password, stored) {
  const [alg, s, k] = String(stored).split('$');
  if (alg !== 'scrypt' || !s || !k) return false;
  const expected = Buffer.from(k, 'base64');
  const got = crypto.scryptSync(password, Buffer.from(s, 'base64'), expected.length, SCRYPT);
  return crypto.timingSafeEqual(got, expected);
}
const DUMMY_HASH = hashPassword('senha-inexistente-para-tempo-constante');
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function validEmail(e) {
  const email = String(e || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, 'Informe um e-mail válido.');
  return email;
}
function validPassword(p) {
  const pw = String(p || '');
  if (pw.length < 8) throw new HttpError(400, 'A senha precisa ter pelo menos 8 caracteres.');
  if (pw.length > 200) throw new HttpError(400, 'Senha longa demais.');
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) throw new HttpError(400, 'Use letras e números na senha.');
  return pw;
}
function validName(n) {
  const name = String(n || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 40) throw new HttpError(400, 'Informe um nome entre 2 e 40 caracteres.');
  return name;
}

/**
 * dataDir: pasta onde ficam auth.db e users/.
 * legacyFile: banco da versão de usuário único; a primeira conta criada herda esses dados (uma cópia).
 */
function createAuth({ dataDir, legacyFile = null }) {
  fs.mkdirSync(path.join(dataDir, 'users'), { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'auth.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(AUTH_SCHEMA);
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);

  // Limite de tentativas (memória): por IP e por e-mail, janela de 15 minutos.
  const attempts = new Map();
  function throttle(key, max) {
    const now = Date.now();
    const list = (attempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
    if (list.length >= max) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.');
    list.push(now); attempts.set(key, list);
  }
  const clearThrottle = (key) => attempts.delete(key);

  function userFile(id) { return path.join(dataDir, 'users', `u${id}.db`); }
  function publicUser(u) { return u ? { id: u.id, email: u.email, name: u.name, created_at: u.created_at } : null; }

  function createSession(userId, userAgent) {
    const token = crypto.randomBytes(32).toString('base64url');
    run('INSERT INTO sessions (token_hash, user_id, expires_at, user_agent) VALUES (?,?,?,?)', sha(token), userId, Date.now() + SESSION_DAYS * 864e5, String(userAgent || '').slice(0, 200));
    run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
    return token;
  }
  function cookie(token, req, maxAgeDays = SESSION_DAYS) {
    const secure = process.env.COOKIE_SECURE === '1' || req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
    return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.round(maxAgeDays * 86400)}${secure ? '; Secure' : ''}`;
  }

  /** Usuário da requisição (ou null). Renova a validade de sessões usadas com frequência. */
  function userFromRequest(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (!token || token.length > 100) return null;
    const s = one('SELECT * FROM sessions WHERE token_hash = ?', sha(token));
    if (!s) return null;
    if (s.expires_at < Date.now()) { run('DELETE FROM sessions WHERE token_hash = ?', s.token_hash); return null; }
    if (s.expires_at - Date.now() < (SESSION_DAYS - 1) * 864e5) run('UPDATE sessions SET expires_at = ? WHERE token_hash = ?', Date.now() + SESSION_DAYS * 864e5, s.token_hash);
    const u = one('SELECT * FROM users WHERE id = ?', s.user_id);
    return u ? { ...publicUser(u), tokenHash: s.token_hash } : null;
  }

  function register({ name, email, password }, req) {
    throttle(`reg:${req.socket.remoteAddress}`, 10);
    const n = validName(name); const e = validEmail(email); const p = validPassword(password);
    if (one('SELECT 1 FROM users WHERE email = ?', e)) throw new HttpError(409, 'Já existe uma conta com este e-mail. Entre com sua senha.');
    const first = one('SELECT COUNT(*) n FROM users').n === 0;
    const id = Number(run('INSERT INTO users (email, name, password_hash) VALUES (?,?,?)', e, n, hashPassword(p)).lastInsertRowid);
    let adoptedLegacy = false;
    // A primeira conta herda o progresso da versão anterior (o arquivo original é mantido intacto).
    if (first && legacyFile && fs.existsSync(legacyFile) && !fs.existsSync(userFile(id))) {
      try {
        const old = new DatabaseSync(legacyFile);
        try { old.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } finally { old.close(); }
        fs.copyFileSync(legacyFile, userFile(id));
        adoptedLegacy = true;
      } catch { /* sem dados anteriores legíveis: a conta começa vazia */ }
    }
    const token = createSession(id, req.headers['user-agent']);
    return { user: publicUser(one('SELECT * FROM users WHERE id = ?', id)), token, adoptedLegacy };
  }

  function login({ email, password }, req) {
    const e = String(email || '').trim().toLowerCase();
    throttle(`ip:${req.socket.remoteAddress}`, 30);
    throttle(`login:${e}`, 8);
    const u = one('SELECT * FROM users WHERE email = ?', e);
    const ok = verifyPassword(String(password || ''), u ? u.password_hash : DUMMY_HASH) && !!u;
    if (!ok) throw new HttpError(401, 'E-mail ou senha incorretos.');
    clearThrottle(`login:${e}`);
    run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", u.id);
    return { user: publicUser(u), token: createSession(u.id, req.headers['user-agent']) };
  }

  function logout(user) { if (user) run('DELETE FROM sessions WHERE token_hash = ?', user.tokenHash); }

  function changePassword(user, { current, next }, req) {
    throttle(`pw:${user.id}`, 8);
    const u = one('SELECT * FROM users WHERE id = ?', user.id);
    if (!verifyPassword(String(current || ''), u.password_hash)) throw new HttpError(400, 'Senha atual incorreta.');
    const p = validPassword(next);
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(p), u.id);
    // encerra as outras sessões; a atual continua
    run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', u.id, user.tokenHash);
    return { ok: true };
  }

  return { db, register, login, logout, changePassword, userFromRequest, cookie, userFile, COOKIE };
}

module.exports = { createAuth, hashPassword, verifyPassword, parseCookies };
