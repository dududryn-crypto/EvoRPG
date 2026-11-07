// Personagem 2D em camadas (Canvas). Cada item do catálogo indica um "desenhista" (d.t) e uma paleta;
// novos itens reutilizam desenhistas existentes, e novos desenhistas podem ser registrados em DRAW[slot].
// Itens também podem usar imagens: d = { t: 'image', src: '/sprites/x.png', x, y, w, h }.
import { OUT, shade, lerp, ease, clamp01, rr, fillStroke, circle, star, poly, glow, animate } from './gfx.js';
import * as P from './parts.js';

let ITEMS = {};
export function setItemCatalog(items) { ITEMS = Object.fromEntries(items.map((i) => [i.id, i])); }
const item = (id) => (id ? ITEMS[id] || null : null);
const spec = (id) => item(id)?.d || null;
const RARITY_TIER = { comum: 1, rara: 2, epica: 3, lendaria: 4, mistica: 5, secreta: 6, incomum: 2, raro: 2, epico: 3, lendario: 4, mitico: 5 };
export function rarityTier(r) { return RARITY_TIER[r] || 1; }
const imgCache = new Map();
function drawImageSpec(ctx, d) {
  let img = imgCache.get(d.src);
  if (!img) { img = new Image(); img.src = d.src; imgCache.set(d.src, img); }
  if (img.complete && img.naturalWidth) ctx.drawImage(img, d.x ?? -20, d.y ?? -40, d.w ?? 40, d.h ?? 40);
}

// ================= Poses =================
function interp(keys, k) {
  if (k <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (k <= keys[i][0]) {
      const [t0, a] = keys[i - 1]; const [t1, b] = keys[i];
      const e = ease((k - t0) / (t1 - t0)); const o = {};
      for (const key of Object.keys(b)) o[key] = lerp(a[key], b[key], e);
      return o;
    }
  }
  return keys[keys.length - 1][1];
}
/** Pose para a animação `anim` após `k` segundos, no tempo global `t`. */
export function heroPose(anim, k, t) {
  const br = Math.sin(t * 2.2);
  const idle = { x: 0, y: br * 1.4, lean: 0, front: -0.28 + br * 0.04, back: 0.22 + Math.sin(t * 2.2 + 1) * 0.05, rel: 0.6, legF: -0.05, legB: 0.08, kneel: 0, flash: 0, eyes: 'open', mouth: 'calm', drop: 0, alpha: 1, ring: 0 };
  if (anim === 'walk') {
    const w = Math.sin(t * 7.5);
    return { ...idle, y: -Math.abs(Math.cos(t * 7.5)) * 2.5, legF: w * 0.55, legB: -w * 0.55, front: -0.2 - w * 0.35, back: 0.2 + w * 0.45, lean: 0.06 };
  }
  if (anim === 'attack') {
    const p = interp([[0, { x: 0, front: -0.28, rel: 0.6, lean: 0, legF: -0.05 }], [0.22, { x: -6, front: 2.5, rel: 2.5, lean: -0.1, legF: 0.15 }], [0.4, { x: 38, front: 5.35, rel: 2.9, lean: 0.16, legF: -0.45 }], [0.55, { x: 34, front: 5.3, rel: 2.9, lean: 0.12, legF: -0.4 }], [0.8, { x: 0, front: 5.98, rel: 0.6, lean: 0, legF: -0.05 }]], k);
    return { ...idle, ...p, mouth: 'shout' };
  }
  if (anim === 'hurt') {
    const a = clamp01(k / 0.5); const kb = Math.sin(a * Math.PI);
    return { ...idle, x: -16 * kb, lean: -0.22 * kb, flash: 1 - a, eyes: a < 0.8 ? 'closed' : 'open', mouth: 'hurt', front: -0.1, back: 0.5 * kb };
  }
  if (anim === 'victory') {
    const j = Math.abs(Math.sin(k * 3.2));
    return { ...idle, y: -22 * j, front: 3.05 + Math.sin(k * 6) * 0.08, rel: 3.2, back: 0.9, mouth: 'smile', lean: -0.05, legF: -0.2 * j, legB: 0.25 * j };
  }
  if (anim === 'defeat') {
    const a = ease(clamp01(k / 1.1));
    return { ...idle, y: 0, kneel: a, lean: 0.38 * a, front: lerp(-0.28, 0.25, a), back: lerp(0.22, 0.4, a), eyes: a > 0.3 ? 'closed' : 'open', mouth: 'sad', drop: a, alpha: 1 - a * 0.15 };
  }
  if (anim === 'special') { // animação especial: o herói ergue a arma e libera o poder da skin
    const a = clamp01(k / 0.7); const hold = k < 2.2 ? 1 : clamp01(1 - (k - 2.2) / 0.5);
    const up = ease(a) * hold;
    return { ...idle, y: -10 * up + Math.sin(k * 8) * 0.6 * up, front: lerp(-0.28, 3.3, up), rel: lerp(0.6, 3.2, up), back: lerp(0.22, -0.9, up), legF: lerp(-0.05, -0.18, up), legB: lerp(0.08, 0.2, up), mouth: up > 0.5 ? 'shout' : 'calm', power: up, ring: k > 0.5 && k < 1.3 ? (k - 0.5) / 0.8 : 0 };
  }
  if (anim === 'equip') {
    const a = clamp01(k / 0.9);
    return { ...idle, y: -10 * Math.sin(a * Math.PI), front: lerp(-0.28, 3.0, Math.sin(a * Math.PI)), rel: lerp(0.6, 3.1, Math.sin(a * Math.PI)), ring: a, mouth: a < 0.9 ? 'smile' : 'calm' };
  }
  return idle;
}

// ================= Geometria do corpo =================
function bodyGeo(cfg) {
  const w = { slim: 22, athletic: 26, broad: 32 }[cfg.body] || 26;
  return { w, hx: w * 0.2, legW: cfg.body === 'broad' ? 12 : cfg.body === 'slim' ? 9 : 10, sh: w / 2 - 6 };
}

/** Desenha o herói com os pés em (0,0), virado para a direita. */
export function drawHero(ctx, cfg, pose, t, { pet = true } = {}) {
  const geo = bodyGeo(cfg);
  const skin = cfg.skin || '#e0a982';
  const chest = spec(cfg.chest) || { t: 'tunic', c: '#6b7280', c2: '#4b5563' };
  const tier = Math.max(1, ...['head', 'mask', 'chest', 'legs', 'boots', 'gloves', 'cape', 'weapon', 'shield', 'accessory', 'effect'].map((s) => RARITY_TIER[item(cfg[s])?.rarity] || 0));
  const power = pose.power || 0;
  ctx.save();
  ctx.globalAlpha = pose.alpha ?? 1;
  if (pose.flash > 0.05 && 'filter' in ctx) ctx.filter = `sepia(1) saturate(7) hue-rotate(-60deg) brightness(${(1 + pose.flash * 0.4).toFixed(2)})`;
  // sombra
  ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(pose.x * 0.9, 2, 30 - Math.min(10, -pose.y * 0.3), 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  if (pet && cfg.pet) drawPet(ctx, spec(cfg.pet), t, -48, 0);
  ctx.translate(pose.x, pose.y);
  if (tier >= 4) rarityAura(ctx, tier, t, power);
  drawEffect(ctx, spec(cfg.effect), t, 'back', power);
  if (pose.ring > 0) equipRing(ctx, pose.ring);
  ctx.save();
  ctx.translate(0, 16 * pose.kneel);
  ctx.rotate(pose.lean);
  const cape = spec(cfg.cape);
  if (cape) drawCape(ctx, cape, t, geo);
  const acc = spec(cfg.accessory);
  if (acc && acc.t === 'quiver') drawQuiver(ctx, acc);
  if (acc && P.BACK_ACC.has(acc.t)) P.ACC[acc.t](ctx, acc, t, geo, 'back');
  if (acc && acc.t === 'orbs') P.ACC.orbs(ctx, acc, t, geo, 'back');
  const head = spec(cfg.head);
  const hideHair = head && (['greathelm', 'kabuto', 'hood', 'visor', 'horned', 'nasal'].includes(head.t) || P.HIDE_HAIR.has(head.t));
  if (!hideHair) drawHairBack(ctx, cfg.hair, cfg.hairColor);
  // braço de trás (mão secundária)
  const wpn = spec(cfg.weapon);
  drawArm(ctx, -geo.sh + 1, -66, pose.back, chest, skin, spec(cfg.gloves), false, wpn && wpn.t === 'dual' ? { ...wpn, back: true } : null, 0.9, t, cfg);
  drawLegs(ctx, cfg, pose, geo, t);
  const legsSpec = spec(cfg.legs);
  if (legsSpec && P.HIP[legsSpec.t]) P.HIP[legsSpec.t](ctx, legsSpec, geo, t);
  drawChest(ctx, chest, geo, t, cfg, pose);
  if (acc && acc.t !== 'quiver' && !P.BACK_ACC.has(acc.t)) drawAccessory(ctx, acc, t, geo);
  drawHead(ctx, cfg, pose, head, hideHair, t);
  const sh = spec(cfg.shield);
  if (sh && pose.drop < 0.5) drawShield(ctx, sh, t, geo);
  if (pose.drop < 0.5) drawArm(ctx, geo.sh, -66, pose.front, chest, skin, spec(cfg.gloves), true, wpn, pose.rel, t, cfg);
  else drawArm(ctx, geo.sh, -66, pose.front, chest, skin, spec(cfg.gloves), true, null, 0, t, cfg);
  if (acc && acc.t === 'orbs') P.ACC.orbs(ctx, acc, t, geo, 'front');
  ctx.restore();
  if (pose.drop >= 0.5 && wpn) { ctx.save(); ctx.translate(36, -3 + (1 - pose.drop) * -20); ctx.rotate(Math.PI / 2 + 0.05); drawWeapon(ctx, wpn, t); ctx.restore(); }
  drawEffect(ctx, spec(cfg.effect), t, 'front', power);
  ctx.restore();
}

function equipRing(ctx, a) {
  ctx.save();
  ctx.globalAlpha = 1 - a;
  ctx.strokeStyle = '#f1cf85'; ctx.lineWidth = 3; ctx.shadowColor = '#f1cf85'; ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.ellipse(0, -55, 20 + a * 40, 60 + a * 20, 0, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 8; i++) { const ang = (i / 8) * Math.PI * 2 + a * 4; ctx.fillStyle = '#fff3c4'; star(ctx, Math.cos(ang) * (26 + a * 40), -55 + Math.sin(ang) * (50 + a * 20), 3); ctx.fill(); }
  ctx.restore();
}
/** Presença de raridade: Lendária (brasas douradas), Mística (aurora), Secreta (prisma e falhas na realidade). */
function rarityAura(ctx, tier, t, power = 0) {
  ctx.save();
  const ground = ctx.createRadialGradient(0, 0, 2, 0, 0, 40);
  const gc = tier >= 6 ? `hsla(${(t * 60) % 360},90%,70%,` : tier >= 5 ? 'rgba(46,230,214,' : 'rgba(245,165,36,';
  ground.addColorStop(0, `${gc}${0.32 + power * 0.3})`); ground.addColorStop(1, `${gc}0)`);
  ctx.fillStyle = ground; ctx.beginPath(); ctx.ellipse(0, 0, 40, 9, 0, 0, Math.PI * 2); ctx.fill();
  if (tier >= 5) {
    for (let i = 0; i < 2; i++) {
      ctx.strokeStyle = tier >= 6 ? `hsla(${(t * 70 + i * 150) % 360},90%,70%,.35)` : (i ? 'rgba(224,92,255,.28)' : 'rgba(46,230,214,.32)');
      ctx.lineWidth = 3 - i; ctx.beginPath();
      for (let y = 0; y > -120; y -= 6) ctx.lineTo(Math.sin(y * 0.06 + t * 1.6 + i * 2) * (26 + i * 6), y);
      ctx.stroke();
    }
  }
  const n = tier >= 6 ? 16 : tier >= 5 ? 12 : 8;
  for (let i = 0; i < n * (1 + power); i++) {
    const ph = (t * 0.45 + i / n) % 1;
    const c = tier >= 6 ? `hsla(${(t * 80 + i * 40) % 360},90%,72%,${(1 - ph) * 0.85})` : tier >= 5 ? `rgba(${i % 2 ? '224,92,255' : '46,230,214'},${(1 - ph) * 0.8})` : `rgba(245,190,90,${(1 - ph) * 0.8})`;
    ctx.fillStyle = c;
    const x = Math.sin(i * 2.4 + t * 0.7) * 30; const y = -ph * 120;
    if (tier >= 5 && i % 2) { star(ctx, x, y, 2.4); ctx.fill(); } else ctx.fillRect(x, y, 2, 2);
  }
  ctx.restore();
}

// ================= Pernas e botas =================
function drawLegs(ctx, cfg, pose, geo, t = 0) {
  const legs = spec(cfg.legs) || { t: 'pants', c: '#3a3226' };
  const boots = spec(cfg.boots) || { t: 'boots', c: '#4a3222' };
  const k = pose.kneel;
  const leg = (x, rot, back) => {
    ctx.save(); ctx.translate(x, -40); ctx.rotate(rot);
    const len = lerp(30, 22, k);
    const col = back ? shade(legs.c, -0.25) : legs.c;
    if (legs.t === 'hakama') { poly(ctx, [[-geo.legW / 2 - 2, 0], [geo.legW / 2 + 2, 0], [geo.legW / 2 + 5, len + 4], [-geo.legW / 2 - 5, len + 4]]); fillStroke(ctx, col); }
    else { rr(ctx, -geo.legW / 2, 0, geo.legW, len, 4); fillStroke(ctx, col); }
    if (legs.t === 'greaves') { rr(ctx, -geo.legW / 2 - 1, len * 0.45, geo.legW + 2, len * 0.55, 3); fillStroke(ctx, back ? shade(legs.c, -0.2) : legs.c, 1.5); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(1, len * 0.5, 2, len * 0.4); }
    if (legs.t === 'tech') { ctx.strokeStyle = legs.c2 || '#22d3ee'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(geo.legW / 2 - 2, 3); ctx.lineTo(geo.legW / 2 - 2, len - 2); ctx.stroke(); }
    if (legs.t === 'pants' && legs.c2) { ctx.strokeStyle = legs.c2; ctx.lineWidth = 1.3; for (let y = len * 0.55; y < len - 2; y += 3) { ctx.beginPath(); ctx.moveTo(-geo.legW / 2, y); ctx.lineTo(geo.legW / 2, y + 1.5); ctx.stroke(); } }
    if (P.LEGS[legs.t]) P.LEGS[legs.t](ctx, legs, { w: geo.legW, len, back, t });
    drawBoot(ctx, boots, len, geo, back, t);
    ctx.restore();
  };
  if (k > 0.2) {
    leg(-geo.hx, lerp(0.08, 1.2, k), true);
    ctx.save(); ctx.translate(geo.hx, -40); ctx.rotate(lerp(-0.06, -0.9, k));
    rr(ctx, -geo.legW / 2, 0, geo.legW, 20, 4); fillStroke(ctx, legs.c);
    ctx.translate(0, 18); ctx.rotate(lerp(0, 1.5, k)); rr(ctx, -geo.legW / 2, 0, geo.legW, 14, 4); fillStroke(ctx, legs.c); drawBoot(ctx, boots, 10, geo, false, t);
    ctx.restore();
    return;
  }
  leg(-geo.hx, pose.legB, true);
  leg(geo.hx, pose.legF, false);
}
function drawBoot(ctx, b, len, geo, back, t = 0) {
  if (b.t === 'image') return drawImageSpec(ctx, b);
  if (P.BOOTS[b.t]) return P.BOOTS[b.t](ctx, b, { w: geo.legW, len, back, t });
  const col = back ? shade(b.c, -0.2) : b.c;
  const w = geo.legW;
  if (b.t === 'shoes' || b.t === 'tabi') { rr(ctx, -w / 2 - 1, len + 5, w + 5, 7, 3); fillStroke(ctx, col); if (b.t === 'tabi') { ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w / 2 - 1, len + 6); ctx.lineTo(w / 2 - 1, len + 11); ctx.stroke(); } return; }
  rr(ctx, -w / 2 - 1, len - 4, w + 6, 13, 4); fillStroke(ctx, col);
  if (b.t === 'sabatons') { ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(-w / 2 + 1, len - 2, w + 2, 2); ctx.strokeStyle = shade(b.c, -0.35); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-w / 2, len + 3); ctx.lineTo(w / 2 + 4, len + 3); ctx.stroke(); }
  if (b.t === 'techboots') { ctx.fillStyle = b.c2 || '#22d3ee'; ctx.fillRect(-w / 2, len + 6, w + 4, 2); }
  if (b.t === 'boots') { ctx.fillStyle = shade(b.c, -0.3); ctx.fillRect(-w / 2 - 1, len - 4, w + 6, 3); }
}

// ================= Tronco =================
function drawChest(ctx, d, geo, t, cfg = {}, pose = {}) {
  if (d.t === 'image') return drawImageSpec(ctx, d);
  if (P.CHEST[d.t]) { P.CHEST[d.t](ctx, d, geo, t, cfg, pose); P.pauldrons(ctx, geo, d, t); return; }
  const w = geo.w; const x = -w / 2;
  if (d.t === 'robe' || d.t === 'coat') {
    poly(ctx, [[x + 1, -46], [x + w - 1, -46], [x + w + (d.t === 'robe' ? 6 : 3), d.t === 'robe' ? -10 : -24], [x - (d.t === 'robe' ? 6 : 3), d.t === 'robe' ? -10 : -24]]);
    fillStroke(ctx, shade(d.c, -0.08));
    ctx.strokeStyle = d.c2 || '#d9ad55'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - (d.t === 'robe' ? 4 : 1), d.t === 'robe' ? -13 : -27); ctx.lineTo(x + w + (d.t === 'robe' ? 4 : 1), d.t === 'robe' ? -13 : -27); ctx.stroke();
  }
  const metal = ['plate', 'chain', 'lamellar', 'suit'].includes(d.t);
  rr(ctx, x, -73, w, 36, 8); fillStroke(ctx, d.c);
  ctx.save(); rr(ctx, x, -73, w, 36, 8); ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x, -73, w * 0.3, 36);
  ctx.fillStyle = metal ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.06)'; ctx.fillRect(x + w * 0.62, -73, w * 0.2, 36);
  if (d.t === 'chain') {
    ctx.strokeStyle = 'rgba(30,34,44,.5)'; ctx.lineWidth = 1;
    for (let y = -72; y < -38; y += 3) for (let xx = x + ((y / 3) % 2 ? 1.5 : 0); xx < x + w; xx += 3) { ctx.beginPath(); ctx.arc(xx, y, 1.3, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = d.c2 || '#7a2e2e'; ctx.fillRect(x, -50, w, 6);
  }
  if (d.t === 'lamellar') {
    ctx.strokeStyle = shade(d.c, -0.4); ctx.lineWidth = 1.2;
    for (let y = -68; y < -40; y += 5) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke(); }
    ctx.strokeStyle = d.c2 || '#111'; ctx.lineWidth = 1; for (let xx = x + 3; xx < x + w; xx += 5) { ctx.beginPath(); ctx.moveTo(xx, -72); ctx.lineTo(xx, -40); ctx.stroke(); }
  }
  if (d.t === 'leather') { ctx.strokeStyle = shade(d.c, -0.4); ctx.setLineDash([2, 2]); ctx.lineWidth = 1; rr(ctx, x + 3, -70, w - 6, 26, 4); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = d.c2 || '#3a2618'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 2, -72); ctx.lineTo(x + w - 2, -46); ctx.stroke(); }
  if (d.t === 'suit') { glow(ctx, d.g, 8, () => { ctx.strokeStyle = d.c2 || '#22d3ee'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x + 5, -70); ctx.lineTo(x + w / 2, -60); ctx.lineTo(x + w - 5, -70); ctx.moveTo(x + w / 2, -60); ctx.lineTo(x + w / 2, -42); ctx.stroke(); }); }
  ctx.restore();
  if (d.t === 'plate') {
    ctx.strokeStyle = shade(d.c, -0.35); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + w / 2, -72); ctx.lineTo(x + w / 2, -44); ctx.stroke();
    if (d.c2) glow(ctx, d.g, 10, () => { ctx.strokeStyle = d.c2; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x + w / 2 - 6, -64); ctx.lineTo(x + w / 2, -56); ctx.lineTo(x + w / 2 + 6, -64); ctx.stroke(); });
    for (const sx of [x + 1, x + w - 1]) { ctx.beginPath(); ctx.ellipse(sx, -70, 9, 6.5, 0, Math.PI, 0); ctx.closePath(); fillStroke(ctx, shade(d.c, 0.08)); if (d.c2) { ctx.strokeStyle = d.c2; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(sx, -70, 7, 4.5, 0, Math.PI, 0); ctx.stroke(); } }
  }
  if (d.t === 'tunic' || d.t === 'robe' || d.t === 'coat') {
    ctx.strokeStyle = d.c2 || shade(d.c, -0.3); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x + w / 2 - 8, -72); ctx.lineTo(x + w / 2 + 1, -62); ctx.lineTo(x + w / 2 + 9, -72); ctx.stroke();
  }
  if (d.t === 'coat') { ctx.fillStyle = shade(d.c, -0.25); for (const yy of [-64, -56, -48]) { circle(ctx, x + w / 2 + 3, yy, 1.4); ctx.fill(); } }
  // cinto
  rr(ctx, x, -44, w, 6, 2); fillStroke(ctx, d.t === 'suit' ? '#0f172a' : '#2a2018', 1.5);
  rr(ctx, x + w / 2, -45, 7, 8, 2); fillStroke(ctx, d.t === 'suit' ? (d.c2 || '#22d3ee') : '#c9a24a', 1.5);
}
function sleeveOf(d, cfg = {}) {
  if (!d) return { c: '#6b7280', metal: false };
  if (P.SLEEVE[d.t]) return P.SLEEVE[d.t](d, cfg);
  if (['plate'].includes(d.t)) return { c: shade(d.c, -0.05), metal: true, trim: d.c2 };
  if (d.t === 'suit') return { c: d.c, tech: d.c2 };
  return { c: d.c };
}

// ================= Braços, luvas e armas =================
function drawArm(ctx, sx, sy, rot, chest, skin, gloves, front, wpn, rel, t, cfg = {}) {
  const sl = sleeveOf(chest, cfg);
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(rot);
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUT; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 22); ctx.stroke();
  ctx.strokeStyle = front ? sl.c : shade(sl.c, -0.25); ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 22); ctx.stroke();
  if (sl.metal) { rr(ctx, -4.5, 8, 9, 9, 3); fillStroke(ctx, front ? sl.c : shade(sl.c, -0.2), 1.5); }
  if (sl.tech) { ctx.strokeStyle = sl.tech; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(2, 3); ctx.lineTo(2, 19); ctx.stroke(); }
  if (sl.wide) { poly(ctx, [[-4, 6], [5, 6], [8, 20], [-6, 20]]); fillStroke(ctx, front ? sl.c : shade(sl.c, -0.25), 1.6); if (sl.trim) { ctx.fillStyle = sl.trim; ctx.fillRect(-6, 18, 14, 2); } }
  if (sl.trim && !sl.wide) { ctx.fillStyle = sl.trim; ctx.fillRect(-3.5, 2, 7, 2); }
  if (sl.glowLine) glow(ctx, sl.glowLine, 8, () => { ctx.strokeStyle = sl.glowLine; ctx.globalAlpha *= 0.6 + Math.sin(t * 3) * 0.3; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(1.5, 3); ctx.lineTo(1.5, 18); ctx.stroke(); });
  if (sl.prism) { ctx.save(); ctx.strokeStyle = `hsla(${(t * 50) % 360},90%,70%,.9)`; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(0, 21); ctx.stroke(); ctx.restore(); }
  if (wpn) { ctx.save(); ctx.translate(0, 25); ctx.rotate(rel); if (wpn.back) ctx.scale(0.92, 0.92); drawWeapon(ctx, wpn, t); ctx.restore(); }
  if (gloves && P.GLOVES[gloves.t]) P.GLOVES[gloves.t](ctx, gloves, { gc: front ? (gloves.c || '#888') : shade(gloves.c || '#888', -0.2), skin: front ? skin : shade(skin, -0.15), t });
  else if (gloves) {
    const gc = front ? gloves.c : shade(gloves.c, -0.2);
    if (gloves.t === 'gauntlets') { rr(ctx, -5, 17, 10, 7, 2); fillStroke(ctx, gc, 1.5); circle(ctx, 0, 25, 5.8); fillStroke(ctx, gc, 1.6); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-2, 20, 2, 3); }
    else { rr(ctx, -4.5, 18, 9, 5, 2); fillStroke(ctx, shade(gc, -0.15), 1.4); circle(ctx, 0, 25, 4.8); fillStroke(ctx, gc, 1.6); }
  } else { circle(ctx, 0, 25, 4.5); fillStroke(ctx, front ? skin : shade(skin, -0.15), 1.6); }
  ctx.restore();
}

export function drawWeapon(ctx, d, t) {
  if (!d) return;
  if (d.t === 'image') return drawImageSpec(ctx, d);
  const grip = (len = 11) => { rr(ctx, -2, -2, 4, len, 2); fillStroke(ctx, d.c2 && d.t !== 'sword' ? d.c2 : '#4a2f1c', 1.5); };
  const blade = (len, w, fill, tip = 7) => { poly(ctx, [[-w / 2, -5], [-w / 2, -len], [0, -len - tip], [w / 2, -len], [w / 2, -5]]); fillStroke(ctx, fill, 1.6); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0.8, -8); ctx.lineTo(0.8, -len + 2); ctx.stroke(); };
  const glowOn = (fn) => glow(ctx, d.g, 14 + Math.sin(t * 6) * 4, fn);
  switch (d.t) {
    case 'sword': case 'dual': case 'greatsword': {
      const len = d.len || (d.t === 'greatsword' ? 62 : 42); const w = d.t === 'greatsword' ? 9 : 5.5;
      grip(d.t === 'greatsword' ? 14 : 11);
      rr(ctx, d.t === 'greatsword' ? -10 : -7, -5, d.t === 'greatsword' ? 20 : 14, 4, 2); fillStroke(ctx, d.c2 || '#c9a24a', 1.5);
      glowOn(() => blade(len, w, d.c));
      if (d.t === 'greatsword' && d.c2) { ctx.strokeStyle = d.c2; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, -len + 6); ctx.stroke(); }
      break;
    }
    case 'katana': {
      rr(ctx, -2, -2, 4, 13, 2); fillStroke(ctx, d.c2 || '#111', 1.5);
      circle(ctx, 0, -3, 4); fillStroke(ctx, '#c9a24a', 1.2);
      ctx.beginPath(); ctx.moveTo(-2, -6); ctx.quadraticCurveTo(-4, -30, 2, -56); ctx.lineTo(4, -54); ctx.quadraticCurveTo(0, -30, 2.5, -6); ctx.closePath(); fillStroke(ctx, d.c, 1.4);
      break;
    }
    case 'machete': grip(10); poly(ctx, [[-3, -4], [-4, -30], [4, -36], [5, -4]]); fillStroke(ctx, d.c, 1.5); break;
    case 'axe': rr(ctx, -2, -36, 4, 48, 2); fillStroke(ctx, d.c2 || '#5a3a22', 1.5); ctx.beginPath(); ctx.moveTo(2, -34); ctx.quadraticCurveTo(20, -40, 18, -22); ctx.quadraticCurveTo(12, -26, 2, -24); ctx.closePath(); fillStroke(ctx, d.c, 1.6); break;
    case 'hammer': rr(ctx, -2, -40, 4, 54, 2); fillStroke(ctx, '#5b3b24', 1.5); glowOn(() => { rr(ctx, -10, -52, 20, 14, 3); fillStroke(ctx, d.c, 1.8); }); if (d.c2) { ctx.fillStyle = d.c2; ctx.fillRect(-10, -47, 20, 3); } break;
    case 'spear': rr(ctx, -1.8, -52, 3.6, 74, 1.8); fillStroke(ctx, d.c2 || '#6a4528', 1.4); poly(ctx, [[-4, -50], [0, -66], [4, -50]]); fillStroke(ctx, d.c, 1.5); ctx.fillStyle = '#b91c1c'; ctx.fillRect(-3, -49, 6, 3); break;
    case 'staff': {
      rr(ctx, -2, -44, 4, 66, 2); fillStroke(ctx, d.c2 || '#5b3b24', 1.5);
      const pul = 0.6 + Math.sin(t * 3) * 0.25;
      glow(ctx, d.c, 16 * pul, () => { circle(ctx, 0, -49, 6.5); fillStroke(ctx, d.c, 1.6); });
      ctx.fillStyle = 'rgba(255,255,255,.7)'; circle(ctx, -2, -51, 2); ctx.fill();
      break;
    }
    case 'scythe': rr(ctx, -2, -50, 4, 74, 2); fillStroke(ctx, d.c2 || '#1f1530', 1.5); glow(ctx, d.c, 12, () => { ctx.beginPath(); ctx.moveTo(0, -50); ctx.quadraticCurveTo(-30, -62, -40, -38); ctx.quadraticCurveTo(-24, -52, 0, -44); ctx.closePath(); fillStroke(ctx, d.c, 1.6); }); break;
    case 'bow': {
      ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(-14, -14, 30, -1.1, 1.1); ctx.stroke();
      ctx.strokeStyle = d.c; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-14, -14, 30, -1.1, 1.1); ctx.stroke();
      ctx.strokeStyle = d.c2 || '#e5e7eb'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-14 + 30 * Math.cos(-1.1), -14 + 30 * Math.sin(-1.1)); ctx.lineTo(-14 + 30 * Math.cos(1.1), -14 + 30 * Math.sin(1.1)); ctx.stroke();
      break;
    }
    case 'laser': rr(ctx, -2.5, -2, 5, 12, 2); fillStroke(ctx, '#1f2937', 1.5); glow(ctx, d.c, 18 + Math.sin(t * 9) * 5, () => { rr(ctx, -2.5, -52, 5, 48, 2.5); ctx.fillStyle = d.c; ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-0.8, -50, 1.6, 44); }); break;
    case 'flame': {
      grip(); rr(ctx, -7, -5, 14, 4, 2); fillStroke(ctx, '#c9a24a', 1.5);
      const g = ctx.createLinearGradient(0, -5, 0, -44); g.addColorStop(0, '#ff5a1f'); g.addColorStop(0.6, '#ffb03a'); g.addColorStop(1, '#fff1b0');
      glow(ctx, '#ff7a2a', 14 + Math.sin(t * 9) * 4, () => blade(44, 5.5, g));
      for (let i = 0; i < 4; i++) { const ph = (t * 1.6 + i * 0.25) % 1; ctx.fillStyle = `rgba(255,${150 + i * 20},60,${1 - ph})`; circle(ctx, Math.sin(t * 5 + i) * 4, -10 - ph * 50, 1.8 * (1 - ph) + 0.5); ctx.fill(); }
      break;
    }
    default:
      if (P.WEAPON[d.t]) P.WEAPON[d.t](ctx, d, t);
      else { grip(); blade(40, 5, d.c || '#ccc'); }
  }
}

function drawShield(ctx, d, t, geo) {
  ctx.save(); ctx.translate(geo.w / 2 - 2, -56);
  if (d.t === 'image') { drawImageSpec(ctx, d); ctx.restore(); return; }
  const g = d.g;
  if (d.t === 'round') { circle(ctx, 0, 0, 14); fillStroke(ctx, d.c, 2.2); ctx.strokeStyle = d.c2 || '#aaa'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 11.5, 0, Math.PI * 2); ctx.stroke(); circle(ctx, 0, 0, 3.5); fillStroke(ctx, d.c2 || '#aaa', 1.2); }
  else if (d.t === 'kite') { poly(ctx, [[-12, -16], [12, -16], [12, 2], [0, 20], [-12, 2]]); fillStroke(ctx, d.c, 2.2); ctx.fillStyle = d.c2 || '#fff'; poly(ctx, [[-2, -12], [2, -12], [2, -4], [8, -4], [8, 0], [2, 0], [2, 12], [-2, 12], [-2, 0], [-8, 0], [-8, -4], [-2, -4]]); ctx.fill(); }
  else if (d.t === 'holy') { glow(ctx, g, 16 + Math.sin(t * 3) * 5, () => { poly(ctx, [[-13, -17], [13, -17], [14, 0], [0, 21], [-14, 0]]); fillStroke(ctx, d.c, 2.2); }); ctx.strokeStyle = d.c2 || '#e0ad3a'; ctx.lineWidth = 2; poly(ctx, [[-10, -14], [10, -14], [11, 0], [0, 17], [-11, 0]]); ctx.stroke(); circle(ctx, 0, -2, 4.5); ctx.fillStyle = d.c2 || '#e0ad3a'; ctx.fill(); }
  else if (P.SHIELD[d.t]) P.SHIELD[d.t](ctx, d, t);
  else if (d.t === 'energy') {
    glow(ctx, d.c, 18, () => { ctx.strokeStyle = d.c; ctx.lineWidth = 2; ctx.globalAlpha *= 0.85; ctx.beginPath(); for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16); } ctx.stroke(); ctx.fillStyle = 'rgba(34,211,238,.15)'; ctx.fill(); });
  }
  ctx.restore();
}

// ================= Cabeça =================
function drawHead(ctx, cfg, pose, helm, hideHair, t) {
  const skin = cfg.skin || '#e0a982';
  rr(ctx, -3, -78, 7, 8, 2); fillStroke(ctx, shade(skin, -0.12), 1.5);
  if (helm && helm.t === 'hood') { ctx.beginPath(); ctx.ellipse(0, -88, 18.5, 19, 0, Math.PI * 0.7, Math.PI * 2.15); ctx.closePath(); fillStroke(ctx, shade(helm.c, -0.12)); }
  ctx.beginPath(); ctx.ellipse(2, -88, 13.5, 14.5, 0, 0, Math.PI * 2); fillStroke(ctx, skin);
  ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.beginPath(); ctx.ellipse(-3, -86, 8, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-4, -87, 3, 4, 0, 0, Math.PI * 2); fillStroke(ctx, shade(skin, -0.08), 1.4);
  drawFace(ctx, cfg, pose);
  if (cfg.beard && cfg.beard !== 'none') drawBeard(ctx, cfg.beard, cfg.hairColor);
  if (!hideHair) drawHairFront(ctx, cfg.hair, cfg.hairColor);
  const mask = spec(cfg.mask);
  if (mask) drawMask(ctx, mask, t);
  if (helm) drawHelm(ctx, helm, t);
}
function drawFace(ctx, cfg, pose) {
  ctx.lineCap = 'round';
  const ex = 9; const ey = -89;
  if (pose.eyes === 'closed') { ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(ex - 2.5, ey); ctx.lineTo(ex + 2, ey + 0.5); ctx.stroke(); }
  else {
    const style = cfg.eyes || 'round';
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    if (style === 'sharp') { poly(ctx, [[ex - 3, ey], [ex + 2.8, ey - 2], [ex + 2.5, ey + 1.6], [ex - 2, ey + 1.5]]); }
    else if (style === 'calm') ctx.ellipse(ex, ey + 0.5, 2.8, 2, 0, 0, Math.PI * 2);
    else if (style === 'fierce') { poly(ctx, [[ex - 3, ey - 1.5], [ex + 3, ey - 0.5], [ex + 2.5, ey + 2], [ex - 2.5, ey + 1.5]]); }
    else ctx.ellipse(ex, ey, 2.6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cfg.eyeColor || '#2b1d14'; ctx.beginPath(); ctx.ellipse(ex + 1, ey + 0.3, 1.5, style === 'calm' ? 1.4 : 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; circle(ctx, ex + 1.6, ey - 0.6, 0.5); ctx.fill();
  }
  ctx.strokeStyle = shade(cfg.hairColor || '#3b2416', -0.2); ctx.lineWidth = 2; ctx.beginPath();
  if (cfg.face === 'determined' || cfg.eyes === 'fierce' || pose.mouth === 'shout') { ctx.moveTo(ex - 4, ey - 6); ctx.lineTo(ex + 3, ey - 4); }
  else { ctx.moveTo(ex - 4, ey - 5); ctx.quadraticCurveTo(ex, ey - 7, ex + 3, ey - 5.5); }
  ctx.stroke();
  ctx.strokeStyle = '#5a2a22'; ctx.lineWidth = 1.6; ctx.beginPath();
  const mx = 11; const my = -80;
  const mouth = pose.mouth === 'calm' && cfg.face === 'smile' ? 'smile' : pose.mouth;
  if (mouth === 'smile') { ctx.moveTo(mx - 4, my - 1); ctx.quadraticCurveTo(mx - 1, my + 3, mx + 2, my - 1.5); }
  else if (mouth === 'shout') { ctx.fillStyle = '#3a1414'; ctx.ellipse(mx - 1, my, 2.6, 2.2, 0, 0, Math.PI * 2); ctx.fill(); }
  else if (mouth === 'hurt' || mouth === 'sad') { ctx.moveTo(mx - 4, my + 1); ctx.quadraticCurveTo(mx - 1, my - 2, mx + 2, my + 1); }
  else { ctx.moveTo(mx - 3.5, my); ctx.lineTo(mx + 1.5, my - 0.5); }
  ctx.stroke();
  if (cfg.face === 'scar') { ctx.strokeStyle = '#b5555b'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(6, -96); ctx.lineTo(12, -83); ctx.stroke(); }
  if (cfg.face === 'warpaint') { ctx.strokeStyle = '#c0262d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(3, -85); ctx.lineTo(13, -84); ctx.moveTo(4, -82); ctx.lineTo(12, -81); ctx.stroke(); }
  if (cfg.face === 'freckles') { ctx.fillStyle = 'rgba(120,60,30,.55)'; for (const [x, y] of [[6, -84], [8, -83], [10, -84.5], [12, -83]]) { circle(ctx, x, y, 0.7); ctx.fill(); } }
}
function drawBeard(ctx, type, c) {
  ctx.fillStyle = c; ctx.strokeStyle = OUT; ctx.lineWidth = 1.3;
  if (type === 'stubble') { ctx.fillStyle = 'rgba(40,30,20,.35)'; ctx.beginPath(); ctx.moveTo(-1, -84); ctx.quadraticCurveTo(0, -74, 7, -73); ctx.quadraticCurveTo(13, -73, 15, -79); ctx.lineTo(14, -84); ctx.closePath(); ctx.fill(); return; }
  if (type === 'mustache') { ctx.beginPath(); ctx.moveTo(6, -82.5); ctx.quadraticCurveTo(11, -84.5, 15, -81.5); ctx.quadraticCurveTo(11, -82, 6, -81); ctx.closePath(); fillStroke(ctx, c, 1); return; }
  if (type === 'goatee') { ctx.beginPath(); ctx.moveTo(7, -79); ctx.quadraticCurveTo(10, -71, 13, -78); ctx.closePath(); fillStroke(ctx, c, 1.2); ctx.beginPath(); ctx.moveTo(6, -82.5); ctx.quadraticCurveTo(11, -84.5, 15, -81.5); ctx.quadraticCurveTo(11, -82, 6, -81); ctx.closePath(); fillStroke(ctx, c, 1); return; }
  const full = type === 'full';
  ctx.beginPath(); ctx.moveTo(-2, -86); ctx.quadraticCurveTo(-1, full ? -70 : -75, 6, full ? -68 : -72); ctx.quadraticCurveTo(13, full ? -69 : -72, 15, -80); ctx.quadraticCurveTo(12, -77, 9, -79); ctx.lineTo(4, -78); ctx.quadraticCurveTo(2, -82, 2, -86); ctx.closePath();
  fillStroke(ctx, c, 1.4);
}
function drawHairBack(ctx, style, c) {
  c = c || '#3b2416';
  const back = shade(c, -0.1);
  if (style === 'long' || style === 'wavy') {
    ctx.beginPath(); ctx.moveTo(-10, -98);
    if (style === 'wavy') { ctx.bezierCurveTo(-24, -86, -14, -76, -20, -64); ctx.quadraticCurveTo(-12, -60, -3, -63); }
    else { ctx.quadraticCurveTo(-20, -80, -15, -60); ctx.lineTo(-3, -62); }
    ctx.quadraticCurveTo(-6, -80, 0, -92); ctx.closePath(); fillStroke(ctx, back);
  }
  if (style === 'ponytail') { ctx.beginPath(); ctx.moveTo(-10, -94); ctx.quadraticCurveTo(-26, -92, -24, -70); ctx.quadraticCurveTo(-18, -82, -8, -86); ctx.closePath(); fillStroke(ctx, back); }
  if (style === 'braid') { for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(-12 - i * 0.6, -90 + i * 6, 4, 3.6, 0.3, 0, Math.PI * 2); fillStroke(ctx, i % 2 ? back : c, 1.2); } }
  if (style === 'curly') { for (const [x, y] of [[-12, -94], [-14, -86], [-12, -79]]) { circle(ctx, x, y, 5); fillStroke(ctx, back, 1.4); } }
}
function drawHairFront(ctx, style, c) {
  c = c || '#3b2416';
  if (!style || style === 'bald') { ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.ellipse(4, -98, 5, 2.5, -0.3, 0, Math.PI * 2); ctx.fill(); return; }
  if (style === 'buzz') { ctx.save(); ctx.beginPath(); ctx.ellipse(2, -88, 13.5, 14.5, 0, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = shade(c, 0.05); ctx.globalAlpha = 0.85; ctx.fillRect(-14, -104, 30, 13); ctx.restore(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(2, -88, 13.5, 14.5, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); return; }
  if (style === 'curly') { for (const [x, y, r] of [[-6, -99, 6], [2, -103, 6.5], [10, -100, 6], [-10, -91, 5], [15, -94, 4.5]]) { circle(ctx, x, y, r); fillStroke(ctx, c, 1.4); } return; }
  ctx.beginPath();
  if (style === 'spiky') { ctx.moveTo(-11, -88); ctx.lineTo(-14, -100); ctx.lineTo(-6, -98); ctx.lineTo(-6, -110); ctx.lineTo(1, -101); ctx.lineTo(5, -112); ctx.lineTo(8, -100); ctx.lineTo(16, -106); ctx.lineTo(14, -96); ctx.lineTo(17, -92); ctx.lineTo(10, -94); ctx.quadraticCurveTo(0, -96, -11, -88); }
  else if (style === 'mohawk') { ctx.moveTo(-9, -92); ctx.quadraticCurveTo(-8, -112, 4, -112); ctx.quadraticCurveTo(12, -110, 13, -98); ctx.quadraticCurveTo(4, -101, -9, -92); }
  else if (style === 'undercut') { ctx.moveTo(-6, -95); ctx.quadraticCurveTo(-4, -107, 8, -106); ctx.quadraticCurveTo(18, -104, 17, -94); ctx.quadraticCurveTo(10, -98, 4, -96); ctx.quadraticCurveTo(-1, -97, -6, -95); }
  else if (style === 'topknot') { ctx.moveTo(-12, -86); ctx.quadraticCurveTo(-13, -102, 2, -103); ctx.quadraticCurveTo(15, -103, 16, -92); ctx.quadraticCurveTo(8, -97, -8, -86); ctx.closePath(); fillStroke(ctx, c, 1.8); ctx.beginPath(); ctx.ellipse(-3, -106, 4.5, 4, 0, 0, Math.PI * 2); }
  else { ctx.moveTo(-12, -86); ctx.quadraticCurveTo(-14, -104, 2, -104); ctx.quadraticCurveTo(15, -104, 16, -92); ctx.quadraticCurveTo(10, -97, 8, -93); ctx.quadraticCurveTo(2, -98, -2, -95); ctx.quadraticCurveTo(-6, -92, -8, -84); ctx.closePath(); }
  fillStroke(ctx, c, 1.8);
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-4, -101); ctx.quadraticCurveTo(4, -103, 9, -99); ctx.stroke();
}
function drawMask(ctx, d, t = 0) {
  if (d.t === 'image') return drawImageSpec(ctx, d);
  if (P.MASK[d.t]) return P.MASK[d.t](ctx, d, t);
  if (d.t === 'cloth') { ctx.beginPath(); ctx.moveTo(-2, -85); ctx.lineTo(16, -86); ctx.quadraticCurveTo(15, -74, 6, -72); ctx.quadraticCurveTo(-1, -74, -2, -85); ctx.closePath(); fillStroke(ctx, d.c, 1.5); }
  if (d.t === 'menpo') { ctx.beginPath(); ctx.moveTo(1, -84); ctx.lineTo(16, -85); ctx.lineTo(15, -75); ctx.quadraticCurveTo(8, -70, 2, -74); ctx.closePath(); fillStroke(ctx, d.c, 1.6); ctx.strokeStyle = '#f1f1f1'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(9, -79); ctx.lineTo(14, -79); ctx.moveTo(10, -76.5); ctx.lineTo(13.5, -76.5); ctx.stroke(); }
}
function drawHelm(ctx, d, t) {
  if (d.t === 'image') return drawImageSpec(ctx, d);
  if (P.HELM[d.t]) return P.HELM[d.t](ctx, d, t);
  const g = d.g;
  switch (d.t) {
    case 'nasal': ctx.beginPath(); ctx.moveTo(-12, -88); ctx.quadraticCurveTo(-12, -106, 3, -106); ctx.quadraticCurveTo(17, -106, 17, -90); ctx.lineTo(-12, -88); ctx.closePath(); fillStroke(ctx, d.c); rr(ctx, 9, -92, 3, 12, 1); fillStroke(ctx, shade(d.c, -0.1), 1.2); ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(0, -104, 6, 3); break;
    case 'greathelm':
      glow(ctx, g, 10, () => { rr(ctx, -13, -106, 31, 32, 7); fillStroke(ctx, d.c); });
      ctx.fillStyle = '#0b0b12'; ctx.fillRect(4, -93, 14, 3); ctx.fillRect(10, -88, 8, 2);
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(-8, -102, 4, 22);
      if (d.c2) { ctx.save(); ctx.translate(0, -106); for (let i = 0; i < 5; i++) { ctx.fillStyle = shade(d.c2, i * 0.06); ctx.beginPath(); ctx.ellipse(-4 - i * 3, -4 + i, 6, 3, -0.4, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
      break;
    case 'kabuto':
      ctx.beginPath(); ctx.moveTo(-15, -90); ctx.quadraticCurveTo(-14, -108, 2, -108); ctx.quadraticCurveTo(18, -108, 18, -92); ctx.lineTo(22, -86); ctx.lineTo(-18, -84); ctx.closePath(); fillStroke(ctx, d.c);
      ctx.strokeStyle = shade(d.c, 0.25); ctx.lineWidth = 1; for (let i = -10; i < 16; i += 5) { ctx.beginPath(); ctx.moveTo(i, -106); ctx.lineTo(i + 1, -90); ctx.stroke(); }
      ctx.strokeStyle = d.c2 || '#e0ad3a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(2, -106); ctx.quadraticCurveTo(-10, -120, -14, -126); ctx.moveTo(4, -106); ctx.quadraticCurveTo(16, -120, 20, -126); ctx.stroke();
      break;
    case 'hood': ctx.beginPath(); ctx.moveTo(-14, -78); ctx.quadraticCurveTo(-18, -106, 2, -107); ctx.quadraticCurveTo(18, -106, 18, -92); ctx.quadraticCurveTo(12, -100, 0, -99); ctx.quadraticCurveTo(-8, -96, -6, -78); ctx.closePath(); fillStroke(ctx, d.c); break;
    case 'wizard': ctx.beginPath(); ctx.ellipse(2, -97, 20, 5, 0, 0, Math.PI * 2); fillStroke(ctx, shade(d.c, -0.1)); poly(ctx, [[-10, -98], [14, -98], [6, -124], [-6, -136]]); fillStroke(ctx, d.c); ctx.fillStyle = d.c2 || '#f1cf85'; ctx.fillRect(-9, -103, 22, 4); star(ctx, 3, -114, 3); ctx.fill(); break;
    case 'explorer': ctx.beginPath(); ctx.ellipse(2, -96, 22, 5, 0, 0, Math.PI * 2); fillStroke(ctx, shade(d.c, -0.1)); ctx.beginPath(); ctx.moveTo(-11, -96); ctx.quadraticCurveTo(-10, -112, 3, -112); ctx.quadraticCurveTo(16, -112, 15, -96); ctx.closePath(); fillStroke(ctx, d.c); ctx.fillStyle = '#3a2a1a'; ctx.fillRect(-10, -100, 25, 3); break;
    case 'visor':
      rr(ctx, -13, -106, 31, 30, 9); fillStroke(ctx, d.c);
      glow(ctx, g || d.c2, 14, () => { rr(ctx, 2, -96, 17, 7, 3); ctx.fillStyle = d.c2 || '#22d3ee'; ctx.fill(); });
      ctx.strokeStyle = shade(d.c, 0.3); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-10, -86); ctx.lineTo(12, -84); ctx.stroke();
      break;
    case 'horned':
      rr(ctx, -13, -106, 31, 32, 7); fillStroke(ctx, d.c);
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(2 + side * 10, -102); ctx.quadraticCurveTo(2 + side * 26, -110, 2 + side * 20, -126); ctx.quadraticCurveTo(2 + side * 18, -112, 2 + side * 6, -104); ctx.closePath(); fillStroke(ctx, d.c2 || '#d8d0b0', 1.6); }
      glow(ctx, g, 12, () => { ctx.fillStyle = g || '#ef4444'; ctx.fillRect(6, -93, 11, 2.5); });
      break;
    case 'crown':
      glow(ctx, g || d.c, 14 + Math.sin(t * 3) * 4, () => { poly(ctx, [[-9, -100], [-11, -114], [-4, -107], [2, -118], [8, -107], [15, -114], [13, -100]]); fillStroke(ctx, d.c, 1.5); });
      ctx.fillStyle = d.c2 || '#dc2626'; circle(ctx, 2, -105, 2); ctx.fill();
      break;
    default: break;
  }
}

// ================= Capa, acessórios =================
function drawCape(ctx, d, t, geo) {
  if (d.t === 'image') return drawImageSpec(ctx, d);
  if (P.CAPE[d.t]) return P.CAPE[d.t](ctx, d, t, geo);
  const w = Math.sin(t * 3) * 3;
  if (d.t === 'wings') {
    glow(ctx, d.g || d.c, 18, () => {
      for (const s of [1, 0.75]) {
        ctx.save(); ctx.translate(-6, -66); ctx.rotate(-0.3 + Math.sin(t * 2) * 0.12 * s); ctx.scale(s, s);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-40, -50, -70, -30); ctx.quadraticCurveTo(-52, -18, -62, -4); ctx.quadraticCurveTo(-44, -6, -50, 12); ctx.quadraticCurveTo(-30, 4, -24, 22); ctx.quadraticCurveTo(-12, 8, 0, 6); ctx.closePath();
        ctx.fillStyle = s === 1 ? d.c : shade(d.c, -0.15); ctx.globalAlpha *= 0.92; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(180,120,40,.6)'; ctx.stroke();
        ctx.restore();
      }
    });
    return;
  }
  const x0 = -geo.w / 2 + 2;
  ctx.beginPath(); ctx.moveTo(x0, -72); ctx.lineTo(geo.w / 2 - 4, -72);
  ctx.quadraticCurveTo(-4, -40, -16 + w, -10); ctx.lineTo(-32 + w * 1.5, -14);
  if (d.t === 'tattered') { ctx.lineTo(-30 + w, -6); ctx.lineTo(-26 + w, -16); ctx.lineTo(-22 + w, -4); }
  ctx.quadraticCurveTo(-26, -45, x0, -72); ctx.closePath();
  fillStroke(ctx, d.c);
  ctx.fillStyle = d.c2 ? shade(d.c2, -0.1) : 'rgba(0,0,0,.25)'; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.moveTo(-14, -60); ctx.quadraticCurveTo(-20, -40, -24 + w, -14); ctx.lineTo(-32 + w * 1.5, -14); ctx.quadraticCurveTo(-24, -45, -14, -60); ctx.fill(); ctx.globalAlpha = 1;
  if (d.fur) { for (let i = 0; i < 7; i++) { circle(ctx, x0 + i * (geo.w - 6) / 6, -72, 3.4); fillStroke(ctx, '#f5f5f4', 1); } }
}
function drawQuiver(ctx, d) {
  ctx.save(); ctx.translate(-10, -70); ctx.rotate(-0.35);
  rr(ctx, -5, 0, 10, 30, 3); fillStroke(ctx, d.c, 1.6);
  for (const x of [-2, 1, 4]) { ctx.strokeStyle = '#d6d3d1'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, -8); ctx.stroke(); ctx.fillStyle = '#b91c1c'; ctx.fillRect(x - 1.5, -10, 3, 3); }
  ctx.restore();
}
function drawAccessory(ctx, d, t, geo) {
  if (d.t === 'image') return drawImageSpec(ctx, d);
  if (P.ACC[d.t]) return P.ACC[d.t](ctx, d, t, geo, 'front');
  if (d.t === 'scarf') { const w = Math.sin(t * 4) * 2.5; rr(ctx, -6, -76, 15, 6, 3); fillStroke(ctx, d.c, 1.5); ctx.beginPath(); ctx.moveTo(-5, -74); ctx.quadraticCurveTo(-16, -72 + w, -24, -66 + w); ctx.lineTo(-22, -62 + w); ctx.quadraticCurveTo(-14, -68, -4, -70); ctx.closePath(); fillStroke(ctx, d.c, 1.5); }
  if (d.t === 'amulet') { ctx.strokeStyle = '#d9ad55'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-4, -72); ctx.lineTo(2, -62); ctx.lineTo(8, -72); ctx.stroke(); glow(ctx, d.c, 8, () => { poly(ctx, [[2, -64], [5, -60], [2, -55], [-1, -60]]); fillStroke(ctx, d.c, 1.2); }); }
  if (d.t === 'satchel') { ctx.strokeStyle = shade(d.c, -0.3); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(geo.w / 2 - 4, -72); ctx.lineTo(-geo.w / 2 + 2, -44); ctx.stroke(); rr(ctx, -geo.w / 2 - 6, -48, 12, 10, 3); fillStroke(ctx, d.c, 1.5); }
}

// ================= Efeitos =================
function drawEffect(ctx, d, t, layer, power = 0) {
  if (!d) return;
  ctx.save();
  const reg = layer === 'back' ? P.EFFECT_BACK : P.EFFECT_FRONT;
  if (reg[d.t]) { reg[d.t](ctx, d, t, power); ctx.restore(); return; }
  const parts = (n, speed, color, size, spread = 30, height = 110, shape = 'sq') => {
    for (let i = 0; i < n; i++) {
      const ph = (t * speed + i / n) % 1;
      ctx.fillStyle = color.replace('A', (1 - ph).toFixed(2));
      const x = Math.sin(i * 2.3 + t) * spread; const y = -ph * height - 4;
      if (shape === 'star') { star(ctx, x, y, size); ctx.fill(); } else ctx.fillRect(x, y, size, size);
    }
  };
  if (layer === 'back') {
    if (d.t === 'gold' || d.t === 'holy') { const p = 0.5 + Math.sin(t * 2) * 0.15; const g = ctx.createRadialGradient(0, -55, 5, 0, -55, 72); g.addColorStop(0, `rgba(241,207,133,${0.35 * p})`); g.addColorStop(1, 'rgba(241,207,133,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -55, 56, 74, 0, 0, Math.PI * 2); ctx.fill(); }
    if (d.t === 'shadow') for (let i = 0; i < 7; i++) { const ph = (t * 0.35 + i / 7) % 1; ctx.fillStyle = `rgba(40,20,70,${0.35 * (1 - ph)})`; circle(ctx, Math.sin(i * 1.7 + t * 0.8) * 24, -10 - ph * 70, 14 + ph * 10); ctx.fill(); }
    if (d.t === 'frost') { const g = ctx.createRadialGradient(0, -50, 5, 0, -50, 70); g.addColorStop(0, 'rgba(165,243,252,.22)'); g.addColorStop(1, 'rgba(165,243,252,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -50, 55, 72, 0, 0, Math.PI * 2); ctx.fill(); }
    if (d.t === 'mythic') { for (let i = 0; i < 3; i++) { ctx.strokeStyle = `hsla(${(t * 80 + i * 120) % 360},90%,65%,.5)`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -55, 34 + i * 6, 70 + i * 4, 0, t + i, t + i + Math.PI * 1.3); ctx.stroke(); } }
    if (d.t === 'arcane') { ctx.strokeStyle = 'rgba(167,139,250,.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 0, 32, 8, 0, 0, Math.PI * 2); ctx.stroke(); for (let i = 0; i < 6; i++) { const a = t + (i * Math.PI) / 3; ctx.fillStyle = '#c4b5fd'; ctx.font = '8px serif'; ctx.fillText('ᚱᚨᛟᚦᛉᛞ'[i], Math.cos(a) * 30 - 3, Math.sin(a) * 7 + 3); } }
  } else {
    if (d.t === 'sparks') parts(10, 0.9, 'rgba(120,200,255,A)', 2, 30, 100);
    if (d.t === 'ember') parts(12, 0.7, 'rgba(255,120,50,A)', 2.2, 28, 110);
    if (d.t === 'frost') parts(9, 0.4, 'rgba(220,250,255,A)', 2.2, 30, 110, 'star');
    if (d.t === 'gold' || d.t === 'holy') parts(7, 0.5, 'rgba(255,225,150,A)', 1.8, 26, 110);
    if (d.t === 'stars') for (let i = 0; i < 5; i++) { const a = t * 1.2 + (i * Math.PI * 2) / 5; if (Math.sin(a) < 0) continue; ctx.fillStyle = '#e6f0ff'; glow(ctx, '#9cc3ff', 8, () => { star(ctx, Math.cos(a) * 30, -60 + Math.sin(a) * 10, 3.2); ctx.fill(); }); }
    if (d.t === 'lightning' && Math.sin(t * 13) > 0.6) { ctx.strokeStyle = '#a5f3fc'; ctx.lineWidth = 1.6; glow(ctx, '#67e8f9', 10, () => { ctx.beginPath(); let x = -18; let y = -100; ctx.moveTo(x, y); for (let i = 0; i < 6; i++) { x += (Math.random() - 0.5) * 14; y += 14; ctx.lineTo(x, y); } ctx.stroke(); }); }
    if (d.t === 'mythic') parts(14, 0.55, 'rgba(255,120,160,A)', 2.6, 34, 120, 'star');
  }
  ctx.restore();
}

// ================= Mascotes =================
export function drawPet(ctx, d, t, x, y) {
  if (!d) return;
  ctx.save(); ctx.translate(x, y + Math.sin(t * 3) * 2);
  if (d.t === 'image') { drawImageSpec(ctx, d); ctx.restore(); return; }
  const c = d.c;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, 2 - Math.sin(t * 3) * 2, 12, 3, 0, 0, Math.PI * 2); ctx.fill();
  const eye = (ex, ey, r = 1.8) => { ctx.fillStyle = '#111'; circle(ctx, ex, ey, r); ctx.fill(); ctx.fillStyle = '#fff'; circle(ctx, ex + 0.6, ey - 0.6, r * 0.35); ctx.fill(); };
  switch (d.t) {
    case 'slime': { const sq = 1 + Math.sin(t * 4) * 0.08; ctx.scale(1 / sq, sq); ctx.beginPath(); ctx.moveTo(-12, 0); ctx.quadraticCurveTo(-12, -18, 0, -18); ctx.quadraticCurveTo(12, -18, 12, 0); ctx.closePath(); ctx.globalAlpha *= 0.9; fillStroke(ctx, c, 1.6); eye(-3, -9); eye(4, -9); break; }
    case 'cat': ctx.beginPath(); ctx.ellipse(0, -8, 11, 7, 0, 0, Math.PI * 2); fillStroke(ctx, c, 1.5); circle(ctx, 9, -16, 6.5); fillStroke(ctx, c, 1.5); poly(ctx, [[5, -21], [6, -27], [9, -22]]); fillStroke(ctx, c, 1.2); poly(ctx, [[10, -22], [13, -27], [14, -20]]); fillStroke(ctx, c, 1.2); eye(11, -16, 1.4); ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-10, -9); ctx.quadraticCurveTo(-18, -14 + Math.sin(t * 5) * 4, -16, -22); ctx.stroke(); break;
    case 'owl': ctx.translate(0, -30 + Math.sin(t * 2) * 3); ctx.beginPath(); ctx.ellipse(0, 0, 9, 11, 0, 0, Math.PI * 2); fillStroke(ctx, c, 1.5); for (const s of [-1, 1]) { ctx.save(); ctx.rotate(s * (0.3 + Math.sin(t * 10) * 0.3)); ctx.beginPath(); ctx.ellipse(s * 9, 0, 4, 9, 0, 0, Math.PI * 2); fillStroke(ctx, shade(c, -0.2), 1.2); ctx.restore(); } ctx.fillStyle = '#fef3c7'; circle(ctx, -3, -3, 3.5); ctx.fill(); circle(ctx, 3.5, -3, 3.5); ctx.fill(); eye(-3, -3, 1.6); eye(3.5, -3, 1.6); poly(ctx, [[0, 0], [2, 1], [0, 3]]); ctx.fillStyle = '#f59e0b'; ctx.fill(); break;
    case 'wolf': ctx.beginPath(); ctx.ellipse(-2, -10, 14, 8, 0, 0, Math.PI * 2); fillStroke(ctx, c, 1.5); poly(ctx, [[8, -14], [20, -16], [22, -11], [12, -8]]); fillStroke(ctx, c, 1.4); poly(ctx, [[9, -16], [11, -24], [14, -16]]); fillStroke(ctx, shade(c, -0.15), 1.2); eye(16, -14, 1.3); for (const lx of [-10, -4, 4, 8]) { rr(ctx, lx, -4, 3.5, 6, 1.5); fillStroke(ctx, shade(c, -0.1), 1); } ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-15, -12); ctx.quadraticCurveTo(-22, -14 + Math.sin(t * 6) * 3, -24, -6); ctx.stroke(); break;
    case 'drone': ctx.translate(0, -34 + Math.sin(t * 2.5) * 4); rr(ctx, -9, -5, 18, 10, 4); fillStroke(ctx, '#1f2937', 1.5); glow(ctx, c, 10, () => { circle(ctx, 3, 0, 2.6); ctx.fillStyle = c; ctx.fill(); }); ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 1.5; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 9, -3); ctx.lineTo(s * 13, -7); ctx.stroke(); ctx.beginPath(); ctx.ellipse(s * 13, -8, 6 * Math.abs(Math.sin(t * 30)), 1.2, 0, 0, Math.PI * 2); ctx.stroke(); } break;
    case 'dragon': case 'phoenix': {
      const fire = d.t === 'phoenix';
      ctx.translate(0, -26 + Math.sin(t * 2) * 4);
      for (const s of [-1, 1]) { ctx.save(); ctx.rotate(s * (0.4 + Math.sin(t * 7) * 0.35)); ctx.beginPath(); ctx.moveTo(0, -2); ctx.quadraticCurveTo(s * 18, -18, s * 22, -2); ctx.quadraticCurveTo(s * 12, -4, 0, 2); ctx.closePath(); glow(ctx, fire ? '#ff7a2a' : null, 12, () => fillStroke(ctx, fire ? '#fbbf24' : shade(c, -0.15), 1.2)); ctx.restore(); }
      ctx.beginPath(); ctx.ellipse(0, 0, 9, 7, 0, 0, Math.PI * 2); glow(ctx, fire ? '#ff7a2a' : null, 14, () => fillStroke(ctx, c, 1.5));
      circle(ctx, 9, -5, 5.5); fillStroke(ctx, c, 1.5); eye(11, -6, 1.3);
      if (!fire) { poly(ctx, [[6, -10], [7, -15], [9, -10]]); fillStroke(ctx, '#fde68a', 1); }
      if (fire) for (let i = 0; i < 5; i++) { const ph = (t * 1.2 + i / 5) % 1; ctx.fillStyle = `rgba(255,${120 + i * 20},50,${1 - ph})`; circle(ctx, -10 - ph * 14, Math.sin(i + t * 4) * 3, 2 * (1 - ph) + 0.5); ctx.fill(); }
      break;
    }
    default:
      if (P.PET[d.t]) P.PET[d.t](ctx, d, t, eye);
      else { circle(ctx, 0, -8, 8); fillStroke(ctx, c || '#ccc', 1.5); }
  }
  ctx.restore();
}

// ================= Palco e miniaturas =================
export function heroStage(canvas, getCfg, { scale = 1.6, groundRatio = 0.86, idleWalk = false } = {}) {
  let anim = idleWalk ? 'walk' : 'idle'; let animStart = 0; let now = 0; let backTo = null;
  const s = animate(canvas, (ctx, w, h, t) => {
    now = t;
    const k = t - animStart;
    if (backTo && k > backTo.after) { anim = backTo.anim; backTo = null; }
    const sc = Math.min(scale, h / 150);
    ctx.save(); ctx.translate(w / 2 + 14 * sc, h * groundRatio); ctx.scale(sc, sc);
    drawHero(ctx, getCfg(), heroPose(anim, k, t), t);
    ctx.restore();
  });
  return {
    play(name, { loop = false } = {}) {
      const prev = ['idle', 'walk'].includes(anim) ? anim : 'idle';
      anim = name; animStart = now;
      const dur = { attack: 0.9, hurt: 0.6, equip: 1.0, special: 2.8 }[name];
      backTo = !loop && dur ? { after: dur, anim: prev } : null;
    },
    stop: s.stop,
  };
}

/** Miniatura estática (inventário). focus: 'full' | 'head' | 'item' */
export function drawHeroThumb(canvas, cfg, { focus = 'full' } = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 110; const h = canvas.clientHeight || 92;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const sc = focus === 'head' ? 1.8 : 0.72;
  ctx.translate(w / 2 + (focus === 'head' ? -4 : 6), focus === 'head' ? h + 72 * 1.8 - 18 : h - 6);
  ctx.scale(sc, sc);
  drawHero(ctx, cfg, heroPose('idle', 0, 0.4), 0.4, { pet: false });
}

/** Ícone isolado de um item (armas, escudos, mascotes, efeitos e títulos). */
export function drawItemIcon(canvas, it, t = 0.5) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 110; const h = canvas.clientHeight || 92;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const d = it.d;
  ctx.save(); ctx.translate(w / 2, h / 2);
  if (it.slot === 'weapon') { ctx.translate(-4, 28); ctx.rotate(0.6); ctx.scale(0.95, 0.95); drawWeapon(ctx, d, t); }
  else if (it.slot === 'shield') { ctx.scale(1.6, 1.6); ctx.translate(-8, 56); drawShield(ctx, d, t, { w: 16 }); }
  else if (it.slot === 'pet') { ctx.translate(0, 26); ctx.scale(1.5, 1.5); drawPet(ctx, d, t, 0, 0); }
  else if (it.slot === 'effect') { ctx.translate(0, 46); ctx.scale(0.6, 0.6); drawEffect(ctx, d, t, 'back'); drawEffect(ctx, d, t, 'front'); }
  ctx.restore();
}
