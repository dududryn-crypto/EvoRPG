// Formulários de registro detalhado que se adaptam ao tipo de meta.
import { GET, POST, PUT, DEL, esc, icon, modal, busy, toast, fmtNum, fmtDateLong, confirmBox } from './ui.js';

let suggestions = null;
async function sugg(force = false) { if (!suggestions || force) suggestions = await GET('/api/records/suggestions').catch(() => ({ exercises: [], books: [], subjects: [] })); return suggestions; }

const MODALITY_NAMES = { musculacao: 'Musculação', calistenia: 'Calistenia', caminhada: 'Caminhada', corrida: 'Corrida', ciclismo: 'Ciclismo', natacao: 'Natação', esporte: 'Treino esportivo', outro_exercicio: 'Outro exercício' };

/** Resumo em uma linha de um registro (listas e históricos). */
export function recordSummary(kind, d, app) {
  const base = recordSummaryBase(kind, d, app);
  const extra = d.custom ? Object.entries(d.custom).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'number' ? fmtNum(v, 2) : v}`).join(' · ') : '';
  return extra ? `${base} · ${extra}` : base;
}
function recordSummaryBase(kind, d, app) {
  const n = (x, dd = 1) => fmtNum(x, dd);
  switch (kind) {
    case 'forca': return `${MODALITY_NAMES[d.modality] || 'Treino'}${d.duration_min ? ` · ${d.duration_min} min` : ''} · ${d.exercises.map((e) => `${e.name} ${e.sets.map((s) => `${s.reps}×${n(s.weight)}kg`).join(', ')}`).join(' | ')}`;
    case 'cardio': return `${MODALITY_NAMES[d.modality]}${d.distance_km ? ` · ${n(d.distance_km, 2)} km` : ''}${d.duration_min ? ` · ${d.duration_min} min` : ''}${d.steps ? ` · ${n(d.steps, 0)} passos` : ''}${d.distance_km && d.duration_min ? ` · ritmo ${n(d.duration_min / d.distance_km, 2)} min/km` : ''}`;
    case 'leitura': return `${d.book ? `“${d.book}”` : 'Leitura'}${d.author ? ` (${d.author})` : ''}${d.pages ? ` · ${d.pages} págs` : ''}${d.minutes ? ` · ${d.minutes} min` : ''}`;
    case 'estudo': return `${d.subject || 'Estudo'} · ${d.minutes} min${d.exercises ? ` · ${d.exercises} exercícios` : ''}${d.performance !== null && d.performance !== undefined ? ` · desempenho ${n(d.performance, 0)}%` : ''}${d.content ? ` · ${d.content}` : ''}`;
    case 'refeicao': return `${app?.config.catalog.meals[d.meal] || 'Refeição'}${d.description ? ` (${d.description})` : ''}${d.calories !== null ? ` · ${n(d.calories, 0)} kcal` : ''}${d.protein !== null ? ` · P ${n(d.protein, 0)}g` : ''}${d.carbs !== null ? ` · C ${n(d.carbs, 0)}g` : ''}${d.fat !== null ? ` · G ${n(d.fat, 0)}g` : ''}`;
    case 'hidratacao': return `${d.unit === 'L' ? `${n(d.amount, 2)} L` : `${n(d.amount, 0)} ml`}`;
    case 'sono': return `${n(d.hours, 2)} h${d.bed_time ? ` · ${d.bed_time} → ${d.wake_time || '?'}` : ''}${d.quality ? ` · qualidade ${d.quality}/5` : ''}`;
    case 'corpo': return `${n(d.weight_kg)} kg${d.waist_cm ? ` · cintura ${n(d.waist_cm)} cm` : ''}`;
    case 'sessao': return `${d.done ? 'Concluída' : 'Não concluída'}${d.minutes ? ` · ${d.minutes} min` : ''}${d.quantity ? ` · ${n(d.quantity)} un.` : ''}${d.description ? ` · ${d.description}` : ''}`;
    default: return '';
  }
}

const field = (label, html, cls = '') => `<label class="field ${cls}">${label}${html}</label>`;
const num = (name, val, attrs = '') => `<input type="number" name="${name}" value="${val ?? ''}" ${attrs}>`;
const txt = (name, val, attrs = '') => `<input type="text" name="${name}" value="${esc(val ?? '')}" ${attrs}>`;

/**
 * Abre o formulário de registro. opts: { kind, goal (opcional), date, record (edição), onSaved }
 */
export async function openRecordForm(app, { kind, goal = null, date, record = null, onSaved }) {
  const d = record ? record.data : {};
  const params = goal?.params || {};
  const s = kind === 'forca' || kind === 'leitura' || kind === 'estudo' ? await sugg() : null;
  const today = app.state.today.today;
  const title = { forca: 'Registrar treino de força', cardio: `Registrar ${(MODALITY_NAMES[d.modality || params.modality] || 'atividade').toLowerCase()}`, leitura: 'Registrar leitura', estudo: 'Registrar estudo', refeicao: 'Registrar refeição', hidratacao: 'Registrar hidratação', sono: 'Registrar sono', corpo: 'Registrar medidas', sessao: `Registrar — ${goal?.name || 'sessão'}` }[kind];
  let body = '';
  const dt = `<div class="form-grid mb">${field('Data', `<input type="date" name="date" max="${today}" min="${addD(today, -30)}" value="${record?.date || date || today}">`)}${field('Horário (opcional)', `<input type="time" name="time" value="${record?.time || ''}">`)}</div>`;
  if (kind === 'forca') {
    body = `<div class="form-grid">${field('Modalidade', `<select name="modality">${['musculacao', 'calistenia'].map((m) => `<option value="${m}" ${(d.modality || params.modality) === m ? 'selected' : ''}>${MODALITY_NAMES[m]}</option>`).join('')}</select>`)}${field('Duração (min)', num('duration_min', d.duration_min, 'min="1" max="600"'))}</div>
      <div class="row between mt mb"><h4>Exercícios</h4><div class="row gap-s">${s.lastWorkout && !record ? '<button type="button" class="btn xs" id="repeat">Repetir último treino</button>' : ''}<button type="button" class="btn xs" id="add-ex">${icon('plus', 'attr-icon')} Exercício</button></div></div>
      <div id="exs" class="col"></div>
      <datalist id="ex-names">${s.exercises.map((e) => `<option value="${esc(e.name)}">`).join('')}</datalist>`;
  } else if (kind === 'cardio') {
    body = `<div class="form-grid">${field('Modalidade', `<select name="modality">${['caminhada', 'corrida', 'ciclismo', 'natacao', 'esporte', 'outro_exercicio'].map((m) => `<option value="${m}" ${(d.modality || params.modality) === m ? 'selected' : ''}>${MODALITY_NAMES[m]}</option>`).join('')}</select>`)}
      ${field('Tempo (min)', num('duration_min', d.duration_min, 'min="1"'))}${field('Distância (km)', num('distance_km', d.distance_km, 'min="0" step="0.01"'))}${field('Passos (se disponível)', num('steps', d.steps, 'min="0"'))}
      <div class="full small muted" id="pace"></div></div>`;
  } else if (kind === 'leitura') {
    body = `<div class="form-grid">${field('Livro', txt('book', d.book, 'list="books" maxlength="120" placeholder="Título"'))}${field('Autor (opcional)', txt('author', d.author, 'maxlength="80"'))}
      ${field('Páginas lidas', num('pages', d.pages, 'min="1"'))}${field('Tempo de leitura (min)', num('minutes', d.minutes, 'min="1"'))}</div>
      <datalist id="books">${s.books.map((b) => `<option value="${esc(b.book)}">`).join('')}</datalist>`;
  } else if (kind === 'estudo') {
    body = `<div class="form-grid">${field('Assunto', txt('subject', d.subject || params.subject, 'list="subjects" maxlength="80"'))}${field('Tempo (min)', num('minutes', d.minutes, 'min="1" required'))}
      ${field('Conteúdo estudado', txt('content', d.content, 'maxlength="300"'), 'full')}${field('Exercícios realizados', num('exercises', d.exercises, 'min="0"'))}${field('Desempenho (%)', num('performance', d.performance, 'min="0" max="100"'))}</div>
      <datalist id="subjects">${s.subjects.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>`;
  } else if (kind === 'refeicao') {
    body = `<div class="form-grid">${field('Refeição', `<select name="meal">${Object.entries(app.config.catalog.meals).map(([k, v]) => `<option value="${k}" ${d.meal === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}${field('Descrição', txt('description', d.description, 'maxlength="200" placeholder="Ex.: arroz, feijão e frango"'))}
      ${field('Calorias (kcal)', num('calories', d.calories, 'min="0"'))}${field('Proteínas (g)', num('protein', d.protein, 'min="0"'))}${field('Carboidratos (g)', num('carbs', d.carbs, 'min="0"'))}${field('Gorduras (g)', num('fat', d.fat, 'min="0"'))}</div>
      <p class="hint">Preencha só o que quiser acompanhar — nenhum nutriente é obrigatório.</p>`;
  } else if (kind === 'hidratacao') {
    body = `<div class="chips mb">${[250, 300, 500, 750, 1000].map((x) => `<span class="chip" data-q="${x}">${x >= 1000 ? `${x / 1000} L` : `${x} ml`}</span>`).join('')}</div>
      <div class="form-grid">${field('Quantidade', num('amount', d.amount ?? 250, 'min="0" step="any"'))}${field('Unidade', `<select name="unit"><option value="ml" ${d.unit !== 'L' ? 'selected' : ''}>ml</option><option value="L" ${d.unit === 'L' ? 'selected' : ''}>L</option></select>`)}</div>`;
  } else if (kind === 'sono') {
    body = `<div class="form-grid">${field('Dormiu às', `<input type="time" name="bed_time" value="${d.bed_time || '23:00'}">`)}${field('Acordou às', `<input type="time" name="wake_time" value="${d.wake_time || '07:00'}">`)}
      ${field('Horas (opcional — calculado pelos horários)', num('hours', record ? d.hours : '', 'min="0" max="24" step="0.25"'))}${field('Qualidade', `<select name="quality"><option value="">—</option>${[1, 2, 3, 4, 5].map((q) => `<option value="${q}" ${d.quality === q ? 'selected' : ''}>${q} · ${['péssima', 'ruim', 'regular', 'boa', 'excelente'][q - 1]}</option>`).join('')}</select>`)}</div>
      <p class="hint">A data é o dia em que você acordou. Um registro por noite.</p>`;
  } else if (kind === 'corpo') {
    body = `<div class="form-grid">${field('Peso (kg)', num('weight_kg', d.weight_kg, 'min="20" max="400" step="0.1" required'))}${field('Cintura (cm, opcional)', num('waist_cm', d.waist_cm, 'min="30" step="0.1"'))}</div>`;
  } else if (kind === 'sessao') {
    const u = goal?.unit;
    body = `<div class="form-grid">${field('Tempo (min)', num('minutes', d.minutes, 'min="1"'))}${field(u === 'tarefas' ? 'Tarefas concluídas' : `Quantidade${goal?.unitLabel && goal.unitLabel !== 'unidades' ? ` (${esc(goal.unitLabel)})` : ''}`, num('quantity', d.quantity, 'min="0" step="any"'))}
      ${field('O que foi feito', txt('description', d.description, 'maxlength="300"'), 'full')}
      <label class="check full"><input type="checkbox" name="done" ${d.done === false ? '' : 'checked'}> Sessão concluída</label></div>`;
  }
  const cfs = goal?.custom_fields || [];
  const customHtml = cfs.length ? `<h4 class="mt mb-s">Campos da meta</h4><div class="form-grid">${cfs.map((c) => field(`${esc(c.label)}${c.unit ? ` (${esc(c.unit)})` : ''}`, c.type === 'number' ? num(`cf_${c.key}`, d.custom?.[c.key], 'step="any"') : txt(`cf_${c.key}`, d.custom?.[c.key], 'maxlength="200"'))).join('')}</div>` : '';
  const m = modal({
    title, wide: kind === 'forca',
    body: `<form id="rf">${dt}${body}${customHtml}${field('Observações (opcional)', `<textarea name="note" maxlength="500">${esc(record?.note || '')}</textarea>`, 'mt')}</form>`,
    foot: `${record ? `<button class="btn danger" id="del">${icon('trash', 'attr-icon')} Excluir</button><span class="grow"></span>` : ''}<button class="btn" data-close>Cancelar</button><button class="btn primary" id="save">${icon('check', 'attr-icon')} Salvar</button>`,
  });
  const form = m.$('#rf');
  // ---- comportamento específico ----
  let exercises = [];
  if (kind === 'forca') {
    exercises = record ? JSON.parse(JSON.stringify(d.exercises)) : [{ name: '', group: '', sets: [{ reps: '', weight: '', rest_s: '' }] }];
    const groups = app.config.catalog.muscleGroups;
    const draw = () => {
      m.$('#exs').innerHTML = exercises.map((e, i) => `<div class="setup-item" data-i="${i}">
        <div class="form-grid" style="grid-template-columns:2fr 1fr auto">${field('Exercício', `<input type="text" list="ex-names" data-k="name" value="${esc(e.name)}" maxlength="60" placeholder="Ex.: Supino reto">`)}
          ${field('Grupo muscular', `<select data-k="group"><option value="">—</option>${groups.map((g) => `<option ${e.group === g ? 'selected' : ''}>${g}</option>`).join('')}</select>`)}
          <button type="button" class="icon-btn" data-rm-ex style="align-self:end;margin-bottom:6px">${icon('trash', 'attr-icon')}</button></div>
        <div class="set-row small muted mt-s" style="grid-template-columns:40px 1fr 1fr 1fr 28px"><span>Série</span><span>Repetições</span><span>Carga (kg)</span><span>Descanso (s)</span><span></span></div>
        ${e.sets.map((st, j) => `<div class="set-row" style="grid-template-columns:40px 1fr 1fr 1fr 28px" data-j="${j}"><span class="muted small">${j + 1}</span><input type="number" min="1" data-s="reps" value="${st.reps}"><input type="number" min="0" step="any" data-s="weight" value="${st.weight}"><input type="number" min="0" data-s="rest_s" value="${st.rest_s ?? ''}"><button type="button" class="icon-btn" data-rm-set>${icon('x', 'attr-icon')}</button></div>`).join('')}
        <button type="button" class="btn xs mt-s" data-add-set>${icon('plus', 'attr-icon')} Série</button></div>`).join('');
      m.$$('[data-i]').forEach((box) => {
        const i = Number(box.dataset.i);
        box.querySelectorAll('[data-k]').forEach((inp) => inp.addEventListener('input', () => { exercises[i][inp.dataset.k] = inp.value; if (inp.dataset.k === 'name') autofill(i, inp.value); }));
        box.querySelectorAll('[data-j]').forEach((row) => { const j = Number(row.dataset.j); row.querySelectorAll('[data-s]').forEach((inp) => inp.addEventListener('input', () => { exercises[i].sets[j][inp.dataset.s] = inp.value; })); row.querySelector('[data-rm-set]').addEventListener('click', () => { exercises[i].sets.splice(j, 1); draw(); }); });
        box.querySelector('[data-add-set]').addEventListener('click', () => { const last = exercises[i].sets[exercises[i].sets.length - 1] || { reps: '', weight: '', rest_s: '' }; exercises[i].sets.push({ ...last }); draw(); });
        box.querySelector('[data-rm-ex]').addEventListener('click', () => { exercises.splice(i, 1); draw(); });
      });
    };
    const autofill = (i, name) => {
      const last = s.exercises.find((e) => e.name.toLowerCase() === name.trim().toLowerCase());
      if (last && !exercises[i].group) { exercises[i].group = last.group || ''; const sel = m.$(`[data-i="${i}"] [data-k="group"]`); if (sel) sel.value = last.group || ''; }
    };
    m.$('#add-ex').addEventListener('click', () => { exercises.push({ name: '', group: '', sets: [{ reps: '', weight: '', rest_s: '' }] }); draw(); });
    m.$('#repeat')?.addEventListener('click', () => { exercises = JSON.parse(JSON.stringify(s.lastWorkout.exercises)); if (s.lastWorkout.duration_min) form.duration_min.value = s.lastWorkout.duration_min; draw(); toast('Último treino copiado. Ajuste cargas e repetições.', 'info', 2500); });
    draw();
  }
  if (kind === 'cardio') {
    const pace = () => { const km = Number(form.distance_km.value); const min = Number(form.duration_min.value); m.$('#pace').textContent = km > 0 && min > 0 ? `Ritmo calculado: ${fmtNum(min / km, 2)} min/km · ${fmtNum(km / (min / 60), 1)} km/h` : ''; };
    form.addEventListener('input', pace); pace();
  }
  if (kind === 'leitura') form.book.addEventListener('change', () => { const b = s.books.find((x) => x.book === form.book.value); if (b && b.author && !form.author.value) form.author.value = b.author; });
  if (kind === 'hidratacao') m.$$('[data-q]').forEach((c) => c.addEventListener('click', () => { form.amount.value = c.dataset.q; form.unit.value = 'ml'; }));

  const collect = () => {
    const f = Object.fromEntries(new FormData(form).entries());
    const nz = (x) => (x === undefined || x === '' ? null : Number(x));
    const data = {
      forca: () => ({ modality: f.modality, duration_min: nz(f.duration_min), exercises: exercises.filter((e) => e.name.trim()).map((e) => ({ name: e.name.trim(), group: e.group || null, sets: e.sets.filter((x) => x.reps !== '').map((x) => ({ reps: Number(x.reps), weight: nz(x.weight) || 0, rest_s: nz(x.rest_s) })) })) }),
      cardio: () => ({ modality: f.modality, duration_min: nz(f.duration_min), distance_km: nz(f.distance_km), steps: nz(f.steps) }),
      leitura: () => ({ book: f.book || null, author: f.author || null, pages: nz(f.pages), minutes: nz(f.minutes) }),
      estudo: () => ({ subject: f.subject || null, minutes: nz(f.minutes), content: f.content || null, exercises: nz(f.exercises), performance: nz(f.performance) }),
      refeicao: () => ({ meal: f.meal, description: f.description || null, calories: nz(f.calories), protein: nz(f.protein), carbs: nz(f.carbs), fat: nz(f.fat) }),
      hidratacao: () => ({ amount: nz(f.amount), unit: f.unit }),
      sono: () => ({ bed_time: f.bed_time || null, wake_time: f.wake_time || null, hours: nz(f.hours), quality: nz(f.quality) }),
      corpo: () => ({ weight_kg: nz(f.weight_kg), waist_cm: nz(f.waist_cm) }),
      sessao: () => ({ minutes: nz(f.minutes), quantity: nz(f.quantity), description: f.description || null, done: !!form.done.checked }),
    }[kind]();
    if (cfs.length) {
      const custom = {};
      for (const c of cfs) { const v = f[`cf_${c.key}`]; if (v !== undefined && v !== '') custom[c.key] = c.type === 'number' ? Number(v) : v; }
      if (Object.keys(custom).length) data.custom = custom;
    }
    return { kind, goal_id: kind === 'sessao' ? goal.id : null, date: f.date, time: f.time || null, data, note: f.note || null };
  };
  m.$('#save').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const payload = collect();
    if (record) await PUT(`/api/records/${record.id}`, payload); else await POST('/api/records', payload);
    if (kind === 'forca' || kind === 'leitura' || kind === 'estudo') suggestions = null;
    m.close();
    toast(record ? 'Registro atualizado.' : 'Registro salvo.', 'success', 2000);
    onSaved && (await onSaved(payload));
  }));
  m.$('#del')?.addEventListener('click', async () => {
    if (!(await confirmBox('Excluir este registro? O XP e as estatísticas serão recalculados.', { danger: true, okText: 'Excluir' }))) return;
    await busy(null, async () => { await DEL(`/api/records/${record.id}`); m.close(); onSaved && (await onSaved(null)); });
  });
}

/** Registro rápido de água (sem formulário). */
export async function quickWater(date, ml) {
  return POST('/api/records', { kind: 'hidratacao', date, time: new Date().toTimeString().slice(0, 5), data: { amount: ml, unit: 'ml' } });
}

function addD(s, n) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
export { MODALITY_NAMES, fmtDateLong };
