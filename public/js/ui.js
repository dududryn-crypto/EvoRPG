// Utilidades de interface: API, escape de HTML, toasts, modais, ícones e efeitos.

export async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Sem conexão com o servidor. Verifique se o EvoRPG está rodando.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* resposta sem corpo */ }
  if (res.status === 401 && data?.details?.login) window.dispatchEvent(new CustomEvent('evorpg:session-expired'));
  if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
  return data;
}
export const GET = (p) => api('GET', p);
export const POST = (p, b = {}) => api('POST', p, b);
export const PUT = (p, b = {}) => api('PUT', p, b);
export const DEL = (p) => api('DELETE', p);

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const ATTR = {
  saude: { name: 'Saúde', color: '#4ade80' },
  fisico: { name: 'Físico', color: '#f87171' },
  intelectual: { name: 'Intelectual', color: '#60a5fa' },
  disciplina: { name: 'Disciplina', color: '#c084fc' },
  social: { name: 'Social', color: '#fbbf24' },
  criatividade: { name: 'Criatividade', color: '#f472b6' },
};
export const ATTR_KEYS = Object.keys(ATTR);
export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const CATEGORY_NAMES = { saude: 'Saúde', fisico: 'Físico', estudo: 'Estudo', leitura: 'Leitura', nutricao: 'Nutrição', sono: 'Sono', social: 'Social', criatividade: 'Criatividade', trabalho: 'Trabalho', habito: 'Hábito', geral: 'Geral' };

// ---------- Formatação ----------
export const fmtNum = (n, d = 1) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: d }));
export function fmtDate(s, opts = { day: '2-digit', month: 'short' }) {
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('pt-BR', { timeZone: 'UTC', ...opts });
}
export const fmtDateLong = (s) => fmtDate(s, { weekday: 'long', day: '2-digit', month: 'long' });
export function addDays(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
export const signed = (n) => (n > 0 ? `+${fmtNum(n)}` : fmtNum(n));

// ---------- Ícones (SVG inline) ----------
const P = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
  skull: '<path d="M12 3c-4.4 0-8 3.1-8 7.5 0 2.4 1.1 4.2 3 5.4V19a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3.1c1.9-1.2 3-3 3-5.4C20 6.1 16.4 3 12 3z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/><path d="M10 20v-2M14 20v-2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  flame: '<path d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 1-3.5S9 11 10.5 11C10.5 7 12 2 12 2z"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>',
  check: '<path d="M5 12l5 5 9-11"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  sword: '<path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  dumbbell: '<path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h1V4zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h-1V4z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c3 0 5 2 5 5"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1.2-1-1.3-1-2.5 0-1 .8-1.5 1.8-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.5" cy="7" r="1"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3M12 13v4M8 21h8M9 17h6v4H9z"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
  rest: '<path d="M4 17h16M6 17V9a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8M4 17v3M20 17v3"/>',
  arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  minus: '<path d="M5 12h14"/>',
  ai: '<rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M9 13h.01M15 13h.01M9 16h6"/>',
};
export function icon(name, cls = '') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
export const ATTR_ICON = { saude: 'heart', fisico: 'dumbbell', intelectual: 'brain', disciplina: 'shield', social: 'users', criatividade: 'palette' };
export const CATEGORY_ICON = { saude: 'heart', fisico: 'dumbbell', estudo: 'brain', leitura: 'book', nutricao: 'drop', sono: 'moon', social: 'users', criatividade: 'palette', trabalho: 'target', habito: 'check', geral: 'star' };

// ---------- Toasts ----------
export function toast(msg, type = 'info', ms = 3600) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const ic = { error: 'x', success: 'check', xp: 'sparkle', info: 'info', achievement: 'trophy' }[type] || 'info';
  const color = { error: 'var(--danger)', success: 'var(--ok)', xp: 'var(--gold-2)', achievement: 'var(--gold-2)' }[type] || 'var(--info)';
  el.innerHTML = `<span style="color:${color};width:18px;flex:none">${icon(ic)}</span><div>${msg}</div>`;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}
export const toastError = (e) => toast(esc(e.message || e), 'error', 5000);

// ---------- Modal ----------
export function modal({ title, body, foot = '', wide = false, onClose } = {}) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>${title}</h3><button class="icon-btn" data-close aria-label="Fechar">${icon('x')}</button></div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
  bg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  document.addEventListener('keydown', onKey);
  document.body.appendChild(bg);
  const first = bg.querySelector('input, select, textarea');
  if (first) setTimeout(() => first.focus(), 50);
  return { el: bg, close, $: (s) => bg.querySelector(s), $$: (s) => [...bg.querySelectorAll(s)] };
}

export function confirmBox(message, { okText = 'Confirmar', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title: 'Confirmação', body: `<p style="margin:0">${message}</p>`,
      foot: `<button class="btn" data-close>Cancelar</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${okText}</button>`,
      onClose: () => { if (!done) resolve(false); },
    });
    m.$('[data-ok]').addEventListener('click', () => { done = true; m.close(); resolve(true); });
  });
}

/** Executa ação assíncrona com botão em estado de carregamento. */
export async function busy(btn, fn) {
  if (btn) { btn.disabled = true; btn.dataset.label = btn.innerHTML; btn.innerHTML = '<span class="spinner"></span>'; }
  try { return await fn(); } catch (e) { toastError(e); return undefined; } finally {
    if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = btn.dataset.label; }
  }
}

// ---------- Efeitos ----------
export function floatText(text, color, x, y) {
  const el = document.createElement('div');
  el.className = 'float-xp';
  el.textContent = text;
  el.style.color = color;
  el.style.left = `${x}px`; el.style.top = `${y}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

export function levelUpFx(title, subtitle) {
  const el = document.createElement('div');
  el.className = 'levelup';
  el.innerHTML = `<div class="levelup-card"><div class="big">${esc(title)}</div><div class="sub">${esc(subtitle)}</div></div>`;
  document.body.appendChild(el);
  burst(window.innerWidth / 2, window.innerHeight / 2, 70, ['#f1cf85', '#d9ad55', '#fff3d1']);
  setTimeout(() => el.remove(), 2700);
}

/** Partículas em canvas sobreposto (sem dependências). */
export function burst(x, y, n = 40, colors = ['#f1cf85', '#57d68d']) {
  const c = document.createElement('canvas');
  c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:260';
  c.width = innerWidth; c.height = innerHeight;
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  const ps = Array.from({ length: n }, () => {
    const a = Math.random() * Math.PI * 2; const s = 2 + Math.random() * 6;
    return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 3, life: 1, r: 2 + Math.random() * 3, c: colors[(Math.random() * colors.length) | 0] };
  });
  (function frame() {
    ctx.clearRect(0, 0, c.width, c.height);
    let alive = 0;
    for (const p of ps) {
      if (p.life <= 0) continue;
      alive++;
      p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.vx *= 0.99; p.life -= 0.016;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    if (alive) requestAnimationFrame(frame); else c.remove();
  })();
}

export function bar(pct, cls = '') {
  return `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, pct * 100)).toFixed(1)}%"></i></div>`;
}

export function emptyState(title, text = '') {
  return `<div class="empty"><b>${esc(title)}</b>${esc(text)}</div>`;
}
