// Season mode: an 8-team league, 28-game schedule, playoffs, injuries,
// pitcher rest, hot/cold streaks and yearly player development.
import {
  attachRng, makeTeam, startGame, autoPlay, commitGame, blankBat, blankPit,
} from './engine.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const TEAM_NAMES = [
  ['Harbor City', 'Skippers'], ['Mesa', 'Scorpions'], ['Lakeside', 'Herons'], ['Redrock', 'Miners'],
  ['Pinecrest', 'Wolves'], ['Port Royal', 'Gulls'], ['Ironbridge', 'Forge'], ['Sunset Coast', 'Pelicans'],
];
export const SEASON_GAMES = 28;

function buildSchedule() {
  const ids = [0, 1, 2, 3, 4, 5, 6, 7], rounds = [];
  for (let r = 0; r < 7; r++) {
    const pairs = [];
    for (let i = 0; i < 4; i++) pairs.push([ids[i], ids[7 - i]]);
    rounds.push(pairs);
    ids.splice(1, 0, ids.pop());
  }
  const days = [];
  for (let pass = 0; pass < 4; pass++) {
    rounds.forEach((pairs, r) => days.push(pairs.map(([a, b], i) => (((pass % 2) ^ ((r + i) % 2)) ? [b, a] : [a, b]))));
  }
  return days;
}

export function createLeague(seed = Date.now() % 1e9) {
  const lg = attachRng({
    rs: seed | 0, seed, season: 1, day: 0, phase: 'regular', userId: 0, teams: [], schedule: buildSchedule(),
    playoffs: null, champion: null, news: [], results: [], history: [],
  });
  const used = new Set();
  lg.teams = TEAM_NAMES.map(([c, n]) => makeTeam(lg.rng, c, n, used));
  // Give the league some texture: a few stars and a few weak clubs.
  lg.teams.forEach((t, i) => {
    const bias = i === 0 ? 0 : Math.round((lg.rng() - 0.5) * 8);
    for (const p of t.batters) for (const k of ['contact', 'power', 'eye']) p[k] = clamp(p[k] + bias, 20, 95);
    for (const p of [...t.sp, ...t.rp]) for (const k of ['stuff', 'control']) p[k] = clamp(p[k] + bias, 20, 95);
    // best hitters bat near the top of the order
    t.batters = [...t.batters.slice(0, 9).sort((a, b) => (b.contact + b.power + b.eye) - (a.contact + a.power + a.eye)), ...t.batters.slice(9)];
  });
  return lg;
}

export const userTeam = (lg) => lg.teams[lg.userId];

export function standings(lg) {
  return [...lg.teams].sort((a, b) => (b.w - a.w) || ((b.rs - b.ra) - (a.rs - a.ra)) || (b.rs - a.rs));
}

// The user's next game, or null if the user has no game scheduled today.
export function nextGame(lg) {
  if (lg.phase === 'regular') {
    const pair = lg.schedule[lg.day].find(([h, a]) => h === lg.userId || a === lg.userId);
    return { home: lg.teams[pair[0]], away: lg.teams[pair[1]], label: `Game ${lg.day + 1} of ${SEASON_GAMES}` };
  }
  if (lg.phase === 'playoffs') {
    const s = activeSeries(lg).find((x) => !x.done && (x.a === lg.userId || x.b === lg.userId));
    if (!s) return null;
    const [h, a] = seriesHome(s);
    return { home: lg.teams[h], away: lg.teams[a], label: `${lg.playoffs.round === 'final' ? 'Final' : 'Semifinal'} — game ${s.games + 1} (best of 3)`, series: s };
  }
  return null;
}

const activeSeries = (lg) => (lg.playoffs ? (lg.playoffs.round === 'final' ? [lg.playoffs.final] : lg.playoffs.semis) : []);
const seriesHome = (s) => (s.games % 2 === 1 ? [s.b, s.a] : [s.a, s.b]);

function simGame(lg, home, away) {
  const g = startGame(home, away, { seed: Math.floor(lg.rng() * 2 ** 31), level: 1 });
  autoPlay(g);
  return g;
}

function injuryRolls(lg, g) {
  for (const t of [g.home, g.away]) {
    for (const b of [...t.lineup, ...t.usedBatters]) {
      if (lg.rng() < 0.012) hurt(lg, t, b, 3 + Math.floor(lg.rng() * 9));
    }
    for (const p of [...t.usedPitchers, t.pitcher]) {
      const risk = p.stats.pitches > 105 ? 0.04 : p.role === 'SP' ? 0.012 : 0.007;
      if (lg.rng() < risk) hurt(lg, t, p, 4 + Math.floor(lg.rng() * 12));
    }
  }
}
function hurt(lg, t, p, days) {
  if (p.inj > 0) return;
  p.inj = days;
  lg.news.unshift(`${t.name}: ${p.name} (${p.pos}) is hurt — out ~${days} days.`);
  lg.news.length = Math.min(lg.news.length, 30);
}

// Record a finished game (user or simulated). Not used for exhibition games.
export function recordGame(lg, g, { playoff = false } = {}) {
  commitGame(g);
  if (!playoff) {
    for (const [t, other, won] of [[g.home, g.away, g.winner === 'home'], [g.away, g.home, g.winner === 'away']]) {
      if (won) t.w++; else t.l++;
      t.rs += t.runs; t.ra += other.runs;
    }
  }
  for (const t of [g.home, g.away]) {
    for (const p of [...t.usedPitchers, t.pitcher]) p.debt = clamp((p.debt || 0) + p.stats.pitches / (p.stamina * 1.1), 0, 1);
    t.rotIdx = (t.rotIdx + 1) % 5;
  }
  injuryRolls(lg, g);
  lg.results.unshift({ day: lg.day + 1, home: g.home.name, away: g.away.name, hr: g.home.runs, ar: g.away.runs, playoff });
  lg.results.length = Math.min(lg.results.length, 40);
}

function dailyTick(lg) {
  for (const t of lg.teams) {
    for (const p of [...t.batters, ...t.sp, ...t.rp]) {
      if (p.inj > 0) p.inj--;
      if (p.type === 'pit') p.debt = (p.debt || 0) * (p.role === 'SP' ? 0.72 : 0.6);
      const walk = Math.round((lg.rng() + lg.rng() - 1) * 5);
      p.form = clamp(Math.round(p.form * 0.5) + walk, -5, 5);
    }
  }
}

function playRound(lg, userGame, matches) {
  // matches: [{home, away, series?}] ; the user's game (if any) is already played.
  for (const m of matches) {
    const involvesUser = m.home.id === userTeam(lg).id || m.away.id === userTeam(lg).id;
    let g;
    if (involvesUser && userGame) g = userGame;
    else g = simGame(lg, m.home, m.away);
    recordGame(lg, g, { playoff: lg.phase === 'playoffs' });
    m.result = g;
  }
}

// Finish the current day. userGame is the finished game the user managed, or null to sim everything.
export function completeDay(lg, userGame = null) {
  if (lg.phase === 'regular') {
    const matches = lg.schedule[lg.day].map(([h, a]) => ({ home: lg.teams[h], away: lg.teams[a] }));
    playRound(lg, userGame, matches);
    lg.day++;
    dailyTick(lg);
    if (lg.day >= SEASON_GAMES) startPlayoffs(lg);
  } else if (lg.phase === 'playoffs') {
    const series = activeSeries(lg).filter((s) => !s.done);
    const matches = series.map((s) => { const [h, a] = seriesHome(s); return { home: lg.teams[h], away: lg.teams[a], s }; });
    playRound(lg, userGame, matches);
    for (const m of matches) {
      const s = m.s, g = m.result;
      const homeIdx = lg.teams.indexOf(m.home);
      const aWon = (g.winner === 'home') === (homeIdx === s.a);
      if (aWon) s.wa++; else s.wb++;
      s.games++;
      if (s.wa === 2 || s.wb === 2) { s.done = true; s.winner = s.wa === 2 ? s.a : s.b; }
    }
    lg.day++;
    dailyTick(lg);
    advancePlayoffs(lg);
  }
}

function startPlayoffs(lg) {
  const seeds = standings(lg).map((t) => lg.teams.indexOf(t));
  const mk = (a, b) => ({ a, b, wa: 0, wb: 0, games: 0, done: false, winner: null });
  lg.phase = 'playoffs';
  lg.playoffs = { round: 'semi', semis: [mk(seeds[0], seeds[3]), mk(seeds[1], seeds[2])], final: null };
  lg.news.unshift('The regular season is over. Playoffs begin!');
}

function advancePlayoffs(lg) {
  const p = lg.playoffs;
  if (p.round === 'semi' && p.semis.every((s) => s.done)) {
    p.round = 'final';
    p.final = { a: p.semis[0].winner, b: p.semis[1].winner, wa: 0, wb: 0, games: 0, done: false, winner: null };
    lg.news.unshift('The final is set.');
  } else if (p.round === 'final' && p.final.done) {
    lg.champion = p.final.winner;
    lg.phase = 'done';
    lg.history.push({ season: lg.season, champion: lg.teams[lg.champion].name });
    lg.news.unshift(`${lg.teams[lg.champion].name} are the champions!`);
  }
}

// Auto-sim everything until the user's next game (or the end of the season).
export function simUserGame(lg) {
  const ng = nextGame(lg);
  if (!ng) { completeDay(lg, null); return null; }
  const g = simGame(lg, ng.home, ng.away);
  completeDay(lg, g);
  return g;
}

export function simToEnd(lg) {
  for (let guard = 0; lg.phase !== 'done' && guard < 80; guard++) simUserGame(lg);
}

export function userEliminated(lg) {
  if (lg.phase !== 'playoffs' && lg.phase !== 'done') return false;
  if (lg.phase === 'done') return lg.champion !== lg.userId;
  const inSemi = lg.playoffs.semis.some((s) => s.a === lg.userId || s.b === lg.userId);
  if (!inSemi) return true;
  const lost = lg.playoffs.semis.find((s) => s.done && (s.a === lg.userId || s.b === lg.userId) && s.winner !== lg.userId);
  if (lost) return true;
  if (lg.playoffs.round === 'final') { const f = lg.playoffs.final; if (f.done && f.winner !== lg.userId) return true; }
  return false;
}

// ---------- Off-season ----------
export function newSeason(lg) {
  lg.season++; lg.day = 0; lg.phase = 'regular'; lg.playoffs = null; lg.champion = null;
  lg.schedule = buildSchedule(); lg.results = [];
  const rr = () => lg.rng();
  for (const t of lg.teams) {
    t.w = t.l = t.rs = t.ra = 0; t.rotIdx = 0;
    for (const p of [...t.batters, ...t.sp, ...t.rp]) {
      p.age++; p.inj = 0; p.form = 0; p.debt = 0;
      const delta = (lo, hi) => Math.round(lo + rr() * (hi - lo));
      const [lo, hi] = p.age <= 24 ? [0, 4] : p.age <= 29 ? [-1, 2] : p.age <= 33 ? [-2, 1] : [-4, 0];
      if (p.type === 'bat') {
        for (const k of ['contact', 'power', 'eye']) p[k] = clamp(p[k] + delta(lo, hi), 20, 99);
        p.speed = clamp(p.speed + delta(p.age > 29 ? -4 : lo, p.age > 29 ? 0 : hi), 20, 99);
        p.season = blankBat();
      } else {
        for (const k of ['stuff', 'control']) p[k] = clamp(p[k] + delta(lo, hi), 20, 99);
        p.season = blankPit();
      }
    }
  }
}

// ---------- Leaders ----------
export function allPlayers(lg) { return lg.teams.flatMap((t) => [...t.batters, ...t.sp, ...t.rp].map((p) => ({ p, t }))); }

export function leaders(lg, n = 5) {
  const bats = allPlayers(lg).filter((x) => x.p.type === 'bat');
  const pits = allPlayers(lg).filter((x) => x.p.type === 'pit');
  const top = (arr, f, asc = false) => [...arr].sort((a, b) => (asc ? f(a) - f(b) : f(b) - f(a))).slice(0, n);
  const avg = (s) => (s.ab ? s.h / s.ab : 0);
  const ra9 = (s) => (s.outs ? (s.r * 27) / s.outs : 99);
  return {
    AVG: top(bats.filter((x) => x.p.season.ab >= 40), (x) => avg(x.p.season)).map((x) => ({ ...x, v: avg(x.p.season).toFixed(3).replace(/^0/, '') })),
    HR: top(bats, (x) => x.p.season.hr).map((x) => ({ ...x, v: x.p.season.hr })),
    RBI: top(bats, (x) => x.p.season.rbi).map((x) => ({ ...x, v: x.p.season.rbi })),
    RA9: top(pits.filter((x) => x.p.season.outs >= 30), (x) => ra9(x.p.season), true).map((x) => ({ ...x, v: ra9(x.p.season).toFixed(2) })),
    K: top(pits, (x) => x.p.season.k).map((x) => ({ ...x, v: x.p.season.k })),
  };
}
