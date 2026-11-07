import { GET, POST, PUT, esc, icon, modal, busy, toast, fmtNum, fmtDate, bar, burst, emptyState, ATTR } from '../ui.js';
import { animate, drawBoss, bossPose, drawHero, heroPose, BOSS_COLORS } from '../sprites.js';

const pctTxt = (p) => (p === null || p === undefined ? '—' : `${fmtNum(p * 100, 1)}%`);

export async function render(el, app) {
  const data = await GET('/api/cycles');
  const c = data.current;
  const stops = [];
  el.innerHTML = `
    <div class="page-head"><div><h1>Chefes da semana</h1><p>Ciclo de ${fmtDate(c.week_start)} a ${fmtDate(c.week_end)} · ${c.ended ? '<b class="warn">encerrado</b>' : `${c.daysLeft} dia(s) restantes`}</p></div>
      ${c.ended ? `<button class="btn" data-report="${c.id}">Relatório da semana</button>` : ''}</div>
    <div class="banner info small">${icon('info', 'attr-icon')}<div>O dano de cada chefe é calculado pelo servidor a partir do que você registrou — nada é aleatório e você não escolhe dano, vida ou recompensa.
      ${c.configOpen ? ' <b>Hoje é o dia de configuração:</b> escolha as metas do Boss 1 e do Boss 2.' : ' As metas do Boss 1 e 2 deste ciclo estão travadas desde segunda-feira.'}</div></div>
    <div class="grid g2" id="bosses">${c.bosses.map((b) => bossCard(app, c, b)).join('')}${finalCard(app, c)}</div>
    <section class="panel mt"><div class="panel-title"><h3>${icon('calendar', 'attr-icon')} Próximo ciclo (${fmtDate(data.next.week_start)} – ${fmtDate(data.next.week_end)})</h3></div>
      <p class="small muted" style="margin-top:0">Escolha com antecedência as metas do Boss 1 e do Boss 2. Metas e alterações definidas até a próxima segunda entram neste ciclo.</p>
      <div class="grid g2">${data.next.bosses.map((b) => `<label class="field">Boss ${b.slot}<select data-next-slot="${b.slot}"><option value="">— escolher —</option>${data.next.goals.filter((g) => g.status === 'valida').map((g) => `<option value="${g.id}" ${b.goal && b.goal.id === g.id ? 'selected' : ''}>${esc(g.name)} — ${esc(g.targets.text)}</option>`).join('')}</select></label>`).join('')}</div></section>
    <h2 class="mt mb">Ciclos anteriores</h2><div id="history">${history(data.history)}</div>`;

  const portrait = (canvas, arch, statusAnim, scale = 1) => stops.push(animate(canvas, (ctx, w, h, t) => {
    ctx.save(); ctx.translate(w / 2, h * 0.93); const s = Math.min(1, h / 230) * scale; ctx.scale(s, s);
    drawBoss(ctx, arch, bossPose(statusAnim, statusAnim === 'defeat' ? 0.95 : t, t), t);
    ctx.restore();
  }));
  c.bosses.forEach((b) => {
    const root = el.querySelector(`[data-boss="${b.key}"]`);
    const cv = root.querySelector('canvas');
    if (cv) portrait(cv, b.archetype, b.status === 'victory' ? 'defeat' : b.status === 'defeat' ? 'win' : 'idle');
    root.querySelector('[data-slot]')?.addEventListener('change', (e) => busy(null, async () => {
      await PUT('/api/cycles/bosses', { week_start: c.week_start, slot: b.slot, goal_id: e.target.value ? Number(e.target.value) : null }); app.rerender();
    }));
  });
  const fcv = el.querySelector('[data-boss="final"] canvas');
  portrait(fcv, 'tyrant', c.final.status === 'victory' ? 'defeat' : c.final.status === 'defeat' ? 'win' : 'idle', 0.82);

  el.querySelectorAll('[data-fight]').forEach((btn) => btn.addEventListener('click', () => busy(btn, async () => {
    const [cid, which] = btn.dataset.fight.split(':');
    const res = await POST(`/api/cycles/${cid}/fight`, { which });
    await battle(app, res.battle, which === 'final', () => { app.refresh(); app.rerender(); }, Number(cid), false, res.drop);
  })));
  el.querySelectorAll('[data-replay]').forEach((btn) => btn.addEventListener('click', () => {
    const [cid, which] = btn.dataset.replay.split(':');
    const cyc = [data.current, ...data.history].find((x) => x.id === Number(cid));
    const b = which === 'final' ? cyc.final.battle : cyc.bosses.find((x) => x.key === which).battle;
    battle(app, b, which === 'final', null, Number(cid), true);
  }));
  el.querySelectorAll('[data-report]').forEach((btn) => btn.addEventListener('click', () => reportModal(app, Number(btn.dataset.report))));
  el.querySelector('#suspend')?.addEventListener('click', () => suspendModal(app, c));
  el.querySelectorAll('[data-next-slot]').forEach((s) => s.addEventListener('change', () => busy(null, async () => {
    await PUT('/api/cycles/bosses', { week_start: data.next.week_start, slot: Number(s.dataset.nextSlot), goal_id: s.value ? Number(s.value) : null });
    toast('Chefe do próximo ciclo definido.', 'success', 2000); app.rerender();
  })));
  return () => stops.forEach((s) => s.stop());
}

function bossCard(app, c, b) {
  const color = b.archetype ? BOSS_COLORS[b.archetype] : '#666';
  const valid = c.goals.filter((g) => g.status === 'valida');
  const other = c.bosses.find((x) => x.slot !== b.slot)?.goal?.id;
  const g = b.goal;
  return `<section class="panel boss-card ${b.status}" data-boss="${b.key}">
    <div class="boss-portrait">${b.archetype ? '<canvas></canvas>' : `<div class="chart-empty">${icon('skull', 'attr-icon')}<br>${c.configOpen ? 'Escolha uma meta para revelar o chefe' : 'Nenhuma meta foi escolhida até segunda-feira'}</div>`}
      <span class="slot">Boss ${b.slot} · meta escolhida</span>${b.battle ? `<span class="result-stamp ${b.status}">${b.status === 'victory' ? 'Derrotado' : 'Derrota'}</span>` : ''}</div>
    <div><h3 style="color:${color}">${esc(b.name || 'Chefe oculto')}</h3>${g ? `<div class="small muted">${esc(g.name)} · ${esc(g.targets.text)}</div>` : ''}</div>
    ${g ? `<div><div class="row between small"><span>Vida do chefe</span><span class="mono">${fmtNum((1 - g.pct) * 100, 0)}%</span></div>${bar(1 - g.pct, 'hp lg')}
      <div class="small muted mt-s">${g.capped ? `Cumprimento médio dos dias: <b style="color:var(--text)">${pctTxt(g.pct)}</b> (${g.daysWithData}/${g.expectedDays} dias com registro)` : `Progresso: <b style="color:var(--text)">${fmtNum(g.value)} / ${fmtNum(g.target)} ${esc(app.config.catalog.units[g.unit].label)}</b> (${pctTxt(g.pct)})`}</div></div>` : ''}
    ${c.configOpen && !b.battle ? `<label class="field">Meta deste chefe<select data-slot><option value="">— escolher —</option>${valid.filter((x) => x.id !== other).map((x) => `<option value="${x.id}" ${g && g.id === x.id ? 'selected' : ''}>${esc(x.name)} — ${esc(x.targets.text)}</option>`).join('')}</select></label>` : ''}
    ${b.battle ? `<div class="row"><button class="btn sm" data-replay="${c.id}:${b.key}">${icon('play', 'attr-icon')} Rever batalha</button></div>`
    : `<button class="btn ${b.canFight ? 'primary' : ''}" data-fight="${c.id}:${b.key}" ${b.canFight ? '' : 'disabled'}>${icon('sword', 'attr-icon')} ${b.canFight ? 'Enfrentar' : 'Disponível no fim da semana ou com 100%'}</button>`}
  </section>`;
}

function finalCard(app, c) {
  const f = c.final;
  const avg = c.average;
  const units = app.config.catalog.units;
  const rows = c.goals.map((g) => `<div class="goal-row ${g.status !== 'valida' ? 'excluded' : ''}">
      <div><b>${esc(g.name)}</b> <span class="tiny muted">${esc(g.targets.text)}</span>
        ${g.status === 'suspensa' ? `<div class="tiny warn">suspensa: “${esc(g.suspension.reason)}” — fora do cálculo</div>` : g.status === 'sem-dias' ? '<div class="tiny muted">sem dias programados (descanso) — fora do cálculo</div>' : g.daysWithData === 0 && c.started ? '<div class="tiny danger">sem registros: conta 0%</div>' : ''}</div>
      <div>${bar(g.pct)}</div><div class="mono small" style="text-align:right">${g.status === 'valida' ? pctTxt(g.pct) : '—'}</div></div>`).join('');
  return `<section class="panel boss-card final-card ${f.status}" data-boss="final">
    <div class="col"><div class="boss-portrait"><canvas></canvas><span class="slot">Boss Final · desempenho geral</span>${f.battle ? `<span class="result-stamp ${f.status}">${f.status === 'victory' ? 'Derrotado' : 'Derrota'}</span>` : ''}</div>
      <h3 style="color:${BOSS_COLORS.tyrant};font-size:20px">${esc(f.name)}</h3>
      <div class="small muted">Vence com média aritmética simples ≥ <b>95%</b> em todas as metas válidas. Cada meta conta no máximo 100% — superar uma não compensa outra.</div></div>
    <div class="col">
      <div><div class="row between"><span>Média ${c.ended ? 'final' : 'até agora'}: <b class="gold" style="font-size:22px;font-family:var(--display)">${pctTxt(avg)}</b></span><span class="small muted">${c.included} meta(s) no cálculo</span></div>
        <div class="avg-meter mt-s"><i style="width:${Math.min(100, (avg || 0) * 100)}%"></i><b style="left:95%" title="95%"></b></div>
        <div class="row between tiny muted mt-s"><span>0%</span><span style="margin-left:auto;margin-right:3%">95%</span></div></div>
      <div class="panel tight" style="background:var(--bg-2)">${rows || emptyState('Nenhuma meta válida neste ciclo', 'Metas criadas depois do início do ciclo entram a partir do próximo.')}</div>
      <div class="row wrap">
        ${f.battle ? `<button class="btn sm" data-replay="${c.id}:final">${icon('play', 'attr-icon')} Rever batalha</button>` : `<button class="btn ${f.canFight ? 'primary' : ''}" data-fight="${c.id}:final" ${f.canFight ? '' : 'disabled'}>${icon('sword', 'attr-icon')} ${f.canFight ? 'Enfrentar o Boss Final' : 'Disponível após o fim da semana'}</button>`}
        ${!c.ended && c.started && !c.events.some((e) => e.kind === 'suspend') ? '<button class="btn sm ghost" id="suspend">Suspender uma meta (exceção)</button>' : ''}
        ${c.events.length ? `<span class="tiny muted">${c.events.length} alteração(ões) excepcional(is) registrada(s)</span>` : ''}
      </div></div>
  </section>`;
}

function history(cycles) {
  const list = cycles.filter((c) => c.included || c.bosses.some((b) => b.goal));
  if (!list.length) return emptyState('Nenhum ciclo anterior', 'Os resultados das semanas passadas aparecem aqui.');
  const st = (s) => (s === 'victory' ? '<span class="tag ok">vitória</span>' : s === 'defeat' ? '<span class="tag danger">derrota</span>' : '<span class="tag warn">aguardando</span>');
  return list.map((c) => `<div class="panel tight mb"><div class="row between wrap"><b>${fmtDate(c.week_start)} – ${fmtDate(c.week_end)}</b>
    <div class="row wrap gap-s"><span class="small">Média <b class="gold">${pctTxt(c.average)}</b></span>
      ${c.bosses.filter((b) => b.goal).map((b) => `<span class="small">Boss ${b.slot} ${st(b.status)}</span>`).join('')}<span class="small">Final ${st(c.final.status)}</span>
      ${[...c.bosses.filter((b) => b.canFight).map((b) => `<button class="btn xs primary" data-fight="${c.id}:${b.key}">Boss ${b.slot}</button>`), c.final.canFight ? `<button class="btn xs primary" data-fight="${c.id}:final">Boss Final</button>` : ''].join('')}
      <button class="btn xs" data-report="${c.id}">Relatório</button></div></div></div>`).join('');
}

function suspendModal(app, c) {
  const opts = c.goals.filter((g) => g.status === 'valida' && !c.bosses.some((b) => b.goal && b.goal.id === g.id));
  const m = modal({
    title: 'Suspender uma meta neste ciclo',
    body: `<div class="banner warn small"><div>Alteração excepcional: a meta sai do cálculo do Boss Final <b>apenas nesta semana</b>. É permitida uma por ciclo, exige justificativa e fica registrada no relatório. Metas do Boss 1 e 2 não podem ser suspensas.</div></div>
      <label class="field">Meta<select data-g>${opts.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></label>
      <label class="field mt-s">Motivo (mín. 10 caracteres)<textarea data-r maxlength="300" placeholder="Ex.: lesão no joelho, orientação médica de repouso"></textarea></label>`,
    foot: '<button class="btn" data-close>Cancelar</button><button class="btn danger" data-ok>Suspender e registrar</button>',
  });
  m.$('[data-ok]').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    await POST(`/api/cycles/${c.id}/suspend`, { goal_id: Number(m.$('[data-g]').value), reason: m.$('[data-r]').value });
    m.close(); toast('Suspensão registrada.', 'info'); app.rerender();
  }));
}

// ================= BATALHA =================
function battle(app, b, isFinal, onDone, cycleId, replay = false, drop = null) {
  return new Promise((resolve) => {
    const script = b.script;
    const color = BOSS_COLORS[b.archetype] || '#fff';
    const bg = document.createElement('div');
    bg.className = 'battle-bg';
    bg.innerHTML = `<div class="battle">
      <div class="battle-hud">
        <div><div class="who"><span>${esc(app.state.profile.name)}</span><span class="mono" id="php">100%</span></div><div class="bar hp player xl"><i id="pbar" style="width:100%"></i></div></div>
        <div class="vs">VS</div>
        <div><div class="who"><span style="color:${color}">${esc(b.name)}${isFinal ? ' · BOSS FINAL' : ''}</span><span class="mono" id="bhp">100%</span></div><div class="bar hp xl"><i id="bbar" style="width:100%"></i></div></div>
      </div>
      <canvas class="battle-canvas"></canvas>
      <div class="battle-foot"><div class="battle-log" id="blog">Prepare-se…</div><div class="row"><button class="btn sm ghost" id="skip">Pular</button><button class="btn sm primary hidden" id="result">Ver relatório</button></div></div></div>`;
    document.body.appendChild(bg);
    const $ = (s) => bg.querySelector(s);
    const log = (t) => { $('#blog').innerHTML = t; };
    const ev = []; let tl = 0.9;
    const push = (at, fn) => ev.push({ at, fn, done: false });
    let heroAnim = { name: 'idle', start: 0 }; let bossAnim = { name: 'idle', start: 0 };
    let bossHp = 100; let heroHp = 100; let shake = 0; let now = 0; let finished = false;
    const pops = []; const parts = [];
    const bossAttacks = script.steps.filter((s) => s.actor === 'boss' && (s.type === 'attack' || s.type === 'final_attack')).length;
    const heroLoss = script.victory ? Math.min(12, 40 / Math.max(1, bossAttacks)) : 100 / Math.max(1, bossAttacks);
    const sparks = (xr, yr, c, n = 26) => { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2; const s = 40 + Math.random() * 160; parts.push({ xr, yr, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, c, t: now }); } };
    push(0.3, () => log(isFinal ? `Média semanal registrada: <b class="gold">${pctTxt(b.pct)}</b> — são necessários 95%.` : `Progresso registrado na meta: <b class="gold">${pctTxt(b.pct)}</b>`));
    if (!script.steps.some((s) => s.actor === 'player' && s.type === 'attack')) push(1.0, () => log('Nenhum progresso registrado: seus golpes não alcançam o chefe…'));
    for (const st of script.steps) {
      if (st.actor === 'player' && st.type === 'attack') {
        push(tl, () => { heroAnim = { name: 'attack', start: now }; log(`Você ataca! <b class="gold">${fmtNum(st.damage)}%</b> de dano.`); });
        push(tl + 0.38, () => { bossAnim = { name: 'hurt', start: now }; bossHp = Math.max(0, Math.round((bossHp - st.damage) * 10) / 10); pops.push({ x: 0.72, y: 0.3, txt: `-${fmtNum(st.damage)}%`, c: '#f1cf85', t: now }); shake = isFinal ? 9 : 6; sparks(0.68, 0.5, '#f1cf85'); });
        tl += 1.1;
      } else if (st.actor === 'boss' && (st.type === 'attack' || st.type === 'final_attack')) {
        push(tl, () => { bossAnim = { name: 'attack', start: now }; log(st.type === 'final_attack' ? 'O chefe resistiu e desfere o golpe final…' : 'O chefe contra-ataca!'); });
        push(tl + 0.4, () => { heroAnim = { name: 'hurt', start: now }; heroHp = st.type === 'final_attack' ? 0 : Math.max(5, heroHp - heroLoss); pops.push({ x: 0.28, y: 0.35, txt: st.type === 'final_attack' ? 'K.O.' : 'dano', c: '#ff6b74', t: now }); shake = 8; sparks(0.3, 0.55, '#ff6b74'); });
        tl += 1.1;
      } else if (st.actor === 'boss' && st.type === 'defeat') {
        push(tl, () => { bossAnim = { name: 'defeat', start: now }; bossHp = 0; log(`<b class="ok">${esc(b.name)} foi derrotado!</b>`); sparks(0.72, 0.45, color, 70); });
        tl += 1.5;
      } else if (st.actor === 'player' && st.type === 'victory') {
        push(tl, () => { heroAnim = { name: 'victory', start: now }; const r = bg.querySelector('canvas').getBoundingClientRect(); burst(r.left + r.width * 0.3, r.top + r.height * 0.5, 90, ['#f1cf85', '#57d68d', '#fff']); });
        tl += 1.2;
      } else if (st.actor === 'player' && st.type === 'defeat') {
        push(tl, () => { heroAnim = { name: 'defeat', start: now }; bossAnim = { name: 'win', start: now }; log('<b class="danger">Derrota.</b>'); });
        tl += 1.4;
      }
    }
    push(tl, () => finish());
    function finish() {
      if (finished) return; finished = true;
      for (const e of ev) if (!e.done) { e.done = true; e.fn(); }
      bossHp = script.bossHpLeft; heroHp = script.victory ? Math.max(heroHp, 20) : 0;
      $('#skip').classList.add('hidden'); $('#result').classList.remove('hidden');
      if (script.victory) log(`<b class="ok">Vitória!</b> ${replay ? '' : isFinal ? '+60 XP de Disciplina e +100 moedas.' : '+40 XP nos atributos da meta e +40 moedas.'}${drop && !replay ? ' <b class="gold">O chefe deixou algo para trás…</b>' : ''}`);
      else log(`<b class="danger">Derrota.</b> ${isFinal ? `Média de ${pctTxt(b.pct)}; faltaram ${fmtNum(Math.max(0, 95 - b.pct * 100), 1)} pontos percentuais. O relatório mostra quais metas ficaram abaixo.` : `Dano causado: ${fmtNum(script.damage)}%.`}`);
      if (drop && !replay && script.victory) $('#result').textContent = 'Ver recompensa';
    }
    const cfg = app.state.appearance;
    const anim = animate($('canvas'), (ctx, w, h, t) => {
      now = t;
      for (const e of ev) if (!e.done && t >= e.at) { e.done = true; e.fn(); }
      $('#bbar').style.width = `${bossHp}%`; $('#bhp').textContent = `${fmtNum(bossHp, 1)}%`;
      $('#pbar').style.width = `${heroHp}%`; $('#php').textContent = `${Math.round(heroHp)}%`;
      ctx.save();
      if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= 0.88; if (shake < 0.3) shake = 0; }
      const g = ctx.createLinearGradient(0, 0, 0, h);
      if (isFinal) { g.addColorStop(0, '#1d0a0e'); g.addColorStop(0.6, '#2a0f14'); g.addColorStop(1, '#0c0507'); }
      else { g.addColorStop(0, '#120f1d'); g.addColorStop(0.65, '#1a1526'); g.addColorStop(1, '#0a0910'); }
      ctx.fillStyle = g; ctx.fillRect(-10, -10, w + 20, h + 20);
      if (isFinal) {
        for (let i = 0; i < 40; i++) { const ph = (t * 0.15 + i / 40) % 1; ctx.fillStyle = `rgba(255,${90 + (i % 5) * 20},60,${0.6 * (1 - ph)})`; ctx.fillRect((i * 131) % w, h * (1 - ph), 2, 2); }
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        for (let i = 0; i < 5; i++) { const x = w * (0.1 + i * 0.2); ctx.beginPath(); ctx.moveTo(x - 30, h * 0.8); ctx.lineTo(x - 18, h * 0.25); ctx.lineTo(x + 18, h * 0.25); ctx.lineTo(x + 30, h * 0.8); ctx.fill(); }
      } else {
        ctx.fillStyle = 'rgba(217,173,85,.05)';
        for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(w * (0.1 + i * 0.17), 0); ctx.lineTo(w * (0.05 + i * 0.17), h * 0.78); ctx.lineTo(w * (0.13 + i * 0.17), h * 0.78); ctx.closePath(); ctx.fill(); }
        for (let i = 0; i < 30; i++) { ctx.fillStyle = `rgba(255,255,255,${0.15 + 0.15 * Math.sin(t * 2 + i)})`; ctx.fillRect((i * 97) % w, (i * 53) % (h * 0.5), 1.5, 1.5); }
      }
      const ground = h * 0.8;
      ctx.fillStyle = isFinal ? '#1b0b0f' : '#16121f'; ctx.fillRect(0, ground, w, h - ground);
      ctx.strokeStyle = isFinal ? 'rgba(255,90,60,.35)' : 'rgba(217,173,85,.25)'; ctx.beginPath(); ctx.moveTo(0, ground); ctx.lineTo(w, ground); ctx.stroke();
      const sc = Math.min(1.25, h / 260);
      ctx.save(); ctx.translate(w * 0.26, ground); ctx.scale(sc * 1.25, sc * 1.25); drawHero(ctx, cfg, heroPose(heroAnim.name, t - heroAnim.start, t), t); ctx.restore();
      ctx.save(); ctx.translate(w * 0.72, ground); const bs = isFinal ? sc * 0.95 : sc; ctx.scale(bs, bs); drawBoss(ctx, b.archetype, bossPose(bossAnim.name, t - bossAnim.start, t), t); ctx.restore();
      for (const p of parts) { const k = t - p.t; if (k > 0.9) continue; ctx.globalAlpha = 1 - k / 0.9; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(w * p.xr + p.vx * k, h * p.yr + p.vy * k + 220 * k * k, 2.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      for (const p of pops) { const k = t - p.t; if (k > 1.2) continue; ctx.globalAlpha = 1 - k / 1.2; ctx.fillStyle = p.c; ctx.font = `bold ${22 + (k < 0.15 ? (0.15 - k) * 60 : 0)}px Georgia, serif`; ctx.textAlign = 'center'; ctx.fillText(p.txt, w * p.x, h * p.y - k * 50); }
      ctx.globalAlpha = 1; ctx.restore();
    });
    const close = () => { anim.stop(); bg.remove(); onDone && onDone(); resolve(); };
    $('#skip').addEventListener('click', finish);
    $('#result').addEventListener('click', () => { close(); if (drop && !replay && script.victory) lootModal(app, drop, () => reportModal(app, cycleId)); else reportModal(app, cycleId); });
    bg.addEventListener('mousedown', (e) => { if (e.target === bg && finished) close(); });
  });
}

// ================= RECOMPENSA (sorteada no servidor) =================
function lootModal(app, drop, then) {
  const C = app.config.cosmetics;
  const rar = Object.fromEntries(C.rarities.map((r) => [r.key, r]));
  const st = drop.skin ? C.sets.find((s) => s.key === drop.skin.key) : null;
  const m = modal({
    title: st ? 'Recompensa do chefe' : 'Recompensa',
    body: st ? `<div class="loot-reveal r-${st.rarity}"><canvas id="loot"></canvas>
        <div class="rarity-tag r-${st.rarity}" style="font-size:13px">${rar[st.rarity].name}</div><h2 style="margin:6px 0">${esc(st.name)}</h2>
        <p class="muted small">${esc(st.desc)}</p><p class="small">Todas as ${st.items.length} peças foram adicionadas ao seu inventário.</p></div>`
      : drop.coins ? `<div class="center"><h2>${icon('coin')} +${drop.coins} moedas</h2><p class="muted small">${esc(drop.detail || '')}</p></div>`
        : '<p class="muted">Nenhuma skin desta vez. Cada vitória tem nova chance — as probabilidades estão em Personagem → Recompensas.</p>',
    foot: `${st ? '<button class="btn" id="l-equip">Equipar agora</button>' : ''}<button class="btn primary" data-close>Continuar</button>`,
    onClose: () => { stop && stop(); then && then(); },
  });
  let stop = null;
  if (st) {
    const byId = Object.fromEntries(C.items.map((i) => [i.id, i]));
    const look = { ...app.state.appearance, pet: null };
    for (const sl of ['head', 'mask', 'gloves', 'cape', 'effect', 'shield', 'accessory']) look[sl] = null;
    for (const id of st.items) look[byId[id].slot] = id;
    const t0 = performance.now();
    const a = animate(m.$('#loot'), (ctx, w, h, t) => {
      const k = (performance.now() - t0) / 1000;
      const g = ctx.createRadialGradient(w / 2, h * 0.6, 4, w / 2, h * 0.6, Math.max(w, h) * 0.6);
      g.addColorStop(0, `${rar[st.rarity].color}55`); g.addColorStop(1, 'transparent'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.save(); ctx.translate(w / 2, h * 0.6); ctx.rotate(t * 0.3); for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.fillStyle = `${rar[st.rarity].color}22`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-14, -h); ctx.lineTo(14, -h); ctx.fill(); } ctx.restore();
      const sc = Math.min(1.6, h / 170) * Math.min(1, k * 1.4);
      ctx.save(); ctx.translate(w / 2 + 10, h - 16); ctx.scale(sc, sc); drawHero(ctx, look, heroPose(k < 3 ? 'special' : 'idle', k, t), t, { pet: false }); ctx.restore();
    });
    stop = a.stop;
    setTimeout(() => { const r = m.$('#loot')?.getBoundingClientRect(); if (r) burst(r.left + r.width / 2, r.top + r.height / 2, 80, [rar[st.rarity].color, '#fff', '#f1cf85']); }, 500);
    m.$('#l-equip').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const r = await POST('/api/character/set', { set: st.key }); app.state.appearance = r.character; toast(`${esc(st.name)} equipada!`, 'success'); m.close();
    }));
  }
}

// ================= RELATÓRIO SEMANAL =================
async function reportModal(app, cycleId) {
  const r = await GET(`/api/cycles/${cycleId}/report`).catch((e) => { toast(esc(e.message), 'error'); return null; });
  if (!r) return;
  const units = app.config.catalog.units;
  const st = (s) => ({ victory: '<span class="tag ok">vitória</span>', defeat: '<span class="tag danger">derrota</span>', 'nao-enfrentado': '<span class="tag warn">não enfrentado</span>', 'sem-meta': '<span class="tag">sem meta</span>' }[s] || s);
  const finalWin = r.final.average !== null && r.final.average + 1e-9 >= r.final.threshold;
  const prev = r.previous;
  const m = modal({
    title: `Relatório da semana — ${fmtDate(r.week.start)} a ${fmtDate(r.week.end)}`, wide: true,
    body: `
      <div class="banner ${finalWin ? 'ok' : 'danger'}"><div><b>${esc(r.final.text)}</b></div></div>
      <div class="eval-grid">
        ${r.bosses.map((b) => `<div class="eval-item"><b>Boss ${b.slot}${b.name ? ` · ${esc(b.name)}` : ''}</b>${b.goal ? `${esc(b.goal)} — ${pctTxt(b.pct)}` : '—'}<div class="mt-s">${st(b.status)}</div></div>`).join('')}
        <div class="eval-item"><b>Boss Final</b>Média ${pctTxt(r.final.average)} de ${r.final.included} meta(s)<div class="mt-s">${st(r.final.status)}</div></div>
        <div class="eval-item"><b>XP recebido</b><span class="gold">+${r.xpGain}</span>${r.penaltyTotal ? ` · <span class="danger">${r.penaltyTotal}</span> em penalidades` : ''}</div>
        <div class="eval-item"><b>Semana anterior</b>${prev ? `Média ${pctTxt(prev.average)} · +${prev.xpGain} XP${prev.average !== null && r.final.average !== null ? `<div class="mt-s ${r.final.average >= prev.average ? 'ok' : 'danger'}">${r.final.average >= prev.average ? '▲' : '▼'} ${fmtNum(Math.abs(r.final.average - prev.average) * 100, 1)} p.p.</div>` : ''}` : 'Sem ciclo anterior'}</div>
      </div>
      <h4 class="mt">Percentual de cada meta (média aritmética simples)</h4>
      <div class="table-wrap"><table class="table"><thead><tr><th>Meta</th><th>Registrado</th><th>Conclusão</th><th>No cálculo</th></tr></thead><tbody>
        ${r.goals.map((g) => `<tr><td>${esc(g.name)}</td><td class="small">${g.capped ? `${g.daysWithData}/${g.expectedDays} dias com registro` : `${fmtNum(g.value)} / ${fmtNum(g.target)} ${esc(units[g.unit].label)}`}</td>
          <td class="mono ${g.pct >= 0.95 ? 'ok' : g.pct >= 0.7 ? 'warn' : 'danger'}">${pctTxt(g.pct)}${g.raw > 1 ? ` <span class="tiny gold">(superou: ${fmtNum(g.raw * 100, 0)}%, limitado a 100%)</span>` : ''}</td>
          <td>${g.status === 'valida' ? '<span class="tag ok">sim</span>' : g.status === 'suspensa' ? `<span class="tag warn" title="${esc(g.suspension.reason)}">suspensa</span>` : '<span class="tag">não</span>'}</td></tr>`).join('')}
        <tr><td colspan="2"><b>Média aritmética simples</b></td><td class="mono"><b class="gold">${pctTxt(r.final.average)}</b></td><td class="small muted">mínimo 95%</td></tr>
      </tbody></table></div>
      <h4 class="mt">Atributos desenvolvidos</h4>
      <div class="row wrap gap-s">${Object.entries(r.xp).map(([k, x]) => `<span class="tag" style="color:${ATTR[k].color}">${ATTR[k].name} ${x > 0 ? '+' : ''}${x}</span>`).join('')}</div>
      <h4 class="mt">Penalidades aplicadas</h4>
      ${r.penalties.length ? `<ul class="clean small">${r.penalties.map((p) => `<li>${fmtDate(p.day)}: ${esc(p.reason)} <span class="danger">(${p.amount} XP)</span></li>`).join('')}</ul>` : '<p class="small muted">Nenhuma penalidade nesta semana.</p>'}
      ${r.notes.length ? `<h4 class="mt">Observações registradas</h4><ul class="clean small">${r.notes.map((n) => `<li>${fmtDate(n.date)}${n.goal ? ` · ${esc(n.goal)}` : ''}: “${esc(n.note)}”</li>`).join('')}</ul>` : ''}
      ${r.events.length ? `<h4 class="mt">Alterações excepcionais</h4><ul class="clean small">${r.events.map((e) => `<li>${fmtDate(e.created_on)}: ${e.kind === 'suspend' ? 'meta suspensa' : esc(e.kind)} — “${esc(e.reason)}”</li>`).join('')}</ul>` : ''}
      <h4 class="mt">Recomendações (baseadas nos registros)</h4>
      ${r.recommendations.length ? `<ul class="clean small">${r.recommendations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="small muted">Todas as metas ficaram em 95% ou mais. Mantenha o ritmo.</p>'}
      <div id="ai-box" class="mt"></div>`,
    foot: `${app.config.ai ? `<button class="btn" id="ai-btn">${icon('ai', 'attr-icon')} Análise com IA</button>` : '<span class="small dim grow">Análise com IA indisponível (sem OPENAI_API_KEY).</span>'}<button class="btn primary" data-close>Fechar</button>`,
  });
  m.$('#ai-btn')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const a = await POST(`/api/cycles/${cycleId}/ai-report`);
    m.$('#ai-box').innerHTML = `<div class="panel tight" style="border-color:rgba(106,167,255,.35)"><h4>${icon('ai', 'attr-icon')} Análise da IA <span class="tag info">apenas dados registrados</span></h4><p class="small">${esc(a.analysis)}</p>
      ${a.recommendations.length ? `<ul class="clean small">${a.recommendations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${a.suggested_goal?.title ? `<div class="eval-item mt-s"><b>Meta sugerida</b>${esc(a.suggested_goal.title)}${a.suggested_goal.target_value ? ` — ${fmtNum(a.suggested_goal.target_value)} ${esc(a.suggested_goal.unit)}` : ''}<div class="small muted">${esc(a.suggested_goal.rationale)}</div></div>` : ''}</div>`;
  }));
}
