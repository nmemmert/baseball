// Football UI: renders the football screens and handles football events. main.js delegates to this when the sport is football.
import {
  newFbGame, startFbGame, fbSnap, fbControlStep, fbAutoStep, fbAutoPlay, fbOffAI, fbDefAI, fbLevelFor, fbWinProb, fbAdvise, fbDecisionReason, fbReviveGame,
  actingSide, other, allPlayers, units, fgDistance, fgProb, convProb, remainSeconds, DEF_CALLS, OFF_CALLS, POS_NAMES, RATING_LABELS, QUARTER,
} from './football.js';
import * as FL from './fbleague.js';
import { attachRng } from './engine.js';
import { FB_TUTORIAL } from './screens.js';
import { crest, face } from './art.js';
import { fbGameIntel, fbReport, fbChip, renderIntel, renderReport, chipHtml } from './intel.js';

const ORD = ['', '1st', '2nd', '3rd', '4th'];
const fmtClock = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const fieldPos = (g) => (g.ball === 50 ? 'MIDFIELD' : g.ball < 50 ? `OWN ${g.ball}` : `OPP ${100 - g.ball}`);
const DELAY = { slow: 700, normal: 350, fast: 120 };
const TABS = [['orders', '🎛️', 'Play'], ['coach', '🧑‍🏫', 'Coach'], ['matchup', '⚔️', 'Matchup'], ['intel', '🔎', 'Intel'], ['auto', '▶️', 'Auto'], ['log', '📜', 'Log'], ['box', '📊', 'Box']];
const DEF_HINTS = { base: 'Balanced defense.', stack: 'Stack the box: strong against the run, weaker against the pass.', blitz: 'Blitz: heavy pressure and more sacks, but short passes and screens get open.', man: 'Man coverage: tight on deep passes, can be beaten underneath.', zone: 'Zone: keeps plays in front of you; fewer big plays, more interceptions.', prevent: 'Prevent: protects against the deep ball, gives up short gains.' };
const OFF_HINTS = { inrun: 'Inside run: steady yards between the tackles.', outrun: 'Outside run: bigger gains and bigger losses.', sneak: 'QB sneak: best chance for 1–2 yards.', short: 'Short pass: high completion, small gains.', medium: 'Medium pass: the balanced pass play.', deep: 'Deep pass: big gains, low completion, more interceptions.', screen: 'Screen: beats the blitz; short gain with run-after-catch.', punt: 'Punt: give the ball away and flip the field.', fg: 'Field goal: three points if it is good.', kneel: 'Kneel: run out the clock safely.', spike: 'Spike: stop the clock; it uses a down.' };

export function createFootball(ctx) {
  const { $, seg, chk, fold } = ctx;
  const fb = { g: null, lg: null, kind: null, auto: false, skipTok: -1, sugg: [], snap: null, savedG: null, savedKind: null, tut: null, camMade: null, ui: { call: '', pace: 'normal', timeout: false, def: 'base', kick: 'deep', try: 'xp', sub: 'orders', open: {}, pauseMsg: '' } };
  const ui = fb.ui;
  let autoTimer = null, cam = null;
  const settings = () => ctx.settings();
  const getCam = () => (cam ||= ctx.makeCam());

  // ---------- persistence ----------
  const snapshot = () => ({ g: fb.kind === 'tut' ? fb.savedG : fb.g, lg: fb.lg, kind: fb.kind === 'tut' ? fb.savedKind : fb.kind });
  function restore(o) {
    if (!o) return;
    fb.lg = o.lg || null; fb.g = o.g || null; fb.kind = o.kind || null;
    if (fb.lg) attachRng(fb.lg);
    if (fb.g) { fbReviveGame(fb.g); fb.g.wp ||= [0.5]; }
  }
  const lg = () => (fb.lg ||= FL.createFbLeague());
  const mine = () => (fb.kind === 'season' && fb.g ? FL.fbUser(lg()) : fb.g ? fb.g.home : FL.fbUser(lg()));
  const mySide = () => (fb.g.home === mine() ? 'home' : 'away');
  const opp = () => (fb.g.home === mine() ? fb.g.away : fb.g.home);
  const meActing = () => fb.g[actingSide(fb.g)] === mine();
  const abbr = (t) => t.nick.slice(0, 3).toUpperCase();
  const pl = (p) => `<span class="player" data-act="fbcard" data-uid="${p.uid}">${p.name}</span>`;
  const compact = (p) => `${p.a}/${p.b}`;

  // ---------- starting games ----------
  function newExhibition(seed) {
    if (fb.kind === 'tut') exitTutorial(false, true);
    setAuto(false, true);
    const s = seed || Math.floor(100000 + Math.random() * 899999);
    fb.g = newFbGame(s, settings().level); fb.g.user = fb.g.home; fb.kind = 'exh';
    resetUi(); fb.g.log.push(`Exhibition #${s}. You coach ${fb.g.home.name}. Kickoff!`);
    getCam().update(fb.g); ctx.setTab('game'); ctx.persist(); ctx.render();
  }
  function startSeasonGame() {
    const ng = FL.nextFbGame(lg()); if (!ng) return;
    setAuto(false, true);
    fb.g = startFbGame(ng.home, ng.away, { seed: Math.floor(Math.random() * 2 ** 31), level: settings().level, user: FL.fbUser(lg()) });
    fb.kind = 'season'; resetUi(); fb.g.log.push(`${ng.label}: ${ng.away.name} at ${ng.home.name}. Kickoff!`);
    getCam().update(fb.g); ctx.setTab('game'); ctx.persist(); ctx.render();
  }
  function resetUi() { Object.assign(ui, { call: '', pace: 'normal', timeout: false, def: 'base', kick: 'deep', try: 'xp', sub: 'orders', pauseMsg: '' }); }

  // ---------- one snap ----------
  const lvl = (side) => fbLevelFor(fb.g, side);
  function userOrders(oneShot = true) {
    const g = fb.g, side = actingSide(g);
    if (meActing()) {
      let off;
      if (g.phase === 'kickoff') off = { kick: ui.kick };
      else if (g.phase === 'try') off = { try: ui.try };
      else off = { call: ui.call || fbOffAI(g, 1).call, pace: ui.pace, timeout: oneShot && ui.timeout };
      return { off, def: fbControlStep(g, [other(side) === 'home' ? g.home : g.away]).def };
    }
    const ai = fbControlStep(g, [g[side]]);
    return { off: ai.off, def: { call: ui.def, timeout: oneShot && ui.timeout } };
  }
  function doSnap(oneShot = true) {
    const g = fb.g;
    getCam().cancel(g);
    const orders = userOrders(oneShot);
    fb.snap = { ball: g.ball, toGo: g.toGo, down: g.down, phase: g.phase, poss: g.poss, kicking: g.kicking, defCall: g.lastDefCall };
    const mark = g.log.length;
    const ev = fbSnap(g, orders);
    g.lastOffCall = ev.call || g.lastOffCall; g.lastDefCall = orders.def.call || 'base'; g.mark = mark;
    ui.call = ''; ui.timeout = false; ui.pauseMsg = '';
    if (fb.tut) { fb.tut.snaps++; fb.tut.stepSnaps++; if (ev.call) fb.tut.calls.push(ev.call); }
    return ev;
  }
  function reactTo(ev) {
    if (!ev) return;
    const fx = ctx.fx;
    if (ev.td) fx.homer();
    else if (ev.result === 'SACK' || ev.result === 'INTERCEPTION' || ev.result === 'FUMBLE' || ev.result === 'DOWNS') fx.strike();
    else if (ev.fg && ev.fg.good) fx.hit();
    else if (ev.fd || ev.yards >= 15) fx.run();
    else if (ev.type === 'play') fx.tick();
  }
  function camMode() {
    const v = settings().visuals, sp = settings().speed;
    if (v === 'off') return 'off';
    return fb.auto ? (sp === 'instant' ? 'off' : sp === 'fast' ? 'quick' : v) : v;
  }
  const playCam = (ev) => (fb.g && ev && fb.snap ? getCam().play(ev, fb.snap, fb.g, { mode: camMode(), effects: ctx.effectsOn() }) : Promise.resolve());
  function afterSnap(ev, quiet) {
    const g = fb.g;
    reactTo(ev);
    if (g.over) { const won = g.winner === mySide(); setTimeout(won ? ctx.fx.win : ctx.fx.lose, 350); if (won) setTimeout(ctx.confetti, 500); }
    ctx.persist(); ctx.render();
    if (quiet || !ev) getCam().update(g); else playCam(ev);
    tutCheck();
  }
  function snapNow() { if (fb.g && !fb.g.over && !fb.auto) afterSnap(doSnap(true)); }
  function autopilot() {
    const g = fb.g; if (!g || g.over || fb.auto) return;
    g.mark = g.log.length; g.user = mine();
    fbAutoPlay(g, [g.home, g.away]); ui.call = '';
    afterSnap(null, true);
  }

  // ---------- auto mode ----------
  function setAuto(on, quiet = false) {
    clearTimeout(autoTimer); fb.auto = !!on;
    if (!on) { if (!quiet) ctx.render(); return; }
    const g = fb.g; if (!g || g.over) { fb.auto = false; return; }
    g.user = mine(); fb.skipTok = g.plays; ui.pauseMsg = '';
    if (fb.tut) fb.tut.autoUsed = true;
    autoTick(false); tutCheck();
  }
  function pauseAuto(reason) { clearTimeout(autoTimer); fb.auto = false; ui.pauseMsg = reason; ctx.toast(`Paused: ${reason}`); ctx.persist(); ctx.render(); }
  function autoTick(force) {
    const g = fb.g;
    if (!g) { fb.auto = false; return; }
    if (!fb.auto && !force) return;
    const instant = force || settings().speed === 'instant';
    if (force) { fb.skipTok = g.plays; ui.pauseMsg = ''; }
    let ev = null, n = 0;
    g.user = mine();
    do {
      if (g.over) break;
      if (g.plays !== fb.skipTok) { const r = fbDecisionReason(g, mine(), settings().fbPause); if (r) { pauseAuto(r); return; } }
      if (n === 0) g.mark = g.log.length;
      getCam().cancel(g);
      fb.snap = { ball: g.ball, toGo: g.toGo, down: g.down, phase: g.phase, poss: g.poss, kicking: g.kicking, defCall: g.lastDefCall };
      const orders = fbControlStep(g, [g.home, g.away]);
      ev = fbSnap(g, orders); g.lastOffCall = ev.call || g.lastOffCall; g.lastDefCall = orders.def.call || 'base';
      n++;
    } while (instant && n < 2500);
    ui.call = '';
    if (g.over) { fb.auto = false; clearTimeout(autoTimer); afterSnap(ev, instant); return; }
    if (!instant) reactTo(ev);
    ctx.persist(); ctx.render(); tutCheck();
    if (!instant) playCam(ev).then(() => { if (fb.auto) autoTimer = setTimeout(() => autoTick(false), DELAY[settings().speed] || 350); });
    else { getCam().update(g); if (!force) autoTimer = setTimeout(() => autoTick(false), 0); }
  }

  function finishGame() {
    const g = fb.g; if (!g || !g.over) return;
    if (fb.kind === 'tut') { exitTutorial(true); return; }
    setAuto(false, true);
    const my = g.score[mySide()], their = g.score[other(mySide())];
    if (fb.kind === 'season') {
      FL.completeFbDay(lg(), g);
      const u = FL.fbUser(lg());
      ctx.toast(`${my > their ? 'Win' : my < their ? 'Loss' : 'Tie'} ${my}-${their}. ${u.w}-${u.l}${u.t ? '-' + u.t : ''}`);
      ctx.setTab('season');
    }
    fb.g = null; fb.kind = null; ctx.persist(); ctx.render();
  }

  // ---------- tutorial ----------
  const tStep = () => FB_TUTORIAL[fb.tut.step];
  function startTutorial() {
    if (fb.kind !== 'tut') { fb.savedG = fb.g; fb.savedKind = fb.kind; }
    setAuto(false, true); ctx.closeScreen();
    const g = newFbGame(555, 1); g.user = g.home; fb.g = g; fb.kind = 'tut'; resetUi();
    g.phase = 'snap'; g.poss = 'home'; g.ball = 30; g.down = 1; g.toGo = 10; g.running = false; g.log.push('Practice game — nothing here counts. You coach the home team.');
    fb.tut = { step: 0, snaps: 0, stepSnaps: 0, calls: [], autoUsed: false, advancing: false };
    getCam().update(g); ctx.setTab('game'); tEnter(); ctx.render();
  }
  function exitTutorial(done, silent = false) {
    setAuto(false, true);
    if (done) ctx.settings().fbTutDone = true;
    fb.g = fb.savedG || null; fb.kind = fb.savedKind || null; fb.savedG = fb.savedKind = null; fb.tut = null;
    if (fb.g) getCam().update(fb.g);
    if (!silent) { ctx.setTab(done ? 'season' : 'game'); ctx.persist(); ctx.render(); }
  }
  function scene(name) {
    const g = fb.g;
    if (name === 'fourth') { g.phase = 'snap'; g.poss = 'home'; g.ball = 62; g.down = 4; g.toGo = 2; g.running = false; g.clock = 640; getCam().update(g); }
    else if (name === 'defense') { g.phase = 'snap'; g.poss = 'away'; g.ball = 45; g.down = 3; g.toGo = 8; g.running = false; getCam().update(g); }
    else if (name === 'offense') { g.phase = 'snap'; g.poss = 'home'; g.ball = 30; g.down = 1; g.toGo = 10; g.running = false; getCam().update(g); }
  }
  function tEnter() { const s = tStep(); fb.tut.stepSnaps = 0; fb.tut.advancing = false; if (s.spot && s.spot.includes('data-set')) ui.sub = 'orders'; if (s.scene) scene(s.scene); }
  function tNext() { if (!fb.tut) return; fb.tut.step++; if (fb.tut.step >= FB_TUTORIAL.length) { exitTutorial(true); return; } tEnter(); ctx.render(); }
  function tutCheck() {
    if (!fb.tut || fb.tut.advancing) return;
    const s = tStep();
    if (!s.manual && s.ok && s.ok({ g: fb.g, ui, tut: fb.tut })) { fb.tut.advancing = true; setTimeout(() => { if (fb.tut && tStep() === s) tNext(); }, 500); }
  }
  function tutCard() {
    const s = tStep(), i = fb.tut.step, n = FB_TUTORIAL.length;
    const btn = s.manual ? `<button class="primary" data-act="fbtutnext">${s.last ? 'Start my season' : 'Continue'}</button>` : '<small class="mute">Do the highlighted action to continue</small>';
    return `<section class="tut"><h2>Tutorial · ${i + 1}/${n} — ${s.title}</h2><p>${s.text}</p><div class="row">${btn}${s.last ? '<button class="sm" data-act="fbtutexit">Keep practicing</button>' : '<button class="ghost sm" data-act="fbtutnext">Skip step</button><button class="ghost sm" data-act="fbtutexit">Exit</button>'}</div></section>`;
  }

  // ---------- rendering: game ----------
  const wpMine = (g) => { const w = fbWinProb(g); return mySide() === 'home' ? w : 1 - w; };
  function scorebug() {
    const g = fb.g, side = actingSide(g), acting = meActing();
    const ph = g.phase, q = g.ot ? 'OT' : `Q${g.quarter}`;
    const situ = ph === 'snap' ? `${ORD[g.down]} &amp; ${g.ball + g.toGo >= 100 ? 'Goal' : Math.round(g.toGo)} · ${fieldPos(g)}` : ph === 'kickoff' ? 'Kickoff' : 'Try after TD';
    const role = ph === 'kickoff' ? (acting ? 'KICKING' : 'RECEIVING') : ph === 'try' ? (acting ? 'TRY' : 'DEFENSE') : acting ? 'OFFENSE' : 'DEFENSE';
    const cls = acting ? 'bat' : 'fld';
    const mid = g.over ? '<div class="inn fin">FINAL</div>' : `<div class="inn">${q} ${fmtClock(g.clock)} <span class="rp ${cls}">${role}</span></div><small>${situ}</small>`;
    const ball = (s) => (side === s && !g.over ? '<i class="pball">🏈</i>' : '');
    const a = g.away, h = g.home, col = ctx.teamCol;
    return `<div class="bug"><div class="side ${a === mine() ? 'me' : ''}">${crest(a, 30)}<div class="ab">${abbr(a)}${ball('away')}<small>${g.timeouts.away} TO</small></div><span class="runs">${g.score.away}</span></div><div class="mid">${mid}</div>
      <div class="side r ${h === mine() ? 'me' : ''}"><span class="runs">${g.score.home}</span><div class="ab">${abbr(h)}${ball('home')}<small>${g.timeouts.home} TO</small></div>${crest(h, 30)}</div></div>`;
  }
  function stage() {
    const g = fb.g, last = [...g.log].reverse().find((l) => !l.startsWith('—')) || '';
    return `<div class="camwrap fbwrap"><div id="fbcamslot"></div>${chipHtml(fbChip(g, mine()))}</div>${last ? `<div class="lastplay ${g.last && g.last.td ? 'run' : ''}">${last}</div>` : ''}`;
  }
  function ordersPanel() {
    const g = fb.g, st = {};
    for (const s of fb.sugg) if (s.apply.ui) for (const [k, v] of Object.entries(s.apply.ui)) st[k] ||= v;
    if (g.over) { const w = g.winner === mySide(); return `<div class="banner">${g.winner === 'tie' ? 'Tie game.' : w ? 'Victory!' : 'Defeat.'}<br>${g.away.name} ${g.score.away}, ${g.home.name} ${g.score.home}</div>`; }
    if (fb.auto) return '<div class="banner pause">▶ Auto mode is coaching your team…</div><div class="hint">Tap ⏸ Pause auto below to take over. Speed and pause rules are on the Auto tab.</div>';
    const banner = ui.pauseMsg ? `<div class="banner pause">⚑ ${ui.pauseMsg}</div>` : '';
    if (g.phase === 'kickoff') {
      if (!meActing()) return `${banner}<div class="hint">${g[g.kicking].name} will kick off to you. Tap <b>Kick off</b> to continue.</div>`;
      return `${banner}<div class="group inline"><span class="label">Kick</span>${seg('fbkick', ui.kick, [['deep', 'Deep kick'], ['onside', 'Onside kick']], {}, st.kick)}</div><div class="hint">An onside kick wins the ball back about 1 time in 7 — use it only when you must.</div>`;
    }
    if (g.phase === 'try') {
      if (!meActing()) return `${banner}<div class="hint">${g[g.poss].name} line up for the try.</div>`;
      return `${banner}<div class="group inline"><span class="label">Try</span>${seg('fbtry', ui.try, [['xp', 'Kick XP (+1)'], ['two', 'Go for 2']], {}, st.try)}</div><div class="hint">The kick is about 94%; the two-point try about 47%.</div>`;
    }
    let body, hint = '';
    if (meActing()) {
      const dis = { sneak: g.toGo > 3, punt: g.down < 4, fg: fgDistance(g) > 66, spike: false };
      body = `<div class="group inline"><span class="label">Run</span>${seg('fbcall', ui.call, [['inrun', 'Inside'], ['outrun', 'Outside'], ['sneak', 'Sneak']], dis, st.call)}</div>
        <div class="group inline"><span class="label">Pass</span>${seg('fbcall', ui.call, [['short', 'Short'], ['medium', 'Medium'], ['deep', 'Deep'], ['screen', 'Screen']], dis, st.call)}</div>
        <div class="group inline"><span class="label">Other</span>${seg('fbcall', ui.call, [['punt', 'Punt'], ['fg', `FG ${fgDistance(g) <= 66 ? Math.round(fgProb(g) * 100) + '%' : ''}`], ['kneel', 'Kneel'], ['spike', 'Spike']], dis, st.call)}</div>
        <div class="group inline"><span class="label">Tempo</span>${seg('fbpace', ui.pace, [['normal', 'Normal'], ['hurry', 'Hurry-up'], ['slow', 'Slow']], {}, st.pace)}${chk('fbtimeout', ui.timeout, `TO (${g.timeouts[mySide()]})`, g.timeouts[mySide()] < 1 || !g.running)}</div>`;
      hint = ui.call ? OFF_HINTS[ui.call] : 'No call? The coordinator picks a play for you.';
    } else {
      body = `<div class="group fbdefrow"><span class="label">Defensive call</span>${seg('fbdef', ui.def, Object.entries(DEF_CALLS).map(([k, v]) => [k, v.name.replace(' the box', '').replace(' coverage', '')]), {}, st.call)}</div>
        <div class="group inline"><span class="label">Clock</span>${chk('fbtimeout', ui.timeout, `Timeout (${g.timeouts[mySide()]})`, g.timeouts[mySide()] < 1 || !g.running)}</div>`;
      hint = DEF_HINTS[ui.def] || '';
    }
    return `${banner}${body}<div class="hint">${hint}</div>`;
  }
  function coachLine() { const x = fb.sugg[0]; return x ? `<div class="coachline"><span class="ic">${x.icon}</span><div class="tx"><b>${x.title}</b></div><button class="sm primary" data-act="fbsugg" data-i="0">Do it</button></div>` : ''; }
  function coachPanel() {
    if (!settings().coach && !fb.tut) return '<small>The coach is off. Turn it on in More → Display.</small>';
    return fb.sugg.map((x, i) => `<div class="sg"><span class="ic">${x.icon}</span><div class="tx"><b>${x.title}</b><small>${x.why}</small></div><button class="sm ${i ? '' : 'primary'}" data-act="fbsugg" data-i="${i}">Do it</button></div>`).join('') || '<small>Nothing to change right now — play on.</small>';
  }
  function matchupPanel() {
    const g = fb.g, me = mine(), foe = opp(), U = units(me), V = units(foe);
    const row = (label, a, b) => `<div class="mu"><span>${label}</span><div class="meter ${a >= b ? 'good' : 'hot'}"><i style="width:${Math.min(100, a)}%"></i></div><b>${Math.round(a)}</b><small>vs ${Math.round(b)}</small></div>`;
    const key = [me.players.QB[0], me.players.RB[0], me.players.WR[0], me.players.K[0]].map((p) => `<tr><td>${pl(p)}</td><td>${p.pos}</td><td><small>${RATING_LABELS[p.pos][0]} ${p.a} · ${RATING_LABELS[p.pos][1]} ${p.b}</small></td></tr>`).join('');
    return `<h3 style="margin-top:0">Your units vs ${foe.nick}</h3>${row('Pass blocking vs rush', U.passBlock, V.passRush)}${row('Run blocking vs stop', U.runBlock, V.runStop)}${row('Receivers vs coverage', U.recv, V.cover)}${row('Your rush vs their blocking', U.passRush, V.passBlock)}${row('Your coverage vs receivers', U.cover, V.recv)}
      <h3>Key players</h3><table>${key}</table>`;
  }
  function autoPanel() {
    const r = settings().fbPause, on = [r.fourth && '4th downs', r.redzone && 'the red zone', r.twominute && 'the two-minute drill', r.score && 'after touchdowns'].filter(Boolean);
    return `<div class="group"><span class="label">Auto-play speed</span>${seg('speed', settings().speed, [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']])}</div>
      <div class="group"><span class="label">Autopilot</span><div class="row"><button class="sm" data-act="fbautogame">Finish game</button></div></div>
      <div class="hint">▶ Auto lets the AI coach while you watch. It pauses for ${on.join(', ') || 'nothing (all pause rules are off)'}. Change this in More.</div>`;
  }
  function logPanel() {
    const g = fb.g, fresh = g.log.length - (g.mark ?? g.log.length);
    return `<div class="log">${[...g.log].slice(-80).reverse().map((l, i) => `<p class="${l.startsWith('—') ? 'sep' : i < fresh ? 'new' : ''}">${l}</p>`).join('')}</div>`;
  }
  function teamBox(t) {
    const P = t.players, s = (p, k) => p.st[k];
    const qb = P.QB[0], rbs = P.RB, wrs = [...P.WR, ...P.TE];
    const lines = [
      `<tr><td>${pl(qb)}</td><td><small>${s(qb, 'pc')}/${s(qb, 'pa')}, ${s(qb, 'py')} yds, ${s(qb, 'ptd')} TD, ${s(qb, 'pint')} INT</small></td></tr>`,
      ...rbs.concat([qb]).filter((p) => p.st.ra).map((p) => `<tr><td>${pl(p)}</td><td><small>${p.st.ra} car, ${p.st.ry} yds${p.st.rtd ? `, ${p.st.rtd} TD` : ''}</small></td></tr>`),
      ...[...wrs, ...rbs].filter((p) => p.st.rec).map((p) => `<tr><td>${pl(p)}</td><td><small>${p.st.rec} rec, ${p.st.recy} yds${p.st.rectd ? `, ${p.st.rectd} TD` : ''}</small></td></tr>`),
      ...allPlayers(t).filter((p) => p.st.sk || p.st.int).map((p) => `<tr><td>${pl(p)}</td><td><small>${p.st.sk ? `${p.st.sk} sack` : ''}${p.st.sk && p.st.int ? ', ' : ''}${p.st.int ? `${p.st.int} INT` : ''}</small></td></tr>`),
      `<tr><td>${pl(P.K[0])}</td><td><small>FG ${P.K[0].st.fgm}/${P.K[0].st.fga}, XP ${P.K[0].st.xpm}/${P.K[0].st.xpa}</small></td></tr>`,
    ];
    return `<h3>${t.name}</h3><table>${lines.join('')}</table>`;
  }
  const boxPanel = () => `${teamBox(fb.g.away)}${teamBox(fb.g.home)}`;

  function computeSugg() {
    const g = fb.g; fb.sugg = [];
    if ((!settings().coach && !fb.tut) || g.over || fb.auto) return;
    fb.sugg = fbAdvise(g, mine(), { call: ui.call, pace: ui.pace, timeout: ui.timeout, kick: ui.kick, try: ui.try });
  }
  function renderGame() {
    if (!fb.g) {
      const l = lg(), ng = l.phase === 'done' ? null : FL.nextFbGame(l);
      return `<section class="empty"><h2>No game in progress</h2><p>${ng ? `Next up: <b>${ng.away.nick} at ${ng.home.nick}</b><br>${ng.label}` : l.phase === 'done' ? 'The season is over — see the Season tab.' : 'Your team has no game right now.'}</p>
        <div class="row">${ng ? '<button class="primary" data-act="fbplaynext">Coach next game</button>' : ''}<button data-act="fbexhibit">Exhibition game</button></div><p class="mute">Season games count in the standings. Exhibition games are one-offs.</p></section>`;
    }
    if (!TABS.some((t) => t[0] === ui.sub)) ui.sub = 'orders';
    computeSugg();
    const badge = fb.sugg.length ? `<i class="bdg">${fb.sugg.length}</i>` : '';
    const tabs = `<div class="ptabs">${TABS.map(([k, ic, t]) => `<button data-act="fbsub" data-sub="${k}" class="${ui.sub === k ? 'on' : ''}">${ic} ${t}${k === 'coach' ? badge : ''}</button>`).join('')}</div>`;
    const panels = { orders: ordersPanel, coach: coachPanel, matchup: matchupPanel, intel: () => renderIntel(fbGameIntel(fb.g, mine())), auto: autoPanel, log: logPanel, box: boxPanel };
    return `${scorebug()}${fb.tut ? tutCard() : ''}<section class="stagesec">${stage()}</section>${coachLine()}${tabs}<section class="panel ${meActing() ? 'off' : 'def'}">${panels[ui.sub]()}</section>`;
  }

  // ---------- rendering: roster, season, stats ----------
  function renderRoster() {
    const t = FL.fbUser(lg());
    const groups = Object.entries(t.players).map(([pos, arr]) => fold(`fr_${pos}`, `${POS_NAMES[pos]} <small>(${RATING_LABELS[pos][0]} / ${RATING_LABELS[pos][1]})</small>`, `<table>${arr.map((p) => `<tr><td>${pl(p)}</td><td>${p.age}</td><td><b>${p.a}</b> / <b>${p.b}</b></td></tr>`).join('')}</table>`, ['QB', 'RB', 'WR'].includes(pos)));
    const ngx = lg().phase === 'done' ? null : FL.nextFbGame(lg()), oppx = ngx ? (ngx.home === t ? ngx.away : ngx.home) : null;
    const report = fold('fr_rep', '🔎 Your team report', renderReport(fbReport(t, { opp: oppx }), { goodT: '💪 Strengths', badT: '⚠️ Weaknesses to cover' }), true);
    return `${report}<section><h2>${t.name} — starters</h2><p class="hint">Starters are the best player at each position. Tap a name for a card. (Ratings: first / second as labelled.)</p></section>${groups.join('')}`;
  }
  function renderSeason() {
    const l = lg(), t = FL.fbUser(l), st = FL.fbStandings(l), rank = st.indexOf(t) + 1;
    const ng = l.phase === 'done' ? null : FL.nextFbGame(l);
    let status, scout = '';
    if (l.phase === 'done') status = `<div class="banner">${l.champion === l.userId ? '🏆 You are the champions!' : `${l.teams[l.champion].name} won the title.`}</div><div class="row" style="justify-content:center"><button class="primary" data-act="fbnewseason">Start season ${l.season + 1}</button></div>`;
    else if (fb.g && fb.kind === 'season') status = '<p>Game in progress.</p><div class="row"><button class="primary" data-act="fbresume">Resume game</button></div>';
    else if (ng) { const home = ng.home === t; scout = fold('fscout', `🔎 Scouting: ${(home ? ng.away : ng.home).nick}`, renderReport(fbReport(home ? ng.away : ng.home, { asOpp: true }), { goodT: '🛡️ Their strengths — watch out', badT: '🎯 Their weaknesses — attack these' }) + renderReport(fbReport(t, { opp: home ? ng.away : ng.home }), { goodT: '✅ Your edges against them', badT: '⚠️ Where they have the edge' }), true); status = `<p><b>${ng.label}</b><br>${home ? 'vs' : '@'} <b>${(home ? ng.away : ng.home).name}</b> <small>(${home ? 'home' : 'away'})</small></p><div class="row"><button class="primary" data-act="fbplaynext">Coach game</button><button data-act="fbsimgame">Sim game</button><button class="ghost" data-act="fbsimend">Sim to end of season</button></div>`; }
    else status = `<p>${FL.fbUserEliminated(l) ? 'You are out of the playoffs.' : 'Waiting on the other playoff game.'}</p><div class="row"><button class="primary" data-act="fbadvance">Advance a week</button><button class="ghost" data-act="fbsimend">Sim to end of season</button></div>`;
    const rows = st.map((x, i) => `<tr class="${x === t ? 'me' : ''} ${i === 3 ? 'cut' : ''}"><td>${i + 1}. ${crest(x, 16)} ${x.name}</td><td>${x.w}-${x.l}${x.t ? '-' + x.t : ''}</td><td>${x.pf - x.pa > 0 ? '+' : ''}${x.pf - x.pa}</td></tr>`).join('');
    let bracket = '';
    if (l.playoffs) { const sr = (s, label) => `<tr><td>${label}</td><td>${l.teams[s.a].nick}${s.done && s.winner === s.a ? ' ✔' : ''}</td><td>${l.teams[s.b].nick}${s.done && s.winner === s.b ? ' ✔' : ''}</td><td>${s.score ? s.score.join('-') : ''}</td></tr>`; bracket = `<section><h2>Playoffs (single game)</h2><table>${l.playoffs.semis.map((s, i) => sr(s, `Semi ${i + 1}`)).join('')}${l.playoffs.final ? sr(l.playoffs.final, 'Final') : ''}</table></section>`; }
    const res = l.results.slice(0, 8).map((r) => `<tr><td>${r.away}</td><td>${r.as}</td><td>${r.home}</td><td>${r.hs}</td></tr>`).join('');
    const hist = l.history.length ? fold('fhist', 'History', `<table><tr><th>Season</th><th>Champion</th><th>You</th><th></th></tr>${[...l.history].reverse().map((h) => `<tr><td>${h.season}</td><td>${h.champion}</td><td>${h.w}-${h.l}${h.t ? '-' + h.t : ''}</td><td><small>${h.result}</small></td></tr>`).join('')}</table>`) : '';
    return `<section><h2>Season ${l.season} · ${t.w}-${t.l}${t.t ? '-' + t.t : ''} · ${l.phase === 'regular' ? `${rank}${['st', 'nd', 'rd'][rank - 1] || 'th'} place` : l.phase === 'playoffs' ? 'playoffs' : 'complete'}</h2>${status}</section>${scout}${bracket}
      ${fold('fstand', 'Standings <small>(top 4 make the playoffs)</small>', `<table><tr><th></th><th>Record</th><th>+/-</th></tr>${rows}</table>`, true)}${fold('fres', 'Results', `<table>${res || '<tr><td>No games yet</td></tr>'}</table>`)}${hist}`;
  }
  function renderStats() {
    const l = lg(), L = FL.fbLeaders(l), block = (title, rows) => `<div><h3>${title}</h3><table>${rows.map((x) => `<tr><td>${pl(x.p)} <small>${abbr(x.t)}</small></td><td><b>${x.v}</b></td></tr>`).join('') || '<tr><td>—</td></tr>'}</table></div>`;
    return fold('fl', 'League leaders', `<div class="cols tight">${block('Passing yards', L.pass)}${block('Rushing yards', L.rush)}${block('Receiving yards', L.rec)}${block('Sacks', L.sacks)}${block('Interceptions', L.ints)}</div>`, true);
  }
  function showCard(uid) {
    const l = lg(), teams = [...l.teams]; if (fb.g) teams.push(fb.g.home, fb.g.away);
    let found = null; for (const t of teams) for (const p of allPlayers(t)) if (p.uid === uid) found = { p, t };
    if (!found) return;
    const { p, t } = found, lab = RATING_LABELS[p.pos], s = p.ss;
    const bars = [[lab[0], p.a], [lab[1], p.b]].map(([k, v]) => `<span class="label">${k}</span><div class="meter ${v >= 70 ? 'good' : ''}"><i style="width:${v}%"></i></div><b>${v}</b>`).join('');
    ctx.openDialog(`<div class="cardhead">${face(p, ctx.teamCol(t), 58, 'fb')}<div><h2 style="margin:0">${p.name}</h2></div></div><p class="mute">${t.name} · ${POS_NAMES[p.pos]} · age ${p.age}</p><div class="bars">${bars}</div>
      <p><small>Season: ${s.py ? `${s.py} pass yds, ${s.ptd} TD · ` : ''}${s.ry ? `${s.ry} rush yds · ` : ''}${s.recy ? `${s.recy} rec yds · ` : ''}${s.fga ? `FG ${s.fgm}/${s.fga} · ` : ''}${s.sk ? `${s.sk} sacks · ` : ''}${s.int ? `${s.int} INT` : ''}</small></p><div class="row" style="justify-content:flex-end"><button data-act="closecard">Close</button></div>`);
  }

  // ---------- shell hooks ----------
  const render = (tab) => ({ game: renderGame, lineup: renderRoster, season: renderSeason, stats: renderStats }[tab] || (() => ''))();
  function renderBar() {
    const g = fb.g;
    if (!g) return '';
    if (g.over) return '<button class="primary" data-act="fbfinish">Finish game</button>';
    if (fb.auto) return '<button class="primary" data-act="fbautostop">⏸ Pause auto</button>';
    const label = g.phase === 'kickoff' ? (meActing() ? 'Kick off ▶' : 'Continue ▶') : g.phase === 'try' ? (!meActing() ? 'Continue ▶' : ui.try === 'two' ? 'Go for 2 ▶' : 'Kick it ▶') : 'Snap ▶';
    return `<button data-act="fbdecision">⏭ Decision</button><button data-act="fbautostart">▶ Auto</button><button class="primary" data-act="fbsnap">${label}</button>`;
  }
  const topHtml = () => { const t = FL.fbUser(lg()), l = lg(); return `<h1>SKIP<b>PER</b></h1><small>🏈 ${t.name} · ${t.w}-${t.l}${t.t ? '-' + t.t : ''}${l.phase === 'regular' ? '' : l.phase === 'playoffs' ? ' · playoffs' : ''}</small>`; };
  function mount() {
    const slot = $('fbcamslot'); if (slot) slot.appendChild(getCam().svg);
    for (const e of document.querySelectorAll('.spot')) e.classList.remove('spot');
    if (fb.tut && ctx.tab() === 'game') { const sel = tStep().spot; const e = sel && document.querySelector(sel); if (e) (e.closest('label') || e).classList.add('spot'); }
  }
  const status = () => {
    const l = lg(), t = FL.fbUser(l), inSeason = l.day > 0 || l.history.length > 0;
    return { cont: !!fb.g || inSeason, label: fb.g ? `${fb.kind === 'exh' ? 'Exhibition' : fb.kind === 'tut' ? 'Tutorial' : `Season ${l.season}`} · game in progress` : inSeason ? `Season ${l.season} · ${t.w}-${t.l}${t.t ? '-' + t.t : ''}` : 'Start season', short: inSeason ? `Season ${l.season} · ${t.w}-${t.l}${t.t ? '-' + t.t : ''}` : fb.g ? 'Game in progress' : 'New season' };
  };

  function applySugg(i) {
    const x = fb.sugg[i]; if (!x || !fb.g) return;
    Object.assign(ui, x.apply.ui || {});
    ctx.toast(`Coach: ${x.title}`); ctx.render(); tutCheck();
  }

  // ---------- events ----------
  function click(act, d) {
    switch (act) {
      case 'fbcard': showCard(d.uid); return true;
      case 'fbsub': ui.sub = d.sub; ctx.render(); window.scrollTo(0, 0); return true;
      case 'fbsnap': snapNow(); return true;
      case 'fbautostart': setAuto(true); return true;
      case 'fbautostop': setAuto(false); return true;
      case 'fbdecision': autoTick(true); return true;
      case 'fbautogame': if (ctx.confirm('Let the AI coach the rest of this game?')) autopilot(); return true;
      case 'fbfinish': finishGame(); return true;
      case 'fbplaynext': startSeasonGame(); return true;
      case 'fbresume': ctx.setTab('game'); ctx.render(); return true;
      case 'fbexhibit': newExhibition(); return true;
      case 'fbsugg': applySugg(Number(d.i)); return true;
      case 'fbsimgame': { const r = FL.simFbUserGame(lg()), u = FL.fbUser(lg()); ctx.persist(); if (r) { const me = r.home === u ? 'home' : 'away'; ctx.toast(`${r.winner === me ? 'Win' : r.winner === 'tie' ? 'Tie' : 'Loss'} ${r.away.nick} ${r.score.away}, ${r.home.nick} ${r.score.home}`); } ctx.render(); return true; }
      case 'fbadvance': FL.completeFbDay(lg(), null); ctx.persist(); ctx.render(); return true;
      case 'fbsimend': if (ctx.confirm('Sim the rest of the season with the AI coaching for you?')) { FL.simFbToEnd(lg()); ctx.persist(); ctx.render(); } return true;
      case 'fbnewseason': FL.newFbSeason(lg()); ctx.persist(); ctx.render(); return true;
      case 'fbtutnext': if (fb.tut && tStep().last) exitTutorial(true); else tNext(); return true;
      case 'fbtutexit': exitTutorial(false); return true;
      case 'fbreset': fb.g = null; fb.kind = null; fb.lg = FL.createFbLeague(); setAuto(false, true); ctx.persist(); ctx.render(); return true;
      default: return false;
    }
  }
  function change(e) {
    const s = e.target.dataset;
    if (s.set && s.set.startsWith('fb')) {
      const k = { fbcall: 'call', fbpace: 'pace', fbdef: 'def', fbkick: 'kick', fbtry: 'try' }[s.set];
      if (k) { ui[k] = e.target.value; ctx.render(); tutCheck(); }
      return true;
    }
    if (s.toggle === 'fbtimeout') { ui.timeout = e.target.checked; ctx.render(); return true; }
    if (s.toggle && s.toggle.startsWith('fbpause:')) { settings().fbPause[s.toggle.slice(8)] = e.target.checked; ctx.persist(); return true; }
    return false;
  }

  return { fb, snapshot, restore, render, renderBar, topHtml, mount, status, click, change, newExhibition, startSeasonGame, startTutorial, exitTutorial, setAuto, lg, hasGame: () => !!fb.g, isTutorial: () => !!fb.tut, finishGame };
}
