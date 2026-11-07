import { GET, esc, icon, fmtNum, fmtDate, fmtDateLong, ATTR, ATTR_KEYS, bar, emptyState } from '../ui.js';
import { chart, radar } from '../charts.js';
import { heroStage } from '../sprites.js';
import { recordSummary } from '../records.js';
import { TYPE_ICON } from '../goalform.js';

const PERIODS = [['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['all', 'Todo o período']];
const pct = (x) => (x === null || x === undefined ? '—' : `${fmtNum(x * 100, 0)}%`);
const TREND = { evoluindo: ['▲', 'ok', 'Evoluindo'], regredindo: ['▼', 'danger', 'Regredindo'], estavel: ['■', 'warn', 'Estável'], 'sem-dados': ['·', 'dim', 'Sem comparação'] };
function delta(cur, prev, unit = '', digits = 0) {
  if (prev === null || prev === undefined || cur === null || cur === undefined) return '<span class="dim small">sem período anterior</span>';
  const d = cur - prev;
  const cls = Math.abs(d) < 1e-9 ? 'warn' : d > 0 ? 'ok' : 'danger';
  return `<span class="small ${cls}">${d > 0 ? '▲ +' : d < 0 ? '▼ ' : '■ '}${fmtNum(d, digits)}${unit}</span> <span class="small dim">vs ${fmtNum(prev, digits)}${unit}</span>`;
}
const kpi = (label, val, sub = '') => `<div class="kpi"><div class="label">${label}</div><div class="val">${val}</div>${sub}</div>`;

export async function render(el, app, params) {
  if (params[0] === 'meta' && params[1]) return goalPage(el, app, Number(params[1]));
  let period = sessionStorage.getItem('evo-period') || '30';
  el.innerHTML = `<div class="page-head"><div><h1>Evolução</h1><p>Você contra você mesmo. Toque em uma meta para ver os detalhes.</p></div>
    <div class="seg" id="per">${PERIODS.map(([k, l]) => `<button data-p="${k}" class="${k === period ? 'on' : ''}">${l}</button>`).join('')}</div></div><div id="ov"></div>`;
  let stage = null;
  async function load() {
    const o = await GET(`/api/stats/overview?period=${period}`);
    const box = el.querySelector('#ov');
    const c = o.current; const p = o.previous;
    box.innerHTML = `
      <div class="grid" style="grid-template-columns:minmax(0,1.1fr) minmax(0,1.6fr)" id="r1">
        <section class="panel ornament hero-mini"><canvas id="hero"></canvas><div class="col">
          <span class="level-badge" style="align-self:flex-start">${icon('star', 'attr-icon')} Nível ${o.character.level}</span>
          <div><div class="small muted">XP acumulado</div><div class="big-pct gold">${fmtNum(o.totalXp, 0)}</div></div>
          <div><div class="row between small muted"><span>Próximo nível</span><span>${fmtNum(o.character.intoLevel, 0)} / ${fmtNum(o.character.needed, 0)}</span></div>${bar(o.character.progress, 'lg')}</div></div></section>
        <section class="grid g2" style="gap:12px">
          ${kpi('XP no período', `${c.xp > 0 ? '+' : ''}${fmtNum(c.xp, 0)}`, delta(c.xp, p?.xp))}
          ${kpi('Consistência', c.consistency === null ? '—' : `${c.consistency}%`, delta(c.consistency, p?.consistency, ' p.p.'))}
          ${kpi('Dias perfeitos', c.perfectDays, delta(c.perfectDays, p?.perfectDays))}
          ${kpi('Ofensiva', `${o.streak.current} <small class="muted" style="font-size:13px">dias</small>`, `<span class="small dim">melhor: ${o.streak.best} dias</span>`)}
        </section>
      </div>
      <div class="grid g2 mt">
        <section class="panel"><div class="panel-title"><h3>Evolução dos atributos</h3><span class="small muted">${period === 'all' ? 'desde o início' : `últimos ${period} dias`}</span></div>
          ${o.attributes.map((a) => { const max = Math.max(...o.attributes.map((x) => x.levelNow), 2); return `<div class="attr-evo"><span class="row gap-s"><span class="dot" style="--c:${a.color}"></span>${a.name}</span>
            <div class="track"><i style="width:${(a.levelStart / max) * 100}%;background:${a.color}55"></i><i style="width:${(a.levelNow / max) * 100}%;background:linear-gradient(90deg, ${a.color}66, ${a.color});opacity:.9"></i></div>
            <span class="mono small" style="text-align:right">${fmtNum(a.levelNow, 2)} ${a.levelNow > a.levelStart ? `<span class="ok">+${fmtNum(a.levelNow - a.levelStart, 2)}</span>` : ''}</span></div>`; }).join('')}
          <p class="hint">Barra clara = nível no início do período; barra forte = agora (nível + progresso no nível).</p></section>
        <section class="panel"><div class="panel-title"><h3>XP acumulado</h3></div><div id="c-xp"></div></section>
      </div>
      <div class="grid g2 mt">
        <section class="panel"><div class="panel-title"><h3>Desempenho semanal</h3><span class="small muted">média das metas · Boss Final exige 95%</span></div><div id="c-week"></div></section>
        <section class="panel"><div class="panel-title"><h3>Metas com melhor evolução</h3></div>
          ${o.bestGoals.length ? o.bestGoals.map((g) => `<a class="row between goal-row" href="#/evolucao/meta/${g.id}" style="text-decoration:none;color:inherit"><span class="row gap-s">${icon(TYPE_ICON[g.type] || 'star', 'attr-icon')} <b>${esc(g.name)}</b></span><span class="${g.trend > 0 ? 'ok' : g.trend < 0 ? 'danger' : 'warn'}">${g.trend > 0 ? '▲ +' : g.trend < 0 ? '▼ ' : '■ '}${fmtNum(g.trend, 1)} p.p.</span></a>`).join('')
    : '<p class="muted small">Ainda não há períodos anteriores suficientes para comparar as metas.</p>'}</section>
      </div>
      <h2 class="mt mb">Minhas metas</h2>
      ${o.goals.length ? `<div class="grid g3">${o.goals.map((g) => {
    const tr = g.trend === null ? null : g.trend;
    return `<a class="panel tight goal-tile" href="#/evolucao/meta/${g.id}" style="text-decoration:none;color:inherit">
          <div class="row between"><span class="row gap-s">${icon(TYPE_ICON[g.type] || 'star', 'attr-icon')}<b>${esc(g.name)}</b></span>${g.milestone ? '<span class="tag">marco</span>' : ''}</div>
          <div class="row between mt-s"><span class="big-pct">${pct(g.completion)}</span><span class="${tr === null ? 'dim' : tr > 0 ? 'ok' : tr < 0 ? 'danger' : 'warn'} small">${tr === null ? 'sem comparação' : `${tr > 0 ? '▲' : tr < 0 ? '▼' : '■'} ${fmtNum(Math.abs(tr), 1)} p.p.`}</span></div>
          <div class="mt-s">${bar(g.completion || 0)}</div><div class="small muted mt-s">${esc(g.progressText)}</div></a>`;
  }).join('')}</div>` : emptyState('Nenhuma meta ainda', 'Crie metas para acompanhar sua evolução.')}`;
    if (innerWidth < 1000) box.querySelector('#r1').style.gridTemplateColumns = '1fr';
    stage?.stop();
    stage = heroStage(box.querySelector('#hero'), () => app.state.appearance, { scale: 1.05, groundRatio: 0.92 });
    chart(box.querySelector('#c-xp'), { labels: o.xpSeries.map((x) => x.date), series: [{ name: 'XP total', color: '#d9ad55', data: o.xpSeries.map((x) => x.xp), fill: true }], labelFormat: (d) => fmtDate(d), height: 'sm', emptyText: 'Sem XP no período.' });
    chart(box.querySelector('#c-week'), { labels: o.weekly.map((w) => w.week), labelFormat: (d) => fmtDate(d), tipLabelFormat: (d) => `Semana de ${fmtDate(d)}`, height: 'sm', yMin: 0, yMax: 100, refLine: 95, refLabel: '95%',
      series: [{ name: 'Média das metas', color: '#d9ad55', type: 'bar', data: o.weekly.map((w) => (w.average === null ? null : Math.round(w.average * 1000) / 10)), colorAt: (v) => (v >= 95 ? '#57d68d' : v >= 80 ? '#f2b84b' : '#ef5d68') }],
      valueFormat: (v) => `${fmtNum(v, 1)}%`, emptyText: 'Nenhuma semana com metas ainda.' });
  }
  el.querySelectorAll('#per button').forEach((b) => b.addEventListener('click', () => { period = b.dataset.p; sessionStorage.setItem('evo-period', period); el.querySelectorAll('#per button').forEach((x) => x.classList.toggle('on', x === b)); load(); }));
  await load();
  return () => stage?.stop();
}

// ================= Página individual da meta =================
async function goalPage(el, app, id) {
  let period = sessionStorage.getItem('evo-goal-period') || '30';
  el.innerHTML = '<div id="gp"></div>';
  async function load() {
    const st = await GET(`/api/goals/${id}/stats?period=${period}`);
    const g = st.goal; const s = st.summary; const u = st.unit;
    const box = el.querySelector('#gp');
    const sections = [];
    // KPIs gerais
    if (!g.milestone) {
      const tr = TREND[s.trend];
      sections.push(`<div class="grid g4">
        ${kpi('Cumprimento médio', s.completion === null ? '—' : `${s.completion}%`, `<span class="small ${tr[1]}">${tr[0]} ${tr[2]}</span>${s.prevCompletion !== null ? ` <span class="small dim">antes: ${s.prevCompletion}%</span>` : ''}`)}
        ${kpi(`Total (${esc(u)})`, fmtNum(s.total, 1), delta(s.total, s.prevTotal, '', 1))}
        ${kpi('Média por dia', `${fmtNum(s.avgPerDay, 2)} <small class="muted" style="font-size:12px">${esc(u)}</small>`, `<span class="small dim">${fmtNum(s.avgPerWeek, 1)} ${esc(u)}/semana · ${fmtNum(s.avgPerDayWithData, 2)} nos dias com registro</span>`)}
        ${kpi('Consistência', `${fmtNum(s.consistency, 0)}%`, `<span class="small dim">${s.daysWithData} de ${s.totalDays} dias com registro${s.daysScheduled ? ` · meta atingida em ${s.daysMet}/${s.daysScheduled}` : ''}</span>`)}
      </div>`);
    } else {
      const m = st.milestone;
      sections.push(`<div class="grid g4">${kpi('Início', m.baseline === null ? '—' : `${fmtNum(m.baseline)} kg`)}${kpi('Atual', m.current === null ? '—' : `${fmtNum(m.current)} kg`)}${kpi('Alvo', `${fmtNum(m.target)} kg`, g.deadline ? `<span class="small dim">prazo ${fmtDate(g.deadline)}</span>` : '')}${kpi('Progresso', pct(m.pct), m.reachedOn ? `<span class="small ok">alcançado em ${fmtDate(m.reachedOn)}</span>` : '')}</div>
        <section class="panel mt"><div class="panel-title"><h3>${m.kind === 'max_load' ? `Carga máxima — ${esc(m.exercise)}` : 'Peso corporal'}</h3></div><div id="c-ms"></div></section>`);
    }
    if (!st.recordCount && !g.milestone) {
      sections.push(`<div class="mt">${emptyState('Nenhum registro neste período', 'Registre na aba Metas para ver as estatísticas desta meta.')}</div>`);
    } else if (!g.milestone) {
      sections.push(`<div class="grid g2 mt"><section class="panel"><div class="panel-title"><h3>Registro diário</h3></div><div id="c-daily"></div></section>
        <section class="panel"><div class="panel-title"><h3>Semanas</h3><span class="small muted">${s.bestWeek ? `melhor: ${fmtDate(s.bestWeek.week)} (${fmtNum(s.bestWeek.total, 1)} ${esc(u)})` : ''}</span></div><div id="c-weeks"></div></section></div>`);
    }
    // específicos
    if (st.strength && st.exercises.length) {
      const sg = st.strength;
      sections.push(`<h2 class="mt mb">Treinos</h2><div class="grid g4">${kpi('Treinos', sg.sessions, delta(sg.sessions, sg.prevSessions))}${kpi('Volume (kg×reps)', fmtNum(sg.volume, 0), delta(sg.volume, sg.prevVolume))}${kpi('Recordes no período', sg.prs.length)}${kpi('Maior progressão', sg.mostProgress ? `<span style="font-size:18px">${esc(sg.mostProgress.name)}</span>` : '—', sg.mostProgress ? `<span class="small ok">${sg.mostProgress.loadChange > 0 ? '+' : ''}${fmtNum(sg.mostProgress.loadChange)} kg</span>` : '')}</div>
        <div class="grid g2 mt"><section class="panel"><div class="panel-title"><h3>Evolução da carga</h3><select id="ex-sel" style="width:auto">${st.exercises.map((e, i) => `<option value="${i}">${esc(e.name)}</option>`).join('')}</select></div><div id="c-load"></div><div class="small muted mt-s" id="ex-info"></div></section>
          <section class="panel"><div class="panel-title"><h3>Volume semanal</h3><span class="small muted">kg × repetições</span></div><div id="c-vol"></div></section></div>
        <section class="panel mt"><div class="panel-title"><h3>Exercícios</h3>${sg.stagnant.length ? `<span class="tag warn">sem progressão: ${esc(sg.stagnant.join(', '))}</span>` : ''}</div>
          <div class="table-wrap"><table class="table"><thead><tr><th>Exercício</th><th>Grupo</th><th>Sessões</th><th>Melhor carga</th><th>Variação no período</th><th>Volume</th><th>Último</th></tr></thead><tbody>
          ${st.exercises.map((e) => `<tr><td><b>${esc(e.name)}</b></td><td class="small muted">${esc(e.group || '—')}</td><td>${e.sessionsInPeriod}</td><td class="gold mono">${fmtNum(e.best)} kg</td><td class="mono ${e.loadChange > 0 ? 'ok' : e.loadChange < 0 ? 'danger' : 'dim'}">${e.loadChange === null ? '—' : `${e.loadChange > 0 ? '+' : ''}${fmtNum(e.loadChange)} kg`}</td><td class="mono">${fmtNum(e.volumeInPeriod, 0)}</td><td class="small">${fmtDate(e.lastDate)}</td></tr>`).join('')}</tbody></table></div>
          ${sg.prs.length ? `<h4 class="mt">Recordes pessoais</h4><div class="chips">${sg.prs.map((p) => `<span class="tag gold">${fmtDate(p.date)} · ${esc(p.exercise)}: ${fmtNum(p.weight)} kg (antes ${fmtNum(p.previous)})</span>`).join('')}</div>` : ''}
          ${sg.groups.length ? `<h4 class="mt">Séries por grupo muscular</h4><div class="chips">${sg.groups.map((x) => `<span class="tag">${esc(x.group)}: ${x.sets}</span>`).join('')}</div>` : ''}</section>`);
    }
    if (st.cardio && st.cardio.sessions) {
      const c = st.cardio;
      sections.push(`<h2 class="mt mb">Atividade</h2><div class="grid g4">${kpi('Sessões', c.sessions, delta(c.sessions, c.prevSessions))}${kpi('Distância', `${fmtNum(c.km, 1)} km`, delta(c.km, c.prevKm, ' km', 1))}${kpi('Tempo', `${fmtNum(c.minutes, 0)} min`, delta(c.minutes, c.prevMinutes, ' min'))}${kpi('Ritmo médio', c.avgPace ? `${fmtNum(c.avgPace, 2)}` : '—', c.bestPace ? `<span class="small dim">min/km · melhor ${fmtNum(c.bestPace, 2)}</span>` : '<span class="small dim">registre distância e tempo</span>')}</div>
        ${c.paces.length > 1 ? '<section class="panel mt"><div class="panel-title"><h3>Ritmo (min/km — menor é melhor)</h3></div><div id="c-pace"></div></section>' : ''}`);
    }
    if (st.reading && (st.reading.pages || st.reading.minutes)) {
      const r = st.reading;
      sections.push(`<h2 class="mt mb">Leitura</h2><div class="grid g4">${kpi('Páginas', fmtNum(r.pages, 0), delta(r.pages, r.prevPages))}${kpi('Tempo de leitura', `${fmtNum(r.minutes, 0)} min`, delta(r.minutes, r.prevMinutes, ' min'))}${kpi('Ritmo', r.pagesPerHour ? `${fmtNum(r.pagesPerHour, 1)} págs/h` : '—')}${kpi('Livros', r.books.length)}</div>
        <section class="panel mt"><div class="table-wrap"><table class="table"><thead><tr><th>Livro</th><th>Páginas</th><th>Tempo</th><th>Sessões</th><th>Período</th></tr></thead><tbody>${r.books.map((b) => `<tr><td><b>${esc(b.book)}</b>${b.author ? ` <span class="muted small">${esc(b.author)}</span>` : ''}</td><td class="mono">${b.pages}</td><td class="mono">${b.minutes} min</td><td>${b.sessions}</td><td class="small">${fmtDate(b.first)} – ${fmtDate(b.last)} (${b.daysSpan} dia(s))</td></tr>`).join('')}</tbody></table></div></section>`);
    }
    if (st.study && st.study.sessions) {
      const sd = st.study;
      sections.push(`<h2 class="mt mb">Estudos</h2><div class="grid g4">${kpi('Tempo', `${fmtNum(sd.minutes / 60, 1)} h`, delta(sd.minutes, sd.prevMinutes, ' min'))}${kpi('Sessões', sd.sessions)}${kpi('Exercícios', sd.exercises)}${kpi('Desempenho médio', sd.avgPerformance === null ? '—' : `${sd.avgPerformance}%`, delta(sd.avgPerformance, sd.prevAvgPerformance, ' p.p.', 1))}</div>
        ${sd.subjects.length ? `<section class="panel mt"><div class="panel-title"><h3>Tempo por assunto</h3></div>${sd.subjects.map((x) => `<div class="attr-evo"><span>${esc(x.subject)}</span><div class="track"><i style="width:${(x.minutes / sd.subjects[0].minutes) * 100}%;background:var(--intelectual)"></i></div><span class="mono small" style="text-align:right">${fmtNum(x.minutes / 60, 1)} h</span></div>`).join('')}</section>` : ''}`);
    }
    if (st.nutrition && st.nutrition.days) {
      const n = st.nutrition;
      sections.push(`<h2 class="mt mb">Alimentação</h2><div class="grid g4">${kpi('Média calórica', n.avgKcal === null ? '—' : `${fmtNum(n.avgKcal, 0)} kcal`)}${kpi('Proteínas/dia', n.avgProtein === null ? '—' : `${fmtNum(n.avgProtein, 0)} g`)}${kpi('Carboidratos/dia', n.avgCarbs === null ? '—' : `${fmtNum(n.avgCarbs, 0)} g`)}${kpi('Gorduras/dia', n.avgFat === null ? '—' : `${fmtNum(n.avgFat, 0)} g`)}</div>
        <p class="small muted">Médias calculadas sobre ${n.days} dia(s) com refeições registradas · ${fmtNum(n.avgMeals, 1)} refeições por dia.</p>`);
    }
    if (st.hydration && s && s.daysWithData) sections.push(`<h2 class="mt mb">Hidratação</h2><div class="grid g4">${kpi('Média diária', `${fmtNum(st.hydration.avgLiters, 2)} L`)}${kpi('Dias com meta atingida', `${s.daysMet}/${s.daysScheduled}`)}${kpi('Percentual de cumprimento', s.daysScheduled ? `${fmtNum((s.daysMet / s.daysScheduled) * 100, 0)}%` : '—')}${kpi('Melhor dia', s.best ? `${fmtNum(s.best.value, 2)}` : '—', s.best ? `<span class="small dim">${fmtDate(s.best.date)}</span>` : '')}</div>${st.hydration.byHour.length ? '<section class="panel mt"><div class="panel-title"><h3>Consumo por horário</h3></div><div id="c-hours"></div></section>' : ''}`);
    if (st.sleep && s && s.daysWithData) sections.push(`<h2 class="mt mb">Sono</h2><div class="grid g4">${kpi('Média de horas', `${fmtNum(st.sleep.avgHours, 2)} h`, delta(st.sleep.avgHours, st.sleep.prevAvgHours, ' h', 2))}${kpi('Qualidade média', st.sleep.avgQuality ? `${fmtNum(st.sleep.avgQuality, 1)}/5` : '—')}${kpi('Horários médios', st.sleep.avgBed ? `<span style="font-size:20px">${st.sleep.avgBed} → ${st.sleep.avgWake || '?'}</span>` : '—')}${kpi('Regularidade', st.sleep.bedStdMin === null ? '—' : `±${st.sleep.bedStdMin} min`, '<span class="small dim">variação do horário de dormir</span>')}</div>`);
    if (st.custom && st.custom.some((c) => c.count)) sections.push(`<h2 class="mt mb">Campos personalizados</h2><div class="grid g4">${st.custom.filter((c) => c.count).map((c) => c.type === 'number' ? kpi(esc(c.label), `${fmtNum(c.total, 1)}${c.unit ? ` <span class="small muted">${esc(c.unit)}</span>` : ''}`, `<span class="small muted">média ${fmtNum(c.avg, 1)} · ${c.count} registro(s)</span>`) : kpi(esc(c.label), `<span style="font-size:14px">${esc(c.recent[0])}</span>`, `<span class="small muted">${c.count} registro(s)</span>`)).join('')}</div>`);
    if (st.sessions && st.sessions.count) sections.push(`<h2 class="mt mb">Sessões</h2><div class="grid g4">${kpi('Sessões', st.sessions.count, delta(st.sessions.count, st.sessions.prevCount))}${kpi('Tempo total', `${fmtNum(st.sessions.minutes, 0)} min`)}${kpi('Quantidade', fmtNum(st.sessions.quantity, 0))}</div>`);
    // histórico
    sections.push(`<section class="panel mt"><div class="panel-title"><h3>Histórico de registros</h3><a class="small" href="#/metas/historico/${g.id}">ver todos →</a></div>
      ${st.history.length ? st.history.slice(0, 15).map((r) => `<div class="rec-item" style="font-size:13px"><span><b>${fmtDate(r.date)}</b>${r.time ? ` ${r.time}` : ''} · ${esc(recordSummary(r.kind, r.data, app))}${r.note ? ` <span class="dim">“${esc(r.note)}”</span>` : ''}</span></div>`).join('') : '<p class="muted small">Nenhum registro no período.</p>'}</section>`);

    box.innerHTML = `<div class="page-head"><div><a href="#/evolucao" class="small">← Evolução</a><h1 class="row gap-s mt-s">${icon(TYPE_ICON[g.type] || 'star', 'attr-icon')} ${esc(g.name)}</h1><p>${esc(g.typeName)} · ${esc(g.targets.text)}${g.status !== 'ativa' ? ` · <b>${g.status}</b>` : ''}</p></div>
      <div class="row wrap"><div class="seg" id="per">${PERIODS.map(([k, l]) => `<button data-p="${k}" class="${k === period ? 'on' : ''}">${l}</button>`).join('')}</div><a class="btn sm" href="#/detalhes/${g.id}">${icon('ai', 'attr-icon')} Analisar com IA</a></div></div>${sections.join('')}`;
    box.querySelectorAll('#per button').forEach((b) => b.addEventListener('click', () => { period = b.dataset.p; sessionStorage.setItem('evo-goal-period', period); load(); }));
    const $ = (s2) => box.querySelector(s2);
    const lf = (d) => fmtDate(d);
    if ($('#c-daily')) chart($('#c-daily'), { labels: st.daily.map((d) => d.date), labelFormat: lf, height: 'sm', series: [{ name: u, color: '#d9ad55', type: 'bar', data: st.daily.map((d) => d.value), colorAt: (v2, i) => (st.daily[i].met === true ? '#57d68d' : st.daily[i].met === false ? '#f2b84b' : '#d9ad55') }], refLine: g.version.period === 'daily' ? g.version.target : null, refLabel: 'meta', emptyText: 'Sem registros.' });
    if ($('#c-weeks')) chart($('#c-weeks'), { labels: st.weeks.map((w) => w.week), labelFormat: lf, tipLabelFormat: (d) => `Semana de ${fmtDate(d)}`, height: 'sm', yMin: 0, yMax: 100, refLine: 95, refLabel: '95%', series: [{ name: '% da meta semanal', color: '#60a5fa', type: 'bar', data: st.weeks.map((w) => (w.pct === null ? null : Math.round(w.pct * 1000) / 10)) }], valueFormat: (v2) => `${fmtNum(v2, 1)}%` });
    if ($('#c-ms')) { const h = st.milestone.history; chart($('#c-ms'), { labels: h.map((x) => x.date), labelFormat: lf, height: 'sm', series: [{ name: 'kg', color: '#f87171', data: h.map((x) => x.value), fill: true }], refLine: st.milestone.target, refLabel: 'alvo', emptyText: 'Nenhum registro ainda.' }); }
    if ($('#c-load')) {
      const draw = () => { const e = st.exercises[Number($('#ex-sel').value)]; chart($('#c-load'), { labels: e.series.map((x) => x.date), labelFormat: lf, height: 'sm', series: [{ name: 'Carga máxima (kg)', color: '#f87171', data: e.series.map((x) => x.maxWeight || null), fill: true }, { name: '1RM estimado (kg)', color: '#d9ad55', data: e.series.map((x) => x.est1rm || null), dashed: true }], emptyText: 'Sem cargas registradas no período.' }); $('#ex-info').innerHTML = `Melhor carga: <b>${fmtNum(e.best)} kg</b>${e.loadChange !== null ? ` · variação no período: <b class="${e.loadChange > 0 ? 'ok' : e.loadChange < 0 ? 'danger' : ''}">${e.loadChange > 0 ? '+' : ''}${fmtNum(e.loadChange)} kg</b>` : ''}`; };
      $('#ex-sel').addEventListener('change', draw); draw();
      chart($('#c-vol'), { labels: st.strength.weeklyVolume.map((w) => w.week), labelFormat: lf, tipLabelFormat: (d) => { const w = st.strength.weeklyVolume.find((x) => x.week === d); return `Semana de ${fmtDate(d)} · ${w ? w.sessions : 0} treino(s)`; }, height: 'sm', series: [{ name: 'Volume', color: '#f87171', type: 'bar', data: st.strength.weeklyVolume.map((w) => w.volume || null) }] });
    }
    if ($('#c-pace')) chart($('#c-pace'), { labels: st.cardio.paces.map((x) => x.date), labelFormat: lf, height: 'sm', series: [{ name: 'min/km', color: '#4ade80', data: st.cardio.paces.map((x) => x.pace) }] });
    if ($('#c-hours')) chart($('#c-hours'), { labels: st.hydration.byHour.map((x) => `${x.hour}h`), height: 'sm', series: [{ name: 'Litros', color: '#38bdf8', type: 'bar', data: st.hydration.byHour.map((x) => x.liters) }] });
  }
  await load();
}
export { fmtDateLong };
