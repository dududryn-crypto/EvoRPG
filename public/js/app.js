// EvoRPG — shell da aplicação: estado global, navegação e feedback de progressão.
import { GET, POST, esc, icon, toast, toastError, floatText, levelUpFx, burst, ATTR, busy } from './ui.js';
import { heroStage, setItemCatalog } from './sprites.js';

const VIEWS = {
  inicio: { label: 'Início', icon: 'home', load: () => import('./views/home.js') },
  metas: { label: 'Metas', icon: 'target', load: () => import('./views/goals.js') },
  chefes: { label: 'Chefes', icon: 'skull', load: () => import('./views/bosses.js') },
  evolucao: { label: 'Evolução', icon: 'chart', load: () => import('./views/evolution.js') },
  detalhes: { label: 'Detalhes', icon: 'ai', load: () => import('./views/details.js') },
  personagem: { label: 'Personagem', icon: 'user', load: () => import('./views/character.js') },
  perfil: { label: 'Perfil', icon: 'gear', load: () => import('./views/profile.js') },
};

export const app = {
  state: null,
  config: null,
  view: null,
  cleanup: null,
  /** Recarrega o estado e mostra feedback visual das mudanças (XP, nível, moedas, conquistas). */
  async reloadConfig() { this.config = await GET('/api/config'); },
  async refresh({ fx = true, anchor = null } = {}) {
    const prev = this.state;
    const next = await GET('/api/state');
    this.state = next;
    if (fx && prev && prev.attributes) celebrate(prev, next, anchor);
    updateChrome();
    return next;
  },
  go(path) { location.hash = `#/${path}`; },
  user: null,
  async logout() { await POST('/api/auth/logout').catch(() => {}); location.hash = ''; location.reload(); },
  rerender() { return route({ soft: true }); },
};

function celebrate(prev, next, anchor) {
  const r = anchor?.getBoundingClientRect?.() || { left: innerWidth / 2 - 40, top: innerHeight / 2, width: 80 };
  let i = 0;
  for (const a of next.attributes) {
    const p = prev.attributes.find((x) => x.key === a.key);
    const d = a.xp - p.xp;
    if (d) {
      const delay = i++ * 180;
      setTimeout(() => floatText(`${d > 0 ? '+' : ''}${d} ${ATTR[a.key].name}`, d > 0 ? ATTR[a.key].color : '#ef5d68', r.left + r.width / 2 - 50 + (Math.random() * 40 - 20), r.top - 6), delay);
    }
    if (a.level > p.level) setTimeout(() => levelUpFx(`${ATTR[a.key].name} ${a.level}`, 'Atributo subiu de nível!'), 600);
    if (a.level < p.level) toast(`${esc(ATTR[a.key].name)} caiu para o nível ${a.level}.`, 'error');
  }
  if (next.character.level > prev.character.level) setTimeout(() => levelUpFx(`NÍVEL ${next.character.level}`, 'Seu personagem evoluiu!'), 1200);
  const dc = next.coins - prev.coins;
  if (dc > 0) toast(`+${dc} moedas`, 'xp', 2200);
  if (prev.streak.current < next.streak.current && next.streak.multiplier > prev.streak.multiplier) {
    toast(`Ofensiva de ${next.streak.current} dias! Multiplicador agora é <b>${next.streak.multiplier.toFixed(2)}x</b>`, 'xp', 4500);
  }
  if (next.today?.day?.status === 'success' && prev.today?.day?.status !== 'success' && prev.today?.date === next.today?.date) {
    toast('Todos os compromissos de hoje cumpridos! Bônus de Disciplina.', 'success', 4000);
    burst(r.left + r.width / 2, r.top, 50, ['#57d68d', '#f1cf85', '#c084fc']);
  }
  announceAchievements(next);
}

function announceAchievements(state) {
  if (!state.newAchievements?.length) return;
  const list = state.newAchievements;
  if (list.length > 3) {
    const coins = list.reduce((t, a) => t + a.coins, 0);
    setTimeout(() => { toast(`<b>${list.length} conquistas desbloqueadas!</b><br><span class="muted small">${list.map((a) => esc(a.name)).join(' · ')} · +${coins} moedas</span><br><a href="#/personagem/conquistas" class="small">Ver conquistas →</a>`, 'achievement', 8000); burst(innerWidth - 160, 60, 60, ['#f1cf85', '#d9ad55', '#fff']); }, 800);
    POST('/api/achievements/seen').catch(() => {}); state.newAchievements = []; return;
  }
  list.forEach((a, i) => setTimeout(() => {
    toast(`<b>Conquista desbloqueada:</b> ${esc(a.name)}<br><span class="muted small">+${a.coins} moedas${a.item ? ' e um item cosmético' : ''}</span>`, 'achievement', 6000);
    burst(innerWidth - 160, 60, 40, ['#f1cf85', '#d9ad55', '#fff']);
  }, 800 + i * 900));
  POST('/api/achievements/seen').catch(() => {});
  state.newAchievements = [];
}

// ---------- Layout ----------
function layout() {
  const nav = Object.entries(VIEWS).map(([k, v]) => `<button class="nav-btn" data-nav="${k}">${icon(v.icon)}<span>${v.label}</span></button>`).join('');
  document.getElementById('root').innerHTML = `
    <div class="app">
      <aside class="sidebar">
        <div class="brand"><div class="brand-mark">E</div><div class="brand-name">EvoRPG<small>Alpha 1.0</small></div></div>
        ${nav}
        <div class="sidebar-foot" id="side-foot"></div>
      </aside>
      <div>
        <header class="topbar"><div class="brand" style="padding:0"><div class="brand-mark" style="width:28px;height:28px;font-size:15px">E</div><div class="brand-name" style="font-size:16px">EvoRPG</div></div><div id="top-stats" class="row small"></div></header>
        <main class="main" id="view"></main>
      </div>
      <nav class="bottom-nav">${nav}</nav>
    </div>`;
  document.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => app.go(b.dataset.nav)));
}

function updateChrome() {
  const s = app.state;
  if (!s?.profile) return;
  const foot = document.getElementById('side-foot');
  const stats = `<span class="flame">${icon('flame', 'attr-icon')}</span><b>${s.streak.current}</b> <span class="muted">dias</span>
    <span style="margin-left:10px;color:var(--gold-2)">${icon('coin', 'attr-icon')}</span><b>${s.coins}</b>`;
  if (foot) {
    foot.innerHTML = `<div style="color:var(--text);font-weight:600">${esc(s.profile.name)} · Nv ${s.character.level}</div>${s.titleName ? `<div class="tiny gold" style="margin-bottom:6px">${esc(s.titleName)}</div>` : ''}<div class="row gap-s">${stats}</div>
      ${app.user ? `<div class="row between mt-s"><span class="tiny dim" title="${esc(app.user.email)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:130px">${esc(app.user.email)}</span><button class="btn xs ghost" id="logout">Sair</button></div>` : ''}`;
    foot.querySelector('#logout')?.addEventListener('click', () => app.logout());
  }
  const top = document.getElementById('top-stats');
  if (top) top.innerHTML = `<span class="row gap-s">${stats}</span>`;
}

async function route(opts = {}) {
  const [name, ...rest] = (location.hash.replace(/^#\/?/, '') || 'inicio').split('/');
  const key = VIEWS[name] ? name : 'inicio';
  document.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === key));
  if (!opts.soft) document.querySelectorAll('.modal-bg, .battle-bg').forEach((m) => m.remove());
  if (app.cleanup) { try { app.cleanup(); } catch { /* ignore */ } app.cleanup = null; }
  const el = document.getElementById('view');
  const y = window.scrollY;
  if (!opts.soft) el.innerHTML = '<div class="row" style="padding:40px;justify-content:center"><span class="spinner"></span></div>';
  try {
    const mod = await VIEWS[key].load();
    // A view renderiza num contêiner novo que passa a viver dentro de #view — assim referências
    // guardadas pela view (el.querySelector em callbacks posteriores) continuam válidas.
    const tmp = document.createElement('div');
    tmp.className = 'view-root';
    app.view = key;
    const cleanup = await mod.render(tmp, app, rest);
    el.className = opts.soft ? 'main' : 'main fade-in';
    el.replaceChildren(tmp);
    app.cleanup = cleanup || null;
    window.scrollTo({ top: opts.soft ? y : 0 });
  } catch (e) {
    el.innerHTML = `<div class="banner danger">${icon('x', 'attr-icon')} <div>${esc(e.message)}</div></div>`;
  }
}

// ---------- Cadastro e login ----------
const STARTER = { body: 'athletic', skin: '#e0a982', eyes: 'round', eyeColor: '#5b3a1e', face: 'neutral', hair: 'short', hairColor: '#3b2416', beard: 'none', chest: 'chest_tunic', legs: 'legs_pants', boots: 'boots_leather', weapon: 'wpn_training' };
function authScreen(mode = 'login') {
  const root = document.getElementById('root');
  const reg = mode === 'register';
  root.innerHTML = `<div class="onboard auth"><div class="panel ornament">
    <div class="center"><div class="brand" style="justify-content:center"><div class="brand-mark">E</div><div class="brand-name" style="text-align:left">EvoRPG<small>Alpha 1.1</small></div></div></div>
    <canvas id="au-hero"></canvas>
    <div class="tabs auth-tabs"><button data-m="login" class="${reg ? '' : 'on'}">Entrar</button><button data-m="register" class="${reg ? 'on' : ''}">Criar conta</button></div>
    <form id="au-form" class="col" novalidate>
      ${reg ? '<label class="field">Nome<input type="text" name="name" maxlength="40" autocomplete="name" required placeholder="Como devemos chamar você?"></label>' : ''}
      <label class="field">E-mail<input type="email" name="email" maxlength="254" autocomplete="email" required placeholder="voce@exemplo.com"></label>
      <label class="field">Senha<div class="pw-wrap"><input type="password" name="password" maxlength="200" autocomplete="${reg ? 'new-password' : 'current-password'}" required placeholder="${reg ? 'Mínimo de 8 caracteres, com letras e números' : 'Sua senha'}"><button type="button" class="pw-eye" aria-label="Mostrar senha">${icon('sparkle', 'attr-icon')}</button></div></label>
      ${reg ? '<div class="pw-meter"><i id="pw-bar"></i></div><label class="field">Confirmar senha<input type="password" name="confirm" maxlength="200" autocomplete="new-password" required></label>' : ''}
      <div id="au-err" class="small danger" role="alert"></div>
      <button class="btn primary" type="submit">${reg ? 'Criar conta e começar' : 'Entrar'}</button>
      <p class="tiny dim center" style="margin:0">${reg ? 'Seus dados ficam em um banco separado só para a sua conta. A senha é guardada com hash (scrypt).' : 'A sessão fica salva neste navegador por 30 dias.'}</p>
    </form></div></div>`;
  const stage = heroStage(root.querySelector('#au-hero'), () => STARTER, { scale: 1.4, idleWalk: true });
  root.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { stage.stop(); authScreen(b.dataset.m); }));
  const form = root.querySelector('#au-form');
  const err = root.querySelector('#au-err');
  root.querySelector('.pw-eye').addEventListener('click', () => { const i = form.password; i.type = i.type === 'password' ? 'text' : 'password'; });
  if (reg) form.password.addEventListener('input', () => {
    const v = form.password.value; let sc = 0;
    if (v.length >= 8) sc++; if (v.length >= 12) sc++; if (/[a-z]/i.test(v) && /\d/.test(v)) sc++; if (/[^a-z0-9]/i.test(v)) sc++;
    const bar = root.querySelector('#pw-bar'); bar.style.width = `${sc * 25}%`; bar.style.background = sc <= 1 ? 'var(--danger)' : sc === 2 ? 'var(--warn)' : 'var(--ok)';
  });
  (reg ? form.name : form.email).focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); err.textContent = '';
    const f = Object.fromEntries(new FormData(form).entries());
    if (reg && f.password !== f.confirm) { err.textContent = 'As senhas não conferem.'; return; }
    await busy(form.querySelector('button[type=submit]'), async () => {
      try {
        const r = await POST(`/api/auth/${reg ? 'register' : 'login'}`, reg ? { name: f.name, email: f.email, password: f.password } : { email: f.email, password: f.password });
        stage.stop();
        app.user = r.user;
        if (r.adoptedLegacy) toast('Encontramos o progresso da versão anterior e ele foi vinculado à sua conta.', 'success', 7000);
        await boot();
      } catch (ex) { err.textContent = ex.message; }
    });
  });
}

// ---------- Primeiro acesso ----------
function onboarding() {
  const root = document.getElementById('root');
  root.innerHTML = `<div class="onboard"><div class="panel ornament">
    <div class="center"><div class="brand" style="justify-content:center"><div class="brand-mark">E</div><div class="brand-name" style="text-align:left">EvoRPG<small>Alpha 1.0</small></div></div></div>
    <canvas id="ob-hero"></canvas>
    <h2 class="center">Comece sua jornada</h2>
    <p class="muted center" style="margin-top:6px">Evolua na vida real e veja seu personagem evoluir com você. Você escolhe suas metas — o jogo cuida da progressão.</p>
    <form id="ob-form" class="col mt">
      <label class="field">Como devemos chamar você?<input type="text" name="name" maxlength="40" required placeholder="Seu nome de aventureiro" value="${esc(app.user?.name || '')}"></label>
      <label class="field">Fuso horário<input type="text" name="tz" value="${esc(Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo')}"></label>
      <button class="btn primary" type="submit">Criar personagem</button>
    </form></div></div>`;
  const stage = heroStage(root.querySelector('#ob-hero'), () => ({ body: 'athletic', skin: '#e0a982', eyes: 'round', eyeColor: '#5b3a1e', face: 'neutral', hair: 'short', hairColor: '#3b2416', beard: 'none', chest: 'chest_tunic', legs: 'legs_pants', boots: 'boots_leather', weapon: 'wpn_training' }), { scale: 1.5, idleWalk: true });
  root.querySelector('#ob-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    await busy(e.target.querySelector('button'), async () => {
      app.state = await POST('/api/profile', { name: f.get('name'), timezone: f.get('tz') });
      stage.stop();
      await start();
      app.go('metas/nova');
    });
  });
}

let routing = false;
async function start() {
  layout();
  updateChrome();
  if (!routing) { window.addEventListener('hashchange', route); routing = true; }
  await route();
  announceAchievements(app.state);
}

window.addEventListener('evorpg:session-expired', () => { if (app.state) { toast('Sua sessão expirou. Entre novamente.', 'info', 5000); app.state = null; authScreen('login'); } });

async function boot() {
  try {
    const me = await GET('/api/auth/me');
    if (me.mode === 'contas' && !me.user) return authScreen('login');
    app.user = me.user;
    app.config = await GET('/api/config');
    setItemCatalog(app.config.cosmetics.items);
    document.title = 'EvoRPG';
    if (!app.config.hasProfile) return onboarding();
    app.state = await GET('/api/state');
    start();
  } catch (e) {
    document.getElementById('root').innerHTML = `<div class="onboard"><div class="panel"><h2>Não foi possível iniciar</h2><p class="muted">${esc(e.message)}</p><button class="btn" id="retry">Tentar novamente</button></div></div>`;
    document.getElementById('retry').addEventListener('click', () => location.reload());
    toastError(e);
  }
}
boot();
