import { GET, POST, DEL, esc, icon, busy, toast, fmtDate, emptyState, confirmBox } from '../ui.js';
import { TYPE_ICON } from '../goalform.js';

const QUESTIONS = {
  forca: ['Quanto evoluí no supino nos últimos 30 dias?', 'Qual exercício teve maior progressão?', 'Minha frequência de treino está aumentando?', 'Qual foi meu maior volume semanal?', 'Em quais exercícios estou estagnado?', 'Compare meu desempenho atual com o mês anterior.'],
  leitura: ['Quantas páginas li neste mês?', 'Minha média diária está aumentando?', 'Quanto tempo levei para ler cada livro?', 'Estou mantendo consistência?'],
  refeicao: ['Qual foi minha média calórica nos últimos 30 dias?', 'Em quantos dias alcancei minha meta?', 'Minha alimentação está mais consistente?'],
  hidratacao: ['Qual foi minha média de consumo?', 'Quantos dias alcancei minha meta?', 'Como está minha evolução?'],
  cardio: ['Meu ritmo está melhorando?', 'Qual foi minha maior distância?', 'Estou treinando com mais frequência?'],
  estudo: ['Quanto tempo estudei por assunto?', 'Meu desempenho está melhorando?', 'Estou estudando com regularidade?'],
  sono: ['Qual minha média de sono?', 'Meus horários estão regulares?', 'Em quantos dias atingi a meta?'],
  default: ['Como está meu desempenho nesta meta?', 'Compare as últimas semanas.', 'Estou mantendo consistência?', 'O que posso ajustar com base nos meus registros?'],
};

/** Formatação leve das respostas: negrito, listas e etiquetas de origem dos dados. */
function fmtAnswer(text) {
  let h = esc(text);
  h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  h = h.replace(/\[(registrado|calculado|estimativa|recomendação|recomendacao)\]/gi, (_, k) => {
    const key = k.toLowerCase().startsWith('recomend') ? 'recomendacao' : k.toLowerCase();
    const cls = { registrado: 'registrado', calculado: 'calculado', estimativa: 'estimativa', recomendacao: 'calculado' }[key];
    return `<span class="origin ${cls}">${key === 'recomendacao' ? 'recomendação' : key}</span>`;
  });
  return h;
}

export async function render(el, app, params) {
  const goals = await GET('/api/goals?all=1');
  const id = params[0] ? Number(params[0]) : null;
  if (!id) {
    el.innerHTML = `<div class="page-head"><div><h1>Detalhes</h1><p>Escolha uma meta para conversar com a IA sobre seus registros reais e gerar relatórios.</p></div></div>
      ${!app.config.ai ? `<div class="banner warn small">${icon('info', 'attr-icon')}<div>O chat com IA está desativado (defina <span class="kbd">OPENAI_API_KEY</span> no servidor). Os relatórios estatísticos continuam disponíveis.</div></div>` : ''}
      ${goals.length ? `<div class="grid g3">${goals.map((g) => `<a class="panel tight goal-tile" href="#/detalhes/${g.id}" style="text-decoration:none;color:inherit">
        <div class="row gap-s"><span class="act-icon">${icon(TYPE_ICON[g.type] || 'star')}</span><div><b>${esc(g.name)}</b><div class="small muted">${esc(g.typeName)} · ${esc(g.targets.text)}</div></div></div></a>`).join('')}</div>`
    : emptyState('Nenhuma meta para analisar', 'Crie metas e faça registros para conversar com a IA sobre elas.')}`;
    return;
  }
  const g = goals.find((x) => x.id === id);
  if (!g) { el.innerHTML = emptyState('Meta não encontrada', ''); return; }
  const qs = QUESTIONS[g.kind] || QUESTIONS.default;
  el.innerHTML = `<div class="page-head"><div><a href="#/detalhes" class="small">← Todas as metas</a><h1 class="row gap-s mt-s">${icon(TYPE_ICON[g.type] || 'star', 'attr-icon')} ${esc(g.name)}</h1><p>${esc(g.typeName)} · ${esc(g.targets.text)}</p></div>
      <div class="row"><select id="rep-per" style="width:auto"><option value="7">7 dias</option><option value="30" selected>30 dias</option><option value="90">90 dias</option><option value="all">Todo o período</option></select><button class="btn primary" id="rep">${icon('list', 'attr-icon')} Gerar relatório</button></div></div>
    <div class="chat">
      <div class="chat-list"><button class="btn sm" id="new-conv" style="text-align:center">${icon('plus', 'attr-icon')} Nova conversa</button><div id="convs" class="chat-list"></div></div>
      <div class="chat-box"><div class="chat-msgs" id="msgs"></div>
        <div class="chips" style="padding:0 12px 8px" id="qs">${qs.map((q) => `<span class="chip" data-q="${esc(q)}">${esc(q)}</span>`).join('')}</div>
        <form class="chat-input" id="send"><textarea placeholder="${app.config.ai ? 'Pergunte algo sobre esta meta…' : 'Chat indisponível sem OPENAI_API_KEY'}" maxlength="1500" ${app.config.ai ? '' : 'disabled'}></textarea><button class="btn primary" ${app.config.ai ? '' : 'disabled'}>${icon('play', 'attr-icon')}</button></form></div>
    </div>
    <div id="report" class="mt"></div><div id="old-reports" class="mt"></div>`;
  let conv = null;
  const msgsEl = el.querySelector('#msgs');
  const drawMsgs = (messages) => {
    msgsEl.innerHTML = messages.length ? messages.map((m) => `<div class="msg ${m.role}"><div class="tagline">${m.role === 'user' ? 'Você' : 'IA · baseada nos seus registros'}</div>${m.role === 'assistant' ? fmtAnswer(m.content) : esc(m.content)}</div>`).join('')
      : `<div class="empty"><b>Converse sobre “${esc(g.name)}”</b>A IA recebe apenas os registros e estatísticas desta meta e indica o que é <span class="origin registrado">registrado</span>, <span class="origin calculado">calculado</span> ou <span class="origin estimativa">estimativa</span>.</div>`;
    msgsEl.scrollTop = msgsEl.scrollHeight;
  };
  async function loadConvs(selectId) {
    const list = await GET(`/api/goals/${id}/conversations`);
    el.querySelector('#convs').innerHTML = list.map((c) => `<button data-c="${c.id}" class="${c.id === (selectId || conv?.id) ? 'on' : ''}">${esc(c.title)}<div class="tiny dim">${c.messages} mensagens · ${fmtDate(c.updated_at.slice(0, 10))}</div></button>`).join('') || '<p class="small muted">Nenhuma conversa ainda.</p>';
    el.querySelectorAll('[data-c]').forEach((b) => {
      b.addEventListener('click', () => openConv(Number(b.dataset.c)));
      b.addEventListener('contextmenu', async (e) => { e.preventDefault(); if (await confirmBox('Excluir esta conversa?', { danger: true, okText: 'Excluir' })) { await DEL(`/api/conversations/${b.dataset.c}`); conv = null; drawMsgs([]); loadConvs(); } });
    });
    return list;
  }
  async function openConv(cid) {
    conv = await GET(`/api/conversations/${cid}`);
    drawMsgs(conv.messages);
    el.querySelectorAll('[data-c]').forEach((b) => b.classList.toggle('on', Number(b.dataset.c) === cid));
  }
  async function ensureConv() { if (!conv) { conv = await POST(`/api/goals/${id}/conversations`); conv.messages = []; await loadConvs(conv.id); } return conv; }
  async function ask(text) {
    if (!text.trim()) return;
    const c = await ensureConv();
    drawMsgs([...(c.messages || []), { role: 'user', content: text }, { role: 'assistant', content: 'Analisando seus registros…' }]);
    try {
      const r = await POST(`/api/conversations/${c.id}/messages`, { content: text });
      conv.messages = r.messages; drawMsgs(r.messages); loadConvs(c.id);
    } catch (e) { toast(esc(e.message), 'error', 6000); drawMsgs(c.messages || []); }
  }
  el.querySelector('#send').addEventListener('submit', (e) => { e.preventDefault(); const ta = e.target.querySelector('textarea'); const v = ta.value; ta.value = ''; busy(e.target.querySelector('button'), () => ask(v)); });
  el.querySelector('#send textarea').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.querySelector('#send').requestSubmit(); } });
  el.querySelectorAll('[data-q]').forEach((c) => c.addEventListener('click', () => { if (!app.config.ai) { toast('Chat indisponível sem OPENAI_API_KEY.', 'info'); return; } ask(c.dataset.q); }));
  el.querySelector('#new-conv').addEventListener('click', async () => { conv = await POST(`/api/goals/${id}/conversations`); conv.messages = []; drawMsgs([]); loadConvs(conv.id); });
  el.querySelector('#rep').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const r = await POST(`/api/goals/${id}/reports`, { period: el.querySelector('#rep-per').value });
    el.querySelector('#report').innerHTML = reportHtml(r.computed, r.ai, r.period);
    el.querySelector('#report').scrollIntoView({ behavior: 'smooth' });
    loadOld();
  }));
  async function loadOld() {
    const list = await GET(`/api/goals/${id}/reports`);
    el.querySelector('#old-reports').innerHTML = list.length > 1 ? `<details class="panel tight"><summary class="muted" style="cursor:pointer">Relatórios anteriores (${list.length - 1})</summary>${list.slice(1).map((r) => `<div class="mt">${reportHtml(r.stats, r.ai, r.period_days || 'all', r.created_at)}</div>`).join('')}</details>` : '';
  }
  const list = await loadConvs();
  if (list.length) await openConv(list[0].id); else drawMsgs([]);
  loadOld().then(async () => { const l = await GET(`/api/goals/${id}/reports`); if (l[0]) el.querySelector('#report').innerHTML = reportHtml(l[0].stats, l[0].ai, l[0].period_days || 'all', l[0].created_at); });
}

function reportHtml(c, a, period, when) {
  const ul = (arr) => (arr && arr.length ? `<ul class="clean small">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="small dim">—</p>');
  const block = (r, title, badge) => `<div class="panel tight" ${badge ? 'style="border-color:rgba(106,167,255,.35)"' : ''}>
    <div class="row between mb"><h3>${title}</h3>${badge || ''}</div>
    <p style="margin-top:0">${esc(r.resumo)}</p>
    <div class="eval-grid">${r.estatisticas.map((e) => `<div class="eval-item"><b>${esc(e.rotulo)} <span class="origin ${e.origem}">${e.origem}</span></b>${esc(e.valor)}</div>`).join('')}</div>
    <h4 class="mt">Comparação com o período anterior</h4><p class="small">${esc(r.comparacao)}</p>
    <div class="grid g2"><div><h4>Pontos positivos</h4>${ul(r.pontos_positivos)}</div><div><h4>Pontos de atenção</h4>${ul(r.pontos_atencao)}</div>
      <div><h4>Tendências</h4>${ul(r.tendencias)}</div><div><h4>Recomendações</h4>${ul(r.recomendacoes)}</div></div>
    ${r.limitacoes?.length ? `<h4 class="mt">Limitações dos dados</h4>${ul(r.limitacoes)}` : ''}</div>`;
  return `<h2 class="mb">Relatório ${period === 'all' || period === 0 ? 'de todo o período' : `dos últimos ${period} dias`}${when ? ` <span class="small muted">· ${fmtDate(when.slice(0, 10))}</span>` : ''}</h2>
    <div class="grid ${a ? 'g2' : ''}">${block(c, 'Estatísticas calculadas', '<span class="tag">sem IA · cálculo do servidor</span>')}${a ? block(a, 'Análise da IA', '<span class="tag info">IA · dados reais</span>') : ''}</div>`;
}
