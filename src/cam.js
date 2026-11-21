// Field cam: a top-down animated view of what is happening. Persistent SVG that main.js re-mounts after every render.
import { battingTeam, fieldingTeam, currentBatter } from './engine.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}, parent) => {
  const e = document.createElementNS(NS, name);
  for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};
const HOME = [160, 236], B1 = [226, 170], B2 = [160, 104], B3 = [94, 170], MOUND = [160, 172];
const PATH = [HOME, B1, B2, B3, HOME];
const lerp = (a, b, t) => a + (b - a) * t;
const initials = (n) => n.split(' ').map((x) => x[0]).join('').slice(0, 2);
const POS = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
const BASE_POS = { P: [160, 172], C: [160, 250], '1B': [214, 162], '2B': [190, 122], SS: [130, 122], '3B': [106, 162], LF: [76, 84], CF: [160, 58], RF: [244, 84] };

function alignment(def = {}) {
  const out = {};
  for (const k of POS) out[k] = [...BASE_POS[k]];
  if (def.infieldIn) for (const k of ['1B', '2B', 'SS', '3B']) { out[k][1] += 14; out[k][0] += (160 - out[k][0]) * 0.12; }
  if (def.shift) for (const k of ['2B', 'SS', '3B']) out[k][0] += 22;
  if (def.shift) out['1B'][0] += 6;
  if (def.depth === 'deep') for (const k of ['LF', 'CF', 'RF']) out[k][1] -= 16;
  if (def.depth === 'shallow') for (const k of ['LF', 'CF', 'RF']) out[k][1] += 16;
  return out;
}

export function createCam({ teamCol }) {
  const svg = el('svg', { viewBox: '0 0 320 270', class: 'cam', role: 'img', 'aria-label': 'Field view' });
  // --- static field ---
  el('path', { class: 'cam-grass', d: 'M160 236 L30 106 Q160 -40 290 106 Z' }, svg);
  el('path', { class: 'cam-stripes', d: 'M160 236 L66 142 Q160 40 254 142 Z' }, svg);
  el('circle', { class: 'cam-dirt', cx: 160, cy: 178, r: 84 }, svg);
  el('path', { class: 'cam-ingrass', d: 'M160 222 L212 170 L160 118 L108 170 Z' }, svg);
  el('path', { class: 'cam-wall', d: 'M30 106 Q160 -40 290 106', fill: 'none' }, svg);
  el('path', { class: 'cam-line', d: 'M160 236 L30 106 M160 236 L290 106', fill: 'none' }, svg);
  el('path', { class: 'cam-line soft', d: 'M160 236 L226 170 L160 104 L94 170 Z', fill: 'none' }, svg);
  el('circle', { class: 'cam-mound', cx: MOUND[0], cy: MOUND[1], r: 9 }, svg);
  const baseEls = [B1, B2, B3].map((b) => el('rect', { class: 'cam-base', x: b[0] - 6, y: b[1] - 6, width: 12, height: 12, transform: `rotate(45 ${b[0]} ${b[1]})` }, svg));
  el('path', { class: 'cam-plate', d: 'M160 244 l-6 -5 l0 -5 l12 0 l0 5 z' }, svg);

  const fielderLayer = el('g', {}, svg), runnerLayer = el('g', {}, svg), fxLayer = el('g', {}, svg);

  const dot = (parent, text = '') => {
    const g = el('g', {}, parent), c = el('circle', { r: 8, class: 'cam-dot' }, g), t = el('text', { class: 'cam-dot-t', 'text-anchor': 'middle', y: 3 }, g);
    t.textContent = text;
    return { g, c, t, x: 0, y: 0 };
  };
  const place = (d, x, y) => { d.x = x; d.y = y; d.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`); };

  const fielders = POS.map((k) => { const d = dot(fielderLayer); d.c.setAttribute('r', k === 'P' ? 8 : 6.5); return d; });
  const runners = new Map();
  let batterDot = null;
  const ballG = el('g', { class: 'cam-ballg', opacity: 0 }, fxLayer);
  const shadow = el('ellipse', { class: 'cam-shadow', rx: 4, ry: 2 }, ballG);
  const ball = el('circle', { class: 'cam-ball', r: 3.5 }, ballG);
  const swing = el('path', { class: 'cam-swing', d: 'M146 232 Q150 216 168 218', fill: 'none', opacity: 0 }, fxLayer);
  let token = 0, temps = [];

  const setBall = (x, y, h = 0, shadowOn = true) => {
    ballG.setAttribute('opacity', 1);
    shadow.setAttribute('cx', x); shadow.setAttribute('cy', y); shadow.setAttribute('opacity', shadowOn && h > 1 ? 0.35 : 0);
    ball.setAttribute('cx', x); ball.setAttribute('cy', y - h); ball.setAttribute('r', 3.2 + Math.min(h, 80) * 0.03);
  };
  const hideBall = () => { ballG.setAttribute('opacity', 0); };

  const tick = (ms, fn) => new Promise((res) => {
    const my = token, t0 = performance.now();
    const f = (now) => {
      if (my !== token) { res(); return; }
      const p = Math.min(1, (now - t0) / ms);
      fn(p);
      if (p < 1) requestAnimationFrame(f); else res();
    };
    requestAnimationFrame(f);
  });
  const wait = (ms) => new Promise((res) => { const my = token; setTimeout(() => res(my === token), ms); });

  function pop(text, cls = '', x = 160, y = 132) {
    const t = el('text', { class: `cam-pop ${cls}`, x, y, 'text-anchor': 'middle' }, fxLayer);
    t.textContent = text; temps.push(t);
    setTimeout(() => { t.remove(); temps = temps.filter((z) => z !== t); }, 1900);
  }
  const clearTemps = () => { for (const t of temps) t.remove(); temps = []; swing.setAttribute('opacity', 0); hideBall(); };

  // ----- state sync -----
  function syncRunners(bases, offCol) {
    const want = new Map(bases.map((r, i) => [r && r.uid, i]).filter(([u]) => u));
    for (const [uid, d] of runners) if (!want.has(uid)) { d.g.remove(); runners.delete(uid); }
    bases.forEach((r, i) => {
      if (!r) return;
      let d = runners.get(r.uid);
      if (!d) { d = dot(runnerLayer, initials(r.name)); runners.set(r.uid, d); }
      d.c.style.fill = offCol; d.g.setAttribute('opacity', 1);
      place(d, ...[B1, B2, B3][i]);
    });
  }
  function syncBatter(b, pitcher, offCol) {
    if (!b) { if (batterDot) { batterDot.g.remove(); batterDot = null; } return; }
    if (!batterDot) batterDot = dot(runnerLayer);
    const side = b.hand === 'L' ? 1 : b.hand === 'R' ? -1 : (pitcher && pitcher.hand === 'R' ? 1 : -1);
    batterDot.t.textContent = initials(b.name); batterDot.c.style.fill = offCol; batterDot.g.setAttribute('opacity', 1);
    place(batterDot, HOME[0] + side * 17, 240);
  }
  function syncFielders(g, def, defCol) {
    const al = alignment(def), p = fieldingTeam(g).pitcher;
    POS.forEach((k, i) => { fielders[i].c.style.fill = defCol; fielders[i].g.setAttribute('opacity', 1); place(fielders[i], ...al[k]); });
    fielders[0].t.textContent = initials(p.name);
    baseEls.forEach((b, i) => b.classList.remove('on', `b${i}`));
  }

  function update(g) {
    clearTemps();
    if (!g) return;
    const off = teamCol(battingTeam(g)), def = teamCol(fieldingTeam(g));
    syncFielders(g, g.lastDef, def);
    syncRunners(g.bases, off);
    syncBatter(g.over ? null : currentBatter(g), fieldingTeam(g).pitcher, off);
  }

  // ----- animation helpers -----
  const along = (pts, p) => {
    const segs = pts.length - 1, f = Math.min(segs - 1e-9, p * segs), i = Math.floor(f);
    return [lerp(pts[i][0], pts[i + 1][0], f - i), lerp(pts[i][1], pts[i + 1][1], f - i)];
  };
  async function moveDot(d, from, to, ms, out = 0, fade = false) {
    const pts = PATH.slice(from, to + 1);
    if (pts.length < 2) { if (fade) d.g.setAttribute('opacity', 0.25); return; }
    const frac = out || 1;
    await tick(ms * Math.max(0.4, frac), (p) => place(d, ...along(pts, p * frac)));
    if (fade) { d.g.setAttribute('opacity', 0.25); }
  }
  function planMoves(snap, g, ev) {
    const moves = [];
    const newHalf = g.half !== snap.half || g.inning !== snap.inning;
    snap.bases.forEach((r, i) => {
      if (!r) return;
      const d = runners.get(r.uid); if (!d) return;
      const ni = g.bases.indexOf(r);
      if (ni >= 0) { if (ni !== i) moves.push({ d, from: i + 1, to: ni + 1 }); }
      else if (ev.scored.includes(r.uid)) moves.push({ d, from: i + 1, to: 4, scored: true });
      else if (!newHalf) moves.push({ d, from: i + 1, to: i + 2, out: 0.6, fade: true });
    });
    const b = snap.batter;
    if (b && batterDot && ev.result) {
      const ni = g.bases.indexOf(b);
      if (ni >= 0) moves.push({ d: batterDot, from: 0, to: ni + 1, batter: true });
      else if (ev.scored.includes(b.uid)) moves.push({ d: batterDot, from: 0, to: 4, scored: true, batter: true });
      else if (ev.result === 'K') moves.push({ d: batterDot, from: 0, to: 0, fade: true, batter: true });
      else moves.push({ d: batterDot, from: 0, to: 1, out: ev.bip && ev.bip.t === 'GB' ? 0.98 : 0.55, fade: true, batter: true });
    }
    return moves;
  }
  const runMoves = (moves, T) => Promise.all(moves.map((m) => moveDot(m.d, m.from, m.to, (m.to - m.from) * 330 * T + 160, m.out || 0, m.fade)));

  async function flyBall(from, to, ms, apex, shadowOn = true) {
    await tick(ms, (p) => setBall(lerp(from[0], to[0], p), lerp(from[1], to[1], p), apex * 4 * p * (1 - p), shadowOn));
  }
  const nearest = (idxs, pt) => idxs.map((i) => ({ i, d: Math.hypot(fielders[i].x - pt[0], fielders[i].y - pt[1]) })).sort((a, b) => a.d - b.d)[0].i;

  const LABEL = { '1B': 'SINGLE', '2B': 'DOUBLE', '3B': 'TRIPLE', HR: 'HOME RUN!', BUNT: 'BUNT' };

  async function play(ev, snap, g, opts = {}) {
    const my = ++token;
    const mode = opts.mode || 'full';
    if (mode === 'off' || !ev || !snap) { update(g); return; }
    const T = mode === 'quick' ? 0.5 : 1;
    clearTemps();
    // pre-pitch state
    const offCol = teamCol(battingTeam(g)), defCol = teamCol(fieldingTeam(g));
    syncFielders(g, g.lastDef, defCol);
    syncRunners(snap.bases, offCol);
    syncBatter(snap.batter, fieldingTeam(g).pitcher, offCol);
    const done = () => my === token;
    const p = ev.pitch;
    const moves = planMoves(snap, g, ev);

    if (p) {
      const tx = HOME[0] + p.x * 9, ty = 232 - p.y * 3;
      await tick(330 * T, (q) => setBall(lerp(MOUND[0], tx, q), lerp(MOUND[1] - 2, ty, q), 0, false));
      if (!done()) return;
      if (p.k === 'whiff') { swing.setAttribute('opacity', 1); pop('SWING & MISS', 'bad', 160, 212); }
      else if (p.k === 'called') pop('STRIKE', 'bad', 160, 212);
      else if (p.k === 'ball') pop('BALL', 'good', 160, 212);
      else if (p.k === 'hbp') pop('HIT BY PITCH', 'warn', 160, 212);

      if (p.k === 'foul') {
        pop('FOUL', 'warn', 160, 212);
        const side = (p.x >= 0 ? 1 : -1);
        await flyBall([tx, ty], [HOME[0] + side * 150, HOME[1] - 40 - Math.abs(p.y) * 30], 520 * T, 46);
      } else if (p.k === 'inplay') {
        await hit(ev, moves, g, T, my);
        if (!done()) return;
      } else { await wait(140 * T); }
      if (!done()) return;
      hideBall(); swing.setAttribute('opacity', 0);
    }

    if (p && p.k !== 'inplay') {
      if (ev.result === 'K') pop('STRIKEOUT', 'bad');
      else if (ev.result === 'BB') pop(p.k === 'hbp' ? 'TAKE YOUR BASE' : 'WALK', 'good');
      if (ev.steal) pop(ev.steal === 'SB' ? 'STOLEN BASE!' : 'CAUGHT STEALING', ev.steal === 'SB' ? 'good' : 'bad');
      if (moves.length) await runMoves(moves, T);
    } else if (!p) {
      if (ev.result === 'BB') pop('INTENTIONAL WALK', 'warn');
      if (moves.length) await runMoves(moves, T);
    }
    if (!done()) return;
    if (ev.runs) pop(ev.runs > 1 ? `${ev.runs} RUNS SCORE` : 'RUN SCORES', 'good', 160, 150);
    await wait(260 * T);
    if (!done()) return;
    update(g);
  }

  async function hit(ev, moves, g, T, my) {
    const bip = ev.bip, res = ev.result, th = bip.zone * 0.73, dist = bip.depth * 200;
    const L = [HOME[0] + Math.sin(th) * dist, HOME[1] - Math.cos(th) * dist];
    const infield = [0, 2, 3, 4, 5], outfield = [6, 7, 8];
    const start = [HOME[0], HOME[1] - 8];
    const label = res === 'OUT' ? { GB: 'GROUND OUT', FB: 'FLY OUT', LD: 'LINE OUT' }[bip.t] : LABEL[res];
    const cls = res === 'OUT' ? 'bad' : res === 'HR' ? 'hr' : 'good';
    const startMoves = (delay) => wait(delay * T).then((ok) => (ok ? runMoves(moves, T) : null));
    if (res === 'BUNT') { /* falls through to a short ground ball */ }

    if (bip.t === 'GB') {
      const I = [HOME[0] + Math.sin(th) * Math.min(dist, 96), HOME[1] - Math.cos(th) * Math.min(dist, 96)];
      const f = nearest(infield, I);
      const fm = tick(380 * T, (q) => place(fielders[f], lerp(fielders[f].x, I[0], 0.12 + q * 0.04), lerp(fielders[f].y, I[1], 0.12 + q * 0.04)));
      await flyBall(start, I, 380 * T, 0, false); await fm;
      if (my !== token) return;
      const batterSafe = moves.some((m) => m.batter && !m.fade);
      if (res === 'OUT' || (res === 'BUNT' && !batterSafe)) {
        const mv = startMoves(0);
        await flyBall(I, [B1[0], B1[1] + 4], 230 * T, 6, false);
        pop(label || 'OUT', cls);
        await mv;
      } else {
        const out = nearest(outfield, L);
        const mv = startMoves(120);
        const chase = tick(520 * T, (q) => place(fielders[out], lerp(fielders[out].x, L[0], q * 0.8), lerp(fielders[out].y, L[1], q * 0.8)));
        pop(label || 'HIT', cls);
        await flyBall(I, L, 520 * T, 0, false);
        await Promise.all([mv, chase]);
      }
    } else {
      const apex = bip.t === 'FB' ? (res === 'HR' ? 92 : 64) : 16, ms = (bip.t === 'FB' ? 980 : 540) * T;
      const f = nearest(res === 'HR' ? outfield : [...outfield, ...infield], L);
      const chase = tick(ms * 0.9, (q) => place(fielders[f], lerp(fielders[f].x, L[0], q * (res === 'HR' ? 0.5 : 0.92)), lerp(fielders[f].y, Math.max(res === 'HR' ? 66 : 24, L[1]), q * (res === 'HR' ? 0.5 : 0.92))));
      const mv = startMoves(res === 'OUT' ? ms * 0.7 / T : 200);
      if (res === 'HR') pop('HOME RUN!', 'hr');
      await flyBall(start, L, ms, apex);
      if (my !== token) return;
      if (res !== 'HR') pop(label || 'IN PLAY', cls);
      await Promise.all([mv, chase]);
      if (res !== 'OUT' && res !== 'HR') await wait(120 * T);
    }
  }

  function cancel(g) { token++; update(g); }
  return { svg, update, play, cancel };
}
