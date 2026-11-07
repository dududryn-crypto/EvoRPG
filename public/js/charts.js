// Gráficos em Canvas 2D (linha, barras e radar) com tooltip e legenda interativa.
// Valores nulos representam ausência de registro e nunca são preenchidos artificialmente.
import { esc } from './ui.js';

const GRID = 'rgba(255,255,255,.06)';
const AXIS = '#6b7088';
const FONT = '11px Inter, "Segoe UI", system-ui, sans-serif';

function setup(container, { height = 'md', legend = true } = {}) {
  container.innerHTML = `<div class="chart-box ${height === 'sm' ? 'sm' : height === 'lg' ? 'lg' : ''}"><canvas></canvas></div>${legend ? '<div class="legend"></div>' : ''}`;
  const box = container.querySelector('.chart-box');
  const canvas = box.querySelector('canvas');
  const tip = document.createElement('div');
  tip.className = 'chart-tip hidden';
  box.appendChild(tip);
  return { box, canvas, tip, legendEl: container.querySelector('.legend') };
}

function prep(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth; const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function niceScale(min, max, ticks = 4) {
  if (min === max) { const d = Math.abs(min) * 0.1 || 1; min -= d; max += d; }
  const range = max - min;
  const step0 = range / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step };
}

const fmt = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));

function renderLegend(legendEl, series, hidden, redraw) {
  if (!legendEl) return;
  legendEl.innerHTML = series.map((s, i) => `<span data-i="${i}" class="${hidden.has(i) ? 'off' : ''}"><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('');
  legendEl.querySelectorAll('span').forEach((el) => el.addEventListener('click', () => {
    const i = Number(el.dataset.i);
    if (hidden.has(i)) hidden.delete(i); else if (hidden.size < series.length - 1) hidden.add(i);
    el.classList.toggle('off', hidden.has(i));
    redraw();
  }));
}

function emptyOverlay(box, text) {
  let el = box.querySelector('.chart-empty');
  if (!el) { el = document.createElement('div'); el.className = 'chart-empty'; box.appendChild(el); }
  el.textContent = text;
}

/**
 * Gráfico de linhas/barras.
 * opts: { labels, series:[{name,color,data,type?:'line'|'bar',fill?,dashed?}], labelFormat, valueFormat, yMin, yMax, emptyText, height, stacked? }
 */
export function chart(container, opts) {
  const { box, canvas, tip, legendEl } = setup(container, { height: opts.height, legend: opts.legend !== false && opts.series.length > 1 });
  const hidden = new Set();
  const labelFormat = opts.labelFormat || ((l) => l);
  const valueFormat = opts.valueFormat || ((v) => fmt(v));
  const hasData = opts.series.some((s) => s.data.some((v) => v !== null && v !== undefined));
  if (!hasData) { emptyOverlay(box, opts.emptyText || 'Sem registros neste período.'); renderLegend(legendEl, opts.series, hidden, () => {}); return { destroy() {} }; }
  let geo = null;

  function draw() {
    const { ctx, w, h } = prep(canvas);
    const vis = opts.series.filter((_, i) => !hidden.has(i));
    const vals = vis.flatMap((s) => s.data).filter((v) => v !== null && v !== undefined);
    const hasBar = vis.some((s) => s.type === 'bar');
    let lo = Math.min(...vals); let hi = Math.max(...vals);
    if (hasBar || opts.zero) lo = Math.min(0, lo);
    if (opts.yMin !== undefined) lo = opts.yMin;
    if (opts.yMax !== undefined) hi = opts.yMax;
    const sc = niceScale(lo, hi);
    const padL = 42; const padR = 12; const padT = 10; const padB = 24;
    const pw = w - padL - padR; const ph = h - padT - padB;
    const n = opts.labels.length;
    const xAt = (i) => padL + (hasBar ? (pw / n) * (i + 0.5) : n === 1 ? pw / 2 : (pw / (n - 1)) * i);
    const yAt = (v) => padT + ph - ((v - sc.min) / (sc.max - sc.min)) * ph;
    geo = { xAt, padL, pw, n, hasBar, w, h, padT, ph };

    ctx.font = FONT; ctx.textBaseline = 'middle';
    for (let v = sc.min; v <= sc.max + 1e-9; v += sc.step) {
      const y = yAt(v);
      ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.fillStyle = AXIS; ctx.textAlign = 'right'; ctx.fillText(fmt(Math.round(v * 100) / 100), padL - 6, y);
    }
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 62))));
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let i = 0; i < n; i += every) { ctx.fillStyle = AXIS; ctx.fillText(labelFormat(opts.labels[i]), xAt(i), h - padB + 7); }

    // barras
    const bars = vis.filter((s) => s.type === 'bar');
    const bw = Math.max(2, Math.min(26, (pw / n) * 0.7 / Math.max(1, bars.length)));
    bars.forEach((s, bi) => {
      s.data.forEach((v, i) => {
        if (v === null || v === undefined) return;
        const x = xAt(i) - (bars.length * bw) / 2 + bi * bw;
        const y0 = yAt(Math.max(sc.min, 0)); const y1 = yAt(v);
        const g = ctx.createLinearGradient(0, Math.min(y0, y1), 0, Math.max(y0, y1));
        g.addColorStop(0, s.color); g.addColorStop(1, s.color + '55');
        ctx.fillStyle = typeof s.colorAt === 'function' ? s.colorAt(v, i) : g;
        const top = Math.min(y0, y1); const hh = Math.max(1, Math.abs(y1 - y0));
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x + 1, top, bw - 2, hh, [3, 3, 0, 0]) : ctx.rect(x + 1, top, bw - 2, hh); ctx.fill();
      });
    });
    // linhas
    vis.filter((s) => s.type !== 'bar').forEach((s) => {
      ctx.strokeStyle = s.color; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
      ctx.setLineDash(s.dashed ? [5, 4] : []);
      let seg = [];
      const flush = () => {
        if (seg.length > 1) {
          if (s.fill) {
            const g = ctx.createLinearGradient(0, padT, 0, padT + ph);
            g.addColorStop(0, s.color + '40'); g.addColorStop(1, s.color + '00');
            ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(seg[0][0], padT + ph);
            seg.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.lineTo(seg[seg.length - 1][0], padT + ph); ctx.closePath(); ctx.fill();
          }
          ctx.beginPath(); seg.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
        }
        seg = [];
      };
      s.data.forEach((v, i) => { if (v === null || v === undefined) flush(); else seg.push([xAt(i), yAt(v)]); });
      flush();
      ctx.setLineDash([]);
      ctx.fillStyle = s.color;
      const showDots = s.data.filter((v) => v !== null).length <= 45;
      s.data.forEach((v, i) => {
        if (v === null || v === undefined) return;
        const isolated = (s.data[i - 1] ?? null) === null && (s.data[i + 1] ?? null) === null;
        if (showDots || isolated) { ctx.beginPath(); ctx.arc(xAt(i), yAt(v), isolated ? 3 : 2.2, 0, Math.PI * 2); ctx.fill(); }
      });
    });
    if (opts.refLine !== undefined && opts.refLine !== null) {
      const y = yAt(opts.refLine);
      ctx.strokeStyle = 'rgba(217,173,85,.6)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(217,173,85,.9)'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(opts.refLabel || 'meta', w - padR, y - 2);
    }
  }

  function onMove(e) {
    if (!geo) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    let i;
    if (geo.hasBar) i = Math.floor(((x - geo.padL) / geo.pw) * geo.n);
    else i = Math.round(((x - geo.padL) / geo.pw) * (geo.n - 1));
    if (i < 0 || i >= geo.n) { tip.classList.add('hidden'); return; }
    const rows = opts.series.map((s, si) => (hidden.has(si) ? '' : `<div><span class="dot" style="--c:${s.color}"></span> ${esc(s.name)}: <b>${s.data[i] === null || s.data[i] === undefined ? '<span class="dim">sem registro</span>' : esc(valueFormat(s.data[i], s))}</b></div>`)).join('');
    tip.innerHTML = `<div class="t">${esc(opts.tipLabelFormat ? opts.tipLabelFormat(opts.labels[i]) : labelFormat(opts.labels[i]))}</div>${rows}`;
    tip.classList.remove('hidden');
    const tx = geo.xAt(i);
    tip.style.left = `${Math.min(geo.w - tip.offsetWidth - 4, Math.max(4, tx + 12))}px`;
    tip.style.top = `${geo.padT + 4}px`;
  }
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('touchstart', (e) => onMove(e.touches[0]), { passive: true });
  canvas.addEventListener('mouseleave', () => tip.classList.add('hidden'));
  renderLegend(legendEl, opts.series, hidden, draw);
  const ro = new ResizeObserver(() => draw());
  ro.observe(box);
  draw();
  return { destroy() { ro.disconnect(); } };
}

/** Gráfico radar: labels (eixos), series [{name,color,data}] */
export function radar(container, { labels, series, max }) {
  const { box, canvas, tip, legendEl } = setup(container, { height: 'lg', legend: true });
  const hidden = new Set();
  function draw() {
    const { ctx, w, h } = prep(canvas);
    const cx = w / 2; const cy = h / 2 + 4; const R = Math.min(w, h) / 2 - 38;
    const vis = series.filter((_, i) => !hidden.has(i));
    const top = Math.max(max || 0, ...vis.flatMap((s) => s.data), 1);
    const n = labels.length;
    const pt = (i, r) => [cx + Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / n) * r, cy + Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / n) * r];
    ctx.strokeStyle = GRID; ctx.lineWidth = 1;
    for (let k = 1; k <= 4; k++) {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { const [x, y] = pt(i % n, (R * k) / 4); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    ctx.font = FONT; ctx.fillStyle = '#9aa0b5'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const [x, y] = pt(i, R); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
      const [lx, ly] = pt(i, R + 20); ctx.fillText(labels[i], lx, ly);
    }
    ctx.fillStyle = AXIS; ctx.textAlign = 'left';
    ctx.fillText(`nível ${Math.round(top * 10) / 10}`, cx + 4, cy - R - 2);
    vis.forEach((s) => {
      ctx.beginPath();
      s.data.forEach((v, i) => { const [x, y] = pt(i, (v / top) * R); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath();
      ctx.fillStyle = s.color + '30'; ctx.fill();
      ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.setLineDash(s.dashed ? [5, 4] : []); ctx.stroke(); ctx.setLineDash([]);
      s.data.forEach((v, i) => { const [x, y] = pt(i, (v / top) * R); ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); });
    });
  }
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2; const y = e.clientY - r.top - r.height / 2;
    const n = labels.length;
    let a = Math.atan2(y, x) + Math.PI / 2; if (a < 0) a += Math.PI * 2;
    const i = Math.round(a / ((2 * Math.PI) / n)) % n;
    tip.innerHTML = `<div class="t">${esc(labels[i])}</div>` + series.map((s, si) => (hidden.has(si) ? '' : `<div><span class="dot" style="--c:${s.color}"></span> ${esc(s.name)}: <b>nível ${s.data[i].toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</b></div>`)).join('');
    tip.classList.remove('hidden');
    tip.style.left = `${Math.min(r.width - tip.offsetWidth - 4, e.clientX - r.left + 12)}px`; tip.style.top = `${Math.max(4, e.clientY - r.top - 20)}px`;
  });
  canvas.addEventListener('mouseleave', () => tip.classList.add('hidden'));
  renderLegend(legendEl, series, hidden, draw);
  const ro = new ResizeObserver(() => draw());
  ro.observe(box);
  draw();
}
