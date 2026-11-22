// Skipper Gridiron UI: canvas field + virtual stick + action buttons. The simulation lives in arcade.js.
import {
  newArcade, step, call, targets, bestOff, fgInfo, downText, spotText, OFF_PLAYS, DEF_CALLS, LEVELS, OPPONENTS, W, LEN, EZ, GOAL,
} from './arcade.js';
import { fx } from './feedback.js';

const KEY = 'skipper-arcade-v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const store = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* private mode */ } };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const clockText = (c) => { c = Math.max(0, Math.ceil(c)); return `${Math.floor(c / 60)}:${String(c % 60).padStart(2, '0')}`; };
const QLEN = [['Short', 180], ['Normal', 240], ['Long', 360]];
const ROLE_TAG = { WR1: 'WR', WR2: 'WR', TE: 'TE', RB: 'RB' };

export const ARCADE_HOW = [
  ['You are the player', 'No play-calling menus to sit in. You pick a play, then you run, throw and tackle with your thumbs.'],
  ['Move', 'Drag anywhere on the lower left to move. Push further to go faster.'],
  ['On offence', 'Pick a play. On a pass you control the quarterback: tap a numbered button (or tap the player) to throw. The ring colour shows how open he is: green open, yellow tight, red covered. After a catch or handoff you control the ball carrier: SPRINT (hold), JUKE to dodge, STIFF ARM to shed a tackler.'],
  ['On defence', 'Pick a coverage, then you control the defender nearest the ball. Drag to chase, TACKLE to dive at the carrier (miss and you fall), SWITCH to change player, JUMP to swat or pick off a pass at the right moment.'],
  ['Kicking', 'On 4th down you can punt or kick a field goal. For a kick, tap when the moving marker is in the centre.'],
  ['Winning', 'Four quarters. First downs keep the drive alive, touchdowns are 7, field goals 3. Tied after four? Sudden-death overtime.'],
];

export function openArcade({ onClose } = {}) {
  const S = {
    rec: load(), view: 'menu', g: null, demo: false, paused: false, camX: 18, camY: 40, shake: 0, banner: null, bannerT: 0, pops: [], parts: [],
    sig: '', bsig: '', ssig: '', raf: 0, last: 0, acc: 0, keys: {}, stick: { id: -1, ox: 0, oy: 0 }, tip: 0, held: {}, endSaved: false,
  };
  S.rec.set = Object.assign({ lv: 1, ql: 240 }, S.rec.set || {}); S.rec.tips = S.rec.tips || {};
  const root = document.createElement('div'); root.id = 'arcade';
  root.innerHTML = `<canvas class="ar-cv"></canvas>
    <div class="ar-top"><div class="ar-sb"><span class="ar-tm" data-k="u"></span><b class="ar-sc" data-k="us">0</b><span class="ar-mid"><i data-k="q"></i><em data-k="sit"></em></span><b class="ar-sc" data-k="cs">0</b><span class="ar-tm" data-k="c"></span></div><button class="ar-x" data-a="pause" aria-label="Pause">❚❚</button></div>
    <div class="ar-bn"></div><div class="ar-tipbar"></div>
    <div class="ar-sz"><i class="ar-base"></i><i class="ar-knob"></i></div>
    <div class="ar-btns"></div><div class="ar-sheet"></div><div class="ar-modal"></div>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s), cv = $('.ar-cv'), ctx = cv.getContext('2d');
  const q = (k) => root.querySelector(`[data-k="${k}"]`);
  // cw/ch are the *virtual* (portrait) size the field is drawn in; in landscape the canvas is rotated so the play runs left to right.
  let cw = 0, ch = 0, rw = 0, rh = 0, dpr = 1, land = false;
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1); rw = root.clientWidth; rh = root.clientHeight; land = rw > rh; cw = land ? rh : rw; ch = land ? rw : rh;
    cv.width = Math.round(rw * dpr); cv.height = Math.round(rh * dpr); root.classList.toggle('land', land);
    if (land) ctx.setTransform(0, dpr, -dpr, 0, rw * dpr, 0); else ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const label = (str, x, y, stroke) => { ctx.save(); ctx.translate(x, y); if (land) ctx.rotate(-Math.PI / 2); if (stroke) ctx.strokeText(str, 0, 0); ctx.fillText(str, 0, 0); ctx.restore(); };
  resize(); window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  /* ---------------------------------- game control ---------------------------------- */
  const myCol = '#2b6cb0';
  function start(demo) {
    const opp = OPPONENTS[Math.floor(Math.random() * OPPONENTS.length)];
    S.g = newArcade({ level: S.rec.set.lv, qlen: S.rec.set.ql, opp, col: myCol, name: 'Skipper', auto: demo, seed: (Math.random() * 2 ** 31) | 0 });
    S.demo = demo; S.view = 'game'; S.paused = false; S.endSaved = false; S.pops = []; S.parts = []; S.banner = null; S.sig = S.bsig = S.ssig = '';
    S.camX = 18; S.camY = S.g.los + 4; modal(''); drawSheet(true);
  }
  function quit() { cancelAnimationFrame(S.raf); window.removeEventListener('resize', resize); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); document.removeEventListener('visibilitychange', vis); root.remove(); if (onClose) onClose(); }
  const vis = () => { if (document.hidden && S.view === 'game' && !S.demo) setPause(true); };
  document.addEventListener('visibilitychange', vis);
  function setPause(on) { if (S.view !== 'game') return; S.paused = on; modal(on ? pauseHtml() : ''); }

  /* ------------------------------------- modals ------------------------------------- */
  const rec = () => { const r = S.rec; return `${r.w || 0}-${r.l || 0}${r.t ? `-${r.t}` : ''}`; };
  function menuHtml() {
    const s = S.rec.set;
    return `<div class="ar-card"><div class="ar-logo">GRIDIRON</div><p class="ar-sub">Football you actually play. 7-on-7, thumbs on glass.</p>
      <div class="ar-opt"><span>Difficulty</span><div class="ar-seg">${LEVELS.map((l) => `<button data-a="lv" data-v="${l.id}" class="${s.lv === l.id ? 'on' : ''}">${l.name}</button>`).join('')}</div></div>
      <div class="ar-opt"><span>Game length</span><div class="ar-seg">${QLEN.map(([n, v]) => `<button data-a="ql" data-v="${v}" class="${s.ql === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      <button class="ar-go" data-a="play">▶ Play a game</button>
      <div class="ar-row"><button data-a="demo">👀 Watch a demo</button><button data-a="how">📖 How to play</button></div>
      <p class="ar-rec">Your record: <b>${rec()}</b>${S.rec.best ? ` · best win +${S.rec.best}` : ''}</p>
      <button class="ar-link" data-a="exit">← Back to Skipper</button></div>`;
  }
  function howHtml() { return `<div class="ar-card ar-how"><h2>How to play</h2>${ARCADE_HOW.map(([h, t]) => `<h3>${h}</h3><p>${t}</p>`).join('')}<button class="ar-go" data-a="menu">Got it</button></div>`; }
  function pauseHtml() { return `<div class="ar-card"><h2>Paused</h2><button class="ar-go" data-a="resume">▶ Resume</button><button data-a="quit2">Quit to menu</button></div>`; }
  function finalHtml(g) {
    const u = g.stat.U, c = g.stat.C, w = g.winner;
    const head = w === 'U' ? '🏆 You win!' : w === 'C' ? 'Tough loss' : 'Tie game';
    return `<div class="ar-card"><div class="ar-logo sm">${head}</div><div class="ar-final"><span>${esc(g.names.U)}</span><b>${g.score.U}</b><i>–</i><b>${g.score.C}</b><span>${esc(g.names.C)}</span></div>
      <table class="ar-stats"><tr><th></th><th>You</th><th>${esc(g.names.C)}</th></tr>
      <tr><td>Rush yds</td><td>${u.rush}</td><td>${c.rush}</td></tr><tr><td>Pass yds</td><td>${u.pass}</td><td>${c.pass}</td></tr>
      <tr><td>Completions</td><td>${u.comp}/${u.att}</td><td>${c.comp}/${c.att}</td></tr><tr><td>Touchdowns</td><td>${u.td}</td><td>${c.td}</td></tr>
      <tr><td>Sacks</td><td>${u.sacks}</td><td>${c.sacks}</td></tr><tr><td>Interceptions</td><td>${u.ints}</td><td>${c.ints}</td></tr>
      <tr><td>Broken tackles</td><td>${u.brk}</td><td>${c.brk}</td></tr><tr><td>Your tackles</td><td>${u.tkl}</td><td>–</td></tr></table>
      <button class="ar-go" data-a="play">↻ Play again</button><button data-a="menu">Menu</button></div>`;
  }
  function modal(html) { const m = $('.ar-modal'); m.innerHTML = html; m.classList.toggle('on', !!html); }
  modal(menuHtml());

  /* ----------------------------------- call sheet ----------------------------------- */
  function sheetKey(g) { return `${g.phase}|${g.off}|${g.down}|${g.f}|${g.q}|${g.kickInfo ? g.kickInfo.title : ''}|${g.meter ? 1 : 0}`; }
  function drawSheet(force) {
    const g = S.g, sh = $('.ar-sheet');
    if (!g || S.view !== 'game') { sh.innerHTML = ''; sh.className = 'ar-sheet'; return; }
    const key = sheetKey(g);
    if (!force && key === S.ssig) { if (g.phase === 'meter') updateMeter(); return; }
    S.ssig = key;
    if (g.phase === 'call' && !S.demo) {
      const o = g.off === 'U', best = o ? Object.entries(bestOff(g)).sort((a, b) => b[1] - a[1])[0][0] : null;
      const cards = o ? Object.entries(OFF_PLAYS).map(([id, p]) => card(id, p, id === best)) : Object.entries(DEF_CALLS).map(([id, p]) => card(id, p, false));
      let extra = '';
      if (o && g.down === 4) { const fi = fgInfo(g); extra = `<div class="ar-cards sp"><button class="ar-pc" data-call="punt"><i>🦵</i><b>Punt</b><small>Give it away safely</small></button><button class="ar-pc" data-call="fg"><i>🥅</i><b>Field Goal</b><small>${fi.dist} yds · about ${fi.pct}%</small></button></div>`; }
      sh.className = 'ar-sheet on call';
      sh.innerHTML = `<div class="ar-sitrow"><b>${o ? 'YOUR BALL' : 'THEIR BALL'}</b> · ${downText(g)} · ${spotText(g.f)}</div>${g.hint ? `<div class="ar-hl">💡 ${esc(g.hint)}</div>` : ''}${extra}<div class="ar-cards">${cards.join('')}</div>`;
    } else if (g.phase === 'kick' && g.kickInfo) {
      const k = g.kickInfo;
      sh.className = `ar-sheet on kick ${k.c || ''}`; sh.innerHTML = `<div class="ar-kc"><i>${k.icon}</i><b>${esc(k.title)}</b>${k.sub ? `<em>${esc(k.sub)}</em>` : ''}<small>${esc(k.text)}</small></div>`;
    } else if (g.phase === 'meter') {
      sh.className = 'ar-sheet on meter'; sh.innerHTML = `<div class="ar-mt"><b>FIELD GOAL · ${g.meter.dst} yds</b><div class="ar-bar"><i class="ar-zone"></i><i class="ar-mk"></i></div><button class="ar-go" data-a="kick">KICK!</button><small>Tap when the marker is in the middle</small></div>`;
    } else { sh.className = 'ar-sheet'; sh.innerHTML = ''; }
  }
  function card(id, p, star) { return `<button class="ar-pc" data-call="${id}"><i>${p.ic}</i><b>${p.n}${star ? ' ★' : ''}</b><small>${p.d}</small></button>`; }
  function updateMeter() { const mk = $('.ar-mk'); if (mk && S.g.meter) mk.style.left = `${S.g.meter.x * 100}%`; }

  /* ------------------------------------ buttons ------------------------------------ */
  function buttonsFor(g) {
    if (S.demo || g.phase === 'call' || g.phase === 'kick' || g.phase === 'meter' || g.phase === 'over') return [];
    const ctl = g.pl[g.ctl ?? -1] || null, car = g.carrier;
    const B = [];
    const sprint = { id: 'sprint', t: '⚡', n: 'SPRINT', hold: true };
    if (g.off === 'U' && (g.mode === 'drop') && car && car.team === 'U' && car.role === 'QB') {
      targets(g).forEach((r, i) => B.push({ id: `t${i}`, t: String(i + 1), n: ROLE_TAG[r.role] || r.role, cls: ['cold', 'warm', 'hot'][g.open[r.id] ?? 0], big: true }));
      B.push(sprint, { id: 'away', t: '✋', n: 'THROW AWAY' });
    } else if (car && car.team === 'U') B.push(sprint, { id: 'juke', t: '↯', n: 'JUKE' }, { id: 'stiff', t: '✊', n: 'STIFF ARM' });
    else if (g.mode === 'air' && g.off === 'U') B.push(sprint, { id: 'swat', t: '🙌', n: 'CATCH' });
    else if (g.mode === 'air') B.push(sprint, { id: 'swat', t: '🙌', n: 'JUMP', big: true }, { id: 'sw', t: '⟲', n: 'SWITCH' });
    else if (car && car.team === 'C') B.push(sprint, { id: 'tackle', t: '💥', n: 'TACKLE', big: true }, { id: 'sw', t: '⟲', n: 'SWITCH' });
    else if (g.phase === 'set' || g.phase === 'live') B.push(sprint);
    void ctl;
    return B;
  }
  function drawButtons(g) {
    const B = g && S.view === 'game' ? buttonsFor(g) : [];
    const sig = B.map((b) => `${b.id}${b.cls || ''}`).join(',');
    const box = $('.ar-btns');
    if (sig !== S.bsig) { S.bsig = sig; box.className = `ar-btns n${B.length}`; box.innerHTML = B.map((b) => `<button class="ar-b ${b.cls || ''} ${b.big ? 'big' : ''}" data-b="${b.id}"><span>${b.t}</span><small>${b.n}</small></button>`).join(''); }
  }
  function press(id, down) {
    const g = S.g; if (!g) return;
    if (id === 'sprint') { g.in.sprint = down; return; }
    if (!down) return;
    if (id[0] === 't' && /^t\d$/.test(id)) g.in.throw = +id[1];
    else if (id === 'juke') g.in.juke = true; else if (id === 'stiff') g.in.stiff = true; else if (id === 'tackle') g.in.tackle = true;
    else if (id === 'swat') g.in.swat = true; else if (id === 'sw') g.in.sw = true; else if (id === 'away') g.in.away = true;
    if (id !== 'sprint') fx.tick();
  }
  const btns = $('.ar-btns');
  btns.addEventListener('pointerdown', (e) => { const b = e.target.closest('[data-b]'); if (!b) return; e.preventDefault(); b.setPointerCapture?.(e.pointerId); b.classList.add('dn'); press(b.dataset.b, true); });
  const up = (e) => { const b = e.target.closest('[data-b]'); if (!b) return; b.classList.remove('dn'); press(b.dataset.b, false); };
  btns.addEventListener('pointerup', up); btns.addEventListener('pointercancel', up); btns.addEventListener('lostpointercapture', up);
  btns.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ------------------------------------- stick ------------------------------------- */
  const sz = $('.ar-sz'), base = $('.ar-base'), knob = $('.ar-knob'), R = 52;
  function setStick(x, y) { const g = S.g; if (g) { g.in.mx = x; g.in.my = y; } }
  sz.addEventListener('pointerdown', (e) => {
    if (S.stick.id >= 0 || !S.g || S.g.phase === 'call') return; e.preventDefault(); sz.setPointerCapture?.(e.pointerId);
    const r = sz.getBoundingClientRect(); S.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
    base.style.cssText = `left:${e.clientX - r.left - R}px;top:${e.clientY - r.top - R}px;opacity:1`; knob.style.cssText = `left:${e.clientX - r.left - 22}px;top:${e.clientY - r.top - 22}px;opacity:1`;
  });
  sz.addEventListener('pointermove', (e) => {
    if (e.pointerId !== S.stick.id) return; e.preventDefault();
    let dx = e.clientX - S.stick.ox, dy = e.clientY - S.stick.oy; const m = Math.hypot(dx, dy) || 1, k = Math.min(1, m / R);
    if (land) setStick((dy / m) * k, (dx / m) * k); else setStick((dx / m) * k, -(dy / m) * k);
    const r = sz.getBoundingClientRect(), kx = S.stick.ox - r.left + (dx / m) * Math.min(m, R) - 22, ky = S.stick.oy - r.top + (dy / m) * Math.min(m, R) - 22;
    knob.style.left = `${kx}px`; knob.style.top = `${ky}px`;
  });
  const sup = (e) => { if (e.pointerId !== S.stick.id) return; S.stick.id = -1; setStick(0, 0); base.style.opacity = knob.style.opacity = 0; };
  sz.addEventListener('pointerup', sup); sz.addEventListener('pointercancel', sup);

  // tap the field to throw to the nearest receiver
  cv.addEventListener('pointerdown', (e) => {
    const g = S.g; if (!g || S.view !== 'game' || S.demo || g.mode !== 'drop' || g.off !== 'U') return;
    const r = cv.getBoundingClientRect(), rx = e.clientX - r.left, ry = e.clientY - r.top, px = land ? ry : rx, py = land ? rw - rx : ry, sc = scale();
    let best = -1, bd = 5.5; targets(g).forEach((t, i) => { const d = Math.hypot((sx(t.x, sc) - px) / sc, (sy(t.y, sc) - py) / sc); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) g.in.throw = best;
  });

  // keyboard (desktop testing)
  const kd = (e) => {
    const g = S.g; if (!g || S.view !== 'game') return; const k = e.key.toLowerCase(); S.keys[k] = true;
    if (k === ' ') { e.preventDefault(); if (g.phase === 'meter') g.in.kick = true; else { g.in.juke = true; g.in.tackle = true; g.in.swat = true; } }
    if (/^[1-4]$/.test(k)) g.in.throw = +k - 1; if (k === 'q') g.in.away = true; if (k === 'e') { g.in.stiff = true; g.in.sw = true; }
    if (k === 'shift') g.in.sprint = true; keyStick();
  };
  const ku = (e) => { const k = e.key.toLowerCase(); S.keys[k] = false; if (k === 'shift' && S.g) S.g.in.sprint = false; keyStick(); };
  function keyStick() { const g = S.g; if (!g || S.stick.id >= 0) return; const K = S.keys; const h = (K.d || K.arrowright ? 1 : 0) - (K.a || K.arrowleft ? 1 : 0), v = (K.w || K.arrowup ? 1 : 0) - (K.s || K.arrowdown ? 1 : 0); const x = land ? -v : h, y = land ? h : v, m = Math.hypot(x, y) || 1; g.in.mx = (x / m) * (x || y ? 1 : 0); g.in.my = (y / m) * (x || y ? 1 : 0); }
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);

  /* --------------------------------- clicks (DOM) --------------------------------- */
  root.addEventListener('click', (e) => {
    const c = e.target.closest('[data-call]'); if (c && S.g) { if (call(S.g, c.dataset.call)) { fx.tick(); tipFor(S.g); } return; }
    const a = e.target.closest('[data-a]'); if (!a) return;
    const k = a.dataset.a;
    if (k === 'lv') { S.rec.set.lv = +a.dataset.v; store(S.rec); modal(menuHtml()); }
    else if (k === 'ql') { S.rec.set.ql = +a.dataset.v; store(S.rec); modal(menuHtml()); }
    else if (k === 'play') start(false); else if (k === 'demo') start(true);
    else if (k === 'how') modal(howHtml()); else if (k === 'menu') { S.view = 'menu'; S.g = null; S.paused = false; modal(menuHtml()); drawSheet(true); drawButtons(null); }
    else if (k === 'exit') quit(); else if (k === 'pause') { if (S.view === 'game') setPause(!S.paused); else if (S.view === 'menu') quit(); }
    else if (k === 'resume') setPause(false); else if (k === 'quit2') { S.view = 'menu'; S.g = null; S.paused = false; modal(menuHtml()); drawSheet(true); drawButtons(null); }
    else if (k === 'kick' && S.g) S.g.in.kick = true;
  });
  if (root.querySelector('.ar-x')) root.querySelector('.ar-x').addEventListener('pointerdown', (e) => e.stopPropagation());

  const TIPS = {
    qb: 'Drag to move. Tap a number to throw. Green ring = open.',
    run: 'Drag to run. Hold SPRINT. JUKE to dodge, STIFF ARM to shed.',
    def: 'Drag to chase. Tap TACKLE when close. SWITCH changes player.',
  };
  function tipFor(g) {
    if (S.demo) return; const kind = g.off === 'U' ? (g.play && OFF_PLAYS[g.play].run ? 'run' : 'qb') : 'def';
    if (S.rec.tips[kind] >= 2) return; S.rec.tips[kind] = (S.rec.tips[kind] || 0) + 1; store(S.rec);
    const t = $('.ar-tipbar'); t.textContent = TIPS[kind]; t.classList.add('on'); S.tip = 4.2;
  }

  /* ------------------------------------ events ------------------------------------ */
  const SFX = { hit: fx.hit, td: fx.homer, brk: fx.out, int: fx.strike, catch: fx.tick, whoosh: fx.tick, kick: fx.hit, snap: fx.tick, throw: fx.tick, out: fx.out };
  function drain(g) {
    for (const e of g.ev.splice(0)) {
      if (e.k === 'banner') { S.banner = e; S.bannerT = 1.9; }
      else if (e.k === 'sfx') { const f = SFX[e.n]; if (f && S.view === 'game') f(); }
      else if (e.k === 'pop') S.pops.push({ t: e.t, x: e.x, y: e.y, a: 0 });
      else if (e.k === 'hit') { S.shake = Math.max(S.shake, e.big ? 7 : 3); for (let i = 0; i < 7; i++) S.parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 7, vy: (Math.random() - 0.5) * 7, a: 0, l: 0.55, c: '#d8c79a', r: 0.22 }); }
      else if (e.k === 'burst') { S.shake = 9; for (let i = 0; i < 46; i++) S.parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 16, vy: Math.random() * 14, a: 0, l: 1.8, c: ['#ffd166', '#ff3b5c', '#3ddc84', '#4aa8ff', '#fff'][i % 5], r: 0.3 }); }
      else if (e.k === 'catch') { for (let i = 0; i < 5; i++) S.parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5, a: 0, l: 0.4, c: '#fff', r: 0.16 }); }
      else if (e.k === 'over') { setTimeout(() => finishGame(g), 1900); }
    }
  }
  function finishGame(g) {
    if (S.view !== 'game' || S.g !== g) return;
    if (!S.demo && !S.endSaved) {
      S.endSaved = true; const r = S.rec;
      if (g.winner === 'U') { r.w = (r.w || 0) + 1; r.best = Math.max(r.best || 0, g.score.U - g.score.C); } else if (g.winner === 'C') r.l = (r.l || 0) + 1; else r.t = (r.t || 0) + 1;
      store(r); setTimeout(g.winner === 'U' ? fx.win : fx.lose, 200);
    }
    if (S.demo) { S.view = 'menu'; modal(menuHtml()); return; }
    modal(finalHtml(g));
  }

  /* ------------------------------------ drawing ------------------------------------ */
  const scale = () => cw / 30;
  const sx = (x, sc) => cw / 2 + (x - S.camX) * sc;
  const sy = (y, sc) => ch * 0.6 - (y - S.camY) * sc;
  function camTarget(g) {
    const car = g.carrier; let ty = g.los + 4, tx = 18;
    if (g.phase === 'live' || g.phase === 'dead') {
      if (car) { ty = car.y + (g.turn ? -4 : 5); tx = car.x; }
      else if (g.fl) { const f = clamp(g.fl.t / g.fl.dur, 0, 1); ty = g.fl.fy + (g.fl.ty - g.fl.fy) * f + 4; tx = g.fl.fx + (g.fl.tx - g.fl.fx) * f; }
      else if (g.pl.length) { const c = g.pl.reduce((a, p) => a + p.y, 0) / g.pl.length; ty = Math.max(g.los + 2, c); tx = S.camX; }
    }
    if (g.phase === 'call' || g.phase === 'set') ty = land ? g.los + (g.phase === 'call' && !S.demo ? 0.2 : 0.05) * ch / scale() : g.los - (g.phase === 'call' && !S.demo ? 0.3 : 0.12) * ch / scale() + 1;
    return { x: clamp(tx, 15, W - 15), y: clamp(ty, g.phase === 'call' ? 0 : 22, LEN - 24) };
  }
  function shade(hex, f) { const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255; r = clamp(Math.round(r * f), 0, 255); gg = clamp(Math.round(gg * f), 0, 255); b = clamp(Math.round(b * f), 0, 255); return `rgb(${r},${gg},${b})`; }

  function drawField(g, sc) {
    const top = S.camY + (ch * 0.6) / sc + 2, bot = S.camY - (ch * 0.4) / sc - 2;
    ctx.fillStyle = '#0b3b22'; ctx.fillRect(0, 0, cw, ch);
    const x0 = sx(0, sc), x1 = sx(W, sc);
    for (let y = Math.floor(bot / 5) * 5; y < top; y += 5) {
      const a = sy(y + 5, sc), b = sy(y, sc), y0 = Math.max(0, y);
      if (y0 >= LEN) continue; ctx.fillStyle = (Math.floor(y / 5) & 1) ? '#1f7a3f' : '#237f43'; ctx.fillRect(x0, a, x1 - x0, b - a + 1);
    }
    // end zones
    const defT = g.off === 'U' ? 'C' : 'U', attack = g.col[defT], own = g.col[g.off];
    const ez = (ya, yb, col, name) => { const a = sy(yb, sc), b = sy(ya, sc); ctx.fillStyle = shade(col, 0.82); ctx.fillRect(x0, a, x1 - x0, b - a); ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.font = `900 ${sc * 3}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; label(name.toUpperCase().slice(0, 12), (x0 + x1) / 2, (a + b) / 2); };
    ez(GOAL, LEN, attack, g.names[defT]); ez(0, EZ, own, g.names[g.off]);
    // yard lines + numbers
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let y = EZ; y <= GOAL; y += 5) {
      if (y > top || y < bot) continue; const yy = sy(y, sc); ctx.globalAlpha = (y === EZ || y === GOAL) ? 1 : (y - EZ) % 10 === 0 ? 0.7 : 0.4; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke(); ctx.globalAlpha = 1;
      const f = y - EZ; if (f % 10 === 0 && f > 0 && f < 100) { const n = Math.min(f, 100 - f); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = `800 ${sc * 2.1}px system-ui,sans-serif`; label(String(n), sx(5.5, sc), yy - sc * 2.2); label(String(n), sx(W - 5.5, sc), yy - sc * 2.2); }
    }
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
    for (let y = Math.ceil(EZ); y <= GOAL; y++) { if (y > top || y < bot || y % 5 === 0) continue; const yy = sy(y, sc); ctx.beginPath(); ctx.moveTo(sx(17, sc), yy); ctx.lineTo(sx(19, sc), yy); ctx.moveTo(x0, yy); ctx.lineTo(x0 + sc * 0.6, yy); ctx.moveTo(x1 - sc * 0.6, yy); ctx.lineTo(x1, yy); ctx.stroke(); }
    // sidelines + out of bounds
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, x0, ch); ctx.fillRect(x1, 0, cw - x1, ch);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, ch); ctx.moveTo(x1, 0); ctx.lineTo(x1, ch); ctx.stroke();
    // LOS and first-down line
    if (g.pl.length) {
      const ly = sy(g.los, sc); ctx.strokeStyle = '#4aa8ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, ly); ctx.lineTo(x1, ly); ctx.stroke();
      const fd = Math.min(GOAL, 10 + g.firstAt); if (!g.turn) { const fy = sy(fd, sc); ctx.strokeStyle = '#ffd33d'; ctx.lineWidth = 3.5; ctx.shadowColor = '#ffd33d'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.moveTo(x0, fy); ctx.lineTo(x1, fy); ctx.stroke(); ctx.shadowBlur = 0; }
    }
  }

  function drawPlayer(g, p, sc, ctl) {
    const x = sx(p.x, sc), y = sy(p.y, sc), r = sc * 0.95;
    if (x < -40 || x > cw + 40) return;
    const col = g.col[p.team], fa = Math.atan2(-p.vy, p.vx || 0.0001), moving = Math.hypot(p.vx, p.vy) > 0.5;
    const ang = moving ? -Math.atan2(p.vy, p.vx) : (p.side === 'O' ? -Math.PI / 2 : Math.PI / 2); void fa;
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x + 2, y + r * 0.75, r * 1.05, r * 0.55, 0, 0, 6.3); ctx.fill();
    if (p === g.carrier) { ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r * 1.55, 0, 6.3); ctx.stroke(); }
    if (p.jk > 0) { ctx.globalAlpha = 0.35; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x - p.vx * 0.05 * sc, y + p.vy * 0.05 * sc, r, 0, 6.3); ctx.fill(); ctx.globalAlpha = 1; }
    // body (shoulders)
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2);
    const lean = p.lunge > 0 ? 1.3 : 1; ctx.fillStyle = shade(col, 0.82); ctx.beginPath(); ctx.ellipse(0, 0, r * 1.0 * lean, r * 0.6, 0, 0, 6.3); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke(); ctx.restore();
    // helmet
    const g2 = ctx.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.1, x, y, r * 0.62); g2.addColorStop(0, shade(col, 1.45)); g2.addColorStop(1, shade(col, 0.9));
    ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, 6.3); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.3; ctx.stroke();
    if (p.stun > 0.1 && p.team !== (g.carrier && g.carrier.team)) { ctx.fillStyle = '#fff'; ctx.font = `${r}px system-ui`; ctx.textAlign = 'center'; label('✦', x, y - r * 1.2); }
    if (p === ctl) { // controlled marker
      ctx.strokeStyle = '#ffd33d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r * 1.35, 0, 6.3); ctx.stroke();
      ctx.fillStyle = '#ffd33d'; ctx.beginPath(); ctx.moveTo(x, y - r * 2.3); ctx.lineTo(x - r * 0.5, y - r * 1.65); ctx.lineTo(x + r * 0.5, y - r * 1.65); ctx.closePath(); ctx.fill();
    }
  }
  function drawTargets(g, sc) {
    if (S.demo || g.mode !== 'drop' || g.off !== 'U') return;
    targets(g).forEach((t, i) => {
      const x = sx(t.x, sc), y = sy(t.y, sc), o = g.open[t.id] ?? 0, col = ['#ff4d5e', '#ffd33d', '#3ddc84'][o];
      ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, sc * 1.35, 0, 6.3); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y - sc * 2.4, sc * 0.85, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#10151f'; ctx.font = `900 ${sc * 1.15}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; label(String(i + 1), x, y - sc * 2.4 + 1);
    });
  }
  function drawBall(g, sc) {
    const ball = (x, y, ang, s = 1) => { ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = '#7b3f12'; ctx.beginPath(); ctx.ellipse(0, 0, sc * 0.62 * s, sc * 0.38 * s, 0, 0, 6.3); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-sc * 0.2 * s, 0); ctx.lineTo(sc * 0.2 * s, 0); ctx.stroke(); ctx.restore(); };
    if (g.fl) {
      const f = g.fl, k = clamp(f.t / f.dur, 0, 1), x = sx(f.fx + (f.tx - f.fx) * k, sc), y = sy(f.fy + (f.ty - f.fy) * k, sc), h = Math.sin(Math.PI * k) * f.arc * sc * 0.55;
      if (!f.away) { ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx(f.tx, sc), sy(f.ty, sc), sc * 1.1, 0, 6.3); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y, sc * 0.5, sc * 0.3, 0, 0, 6.3); ctx.fill();
      const dx = sx(f.tx, sc) - sx(f.fx, sc), dy = sy(f.ty, sc) - sy(f.fy, sc); ball(x, y - h, Math.atan2(dy, dx), 1.15);
    } else if (g.carrier) { const c = g.carrier; ball(sx(c.x, sc) + sc * 0.5, sy(c.y, sc) - sc * 0.15, -0.5); }
  }
  function drawFx(sc, dt) {
    for (const p of S.parts) { p.a += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= (p.l > 1 ? 8 : 0) * dt; ctx.globalAlpha = clamp(1 - p.a / p.l, 0, 1); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(sx(p.x, sc), sy(p.y, sc), p.r * sc, 0, 6.3); ctx.fill(); }
    ctx.globalAlpha = 1; S.parts = S.parts.filter((p) => p.a < p.l);
    for (const p of S.pops) { p.a += dt; const k = p.a / 1.0; ctx.globalAlpha = clamp(1.4 - k * 1.4, 0, 1); ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineWidth = 3; ctx.font = `900 ${sc * 1.1}px system-ui`; ctx.textAlign = 'center'; const x = sx(p.x, sc), y = sy(p.y, sc) - sc * (2.5 + k * 2); label(p.t, x, y, true); }
    ctx.globalAlpha = 1; S.pops = S.pops.filter((p) => p.a < 1);
  }

  function draw(dt) {
    const g = S.g;
    if (!g) { ctx.fillStyle = '#0b3b22'; ctx.fillRect(0, 0, cw, ch); return; }
    const sc = scale(), t = camTarget(g), k = 1 - Math.pow(0.0008, dt);
    S.camX += (t.x - S.camX) * k; S.camY += (t.y - S.camY) * (g.phase === 'live' ? k : k * 0.8);
    S.shake = Math.max(0, S.shake - dt * 22);
    ctx.save(); if (S.shake > 0.1) ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
    drawField(g, sc);
    const ctl = g.pl[g.ctl ?? -1] || null;
    const order = g.pl.slice().sort((a, b) => b.y - a.y);
    for (const p of order) drawPlayer(g, p, sc, S.demo ? null : (g.phase === 'live' ? ctl : null));
    drawTargets(g, sc); drawBall(g, sc); drawFx(sc, dt);
    ctx.restore();
  }

  /* ------------------------------------- HUD ------------------------------------- */
  const hud = { u: '', c: '', us: '', cs: '', q: '', sit: '' };
  function setT(k, v) { if (hud[k] !== v) { hud[k] = v; q(k).textContent = v; } }
  function updateHud(g, dt) {
    if (!g) return;
    setT('u', g.names.U.slice(0, 8)); setT('c', g.names.C.split(' ').pop().slice(0, 8)); setT('us', String(g.score.U)); setT('cs', String(g.score.C));
    setT('q', g.ot ? `OT ${clockText(g.clock)}` : `Q${g.q} ${clockText(g.clock)}`);
    setT('sit', g.over ? 'FINAL' : `${g.off === 'U' ? '▶' : '◀'} ${downText(g)} · ${spotText(g.f)}`);
    const bn = $('.ar-bn');
    if (S.banner && S.bannerT > 0) { S.bannerT -= dt; bn.className = `ar-bn on ${S.banner.c}`; if (bn.dataset.k !== S.banner.t + S.banner.s) { bn.dataset.k = S.banner.t + S.banner.s; bn.innerHTML = `<b>${esc(S.banner.t)}</b>${S.banner.s ? `<small>${esc(S.banner.s)}</small>` : ''}`; } }
    else { bn.className = 'ar-bn'; bn.dataset.k = ''; }
    if (S.tip > 0) { S.tip -= dt; if (S.tip <= 0) $('.ar-tipbar').classList.remove('on'); }
  }

  /* ------------------------------------- loop ------------------------------------- */
  function frame(ts) {
    S.raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - (S.last || ts)) / 1000); S.last = ts;
    const g = S.g;
    if (g && S.view === 'game' && !S.paused) {
      S.acc += dt; let n = 0; const sp = S.demo ? 1.6 : 1;
      while (S.acc >= 1 / 60 && n++ < 6) { step(g, (1 / 60) * sp); S.acc -= 1 / 60; }
      drain(g); drawSheet(false); drawButtons(g); updateHud(g, dt);
    }
    draw(S.paused ? 0 : dt);
  }
  S.raf = requestAnimationFrame(frame);
  root.__arcade = S; // exposed for tests
  return { close: quit, state: S };
}
