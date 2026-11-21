import {
  newGame, startGame, pitch, aiPitch, aiPrePA, aiOffense, aiDefense, autoHalf, autoPlay, changePitcher, pinchHit, pinchRun, defSub,
  battingTeam, fieldingTeam, currentBatter, onDeck, fatigue, winProb, platoonEdge, formTag, levelFor, bullpenRole, repertoire, tiltLabel,
  decisionReason, pack, unpack, reviveGame, attachRng,
} from './engine.js';
import * as L from './league.js';
import { saveRaw, loadRaw, clearSave } from './store.js';
import { advise, stars, todo } from './coach.js';
import { bbGameIntel, bbReport, bbChip, renderIntel, renderReport, chipHtml } from './intel.js';
import { createCam } from './cam.js';
import { introHtml, startHtml, guideHtml, sportHtml, TUTORIAL } from './screens.js';
import { createFootball } from './fbui.js';
import { createFbCam } from './fbcam.js';
import { fx, react, prefs, initHaptics } from './feedback.js';

const DEFAULTS = {
  sound: true, haptics: true, level: 1, theme: 'auto', text: 0, cvd: false, speed: 'normal', autoNext: false, autoLineup: false, seenTips: true, visuals: 'full', coach: true, introSeen: false, tutDone: false,
  pause: { tired: true, scoring: true, late: true, loaded: false },
  sport: 'baseball', fbPause: { fourth: true, redzone: false, twominute: true, score: true }, fbTutDone: false,
};
const app = { settings: structuredClone(DEFAULTS), tab: 'game', lg: null, g: null, kind: null, daily: {}, auto: false, skipTok: -1, off: null, screen: null, prevScreen: null, introStep: 0, tut: null, sugg: [], snap: null, savedG: null, savedKind: null };
const ui = {
  swing: 'normal', approach: 'normal', call: '', shift: false, infieldIn: false, depth: 'normal', mix: 'mix', sub: 'orders', sel: null, open: {},
  pauseMsg: '', replayN: null, tradeTeam: 1, tradeKind: 'bat', tMine: null, tTheirs: null,
};
const $ = (id) => document.getElementById(id);
let autoTimer = null;

// ---------- persistence & preferences ----------
function persist() {
  const tut = app.kind === 'tutorial';
  saveRaw(pack({ lg: app.lg, g: tut ? app.savedG : app.g, kind: tut ? app.savedKind : app.kind, settings: app.settings, daily: app.daily, fb: FB.snapshot() }));
}
function applyPrefs() {
  const s = app.settings, el = document.documentElement;
  prefs.sound = s.sound; prefs.haptics = s.haptics;
  el.dataset.theme = s.theme; el.dataset.cvd = s.cvd ? '1' : '0';
  el.style.fontSize = ['100%', '115%', '130%'][s.text] || '100%';
}
function boot() {
  const raw = loadRaw();
  if (raw) {
    try {
      const s = unpack(raw);
      app.lg = s.lg; app.g = s.g; app.kind = s.kind; app.daily = s.daily || {};
      app.settings = { ...structuredClone(DEFAULTS), ...s.settings, pause: { ...DEFAULTS.pause, ...(s.settings && s.settings.pause) }, fbPause: { ...DEFAULTS.fbPause, ...(s.settings && s.settings.fbPause) } };
      attachRng(app.lg); reviveGame(app.g);
      if (app.g) { app.g.wp ||= [0.5]; app.g.pa.locs ||= []; }
      app.lg.fa ||= [];
      FB.restore(s.fb);
    } catch { app.lg = null; app.g = null; app.kind = null; }
  }
  if (!app.lg) app.lg = L.createLeague();
  applyPrefs();
  app.screen = app.settings.introSeen ? 'sport' : 'intro';
  if (app.g) cam.update(app.g);
  const m = /seed=(\d+)/.exec(location.hash);
  if (m) {
    if (!app.g || app.g.over || app.kind === 'exhibit') { app.settings.introSeen = true; app.settings.sport = 'baseball'; startExhibition(Number(m[1])); }
    else toast('Finish your current season game to open the shared game.');
    history.replaceState(null, '', location.pathname);
  }
}

// ---------- helpers ----------
const mine = () => (app.kind === 'season' && app.g ? L.userTeam(app.lg) : app.kind === 'exhibit' && app.g ? app.g.home : app.kind === 'tutorial' && app.g ? app.g.away : L.userTeam(app.lg));
const opp = () => (app.g.home === mine() ? app.g.away : app.g.home);
const userBats = () => battingTeam(app.g) === mine();
const abbr = (t) => t.nick.slice(0, 3).toUpperCase();
const ip = (s) => `${Math.floor(s.outs / 3)}.${s.outs % 3}`;
const avg = (s) => (s.ab ? (s.h / s.ab).toFixed(3).replace(/^0/, '') : '.---');
const ra9 = (s) => (s.outs ? ((s.r * 27) / s.outs).toFixed(2) : '–');
const money = (x) => `$${x.toFixed(1)}M`;
let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2800); }
const hue = (str) => { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const teamCol = (t) => `hsl(${hue(t.nick)} 62% 46%)`;
const initials = (n) => n.split(' ').map((x) => x[0]).join('').slice(0, 2);
const avatar = (p, t) => `<span class="av" style="background:${teamCol(t)}">${initials(p.name)}</span>`;
const todayKey = (d = new Date()) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

const cam = createCam({ teamCol });

function findPlayer(uid) {
  const teams = [...app.lg.teams];
  if (app.g) teams.push(app.g.home, app.g.away);
  for (const t of teams) for (const p of [...t.batters, ...t.sp, ...t.rp]) if (p.uid === uid) return { p, t, fa: false };
  const fa = app.lg.fa.find((p) => p.uid === uid);
  return fa ? { p: fa, t: null, fa: true } : null;
}
const tagHtml = (p, vs) => {
  let h = '';
  const f = formTag(p);
  if (f === 'hot') h += '<span class="tag hot">🔥 hot</span>';
  if (f === 'cold') h += '<span class="tag cold">🧊 cold</span>';
  if (p.inj > 0) h += `<span class="tag inj">hurt ${p.inj}d</span>`;
  if (vs && p.type === 'bat') {
    const e = platoonEdge(p, vs);
    if (e > 0) h += '<span class="tag edge">platoon edge</span>';
    if (e < 0) h += '<span class="tag dis">same-side</span>';
  }
  return h;
};
const pl = (p, vs) => `<span class="player" data-act="card" data-uid="${p.uid}">${p.name}</span>${tagHtml(p, vs)}`;
const ratings = (p) => (p.type === 'bat' ? `CON ${p.contact} · PWR ${p.power} · EYE ${p.eye} · SPD ${p.speed} · DEF ${p.def ?? 55}` : `STF ${p.stuff} · CTL ${p.control} · STA ${p.stamina}`);
const batLine = (s) => `${s.h}-${s.ab}${s.hr ? `, ${s.hr} HR` : ''}${s.rbi ? `, ${s.rbi} RBI` : ''}${s.bb ? `, ${s.bb} BB` : ''}${s.k ? `, ${s.k} K` : ''}`;
const pitLine = (s) => `${ip(s)} IP, ${s.h} H, ${s.r} R, ${s.bb} BB, ${s.k} K (${s.pitches} p)`;
const restLabel = (p) => (p.debt > 0.55 ? 'gassed' : p.debt > 0.2 ? 'tired' : 'rested');
const roleTag = (t, p) => `<span class="tag role">${bullpenRole(t, p)}</span>`;

function openDialog(html) { const d = $('card'); d.innerHTML = html; if (!d.open) d.showModal(); }
const closeDialog = () => { const d = $('card'); if (d.open) d.close(); };

// ---------- game flow ----------
function resetCalls() { Object.assign(ui, { swing: 'normal', approach: 'normal', call: '', shift: false, infieldIn: false, depth: 'normal', mix: 'mix', sub: 'orders', pauseMsg: '', replayN: null }); }

function startSeasonGame() {
  const ng = L.nextGame(app.lg);
  if (!ng) return;
  if (app.settings.autoLineup) L.autoLineup(L.userTeam(app.lg));
  app.g = startGame(ng.home, ng.away, { seed: Math.floor(Math.random() * 2 ** 31), level: app.settings.level, user: L.userTeam(app.lg) });
  app.kind = 'season'; resetCalls(); app.tab = 'game'; app.screen = null; cam.update(app.g);
  app.g.log.push(`${ng.label}: ${ng.away.name} at ${ng.home.name}. Play ball!`);
  persist(); render();
}
function startExhibition(seed, daily = false) {
  if (app.kind === 'tutorial') exitTutorial(false, true);
  if (app.g && !app.g.over && app.kind === 'season' && !confirm('Abandon your current season game?')) return;
  setAuto(false, true); app.screen = null;
  const s = seed || Math.floor(100000 + Math.random() * 899999);
  app.g = newGame(s, daily ? 2 : app.settings.level); app.g.user = app.g.home; app.g.daily = daily; app.kind = 'exhibit';
  resetCalls(); app.tab = 'game'; cam.update(app.g);
  app.g.log.push(daily ? `Daily challenge ${s}. You manage ${app.g.home.name} against an All-Star manager. Play ball!` : `Exhibition #${s}. You manage ${app.g.home.name}. Play ball!`);
  persist(); render();
}
function startDaily() {
  const key = todayKey();
  if (app.daily.date === key) { toast('You already played today’s challenge.'); return; }
  startExhibition(Number(key), true);
}

function callOk(call) {
  const g = app.g, [b1, b2, b3] = g.bases;
  if (userBats()) {
    if (call === 'steal') return (b1 && !b2) || (b2 && !b3);
    if (call === 'bunt') return g.outs < 2 && (b1 || b2 || b3) && g.pa.strikes < 2;
    if (call === 'hitrun') return b1 && !b2 && g.outs < 2;
    return call === '' || call === 'take';
  }
  if (call === 'pitchout') return !!(b1 || b2) && g.pa.balls < 3;
  return call === '' || call === 'ibb';
}

function doPitch(oneShots = true) {
  const g = app.g;
  cam.cancel(g);
  aiPrePA(g, [opp()]);
  if (!callOk(ui.call)) ui.call = '';
  const c = oneShots ? ui.call : '';
  const bats = userBats();
  const orders = {
    off: bats ? { swing: ui.swing, take: c === 'take', steal: c === 'steal', bunt: c === 'bunt', hitRun: c === 'hitrun' } : aiOffense(g, levelFor(g, battingTeam(g))),
    def: bats ? aiDefense(g, levelFor(g, fieldingTeam(g))) : { approach: ui.approach, ibb: c === 'ibb', pitchout: c === 'pitchout', infieldIn: ui.infieldIn && !!g.bases[2], shift: ui.shift, depth: ui.depth, mix: ui.mix },
  };
  const mark = g.log.length, half = g.half;
  app.snap = { bases: [...g.bases], batter: currentBatter(g), half: g.half, inning: g.inning };
  const ev = pitch(g, orders);
  g.mark = mark;
  if (app.tut) { app.tut.pitches++; app.tut.stepPitches++; if (g.last && g.last.steal) app.tut.stolen = true; }
  ui.call = ''; ui.pauseMsg = ''; ui.replayN = null;
  if (g.pa.pitches === 0) { ui.swing = 'normal'; ui.approach = 'normal'; ui.mix = 'mix'; }
  if (g.half !== half) ui.infieldIn = false;
  return ev;
}

function camMode() {
  const v = app.settings.visuals, sp = app.settings.speed;
  if (v === 'off') return 'off';
  if (app.auto) return sp === 'instant' ? 'off' : sp === 'fast' ? 'quick' : v;
  return v;
}
function playCam(ev) {
  if (!app.g || !ev || !app.snap) return Promise.resolve();
  return cam.play(ev, app.snap, app.g, { mode: camMode() });
}

function afterPlay(ev, quiet = false) {
  const g = app.g;
  if (ev) react(ev);
  if (g.over) {
    const won = (g.winner === 'home') === (g.home === mine());
    setTimeout(won ? fx.win : fx.lose, 350);
  }
  persist(); render();
  if (!ev || quiet) cam.update(g); else playCam(ev);
  tutCheck();
}

function throwPitch() { if (app.g && !app.g.over && !app.auto) afterPlay(doPitch(true)); }
function autoAtBat() {
  const g = app.g; if (!g || g.over || app.auto) return;
  let ev, n = 0;
  do { ev = doPitch(n === 0); n++; } while (!g.over && g.pa.pitches > 0 && n < 30);
  afterPlay(ev, true);
}
function autopilot(kind) {
  const g = app.g; if (!g || g.over || app.auto) return;
  g.mark = g.log.length;
  const ctl = [mine(), opp()];
  if (kind === 'half') autoHalf(g, ctl); else autoPlay(g, ctl);
  ui.call = ''; ui.replayN = null;
  afterPlay(null);
}

// ---------- auto mode ----------
const DELAY = { slow: 450, normal: 220, fast: 60 };
function setAuto(on, quiet = false) {
  clearTimeout(autoTimer);
  app.auto = !!on;
  if (!on) { if (!quiet) render(); return; }
  const g = app.g;
  if (!g || g.over) { app.auto = false; return; }
  app.skipTok = g.pa.pitches === 0 ? g.paCount : -1;
  ui.pauseMsg = ''; ui.replayN = null;
  if (app.tut) app.tut.autoUsed = true;
  autoTick(false);
  tutCheck();
}
function pauseAuto(reason) {
  clearTimeout(autoTimer);
  app.auto = false; ui.pauseMsg = reason;
  toast(`Paused: ${reason}`); persist(); render();
}
// force=true plays instantly until the next decision point (the "Decision" button).
function autoTick(force) {
  const g = app.g;
  if (!g) { app.auto = false; return; }
  if (!app.auto && !force) return;
  const instant = force || app.settings.speed === 'instant';
  let ev = null, n = 0;
  if (force) { app.skipTok = g.pa.pitches === 0 ? g.paCount : -1; ui.pauseMsg = ''; ui.replayN = null; }
  do {
    if (g.over) break;
    if (g.pa.pitches === 0 && g.paCount !== app.skipTok) {
      const r = decisionReason(g, mine(), app.settings.pause);
      if (r) { pauseAuto(r); return; }
    }
    if (n === 0) g.mark = g.log.length;
    app.snap = { bases: [...g.bases], batter: currentBatter(g), half: g.half, inning: g.inning };
    cam.cancel(g);
    ev = aiPitch(g, [mine(), opp()]);
    n++;
  } while (instant && n < 4000);
  ui.call = '';
  if (g.over) { afterAuto(ev, instant); return; }
  if (!instant) react(ev);
  persist(); render(); tutCheck();
  if (!instant) playCam(ev).then(() => { if (app.auto) autoTimer = setTimeout(() => autoTick(false), DELAY[app.settings.speed] || 250); });
  else { cam.update(g); if (!force) autoTimer = setTimeout(() => autoTick(false), 0); }
}
function afterAuto(ev, quiet = false) {
  app.auto = false; clearTimeout(autoTimer);
  afterPlay(ev, quiet);
  if (app.kind === 'season' && app.settings.autoNext) {
    setTimeout(() => {
      finishGame();
      if (app.lg.phase !== 'done' && L.nextGame(app.lg) && !app.g) { startSeasonGame(); setAuto(true); }
    }, 1200);
  }
}

function finishGame() {
  const g = app.g;
  if (!g || !g.over) return;
  if (app.kind === 'tutorial') { exitTutorial(true); return; }
  setAuto(false, true);
  const you = mine() === g.home ? g.home.runs : g.away.runs, them = mine() === g.home ? g.away.runs : g.home.runs;
  if (app.kind === 'season') {
    L.completeDay(app.lg, g);
    toast(`${you > them ? 'Win' : 'Loss'} ${you}-${them}. ${L.userTeam(app.lg).w}-${L.userTeam(app.lg).l}`);
    app.tab = 'season';
  } else if (g.daily) {
    const key = String(g.seed), y = new Date(); y.setDate(y.getDate() - 1);
    const won = you > them, streak = won ? (app.daily.lastWin === todayKey(y) ? (app.daily.streak || 0) + 1 : 1) : 0;
    app.daily = { date: key, won, rd: you - them, streak, best: Math.max(app.daily.best || 0, streak), lastWin: won ? key : app.daily.lastWin };
    toast(won ? `Daily won ${you}-${them}! Streak ${streak}` : `Daily lost ${you}-${them}`);
    app.tab = 'more';
  }
  app.g = null; app.kind = null; ui.replayN = null;
  persist(); render();
}

function startReplay() {
  const g = app.g;
  if (!g || !g.lastPA || !g.lastPA.locs.length) return;
  ui.replayN = 0;
  const step = () => {
    if (ui.replayN === null || !app.g) return;
    ui.replayN++; fx.tick(); render();
    if (ui.replayN < g.lastPA.locs.length) setTimeout(step, 650);
    else setTimeout(() => { ui.replayN = null; render(); }, 1600);
  };
  step();
}

// ---------- rendering: game ----------
const PDESC = { ball: 'Ball', called: 'Called strike', whiff: 'Swinging strike', foul: 'Foul', inplay: 'In play', hbp: 'Hit by pitch' };
const PCLS = { ball: 'ball', called: 'strike', whiff: 'strike', foul: 'strike', inplay: 'inplay', hbp: 'hbp' };

function scorebug() {
  const g = app.g, a = g.away, h = g.home;
  const wpH = winProb(g), wpMe = Math.round((g.home === mine() ? wpH : 1 - wpH) * 100);
  const mid = g.over ? '<div class="inn fin">FINAL</div>' : `<div class="inn">${g.half === 'top' ? '▲' : '▼'} ${g.inning} <span class="rp ${battingTeam(g) === mine() ? 'bat' : 'fld'}">${battingTeam(g) === mine() ? 'BATTING' : 'FIELDING'}</span></div><small>${g.outs} out · ${wpMe}% win</small>`;
  return `<div class="bug">
    <div class="side ${a === mine() ? 'me' : ''}"><i class="chip" style="background:${teamCol(a)}"></i><div class="ab">${abbr(a)}<small>${a.hits} H</small></div><span class="runs">${a.runs}</span></div>
    <div class="mid">${mid}</div>
    <div class="side r ${h === mine() ? 'me' : ''}"><span class="runs">${h.runs}</span><div class="ab">${abbr(h)}<small>${h.hits} H</small></div><i class="chip" style="background:${teamCol(h)}"></i></div></div>`;
}

function lineScore() {
  const g = app.g, n = Math.max(9, g.inning);
  const head = Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join('');
  const row = (t, top) => {
    const live = !g.over && ((top && g.half === 'top') || (!top && g.half === 'bot'));
    const cells = Array.from({ length: n }, (_, i) => {
      const v = t.inningRuns[i];
      return `<td>${v === undefined ? (live && g.inning === i + 1 ? '·' : '') : v}</td>`;
    }).join('');
    return `<tr class="${t === mine() ? 'me' : ''}"><td>${live ? '▸ ' : ''}${t.nick}</td>${cells}<td><b>${t.runs}</b></td><td>${t.hits}</td></tr>`;
  };
  return `<div class="scroll"><table><tr><th></th>${head}<th>R</th><th>H</th></tr>${row(g.away, true)}${row(g.home, false)}</table></div>`;
}

function trackerSvg(locs, faded) {
  const X = (x) => Math.max(14, Math.min(186, 100 + x * 50)), Y = (y) => Math.max(14, Math.min(214, 112 - y * 50));
  const dotsSvg = locs.map((l, i) => {
    const c = PCLS[l.k], last = !faded && i === locs.length - 1;
    return `<g opacity="${faded ? 0.5 : 1}"><circle class="d-${c}" cx="${X(l.x)}" cy="${Y(l.y)}" r="10" ${last ? 'stroke="#fff" stroke-width="2.5"' : ''}/><text class="d-num t-${c}" x="${X(l.x)}" y="${Y(l.y) + 4}">${i + 1}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 200 230" role="img" aria-label="Pitch tracker"><rect class="z-out" x="18" y="30" width="164" height="164" rx="8"/>
    <rect class="z-in" x="50" y="62" width="100" height="100"/><path class="z-grid" d="M83 62 V162 M117 62 V162 M50 95 H150 M50 129 H150"/>
    <path class="g-plate" opacity=".9" d="M70 208 h60 l-8 10 h-44 z"/>${dotsSvg}</svg>`;
}

function sparkline() {
  const g = app.g, mineHome = g.home === mine();
  const pts = g.wp.map((w) => (mineHome ? w : 1 - w));
  const W = 300, H = 54, n = Math.max(pts.length, 2);
  const xy = pts.map((v, i) => `${((i / (n - 1)) * W).toFixed(1)},${(H - 4 - v * (H - 8)).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Win probability"><line class="g-line" x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke-dasharray="3 4"/>
    <polyline class="spark-line ${last >= 0.5 ? 'up' : 'down'}" points="${xy}"/></svg>`;
}

function pitchRows(locs) {
  return locs.map((l, i) => `<div class="p"><span class="pn ${PCLS[l.k]}">${i + 1}</span><span>${l.tn} <small>${l.v} mph</small></span><b>${PDESC[l.k]}</b></div>`).join('');
}
function curLocs() {
  const g = app.g, replay = ui.replayN !== null && g.lastPA, hasCur = g.pa.locs.length > 0;
  return { replay, hasCur, locs: replay ? g.lastPA.locs.slice(0, ui.replayN) : (hasCur ? g.pa.locs : (g.lastPA ? g.lastPA.locs : [])) };
}
function nowCard() {
  const g = app.g, { replay, hasCur, locs } = curLocs();
  const faded = !replay && !hasCur && !!g.lastPA;
  const dotsRow = (n, max, cls) => `<div class="dots">${Array.from({ length: max }, (_, i) => `<i class="dot ${cls} ${i < n ? 'on' : ''}"></i>`).join('')}</div>`;
  const last = locs[locs.length - 1];
  const lp = last ? `<div class="lastpitch"><span class="pn ${PCLS[last.k]}">${locs.length}</span><span>${last.tn} <small>${last.v} mph</small><br><b>${PDESC[last.k]}</b></span></div>` : '<div class="lastpitch"><small>First pitch coming up</small></div>';
  const lastLine = [...g.log].reverse().find((l) => !l.startsWith('—')) || '';
  const play = lastLine && !replay ? `<div class="lastplay ${g.last && g.last.runs ? 'run' : ''}">${lastLine}</div>` : '';
  const rep = faded && g.lastPA ? '<button class="sm" data-act="replay" aria-label="Replay last at-bat">↻</button>' : '';
  return `<div class="stage"><div class="camcol"><div class="camwrap"><div id="camslot"></div>${chipHtml(bbChip(g, mine()))}<div class="camcount"><div>B${dotsRow(g.pa.balls, 3, 'b')}</div><div>S${dotsRow(g.pa.strikes, 2, 's')}</div><div>O${dotsRow(g.outs, 2, 'o')}</div></div></div></div>
    <div class="zonecol"><div class="zonebox">${trackerSvg(locs, faded)}</div><div class="lprow">${lp}${rep}</div></div></div>${play}`;
}

function arsenalHtml(p) {
  return `<div class="arsenal">${repertoire(p).map((a) => `<span>${a.name} <b>${a.q}</b></span>`).join('')}</div>`;
}

function vsStrip() {
  const g = app.g, bt = battingTeam(g), ft = fieldingTeam(g), b = currentBatter(g), p = ft.pitcher, f = fatigue(p);
  const tl = tiltLabel(b);
  return `<div class="vs">
    <div><div class="role">Pitching</div><div class="who">${avatar(p, ft)}<div class="t"><b>${pl(p)}</b><small>${p.hand}HP · ${p.stats.pitches} pitches</small></div></div>
      <small>${pitLine(p.stats)}</small><div class="row"><div class="meter ${f > 0.5 ? 'hot' : ''}"><i style="width:${Math.min(100, (p.stats.pitches / (p.stamina * (1 - 0.45 * (p.debt || 0)) * 1.25)) * 100)}%"></i></div><small>${f > 0.6 ? 'gassed' : f > 0.2 ? 'tiring' : 'fresh'}</small></div>${arsenalHtml(p)}</div>
    <div><div class="role">At bat</div><div class="who">${avatar(b, bt)}<div class="t"><b>${pl(b, p)}</b><small>${b.pos} · bats ${b.hand}${tl ? ` · ${tl}` : ''}</small></div></div>
      <small>Today: ${batLine(b.stats)}</small><div class="row"><small>On deck: ${onDeck(g).name}</small></div><small>${ratings(b)}</small></div></div>`;
}

function wpCard() {
  const g = app.g, wpHome = winProb(g), wp = g.home === mine() ? wpHome : 1 - wpHome;
  return `<div class="row" style="justify-content:space-between;margin-top:0"><h2 style="margin:0">Win probability</h2><b style="font-size:1.25rem;color:var(--${wp >= 0.5 ? 'green' : 'strike'})">${Math.round(wp * 100)}%</b></div>${sparkline()}`;
}

const seg = (name, cur, opts, dis = {}, star) => `<div class="seg">${opts.map(([v, t]) => `<label><input type="radio" name="${name}" value="${v}" ${cur === v ? 'checked' : ''} ${dis[v] ? 'disabled' : ''} data-set="${name}"><span>${t}${star === v ? ' ★' : ''}</span></label>`).join('')}</div>`;
const fold = (key, title, body, open = false) => `<details class="fold" data-fold="${key}" ${(ui.open[key] ?? open) ? 'open' : ''}><summary>${title}</summary><div class="fold-b">${body}</div></details>`;
const chk = (name, on, text, dis) => `<label class="chk"><input type="checkbox" data-toggle="${name}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}> ${text}</label>`;
const HINTS = {
  '': '', take: 'Take: the batter lets the next pitch go by (unless it is strike three).',
  steal: 'Steal: the runner goes on the pitch. Faster runners and slower pitchers help.',
  bunt: 'Bunt: move runners up at the cost of an out — likeliest to work with weak hitters.',
  hitrun: 'Hit & run: runner on 1st goes, batter must swing. No double play, but a miss exposes the runner.',
  pitchout: 'Pitchout: a wasted ball that makes a steal very hard — but it adds a ball to the count.',
  ibb: 'Intentional walk: put the batter on first for free, to set up a double play or avoid a slugger.',
};

function ordersPanel() {
  const g = app.g, [, , b3] = g.bases, st = stars(app.sugg || []);
  if (g.over) {
    const won = (g.winner === 'home') === (g.home === mine());
    return `<div class="banner">${won ? 'Victory!' : 'Defeat.'}<br>${g.away.name} ${g.away.runs}, ${g.home.name} ${g.home.runs}</div>
      <div class="row" style="justify-content:center"><button data-act="shareresult">Share result</button></div>`;
  }
  if (app.auto) return '<div class="banner pause">▶ Auto mode is managing your team…</div><div class="hint">Tap ⏸ Pause auto below to take over. Speed and pause rules are on the Auto tab.</div>';
  const flag = ui.pauseMsg;
  const banner = flag ? `<div class="banner pause">⚑ ${flag}</div>` : '';
  if (!callOk(ui.call)) ui.call = '';
  let body, hint = ui.call ? HINTS[ui.call] : '';
  if (userBats()) {
    const dis = { steal: !callOk('steal'), bunt: !callOk('bunt'), hitrun: !callOk('hitrun') };
    body = `<div class="group inline"><span class="label">Approach</span>${seg('swing', ui.swing, [['patient', 'Work count'], ['normal', 'Normal'], ['aggressive', 'Swing away']], {}, st.swing)}</div>
      <div class="group inline"><span class="label">Call</span>${seg('call', ui.call, [['', 'None'], ['take', 'Take'], ['steal', 'Steal'], ['bunt', 'Bunt'], ['hitrun', 'H&amp;R']], dis, st.call)}</div>`;
  } else {
    body = `<div class="group inline"><span class="label">Approach</span>${seg('approach', ui.approach, [['nibble', 'Nibble'], ['normal', 'Normal'], ['attack', 'Attack']])}</div>
      <div class="group inline"><span class="label">Mix</span>${seg('mix', ui.mix, [['fb', 'Fastball'], ['mix', 'Mix'], ['off', 'Offspeed']], {}, st.mix)}</div>
      <div class="group inline"><span class="label">Call</span>${seg('call', ui.call, [['', 'None'], ['pitchout', 'Pitchout'], ['ibb', 'Walk']], { pitchout: !callOk('pitchout') }, st.call)}</div>
      <div class="group inline"><span class="label">Align</span><div>${chk('shift', ui.shift, `Shift${st.shift ? ' ★' : ''}`, false)}${chk('infieldIn', ui.infieldIn, `In${st.infieldIn ? ' ★' : ''}`, !b3)}</div>${seg('depth', ui.depth, [['shallow', 'Shallow'], ['normal', 'Normal'], ['deep', 'Deep']], {}, st.depth)}</div>`;
  }
  return `${banner}${body}${hint ? `<div class="hint">${hint}</div>` : ''}`;
}

function autoPanel() {
  const r = app.settings.pause, on = [r.tired && 'a tired pitcher', r.scoring && 'scoring chances', r.late && 'late &amp; close', r.loaded && 'bases loaded'].filter(Boolean);
  return `<div class="group"><span class="label">Auto-play speed</span>${seg('speed', app.settings.speed, [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']])}</div>
    <div class="group"><span class="label">Autopilot</span><div class="row"><button class="sm" data-act="atbat">Auto at-bat</button><button class="sm" data-act="autohalf">Rest of half-inning</button><button class="sm" data-act="autogame">Finish game</button></div></div>
    <div class="hint">▶ Auto lets the AI manage while you watch. It pauses for ${on.join(', ') || 'nothing (all pause rules are off)'}. Change this in More.</div>`;
}

function matchupPanel() {
  const { locs } = curLocs();
  return `${vsStrip()}<div style="margin-top:10px">${wpCard()}</div>${locs.length ? `<h3>This at-bat</h3><div class="pitches">${pitchRows(locs)}</div>` : ''}`;
}

function bench() {
  const g = app.g, t = mine(), bats = userBats(), vs = opp().pitcher;
  const benchRows = t.bench.map((p) => {
    const act = [];
    if (!g.over) {
      if (bats) {
        act.push(`<button class="sm" data-act="ph" data-id="${p.id}">Pinch hit</button>`);
        g.bases.forEach((r, i) => { if (r) act.push(`<button class="sm" data-act="pr" data-base="${i}" data-id="${p.id}">Run ${['1st', '2nd', '3rd'][i]}</button>`); });
      } else act.push(`<button class="sm" data-act="dsubopen" data-id="${p.id}">Replace fielder</button>`);
    }
    return `<tr><td>${pl(p, vs)}</td><td>${p.pos}</td><td><small>${p.hand} · ${compact(p)}</small></td><td>${act.join(' ')}</td></tr>`;
  }).join('');
  const penRows = t.bullpen.map((p) => `<tr><td>${pl(p)}${roleTag(t, p)}</td><td>${p.pos}</td><td><small>${p.hand}HP · ${compact(p)} · ${restLabel(p)}</small></td><td>${!bats && !g.over ? `<button class="sm" data-act="pitch" data-id="${p.id}">Bring in</button>` : ''}</td></tr>`).join('');
  const lineup = t.lineup.map((p, i) => `<tr class="${bats && i === t.batIdx ? 'me' : ''}"><td>${i + 1}. ${pl(p, vs)}</td><td>${p.pos}</td><td><small>DEF ${p.def ?? 55} · ${batLine(p.stats)}</small></td></tr>`).join('');
  return `<h3 style="margin-top:0">Bench <small>${bats ? '(pinch hit / run)' : '(defensive replacements)'}</small></h3><div class="scroll"><table>${benchRows || '<tr><td>Empty</td></tr>'}</table></div>
    <h3>Bullpen ${bats ? '<small>(change pitchers when you take the field)</small>' : ''}</h3><div class="scroll"><table>${penRows || '<tr><td>Empty</td></tr>'}</table></div>
    ${fold('club_lineup', 'Lineup &amp; today', `<div class="scroll"><table>${lineup}</table></div>`)}`;
}

function boxScore() {
  const g = app.g;
  const one = (t) => {
    const bats = [...t.lineup, ...t.usedBatters.filter((b) => !t.lineup.includes(b))];
    const ps = [...t.usedPitchers, t.pitcher];
    return `<h3>${t.name}</h3><table>${bats.map((p) => `<tr><td>${pl(p)}</td><td>${p.pos}</td><td><small>${batLine(p.stats)}</small></td></tr>`).join('')}</table>
      <table style="margin-top:8px">${ps.map((p) => `<tr><td>${pl(p)}</td><td><small>${pitLine(p.stats)}</small></td></tr>`).join('')}</table>`;
  };
  return `${lineScore()}${one(g.away)}${one(g.home)}`;
}

function logPanel() {
  const g = app.g, fresh = g.log.length - (g.mark ?? g.log.length);
  const lines = [...g.log].slice(-80).reverse();
  return `<div class="log">${lines.map((l, i) => `<p class="${l.startsWith('—') ? 'sep' : i < fresh ? 'new' : ''}">${l}</p>`).join('')}</div>`;
}

function computeSugg() {
  const g = app.g;
  app.sugg = [];
  if ((!app.settings.coach && !app.tut) || g.over || app.auto) return;
  app.sugg = advise(g, mine(), ui);
}
function coachLine() {
  const x = app.sugg[0];
  if (!x) return '';
  return `<div class="coachline"><span class="ic">${x.icon}</span><div class="tx"><b>${x.title}</b></div><button class="sm primary" data-act="sugg" data-i="0">Do it</button></div>`;
}
function coachPanel() {
  if (!app.settings.coach && !app.tut) return '<small>The coach is off. Turn it on in More → Display.</small>';
  const rows = app.sugg.map((x, i) => `<div class="sg"><span class="ic">${x.icon}</span><div class="tx"><b>${x.title}</b><small>${x.why}</small></div><button class="sm ${i ? '' : 'primary'}" data-act="sugg" data-i="${i}">Do it</button></div>`).join('');
  return rows || '<small>Nothing to change right now — play on.</small>';
}

const GAME_TABS = [['orders', '🎛️', 'Orders'], ['coach', '🧑‍🏫', 'Coach'], ['matchup', '⚔️', 'Matchup'], ['intel', '🔎', 'Intel'], ['auto', '▶️', 'Auto'], ['club', '👥', 'Club'], ['plays', '📜', 'Log'], ['box', '📊', 'Box']];

function renderGame() {
  if (!app.g) {
    const ng = app.lg.phase === 'done' ? null : L.nextGame(app.lg);
    const today = app.daily.date === todayKey();
    return `<section class="empty"><h2>No game in progress</h2>
      <p>${ng ? `Next up: <b>${ng.away.nick} at ${ng.home.nick}</b><br>${ng.label}` : app.lg.phase === 'done' ? 'The season is over — see the Season tab for the off-season.' : 'Your team has no game today.'}</p>
      <div class="row">${ng ? '<button class="primary" data-act="playnext">Manage next game</button>' : ''}<button data-act="exhibit">Exhibition game</button><button data-act="daily" ${today ? 'disabled' : ''}>${today ? 'Daily done ✔' : 'Daily challenge'}</button></div>
      <p class="mute">Season games count in the standings. Exhibition games are one-offs you can share.</p></section>`;
  }
  if (!GAME_TABS.some((t) => t[0] === ui.sub)) ui.sub = 'orders';
  computeSugg();
  const badge = app.sugg.length ? `<i class="bdg">${app.sugg.length}</i>` : '';
  const tabs = `<div class="ptabs">${GAME_TABS.map(([k, ic, t]) => `<button data-act="sub" data-sub="${k}" class="${ui.sub === k ? 'on' : ''}">${ic} ${t}${k === 'coach' ? badge : ''}</button>`).join('')}</div>`;
  const panels = { orders: ordersPanel, coach: coachPanel, matchup: matchupPanel, intel: () => renderIntel(bbGameIntel(app.g, mine())), auto: autoPanel, club: bench, plays: logPanel, box: boxScore };
  return `${scorebug()}${app.tut ? tutCard() : ''}<section class="stagesec">${nowCard()}</section>${coachLine()}${tabs}<section class="panel ${battingTeam(app.g) === mine() ? 'off' : 'def'}">${panels[ui.sub]()}</section>`;
}

// ---------- rendering: lineup ----------
function renderLineup() {
  const t = L.userTeam(app.lg);
  const note = app.g && app.kind === 'season' ? '<p class="hint">A game is in progress — changes apply to your next game.</p>' : '';
  const row = (p, i, kind, extra = '') => `<tr class="${ui.sel === `${kind}${i}` ? 'sel' : ''} ${p.inj > 0 ? 'dim' : ''}" data-act="swap" data-kind="${kind}" data-i="${i}"><td>${extra}${p.name}${tagHtml(p)}</td><td>${p.pos}</td><td><small>${p.hand} · ${ratings(p)}</small></td></tr>`;
  const bat = t.batters.map((p, i) => (i === 9 ? '<tr><th colspan="3">Bench</th></tr>' : '') + row(p, i, 'b', i < 9 ? `${i + 1}. ` : '')).join('');
  const sp = t.sp.map((p, i) => row(p, i, 's', i === t.rotIdx % 5 ? '▶ ' : `${i + 1}. `).replace('</tr>', `<td><small>${restLabel(p)}</small></td></tr>`)).join('');
  const rp = t.rp.map((p) => `<tr class="${p.inj > 0 ? 'dim' : ''}"><td>${p.name}${tagHtml(p)}${roleTag(t, p)}</td><td>${p.pos}</td><td><small>${p.hand} · ${ratings(p)} · ${restLabel(p)}</small></td></tr>`).join('');
  const nextOpp = (() => { const ng = app.lg.phase === 'done' ? null : L.nextGame(app.lg); return ng ? (ng.home === t ? ng.away : ng.home) : null; })();
  const report = fold('l_rep', '🔎 Your team report', renderReport(bbReport(t, { vs: nextOpp ? nextOpp.sp[nextOpp.rotIdx % 5] : null }), { goodT: '💪 Strengths', badT: '⚠️ Weaknesses to cover' }), true);
  return `${report}<section><h2>Batting order</h2>${note}<div class="row"><button data-act="autolineup">✨ Auto-set lineup &amp; rotation</button>${chk('autoLineup', app.settings.autoLineup, 'Do this before every game', false)}</div>
    <p class="hint">Tap a player, then tap another to swap them. The first nine bat in order; hurt players are replaced automatically.</p><div class="scroll"><table>${bat}</table></div></section>
    <div class="cols"><section><h2>Starting rotation</h2><p class="hint">▶ is your next starter. Tap two to swap.</p><div class="scroll"><table>${sp}</table></div></section>
    ${fold('l_pen', 'Bullpen', `<p class="hint">The closer protects 1–3 run leads in the 9th; the setup man covers the 8th. Relievers used yesterday are tired today.</p><div class="scroll"><table>${rp}</table></div>`)}</div>`;
}

// ---------- rendering: season & off-season ----------
function payBar(t) {
  const pay = L.payroll(t), pct = Math.min(100, (pay / t.budget) * 100);
  return `<div class="row" style="justify-content:space-between;margin-top:0"><h2 style="margin:0">Payroll</h2><b>${money(pay)} <small>of ${money(t.budget)}</small></b></div><div class="meter ${pct > 97 ? 'hot' : ''}"><i style="width:${pct}%"></i></div>`;
}
const compact = (p) => (p.type === 'bat' ? `${p.contact}/${p.power}/${p.eye}/${p.speed}/${p.def ?? 55}` : `${p.stuff}/${p.control}${p.role === 'SP' ? `/${Math.round(p.stamina)}` : ''}`);
const young = (p) => (p.age <= 22 ? '<span class="tag pro">prospect</span>' : '');

function renderOffseason() {
  const lg = app.lg, t = L.userTeam(lg), v = app.off;
  const head = `<section>${payBar(t)}<div class="row">
      <button class="${v === 'fa' ? 'on' : ''}" data-act="off" data-v="fa">Free agents</button><button class="${v === 'trade' ? 'on' : ''}" data-act="off" data-v="trade">Trades</button>
      <button data-act="autooff">Auto off-season</button></div><p class="hint">Hitters: contact/power/eye/speed/defense. Pitchers: stuff/control/stamina.</p></section>`;
  if (v === 'fa') {
    const kinds = [['bat', 'Hitters'], ['sp', 'Starters'], ['rp', 'Relievers']];
    const sections = kinds.map(([k, label]) => {
      const rows = lg.fa.filter((p) => L.kindOf(p) === k).sort((a, b) => L.value(b) - L.value(a)).map((p) => `<tr><td>${pl(p)}${young(p)}</td><td>${p.pos}</td><td>${p.age}</td><td><small>${compact(p)}</small></td><td>${money(L.salary(p))}</td><td><button class="sm" data-act="signopen" data-uid="${p.uid}">Sign</button></td></tr>`).join('');
      return `<h3>${label}</h3><div class="scroll"><table><tr><th></th><th>Pos</th><th>Age</th><th>Ratings</th><th>Salary</th><th></th></tr>${rows || '<tr><td>None</td></tr>'}</table></div>`;
    }).join('');
    return head + `<section><h2>Free-agent market</h2><p class="hint">Signing a player means releasing one at the same position group; you must stay under your budget. Young prospects are cheap and improve each year.</p>${sections}</section>`;
  }
  if (v === 'trade') {
    const others = lg.teams.map((x, i) => [i, x]).filter(([, x]) => x !== t);
    const other = lg.teams[ui.tradeTeam] && lg.teams[ui.tradeTeam] !== t ? lg.teams[ui.tradeTeam] : others[0][1];
    const k = ui.tradeKind;
    const list = (team, sel, who) => L.roster(team).filter((p) => L.kindOf(p) === k).sort((a, b) => L.value(b) - L.value(a)).map((p) => `<tr class="${sel === p.uid ? 'sel' : ''}" data-act="tsel" data-who="${who}" data-uid="${p.uid}"><td>${p.name}${tagHtml(p)}</td><td>${p.age}</td><td><small>${compact(p)}</small></td><td>${money(L.salary(p))}</td></tr>`).join('');
    return head + `<section><h2>Trade block</h2>
      <div class="group"><span class="label">Partner</span>${seg('tradeTeam', String(lg.teams.indexOf(other)), others.map(([i, x]) => [String(i), x.nick]))}</div>
      <div class="group"><span class="label">Position group</span>${seg('tradeKind', k, [['bat', 'Hitters'], ['sp', 'Starters'], ['rp', 'Relievers']])}</div>
      <div class="cols"><div><h3>Your players</h3><div class="scroll"><table>${list(t, ui.tMine, 'mine')}</table></div></div><div><h3>${other.nick} (${money(L.payroll(other))}/${money(other.budget)})</h3><div class="scroll"><table>${list(other, ui.tTheirs, 'theirs')}</table></div></div></div>
      <div class="row"><button class="primary" data-act="tradeprop" ${ui.tMine && ui.tTheirs ? '' : 'disabled'}>Propose trade</button></div>
      <p class="hint">Trades must be like for like, and the other club wants to come out ahead on value (age and ratings). Both payrolls must fit under budget.</p></section>`;
  }
  return head;
}

function todoCard() {
  const btn = (a) => (a ? (a.act === 'off' ? `<button class="sm" data-act="off" data-v="${a.v}">${a.label}</button>` : `<button class="sm" data-act="${a.act}">${a.label}</button>`) : '');
  return `<section class="coach"><h2>📝 Manager's to-do</h2>${todo(app.lg).map((i) => `<div class="sg"><span class="ic">${i.icon}</span><div class="tx"><small style="color:var(--ink)">${i.text}</small></div>${btn(i.act)}</div>`).join('')}</section>`;
}

function renderSeason() {
  const lg = app.lg, t = L.userTeam(lg), st = L.standings(lg), rank = st.indexOf(t) + 1;
  const ng = lg.phase === 'done' ? null : L.nextGame(lg);
  let status, scout = '';
  if (lg.phase === 'done') {
    status = `<div class="banner">${lg.champion === lg.userId ? '🏆 You are the champions!' : `${lg.teams[lg.champion].name} won the title.`}</div>
      <div class="row" style="justify-content:center"><button class="primary" data-act="newseason">Start season ${lg.season + 1}</button></div>
      <p class="hint" style="text-align:center">Sign free agents or make trades first — the other clubs will do the same when the new season starts.</p>`;
  } else if (app.g && app.kind === 'season') {
    status = `<p>Game in progress.</p><div class="row"><button class="primary" data-act="resume">Resume game</button></div>`;
  } else if (ng) {
    const home = ng.home === t;
    scout = fold('scout', `🔎 Scouting: ${(home ? ng.away : ng.home).nick}`, renderReport(bbReport(home ? ng.away : ng.home, { asOpp: true, vs: t.sp[t.rotIdx % 5] }), { goodT: '🛡️ Their strengths — watch out', badT: '🎯 Their weaknesses — attack these' }), true);
    status = `<p><b>${ng.label}</b><br>${home ? 'vs' : '@'} <b>${(home ? ng.away : ng.home).name}</b> <small>(${home ? 'home' : 'away'})</small></p>
      <div class="row"><button class="primary" data-act="playnext">Manage game</button><button data-act="simgame">Sim game</button><button class="ghost" data-act="simend">Sim to end of season</button></div>`;
  } else {
    status = `<p>${L.userEliminated(lg) ? 'You are out of the playoffs.' : 'Waiting on the other series.'}</p><div class="row"><button class="primary" data-act="advance">Advance a day</button><button class="ghost" data-act="simend">Sim to end of season</button></div>`;
  }
  const rows = st.map((x, i) => `<tr class="${x === t ? 'me' : ''} ${i === 3 ? 'cut' : ''}"><td>${i + 1}. ${x.name}</td><td>${x.w}</td><td>${x.l}</td><td>${x.rs - x.ra > 0 ? '+' : ''}${x.rs - x.ra}</td></tr>`).join('');
  let bracket = '';
  if (lg.playoffs) {
    const sr = (s, label) => `<tr><td>${label}</td><td>${lg.teams[s.a].nick} ${s.wa}</td><td>${lg.teams[s.b].nick} ${s.wb}</td><td>${s.done ? '✔' : ''}</td></tr>`;
    bracket = `<section><h2>Playoffs (best of 3)</h2><table>${lg.playoffs.semis.map((s, i) => sr(s, `Semi ${i + 1}`)).join('')}${lg.playoffs.final ? sr(lg.playoffs.final, 'Final') : ''}</table></section>`;
  }
  const res = lg.results.slice(0, 8).map((r) => `<tr><td>${r.away}</td><td>${r.ar}</td><td>${r.home}</td><td>${r.hr}</td></tr>`).join('');
  const hist = lg.history.length ? fold('history', 'History', `<div class="scroll"><table><tr><th>Season</th><th>Champion</th><th>You</th><th></th></tr>${[...lg.history].reverse().map((h) => `<tr><td>${h.season}</td><td>${h.champion}</td><td>${h.w}-${h.l}</td><td><small>${h.result}</small></td></tr>`).join('')}</table></div>`) : '';
  return `<section><h2>Season ${lg.season} · ${t.w}-${t.l} · ${lg.phase === 'regular' ? `${rank}${['st', 'nd', 'rd'][rank - 1] || 'th'} place` : lg.phase === 'playoffs' ? 'playoffs' : 'complete'}</h2>${status}</section>
    ${scout}${todoCard()}${lg.phase === 'done' ? renderOffseason() : ''}${bracket}
    ${fold('standings', 'Standings <small>(top 4 make the playoffs)</small>', `<div class="scroll"><table><tr><th></th><th>W</th><th>L</th><th>+/-</th></tr>${rows}</table></div>`, true)}
    ${fold('results', 'Results &amp; news', `<div class="scroll"><table>${res || '<tr><td>No games yet</td></tr>'}</table></div><div class="news" style="margin-top:8px">${lg.news.slice(0, 8).map((n) => `<p style="margin:3px 0">${n}</p>`).join('') || 'Quiet so far.'}</div>`)}
    ${hist}`;
}

// ---------- rendering: stats ----------
function renderStats() {
  const lg = app.lg, Lead = L.leaders(lg), t = L.userTeam(lg);
  const block = (title, rows) => `<div><h3>${title}</h3><table>${rows.map((x) => `<tr><td><span class="player" data-act="card" data-uid="${x.p.uid}">${x.p.name}</span> <small>${abbr(x.t)}</small></td><td><b>${x.v}</b></td></tr>`).join('') || '<tr><td>—</td></tr>'}</table></div>`;
  const bat = t.batters.map((p) => `<tr><td>${pl(p)}</td><td>${p.season.g}</td><td>${avg(p.season)}</td><td>${p.season.hr}</td><td>${p.season.rbi}</td><td>${p.season.bb}</td><td>${p.season.k}</td></tr>`).join('');
  const pit = [...t.sp, ...t.rp].map((p) => `<tr><td>${pl(p)}</td><td>${p.season.g}</td><td>${ip(p.season)}</td><td>${ra9(p.season)}</td><td>${p.season.k}</td><td>${p.season.bb}</td></tr>`).join('');
  return `${fold('leaders', 'League leaders', `<div class="cols tight">${block('Batting avg', Lead.AVG)}${block('Home runs', Lead.HR)}${block('RBI', Lead.RBI)}${block('Runs allowed / 9', Lead.RA9)}${block('Strikeouts (P)', Lead.K)}</div>`, true)}
    ${fold('bat', `${t.name} — batting`, `<div class="scroll"><table><tr><th></th><th>G</th><th>AVG</th><th>HR</th><th>RBI</th><th>BB</th><th>K</th></tr>${bat}</table></div>`)}
    ${fold('pit', `${t.name} — pitching`, `<div class="scroll"><table><tr><th></th><th>G</th><th>IP</th><th>RA9</th><th>K</th><th>BB</th></tr>${pit}</table></div>`)}`;
}

// ---------- rendering: more ----------
function renderMore() {
  if (isFb()) return renderMoreFb();
  const s = app.settings, g = app.g, d = app.daily;
  const exSeed = g && app.kind === 'exhibit' && !g.daily ? g.seed : null;
  const today = d.date === todayKey();
  const dailyTxt = today ? `Today: ${d.won ? 'won' : 'lost'} by ${Math.abs(d.rd)} · ` : 'Same game for everyone today, vs an All-Star manager · ';
  return `${fold('m_daily', 'Daily challenge', `<p class="mute">${dailyTxt}streak ${d.streak || 0} (best ${d.best || 0})</p>
      <div class="row"><button class="primary" data-act="daily" ${today ? 'disabled' : ''}>${today ? 'Come back tomorrow' : 'Play today’s game'}</button></div>`, true)}
    ${fold('m_mgr', 'Manager &amp; auto mode', `
      <div class="group"><span class="label">Opposing manager</span>${seg('level', String(s.level), [['0', 'Rookie'], ['1', 'Pro'], ['2', 'All-Star']])}<div class="hint">Applies to your next game. Rookies leave tired arms in; All-Stars play the platoons and mixes.</div></div>
      <div class="group"><span class="label">Auto-play speed</span>${seg('speed', s.speed, [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']])}</div>
      <div class="group"><span class="label">Pause auto mode for…</span><div>${chk('pause:tired', s.pause.tired, 'Tired pitcher', false)}${chk('pause:scoring', s.pause.scoring, 'Scoring chances', false)}${chk('pause:late', s.pause.late, 'Late &amp; close', false)}${chk('pause:loaded', s.pause.loaded, 'Bases loaded', false)}</div></div>
      <div class="group">${chk('autoNext', s.autoNext, 'Keep going into the next season game', false)}${chk('autoLineup', s.autoLineup, 'Auto-set lineup before each game', false)}</div>`)}
    ${fold('m_disp', 'Display &amp; accessibility', `
      <div class="group"><span class="label">Theme</span>${seg('theme', s.theme, [['auto', 'Auto'], ['dark', 'Dark'], ['light', 'Light']])}</div>
      <div class="group"><span class="label">Text size</span>${seg('text', String(s.text), [['0', 'Normal'], ['1', 'Large'], ['2', 'Larger']])}</div>
      <div class="group"><span class="label">Field animations</span>${seg('visuals', s.visuals, [['full', 'Full'], ['quick', 'Quick'], ['off', 'Off']])}</div>
      <div class="group">${chk('coach', s.coach, 'Show the coach’s suggestions', false)}${chk('cvd', s.cvd, 'Colour-blind-safe pitch colours', false)}${chk('sound', s.sound, 'Sound effects', false)}${chk('haptics', s.haptics, 'Haptics', false)}</div>`)}
    ${fold('m_exh', 'Exhibition', `<p class="mute">A one-off game with a random matchup. Share the link and a friend gets the same two teams to beat your score.</p>
      <div class="row"><button data-act="exhibit">New exhibition game</button>${exSeed ? '<button data-act="share">Share this game</button>' : ''}</div>${exSeed ? `<small>Game code #${exSeed}</small>` : ''}`)}
    ${fold('m_help', 'Help &amp; data', `<div class="row"><button data-act="guide">📖 How to play</button><button data-act="starttut">🎓 Tutorial</button><button data-act="title">🏠 Title screen</button><button class="ghost" data-act="reset">Reset all progress</button></div>`, true)}`;
}

// ---------- shell ----------
function renderBar() {
  const g = app.g, bar = $('bar');
  let h = '';
  if (app.tab === 'game' && g) {
    if (g.over) h = '<button class="primary" data-act="finish">Finish game</button>';
    else h = app.auto ? '<button class="primary" data-act="autostop">⏸ Pause auto</button>' : '<button data-act="decision">⏭ Decision</button><button data-act="autostart">▶ Auto</button><button class="primary" data-act="pitch1">Next pitch ▶</button>';
  }
  bar.innerHTML = h;
  document.body.classList.toggle('nobar', !h);
}

const isFb = () => app.settings.sport === 'football';

function renderFb() {
  const t = app.tab;
  $('top').innerHTML = FB.topHtml();
  for (const b of document.querySelectorAll('#nav button')) {
    b.classList.toggle('on', b.dataset.tab === t);
    if (b.dataset.tab === 'game') b.querySelector('i').textContent = '🏈';
    if (b.dataset.tab === 'lineup') b.querySelector('span').textContent = 'Roster';
  }
  $('view').innerHTML = t === 'more' ? renderMoreFb() : FB.render(t);
  document.body.classList.toggle('ingame', t === 'game' && FB.hasGame());
  const bar = t === 'game' ? FB.renderBar() : '';
  $('bar').innerHTML = bar; document.body.classList.toggle('nobar', !bar);
  FB.mount(); renderScreen();
}

function renderMoreFb() {
  const s = app.settings;
  return `${fold('m_mgr', 'Coach &amp; auto mode', `
      <div class="group"><span class="label">Opposing coach</span>${seg('level', String(s.level), [['0', 'Rookie'], ['1', 'Pro'], ['2', 'All-Star']])}<div class="hint">Applies to your next game. Rookies punt too much and never go for two; All-Stars use analytics on 4th down.</div></div>
      <div class="group"><span class="label">Auto-play speed</span>${seg('speed', s.speed, [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']])}</div>
      <div class="group"><span class="label">Pause auto mode for…</span><div>${chk('fbpause:fourth', s.fbPause.fourth, '4th downs', false)}${chk('fbpause:redzone', s.fbPause.redzone, 'Red zone', false)}${chk('fbpause:twominute', s.fbPause.twominute, 'Two-minute drill', false)}${chk('fbpause:score', s.fbPause.score, 'After touchdowns', false)}</div></div>`, true)}
    ${fold('m_disp', 'Display &amp; accessibility', `
      <div class="group"><span class="label">Theme</span>${seg('theme', s.theme, [['auto', 'Auto'], ['dark', 'Dark'], ['light', 'Light']])}</div>
      <div class="group"><span class="label">Text size</span>${seg('text', String(s.text), [['0', 'Normal'], ['1', 'Large'], ['2', 'Larger']])}</div>
      <div class="group"><span class="label">Field animations</span>${seg('visuals', s.visuals, [['full', 'Full'], ['quick', 'Quick'], ['off', 'Off']])}</div>
      <div class="group">${chk('coach', s.coach, 'Show the coach’s suggestions', false)}${chk('sound', s.sound, 'Sound effects', false)}${chk('haptics', s.haptics, 'Haptics', false)}</div>`)}
    ${fold('m_exh', 'Exhibition', `<p class="mute">A one-off game with a random matchup.</p><div class="row"><button data-act="fbexhibit">New exhibition game</button></div>`)}
    ${fold('m_help', 'Help &amp; data', `<div class="row"><button data-act="guide">📖 How to play</button><button data-act="starttut">🎓 Tutorial</button><button data-act="title">🏠 Title screen</button><button class="ghost" data-act="fbreset">Reset football progress</button></div>`, true)}`;
}

function render() {
  if (isFb()) { renderFb(); return; }
  const t = L.userTeam(app.lg), st = L.standings(app.lg), rank = st.indexOf(t) + 1;
  $('top').innerHTML = `<h1 data-act="title">SKIP<b>PER</b></h1><small>${t.name} · ${t.w}-${t.l}${app.lg.phase === 'regular' ? ` · ${rank}${['st', 'nd', 'rd'][rank - 1] || 'th'}` : app.lg.phase === 'playoffs' ? ' · playoffs' : ''}</small>`;
  for (const b of document.querySelectorAll('#nav button')) {
    b.classList.toggle('on', b.dataset.tab === app.tab);
    if (b.dataset.tab === 'game') b.querySelector('i').textContent = '⚾';
    if (b.dataset.tab === 'lineup') b.querySelector('span').textContent = 'Lineup';
  }
  const views = { game: renderGame, lineup: renderLineup, season: renderSeason, stats: renderStats, more: renderMore };
  $('view').innerHTML = views[app.tab]();
  const slot = $('camslot');
  if (slot) slot.appendChild(cam.svg);
  document.body.classList.toggle('ingame', app.tab === 'game' && !!app.g);
  renderBar();
  renderScreen();
  applySpot();
}

// ---------- title / intro / guide screens ----------
function renderScreen() {
  const box = $('screen');
  box.className = app.screen === 'start' || app.screen === 'sport' ? 'dark' : '';
  if (!app.screen) { box.innerHTML = ''; return; }
  const t = L.userTeam(app.lg);
  if (app.screen === 'intro') box.innerHTML = introHtml(app.introStep, { city: t.city, nick: t.nick });
  else if (app.screen === 'guide') box.innerHTML = guideHtml(0, isFb() ? 'fb' : 'bb');
  else if (app.screen === 'sport') {
    const inSeason = app.lg.day > 0 || app.lg.history.length > 0 || app.lg.phase !== 'regular';
    box.innerHTML = sportHtml({ bb: app.g ? 'Game in progress' : inSeason ? `Season ${app.lg.season} · ${t.w}-${t.l}` : 'New season', fb: FB.status().short });
  } else if (isFb()) {
    const st = FB.status();
    box.innerHTML = startHtml({ cont: st.cont, label: st.cont ? st.label : 'Start season', hasDaily: false, dailyDone: false, fb: true });
  } else {
    const inSeason = app.lg.day > 0 || app.lg.history.length > 0 || app.lg.phase !== 'regular';
    const label = app.g ? `${app.kind === 'tutorial' ? 'Tutorial' : app.kind === 'exhibit' ? 'Exhibition' : `Season ${app.lg.season}`} · game in progress` : inSeason ? `Season ${app.lg.season} · ${t.w}-${t.l}` : 'Start season';
    box.innerHTML = startHtml({ cont: !!app.g || inSeason, label: app.g || inSeason ? label : 'Start season', hasDaily: true, dailyDone: app.daily.date === todayKey(), fb: false });
  }
}
function closeScreen() { app.screen = app.prevScreen && app.screen === 'guide' ? app.prevScreen : null; app.prevScreen = null; render(); }
function openGuide() { app.prevScreen = app.screen; app.screen = 'guide'; render(); }
function finishIntro(withTut) {
  const city = ($('clubCity') || {}).value, nick = ($('clubNick') || {}).value, t = L.userTeam(app.lg);
  if (city && city.trim()) t.city = city.trim();
  if (nick && nick.trim()) t.nick = nick.trim();
  t.name = `${t.city} ${t.nick}`;
  app.settings.introSeen = true; persist();
  if (withTut) { app.settings.sport = 'baseball'; app.screen = null; startTutorial(); } else { app.screen = 'sport'; render(); }
}

// ---------- tutorial ----------
const tutStep = () => TUTORIAL[app.tut.step];
function startTutorial() {
  if (app.kind !== 'tutorial') { app.savedG = app.g; app.savedKind = app.kind; }
  setAuto(false, true);
  const g = newGame(777, 1);
  g.user = g.away; app.g = g; app.kind = 'tutorial'; app.tab = 'game'; app.screen = null; app.prevScreen = null;
  resetCalls(); cam.update(g);
  g.log.push('Practice game — nothing here counts. You manage the visitors.');
  app.tut = { step: 0, pitches: 0, stepPitches: 0, stolen: false, autoUsed: false, changed: false, advancing: false };
  tutEnter(); render();
}
function exitTutorial(done, silent = false) {
  setAuto(false, true);
  if (done) app.settings.tutDone = true;
  app.g = app.savedG || null; app.kind = app.savedKind || null; app.savedG = null; app.savedKind = null; app.tut = null;
  if (app.g) cam.update(app.g);
  if (!silent) { app.tab = done ? 'season' : 'game'; persist(); render(); }
}
function runScene(name) {
  const g = app.g, bt = battingTeam(g);
  if (name === 'runner') {
    const r = [...bt.lineup].filter((p) => p !== currentBatter(g)).sort((a, b) => b.speed - a.speed)[0];
    r.speed = Math.max(r.speed, 86); g.bases = [r, null, null]; g.outs = 0;
    g.pa = { balls: 0, strikes: 0, pitches: 0, seq: [], locs: [] }; cam.update(g);
  } else if (name === 'gassed') {
    const p = fieldingTeam(g).pitcher; p.stats.pitches = Math.round(p.stamina * 1.05);
  }
}
function tutEnter() { const s = tutStep(); app.tut.stepPitches = 0; app.tut.advancing = false; if (s.spot && s.spot.includes('data-set')) ui.sub = 'orders'; if (s.scene) runScene(s.scene); }
function tutNext() {
  if (!app.tut) return;
  app.tut.step++;
  if (app.tut.step >= TUTORIAL.length) { exitTutorial(true); return; }
  tutEnter(); render();
}
function tutCheck() {
  if (!app.tut || app.tut.advancing) return;
  const s = tutStep();
  if (s.id === 'steal' && app.tut.stepPitches >= 3) app.tut.stolen = true;
  if (!s.manual && s.ok && s.ok({ g: app.g, app, ui, tut: app.tut })) {
    app.tut.advancing = true;
    setTimeout(() => { if (app.tut && tutStep() === s) tutNext(); }, 500);
  }
}
function tutCard() {
  const s = tutStep(), n = TUTORIAL.length, i = app.tut.step;
  const btn = s.manual ? `<button class="primary" data-act="tutnext">${s.last ? 'Start my season' : 'Continue'}</button>`
    : s.button ? `<button class="primary" data-act="${s.button.act}">${s.button.label}</button>` : '<small class="mute">Do the highlighted action to continue</small>';
  return `<section class="tut"><h2>Tutorial · ${i + 1}/${n} — ${s.title}</h2><p>${s.text}</p><div class="row">${btn}${s.last ? '<button class="sm" data-act="tutexit">Keep practicing</button>' : '<button class="ghost sm" data-act="tutnext">Skip step</button><button class="ghost sm" data-act="tutexit">Exit</button>'}</div></section>`;
}
function applySpot() {
  for (const e of document.querySelectorAll('.spot')) e.classList.remove('spot');
  if (!app.tut || app.tab !== 'game') return;
  const sel = tutStep().spot;
  if (!sel) return;
  const e = document.querySelector(sel);
  if (e) (e.closest('label') || e).classList.add('spot');
}

// ---------- coach suggestions ----------
function ordersChanged() {
  const g = app.g;
  if (!g || g.over || userBats()) return;
  g.lastDef = { ...(g.lastDef || {}), shift: ui.shift, depth: ui.depth, infieldIn: ui.infieldIn && !!g.bases[2] };
  cam.update(g);
}
function applySugg(i) {
  const x = app.sugg[i], g = app.g;
  if (!x || !g) return;
  const a = x.apply;
  if (a.ui) { Object.assign(ui, a.ui); ordersChanged(); }
  if (a.sub === 'ph') pinchHit(g, mine(), a.id);
  else if (a.sub === 'pr') pinchRun(g, mine(), a.base, a.id);
  else if (a.sub === 'pitch') { changePitcher(g, mine(), a.id); if (app.tut) app.tut.changed = true; }
  else if (a.sub === 'dsub') defSub(g, mine(), a.id, a.i);
  if (a.sub) cam.update(g);
  toast(`Coach: ${x.title}`); persist(); render(); tutCheck();
}

// ---------- dialogs ----------
function showCard(uid) {
  const f = findPlayer(uid); if (!f) return;
  const { p, t } = f, s = p.season;
  const bars = (items) => `<div class="bars">${items.map(([k, v]) => `<span class="label">${k}</span><div class="meter ${v >= 70 ? 'good' : ''}"><i style="width:${v}%"></i></div><b>${v}</b>`).join('')}</div>`;
  const rb = p.type === 'bat' ? bars([['CON', p.contact], ['PWR', p.power], ['EYE', p.eye], ['SPD', p.speed], ['DEF', p.def ?? 55]]) : bars([['STF', p.stuff], ['CTL', p.control], ['STA', Math.min(100, Math.round(p.stamina))]]);
  const season = p.type === 'bat' ? `${avg(s)} AVG · ${s.hr} HR · ${s.rbi} RBI · ${s.bb} BB · ${s.k} K (${s.g} G)` : `${ip(s)} IP · ${ra9(s)} RA9 · ${s.k} K · ${s.bb} BB (${s.g} G)`;
  const today = p.stats && (p.type === 'bat' ? p.stats.ab + p.stats.bb > 0 : p.stats.pitches > 0) ? `<p><small>Today: ${p.type === 'bat' ? batLine(p.stats) : pitLine(p.stats)}</small></p>` : '';
  const extra = p.type === 'bat' ? `<p><small>${tiltLabel(p) || 'No big pitch-type weakness'}</small></p>` : `<h3>Arsenal</h3>${bars(repertoire(p).map((a) => [a.code, a.q]))}`;
  openDialog(`<h2 style="margin-top:0">${p.name}${tagHtml(p)}</h2>
    <p class="mute">${t ? t.name : 'Free agent'} · ${p.pos} · age ${p.age} · ${p.type === 'bat' ? 'bats' : 'throws'} ${p.hand}${p.type === 'pit' && t ? ` · ${restLabel(p)}` : ''} · ${money(L.salary(p))}</p>${rb}${extra}
    <p>Season: ${season}</p>${today}<div class="row" style="justify-content:flex-end"><button data-act="closecard">Close</button></div>`);
}

function openSign(uid) {
  const t = L.userTeam(app.lg), fa = app.lg.fa.find((p) => p.uid === uid); if (!fa) return;
  const arr = fa.type === 'bat' ? t.batters : fa.role === 'SP' ? t.sp : t.rp;
  const pay = L.payroll(t);
  const rows = arr.map((p) => { const np = Math.round((pay - L.salary(p) + L.salary(fa)) * 10) / 10, ok = np <= t.budget + 1e-9; return `<tr><td>${p.name}<br><small>${p.age} · ${compact(p)}</small></td><td>${money(L.salary(p))}</td><td style="color:var(--${ok ? 'green' : 'strike'})">${money(np)}</td><td><button class="sm" data-act="dosign" data-fa="${fa.uid}" data-rel="${p.uid}" ${ok ? '' : 'disabled'}>Release</button></td></tr>`; }).join('');
  openDialog(`<h2 style="margin-top:0">Sign ${fa.name}</h2><p class="mute">${fa.pos} · age ${fa.age} · ${compact(fa)} · ${money(L.salary(fa))}</p>
    <p class="hint">Who do you release to make room? Payroll must stay within ${money(t.budget)}.</p><table><tr><th></th><th>Salary</th><th>New payroll</th><th></th></tr>${rows}</table>
    <div class="row" style="justify-content:flex-end"><button data-act="closecard">Cancel</button></div>`);
}

function openDefSub(benchId) {
  const t = mine(), b = t.bench.find((p) => p.id === benchId); if (!b) return;
  const rows = t.lineup.map((p, i) => `<tr><td>${i + 1}. ${p.name}<br><small>${p.pos} · DEF ${p.def ?? 55} · CON ${p.contact}</small></td><td><button class="sm" data-act="dsub" data-id="${b.id}" data-i="${i}">Replace</button></td></tr>`).join('');
  openDialog(`<h2 style="margin-top:0">${b.name} <small>DEF ${b.def ?? 55} · CON ${b.contact}</small></h2><p class="hint">Who comes out? A glove-first swap protects a lead but weakens your bat.</p><table>${rows}</table><div class="row" style="justify-content:flex-end"><button data-act="closecard">Cancel</button></div>`);
}

// ---------- sharing ----------
function resultCanvas() {
  const g = app.g, c = document.createElement('canvas'); c.width = 900; c.height = 500;
  const x = c.getContext('2d');
  const grad = x.createLinearGradient(0, 0, 0, 500); grad.addColorStop(0, '#12306a'); grad.addColorStop(1, '#06142c');
  x.fillStyle = grad; x.fillRect(0, 0, 900, 500);
  x.fillStyle = '#fff'; x.font = '800 34px system-ui, sans-serif'; x.fillText('SKIP', 40, 64); x.fillStyle = '#d50032'; x.fillText('PER', 120, 64);
  const won = (g.winner === 'home') === (g.home === mine());
  x.fillStyle = won ? '#3ddc84' : '#ff3b5c'; x.font = '800 30px system-ui, sans-serif'; x.textAlign = 'right'; x.fillText(won ? 'VICTORY' : 'DEFEAT', 860, 64);
  x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = '800 120px system-ui, sans-serif';
  x.fillText(String(g.away.runs), 270, 250); x.fillText(String(g.home.runs), 630, 250);
  x.font = '700 30px system-ui, sans-serif'; x.fillText(g.away.name, 270, 300); x.fillText(g.home.name, 630, 300);
  x.fillStyle = '#8fa5c8'; x.font = '500 24px system-ui, sans-serif'; x.fillText('at', 450, 240);
  x.textAlign = 'left'; x.fillStyle = '#8fa5c8'; x.font = '500 22px system-ui, sans-serif'; x.fillText('Win probability', 40, 360);
  const pts = g.wp.map((w) => (g.home === mine() ? w : 1 - w)), n = Math.max(2, pts.length);
  x.strokeStyle = '#2a5aa0'; x.setLineDash([6, 6]); x.beginPath(); x.moveTo(40, 430); x.lineTo(860, 430); x.stroke(); x.setLineDash([]);
  x.strokeStyle = pts[pts.length - 1] >= 0.5 ? '#3ddc84' : '#ff3b5c'; x.lineWidth = 4; x.beginPath();
  pts.forEach((v, i) => { const px = 40 + (i / (n - 1)) * 820, py = 480 - v * 110; if (i) x.lineTo(px, py); else x.moveTo(px, py); });
  x.stroke();
  return c;
}
async function shareResult() {
  const g = app.g; if (!g) return;
  const you = mine() === g.home ? g.home.runs : g.away.runs, them = mine() === g.home ? g.away.runs : g.home.runs;
  const text = `${you > them ? 'Won' : 'Lost'} ${you}-${them} managing the ${mine().name} in Skipper.`;
  try {
    const blob = await new Promise((r) => resultCanvas().toBlob(r, 'image/png'));
    const file = new File([blob], 'skipper-result.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch { return; }
  try { await navigator.clipboard.writeText(text); toast('Result copied'); } catch { toast(text); }
}
async function shareLink() {
  const url = `${location.origin}${location.pathname}#seed=${app.g.seed}`;
  const text = `Beat my Skipper game #${app.g.seed}!`;
  try { if (navigator.share) { await navigator.share({ title: 'Skipper', text, url }); return; } } catch { return; }
  try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); }
}

// ---------- events ----------
function swapRows(kind, i) {
  const t = L.userTeam(app.lg), key = `${kind}${i}`;
  if (ui.sel === null) { ui.sel = key; render(); return; }
  if (ui.sel === key) { ui.sel = null; render(); return; }
  const k0 = ui.sel[0], i0 = Number(ui.sel.slice(1));
  if (k0 !== kind) { ui.sel = key; render(); return; }
  const arr = kind === 'b' ? t.batters : t.sp;
  [arr[i0], arr[i]] = [arr[i], arr[i0]];
  ui.sel = null; persist(); render();
}

document.addEventListener('click', (e) => {
  initHaptics();
  const tab = e.target.closest('[data-tab]');
  if (tab) { app.tab = tab.dataset.tab; ui.sel = null; render(); window.scrollTo(0, 0); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const g = app.g, id = Number(el.dataset.id), d = el.dataset;
  if (d.act.startsWith('fb') && FB.click(d.act, d)) return;
  switch (d.act) {
    case 'card': showCard(d.uid); return;
    case 'closecard': closeDialog(); return;
    case 'title': app.screen = 'start'; render(); return;
    case 'closescreen': closeScreen(); return;
    case 'guide': openGuide(); return;
    case 'startguide': openGuide(); return;
    case 'pickbaseball': app.settings.sport = 'baseball'; app.screen = 'start'; persist(); render(); return;
    case 'pickfootball': app.settings.sport = 'football'; app.screen = 'start'; persist(); render(); return;
    case 'changesport': app.screen = 'sport'; render(); return;
    case 'startcontinue': if (isFb()) { app.screen = null; app.tab = FB.hasGame() ? 'game' : (FB.status().cont ? 'season' : 'game'); render(); return; } app.screen = null; app.tab = app.g ? 'game' : (app.lg.day > 0 || app.lg.history.length ? 'season' : 'game'); render(); return;
    case 'startexhibit': if (isFb()) { app.screen = null; FB.newExhibition(); return; } startExhibition(); return;
    case 'startdaily': startDaily(); return;
    case 'starttut': if (isFb()) { FB.startTutorial(); return; } startTutorial(); return;
    case 'introopen': app.introStep = 0; app.screen = 'intro'; render(); return;
    case 'intro': app.introStep = Number(d.i); render(); return;
    case 'introskip': finishIntro(false); return;
    case 'introdone': finishIntro(!!d.tut); return;
    case 'sugg': applySugg(Number(d.i)); return;
    case 'tutnext': if (app.tut && tutStep().last) exitTutorial(true); else tutNext(); return;
    case 'tutexit': exitTutorial(false); return;
    case 'tutfield': if (app.tut && app.g) { autoHalf(app.g, [app.g.home, app.g.away]); cam.update(app.g); persist(); render(); tutCheck(); } return;
    case 'sub': ui.sub = d.sub; render(); window.scrollTo(0, 0); tutCheck(); return;
    case 'pitch1': throwPitch(); return;
    case 'atbat': autoAtBat(); return;
    case 'autohalf': autopilot('half'); return;
    case 'autogame': if (confirm('Let the AI manage the rest of this game for you?')) autopilot('game'); return;
    case 'autostart': setAuto(true); return;
    case 'autostop': setAuto(false); return;
    case 'decision': autoTick(true); return;
    case 'replay': startReplay(); return;
    case 'finish': finishGame(); return;
    case 'playnext': startSeasonGame(); return;
    case 'resume': app.tab = 'game'; render(); return;
    case 'exhibit': startExhibition(); return;
    case 'daily': startDaily(); return;
    case 'share': shareLink(); return;
    case 'shareresult': shareResult(); return;
    case 'swap': swapRows(d.kind, Number(d.i)); return;
    case 'autolineup': L.autoLineup(L.userTeam(app.lg)); persist(); render(); toast('Lineup and rotation set'); return;
    case 'simgame': { const r = L.simUserGame(app.lg); const t = L.userTeam(app.lg); persist(); if (r) toast(`${(r.winner === 'home') === (r.home === t) ? 'Win' : 'Loss'} ${r.away.nick} ${r.away.runs}, ${r.home.nick} ${r.home.runs}`); render(); return; }
    case 'advance': L.completeDay(app.lg, null); persist(); render(); return;
    case 'simend': if (confirm('Sim the rest of the season with the AI managing for you?')) { L.simToEnd(app.lg); persist(); render(); } return;
    case 'newseason': L.newSeason(app.lg); app.off = null; persist(); render(); return;
    case 'off': app.off = app.off === d.v ? null : d.v; ui.tMine = ui.tTheirs = null; render(); return;
    case 'autooff': { const n = L.autoOffseason(app.lg, L.userTeam(app.lg), 4); persist(); render(); toast(n ? `Made ${n} roster move${n > 1 ? 's' : ''}` : 'No worthwhile upgrades found'); return; }
    case 'signopen': openSign(d.uid); return;
    case 'dosign': { const r = L.signFreeAgent(app.lg, L.userTeam(app.lg), d.fa, d.rel); toast(r.msg); if (r.ok) { closeDialog(); persist(); render(); } return; }
    case 'tsel': if (d.who === 'mine') ui.tMine = ui.tMine === d.uid ? null : d.uid; else ui.tTheirs = ui.tTheirs === d.uid ? null : d.uid; render(); return;
    case 'tradeprop': { const r = L.proposeTrade(app.lg, L.userTeam(app.lg), ui.tMine, app.lg.teams[ui.tradeTeam], ui.tTheirs); toast(r.msg); if (r.ok) { ui.tMine = ui.tTheirs = null; persist(); } render(); return; }
    case 'reset': if (confirm('Erase your season and start over?')) { setAuto(false, true); clearSave(); app.g = null; app.kind = null; app.daily = {}; app.lg = L.createLeague(); app.off = null; persist(); render(); } return;
    case 'ph': if (g && pinchHit(g, mine(), id)) { cam.update(g); persist(); render(); } return;
    case 'pr': if (g && pinchRun(g, mine(), Number(d.base), id)) { cam.update(g); persist(); render(); } return;
    case 'pitch': if (g && changePitcher(g, mine(), id)) { if (app.tut) app.tut.changed = true; cam.update(g); persist(); render(); tutCheck(); } return;
    case 'dsubopen': openDefSub(id); return;
    case 'dsub': if (g && defSub(g, mine(), id, Number(d.i))) { cam.update(g); closeDialog(); persist(); render(); } return;
    default:
  }
});

const SETTING_SET = { level: Number, speed: String, theme: String, text: Number, visuals: String };
document.addEventListener('change', (e) => {
  if (FB.change(e)) return;
  const s = e.target.dataset;
  if (s.set && s.set in SETTING_SET) { app.settings[s.set] = SETTING_SET[s.set](e.target.value); applyPrefs(); persist(); render(); return; }
  if (s.set === 'tradeTeam') { ui.tradeTeam = Number(e.target.value); ui.tMine = ui.tTheirs = null; render(); return; }
  if (s.set === 'tradeKind') { ui.tradeKind = e.target.value; ui.tMine = ui.tTheirs = null; render(); return; }
  if (s.set) { ui[s.set] = e.target.value; ordersChanged(); render(); tutCheck(); return; }
  const tg = s.toggle;
  if (!tg) return;
  if (tg.startsWith('pause:')) { app.settings.pause[tg.slice(6)] = e.target.checked; persist(); return; }
  if (['sound', 'haptics', 'cvd', 'autoNext', 'autoLineup', 'coach'].includes(tg)) {
    app.settings[tg] = e.target.checked; applyPrefs(); persist();
    if (e.target.checked && tg === 'sound') fx.hit();
    if (e.target.checked && tg === 'haptics') fx.tick();
    if (tg === 'cvd' || tg === 'autoLineup' || tg === 'coach') render();
    return;
  }
  ui[tg] = e.target.checked; ordersChanged(); render();
});
document.addEventListener('toggle', (e) => { const k = e.target.dataset && e.target.dataset.fold; if (k) ui.open[k] = e.target.open; }, true);
$('card').addEventListener('click', (e) => { if (e.target === $('card')) closeDialog(); });

const FB = createFootball({
  $, seg, chk, fold, fx, teamCol,
  settings: () => app.settings, persist: () => persist(), render: () => render(), toast: (m) => toast(m),
  openDialog: (h) => openDialog(h), closeDialog: () => closeDialog(), confirm: (m) => confirm(m),
  tab: () => app.tab, setTab: (t) => { app.tab = t; }, closeScreen: () => { app.screen = null; app.prevScreen = null; },
  makeCam: () => createFbCam({ teamCol }),
});

boot();
if (!isFb() && app.g && !app.g.over) app.tab = 'game';
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
