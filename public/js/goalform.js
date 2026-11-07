// Editor de metas: o usuário escolhe quantidade, unidade, frequência e dias.
// Atributos, XP e penalidades são exibidos apenas como informação (definidos pelo sistema).
import { esc, icon, POST, WEEKDAYS, ATTR, fmtNum } from './ui.js';

export const GROUP_ICON = { exercicio: 'dumbbell', saude: 'heart', mente: 'brain', social: 'palette', produtividade: 'target' };
export const TYPE_ICON = {
  musculacao: 'dumbbell', calistenia: 'dumbbell', caminhada: 'user', corrida: 'flame', ciclismo: 'sparkle', natacao: 'drop', esporte: 'trophy', outro_exercicio: 'dumbbell',
  agua: 'drop', calorias: 'heart', proteinas: 'heart', carboidratos: 'heart', gorduras: 'heart', sono: 'moon',
  leitura: 'book', estudo: 'brain', idiomas: 'users', meditacao: 'heart', projetos: 'target', social: 'users', criatividade: 'palette',
  carga: 'trophy', peso: 'user', habito_saude: 'heart', habito_mente: 'brain', habito_geral: 'check', produtividade: 'list',
};
const SYMBOL = (n) => '+'.repeat(n);

export function intensityHtml(weights) {
  return Object.entries(weights).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span class="tag" style="color:${ATTR[k].color};border-color:${ATTR[k].color}55">${ATTR[k].name} ${SYMBOL(n)}</span>`).join(' ');
}

/**
 * Campos de uma meta para um tipo. Retorna { get(), el }.
 * compact: layout em linha (configuração inicial).
 */
export function goalFields(el, catalog, type, initial = {}, { compact = false, onChange = () => {} } = {}) {
  const T = catalog.types[type];
  const lockAllDays = ['agua', 'calorias', 'proteinas', 'carboidratos', 'gorduras', 'sono'].includes(type);
  const st = {
    period: initial.period && T.periods.includes(initial.period) ? initial.period : T.periods[0],
    unit: initial.unit && T.units.includes(initial.unit) ? initial.unit : T.units[0],
    mode: initial.mode && T.modes.includes(initial.mode) ? initial.mode : T.modes[0],
    target: initial.target ?? defaultTarget(type, T),
    days: initial.days ? [...initial.days] : (T.periods[0] === 'times_per_week' ? [] : [0, 1, 2, 3, 4, 5, 6]),
    label: initial.label || '',
  };
  if (st.period === 'times_per_week') st.unit = 'sessoes';
  function draw() {
    const units = st.period === 'times_per_week' ? ['sessoes'] : T.units.filter((u) => u !== 'sessoes' || st.period !== 'times_per_week');
    const showDays = st.period === 'daily' ? !lockAllDays : st.period === 'times_per_week';
    el.innerHTML = `<div class="${compact ? 'goal-fields compact' : 'form-grid'}">
      ${T.periods.length > 1 ? `<div class="field ${compact ? '' : 'full'}"><span>Frequência</span><div><div class="seg">${T.periods.map((p) => `<button type="button" data-p="${p}" class="${p === st.period ? 'on' : ''}">${{ daily: 'Por dia', times_per_week: 'Vezes/semana', weekly: 'Por semana', monthly: 'Por mês', total: 'Até o prazo' }[p]}</button>`).join('')}</div></div></div>` : ''}
      ${T.modes.length > 1 ? `<label class="field">Tipo de meta<select data-mode>${T.modes.map((m) => `<option value="${m}" ${m === st.mode ? 'selected' : ''}>${catalog.modes[m]}</option>`).join('')}</select></label>` : ''}
      <label class="field">${st.period === 'times_per_week' ? 'Quantas vezes por semana' : T.milestone ? 'Valor-alvo (kg)' : st.period === 'total' ? 'Total até o prazo' : 'Valor-alvo'}<input type="number" data-target min="0" step="${catalog.units[st.unit].int ? 1 : 'any'}" value="${st.target}"></label>
      ${units.length > 1 ? `<label class="field">Unidade<select data-unit>${units.map((u) => `<option value="${u}" ${u === st.unit ? 'selected' : ''}>${catalog.units[u].label}</option>`).join('')}</select></label>` : `<div class="field"><span>Unidade</span><div class="muted" style="padding:9px 0">${catalog.units[st.unit].label}${st.period === 'times_per_week' || T.milestone ? '' : ` ${{ daily: 'por dia', weekly: 'por semana', monthly: 'por mês', total: 'no total' }[st.period]}`}</div></div>`}
      ${showDays ? `<div class="field ${compact ? '' : 'full'}"><span>${st.period === 'times_per_week' ? `Dias (opcional: escolha ${st.target} para virar compromisso)` : 'Dias programados'}</span><div class="chips">${WEEKDAYS.map((d, i) => `<span class="chip ${st.days.includes(i) ? 'on' : ''}" data-d="${i}">${d}</span>`).join('')}</div></div>` : ''}

    </div>`;
    el.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => {
      st.period = b.dataset.p;
      if (st.period === 'times_per_week') { st.unit = 'sessoes'; st.days = []; st.target = Math.min(7, Math.max(1, Math.round(st.target) || 3)); }
      else { if (st.unit === 'sessoes' && !T.units.includes('sessoes')) st.unit = T.units[0]; if (st.period === 'daily' && !st.days.length) st.days = [0, 1, 2, 3, 4, 5, 6]; }
      if (st.period !== 'times_per_week' && st.unit === 'sessoes' && T.units.length > 1) st.unit = T.units.find((u) => u !== 'sessoes');
      draw(); onChange();
    }));
    el.querySelector('[data-mode]')?.addEventListener('change', (e) => { st.mode = e.target.value; onChange(); });
    el.querySelector('[data-unit]')?.addEventListener('change', (e) => { st.unit = e.target.value; onChange(); });
    el.querySelector('[data-target]').addEventListener('input', (e) => { st.target = e.target.value === '' ? '' : Number(e.target.value); onChange(); });
    el.querySelector('[data-label]')?.addEventListener('input', (e) => { st.label = e.target.value; });
    el.querySelectorAll('[data-d]').forEach((c) => c.addEventListener('click', () => {
      const d = Number(c.dataset.d);
      st.days = st.days.includes(d) ? st.days.filter((x) => x !== d) : [...st.days, d].sort();
      c.classList.toggle('on'); onChange();
    }));
  }
  draw();
  return {
    el,
    get: () => ({ type, period: st.period, unit: st.unit, mode: st.mode, target: st.target, days: lockAllDays ? [0, 1, 2, 3, 4, 5, 6] : st.days, label: st.label || null }),
    set: (patch) => { Object.assign(st, patch); draw(); onChange(); },
  };
}

function defaultTarget(type, T) {
  const d = { agua: 3, calorias: 2200, proteinas: 140, carboidratos: 250, gorduras: 70, sono: 8, leitura: 20, estudo: 60, idiomas: 20, meditacao: 10, projetos: 60, social: 2, criatividade: 30, carga: 80, peso: 75, produtividade: 3, habito_saude: 1, habito_mente: 1, habito_geral: 1 };
  if (T.group === 'exercicio') return 3;
  return d[type] ?? 1;
}

/** Painel com metas calculadas e recompensas definidas pelo sistema (pré-visualização do servidor). */
export function previewPanel(el, getValue) {
  let timer = null; let seq = 0;
  async function run() {
    const my = ++seq;
    const val = getValue();
    if (!(val.target > 0)) { el.innerHTML = '<span class="muted small">Informe a quantidade.</span>'; return; }
    try {
      const p = await POST('/api/goals/preview', val);
      if (my !== seq) return;
      const tg = p.targets; const rw = p.rewards;
      if (tg.milestone) {
        el.innerHTML = `<div class="panel tight" style="background:var(--bg-2)"><div class="small muted mb">Meta de marco — regras do sistema</div><div class="row wrap gap-s">${intensityHtml(rw.weights)}</div>
          <div class="small mt-s">Recompensa única de <b class="gold">${rw.milestoneXp} XP</b> + 50 moedas ao alcançar o alvo dentro do prazo. Metas de marco não entram na média semanal do Boss Final (não têm objetivo semanal).</div></div>`;
        return;
      }
      const u = val.period === 'times_per_week' ? 'sessões' : null;
      const fmt = (x) => fmtNum(x, x < 10 ? 2 : 0);
      el.innerHTML = `<div class="eval-grid">
        <div class="eval-item"><b>Meta diária</b>${tg.sessions ? 'nos dias escolhidos' : fmt(tg.day)}</div>
        <div class="eval-item"><b>Meta semanal</b>${fmt(tg.week)} ${u || ''}${tg.capped ? '<div class="tiny muted">avaliada dia a dia</div>' : ''}</div>
        <div class="eval-item"><b>Meta mensal estimada</b>${fmt(tg.month)}</div>
        ${tg.total ? `<div class="eval-item"><b>Total até o prazo</b>${fmt(tg.total)} em ${tg.totalDays} dias</div>` : ''}
      </div>
      <div class="panel tight mt-s" style="background:var(--bg-2)"><div class="small muted mb">Regras definidas pelo sistema (não editáveis)</div>
        <div class="row wrap gap-s">${intensityHtml(rw.weights)}</div>
        <div class="small mt-s">Até <b class="gold">${rw.weeklyXp} XP/semana</b> ao cumprir 100% (até ${rw.weeklyXpMax} superando a meta) × multiplicador da ofensiva.
        ${rw.commitments ? `Descumprimento registrado: <b class="danger">−${rw.penaltyPerMiss} XP</b> por dia (metade em Disciplina).` : 'Sem compromisso diário (não gera penalidade diária).'}</div></div>`;
    } catch (e) {
      if (my === seq) el.innerHTML = `<span class="small danger">${esc(e.message)}</span>`;
    }
  }
  return { refresh() { clearTimeout(timer); timer = setTimeout(run, 250); }, run };
}

export { icon };
