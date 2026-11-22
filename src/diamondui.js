// Skipper Diamond UI: canvas plate view (pitching and batting) and field view (balls in play). Logic lives in diamond.js.
import {
  newDiamond, step, throwPitch, swing, toggleSteal, decide, ballAt, userBatting, userPitching, batTeam, fieldTeam, PITCHES, LEVELS, TEAMS, ZONE, POS, BAG, fenceAt,
} from './diamond.js';
import { fx } from './feedback.js';

const KEY = 'skipper-diamond-v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const store = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* private mode */ } };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const INN = [['3 innings', 3], ['5 innings', 5], ['9 innings', 9]];
const ORD = (n) => `${n}${['th', 'st', 'nd', 'rd'][n > 3 && n < 21 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;

export const DIAMOND_HOW = [
  ['You play every pitch', 'No managing. You bat, you pitch, and you make the throws, with your thumbs.'],
  ['Batting', 'Drag on the aim pad to place the bat circle where you think the pitch will cross the plate, then tap SWING (or tap the screen) just as the ball reaches the plate. Early pulls it left, late pushes it right. Swing under the ball for a fly, over it for a grounder. Not a strike? Let it go.'],
  ['Pitching', 'Pick a pitch, drag the aim pad to choose a spot, press PITCH, then press again when the marker is in the green centre for an accurate throw. Corners and low pitches are hard to hit. Curveballs drop, sliders break sideways, changeups are slow.'],
  ['Running', 'When you get a hit that could stretch, tap STRETCH to try for an extra base. Throw out and you are out. With a runner on first and the pitch coming, tap STEAL.'],
  ['Fielding', 'When the other team hits it and runners are on, choose where to throw: 1st, 2nd, 3rd or Home. A quick, smart throw makes double plays and nabs runners.'],
  ['The game', 'Three outs per half. You bat first (top of the inning). Pick 3, 5 or 9 innings in the menu.'],
];

export function openDiamond({ onClose } = {}) {
  const S = {
    rec: load(), view: 'menu', g: null, demo: false, paused: false, banner: null, bannerT: 0, shake: 0, parts: [], raf: 0, last: 0, acc: 0,
    cur: { x: 0, y: 0 }, pm: { type: 'FB', tx: 0, ty: 0, meter: null }, pad: { id: -1 }, endSaved: false, flash: 0, tipSeen: S_tips(),
  };
  function S_tips() { return {}; }
  S.rec.set = Object.assign({ lv: 1, inn: 5, lh: 0 }, S.rec.set || {});
  const root = document.createElement('div'); root.id = 'diamond';
  root.innerHTML = `<canvas class="dm-cv"></canvas>
    <div class="dm-top"><div class="dm-sb"><div class="dm-tm"><b data-k="u"></b><em data-k="us">0</em></div><div class="dm-mid"><i data-k="inn"></i><span class="dm-outs" data-k="outs"></span><span class="dm-cnt" data-k="cnt"></span></div><div class="dm-tm r"><em data-k="cs">0</em><b data-k="c"></b></div><div class="dm-bases" data-k="bases"><i class="b2"></i><i class="b3"></i><i class="b1"></i></div></div><button class="dm-x" data-a="pause" aria-label="Pause">❚❚</button></div>
    <div class="dm-bn"></div><div class="dm-cap"></div><div class="dm-who"></div>
    <div class="dm-ctl"></div><div class="dm-modal"></div>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s), cv = $('.dm-cv'), ctx = cv.getContext('2d');
  const q = (k) => root.querySelector(`[data-k="${k}"]`);
  let cw = 0, ch = 0, dpr = 1;
  const resize = () => { dpr = Math.min(2, window.devicePixelRatio || 1); cw = root.clientWidth; ch = root.clientHeight; cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); root.classList.toggle('land', cw > ch); };
  resize(); window.addEventListener('resize', resize);

  /* ------------------------------------ flow ------------------------------------ */
  function start(demo) {
    const opp = TEAMS[Math.floor(Math.random() * TEAMS.length)];
    S.g = newDiamond({ level: S.rec.set.lv, innings: S.rec.set.inn, opp, name: 'Skipper', col: '#2b6cb0', auto: demo, seed: (Math.random() * 2 ** 31) | 0 });
    S.demo = demo; S.view = 'game'; S.paused = false; S.endSaved = false; S.banner = null; S.parts = []; S.pm.meter = null; S.csig = ''; modal('');
    root.classList.toggle('lefty', !!S.rec.set.lh);
  }
  function quit() { cancelAnimationFrame(S.raf); window.removeEventListener('resize', resize); window.removeEventListener('keydown', kd); document.removeEventListener('visibilitychange', vis); root.remove(); if (onClose) onClose(); }
  const vis = () => { if (document.hidden && S.view === 'game' && !S.demo) setPause(true); };
  document.addEventListener('visibilitychange', vis);
  function setPause(on) { if (S.view !== 'game') return; S.paused = on; modal(on ? `<div class="dm-card"><h2>Paused</h2><button class="dm-go" data-a="resume">▶ Resume</button><button data-a="quit2">Quit to menu</button></div>` : ''); }
  function modal(html) { const m = $('.dm-modal'); m.innerHTML = html; m.classList.toggle('on', !!html); }
  const rec = () => `${S.rec.w || 0}-${S.rec.l || 0}${S.rec.t ? `-${S.rec.t}` : ''}`;
  const seg = (k, cur, opts) => `<div class="dm-seg">${opts.map(([n, v]) => `<button data-a="${k}" data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  function menuHtml() {
    const s = S.rec.set;
    return `<div class="dm-card"><div class="dm-logo">DIAMOND</div><p class="dm-sub">Baseball you actually play. Swing, pitch, throw, run.</p>
      <button class="dm-go" data-a="play">▶ Play a game</button>
      <div class="dm-row"><button data-a="demo">👀 Watch a demo</button><button data-a="how">📖 How to play</button></div>
      <div class="dm-opt"><span>Difficulty</span>${seg('lv', s.lv, LEVELS.map((l) => [l.name, l.id]))}</div>
      <div class="dm-opt"><span>Length</span>${seg('inn', s.inn, INN.map(([n, v]) => [n, v]))}</div>
      <div class="dm-opt"><span>Hand</span>${seg('lh', s.lh, [['Right-handed', 0], ['Left-handed', 1]])}</div>
      <p class="dm-rec">Record: <b>${rec()}</b>${S.rec.hr ? ` · career HR ${S.rec.hr}` : ''}</p><button class="dm-link" data-a="exit">← Back to Skipper</button></div>`;
  }
  const howHtml = () => `<div class="dm-card dm-how"><h2>How to play</h2>${DIAMOND_HOW.map(([h, t]) => `<h3>${h}</h3><p>${t}</p>`).join('')}<button class="dm-go" data-a="menu">Got it</button></div>`;
  function finalHtml(g) {
    const w = g.winner, head = w === 'U' ? '🏆 You win!' : w === 'C' ? 'Tough loss' : 'Tie game', n = Math.max(g.inning, g.innings);
    const row = (t) => `<tr><td>${esc(g.names[t])}</td>${Array.from({ length: n }, (_, i) => `<td>${g.byInning[t][i] ?? (t === 'C' && i === n - 1 && g.half === 'top' ? '–' : 0)}</td>`).join('')}<th>${g.score[t]}</th><td>${g.stat[t].h}</td></tr>`;
    return `<div class="dm-card"><div class="dm-logo sm">${head}</div><table class="dm-line"><tr><td></td>${Array.from({ length: n }, (_, i) => `<td>${i + 1}</td>`).join('')}<th>R</th><td>H</td></tr>${row('U')}${row('C')}</table>
      <p class="dm-sub">Your hitters: ${g.stat.U.h} hits, ${g.stat.U.hr} HR, ${g.stat.C.k} strikeouts thrown, ${g.stat.U.sb} steals. Double plays turned: ${g.stat.C.dp}.</p>
      <button class="dm-go" data-a="play">↻ Play again</button><button data-a="menu">Menu</button></div>`;
  }
  modal(menuHtml());

  /* ------------------------------------ input ------------------------------------ */
  const PADR = 1.35;
  function padPoint(e) { const pad = $('.dm-pad'); if (!pad) return; const r = pad.getBoundingClientRect(); const x = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1) * PADR, y = clamp(1 - ((e.clientY - r.top) / r.height) * 2, -1, 1) * PADR; setAim(x, y); }
  function setAim(x, y) { S.cur.x = x; S.cur.y = y; S.pm.tx = x; S.pm.ty = y; const d = $('.dm-dot'); if (d) { d.style.left = `${50 + (x / PADR) * 50}%`; d.style.top = `${50 - (y / PADR) * 50}%`; } }
  root.addEventListener('pointerdown', (e) => {
    const pad = e.target.closest('.dm-pad'); if (pad) { e.preventDefault(); pad.setPointerCapture?.(e.pointerId); S.pad.id = e.pointerId; padPoint(e); return; }
    const sw = e.target.closest('[data-b]'); if (sw) { e.preventDefault(); press(sw.dataset.b); return; }
    if (e.target === cv && S.g && userBatting(S.g)) press('swing');
  });
  root.addEventListener('pointermove', (e) => { if (e.pointerId === S.pad.id) { e.preventDefault(); padPoint(e); } });
  const padUp = (e) => { if (e.pointerId === S.pad.id) S.pad.id = -1; };
  root.addEventListener('pointerup', padUp); root.addEventListener('pointercancel', padUp);
  function press(id) {
    const g = S.g; if (!g || S.view !== 'game' || S.paused) return;
    if (id === 'swing') { if (swing(g, S.cur.x, S.cur.y)) fx.whoosh(); }
    else if (id === 'steal') { if (toggleSteal(g)) fx.tick(); }
    else if (id.startsWith('p:')) { S.pm.type = id.slice(2); fx.tick(); S.csig = ''; }
    else if (id === 'pitch') {
      if (!userPitching(g) || g.phase !== 'ready') return;
      if (!S.pm.meter) { S.pm.meter = { x: 0, dir: 1, t: 0 }; return; }
      const m = S.pm.meter, err = clamp((Math.abs(m.x - 0.5) - 0.045) / 0.46, 0, 1); S.pm.meter = null;
      throwPitch(g, S.pm.type, S.pm.tx, S.pm.ty, err);
    } else if (id.startsWith('d:')) { const v = id.slice(2); if (v === 'stretch') decide(g, 'stretch'); else decide(g, v); fx.tick(); }
  }
  const kd = (e) => {
    const g = S.g; if (!g || S.view !== 'game') return; const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); press(userPitching(g) ? 'pitch' : 'swing'); }
    else if (k === 's') press('steal'); else if (k === 'e') press('d:stretch'); else if (['1', '2', '3'].includes(k)) press(`d:${k}`); else if (k === 'h') press('d:H');
    else if (k === 'arrowleft') setAim(S.cur.x - 0.15, S.cur.y); else if (k === 'arrowright') setAim(S.cur.x + 0.15, S.cur.y); else if (k === 'arrowup') setAim(S.cur.x, S.cur.y + 0.15); else if (k === 'arrowdown') setAim(S.cur.x, S.cur.y - 0.15);
  };
  window.addEventListener('keydown', kd);
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]'); if (!a) return; const k = a.dataset.a;
    if (k === 'lv') { S.rec.set.lv = +a.dataset.v; store(S.rec); modal(menuHtml()); }
    else if (k === 'inn') { S.rec.set.inn = +a.dataset.v; store(S.rec); modal(menuHtml()); }
    else if (k === 'lh') { S.rec.set.lh = +a.dataset.v; store(S.rec); modal(menuHtml()); root.classList.toggle('lefty', !!S.rec.set.lh); }
    else if (k === 'play') start(false); else if (k === 'demo') start(true);
    else if (k === 'how') modal(howHtml()); else if (k === 'menu') { S.view = 'menu'; S.g = null; S.paused = false; modal(menuHtml()); drawCtl(); }
    else if (k === 'exit') quit(); else if (k === 'pause') { if (S.view === 'game') setPause(!S.paused); else if (S.view === 'menu') quit(); }
    else if (k === 'resume') setPause(false); else if (k === 'quit2') { S.view = 'menu'; S.g = null; S.paused = false; modal(menuHtml()); drawCtl(); }
  });

  /* ------------------------------------ controls ------------------------------------ */
  function drawCtl() {
    const g = S.g, box = $('.dm-ctl');
    if (!g || S.view !== 'game' || S.demo || g.over) { if (S.csig !== 'x') { S.csig = 'x'; box.innerHTML = ''; } return; }
    let sig, html = '';
    const pad = `<div class="dm-pad"><i class="dm-zone"></i><i class="dm-dot"></i></div>`;
    if (g.phase === 'bip' && g.pending) {
      const pd = g.pending;
      sig = `d:${pd.kind}:${(pd.opts || []).join('')}`;
      if (pd.kind === 'stretch') html = `<div class="dm-dec"><b>Stretch it?</b><button class="dm-big" data-b="d:stretch">⚡ GO FOR ${pd.to === 2 ? 'TWO' : 'THREE'}</button><div class="dm-bar"><i></i></div></div>`;
      else html = `<div class="dm-dec"><b>Where's the throw?</b><div class="dm-bs">${pd.opts.map((o) => `<button class="dm-big" data-b="d:${o}">${o === 'H' ? 'HOME' : o === '1' ? '1ST' : o === '2' ? '2ND' : '3RD'}</button>`).join('')}</div><div class="dm-bar"><i></i></div></div>`;
    } else if (userBatting(g) && (g.phase === 'ready' || g.phase === 'pitch' || g.phase === 'result')) {
      const canSteal = g.bases[0] && !g.bases[1];
      sig = `bat:${canSteal ? 1 : 0}`;
      html = `${pad}<div class="dm-act">${canSteal ? `<button class="dm-sm ${g.steal ? 'on' : ''}" data-b="steal">🏃 STEAL</button>` : ''}<button class="dm-swing" data-b="swing">SWING</button></div>`;
    } else if (userPitching(g) && (g.phase === 'ready' || g.phase === 'pitch' || g.phase === 'result')) {
      sig = `pit:${S.pm.type}:${S.pm.meter ? 1 : 0}`;
      html = `<div class="dm-types">${Object.entries(PITCHES).map(([k, p]) => `<button class="${S.pm.type === k ? 'on' : ''}" data-b="p:${k}">${p.n}</button>`).join('')}</div>${pad}<div class="dm-act"><div class="dm-meter ${S.pm.meter ? 'on' : ''}"><i class="dm-sweet"></i><i class="dm-mk"></i></div><button class="dm-swing pitch" data-b="pitch">${S.pm.meter ? 'THROW!' : 'PITCH'}</button></div>`;
    } else { sig = 'none'; }
    if (g.steal) sig += ':s';
    if (sig !== S.csig) { S.csig = sig; box.innerHTML = html; const d = $('.dm-dot'); if (d) { d.style.left = `${50 + (S.cur.x / PADR) * 50}%`; d.style.top = `${50 - (S.cur.y / PADR) * 50}%`; } }
    const bar = $('.dm-bar i'); if (bar && g.pending) bar.style.width = `${clamp(1 - g.pending.t / g.pending.dl, 0, 1) * 100}%`;
    const mk = $('.dm-mk'); if (mk && S.pm.meter) mk.style.left = `${S.pm.meter.x * 100}%`;
  }

  /* ------------------------------------ drawing: plate view ------------------------------------ */
  function plateGeom() { const zw = Math.min(cw * 0.3, ch * (cw > ch ? 0.27 : 0.2)), cx = cw / 2, cy = ch * (cw > ch ? 0.5 : 0.47); return { zw, cx, cy, k: zw / ZONE }; }
  function drawPlate(g) {
    const { zw, cx, cy, k } = plateGeom();
    // sky + stands
    const sky = ctx.createLinearGradient(0, 0, 0, ch * 0.38); sky.addColorStop(0, '#16335f'); sky.addColorStop(1, '#2d5a97'); ctx.fillStyle = sky; ctx.fillRect(0, 0, cw, ch * 0.4);
    ctx.fillStyle = '#10224a'; ctx.fillRect(0, ch * 0.22, cw, ch * 0.1);
    for (let i = 0; i < 260; i++) { const x = (i * 97 % cw), y = ch * 0.22 + ((i * 53) % (ch * 0.1)); ctx.fillStyle = ['#e8c9a0', '#c0392b', '#f1f1f1', '#3a7bd5', '#f2c94c'][i % 5]; ctx.globalAlpha = 0.55; ctx.fillRect(x, y, 3, 3); }
    ctx.globalAlpha = 1; ctx.fillStyle = '#0d1b36'; ctx.fillRect(0, ch * 0.32, cw, ch * 0.03);
    // grass, dirt, mound
    const gr = ctx.createLinearGradient(0, ch * 0.35, 0, ch); gr.addColorStop(0, '#2b8a47'); gr.addColorStop(1, '#1b6a35'); ctx.fillStyle = gr; ctx.fillRect(0, ch * 0.35, cw, ch * 0.65);
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i & 1 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.04)'; ctx.fillRect(0, ch * 0.35 + i * ch * 0.08, cw, ch * 0.08); }
    ctx.fillStyle = '#b9824f'; ctx.beginPath(); ctx.ellipse(cx, cy + zw * 1.55, zw * 2.6, zw * 0.95, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#c99660'; ctx.beginPath(); ctx.ellipse(cx, ch * 0.405, zw * 0.55, zw * 0.14, 0, 0, 6.3); ctx.fill();
    // pitcher (small, at the mound)
    const pc = g.col[fieldTeam(g)], pr = zw * 0.13, py = ch * 0.37;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(cx, py + pr * 3.4, pr * 1.4, pr * 0.5, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = pc; ctx.fillRect(cx - pr * 0.8, py + pr * 0.4, pr * 1.6, pr * 2.9); ctx.fillStyle = '#e6b286'; ctx.beginPath(); ctx.arc(cx, py, pr * 0.8, 0, 6.3); ctx.fill(); ctx.fillStyle = pc; ctx.beginPath(); ctx.arc(cx, py - pr * 0.2, pr * 0.82, Math.PI, 0); ctx.fill();
    // home plate and batter box
    ctx.fillStyle = '#c99660'; ctx.beginPath(); ctx.ellipse(cx, cy + zw * 1.8, zw * 2.2, zw * 0.55, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx - zw * 0.55, cy + zw * 1.52); ctx.lineTo(cx + zw * 0.55, cy + zw * 1.52); ctx.lineTo(cx + zw * 0.55, cy + zw * 1.68); ctx.lineTo(cx, cy + zw * 1.82); ctx.lineTo(cx - zw * 0.55, cy + zw * 1.68); ctx.closePath(); ctx.fill();
    // batter (righty on the left)
    const bc = g.col[batTeam(g)], bx = cx - zw * 1.45, by = cy + zw * 0.15; ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(bx, by + zw * 1.75, zw * 0.5, zw * 0.15, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = bc; ctx.fillRect(bx - zw * 0.28, by + zw * 0.35, zw * 0.56, zw * 1.2); ctx.fillStyle = '#d9a97a'; ctx.beginPath(); ctx.arc(bx, by + zw * 0.15, zw * 0.24, 0, 6.3); ctx.fill(); ctx.fillStyle = bc; ctx.beginPath(); ctx.arc(bx, by + zw * 0.1, zw * 0.26, Math.PI, 0); ctx.fill();
    const swingA = g.pitch && g.pitch.swing ? clamp((g.pitch.t - g.pitch.swing.t) / 0.16, 0, 1) : 0;
    ctx.save(); ctx.translate(bx + zw * 0.2, by + zw * 0.55); ctx.rotate(-1.2 + swingA * 2.8); ctx.fillStyle = '#d4a05a'; ctx.fillRect(0, -zw * 0.04, zw * 1.1, zw * 0.08); ctx.restore();
    // catcher + ump
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(cx, cy + zw * 1.15, zw * 0.42, 0, 6.3); ctx.fill(); ctx.fillStyle = '#4a4a55'; ctx.fillRect(cx - zw * 0.38, cy + zw * 1.5, zw * 0.76, zw * 0.5); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(cx, cy + zw * 1.14, zw * 0.28, 0, 6.3); ctx.fill();
    // strike zone
    ctx.strokeStyle = userBatting(g) ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.55)'; ctx.lineWidth = 2.5; ctx.strokeRect(cx - zw, cy - zw, zw * 2, zw * 2);
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.32)'; for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(cx - zw + (zw * 2 * i) / 3, cy - zw); ctx.lineTo(cx - zw + (zw * 2 * i) / 3, cy + zw); ctx.moveTo(cx - zw, cy - zw + (zw * 2 * i) / 3); ctx.lineTo(cx + zw, cy - zw + (zw * 2 * i) / 3); ctx.stroke(); }
    // user aim marker (bat circle / target)
    const pt = g.pitch, mine = !S.demo && (userBatting(g) || userPitching(g));
    if (mine && (g.phase === 'ready' || g.phase === 'pitch')) {
      const x = cx + S.cur.x * k, y = cy - S.cur.y * k;
      ctx.strokeStyle = userBatting(g) ? '#ffd33d' : '#4aa8ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, zw * 0.22, 0, 6.3); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - zw * 0.32, y); ctx.lineTo(x + zw * 0.32, y); ctx.moveTo(x, y - zw * 0.32); ctx.lineTo(x, y + zw * 0.32); ctx.stroke();
    }
    // the ball
    if (pt && g.phase === 'pitch') {
      const u = pt.t / pt.dur, b = ballAt(pt, u), x = cx + b.x * k, y = cy - b.y * k, r = Math.max(3, zw * 0.19 * b.s);
      for (let i = 1; i <= 4; i++) { const bb = ballAt(pt, u - i * 0.035); ctx.globalAlpha = 0.2 - i * 0.04; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + bb.x * k, cy - bb.y * k, Math.max(2, zw * 0.19 * bb.s), 0, 6.3); ctx.fill(); }
      ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x, cy + zw * 1.55 - (1 - b.s) * zw * 1.3, r * 0.9, r * 0.3, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill(); ctx.strokeStyle = '#c0392b'; ctx.lineWidth = Math.max(1, r * 0.14); ctx.beginPath(); ctx.arc(x - r * 0.45, y, r * 0.75, -1, 1); ctx.stroke(); ctx.beginPath(); ctx.arc(x + r * 0.45, y, r * 0.75, Math.PI - 1, Math.PI + 1); ctx.stroke();
      if (u > 0.22 && (userBatting(g) || S.demo)) { ctx.fillStyle = 'rgba(6,20,44,.8)'; ctx.font = `800 ${Math.max(12, zw * 0.17)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const tx = `${PITCHES[pt.type].n} ${pt.spd}`; const w = ctx.measureText(tx).width + 14; ctx.fillRect(cx - w / 2, ch * 0.285, w, zw * 0.3); ctx.fillStyle = '#fff'; ctx.fillText(tx, cx, ch * 0.285 + zw * 0.15); }
    }
    // show where the last pitch crossed (result phase)
    if (pt && (g.phase === 'result') && !g.bip) { const x = cx + pt.x * k, y = cy - pt.y * k; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, zw * 0.15, 0, 6.3); ctx.fill(); ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2; ctx.stroke(); }
  }

  /* ------------------------------------ drawing: field view ------------------------------------ */
  function fieldGeom() { const ppf = Math.min(cw / 560, (ch * 0.78) / 430); return { ppf, ox: cw / 2, oy: ch * 0.9 }; }
  const F = (p, geom) => [geom.ox + p[0] * geom.ppf, geom.oy - p[1] * geom.ppf];
  function drawField(g) {
    const gm = fieldGeom(), { ppf } = gm, bip = g.bip; ctx.fillStyle = '#1b6a35'; ctx.fillRect(0, 0, cw, ch);
    const H = F([0, 0], gm);
    // outfield grass fan to the fence
    ctx.fillStyle = '#2b8a47'; ctx.beginPath(); ctx.moveTo(H[0], H[1]);
    for (let a = -45; a <= 45; a += 3) { const r = fenceAt(a), p = F([r * Math.sin((a * Math.PI) / 180), r * Math.cos((a * Math.PI) / 180)], gm); ctx.lineTo(p[0], p[1]); } ctx.closePath(); ctx.fill();
    // mowing stripes
    for (let i = 0; i < 12; i++) { ctx.strokeStyle = i & 1 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)'; ctx.lineWidth = ppf * 28; ctx.beginPath(); ctx.arc(H[0], H[1], ppf * (60 + i * 28), -2.4, -0.74); ctx.stroke(); }
    // infield dirt
    ctx.fillStyle = '#b9824f'; ctx.beginPath(); ctx.arc(H[0], H[1] - 0 * ppf, ppf * 98, -Math.PI, 0); ctx.closePath(); ctx.save(); ctx.beginPath(); ctx.arc(F([0, 70], gm)[0], F([0, 70], gm)[1], ppf * 98, 0, 6.3); ctx.clip(); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#2b8a47'; ctx.save(); ctx.translate(...F([0, 63.6], gm)); ctx.rotate(Math.PI / 4); ctx.fillRect(-ppf * 44, -ppf * 44, ppf * 88, ppf * 88); ctx.restore();
    ctx.fillStyle = '#b9824f'; ctx.beginPath(); ctx.arc(...F([0, 60], gm), ppf * 9, 0, 6.3); ctx.fill();
    // fence
    ctx.strokeStyle = '#0e2a5c'; ctx.lineWidth = 8; ctx.beginPath(); for (let a = -45; a <= 45; a += 3) { const r = fenceAt(a), p = F([r * Math.sin((a * Math.PI) / 180), r * Math.cos((a * Math.PI) / 180)], gm); a === -45 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); } ctx.stroke();
    ctx.strokeStyle = '#ffd33d'; ctx.lineWidth = 2; ctx.beginPath(); for (let a = -45; a <= 45; a += 3) { const r = fenceAt(a) - 2, p = F([r * Math.sin((a * Math.PI) / 180), r * Math.cos((a * Math.PI) / 180)], gm); a === -45 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); } ctx.stroke();
    // foul lines + bases
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(H[0], H[1]); const e = F([s * 330 * 0.7071, 330 * 0.7071 + 20], gm); ctx.lineTo(e[0] + s * 0, e[1] - 0); ctx.stroke(); }
    const base = (p, on) => { const b = F(p, gm); ctx.save(); ctx.translate(b[0], b[1]); ctx.rotate(Math.PI / 4); ctx.fillStyle = on ? '#ffd33d' : '#fff'; ctx.fillRect(-ppf * 5, -ppf * 5, ppf * 10, ppf * 10); ctx.restore(); };
    base(BAG[0], g.bases[0]); base(BAG[1], g.bases[1]); base(BAG[2], g.bases[2]); base([0, 0], false);
    // time within the play
    const T = g.bt || 0, an = bip && bip.anim;
    const ballSeg = an ? an.ball.filter((b) => T >= b.t0).pop() : null;
    // fielders
    const handler = an ? an.fieldPos : null; const fc = g.col[fieldTeam(g)];
    for (const k of Object.keys(POS)) {
      let p = POS[k];
      if (an && k === handler) { const seg0 = an.ball[0], tgt = bip.fielded ? bip.fielded.pt : bip.land, u = clamp(T / Math.max(0.5, (bip.kind === 'ground' ? bip.T : (bip.tF || bip.T))), 0, 1); const goal = tgt; p = [POS[k][0] + (goal[0] - POS[k][0]) * u, POS[k][1] + (goal[1] - POS[k][1]) * u]; void seg0; }
      const f = F(p, gm); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(f[0] + 2, f[1] + 4, 9, 4, 0, 0, 6.3); ctx.fill(); ctx.fillStyle = fc; ctx.beginPath(); ctx.arc(f[0], f[1], 9, 0, 6.3); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.stroke();
    }
    // runners
    const bc = g.col[batTeam(g)];
    const runnerDot = (pos, label) => { const f = F(pos, gm); ctx.fillStyle = bc; ctx.beginPath(); ctx.arc(f[0], f[1], 8, 0, 6.3); ctx.fill(); ctx.strokeStyle = '#ffd33d'; ctx.lineWidth = 2; ctx.stroke(); void label; };
    const bpos = (n) => (n === 0 ? [0, 0] : n >= 4 ? [0, 0] : BAG[n - 1]);
    if (an && g.bipDone) {
      for (const r of an.run) {
        const total = Math.max(1, (r.to === 0 ? r.who + 1 : r.to) - r.who), u = clamp((T - r.t0) / Math.max(0.4, r.t1 - r.t0), 0, 1);
        const from = bpos(r.who), steps = [0, 1, 2, 3, 4].slice(r.who, (r.to === 0 ? r.who + 1 : r.to) + 1);
        const path = steps.map((n) => bpos(n)); if (path.length < 2) path.push(bpos(r.who + 1)); const sf = u * (path.length - 1), i0 = Math.min(path.length - 2, Math.floor(sf)), uu = sf - i0;
        if (r.to === 4 && u >= 1) continue; if (r.to === 0 && u >= 1 && r.who !== 0) continue;
        runnerDot([path[i0][0] + (path[i0 + 1][0] - path[i0][0]) * uu, path[i0][1] + (path[i0 + 1][1] - path[i0][1]) * uu], r.who); void total; void from;
      }
    } else { g.bases.forEach((r, i) => { if (r) runnerDot(BAG[i], i); }); if (!g.bipDone) runnerDot([-5, 4], 0); }
    // ball
    if (an) {
      const seg = ballSeg || an.ball[0], u = clamp((T - seg.t0) / Math.max(0.2, seg.t1 - seg.t0), 0, 1);
      const x = seg.from[0] + (seg.to[0] - seg.from[0]) * u, y = seg.from[1] + (seg.to[1] - seg.from[1]) * u, h = Math.sin(Math.PI * u) * seg.arc;
      const p = F([x, y], gm); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(p[0], p[1], 6, 3, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p[0], p[1] - h * ppf * 0.8, 6, 0, 6.3); ctx.fill(); ctx.stroke();
    }
    if (bip && bip.hr && T > 0.5 && T < 4) { ctx.fillStyle = '#ffd33d'; ctx.font = '900 40px system-ui'; ctx.textAlign = 'center'; ctx.fillText('HOME RUN', cw / 2, ch * 0.3); }
  }

  /* ------------------------------------ events / hud ------------------------------------ */
  const SFX = { hit: fx.hit, homer: fx.homer, strike: fx.strike, foul: fx.out, out: fx.out, run: fx.cheer, throw: fx.tick, swing: () => {} };
  function drain(g) {
    for (const e of g.ev.splice(0)) {
      if (e.k === 'banner') { S.banner = e; S.bannerT = 2.0; }
      else if (e.k === 'sfx') { const f = SFX[e.n]; if (f && S.view === 'game') f(); }
      else if (e.k === 'over') setTimeout(() => finishGame(g), 1700);
    }
  }
  function finishGame(g) {
    if (S.view !== 'game' || S.g !== g) return;
    if (!S.demo && !S.endSaved) { S.endSaved = true; const r = S.rec; if (g.winner === 'U') r.w = (r.w || 0) + 1; else if (g.winner === 'C') r.l = (r.l || 0) + 1; else r.t = (r.t || 0) + 1; r.hr = (r.hr || 0) + g.stat.U.hr; store(r); setTimeout(g.winner === 'U' ? fx.win : fx.lose, 200); }
    if (S.demo) { S.view = 'menu'; modal(menuHtml()); return; }
    modal(finalHtml(g));
  }
  const hud = {};
  function setT(k, v) { if (hud[k] !== v) { hud[k] = v; q(k).textContent = v; } }
  function updateHud(g, dt) {
    setT('u', g.names.U.slice(0, 9)); setT('c', g.names.C.split(' ').pop().slice(0, 9)); setT('us', String(g.score.U)); setT('cs', String(g.score.C));
    setT('inn', `${g.half === 'top' ? '▲' : '▼'} ${ORD(g.inning)}`); setT('cnt', `${g.balls}-${g.strikes}`);
    const outs = q('outs'); const ov = '●'.repeat(g.outs) + '○'.repeat(Math.max(0, 3 - g.outs)); if (hud.o !== ov) { hud.o = ov; outs.textContent = ov; }
    const bs = q('bases'); const key = g.bases.map((b) => (b ? 1 : 0)).join(''); if (hud.b !== key) { hud.b = key; bs.querySelector('.b1').classList.toggle('on', !!g.bases[0]); bs.querySelector('.b2').classList.toggle('on', !!g.bases[1]); bs.querySelector('.b3').classList.toggle('on', !!g.bases[2]); }
    const bn = $('.dm-bn');
    if (S.banner && S.bannerT > 0) { S.bannerT -= dt; bn.className = `dm-bn on ${S.banner.c}`; const k = S.banner.t + S.banner.s; if (bn.dataset.k !== k) { bn.dataset.k = k; bn.innerHTML = `<b>${esc(S.banner.t)}</b>${S.banner.s ? `<small>${esc(S.banner.s)}</small>` : ''}`; } } else { bn.className = 'dm-bn'; bn.dataset.k = ''; }
    const cap = $('.dm-cap'); const capT = g.phase === 'over' ? '' : g.phase === 'bip' && g.bipDone ? g.last : (g.phase === 'result' || g.phase === 'ready') ? g.last : ''; if (cap.textContent !== capT) { cap.textContent = capT; } cap.classList.toggle('on', !!capT);
    const who = $('.dm-who'); const bt = batTeam(g); const tx = `${bt === 'U' ? '🏏' : '⚾'} ${g.batter.name} vs ${g.pit.name}`; if (who.textContent !== tx) who.textContent = tx; who.classList.toggle('on', g.phase !== 'between' && g.phase !== 'over');
  }

  /* ------------------------------------ loop ------------------------------------ */
  function frame(ts) {
    S.raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - (S.last || ts)) / 1000); S.last = ts; const g = S.g;
    if (!g) { ctx.fillStyle = '#16335f'; ctx.fillRect(0, 0, cw, ch); return; }
    if (S.view === 'game' && !S.paused) {
      S.acc += dt; let n = 0; const sp = S.demo ? 1.8 : 1;
      while (S.acc >= 1 / 60 && n++ < 6) { step(g, (1 / 60) * sp); S.acc -= 1 / 60; }
      if (S.pm.meter) { const m = S.pm.meter; m.t += dt; m.x += m.dir * dt * 1.5; if (m.x >= 1) { m.x = 1; m.dir = -1; } else if (m.x <= 0) { m.x = 0; m.dir = 1; } if (m.t > 6) press('pitch'); }
      drain(g); drawCtl(); updateHud(g, dt);
    }
    ctx.clearRect(0, 0, cw, ch);
    if (g.phase === 'bip' || (g.bip && g.bipDone)) drawField(g); else drawPlate(g);
  }
  S.raf = requestAnimationFrame(frame);
  root.__diamond = S;
  return { close: quit, state: S };
}
