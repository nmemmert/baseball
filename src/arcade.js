// Skipper Gridiron: football you actually PLAY (not coach). Real-time 7-on-7 simulation.
// Pure logic, no DOM, so it can run headless in tests. The field is always in the *offence frame*:
// the team with the ball attacks toward +y (the far goal line at y = GOAL), whoever that is.
export const W = 36, LEN = 120, EZ = 10, GOAL = 110, CX = 18;

export const LEVELS = [
  { id: 0, name: 'Rookie', dSpd: 0.9, tkl: -0.1, cover: 0.8, rush: 0.7, qb: 0.8 },
  { id: 1, name: 'Pro', dSpd: 0.97, tkl: 0, cover: 1, rush: 1, qb: 1 },
  { id: 2, name: 'All-Pro', dSpd: 1.03, tkl: 0.07, cover: 1.2, rush: 1.3, qb: 1.15 },
];

export const OFF_PLAYS = {
  run_in: { n: 'Inside Run', ic: '🏈', run: true, d: 'Hand it to the back up the middle. Steady 3–5 yards.' },
  run_out: { n: 'Outside Run', ic: '💨', run: true, d: 'Sweep to the edge. Needs speed and a juke.' },
  pass_quick: { n: 'Quick Pass', ic: '🎯', d: 'Fast throws to short routes. Beats the blitz.' },
  pass_deep: { n: 'Deep Pass', ic: '🚀', d: 'Go routes. Big play, but it takes time.' },
  screen: { n: 'Screen', ic: '🪤', d: 'Dump it to the back behind blockers. Beats a pass rush.' },
};
export const DEF_CALLS = {
  base: { n: 'Balanced', ic: '🛡️', d: 'Rush four, cover the rest.' },
  blitz: { n: 'Blitz', ic: '⚡', d: 'Send the linebackers. Sacks or big plays.' },
  zone: { n: 'Deep Zone', ic: '☂️', d: 'Stay deep. No big plays, but short ones are open.' },
  runstop: { n: 'Stack the Box', ic: '🧱', d: 'Everyone near the line. Stuffs the run.' },
};

// role ratings: spd in yards/second
const RT = {
  QB: { spd: 6.0, hands: 0.6, brk: 0.15, tkl: 0.2, acc: 0.82 },
  RB: { spd: 7.4, hands: 0.7, brk: 0.3, tkl: 0.3 },
  WR1: { spd: 7.9, hands: 0.8, brk: 0.18, tkl: 0.25 },
  WR2: { spd: 7.7, hands: 0.77, brk: 0.18, tkl: 0.25 },
  TE: { spd: 6.6, hands: 0.74, brk: 0.28, tkl: 0.3 },
  OL1: { spd: 4.6, hands: 0.3, brk: 0.2, tkl: 0.3 },
  OL2: { spd: 4.6, hands: 0.3, brk: 0.2, tkl: 0.3 },
  DL1: { spd: 6.6, hands: 0.3, brk: 0.2, tkl: 0.64 },
  DL2: { spd: 6.6, hands: 0.3, brk: 0.2, tkl: 0.64 },
  LB1: { spd: 7.7, hands: 0.45, brk: 0.2, tkl: 0.68 },
  LB2: { spd: 7.7, hands: 0.45, brk: 0.2, tkl: 0.68 },
  CB1: { spd: 8.1, hands: 0.55, brk: 0.2, tkl: 0.56 },
  CB2: { spd: 8.1, hands: 0.55, brk: 0.2, tkl: 0.56 },
  S: { spd: 8.0, hands: 0.58, brk: 0.2, tkl: 0.62 },
};
const NUM = { QB: 12, RB: 28, WR1: 81, WR2: 84, TE: 87, OL1: 66, OL2: 72, DL1: 94, DL2: 91, LB1: 54, LB2: 58, CB1: 24, CB2: 31, S: 21 };

export const OPPONENTS = [
  { name: 'Prairie Bison', col: '#9a6a34', str: 0.96 }, { name: 'Lakeshore Gulls', col: '#cfd6e2', str: 0.97 }, { name: 'Bay Sharks', col: '#139a98', str: 0.99 },
  { name: 'Harbor Hawks', col: '#c0392b', str: 1.0 }, { name: 'Mesa Scorpions', col: '#e0701f', str: 1.02 }, { name: 'Capital Wolves', col: '#7b4bc2', str: 1.04 }, { name: 'Forge', col: '#d9a21b', str: 1.06 },
];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const other = (t) => (t === 'U' ? 'C' : 'U');
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function rnd(g) { let t = (g.rs = (g.rs + 0x6D2B79F5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const gauss = (g) => { let s = 0; for (let i = 0; i < 4; i++) s += rnd(g); return (s - 2) * 1.73; };
const blankIn = () => ({ mx: 0, my: 0, sprint: false, juke: false, stiff: false, tackle: false, swat: false, sw: false, throw: -1, away: false, kick: false, hike: false });
const banner = (g, t, s = '', c = 'info') => g.ev.push({ k: 'banner', t, s, c });
const sfx = (g, n) => g.ev.push({ k: 'sfx', n });
const ord = (n) => `${n}${['th', 'st', 'nd', 'rd'][n > 3 && n < 21 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
export const spotText = (f) => (f === 50 ? 'midfield' : f < 50 ? `own ${f}` : `opp ${100 - f}`);

const FIRST = 'ABCDEFGHJKLMNPRSTW', LAST = ['Reyes', 'Brooks', 'Okafor', 'Lindqvist', 'Moreno', 'Tanaka', 'Walsh', 'Dubois', 'Petrov', 'Hayes', 'Castillo', 'Nguyen', 'Foster', 'Ibarra', 'Kowalski', 'Mensah', 'Rowe', 'Shaw', 'Vance', 'Zimmer', 'Bell', 'Cruz', 'Doyle', 'Eaton'];
const lvlFor = (lv, str = 1) => (str === 1 ? LEVELS[lv] : { ...LEVELS[lv], dSpd: LEVELS[lv].dSpd * str, tkl: LEVELS[lv].tkl + (str - 1) * 0.6, cover: LEVELS[lv].cover * str, qb: LEVELS[lv].qb * str, rush: LEVELS[lv].rush * str });
function makeRoster(g) { const r = { U: {}, C: {} }; for (const t of ['U', 'C']) for (const role of Object.keys(RT)) r[t][role] = `${FIRST[Math.floor(rnd(g) * FIRST.length)]}. ${LAST[Math.floor(rnd(g) * LAST.length)]}`; return r; }

export function newArcade(o = {}) {
  const lv = o.level ?? 1, qlen = o.qlen || 240, str = o.opp?.str ?? 1;
  const g = {
    rs: ((o.seed ?? (Date.now() & 0x7fffffff)) >>> 0) || 1, lv, str, level: lvlFor(lv, str), qlen, q: 1, clock: qlen, ot: false,
    score: { U: 0, C: 0 }, names: { U: o.name || 'You', C: o.opp?.name || 'Hawks' }, col: { U: o.col || '#2b6cb0', C: o.opp?.col || '#c0392b' },
    off: 'U', f: 25, down: 1, toGo: 10, firstAt: 35, phase: 'call', timer: 0, play: null, defCall: null, plan: null,
    pl: [], r: {}, carrier: null, mode: 'idle', t: 0, los: 35, turn: false, hand: false, tgt: null, fl: null, ev: [], in: blankIn(), auto: !!o.auto,
    over: false, qEnd: false, baitT: 0, swatT: -9, ctlId: -1, ctlT: 0, open: {}, drive: [],
    stat: { U: { rush: 0, pass: 0, comp: 0, att: 0, ints: 0, sacks: 0, td: 0, brk: 0, tkl: 0, fum: 0, pts: 0 }, C: { rush: 0, pass: 0, comp: 0, att: 0, ints: 0, sacks: 0, td: 0, brk: 0, tkl: 0, fum: 0, pts: 0 } },
    last: '', log: [], plays: 0, to: { U: 3, C: 3 }, hurry: false, lastRunoff: 0, twoPt: null, drill: o.drill || null,
  };
  g.roster = makeRoster(g);
  if (o.start) Object.assign(g, o.start);
  startCall(g);
  return g;
}
const SNAP = ['rs', 'lv', 'str', 'qlen', 'q', 'clock', 'ot', 'score', 'names', 'col', 'off', 'f', 'down', 'toGo', 'firstAt', 'stat', 'plays', 'to', 'hurry', 'roster'];
export function snapshot(g) { if (!g || g.phase !== 'call' || g.twoPt || g.over || g.drill) return null; const o = {}; for (const k of SNAP) o[k] = JSON.parse(JSON.stringify(g[k] ?? null)); return o; }
export function resumeArcade(sn, auto = false) {
  const g = newArcade({ seed: sn.rs, level: sn.lv, qlen: sn.qlen, auto });
  for (const k of SNAP) g[k] = JSON.parse(JSON.stringify(sn[k]));
  g.level = lvlFor(g.lv, g.str ?? 1); g.lastRunoff = 0; startCall(g); return g;
}

/* ------------------------------ situation / calling ------------------------------ */
function toGoNow(g) { return Math.min(g.toGo, 100 - g.f); }
export function downText(g) { const tg = 100 - g.f <= g.toGo ? 'Goal' : g.toGo; return `${ord(g.down)} & ${tg}`; }

function startCall(g) {
  g.phase = 'call'; g.play = null; g.defCall = null; g.mode = 'idle'; g.carrier = null; g.fl = null; g.turn = false;
  g.plan = null; g.hint = null;
  if (g.off === 'C') {
    g.plan = cpuPlan(g);
    if (g.plan === 'punt' || g.plan === 'fg') { banner(g, g.plan === 'punt' ? `${g.names.C} punt` : `${g.names.C} line up a field goal`, '', 'info'); return special(g, g.plan, 'C'); }
  }
  g.defCall = g.off === 'C' ? null : cpuDef(g);
  g.play = g.off === 'U' ? null : g.plan;
  previewFormation(g);
  g.hint = coachHint(g);
  if (g.auto) autoCall(g);
}

function previewFormation(g) { const pp = g.play, dc = g.defCall; g.play = pp || (g.off === 'U' ? 'pass_quick' : g.plan); g.defCall = dc || 'base'; setupPlay(g); g.play = pp; g.defCall = dc; g.phase = 'call'; g.mode = 'idle'; g.carrier = null; }

export function call(g, id) {
  if (g.phase === 'pat') { if (id === 'kick1') return patKick(g, g.patTeam); if (id === 'go2') return startTwo(g, g.patTeam); return false; }
  if (g.phase !== 'call') return false;
  if (id === 'timeout') {
    if (g.to.U > 0 && g.lastRunoff > 0) { g.clock = Math.min(g.qlen, g.clock + g.lastRunoff); g.lastRunoff = 0; g.to.U--; banner(g, 'TIMEOUT', `${g.to.U} left this half`, 'info'); sfx(g, 'whistle'); return true; }
    return false;
  }
  if (id === 'hurry') { g.hurry = !g.hurry; return true; }
  if (g.off === 'U') {
    if (id === 'punt' || id === 'fg') { if (g.down !== 4 && id === 'punt') return false; return special(g, id, 'U'); }
    if (!OFF_PLAYS[id]) return false;
    g.play = id; g.defCall = cpuDef(g);
  } else {
    if (!DEF_CALLS[id]) return false;
    g.defCall = id; g.play = g.plan;
  }
  setupPlay(g); g.phase = 'set'; g.timer = 0.85; g.hintShown = false; g.waitHike = !g.auto;
  return true;
}
/** Back out of a chosen play to the play screen (before the snap). */
export function uncall(g) {
  if (g.phase !== 'set' || !g.waitHike) return false;
  g.waitHike = false; g.play = g.off === 'U' ? null : g.plan; g.phase = 'call'; previewFormation(g); g.hint = coachHint(g); return true;
}

function weighted(g, w) { const ks = Object.keys(w); let tot = 0; for (const k of ks) tot += w[k]; let r = rnd(g) * tot; for (const k of ks) { r -= w[k]; if (r <= 0) return k; } return ks[0]; }
function trailBy(g, t) { return g.score[other(t)] - g.score[t]; }
function late(g) { return (g.q === 2 || g.q >= 4) && g.clock < 50; }

export function bestOff(g) {
  const tg = toGoNow(g), w = { run_in: 2.2, run_out: 1.2, pass_quick: 2, pass_deep: 1.1, screen: 0.6 };
  if (tg >= 8) { w.run_in *= 0.35; w.run_out *= 0.5; w.pass_quick *= 1.5; w.pass_deep *= 1.5; w.screen *= 1.2; }
  if (tg <= 2) { w.run_in *= 3; w.run_out *= 1.4; w.pass_deep *= 0.5; w.screen *= 0.3; }
  if (100 - g.f <= 8) { w.pass_deep *= 0.3; w.run_out *= 0.6; }
  if (late(g) && trailBy(g, g.off) > 0) { w.run_in *= 0.25; w.run_out *= 0.3; w.pass_quick *= 1.8; w.pass_deep *= 1.4; }
  if (late(g) && trailBy(g, g.off) < 0) { w.run_in *= 2.2; w.run_out *= 1.5; w.pass_deep *= 0.2; }
  return w;
}
function cpuOff(g) { return weighted(g, bestOff(g)); }
function cpuDef(g) {
  const tg = toGoNow(g), w = { base: 4, blitz: 1.4, zone: 1.4, runstop: 1 };
  if (tg <= 2) w.runstop += 2.5; if (tg >= 8) { w.blitz += 1; w.zone += 1.2; } if (g.down === 3 && tg >= 6) w.blitz += 1;
  if (late(g) && trailBy(g, other(g.off)) < 0) { w.zone += 3; w.blitz *= 0.3; }
  return weighted(g, w);
}
function cpuPlan(g) {
  if (g.down === 4) {
    const fgDist = 100 - g.f + 17, tg = toGoNow(g), tr = trailBy(g, 'C');
    const desperate = late(g) && tr > 3 && (g.q >= 4);
    if (fgDist <= 46 && !(desperate && tr > 3)) return 'fg';
    if (tg <= 2 && g.f > 40) return cpuOff(g);
    if (desperate || (tg <= 1 && g.f > 55)) return cpuOff(g);
    if (g.f < 62) return 'punt';
    return fgDist <= 53 ? 'fg' : 'punt';
  }
  return cpuOff(g);
}
function autoCall(g) {
  if (g.off === 'U') {
    if (g.down === 4) { const p = cpuPlan(g); if (p === 'punt' || p === 'fg') return call(g, p); return call(g, p); }
    return call(g, cpuOff(g));
  }
  return call(g, cpuDef(g));
}

function coachHint(g) {
  if (g.off === 'U') {
    const tg = toGoNow(g);
    if (g.down === 4) { const fg = 100 - g.f + 17; return fg <= 48 ? `4th down. A ${fg}-yard field goal is in range.` : tg <= 2 ? '4th and short. Go for it with a run.' : 'Long 4th down. Punt it away.'; }
    if (tg <= 2) return `Only ${tg} to go. Inside Run is the safe call.`;
    if (tg >= 9) return `${tg} to go. Pass the ball. A run won't get there.`;
    if (late(g) && trailBy(g, 'U') > 0) return 'Clock is running and you trail. Throw and get out of bounds.';
    return 'Mix it up. They cannot guess a mix of run and pass.';
  }
  const tg = toGoNow(g);
  if (tg <= 2) return 'Short yardage. Stack the Box.';
  if (tg >= 8) return 'They need a lot of yards. Blitz or play Deep Zone.';
  return 'Balanced is safest. Watch for the run on early downs.';
}

/* -------------------------------- play set-up -------------------------------- */
function setupPlay(g) {
  const L = 10 + g.f, o = g.off, d = other(o), meta = OFF_PLAYS[g.play], call = g.defCall, lv = g.level;
  g.pl = []; g.r = {}; g.los = L; g.t = 0; g.turn = false; g.hand = false; g.tgt = null; g.fl = null; g.qEnd = false; g.ctlId = -1; g.swatT = -9;
  g.baitT = g.play === 'screen' ? 1.15 : 0; g.bTeam = o; g.open = {}; g.caught = false; g.carrierLast = null;
  const pass = !meta.run, deep = g.play === 'pass_deep', shot = pass || g.play === 'screen';
  const mk = (team, side, role, x, y) => {
    const r = RT[role], cpuD = team === 'C' && side === 'D', cpuO = team === 'C' && side === 'O';
    const p = {
      id: g.pl.length, team, side, role, num: NUM[role], name: g.roster[team][role], x, y, hx: x, hy: y, vx: 0, vy: 0, face: side === 'O' ? 1 : -1, spd: r.spd * (cpuD ? lv.dSpd : 1),
      hands: r.hands, brk: r.brk, tkl: r.tkl + (cpuD ? lv.tkl : 0), acc: (r.acc || 0.5) * (cpuO ? lv.qb : 1), st: 1, stun: 0, cd: 0, jk: 0, jcd: 0, stiff: 0, scd: 0,
      lunge: 0, lcd: 0, slow: 0, eng: -1, blk: false, asg: -1, hold: 0, route: null, ri: 0, lx: 0, ly: 1,
    };
    g.pl.push(p); g.r[side + role] = p; return p;
  };
  const qb = mk(o, 'O', 'QB', CX, shot ? L - 4.8 : L - 2.3);
  const rb = mk(o, 'O', 'RB', shot ? CX + 2.8 : CX, shot ? L - 4.8 : L - 5.8);
  const w1 = mk(o, 'O', 'WR1', 3.6, L - 0.8), w2 = mk(o, 'O', 'WR2', 32.4, L - 0.8), te = mk(o, 'O', 'TE', 24.4, L - 0.8);
  const o1 = mk(o, 'O', 'OL1', 15.6, L - 0.7), o2 = mk(o, 'O', 'OL2', 20.4, L - 0.7);
  const dy = call === 'blitz' ? { DL: 1.1, LB: 3, CB: 4.5, S: 10 } : call === 'zone' ? { DL: 1.2, LB: 5.2, CB: 7.5, S: 13.5 } : call === 'runstop' ? { DL: 1.1, LB: 2.9, CB: 3.8, S: 7.5 } : { DL: 1.2, LB: 4.4, CB: 5.2, S: 11 };
  const Y = (k) => Math.min(LEN - 2, L + dy[k]);
  const d1 = mk(d, 'D', 'DL1', 15.6, Y('DL')), d2 = mk(d, 'D', 'DL2', 20.4, Y('DL'));
  const l1 = mk(d, 'D', 'LB1', 12.5, Y('LB')), l2 = mk(d, 'D', 'LB2', 24, Y('LB'));
  const c1 = mk(d, 'D', 'CB1', 4.6, Y('CB')), c2 = mk(d, 'D', 'CB2', 31.4, Y('CB')), s = mk(d, 'D', 'S', CX, Y('S'));
  qb.blk = false;
  // blockers
  const blockers = pass ? (g.play === 'screen' ? [o1, o2, te] : [o1, o2]) : [o1, o2, te, w1, w2];
  for (const b of blockers) b.blk = true;
  o1.asg = d1.id; o2.asg = d2.id; te.asg = l2.id; w1.asg = c1.id; w2.asg = c2.id;
  // routes
  const rt = (p, pts) => { const sg = p.hx < CX ? 1 : -1; p.route = pts.map(([ix, oy, dy2]) => ({ x: p.hx + sg * ix + (oy || 0) * -sg * 0, y: p.hy + dy2 })); p.ri = 0; };
  const R = (p, pts) => { const sg = p.hx < CX ? 1 : -1; p.route = pts.map(([dx, dyy]) => ({ x: clamp(p.hx + dx * sg, 1.5, W - 1.5), y: p.hy + dyy })); p.ri = 0; }; // dx > 0 = toward the middle
  void rt;
  if (g.play === 'pass_quick') { R(w1, [[0, 2.5], [5.5, 6.5]]); R(w2, [[0, 6.5], [0, 5.5]]); R(te, [[0, 3], [-4.5, 4]]); R(rb, [[-6, 1.2]]); }
  else if (g.play === 'pass_deep') { R(w1, [[0, 34]]); R(w2, [[0, 12], [7, 30]]); R(te, [[0, 10], [0, 9]]); R(rb, [[-6.5, 1.2]]); }
  else if (g.play === 'screen') { R(rb, [[-2.5, -0.4], [-7, 0.3]]); R(w1, [[0, 26]]); R(w2, [[0, 26]]); }
  else {
    const sgn = rb.hx < CX ? 1 : -1, hx = g.play === 'run_out' ? CX + 9 * (rnd(g) < 0.5 ? 1 : -1) : CX + (rnd(g) - 0.5) * 5;
    rb.route = [{ x: hx, y: g.play === 'run_out' ? L - 3.2 : L + 0.4 }]; rb.ri = 0; void sgn;
  }
  g.carrier = qb; g.mode = pass ? 'drop' : 'handoff';
  for (const p of g.pl) { p.vx = p.vy = 0; }
  return g;
}

/* -------------------------------- special teams -------------------------------- */
function special(g, kind, team) {
  g.phase = 'kick'; g.timer = 1.9; g.carrier = null; g.mode = 'idle';
  if (kind === 'fg') {
    const dst = 100 - g.f + 17;
    if (team === 'U' && !g.auto) { g.phase = 'meter'; g.meter = { x: 0, dir: 1, speed: 1.35, dst, t: 0 }; g.timer = 0; return; }
    return finishFG(g, team, dst, team === 'U' ? 0.85 : 0.9);
  }
  // punt
  const net = Math.round(36 + rnd(g) * 16), land = g.f + net, o = other(team);
  let f2, txt;
  if (land >= 100) { f2 = 20; txt = `Punt, touchback. ${g.names[o]} start at their 20.`; }
  else { const ret = Math.floor(rnd(g) * 9); f2 = Math.min(99, 100 - land + ret); txt = `${net}-yard punt${ret ? `, returned ${ret}` : ''}. ${g.names[o]} ball at ${spotText(f2)}.`; }
  g.kickInfo = { icon: '🦵', title: 'PUNT', text: txt };
  g.after = () => giveBall(g, o, f2);
  sfx(g, 'kick');
}
function finishFG(g, team, dst, skill) {
  const base = dst <= 30 ? 0.97 : dst <= 40 ? 0.9 - (dst - 30) * 0.005 : dst <= 50 ? 0.84 - (dst - 40) * 0.02 : dst <= 58 ? 0.64 - (dst - 50) * 0.05 : 0.15;
  const p = clamp(base * (0.5 + skill * 0.55), 0, 0.99), made = rnd(g) < p, o = other(team);
  if (made) {
    addScore(g, team, 3);
    g.kickInfo = { icon: '🥅', title: 'FIELD GOAL IS GOOD', text: `${dst}-yard kick. +3 for ${g.names[team]}.`, c: 'good' };
    g.after = () => kickoff(g, o);
  } else {
    const f2 = Math.max(20, 100 - g.f);
    g.kickInfo = { icon: '❌', title: 'NO GOOD', text: `${dst}-yard attempt misses. ${g.names[o]} take over at ${spotText(f2)}.`, c: 'bad' };
    g.after = () => giveBall(g, o, f2);
  }
  g.phase = 'kick'; g.timer = 2.1; sfx(g, made ? 'kick' : 'out');
}
function stepMeter(g, dt) {
  const m = g.meter; m.t += dt; m.x += m.dir * m.speed * dt;
  if (m.x >= 1) { m.x = 1; m.dir = -1; } else if (m.x <= 0) { m.x = 0; m.dir = 1; }
  if (g.in.kick || m.t > 7) {
    const err = Math.abs(m.x - 0.5);
    const skill = err < 0.05 ? 1.0 : err < 0.12 ? 0.85 : err < 0.25 ? 0.6 : 0.3;
    finishFG(g, 'U', m.dst, skill * 1.0 + 0.0);
    g.kickInfo.sub = err < 0.05 ? 'PERFECT TIMING' : err < 0.12 ? 'Good timing' : err < 0.25 ? 'Slightly off' : 'Poor timing';
  }
}
function giveBall(g, team, f) {
  g.off = team; g.f = clamp(Math.round(f), 1, 99); g.down = 1; g.toGo = Math.min(10, 100 - g.f); g.firstAt = g.f + 10; g.drive = [];
  if (g.qEnd2) { g.qEnd2 = false; }
  nextOrEnd(g);
}
function kickoff(g, receiver) {
  const f = 22 + Math.floor(rnd(g) * 11);
  g.kickInfo = { icon: '🏟️', title: 'KICKOFF', text: `${g.names[receiver]} start at ${spotText(f)}.` };
  g.phase = 'kick'; g.timer = 1.7; g.after = () => giveBall(g, receiver, f); sfx(g, 'kick');
}
function addScore(g, team, pts) {
  g.score[team] += pts; g.stat[team].pts += pts; sfx(g, pts >= 6 ? 'td' : 'kick');
  if (g.ot) g.otDone = true;
}

/* -------------------------------- main step -------------------------------- */
export function step(g, dt) {
  if (g.over) return;
  switch (g.phase) {
    case 'call': if (g.auto) autoCall(g); settle(g, dt); break;
    case 'set':
      settle(g, dt);
      if (g.waitHike && !g.auto) { if (g.in.hike) { g.waitHike = false; g.timer = 0.45; } break; }
      g.timer -= dt; if (g.timer <= 0) { g.phase = 'live'; g.t = 0; sfx(g, 'snap'); } break;
    case 'live': stepLive(g, dt); break;
    case 'dead': g.timer -= dt; coast(g, dt); if (g.timer <= 0) advance(g); break;
    case 'kick': g.timer -= dt; if (g.timer <= 0) { const a = g.after; g.after = null; g.kickInfo = null; if (a) a(); } break;
    case 'meter': stepMeter(g, dt); break;
    default: break;
  }
  const i = g.in; i.juke = i.stiff = i.tackle = i.swat = i.sw = i.away = i.kick = i.hike = false; i.throw = -1;
}
function settle(g, dt) { for (const p of g.pl) { p.vx *= 0.8; p.vy *= 0.8; } void dt; }
function coast(g, dt) { for (const p of g.pl) { p.vx *= 0.9; p.vy *= 0.9; p.x += p.vx * dt; p.y += p.vy * dt; } }

function nextOrEnd(g) {
  if (g.over) return;
  if (g.otDone) return finish(g);
  if (g.qEnd || g.clock <= 0) return endQuarter(g);
  startCall(g);
}
function advance(g) {
  if (g.over) return;
  if (g.pendingAfter) { const a = g.pendingAfter; g.pendingAfter = null; return a(); }
  if (g.otDone) return finish(g);
  if (g.qEnd || g.clock <= 0) return endQuarter(g);
  startCall(g);
}
function endQuarter(g) {
  g.qEnd = false;
  if (g.ot) return finish(g);
  if (g.q === 1 || g.q === 3) { g.q++; g.clock = g.qlen; banner(g, `END OF QUARTER ${g.q - 1}`, 'Switching ends', 'info'); return startCall(g); }
  if (g.q === 2) { g.q = 3; g.clock = g.qlen; g.to = { U: 3, C: 3 }; banner(g, 'HALFTIME', 'Second half: they get the ball', 'info'); g.kickInfo = null; return kickoff(g, 'C'); }
  if (g.score.U === g.score.C) {
    g.ot = true; g.q = 5; g.clock = 120; banner(g, 'OVERTIME', 'First score wins', 'good');
    return kickoff(g, rnd(g) < 0.5 ? 'U' : 'C');
  }
  finish(g);
}
function finish(g) {
  g.over = true; g.phase = 'over'; g.carrier = null;
  const w = g.score.U > g.score.C ? 'U' : g.score.C > g.score.U ? 'C' : null; g.winner = w;
  g.ev.push({ k: 'over', winner: w });
}

/* ------------------------------ control / input ------------------------------ */
function users(g) { return g.pl.filter((p) => p.team === 'U'); }
function chasersOf(g, car) { return g.pl.filter((p) => p.team !== car.team); }
function mates(g, car) { return g.pl.filter((p) => p.team === car.team && p !== car); }

function pickCtl(g, dt) {
  if (g.auto) return null;
  const car = g.carrier;
  g.ctlT -= dt;
  if (g.mode === 'handoff') return g.off === 'U' ? g.r.ORB : null;
  if (car && car.team === 'U') return car;
  if (g.mode === 'air' && g.fl) {
    if (g.off === 'U' && !g.turn) return g.tgt;
    const land = { x: g.fl.tx, y: g.fl.ty };
    return nearestTo(users(g).filter((p) => p.side === 'D' || g.turn), land, g.pl[g.ctlId], g);
  }
  if (car && car.team === 'C') {
    if (g.in.sw) { g.in.sw = false; const sorted = users(g).slice().sort((a, b) => dist(a, car) - dist(b, car)); const cur = sorted.findIndex((p) => p.id === g.ctlId); g.ctlId = sorted[(cur + 1) % sorted.length].id; g.ctlT = 1.6; }
    if (g.ctlT <= 0 || g.ctlId < 0) { g.ctlId = nearestTo(users(g), car, g.pl[g.ctlId], g).id; g.ctlT = 0.2; }
    return g.pl[g.ctlId];
  }
  return null;
}
function nearestTo(list, pt, cur, g) {
  let best = null, bd = Infinity;
  for (const p of list) { let d = dist(p, pt); if (cur && p.id === cur.id) d -= 1.4; if (d < bd) { bd = d; best = p; } }
  if (g && best) g.ctlId = best.id;
  return best;
}

function userMove(g, p, dt) {
  const i = g.in, mag = Math.hypot(i.mx, i.my), k = mag < 0.12 ? 0 : Math.min(1, mag);
  const sp = i.sprint && k > 0 && p.st > 0.04;
  p.st = clamp(p.st + (sp ? -0.5 : 0.18) * dt, 0, 1);
  if (k === 0 && p.role === 'RB' && g.mode === 'handoff') return aiMove(g, p, dt);
  return { dir: k ? [(i.mx / mag) * k, (i.my / mag) * k] : [0, 0], boost: sp ? 1.13 : 1 };
}

function move(p, d, dt) {
  let wx = 0, wy = 0;
  if (d.dir) { wx = d.dir[0]; wy = d.dir[1]; }
  else if (d.tx !== undefined) { const dx = d.tx - p.x, dy = d.ty - p.y, m = Math.hypot(dx, dy); if (m > 0.12) { const k = Math.min(1, m / 1.1); wx = (dx / m) * k; wy = (dy / m) * k; } }
  let sp = p.spd * (d.sp ?? 1) * (d.boost ?? 1);
  if (p.stun > 0) sp *= 0.1; if (p.slow > 0) sp *= 0.65; if (p.eng >= 0) sp *= 0.22;
  let tx = wx * sp, ty = wy * sp, acc = 26;
  if (p.lunge > 0) { tx = p.lx * p.spd * 1.55; ty = p.ly * p.spd * 1.55; acc = 90; }
  if (p.jk > 0.2) acc = 8;
  const dvx = tx - p.vx, dvy = ty - p.vy, m = Math.hypot(dvx, dvy), a = acc * dt;
  if (m <= a) { p.vx = tx; p.vy = ty; } else { p.vx += (dvx / m) * a; p.vy += (dvy / m) * a; }
  p.x += p.vx * dt; p.y += p.vy * dt;
  p.x = clamp(p.x, -4, W + 4); p.y = clamp(p.y, 0.5, LEN - 0.5);
  if (Math.abs(p.vx) + Math.abs(p.vy) > 0.6) p.face = Math.atan2(p.vy, p.vx);
}

/* ----------------------------------- AI ----------------------------------- */
function nearestChaserDist(g, p, onlyFree) {
  let m = 99; for (const q of g.pl) { if (q.team === p.team || (onlyFree && q.eng >= 0)) continue; const d = dist(p, q); if (d < m) m = d; } return m;
}
function sepOf(g, r) { return nearestChaserDist(g, r, false); }

function aiMove(g, p, dt) {
  const car = g.carrier;
  if (p.stun > 0) return { sp: 0 };
  if (p.blk && p.team === g.bTeam && (g.mode !== 'idle')) return blockAI(g, p);
  if (g.mode === 'run' || g.mode === 'loose') return car && p === car ? carrierAI(g, p, dt) : g.mode === 'loose' ? { tx: g.looseX ?? p.x, ty: g.looseY ?? p.y, sp: 1 } : (p.team === car.team ? escortAI(g, p) : pursueAI(g, p, car));
  if (g.mode === 'handoff') return handoffAI(g, p);
  if (g.mode === 'drop') return dropAI(g, p, dt);
  if (g.mode === 'air') return airAI(g, p);
  return { sp: 0 };
}

function handoffAI(g, p) {
  const car = g.carrier;
  if (p.side === 'O') {
    if (p.role === 'RB' && p.route) { const w = p.route[0]; return { tx: w.x, ty: w.y, sp: 1 }; }
    if (p.role === 'QB') return { tx: CX, ty: g.los - 3.2, sp: 0.5 };
    return { sp: 0.3, tx: p.x, ty: p.y + 1 };
  }
  // defence reads: DL charge, others hold briefly
  const react = g.defCall === 'runstop' ? 0.2 : 0.4;
  if (p.role.startsWith('DL')) return { tx: car.x + (p.hx < CX ? -1 : 1), ty: car.y, sp: 1 };
  if (g.t < react) return { tx: p.x, ty: p.y + 0.5, sp: 0.4 };
  return { tx: p.x, ty: p.y + 1, sp: 0.5 };
}

function receivers(g) { const o = g.off; return ['WR1', 'WR2', 'TE', 'RB'].map((r) => g.r['O' + r]).filter((p) => p && p.team === o); }
export function targets(g) { return receivers(g).filter((p) => !p.blk); }

function routeMove(g, p) {
  if (!p.route) return { tx: p.x, ty: p.y, sp: 0 };
  const w = p.route[p.ri];
  if (!w) { // finished: sit down in space
    return { tx: p.x, ty: p.y, sp: 0.1 };
  }
  if (Math.hypot(w.x - p.x, w.y - p.y) < 1.1) p.ri++;
  return { tx: w.x, ty: w.y, sp: 0.97 };
}

function pressureOf(g, qb) { let m = 99; for (const q of g.pl) { if (q.team === qb.team || q.eng >= 0) continue; if (q.role === 'CB1' || q.role === 'CB2' || q.role === 'S') continue; const d = dist(q, qb); if (d < m) m = d; } return m; }

function dropAI(g, p, dt) {
  const L = g.los;
  if (p.side === 'O') {
    if (p.role === 'QB') return qbAI(g, p, dt);
    if (p.role === 'RB' || p.role === 'WR1' || p.role === 'WR2' || p.role === 'TE') return routeMove(g, p);
    return { tx: p.x, ty: p.y, sp: 0.1 };
  }
  const call = g.defCall, rush = g.carrier, bait = g.baitT > 0 && g.t < g.baitT;
  const readT = 0.32;
  if (p.role === 'DL1' || p.role === 'DL2') return { tx: rush.x + (p.hx < CX ? -1.2 : 1.2), ty: rush.y - 0.3, sp: bait ? 0.5 : 1 };
  if (p.role === 'LB1' || p.role === 'LB2') {
    if (call === 'blitz') return { tx: rush.x + (p.hx < CX ? -1 : 1), ty: rush.y, sp: bait ? 0.5 : 1 };
    if (g.t < readT) return { tx: p.x, ty: p.y, sp: 0.3 };
    const ax = p.hx < CX ? 11.5 : 24.5, ay = L + (call === 'zone' ? 9 : call === 'runstop' ? 5 : 7.5);
    let best = null, bd = 99; for (const r of targets(g)) { const dd = Math.hypot(r.x - ax, r.y - ay); if (dd < bd && dd < 7.5 && r.y > L - 0.5) { bd = dd; best = r; } }
    if (best) return { tx: (ax + best.x * 2) / 3 + best.vx * 0.25, ty: Math.max(L + 1.5, (ay + best.y * 2) / 3 + best.vy * 0.25), sp: 0.92 };
    return { tx: ax, ty: ay, sp: 0.8 };
  }
  if (p.role === 'CB1' || p.role === 'CB2') {
    const wr = g.r['O' + (p.role === 'CB1' ? 'WR1' : 'WR2')];
    if (!wr) return { sp: 0 };
    const cv = (p.team === 'C' ? g.level.cover : 1);
    const cushion = call === 'zone' ? 5.5 : call === 'runstop' ? 1.4 : 1.4;
    const ahead = wr.y > p.y - 0.5;
    const ty = Math.max(wr.y + cushion * (ahead ? 0.5 : 0.8), call === 'zone' ? L + 7.5 : L + 1.2) + wr.vy * 0.12;
    return { tx: wr.x + wr.vx * 0.22 + (wr.x < p.x ? 0.3 : -0.3), ty, sp: Math.min(1.02, 0.9 + 0.1 * cv) };
  }
  if (p.role === 'S') {
    let deep = null; for (const r of targets(g)) { if (r.role !== 'RB' && (!deep || r.y > deep.y)) deep = r; }
    const sy = call === 'zone' ? 13.5 : call === 'runstop' ? 7.5 : 11;
    const ty = Math.max(L + sy - (g.t < 0.6 ? 0 : 1), deep ? deep.y + 1.6 : L + sy);
    let tx = CX; if (deep) tx = (CX + deep.x) / 2; if (call === 'blitz') { const te = g.r.OTE; if (te) { return { tx: te.x + te.vx * 0.2, ty: te.y + 1.2, sp: 0.95 }; } }
    return { tx, ty: Math.min(LEN - 2, ty), sp: 0.85 };
  }
  return { sp: 0 };
}

function qbAI(g, qb, dt) {
  const L = g.los, play = g.play, t = g.t;
  const pocketY = L - (play === 'pass_deep' ? 6.8 : play === 'screen' ? 5.6 : 5.2);
  const readT = play === 'pass_quick' ? 1.05 : play === 'pass_deep' ? 2.3 : 1.2;
  const press = pressureOf(g, qb);
  const pressed = press < 2.0;
  if (press < 1.3) qb.pt = (qb.pt || 0) + dt; else qb.pt = 0;
  if (!g.fl && (t >= readT || pressed)) {
    let best = null, bs = -99;
    for (const r of targets(g)) { const sep = sepOf(g, r), depth = Math.max(0, r.y - L), s = sep + Math.min(depth, 24) * (play === 'pass_deep' ? 0.14 : 0.05) - (r.role === 'RB' && play !== 'screen' ? 0.4 : 0); if (s > bs) { bs = s; best = { r, sep }; } }
    const wait = t - readT;
    const need = play === 'screen' ? -9 : wait < 0.4 ? 2.9 : wait < 1.1 ? 2.2 : 1.6;
    const pn = pressed ? Math.min(need, 2.3) : need;
    if (best && best.sep >= pn) throwTo(g, best.r);
    else if (wait > 2.4 || qb.pt > 0.85) { if (best && best.sep > 1.0 && rnd(g) < 0.6) throwTo(g, best.r); else throwAway(g); }
  }
  return { tx: CX + (Math.sin(t * 1.3) * 0.8), ty: pocketY, sp: t < 0.9 ? 0.85 : 0.3 };
}

function blockAI(g, b) {
  const car = g.carrier;
  if (b.eng >= 0) return { sp: 0 };
  let tg = b.asg >= 0 ? g.pl[b.asg] : null;
  if (!tg || tg.team === b.team || tg.eng >= 0 || tg.hold === -9) {
    tg = null; let bd = 11;
    for (const q of g.pl) { if (q.team === b.team || q.eng >= 0 || (car && q === car)) continue; if (g.mode === 'drop' && !(q.role[0] === 'D' || q.role[0] === 'L')) continue; const d = dist(q, b); if (d < bd) { bd = d; tg = q; } }
    b.asg = tg ? tg.id : -1;
  }
  if (!tg) { if (car && car !== b) return { tx: car.x, ty: car.y - 1.5, sp: 0.5 }; return { sp: 0 }; }
  const ref = car || { x: CX, y: g.los - 4 };
  const ux = ref.x - tg.x, uy = ref.y - tg.y, m = Math.hypot(ux, uy) || 1;
  return { tx: tg.x + (ux / m) * 0.95, ty: tg.y + (uy / m) * 0.95, sp: 1 };
}

function escortAI(g, p) {
  const car = g.carrier;
  if (p.blk) return blockAI(g, p);
  if (p.role === 'QB' || p.role === 'OL1' || p.role === 'OL2') return { tx: car.x, ty: car.y - 4, sp: 0.4 };
  return blockAI(g, p);
}

function pursueAI(g, p, car) {
  const d = dist(p, car), lead = clamp((d / Math.max(4, p.spd)) * 0.75, 0, 1.2);
  const sgn = ((p.id % 3) - 1) * 0.5;
  let tx = car.x + car.vx * lead + sgn, ty = car.y + car.vy * lead;
  if ((p.role === 'S' || p.role.startsWith('CB')) && p.y > car.y + 3) ty = Math.max(ty, car.y + 1.4);
  const dirT = g.turn ? -1 : 1; void dirT;
  return { tx, ty, sp: 1 };
}

function carrierAI(g, p, dt) {
  const goalY = g.turn ? EZ : GOAL, up = goalY > p.y ? 1 : -1;
  let ax = 0, ay = up * 1.0;
  for (const q of g.pl) {
    if (q.team === p.team) continue;
    const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
    if (d > 8) continue;
    const ahead = (q.y - p.y) * up > -1.5;
    if (!ahead) continue;
    const w = 1.7 / (d + 0.6);
    ax += (dx / (d || 1)) * w * (Math.abs(dx) < 3 ? 1.35 : 0.7); ay += (dy / (d || 1)) * w * 0.35;
  }
  if (p.x < 5) ax += (5 - p.x) * 0.15; if (p.x > W - 5) ax -= (p.x - (W - 5)) * 0.15;
  // outside run: stay wide until past the line
  if (g.play === 'run_out' && g.mode === 'run' && p.role === 'RB' && (p.y - g.los) * up < 4 && !g.turn) ax += (p.x < CX ? -0.5 : 0.5);
  const m = Math.hypot(ax, ay) || 1;
  // cpu juke
  if (p.jcd <= 0 && p.team === 'C') {
    for (const q of g.pl) { if (q.team !== p.team && dist(p, q) < 2.1 && (q.y - p.y) * up > -0.3 && rnd(g) < 0.045) { doJuke(g, p, ax >= 0 ? 1 : -1); break; } }
  }
  void dt;
  return { dir: [ax / m, (ay / m)], boost: 1.09 };
}

function airAI(g, p) {
  const fl = g.fl; if (!fl) return { sp: 0 };
  const land = { x: fl.tx, y: fl.ty };
  if (p.side === 'O') {
    if (p === g.tgt) return { tx: land.x, ty: land.y, sp: 1 };
    if (p.blk && p.team === g.bTeam) return blockAI(g, p);
    if (p.role === 'QB') return { sp: 0 };
    return routeMove(g, p);
  }
  // defenders: nearest few go for the ball, the rest keep covering
  const d = dist(p, land);
  if (d < 11 && (p.role === 'CB1' || p.role === 'CB2' || p.role === 'S' || d < 7)) return { tx: land.x, ty: land.y, sp: 1.02 };
  if (p.role.startsWith('DL')) { return { tx: g.carrierLast?.x ?? p.x, ty: g.carrierLast?.y ?? p.y, sp: 0.4 }; }
  return pursueAI(g, p, g.tgt || land);
}

/* -------------------------------- live play -------------------------------- */
function stepLive(g, dt) {
  g.t += dt; if (!g.twoPt) { g.clock = Math.max(0, g.clock - dt); if (g.clock <= 0) g.qEnd = true; }
  for (const p of g.pl) { p.stun = Math.max(0, p.stun - dt); p.cd = Math.max(0, p.cd - dt); p.jk = Math.max(0, p.jk - dt); p.jcd = Math.max(0, p.jcd - dt); p.stiff = Math.max(0, p.stiff - dt); p.scd = Math.max(0, p.scd - dt); p.lunge = Math.max(0, p.lunge - dt); p.lcd = Math.max(0, p.lcd - dt); p.slow = Math.max(0, p.slow - dt); if (p.beat) p.beat = Math.max(0, p.beat - dt); }
  if (g.mode === 'handoff' && g.t >= 0.42) doHandoff(g);
  if (g.mode === 'drop' && g.carrier && g.carrier.y > g.los + 0.35) g.mode = 'run';
  const ctl = pickCtl(g, dt);
  g.ctl = ctl ? ctl.id : -1;
  if (ctl) userActions(g, ctl);
  for (const p of g.pl) {
    const eng = p.eng >= 0 && p.blk;
    if (eng) continue;
    const d = p === ctl ? userMove(g, p, dt) : aiMove(g, p, dt);
    move(p, d, dt);
  }
  doBlocks(g, dt);
  separate(g);
  if (g.mode === 'air') flight(g, dt);
  else if (g.carrier) { contacts(g, dt); if (g.phase === 'live' && g.carrier) checkBounds(g); }
  if (g.phase === 'live') {
    if (g.carrier) g.carrierLast = { x: g.carrier.x, y: g.carrier.y };
    openness(g);
    if (g.t > 40) endPlay(g, 'tackle', g.carrier ? g.carrier.y : g.los); // safety net
  }
}

function openness(g) {
  const o = {};
  if (g.mode === 'drop' && g.off === 'U') for (const r of targets(g)) { const s = sepOf(g, r); o[r.id] = s > 3.4 ? 2 : s > 2 ? 1 : 0; }
  g.open = o;
}

function doHandoff(g) {
  const rb = g.r.ORB, qb = g.r.OQB;
  if (!rb || !qb || g.carrier !== qb) return;
  g.carrier = rb; g.mode = 'run'; g.hand = true; rb.vx *= 1; sfx(g, 'snap');
  g.ev.push({ k: 'hand' });
}

function userActions(g, ctl) {
  const i = g.in, car = g.carrier;
  if (i.juke && car === ctl && ctl.jcd <= 0 && g.mode !== 'handoff') doJuke(g, ctl, Math.abs(i.mx) > 0.25 ? Math.sign(i.mx) : 0);
  if (i.stiff && car === ctl && ctl.scd <= 0) { ctl.stiff = 0.5; ctl.scd = 1.1; g.ev.push({ k: 'pop', t: 'STIFF ARM', x: ctl.x, y: ctl.y }); }
  if (i.tackle && car && car.team !== ctl.team && ctl.lcd <= 0 && ctl.lunge <= 0) {
    let dx = i.mx, dy = i.my, m = Math.hypot(dx, dy);
    if (m < 0.2) { dx = car.x + car.vx * 0.2 - ctl.x; dy = car.y + car.vy * 0.2 - ctl.y; m = Math.hypot(dx, dy) || 1; }
    ctl.lx = dx / m; ctl.ly = dy / m; ctl.lunge = 0.34; ctl.lcd = 1.15; g.ev.push({ k: 'sfx', n: 'whoosh' });
  }
  if (i.swat) { g.swatT = g.t; }
  if (g.mode === 'drop' && car === ctl && car.role === 'QB' && !g.fl) {
    if (i.throw >= 0) { const t = targets(g)[i.throw]; if (t) throwTo(g, t); }
    else if (i.away) throwAway(g);
  }
}
function doJuke(g, p, side) {
  p.jk = 0.36; p.jcd = 1.05;
  let sg = side;
  if (!sg) { let nq = null, nd = 99; for (const q of g.pl) { if (q.team !== p.team) { const d = dist(p, q); if (d < nd) { nd = d; nq = q; } } } sg = nq ? (nq.x > p.x ? -1 : 1) : 1; }
  p.vx += sg * 6.2; p.vy *= 0.85;
  g.ev.push({ k: 'pop', t: 'JUKE', x: p.x, y: p.y, side: sg });
}

function separate(g) {
  const L = g.pl;
  for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++) {
    const p = L[a], q = L[b]; if (p.eng === q.id || q.eng === p.id) continue;
    const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
    if (d > 0 && d < 0.8) { const k = (0.8 - d) * 0.35; const ux = dx / d, uy = dy / d; p.x -= ux * k; p.y -= uy * k; q.x += ux * k; q.y += uy * k; }
  }
}

function doBlocks(g, dt) {
  const pass = g.mode === 'drop' || g.mode === 'air', car = g.carrier;
  for (const b of g.pl) {
    if (!b.blk || b.team !== g.bTeam) { continue; }
    if (b.eng >= 0) {
      const df = g.pl[b.eng];
      if (!df || df.eng !== b.id) { b.eng = -1; continue; }
      const h = (pass ? 0.62 : b.role[0] === 'W' ? 0.7 : 0.4) * (df.team === 'C' ? g.level.rush : 1) * (g.mode === 'drop' && g.defCall === 'blitz' && df.role[0] === 'L' ? 1.4 : 1);
      b.hold -= dt;
      if (rnd(g) < h * dt || b.hold <= 0) { b.eng = -1; df.eng = -1; df.cd = 0; b.beat = 0.6; b.asg = -1; continue; }
      const ref = car || { x: CX, y: g.los - 4 };
      const ux = ref.x - df.x, uy = ref.y - df.y, m = Math.hypot(ux, uy) || 1;
      const tx = df.x + (ux / m) * 0.95, ty = df.y + (uy / m) * 0.95, k = Math.min(1, 14 * dt);
      b.x += (tx - b.x) * k; b.y += (ty - b.y) * k; b.vx = df.vx; b.vy = df.vy;
      continue;
    }
    if (b.beat > 0) continue;
    // look for something to hit
    for (const q of g.pl) {
      if (q.team === b.team || q.eng >= 0 || (car && q === car) || q.stun > 0.3) continue;
      if (dist(q, b) < 1.25) { b.eng = q.id; q.eng = b.id; b.hold = pass ? 4.8 : b.role[0] === 'W' ? 1.0 + rnd(g) : 2.2 + rnd(g) * 1.4; break; }
    }
  }
}

function contacts(g, dt) {
  const car = g.carrier; void dt;
  const chasers = chasersOf(g, car);
  for (const d of chasers) {
    if (d.stun > 0 || d.eng >= 0 || d.cd > 0) continue;
    if (g.mode === 'handoff') continue;
    const reach = d.lunge > 0 ? 1.95 : 1.12;
    if (dist(d, car) > reach) continue;
    let near = 0; for (const o of chasers) if (o !== d && o.eng < 0 && dist(o, car) < 1.9) near++;
    let p = 0.64 + (d.tkl - 0.5) * 0.7 - (car.brk - 0.2) * 1.0 + near * 0.2 + (d.lunge > 0 ? 0.2 : 0);
    if (car.stiff > 0) p -= 0.42;
    if (car.team === 'C' && d.team === 'U') p += 0.0;
    if (g.mode === 'drop' && car.role === 'QB') p += 0.08;
    p = clamp(p, 0.1, 0.96);
    if (car.jk > 0) { d.stun = 0.5; d.cd = 0.6; continue; }
    if (rnd(g) < p) { tackled(g, d, car, near); return; }
    d.stun = d.lunge > 0 ? 0.9 : 0.5; d.cd = 0.7; d.lunge = 0; car.slow = 0.35; g.stat[car.team].brk++;
    g.ev.push({ k: 'pop', t: 'BROKEN TACKLE', x: car.x, y: car.y }); sfx(g, 'brk');
  }
}

function tackled(g, d, car, near) {
  g.stat[d.team].tkl += d.team === 'U' ? 1 : 0;
  const y = car.y;
  g.ev.push({ k: 'hit', x: car.x, y: car.y, big: near > 0 || d.lunge > 0 }); sfx(g, 'hit');
  const sack = g.mode === 'drop' && car.role === 'QB' && !g.turn;
  if (sack) { g.stat[d.team].sacks++; return endPlay(g, 'sack', y); }
  const fumP = 0.012 + (near > 0 ? 0.02 : 0) + (d.lunge > 0 ? 0.015 : 0);
  if (rnd(g) < fumP) return endPlay(g, 'fumble', y, d);
  endPlay(g, 'tackle', y, d);
}

function checkBounds(g) {
  const c = g.carrier;
  if (!g.turn && c.y >= GOAL) return touchdown(g, c.team);
  if (g.turn && c.y <= EZ) return touchdown(g, c.team);
  if (c.x < 0 || c.x > W) { c.x = clamp(c.x, 0, W); return endPlay(g, 'oob', c.y); }
}

/* ------------------------------------ passing ------------------------------------ */
export function throwTo(g, r) {
  const qb = g.carrier; if (!qb || qb.role !== 'QB' || g.fl || g.mode !== 'drop') return false;
  const d = dist(qb, r), dur = clamp(d / 25 + 0.14, 0.3, 1.7);
  const press = pressureOf(g, qb), mv = Math.hypot(qb.vx, qb.vy);
  const sd = (0.5 + d * 0.034 + (mv > 2.5 ? 0.35 : 0) + (press < 2.6 ? 0.4 : 0)) * (qb.team === 'C' ? 1 / g.level.qb : 1);
  const lx = r.x + r.vx * dur * 0.85 + gauss(g) * sd * 0.8, ly = r.y + r.vy * dur * 0.85 + gauss(g) * sd;
  g.fl = { fx: qb.x, fy: qb.y, tx: lx, ty: ly, t: 0, dur, arc: 1.2 + d * 0.09, sd };
  g.tgt = r; g.mode = 'air'; g.carrier = null; g.thrower = qb; g.stat[qb.team].att++; g.ev.push({ k: 'throw' }); sfx(g, 'throw');
  g.ev.push({ k: 'sfx', n: 'whoosh' });
  return true;
}
function throwAway(g) {
  const qb = g.carrier; if (!qb || g.fl) return;
  const sx = qb.x < CX ? -4 : W + 4;
  g.fl = { fx: qb.x, fy: qb.y, tx: sx, ty: qb.y + 7, t: 0, dur: 0.7, arc: 2.5, away: true };
  g.tgt = null; g.mode = 'air'; g.carrier = null; g.thrower = qb; g.ev.push({ k: 'throw' });
}

function flight(g, dt) {
  const f = g.fl; f.t += dt;
  // swat window for user
  if (f.t < f.dur) return;
  const land = { x: f.tx, y: f.ty }, qb = g.thrower;
  g.landY = f.ty;
  if (f.away) { banner(g, 'THROWN AWAY', '', 'info'); return endPlay(g, 'inc', g.los); }
  const r = g.tgt, dr = dist(r, land);
  let dd = 99, dp = null; for (const d of g.pl) { if (d.team === r.team) continue; const x = dist(d, land); if (x < dd) { dd = x; dp = d; } }
  const sw = Math.abs(g.t - g.swatT) < 0.45 && g.swatT > -5;
  const userDef = r.team === 'C', userOffTgt = r.team === 'U';
  let pC = r.hands, pI = 0;
  if (dr > 2.7) pC = 0;
  else pC *= 1 - Math.max(0, dr - 1.5) * 0.12;
  if (dd < 3.6) { pC -= dd < 1.1 ? 0.36 : dd < 1.9 ? 0.24 : 0.1; pI = (dd < 1.1 ? 0.42 : dd < 1.9 ? 0.24 : dd < 2.7 ? 0.1 : 0.04) * (dp.hands + 0.25) * (dp.team === 'C' ? g.level.cover : 1) * (dr > 2.7 ? 1.2 : 1); }
  if (sw && userDef && dp && dp.team === 'U' && dd < 3) { pI *= 2.4; pC -= 0.25; }
  if (sw && userOffTgt && dr < 3) { pC += 0.14; pI *= 0.5; }
  pC = clamp(pC * 0.92, 0, 0.95);
  const u = rnd(g);
  if (u < pI) {
    // interception
    g.stat[dp.team].ints++;
    g.turn = true; g.carrier = dp; g.mode = 'run'; g.fl = null; g.bTeam = dp.team;
    for (const p of g.pl) { p.eng = -1; p.blk = p.team === dp.team && p !== dp; p.asg = -1; p.route = null; }
    dp.vx = dp.vy = 0; g.stat[g.off].att += 0;
    banner(g, 'INTERCEPTED!', `${g.names[dp.team]} take it away`, dp.team === 'U' ? 'good' : 'bad'); sfx(g, 'int');
    g.intAt = land.y; return;
  }
  if (u < pI + pC) {
    r.vx *= 0.5; r.vy *= 0.5; r.x += (land.x - r.x) * 0.6; r.y += (land.y - r.y) * 0.6;
    g.carrier = r; g.mode = 'run'; g.fl = null; g.bTeam = r.team; g.caught = true;
    g.stat[r.team].comp++; g.catchY = r.y;
    for (const p of g.pl) { if (p.team === r.team) { p.eng = p.eng; } }
    for (const p of g.pl) { if (p.team === r.team && p !== r && !p.blk && p.role !== 'QB' && dist(p, r) < 9) { p.blk = true; p.asg = -1; } }
    g.ev.push({ k: 'catch', x: r.x, y: r.y }); sfx(g, 'catch');
    return;
  }
  const why = dr > 2.7 ? 'Overthrown' : dd < 2 ? 'Broken up' : 'Dropped';
  banner(g, 'INCOMPLETE', why, 'bad'); void qb;
  endPlay(g, 'inc', g.los);
}

/* ------------------------------ ending a play ------------------------------ */
function touchdown(g, team) {
  if (g.twoPt) {
    const t = g.twoPt.team, good = !g.turn && team === t;
    if (good) { addScore(g, t, 2); banner(g, 'TWO-POINT GOOD!', `${g.names[t]}`, t === 'U' ? 'good' : 'bad'); g.ev.push({ k: 'burst', x: g.carrier.x, y: g.carrier.y, c: 'td' }); }
    else banner(g, 'TWO-POINT NO GOOD', '', t === 'U' ? 'bad' : 'good');
    g.phase = 'dead'; g.timer = 1.9; g.mode = 'idle'; g.carrier = null; g.fl = null; g.pendingAfter = () => finishTwo(g); return;
  }
  g.stat[team].td++; addScore(g, team, 6);
  banner(g, 'TOUCHDOWN!', `${g.names[team]}`, team === 'U' ? 'good' : 'bad'); g.ev.push({ k: 'burst', x: g.carrier.x, y: g.carrier.y, c: 'td' });
  if (g.carrier) { const yds = Math.max(0, Math.round(g.carrier.y - g.los)); if (!g.turn) { (g.caught ? addPass : addRush)(g, team, yds); } }
  g.phase = 'dead'; g.timer = 2.1; g.mode = 'idle'; g.carrier = null; g.hint = null;
  g.pendingAfter = () => afterTD(g, team);
  g.log.push(`TD ${team}`);
}
function afterTD(g, team) {
  if (g.ot) return finish(g);
  if (team === 'U' && !g.auto) { g.phase = 'pat'; g.patTeam = team; g.kickInfo = null; return; }
  const diff = g.score[other(team)] - g.score[team];
  if (diff === 2 && g.q >= 3) return startTwo(g, team);
  patKick(g, team);
}
function patKick(g, team) {
  const kick = other(team), good = rnd(g) < 0.93; if (good) addScore(g, team, 1);
  g.kickInfo = { icon: '🥅', title: good ? 'EXTRA POINT GOOD' : 'EXTRA POINT MISSED', text: `${g.names[team]} ${g.score[team] > g.score[kick] ? 'lead' : g.score[team] === g.score[kick] ? 'tie it' : 'trail'} ${g.score.U}–${g.score.C}.`, c: good ? 'good' : 'bad' };
  g.phase = 'kick'; g.timer = 1.7; g.after = () => { if (g.qEnd || g.clock <= 0) { g.qEnd = true; return endQuarter(g); } kickoff(g, kick); }; return true;
}
function startTwo(g, team) {
  g.twoPt = { team }; g.off = team; g.f = 98; g.down = 1; g.toGo = 2; g.firstAt = 100; g.drive = []; g.kickInfo = null; g.phase = 'call'; startCall(g); return true;
}
function finishTwo(g) {
  const t = g.twoPt ? g.twoPt.team : g.off; g.twoPt = null;
  if (g.qEnd || g.clock <= 0) { g.qEnd = true; return endQuarter(g); }
  kickoff(g, other(t));
}
const addRush = (g, t, y) => { g.stat[t].rush += y; }, addPass = (g, t, y) => { g.stat[t].pass += y; };

function flag(g, kind) {
  const o = g.off, d = other(o);
  const opts = [['Offside', d, 5, false, 3], ['False start', o, -5, false, 2.5], ['Holding', o, -10, false, 2], ['Defensive holding', d, 5, true, 1.2]];
  if (kind === 'inc' && g.tgt) opts.push(['Pass interference', d, 0, true, 3.5]);
  let tot = 0; for (const x of opts) tot += x[4]; let r = rnd(g) * tot, pick = opts[0]; for (const x of opts) { r -= x[4]; if (r <= 0) { pick = x; break; } }
  const [name, team, yds, auto] = pick; let f2 = g.f;
  if (name === 'Pass interference') f2 = clamp(Math.round((g.landY ?? g.los) - 10), g.f, 99); else f2 = clamp(g.f + yds, 1, 98);
  g.f = f2;
  if (auto || f2 >= g.firstAt) { g.down = 1; g.firstAt = Math.min(100, f2 + 10); g.toGo = g.firstAt - f2; } else g.toGo = Math.max(1, g.firstAt - f2);
  const gain = f2 - (g.los - 10);
  banner(g, `FLAG: ${name}`, `${g.names[team]}${gain ? `, ${gain > 0 ? '+' : ''}${gain} yards` : ''}${auto ? ', first down' : ', replay the down'}`, team === 'U' ? 'bad' : 'good');
  g.phase = 'dead'; g.timer = 1.7; g.hint = null; g.caught = false; g.lastRunoff = 0; return true;
}
function endPlay(g, kind, y, by) {
  if (g.phase !== 'live') return;
  const o = g.off, car = g.carrier, L10 = g.los;
  g.phase = 'dead'; g.timer = 1.25; g.plays++; g.mode = 'idle'; g.fl = null; g.lastRunoff = 0; sfx(g, 'whistle');
  const wasCarrier = car; g.carrier = null;
  if (g.twoPt) { banner(g, 'TWO-POINT NO GOOD', '', g.twoPt.team === 'U' ? 'bad' : 'good'); g.timer = 1.5; g.pendingAfter = () => finishTwo(g); return; }
  let gain = Math.round(y - L10);
  let runoff = 17; if (((g.q === 2 || g.q >= 4) && g.clock < 40) || (o === 'U' && g.hurry) || (o === 'C' && late(g) && trailBy(g, 'C') > 0)) runoff = 5;
  const label = (t, s = '', c = 'info') => banner(g, t, s, c);
  if (!g.turn && kind !== 'fumble' && rnd(g) < 0.05 && flag(g, kind)) return;

  if (g.turn) {
    // return after a turnover: ball spot where the returner went down
    const newTeam = wasCarrier ? wasCarrier.team : other(o);
    let f2 = Math.round(110 - y);
    if (f2 <= 0) f2 = 20; f2 = clamp(f2, 1, 99);
    if (y >= GOAL) f2 = 20;
    g.score; g.pendingAfter = () => giveBall(g, newTeam, f2);
    label(kind === 'oob' ? 'OUT OF BOUNDS' : 'DOWN', `${g.names[newTeam]} ball at ${spotText(f2)}`, newTeam === 'U' ? 'good' : 'bad');
    g.clock = Math.max(0, g.clock - (kind === 'oob' ? 0 : runoff));
    g.drive = [];
    return;
  }
  const stat = g.stat[o];
  if (kind === 'inc') { runoff = (g.q === 2 || g.q >= 4) && g.clock < 40 ? 0 : 7; g.last = 'Incomplete'; gain = 0; }
  else if (kind === 'oob') { runoff = 0; }
  if (kind === 'sack') { label('SACKED!', `${gain} yards`, o === 'U' ? 'bad' : 'good'); }
  if (kind === 'fumble') {
    const offRec = rnd(g) < 0.5; g.stat[o].fum++;
    if (offRec) { label('FUMBLE!', 'Offense recovers', 'info'); } else {
      label('FUMBLE!', 'LOST TO THE DEFENSE', o === 'U' ? 'bad' : 'good'); sfx(g, 'int');
      const f2 = clamp(Math.round(110 - y), 1, 99); g.pendingAfter = () => giveBall(g, other(o), f2 <= 0 ? 20 : f2); g.clock = Math.max(0, g.clock - runoff); return;
    }
  }
  if (kind !== 'inc') { if (wasCarrier && wasCarrier.role === 'QB' && !g.caught) { stat.rush += gain; } else if (g.caught) { addPass(g, o, Math.round(y - L10)); } else if (kind !== 'sack') stat.rush += gain; }
  if (kind === 'sack') stat.pass += 0;
  // safety
  if (y <= EZ && kind !== 'inc') {
    addScore(g, other(o), 2); label('SAFETY!', `${g.names[other(o)]} +2`, o === 'U' ? 'bad' : 'good');
    g.pendingAfter = () => { g.kickInfo = { icon: '🏟️', title: 'FREE KICK', text: `${g.names[other(o)]} get the ball at ${spotText(40)}.` }; g.phase = 'kick'; g.timer = 1.5; g.after = () => giveBall(g, other(o), 40); };
    return;
  }
  let f2 = clamp(Math.round(y - 10), 1, 99);
  if (kind === 'inc') f2 = g.f;
  g.clock = Math.max(0, g.clock - runoff); g.lastRunoff = runoff;
  g.f = f2;
  if (kind !== 'inc' && f2 >= g.firstAt) {
    g.down = 1; g.firstAt = Math.min(100, f2 + 10); g.toGo = g.firstAt - f2;
    label('FIRST DOWN', `${gain >= 0 ? '+' : ''}${gain} yards`, o === 'U' ? 'good' : 'bad');
  } else {
    g.down++; g.toGo = Math.max(1, g.firstAt - f2);
    if (g.down > 4) {
      label('TURNOVER ON DOWNS', `${g.names[other(o)]} take over`, o === 'U' ? 'bad' : 'good'); sfx(g, 'int');
      const fo = clamp(100 - g.f, 1, 99); g.pendingAfter = () => giveBall(g, other(o), fo); return;
    }
    if (kind === 'tackle' || kind === 'oob') label(gain >= 0 ? `+${gain} YARD${gain === 1 ? '' : 'S'}` : `${gain} YARDS`, `${ord(g.down)} & ${toGoNow(g)}`, gain >= 4 ? (o === 'U' ? 'good' : 'bad') : 'info');
  }
  g.caught = false; g.hint = null;
}

export function advise(g) { return g.hint; }
export function fgInfo(g) { const d = 100 - g.f + 17; const p = d <= 30 ? 97 : d <= 40 ? 90 - (d - 30) * 0.5 : d <= 50 ? 84 - (d - 40) * 2 : d <= 58 ? 64 - (d - 50) * 5 : 15; return { dist: d, pct: Math.round(Math.max(5, p)) }; }
export function playBot(g, maxSteps = 200000) { g.auto = true; let n = 0; while (!g.over && n++ < maxSteps) step(g, 1 / 30); return g; }
