import { GET, PUT, POST, DEL, esc, icon, busy, toast, fmtDate, WEEKDAYS, ATTR, emptyState } from '../ui.js';

const SOURCE = { goal: 'Meta', perfect_day: 'Dia perfeito', penalty: 'Penalidade', sleep_regularity: 'Sono regular', boss: 'Chefe', pr: 'Recorde', achievement: 'Conquista', shop: 'Loja', day: 'Compromissos', goal_week: 'Meta semanal', milestone: 'Marco alcançado', record: 'Registro' };

export async function render(el, app) {
  const [events, coins, rest] = await Promise.all([GET('/api/xp-events?limit=60'), GET('/api/coin-events'), GET('/api/rest-days')]);
  const p = app.state.profile;
  const restSel = (p.rest_weekdays.next ? p.rest_weekdays.next.weekdays : p.rest_weekdays.current);
  const cfg = app.config;
  el.innerHTML = `
    <div class="page-head"><div><h1>Perfil e configurações</h1><p>Membro desde ${fmtDate(p.created_at.slice(0, 10), { day: '2-digit', month: 'long', year: 'numeric' })}</p></div></div>
    <div class="grid g2">
      <section class="panel"><div class="panel-title"><h3>${icon('user', 'attr-icon')} Perfil</h3></div>
        <form class="col" id="pf">
          <label class="field">Nome<input type="text" name="name" maxlength="40" value="${esc(p.name)}" required></label>
          <label class="field">Fuso horário <span class="hint">(define quando o dia vira)</span><input type="text" name="timezone" value="${esc(p.timezone)}"></label>
          <div class="field"><span>Dias de descanso semanais fixos (máx. 2)</span><div class="chips" id="rw">${WEEKDAYS.map((d, i) => `<span class="chip ${restSel.includes(i) ? 'on' : ''}" data-d="${i}">${d}</span>`).join('')}</div>
            <span class="hint">Nesses dias não há compromissos, penalidades nem quebra de ofensiva, e as metas diárias da semana são reduzidas. Mudanças valem a partir do próximo ciclo (ou hoje, se for segunda-feira).</span>
            ${p.rest_weekdays.next ? `<span class="hint warn">Alteração agendada para ${fmtDate(p.rest_weekdays.next.from)}.</span>` : ''}</div>
          <button class="btn primary">Salvar</button>
        </form></section>
      <section class="panel"><div class="panel-title"><h3>${icon('ai', 'attr-icon')} Inteligência artificial</h3></div>
        ${cfg.ai ? `<div class="banner ok small">${icon('check', 'attr-icon')}<div>Integração com a OpenAI ativa (modelo <span class="kbd">${esc(cfg.model)}</span>). A chave fica apenas no servidor.</div></div>`
    : `<div class="banner warn small">${icon('info', 'attr-icon')}<div>IA desativada. Para ativar, crie o arquivo <span class="kbd">.env</span> na pasta do projeto com <span class="kbd">OPENAI_API_KEY=sua-chave</span> e reinicie o servidor.</div></div>`}
        <p class="small muted">A IA avalia metas e analisa batalhas, mas nunca altera XP ou atributos diretamente: o servidor valida e aplica as regras, e você aprova cada meta.</p>
        <div class="panel-title mt"><h3>${icon('download', 'attr-icon')} Seus dados</h3></div>
        <p class="small muted">Tudo fica no banco SQLite local do servidor. Exporte uma cópia completa em JSON quando quiser.</p>
        <button class="btn" id="export">${icon('download', 'attr-icon')} Exportar dados (JSON)</button></section>
    </div>
    ${app.user ? `<section class="panel mt"><div class="panel-title"><h3>${icon('shield', 'attr-icon')} Conta</h3><button class="btn sm ghost" id="logout2">Sair da conta</button></div>
      <div class="grid g2"><div class="small"><div class="muted">E-mail</div><b>${esc(app.user.email)}</b><div class="muted mt-s">Conta criada em</div><b>${fmtDate(app.user.created_at.slice(0, 10), { day: '2-digit', month: 'long', year: 'numeric' })}</b>
        <p class="tiny dim">Seus dados ficam em um banco exclusivo da sua conta. Ao trocar a senha, as outras sessões abertas são encerradas.</p></div>
      <form class="col" id="pwf"><label class="field">Senha atual<input type="password" name="current" autocomplete="current-password" required></label>
        <label class="field">Nova senha<input type="password" name="next" autocomplete="new-password" required placeholder="Mínimo de 8 caracteres, com letras e números"></label>
        <label class="field">Confirmar nova senha<input type="password" name="confirm" autocomplete="new-password" required></label>
        <button class="btn">Alterar senha</button></form></div></section>` : ''}
    <section class="panel mt"><div class="panel-title"><h3>${icon('rest', 'attr-icon')} Dias de descanso e exceções programadas</h3><span class="small muted">Adicione pela aba Atividades → Registro diário</span></div>
      ${rest.length ? `<div class="chips">${rest.map((r) => `<span class="tag info">${fmtDate(r.date)}${r.reason ? ` — ${esc(r.reason)}` : ''} <button class="icon-btn" data-rm="${r.date}" style="padding:0">${icon('x', 'attr-icon')}</button></span>`).join('')}</div>` : '<p class="muted small">Nenhum dia de descanso avulso.</p>'}</section>
    <div class="grid g2 mt">
      <section class="panel"><div class="panel-title"><h3>Histórico de XP</h3><span class="small muted">últimos 60 lançamentos</span></div>
        ${events.length ? `<div class="table-wrap" style="max-height:420px;overflow:auto"><table class="table"><tbody>${events.map((e) => `<tr><td class="small">${fmtDate(e.day)}</td><td><span class="dot" style="--c:${ATTR[e.attribute].color}"></span> ${ATTR[e.attribute].name}</td><td class="small">${esc(e.reason || SOURCE[e.source] || e.source)}${e.multiplier > 1 ? ` <span class="tag gold">${e.multiplier.toFixed(2)}x</span>` : ''}</td><td class="mono ${e.amount > 0 ? 'gold' : 'danger'}" style="text-align:right">${e.amount > 0 ? '+' : ''}${e.amount}</td></tr>`).join('')}</tbody></table></div>` : emptyState('Nenhum XP ainda', 'Registre o progresso das suas metas para começar.')}</section>
      <section class="panel"><div class="panel-title"><h3>Moedas</h3><span class="small muted">saldo: <b class="gold">${app.state.coins}</b></span></div>
        ${coins.length ? `<div class="table-wrap" style="max-height:420px;overflow:auto"><table class="table"><tbody>${coins.map((c) => `<tr><td class="small">${fmtDate(c.day)}</td><td class="small">${esc(c.reason || SOURCE[c.source])}</td><td class="mono ${c.amount > 0 ? 'gold' : 'danger'}" style="text-align:right">${c.amount > 0 ? '+' : ''}${c.amount}</td></tr>`).join('')}</tbody></table></div>` : emptyState('Nenhuma moeda ainda', '')}</section>
    </div>
    <section class="panel mt"><div class="panel-title"><h3>${icon('info', 'attr-icon')} Como a progressão funciona</h3></div>
      <div class="grid g3 small">
        <div><h4 class="mb">Regras do sistema</h4><ul class="clean muted">
          <li>Você escolhe a meta (tipo, quantidade, frequência). O sistema define atributos, XP e penalidades de cada tipo.</li>
          <li>Cada meta tem um XP semanal; você recebe a parte proporcional ao progresso de cada dia. Superar a meta rende até +20%.</li>
          <li>Metas muito fáceis ou muito difíceis têm o XP ajustado (fator 0,6× a 1,4×).</li>
          <li>XP para o próximo nível = 80 × nível<sup>1,4</sup>; Disciplina exige 60% mais.</li></ul></div>
        <div><h4 class="mb">Ofensiva</h4><ul class="clean muted">
          ${cfg.streakTable.slice().reverse().map((r) => `<li>${r.days === 0 ? '0–2 dias' : `${r.days}+ dias`}: <b class="gold">${r.mult.toFixed(2)}x</b></li>`).join('')}
          <li>Dia perfeito (todos os compromissos): +6 Disciplina.</li></ul></div>
        <div><h4 class="mb">Chefes e penalidades</h4><ul class="clean muted">
          <li>Boss 1 e 2: metas escolhidas até a segunda-feira; dano = % da meta.</li>
          <li>Boss Final: média aritmética simples de todas as metas válidas ≥ 95%.</li>
          <li>Penalidade só por descumprimento registrado (ou dia encerrado com menos de 50%). Sem registro não é falha, mas conta 0% no chefe.</li>
          <li>Nenhum atributo fica negativo.</li></ul></div>
      </div></section>`;

  el.querySelectorAll('#rw .chip').forEach((c) => c.addEventListener('click', () => c.classList.toggle('on')));
  el.querySelector('#pf').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    busy(e.target.querySelector('button'), async () => {
      const r = await PUT('/api/profile', { name: f.get('name'), timezone: f.get('timezone'), rest_weekdays: [...el.querySelectorAll('#rw .chip.on')].map((c) => Number(c.dataset.d)) });
      await app.refresh({ fx: false });
      toast(r.restEffective && r.restEffective > app.state.today.today ? `Perfil atualizado. Os dias de descanso mudam em ${fmtDate(r.restEffective)}.` : 'Perfil atualizado.', 'success', 4500);
      app.rerender();
    });
  });
  el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => busy(null, async () => { await DEL(`/api/rest-days/${b.dataset.rm}`); await app.refresh({ fx: false }); app.rerender(); })));
  el.querySelector('#logout2')?.addEventListener('click', () => app.logout());
  el.querySelector('#pwf')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    if (f.next !== f.confirm) { toast('As senhas novas não conferem.', 'error'); return; }
    busy(e.target.querySelector('button'), async () => { await POST('/api/auth/password', { current: f.current, next: f.next }); e.target.reset(); toast('Senha alterada. Outras sessões foram encerradas.', 'success'); });
  });
  el.querySelector('#export').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const data = await GET('/api/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `evolve-rpg-${app.state.today.today}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }));
}
