// Skipper engine: a plate-appearance-level baseball simulation where the
// player's only lever is managerial decisions. Pure logic, no DOM.

export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ['Jake', 'Miguel', 'Tom', 'Carlos', 'Ben', 'Luis', 'Danny', 'Hank', 'Ray', 'Ty', 'Omar', 'Sam', 'Eli', 'Gus', 'Nate', 'Pablo', 'Rex', 'Walt', 'Vic', 'Joe'];
const LAST = ['Rivera', 'Sullivan', 'Okafor', 'Brandt', 'Kowalski', 'Tanaka', 'Delgado', 'Mercer', 'Hollis', 'Pruitt', 'Vance', 'Castillo', 'Moreno', 'Fitch', 'Larkin', 'Duffy', 'Soto', 'Nakamura', 'Boyle', 'Quincy', 'Reyes', 'Walsh', 'Ibarra', 'Ford'];
const POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const rating = (rng, mean = 55, spread = 18) => Math.round(clamp(mean + (rng() + rng() + rng() - 1.5) * spread * 1.6, 20, 95));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

let nextId = 1;
let usedNames = new Set();
function uniqueName(rng) {
  for (let i = 0; i < 50; i++) { const n = `${pick(rng, FIRST)} ${pick(rng, LAST)}`; if (!usedNames.has(n) && ![...usedNames].some((u) => u.split(' ')[1] === n.split(' ')[1])) { usedNames.add(n); return n; } }
  const n = `${pick(rng, FIRST)} ${pick(rng, LAST)} Jr.`; usedNames.add(n); return n;
}
function makeBatter(rng, pos) {
  return {
    id: nextId++, name: uniqueName(rng), pos, type: 'bat',
    contact: rating(rng), power: rating(rng, 50), eye: rating(rng), speed: rating(rng, 50, 24),
    stats: { ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0 },
  };
}
function makePitcher(rng, role) {
  const sp = role === 'SP';
  return {
    id: nextId++, name: uniqueName(rng), pos: role, type: 'pit', role,
    stuff: rating(rng, sp ? 58 : 56), control: rating(rng, 55),
    stamina: sp ? 82 + Math.floor(rng() * 24) : 20 + Math.floor(rng() * 20),
    stats: { pitches: 0, outs: 0, h: 0, r: 0, bb: 0, k: 0 }, stintRuns: 0, entered: false,
  };
}

export function makeTeam(rng, city, nick) {
  const lineup = POSITIONS.map((p) => makeBatter(rng, p));
  const bench = ['C', 'IF', 'OF', 'OF'].map((p) => makeBatter(rng, p));
  const starter = makePitcher(rng, 'SP');
  starter.entered = true;
  const bullpen = [makePitcher(rng, 'RP'), makePitcher(rng, 'RP'), makePitcher(rng, 'RP'), makePitcher(rng, 'RP'), makePitcher(rng, 'CL')];
  bullpen[4].stuff = clamp(bullpen[4].stuff + 12, 20, 95);
  return { city, nick, name: `${city} ${nick}`, lineup, bench, pitcher: starter, bullpen, usedPitchers: [], batIdx: 0, runs: 0, hits: 0, errors: 0, inningRuns: [] };
}

export function newGame(seed = Date.now(), homeName = ['Harbor City', 'Skippers'], awayName = ['Mesa', 'Scorpions']) {
  const rng = makeRng(seed);
  usedNames = new Set();
  return {
    rng, seed,
    home: makeTeam(rng, ...homeName),
    away: makeTeam(rng, ...awayName),
    inning: 1, half: 'top', outs: 0, bases: [null, null, null],
    over: false, winner: null, log: [], paCount: 0,
  };
}

export const battingTeam = (g) => (g.half === 'top' ? g.away : g.home);
export const fieldingTeam = (g) => (g.half === 'top' ? g.home : g.away);
export const currentBatter = (g) => battingTeam(g).lineup[battingTeam(g).batIdx];
export const onDeck = (g) => battingTeam(g).lineup[(battingTeam(g).batIdx + 1) % 9];

// How tired is this pitcher? 0 = fresh, 1 = gassed.
export function fatigue(p) {
  return clamp((p.stats.pitches - p.stamina * 0.8) / (p.stamina * 0.45 + 10), 0, 1);
}

function say(g, msg) { g.log.push(msg); }

function weights(g, batter, pitcher, off, def) {
  const f = fatigue(pitcher);
  const stuff = pitcher.stuff * (1 - 0.35 * f);
  const control = pitcher.control * (1 - 0.35 * f);
  const c = (batter.contact - 50) / 100, p = (batter.power - 50) / 100, e = (batter.eye - 50) / 100;
  const s = (stuff - 50) / 100, k = (control - 50) / 100;
  const w = {
    K: 22 * (1 + s * 0.9 - c * 0.8 - e * 0.2),
    BB: 8.5 * (1 + e * 0.9 - k * 0.9),
    HR: 3 * (1 + p * 1.2 - s * 0.4),
    '3B': 0.5,
    '2B': 4.5 * (1 + p * 0.5 + c * 0.3 - s * 0.3),
    '1B': 14 * (1 + c * 0.7 - s * 0.4),
    OUT: 47,
  };
  const hitMult = (m) => { for (const x of ['1B', '2B', '3B', 'HR']) w[x] *= m; };
  if (off.swing === 'patient') { w.BB *= 1.25; w.K *= 0.95; hitMult(0.93); }
  if (off.swing === 'aggressive') { w.BB *= 0.75; w.K *= 1.08; w.HR *= 1.2; w['2B'] *= 1.15; }
  if (def.approach === 'attack') { w.BB *= 0.8; w.K *= 1.05; hitMult(1.05); }
  if (def.approach === 'nibble') { w.BB *= 1.3; w.K *= 0.95; hitMult(0.9); w.HR *= 0.9; }
  if (def.infieldIn) w['1B'] *= 1.08;
  return w;
}

function sample(rng, w) {
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (const [k, v] of Object.entries(w)) { if ((r -= v) < 0) return k; }
  return 'OUT';
}

function scoreRuns(g, runners, batter, { rbi = true } = {}) {
  const bat = battingTeam(g), pit = fieldingTeam(g).pitcher;
  const n = runners.length;
  if (!n) return;
  bat.runs += n;
  bat.inningRuns[g.inning - 1] = (bat.inningRuns[g.inning - 1] || 0) + n;
  pit.stats.r += n; pit.stintRuns += n;
  if (rbi && batter) batter.stats.rbi += n;
}

function addOuts(g, n) { g.outs = Math.min(3, g.outs + n); }

function walk(g, batter) {
  const [b1, b2, b3] = g.bases;
  const runs = [];
  const nb = [batter, null, null];
  if (b1) {
    nb[1] = b1;
    if (b2) { nb[2] = b2; if (b3) runs.push(b3); } else nb[2] = b3;
  } else { nb[1] = b2; nb[2] = b3; }
  g.bases = nb;
  scoreRuns(g, runs, batter);
}

function resolveHit(g, kind, batter) {
  const { rng } = g;
  const [b1, b2, b3] = g.bases;
  const runs = [];
  let nb = [null, null, null];
  const sp = (r) => (r.speed - 50) / 200;
  if (kind === 'HR') {
    runs.push(...[b3, b2, b1].filter(Boolean), batter);
  } else if (kind === '3B') {
    runs.push(...[b3, b2, b1].filter(Boolean)); nb[2] = batter;
  } else if (kind === '2B') {
    if (b3) runs.push(b3);
    if (b2) runs.push(b2);
    if (b1) { if (rng() < 0.4 + sp(b1)) runs.push(b1); else nb[2] = b1; }
    nb[1] = batter;
  } else {
    nb[0] = batter;
    if (b3) runs.push(b3);
    if (b2) { if (rng() < 0.55 + sp(b2)) runs.push(b2); else nb[2] = b2; }
    if (b1) { if (!nb[2] && rng() < 0.25 + sp(b1)) nb[2] = b1; else nb[1] = b1; }
  }
  g.bases = nb;
  scoreRuns(g, runs, batter);
  const pit = fieldingTeam(g).pitcher, bat = battingTeam(g);
  pit.stats.h++; bat.hits++; batter.stats.h++; batter.stats.ab++;
  if (kind === 'HR') batter.stats.hr++;
  return runs.length;
}

function resolveOutInPlay(g, batter, def) {
  const { rng } = g;
  const [b1, b2, b3] = g.bases;
  const ground = rng() < 0.55 - (batter.power - 50) / 400;
  batter.stats.ab++;
  const runs = [];
  let rbi = true;
  if (ground) {
    if (b1 && g.outs < 2 && rng() < (def.infieldIn ? 0.3 : 0.42)) {
      addOuts(g, 2);
      rbi = false;
      if (g.outs < 3) { if (b3) runs.push(b3); g.bases = [null, null, b2]; } else g.bases = [null, null, null];
      say(g, `${batter.name} grounds into a double play.`);
    } else {
      addOuts(g, 1);
      const nb = [null, null, null];
      if (g.outs < 3) {
        if (b3) {
          const forced = !!(b1 && b2);
          const p = def.infieldIn ? 0.35 : 0.65;
          if (forced || rng() < p) runs.push(b3); else nb[2] = b3;
        }
        if (b2) {
          if (!nb[2] && (b1 || rng() < 0.45)) nb[2] = b2; else nb[1] = b2;
        }
        if (b1) nb[1] = b1;
      }
      g.bases = nb;
      say(g, `${batter.name} grounds out.`);
    }
  } else {
    addOuts(g, 1);
    const nb = [b1, b2, b3];
    if (g.outs < 3) {
      if (b3 && rng() < 0.65) { runs.push(b3); nb[2] = null; }
      if (b2 && !nb[2] && rng() < 0.2) { nb[2] = b2; nb[1] = null; }
    }
    g.bases = nb;
    say(g, `${batter.name} flies out${runs.length ? ' — sacrifice fly!' : '.'}`);
  }
  if (runs.length) { scoreRuns(g, runs, batter, { rbi }); say(g, `${runs.length} run${runs.length > 1 ? 's' : ''} score.`); }
}

function creditOuts(g, before) {
  fieldingTeam(g).pitcher.stats.outs += g.outs - before;
}

function pitchCount(rng, result, f) {
  const base = { K: 5, BB: 5.6, OUT: 3.2, '1B': 3.5, '2B': 3.6, '3B': 3.6, HR: 3.4 }[result];
  return Math.max(1, Math.round(base + (rng() - 0.5) * 3 + f * 0.8));
}

function stealAttempt(g) {
  const { rng } = g;
  const [b1] = g.bases;
  const pit = fieldingTeam(g).pitcher;
  const p = clamp(0.55 + (b1.speed - 50) / 120 - (pit.control - 50) / 600, 0.25, 0.9);
  const before = g.outs;
  if (rng() < p) {
    g.bases = [null, b1, g.bases[2]];
    say(g, `${b1.name} steals second!`);
  } else {
    g.bases = [null, null, g.bases[2]];
    addOuts(g, 1);
    say(g, `${b1.name} is caught stealing.`);
  }
  creditOuts(g, before);
}

function bunt(g, batter) {
  const { rng } = g;
  const before = g.outs;
  const r = rng();
  const [b1, b2, b3] = g.bases;
  batter.stats.ab++;
  if (r < 0.68 - (batter.contact - 50) / 300) {
    addOuts(g, 1);
    say(g, `${batter.name} lays down a sacrifice bunt.`);
    if (g.outs < 3) {
      g.bases = [null, b1, b2];
      if (b3) { scoreRuns(g, [b3], batter, { rbi: true }); say(g, 'A run scores on the squeeze.'); }
    }
  } else if (r < 0.83) {
    batter.stats.h++; battingTeam(g).hits++; fieldingTeam(g).pitcher.stats.h++;
    g.bases = [batter, b1, b2];
    say(g, `${batter.name} beats out a bunt single!`);
    if (b3) scoreRuns(g, [b3], batter);
  } else {
    addOuts(g, 1);
    const lead = b2 || b1;
    g.bases = lead === b2 ? [batter, b1, b3] : [batter, null, b3];
    if (g.outs >= 3) g.bases = [null, null, null];
    say(g, `${batter.name}'s bunt is fielded — ${lead.name} is forced out.`);
  }
  creditOuts(g, before);
}

// Orders: { off: {swing:'normal'|'patient'|'aggressive', steal, bunt}, def: {approach:'normal'|'attack'|'nibble', ibb, infieldIn} }
export function plateAppearance(g, orders = {}) {
  if (g.over) return;
  const off = { swing: 'normal', ...(orders.off || {}) };
  const def = { approach: 'normal', ...(orders.def || {}) };
  const bat = battingTeam(g), pit = fieldingTeam(g).pitcher;
  const rng = g.rng;
  const batter = bat.lineup[bat.batIdx];
  const startOuts = g.outs;
  g.paCount++;

  if (off.steal && g.bases[0] && !g.bases[1]) {
    stealAttempt(g);
    if (g.outs >= 3) return endPlay(g, false);
  }

  const f = fatigue(pit);
  if (def.ibb) {
    say(g, `${pit.name} intentionally walks ${batter.name}.`);
    pit.stats.pitches += 4; pit.stats.bb++; batter.stats.bb++;
    walk(g, batter);
    return endPlay(g, true);
  }
  if (off.bunt && g.outs < 2 && (g.bases[0] || g.bases[1])) {
    const before = g.outs;
    pit.stats.pitches += 3;
    bunt(g, batter);
    void before;
    return endPlay(g, true);
  }

  const res = sample(rng, weights(g, batter, pit, off, def));
  pit.stats.pitches += pitchCount(rng, res, f);
  const before = g.outs;
  switch (res) {
    case 'K':
      batter.stats.ab++; batter.stats.k++; pit.stats.k++; addOuts(g, 1);
      say(g, `${batter.name} strikes out${f > 0.5 ? ' against a tiring arm' : ''}.`);
      break;
    case 'BB':
      batter.stats.bb++; pit.stats.bb++;
      say(g, `${batter.name} draws a walk.`);
      walk(g, batter);
      break;
    case 'OUT':
      resolveOutInPlay(g, batter, def);
      break;
    default: {
      const n = resolveHit(g, res, batter);
      const label = { '1B': 'singles', '2B': 'doubles', '3B': 'triples', HR: 'homers' }[res];
      say(g, `${batter.name} ${label}${n ? ` — ${n} run${n > 1 ? 's' : ''} score${n > 1 ? '' : 's'}!` : '.'}`);
    }
  }
  creditOuts(g, before);
  void startOuts;
  endPlay(g, true);
}

function endPlay(g, advanceBatter) {
  const bat = battingTeam(g);
  if (advanceBatter) bat.batIdx = (bat.batIdx + 1) % 9;
  // walk-off
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
  for (const t of [g.home, g.away]) t.pitcher.stintRuns = t.pitcher.stintRuns; // stint persists
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

// ---- Substitutions ----

export function changePitcher(g, team, pitcherId) {
  const i = team.bullpen.findIndex((p) => p.id === pitcherId);
  if (i < 0) return false;
  const [np] = team.bullpen.splice(i, 1);
  team.usedPitchers.push(team.pitcher);
  np.entered = true;
  np.stintRuns = 0;
  say(g, `${team.name} bring in ${np.name} (${np.pos}) to replace ${team.pitcher.name}.`);
  team.pitcher = np;
  return true;
}

export function pinchHit(g, team, benchId) {
  const i = team.bench.findIndex((p) => p.id === benchId);
  if (i < 0) return false;
  const [np] = team.bench.splice(i, 1);
  const old = team.lineup[team.batIdx];
  np.pos = old.pos;
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
  g.bases[baseIdx] = np;
  say(g, `${np.name} pinch-runs for ${runner.name}.`);
  return true;
}

// ---- AI manager (used for the opponent, and as a default) ----

export function aiOffense(g) {
  const bat = battingTeam(g);
  const batter = bat.lineup[bat.batIdx];
  const o = { swing: 'normal' };
  const diff = Math.abs(g.home.runs - g.away.runs);
  const late = g.inning >= 7;
  if (g.bases[0] && !g.bases[1] && g.outs < 2 && g.bases[0].speed > 68 && g.rng() < 0.3) o.steal = true;
  if (g.outs === 0 && (g.bases[0] || g.bases[1]) && late && diff <= 1 && batter.power < 45 && batter.contact < 55) o.bunt = true;
  if (batter.eye > 65 && batter.power < 50) o.swing = 'patient';
  if (batter.power > 70) o.swing = 'aggressive';
  return o;
}

export function aiDefense(g) {
  const team = fieldingTeam(g), batting = battingTeam(g);
  const p = team.pitcher;
  const tired = fatigue(p) > 0.65 || p.stintRuns >= 4 || (p.role !== 'SP' && p.stats.pitches > p.stamina + 8);
  if (tired && team.bullpen.length) {
    const lead = team.runs - batting.runs;
    const late = g.inning >= 9 && lead > 0 && lead <= 3;
    const choice = (late && team.bullpen.find((x) => x.role === 'CL')) || [...team.bullpen].sort((a, b) => b.stuff - a.stuff)[0];
    changePitcher(g, team, choice.id);
  }
  const d = { approach: 'normal' };
  const batter = batting.lineup[batting.batIdx];
  const next = batting.lineup[(batting.batIdx + 1) % 9];
  if (!g.bases[0] && (g.bases[1] || g.bases[2]) && g.outs < 2 && g.inning >= 7 && batter.power > 70 && next.power < batter.power - 15) d.ibb = true;
  if (g.bases[2] && g.outs < 2 && g.inning >= 8 && Math.abs(team.runs - batting.runs) <= 1) d.infieldIn = true;
  return d;
}

// Simulate the rest of a game with the AI running both dugouts (used by tests / quick sim).
export function autoPlay(g, maxPA = 2000) {
  while (!g.over && g.paCount < maxPA) {
    const defTeam = fieldingTeam(g);
    void defTeam;
    plateAppearance(g, { off: aiOffense(g), def: aiDefense(g) });
  }
  return g;
}
