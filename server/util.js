'use strict';

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const bad = (msg, details) => new HttpError(400, msg, details);
const notFound = (msg = 'Recurso não encontrado.') => new HttpError(404, msg);

// ---------- Datas (sempre strings YYYY-MM-DD no fuso do usuário) ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayIn(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return parts; // en-CA => YYYY-MM-DD
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtDate(d) { return d.toISOString().slice(0, 10); }

function addDays(s, n) {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtDate(d);
}

function weekday(s) { return parseDate(s).getUTCDay(); } // 0 = domingo

function mondayOf(s) {
  const wd = weekday(s);
  return addDays(s, wd === 0 ? -6 : 1 - wd);
}

function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }

function isValidDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = parseDate(s);
  return fmtDate(d) === s;
}

function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// ---------- Validação ----------
const v = {
  str(val, name, { min = 0, max = 200, required = false } = {}) {
    if (val === undefined || val === null || val === '') {
      if (required) throw bad(`O campo "${name}" é obrigatório.`);
      return null;
    }
    if (typeof val !== 'string') throw bad(`O campo "${name}" deve ser texto.`);
    const s = val.trim();
    if (required && s.length < Math.max(1, min)) throw bad(`O campo "${name}" é obrigatório.`);
    if (s.length > max) throw bad(`O campo "${name}" aceita no máximo ${max} caracteres.`);
    return s || null;
  },
  num(val, name, { min = -Infinity, max = Infinity, required = false, int = false } = {}) {
    if (val === undefined || val === null || val === '') {
      if (required) throw bad(`O campo "${name}" é obrigatório.`);
      return null;
    }
    const n = Number(val);
    if (!Number.isFinite(n)) throw bad(`O campo "${name}" deve ser numérico.`);
    if (int && !Number.isInteger(n)) throw bad(`O campo "${name}" deve ser um número inteiro.`);
    if (n < min || n > max) throw bad(`O campo "${name}" deve estar entre ${min} e ${max}.`);
    return n;
  },
  date(val, name, { required = true } = {}) {
    if (!val) { if (required) throw bad(`O campo "${name}" é obrigatório.`); return null; }
    if (!isValidDate(val)) throw bad(`Data inválida em "${name}". Use AAAA-MM-DD.`);
    return val;
  },
  oneOf(val, name, options, { required = true, fallback } = {}) {
    if (val === undefined || val === null || val === '') {
      if (required && fallback === undefined) throw bad(`O campo "${name}" é obrigatório.`);
      return fallback ?? null;
    }
    if (!options.includes(val)) throw bad(`Valor inválido para "${name}".`);
    return val;
  },
  bool(val) { return val === true || val === 1 || val === '1' || val === 'true'; },
  time(val, name) {
    if (!val) return null;
    if (typeof val !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(val)) throw bad(`Horário inválido em "${name}". Use HH:MM.`);
    return val;
  },
  id(val, name = 'id') {
    const n = Number(val);
    if (!Number.isInteger(n) || n <= 0) throw bad(`Identificador inválido (${name}).`);
    return n;
  },
};

module.exports = { HttpError, bad, notFound, todayIn, addDays, weekday, mondayOf, daysBetween, isValidDate, dateRange, parseDate, v };
