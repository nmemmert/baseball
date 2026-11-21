// Skipper football: a play-calling football sim. You are the head coach: you pick the plays, the players do the rest.
// Pure logic (no DOM), seeded and serialisable like the baseball engine.
import { attachRng, makeRng, uniqueName } from './engine.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const rating = (rng, mean = 64, spread = 14) => Math.round(clamp(mean + (rng() + rng() + rng() - 1.5) * spread * 1.6, 30, 96));
const gauss = (rng) => (rng() + rng() + rng() + rng() - 2) * 1.73;
export const QUARTER = 720;       // 12-minute quarters
export const OT_TIME = 420;

// ---------- Teams ----------
const POS_COUNT = { QB: 1, RB: 2, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 2, S: 2, K: 1, P: 1 };
export const POS_NAMES = { QB: 'Quarterback', RB: 'Running back', WR: 'Wide receiver', TE: 'Tight end', OL: 'Offensive line', DL: 'Defensive line', LB: 'Linebacker', CB: 'Cornerback', S: 'Safety', K: 'Kicker', P: 'Punter' };
// a / b meaning per position (shown on cards)
export const RATING_LABELS = { QB: ['ARM', 'ACC'], RB: ['RUN', 'SPD'], WR: ['HND', 'SPD'], TE: ['HND', 'BLK'], OL: ['PBK', 'RBK'], DL: ['RSH', 'RUN'], LB: ['RUN', 'COV'], CB: ['COV', 'SPD'], S: ['COV', 'TKL'], K: ['PWR', 'ACC'], P: ['PWR', 'ACC'] };
let fid = 1;
export const blankSt = () => ({ pa: 0, pc: 0, py: 0, ptd: 0, pint: 0, ra: 0, ry: 0, rtd: 0, rec: 0, recy: 0, rectd: 0, fgm: 0, fga: 0, xpm: 0, xpa: 0, sk: 0, int: 0 });

function makePlayer(rng, used, sur, pos, bias) {
  const id = 1e6 + fid++;
  const m = (pos === 'K' || pos === 'P' ? 62 : 64) + bias;
  return { id, uid: `f${id}`, type: 'fbp', name: uniqueName(rng, used, sur), pos, age: 21 + Math.floor(rng() * 14), a: rating(rng, m), b: rating(rng, m), st: blankSt(), ss: blankSt() };
}

export function makeFbTeam(rng, city, nick, used = new Set(), bias = 0) {
  const id = 1e6 + fid++, sur = new Set(), players = {};
  for (const [pos, n] of Object.entries(POS_COUNT)) players[pos] = Array.from({ length: n }, () => makePlayer(rng, used, sur, pos, bias));
  // starters first: best ratings in front
  for (const pos of Object.keys(players)) players[pos].sort((x, y) => y.a + y.b - (x.a + x.b));
  return { id, uid: `t${id}`, type: 'team', sport: 'fb', city, nick, name: `${city} ${nick}`, players, w: 0, l: 0, t: 0, pf: 0, pa: 0 };
}
export const allPlayers = (t) => Object.values(t.players).flat();

const avg = (arr, k) => arr.reduce((a, p) => a + p[k], 0) / arr.length;
export function units(t) {
  const P = t.players;
  return {
    passBlock: avg(P.OL, 'a') * 0.85 + avg(P.TE, 'b') * 0.15,
    runBlock: avg(P.OL, 'b') * 0.85 + avg(P.TE, 'b') * 0.15,
    passRush: avg(P.DL, 'a') * 0.75 + avg(P.LB, 'a') * 0.25,
    runStop: avg(P.DL, 'b') * 0.5 + avg(P.LB, 'a') * 0.5,
    cover: avg(P.CB, 'a') * 0.45 + avg(P.S, 'a') * 0.3 + avg(P.LB, 'b') * 0.25,
    recv: avg(P.WR, 'a') * 0.4 + avg(P.WR, 'b') * 0.3 + P.TE[0].a * 0.15 + P.RB[0].b * 0.15,
  };
}

// ---------- Game ----------
export function newFbGame(seed = Date.now() % 1e9, level = 1) {
  const rng = makeRng(seed), used = new Set();
  const home = makeFbTeam(rng, 'Harbor City', 'Skippers', used), away = makeFbTeam(rng, 'Mesa', 'Scorpions', used);
  return startFbGame(home, away, { seed: seed ^ 0x2545f491, level, exhibition: seed, user: null });
}

export function startFbGame(home, away, { seed = 1, level = 1, exhibition = null, user = null } = {}) {
  for (const t of [home, away]) for (const p of allPlayers(t)) p.st = blankSt();
  return attachRng({
    rs: seed | 0, seed: exhibition ?? seed, kind: 'fb', home, away, level, user, quarter: 1, clock: QUARTER,
    poss: 'away', ball: 25, down: 1, toGo: 10, phase: 'kickoff', kicking: 'home', score: { home: 0, away: 0 }, timeouts: { home: 3, away: 3 },
    running: false, over: false, winner: null, ot: false, log: [], last: null, plays: 0, wp: [0.5], recvFirst: 'away', mark: 0,
  });
}

export const other = (s) => (s === 'home' ? 'away' : 'home');
export const actingSide = (g) => (g.phase === 'kickoff' ? g.kicking : g.poss);
export const defendingSide = (g) => other(actingSide(g));
export const teamOf = (g, side) => g[side];
const say = (g, m) => g.log.push(m);

// Defensive calls: modifiers on the play.
export const DEF_CALLS = {
  base: { name: 'Base', run: 0, rush: 0, comp: { short: 0, medium: 0, deep: 0, screen: 0 }, yac: 0, big: 1, int: 0 },
  stack: { name: 'Stack the box', run: -1.1, rush: 3, comp: { short: 0.03, medium: 0.04, deep: 0.06, screen: 0.02 }, yac: 0.5, big: 1, int: -0.004 },
  blitz: { name: 'Blitz', run: -0.2, rush: 18, comp: { short: 0.04, medium: 0.03, deep: -0.02, screen: 0.12 }, yac: 0.8, big: 1.4, int: 0.002 },
  man: { name: 'Man coverage', run: 0.2, rush: 0, comp: { short: 0.01, medium: -0.03, deep: -0.04, screen: 0 }, yac: 0.2, big: 1.1, int: 0.002 },
  zone: { name: 'Zone', run: 0.2, rush: 0, comp: { short: -0.03, medium: -0.01, deep: -0.03, screen: -0.05 }, yac: -0.6, big: 0.8, int: 0.005 },
  prevent: { name: 'Prevent', run: 1.3, rush: -8, comp: { short: 0.1, medium: 0.04, deep: -0.14, screen: 0.1 }, yac: -1.0, big: 0.4, int: 0.003 },
};
export const OFF_CALLS = { inrun: 'Inside run', outrun: 'Outside run', sneak: 'QB sneak', short: 'Short pass', medium: 'Medium pass', deep: 'Deep pass', screen: 'Screen', punt: 'Punt', fg: 'Field goal', kneel: 'Kneel', spike: 'Spike' };
const PASS_PROFILE = { short: { air: 5.5, comp: 0.74, sd: 2.6 }, medium: { air: 12, comp: 0.6, sd: 3.6 }, deep: { air: 25, comp: 0.36, sd: 6 }, screen: { air: -1, comp: 0.76, sd: 2 } };

export const fgDistance = (g) => 117 - g.ball;
export function fgProb(g, dist = fgDistance(g)) {
  const K = teamOf(g, actingSide(g)).players.K[0];
  return clamp(1.06 - 0.0105 * (dist - 18) + (K.a - 70) / 300 + (K.b - 70) / 400, 0.05, 0.985);
}
const CONV = [0, 0.66, 0.57, 0.5, 0.45, 0.41, 0.37, 0.34, 0.31, 0.29, 0.27];
export const convProb = (toGo) => (toGo <= 10 ? CONV[Math.max(1, Math.round(toGo))] : 0.2);

// ---------- helpers ----------
const remainSeconds = (g) => (g.ot ? g.clock : (4 - g.quarter) * QUARTER + g.clock);
export { remainSeconds };

function pickTarget(rng, t) {
  const P = t.players, r = rng();
  return r < 0.3 ? P.WR[0] : r < 0.55 ? P.WR[1] : r < 0.73 ? P.WR[2] : r < 0.9 ? P.TE[0] : P.RB[1];
}
const pickRB = (rng, t) => (rng() < 0.78 ? t.players.RB[0] : t.players.RB[1]);
const defender = (rng, t, pos) => { const a = t.players[pos]; return a[Math.floor(rng() * a.length)]; };

function addScore(g, side, pts) { g.score[side] += pts; }

function flip(g) {
  g.poss = other(g.poss);
  g.ball = clamp(100 - g.ball, 1, 99);
  g.down = 1; g.toGo = Math.min(10, 100 - g.ball);
}
function firstDown(g) { g.down = 1; g.toGo = Math.min(10, 100 - g.ball); }
function endGame(g, winner) {
  g.over = true; g.winner = winner;
  say(g, winner === 'tie' ? `Final: it ends in a tie, ${g.score.home}-${g.score.away}.` : `Final: ${g[winner].name} win ${g.score[winner]}-${g.score[other(winner)]}.`);
}

function newEv(g, type) {
  return { type, call: null, from: g.ball, to: g.ball, air: 0, yards: 0, result: '', msg: '', td: false, fd: false, turnover: false, stop: false, dur: 0, runoff: 0, poss: g.poss, sk: false, ints: false, fg: null, score: 0, down: g.down, toGo: g.toGo, penalty: null, target: null, ret: 0 };
}

// ---------- the snap ----------
/** orders = { off: {call, pace, timeout, kick, try}, def: {call, timeout} }  (off = team with the ball / kicking / scoring) */
export function fbSnap(g, orders = {}) {
  if (g.over) return null;
  const off = { call: '', pace: 'normal', ...(orders.off || {}) }, def = { call: 'base', ...(orders.def || {}) };
  const ev = newEv(g, g.phase === 'kickoff' ? 'kickoff' : g.phase === 'try' ? 'try' : 'play');
  ev.dcall = def.call;
  g.last = ev; g.plays++;
  const side = actingSide(g), foe = other(side);
  // timeouts stop the clock before the snap
  let timeout = false;
  if (g.phase === 'snap' && g.running) {
    if (off.timeout && g.timeouts[side] > 0) { g.timeouts[side]--; timeout = true; ev.timeoutBy = side; say(g, `${g[side].name} call a timeout.`); }
    else if (def.timeout && g.timeouts[foe] > 0) { g.timeouts[foe]--; timeout = true; ev.timeoutBy = foe; say(g, `${g[foe].name} call a timeout.`); }
  }
  if (g.phase === 'kickoff') doKickoff(g, ev, off);
  else if (g.phase === 'try') doTry(g, ev, off, def);
  else doScrimmage(g, ev, off, def, timeout);
  finish(g, ev);
  return ev;
}

function doKickoff(g, ev, off) {
  const kick = g.kicking, rec = other(kick), K = g[kick].players.K[0];
  ev.poss = kick; ev.call = off.kick === 'onside' ? 'onside' : 'deep';
  if (off.kick === 'onside') {
    const ok = g.rng() < 0.14;
    if (ok) { g.poss = kick; g.ball = clamp(Math.round(52 + g.rng() * 4), 40, 60); ev.result = 'ONSIDE'; ev.msg = `${g[kick].name} recover the onside kick!`; ev.turnover = true; }
    else { g.poss = rec; g.ball = 55; ev.result = 'ONSIDE FAIL'; ev.msg = `${g[rec].name} recover the onside kick.`; }
  } else {
    const tb = g.rng() < clamp(0.5 + (K.a - 70) / 120, 0.25, 0.85);
    g.poss = rec;
    if (tb) { g.ball = 25; ev.result = 'TOUCHBACK'; ev.msg = `Kickoff — touchback. ${g[rec].name} start at their 25.`; }
    else { ev.ret = clamp(Math.round(22 + gauss(g.rng) * 7), 6, 55); g.ball = ev.ret; ev.result = 'RETURN'; ev.msg = `Kickoff returned to the ${ev.ret}.`; }
  }
  ev.to = g.ball;
  g.down = 1; g.toGo = 10; g.phase = 'snap'; g.running = false; ev.stop = true; ev.dur = 0;
}

function doTry(g, ev, off, def) {
  const side = g.poss, t = g[side], d = g[other(side)], K = t.players.K[0], O = units(t), D = units(d);
  ev.call = off.try === 'two' ? 'two' : 'xp'; ev.poss = side;
  if (ev.call === 'two') {
    const p = clamp(0.47 + (O.passBlock + O.recv + t.players.QB[0].b - D.passRush - D.cover - 70) / 400, 0.28, 0.66);
    const ok = g.rng() < p;
    if (ok) { addScore(g, side, 2); t.players.QB[0].st.ptd += 0; }
    ev.result = ok ? '2PT GOOD' : '2PT FAILED'; ev.msg = ok ? `${t.name} convert the two-point try!` : `${t.name} fail on the two-point try.`; ev.score = ok ? 2 : 0;
  } else {
    const p = clamp(0.93 + (K.b - 70) / 500, 0.85, 0.99), ok = g.rng() < p;
    K.st.xpa++; if (ok) { K.st.xpm++; addScore(g, side, 1); }
    ev.result = ok ? 'XP GOOD' : 'XP MISSED'; ev.msg = ok ? `${K.name} kicks the extra point.` : `${K.name} misses the extra point!`; ev.score = ok ? 1 : 0;
  }
  ev.stop = true; ev.dur = 0;
  g.phase = 'kickoff'; g.kicking = side;
}

function doScrimmage(g, ev, off, def, timeout) {
  const rng = g.rng, side = g.poss, t = g[side], d = g[other(side)];
  const O = units(t), D = units(d), dc = DEF_CALLS[def.call] || DEF_CALLS.base;
  let call = off.call || 'short';
  if (call === 'punt') return doPunt(g, ev, off, timeout);
  if (call === 'fg') return doFieldGoal(g, ev, off, timeout);
  ev.call = call;
  // pre-snap runoff
  const pace = { normal: 25, hurry: 12, slow: 37 }[off.pace] ?? 25;
  ev.runoff = g.running && !timeout && call !== 'spike' ? pace : 0;
  if (call === 'kneel') {
    ev.runoff = g.running && !timeout ? 38 : 0;
    ev.yards = -1; ev.dur = 1; ev.msg = `${t.players.QB[0].name} kneels.`; g.ball = Math.max(1, g.ball - 1); g.down++; g.toGo += 1; ev.result = 'KNEEL';
    if (g.down > 4) { ev.turnover = true; flip(g); }
    return;
  }
  if (call === 'spike') { ev.dur = 1; ev.stop = true; ev.msg = `${t.players.QB[0].name} spikes the ball to stop the clock.`; g.down++; ev.result = 'SPIKE'; if (g.down > 4) { ev.turnover = true; flip(g); } return; }
  // penalties (replay the down)
  if (rng() < 0.055) {
    const offP = rng() < 0.5;
    const kinds = offP ? [['Offensive holding', -10, false], ['False start', -5, false]] : [['Defensive offside', 5, false], ['Defensive holding', 5, true], ['Pass interference', call === 'deep' ? 24 : 11, true]];
    const [name, yds, auto] = kinds[Math.floor(rng() * kinds.length)];
    if (name === 'Pass interference' && !['short', 'medium', 'deep'].includes(call)) { /* fall through to a normal play */ } else {
      const y = clamp(yds, -g.ball + 1, 100 - g.ball - 1);
      g.ball += y; g.toGo = auto ? 0 : g.toGo - y;
      if (auto || g.toGo <= 0) firstDown(g); else if (g.toGo > 30) g.toGo = Math.min(g.toGo, 99 - g.ball + 1);
      ev.type = 'penalty'; ev.penalty = name; ev.yards = y; ev.result = 'FLAG'; ev.stop = true; ev.dur = 4;
      ev.msg = `Flag: ${name} on the ${offP ? t.name : d.name} (${y > 0 ? '+' : ''}${y}).`; ev.to = g.ball; ev.fd = auto;
      return;
    }
  }
  const qb = t.players.QB[0];
  let yards = 0;
  if (call === 'inrun' || call === 'outrun' || call === 'sneak') {
    const rb = call === 'sneak' ? qb : pickRB(rng, t);
    ev.target = rb.uid;
    if (call === 'sneak') {
      const p = clamp(0.7 + (O.runBlock - D.runStop) / 150 + dc.run * -0.04, 0.35, 0.9);
      yards = rng() < p ? Math.max(Math.round(g.toGo), 1 + Math.floor(rng() * 3)) : Math.floor(rng() * 2) - 0;
      if (yards >= g.toGo && g.toGo > 3) yards = 3;
    } else {
      let mean = (call === 'inrun' ? 3.6 : 4.0) + (rb.a - 62) / 38 + (O.runBlock - D.runStop) / 40 + dc.run;
      yards = gauss(rng) * (call === 'outrun' ? 4.6 : 3.4) + mean;
      if (rng() < 0.022 * dc.big) yards += 10 + rng() * 24;
      yards = Math.round(clamp(yards, -7, 80));
    }
    rb.st.ra++; rb.st.ry += yards;
    ev.air = 0; ev.dur = 5; ev.stop = rng() < (call === 'outrun' ? 0.2 : 0.1);
    if (call !== 'sneak' && rng() < 0.011) {
      // fumble
      const lost = rng() < 0.5;
      ev.msg = `${rb.name} fumbles${lost ? ' — recovered by the defense!' : ' but falls on it.'}`;
      if (lost) { ev.turnover = true; ev.result = 'FUMBLE'; ev.yards = yards; g.ball = clamp(g.ball + Math.max(0, yards), 1, 99); flip(g); ev.stop = false; return; }
    }
    ev.msg = `${rb.name} ${call === 'sneak' ? 'sneaks' : 'runs'} for ${yards >= 0 ? yards : 'a loss of ' + -yards}${yards === 1 ? ' yard' : yards >= 0 ? ' yards' : ''}.`;
  } else {
    const prof = PASS_PROFILE[call];
    if (!prof) { ev.call = 'short'; return doScrimmageFallback(g, ev, off, def, timeout); }
    const rushDiff = D.passRush - O.passBlock + dc.rush;
    const sackP = clamp(0.045 + rushDiff / 500 - (call === 'screen' ? 0.03 : 0) + (call === 'deep' ? 0.02 : 0), 0.012, 0.22);
    const tgt = pickTarget(rng, t); ev.target = tgt.uid;
    if (rng() < sackP) {
      yards = -Math.round(4 + rng() * 5); ev.sk = true; ev.dur = 5; ev.result = 'SACK';
      const sacker = defender(rng, d, rng() < 0.7 ? 'DL' : 'LB'); sacker.st.sk++;
      ev.msg = `${qb.name} is sacked by ${sacker.name} for ${-yards}.`;
      if (rng() < 0.07 && rng() < 0.5) { ev.turnover = true; ev.result = 'FUMBLE'; ev.msg += ' Fumble — the defense recovers!'; g.ball = clamp(g.ball + yards, 1, 99); ev.yards = yards; flip(g); return; }
    } else {
      const pressure = Math.max(0, rushDiff) / 600;
      const intP = clamp(0.015 + pressure * 0.08 + (call === 'deep' ? 0.012 : 0) - (qb.b - 65) / 1800 + dc.int, 0.006, 0.07);
      const compP = clamp(prof.comp + (qb.b - 65) / 230 + (O.recv - D.cover) / 260 + dc.comp[call] - pressure * 0.3, 0.12, 0.92);
      const u = rng();
      qb.st.pa++;
      ev.air = Math.max(-2, Math.round(prof.air + gauss(rng) * prof.sd));
      if (u < intP) {
        const dbr = defender(rng, d, rng() < 0.5 ? 'CB' : 'S'); dbr.st.int++; qb.st.pint++;
        ev.turnover = true; ev.ints = true; ev.result = 'INTERCEPTION'; ev.dur = 6;
        const spot = clamp(g.ball + ev.air, 1, 99); ev.ret = Math.round(rng() * 18);
        ev.msg = `${qb.name}'s pass is INTERCEPTED by ${dbr.name}!`;
        g.ball = spot; ev.yards = 0; ev.to = spot; flip(g); g.ball = clamp(g.ball + ev.ret, 1, 99); g.toGo = Math.min(10, 100 - g.ball);
        return;
      } else if (u < intP + compP * (1 - intP)) {
        let yac = Math.max(0, gauss(rng) * 3 + 2.2 + (tgt.b - 60) / 28 + dc.yac);
        if (rng() < 0.02 * dc.big) yac += 8 + rng() * 22;
        yards = Math.round(ev.air + yac);
        ev.dur = 6; ev.stop = rng() < 0.22; qb.st.pc++; qb.st.py += yards; tgt.st.rec++; tgt.st.recy += yards;
        ev.msg = `${qb.name} completes to ${tgt.name} for ${yards}${yards === 1 ? ' yard' : ' yards'}.`;
      } else {
        yards = 0; ev.dur = 4; ev.stop = true; ev.result = 'INCOMPLETE'; ev.incomplete = true;
        ev.msg = `${qb.name}'s ${OFF_CALLS[call].toLowerCase()} to ${tgt.name} falls incomplete.`;
      }
    }
  }
  applyScrimmage(g, ev, yards);
}
function doScrimmageFallback(g, ev, off, def, timeout) { return doScrimmage(g, ev, { ...off, call: 'short' }, def, timeout); }

function applyScrimmage(g, ev, yards) {
  const side = g.poss, t = g[side];
  ev.yards = yards; ev.from = g.ball;
  const nb = g.ball + yards;
  ev.to = clamp(nb, 0, 100);
  if (ev.incomplete) { g.down++; if (g.down > 4) turnoverOnDowns(g, ev); else ev.result = ev.result || ''; return; }
  if (nb >= 100) {
    ev.td = true; ev.result = 'TOUCHDOWN'; ev.stop = true; ev.msg += ` TOUCHDOWN ${t.name}!`; addScore(g, side, 6);
    const tgt = [...allPlayers(t)].find((p) => p.uid === ev.target);
    if (tgt) { if (ev.call === 'inrun' || ev.call === 'outrun' || ev.call === 'sneak') tgt.st.rtd++; else { tgt.st.rectd++; t.players.QB[0].st.ptd++; } }
    g.ball = 100;
    if (g.ot) { endGame(g, side); return; }
    g.phase = 'try';
    return;
  }
  if (nb <= 0) {
    ev.result = 'SAFETY'; ev.stop = true; ev.msg += ' SAFETY!'; addScore(g, other(side), 2); g.ball = 0;
    if (g.ot) { endGame(g, other(side)); return; }
    g.phase = 'kickoff'; g.kicking = side; ev.safety = true;
    return;
  }
  g.ball = nb;
  if (yards >= g.toGo) { ev.fd = true; ev.result = ev.result || 'FIRST DOWN'; firstDown(g); }
  else { g.down++; g.toGo -= yards; if (g.down > 4) turnoverOnDowns(g, ev); }
}
function turnoverOnDowns(g, ev) {
  ev.turnover = true; ev.result = 'DOWNS'; ev.msg += ` Turnover on downs — ${g[other(g.poss)].name} take over.`; flip(g);
}

function doPunt(g, ev, off, timeout) {
  const side = g.poss, t = g[side], P = t.players.P[0], rng = g.rng;
  ev.call = 'punt'; ev.dur = 8; ev.runoff = g.running && !timeout ? 22 : 0; ev.from = g.ball; ev.turnover = true;
  if (rng() < 0.012) {
    ev.result = 'BLOCKED'; ev.msg = `${P.name}'s punt is BLOCKED!`; ev.yards = 0; ev.to = g.ball; flip(g); return;
  }
  const dist = Math.round(clamp(38 + (P.a - 60) / 3.2 + gauss(rng) * 5, 25, 68));
  ev.air = dist; const land = g.ball + dist;
  if (land >= 100) { ev.result = 'TOUCHBACK'; ev.msg = `${P.name} punts ${dist} — touchback.`; g.poss = other(side); g.ball = 20; ev.to = 100; }
  else {
    ev.ret = clamp(Math.round(5.5 + gauss(rng) * 4.5), 0, 28);
    ev.result = 'PUNT'; ev.msg = `${P.name} punts ${dist} yards${ev.ret ? `, returned ${ev.ret}` : ', fair catch'}.`;
    g.poss = other(side); g.ball = clamp(100 - land + ev.ret, 1, 99); ev.to = land;
  }
  g.down = 1; g.toGo = Math.min(10, 100 - g.ball);
}
function doFieldGoal(g, ev, off, timeout) {
  const side = g.poss, t = g[side], K = t.players.K[0], rng = g.rng, dist = fgDistance(g), p = fgProb(g, dist);
  ev.call = 'fg'; ev.dur = 4; ev.runoff = g.running && !timeout ? 22 : 0; ev.stop = true; ev.from = g.ball; ev.fg = { dist, p };
  K.st.fga++;
  if (dist <= 66 && rng() < p) {
    K.st.fgm++; addScore(g, side, 3); ev.result = 'FIELD GOAL'; ev.msg = `${K.name} hits a ${dist}-yard field goal!`; ev.fg.good = true; ev.score = 3;
    if (g.ot) { endGame(g, side); return; }
    g.phase = 'kickoff'; g.kicking = side;
  } else {
    ev.result = 'NO GOOD'; ev.msg = `${K.name}'s ${dist}-yard field goal is no good.`; ev.fg.good = false; ev.turnover = true;
    g.ball = clamp(g.ball - 7, 1, 99); flip(g);
    g.ball = Math.max(20, g.ball);
  }
}

// ---------- clock, periods, win probability ----------
function finish(g, ev) {
  const dur = ev.dur + ev.runoff;
  if (g.phase !== 'kickoff' || ev.type !== 'kickoff') { /* clock only runs on scrimmage-type events */ }
  if (ev.type === 'play' || ev.type === 'penalty') g.clock = Math.max(0, g.clock - dur);
  if (ev.type === 'play' || ev.type === 'penalty') g.running = !ev.stop && !ev.td && !ev.timeoutBy;
  if (ev.msg) say(g, ev.msg);
  if (ev.type === 'play' || ev.type === 'penalty') {
    (g.hist ||= []).push({ side: ev.poss, call: ev.call, dcall: ev.dcall, y: ev.yards, res: ev.result, down: ev.down, toGo: ev.toGo, ball: ev.from, td: !!ev.td, fd: !!ev.fd, to: !!ev.turnover, sk: !!ev.sk, pen: ev.type === 'penalty', q: g.quarter });
    if (g.hist.length > 220) g.hist.shift();
  }
  if (ev.type === 'play' && (ev.td || ev.safety)) g.running = false;
  g.wp.push(Math.round(fbWinProb(g) * 1000) / 1000); if (g.wp.length > 160) g.wp.shift();
  periodCheck(g);
  ev.dur = dur;
}

function periodCheck(g) {
  if (g.over || g.clock > 0) return;
  if (g.phase === 'try') return;                       // finish the try first
  if (g.ot === true) {                                  // overtime expired
    endGame(g, g.score.home === g.score.away ? 'tie' : g.score.home > g.score.away ? 'home' : 'away'); return;
  }
  if (g.quarter === 1 || g.quarter === 3) { g.quarter++; g.clock = QUARTER; say(g, `— Start of quarter ${g.quarter} —`); return; }
  if (g.quarter === 2) {
    g.quarter = 3; g.clock = QUARTER; g.timeouts = { home: 3, away: 3 };
    g.phase = 'kickoff'; g.kicking = g.recvFirst; g.running = false;
    say(g, '— Halftime. Second-half kickoff —'); return;
  }
  // end of regulation
  if (g.score.home !== g.score.away) { endGame(g, g.score.home > g.score.away ? 'home' : 'away'); return; }
  g.ot = true; g.quarter = 5; g.clock = OT_TIME; g.timeouts = { home: 2, away: 2 };
  g.kicking = g.rng() < 0.5 ? 'home' : 'away'; g.phase = 'kickoff'; g.running = false;
  say(g, `— Overtime! ${g[other(g.kicking)].name} receive. First score wins. —`);
}

const normCdf = (z) => 1 / (1 + Math.exp(-1.702 * z));
export function fbWinProb(g) {
  if (g.over) return g.winner === 'home' ? 1 : g.winner === 'away' ? 0 : 0.5;
  const rem = remainSeconds(g), margin = g.score.home - g.score.away;
  let ep = 0;
  if (g.phase !== 'try') ep = clamp(0.054 * (g.phase === 'kickoff' ? 25 : g.ball) - 1.0, -0.6, 4.5);
  const posH = (g.phase === 'kickoff' ? other(g.kicking) : g.poss) === 'home';
  const eff = margin + (posH ? ep : -ep) + (g.phase === 'try' ? (g.poss === 'home' ? 0.95 : -0.95) : 0);
  const sigma = 13.5 * Math.sqrt(Math.max(0.015, rem / (4 * QUARTER)));
  return clamp(normCdf(eff / sigma), 0.001, 0.999);
}

// ---------- AI coordinators (level 0 rookie, 1 pro, 2 all-star) ----------
export const fbLevelFor = (g, side) => (g.user && g[side] === g.user ? 1 : g.level ?? 1);

function fourthDown(g, level) {
  const tg = g.toGo, ball = g.ball, dist = fgDistance(g), fgP = dist <= 66 ? fgProb(g, dist) : 0, goP = convProb(tg);
  const side = g.poss, diff = g.score[side] - g.score[other(side)], rem = remainSeconds(g), late = g.quarter >= 4 && rem < 480;
  if (level === 0) return dist <= 46 ? 'fg' : 'punt';
  if (late && diff < 0 && rem < 240) { if (dist <= 55 && diff >= -3 && rem > 40 && fgP > 0.45 && tg > 3) return 'fg'; return ball > 25 || tg <= 6 ? 'go' : 'punt'; }
  if (dist <= 52 && fgP >= 0.55 && !(tg <= 1 && ball >= 78 && level >= 2)) return 'fg';
  if (level >= 2 && tg <= 2 && ball >= 45) return 'go';
  if (level >= 2 && tg <= 4 && ball >= 62 && fgP < 0.55) return 'go';
  if (ball >= 70 && tg <= 2 && fgP < 0.6) return 'go';
  return ball > 30 || dist > 66 ? (ball >= 50 && tg <= 1 ? 'go' : 'punt') : 'punt';
}

export function fbKickAI(g, level = 1) {
  const side = g.kicking, diff = g.score[side] - g.score[other(side)], rem = remainSeconds(g);
  return { kick: level >= 1 && !g.ot && diff < 0 && diff >= -8 && g.quarter === 4 && rem < 110 ? 'onside' : 'deep' };
}

export function fbOffAI(g, level = 1) {
  const side = actingSide(g);
  if (g.phase === 'kickoff') return fbKickAI(g, level);
  const diff = g.score[side] - g.score[other(side)], rem = remainSeconds(g), q4 = g.quarter >= 4;
  if (g.phase === 'try') {
    const post = diff; // score already includes the touchdown
    const two = level >= 2 && q4 && [-2, -5, -8, -10, 1, 4, 5].includes(post) && rem < 600;
    return { try: two ? 'two' : 'xp' };
  }
  const rng = g.rng, tg = g.toGo, d = g.down, ball = g.ball, o = { call: '', pace: 'normal' };
  const trailing = diff < 0, late = q4 && rem < 420;
  const timeouts = g.timeouts[side];
  if (late && trailing) o.pace = rem < 300 ? 'hurry' : 'normal';
  if (q4 && diff > 0 && rem < 300 && level >= 1) o.pace = 'slow';
  if (level >= 1 && trailing && q4 && rem < 130 && g.running && timeouts > 0) o.timeout = true;
  // run out the clock
  if (level >= 1 && q4 && diff > 0 && g.running) {
    const need = rem, stops = g.timeouts[other(side)] * 40;
    if (d <= 3 && need <= (4 - d + 1) * 40 - stops + 40 && ball > 2) { o.call = 'kneel'; return o; }
  }
  if (level >= 1 && q4 && trailing && rem <= 30 && !g.running && d < 4 && rem > 3 && ball < 94 && timeouts === 0) { o.call = 'spike'; return o; }
  if (d === 4) {
    const act = fourthDown(g, level);
    if (act === 'punt') { o.call = 'punt'; return o; }
    if (act === 'fg') { o.call = 'fg'; return o; }
    o.call = tg <= 2 ? (rng() < 0.6 ? 'sneak' : 'inrun') : tg <= 6 ? 'short' : 'medium'; return o;
  }
  // field-goal range at the end of a half
  if (d >= 3 && ((g.quarter === 2 && g.clock < 25) || (late && trailing && rem < 20)) && fgDistance(g) <= 54) { o.call = 'fg'; return o; }
  const pass = (c) => (o.call = c);
  const passHeavy = late && trailing;
  if (ball >= 97) pass(rng() < 0.65 ? 'inrun' : 'short');
  else if (tg <= 2 && d >= 3) pass(rng() < 0.55 ? 'sneak' : 'inrun');
  else if (d === 3 && tg >= 7) pass(tg >= 13 || passHeavy ? (rng() < 0.55 ? 'deep' : 'medium') : 'medium');
  else if (d === 2 && tg >= 9) pass(rng() < 0.7 ? 'medium' : 'short');
  else if (ball < 8) pass(rng() < 0.7 ? 'inrun' : 'short');
  else if (passHeavy) pass(rng() < 0.45 ? 'short' : rng() < 0.7 ? 'medium' : 'deep');
  else if (q4 && diff > 0 && rem < 420) pass(rng() < 0.75 ? (rng() < 0.55 ? 'inrun' : 'outrun') : 'short');
  else if (ball >= 80) pass(rng() < 0.4 ? 'inrun' : rng() < 0.7 ? 'short' : 'screen');
  else {
    const r = rng();
    o.call = r < 0.34 ? 'inrun' : r < 0.52 ? 'outrun' : r < 0.74 ? 'short' : r < 0.9 ? 'medium' : r < 0.96 ? 'deep' : 'screen';
  }
  return o;
}

export function fbDefAI(g, level = 1) {
  const side = actingSide(g);
  if (g.phase !== 'snap') return { call: 'base' };
  const def = other(side), diff = g.score[def] - g.score[side], rem = remainSeconds(g), q4 = g.quarter >= 4, rng = g.rng;
  const d = { call: 'base' };
  if (level >= 1 && def && g.running && g.timeouts[def] > 0 && diff < 0 && q4 && rem < 130) d.timeout = true;
  if (level === 0) { d.call = rng() < 0.7 ? 'base' : 'zone'; return d; }
  if (q4 && diff > 0 && diff <= 8 && rem < 100) { d.call = 'prevent'; return d; }
  if (g.toGo <= 2 && g.down >= 3 || g.ball >= 97) { d.call = 'stack'; return d; }
  if (g.toGo >= 7 && g.down >= 3) { d.call = level >= 2 && rng() < 0.4 ? 'blitz' : rng() < 0.5 ? 'zone' : 'man'; return d; }
  const r = rng();
  d.call = r < 0.4 ? 'base' : r < 0.6 ? 'zone' : r < 0.75 ? 'man' : r < 0.87 ? 'stack' : 'blitz';
  return d;
}

export function fbControlStep(g, controlled) {
  const side = actingSide(g), foe = other(side);
  const orders = {
    off: controlled.includes(g[side]) ? fbOffAI(g, fbLevelFor(g, side)) : { call: '', pace: 'normal' },
    def: controlled.includes(g[foe]) ? fbDefAI(g, fbLevelFor(g, foe)) : { call: 'base' },
  };
  return orders;
}
export function fbAutoStep(g, controlled) { return fbSnap(g, fbControlStep(g, controlled)); }
export function fbAutoPlay(g, controlled = [g.home, g.away], maxPlays = 600) { for (let n = 0; !g.over && n < maxPlays; n++) fbAutoStep(g, controlled); return g; }

// ---------- auto-mode stop rules ----------
export function fbDecisionReason(g, mine, rules = {}) {
  if (g.over || !mine) return null;
  const side = actingSide(g), me = g[side] === mine;
  if (g.phase === 'try' && me && rules.score !== false) return 'Extra point or go for two?';
  if (g.phase === 'snap' && g.poss && g[g.poss] === mine) {
    if (rules.fourth && g.down === 4) return `4th and ${Math.round(g.toGo)}`;
    if (rules.redzone && g.ball >= 80 && g.down === 1) return 'Red zone';
  }
  if (g.phase === 'snap' && rules.twominute && g.quarter >= 4 && g.clock < 120 && Math.abs(g.score.home - g.score.away) <= 8) return 'Two-minute drill';
  if (g.phase === 'kickoff' && g.kicking && g[g.kicking] === mine && g.quarter >= 4 && g.clock < 150 && g.score[g.kicking] < g.score[other(g.kicking)] && rules.twominute) return 'Onside kick?';
  return null;
}

// ---------- season stats ----------
export function commitFbGame(g) {
  for (const t of [g.home, g.away]) for (const p of allPlayers(t)) for (const k of Object.keys(p.st)) p.ss[k] += p.st[k];
}

// ---------- the coach ----------
export function fbAdvise(g, mine, ui = {}) {
  if (!g || g.over || !mine) return [];
  const side = actingSide(g), me = g[side] === mine, out = [];
  const add = (key, icon, title, why, apply, pri) => out.push({ key, icon, title, why, apply, pri });
  const mySide = g.home === mine ? 'home' : 'away', diff = g.score[mySide] - g.score[other(mySide)], rem = remainSeconds(g), q4 = g.quarter >= 4;
  if (g.phase === 'kickoff') {
    if (me && q4 && diff < 0 && diff >= -8 && rem < 150 && ui.kick !== 'onside') add('onside', '🎯', 'Try an onside kick', 'You need the ball back and time is short. About a 14% chance, but it is your best shot.', { ui: { kick: 'onside' } }, 80);
    return out;
  }
  if (g.phase === 'try') {
    if (me) {
      const post = diff, goFor2 = q4 && [-2, -5, -8, -10, 1, 4, 5].includes(post) && rem < 600;
      if (goFor2) add('two', '2️⃣', 'Go for two', `At ${post > 0 ? '+' : ''}${post} a two-point try changes what you need late in the game.`, { ui: { try: 'two' } }, 80);
      else add('xp', '🦵', 'Kick the extra point', 'The safe, standard choice (about 94%).', { ui: { try: 'xp' } }, 40);
    }
    return out;
  }
  const O = units(g[side]), D = units(g[other(side)]), tg = Math.round(g.toGo);
  if (me) {
    if (g.down === 4) {
      const dist = fgDistance(g), fgP = dist <= 66 ? fgProb(g, dist) : 0, goP = convProb(g.toGo);
      const act = fourthDown(g, 2);
      if (act === 'fg') add('fg', '🥅', `Kick the ${dist}-yard field goal`, `About ${Math.round(fgP * 100)}% to make it. Take the points.`, { ui: { call: 'fg' } }, 90);
      else if (act === 'go') add('go', '💪', `Go for it (4th & ${tg})`, `About ${Math.round(goP * 100)}% to convert — the odds and the field position favour going.`, { ui: { call: g.toGo <= 2 ? 'sneak' : g.toGo <= 6 ? 'short' : 'medium' } }, 90);
      else add('punt', '👢', 'Punt', `4th & ${tg} from your ${g.ball <= 50 ? 'own' : 'opponent\'s'} ${Math.min(g.ball, 100 - g.ball)} — flip the field.`, { ui: { call: 'punt' } }, 90);
    }
    if (g.down < 4) {
      if (g.toGo <= 2 && g.down >= 3 && g.ball < 98) add('sneak', '🐗', 'QB sneak', `Only ${tg} to go — about ${Math.round(clamp(0.7 + (O.runBlock - D.runStop) / 150, 0.35, 0.9) * 100)}% to get it.`, { ui: { call: 'sneak' } }, 70);
      else if (g.down === 3 && tg >= 7) add('long', '🎯', 'Throw it past the sticks', `3rd & ${tg}: a medium pass (about ${Math.round(clamp(0.58 + (O.recv - D.cover) / 260, 0.3, 0.8) * 100)}% to complete) gives you a chance.`, { ui: { call: 'medium' } }, 65);
      else if (g.ball >= 80 && g.down === 1) add('rz', '🚩', 'Red zone: short & quick', 'Space is tight inside the 20 — short passes and inside runs.', { ui: { call: 'short' } }, 40);
      else if (O.passBlock - D.passRush >= 8) add('pbk', '🛡️', 'Your line can protect: go deep', `Your pass blocking beats their rush by ${Math.round(O.passBlock - D.passRush)} — take a shot.`, { ui: { call: 'deep' } }, 38);
      else if (O.runBlock - D.runStop >= 8) add('rbk', '🏃', 'Run it', `Your run blocking beats their run stop by ${Math.round(O.runBlock - D.runStop)}.`, { ui: { call: 'inrun' } }, 38);
    }
    if (q4 && diff < 0 && rem < 300 && ui.pace !== 'hurry') add('hurry', '⏩', 'No-huddle: hurry up', 'Trailing late — snap quickly to save clock.', { ui: { pace: 'hurry' } }, 60);
    if (q4 && diff < 0 && rem < 130 && g.running && g.timeouts[side] > 0 && !ui.timeout) add('to', '⏱️', 'Use a timeout', 'The clock is running and you are behind.', { ui: { timeout: true } }, 62);
    if (q4 && diff > 0 && rem < 300 && ui.pace !== 'slow') add('slow', '🐢', 'Slow it down', 'You lead — drain the clock.', { ui: { pace: 'slow' } }, 55);
    if (q4 && diff > 0 && g.running && g.down <= 3 && rem <= (4 - g.down + 1) * 40 - g.timeouts[other(side)] * 40 + 40) add('kneel', '🧎', 'Kneel to end the game', 'You can run out the clock without risking a turnover.', { ui: { call: 'kneel' } }, 85);
    if (q4 && diff < 0 && rem <= 30 && !g.running && g.down < 4 && g.timeouts[side] === 0) add('spike', '🏐', 'Spike the ball', 'Stop the clock and set up a final play.', { ui: { call: 'spike' } }, 70);
  } else {
    if (q4 && diff > 0 && diff <= 8 && rem < 100 && ui.call !== 'prevent') add('prev', '🛑', 'Prevent defense', 'Protect the lead — don\'t give up the big play.', { ui: { call: 'prevent' } }, 75);
    else if (g.toGo <= 2 && g.down >= 3 && ui.call !== 'stack') add('stack', '🧱', 'Stack the box', `${tg} to go — stop the run at the line.`, { ui: { call: 'stack' } }, 60);
    else if (g.toGo >= 8 && g.down >= 3 && ui.call !== 'blitz') add('blitz', '⚡', 'Send a blitz', `3rd & long: pressure the passer. Your rush is ${Math.round(units(mine).passRush - units(g[side]).passBlock) >= 0 ? 'better' : 'weaker'} than their blocking, so it ${units(mine).passRush >= units(g[side]).passBlock ? 'should pay off' : 'is a gamble'}.`, { ui: { call: 'blitz' } }, 52);
    else if (g.toGo >= 8 && g.down >= 3 && ui.call !== 'zone') add('zone', '🔷', 'Play zone', 'Keep everything in front of you on a long down.', { ui: { call: 'zone' } }, 45);
    if (q4 && diff < 0 && rem < 130 && g.running && g.timeouts[other(side)] > 0 && !ui.timeout) add('dto', '⏱️', 'Take a timeout', 'You are behind and the clock keeps running.', { ui: { timeout: true } }, 62);
  }
  return out.sort((a, b) => b.pri - a.pri).slice(0, 3);
}

export function fbReviveGame(g) { return g ? attachRng(g) : g; }
