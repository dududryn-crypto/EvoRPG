import { esc, icon, bar, fmtNum, fmtDate, fmtDateLong, ATTR_ICON } from '../ui.js';
import { heroStage } from '../sprites.js';
import { renderDayList } from './shared.js';

const STATUS_TITLE = { success: 'Compromissos cumpridos', broken: 'Ofensiva quebrada', rest: 'Descanso / sem compromissos', pending: 'Registro incompleto', partial: 'Cumprimento parcial', none: 'Sem compromissos' };

export async function render(el, app) {
  const s = app.state;
  const t = s.today;
  const brokeRecently = s.streak.lastBreak && s.streak.lastBreak >= addDaysLocal(t.today, -2);
  let ackKey = null;
  try { ackKey = localStorage.getItem('evolve-ack-break'); } catch { /* armazenamento indisponível */ }

  el.innerHTML = `
    <div class="page-head"><div><h1>Olá, ${esc(s.profile.name)}</h1><p>${fmtDateLong(t.today)}</p></div>
      <div class="row"><button class="btn" data-go="metas/lista">${icon('target', 'attr-icon')} Minhas metas</button><button class="btn primary" data-go="metas/nova">${icon('plus', 'attr-icon')} Nova meta</button></div></div>
    ${brokeRecently && ackKey !== s.streak.lastBreak ? `<div class="banner danger" id="break-banner"><span class="flame" style="filter:grayscale(1)">${icon('flame', 'attr-icon')}</span><div class="grow"><b>Sua ofensiva de ${s.streak.lostStreak} dias foi quebrada</b> em ${fmtDate(s.streak.lastBreak)}. O multiplicador voltou para 1,00x — todo o XP conquistado continua seu.</div><button class="btn sm" id="ack-break">Entendi</button></div>` : ''}
    ${s.pendingDays.length ? `<div class="banner warn">${icon('calendar', 'attr-icon')}<div class="grow"><b>${s.pendingDays.length} dia(s) com compromissos sem registro.</b> Sem registro não é falha — mas registre o que aconteceu para manter seu histórico fiel. <span class="muted">${s.pendingDays.map((d) => fmtDate(d.date)).join(', ')}</span></div><button class="btn sm" data-go="metas/hoje/${s.pendingDays[0].date}">Registrar</button></div>` : ''}
    <div class="home-grid">
      <div class="col gap-l">
        <section class="panel ornament hero-card">
          <div class="hero-stage"><canvas id="hero"></canvas></div>
          <div class="col">
            <div class="row between"><div><h2>${esc(s.profile.name)}</h2>${s.titleName ? `<div class="small gold">${esc(s.titleName)}</div>` : ''}</div><span class="level-badge">${icon('star', 'attr-icon')} Nível ${s.character.level}</span></div>
            <div>
              <div class="row between small muted"><span>Experiência total</span><span class="mono">${fmtNum(s.character.intoLevel, 0)} / ${fmtNum(s.character.needed, 0)}</span></div>
              ${bar(s.character.progress, 'lg')}
            </div>
            <div class="stat-pills">
              <div class="stat-pill"><span>Ofensiva</span><b><span class="flame">${icon('flame', 'attr-icon')}</span> ${s.streak.current} <small class="muted" style="font-size:12px">dias</small></b></div>
              <div class="stat-pill"><span>Multiplicador</span><b class="gold">${s.streak.multiplier.toFixed(2)}x</b></div>
              <div class="stat-pill"><span>Moedas</span><b>${s.coins}</b></div>
            </div>
            <div class="small muted">${s.streak.next ? `Próximo multiplicador: <b class="gold">${s.streak.next.mult.toFixed(2)}x</b> com ${s.streak.next.days} dias (faltam ${s.streak.next.days - s.streak.current}).` : 'Multiplicador máximo alcançado.'} Melhor ofensiva: ${s.streak.best} dias.</div>
            <div class="streak-dots" title="Últimos 14 dias">${s.streak.last14.map((d) => `<i class="${d.status}" title="${fmtDate(d.date)} — ${STATUS_TITLE[d.status] || ''}"></i>`).join('')}</div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-title"><h3>${icon('shield', 'attr-icon')} Atributos</h3><a href="#/evolucao" class="small">Ver evolução →</a></div>
          <div class="attr-grid">${s.attributes.map((a) => `
            <div class="attr" style="--c:${a.color}">
              <div class="attr-head"><span class="attr-name">${icon(ATTR_ICON[a.key], 'attr-icon')} ${a.name}</span><span class="attr-lv">${a.level}</span></div>
              ${bar(a.progress)}
              <div class="attr-xp"><span>${fmtNum(a.intoLevel, 0)}/${fmtNum(a.needed, 0)}</span><span>${fmtNum(a.xp, 0)} XP</span></div>
            </div>`).join('')}</div>
          <p class="hint" style="margin-bottom:0">Disciplina exige 60% mais XP por nível — é o atributo mais difícil de evoluir.</p>
        </section>
      </div>
      <div class="col gap-l">
        <section class="panel">
          <div class="panel-title"><h3>${icon('calendar', 'attr-icon')} Metas de hoje</h3>
            <span class="small muted">${t.day ? `${t.day.counts.done}/${t.day.counts.scheduled} compromissos` : ''}${t.multiplier > 1 ? ` · <span class="gold">${t.multiplier.toFixed(2)}x XP</span>` : ''}</span></div>
          <div id="today-list"></div>
        </section>
        <section class="panel">
          <div class="panel-title"><h3>${icon('skull', 'attr-icon')} Chefes da semana</h3><a href="#/chefes" class="small">Abrir →</a></div>
          <div id="boss-mini">${bossMini(s.cycle)}</div>
        </section>
      </div>
    </div>`;

  el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => app.go(b.dataset.go)));
  el.querySelector('#ack-break')?.addEventListener('click', () => {
    try { localStorage.setItem('evolve-ack-break', s.streak.lastBreak); } catch { /* ignora */ }
    el.querySelector('#break-banner').remove();
  });

  const stage = heroStage(el.querySelector('#hero'), () => app.state.appearance, { scale: 1.4 });
  const listEl = el.querySelector('#today-list');
  if (app.pendingAnim) { const a = app.pendingAnim; app.pendingAnim = null; setTimeout(() => stage.play(a), 150); }
  const count = (st) => st.today.items.reduce((c, i) => { c[i.eval.state] = (c[i.eval.state] || 0) + 1; return c; }, {});
  const draw = () => renderDayList(listEl, app, app.state.today, async (anchor) => {
    const before = count(app.state);
    await app.refresh({ anchor });
    const after = count(app.state);
    if ((after.done || 0) > (before.done || 0)) app.pendingAnim = 'attack';
    else if ((after.failed || 0) > (before.failed || 0)) app.pendingAnim = 'hurt';
    app.rerender();
  });
  draw();
  return () => stage.stop();
}

function bossMini(c) {
  if (!c) return '';
  const line = (name, label, pct, status) => `<div><div class="row between small"><span><b>${esc(name)}</b> <span class="muted">· ${esc(label)}</span></span>
    <span class="${status === 'victory' ? 'ok' : status === 'defeat' ? 'danger' : 'muted'}">${status === 'victory' ? 'Derrotado' : status === 'defeat' ? 'Derrota' : pct === null ? '—' : `${Math.round(pct * 100)}%`}</span></div>${bar(1 - (pct || 0), 'hp')}</div>`;
  const rows = c.bosses.map((b) => (b.goal ? line(`Boss ${b.slot}`, b.goal.name, b.goal.pct, b.status) : `<div class="small dim">Boss ${b.slot}: sem meta vinculada${c.configOpen ? ' — escolha hoje!' : ''}</div>`));
  rows.push(line('Boss Final', `média de ${c.included} meta(s) · precisa de 95%`, c.average === null ? null : Math.min(1, c.average / c.threshold), c.final.status));
  return `<div class="col">${rows.join('')}<div class="small muted">${c.ended ? 'Semana encerrada — enfrente os chefes!' : `${c.daysLeft} dia(s) até o confronto. Média atual: <b class="gold">${c.average === null ? '—' : fmtNum(c.average * 100, 1) + '%'}</b>`}</div></div>`;
}

function addDaysLocal(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
