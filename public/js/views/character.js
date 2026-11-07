import { GET, POST, PUT, esc, icon, busy, toast, fmtDate, confirmBox, modal, burst } from '../ui.js';
import { heroStage, drawHeroThumb, drawItemIcon, drawHero, heroPose } from '../sprites.js';

const TABS = [['skins', 'Skins'], ['equip', 'Inventário'], ['aparencia', 'Aparência'], ['missoes', 'Missões'], ['recompensas', 'Recompensas']];
const EQUIP_SLOTS = ['head', 'mask', 'chest', 'legs', 'boots', 'gloves', 'weapon', 'shield', 'cape', 'accessory', 'effect', 'pet', 'title'];
const ANIMS = [['idle', 'Parado'], ['walk', 'Caminhar'], ['attack', 'Ataque'], ['hurt', 'Dano'], ['victory', 'Vitória'], ['defeat', 'Derrota'], ['special', 'Especial'], ['equip', 'Equipar']];
const NULLABLE = ['head', 'mask', 'gloves', 'shield', 'cape', 'accessory', 'effect', 'pet'];
const RARITY_ORDER = ['comum', 'rara', 'epica', 'lendaria', 'mistica', 'secreta'];
const FILTERS = [['todas', 'Todas'], ['possuidas', 'Possuídas'], ['loja', 'À venda'], ['exclusivas', 'Chefes e missões']];

/** Visual completo de uma skin aplicado sobre a aparência atual. */
function lookOf(app, set, base) {
  const byId = Object.fromEntries(app.config.cosmetics.items.map((i) => [i.id, i]));
  const look = { ...(base || app.state.appearance), pet: null };
  if (set.items.length >= 6) for (const sl of ['head', 'mask', 'gloves', 'cape', 'effect', 'shield', 'accessory']) look[sl] = null;
  for (const id of set.items) look[byId[id].slot] = id;
  return look;
}

/** Miniatura animada (anima só enquanto o cursor está sobre o card, para poupar processamento). */
function skinThumb(canvas, look) {
  let raf = 0; let t0 = 0;
  const paint = (t) => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || 200; const h = canvas.clientHeight || 200;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const sc = Math.min(1.35, h / 150); ctx.translate(w / 2 + 10 * sc, h - 22); ctx.scale(sc, sc);
    drawHero(ctx, look, heroPose('idle', 0, t), t, { pet: false });
  };
  requestAnimationFrame(() => paint(1.2));
  const loop = (now) => { paint(1.2 + (now - t0) / 1000); raf = requestAnimationFrame(loop); };
  return { start() { if (!raf) { t0 = performance.now(); raf = requestAnimationFrame(loop); } }, stop() { cancelAnimationFrame(raf); raf = 0; } };
}

export async function render(el, app, params) {
  let [shop, achievements] = await Promise.all([GET('/api/shop'), GET('/api/achievements')]);
  const C = app.config.cosmetics;
  const rar = Object.fromEntries(C.rarities.map((r) => [r.key, r]));
  let tab = TABS.some(([k]) => k === params[0]) ? params[0] : 'skins';
  if (params[0] === 'conquistas') tab = 'missoes';
  let slot = 'head'; let ownedOnly = false; let filter = 'todas';
  let preview = { ...app.state.appearance };
  const ownedCount = () => shop.sets.filter((s) => s.complete).length;
  el.innerHTML = `
    <div class="page-head"><div><h1>Personagem</h1><p><span id="sum"></span> · cosméticos: não alteram XP, atributos nem batalhas.</p></div>
      <span class="level-badge" style="font-size:14px">${icon('coin', 'attr-icon')} <span id="coins">${shop.coins}</span> moedas</span></div>
    <div class="char-layout">
      <div class="col" style="position:sticky;top:12px">
        <div class="char-stage"><canvas id="stage"></canvas></div>
        <div class="seg" style="justify-content:center">${ANIMS.map(([k, l]) => `<button data-anim="${k}" class="${k === 'idle' ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="panel tight small"><div class="row between"><b>${esc(app.state.profile.name)}</b><span class="gold">${esc(app.state.titleName || '')}</span></div>
          <div class="muted mt-s">${C.rarities.map((r) => `<span class="rarity-tag r-${r.key}">${r.name}</span>`).join(' · ')}</div></div>
      </div>
      <div class="panel"><div class="tabs" style="margin-top:-6px">${TABS.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div><div id="content"></div></div>
    </div>`;
  const updateSum = () => { el.querySelector('#sum').textContent = `${ownedCount()} de ${shop.sets.length} skins completas · ${shop.items.filter((i) => i.owned).length} itens`; };
  updateSum();
  const stage = heroStage(el.querySelector('#stage'), () => preview, { scale: 2.1, groundRatio: 0.9 });
  el.querySelectorAll('[data-anim]').forEach((b) => b.addEventListener('click', () => { el.querySelectorAll('[data-anim]').forEach((x) => x.classList.toggle('on', x === b)); stage.play(b.dataset.anim, { loop: ['walk', 'victory', 'defeat'].includes(b.dataset.anim) }); }));
  el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; el.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b)); draw(); }));
  const content = el.querySelector('#content');
  const thumbs = [];
  const stopThumbs = () => { thumbs.forEach((x) => x.stop()); thumbs.length = 0; };

  async function reload() { [shop, achievements] = await Promise.all([GET('/api/shop'), GET('/api/achievements')]); el.querySelector('#coins').textContent = shop.coins; updateSum(); }
  async function equip(patch) {
    const r = await PUT('/api/character', patch);
    app.state.appearance = r.character; preview = { ...r.character };
    stage.play('equip');
    if (r.note) toast(esc(r.note), 'info', 4500);
    await app.refresh({ fx: false });
  }
  async function acquire(item) {
    if (item.owned) return true;
    if (item.price === null) { toast(`<b>${esc(item.name)}</b> — ${esc(item.unlockText || 'evento especial')}.`, 'info', 4500); return false; }
    if (shop.coins < item.price) { toast(`Faltam ${item.price - shop.coins} moedas para ${esc(item.name)}.`, 'info'); return false; }
    if (!(await confirmBox(`Comprar <b>${esc(item.name)}</b> (<span class="rarity-tag r-${item.rarity}">${rar[item.rarity].name}</span>) por ${item.price} moedas?`, { okText: 'Comprar' }))) return false;
    await POST('/api/shop/buy', { item_id: item.id });
    await reload();
    toast(`${esc(item.name)} adquirido!`, 'success');
    return true;
  }

  // ---------- Skins: coleção + loja ----------
  function skinVisible(st) {
    if (filter === 'possuidas') return st.complete;
    if (filter === 'loja') return st.shop && !st.complete;
    if (filter === 'exclusivas') return !st.shop;
    return true;
  }
  function skinCard(st) {
    const secretLocked = st.rarity === 'secreta' && !st.owned;
    const price = st.shop && !st.complete ? `<span class="item-price">${icon('coin', 'attr-icon')} ${st.price}${st.owned ? ` <span class="dim">(faltam ${st.items.length - st.owned} peças)</span>` : ''}</span>` : st.complete ? '<span class="item-price ok">Completa</span>' : '<span class="item-price dim">Não vendida</span>';
    return `<div class="skin-card r-${st.rarity} ${st.complete ? '' : 'locked'} ${secretLocked ? 'hidden-secret' : ''}" data-skin="${st.key}">
      <div class="stage"><canvas></canvas><span class="badge">${rar[st.rarity].name}</span>${st.complete ? `<span class="owned">${icon('check', 'attr-icon')} Sua</span>` : ''}</div>
      <div class="body"><div class="name">${secretLocked ? 'Skin secreta' : esc(st.name)}</div>
        <div class="src">${esc(secretLocked ? (st.sources[0] || 'Origem desconhecida') : st.sources.join(' · '))}</div>
        <div class="progress"><i style="width:${(st.owned / st.items.length) * 100}%"></i></div>
        <div class="meta"><span class="dim">${st.owned}/${st.items.length} peças${st.theme ? ` · ${esc(st.theme)}` : ''}</span>${price}</div></div></div>`;
  }
  function drawSkins() {
    stopThumbs();
    const groups = RARITY_ORDER.map((r) => [r, shop.sets.filter((s) => s.rarity === r && skinVisible(s))]).filter(([, l]) => l.length);
    content.innerHTML = `<div class="row between wrap"><div class="chips">${FILTERS.map(([k, l]) => `<span class="chip ${k === filter ? 'on' : ''}" data-f="${k}">${l}</span>`).join('')}</div>
        <span class="small muted">Skins vêm da loja, de chefes derrotados e de missões.</span></div>
      ${groups.map(([r, list]) => `<div class="rarity-head r-${r}"><h3 class="rarity-tag r-${r}" style="font-size:13px">${rar[r].name}</h3><span class="small dim">${list.filter((s) => s.complete).length}/${list.length}</span><span class="line"></span></div>
        <div class="skin-grid">${list.map(skinCard).join('')}</div>`).join('') || '<p class="muted">Nenhuma skin neste filtro.</p>'}`;
    content.querySelectorAll('[data-f]').forEach((c) => c.addEventListener('click', () => { filter = c.dataset.f; drawSkins(); }));
    content.querySelectorAll('[data-skin]').forEach((card) => {
      const st = shop.sets.find((s) => s.key === card.dataset.skin);
      const look = lookOf(app, st);
      const th = skinThumb(card.querySelector('canvas'), look); thumbs.push(th);
      card.addEventListener('mouseenter', () => { th.start(); if (!(st.rarity === 'secreta' && !st.owned)) preview = look; });
      card.addEventListener('mouseleave', () => { th.stop(); preview = { ...app.state.appearance }; });
      card.addEventListener('click', () => openSkin(st));
    });
  }
  function openSkin(st) {
    const secretLocked = st.rarity === 'secreta' && !st.owned;
    const byId = Object.fromEntries(shop.items.map((i) => [i.id, i]));
    const pieces = st.items.map((id) => byId[id]);
    const canBuy = st.shop && !st.complete;
    const m = modal({
      title: `<span class="rarity-tag r-${st.rarity}" style="font-size:12px">${rar[st.rarity].name}</span> &nbsp;${secretLocked ? 'Skin secreta' : esc(st.name)}`, wide: true,
      body: `<div class="skin-detail r-${st.rarity}"><div><div class="big"><canvas id="sk-stage"></canvas></div>
          <div class="seg mt-s" style="justify-content:center">${ANIMS.slice(0, 7).map(([k, l]) => `<button data-a="${k}">${l}</button>`).join('')}</div></div>
        <div class="col gap"><p class="muted" style="margin:0">${secretLocked ? 'Os detalhes desta skin só são revelados quando ela é obtida.' : esc(st.desc)}</p>
          <div><h4 class="mb-s">Como obter</h4><div class="chips">${st.sources.map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div></div>
          ${secretLocked ? '' : `<div><h4 class="mb-s">Peças (${st.owned}/${st.items.length})</h4><div class="items">${pieces.map((i) => `<div class="item r-${i.rarity} ${i.owned ? '' : 'locked'}" data-piece="${i.id}"><canvas></canvas><div class="item-name">${esc(i.name)}</div><span class="small dim">${esc(C.slots[i.slot])}</span>${i.owned ? '<span class="item-price ok">Possuída</span>' : i.price ? `<span class="item-price">${icon('coin', 'attr-icon')} ${i.price}</span>` : ''}</div>`).join('')}</div></div>`}
        </div></div>`,
      foot: `${canBuy ? `<span class="small muted" style="margin-right:auto">Preço da skin completa: ${st.fullPrice} · você paga só as peças que faltam, com ${Math.round((1 - 0.8) * 100)}% de desconto.</span>` : ''}
        ${st.owned ? '<button class="btn" id="sk-equip">Equipar skin</button>' : ''}
        ${canBuy ? `<button class="btn primary" id="sk-buy" ${shop.coins < st.price ? 'disabled' : ''}>${icon('coin', 'attr-icon')} Comprar por ${st.price}</button>` : ''}`,
      onClose: () => s2.stop(),
    });
    const look = lookOf(app, st);
    const s2 = heroStage(m.$('#sk-stage'), () => look, { scale: 2.0, groundRatio: 0.88 });
    if (secretLocked) m.$('#sk-stage').style.filter = 'brightness(0) drop-shadow(0 0 8px rgba(255,95,210,.7))';
    m.$$('[data-a]').forEach((b) => b.addEventListener('click', () => s2.play(b.dataset.a, { loop: ['walk', 'victory', 'defeat'].includes(b.dataset.a) })));
    setTimeout(() => s2.play('special'), 350);
    m.$$('[data-piece]').forEach((c) => {
      const it = byId[c.dataset.piece]; const cv = c.querySelector('canvas');
      requestAnimationFrame(() => { if (['weapon', 'shield', 'pet', 'effect'].includes(it.slot)) drawItemIcon(cv, it, 1.2); else drawHeroThumb(cv, { ...app.state.appearance, [it.slot]: it.id, pet: null }, { focus: ['head', 'mask'].includes(it.slot) ? 'head' : 'full' }); });
    });
    m.$('#sk-buy')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
      if (!(await confirmBox(`Comprar a skin <b>${esc(st.name)}</b> por ${st.price} moedas?`, { okText: 'Comprar' }))) return;
      await POST('/api/shop/buy-set', { set: st.key });
      await reload(); m.close();
      burst(innerWidth / 2, innerHeight / 3, 60, [rar[st.rarity].color, '#fff', '#f1cf85']);
      toast(`<b>${esc(st.name)}</b> agora é sua!`, 'success');
      const r = await POST('/api/character/set', { set: st.key }); app.state.appearance = r.character; preview = { ...r.character }; stage.play('special');
      await app.refresh({ fx: true }); draw();
    }));
    m.$('#sk-equip')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const r = await POST('/api/character/set', { set: st.key });
      app.state.appearance = r.character; preview = { ...r.character }; stage.play('special'); m.close();
      toast(`${r.equipped} de ${r.total} peças equipadas.${r.note ? ` ${esc(r.note)}` : ''}`, 'success');
      await app.refresh({ fx: false });
    }));
  }

  // ---------- Inventário por espaço ----------
  function itemCard(i) {
    const eq = app.state.appearance[i.slot] === i.id;
    const status = i.owned ? (eq ? '<span class="item-price ok">Equipado</span>' : '<span class="item-price muted">Possuído</span>')
      : i.price === null ? `<span class="item-price dim">${icon('trophy', 'attr-icon')} ${esc(i.unlockText || 'Evento')}</span>` : `<span class="item-price">${icon('coin', 'attr-icon')} ${i.price}</span>`;
    return `<div class="item r-${i.rarity} ${eq ? 'equipped' : ''} ${i.owned ? '' : 'locked'}" data-item="${i.id}" title="${esc(i.name)}">${i.owned ? '' : `<span class="lock">${i.price === null ? icon('trophy', 'attr-icon') : ''}</span>`}
      ${i.slot === 'title' ? `<div class="title-plaque r-${i.rarity}">${esc(i.name)}</div>` : '<canvas></canvas>'}
      <div class="item-name">${esc(i.name)}</div><span class="rarity-tag r-${i.rarity}">${rar[i.rarity].name}</span>${status}</div>`;
  }
  function bindItems(items) {
    content.querySelectorAll('[data-item]').forEach((card) => {
      const it = items.find((x) => x.id === card.dataset.item);
      const cv = card.querySelector('canvas');
      if (cv) requestAnimationFrame(() => { if (['weapon', 'shield', 'pet', 'effect'].includes(it.slot)) drawItemIcon(cv, it, 1.2); else drawHeroThumb(cv, { ...app.state.appearance, [it.slot]: it.id, pet: null }, { focus: ['head', 'mask'].includes(it.slot) ? 'head' : 'full' }); });
      card.addEventListener('mouseenter', () => { if (it.slot !== 'title') preview = { ...app.state.appearance, [it.slot]: it.id }; });
      card.addEventListener('mouseleave', () => { preview = { ...app.state.appearance }; });
      card.addEventListener('click', () => busy(null, async () => {
        const eq = app.state.appearance[it.slot] === it.id;
        if (eq && NULLABLE.includes(it.slot)) { await equip({ [it.slot]: null }); drawEquip(); return; }
        if (eq) return;
        if (await acquire(it)) { await equip({ [it.slot]: it.id }); drawEquip(); }
      }));
    });
  }
  function drawEquip() {
    stopThumbs();
    const items = shop.items.filter((i) => i.slot === slot && (!ownedOnly || i.owned)).sort((a, b) => (b.owned - a.owned) || (a.rarityTier - b.rarityTier));
    content.innerHTML = `<div class="row between wrap mb"><div class="chips">${EQUIP_SLOTS.map((s) => `<span class="chip ${s === slot ? 'on' : ''}" data-slot="${s}">${C.slots[s]}</span>`).join('')}</div>
      <label class="check small"><input type="checkbox" id="own" ${ownedOnly ? 'checked' : ''}> Somente possuídos</label></div>
      ${NULLABLE.includes(slot) && app.state.appearance[slot] ? `<button class="btn xs ghost mb" id="unequip">Remover: ${esc(C.slots[slot])}</button>` : ''}
      <div class="items">${items.map(itemCard).join('') || '<p class="muted">Nenhum item.</p>'}</div>
      <p class="small dim mt">Armas de duas mãos (montantes, cajados, arcos, lanças longas) não combinam com escudo: o sistema ajusta automaticamente.</p>`;
    content.querySelectorAll('[data-slot]').forEach((c) => c.addEventListener('click', () => { slot = c.dataset.slot; drawEquip(); }));
    content.querySelector('#own').addEventListener('change', (e) => { ownedOnly = e.target.checked; drawEquip(); });
    content.querySelector('#unequip')?.addEventListener('click', () => busy(null, async () => { await equip({ [slot]: null }); drawEquip(); }));
    bindItems(items);
  }

  // ---------- Aparência ----------
  function drawAppearance() {
    stopThumbs();
    const a = C.appearance; const cur = app.state.appearance;
    const opts = (field, map) => `<div class="opt-grid">${Object.entries(map).map(([k, l]) => `<span class="chip ${cur[field] === k ? 'on' : ''}" data-f="${field}" data-v="${k}">${l}</span>`).join('')}</div>`;
    const sw = (field, list) => `<div class="swatches">${list.map((c) => `<span class="swatch ${cur[field] === c ? 'on' : ''}" data-f="${field}" data-v="${c}" style="background:${c}"></span>`).join('')}</div>`;
    content.innerHTML = `<div class="col gap-l">
      <div><h4 class="mb">Corpo</h4>${opts('body', a.bodies)}</div>
      <div><h4 class="mb">Tom de pele</h4>${sw('skin', a.skins)}</div>
      <div><h4 class="mb">Rosto</h4>${opts('face', a.faces)}</div>
      <div class="grid g2"><div><h4 class="mb">Olhos</h4>${opts('eyes', a.eyes)}</div><div><h4 class="mb">Cor dos olhos</h4>${sw('eyeColor', a.eyeColors)}</div></div>
      <div><h4 class="mb">Cabelo</h4>${opts('hair', a.hair)}</div>
      <div><h4 class="mb">Cor do cabelo</h4>${sw('hairColor', a.hairColors)}</div>
      <div><h4 class="mb">Barba</h4>${opts('beard', a.beards)}</div></div>`;
    content.querySelectorAll('[data-f]').forEach((c) => {
      c.addEventListener('mouseenter', () => { preview = { ...app.state.appearance, [c.dataset.f]: c.dataset.v }; });
      c.addEventListener('mouseleave', () => { preview = { ...app.state.appearance }; });
      c.addEventListener('click', () => busy(null, async () => { const r = await PUT('/api/character', { [c.dataset.f]: c.dataset.v }); app.state.appearance = r.character; preview = { ...r.character }; drawAppearance(); }));
    });
  }

  // ---------- Missões e conquistas ----------
  function drawMissions() {
    stopThumbs();
    const sorted = achievements.slice().sort((a, b) => (a.unlocked - b.unlocked) || (b.progress / b.target - a.progress / a.target));
    const missions = sorted.filter((a) => a.mission || a.event || a.skin);
    const others = sorted.filter((a) => !(a.mission || a.event || a.skin));
    const row = (a) => {
      const pct = Math.min(100, (a.progress / a.target) * 100);
      const rw = [`+${a.coins} moedas`, a.skinName && `Skin <span class="rarity-tag r-${a.skinRarity}">${esc(a.skinRarity === 'secreta' && !a.unlocked ? 'secreta' : a.skinName)}</span>`, a.itemName && esc(a.itemName), a.titleName && `Título “${esc(a.titleName)}”`].filter(Boolean);
      return `<div class="mission ${a.unlocked ? 'done' : ''}"><div class="medal">${icon(a.unlocked ? 'trophy' : a.skin ? 'sparkle' : 'star')}</div>
        <div><b>${esc(a.name)}</b>${a.event ? ' <span class="tag danger">desafio</span>' : ''}<div class="small muted">${esc(a.desc)}</div>
          <div class="row gap-s mt-s" style="align-items:center"><div class="bar" style="flex:1"><i style="width:${pct}%"></i></div><span class="tiny mono">${a.progress}/${a.target}</span></div></div>
        <div class="reward">${rw.join('<br>')}${a.unlocked ? `<br><span class="ok">${fmtDate(a.unlocked_at)}</span>` : ''}</div></div>`;
    };
    content.innerHTML = `<p class="small muted" style="margin-top:0">Missões medem sua constância nas metas que <b>você</b> escolheu — nenhuma exige uma atividade específica. ${achievements.filter((a) => a.unlocked).length}/${achievements.length} concluídas.</p>
      <h3 class="mb">Missões com recompensas especiais</h3><div class="col gap-s">${missions.map(row).join('')}</div>
      <h3 class="mt-l mb">Conquistas</h3><div class="col gap-s">${others.map(row).join('')}</div>`;
  }

  // ---------- Recompensas: probabilidades e histórico ----------
  async function drawRewards() {
    stopThumbs();
    const drops = await GET('/api/drops');
    const L = C.loot;
    const oddsRow = (tb) => `<div class="odds">${RARITY_ORDER.map((r) => `<div class="r-${r}"><span class="rarity-tag r-${r}">${rar[r].name}</span><b>${(tb.rarities[r] * tb.chance / 100).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}%</b><span class="tiny dim">${tb.rarities[r].toLocaleString('pt-BR')}% das skins</span></div>`).join('')}</div>`;
    const archName = (k) => C.archetypes[k] || k;
    const excl = shop.sets.filter((s) => s.boss && s.boss !== 'any');
    content.innerHTML = `<p class="small muted" style="margin-top:0">O sorteio acontece <b>no servidor</b>, uma única vez por chefe vencido, e fica registrado. Derrotas não dão recompensa.</p>
      <h3 class="mb">Boss 1 e Boss 2 — chance de skin: ${String(L.boss.chance).replace('.', ',')}%</h3>${oddsRow(L.boss)}
      <h3 class="mt mb">Boss Final — chance de skin: ${String(L.final.chance).replace('.', ',')}%</h3>${oddsRow(L.final)}
      <p class="small dim">Percentuais = chance por vitória. Se você já tiver todas as skins da raridade sorteada, o sistema procura em raridades menores; se não houver nenhuma, a vitória vira moedas.</p>
      <h3 class="mt mb">Skins exclusivas de chefes</h3>
      <div class="chips">${excl.map((s) => `<span class="tag">${esc(archName(s.boss))}: <span class="rarity-tag r-${s.rarity}">${s.rarity === 'secreta' && !s.complete ? 'secreta' : esc(s.name)}</span></span>`).join('')}</div>
      <p class="small dim">Quando o chefe tem uma exclusiva na raridade sorteada, ela tem ${L.exclusiveShare}% de chance de ser a escolhida.</p>
      <h3 class="mt mb">Histórico de recompensas</h3>
      ${drops.length ? `<div class="table-wrap"><table class="table"><tbody>${drops.map((d) => `<tr><td class="small">${fmtDate(d.week_start)}</td><td class="small">${d.which === 'final' ? 'Boss Final' : d.which === 'b1' ? 'Boss 1' : 'Boss 2'}</td>
        <td>${d.skin ? `<span class="rarity-tag r-${d.skin.rarity}">${rar[d.skin.rarity].name}</span> ${esc(d.skin.name)}` : d.coins ? `${icon('coin', 'attr-icon')} ${d.coins} moedas (compensação)` : '<span class="dim">Sem skin desta vez</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Nenhum chefe derrotado ainda.</p>'}`;
  }

  function draw() {
    if (tab === 'skins') return drawSkins();
    if (tab === 'equip') return drawEquip();
    if (tab === 'aparencia') return drawAppearance();
    if (tab === 'missoes') return drawMissions();
    return drawRewards();
  }
  draw();
  return () => { stage.stop(); stopThumbs(); };
}
