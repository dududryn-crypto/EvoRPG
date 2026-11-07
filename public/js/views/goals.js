import { GET, POST, PUT, DEL, esc, icon, modal, busy, confirmBox, toast, fmtNum, fmtDate, fmtDateLong, addDays, bar, emptyState } from '../ui.js';
import { goalFields, previewPanel, intensityHtml, TYPE_ICON, GROUP_ICON } from '../goalform.js';
import { renderDayList, unitLabel } from './shared.js';
import { openRecordForm, recordSummary } from '../records.js';

const fmt = (x) => fmtNum(x, x < 10 ? 2 : 0);
const TABS = [['hoje', 'Registro do dia'], ['lista', 'Minhas metas'], ['historico', 'Histórico de registros']];

export async function render(el, app, params) {
  const tab = TABS.some(([k]) => k === params[0]) ? params[0] : params[0] === 'nova' ? 'lista' : (app.state.goalsCount ? 'hoje' : 'lista');
  el.innerHTML = `<div class="page-head"><div><h1>Metas</h1><p>Você escolhe o que desenvolver. O EvoRPG calcula objetivos, XP e atributos.</p></div>
    <button class="btn primary" id="new-goal">${icon('plus', 'attr-icon')} Nova meta</button></div>
    <div class="tabs">${TABS.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div><div id="tab"></div>`;
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => app.go(`metas/${b.dataset.tab}`)));
  el.querySelector('#new-goal').addEventListener('click', () => newGoalModal(app));
  const box = el.querySelector('#tab');
  if (params[0] === 'nova') setTimeout(() => newGoalModal(app), 50);
  if (tab === 'hoje') return dayTab(box, app, params);
  if (tab === 'historico') return historyTab(box, app, params);
  return listTab(box, app);
}

// ================= Registro do dia =================
async function dayTab(box, app, params) {
  const today = app.state.today.today;
  let date = params[1] && /^\d{4}-\d{2}-\d{2}$/.test(params[1]) && params[1] <= today ? params[1] : today;
  box.innerHTML = `<div class="grid" style="grid-template-columns:minmax(0,1fr) 290px" id="day-grid">
    <section class="panel"><div class="panel-title wrap" style="flex-wrap:wrap;gap:8px">
      <div class="row"><button class="icon-btn" id="prev" aria-label="Dia anterior">◀</button><h3 id="day-title"></h3><button class="icon-btn" id="next" aria-label="Próximo dia">▶</button></div>
      <div class="row wrap"><input type="date" id="pick" max="${today}" min="${addDays(today, -30)}" style="width:auto"><button class="btn sm" id="rest-btn"></button></div></div>
      <div id="day-info" class="small muted mb"></div><div id="day-list"></div></section>
    <section class="panel"><h3 class="mb">Últimos 35 dias</h3><div class="cal" id="cal"></div>
      <div class="legend mt"><span><i style="background:rgba(87,214,141,.55)"></i>cumprido</span><span><i style="background:rgba(242,184,75,.3)"></i>parcial</span><span><i style="background:rgba(239,93,104,.45)"></i>falha</span><span><i style="background:rgba(106,167,255,.3)"></i>descanso</span></div>
      <p class="hint">Registros podem ser corrigidos ou complementados por até 30 dias. Sem registro não é falha.</p></section></div>`;
  if (innerWidth < 900) box.querySelector('#day-grid').style.gridTemplateColumns = '1fr';
  let days = new Map();
  async function reloadCal() {
    const h = await GET(`/api/history?from=${addDays(today, -34)}&to=${today}`);
    days = new Map(h.days.map((d) => [d.date, d]));
    const cal = box.querySelector('#cal');
    const cells = [];
    for (let i = 34; i >= 0; i--) { const d = addDays(today, -i); const st = days.get(d); cells.push(`<i data-d="${d}" class="${st ? st.status : ''} ${d === date ? 'sel' : ''}" title="${fmtDate(d)}"></i>`); }
    cal.innerHTML = cells.join('');
    cal.querySelectorAll('i').forEach((i) => i.addEventListener('click', () => { if (i.dataset.d >= addDays(today, -30)) { date = i.dataset.d; load(); } }));
  }
  async function load() {
    const day = date === today ? app.state.today : await GET(`/api/day?date=${date}`);
    box.querySelector('#day-title').textContent = date === today ? 'Hoje' : fmtDateLong(date);
    box.querySelector('#pick').value = date;
    box.querySelector('#next').disabled = date >= today;
    const st = day.day;
    box.querySelector('#day-info').innerHTML = st && st.counts.scheduled ? `${st.counts.scheduled} compromisso(s) · ${st.counts.done} cumprido(s) · ${st.counts.partial || 0} parcial(is) · ${st.counts.pending} sem registro · multiplicador <b class="gold">${day.multiplier.toFixed(2)}x</b>` : '';
    const rb = box.querySelector('#rest-btn');
    rb.innerHTML = `${icon('rest', 'attr-icon')} ${day.rest ? 'Remover descanso' : 'Marcar descanso'}`;
    rb.onclick = () => toggleRest(day);
    renderDayList(box.querySelector('#day-list'), app, day, async (anchor) => { await app.refresh({ anchor }); await reloadCal(); await load(); });
  }
  async function toggleRest(day) {
    if (day.rest && day.restReason === 'Descanso semanal') { toast('Dia de descanso semanal fixo. Altere em Perfil.', 'info'); return; }
    if (day.rest) await busy(null, () => DEL(`/api/rest-days/${date}`));
    else {
      const m = modal({ title: 'Marcar dia de descanso', body: `<label class="field">Motivo (opcional)<input type="text" maxlength="120" data-r></label><p class="hint">Cadastrados com antecedência, descansos reduzem a meta semanal; no próprio dia, apenas evitam penalidades.</p>`, foot: '<button class="btn" data-close>Cancelar</button><button class="btn primary" data-ok>Salvar</button>' });
      await new Promise((res) => m.$('[data-ok]').addEventListener('click', (e) => busy(e.currentTarget, async () => { await POST('/api/rest-days', { date, reason: m.$('[data-r]').value }); m.close(); res(); })));
    }
    await app.refresh({ fx: false }); await reloadCal(); await load();
  }
  box.querySelector('#prev').addEventListener('click', () => { if (date > addDays(today, -30)) { date = addDays(date, -1); load(); } });
  box.querySelector('#next').addEventListener('click', () => { if (date < today) { date = addDays(date, 1); load(); } });
  box.querySelector('#pick').addEventListener('change', (e) => { if (e.target.value) { date = e.target.value; load(); } });
  await reloadCal();
  await load();
}

// ================= Minhas metas =================
async function listTab(box, app) {
  const goals = await GET('/api/goals');
  const cat = app.config.catalog;
  if (!goals.length) {
    box.innerHTML = `<div class="panel center" style="padding:40px 20px"><h2>Nenhuma meta ainda</h2><p class="muted">Nada é obrigatório. Crie suas próprias metas ou comece por um modelo.</p>
      <div class="chips mt" style="justify-content:center">${cat.templates.map((t, i) => `<span class="chip" data-tpl="${i}">${icon('plus', 'attr-icon')} ${esc(t.name)}</span>`).join('')}</div>
      <button class="btn primary mt" id="first">${icon('plus', 'attr-icon')} Criar minha meta</button></div>`;
    box.querySelector('#first').addEventListener('click', () => newGoalModal(app));
    box.querySelectorAll('[data-tpl]').forEach((c) => c.addEventListener('click', () => newGoalModal(app, cat.templates[Number(c.dataset.tpl)].name)));
    return;
  }
  const isMonday = new Date(app.state.today.today + 'T12:00:00Z').getUTCDay() === 1;
  box.innerHTML = `<div class="banner info small">${icon('info', 'attr-icon')}<div>${isMonday ? '<b>Hoje é o dia de configuração do ciclo:</b> ajustes de valor-alvo já valem para esta semana.' : 'Ajustes de valor-alvo e frequência passam a valer no <b>próximo ciclo (segunda-feira)</b> e ficam registrados no histórico da meta.'}</div></div>
    ${Object.entries(cat.groups).map(([gk, gr]) => {
    const gs = goals.filter((g) => g.group === gk);
    if (!gs.length) return '';
    return `<section class="mb"><h2 class="row gap-s mb">${icon(GROUP_ICON[gk], 'attr-icon')} ${gr.name}</h2><div class="grid g2">${gs.map((g) => card(app, g)).join('')}</div></section>`;
  }).join('')}`;
  box.querySelectorAll('[data-goal]').forEach((c) => {
    const g = goals.find((x) => x.id === Number(c.dataset.goal));
    c.querySelector('[data-edit]').addEventListener('click', () => goalModal(app, g));
    c.querySelector('[data-rec]')?.addEventListener('click', () => openRecordForm(app, { kind: g.kind, goal: { ...g, unit: g.version.unit }, date: app.state.today.today, onSaved: async () => { await app.refresh(); app.rerender(); } }));
    c.querySelector('[data-del]').addEventListener('click', async () => {
      if (!(await confirmBox(`Encerrar a meta <b>${esc(g.name)}</b>? Ela é cancelada sem penalidade; histórico e XP permanecem.`, { okText: 'Encerrar', danger: true }))) return;
      await busy(null, async () => { const r = await DEL(`/api/goals/${g.id}`); toast(esc(r.note), 'info', 6000); await app.refresh({ fx: false }); app.rerender(); });
    });
    c.querySelector('[data-cancel-pending]')?.addEventListener('click', () => busy(null, async () => { await DEL(`/api/goals/${g.id}/pending`); app.rerender(); }));
  });
}

function card(app, g) {
  const cat = app.config.catalog;
  const u = cat.units[g.version.unit].label;
  const w = g.week; const t = g.today;
  const stateTxt = t ? { done: ['cumprida hoje', 'ok'], partial: ['parcial hoje', 'warn'], failed: ['não cumprida hoje', 'danger'], excused: ['exceção hoje', 'info'], logged: ['registrada hoje', 'info'], pending: [t.commitment ? 'pendente hoje' : '', ''] }[t.state] : null;
  let progress = '';
  if (g.milestone) {
    const p = g.progress;
    progress = `<div><div class="row between small"><span>${p.current === null ? 'Sem registros ainda' : `Atual: <b>${fmtNum(p.current)} kg</b>${p.baseline !== null ? ` (início ${fmtNum(p.baseline)} kg)` : ''}`}</span><span class="${g.status === 'alcancada' ? 'ok' : 'muted'}">${g.status === 'alcancada' ? `alcançada em ${fmtDate(g.achieved_on)}` : `${Math.round(p.pct * 100)}%`}</span></div>${bar(p.pct)}</div>`;
  } else {
    progress = w ? `<div><div class="row between small"><span>Semana: <b>${Math.round(w.pct * 100)}%</b>${w.raw > 1 ? ` <span class="gold">(superou: ${Math.round(w.raw * 100)}%)</span>` : ''}</span>
      <span class="muted">${w.capped ? `${w.daysWithData}/${w.expectedDays} dias com registro` : `${fmt(w.value)} / ${fmt(w.target)} · faltam ${fmt(w.remaining)}`}</span></div>${bar(w.pct)}</div>` : '<div class="small muted">Sem objetivo nesta semana.</div>';
    if (g.total) progress += `<div class="small muted">${g.version.period === 'total' ? 'Total' : 'Mês'}: ${fmt(g.total.value)} / ${fmt(g.total.target)} ${u} (${Math.round(g.total.pct * 100)}%) · faltam ${fmt(g.total.remaining)}${g.deadline ? ` · prazo ${fmtDate(g.deadline)}` : ''}</div>`;
  }
  const stats = g.milestone ? '' : g.targets.capped && g.version.mode !== 'min'
    ? `<div class="mini-stats"><div>Diária<b>${g.version.mode === 'max' ? 'até ' : '≈ '}${fmt(g.targets.day)} ${u}</b></div><div>Semanal<b>${g.version.days.length} dias na meta</b></div><div>Mensal<b>30 dias</b></div></div>`
    : `<div class="mini-stats"><div>Diária<b>${g.targets.sessions ? 'dias escolhidos' : `${fmt(g.targets.day)} ${u}`}</b></div><div>Semanal<b>${fmt(g.targets.week)} ${g.targets.sessions ? 'sessões' : u}</b></div><div>Mensal (est.)<b>${fmt(g.targets.month)} ${g.targets.sessions ? 'sessões' : u}</b></div></div>`;
  return `<div class="goal-card" data-goal="${g.id}">
    <div class="head"><div class="row gap-s"><span class="act-icon" style="width:34px;height:34px">${icon(TYPE_ICON[g.type] || 'star')}</span><div><b>${esc(g.name)}</b><div class="tiny muted">${esc(g.typeName)}${g.params?.subject ? ` · ${esc(g.params.subject)}` : ''}</div><div class="small muted">${esc(g.targets.text)}</div></div></div>
      <div class="row gap-s">${g.ai_score !== null && g.ai_score !== undefined ? `<span class="tag info">IA ${fmtNum(g.ai_score)}/10</span>` : ''}${stateTxt && stateTxt[0] ? `<span class="tag ${stateTxt[1]}">${stateTxt[0]}</span>` : ''}${g.status === 'alcancada' ? '<span class="tag ok">alcançada</span>' : ''}</div></div>
    ${g.objective ? `<div class="small"><span class="muted">Objetivo:</span> ${esc(g.objective)}</div>` : ''}
    ${stats}${progress}
    <div class="row wrap gap-s small">${intensityHtml(g.rewards.weights)}${g.milestone ? `<span class="tag gold">${g.rewards.milestoneXp} XP ao alcançar</span>` : `<span class="tag gold">até ${g.rewards.weeklyXp} XP/sem</span>`}${g.rewards.commitments ? `<span class="tag danger">−${g.rewards.penaltyPerMiss} XP/falha</span>` : ''}</div>
    ${g.criteria?.length ? `<details class="small"><summary class="muted" style="cursor:pointer">Critérios de conclusão</summary><ul class="clean">${g.criteria.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></details>` : ''}
    ${g.pending ? `<div class="banner warn small" style="margin:0"><div>Ajuste agendado para <b>${fmtDate(g.pending.effective_from)}</b>: ${esc(app.config.catalog.periods[g.pending.period])} · ${fmtNum(g.pending.target)} ${esc(cat.units[g.pending.unit].label)}. <button class="btn xs ghost" data-cancel-pending>Cancelar</button></div></div>` : ''}
    <div class="row wrap"><button class="btn xs ok" data-rec>${icon('plus', 'attr-icon')} Registrar</button><button class="btn xs" data-edit>${icon('edit', 'attr-icon')} Editar</button>
      <a class="btn xs ghost" href="#/evolucao/meta/${g.id}">${icon('chart', 'attr-icon')} Evolução</a><a class="btn xs ghost" href="#/detalhes/${g.id}">${icon('ai', 'attr-icon')} Analisar</a>
      <button class="btn xs ghost" data-del>Encerrar</button></div>
  </div>`;
}

// ================= Criar / editar meta =================
export function goalModal(app, g, preset = null) {
  const cat = app.config.catalog;
  const isEdit = !!g;
  const base = g ? (g.pending || g.version) : null;
  let type = g ? g.type : preset?.type || 'leitura';
  let ed = null; let prev = null; let evalToken = null;
  const typeOpts = Object.entries(cat.groups).map(([gk, gr]) => `<optgroup label="${esc(gr.name)}">${Object.entries(cat.types).filter(([, t]) => t.group === gk).map(([k, t]) => `<option value="${k}" ${k === type ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>`).join('');
  const today = app.state.today.today;
  const m = modal({
    title: isEdit ? `Editar — ${esc(g.name)}` : 'Nova meta', wide: true,
    body: `${!isEdit ? `<div class="mb"><div class="small muted mb">Modelos opcionais:</div><div class="chips">${cat.templates.map((t, i) => `<span class="chip" data-tpl="${i}">${esc(t.name)}</span>`).join('')}</div></div>` : ''}
      <div class="form-grid">
        <label class="field">Categoria${isEdit ? `<input type="text" value="${esc(cat.types[type].name)}" disabled>` : `<select id="type-sel">${typeOpts}</select>`}</label>
        <label class="field">Nome da meta<input type="text" id="g-name" maxlength="60" value="${esc(g?.label || preset?.name || '')}" placeholder="Ex.: Ler 30 páginas por dia"></label>
        <label class="field full">Objetivo<input type="text" id="g-obj" maxlength="300" value="${esc(g?.objective || '')}" placeholder="O que você quer alcançar com essa meta?"></label>
        <label class="field full">Descrição<textarea id="g-desc" maxlength="500" placeholder="Opcional">${esc(g?.description || '')}</textarea></label>
      </div>
      <div id="type-info" class="mt mb"></div>
      <div id="fields"></div>
      <div class="form-grid mt" id="extra"></div>
      <div class="form-grid mt">
        <label class="field">Critérios de conclusão (um por linha)<textarea id="g-crit" maxlength="1500" placeholder="Ex.: 30 páginas registradas no dia">${esc((g?.criteria || []).join('\n'))}</textarea></label>
        <label class="field">Observações<textarea id="g-notes" maxlength="500">${esc(g?.notes || '')}</textarea></label>
      </div>
      <h4 class="mt mb-s">Campos personalizados</h4><div id="g-cf"></div>
      <h4 class="mt mb">Como o sistema calcula</h4><div id="preview"></div>
      ${app.config.ai ? '<div class="mt"><label class="field">Contexto para a IA (opcional)<input type="text" id="ctx" maxlength="400" placeholder="Ex.: estou voltando a treinar depois de 6 meses"></label><div id="ai-box" class="mt-s"></div></div>' : ''}
      ${isEdit ? `<div class="banner info small mt"><div>${g.created_on === today ? 'Meta criada hoje: ajustes valem imediatamente.' : 'Nome, objetivo, descrição, critérios e observações mudam na hora. Valor-alvo e frequência valem a partir do próximo ciclo (ou hoje, se for segunda).'}</div></div>` : ''}`,
    foot: `${app.config.ai ? `<button class="btn" id="ai-btn">${icon('ai', 'attr-icon')} Avaliar com IA</button>` : '<span class="small dim grow">Avaliação por IA desativada (sem OPENAI_API_KEY).</span>'}<button class="btn" data-close>Cancelar</button><button class="btn primary" id="save">${icon('check', 'attr-icon')} ${isEdit ? 'Salvar' : 'Criar meta'}</button>`,
  });
  const mount = (tp, init = {}) => {
    type = tp;
    const T = cat.types[tp];
    m.$('#type-info').innerHTML = isEdit && g.analysis ? analysisHtml(g.analysis, g.analysis_source, app.config.attributes)
      : `<div class="row wrap gap-s"><span class="small muted">Atributos:</span>${intensityHtml(isEdit ? g.rewards.weights : T.weights)}<span class="tiny dim">${isEdit ? 'definidos na criação da meta' : 'referência da categoria — a análise individual é feita ao salvar'}</span></div>`;
    ed = goalFields(m.$('#fields'), cat, tp, init, { onChange: () => prev.refresh() });
    const needEx = T.needs.includes('exercise'); const optSubj = T.optional.includes('subject');
    const needDeadline = T.periods.includes('total');
    m.$('#extra').innerHTML = `${needEx ? `<label class="field">Exercício<input type="text" id="p-ex" list="ex-sugg" maxlength="60" value="${esc(init.params?.exercise || g?.params?.exercise || '')}" ${isEdit ? 'disabled' : ''} placeholder="Ex.: Supino reto"></label><datalist id="ex-sugg"></datalist>` : ''}
      ${optSubj ? `<label class="field">Assunto (opcional — filtra os registros)<input type="text" id="p-subj" maxlength="60" value="${esc(init.params?.subject || g?.params?.subject || '')}" ${isEdit ? 'disabled' : ''}></label>` : ''}
      <label class="field">Prazo ${needDeadline ? '(obrigatório para "até o prazo")' : '(opcional — data de término)'}<input type="date" id="g-deadline" min="${today}" value="${init.deadline || g?.deadline || (T.milestone ? addDays(today, 90) : '')}"></label>`;
    if (needEx) GET('/api/records/suggestions').then((s) => { const dl = m.$('#ex-sugg'); if (dl) dl.innerHTML = s.exercises.map((e) => `<option value="${esc(e.name)}">`).join(''); }).catch(() => {});
    m.$('#g-deadline').addEventListener('change', () => prev.refresh());
    prev = previewPanel(m.$('#preview'), () => value());
    prev.run();
    evalToken = null; if (m.$('#ai-box')) m.$('#ai-box').innerHTML = '';
  };
  const cfEd = customFieldsEditor(m.$('#g-cf'), g?.custom_fields || []);
  const value = () => ({
    ...ed.get(), custom_fields: cfEd.get(), name: m.$('#g-name').value || null, objective: m.$('#g-obj').value || null, description: m.$('#g-desc').value || null, notes: m.$('#g-notes').value || null,
    criteria: m.$('#g-crit').value.split('\n').map((x) => x.trim()).filter(Boolean), deadline: m.$('#g-deadline').value || null,
    params: { ...(m.$('#p-ex') ? { exercise: m.$('#p-ex').value } : {}), ...(m.$('#p-subj') && m.$('#p-subj').value ? { subject: m.$('#p-subj').value } : {}) },
  });
  mount(type, g ? { period: base.period, unit: base.unit, mode: base.mode, target: base.target, days: base.days, deadline: g.deadline, params: g.params } : preset ? { ...preset, deadline: preset.deadlineDays ? addDays(today, preset.deadlineDays) : null } : {});
  m.$('#type-sel')?.addEventListener('change', (e) => mount(e.target.value));
  m.$$('[data-tpl]').forEach((c) => c.addEventListener('click', () => {
    const tp = cat.templates[Number(c.dataset.tpl)];
    m.$('#type-sel').value = tp.type; m.$('#g-name').value = tp.name;
    mount(tp.type, { ...tp, deadline: tp.deadlineDays ? addDays(today, tp.deadlineDays) : null });
  }));
  m.$('#ai-btn')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const r = await POST('/api/goals/evaluate', { ...value(), context: m.$('#ctx').value });
    evalToken = r.token;
    const ev = r.evaluation;
    m.$('#ai-box').innerHTML = evalHtml(ev) + (ev.suggested_target ? `<button class="btn sm mt-s" id="apply">Aplicar sugestão: ${fmtNum(ev.suggested_target)}</button>` : '');
    m.$('#apply')?.addEventListener('click', () => { ed.set({ target: ev.suggested_target }); toast('Sugestão aplicada — revise e aprove ao salvar.', 'info'); });
  }));
  m.$('#save').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const v = value();
    if (isEdit) {
      const r = await PUT(`/api/goals/${g.id}`, v);
      toast(r.immediate ? 'Meta atualizada.' : `Meta atualizada. Novo valor-alvo vale a partir de ${fmtDate(r.effective_from)}.`, 'success', 5000);
    } else {
      const r = await POST('/api/goals', { ...v, evaluation_token: evalToken });
      toast(`Meta criada! ${esc(r.cycleNote)}`, 'success', 5000);
    }
    m.close();
    await app.refresh({ fx: false });
    if (location.hash.includes('metas/nova')) app.go('metas/lista'); else app.rerender();
  }));
}

function evalHtml(ev) {
  const color = ev.score >= 7 ? 'var(--ok)' : ev.score >= 4 ? 'var(--warn)' : 'var(--danger)';
  return `<div class="panel tight" style="border-color:rgba(106,167,255,.35)">
    <div class="row gap-l mb"><div class="score-ring" style="border:3px solid ${color};color:${color};width:60px;height:60px;font-size:20px">${fmtNum(ev.score)}</div>
      <div><div class="row gap-s mb">${ev.is_realistic ? '<span class="tag ok">realista</span>' : '<span class="tag warn">pouco realista</span>'}<span class="tag">dificuldade ${ev.difficulty}/10</span></div><div class="small">${esc(ev.summary)}</div></div></div>
    <div class="eval-grid"><div class="eval-item"><b>Clareza</b>${esc(ev.clarity)}</div><div class="eval-item"><b>Mensurabilidade</b>${esc(ev.measurability)}</div><div class="eval-item"><b>Realismo</b>${esc(ev.realism)}</div><div class="eval-item"><b>Frequência</b>${esc(ev.frequency)}</div></div>
    ${ev.issues.length ? `<h4 class="mt-s">Pontos de atenção</h4><ul class="clean small">${ev.issues.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${ev.suggestions.length ? `<h4 class="mt-s">Sugestões</h4><ul class="clean small">${ev.suggestions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${ev.suggested_target ? `<div class="small mt-s"><b>Valor sugerido:</b> ${fmtNum(ev.suggested_target)} — ${esc(ev.suggested_target_rationale)}</div>` : ''}
    <div class="tiny dim mt-s">A IA apenas sugere; você aprova. XP e atributos seguem as regras do sistema.</div></div>`;
}

// ================= Histórico de registros =================
async function historyTab(box, app, params) {
  const goals = await GET('/api/goals?all=1');
  let goalId = params[1] ? Number(params[1]) : goals[0]?.id;
  let range = 30;
  const today = app.state.today.today;
  if (!goals.length) { box.innerHTML = emptyState('Nenhuma meta', 'Crie uma meta para começar a registrar.'); return; }
  box.innerHTML = `<div class="row wrap mb"><select id="hg" style="width:auto">${goals.map((g) => `<option value="${g.id}" ${g.id === goalId ? 'selected' : ''}>${esc(g.name)}${g.status !== 'ativa' ? ` (${g.status})` : ''}</option>`).join('')}</select>
    <div class="seg" id="hr">${[7, 30, 90].map((d) => `<button data-d="${d}" class="${d === range ? 'on' : ''}">${d} dias</button>`).join('')}</div></div><div id="hl"></div>`;
  async function load() {
    const g = goals.find((x) => x.id === goalId);
    const recs = await GET(`/api/records?goal_id=${goalId}&from=${addDays(today, -(range - 1))}&to=${today}`);
    const byDay = new Map();
    for (const r of recs) { if (!byDay.has(r.date)) byDay.set(r.date, []); byDay.get(r.date).push(r); }
    box.querySelector('#hl').innerHTML = recs.length ? [...byDay.entries()].map(([d, rs]) => `<div class="panel tight mb"><b>${fmtDateLong(d)}</b>
      ${rs.map((r) => `<div class="rec-item" style="font-size:13px"><span>${r.time ? `<b>${r.time}</b> · ` : ''}${esc(recordSummary(r.kind, r.data, app))}${r.note ? ` <span class="dim">“${esc(r.note)}”</span>` : ''}</span>
        ${d >= addDays(today, -30) ? `<button class="btn xs" data-edit="${r.id}">${icon('edit', 'attr-icon')}</button>` : ''}</div>`).join('')}</div>`).join('')
      : emptyState('Nenhum registro no período', `Os registros de ${g.name} aparecem aqui.`);
    box.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      const r = recs.find((x) => x.id === Number(b.dataset.edit));
      openRecordForm(app, { kind: r.kind, goal: { ...g, unit: g.version.unit }, date: r.date, record: r, onSaved: async () => { await app.refresh({ fx: false }); load(); } });
    }));
  }
  box.querySelector('#hg').addEventListener('change', (e) => { goalId = Number(e.target.value); load(); });
  box.querySelectorAll('#hr button').forEach((b) => b.addEventListener('click', () => { range = Number(b.dataset.d); box.querySelectorAll('#hr button').forEach((x) => x.classList.toggle('on', x === b)); load(); }));
  await load();
}
export { unitLabel };

// ================= Nova meta: descrição livre → rascunho validado + análise individual =================
const EXAMPLES = ['Quero ler 30 páginas por dia', 'Treinar musculação quatro vezes por semana', 'Caminhar 5 km diariamente', 'Estudar matemática durante duas horas por dia', 'Quero melhorar minha alimentação', 'Quero aprender inglês', 'Escrever 500 palavras por dia', 'Desenvolver minha criatividade'];
const SCORE_LABELS = [['clarity', 'Clareza'], ['difficulty', 'Dificuldade'], ['complexity', 'Complexidade'], ['frequency', 'Frequência'], ['viability', 'Viabilidade'], ['consistency', 'Consistência'], ['relevance', 'Relevância']];

export function analysisHtml(an, source, ATTRS) {
  if (!an) return '';
  const split = an.attributes.map((a) => `<i style="width:${a.weight * 100}%;background:${ATTRS[a.attribute].color}" title="${esc(a.name)} ${Math.round(a.weight * 100)}%"></i>`).join('');
  return `<div class="analysis-card">
    <div class="row between wrap mb-s"><b>${icon('ai', 'attr-icon')} Análise da meta</b><span class="tag ${source === 'ia' ? 'ok' : ''}">${source === 'ia' ? 'IA + validação do servidor' : 'análise automática (local)'}</span></div>
    <div class="small mb">${esc(an.summary || '')}</div>
    <div class="small muted mb-s">Atributos que esta meta desenvolve — definidos pela análise, não editáveis:</div>
    <div class="attr-split mb-s">${split}</div>
    ${an.attributes.map((a) => `<div class="attr-reason"><b style="color:${ATTRS[a.attribute].color}">${esc(a.name)}</b><span class="mono">${Math.round(a.weight * 100)}%</span><span class="muted">${esc(a.reason)}</span></div>`).join('')}
    <div class="score-grid mt">${SCORE_LABELS.map(([k, l]) => an[k] ? `<div title="${esc(an[k].comment || '')}"><span class="tiny muted">${l}</span><div><b>${an[k].score}</b><span class="tiny dim">/10</span></div><div class="bar"><i style="width:${an[k].score * 10}%"></i></div><div class="tiny dim" style="margin-top:4px;line-height:1.3">${esc(an[k].comment || '')}</div></div>` : '').join('')}</div>
    ${an.improvements?.length ? `<h4 class="mt mb-s">Sugestões</h4><ul class="clean small">${an.improvements.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${an.measurable_version ? `<div class="row between wrap mt-s small"><span><b>Versão mensurável:</b> ${esc(an.measurable_version)}</span><button class="btn xs" id="use-measurable">Usar como nome</button></div>` : ''}
    ${an.xp_factor && an.xp_factor !== 1 ? `<div class="tiny dim mt-s">Ajuste de complexidade no XP: ×${String(an.xp_factor).replace('.', ',')}</div>` : ''}
  </div>`;
}

/** Editor de campos personalizados de registro. */
export function customFieldsEditor(el, initial = []) {
  let list = initial.map((f) => ({ ...f }));
  function draw() {
    el.innerHTML = `<div class="small muted mb-s">Campos extras que aparecem ao registrar esta meta (ex.: “Palavras escritas”, “Humor”). Opcional.</div>
      ${list.map((f, i) => `<div class="row gap-s mb-s"><input type="text" data-l="${i}" value="${esc(f.label)}" maxlength="40" placeholder="Nome do campo" style="flex:2">
        <select data-t="${i}" style="flex:1"><option value="number" ${f.type === 'number' ? 'selected' : ''}>Número</option><option value="text" ${f.type === 'text' ? 'selected' : ''}>Texto</option></select>
        <input type="text" data-u="${i}" value="${esc(f.unit || '')}" maxlength="15" placeholder="unidade" style="flex:1"><button class="icon-btn" data-x="${i}" type="button">${icon('trash')}</button></div>`).join('')}
      ${list.length < 6 ? `<button class="btn xs" type="button" id="cf-add">${icon('plus', 'attr-icon')} Adicionar campo</button>` : ''}`;
    el.querySelectorAll('[data-l]').forEach((x) => x.addEventListener('input', () => { list[x.dataset.l].label = x.value; }));
    el.querySelectorAll('[data-t]').forEach((x) => x.addEventListener('change', () => { list[x.dataset.t].type = x.value; }));
    el.querySelectorAll('[data-u]').forEach((x) => x.addEventListener('input', () => { list[x.dataset.u].unit = x.value; }));
    el.querySelectorAll('[data-x]').forEach((x) => x.addEventListener('click', () => { list.splice(Number(x.dataset.x), 1); draw(); }));
    el.querySelector('#cf-add')?.addEventListener('click', () => { list.push({ label: '', type: 'number', unit: '' }); draw(); });
  }
  draw();
  return { get: () => list.filter((f) => f.label && f.label.trim()).map((f) => ({ key: f.key, label: f.label.trim(), type: f.type, unit: f.unit || null })) };
}

export function newGoalModal(app, presetText = '') {
  const cat = app.config.catalog;
  const ATTRS = app.config.attributes;
  const today = app.state.today.today;
  let state = null; let ed = null; let prev = null; let cf = null; let dirty = false;
  const m = modal({
    title: 'Nova meta', wide: true,
    body: `<div class="goal-compose">
      <label class="field">O que você quer fazer ou alcançar? <span class="tiny dim">Escreva do seu jeito.</span>
        <textarea id="ng-text" maxlength="400" placeholder="Ex.: Quero ler 30 páginas por dia">${esc(presetText)}</textarea></label>
      <div class="example-chips mt-s">${EXAMPLES.map((x) => `<span class="chip" data-ex="${esc(x)}">${esc(x)}</span>`).join('')}</div>
      <div class="row between wrap mt"><span class="small dim">${app.config.ai ? `${icon('ai', 'attr-icon')} A IA interpreta e analisa a meta; o servidor valida tudo.` : 'Análise automática local (a IA fica disponível com OPENAI_API_KEY).'}</span>
        <button class="btn primary" id="ng-go">${icon('sparkle', 'attr-icon')} Analisar meta</button></div>
      <div id="ng-review" class="mt"></div></div>`,
    foot: `<button class="btn ghost" id="ng-manual" style="margin-right:auto">Escolher categoria manualmente</button><button class="btn" data-close>Cancelar</button><button class="btn primary" id="ng-save" disabled>${icon('check', 'attr-icon')} Criar meta</button>`,
  });
  const text = () => m.$('#ng-text').value.trim();
  m.$$('[data-ex]').forEach((c) => c.addEventListener('click', () => { m.$('#ng-text').value = c.dataset.ex; interpret(); }));
  m.$('#ng-text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); interpret(); } });
  m.$('#ng-go').addEventListener('click', interpret);
  m.$('#ng-manual').addEventListener('click', () => { m.close(); goalModal(app, null); });

  async function interpret() {
    if (text().length < 3) { toast('Descreva a meta em poucas palavras.', 'info'); return; }
    await busy(m.$('#ng-go'), async () => {
      const r = await POST('/api/goals/interpret', { text: text() });
      state = { ...r, type: r.draft.type };
      if (r.aiError) toast(`IA indisponível agora (${esc(r.aiError)}). Usamos a análise local.`, 'info', 6000);
      review();
    });
  }
  function value() {
    const f = ed.get();
    return {
      ...f, type: state.type, name: m.$('#ng-name').value || null, source_text: state.text,
      description: m.$('#ng-desc')?.value || null, objective: m.$('#ng-obj')?.value || null, notes: m.$('#ng-notes')?.value || null,
      criteria: (m.$('#ng-crit')?.value || '').split('\n').map((x) => x.trim()).filter(Boolean),
      deadline: m.$('#ng-deadline')?.value || null,
      params: { ...(m.$('#ng-ex') ? { exercise: m.$('#ng-ex').value } : {}), ...(m.$('#ng-subj')?.value ? { subject: m.$('#ng-subj').value } : {}), ...(m.$('#ng-ulabel')?.value ? { unit_label: m.$('#ng-ulabel').value } : {}) },
      custom_fields: cf ? cf.get() : [], analysis_token: state.token,
    };
  }
  function review() {
    state.text = text();
    const d = state.draft; const T = cat.types[state.type];
    const typeOpts = Object.entries(cat.groups).map(([gk, gr]) => `<optgroup label="${esc(gr.name)}">${Object.entries(cat.types).filter(([, t]) => t.group === gk).map(([k, t]) => `<option value="${k}" ${k === state.type ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</optgroup>`).join('');
    const assumed = state.assumed || [];
    m.$('#ng-review').innerHTML = `<div class="panel tight" style="background:var(--bg-2)">
      <div class="form-grid"><label class="field">Nome da meta<input type="text" id="ng-name" maxlength="60" value="${esc(d.name || d.label || '')}"></label>
        <label class="field">Categoria (interpretada)<select id="ng-type">${typeOpts}</select></label></div>
      ${assumed.length ? `<div class="banner warn small mt-s"><div>${icon('info', 'attr-icon')} Completamos ${assumed.map((a) => ({ target: 'a quantidade', period: 'a frequência', unit: 'a unidade', deadline: 'o prazo' }[a])).filter(Boolean).join(', ')} com um valor sugerido. Ajuste se quiser.</div></div>` : ''}
      <div id="ng-fields" class="mt-s ${assumed.includes('target') ? 'assumed' : ''}"></div>
      <div class="form-grid mt-s" id="ng-extra"></div>
      <details class="mt"><summary class="more-toggle">Mais opções (descrição, critérios, campos personalizados…)</summary>
        <div class="form-grid mt-s"><label class="field full">Objetivo<input type="text" id="ng-obj" maxlength="300" placeholder="Por que essa meta importa para você?"></label>
          <label class="field full">Descrição<textarea id="ng-desc" maxlength="500"></textarea></label>
          <label class="field">Critérios de conclusão (um por linha)<textarea id="ng-crit" maxlength="1500"></textarea></label>
          <label class="field">Observações<textarea id="ng-notes" maxlength="500"></textarea></label></div>
        <h4 class="mt mb-s">Campos personalizados</h4><div id="ng-cf"></div></details></div>
      <div id="ng-an" class="mt"></div>
      <h4 class="mt mb-s">Como o sistema calcula</h4><div id="ng-prev"></div>`;
    ed = goalFields(m.$('#ng-fields'), cat, state.type, { period: d.period, unit: d.unit, mode: d.mode, target: d.target, days: d.days }, { onChange: () => { prev.refresh(); markDirty(); } });
    const needEx = T.needs.includes('exercise'); const optSubj = T.optional.includes('subject');
    m.$('#ng-extra').innerHTML = `${needEx ? `<label class="field">Exercício<input type="text" id="ng-ex" maxlength="60" value="${esc(d.params?.exercise || '')}"></label>` : ''}
      ${optSubj ? `<label class="field">Assunto (opcional)<input type="text" id="ng-subj" maxlength="60" value="${esc(d.params?.subject || '')}"></label>` : ''}
      ${T.units.some((u) => u === 'quantidade' || u === 'tarefas') ? `<label class="field">Nome da unidade (opcional)<input type="text" id="ng-ulabel" maxlength="20" value="${esc(d.params?.unit_label || '')}" placeholder="ex.: palavras, músicas"></label>` : ''}
      ${T.periods.includes('total') || d.deadline ? `<label class="field">Prazo ${T.periods.includes('total') ? '' : '(opcional)'}<input type="date" id="ng-deadline" min="${today}" value="${d.deadline || ''}"></label>` : ''}`;
    m.$('#ng-deadline')?.addEventListener('change', () => prev.refresh());
    cf = customFieldsEditor(m.$('#ng-cf'), d.custom_fields || []);
    if ((d.custom_fields || []).length) m.$('details').open = true;
    m.$('#ng-type').addEventListener('change', (e) => busy(null, async () => {
      state.type = e.target.value; const T2 = cat.types[state.type];
      state.draft = { ...state.draft, ...ed.get(), type: state.type, name: m.$('#ng-name').value, period: T2.periods.includes(ed.get().period) ? ed.get().period : T2.periods[0], unit: T2.units[0] };
      state.assumed = []; review(); await reanalyze(true);
    }));
    prev = previewPanel(m.$('#ng-prev'), () => value());
    prev.run(); drawAnalysis();
    m.$('#ng-save').disabled = false;
  }
  function drawAnalysis() {
    m.$('#ng-an').innerHTML = analysisHtml(state.analysis, state.source, ATTRS) + `<div id="ng-dirty" class="small mt-s ${dirty ? '' : 'hidden'}">${icon('info', 'attr-icon')} Você ajustou a meta depois da análise. <button class="btn xs" id="ng-re">Reanalisar</button></div>`;
    m.$('#use-measurable')?.addEventListener('click', () => { m.$('#ng-name').value = state.analysis.measurable_version.slice(0, 60); });
    m.$('#ng-re')?.addEventListener('click', (e) => busy(e.currentTarget, () => reanalyze(true)));
  }
  function markDirty() { dirty = true; m.$('#ng-dirty')?.classList.remove('hidden'); }
  async function reanalyze() {
    const r = await POST('/api/goals/analyze', value());
    state.token = r.token; state.analysis = r.analysis; state.source = r.source; dirty = false;
    if (r.aiError) toast(`IA indisponível agora (${esc(r.aiError)}). Usamos a análise local.`, 'info', 6000);
    drawAnalysis(); prev.refresh();
  }
  m.$('#ng-save').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    if (!state) return;
    if (dirty) await reanalyze();
    const r = await POST('/api/goals', value());
    toast(`Meta criada! ${esc(r.cycleNote)}`, 'success', 5000);
    m.close();
    await app.refresh({ fx: false });
    if (location.hash.includes('metas/nova')) app.go('metas/lista'); else app.rerender();
  }));
  if (presetText) interpret();
  return m;
}
