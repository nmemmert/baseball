// Skipper Gridiron UI: canvas field + virtual stick + action buttons. The simulation lives in arcade.js.
import {
  newArcade, resumeArcade, snapshot, step, call, uncall, targets, bestOff, fgInfo, downText, spotText, OFF_PLAYS, DEF_CALLS, LEVELS, OPPONENTS, W, LEN, EZ, GOAL,
} from './arcade.js';
import { fx } from './feedback.js';

const KEY = 'skipper-arcade-v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const store = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* private mode */ } };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const clockText = (c) => { c = Math.max(0, Math.ceil(c)); return `${Math.floor(c / 60)}:${String(c % 60).padStart(2, '0')}`; };
const QLEN = [['Short', 180], ['Normal', 240], ['Long', 360]];
const DRILLS = [
  { t: 'Drill 1 of 4: Run the ball', tip: 'Take the handoff, drag upfield, hold SPRINT and tap JUKE at the first tackler. Gain 8 yards.', off: 'U', play: 'run_in', ok: (r) => r.gain >= 8 || r.td },
  { t: 'Drill 2 of 4: Throw it', tip: 'Wait for a GREEN ring, then tap that number to throw. Complete a pass for 5+ yards.', off: 'U', play: 'pass_quick', ok: (r) => (r.comp && r.gain >= 5) || r.td },
  { t: 'Drill 3 of 4: Make the tackle', tip: 'Chase the runner. Tap TACKLE when you are close. Hold them to 3 yards or less.', off: 'C', play: 'run_in', ok: (r) => r.gain <= 3 && !r.td },
  { t: 'Drill 4 of 4: Field goal', tip: 'Tap KICK when the marker is in the middle green zone.', off: 'U', play: 'fg', f: 70, ok: (r) => r.fg },
];
function diagram(id, defense) {
  const B = '#4aa8ff', Rd = '#ff7b7b', Y = '#ffd33d';
  const dot = (x, y, c, r = 3.4) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="#fff" stroke-width=".8"/>`;
  const ar = (d, dash, c = Y) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" ${dash ? 'stroke-dasharray="3 3"' : ''} marker-end="url(#ah${c === Y ? 'y' : 'r'})"/>`;
  let b = '';
  if (!defense) {
    const run = id === 'run_in' || id === 'run_out';
    const qb = run ? [50, 79] : [50, 84], rb = run ? [50, 90] : [62, 84];
    b += ar(...({
      run_in: ['M50 88 L50 38'], run_out: ['M50 88 Q84 82 90 40'], pass_quick: ['M10 68 L10 60 L34 46'], pass_deep: ['M10 68 L10 12'], screen: ['M62 84 L80 86 L88 74'],
    }[id]));
    if (id === 'pass_quick') b += ar('M90 68 L90 50 L90 54') + ar('M70 68 L70 60 L86 56') + ar('M62 84 L84 82');
    if (id === 'pass_deep') b += ar('M90 68 L90 40 L64 14') + ar('M70 68 L70 44') + ar('M62 84 L84 82', true);
    if (id === 'screen') b += ar('M10 68 L10 16', true) + ar('M90 68 L90 16', true) + ar('M42 66 L68 76', false, Y);
    b += dot(42, 68, B) + dot(58, 68, B) + dot(70, 68, B) + dot(10, 68, B) + dot(90, 68, B) + dot(...qb, B, 4) + dot(...rb, B);
  } else {
    const dls = [[42, 58], [58, 58]], lbs = [[30, 46], [70, 46]], cbs = [[10, 52], [90, 52]], sf = [50, 28];
    const rush = (id === 'blitz' ? ar('M30 46 L44 74') + ar('M70 46 L56 74') + ar('M50 28 L70 46') : '') + ar('M42 58 L46 76') + ar('M58 58 L54 76');
    if (id === 'base') b += rush + ar('M30 46 L30 36', true) + ar('M70 46 L70 36', true) + ar('M10 52 L10 38') + ar('M90 52 L90 38');
    if (id === 'blitz') b += rush + ar('M10 52 L10 36') + ar('M90 52 L90 36');
    if (id === 'zone') b += '<g fill="rgba(255,211,61,.18)" stroke="#ffd33d" stroke-dasharray="3 3"><ellipse cx="20" cy="30" rx="16" ry="12"/><ellipse cx="50" cy="16" rx="18" ry="11"/><ellipse cx="80" cy="30" rx="16" ry="12"/><ellipse cx="34" cy="46" rx="13" ry="9"/><ellipse cx="66" cy="46" rx="13" ry="9"/></g>';
    if (id === 'runstop') b += ar('M42 58 L47 74') + ar('M58 58 L53 74') + ar('M30 46 L46 70') + ar('M70 46 L54 70') + ar('M10 52 L32 66') + ar('M90 52 L68 66') + ar('M50 28 L50 62');
    b += [...dls, ...lbs, ...cbs, sf].map(([x, y]) => dot(x, y, Rd)).join('') + [[42, 70], [58, 70], [70, 70], [10, 70], [90, 70]].map(([x, y]) => dot(x, y, B, 2.6)).join('');
  }
  return `<svg class="ar-dg" viewBox="0 0 100 100" aria-hidden="true"><defs><marker id="ahy" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#ffd33d"/></marker><marker id="ahr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#ff7b7b"/></marker></defs><rect width="100" height="100" rx="8" fill="#1d6a39"/><line x1="0" x2="100" y1="${defense ? 70 : 68}" y2="${defense ? 70 : 68}" stroke="#4aa8ff" stroke-width="1.6"/>${b}</svg>`;
}
const ROLE_TAG = { WR1: 'WR', WR2: 'WR', TE: 'TE', RB: 'RB' };

export const ARCADE_HOW = [
  ['You are the player', 'No play-calling menus to sit in. You pick a play, then you run, throw and tackle with your thumbs.'],
  ['Move', 'Drag anywhere on the lower left to move. Push further to go faster.'],
  ['On offence', 'Pick a play. On a pass you control the quarterback: tap a numbered button (or tap the player) to throw. The ring colour shows how open he is: green open, yellow tight, red covered. After a catch or handoff you control the ball carrier: SPRINT (hold), JUKE to dodge, STIFF ARM to shed a tackler.'],
  ['On defence', 'Pick a coverage, then you control the defender nearest the ball. Drag to chase, TACKLE to dive at the carrier (miss and you fall), SWITCH to change player, JUMP to swat or pick off a pass at the right moment.'],
  ['Kicking', 'On 4th down you can punt or kick a field goal. For a kick, tap when the moving marker is in the centre.'],
  ['Rules', 'Flags happen: offside, false start, holding, pass interference. After a touchdown kick for 1 or go for 2 from the 2-yard line. Use a Timeout to get the last clock runoff back, or Hurry-up to run less clock.'],
  ['Winning', 'Four quarters. First downs keep the drive alive, touchdowns are 7, field goals 3. Tied after four? Sudden-death overtime.'],
  ['Modes', 'Quick game: one game vs a random team. Season: seven games, win six for the title. Practice: four short drills. After a touchdown, tap Replay to watch it again. Games you leave are saved, so you can Continue.'],
  ['Controls', 'Change stick size, button size and left or right hand in the menu.'],
];

export function openArcade({ onClose } = {}) {
  const S = {
    rec: load(), view: 'menu', g: null, demo: false, paused: false, camX: 18, camY: 40, shake: 0, banner: null, bannerT: 0, pops: [], parts: [],
    sig: '', bsig: '', ssig: '', raf: 0, last: 0, acc: 0, keys: {}, stick: { id: -1, ox: 0, oy: 0 }, tip: 0, held: {}, endSaved: false,
    mode: 'quick', oppIdx: 0, rbuf: [], rclip: null, rp: null, rtick: 0, lastPhase: '', drillDone: false, sawTD: false, f0: 0,
  };
  S.rec.set = Object.assign({ lv: 1, ql: 240, st: 'm', bs: 'm', lh: 0, gs: 's', vw: 'f' }, S.rec.set || {}); S.rec.tips = S.rec.tips || {};
  const root = document.createElement('div'); root.id = 'arcade';
  root.innerHTML = `<canvas class="ar-cv"></canvas>
    <div class="ar-top"><div class="ar-sb"><span class="ar-tm" data-k="u"></span><b class="ar-sc" data-k="us">0</b><span class="ar-mid"><i data-k="q"></i><em data-k="sit"></em></span><b class="ar-sc" data-k="cs">0</b><span class="ar-tm" data-k="c"></span></div><button class="ar-x" data-a="pause" aria-label="Pause">❚❚</button></div>
    <div class="ar-bn"></div><div class="ar-tipbar"></div><div class="ar-who"></div><button class="ar-rp" data-a="replay">📺 Replay</button><div class="ar-rpb" data-a="replay">REPLAY · tap to skip</div>
    <div class="ar-sz"><i class="ar-base"></i><i class="ar-knob"></i></div>
    <div class="ar-btns"></div><div class="ar-sheet"></div><div class="ar-modal"></div>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s), cv = $('.ar-cv'), ctx = cv.getContext('2d');
  const q = (k) => root.querySelector(`[data-k="${k}"]`);
  // The field always runs up and down the screen. In landscape it sits centred with the controls in the side margins.
  let cw = 0, ch = 0, dpr = 1, land = false;
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1); cw = root.clientWidth; ch = root.clientHeight; land = cw > ch;
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); root.classList.toggle('land', land); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const label = (str, x, y, stroke) => { ctx.save(); ctx.translate(x, y); if (stroke) ctx.strokeText(str, 0, 0); ctx.fillText(str, 0, 0); ctx.restore(); };
  resize(); window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  /* ---------------------------------- game control ---------------------------------- */
  const myCol = '#2b6cb0';
  const season = () => (S.rec.season ||= { i: 0, w: 0, l: 0, t: 0, res: [] });
  function applySet() { const st = S.rec.set; root.classList.toggle('lefty', !!st.lh); root.classList.remove('bs-s', 'bs-l'); if (st.bs !== 'm') root.classList.add(`bs-${st.bs}`); }
  applySet();
  function begin(g, demo) {
    S.g = g; S.demo = demo; S.view = 'game'; S.paused = false; S.endSaved = false; S.pops = []; S.parts = []; S.banner = null; S.sig = S.bsig = S.ssig = '';
    S.rbuf = []; S.rclip = null; S.rp = null; S.drillDone = false; S.sawTD = false; S.lastPhase = '';
    S.camX = 18; S.camY = g.los + 4; modal(''); drawSheet(true);
  }
  function start(demo, o = {}) {
    const opp = o.opp || OPPONENTS[Math.floor(Math.random() * OPPONENTS.length)];
    S.mode = o.mode || 'quick'; S.oppIdx = OPPONENTS.indexOf(opp);
    begin(newArcade({ level: S.rec.set.lv, qlen: S.rec.set.ql, opp, col: myCol, name: 'Skipper', auto: demo, seed: (Math.random() * 2 ** 31) | 0 }), demo);
  }
  function startDrill(i) {
    const d = DRILLS[i], f = d.f ?? 40;
    S.mode = 'drill'; S.di = i;
    const g = newArcade({ level: 0, qlen: 240, opp: OPPONENTS[0], col: myCol, name: 'Skipper', seed: (Math.random() * 2 ** 31) | 0, drill: i, start: { off: d.off, f, firstAt: f + 10, down: 1, toGo: 10 } });
    S.f0 = f; begin(g, false);
    if (d.off === 'C') { g.plan = 'run_in'; call(g, 'base'); } else call(g, d.play);
    const t = $('.ar-tipbar'); t.textContent = d.tip; t.classList.add('on'); S.tip = 9;
  }
  function resumeSaved() {
    const sv = S.rec.save; if (!sv) return; S.mode = sv.mode || 'quick'; S.oppIdx = sv.oi || 0;
    begin(resumeArcade(sv.s), false);
  }
  function judgeDrill(g) {
    if (S.drillDone) return; S.drillDone = true;
    const d = DRILLS[S.di], r = { gain: g.f - S.f0, td: S.sawTD, comp: g.stat.U.comp > 0, fg: !!(g.kickInfo && g.kickInfo.title === 'FIELD GOAL IS GOOD') };
    const ok = d.ok(r);
    setTimeout(() => { if (S.view === 'game' && S.mode === 'drill') modal(`<div class="ar-card"><div class="ar-logo sm">${ok ? '✅ Nice!' : '❌ Not quite'}</div><p class="ar-sub">${esc(d.t)}</p><p class="ar-sub">${ok ? (S.di < DRILLS.length - 1 ? 'Ready for the next one?' : 'Practice complete. You are ready for a real game.') : esc(d.tip)}</p>${ok && S.di < DRILLS.length - 1 ? '<button class="ar-go" data-a="drillnext">Next drill →</button>' : ''}<button class="${ok ? '' : 'ar-go'}" data-a="drillretry">↻ Try again</button><button data-a="menu">Menu</button></div>`); }, 1300);
  }
  function quit() { cancelAnimationFrame(S.raf); window.removeEventListener('resize', resize); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); document.removeEventListener('visibilitychange', vis); root.remove(); if (onClose) onClose(); }
  const vis = () => { if (document.hidden && S.view === 'game' && !S.demo) setPause(true); };
  document.addEventListener('visibilitychange', vis);
  function setPause(on) { if (S.view !== 'game') return; S.paused = on; modal(on ? pauseHtml() : ''); }

  /* ------------------------------------- modals ------------------------------------- */
  const rec = () => { const r = S.rec; return `${r.w || 0}-${r.l || 0}${r.t ? `-${r.t}` : ''}`; };
  const seg = (k, cur, opts) => `<div class="ar-seg">${opts.map(([n, v]) => `<button data-a="${k}" data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  function menuHtml() {
    const s = S.rec.set, sv = S.rec.save, se = S.rec.season;
    return `<div class="ar-card ar-menu"><div class="ar-logo">GRIDIRON</div><p class="ar-sub">Football you actually play. 7-on-7, thumbs on glass.</p>
      ${sv ? `<button class="ar-go" data-a="resume">▶ Continue game<small>vs ${esc(sv.s.names.C)} · Q${sv.s.q} ${clockText(sv.s.clock)} · ${sv.s.score.U}–${sv.s.score.C}</small></button>` : ''}
      <button class="${sv ? '' : 'ar-go'}" data-a="play">⚡ Quick game</button>
      <button data-a="season">🏆 ${se && se.i > 0 ? `Season: game ${se.i + 1} of ${OPPONENTS.length} (${se.w}-${se.l}${se.t ? `-${se.t}` : ''})` : 'Season: 7 games'}</button>
      <div class="ar-row"><button data-a="practice">🎓 Practice</button><button data-a="demo">👀 Demo</button></div>
      <div class="ar-opt"><span>Difficulty</span>${seg('lv', s.lv, LEVELS.map((l) => [l.name, l.id]))}</div>
      <div class="ar-opt"><span>Game length</span>${seg('ql', s.ql, QLEN.map(([n, v]) => [n, v]))}</div>
      <div class="ar-opt"><span>Game speed</span>${seg('gs', s.gs, [['Slower (easier)', 's'], ['Normal', 'n']])}</div>
      <div class="ar-opt"><span>Landscape view</span>${seg('vw', s.vw, [['Fill the screen', 'f'], ['Wide (see more)', 'w']])}</div>
      <div class="ar-opt"><span>Stick size</span>${seg('st', s.st, [['Small', 's'], ['Medium', 'm'], ['Large', 'l']])}</div>
      <div class="ar-opt"><span>Button size</span>${seg('bs', s.bs, [['Small', 's'], ['Medium', 'm'], ['Large', 'l']])}</div>
      <div class="ar-opt"><span>Hand</span>${seg('lh', s.lh, [['Right-handed', 0], ['Left-handed', 1]])}</div>
      <div class="ar-row"><button data-a="how">📖 How to play</button><button data-a="exit">← Back to Skipper</button></div>
      <p class="ar-rec">Quick games: <b>${rec()}</b>${S.rec.best ? ` · best win +${S.rec.best}` : ''}</p></div>`;
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
      ${seasonNote()}<button class="ar-go" data-a="${S.mode === 'season' ? (S.rec.season ? 'season' : 'menu') : 'play'}">${S.mode === 'season' ? (S.rec.season ? 'Next game →' : 'Menu') : '↻ Play again'}</button><button data-a="menu">Menu</button></div>`;
  }
  function seasonNote() {
    if (S.mode !== 'season' || !S.seasonDone) return S.mode === 'season' && S.rec.season ? `<p class="ar-sub">Season record: <b>${S.rec.season.w}-${S.rec.season.l}${S.rec.season.t ? `-${S.rec.season.t}` : ''}</b> after ${S.rec.season.i} of ${OPPONENTS.length}</p>` : '';
    const d = S.seasonDone; return `<p class="ar-sub">${d.w >= 6 ? '🏆 <b>Season champions!</b>' : d.w >= 4 ? 'Solid season.' : 'Rough season. Run it back!'} Final record <b>${d.w}-${d.l}${d.t ? `-${d.t}` : ''}</b></p>`;
  }
  function modal(html) { const m = $('.ar-modal'); m.innerHTML = html; m.classList.toggle('on', !!html); }
  modal(menuHtml());

  /* ----------------------------------- call sheet ----------------------------------- */
  function sheetKey(g) { return `${g.phase}|${g.off}|${g.down}|${g.f}|${g.q}|${g.kickInfo ? g.kickInfo.title : ''}|${g.meter ? 1 : 0}|${g.hurry ? 1 : 0}|${g.to.U}|${g.lastRunoff > 0 ? 1 : 0}|${g.twoPt ? 1 : 0}|${g.waitHike ? 1 : 0}`; }
  function drawSheet(force) {
    const g = S.g, sh = $('.ar-sheet');
    if (!g || S.view !== 'game') { sh.innerHTML = ''; sh.className = 'ar-sheet'; return; }
    const key = sheetKey(g);
    if (!force && key === S.ssig) { if (g.phase === 'meter') updateMeter(); return; }
    S.ssig = key; root.classList.toggle('hiking', g.phase === 'set' && !!g.waitHike && !S.demo);
    if (g.phase === 'call' && !S.demo && S.mode !== 'drill' && !g.twoPt) { const sn = snapshot(g); if (sn) { S.rec.save = { s: sn, mode: S.mode, oi: S.oppIdx }; store(S.rec); } }
    if (g.phase === 'pat' && !S.demo) {
      sh.className = 'ar-sheet on kick good'; sh.innerHTML = `<div class="ar-kc"><i>🏈</i><b>TOUCHDOWN! ${g.score.U}–${g.score.C}</b><small>Choose your extra point</small><div class="ar-cards sp pat"><button class="ar-pc" data-call="kick1"><i>🥅</i><b>Kick it</b><small>+1 point, very safe</small></button><button class="ar-pc" data-call="go2"><i>💪</i><b>Go for 2</b><small>One play from the 2</small></button></div></div>`;
    } else if (g.phase === 'call' && !S.demo) {
      const o = g.off === 'U', best = o ? Object.entries(bestOff(g)).sort((a, b) => b[1] - a[1])[0][0] : null;
      const cards = o ? Object.entries(OFF_PLAYS).map(([id, p]) => card(id, p, id === best)) : Object.entries(DEF_CALLS).map(([id, p]) => card(id, p, false));
      let extra = '';
      if (o && g.down === 4) { const fi = fgInfo(g); extra = `<div class="ar-cards sp"><button class="ar-pc" data-call="punt"><i>🦵</i><b>Punt</b><small>Give it away safely</small></button><button class="ar-pc" data-call="fg"><i>🥅</i><b>Field Goal</b><small>${fi.dist} yds · about ${fi.pct}%</small></button></div>`; }
      if (!g.twoPt && S.mode !== 'drill') extra += `<div class="ar-cards sp tm"><button class="ar-pc sm" data-call="timeout" ${g.to.U > 0 && g.lastRunoff > 0 ? '' : 'disabled'}><b>⏱ Timeout (${g.to.U})</b><small>${g.lastRunoff > 0 ? `Get back the last ${g.lastRunoff}s` : 'Use after a play runs the clock'}</small></button>${o ? `<button class="ar-pc sm ${g.hurry ? 'on' : ''}" data-call="hurry"><b>⚡ Hurry-up: ${g.hurry ? 'ON' : 'off'}</b><small>Runs less clock</small></button>` : '<span></span>'}</div>`;
      sh.className = 'ar-sheet on call full';
      sh.innerHTML = `<div class="ar-sitrow"><b>${g.twoPt ? 'TWO-POINT TRY' : o ? 'YOUR BALL' : 'THEIR BALL'}</b> · ${downText(g)} · ${spotText(g.f)}</div>${g.hint ? `<div class="ar-hl">💡 ${esc(g.hint)}</div>` : ''}${extra}<div class="ar-cards">${cards.join('')}</div>`;
    } else if (g.phase === 'set' && g.waitHike && !S.demo) {
      const run = g.play && OFF_PLAYS[g.play] && OFF_PLAYS[g.play].run, o = g.off === 'U';
      const legend = !o ? 'After the snap, drag to chase the ball. TACKLE dives at the runner. SWITCH changes player.' : run ? 'After the snap, drag to run. SPRINT, JUKE and STIFF ARM appear on the right.' : 'After the snap you are the QB. Drag to move, tap a numbered button to throw. Green ring = open.';
      sh.className = 'ar-sheet on hike';
      sh.innerHTML = `<div class="ar-hk"><small>${legend}</small><button class="ar-go" data-a="hike">${o ? '🏈 HIKE!' : '🛡️ READY'}</button><button class="ar-link" data-a="backplays">← Change the play</button></div>`;
    } else if (g.phase === 'kick' && g.kickInfo) {
      const k = g.kickInfo;
      sh.className = `ar-sheet on kick ${k.c || ''}`; sh.innerHTML = `<div class="ar-kc"><i>${k.icon}</i><b>${esc(k.title)}</b>${k.sub ? `<em>${esc(k.sub)}</em>` : ''}<small>${esc(k.text)}</small></div>`;
    } else if (g.phase === 'meter') {
      sh.className = 'ar-sheet on meter'; sh.innerHTML = `<div class="ar-mt"><b>FIELD GOAL · ${g.meter.dst} yds</b><div class="ar-bar"><i class="ar-zone"></i><i class="ar-mk"></i></div><button class="ar-go" data-a="kick">KICK!</button><small>Tap when the marker is in the middle</small></div>`;
    } else { sh.className = 'ar-sheet'; sh.innerHTML = ''; }
  }
  function card(id, p, star) { return `<button class="ar-pc dg" data-call="${id}">${diagram(id, !!DEF_CALLS[id])}<b>${p.n}${star ? ' ★' : ''}</b><small>${p.d}</small></button>`; }
  function updateMeter() { const mk = $('.ar-mk'); if (mk && S.g.meter) mk.style.left = `${S.g.meter.x * 100}%`; }

  /* ------------------------------------ buttons ------------------------------------ */
  function buttonsFor(g) {
    if (S.demo || g.phase === 'call' || g.phase === 'kick' || g.phase === 'meter' || g.phase === 'over' || g.phase === 'pat') return [];
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
  const sz = $('.ar-sz'), base = $('.ar-base'), knob = $('.ar-knob'); let R = 52;
  function setStick(x, y) { const g = S.g; if (g) { g.in.mx = x; g.in.my = y; } }
  sz.addEventListener('pointerdown', (e) => {
    if (S.stick.id >= 0 || !S.g || S.g.phase === 'call' || S.g.phase === 'pat') return; e.preventDefault();
    R = { s: 42, m: 52, l: 66 }[S.rec.set.st] || 52; base.style.width = base.style.height = `${R * 2}px`; sz.setPointerCapture?.(e.pointerId);
    const r = sz.getBoundingClientRect(); S.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
    base.style.cssText = `left:${e.clientX - r.left - R}px;top:${e.clientY - r.top - R}px;opacity:1`; knob.style.cssText = `left:${e.clientX - r.left - 22}px;top:${e.clientY - r.top - 22}px;opacity:1`;
  });
  sz.addEventListener('pointermove', (e) => {
    if (e.pointerId !== S.stick.id) return; e.preventDefault();
    let dx = e.clientX - S.stick.ox, dy = e.clientY - S.stick.oy; const m = Math.hypot(dx, dy) || 1, k = Math.min(1, m / R);
    setStick((dx / m) * k, -(dy / m) * k);
    const r = sz.getBoundingClientRect(), kx = S.stick.ox - r.left + (dx / m) * Math.min(m, R) - 22, ky = S.stick.oy - r.top + (dy / m) * Math.min(m, R) - 22;
    knob.style.left = `${kx}px`; knob.style.top = `${ky}px`;
  });
  const sup = (e) => { if (e.pointerId !== S.stick.id) return; S.stick.id = -1; setStick(0, 0); base.style.opacity = knob.style.opacity = 0; };
  sz.addEventListener('pointerup', sup); sz.addEventListener('pointercancel', sup);

  // tap the field to throw to the nearest receiver
  cv.addEventListener('pointerdown', (e) => {
    const g = S.g; if (!g || S.view !== 'game' || S.demo || g.mode !== 'drop' || g.off !== 'U') return;
    const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, sc = scale();
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
  function keyStick() { const g = S.g; if (!g || S.stick.id >= 0) return; const K = S.keys; const x = (K.d || K.arrowright ? 1 : 0) - (K.a || K.arrowleft ? 1 : 0), y = (K.w || K.arrowup ? 1 : 0) - (K.s || K.arrowdown ? 1 : 0), m = Math.hypot(x, y) || 1; g.in.mx = (x / m) * (x || y ? 1 : 0); g.in.my = (y / m) * (x || y ? 1 : 0); }
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);

  /* --------------------------------- clicks (DOM) --------------------------------- */
  root.addEventListener('click', (e) => {
    const c = e.target.closest('[data-call]'); if (c && S.g) { if (c.disabled) return; const id = c.dataset.call; if (call(S.g, id)) { fx.tick(); if (OFF_PLAYS[id] || DEF_CALLS[id]) { if (S.mode !== 'drill') tipFor(S.g); } drawSheet(true); } return; }
    const a = e.target.closest('[data-a]'); if (!a) return;
    const k = a.dataset.a;
    if (k === 'hike') { if (S.g) S.g.in.hike = true; fx.tick(); }
    else if (k === 'backplays') { if (S.g) uncall(S.g); drawSheet(true); }
    else if (k === 'vw') { S.rec.set.vw = a.dataset.v; store(S.rec); modal(menuHtml()); }
    else if (k === 'gs') { S.rec.set.gs = a.dataset.v; store(S.rec); modal(menuHtml()); }
    else if (k === 'st' || k === 'bs' || k === 'lh') { S.rec.set[k] = k === 'lh' ? +a.dataset.v : a.dataset.v; store(S.rec); applySet(); modal(menuHtml()); }
    else if (k === 'resume') resumeSaved(); else if (k === 'practice') startDrill(0);
    else if (k === 'drillnext') startDrill(S.di + 1); else if (k === 'drillretry') startDrill(S.di);
    else if (k === 'season') { const se = season(); start(false, { opp: OPPONENTS[se.i % OPPONENTS.length], mode: 'season' }); }
    else if (k === 'replay') { if (S.rp) { S.rp = null; } else if (S.rclip && S.rclip.length) S.rp = { i: 0, acc: 0 }; }
    else if (k === 'lv') { S.rec.set.lv = +a.dataset.v; store(S.rec); modal(menuHtml()); }
    else if (k === 'ql') { S.rec.set.ql = +a.dataset.v; store(S.rec); modal(menuHtml()); }
    else if (k === 'play') { S.rec.save = null; store(S.rec); start(false); } else if (k === 'demo') start(true);
    else if (k === 'how') modal(howHtml()); else if (k === 'menu') { S.view = 'menu'; S.g = null; S.rp = null; S.paused = false; modal(menuHtml()); drawSheet(true); drawButtons(null); }
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
  const SFX = { hit: fx.thud, td: fx.cheer, brk: fx.out, int: fx.groan, whistle: fx.whistle, catch: fx.crowd, whoosh: fx.tick, kick: fx.hit, snap: fx.tick, throw: fx.tick, out: fx.out };
  function drain(g) {
    for (const e of g.ev.splice(0)) {
      if (e.k === 'banner') { S.banner = e; S.bannerT = 1.9; if (e.t === 'TOUCHDOWN!') S.sawTD = true; }
      else if (e.k === 'sfx') { const f = SFX[e.n]; if (f && S.view === 'game') f(); }
      else if (e.k === 'pop') S.pops.push({ t: e.t, x: e.x, y: e.y, a: 0 });
      else if (e.k === 'hit') { S.shake = Math.max(S.shake, e.big ? 7 : 3); for (let i = 0; i < 7; i++) S.parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 7, vy: (Math.random() - 0.5) * 7, a: 0, l: 0.55, c: '#d8c79a', r: 0.22 }); }
      else if (e.k === 'burst') { if (e.c === 'td') { S.rclip = S.rbuf.slice(-170); S.sawTD = true; } S.shake = 9; for (let i = 0; i < 46; i++) S.parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 16, vy: Math.random() * 14, a: 0, l: 1.8, c: ['#ffd166', '#ff3b5c', '#3ddc84', '#4aa8ff', '#fff'][i % 5], r: 0.3 }); }
      else if (e.k === 'catch') { for (let i = 0; i < 5; i++) S.parts.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5, a: 0, l: 0.4, c: '#fff', r: 0.16 }); }
      else if (e.k === 'over') { setTimeout(() => finishGame(g), 1900); }
    }
  }
  function finishGame(g) {
    if (S.view !== 'game' || S.g !== g) return;
    if (!S.demo && !S.endSaved) {
      S.endSaved = true; const r = S.rec; r.save = null; S.seasonDone = null;
      if (S.mode === 'season') {
        const se = season(); if (g.winner === 'U') se.w++; else if (g.winner === 'C') se.l++; else se.t++; se.i++; se.res.push([g.names.C, g.score.U, g.score.C]);
        if (se.i >= OPPONENTS.length) { S.seasonDone = { w: se.w, l: se.l, t: se.t }; r.season = null; if (se.w >= 6) r.titles = (r.titles || 0) + 1; }
      } else {
        if (g.winner === 'U') { r.w = (r.w || 0) + 1; r.best = Math.max(r.best || 0, g.score.U - g.score.C); } else if (g.winner === 'C') r.l = (r.l || 0) + 1; else r.t = (r.t || 0) + 1;
      }
      store(r); setTimeout(g.winner === 'U' ? fx.win : fx.lose, 200);
    }
    if (S.demo) { S.view = 'menu'; modal(menuHtml()); return; }
    modal(finalHtml(g));
  }

  /* ------------------------------------ drawing ------------------------------------ */
  const fill = () => land && S.rec.set.vw !== 'w';
  const scale = () => (land ? (fill() ? cw / (W + 2) : ch / 36) : cw / 30);
  const anchor = () => (fill() ? 0.7 : 0.6);
  const sx = (x, sc) => cw / 2 + (x - S.camX) * sc;
  const sy = (y, sc) => ch * anchor() - (y - S.camY) * sc;
  function camTarget(g) {
    const car = g.carrier; let ty = g.los + 4, tx = 18;
    if (g.phase === 'live' || g.phase === 'dead') {
      if (car) { ty = car.y + (g.turn ? -2.5 : fill() ? 0.5 : 5); tx = car.x; }
      else if (g.fl) { const f = clamp(g.fl.t / g.fl.dur, 0, 1); ty = g.fl.fy + (g.fl.ty - g.fl.fy) * f + (fill() ? 0.5 : 4); tx = g.fl.fx + (g.fl.tx - g.fl.fx) * f; }
      else if (g.pl.length) { const c = g.pl.reduce((a, p) => a + p.y, 0) / g.pl.length; ty = Math.max(g.los + 2, c); tx = S.camX; }
    }
    if (g.phase === 'call' || g.phase === 'set') ty = g.los - (g.phase === 'call' && !S.demo ? 0.3 : 0.12) * ch / scale() + 1;
    return { x: land ? 18 : clamp(tx, 15, W - 15), y: clamp(ty, g.phase === 'call' ? 0 : 22, g.phase === 'call' || g.phase === 'set' ? LEN - 4 : LEN - 24) };
  }
  function shade(hex, f) { const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255; r = clamp(Math.round(r * f), 0, 255); gg = clamp(Math.round(gg * f), 0, 255); b = clamp(Math.round(b * f), 0, 255); return `rgb(${r},${gg},${b})`; }

  function drawField(g, sc) {
    const top = S.camY + (ch * anchor()) / sc + 2, bot = S.camY - (ch * (1 - anchor())) / sc - 2;
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
    const x = sx(p.x, sc), y = sy(p.y, sc), r = sc * (fill() ? 0.82 : 1.08);
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
    ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, 6.3); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 2.2; ctx.font = `900 ${Math.max(8, r * 0.6)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; label(String(p.num), x, y + 0.5, true);
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
      if (y < 74) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, 66); ctx.lineTo(x - 13, 86); ctx.lineTo(x + 13, 86); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#10151f'; ctx.font = '900 14px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; label(String(i + 1), x, 80); return; }
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
    let g = S.g;
    if (!g) { ctx.fillStyle = '#0b3b22'; ctx.fillRect(0, 0, cw, ch); return; }
    if (S.rp && S.rclip && S.rclip.length) { const f = S.rclip[Math.min(S.rp.i, S.rclip.length - 1)]; g = Object.assign(Object.create(S.g), { pl: f.pl, carrier: f.pl[f.car] || null, fl: f.fl, los: f.los, firstAt: f.firstAt, phase: 'live', ctl: -1, mode: f.fl ? 'air' : 'run' }); }
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
    $('.ar-rp').classList.toggle('on', !!(S.rclip && S.rclip.length > 10 && !S.rp && !S.demo && ['dead', 'kick', 'pat'].includes(g.phase)));
    $('.ar-rpb').classList.toggle('on', !!S.rp); root.classList.toggle('rpl', !!S.rp);
    const who = $('.ar-who'), c = g.pl[g.ctl ?? -1], on = g.phase === 'live' && c && !S.demo && !S.rp;
    if (on) { const tx = `#${c.num} ${c.name} · ${c.role.replace(/\d/, '')}`; if (who.textContent !== tx) who.textContent = tx; }
    who.classList.toggle('on', !!on);
  }

  /* ------------------------------------- loop ------------------------------------- */
  function frame(ts) {
    S.raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - (S.last || ts)) / 1000); S.last = ts;
    const g = S.g;
    if (g && S.view === 'game' && !S.paused) {
      if (S.rp) {
        S.rp.acc += dt; S.rp.i = Math.floor(S.rp.acc * 20); if (!S.rclip || S.rp.i >= S.rclip.length) S.rp = null;
      } else {
        S.acc += dt; let n = 0; const sp = S.demo ? 1.6 : S.rec.set.gs === 's' ? 0.8 : 1;
        while (S.acc >= 1 / 60 && n++ < 6) { step(g, (1 / 60) * sp); S.acc -= 1 / 60; }
        if (g.phase === 'live') {
          if (S.lastPhase !== 'live') { S.rbuf = []; S.rclip = null; S.sawTD = false; }
          if (++S.rtick % 3 === 0) { S.rbuf.push({ pl: g.pl.map((p) => ({ ...p })), fl: g.fl ? { ...g.fl } : null, car: g.carrier ? g.carrier.id : -1, los: g.los, firstAt: g.firstAt }); if (S.rbuf.length > 260) S.rbuf.shift(); }
        }
        S.lastPhase = g.phase;
        drain(g);
        if (S.mode === 'drill' && !S.drillDone && (g.phase === 'dead' || g.phase === 'kick')) judgeDrill(g);
      }
      drawSheet(false); drawButtons(g); updateHud(g, dt);
    }
    draw(S.paused ? 0 : dt);
  }
  S.raf = requestAnimationFrame(frame);
  root.__arcade = S; // exposed for tests
  return { close: quit, state: S };
}
