// Biblioteca de peças do personagem (EvoRPG). Cada peça é um "desenhista" registrado por tipo (d.t).
// Para criar uma skin nova: registre aqui os desenhistas que faltarem e descreva as peças em server/catalog.js.
// Coordenadas: pés em (0,0), personagem virado para a direita; cabeça centrada em (2,-88); tronco de y=-73 a y=-37.
import { OUT, shade, rr, fillStroke, circle, star, poly, glow } from './gfx.js';

const TAU = Math.PI * 2;
const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const hue = (t, off = 0, s = 85, l = 70, a = 1) => `hsla(${((t * 50 + off) % 360 + 360) % 360},${s}%,${l}%,${a})`;

// ================= Preenchimentos especiais =================
/** Céu estrelado dentro do caminho atual (skins do Vazio e Astral). */
export function starfield(ctx, x, y, w, h, t, { tint = '#c084fc', base = '#05050a', n = 26, seed = 1 } = {}) {
  ctx.save(); ctx.clip();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, base); g.addColorStop(0.55, shade(tint, -0.82)); g.addColorStop(1, base);
  ctx.fillStyle = g; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  const neb = ctx.createRadialGradient(x + w * 0.6, y + h * 0.4, 1, x + w * 0.6, y + h * 0.4, Math.max(w, h) * 0.7);
  neb.addColorStop(0, `${tint}55`); neb.addColorStop(1, `${tint}00`);
  ctx.fillStyle = neb; ctx.fillRect(x, y, w, h);
  for (let i = 0; i < n; i++) {
    const sx = x + hash(i + seed * 31) * w; const sy = y + hash(i * 3 + seed) * h;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (1 + hash(i) * 2) + i));
    ctx.fillStyle = `rgba(255,255,255,${tw})`;
    const r = hash(i * 7) > 0.85 ? 1.3 : 0.7;
    ctx.fillRect(sx, sy, r, r);
  }
  ctx.restore();
}
/** Cristal prismático com matiz que muda com o tempo. */
export function prismFill(ctx, x, y, w, h, t, alpha = 0.92) {
  ctx.save(); ctx.clip();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  for (let i = 0; i <= 4; i++) g.addColorStop(i / 4, hue(t, i * 70, 90, 72, alpha));
  ctx.fillStyle = g; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x + (i / 5) * w, y); ctx.lineTo(x + ((i + 1.4) / 5) * w, y + h); ctx.stroke(); }
  const sweep = ((t * 0.6) % 1.6) - 0.3;
  const sg = ctx.createLinearGradient(x + sweep * w - 8, y, x + sweep * w + 8, y + h);
  sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,.65)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg; ctx.fillRect(x, y, w, h);
  ctx.restore();
}
function metal(ctx, x, y, w, h, c) {
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, shade(c, -0.35)); g.addColorStop(0.45, c); g.addColorStop(0.62, shade(c, 0.35)); g.addColorStop(1, shade(c, -0.2));
  return g;
}
export function gear(ctx, x, y, r, teeth, rot, fill, lw = 1.2) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) { const a = (i / (teeth * 2)) * TAU; const rad = i % 2 ? r : r * 1.25; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
  ctx.closePath(); fillStroke(ctx, fill, lw);
  circle(ctx, 0, 0, r * 0.38); fillStroke(ctx, shade(fill, -0.4), lw * 0.8);
  ctx.restore();
}
function flameTongue(ctx, x, y, h, w, t, i, colors = ['#ff5a1f', '#ffb03a', '#fff1b0']) {
  const s = 0.75 + 0.25 * Math.sin(t * 9 + i * 1.7);
  const g = ctx.createLinearGradient(0, y, 0, y - h * s);
  g.addColorStop(0, colors[0]); g.addColorStop(0.6, colors[1]); g.addColorStop(1, `${colors[2]}00`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x - w * 0.6, y - h * 0.5 * s, x + Math.sin(t * 6 + i) * 2, y - h * s);
  ctx.quadraticCurveTo(x + w * 0.6, y - h * 0.5 * s, x + w, y); ctx.closePath(); ctx.fill();
}
function rune(ctx, x, y, k, s = 1) {
  const R = [[[0, -4], [0, 4], [3, -1]], [[-2, -4], [2, 0], [-2, 4]], [[0, -4], [0, 4], [-3, -1], [3, -1]], [[-3, 4], [0, -4], [3, 4]], [[-2, -4], [2, -1], [-2, 1], [2, 4]]][k % 5];
  ctx.beginPath(); R.forEach(([a, b], i) => (i ? ctx.lineTo(x + a * s, y + b * s) : ctx.moveTo(x + a * s, y + b * s))); ctx.stroke();
}

// ================= Tronco =================
const TOP = -73; const H = 36;
function torso(ctx, geo, fill, lw = 2) { rr(ctx, -geo.w / 2, TOP, geo.w, H, 8); fillStroke(ctx, fill, lw); }
function inTorso(ctx, geo, fn) { ctx.save(); rr(ctx, -geo.w / 2, TOP, geo.w, H, 8); ctx.clip(); fn(-geo.w / 2, geo.w); ctx.restore(); }
function shading(ctx, geo, hi = 0.12) { inTorso(ctx, geo, (x, w) => { ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x, TOP, w * 0.28, H); ctx.fillStyle = `rgba(255,255,255,${hi})`; ctx.fillRect(x + w * 0.62, TOP, w * 0.16, H); }); }
export function belt(ctx, geo, band = '#2a2018', buckle = '#c9a24a', h = 6) {
  rr(ctx, -geo.w / 2, -44, geo.w, h, 2); fillStroke(ctx, band, 1.5);
  rr(ctx, geo.w / 2 - geo.w / 2, -45, 7, h + 2, 2); fillStroke(ctx, buckle, 1.5);
}
function vNeck(ctx, geo, c, lw = 2.5) { ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(-8, -72); ctx.lineTo(1, -62); ctx.lineTo(9, -72); ctx.stroke(); }
function longSkirt(ctx, geo, c, to, flare = 5, trim) {
  const x = -geo.w / 2;
  poly(ctx, [[x + 1, -46], [x + geo.w - 1, -46], [x + geo.w + flare, to], [x - flare, to]]); fillStroke(ctx, shade(c, -0.08));
  if (trim) { ctx.strokeStyle = trim; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - flare + 1, to - 3); ctx.lineTo(x + geo.w + flare - 1, to - 3); ctx.stroke(); }
}

export function pauldrons(ctx, geo, d, t) {
  const st = d.sp; if (!st || st === 'none') return;
  const x = -geo.w / 2; const c = d.c || '#888'; const c2 = d.c2 || shade(c, 0.3);
  for (const [sx, back] of [[x + 1, true], [x + geo.w - 1, false]]) {
    const base = back ? shade(c, -0.15) : c;
    ctx.save(); ctx.translate(sx, -70);
    if (st === 'crystal') {
      glow(ctx, d.g, 10, () => { for (const [a, l] of [[-0.6, 12], [-0.15, 16], [0.4, 11]]) { ctx.save(); ctx.rotate(a); poly(ctx, [[-3, 0], [0, -l], [3, 0]]); ctx.globalAlpha *= 0.85; fillStroke(ctx, d.t === 'prism' ? hue(t, a * 200, 90, 75) : shade(c, 0.25), 1.2); ctx.restore(); } });
    }
    ctx.beginPath(); ctx.ellipse(0, 0, 9.5, 7, 0, Math.PI, 0); ctx.closePath();
    if (d.t === 'prism') { prismFill(ctx, -10, -8, 20, 9, t); ctx.lineWidth = 1.5; ctx.strokeStyle = OUT; ctx.stroke(); } else if (d.t === 'void') { starfield(ctx, -10, -8, 20, 9, t); } else fillStroke(ctx, base, 1.8);
    if (st === 'round' || st === 'gear') { ctx.strokeStyle = c2; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(0, 0, 7.5, 5, 0, Math.PI, 0); ctx.stroke(); }
    if (st === 'spike') for (const [ox, a] of [[-4, -0.5], [2, -0.1]]) { ctx.save(); ctx.translate(ox, -5); ctx.rotate(a); poly(ctx, [[-2.4, 0], [0, -11], [2.4, 0]]); fillStroke(ctx, shade(c2, back ? -0.2 : 0), 1.2); ctx.restore(); }
    if (st === 'horn') { ctx.beginPath(); ctx.moveTo(-2, -5); ctx.quadraticCurveTo(-12, -14, -6, -22); ctx.quadraticCurveTo(-6, -12, 3, -6); ctx.closePath(); fillStroke(ctx, back ? '#cfc6b3' : '#e7dcc6', 1.2); }
    if (st === 'feather') for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(-4 + i * 4, -4, 3, 7, -0.5 + i * 0.3, 0, TAU); fillStroke(ctx, shade(c2, -i * 0.08), 1); }
    if (st === 'fur') for (let i = 0; i < 4; i++) { circle(ctx, -6 + i * 4, -5 + (i % 2), 3.5); fillStroke(ctx, c2, 1); }
    if (st === 'leaf') for (const a of [-0.8, -0.2, 0.5]) { ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, -9, 3, 7, 0, 0, TAU); fillStroke(ctx, shade(c2, back ? -0.2 : 0.1), 1); ctx.strokeStyle = shade(c2, -0.4); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(0, -15); ctx.stroke(); ctx.restore(); }
    if (st === 'flame') for (let i = 0; i < 3; i++) flameTongue(ctx, -5 + i * 5, -4, 12, 3, t, i + (back ? 3 : 0));
    if (st === 'gear') gear(ctx, 0, -4, 4.5, 8, (back ? -1 : 1) * t * 1.5, c2, 1);
    ctx.restore();
  }
}

export const CHEST = {
  gambeson(ctx, d, geo) {
    torso(ctx, geo, d.c);
    inTorso(ctx, geo, (x, w) => { ctx.strokeStyle = shade(d.c, -0.28); ctx.lineWidth = 1; for (let xx = x + 3; xx < x + w; xx += 4) { ctx.beginPath(); ctx.moveTo(xx, TOP); ctx.lineTo(xx, -38); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(x, -58); ctx.lineTo(x + w, -58); ctx.stroke(); });
    shading(ctx, geo, 0.06); rr(ctx, -7, -77, 15, 6, 3); fillStroke(ctx, d.c2, 1.5); belt(ctx, geo);
  },
  vest(ctx, d, geo) {
    torso(ctx, geo, d.c2); const x = -geo.w / 2; const w = geo.w;
    poly(ctx, [[x, TOP + 2], [x + w * 0.42, TOP + 2], [x + w * 0.36, -40], [x, -40]]); fillStroke(ctx, d.c, 1.6);
    poly(ctx, [[x + w * 0.6, TOP + 2], [x + w, TOP + 2], [x + w, -40], [x + w * 0.66, -40]]); fillStroke(ctx, d.c, 1.6);
    ctx.fillStyle = shade(d.c, -0.4); for (const y of [-64, -56]) { circle(ctx, x + w * 0.4, y, 1.2); ctx.fill(); }
    shading(ctx, geo, 0.05); belt(ctx, geo, '#3a2a1a', '#9c8a6a');
  },
  flannel(ctx, d, geo) {
    torso(ctx, geo, d.c);
    inTorso(ctx, geo, (x, w) => {
      ctx.fillStyle = `${d.c2}88`; for (let xx = x + 2; xx < x + w; xx += 7) ctx.fillRect(xx, TOP, 3, H); for (let y = TOP + 3; y < -37; y += 7) ctx.fillRect(x, y, w, 3);
      ctx.fillStyle = 'rgba(255,255,255,.14)'; for (let xx = x + 5.5; xx < x + w; xx += 7) ctx.fillRect(xx, TOP, 0.8, H);
    });
    shading(ctx, geo, 0.04); poly(ctx, [[-7, -73], [1, -66], [9, -73]]); fillStroke(ctx, shade(d.c, -0.2), 1.4); belt(ctx, geo, '#2a2018', '#9ca3af');
  },
  gi(ctx, d, geo) {
    torso(ctx, geo, d.c); const x = -geo.w / 2;
    ctx.strokeStyle = shade(d.c, -0.25); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x + 4, -72); ctx.lineTo(geo.w / 2 - 4, -45); ctx.stroke();
    ctx.strokeStyle = shade(d.c, -0.12); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(geo.w / 2 - 5, -72); ctx.lineTo(4, -60); ctx.stroke();
    shading(ctx, geo, 0.08);
    rr(ctx, x, -45, geo.w, 6, 2); fillStroke(ctx, d.c2, 1.5);
    poly(ctx, [[geo.w / 2 - 6, -40], [geo.w / 2 - 3, -40], [geo.w / 2 - 1, -30], [geo.w / 2 - 5, -31]]); fillStroke(ctx, d.c2, 1.2);
  },
  striped(ctx, d, geo) {
    torso(ctx, geo, d.c);
    inTorso(ctx, geo, (x, w) => { ctx.fillStyle = d.c2; for (let y = TOP + 6; y < -38; y += 5.5) ctx.fillRect(x, y, w, 2.6); });
    shading(ctx, geo, 0.05); vNeck(ctx, geo, OUT, 1.6); belt(ctx, geo, '#1f1712', '#c9a24a');
  },
  apron(ctx, d, geo) {
    torso(ctx, geo, d.c2); shading(ctx, geo, 0.06); const x = -geo.w / 2;
    ctx.strokeStyle = shade(d.c, -0.3); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 5, -66); ctx.lineTo(x + 3, -73); ctx.moveTo(geo.w / 2 - 5, -66); ctx.lineTo(geo.w / 2 - 3, -73); ctx.stroke();
    rr(ctx, x + 3, -66, geo.w - 6, 40, 4); fillStroke(ctx, d.c, 1.6);
    rr(ctx, -4, -52, 10, 7, 2); fillStroke(ctx, shade(d.c, -0.15), 1.1);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(geo.w / 2 - 9, -64, 3, 34);
  },
  tabard(ctx, d, geo) {
    torso(ctx, geo, '#7d8592');
    inTorso(ctx, geo, (x, w) => { ctx.strokeStyle = 'rgba(20,24,32,.45)'; ctx.lineWidth = 0.8; for (let y = TOP; y < -38; y += 3) for (let xx = x + ((y / 3) % 2 ? 1.5 : 0); xx < x + w; xx += 3) { ctx.beginPath(); ctx.arc(xx, y, 1.2, 0, TAU); ctx.stroke(); } });
    const x = -geo.w / 2;
    rr(ctx, x + 4, -73, geo.w - 8, 46, 3); fillStroke(ctx, d.c, 1.6);
    ctx.strokeStyle = d.c2; ctx.lineWidth = 1.2; rr(ctx, x + 6, -71, geo.w - 12, 42, 2); ctx.stroke();
    ctx.fillStyle = d.c2; poly(ctx, [[-5, -55], [1, -63], [7, -55], [7, -51], [1, -58], [-5, -51]]); ctx.fill();
    belt(ctx, geo, '#2a2018', d.c2, 5);
  },
  furvest(ctx, d, geo) {
    torso(ctx, geo, d.c); shading(ctx, geo, 0.06);
    inTorso(ctx, geo, (x, w) => { ctx.strokeStyle = shade(d.c, -0.35); ctx.setLineDash([2, 2]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + w * 0.5, -66); ctx.lineTo(x + w * 0.5, -45); ctx.stroke(); ctx.setLineDash([]); });
    for (let i = 0; i < 6; i++) { circle(ctx, -geo.w / 2 + 1 + i * (geo.w - 2) / 5, -72 + (i % 2) * 1.5, 4.2); fillStroke(ctx, i % 2 ? shade(d.c2, -0.1) : d.c2, 1); }
    belt(ctx, geo, '#3a2a1a', '#b8c0cb');
    ctx.strokeStyle = '#b8c0cb'; ctx.lineWidth = 0.9; for (let xx = -geo.w / 2 + 3; xx < geo.w / 2 - 3; xx += 5) { ctx.beginPath(); ctx.moveTo(xx, -43.5); ctx.lineTo(xx + 2.5, -40.5); ctx.lineTo(xx + 5, -43.5); ctx.stroke(); }
  },
  cuirass(ctx, d, geo) {
    rr(ctx, -geo.w / 2, TOP, geo.w, H, 8); ctx.fillStyle = metal(ctx, -geo.w / 2, TOP, geo.w, H, d.c); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.strokeStyle = shade(d.c, -0.4); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(-3, -66, 6, 0.2, Math.PI - 0.6); ctx.stroke(); ctx.beginPath(); ctx.arc(8, -66, 6, 0.6, Math.PI - 0.2); ctx.stroke();
    for (const y of [-56, -51, -46]) { ctx.beginPath(); ctx.arc(-1, y, 3, 0.2, Math.PI - 0.2); ctx.stroke(); ctx.beginPath(); ctx.arc(6, y, 3, 0.2, Math.PI - 0.2); ctx.stroke(); }
    belt(ctx, geo, shade(d.c2, -0.2), d.c);
  },
  kimono(ctx, d, geo, t) {
    torso(ctx, geo, d.c);
    if (d.pat === 'wave') inTorso(ctx, geo, (x, w) => { ctx.strokeStyle = `${d.c2}66`; ctx.lineWidth = 1; for (let y = -60; y < -38; y += 6) for (let xx = x; xx < x + w; xx += 6) { ctx.beginPath(); ctx.arc(xx + 3, y, 3, Math.PI, 0); ctx.stroke(); } });
    shading(ctx, geo, 0.06);
    ctx.strokeStyle = d.c2; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(-geo.w / 2 + 4, -73); ctx.lineTo(geo.w / 2 - 6, -46); ctx.stroke();
    rr(ctx, -geo.w / 2, -48, geo.w, 9, 2); fillStroke(ctx, d.c2, 1.5);
    rr(ctx, -geo.w / 2 + 2, -46, geo.w - 4, 2, 1); ctx.fillStyle = shade(d.c2, 0.3); ctx.fill();
  },
  pharaoh(ctx, d, geo, t, cfg) {
    torso(ctx, geo, cfg.skin || '#c98e66', 2); shading(ctx, geo, 0.05);
    for (let i = 4; i >= 0; i--) { ctx.beginPath(); ctx.ellipse(1, -74, 8 + i * 3, 4 + i * 3, 0, 0, Math.PI); ctx.closePath(); fillStroke(ctx, i % 2 ? d.c3 : d.c2, 1.1); }
    rr(ctx, -geo.w / 2, -46, geo.w, 7, 2); fillStroke(ctx, d.c2, 1.5); ctx.fillStyle = d.c3; ctx.fillRect(-geo.w / 2 + 2, -44, geo.w - 4, 2);
  },
  longcoat(ctx, d, geo) {
    longSkirt(ctx, geo, d.c, -14, 4);
    torso(ctx, geo, d.c); shading(ctx, geo, 0.05);
    ctx.strokeStyle = d.c2; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-geo.w / 2 + 2, -70); ctx.lineTo(geo.w / 2 - 2, -50); ctx.moveTo(geo.w / 2 - 2, -70); ctx.lineTo(-geo.w / 2 + 2, -50); ctx.stroke();
    rr(ctx, -8, -80, 18, 9, 4); fillStroke(ctx, shade(d.c, -0.15), 1.5);
    belt(ctx, geo, d.c2, '#9ca3af');
  },
  gearcoat(ctx, d, geo, t) {
    longSkirt(ctx, geo, d.c, -24, 3, d.c2);
    torso(ctx, geo, d.c); shading(ctx, geo, 0.06);
    ctx.strokeStyle = shade(d.c, -0.35); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(1, -72); ctx.lineTo(1, -45); ctx.stroke();
    gear(ctx, -4, -60, 4, 8, t * 1.2, d.c2); gear(ctx, 4, -54, 2.8, 6, -t * 1.7, shade(d.c2, -0.1));
    ctx.strokeStyle = d.c2; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(geo.w / 2 - 4, -62); ctx.quadraticCurveTo(geo.w / 2 - 8, -54, geo.w / 2 - 3, -50); ctx.stroke();
    belt(ctx, geo, '#2a1d14', d.c2);
  },
  scale(ctx, d, geo, t) {
    torso(ctx, geo, d.c);
    inTorso(ctx, geo, (x, w) => {
      for (let row = 0, y = TOP + 2; y < -38; y += 4.5, row++) for (let xx = x - 2 + (row % 2) * 3; xx < x + w + 3; xx += 6) {
        ctx.beginPath(); ctx.arc(xx, y, 3.2, 0, Math.PI); ctx.fillStyle = shade(d.c, row % 2 ? -0.08 : 0.06); ctx.fill(); ctx.strokeStyle = shade(d.c, -0.45); ctx.lineWidth = 0.9; ctx.stroke();
        ctx.strokeStyle = `${d.c2}66`; ctx.beginPath(); ctx.arc(xx, y + 0.5, 2, 0.3, Math.PI - 0.3); ctx.stroke();
      }
    });
    shading(ctx, geo, 0.1);
    glow(ctx, d.g, 10 + Math.sin(t * 3) * 4, () => { poly(ctx, [[1, -66], [5, -60], [1, -53], [-3, -60]]); fillStroke(ctx, d.g || d.c2, 1.2); });
    belt(ctx, geo, '#2a0d0d', d.c2);
  },
  magma(ctx, d, geo, t) {
    torso(ctx, geo, d.c);
    inTorso(ctx, geo, (x, w) => {
      const a = 0.65 + Math.sin(t * 2.5) * 0.25;
      glow(ctx, d.g, 8, () => { ctx.strokeStyle = `rgba(255,${120 + Math.sin(t * 3) * 30},40,${a})`; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x + 3, -70); ctx.lineTo(x + 8, -62); ctx.lineTo(x + 5, -55); ctx.lineTo(x + 11, -47); ctx.moveTo(x + 8, -62); ctx.lineTo(x + 15, -60); ctx.lineTo(x + w - 3, -66); ctx.moveTo(x + w - 6, -40); ctx.lineTo(x + w - 9, -50); ctx.lineTo(x + w - 4, -56); ctx.stroke(); });
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x, TOP, w * 0.25, H);
    });
    glow(ctx, d.g, 16, () => { circle(ctx, 1, -60, 3.5); ctx.fillStyle = '#ffd27a'; ctx.fill(); });
    belt(ctx, geo, '#140c08', '#ff7a2a');
  },
  stormplate(ctx, d, geo, t) {
    rr(ctx, -geo.w / 2, TOP, geo.w, H, 8); ctx.fillStyle = metal(ctx, -geo.w / 2, TOP, geo.w, H, d.c); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
    const on = Math.sin(t * 5) > 0.3 ? 1 : 0.55;
    glow(ctx, d.g, 12 * on, () => { ctx.strokeStyle = d.c2; ctx.globalAlpha *= on; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(3, -71); ctx.lineTo(-3, -60); ctx.lineTo(3, -60); ctx.lineTo(-2, -48); ctx.stroke(); });
    belt(ctx, geo, '#1e293b', d.c2);
  },
  bark(ctx, d, geo, t) {
    torso(ctx, geo, d.c);
    inTorso(ctx, geo, (x, w) => {
      ctx.strokeStyle = shade(d.c, -0.4); ctx.lineWidth = 1; for (let xx = x + 2; xx < x + w; xx += 4) { ctx.beginPath(); ctx.moveTo(xx, TOP); ctx.bezierCurveTo(xx + 2, -62, xx - 2, -52, xx + 1, -38); ctx.stroke(); }
      ctx.fillStyle = d.c2; for (const [px, py, r] of [[x + 4, -70, 4], [x + w - 5, -50, 5], [x + w * 0.5, -40, 4]]) { circle(ctx, px, py, r); ctx.fill(); }
    });
    shading(ctx, geo, 0.05);
    ctx.strokeStyle = d.c2; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-geo.w / 2, -45); ctx.bezierCurveTo(-4, -40, 4, -48, geo.w / 2, -43); ctx.stroke();
  },
  crystal(ctx, d, geo, t) {
    ctx.save(); ctx.globalAlpha *= 0.9; torso(ctx, geo, d.c); ctx.restore();
    inTorso(ctx, geo, (x, w) => {
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1;
      for (const seg of [[[x, -60], [x + w * 0.5, -72], [x + w, -58]], [[x + 3, -40], [x + w * 0.45, -58], [x + w - 4, -40]], [[x + w * 0.5, -72], [x + w * 0.45, -58]]]) { ctx.beginPath(); seg.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.stroke(); }
      const g = ctx.createRadialGradient(x + w / 2, -58, 1, x + w / 2, -58, 18); g.addColorStop(0, `${d.g}cc`); g.addColorStop(1, `${d.g}00`); ctx.fillStyle = g; ctx.fillRect(x, TOP, w, H);
    });
    belt(ctx, geo, shade(d.c, -0.5), d.c2);
  },
  demon(ctx, d, geo, t) {
    torso(ctx, geo, d.c);
    inTorso(ctx, geo, (x, w) => {
      ctx.strokeStyle = d.c2; ctx.lineWidth = 2; for (const y of [-66, -59, -52]) { ctx.beginPath(); ctx.moveTo(x, y + 3); ctx.quadraticCurveTo(x + w / 2, y - 3, x + w, y + 3); ctx.stroke(); }
      glow(ctx, d.g, 10 + Math.sin(t * 4) * 5, () => { ctx.strokeStyle = d.g; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x + w / 2, -72); ctx.lineTo(x + w / 2 - 2, -62); ctx.lineTo(x + w / 2 + 2, -54); ctx.lineTo(x + w / 2 - 1, -42); ctx.moveTo(x + w / 2 - 2, -62); ctx.lineTo(x + w / 2 - 7, -58); ctx.stroke(); });
    });
    shading(ctx, geo, 0.08); belt(ctx, geo, '#0f0708', '#7f1d1d');
    ctx.fillStyle = '#e7dcc6'; poly(ctx, [[-2, -44], [1, -36], [4, -44]]); ctx.fill();
  },
  astral(ctx, d, geo, t) {
    const x = -geo.w / 2;
    poly(ctx, [[x + 1, -46], [x + geo.w - 1, -46], [x + geo.w + 7, -10], [x - 7, -10]]); starfield(ctx, x - 8, -46, geo.w + 16, 37, t, { tint: d.g, seed: 3 }); ctx.lineWidth = 2; ctx.strokeStyle = OUT; poly(ctx, [[x + 1, -46], [x + geo.w - 1, -46], [x + geo.w + 7, -10], [x - 7, -10]]); ctx.stroke();
    rr(ctx, x, TOP, geo.w, H, 8); starfield(ctx, x, TOP, geo.w, H, t, { tint: d.g, seed: 7 }); rr(ctx, x, TOP, geo.w, H, 8); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.strokeStyle = d.c2; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - 6, -13); ctx.lineTo(x + geo.w + 6, -13); ctx.stroke(); vNeck(ctx, geo, d.c2, 2);
    glow(ctx, d.g, 8, () => { ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-5, -60); ctx.lineTo(1, -55); ctx.lineTo(6, -62); ctx.lineTo(4, -50); ctx.stroke(); for (const [a, b] of [[-5, -60], [1, -55], [6, -62], [4, -50]]) { ctx.fillStyle = '#fff'; star(ctx, a, b, 1.6); ctx.fill(); } });
    rr(ctx, x, -45, geo.w, 4, 2); fillStroke(ctx, d.c2, 1.2);
  },
  rune(ctx, d, geo, t) {
    rr(ctx, -geo.w / 2, TOP, geo.w, H, 6); ctx.fillStyle = metal(ctx, -geo.w / 2, TOP, geo.w, H, d.c); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.strokeStyle = d.c2; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-geo.w / 2 + 3, -64); ctx.lineTo(geo.w / 2 - 3, -64); ctx.moveTo(1, -64); ctx.lineTo(1, -46); ctx.stroke();
    const p = 0.55 + 0.45 * Math.sin(t * 2);
    glow(ctx, d.g, 12 * p, () => { ctx.strokeStyle = d.g; ctx.globalAlpha *= 0.5 + p * 0.5; ctx.lineWidth = 1.4; rune(ctx, -5, -56, 1); rune(ctx, 7, -56, 3); rune(ctx, 1, -69, 0, 0.8); });
    belt(ctx, geo, '#18181b', d.g);
  },
  void(ctx, d, geo, t) {
    rr(ctx, -geo.w / 2, TOP, geo.w, H + 2, 8); starfield(ctx, -geo.w / 2, TOP, geo.w, H + 2, t, { tint: d.g, seed: 5, n: 30 });
    glow(ctx, d.g, 12, () => { rr(ctx, -geo.w / 2, TOP, geo.w, H + 2, 8); ctx.strokeStyle = `${d.g}cc`; ctx.lineWidth = 1.4; ctx.stroke(); });
  },
  chrono(ctx, d, geo, t, cfg, pose) {
    torso(ctx, geo, d.c); shading(ctx, geo, 0.06);
    const dir = pose && pose.flash > 0.05 ? -4 : 1; // segredo: ao sofrer dano, o mecanismo gira ao contrário
    inTorso(ctx, geo, (x, w) => { gear(ctx, x + 2, -44, 7, 10, dir * t * 0.8, shade(d.c2, -0.25)); gear(ctx, x + w - 2, -70, 6, 9, -dir * t, shade(d.c2, -0.25)); });
    glow(ctx, d.g, 10, () => { circle(ctx, 1, -59, 8.5); fillStroke(ctx, d.c2, 1.6); });
    circle(ctx, 1, -59, 6.5); fillStroke(ctx, '#f8f1dc', 1);
    ctx.strokeStyle = '#2b2117'; ctx.lineWidth = 1.1; for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.beginPath(); ctx.moveTo(1 + Math.cos(a) * 5.4, -59 + Math.sin(a) * 5.4); ctx.lineTo(1 + Math.cos(a) * 6.2, -59 + Math.sin(a) * 6.2); ctx.stroke(); }
    ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(1, -59); ctx.lineTo(1 + Math.cos(dir * t * 2 - 1.5) * 4.6, -59 + Math.sin(dir * t * 2 - 1.5) * 4.6); ctx.moveTo(1, -59); ctx.lineTo(1 + Math.cos(dir * t * 0.2) * 3, -59 + Math.sin(dir * t * 0.2) * 3); ctx.stroke();
    belt(ctx, geo, '#1a140e', d.c2);
  },
  prism(ctx, d, geo, t) {
    rr(ctx, -geo.w / 2, TOP, geo.w, H, 7); prismFill(ctx, -geo.w / 2, TOP, geo.w, H, t);
    rr(ctx, -geo.w / 2, TOP, geo.w, H, 7); ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
    glow(ctx, '#ffffff', 14, () => { poly(ctx, [[1, -66], [6, -58], [1, -50], [-4, -58]]); ctx.fillStyle = '#fff'; ctx.fill(); });
  },
};
/** Mangas por tipo de tronco. */
export const SLEEVE = {
  gambeson: (d) => ({ c: d.c }), vest: (d) => ({ c: d.c2 }), flannel: (d) => ({ c: d.c }), gi: (d) => ({ c: d.c, wide: true }), striped: (d) => ({ c: d.c }),
  apron: (d) => ({ c: d.c2 }), tabard: () => ({ c: '#7d8592', metal: true }), furvest: (d) => ({ c: d.c }), cuirass: (d, cfg) => ({ c: cfg.skin, trim: d.c }),
  kimono: (d) => ({ c: d.c, wide: true, trim: d.c2 }), pharaoh: (d, cfg) => ({ c: cfg.skin }), longcoat: (d) => ({ c: d.c }), gearcoat: (d) => ({ c: d.c }),
  scale: (d) => ({ c: d.c, metal: true, trim: d.c2 }), magma: (d) => ({ c: d.c, metal: true, glowLine: d.g }), stormplate: (d) => ({ c: d.c, metal: true, trim: d.c2 }),
  bark: (d) => ({ c: d.c }), crystal: (d) => ({ c: d.c, metal: true, glowLine: d.g }), demon: (d) => ({ c: d.c, metal: true, glowLine: d.g }),
  astral: (d) => ({ c: d.c, wide: true, trim: d.c2 }), rune: (d) => ({ c: d.c, metal: true, glowLine: d.g }), void: (d) => ({ c: '#09090b', glowLine: d.g }),
  chrono: (d) => ({ c: d.c, metal: true, trim: d.c2 }), prism: () => ({ c: '#e0e7ff', prism: true }),
};

// ================= Quadril (saiotes) e pernas =================
export const HIP = {
  pteruges(ctx, d, geo) { for (let i = 0; i < 6; i++) { rr(ctx, -geo.w / 2 + i * (geo.w / 6), -40, geo.w / 6 - 1, 14, 1.5); fillStroke(ctx, i % 2 ? d.c : shade(d.c, -0.08), 1.1); ctx.fillStyle = d.c2; ctx.fillRect(-geo.w / 2 + i * (geo.w / 6), -29, geo.w / 6 - 1, 2); } },
  shendyt(ctx, d, geo) { poly(ctx, [[-geo.w / 2, -40], [geo.w / 2, -40], [geo.w / 2 + 3, -24], [-geo.w / 2 - 3, -24]]); fillStroke(ctx, d.c, 1.5); ctx.strokeStyle = shade(d.c, -0.25); ctx.lineWidth = 0.8; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 3, -40); ctx.lineTo(i * 3.6, -25); ctx.stroke(); } poly(ctx, [[-3, -40], [5, -40], [3, -26], [-1, -26]]); fillStroke(ctx, d.c2, 1.1); },
};
export const LEGS = {
  plated(ctx, d, { w, len, back, t }) {
    rr(ctx, -w / 2 - 1, 0, w + 2, len, 3); fillStroke(ctx, back ? shade(d.c, -0.25) : d.c, 1.6);
    ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(1, 3, 2, len - 6);
    circle(ctx, 0, len * 0.45, 3.2); fillStroke(ctx, shade(d.c, 0.15), 1.1);
    if (d.g) glow(ctx, d.g, 8, () => { ctx.strokeStyle = d.g; ctx.globalAlpha *= 0.55 + 0.35 * Math.sin(t * 3); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-w / 2 + 2, len * 0.62); ctx.lineTo(w / 2, len * 0.62); ctx.stroke(); });
    if (d.c2) { ctx.fillStyle = d.c2; ctx.fillRect(-w / 2, 1, w + 1, 2); }
  },
  void(ctx, d, { w, len, t, back }) { rr(ctx, -w / 2, 0, w, len, 4); starfield(ctx, -w / 2, 0, w, len, t, { seed: back ? 11 : 13, n: 10, tint: '#c084fc' }); },
  prism(ctx, d, { w, len, t, back }) { rr(ctx, -w / 2, 0, w, len, 4); prismFill(ctx, -w / 2, 0, w, len, t + (back ? 0.5 : 0)); rr(ctx, -w / 2, 0, w, len, 4); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.2; ctx.stroke(); },
};
export const BOOTS = {
  sandals(ctx, d, { w, len, back }) {
    const col = back ? shade(d.c, -0.2) : d.c;
    rr(ctx, -w / 2 - 1, len + 7, w + 6, 3, 1.5); fillStroke(ctx, col, 1.2);
    ctx.strokeStyle = col; ctx.lineWidth = 1.6; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-w / 2, len - 2 + i * 4); ctx.lineTo(w / 2, len + i * 4); ctx.stroke(); }
    if (d.c2) { rr(ctx, -w / 2 - 0.5, len - 16, w + 1, 14, 3); fillStroke(ctx, back ? shade(d.c2, -0.2) : d.c2, 1.3); }
  },
  wraps(ctx, d, { w, len, back }) { const col = back ? shade(d.c, -0.2) : d.c; rr(ctx, -w / 2 - 1, len - 6, w + 5, 15, 4); fillStroke(ctx, col, 1.5); ctx.strokeStyle = shade(d.c, -0.3); ctx.lineWidth = 0.9; for (let y = len - 4; y < len + 8; y += 3) { ctx.beginPath(); ctx.moveTo(-w / 2, y); ctx.lineTo(w / 2 + 3, y + 1.5); ctx.stroke(); } },
  furboots(ctx, d, { w, len, back }) { rr(ctx, -w / 2 - 1, len - 4, w + 6, 13, 4); fillStroke(ctx, back ? shade(d.c, -0.2) : d.c, 1.6); for (let i = 0; i < 3; i++) { circle(ctx, -w / 2 + 1 + i * (w / 2), len - 5, 3); fillStroke(ctx, back ? shade(d.c2, -0.2) : d.c2, 0.9); } },
  claws(ctx, d, { w, len, back }) {
    const col = back ? shade(d.c, -0.2) : d.c;
    rr(ctx, -w / 2 - 1, len - 6, w + 5, 14, 3); fillStroke(ctx, col, 1.6);
    for (let i = 0; i < 3; i++) { poly(ctx, [[w / 2 + 1 - i * 3, len + 8], [w / 2 + 6 - i * 3, len + 9], [w / 2 + 2 - i * 3, len + 5]]); fillStroke(ctx, d.c2, 0.9); }
    poly(ctx, [[-w / 2 - 1, len - 4], [-w / 2 - 5, len - 8], [-w / 2 + 1, len - 6]]); fillStroke(ctx, d.c2, 0.9);
  },
  crystalboots(ctx, d, { w, len, back }) { ctx.save(); ctx.globalAlpha *= 0.9; rr(ctx, -w / 2 - 1, len - 5, w + 6, 14, 3); fillStroke(ctx, back ? shade(d.c, -0.2) : d.c, 1.5); ctx.restore(); poly(ctx, [[-w / 2, len - 5], [-w / 2 + 2, len - 13], [-w / 2 + 4, len - 5]]); fillStroke(ctx, shade(d.c, 0.3), 1); ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-w / 2 + 2, len - 2); ctx.lineTo(w / 2 + 2, len + 4); ctx.stroke(); },
  void(ctx, d, { w, len, t, back }) { rr(ctx, -w / 2 - 1, len - 4, w + 6, 13, 4); starfield(ctx, -w / 2 - 1, len - 4, w + 6, 13, t, { seed: back ? 21 : 23, n: 6 }); glow(ctx, '#c084fc', 8, () => { rr(ctx, -w / 2 - 1, len - 4, w + 6, 13, 4); ctx.strokeStyle = '#c084fcaa'; ctx.lineWidth = 1; ctx.stroke(); }); },
  prism(ctx, d, { w, len, t, back }) { rr(ctx, -w / 2 - 1, len - 4, w + 6, 13, 3); prismFill(ctx, -w / 2 - 1, len - 4, w + 6, 13, t + (back ? 0.4 : 0)); rr(ctx, -w / 2 - 1, len - 4, w + 6, 13, 3); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.2; ctx.stroke(); },
};
export const GLOVES = {
  wraps(ctx, d, { gc }) { rr(ctx, -4.5, 17, 9, 7, 2); fillStroke(ctx, gc, 1.3); ctx.strokeStyle = shade(gc, -0.3); ctx.lineWidth = 0.8; for (let y = 18; y < 24; y += 2) { ctx.beginPath(); ctx.moveTo(-4, y); ctx.lineTo(4, y + 1); ctx.stroke(); } circle(ctx, 0, 25, 4.6); fillStroke(ctx, gc, 1.5); },
  bracers(ctx, d, { gc, skin }) { rr(ctx, -5, 12, 10, 9, 2); fillStroke(ctx, gc, 1.4); glow(ctx, d.g, 8, () => { circle(ctx, 0, 16.5, 2); ctx.fillStyle = d.g || '#38bdf8'; ctx.fill(); }); circle(ctx, 0, 25, 4.5); fillStroke(ctx, skin, 1.5); },
  claws(ctx, d, { gc }) { rr(ctx, -5, 16, 10, 8, 2); fillStroke(ctx, gc, 1.5); circle(ctx, 0, 25, 5.6); fillStroke(ctx, gc, 1.6); for (let i = -1; i <= 1; i++) { poly(ctx, [[i * 3 - 1.2, 28], [i * 3 + 1.2, 28], [i * 3 + 2, 35]]); fillStroke(ctx, d.c2 || '#e7dcc6', 0.9); } },
  prism(ctx, d, { t }) { rr(ctx, -5, 16, 10, 8, 2); prismFill(ctx, -5, 16, 10, 8, t); circle(ctx, 0, 25, 5.6); prismFill(ctx, -6, 19, 12, 12, t + 0.3); circle(ctx, 0, 25, 5.6); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke(); },
};

// ================= Cabeça =================
/** Capacetes que escondem o cabelo. */
export const HIDE_HAIR = new Set(['corinthian', 'nemes', 'dragonhelm', 'wingedhelm', 'runehelm', 'voidhood', 'viking']);
export const HELM = {
  kettle(ctx, d) { ctx.beginPath(); ctx.ellipse(2, -97, 23, 4.5, 0, 0, TAU); fillStroke(ctx, shade(d.c, -0.1)); ctx.beginPath(); ctx.moveTo(-11, -97); ctx.quadraticCurveTo(-10, -114, 3, -114); ctx.quadraticCurveTo(16, -114, 16, -97); ctx.closePath(); ctx.fillStyle = metal(ctx, -11, -114, 27, 17, d.c); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(); ctx.fillStyle = shade(d.c, -0.35); for (let x = -8; x < 15; x += 5) { circle(ctx, x, -99.5, 0.9); ctx.fill(); } },
  cap(ctx, d) { ctx.beginPath(); ctx.moveTo(-12, -90); ctx.quadraticCurveTo(-13, -107, 2, -108); ctx.quadraticCurveTo(17, -107, 16, -92); ctx.closePath(); fillStroke(ctx, d.c); rr(ctx, -13, -95, 30, 6, 3); fillStroke(ctx, shade(d.c, -0.15), 1.5); ctx.strokeStyle = shade(d.c, -0.3); ctx.lineWidth = 0.8; for (let x = -8; x < 14; x += 4) { ctx.beginPath(); ctx.moveTo(x, -104); ctx.lineTo(x + 1, -96); ctx.stroke(); } circle(ctx, 0, -109, 3.5); fillStroke(ctx, shade(d.c, 0.25), 1.2); },
  headband(ctx, d, t) { rr(ctx, -12, -99, 29, 5, 2); fillStroke(ctx, d.c, 1.4); const w = Math.sin(t * 4) * 2; ctx.beginPath(); ctx.moveTo(-11, -98); ctx.quadraticCurveTo(-20, -96 + w, -26, -92 + w); ctx.lineTo(-25, -89 + w); ctx.quadraticCurveTo(-18, -93, -11, -95); ctx.closePath(); fillStroke(ctx, d.c, 1.2); },
  bandana(ctx, d, t) { ctx.beginPath(); ctx.moveTo(-12, -91); ctx.quadraticCurveTo(-13, -106, 2, -106); ctx.quadraticCurveTo(16, -106, 16, -95); ctx.quadraticCurveTo(4, -97, -12, -91); ctx.closePath(); fillStroke(ctx, d.c); ctx.fillStyle = '#fff'; for (const [x, y] of [[-4, -101], [4, -102], [10, -99]]) { circle(ctx, x, y, 0.9); ctx.fill(); } const w = Math.sin(t * 4) * 1.5; poly(ctx, [[-12, -94], [-19, -90 + w], [-17, -86 + w], [-11, -91]]); fillStroke(ctx, d.c, 1.1); },
  feathercap(ctx, d, t) { poly(ctx, [[-13, -93], [19, -96], [8, -101], [-2, -112], [-10, -104]]); fillStroke(ctx, d.c); ctx.strokeStyle = shade(d.c, -0.3); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-12, -95); ctx.lineTo(18, -97); ctx.stroke(); const s = Math.sin(t * 2) * 0.05; ctx.save(); ctx.translate(-6, -100); ctx.rotate(-0.9 + s); ctx.beginPath(); ctx.ellipse(0, -9, 2.6, 11, 0, 0, TAU); fillStroke(ctx, d.c2, 1.1); ctx.strokeStyle = shade(d.c2, -0.4); ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(0, -19); ctx.stroke(); ctx.restore(); },
  viking(ctx, d) { ctx.beginPath(); ctx.moveTo(-13, -88); ctx.quadraticCurveTo(-13, -108, 3, -108); ctx.quadraticCurveTo(18, -108, 18, -88); ctx.closePath(); ctx.fillStyle = metal(ctx, -13, -108, 31, 20, d.c); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(); ctx.strokeStyle = shade(d.c, -0.35); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(3, -108); ctx.lineTo(3, -94); ctx.moveTo(-13, -96); ctx.lineTo(18, -96); ctx.stroke(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(9, -89, 4.2, Math.PI * 1.1, Math.PI * 2.1); ctx.stroke(); rr(ctx, 12, -93, 3, 10, 1); fillStroke(ctx, shade(d.c, -0.05), 1.2); },
  corinthian(ctx, d, t) {
    ctx.save(); ctx.translate(-2, -110); for (let i = 0; i < 14; i++) { const a = -2.6 + i * 0.16; ctx.strokeStyle = shade(d.c2, (i % 3) * 0.08); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * (14 + Math.sin(t * 3 + i) * 0.6), Math.sin(a) * 12 - 2); ctx.stroke(); } ctx.restore();
    ctx.beginPath(); ctx.moveTo(-14, -82); ctx.quadraticCurveTo(-16, -108, 3, -109); ctx.quadraticCurveTo(19, -108, 19, -92); ctx.lineTo(17, -76); ctx.lineTo(10, -74); ctx.lineTo(10, -86); ctx.lineTo(5, -86); ctx.lineTo(4, -76); ctx.lineTo(-6, -74); ctx.closePath();
    ctx.fillStyle = metal(ctx, -14, -109, 33, 35, d.c); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.fillStyle = '#0b0b12'; ctx.fillRect(5, -93, 13, 3); ctx.fillRect(7, -91, 3, 6);
  },
  jingasa(ctx, d) { poly(ctx, [[-22, -95], [26, -95], [2, -113]]); fillStroke(ctx, d.c); ctx.strokeStyle = shade(d.c, -0.3); ctx.lineWidth = 0.8; for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(2, -113); ctx.lineTo(-22 + i * 8, -95); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(-12, -101); ctx.lineTo(16, -101); ctx.stroke(); ctx.strokeStyle = d.c2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-6, -95); ctx.quadraticCurveTo(-2, -76, 8, -76); ctx.stroke(); },
  nemes(ctx, d) {
    ctx.beginPath(); ctx.moveTo(-14, -74); ctx.lineTo(-16, -96); ctx.quadraticCurveTo(-12, -110, 3, -109); ctx.quadraticCurveTo(17, -108, 17, -96); ctx.lineTo(14, -97); ctx.quadraticCurveTo(4, -100, -5, -96); ctx.lineTo(-6, -76); ctx.closePath();
    ctx.save(); ctx.clip(); for (let y = -112; y < -70; y += 4) { ctx.fillStyle = (y / 4) % 2 ? d.c : d.c2; ctx.fillRect(-20, y, 40, 4); } ctx.restore(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
    rr(ctx, -6, -100, 22, 4, 1.5); fillStroke(ctx, d.c, 1.2);
    ctx.fillStyle = d.c; ctx.beginPath(); ctx.moveTo(14, -102); ctx.quadraticCurveTo(18, -108, 15, -110); ctx.quadraticCurveTo(13, -106, 13, -101); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.stroke();
  },
  plaguehat(ctx, d) { ctx.beginPath(); ctx.ellipse(2, -98, 25, 5, -0.05, 0, TAU); fillStroke(ctx, d.c); rr(ctx, -9, -118, 22, 21, 3); fillStroke(ctx, shade(d.c, 0.06)); rr(ctx, -9, -103, 22, 4, 1); fillStroke(ctx, '#6b4a2b', 1.2); },
  goggles(ctx, d) { ctx.beginPath(); ctx.ellipse(2, -98, 20, 4.5, 0, 0, TAU); fillStroke(ctx, d.c); rr(ctx, -8, -124, 20, 27, 3); fillStroke(ctx, shade(d.c, 0.05)); rr(ctx, -8, -106, 20, 5, 1); fillStroke(ctx, '#4a3222', 1.2); for (const x of [-2, 7]) { circle(ctx, x, -103.5, 4.2); fillStroke(ctx, d.c2, 1.4); circle(ctx, x, -103.5, 2.6); ctx.fillStyle = '#7dd3fc'; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(x - 1.5, -105, 1.2, 1.2); } },
  dragonhelm(ctx, d, t) {
    for (const s of [1, 0.85]) { ctx.save(); ctx.translate(-6, -104); ctx.scale(s, s); ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-14, -6, -26, -2, -30, 10); ctx.bezierCurveTo(-22, 2, -12, 2, -2, 6); ctx.closePath(); fillStroke(ctx, s === 1 ? d.c2 : shade(d.c2, -0.2), 1.4); ctx.restore(); }
    ctx.beginPath(); ctx.moveTo(-14, -84); ctx.quadraticCurveTo(-16, -108, 3, -109); ctx.quadraticCurveTo(20, -108, 22, -92); ctx.lineTo(25, -86); ctx.lineTo(17, -80); ctx.lineTo(14, -74); ctx.lineTo(-6, -74); ctx.closePath();
    ctx.fillStyle = metal(ctx, -14, -109, 39, 35, d.c); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.strokeStyle = d.c2; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(18, -84); ctx.lineTo(13, -80); ctx.lineTo(9, -82); ctx.stroke();
    for (let i = 0; i < 4; i++) { poly(ctx, [[-10 + i * 5, -106 + i * 0.5], [-8 + i * 5, -114 + i], [-5 + i * 5, -106]]); fillStroke(ctx, d.c2, 1); }
    glow(ctx, d.g, 12 + Math.sin(t * 4) * 4, () => { poly(ctx, [[7, -93], [17, -92], [15, -89], [8, -90]]); ctx.fillStyle = d.g; ctx.fill(); });
  },
  flamecrown(ctx, d, t) { for (let i = 0; i < 5; i++) glow(ctx, d.g, 12, () => flameTongue(ctx, -7 + i * 4.5, -100, 13 + (i % 2) * 5, 3, t, i)); rr(ctx, -10, -102, 25, 5, 2); fillStroke(ctx, d.c, 1.5); for (let i = 0; i < 4; i++) { ctx.fillStyle = '#ff9a3c'; circle(ctx, -6 + i * 6, -99.5, 1.1); ctx.fill(); } },
  wingedhelm(ctx, d, t) {
    const f = Math.sin(t * 2) * 0.05;
    for (const s of [-1, 1]) { ctx.save(); ctx.translate(s < 0 ? -12 : 15, -100); ctx.rotate((s < 0 ? -0.35 : 0.35) + f * s); for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(s * (4 + i * 3), -6 - i * 3, 2.6, 9 - i, s * (0.9 - i * 0.2), 0, TAU); fillStroke(ctx, shade(d.c2, -i * 0.08), 1); } ctx.restore(); }
    ctx.beginPath(); ctx.moveTo(-13, -84); ctx.quadraticCurveTo(-14, -108, 3, -108); ctx.quadraticCurveTo(18, -108, 18, -90); ctx.lineTo(16, -82); ctx.lineTo(-13, -84); ctx.closePath(); ctx.fillStyle = metal(ctx, -13, -108, 31, 26, d.c); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.fillStyle = '#0b0b12'; ctx.fillRect(4, -93, 13, 3); rr(ctx, 9, -92, 3, 10, 1); fillStroke(ctx, d.c, 1);
    glow(ctx, d.g, 10, () => { ctx.strokeStyle = d.g; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-10, -100); ctx.lineTo(16, -100); ctx.stroke(); });
  },
  antlers(ctx, d) {
    ctx.strokeStyle = OUT; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
    const branch = (sx, dir) => { ctx.beginPath(); ctx.moveTo(sx, -100); ctx.quadraticCurveTo(sx + dir * 6, -112, sx + dir * 4, -124); ctx.moveTo(sx + dir * 3, -108); ctx.lineTo(sx + dir * 12, -114); ctx.moveTo(sx + dir * 5, -116); ctx.lineTo(sx + dir * 13, -125); ctx.stroke(); };
    branch(-4, -1); branch(10, 1); ctx.strokeStyle = d.c; ctx.lineWidth = 2.6; branch(-4, -1); branch(10, 1);
    rr(ctx, -11, -101, 27, 4, 2); fillStroke(ctx, d.c2, 1.2);
    for (const [x, a] of [[-8, -0.5], [2, 0], [12, 0.5]]) { ctx.save(); ctx.translate(x, -101); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, -4, 2.2, 4.5, 0, 0, TAU); fillStroke(ctx, shade(d.c2, 0.15), 0.9); ctx.restore(); }
  },
  icecrown(ctx, d, t) { glow(ctx, d.g, 14 + Math.sin(t * 2) * 4, () => { for (const [x, h, w] of [[-9, 12, 3], [-3, 18, 3.5], [3, 24, 4], [9, 17, 3.5], [14, 11, 3]]) { poly(ctx, [[x - w, -99], [x, -99 - h], [x + w, -99]]); ctx.save(); ctx.globalAlpha *= 0.88; fillStroke(ctx, d.c, 1.2); ctx.restore(); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x, -99 - h); ctx.lineTo(x - w * 0.4, -100); ctx.stroke(); } }); rr(ctx, -12, -101, 29, 4, 2); fillStroke(ctx, shade(d.c, -0.15), 1.2); },
  demonhorns(ctx, d, t) {
    for (const [s, x] of [[-1, -6], [1, 12]]) {
      ctx.save(); ctx.translate(x, -100);
      const g = ctx.createLinearGradient(0, 0, s * 22, -26); g.addColorStop(0, d.c); g.addColorStop(1, shade(d.c2, 0.25));
      ctx.beginPath(); ctx.moveTo(-3, 0); ctx.bezierCurveTo(s * 10, -10, s * 26, -6, s * 22, -28); ctx.bezierCurveTo(s * 18, -12, s * 8, -8, 4, -2); ctx.closePath(); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 0.8; for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(s * i * 5, -i * 3); ctx.lineTo(s * (i * 5 + 3), -i * 3 - 3); ctx.stroke(); }
      glow(ctx, d.g, 10, () => { circle(ctx, s * 22, -28, 1.6); ctx.fillStyle = d.g; ctx.fill(); });
      ctx.restore();
    }
  },
  halo(ctx, d, t) {
    const y = -118 + Math.sin(t * 2) * 1.5;
    glow(ctx, d.g, 16, () => { ctx.strokeStyle = d.c; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(2, y, 14, 3.6, 0, 0, TAU); ctx.stroke(); });
    for (let i = 0; i < 3; i++) { const a = t * 1.5 + (i * TAU) / 3; if (Math.sin(a) < 0) continue; ctx.fillStyle = '#fff'; star(ctx, 2 + Math.cos(a) * 14, y + Math.sin(a) * 3.6, 1.8); ctx.fill(); }
    ctx.strokeStyle = d.c2; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(2, -99, 14, 3.5, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke(); glow(ctx, d.c2, 8, () => { circle(ctx, 14, -98, 1.8); ctx.fillStyle = d.c2; ctx.fill(); });
  },
  runehelm(ctx, d, t) {
    for (const s of [-1]) { poly(ctx, [[-12, -100], [-24, -112], [-14, -94]]); fillStroke(ctx, d.c2, 1.3); }
    poly(ctx, [[-14, -78], [-15, -102], [-6, -111], [10, -111], [19, -102], [20, -86], [14, -76], [-2, -74]]);
    ctx.fillStyle = metal(ctx, -15, -111, 35, 37, d.c); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
    const p = 0.6 + 0.4 * Math.sin(t * 2.4);
    glow(ctx, d.g, 14 * p, () => { ctx.fillStyle = d.g; ctx.globalAlpha *= 0.6 + p * 0.4; poly(ctx, [[5, -94], [19, -93], [18, -90], [6, -91]]); ctx.fill(); ctx.strokeStyle = d.g; ctx.lineWidth = 1.1; rune(ctx, -3, -103, 2, 0.8); });
  },
  voidhood(ctx, d, t) {
    ctx.beginPath(); ctx.moveTo(-15, -74); ctx.quadraticCurveTo(-20, -108, 2, -110); ctx.quadraticCurveTo(21, -109, 20, -88); ctx.quadraticCurveTo(19, -76, 14, -72); ctx.quadraticCurveTo(15, -84, 12, -96); ctx.quadraticCurveTo(4, -101, -1, -96); ctx.quadraticCurveTo(-6, -88, -5, -74); ctx.closePath();
    starfield(ctx, -20, -112, 42, 42, t, { tint: d.g, seed: 9, n: 18 });
    glow(ctx, d.g, 10, () => { ctx.beginPath(); ctx.moveTo(-15, -74); ctx.quadraticCurveTo(-20, -108, 2, -110); ctx.quadraticCurveTo(21, -109, 20, -88); ctx.strokeStyle = `${d.g}bb`; ctx.lineWidth = 1.4; ctx.stroke(); });
  },
  chronocrown(ctx, d, t) {
    gear(ctx, 2, -112, 8, 12, -t * 0.6, shade(d.c, -0.2), 1.2);
    poly(ctx, [[-10, -99], [-12, -110], [-5, -104], [2, -114], [9, -104], [16, -110], [14, -99]]); ctx.fillStyle = metal(ctx, -12, -114, 28, 15, d.c); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = OUT; ctx.stroke();
    glow(ctx, d.g, 10, () => { circle(ctx, 2, -104, 4); fillStroke(ctx, d.c2, 1.1); });
    ctx.strokeStyle = '#2b2117'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(2, -104); ctx.lineTo(2 + Math.cos(t * 3) * 3, -104 + Math.sin(t * 3) * 3); ctx.moveTo(2, -104); ctx.lineTo(2 + Math.cos(t * 0.3) * 2, -104 + Math.sin(t * 0.3) * 2); ctx.stroke();
  },
  prismcrown(ctx, d, t) { glow(ctx, '#fff', 14, () => { for (const [x, h, i] of [[-9, 12, 0], [-3, 19, 1], [3, 26, 2], [9, 19, 3], [15, 12, 4]]) { poly(ctx, [[x - 3.4, -99], [x, -99 - h], [x + 3.4, -99]]); ctx.fillStyle = hue(t, i * 60, 90, 75, 0.9); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1; ctx.stroke(); } }); rr(ctx, -12, -101, 29, 4, 2); ctx.fillStyle = '#f8fafc'; ctx.fill(); },
};
export const MASK = {
  beak(ctx, d) { ctx.beginPath(); ctx.moveTo(6, -92); ctx.quadraticCurveTo(30, -88, 34, -74); ctx.quadraticCurveTo(22, -78, 6, -78); ctx.closePath(); fillStroke(ctx, d.c, 1.6); ctx.strokeStyle = shade(d.c, -0.3); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(10, -85); ctx.quadraticCurveTo(22, -84, 30, -77); ctx.stroke(); circle(ctx, 9, -90, 3.6); fillStroke(ctx, '#1f2937', 1.4); ctx.fillStyle = 'rgba(163,230,53,.65)'; circle(ctx, 9, -90, 2.4); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(9.5, -91.5, 1, 1); },
  kitsune(ctx, d) { ctx.beginPath(); ctx.moveTo(-1, -100); ctx.quadraticCurveTo(10, -104, 17, -96); ctx.lineTo(21, -82); ctx.quadraticCurveTo(14, -73, 4, -76); ctx.quadraticCurveTo(-2, -86, -1, -100); ctx.closePath(); fillStroke(ctx, d.c, 1.5); for (const x of [2, 13]) { poly(ctx, [[x - 3, -100], [x, -110], [x + 4, -99]]); fillStroke(ctx, d.c, 1.2); poly(ctx, [[x - 1, -101], [x + 0.5, -106], [x + 2, -100]]); ctx.fillStyle = d.c2; ctx.fill(); } ctx.strokeStyle = d.c2; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(6, -92); ctx.quadraticCurveTo(10, -95, 14, -91); ctx.moveTo(7, -84); ctx.lineTo(12, -83); ctx.stroke(); ctx.fillStyle = OUT; poly(ctx, [[7, -90], [13, -91], [12, -88], [8, -88]]); ctx.fill(); ctx.fillStyle = d.c2; circle(ctx, 19, -82, 1.4); ctx.fill(); },
  oni(ctx, d, t) { ctx.beginPath(); ctx.moveTo(-1, -98); ctx.quadraticCurveTo(10, -103, 17, -96); ctx.lineTo(18, -80); ctx.quadraticCurveTo(10, -71, 1, -76); ctx.closePath(); fillStroke(ctx, d.c, 1.6); ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(4, -96); ctx.lineTo(14, -92); ctx.stroke(); glow(ctx, d.g, 10 + Math.sin(t * 5) * 4, () => { poly(ctx, [[7, -91], [15, -90], [13, -87], [8, -88]]); ctx.fillStyle = d.g; ctx.fill(); }); ctx.fillStyle = '#f5f5f4'; for (const x of [6, 13]) { poly(ctx, [[x, -79], [x + 2, -79], [x + 1, -74]]); ctx.fill(); } ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(4, -80); ctx.quadraticCurveTo(10, -77, 16, -80); ctx.stroke(); },
  voidface(ctx, d, t) {
    ctx.beginPath(); ctx.ellipse(3, -87, 12.5, 13.5, 0, 0, TAU); starfield(ctx, -10, -101, 26, 28, t, { tint: '#7c3aed', seed: 17, n: 14 });
    const secret = (t % 11) < 0.9; // detalhe oculto: por um instante, as estrelas desenham um "E"
    if (secret) { ctx.strokeStyle = 'rgba(233,213,255,.9)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(10, -95); ctx.lineTo(4, -95); ctx.lineTo(4, -80); ctx.lineTo(10, -80); ctx.moveTo(4, -88); ctx.lineTo(8, -88); ctx.stroke(); for (const [x, y] of [[10, -95], [4, -95], [4, -88], [8, -88], [4, -80], [10, -80]]) { ctx.fillStyle = '#fff'; star(ctx, x, y, 1.6); ctx.fill(); } return; }
    const blink = Math.sin(t * 0.7) > 0.97 ? 0.15 : 1;
    glow(ctx, d.g, 12, () => { ctx.fillStyle = d.g; for (const x of [6, 13]) { ctx.beginPath(); ctx.ellipse(x, -89, 1.8, 2.4 * blink, 0, 0, TAU); ctx.fill(); } });
  },
  prism(ctx, d, t) { glow(ctx, '#fff', 10, () => { poly(ctx, [[0, -95], [19, -94], [18, -86], [2, -86]]); ctx.save(); ctx.clip(); const g = ctx.createLinearGradient(0, -95, 19, -86); for (let i = 0; i <= 3; i++) g.addColorStop(i / 3, hue(t, i * 90, 90, 70, 0.9)); ctx.fillStyle = g; ctx.fillRect(0, -96, 20, 11); ctx.restore(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.1; poly(ctx, [[0, -95], [19, -94], [18, -86], [2, -86]]); ctx.stroke(); }); },
};

// ================= Armas =================
export const WEAPON = {
  quarterstaff(ctx, d) { rr(ctx, -2, -62, 4, 92, 2); fillStroke(ctx, d.c, 1.5); for (const y of [-58, 22]) { rr(ctx, -2.6, y, 5.2, 5, 1); fillStroke(ctx, d.c2 || shade(d.c, -0.3), 1); } },
  beardaxe(ctx, d) {
    ctx.save(); if (d.big) ctx.scale(1.2, 1.2);
    rr(ctx, -2, -40, 4, 54, 2); fillStroke(ctx, d.c2, 1.5);
    ctx.beginPath(); ctx.moveTo(2, -38); ctx.quadraticCurveTo(14, -44, 20, -40); ctx.quadraticCurveTo(22, -28, 16, -16); ctx.quadraticCurveTo(12, -20, 10, -26); ctx.lineTo(2, -26); ctx.closePath(); fillStroke(ctx, d.c, 1.6);
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(19, -39); ctx.quadraticCurveTo(21, -28, 16, -18); ctx.stroke();
    ctx.restore();
  },
  saber(ctx, d) { rr(ctx, -2, -2, 4, 11, 2); fillStroke(ctx, '#3a2a1a', 1.4); ctx.strokeStyle = d.c2; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(1, 2, 6, -1.4, 1.6); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-2.5, -4); ctx.quadraticCurveTo(-1, -26, 7, -44); ctx.lineTo(8, -40); ctx.quadraticCurveTo(3, -24, 2.5, -4); ctx.closePath(); fillStroke(ctx, d.c, 1.4); },
  smithhammer(ctx, d) { rr(ctx, -2, -28, 4, 40, 2); fillStroke(ctx, d.c2, 1.5); rr(ctx, -9, -38, 18, 11, 2); ctx.fillStyle = metal(ctx, -9, -38, 18, 11, d.c); ctx.fill(); ctx.lineWidth = 1.7; ctx.strokeStyle = OUT; ctx.stroke(); rr(ctx, 7, -37, 3, 9, 1); fillStroke(ctx, shade(d.c, -0.3), 1); },
  khopesh(ctx, d) { rr(ctx, -2, -2, 4, 12, 2); fillStroke(ctx, d.c2, 1.4); rr(ctx, -2.5, -22, 5, 20, 1); fillStroke(ctx, d.c, 1.4); ctx.beginPath(); ctx.moveTo(-2.5, -22); ctx.bezierCurveTo(-4, -40, 18, -50, 20, -32); ctx.bezierCurveTo(14, -40, 4, -36, 2.5, -22); ctx.closePath(); ctx.fillStyle = metal(ctx, -4, -50, 24, 28, d.c); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke(); },
  lanternstaff(ctx, d, t) {
    rr(ctx, -2, -60, 4, 84, 2); fillStroke(ctx, d.c, 1.5);
    ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -60); ctx.quadraticCurveTo(0, -70, 10, -68); ctx.stroke(); ctx.strokeStyle = d.c; ctx.lineWidth = 2.4; ctx.stroke();
    const sw = Math.sin(t * 2) * 0.25; ctx.save(); ctx.translate(10, -68); ctx.rotate(sw); ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 6); ctx.stroke();
    glow(ctx, d.g, 18 + Math.sin(t * 5) * 6, () => { rr(ctx, -4.5, 6, 9, 12, 2); fillStroke(ctx, `${d.g}`, 1.4); }); ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, 18); ctx.moveTo(-4.5, 12); ctx.lineTo(4.5, 12); ctx.stroke(); ctx.restore();
  },
  odachi(ctx, d, t) { rr(ctx, -2, -2, 4, 17, 2); fillStroke(ctx, d.c2, 1.5); ctx.beginPath(); ctx.ellipse(0, -3, 6, 2.5, 0, 0, TAU); fillStroke(ctx, '#c9a24a', 1.1); glow(ctx, d.g, 10 + Math.sin(t * 3) * 4, () => { ctx.beginPath(); ctx.moveTo(-2, -6); ctx.quadraticCurveTo(-5, -40, 3, -76); ctx.lineTo(5, -73); ctx.quadraticCurveTo(0, -40, 2.5, -6); ctx.closePath(); fillStroke(ctx, d.c, 1.4); }); ctx.strokeStyle = `${d.g}aa`; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(1, -10); ctx.quadraticCurveTo(-1, -40, 3.5, -70); ctx.stroke(); },
  gearmace(ctx, d, t) { rr(ctx, -2, -30, 4, 42, 2); fillStroke(ctx, d.c2, 1.5); gear(ctx, 0, -38, 8, 10, t * 2, d.c, 1.6); glow(ctx, '#fbbf24', 8, () => { circle(ctx, 0, -38, 2.6); ctx.fillStyle = '#fde68a'; ctx.fill(); }); },
  dragonblade(ctx, d, t) {
    rr(ctx, -2, -2, 4, 13, 2); fillStroke(ctx, d.c2, 1.4);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, -5); ctx.quadraticCurveTo(s * 10, -2, s * 14, -10); ctx.quadraticCurveTo(s * 8, -8, 0, -8); ctx.closePath(); fillStroke(ctx, d.c2, 1.2); }
    const pts = [[-4.5, -8]]; for (let y = -12; y > -52; y -= 6) pts.push([-4.5 - ((y / 6) % 2 ? 1.6 : 0), y]); pts.push([0, -62]); for (let y = -52; y < -8; y += 6) pts.push([4.5 + ((y / 6) % 2 ? 1.6 : 0), y]); pts.push([4.5, -8]);
    poly(ctx, pts); ctx.fillStyle = metal(ctx, -6, -62, 12, 54, d.c); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = OUT; ctx.stroke();
    glow(ctx, d.g, 10 + Math.sin(t * 4) * 4, () => { ctx.strokeStyle = d.g; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, -54); ctx.stroke(); });
  },
  magmablade(ctx, d, t) {
    rr(ctx, -2, -2, 4, 15, 2); fillStroke(ctx, '#140c08', 1.4); rr(ctx, -11, -6, 22, 5, 2); fillStroke(ctx, d.c, 1.4);
    poly(ctx, [[-5, -6], [-5.5, -60], [0, -70], [5.5, -60], [5, -6]]); fillStroke(ctx, d.c, 1.6);
    glow(ctx, d.g, 14 + Math.sin(t * 6) * 5, () => { ctx.strokeStyle = `rgba(255,${130 + Math.sin(t * 4) * 40},40,.95)`; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-2, -22); ctx.lineTo(1.5, -34); ctx.lineTo(-1.5, -48); ctx.lineTo(0.5, -62); ctx.moveTo(-2, -22); ctx.lineTo(-4.5, -26); ctx.moveTo(1.5, -34); ctx.lineTo(4.5, -38); ctx.stroke(); });
    for (let i = 0; i < 3; i++) { const ph = (t * 1.2 + i / 3) % 1; ctx.fillStyle = `rgba(255,150,60,${1 - ph})`; circle(ctx, Math.sin(t * 3 + i) * 5, -20 - ph * 50, 1.4); ctx.fill(); }
  },
  trident(ctx, d, t) {
    rr(ctx, -1.8, -50, 3.6, 76, 1.8); fillStroke(ctx, d.c2, 1.4);
    ctx.save(); ctx.translate(0, -50);
    rr(ctx, -9, -3, 18, 4, 2); fillStroke(ctx, d.c, 1.3);
    for (const x of [-8, 0, 8]) { poly(ctx, [[x - 1.8, -2], [x - 1.8, x ? -14 : -18], [x, x ? -20 : -25], [x + 1.8, x ? -14 : -18], [x + 1.8, -2]]); fillStroke(ctx, d.c, 1.2); }
    if (Math.sin(t * 7) > 0.7) glow(ctx, d.g, 14, () => { ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(4, -32); ctx.lineTo(-2, -38); ctx.lineTo(3, -46); ctx.stroke(); });
    ctx.restore();
  },
  vinestaff(ctx, d, t) {
    ctx.strokeStyle = OUT; ctx.lineWidth = 5.5; ctx.lineCap = 'round'; const path = () => { ctx.beginPath(); ctx.moveTo(0, 22); ctx.bezierCurveTo(-4, 0, 4, -20, -1, -40); ctx.bezierCurveTo(-4, -50, 4, -56, 2, -62); ctx.stroke(); };
    path(); ctx.strokeStyle = d.c; ctx.lineWidth = 3.4; path();
    ctx.strokeStyle = d.c2; ctx.lineWidth = 1.2; ctx.beginPath(); for (let y = 18; y > -56; y -= 4) ctx.lineTo(Math.sin(y * 0.4) * 3, y); ctx.stroke();
    for (const [x, y, a] of [[3, -30, 0.6], [-4, -12, -0.6], [3, -48, 0.8]]) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, -3, 2, 4, 0, 0, TAU); fillStroke(ctx, d.c2, 0.9); ctx.restore(); }
    glow(ctx, d.g, 14 + Math.sin(t * 2.5) * 6, () => { circle(ctx, 2, -65, 4); ctx.fillStyle = d.g; ctx.fill(); });
  },
  iceblade(ctx, d, t) {
    rr(ctx, -2, -2, 4, 12, 2); fillStroke(ctx, '#0c4a6e', 1.4);
    for (const s of [-1, 1]) { poly(ctx, [[0, -4], [s * 9, -10], [s * 3, -6]]); fillStroke(ctx, d.c, 1); }
    glow(ctx, d.g, 12 + Math.sin(t * 2) * 4, () => { poly(ctx, [[-4, -6], [-6, -36], [-1, -58], [0, -66], [3, -50], [6, -30], [4, -6]]); ctx.save(); ctx.globalAlpha *= 0.88; fillStroke(ctx, d.c, 1.4); ctx.restore(); });
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-1, -8); ctx.lineTo(-3, -36); ctx.lineTo(0, -60); ctx.moveTo(-3, -36); ctx.lineTo(4, -32); ctx.stroke();
  },
  demonblade(ctx, d, t) {
    rr(ctx, -2, -2, 4, 13, 2); fillStroke(ctx, '#0f0708', 1.4);
    poly(ctx, [[-10, -4], [-6, -9], [6, -9], [10, -4], [6, -6], [-6, -6]]); fillStroke(ctx, d.c2, 1.2);
    ctx.beginPath(); ctx.moveTo(-4, -9); ctx.lineTo(-7, -26); ctx.lineTo(-3, -30); ctx.lineTo(-6, -46); ctx.quadraticCurveTo(0, -62, 8, -66); ctx.quadraticCurveTo(4, -52, 5, -40); ctx.lineTo(8, -34); ctx.lineTo(4, -28); ctx.lineTo(4, -9); ctx.closePath(); fillStroke(ctx, d.c, 1.6);
    const p = 0.5 + 0.5 * Math.sin(t * 3);
    glow(ctx, d.g, 12 * p + 4, () => { ctx.strokeStyle = d.g; ctx.globalAlpha *= 0.5 + p * 0.5; ctx.lineWidth = 1.1; rune(ctx, 0, -20, 4, 0.7); rune(ctx, -1, -36, 1, 0.7); rune(ctx, 1, -50, 3, 0.6); });
  },
  astralstaff(ctx, d, t) {
    rr(ctx, -1.8, -50, 3.6, 76, 1.8); fillStroke(ctx, d.c, 1.4);
    ctx.strokeStyle = d.c2; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -58, 8, Math.PI * 0.2, Math.PI * 1.65); ctx.stroke();
    glow(ctx, d.g, 16, () => { circle(ctx, 0, -58, 3.4); ctx.fillStyle = '#fff'; ctx.fill(); });
    for (let i = 0; i < 3; i++) { const a = t * 2 + (i * TAU) / 3; ctx.fillStyle = i ? d.c2 : '#fde68a'; glow(ctx, d.g, 8, () => { circle(ctx, Math.cos(a) * 13, -58 + Math.sin(a) * 5, 1.8); ctx.fill(); }); }
  },
  runeblade(ctx, d, t) {
    rr(ctx, -2, -2, 4, 13, 2); fillStroke(ctx, d.c2, 1.4); rr(ctx, -9, -6, 18, 4, 1); fillStroke(ctx, d.c, 1.3);
    poly(ctx, [[-5.5, -6], [-5.5, -56], [0, -64], [5.5, -56], [5.5, -6]]); ctx.fillStyle = metal(ctx, -6, -64, 12, 58, d.c); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = OUT; ctx.stroke();
    const p = 0.55 + 0.45 * Math.sin(t * 2.2);
    glow(ctx, d.g, 12 * p, () => { ctx.strokeStyle = d.g; ctx.globalAlpha *= 0.5 + p * 0.5; ctx.lineWidth = 1.1; for (let i = 0; i < 4; i++) rune(ctx, 0, -14 - i * 11, i, 0.65); });
  },
  voidblade(ctx, d, t) {
    rr(ctx, -2, -2, 4, 13, 2); fillStroke(ctx, '#18181b', 1.4); circle(ctx, 0, -4, 3.5); fillStroke(ctx, '#27272a', 1.1);
    poly(ctx, [[-5, -7], [-5, -54], [0, -66], [5, -54], [5, -7]]); starfield(ctx, -6, -66, 12, 60, t, { tint: d.g, seed: 41, n: 14 });
    glow(ctx, d.g, 14, () => { poly(ctx, [[-5, -7], [-5, -54], [0, -66], [5, -54], [5, -7]]); ctx.strokeStyle = `${d.g}`; ctx.lineWidth = 1.3; ctx.stroke(); });
  },
  clockspear(ctx, d, t) {
    rr(ctx, -1.8, -50, 3.6, 76, 1.8); fillStroke(ctx, d.c2, 1.4);
    glow(ctx, d.g, 10, () => { poly(ctx, [[-3, -50], [-6, -54], [0, -74], [6, -54], [3, -50]]); ctx.fillStyle = metal(ctx, -6, -74, 12, 24, d.c); ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = OUT; ctx.stroke(); });
    circle(ctx, 0, -60, 2.2); ctx.fillStyle = OUT; ctx.fill();
    gear(ctx, 0, -46, 5, 10, t * 1.3, d.c, 1.1);
  },
  prismblade(ctx, d, t) {
    rr(ctx, -2, -2, 4, 13, 2); fillStroke(ctx, '#f8fafc', 1.4);
    poly(ctx, [[-5, -6], [-6, -40], [0, -68], [6, -40], [5, -6]]); prismFill(ctx, -6, -68, 12, 62, t);
    poly(ctx, [[-5, -6], [-6, -40], [0, -68], [6, -40], [5, -6]]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.3; ctx.stroke();
    for (let i = 0; i < 3; i++) { ctx.strokeStyle = hue(t, i * 120, 90, 70, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -60); ctx.lineTo(Math.cos(t + i * 2) * 14, -60 - 10 - i * 3); ctx.stroke(); }
  },
};
// ================= Escudos (centro em 0,0) =================
export const SHIELD = {
  buckler(ctx, d) { circle(ctx, 0, 0, 9.5); ctx.fillStyle = metal(ctx, -10, -10, 20, 20, d.c); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(); circle(ctx, 0, 0, 3.4); fillStroke(ctx, d.c2, 1.2); },
  heater(ctx, d) { ctx.beginPath(); ctx.moveTo(-12, -15); ctx.lineTo(12, -15); ctx.lineTo(12, -2); ctx.quadraticCurveTo(10, 12, 0, 19); ctx.quadraticCurveTo(-10, 12, -12, -2); ctx.closePath(); fillStroke(ctx, d.c, 2.2); ctx.strokeStyle = d.c2; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = d.c2; poly(ctx, [[-9, 2], [0, -8], [9, 2], [9, 6], [0, -3], [-9, 6]]); ctx.fill(); },
  viking(ctx, d) { circle(ctx, 0, 0, 15.5); fillStroke(ctx, d.c, 2.2); ctx.save(); circle(ctx, 0, 0, 15); ctx.clip(); ctx.fillStyle = d.c2; for (let i = 0; i < 3; i++) { ctx.save(); ctx.rotate((i * TAU) / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(10, -3, 12, -12); ctx.quadraticCurveTo(4, -6, 0, -3); ctx.fill(); ctx.restore(); } ctx.restore(); ctx.strokeStyle = '#8f98a6'; ctx.lineWidth = 2; circle(ctx, 0, 0, 14.5); ctx.stroke(); circle(ctx, 0, 0, 4); fillStroke(ctx, '#b8c0cb', 1.2); },
  hoplon(ctx, d) { circle(ctx, 0, 0, 16.5); ctx.fillStyle = metal(ctx, -16, -16, 32, 32, d.c); ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = OUT; ctx.stroke(); ctx.strokeStyle = shade(d.c, 0.3); ctx.lineWidth = 2; circle(ctx, 0, 0, 13.5); ctx.stroke(); ctx.strokeStyle = d.c2; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(-7, 7); ctx.lineTo(0, -8); ctx.lineTo(7, 7); ctx.stroke(); },
  sundisc(ctx, d, t) { glow(ctx, d.g, 16 + Math.sin(t * 2) * 5, () => { ctx.save(); ctx.rotate(t * 0.3); for (let i = 0; i < 12; i++) { ctx.rotate(TAU / 12); poly(ctx, [[-2.5, -13], [0, -21], [2.5, -13]]); ctx.fillStyle = d.c2; ctx.fill(); } ctx.restore(); circle(ctx, 0, 0, 13); ctx.fillStyle = metal(ctx, -13, -13, 26, 26, d.c); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(); }); circle(ctx, 0, 0, 5); fillStroke(ctx, '#1e3a8a', 1.2); },
  dragon(ctx, d, t) { poly(ctx, [[-13, -17], [13, -17], [14, 2], [0, 21], [-14, 2]]); fillStroke(ctx, d.c, 2.2); ctx.strokeStyle = d.c2; ctx.lineWidth = 1.5; poly(ctx, [[-11, -15], [11, -15], [12, 1], [0, 18], [-12, 1]]); ctx.stroke(); ctx.fillStyle = d.c2; ctx.beginPath(); ctx.moveTo(0, -10); ctx.quadraticCurveTo(-12, -12, -10, 2); ctx.quadraticCurveTo(-5, -4, 0, -2); ctx.quadraticCurveTo(5, -4, 10, 2); ctx.quadraticCurveTo(12, -12, 0, -10); ctx.fill(); glow(ctx, d.g, 10 + Math.sin(t * 4) * 4, () => { ctx.fillStyle = d.g; circle(ctx, -2.5, -5, 1.2); ctx.fill(); circle(ctx, 2.5, -5, 1.2); ctx.fill(); }); },
  mirror(ctx, d, t) { glow(ctx, d.g, 14, () => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16); } ctx.closePath(); ctx.save(); ctx.globalAlpha *= 0.85; fillStroke(ctx, d.c, 1.8); ctx.restore(); }); ctx.save(); ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; ctx.lineTo(Math.cos(a) * 15, Math.sin(a) * 15); } ctx.clip(); const s = ((t * 0.5) % 2) * 40 - 30; const g = ctx.createLinearGradient(s - 6, -20, s + 6, 20); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(-20, -20, 40, 40); ctx.restore(); },
  runeshield(ctx, d, t) { circle(ctx, 0, 0, 16); ctx.fillStyle = metal(ctx, -16, -16, 32, 32, d.c); ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = OUT; ctx.stroke(); glow(ctx, d.g, 12, () => { ctx.strokeStyle = d.g; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.stroke(); ctx.save(); ctx.rotate(t * 0.5); for (let i = 0; i < 5; i++) { ctx.rotate(TAU / 5); rune(ctx, 0, -11, i, 0.45); } ctx.restore(); circle(ctx, 0, 0, 3); ctx.fillStyle = d.g; ctx.fill(); }); },
};

// ================= Capas e asas (atrás do corpo) =================
function capePath(ctx, geo, w, len = -10) { const x0 = -geo.w / 2 + 2; ctx.beginPath(); ctx.moveTo(x0, -72); ctx.lineTo(geo.w / 2 - 4, -72); ctx.quadraticCurveTo(-4, -40, -16 + w, len); ctx.lineTo(-32 + w * 1.5, len - 4); ctx.quadraticCurveTo(-26, -45, x0, -72); ctx.closePath(); }
function wing(ctx, t, s, fill, edge, { big = 1, claws = null, bones = '#000', flap = 2 } = {}) {
  ctx.save(); ctx.translate(-6, -68); ctx.rotate(-0.25 + Math.sin(t * flap) * 0.14 * s); ctx.scale(s * big, s * big);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-30, -44); ctx.lineTo(-74, -38);
  ctx.quadraticCurveTo(-62, -24, -66, -10); ctx.quadraticCurveTo(-52, -14, -48, 2); ctx.quadraticCurveTo(-36, -6, -28, 14); ctx.quadraticCurveTo(-18, 2, 0, 6); ctx.closePath();
  fillStroke(ctx, fill, 1.6);
  ctx.strokeStyle = bones; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-30, -44); ctx.lineTo(-74, -38); ctx.moveTo(-30, -44); ctx.lineTo(-66, -10); ctx.moveTo(-30, -44); ctx.lineTo(-48, 2); ctx.moveTo(-30, -44); ctx.lineTo(-28, 14); ctx.stroke();
  if (claws) { ctx.fillStyle = claws; poly(ctx, [[-30, -44], [-27, -52], [-33, -46]]); ctx.fill(); }
  if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-74, -38); ctx.quadraticCurveTo(-62, -24, -66, -10); ctx.stroke(); }
  ctx.restore();
}
export const CAPE = {
  mantle(ctx, d, t, geo) { const w = Math.sin(t * 3) * 2; capePath(ctx, geo, w, -36); fillStroke(ctx, d.c); ctx.beginPath(); ctx.ellipse(-10, -76, 9, 6, -0.4, 0, TAU); fillStroke(ctx, d.c2 || shade(d.c, -0.2), 1.5); },
  furcape(ctx, d, t, geo) { const w = Math.sin(t * 3) * 3; capePath(ctx, geo, w); fillStroke(ctx, d.c); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.moveTo(-14, -60); ctx.quadraticCurveTo(-20, -40, -24 + w, -14); ctx.lineTo(-30 + w, -14); ctx.quadraticCurveTo(-24, -45, -14, -60); ctx.fill(); for (let i = 0; i < 8; i++) { circle(ctx, -geo.w / 2 - 2 + i * (geo.w + 2) / 7, -73 + (i % 2) * 1.6, 4.8); fillStroke(ctx, i % 2 ? shade(d.c2, -0.12) : d.c2, 1); } },
  dragonwings(ctx, d, t) { for (const s of [0.82, 1]) wing(ctx, t, s, s === 1 ? d.c : shade(d.c, -0.25), null, { bones: d.c2, claws: '#e7dcc6', flap: 2.2 }); },
  demonwings(ctx, d, t) { glow(ctx, '#ef4444', 10, () => { for (const s of [0.85, 1]) wing(ctx, t, s, s === 1 ? d.c : shade(d.c, -0.25), '#ef444488', { big: 1.15, bones: d.c2, claws: '#1c0f12', flap: 1.6 }); }); },
  flamecape(ctx, d, t, geo) { const w = Math.sin(t * 3) * 3; capePath(ctx, geo, w); fillStroke(ctx, d.c); ctx.save(); capePath(ctx, geo, w); ctx.clip(); const g = ctx.createLinearGradient(0, -40, 0, -8); g.addColorStop(0, 'rgba(255,90,31,0)'); g.addColorStop(1, 'rgba(255,120,40,.9)'); ctx.fillStyle = g; ctx.fillRect(-50, -40, 70, 34); ctx.restore(); for (let i = 0; i < 5; i++) glow(ctx, '#ff7a2a', 10, () => flameTongue(ctx, -30 + w * 1.2 + i * 4, -10 + i * 0.5, 12 + (i % 2) * 6, 3, t, i)); },
  icecape(ctx, d, t, geo) { const w = Math.sin(t * 2) * 2; capePath(ctx, geo, w); fillStroke(ctx, d.c); for (let i = 0; i < 6; i++) { const x = -31 + w * 1.4 + i * 3.4; const y = -14 + i * 0.6; poly(ctx, [[x - 2, y], [x, y + 8 + (i % 2) * 4], [x + 2, y]]); ctx.save(); ctx.globalAlpha *= 0.9; fillStroke(ctx, d.c2, 1); ctx.restore(); } glow(ctx, '#e0f2fe', 8, () => { ctx.strokeStyle = 'rgba(224,242,254,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-14, -66); ctx.quadraticCurveTo(-20, -40, -26 + w, -16); ctx.stroke(); }); },
  starcape(ctx, d, t, geo) { const w = Math.sin(t * 2.5) * 3; capePath(ctx, geo, w); starfield(ctx, -42, -74, 50, 66, t, { tint: '#a78bfa', seed: 29, n: 22 }); capePath(ctx, geo, w); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke(); ctx.strokeStyle = d.c2; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-16 + w, -12); ctx.lineTo(-32 + w * 1.5, -16); ctx.stroke(); },
  voidcape(ctx, d, t, geo) { const w = Math.sin(t * 2.5) * 3; capePath(ctx, geo, w, -4); starfield(ctx, -44, -74, 52, 72, t, { tint: d.g, seed: 33, n: 26 }); glow(ctx, d.g, 12, () => { capePath(ctx, geo, w, -4); ctx.strokeStyle = `${d.g}aa`; ctx.lineWidth = 1.3; ctx.stroke(); }); for (let i = 0; i < 6; i++) { const ph = (t * 0.5 + i / 6) % 1; ctx.fillStyle = `rgba(192,132,252,${(1 - ph) * 0.8})`; ctx.fillRect(-32 + w * 1.5 + i * 3 - ph * 10, -6 + ph * 4 - ph * 20, 1.6, 1.6); } },
  gearwings(ctx, d, t) {
    for (const s of [0.8, 1]) {
      ctx.save(); ctx.translate(-6, -68); ctx.rotate(-0.3 + Math.sin(t * 1.5) * 0.08 * s); ctx.scale(s, s);
      ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-34, -40); ctx.lineTo(-68, -34); ctx.stroke(); ctx.strokeStyle = d.c; ctx.lineWidth = 2.4; ctx.stroke();
      for (let i = 0; i < 5; i++) { ctx.save(); ctx.translate(-34 - i * 7, -40 + i * 1.5); ctx.rotate(0.3 + i * 0.12); rr(ctx, -3, 0, 6, 28 - i * 3, 3); fillStroke(ctx, shade(d.c, -0.1 - i * 0.05), 1.2); ctx.restore(); }
      gear(ctx, -34, -40, 6, 9, t * (s === 1 ? 1 : -1), d.c, 1.2);
      ctx.restore();
    }
  },
  prismwings(ctx, d, t) { glow(ctx, '#fff', 14, () => { for (const s of [0.8, 1]) { ctx.save(); ctx.translate(-6, -68); ctx.rotate(-0.25 + Math.sin(t * 1.8) * 0.12 * s); ctx.scale(s, s); for (let i = 0; i < 6; i++) { ctx.save(); ctx.rotate(-1.9 + i * 0.28); poly(ctx, [[-3, 0], [0, -(44 - Math.abs(i - 2) * 5)], [3, 0]]); ctx.fillStyle = hue(t, i * 50 + s * 80, 90, 75, 0.8); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 0.9; ctx.stroke(); ctx.restore(); } ctx.restore(); } }); },
  leafcape(ctx, d, t, geo) { const w = Math.sin(t * 3) * 3; capePath(ctx, geo, w); fillStroke(ctx, d.c); for (let i = 0; i < 6; i++) { ctx.save(); ctx.translate(-31 + w * 1.4 + i * 3.4, -12 + i * 0.6); ctx.rotate(0.3); ctx.beginPath(); ctx.ellipse(0, 3, 2.4, 5, 0, 0, TAU); fillStroke(ctx, i % 2 ? d.c : shade(d.c, 0.15), 0.9); ctx.restore(); } ctx.strokeStyle = d.c2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-12, -66); ctx.quadraticCurveTo(-20, -40, -26 + w, -14); ctx.stroke(); },
};

// ================= Acessórios =================
/** Acessórios desenhados atrás do corpo. */
export const BACK_ACC = new Set(['tails', 'gearpack']);
export const ACC = {
  beads(ctx, d) { for (let i = 0; i <= 10; i++) { const a = Math.PI * 0.15 + (i / 10) * Math.PI * 0.7; circle(ctx, 1 + Math.cos(a) * 9, -74 + Math.sin(a) * 12, 1.8); fillStroke(ctx, i === 5 ? '#c2410c' : d.c, 0.7); } },
  ankh(ctx, d) { ctx.strokeStyle = '#d9ad55'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-4, -72); ctx.lineTo(2, -64); ctx.lineTo(8, -72); ctx.stroke(); glow(ctx, '#fde68a', 6, () => { ctx.strokeStyle = d.c; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(2, -61, 2, 2.6, 0, 0, TAU); ctx.moveTo(-1.5, -57.5); ctx.lineTo(5.5, -57.5); ctx.moveTo(2, -58.5); ctx.lineTo(2, -51); ctx.stroke(); }); },
  tails(ctx, d, t) { for (let i = 0; i < 3; i++) { const sw = Math.sin(t * 2 + i) * 0.18; ctx.save(); ctx.translate(-9, -44); ctx.rotate(Math.PI + 0.55 - i * 0.42 + sw); ctx.beginPath(); ctx.moveTo(0, -3); ctx.quadraticCurveTo(16, 10, 30, 2); ctx.quadraticCurveTo(24, -8, 0, 4); ctx.closePath(); fillStroke(ctx, d.c, 1.3); ctx.save(); ctx.clip(); ctx.fillStyle = d.c2; ctx.beginPath(); ctx.ellipse(28, -1, 7, 6, 0, 0, TAU); ctx.fill(); ctx.restore(); ctx.restore(); } },
  gearpack(ctx, d, t) { rr(ctx, -20, -72, 12, 26, 4); ctx.fillStyle = metal(ctx, -20, -72, 12, 26, d.c); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = OUT; ctx.stroke(); for (const y of [-66, -54]) { ctx.fillStyle = shade(d.c, -0.35); ctx.fillRect(-20, y, 12, 1.6); } rr(ctx, -18, -80, 3, 9, 1); fillStroke(ctx, shade(d.c, -0.2), 1); rr(ctx, -13, -78, 3, 7, 1); fillStroke(ctx, shade(d.c, -0.2), 1); gear(ctx, -14, -60, 3.5, 7, t * 2, shade(d.c, 0.2), 0.9); },
  orbs(ctx, d, t, geo, layer) { for (let i = 0; i < 3; i++) { const a = t * 1.2 + (i * TAU) / 3; const z = Math.sin(a); if ((layer === 'back') !== (z < 0)) continue; glow(ctx, d.c, 10, () => { circle(ctx, Math.cos(a) * 26, -60 + z * 6 + Math.sin(t * 2 + i) * 3, 3.4 - (z < 0 ? 0.8 : 0)); ctx.fillStyle = i === 0 ? '#fde68a' : d.c; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 0.8; ctx.stroke(); }); } },
};

// ================= Efeitos (back = atrás, front = à frente). power: 0–1 (animação especial) =================
function rise(ctx, n, speed, color, size, t, { spread = 30, height = 110, shape = 'sq', power = 0, y0 = -4 } = {}) {
  const N = Math.round(n * (1 + power));
  for (let i = 0; i < N; i++) {
    const ph = (t * speed * (1 + power * 0.6) + i / N) % 1;
    ctx.fillStyle = color.replace('A', (1 - ph).toFixed(2));
    const x = Math.sin(i * 2.3 + t) * spread * (1 + power * 0.3); const y = y0 - ph * height;
    if (shape === 'star') { star(ctx, x, y, size); ctx.fill(); } else if (shape === 'circle') { circle(ctx, x, y, size); ctx.fill(); } else ctx.fillRect(x, y, size, size);
  }
}
function radial(ctx, cx, cy, r, color, a) { const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r); g.addColorStop(0, color.replace('A', a)); g.addColorStop(1, color.replace('A', 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.8, r, 0, 0, TAU); ctx.fill(); }
export const EFFECT_BACK = {
  inferno(ctx, d, t, p) { radial(ctx, 0, -50, 78 + p * 20, 'rgba(255,110,40,A)', 0.3 + p * 0.2); },
  hellfire(ctx, d, t, p) { radial(ctx, 0, -50, 80 + p * 20, 'rgba(200,20,40,A)', 0.32 + p * 0.2); for (let i = 0; i < 4; i++) { const ph = (t * 0.3 + i / 4) % 1; ctx.fillStyle = `rgba(30,0,8,${0.35 * (1 - ph)})`; circle(ctx, Math.sin(i * 2 + t) * 22, -8 - ph * 80, 12 + ph * 12); ctx.fill(); } },
  blizzard(ctx, d, t, p) { radial(ctx, 0, -55, 80, 'rgba(186,230,253,A)', 0.25 + p * 0.15); },
  storm(ctx, d, t, p) { for (let i = 0; i < 5; i++) { ctx.fillStyle = `rgba(51,65,85,${0.55})`; circle(ctx, -20 + i * 10, -132 + Math.sin(t + i) * 2, 10 + (i % 2) * 4); ctx.fill(); } radial(ctx, 0, -60, 70, 'rgba(147,197,253,A)', 0.15 + p * 0.2); },
  void(ctx, d, t, p) {
    ctx.save(); ctx.translate(0, -58);
    const R = 46 + p * 14;
    for (let i = 0; i < 3; i++) { ctx.strokeStyle = `rgba(192,132,252,${0.35 - i * 0.08})`; ctx.lineWidth = 3 - i; ctx.beginPath(); ctx.ellipse(0, 0, R + i * 8, (R + i * 8) * 0.32, 0.3, t * 0.8 + i, t * 0.8 + i + Math.PI * 1.5); ctx.stroke(); }
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, R * 0.9); g.addColorStop(0, 'rgba(0,0,0,.9)'); g.addColorStop(0.7, 'rgba(40,10,70,.35)'); g.addColorStop(1, 'rgba(40,10,70,0)'); ctx.fillStyle = g; circle(ctx, 0, 0, R * 0.9); ctx.fill();
    ctx.restore();
  },
  runes(ctx, d, t, p) { ctx.save(); ctx.translate(0, 0); ctx.scale(1, 0.28); glow(ctx, d.c, 10, () => { ctx.strokeStyle = `${d.c}aa`; ctx.lineWidth = 2.4; circle(ctx, 0, 0, 38 + p * 8); ctx.stroke(); ctx.lineWidth = 1.2; circle(ctx, 0, 0, 30 + p * 6); ctx.stroke(); ctx.rotate(t * 0.6); for (let i = 0; i < 8; i++) { ctx.rotate(TAU / 8); ctx.strokeStyle = d.c; ctx.lineWidth = 2.2; rune(ctx, 0, -34, i, 1.1); } }); ctx.restore(); },
  cosmic(ctx, d, t, p) { const g = ctx.createRadialGradient(-10, -70, 4, 0, -60, 84); g.addColorStop(0, 'rgba(167,139,250,.35)'); g.addColorStop(0.5, 'rgba(56,189,248,.12)'); g.addColorStop(1, 'rgba(30,27,75,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -60, 64 + p * 10, 84, 0, 0, TAU); ctx.fill(); for (let i = 0; i < 16; i++) { const tw = Math.abs(Math.sin(t * 1.5 + i)); ctx.fillStyle = `rgba(255,255,255,${tw * 0.9})`; ctx.fillRect(Math.sin(i * 12.9) * 52, -60 + Math.cos(i * 7.3) * 70, 1.5, 1.5); } },
  chrono(ctx, d, t, p) {
    ctx.save(); ctx.translate(0, -62); const R = 50 + p * 10;
    glow(ctx, d.c, 8, () => { ctx.strokeStyle = `${d.c}66`; ctx.lineWidth = 1.5; circle(ctx, 0, 0, R); ctx.stroke(); circle(ctx, 0, 0, R - 6); ctx.stroke(); ctx.rotate(-t * 0.2); for (let i = 0; i < 12; i++) { ctx.rotate(TAU / 12); ctx.fillStyle = `${d.c}aa`; ctx.fillRect(-1, -R, 2, i % 3 ? 4 : 7); } });
    ctx.restore();
  },
  miasma(ctx, d, t) { for (let i = 0; i < 6; i++) { const ph = (t * 0.25 + i / 6) % 1; ctx.fillStyle = `rgba(101,163,13,${0.18 * (1 - ph)})`; circle(ctx, Math.sin(i * 1.7 + t * 0.6) * 26, -6 - ph * 60, 12 + ph * 10); ctx.fill(); } },
  prism(ctx, d, t, p) { ctx.save(); ctx.translate(0, -60); ctx.rotate(t * 0.15); for (let i = 0; i < 7; i++) { ctx.rotate(TAU / 7); const g = ctx.createLinearGradient(0, 0, 0, -90); g.addColorStop(0, hue(t, i * 51, 90, 70, 0.35 + p * 0.3)); g.addColorStop(1, hue(t, i * 51, 90, 70, 0)); ctx.fillStyle = g; poly(ctx, [[-5, 0], [0, -90 - p * 20], [5, 0]]); ctx.fill(); } ctx.restore(); },
  steam() {},
  foxfire() {},
  leaves() {},
};
export const EFFECT_FRONT = {
  inferno(ctx, d, t, p) { for (let i = 0; i < 7; i++) flameTongue(ctx, -24 + i * 8, 2, 14 + (i % 3) * 6 + p * 12, 4, t, i); rise(ctx, 10, 0.7, 'rgba(255,140,60,A)', 2, t, { power: p }); },
  hellfire(ctx, d, t, p) { for (let i = 0; i < 6; i++) flameTongue(ctx, -20 + i * 8, 2, 12 + (i % 3) * 5 + p * 12, 4, t, i, ['#7f1d1d', '#ef4444', '#fca5a5']); rise(ctx, 12, 0.6, 'rgba(239,68,68,A)', 2.2, t, { power: p }); },
  blizzard(ctx, d, t, p) { const N = Math.round(22 * (1 + p)); for (let i = 0; i < N; i++) { const ph = (t * 0.35 + i / N) % 1; const x = -50 + ((i * 37) % 100) + ph * 40; const y = -130 + ph * 140; ctx.fillStyle = `rgba(240,249,255,${0.9 - ph * 0.4})`; if (i % 3 === 0) { star(ctx, x, y, 2.2); ctx.fill(); } else ctx.fillRect(x, y, 1.6, 1.6); } },
  storm(ctx, d, t, p) { if (Math.sin(t * 9) > 0.55 - p * 0.5) glow(ctx, d.c, 14, () => { ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 1.8; ctx.beginPath(); let x = -10 + Math.sin(t * 3) * 18; let y = -125; ctx.moveTo(x, y); for (let i = 0; i < 7; i++) { x += (hash(Math.floor(t * 9) + i) - 0.5) * 16; y += 16; ctx.lineTo(x, y); } ctx.stroke(); }); rise(ctx, 6, 0.9, 'rgba(147,197,253,A)', 1.8, t, { power: p }); },
  void(ctx, d, t, p) { const N = Math.round(14 * (1 + p)); for (let i = 0; i < N; i++) { const ph = (t * 0.4 + i / N) % 1; const a = i * 2.4 + ph * 4; const r = (1 - ph) * (60 + p * 20); ctx.fillStyle = `rgba(216,180,254,${ph})`; ctx.fillRect(Math.cos(a) * r, -58 + Math.sin(a) * r * 0.35, 1.8, 1.8); } },
  runes(ctx, d, t, p) { ctx.strokeStyle = d.c; ctx.lineWidth = 1.2; for (let i = 0; i < 5 + p * 4; i++) { const ph = (t * 0.35 + i / 5) % 1; ctx.globalAlpha = 1 - ph; glow(ctx, d.c, 8, () => rune(ctx, Math.sin(i * 2.1 + t * 0.4) * 30, -10 - ph * 100, i, 0.8)); } ctx.globalAlpha = 1; },
  cosmic(ctx, d, t, p) { rise(ctx, 8, 0.4, 'rgba(196,181,253,A)', 2.2, t, { shape: 'star', power: p }); },
  chrono(ctx, d, t, p) { rise(ctx, 10, 0.5, 'rgba(253,230,138,A)', 1.6, t, { power: p, spread: 24 }); },
  foxfire(ctx, d, t, p) { for (let i = 0; i < 4; i++) { const a = t * 1.4 + (i * TAU) / 4; glow(ctx, d.c, 14, () => { const x = Math.cos(a) * (30 + p * 10); const y = -58 + Math.sin(a * 2) * 18; const g = ctx.createRadialGradient(x, y, 0.5, x, y, 6); g.addColorStop(0, '#e0f2fe'); g.addColorStop(0.5, `${d.c}cc`); g.addColorStop(1, `${d.c}00`); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y - 2, 4, 7, 0, 0, TAU); ctx.fill(); }); } },
  miasma(ctx, d, t, p) { rise(ctx, 10, 0.4, 'rgba(163,230,53,A)', 1.8, t, { power: p, shape: 'circle' }); },
  steam(ctx, d, t, p) { for (let i = 0; i < 6; i++) { const ph = (t * 0.45 + i / 6) % 1; ctx.fillStyle = `rgba(229,231,235,${0.45 * (1 - ph)})`; circle(ctx, -16 + Math.sin(i + t) * 4 - ph * 8, -82 - ph * 40, 3 + ph * 7); ctx.fill(); } },
  leaves(ctx, d, t, p) { const N = Math.round(9 * (1 + p)); for (let i = 0; i < N; i++) { const ph = (t * 0.25 + i / N) % 1; const x = 40 - ph * 90 + Math.sin(t * 2 + i) * 6; const y = -120 + ph * 120 + ((i * 13) % 30); ctx.save(); ctx.translate(x, y); ctx.rotate(t * 2 + i); ctx.fillStyle = i % 2 ? d.c : '#a3e635'; ctx.globalAlpha = 0.9 - ph * 0.5; ctx.beginPath(); ctx.ellipse(0, 0, 1.8, 3.6, 0, 0, TAU); ctx.fill(); ctx.restore(); } },
  prism(ctx, d, t, p) { const N = Math.round(10 * (1 + p)); for (let i = 0; i < N; i++) { const ph = (t * 0.5 + i / N) % 1; ctx.fillStyle = hue(t, i * 36, 90, 75, 1 - ph); star(ctx, Math.sin(i * 2.3 + t) * 34, -6 - ph * 120, 2.2); ctx.fill(); } },
};

// ================= Mascotes novos =================
export const PET = {
  fox(ctx, d, t, eye) { ctx.beginPath(); ctx.ellipse(-1, -9, 11, 6.5, 0, 0, TAU); fillStroke(ctx, d.c, 1.5); poly(ctx, [[7, -12], [18, -12], [12, -5]]); fillStroke(ctx, d.c, 1.3); for (const x of [8, 13]) { poly(ctx, [[x - 2, -12], [x, -19], [x + 2, -12]]); fillStroke(ctx, d.c, 1.1); } eye(13, -11, 1.2); glow(ctx, d.g, 12, () => { ctx.beginPath(); ctx.moveTo(-10, -10); ctx.quadraticCurveTo(-22, -20 + Math.sin(t * 4) * 3, -20, -28); ctx.quadraticCurveTo(-14, -18, -9, -7); ctx.closePath(); ctx.fillStyle = d.g; ctx.globalAlpha *= 0.85; ctx.fill(); }); },
  golem(ctx, d, t, eye) { rr(ctx, -9, -20, 18, 16, 4); fillStroke(ctx, d.c, 1.5); rr(ctx, -6, -28, 12, 9, 3); fillStroke(ctx, shade(d.c, 0.1), 1.4); glow(ctx, d.g, 8, () => { ctx.fillStyle = d.g; ctx.fillRect(-3, -25, 2, 2); ctx.fillRect(2, -25, 2, 2); circle(ctx, 0, -12, 2.2); ctx.fill(); }); for (const x of [-7, 4]) { rr(ctx, x, -5, 4, 5, 1); fillStroke(ctx, shade(d.c, -0.15), 1); } },
  wisp(ctx, d, t) { ctx.translate(0, -30 + Math.sin(t * 2.4) * 4); glow(ctx, d.c, 18, () => { const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 9); g.addColorStop(0, '#fff'); g.addColorStop(0.5, d.c); g.addColorStop(1, `${d.c}00`); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -12); ctx.quadraticCurveTo(9, -2, 0, 8); ctx.quadraticCurveTo(-9, -2, 0, -12); ctx.fill(); }); ctx.fillStyle = '#1e1b4b'; ctx.fillRect(-2.5, -1, 1.4, 2); ctx.fillRect(1.2, -1, 1.4, 2); },
};
