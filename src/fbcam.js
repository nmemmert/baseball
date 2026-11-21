// Football field cam: a scrolling top-down field with formations and animated plays. The offense always drives to the right.
const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}, parent) => {
  const e = document.createElementNS(NS, name);
  for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};
const YW = 3.4, CY = 56, VW = 200, FIELD_W = 120 * YW;
const wx = (yard) => (yard + 10) * YW;
const lerp = (a, b, t) => a + (b - a) * t;
const clampv = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const initials = (n) => n.split(' ').map((x) => x[0]).join('').slice(0, 2);
const ease = (t) => t * t * (3 - 2 * t);

// Formation offsets (dx behind(-)/ahead(+) of the line of scrimmage, dy lateral) — index: 0-4 OL, 5 TE, 6 QB, 7 RB, 8-10 WR
function offFormation(call) {
  const run = ['inrun', 'outrun', 'sneak', 'kneel'].includes(call), gun = !run;
  return [[-2, -17], [-2, -8.5], [-2, 0], [-2, 8.5], [-2, 17], [-2, 26], [run ? -9 : -16, 0], [run ? -17 : -17, run ? 0 : 9], [-3, -48], [-3, 46], [-5, 33]];
}
// Defense: 0-3 DL, 4-6 LB, 7-8 CB, 9-10 S
function defFormation(call) {
  const f = [[4, -13], [4, -4.5], [4, 4.5], [4, 13], [14, -20], [14, 0], [14, 20], [9, -48], [9, 46], [40, -16], [40, 16]];
  if (call === 'stack') { f[4][0] = 9; f[5][0] = 8; f[6][0] = 9; f[9][0] = 24; f[10][0] = 20; }
  if (call === 'blitz') { f[4][0] = 5; f[5][0] = 4; f[6][0] = 5; f[9][0] = 28; f[10][0] = 30; }
  if (call === 'man') { f[7][0] = 5; f[8][0] = 5; f[7][1] = -44; f[8][1] = 42; f[9][0] = 36; }
  if (call === 'prevent') { f[7][0] = 38; f[8][0] = 38; f[9][0] = 62; f[10][0] = 62; f[4][0] = 18; f[5][0] = 18; f[6][0] = 18; }
  if (call === 'zone') { f[7][0] = 20; f[8][0] = 20; f[9][0] = 44; f[10][0] = 44; }
  return f;
}

export function createFbCam({ teamCol }) {
  const svg = el('svg', { viewBox: `0 0 ${VW} 112`, class: 'cam fbcam', role: 'img', 'aria-label': 'Football field' });
  const defs = el('defs', {}, svg);
  const lg = (id, stops, attrs) => { const g = el('linearGradient', { id, ...attrs }, defs); stops.forEach(([o, c, op]) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': op ?? 1 }, g)); };
  const rg = (id, stops, attrs) => { const g = el('radialGradient', { id, ...attrs }, defs); stops.forEach(([o, c, op]) => el('stop', { offset: o, 'stop-color': c, 'stop-opacity': op ?? 1 }, g)); };
  lg('fgGrass', [[0, '#2f9a4c'], [0.5, '#2a8c45'], [1, '#237a3b']], { x1: 0, y1: 0, x2: 0, y2: 1 });
  lg('fgShade', [[0, '#000', 0.34], [0.35, '#000', 0], [0.65, '#000', 0], [1, '#000', 0.34]], { x1: 0, y1: 0, x2: 0, y2: 1 });
  rg('fgDot', [[0, '#ffffff', 0.55], [0.55, '#ffffff', 0], [1, '#000000', 0.32]], { cx: 0.35, cy: 0.3, r: 0.85 });
  rg('fgBall', [[0, '#b5662f'], [1, '#6f3a14']], { cx: 0.4, cy: 0.35, r: 0.8 });
  const pat = el('pattern', { id: 'fgPat', width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
  el('rect', { width: 3.5, height: 7, fill: '#fff', 'fill-opacity': 0.12 }, pat);
  const noise = el('pattern', { id: 'fgNoise', width: 14, height: 14, patternUnits: 'userSpaceOnUse' }, defs);
  for (const [x, y] of [[2, 3], [9, 1], [5, 8], [12, 11], [1, 12], [8, 5]]) el('circle', { cx: x, cy: y, r: 0.55, fill: '#fff', 'fill-opacity': 0.07 }, noise);
  const world = el('g', {}, svg);
  el('rect', { class: 'fb-grass', x: 0, y: -40, width: FIELD_W, height: 192, fill: 'url(#fgGrass)' }, world);
  for (let i = 0; i < 10; i++) el('rect', { class: 'fb-stripe', x: wx(i * 10), y: -40, width: 10 * YW, height: 192, opacity: i % 2 ? 0.0 : 0.16 }, world);
  el('rect', { x: 0, y: -40, width: FIELD_W, height: 192, fill: 'url(#fgNoise)' }, world);
  const ezL = el('rect', { class: 'fb-ez', x: 0, y: -40, width: 10 * YW, height: 192 }, world);
  const ezR = el('rect', { class: 'fb-ez', x: wx(100), y: -40, width: 10 * YW, height: 192 }, world);
  el('rect', { x: 0, y: -40, width: 10 * YW, height: 192, fill: 'url(#fgPat)' }, world);
  el('rect', { x: wx(100), y: -40, width: 10 * YW, height: 192, fill: 'url(#fgPat)' }, world);
  const ezLt = el('text', { class: 'fb-eztext', x: 17, y: CY, 'text-anchor': 'middle', transform: `rotate(-90 17 ${CY})` }, world);
  const ezRt = el('text', { class: 'fb-eztext', x: wx(100) + 17, y: CY, 'text-anchor': 'middle', transform: `rotate(90 ${wx(100) + 17} ${CY})` }, world);
  const midRing = el('circle', { cx: wx(50), cy: CY, r: 15, fill: '#fff', 'fill-opacity': 0.1, stroke: '#fff', 'stroke-opacity': 0.4, 'stroke-width': 1.2 }, world);
  const midText = el('text', { x: wx(50), y: CY + 5, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 900, fill: '#fff', 'fill-opacity': 0.5 }, world);
  void midRing;
  for (let y = 0; y <= 100; y += 5) {
    el('line', { class: 'fb-yard', x1: wx(y), x2: wx(y), y1: -40, y2: 152, 'stroke-width': y % 10 === 0 ? 1.4 : 0.6 }, world);
    if (y % 10 === 0 && y > 0 && y < 100) {
      const lab = String(Math.min(y, 100 - y));
      for (const yy of [24, 98]) { const t = el('text', { class: 'fb-num', x: wx(y), y: yy, 'text-anchor': 'middle' }, world); t.textContent = lab; }
    }
  }
  for (let y = 1; y < 100; y++) for (const yy of [CY - 14, CY + 14]) el('line', { class: 'fb-hash', x1: wx(y), x2: wx(y), y1: yy - 1.2, y2: yy + 1.2 }, world);
  for (const gx of [wx(0) - 2, wx(100) + 2]) { el('path', { class: 'fb-post', d: `M${gx} ${CY - 9} V${CY + 9} M${gx} ${CY - 9} h0 M${gx - (gx < 100 ? 0 : 0)} ${CY} h${gx < 100 ? -5 : 5}`, fill: 'none' }, world); }
  const fdGlow = el('line', { y1: -40, y2: 152, stroke: '#ffd23f', 'stroke-width': 6, 'stroke-opacity': 0.25 }, world);
  const fdLine = el('line', { class: 'fb-fd', y1: -40, y2: 152 }, world), losLine = el('line', { class: 'fb-los', y1: -40, y2: 152 }, world);
  const ptsLayer = el('g', {}, world), fxLayer = el('g', {}, world);
  el('rect', { x: 0, y: 0, width: VW, height: 112, fill: 'url(#fgShade)', 'pointer-events': 'none' }, svg);
  const overlay = el('g', {}, svg);

  const dot = (parent, text = '', r = 5) => {
    const g = el('g', {}, parent);
    el('ellipse', { cx: 0.7, cy: r * 0.95, rx: r * 1.15, ry: r * 0.46, fill: '#000', 'fill-opacity': 0.32 }, g);
    const c = el('circle', { r, class: 'fb-dot' }, g), hl = el('circle', { r, fill: 'url(#fgDot)', 'pointer-events': 'none' }, g);
    const stripe = el('line', { x1: 0, x2: 0, y1: -r * 0.95, y2: r * 0.95, stroke: '#fff', 'stroke-opacity': 0.55, 'stroke-width': r * 0.22 }, g);
    const t = el('text', { class: 'fb-dot-t', 'text-anchor': 'middle', y: 1.8 }, g);
    t.textContent = text; void stripe;
    return { g, c, hl, t, x: 0, y: 0, setR(rr) { c.setAttribute('r', rr); hl.setAttribute('r', rr); } };
  };
  const place = (d, x, y) => { d.x = x; d.y = y; d.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`); };
  const offD = Array.from({ length: 11 }, () => dot(ptsLayer, '', 4.2)), defD = Array.from({ length: 11 }, () => dot(ptsLayer, '', 4));
  const ballG = el('g', { opacity: 0 }, fxLayer);
  const trail = el('polyline', { fill: 'none', stroke: '#fff', 'stroke-width': 1.4, 'stroke-opacity': 0.45, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ballG);
  const bShadow = el('ellipse', { rx: 3, ry: 1.4, fill: '#000', 'fill-opacity': 0.28 }, ballG);
  const ballBody = el('g', {}, ballG);
  el('ellipse', { rx: 2.9, ry: 1.8, fill: 'url(#fgBall)', stroke: '#fff', 'stroke-width': 0.35 }, ballBody);
  el('path', { d: 'M-1 0 H1 M-0.6 -0.7 V0.7 M0 -0.7 V0.7 M0.6 -0.7 V0.7', stroke: '#fff', 'stroke-width': 0.3, fill: 'none' }, ballBody);
  const flag = el('text', { class: 'fb-flag', 'text-anchor': 'middle', opacity: 0 }, fxLayer); flag.textContent = '🚩';
  const fxState = { on: true }, trailPts = [];

  let token = 0, camX = 0, temps = [], nameCache = null;

  const setCam = (x) => { camX = clampv(x, -4, FIELD_W - VW + 4); world.setAttribute('transform', `translate(${(-camX).toFixed(1)} 0)`); };
  const focus = (yard) => setCam(wx(yard) - VW * 0.42);
  const setBall = (x, y, h = 0) => {
    ballG.setAttribute('opacity', 1);
    const by = y - h;
    bShadow.setAttribute('cx', x); bShadow.setAttribute('cy', y + 2); bShadow.setAttribute('opacity', h > 1 ? 1 : 0);
    trailPts.push(`${x.toFixed(1)},${by.toFixed(1)}`); if (trailPts.length > 14) trailPts.shift();
    trail.setAttribute('points', fxState.on ? trailPts.join(' ') : '');
    ballBody.setAttribute('transform', `translate(${x.toFixed(1)} ${by.toFixed(1)}) rotate(${(h > 1 ? (x * 9) % 360 : 0).toFixed(0)})`);
  };
  const hideBall = () => { ballG.setAttribute('opacity', 0); trailPts.length = 0; trail.setAttribute('points', ''); };
  function burst(x, y, n = 18, colors = ['#ffd166', '#ffffff', '#ff8aa0', '#7dffb0'], spread = 40) {
    if (!fxState.on) return;
    const parts = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * 6.283 + Math.random() * 0.6, sp = spread * (0.5 + Math.random() * 0.7);
      return { c: el('circle', { r: 1.2 + Math.random() * 1.6, fill: colors[i % colors.length] }, fxLayer), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 12 };
    });
    tick(800, (p) => { for (const q of parts) { q.c.setAttribute('cx', x + q.vx * p); q.c.setAttribute('cy', y + q.vy * p + 40 * p * p); q.c.setAttribute('opacity', 1 - p); } }).then(() => parts.forEach((q) => q.c.remove()));
  }
  function flash() {
    if (!fxState.on) return;
    const r = el('rect', { x: 0, y: 0, width: VW, height: 112, fill: '#fff', opacity: 0.45, 'pointer-events': 'none' }, overlay);
    tick(380, (p) => r.setAttribute('opacity', 0.45 * (1 - p))).then(() => r.remove());
  }
  function shake(amp = 2.2) {
    if (!fxState.on) return;
    tick(320, (p) => svg.style.transform = `translate(${((Math.random() - 0.5) * amp * (1 - p)).toFixed(1)}px,${((Math.random() - 0.5) * amp * (1 - p)).toFixed(1)}px)`).then(() => { svg.style.transform = ''; });
  }
  const tick = (ms, fn) => new Promise((res) => {
    const my = token, t0 = performance.now();
    const f = (now) => { if (my !== token) { res(); return; } const p = Math.min(1, (now - t0) / ms); fn(p); if (p < 1) requestAnimationFrame(f); else res(); };
    requestAnimationFrame(f);
  });
  const wait = (ms) => new Promise((res) => { const my = token; setTimeout(() => res(my === token), ms); });
  function pop(text, cls = '', x, y = 40) {
    const t = el('text', { class: `cam-pop fbpop ${cls}`, x: x ?? camX + VW / 2, y, 'text-anchor': 'middle' }, fxLayer);
    t.textContent = text; temps.push(t);
    setTimeout(() => { t.remove(); temps = temps.filter((z) => z !== t); }, 1900);
  }
  const clearTemps = () => { for (const t of temps) t.remove(); temps = []; hideBall(); flag.setAttribute('opacity', 0); };

  function setField(g, snapState) {
    const s = snapState || g, side = g.phase === 'kickoff' ? g.kicking : g.poss;
    const off = teamCol(g[side]), def = teamCol(g[side === 'home' ? 'away' : 'home']);
    ezL.style.fill = off; ezR.style.fill = def;
    ezLt.textContent = g[side].nick.toUpperCase(); ezRt.textContent = g[side === 'home' ? 'away' : 'home'].nick.toUpperCase();
    const ballYard = g.phase === 'kickoff' ? 35 : s.ball;
    const x = wx(ballYard);
    losLine.setAttribute('x1', x); losLine.setAttribute('x2', x);
    const fd = g.phase === 'snap' ? Math.min(100, s.ball + s.toGo) : ballYard;
    fdLine.setAttribute('x1', wx(fd)); fdLine.setAttribute('x2', wx(fd)); fdLine.setAttribute('opacity', g.phase === 'snap' ? 1 : 0);
    fdGlow.setAttribute('x1', wx(fd)); fdGlow.setAttribute('x2', wx(fd)); fdGlow.setAttribute('opacity', g.phase === 'snap' ? 1 : 0);
    midText.textContent = (g.home.nick || '?')[0].toUpperCase();
    losLine.setAttribute('opacity', g.phase === 'snap' ? 1 : 0.4);
    return { x, off, def, ballYard };
  }

  function formation(g, offCall = 'short', defCall = 'base', snapState) {
    const { x, off, def } = setField(g, snapState);
    const side = g.phase === 'kickoff' ? g.kicking : g.poss, t = g[side], d = g[side === 'home' ? 'away' : 'home'];
    const of = offFormation(offCall), df = defFormation(defCall);
    offD.forEach((p, i) => { place(p, x + of[i][0] * 1.0, CY + of[i][1]); p.c.style.fill = off; p.g.setAttribute('opacity', 1); p.t.textContent = ''; });
    defD.forEach((p, i) => { place(p, x + df[i][0], CY + df[i][1]); p.c.style.fill = def; p.g.setAttribute('opacity', 1); p.t.textContent = ''; });
    offD[6].t.textContent = initials(t.players.QB[0].name); offD[6].setR(5);
    offD[7].t.textContent = initials(t.players.RB[0].name);
    offD[8].t.textContent = initials(t.players.WR[0].name); offD[9].t.textContent = initials(t.players.WR[1].name); offD[10].t.textContent = initials(t.players.WR[2].name);
    offD[5].t.textContent = initials(t.players.TE[0].name);
    void d; nameCache = { t, d };
  }

  function update(g) {
    clearTemps();
    if (!g) return;
    if (g.phase === 'kickoff') {
      const { x, off, def } = setField(g);
      // kickoff alignment: kicking team lined up on the left, receivers downfield
      offD.forEach((p, i) => { place(p, x - 4 + (i % 2) * 0.5, CY - 55 + i * 11); p.c.style.fill = off; p.t.textContent = ''; p.g.setAttribute('opacity', 1); });
      defD.forEach((p, i) => { place(p, wx(g.phase === 'kickoff' ? 65 : 65) + (i < 5 ? 0 : i < 8 ? 40 : 90), CY - 50 + (i % 6) * 18); p.c.style.fill = def; p.t.textContent = ''; p.g.setAttribute('opacity', 1); });
      focus(48);
      return;
    }
    formation(g, g.lastOffCall || 'short', g.lastDefCall || 'base');
    focus(g.ball);
  }

  const dir = (n) => offD[n];
  function targetIndex(side, g, uid) {
    const P = g[side].players;
    if (P.TE[0].uid === uid) return 5;
    const w = P.WR.findIndex((p) => p.uid === uid); if (w >= 0) return 8 + w;
    if (P.RB.some((p) => p.uid === uid)) return 7;
    return 8;
  }

  async function play(ev, snap, g, opts = {}) {
    const my = ++token, mode = opts.mode || 'full';
    fxState.on = opts.effects !== false;
    if (mode === 'off' || !ev || !snap) { update(g); return; }
    const T = mode === 'quick' ? 0.5 : 1, done = () => my === token;
    clearTemps();
    const side = snap.phase === 'kickoff' ? snap.kicking : snap.poss;
    const ev0 = { ...snap };
    // restore pre-snap state/orientation
    const pre = { ball: snap.ball, toGo: snap.toGo, down: snap.down };
    const gPre = { ...g, phase: snap.phase, poss: snap.poss, kicking: snap.kicking, ball: snap.ball, toGo: snap.toGo, down: snap.down, home: g.home, away: g.away };
    formation(gPre, ev.call, snap.defCall || 'base', pre);
    setCam(wx(snap.phase === 'kickoff' ? 35 : snap.ball) - VW * 0.42);
    const x0 = wx(snap.phase === 'kickoff' ? 35 : snap.ball);
    await wait(200 * T);
    if (!done()) return;

    const resultPop = () => {
      if (ev.td) { pop('TOUCHDOWN!', 'hr', undefined, 34); burst(wx(100) + 18, CY, 26); flash(); shake(); }
      else if (ev.result === 'SACK') { pop(`SACK  ${ev.yards}`, 'bad'); shake(1.6); }
      else if (ev.result === 'INTERCEPTION') pop('INTERCEPTED!', 'bad');
      else if (ev.result === 'FUMBLE') pop('FUMBLE!', 'bad');
      else if (ev.result === 'INCOMPLETE') pop('INCOMPLETE', 'warn');
      else if (ev.result === 'DOWNS') pop('TURNOVER ON DOWNS', 'bad');
      else if (ev.fd) pop(`FIRST DOWN  ${ev.yards > 0 ? '+' : ''}${ev.yards}`, 'good');
      else if (ev.type === 'play') pop(`${ev.yards > 0 ? '+' : ''}${ev.yards} yd${Math.abs(ev.yards) === 1 ? '' : 's'}`, ev.yards < 0 ? 'bad' : '');
    };

    if (ev.type === 'penalty') {
      flag.setAttribute('x', x0); flag.setAttribute('y', CY - 20); flag.setAttribute('opacity', 1);
      pop(ev.penalty, 'warn'); await wait(900 * T);
    } else if (ev.type === 'kickoff') {
      const K = offD[6]; place(K, x0 - 14, CY);
      const toX = wx(ev.result === 'ONSIDE' || ev.result === 'ONSIDE FAIL' ? 55 : 92), a = (p) => setBall(lerp(x0, toX, p), CY - 10 * 0 + 0, Math.sin(p * Math.PI) * (ev.call === 'onside' ? 8 : 30));
      await tick(750 * T, (p) => { a(p); setCam(lerp(x0 - VW * 0.42, toX - VW * 0.6, ease(p))); });
      if (!done()) return;
      pop(ev.result === 'TOUCHBACK' ? 'TOUCHBACK' : ev.result === 'RETURN' ? `RETURN TO THE ${ev.ret}` : ev.result, 'good');
      const r = defD[9]; place(r, toX, CY); await tick(450 * T, (p) => place(r, lerp(toX, toX - 40, p), CY));
    } else if (ev.type === 'try') {
      pop(ev.result, ev.score ? 'good' : 'bad'); setBall(wx(100) + 2, CY, 0);
      await tick(600 * T, (p) => setBall(lerp(x0, wx(100) + 4, p), CY, Math.sin(p * Math.PI) * 22));
    } else if (ev.call === 'punt') {
      const P = offD[6]; place(P, x0 - 28, CY);
      const toX = wx(ev.to > 100 ? 100 : ev.to);
      await tick(900 * T, (p) => { setBall(lerp(x0 - 28, toX, p), CY, Math.sin(p * Math.PI) * 34); setCam(lerp(x0 - VW * 0.42, toX - VW * 0.6, ease(p))); });
      if (!done()) return;
      pop(ev.result === 'TOUCHBACK' ? 'TOUCHBACK' : `PUNT ${ev.air} YDS`, ev.result === 'BLOCKED' ? 'bad' : ''); await wait(350 * T);
    } else if (ev.call === 'fg') {
      const K = offD[6]; place(K, x0 - 20, CY);
      const px = wx(100) + 2;
      await tick(700 * T, (p) => { setBall(lerp(x0 - 20, px, p), CY + (ev.fg && !ev.fg.good ? p * 12 : 0), Math.sin(p * Math.PI) * 26); setCam(lerp(x0 - VW * 0.42, px - VW * 0.7, ease(p))); });
      if (!done()) return;
      pop(ev.fg && ev.fg.good ? `FIELD GOAL GOOD  ${ev.fg.dist}` : 'NO GOOD', ev.fg && ev.fg.good ? 'good' : 'bad'); if (ev.fg && ev.fg.good) burst(px + 4, CY, 14); await wait(500 * T);
    } else if (['inrun', 'outrun', 'sneak'].includes(ev.call)) {
      const C = ev.call === 'sneak' ? offD[6] : offD[7], endX = wx(snap.ball + ev.yards), lat = ev.call === 'outrun' ? (g.rng ? 26 : 26) : 4;
      const sx = C.x, sy = C.y;
      setBall(sx, sy);
      await tick(260 * T, (p) => { place(C, lerp(sx, x0 - 5, p), lerp(sy, CY - 3, p)); setBall(C.x, C.y); });
      if (!done()) return;
      const run = Math.abs(endX - x0) / YW;
      await tick((420 + run * 22) * T, (p) => {
        const q = ease(p);
        place(C, lerp(x0 - 5, endX, q), lerp(CY - 3, CY - 3 + (ev.call === 'outrun' ? lat : lat * 0.3), q));
        setBall(C.x, C.y);
        offD.slice(0, 5).forEach((o, i) => place(o, lerp(x0 - 2, x0 + 4 + Math.max(0, (endX - x0) * 0.25), q), o.y));
        defD.forEach((dd, i) => { if (i < 7 || i > 8) place(dd, lerp(dd.x, endX + (i % 3 - 1) * 5, q * (i < 4 ? 0.5 : 0.95)), lerp(dd.y, C.y + (i % 4 - 1.5) * 6, q * 0.7)); });
        setCam(lerp(x0 - VW * 0.42, endX - VW * 0.45, q));
      });
      if (!done()) return;
      resultPop(); await wait(450 * T);
    } else {
      // passing plays
      const QB = offD[6], qx = QB.x, qy = QB.y, ti = targetIndex(side, g, ev.target), R = offD[ti] || offD[8];
      const catchX = wx(snap.ball + Math.max(ev.air || 0, 1)), endX = wx(snap.ball + ev.yards);
      const rx = R.x, ry = R.y;
      await tick(230 * T, (p) => place(QB, lerp(qx, qx - 5, p), qy));
      if (!done()) return;
      if (ev.result === 'SACK') {
        const rusher = defD[1 + (g.plays % 3)];
        const toX = wx(snap.ball + ev.yards);
        await tick(520 * T, (p) => { place(rusher, lerp(rusher.x, toX, p), lerp(rusher.y, qy, p)); place(QB, lerp(qx - 5, toX - 2, ease(p)), qy); setCam(lerp(x0 - VW * 0.42, toX - VW * 0.42, p)); });
        if (!done()) return;
        resultPop(); await wait(500 * T);
      } else {
        const tx = ev.result === 'INCOMPLETE' ? catchX + 14 : catchX, ty = ry + (ti >= 8 ? (ry < CY ? 8 : -8) : 6);
        setBall(qx - 5, qy);
        await tick((420 + (ev.air || 0) * 9) * T, (p) => {
          setBall(lerp(qx - 5, tx, p), lerp(qy, ty, p), Math.sin(p * Math.PI) * (14 + (ev.air || 0) * 0.6));
          place(R, lerp(rx, catchX, ease(Math.min(1, p * 1.15))), lerp(ry, ty, p));
          const cb = defD[7 + (ry > CY ? 1 : 0)]; place(cb, lerp(cb.x, catchX + (ev.result === 'INTERCEPTION' ? 0 : 6), p * 0.9), lerp(cb.y, ty, p * 0.9));
          setCam(lerp(x0 - VW * 0.42, catchX - VW * 0.42, p));
        });
        if (!done()) return;
        if (ev.result === 'INTERCEPTION') { resultPop(); await wait(600 * T); }
        else if (ev.result === 'INCOMPLETE') { resultPop(); await wait(500 * T); }
        else {
          const run = Math.abs(endX - catchX) / YW;
          await tick((250 + run * 26) * T, (p) => { place(R, lerp(catchX, endX, ease(p)), ty); setBall(R.x, R.y); setCam(lerp(catchX - VW * 0.42, endX - VW * 0.45, p)); });
          if (!done()) return;
          resultPop(); await wait(450 * T);
        }
      }
    }
    if (!done()) return;
    await wait(120 * T);
    if (!done()) return;
    update(g);
  }

  function cancel(g) { token++; update(g); }
  return { svg, update, play, cancel, setDefCall: () => {} };
}
