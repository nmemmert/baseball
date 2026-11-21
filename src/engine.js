// Skipper engine: a pitch-by-pitch baseball simulation where the player's only
// lever is managerial decisions. Pure logic, no DOM. Fully serialisable.

// ---------- RNG (state lives on the owner so it can be saved) ----------
export function attachRng(o) {
  o.rng = () => {
    const a = (o.rs = (o.rs + 0x6d2b79f5) | 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return o;
}
export const makeRng = (seed) => attachRng({ rs: seed | 0 }).rng;

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const rating = (rng, mean = 55, spread = 18) => Math.round(clamp(mean + (rng() + rng() + rng() - 1.5) * spread * 1.6, 20, 95));

// ---------- Players & teams ----------
const FIRST = ['Jake', 'Miguel', 'Tom', 'Carlos', 'Ben', 'Luis', 'Danny', 'Hank', 'Ray', 'Ty', 'Omar', 'Sam', 'Eli', 'Gus', 'Nate', 'Pablo', 'Rex', 'Walt', 'Vic', 'Joe', 'Andre', 'Cal', 'Dre', 'Finn', 'Gabe', 'Hugo', 'Ivan', 'Jon', 'Kai', 'Leo', 'Marco', 'Nico', 'Otis', 'Paul', 'Quinn', 'Ross', 'Seth', 'Theo', 'Uri', 'Wade'];
const LAST = ['Rivera', 'Sullivan', 'Okafor', 'Brandt', 'Kowalski', 'Tanaka', 'Delgado', 'Mercer', 'Hollis', 'Pruitt', 'Vance', 'Castillo', 'Moreno', 'Fitch', 'Larkin', 'Duffy', 'Soto', 'Nakamura', 'Boyle', 'Quincy', 'Reyes', 'Walsh', 'Ibarra', 'Ford', 'Abbott', 'Baptiste', 'Calloway', 'Dixon', 'Espinoza', 'Fontaine', 'Gallo', 'Hartley', 'Iglesias', 'Jansen', 'Keller', 'Lindqvist', 'Mahoney', 'Novak', 'Ortega', 'Palmer', 'Quigley', 'Rourke', 'Santos', 'Thibodeaux', 'Ueda', 'Valdez', 'Whitaker', 'Yates', 'Zamora', 'Archer', 'Bishop', 'Crowe', 'Dunn', 'Easton', 'Frazier', 'Grady', 'Hale', 'Irving', 'Jessup', 'Kemp', 'Lowell', 'Marsh', 'Nolan', 'Oakes', 'Pike', 'Quarles', 'Rusk', 'Stroud', 'Trask', 'Upton', 'Vaughn', 'Wren', 'Xavier', 'Yoder', 'Zeller', 'Banks', 'Cobb', 'Drake', 'Emery', 'Flynn', 'Gage'];

let nextId = 1;
export function bumpIds(n) { nextId = Math.max(nextId, n + 1); }

function uniqueName(rng, used, teamSur) {
  for (let i = 0; i < 80; i++) {
    const f = pick(rng, FIRST), l = pick(rng, LAST), n = `${f} ${l}`;
    if (!used.has(n) && !teamSur.has(l)) { used.add(n); teamSur.add(l); return n; }
  }
  const n = `${pick(rng, FIRST)} ${pick(rng, LAST)} Jr.`; used.add(n); return n;
}

export const blankBat = () => ({ g: 0, ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0 });
export const blankPit = () => ({ g: 0, gs: 0, pitches: 0, outs: 0, h: 0, r: 0, bb: 0, k: 0 });

function makeBatter(rng, used, sur, pos) {
  const id = nextId++, hr = rng();
  return {
    id, uid: `p${id}`, type: 'bat', name: uniqueName(rng, used, sur), pos,
    hand: hr < 0.55 ? 'R' : hr < 0.85 ? 'L' : 'S', age: 20 + Math.floor(rng() * 16),
    contact: rating(rng), power: rating(rng, 50), eye: rating(rng), speed: rating(rng, 50, 24),
    form: 0, inj: 0, stats: blankBat(), season: blankBat(),
  };
}
function makePitcher(rng, used, sur, role) {
  const id = nextId++, sp = role === 'SP';
  return {
    id, uid: `p${id}`, type: 'pit', role, pos: role, name: uniqueName(rng, used, sur),
    hand: rng() < 0.72 ? 'R' : 'L', age: 20 + Math.floor(rng() * 16),
    stuff: rating(rng, sp ? 58 : 56), control: rating(rng, 55),
    stamina: sp ? 82 + Math.floor(rng() * 24) : 20 + Math.floor(rng() * 20),
    debt: 0, form: 0, inj: 0, stats: blankPit(), season: blankPit(),
  };
}

export function makeTeam(rng, city, nick, used = new Set()) {
  const id = nextId++, sur = new Set();
  const batters = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'C', 'IF', 'OF', 'OF', 'IF'].map((p) => makeBatter(rng, used, sur, p));
  const sp = [0, 1, 2, 3, 4].map(() => makePitcher(rng, used, sur, 'SP'));
  const rp = ['RP', 'RP', 'RP', 'RP', 'CL'].map((r) => makePitcher(rng, used, sur, r));
  rp[4].stuff = clamp(rp[4].stuff + 12, 20, 95);
  return {
    id, uid: `t${id}`, type: 'team', city, nick, name: `${city} ${nick}`,
    batters, sp, rp, rotIdx: 0, w: 0, l: 0, rs: 0, ra: 0,
    lineup: [], bench: [], pitcher: null, starter: null, bullpen: [], usedPitchers: [], usedBatters: [],
    batIdx: 0, runs: 0, hits: 0, inningRuns: [],
  };
}

// Prepare a team's in-game state from its persistent roster (injury-aware).
export function beginTeamGame(team) {
  const order = [...team.batters];
  for (let i = 0; i < 9; i++) {
    if (order[i].inj > 0) {
      const j = order.findIndex((p, k) => k >= 9 && p.inj === 0);
      if (j >= 0) [order[i], order[j]] = [order[j], order[i]];
    }
  }
  team.lineup = order.slice(0, 9);
  team.bench = order.slice(9).filter((p) => p.inj === 0);
  let s = team.sp[team.rotIdx % 5];
  for (let i = 1; i < 5 && s.inj > 0; i++) s = team.sp[(team.rotIdx + i) % 5];
  team.pitcher = team.starter = s;
  team.bullpen = team.rp.filter((p) => p.inj === 0);
  team.usedPitchers = []; team.usedBatters = [];
  team.batIdx = 0; team.runs = 0; team.hits = 0; team.inningRuns = [];
  for (const p of [...team.batters, ...team.sp, ...team.rp]) p.stats = p.type === 'bat' ? blankBat() : blankPit();
}

export function newGame(seed = Date.now() % 1e9, level = 1) {
  const rng = makeRng(seed), used = new Set();
  const home = makeTeam(rng, 'Harbor City', 'Skippers', used);
  const away = makeTeam(rng, 'Mesa', 'Scorpions', used);
  return startGame(home, away, { seed: seed ^ 0x5bd1e995, level, exhibition: seed, user: null });
}

export function startGame(home, away, { seed = 1, level = 1, exhibition = null, user = null } = {}) {
  const g = attachRng({
    rs: seed | 0, seed: exhibition ?? seed, home, away, level, user, inning: 1, half: 'top', outs: 0, bases: [null, null, null],
    over: false, winner: null, log: [], paCount: 0, pa: { balls: 0, strikes: 0, pitches: 0, seq: [] }, last: null,
  });
  beginTeamGame(home); beginTeamGame(away);
  return g;
}

export const battingTeam = (g) => (g.half === 'top' ? g.away : g.home);
export const fieldingTeam = (g) => (g.half === 'top' ? g.home : g.away);
export const currentBatter = (g) => battingTeam(g).lineup[battingTeam(g).batIdx];
export const onDeck = (g) => battingTeam(g).lineup[(battingTeam(g).batIdx + 1) % 9];

export function fatigue(p) {
  const st = p.stamina * (1 - 0.45 * (p.debt || 0));
  return clamp((p.stats.pitches - st * 0.8) / (st * 0.45 + 10), 0, 1);
}
// +1 batter has the platoon edge, -1 pitcher does, 0 neutral.
export const platoonEdge = (b, p) => (b.hand === 'S' ? 0 : b.hand !== p.hand ? 1 : -1);
const platBonus = (b, p) => (b.hand === 'S' ? 2 : b.hand !== p.hand ? 7 : -6);

function effBatter(b, p) {
  const pl = platBonus(b, p);
  return { contact: b.contact + b.form * 2 + pl, power: b.power + b.form * 1.5 + pl * 0.7, eye: b.eye + b.form, speed: b.speed };
}
function effPitcher(p) {
  const f = fatigue(p);
  return { stuff: (p.stuff + p.form * 2) * (1 - 0.35 * f), control: (p.control + p.form) * (1 - 0.35 * f) };
}
export const formTag = (p) => (p.form >= 3 ? 'hot' : p.form <= -3 ? 'cold' : '');

const say = (g, msg) => g.log.push(msg);

// ---------- Win probability (home team) ----------
const RE = [
  [0.5, 0.9, 1.1, 1.44, 1.35, 1.78, 1.96, 2.29],
  [0.27, 0.54, 0.69, 0.94, 0.95, 1.19, 1.34, 1.54],
  [0.1, 0.24, 0.34, 0.4, 0.37, 0.52, 0.54, 0.76],
];
const baseIdx = (b) => (b[0] ? 1 : 0) + (b[1] ? 2 : 0) + (b[2] ? 4 : 0);
const REIDX = [0, 1, 2, 3, 4, 5, 6, 7];
export function winProb(g) {
  if (g.over) return g.winner === 'home' ? 1 : 0;
  const top = g.half === 'top', o = g.outs;
  const extras = g.inning > 9;
  const rest = extras ? 0 : 9 - g.inning;
  const awayOuts = 3 * rest + (top ? 3 - o : 0) + (extras ? 3 : 0);
  const homeOuts = 3 * rest + (top ? 3 : 3 - o) + (extras ? 3 : 0);
  const re = RE[o][REIDX[baseIdx(g.bases)]];
  const d = g.home.runs - g.away.runs;
  const futureHome = 0.17 * (homeOuts - (top ? 0 : 3 - o));
  const futureAway = 0.17 * (awayOuts - (top ? 3 - o : 0));
  const mean = d + futureHome - futureAway + (top ? -re : re);
  const sd = Math.sqrt(0.47 * (homeOuts + awayOuts) + 0.5);
  return clamp(1 / (1 + Math.exp((-1.7 * mean) / sd)), 0.001, 0.999);
}

// ---------- Resolution helpers ----------
function scoreRuns(g, runners, batter, { rbi = true } = {}) {
  const bat = battingTeam(g), pit = fieldingTeam(g).pitcher, n = runners.length;
  if (!n) return;
  bat.runs += n;
  bat.inningRuns[g.inning - 1] = (bat.inningRuns[g.inning - 1] || 0) + n;
  pit.stats.r += n; pit.stintRuns = (pit.stintRuns || 0) + n;
  if (rbi && batter) batter.stats.rbi += n;
}
const addOuts = (g, n) => { g.outs = Math.min(3, g.outs + n); };
const creditOuts = (g, before) => { fieldingTeam(g).pitcher.stats.outs += g.outs - before; };

function forceWalk(g, batter) {
  const [b1, b2, b3] = g.bases, runs = [], nb = [batter, null, null];
  if (b1) { nb[1] = b1; if (b2) { nb[2] = b2; if (b3) runs.push(b3); } else nb[2] = b3; } else { nb[1] = b2; nb[2] = b3; }
  g.bases = nb;
  scoreRuns(g, runs, batter);
  return runs.length;
}

function resolveHit(g, kind, batter, running) {
  const { rng } = g, [b1, b2, b3] = g.bases, runs = [], nb = [null, null, null];
  const sp = (r) => (r.speed - 50) / 200;
  if (kind === 'HR') runs.push(...[b3, b2, b1].filter(Boolean), batter);
  else if (kind === '3B') { runs.push(...[b3, b2, b1].filter(Boolean)); nb[2] = batter; }
  else if (kind === '2B') {
    if (b3) runs.push(b3);
    if (b2) runs.push(b2);
    if (b1) { if (rng() < 0.4 + sp(b1) + (running ? 0.2 : 0)) runs.push(b1); else nb[2] = b1; }
    nb[1] = batter;
  } else {
    nb[0] = batter;
    if (b3) runs.push(b3);
    if (b2) { if (rng() < 0.55 + sp(b2)) runs.push(b2); else nb[2] = b2; }
    if (b1) { if (!nb[2] && rng() < 0.25 + sp(b1) + (running ? 0.35 : 0)) nb[2] = b1; else nb[1] = b1; }
  }
  g.bases = nb;
  scoreRuns(g, runs, batter);
  fieldingTeam(g).pitcher.stats.h++; battingTeam(g).hits++;
  batter.stats.h++; batter.stats.ab++;
  if (kind === 'HR') batter.stats.hr++;
  return runs.length;
}

function resolveOutInPlay(g, batter, def, running) {
  const { rng } = g, [b1, b2, b3] = g.bases;
  const ground = rng() < 0.55 - (batter.power - 50) / 400;
  batter.stats.ab++;
  const runs = [];
  let rbi = true;
  if (ground) {
    const dp = def.infieldIn ? 0.3 : 0.42;
    if (b1 && g.outs < 2 && rng() < (running ? 0.07 : dp)) {
      addOuts(g, 2); rbi = false;
      if (g.outs < 3) { if (b3) runs.push(b3); g.bases = [null, null, b2]; } else g.bases = [null, null, null];
      say(g, `${batter.name} grounds into a double play.`);
    } else {
      addOuts(g, 1);
      const nb = [null, null, null];
      if (g.outs < 3) {
        if (b3) {
          const forced = !!(b1 && b2), p = def.infieldIn ? 0.35 : 0.65;
          if (forced || rng() < p) runs.push(b3); else nb[2] = b3;
        }
        if (b2) { if (!nb[2] && (b1 || rng() < 0.45)) nb[2] = b2; else nb[1] = b2; }
        if (b1) nb[1] = b1;
      }
      g.bases = nb;
      say(g, `${batter.name} grounds out.`);
    }
  } else {
    addOuts(g, 1);
    const nb = [b1, b2, b3], sfP = def.depth === 'deep' ? 0.78 : def.depth === 'shallow' ? 0.45 : 0.65;
    if (g.outs < 3) {
      if (b3 && rng() < sfP) { runs.push(b3); nb[2] = null; }
      if (b2 && !nb[2] && rng() < 0.2) { nb[2] = b2; nb[1] = null; }
      if (running && b1 && g.outs < 3 && rng() < 0.22) { addOuts(g, 1); nb[0] = null; say(g, 'The runner is doubled off first!'); }
    }
    g.bases = nb;
    say(g, `${batter.name} flies out${runs.length ? ' — sacrifice fly!' : '.'}`);
  }
  if (runs.length) { scoreRuns(g, runs, batter, { rbi }); say(g, `${runs.length} run${runs.length > 1 ? 's' : ''} score.`); }
}

function bunt(g, batter) {
  const { rng } = g, before = g.outs, r = rng(), [b1, b2, b3] = g.bases;
  batter.stats.ab++;
  if (r < 0.68 - (batter.contact - 50) / 300) {
    addOuts(g, 1);
    say(g, `${batter.name} lays down a sacrifice bunt.`);
    if (g.outs < 3) {
      g.bases = [null, b1, b2];
      if (b3) { scoreRuns(g, [b3], batter); say(g, 'A run scores on the squeeze.'); }
    }
  } else if (r < 0.83) {
    batter.stats.h++; battingTeam(g).hits++; fieldingTeam(g).pitcher.stats.h++;
    g.bases = [batter, b1, b2];
    say(g, `${batter.name} beats out a bunt single!`);
    if (b3) scoreRuns(g, [b3], batter);
  } else {
    addOuts(g, 1);
    const lead = b2 || b1 || b3;
    g.bases = lead === b2 ? [batter, b1, b3] : lead === b1 ? [batter, null, b3] : [batter, b1, b2];
    if (g.outs >= 3) g.bases = [null, null, null];
    say(g, `${batter.name}'s bunt is fielded — ${lead.name} is forced out.`);
  }
  creditOuts(g, before);
}

// ---------- The pitch ----------
function ballInPlayWeights(B, P, off, def, inZone) {
  const c = (B.contact - 50) / 100, p = (B.power - 50) / 100, s = (P.stuff - 50) / 100;
  const w = {
    OUT: 65,
    '1B': 22.5 * (1 + c * 0.55 - s * 0.35),
    '2B': 6.5 * (1 + p * 0.5 + c * 0.25 - s * 0.25),
    '3B': 0.7 * (1 + (B.speed - 50) / 100),
    HR: 4.4 * (1 + p * 1.2 - s * 0.4),
  };
  const hit = (m) => { for (const x of ['1B', '2B', '3B', 'HR']) w[x] *= m; };
  if (!inZone) hit(0.82);
  if (off.swing === 'aggressive') { w.HR *= 1.15; w['2B'] *= 1.1; }
  if (off.swing === 'patient') hit(0.96);
  if (def.approach === 'attack') hit(1.04);
  if (def.approach === 'nibble') { hit(0.93); w.HR *= 0.9; }
  if (def.infieldIn) w['1B'] *= 1.08;
  if (def.shift) { if (B.power > 55) w['1B'] *= 0.9; else w['1B'] *= 1.04; }
  if (def.depth === 'deep') { w['2B'] *= 0.85; w['3B'] *= 0.8; w['1B'] *= 1.06; }
  if (def.depth === 'shallow') { w['2B'] *= 1.15; w['3B'] *= 1.2; w['1B'] *= 0.96; }
  return w;
}

function sample(rng, w) {
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (const [k, v] of Object.entries(w)) { if ((r -= v) < 0) return k; }
  return 'OUT';
}

function pitchKind(g, B, P, off, def) {
  const { balls, strikes } = g.pa, rng = g.rng;
  let zone = 0.535 + (P.control - 50) / 250 + (def.approach === 'attack' ? 0.07 : def.approach === 'nibble' ? -0.08 : 0);
  if (balls === 3) zone += 0.12;
  if (strikes === 2 && balls < 2) zone -= 0.06;
  zone = clamp(zone, 0.28, 0.7);
  if (rng() < 0.007) return { kind: 'hbp' };
  const inZone = rng() < zone;
  let sw = inZone ? 0.62 : 0.29;
  sw += off.swing === 'aggressive' ? 0.08 : off.swing === 'patient' ? -0.09 : 0;
  sw -= inZone ? (B.eye - 50) / 900 : (B.eye - 50) / 220;
  if (strikes === 2) sw += inZone ? 0.18 : 0.2;
  if (balls === 3 && strikes < 2) sw -= 0.25;
  if (off.take) sw = inZone ? 0.03 : 0.02;
  if (off.hitRun) sw = inZone ? 0.93 : 0.8;
  sw = clamp(sw, 0.01, 0.97);
  if (rng() >= sw) return { kind: inZone ? 'called' : 'ball', inZone };
  let cp = inZone ? 0.93 + (B.contact - 50) / 230 - (P.stuff - 50) / 260 : 0.67 + (B.contact - 50) / 210 - (P.stuff - 50) / 230;
  if (off.hitRun) cp += 0.04;
  if (rng() >= clamp(cp, 0.3, 0.97)) return { kind: 'whiff', inZone };
  if (rng() < (inZone ? 0.5 : 0.65)) return { kind: 'foul', inZone };
  return { kind: 'inplay', inZone };
}

function closePA(g, ev, result) {
  const bat = battingTeam(g);
  ev.result = result;
  g.pa = { balls: 0, strikes: 0, pitches: 0, seq: [] };
  bat.batIdx = (bat.batIdx + 1) % 9;
  if (g.half === 'bot' && g.inning >= 9 && g.home.runs > g.away.runs) {
    g.over = true; g.winner = 'home';
    say(g, `Walk-off! ${g.home.name} win ${g.home.runs}-${g.away.runs}.`);
    return;
  }
  if (g.outs >= 3) endHalf(g);
}

function endHalf(g) {
  const bat = battingTeam(g);
  bat.inningRuns[g.inning - 1] = bat.inningRuns[g.inning - 1] || 0;
  g.outs = 0; g.bases = [null, null, null];
  g.pa = { balls: 0, strikes: 0, pitches: 0, seq: [] };
  if (g.half === 'top') {
    if (g.inning >= 9 && g.home.runs > g.away.runs) {
      g.over = true; g.winner = 'home';
      say(g, `${g.home.name} win ${g.home.runs}-${g.away.runs}.`);
      return;
    }
    g.half = 'bot';
    say(g, `— Bottom ${g.inning} —`);
  } else {
    if (g.inning >= 9 && g.home.runs !== g.away.runs) {
      g.over = true; g.winner = g.home.runs > g.away.runs ? 'home' : 'away';
      say(g, `Final: ${g.away.name} ${g.away.runs}, ${g.home.name} ${g.home.runs}.`);
      return;
    }
    g.inning++; g.half = 'top';
    say(g, `— Top ${g.inning} —`);
  }
}

/**
 * Throw one pitch. orders = { off: {swing, take, steal, bunt, hitRun}, def: {approach, ibb, pitchout, infieldIn, shift, depth} }
 * Returns an event: { kind, result, runs, steal } for UI feedback.
 */
export function pitch(g, orders = {}) {
  if (g.over) return null;
  const off = { swing: 'normal', ...(orders.off || {}) };
  const def = { approach: 'normal', depth: 'normal', ...(orders.def || {}) };
  const bat = battingTeam(g), pit = fieldingTeam(g).pitcher, batter = bat.lineup[bat.batIdx];
  const rng = g.rng, pa = g.pa, r0 = bat.runs;
  const ev = { kind: null, result: null, runs: 0, steal: null };
  g.last = ev;
  const finish = () => { ev.runs = bat.runs - r0; return ev; };
  if (pa.pitches === 0) g.paCount++;
  pa.pitches++;

  if (def.ibb) {
    say(g, `${pit.name} intentionally walks ${batter.name}.`);
    pit.stats.pitches += 4; pit.stats.bb++; batter.stats.bb++;
    forceWalk(g, batter);
    closePA(g, ev, 'BB');
    return finish();
  }
  pit.stats.pitches++;

  const B = effBatter(batter, pit), P = effPitcher(pit);
  const [b1, b2, b3] = g.bases;

  // Who is running on this pitch?
  let runner = null, from = -1;
  if ((off.steal || off.hitRun) && b1 && !b2) { runner = b1; from = 0; }
  else if (off.steal && b2 && !b3) { runner = b2; from = 1; }

  // Bunt
  const canBunt = off.bunt && g.outs < 2 && (b1 || b2 || b3);
  let k;
  if (def.pitchout) k = { kind: 'ball', inZone: false };
  else if (canBunt) {
    const r = rng();
    if (r < 0.12) k = { kind: 'foul', inZone: true, bunt: true };
    else if (r < 0.2) k = { kind: 'whiff', inZone: true, bunt: true };
    else {
      pa.seq.push('X');
      bunt(g, batter);
      closePA(g, ev, 'BUNT');
      ev.kind = 'inplay';
      return finish();
    }
  } else k = pitchKind(g, B, P, off, def);
  ev.kind = k.kind;

  if (k.kind === 'hbp') {
    pa.seq.push('H');
    say(g, `${batter.name} is hit by the pitch.`);
    batter.stats.bb++; pit.stats.bb++;
    forceWalk(g, batter);
    closePA(g, ev, 'BB');
    return finish();
  }

  // Steal attempt (the runner goes on any pitch that isn't put in play or fouled off)
  if (runner && k.kind !== 'inplay' && k.kind !== 'foul') {
    let p = 0.68 + (runner.speed - 50) / 110 - (P.control > 60 ? 0.03 : 0) - (from === 1 ? 0.1 : 0) - (def.pitchout ? 0.5 : 0);
    p = clamp(p, 0.1, 0.92);
    const before = g.outs, base = from === 0 ? 'second' : 'third';
    if (rng() < p) {
      g.bases = from === 0 ? [null, runner, g.bases[2]] : [g.bases[0], null, runner];
      say(g, `${runner.name} steals ${base}!`);
      ev.steal = 'SB';
    } else {
      g.bases = from === 0 ? [null, g.bases[1], g.bases[2]] : [g.bases[0], null, g.bases[2]];
      addOuts(g, 1);
      say(g, `${runner.name} is caught stealing${def.pitchout ? ' on the pitchout' : ''}.`);
      ev.steal = 'CS';
      creditOuts(g, before);
      if (g.outs >= 3) { pa.seq.push('-'); ev.result = 'CS'; endHalf(g); return finish(); }
    }
  }

  switch (k.kind) {
    case 'ball':
      pa.balls++; pa.seq.push('B');
      if (pa.balls >= 4) {
        batter.stats.bb++; pit.stats.bb++;
        say(g, `${batter.name} draws a walk.`);
        forceWalk(g, batter);
        closePA(g, ev, 'BB');
      }
      break;
    case 'called': case 'whiff':
      pa.strikes++; pa.seq.push(k.kind === 'called' ? 'C' : 'S');
      if (pa.strikes >= 3) {
        const before = g.outs;
        batter.stats.ab++; batter.stats.k++; pit.stats.k++; addOuts(g, 1);
        say(g, `${batter.name} strikes out ${k.kind === 'called' ? 'looking' : 'swinging'}${fatigue(pit) > 0.5 ? ' against a tiring arm' : ''}.`);
        creditOuts(g, before);
        closePA(g, ev, 'K');
      }
      break;
    case 'foul':
      pa.seq.push('F');
      if (pa.strikes < 2) pa.strikes++;
      else if (k.bunt) {
        const before = g.outs;
        batter.stats.ab++; batter.stats.k++; pit.stats.k++; addOuts(g, 1);
        say(g, `${batter.name} fouls off the bunt for strike three.`);
        creditOuts(g, before);
        closePA(g, ev, 'K');
      }
      break;
    default: { // inplay
      pa.seq.push('X');
      const before = g.outs, running = !!runner;
      const res = sample(rng, ballInPlayWeights(B, P, off, def, k.inZone));
      if (res === 'OUT') { resolveOutInPlay(g, batter, def, running); creditOuts(g, before); closePA(g, ev, 'OUT'); }
      else {
        const n = resolveHit(g, res, batter, running);
        const label = { '1B': 'singles', '2B': 'doubles', '3B': 'triples', HR: 'homers' }[res];
        say(g, `${batter.name} ${label}${n ? ` — ${n} run${n > 1 ? 's' : ''} score${n > 1 ? '' : 's'}!` : '.'}`);
        closePA(g, ev, res);
      }
    }
  }
  return finish();
}

// Play the rest of the current plate appearance with fixed orders.
export function finishAtBat(g, orders = {}) {
  let guard = 0;
  do { pitch(g, orders); } while (!g.over && g.pa.pitches > 0 && guard++ < 30);
}

// ---------- Substitutions ----------
export function changePitcher(g, team, pitcherId) {
  const i = team.bullpen.findIndex((p) => p.id === pitcherId);
  if (i < 0) return false;
  const [np] = team.bullpen.splice(i, 1);
  team.usedPitchers.push(team.pitcher);
  np.stintRuns = 0;
  say(g, `${team.name} bring in ${np.name} (${np.hand}HP ${np.pos}) to replace ${team.pitcher.name}.`);
  team.pitcher = np;
  return true;
}

export function pinchHit(g, team, benchId) {
  const i = team.bench.findIndex((p) => p.id === benchId);
  if (i < 0) return false;
  const [np] = team.bench.splice(i, 1);
  const old = team.lineup[team.batIdx];
  np.pos = old.pos;
  team.usedBatters.push(old);
  say(g, `${np.name} pinch-hits for ${old.name}.`);
  team.lineup[team.batIdx] = np;
  return true;
}

export function pinchRun(g, team, baseIdx, benchId) {
  const i = team.bench.findIndex((p) => p.id === benchId);
  const runner = g.bases[baseIdx];
  if (i < 0 || !runner) return false;
  const [np] = team.bench.splice(i, 1);
  const li = team.lineup.indexOf(runner);
  np.pos = runner.pos;
  if (li >= 0) team.lineup[li] = np;
  team.usedBatters.push(runner);
  g.bases[baseIdx] = np;
  say(g, `${np.name} pinch-runs for ${runner.name}.`);
  return true;
}

// ---------- AI manager (level 0 rookie, 1 pro, 2 all-star) ----------
const ovr = (b, p) => { const e = p ? effBatter(b, p) : b; return e.contact * 0.5 + e.power * 0.35 + b.eye * 0.15; };

export function aiOffense(g, level = g.level ?? 1) {
  const bat = battingTeam(g), batter = bat.lineup[bat.batIdx], pit = fieldingTeam(g).pitcher;
  const o = { swing: 'normal' };
  if (level === 0) return o;
  const diff = Math.abs(g.home.runs - g.away.runs), late = g.inning >= 7;
  const [b1, b2] = g.bases;
  if (g.pa.pitches === 0 && b1 && !b2 && g.outs < 2 && b1.speed > 68 && g.rng() < 0.3) o.steal = true;
  if (g.pa.strikes < 2 && g.outs === 0 && (b1 || b2) && late && diff <= 1 && batter.power < 45 && batter.contact < 55) o.bunt = true;
  if (batter.eye > 65 && batter.power < 50) o.swing = 'patient';
  if (batter.power > 70) o.swing = 'aggressive';
  if (level >= 2) {
    if (g.pa.pitches === 0 && b1 && !b2 && g.outs < 2 && b1.speed > 55 && batter.contact > 60 && !o.steal && g.rng() < 0.2) o.hitRun = true;
    if (g.pa.balls === 3 && g.pa.strikes < 2 && batter.eye > 55) o.take = true;
    if (g.pa.strikes === 2) o.swing = 'normal';
  }
  return o;
}

export function aiDefense(g, level = g.level ?? 1) {
  const team = fieldingTeam(g), batting = battingTeam(g);
  const batter = batting.lineup[batting.batIdx], next = batting.lineup[(batting.batIdx + 1) % 9];
  const d = { approach: 'normal', depth: 'normal' };
  if (level === 0) return d;
  const close = Math.abs(team.runs - batting.runs) <= 1;
  if (!g.bases[0] && (g.bases[1] || g.bases[2]) && g.outs < 2 && g.inning >= 7 && batter.power > 70 && next.power < batter.power - 15) d.ibb = true;
  if (g.bases[2] && g.outs < 2 && g.inning >= 8 && close) d.infieldIn = true;
  if (level >= 2) {
    if (g.bases[0] && !g.bases[1] && g.bases[0].speed > 78 && g.pa.strikes < 2 && g.pa.balls < 2 && g.rng() < 0.1) d.pitchout = true;
    if (batter.power > 60 && batter.hand === 'L') d.shift = true;
    if (batter.power > 72) d.depth = 'deep';
    else if (g.inning >= 9 && g.bases[1] && close && batter.power < 40) d.depth = 'shallow';
  }
  return d;
}

function aiPitching(g, team, level) {
  const p = team.pitcher, batting = team === g.home ? g.away : g.home;
  const lim = level === 0 ? 0.9 : 0.65;
  const tired = fatigue(p) > lim || p.stintRuns >= (level === 0 ? 6 : 4) || (p.role !== 'SP' && p.stats.pitches > p.stamina + 8);
  const lead = team.runs - batting.runs;
  const save = level >= 2 && g.inning >= 9 && lead > 0 && lead <= 3 && p.role !== 'CL';
  if ((tired || save) && team.bullpen.length) {
    const cl = team.bullpen.find((x) => x.role === 'CL');
    const nb = batting.lineup[batting.batIdx];
    const score = (x) => x.stuff - (x.debt || 0) * 25 + (level >= 2 && nb.hand !== 'S' && x.hand === nb.hand ? 8 : 0);
    const choice = ((g.inning >= 9 && lead > 0 && lead <= 3) || save) && cl ? cl : [...team.bullpen].sort((a, b) => score(b) - score(a))[0];
    changePitcher(g, team, choice.id);
  }
}

function aiBench(g, team, level) {
  if (g.inning < 7 || !team.bench.length) return;
  const pit = (team === g.home ? g.away : g.home).pitcher;
  const batter = team.lineup[team.batIdx];
  const margin = level >= 2 ? 12 : 22;
  const best = [...team.bench].sort((a, b) => ovr(b, pit) - ovr(a, pit))[0];
  if (ovr(best, pit) > ovr(batter, pit) + margin && g.inning >= (level >= 2 ? 7 : 8)) { pinchHit(g, team, best.id); return; }
  if (level >= 2 && g.inning >= 8 && Math.abs(g.home.runs - g.away.runs) <= 1) {
    const slot = g.bases.findIndex((r) => r && r.speed < 45);
    if (slot >= 0) {
      const fast = [...team.bench].sort((a, b) => b.speed - a.speed)[0];
      if (fast && fast.speed > 72) pinchRun(g, team, slot, fast.id);
    }
  }
}

// Substitutions the AI makes before a new plate appearance, for the teams it controls.
// The user's own side (when handed to autopilot) always plays at "pro" level; only the opponent scales.
export const levelFor = (g, team) => (g.user && team === g.user ? 1 : g.level ?? 1);

export function aiPrePA(g, controlled) {
  if (g.over || g.pa.pitches > 0) return;
  const bat = battingTeam(g), fld = fieldingTeam(g);
  if (controlled.includes(bat) && levelFor(g, bat) >= 1) aiBench(g, bat, levelFor(g, bat));
  if (controlled.includes(fld)) aiPitching(g, fld, levelFor(g, fld));
}

export function aiPitch(g, controlled) {
  aiPrePA(g, controlled);
  const bat = battingTeam(g), fld = fieldingTeam(g);
  return pitch(g, {
    off: controlled.includes(bat) ? aiOffense(g, levelFor(g, bat)) : { swing: 'normal' },
    def: controlled.includes(fld) ? aiDefense(g, levelFor(g, fld)) : { approach: 'normal' },
  });
}

export function autoPlay(g, controlled = [g.home, g.away], maxPitches = 6000) {
  for (let n = 0; !g.over && n < maxPitches; n++) aiPitch(g, controlled);
  return g;
}

// Play out the current half-inning with the AI running the given teams.
export function autoHalf(g, controlled) {
  const h = g.half, i = g.inning;
  for (let n = 0; !g.over && g.half === h && g.inning === i && n < 400; n++) aiPitch(g, controlled);
}

// ---------- Season stats ----------
export function commitGame(g) {
  for (const t of [g.home, g.away]) {
    const seen = new Set();
    for (const b of [...t.lineup, ...t.usedBatters]) {
      if (seen.has(b)) continue; seen.add(b);
      b.season.g++;
      for (const k of ['ab', 'h', 'hr', 'rbi', 'bb', 'k']) b.season[k] += b.stats[k];
    }
    const ps = new Set([...t.usedPitchers, t.pitcher]);
    for (const p of ps) {
      p.season.g++;
      if (p === t.starter) p.season.gs++;
      for (const k of ['pitches', 'outs', 'h', 'r', 'bb', 'k']) p.season[k] += p.stats[k];
    }
  }
}

// ---------- Save / load (players and teams are de-duplicated by uid) ----------
export function pack(root) {
  const table = new Map(), queue = [];
  let self = null;
  const rep = (k, v) => {
    if (v && typeof v === 'object' && v !== self && (v.type === 'bat' || v.type === 'pit' || v.type === 'team')) {
      if (!table.has(v.uid)) { table.set(v.uid, v); queue.push(v); }
      return { $r: v.uid };
    }
    return v;
  };
  const rootStr = JSON.stringify(root, rep);
  const items = [];
  for (let i = 0; i < queue.length; i++) { self = queue[i]; items.push(JSON.stringify(self, rep)); }
  return `{"root":${rootStr},"items":[${items.join(',')}]}`;
}

export function unpack(str) {
  const { root, items } = JSON.parse(str), map = {};
  let maxId = 0;
  for (const o of items) { map[o.uid] = o; maxId = Math.max(maxId, o.id || 0); }
  const res = (v) => {
    if (v && typeof v === 'object') {
      if (v.$r) return map[v.$r];
      for (const k of Object.keys(v)) v[k] = res(v[k]);
    }
    return v;
  };
  for (const o of items) for (const k of Object.keys(o)) o[k] = res(o[k]);
  bumpIds(maxId);
  return res(root);
}

export function reviveGame(g) { return g ? attachRng(g) : g; }
