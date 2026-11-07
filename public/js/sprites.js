// Chefes 2D procedurais (Canvas). O personagem fica em hero.js e é reexportado aqui.
import { OUT, shade, lerp, ease, clamp01, rr, fillStroke, circle, animate } from './gfx.js';
export { animate } from './gfx.js';
export { drawHero, heroPose, heroStage, drawHeroThumb, drawItemIcon, setItemCatalog, drawPet } from './hero.js';

// ================= CHEFES =================
export const BOSS_COLORS = {
  golem: '#ff8a3d', glutton: '#a3e635', specter: '#67e8f9', shade: '#c084fc', siren: '#2dd4bf', wisp: '#fb7185', tyrant: '#ff5a3c',
};

/** Pose do chefe. anim: idle | attack | hurt | defeat | win */
export function bossPose(anim, k, t) {
  const base = { x: 0, y: Math.sin(t * 1.6) * 3, atk: 0, flash: 0, shake: 0, alpha: 1, sink: 0, scale: 1 };
  if (anim === 'attack') {
    const a = clamp01(k / 0.7);
    const lunge = a < 0.45 ? ease(a / 0.45) : 1 - ease((a - 0.45) / 0.55);
    return { ...base, x: -40 * lunge, atk: lunge };
  }
  if (anim === 'hurt') {
    const a = clamp01(k / 0.5);
    return { ...base, x: 14 * Math.sin(a * Math.PI), flash: 1 - a, shake: (1 - a) * 5 };
  }
  if (anim === 'defeat') {
    const a = clamp01(k / 1.6);
    return { ...base, y: 0, flash: Math.max(0, 1 - a * 3), shake: (1 - a) * 4, alpha: 1 - ease(a), sink: ease(a) * 30 };
  }
  if (anim === 'win') {
    return { ...base, y: base.y - Math.abs(Math.sin(k * 3)) * 8, atk: 0.3 + Math.sin(k * 6) * 0.1 };
  }
  return base;
}

/** Desenha o chefe com os pés em (0,0), virado para a esquerda. */
export function drawBoss(ctx, arch, pose, t) {
  ctx.save();
  ctx.globalAlpha = pose.alpha;
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  ctx.beginPath(); ctx.ellipse(pose.x * 0.8, 3, 58, 9, 0, 0, Math.PI * 2); ctx.fill();
  const sh = pose.shake ? (Math.random() - 0.5) * pose.shake * 2 : 0;
  ctx.translate(pose.x + sh, pose.y + pose.sink);
  ctx.scale(-1, 1); // vira para a esquerda
  const fn = { golem: golem, glutton: glutton, specter: specter, shade: shadeBoss, siren: siren, wisp: wisp, tyrant: tyrant }[arch] || golem;
  fn(ctx, pose, t);
  ctx.restore();
  if (pose.flash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const big = arch === 'tyrant';
    const cy = big ? -150 : -85; const r = big ? 150 : 90;
    ctx.translate(pose.x, pose.y + pose.sink);
    const g = ctx.createRadialGradient(0, cy, 4, 0, cy, r);
    g.addColorStop(0, `rgba(255,240,220,${0.45 * pose.flash})`); g.addColorStop(1, 'rgba(255,240,220,0)');
    ctx.fillStyle = g; ctx.fillRect(-r, cy - r, r * 2, r * 2);
    ctx.restore();
  }
}

function eyes(ctx, pts, color, r = 3.5) {
  ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.fillStyle = color;
  for (const [x, y] of pts) { circle(ctx, x, y, r); ctx.fill(); }
  ctx.restore();
}

function golem(ctx, p, t) {
  const rock = '#6e7280', dark = '#4a4e5a';
  // pernas
  rr(ctx, -34, -50, 26, 50, 6); fillStroke(ctx, dark, 2.5);
  rr(ctx, 8, -50, 26, 50, 6); fillStroke(ctx, rock, 2.5);
  // braço de trás
  rr(ctx, -62, -128, 26, 70, 10); fillStroke(ctx, dark, 2.5);
  circle(ctx, -50, -52, 17); fillStroke(ctx, dark, 2.5);
  // tronco
  ctx.beginPath(); ctx.moveTo(-46, -140); ctx.lineTo(44, -146); ctx.lineTo(52, -92); ctx.lineTo(36, -46); ctx.lineTo(-38, -46); ctx.lineTo(-52, -96); ctx.closePath(); fillStroke(ctx, rock, 3);
  ctx.strokeStyle = '#3a3d47'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-20, -130); ctx.lineTo(-10, -110); ctx.lineTo(-24, -92); ctx.moveTo(20, -140); ctx.lineTo(28, -118); ctx.moveTo(10, -70); ctx.lineTo(24, -58); ctx.stroke();
  // núcleo
  const pul = 0.6 + Math.sin(t * 3) * 0.3;
  ctx.save(); ctx.shadowColor = '#ff8a3d'; ctx.shadowBlur = 25 * pul; circle(ctx, 4, -96, 11); fillStroke(ctx, `rgba(255,${120 + pul * 60},60,1)`, 2.5); ctx.restore();
  // musgo
  ctx.fillStyle = '#4d6b3a'; ctx.beginPath(); ctx.ellipse(-30, -138, 16, 6, 0.1, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(30, -144, 12, 5, -0.1, 0, Math.PI * 2); ctx.fill();
  // cabeça
  rr(ctx, -16, -172, 40, 30, 7); fillStroke(ctx, rock, 3);
  eyes(ctx, [[0, -158], [14, -158]], '#ffb066', 4);
  // braço da frente (soco)
  const reach = p.atk * 40;
  ctx.save(); ctx.translate(46, -128); ctx.rotate(-p.atk * 1.1);
  rr(ctx, -12, 0, 26, 64 + reach * 0.3, 10); fillStroke(ctx, rock, 2.5);
  circle(ctx, 1, 72 + reach * 0.3, 19); fillStroke(ctx, '#7c808d', 2.5);
  ctx.restore();
}

function glutton(ctx, p, t) {
  const body = '#5f7232', belly = '#8a9a52';
  rr(ctx, -50, -36, 22, 36, 6); fillStroke(ctx, shade(body, -0.25), 2.5);
  rr(ctx, 26, -36, 22, 36, 6); fillStroke(ctx, body, 2.5);
  ctx.beginPath(); ctx.ellipse(-4, -80, 70, 56, 0, 0, Math.PI * 2); fillStroke(ctx, body, 3);
  ctx.beginPath(); ctx.ellipse(10, -60, 44, 30, 0, 0, Math.PI * 2); ctx.fillStyle = belly; ctx.fill();
  // espinhos
  for (let i = 0; i < 6; i++) {
    const x = -54 + i * 16; const y = -124 + Math.abs(i - 2.5) * 6;
    ctx.beginPath(); ctx.moveTo(x - 7, y + 8); ctx.lineTo(x, y - 14); ctx.lineTo(x + 7, y + 8); ctx.closePath(); fillStroke(ctx, '#d8d3b5', 2);
  }
  // boca
  const open = 8 + p.atk * 26 + Math.sin(t * 2) * 2;
  ctx.save(); ctx.translate(56, -82);
  ctx.beginPath(); ctx.ellipse(0, 0, 26, open, 0, 0, Math.PI * 2); fillStroke(ctx, '#2a0d10', 3);
  ctx.fillStyle = '#f1ead2';
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath(); ctx.moveTo(i * 9 - 4, -open + 2); ctx.lineTo(i * 9, -open + 11); ctx.lineTo(i * 9 + 4, -open + 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(i * 9 - 4, open - 2); ctx.lineTo(i * 9, open - 11); ctx.lineTo(i * 9 + 4, open - 2); ctx.fill();
  }
  ctx.restore();
  // chifres e olhos
  ctx.beginPath(); ctx.moveTo(26, -126); ctx.quadraticCurveTo(30, -150, 16, -160); ctx.quadraticCurveTo(40, -150, 38, -122); ctx.closePath(); fillStroke(ctx, '#c9c2a0', 2);
  eyes(ctx, [[36, -112], [52, -110]], '#d9f99d', 4);
  // baba
  ctx.fillStyle = 'rgba(190,240,140,.7)';
  const d = (t * 0.7) % 1; circle(ctx, 60, -82 + open + d * 30, 3 * (1 - d) + 1); ctx.fill();
}

function specter(ctx, p, t) {
  const fl = Math.sin(t * 2) * 6;
  ctx.translate(0, -20 + fl);
  // manto
  const g = ctx.createLinearGradient(0, -170, 0, 0);
  g.addColorStop(0, '#2a2f4d'); g.addColorStop(0.7, '#1b1e33'); g.addColorStop(1, 'rgba(27,30,51,0)');
  ctx.beginPath(); ctx.moveTo(-10, -175); ctx.quadraticCurveTo(46, -170, 50, -100);
  for (let i = 0; i <= 6; i++) { const x = 50 - i * 17; ctx.lineTo(x - 8, -10 + Math.sin(t * 4 + i) * 6); ctx.lineTo(x - 17, -30); }
  ctx.quadraticCurveTo(-58, -120, -10, -175); ctx.closePath();
  ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke();
  // capuz
  ctx.beginPath(); ctx.ellipse(8, -142, 26, 30, 0, 0, Math.PI * 2); fillStroke(ctx, '#323858', 2.5);
  ctx.beginPath(); ctx.ellipse(14, -138, 17, 21, 0, 0, Math.PI * 2); ctx.fillStyle = '#05060b'; ctx.fill();
  eyes(ctx, [[10, -140], [22, -140]], '#67e8f9', 3.6);
  // mãos
  const reach = p.atk * 30;
  for (const [y, s] of [[-96, 1], [-80, 0.8]]) {
    ctx.save(); ctx.translate(38 + reach * s, y);
    ctx.strokeStyle = '#d6dbe8'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    for (let f = -1; f <= 1; f++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(12, f * 5); ctx.stroke(); }
    ctx.restore();
  }
  if (p.atk > 0.3) { ctx.save(); ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 20; ctx.fillStyle = 'rgba(103,232,249,.85)'; circle(ctx, 60 + reach * 1.6, -90, 8 * p.atk); ctx.fill(); ctx.restore(); }
  // livro orbitando
  const a = t * 1.3;
  const bx = Math.cos(a) * 60; const by = -110 + Math.sin(a) * 14;
  ctx.save(); ctx.translate(bx, by); ctx.rotate(Math.sin(a) * 0.3);
  rr(ctx, -10, -7, 20, 14, 2); fillStroke(ctx, '#6b3a2a', 2); ctx.fillStyle = '#e9dfc4'; ctx.fillRect(-8, -5, 16, 10); ctx.strokeStyle = '#6b3a2a'; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, 5); ctx.stroke();
  ctx.restore();
}

function shadeBoss(ctx, p, t) {
  // fumaça
  for (let i = 0; i < 8; i++) {
    const ph = (t * 0.4 + i / 8) % 1;
    ctx.fillStyle = `rgba(60,30,90,${0.35 * (1 - ph)})`;
    circle(ctx, Math.sin(i * 2 + t) * 40, -20 - ph * 140, 18 + ph * 14); ctx.fill();
  }
  ctx.beginPath(); ctx.moveTo(-30, 0); ctx.quadraticCurveTo(-46, -80, -30, -130); ctx.quadraticCurveTo(-10, -150, 10, -150); ctx.quadraticCurveTo(38, -140, 40, -110); ctx.quadraticCurveTo(46, -60, 30, 0); ctx.closePath();
  fillStroke(ctx, '#17121f', 3);
  // cabeça e chifres
  ctx.beginPath(); ctx.ellipse(6, -160, 20, 22, 0, 0, Math.PI * 2); fillStroke(ctx, '#1d1628', 3);
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(6 + s * 10, -176); ctx.quadraticCurveTo(6 + s * 26, -196, 6 + s * 14, -210); ctx.quadraticCurveTo(6 + s * 18, -192, 6 + s * 4, -180); ctx.closePath(); fillStroke(ctx, '#2b2138', 2); }
  eyes(ctx, [[2, -162], [16, -162]], '#d8b4fe', 3.5);
  // ampulheta
  ctx.save(); ctx.translate(4, -96);
  ctx.strokeStyle = '#c084fc'; ctx.lineWidth = 2; ctx.shadowColor = '#c084fc'; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(-10, -16); ctx.lineTo(10, -16); ctx.lineTo(-10, 16); ctx.lineTo(10, 16); ctx.closePath(); ctx.stroke();
  const sand = (t * 0.2) % 1; ctx.fillStyle = '#e9d5ff';
  ctx.beginPath(); ctx.moveTo(-8 * (1 - sand), -14 + sand * 14); ctx.lineTo(8 * (1 - sand), -14 + sand * 14); ctx.lineTo(0, -1); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-8 * sand, 14 - sand * 10); ctx.lineTo(8 * sand, 14 - sand * 10); ctx.lineTo(9, 15); ctx.lineTo(-9, 15); ctx.fill();
  ctx.restore();
  // garras
  ctx.save(); ctx.translate(36, -110); ctx.rotate(-0.4 - p.atk * 1.4);
  ctx.strokeStyle = '#2b2138'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 46); ctx.stroke();
  ctx.strokeStyle = '#d8b4fe'; ctx.lineWidth = 2.5;
  for (let f = -1; f <= 1; f++) { ctx.beginPath(); ctx.moveTo(f * 4, 46); ctx.lineTo(f * 7, 62); ctx.stroke(); }
  ctx.restore();
}

function siren(ctx, p, t) {
  // cauda
  ctx.beginPath(); ctx.moveTo(-10, -70);
  ctx.bezierCurveTo(-70, -60, -70, 0, -10, -4); ctx.bezierCurveTo(30, -8, 50, 10, 70 + Math.sin(t * 3) * 6, -10);
  ctx.lineTo(74 + Math.sin(t * 3) * 6, 6); ctx.bezierCurveTo(40, 20, 20, 10, -10, 12); ctx.bezierCurveTo(-90, 10, -80, -80, -10, -92); ctx.closePath();
  fillStroke(ctx, '#0f766e', 3);
  ctx.strokeStyle = 'rgba(94,234,212,.4)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-50 + i * 14, -6 + Math.abs(i - 3) * 2, 6, Math.PI, 0); ctx.stroke(); }
  // tronco
  ctx.beginPath(); ctx.moveTo(-18, -80); ctx.quadraticCurveTo(-22, -130, 2, -136); ctx.quadraticCurveTo(26, -130, 22, -80); ctx.closePath(); fillStroke(ctx, '#5eead4', 2.5);
  // cabelo
  for (let i = 0; i < 5; i++) {
    ctx.beginPath(); ctx.moveTo(-6 + i * 3, -160);
    ctx.quadraticCurveTo(-40 - i * 4, -140 + Math.sin(t * 2 + i) * 8, -36 - i * 6, -96 + Math.sin(t * 2 + i) * 10);
    ctx.lineWidth = 6; ctx.strokeStyle = '#115e59'; ctx.stroke();
  }
  ctx.beginPath(); ctx.ellipse(4, -152, 16, 18, 0, 0, Math.PI * 2); fillStroke(ctx, '#99f6e4', 2.5);
  eyes(ctx, [[8, -154], [16, -154]], '#f0fdfa', 2.8);
  ctx.strokeStyle = '#134e4a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(13, -142, 4, 2 + p.atk * 5, 0, 0, Math.PI * 2); ctx.stroke();
  // ondas sonoras
  if (p.atk > 0.2) {
    for (let i = 1; i <= 3; i++) { ctx.strokeStyle = `rgba(94,234,212,${p.atk * (1 - i * 0.25)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(20, -142, 14 + i * 16 * p.atk, -0.6, 0.6); ctx.stroke(); }
  }
  // braço com tridente
  ctx.save(); ctx.translate(18, -118); ctx.rotate(-0.3 - p.atk * 0.8);
  ctx.strokeStyle = '#5eead4'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 30); ctx.stroke();
  ctx.strokeStyle = '#d4a64a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 60); ctx.lineTo(0, -50); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-8, -42); ctx.lineTo(-8, -54); ctx.moveTo(8, -42); ctx.lineTo(8, -54); ctx.moveTo(-8, -42); ctx.lineTo(8, -42); ctx.moveTo(0, -50); ctx.lineTo(0, -60); ctx.stroke();
  ctx.restore();
}

function wisp(ctx, p, t) {
  ctx.translate(0, -90 + Math.sin(t * 2.2) * 8);
  // fragmentos de papel
  for (let i = 0; i < 7; i++) {
    const a = t * (0.6 + i * 0.05) + i;
    ctx.save(); ctx.translate(Math.cos(a) * (70 + i * 3), Math.sin(a) * 30); ctx.rotate(a * 2);
    ctx.fillStyle = 'rgba(245,235,215,.85)'; ctx.fillRect(-6, -8, 12, 16); ctx.strokeStyle = 'rgba(80,60,60,.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(4, -4); ctx.moveTo(-4, 0); ctx.lineTo(3, 0); ctx.stroke();
    ctx.restore();
  }
  // chama
  for (let layer = 0; layer < 3; layer++) {
    const r = 58 - layer * 16;
    const col = ['#e11d48', '#fb7185', '#fecdd3'][layer];
    ctx.save(); ctx.shadowColor = '#fb7185'; ctx.shadowBlur = layer === 0 ? 30 : 0;
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const flick = a > Math.PI ? Math.sin(t * 8 + i * 1.7) * 10 * (1 - layer * 0.3) : 0;
      const rad = r + (Math.sin(a) < 0 ? -Math.sin(a) * 26 + flick : 0);
      ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * rad);
    }
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#1a0610';
  ctx.beginPath(); ctx.ellipse(6, 4, 22, 20, 0, 0, Math.PI * 2); ctx.fill();
  eyes(ctx, [[0, 0], [16, 0]], '#fff1f2', 3.5);
  if (p.atk > 0.3) { ctx.save(); ctx.shadowColor = '#fb7185'; ctx.shadowBlur = 20; ctx.fillStyle = '#fda4af'; circle(ctx, 60 + p.atk * 50, 6, 12 * p.atk); ctx.fill(); ctx.restore(); }
}


/** Boss Final: Tirano da Inconstância — maior, alado, coroado e em chamas. */
function tyrant(ctx, p, t) {
  const flap = Math.sin(t * 2.2) * 0.12;
  // aura
  const g = ctx.createRadialGradient(0, -150, 20, 0, -150, 170);
  g.addColorStop(0, 'rgba(255,80,40,.28)'); g.addColorStop(1, 'rgba(255,80,40,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -150, 170, 190, 0, 0, Math.PI * 2); ctx.fill();
  // asas
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(side * 18, -205); ctx.rotate(side * (0.25 + flap));
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(side * 90, -90, side * 150, -40);
    ctx.lineTo(side * 128, -8); ctx.lineTo(side * 140, 30); ctx.lineTo(side * 110, 20); ctx.lineTo(side * 112, 62); ctx.lineTo(side * 80, 40); ctx.lineTo(side * 70, 80);
    ctx.quadraticCurveTo(side * 40, 30, 0, 22); ctx.closePath();
    ctx.fillStyle = side < 0 ? '#2a0c12' : '#3a1118'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,90,60,.35)'; ctx.lineWidth = 2;
    for (const [x, y] of [[128, -8], [110, 20], [80, 40]]) { ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(side * x, y); ctx.stroke(); }
    ctx.restore();
  }
  // capa
  ctx.beginPath(); ctx.moveTo(-40, -200); ctx.lineTo(40, -200); ctx.quadraticCurveTo(70, -100, 62 + Math.sin(t * 2) * 6, 0); ctx.lineTo(-62 + Math.sin(t * 2 + 1) * 6, 0); ctx.quadraticCurveTo(-70, -100, -40, -200); ctx.closePath();
  fillStroke(ctx, '#5b0f1a', 3);
  // pernas
  rr(ctx, -34, -78, 26, 78, 8); fillStroke(ctx, '#2b2d36', 3);
  rr(ctx, 8, -78, 26, 78, 8); fillStroke(ctx, '#3a3d48', 3);
  rr(ctx, -38, -16, 34, 16, 5); fillStroke(ctx, '#1a1b22', 2.5);
  rr(ctx, 4, -16, 38, 16, 5); fillStroke(ctx, '#1a1b22', 2.5);
  // tronco blindado
  ctx.beginPath(); ctx.moveTo(-50, -205); ctx.lineTo(52, -205); ctx.lineTo(44, -110); ctx.lineTo(30, -74); ctx.lineTo(-30, -74); ctx.lineTo(-44, -110); ctx.closePath();
  fillStroke(ctx, '#3a3d48', 3.5);
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(12, -200, 16, 110);
  // núcleo e runas
  const pul = 0.6 + Math.sin(t * 3) * 0.35;
  ctx.save(); ctx.shadowColor = '#ff5a3c'; ctx.shadowBlur = 30 * pul;
  ctx.beginPath(); ctx.moveTo(0, -170); ctx.lineTo(16, -146); ctx.lineTo(0, -120); ctx.lineTo(-16, -146); ctx.closePath(); fillStroke(ctx, `rgb(255,${90 + pul * 80},50)`, 2.5);
  ctx.strokeStyle = `rgba(255,120,60,${pul})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-36, -190); ctx.lineTo(-20, -176); ctx.moveTo(36, -190); ctx.lineTo(20, -176); ctx.moveTo(-28, -100); ctx.lineTo(28, -100); ctx.stroke();
  ctx.restore();
  // ombreiras com espinhos
  for (const sx of [-52, 52]) {
    ctx.beginPath(); ctx.ellipse(sx, -200, 26, 18, 0, Math.PI, 0); ctx.closePath(); fillStroke(ctx, '#4a4d5a', 3);
    for (const k of [-12, 0, 12]) { ctx.beginPath(); ctx.moveTo(sx + k - 5, -214); ctx.lineTo(sx + k, -236); ctx.lineTo(sx + k + 5, -214); ctx.closePath(); fillStroke(ctx, '#c9c2a0', 2); }
  }
  // braço de trás
  rr(ctx, -74, -198, 22, 86, 9); fillStroke(ctx, '#2b2d36', 3);
  // cabeça (elmo) e chifres
  ctx.beginPath(); ctx.moveTo(-24, -210); ctx.lineTo(-26, -248); ctx.quadraticCurveTo(0, -268, 28, -248); ctx.lineTo(26, -210); ctx.closePath(); fillStroke(ctx, '#2b2d36', 3);
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * 20, -248); ctx.quadraticCurveTo(side * 54, -268, side * 48, -300); ctx.quadraticCurveTo(side * 40, -272, side * 12, -256); ctx.closePath(); fillStroke(ctx, '#d8d0b0', 2.5); }
  ctx.fillStyle = '#07070a'; ctx.fillRect(-14, -240, 34, 10);
  eyes(ctx, [[-4, -235], [12, -235]], '#ffb36b', 3.6);
  // coroa
  ctx.save(); ctx.shadowColor = '#f1cf85'; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.moveTo(-20, -256); ctx.lineTo(-22, -276); ctx.lineTo(-10, -266); ctx.lineTo(2, -284); ctx.lineTo(14, -266); ctx.lineTo(26, -276); ctx.lineTo(24, -256); ctx.closePath(); fillStroke(ctx, '#e0ad3a', 2);
  ctx.restore();
  // braço da frente com machado
  ctx.save(); ctx.translate(56, -196); ctx.rotate(-0.25 - p.atk * 1.6);
  rr(ctx, -11, 0, 22, 80, 9); fillStroke(ctx, '#3a3d48', 3);
  circle(ctx, 0, 86, 13); fillStroke(ctx, '#4a4d5a', 3);
  ctx.translate(0, 86); ctx.rotate(-1.3);
  rr(ctx, -4, -110, 8, 170, 3); fillStroke(ctx, '#3a2414', 2.5);
  ctx.beginPath(); ctx.moveTo(4, -104); ctx.quadraticCurveTo(58, -122, 54, -64); ctx.quadraticCurveTo(34, -78, 4, -72); ctx.closePath();
  ctx.save(); ctx.shadowColor = '#ff5a3c'; ctx.shadowBlur = 14 * pul; fillStroke(ctx, '#b8bfcc', 2.5); ctx.restore();
  ctx.beginPath(); ctx.moveTo(-4, -100); ctx.quadraticCurveTo(-34, -96, -30, -76); ctx.lineTo(-4, -78); ctx.closePath(); fillStroke(ctx, '#8e96a4', 2);
  ctx.restore();
  // brasas
  for (let i = 0; i < 12; i++) {
    const ph = (t * 0.5 + i / 12) % 1;
    ctx.fillStyle = `rgba(255,${120 + (i % 4) * 30},50,${1 - ph})`;
    ctx.fillRect(Math.sin(i * 2.7 + t) * 70, -20 - ph * 260, 2.5, 2.5);
  }
}

