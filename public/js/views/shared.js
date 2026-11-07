// Lista de metas de um dia: progresso, registro detalhado e marcações (não cumpri / exceção).
import { esc, icon, fmtNum, POST, modal, busy, fmtDateLong, ATTR } from '../ui.js';
import { TYPE_ICON } from '../goalform.js';
import { openRecordForm, recordSummary, quickWater } from '../records.js';

const STATE_LABEL = {
  done: ['Cumprida', 'ok'], partial: ['Parcial', 'warn'], failed: ['Não cumprida', 'danger'], excused: ['Exceção', 'info'], pending: ['Sem registro', ''], logged: ['Registrado', 'info'],
};
export function unitLabel(app, unit) { return app.config.catalog.units[unit]?.label || unit; }

function valueText(app, it) {
  const v = it.version; const ev = it.eval;
  const u = unitLabel(app, v.unit);
  if (v.period === 'times_per_week') return ev.value ? `${fmtNum(ev.value)} sessão(ões) hoje` : (ev.commitment ? 'sessão programada para hoje' : '');
  if (v.period === 'daily') return `${fmtNum(ev.value ?? 0)} / ${v.mode === 'max' ? 'limite ' : v.mode === 'range' ? '≈ ' : ''}${fmtNum(v.target)} ${u}`;
  return ev.value ? `${fmtNum(ev.value)} ${u} hoje` : '';
}

function row(app, it) {
  const g = it.goal; const ev = it.eval; const v = it.version;
  const [label, cls] = STATE_LABEL[ev.state] || ['', ''];
  const marked = ev.entryStatus === 'missed' || ev.entryStatus === 'excused';
  let actions = '';
  if (!marked) {
    if (g.kind === 'hidratacao') actions += [250, 500, 1000].map((ml) => `<button class="btn xs" data-water="${ml}">+${ml >= 1000 ? '1 L' : `${ml} ml`}</button>`).join('');
    actions += `<button class="btn sm ok" data-act="record">${icon('plus', 'attr-icon')} Registrar</button>`;
    if (ev.state !== 'done' && ev.commitment) actions += `<button class="btn xs" data-act="missed">Não cumpri</button><button class="btn xs ghost" data-act="excused">Exceção</button>`;
  } else actions = `<button class="btn xs ghost" data-act="clear">${icon('x', 'attr-icon')} Desfazer marcação</button>`;
  const tag = ev.commitment ? '<span class="tag gold" title="Conta para a ofensiva">compromisso</span>' : { weekly: '<span class="tag">semanal</span>', monthly: '<span class="tag">mensal</span>', total: '<span class="tag">até o prazo</span>' }[v.period] || '<span class="tag">livre hoje</span>';
  const pct = it.week ? Math.round(it.week.pct * 100) : null;
  const xp = it.xp ? `<span class="tag ${it.xp > 0 ? 'gold' : 'danger'}">${it.xp > 0 ? '+' : ''}${it.xp} XP</span>` : '';
  const recs = it.records.length ? `<details class="rec-list"><summary>${it.records.length} registro(s) hoje</summary>${it.records.map((r) => `<div class="rec-item" data-rec="${r.id}"><span>${r.time ? `<b>${r.time}</b> · ` : ''}${esc(recordSummary(g.kind, r.data, app))}</span><button class="icon-btn" data-edit-rec="${r.id}" title="Editar">${icon('edit', 'attr-icon')}</button></div>`).join('')}</details>` : '';
  return `<div class="act ${ev.state}" data-gid="${g.id}">
    <div class="act-icon">${icon(TYPE_ICON[g.type] || 'star')}</div>
    <div style="min-width:0"><div class="act-name">${esc(g.name)}</div>
      <div class="act-meta">${tag}${cls ? `<span class="tag ${cls}">${label}${ev.state === 'partial' ? ` ${Math.round(ev.compliance * 100)}%` : ''}</span>` : ''}<span>${valueText(app, it)}</span>${xp}
      ${pct !== null ? `<span class="mini-bar" title="Progresso semanal ${pct}%"><i style="width:${pct}%"></i></span><span class="small muted">${pct}% sem.</span>` : ''}
      ${ev.note ? `<span class="dim" title="${esc(ev.note)}">“${esc(ev.note.slice(0, 40))}”</span>` : ''}</div>${recs}</div>
    <div class="act-actions">${actions}</div></div>`;
}

export function renderDayList(el, app, day, onChange) {
  if (!day.items.length) {
    el.innerHTML = `<div class="empty"><b>Nenhuma meta para ${day.date === day.today ? 'hoje' : 'este dia'}</b>Crie metas na aba Metas — você escolhe quais.<div class="mt"><a class="btn sm primary" href="#/metas/nova">${icon('plus', 'attr-icon')} Criar meta</a></div></div>`;
    return;
  }
  const order = { pending: 0, partial: 1, failed: 2, logged: 3, done: 4, excused: 5 };
  const items = [...day.items].sort((a, b) => (b.eval.commitment - a.eval.commitment) || (order[a.eval.state] - order[b.eval.state]));
  el.innerHTML = `${day.rest ? `<div class="banner info">${icon('rest', 'attr-icon')}<div><b>Dia de descanso</b>${day.restReason ? ` — ${esc(day.restReason)}` : ''}. Sem penalidades nem quebra de ofensiva.</div></div>` : ''}<div class="act-list">${items.map((i) => row(app, i)).join('')}</div>`;
  el.querySelectorAll('.act').forEach((r) => {
    const it = day.items.find((x) => x.goal.id === Number(r.dataset.gid));
    const goal = { ...it.goal, unit: it.version.unit };
    r.querySelectorAll('[data-water]').forEach((b) => b.addEventListener('click', () => busy(b, async () => { await quickWater(day.date, Number(b.dataset.water)); await onChange(r); })));
    r.querySelectorAll('[data-edit-rec]').forEach((b) => b.addEventListener('click', () => {
      const rec = it.records.find((x) => x.id === Number(b.dataset.editRec));
      openRecordForm(app, { kind: g(it).kind, goal, date: day.date, record: { ...rec, date: day.date }, onSaved: () => onChange(r) });
    }));
    r.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'record') return openRecordForm(app, { kind: it.goal.kind, goal, date: day.date, onSaved: () => onChange(r) });
      if (act === 'missed' || act === 'excused') return askNote(it, day, act, () => onChange(r));
      if (act === 'clear') busy(b, async () => { await POST(`/api/goals/${it.goal.id}/entry`, { date: day.date, status: 'clear' }); await onChange(r); });
    }));
  });
}
const g = (it) => it.goal;

function askNote(it, day, status, done) {
  const missed = status === 'missed';
  const pen = it.eval.commitment && !day.rest;
  const m = modal({
    title: missed ? 'Confirmar descumprimento' : 'Registrar exceção justificada',
    body: `<p style="margin-top:0"><b>${esc(it.goal.name)}</b> — ${fmtDateLong(day.date)}</p>
      ${missed ? (pen ? `<div class="banner danger small"><div>Falha confirmada: reinicia a ofensiva e aplica penalidade de <b>${it.penaltyPreview} XP</b> (regra do sistema; metade em Disciplina).</div></div>` : '<div class="banner info small"><div>Não é compromisso hoje: sem penalidade.</div></div>')
    : '<div class="banner info small"><div>Situação justificada (doença, imprevisto): sem penalidade e sem quebra de ofensiva. O dia conta 0% no progresso semanal.</div></div>'}
      <label class="field">O que aconteceu? (opcional — usado nos relatórios e pela IA)<textarea maxlength="300" data-note></textarea></label>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn ${missed ? 'danger' : 'primary'}" data-ok>Confirmar</button>`,
  });
  m.$('[data-ok]').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    await POST(`/api/goals/${it.goal.id}/entry`, { date: day.date, status, note: m.$('[data-note]').value });
    m.close(); await done();
  }));
}

export function attrDots(weights) {
  return Object.entries(weights).sort((a, b) => b[1] - a[1]).map(([k]) => `<span class="row gap-s"><span class="dot" style="--c:${ATTR[k].color}"></span>${ATTR[k].name}</span>`).join('');
}
