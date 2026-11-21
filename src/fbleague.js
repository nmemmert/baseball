// Football season: 8 teams, a 7-game round robin, then single-game semifinals and a final.
import { attachRng } from './engine.js';
import { makeFbTeam, startFbGame, fbAutoPlay, commitFbGame, allPlayers } from './football.js';

const NAMES = [['Harbor City', 'Skippers'], ['Mesa', 'Scorpions'], ['Lakeside', 'Herons'], ['Redrock', 'Miners'], ['Pinecrest', 'Wolves'], ['Port Royal', 'Gulls'], ['Ironbridge', 'Forge'], ['Sunset Coast', 'Pelicans']];
export const FB_GAMES = 7;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function buildSchedule() {
  const ids = [0, 1, 2, 3, 4, 5, 6, 7], days = [];
  for (let r = 0; r < 7; r++) {
    days.push(Array.from({ length: 4 }, (_, i) => ((r + i) % 2 ? [ids[7 - i], ids[i]] : [ids[i], ids[7 - i]])));
    ids.splice(1, 0, ids.pop());
  }
  return days;
}

export function createFbLeague(seed = Date.now() % 1e9) {
  const lg = attachRng({ rs: seed | 0, seed, season: 1, day: 0, phase: 'regular', userId: 0, teams: [], schedule: buildSchedule(), playoffs: null, champion: null, results: [], history: [], news: [] });
  const used = new Set();
  lg.teams = NAMES.map(([c, n], i) => makeFbTeam(lg.rng, c, n, used, i === 0 ? 0 : Math.round((lg.rng() - 0.5) * 9)));
  return lg;
}
export const fbUser = (lg) => lg.teams[lg.userId];
export const fbStandings = (lg) => [...lg.teams].sort((a, b) => (b.w + b.t / 2) - (a.w + a.t / 2) || (b.pf - b.pa) - (a.pf - a.pa) || b.pf - a.pf);

const series = (lg) => (lg.playoffs ? (lg.playoffs.round === 'final' ? [lg.playoffs.final] : lg.playoffs.semis) : []);
const homeOf = (g) => g;

export function nextFbGame(lg) {
  if (lg.phase === 'regular') {
    const pair = lg.schedule[lg.day].find(([h, a]) => h === lg.userId || a === lg.userId);
    return { home: lg.teams[pair[0]], away: lg.teams[pair[1]], label: `Week ${lg.day + 1} of ${FB_GAMES}` };
  }
  if (lg.phase === 'playoffs') {
    const s = series(lg).find((x) => !x.done && (x.a === lg.userId || x.b === lg.userId));
    if (!s) return null;
    return { home: lg.teams[s.a], away: lg.teams[s.b], label: lg.playoffs.round === 'final' ? 'Championship game' : 'Playoff semifinal', series: s };
  }
  return null;
}

function simGame(lg, home, away) {
  const g = startFbGame(home, away, { seed: Math.floor(lg.rng() * 2 ** 31), level: 1 });
  fbAutoPlay(g);
  return g;
}
function record(lg, g, playoff) {
  commitFbGame(g);
  const h = g.home, a = g.away;
  if (!playoff) {
    h.pf += g.score.home; h.pa += g.score.away; a.pf += g.score.away; a.pa += g.score.home;
    if (g.winner === 'tie') { h.t++; a.t++; } else if (g.winner === 'home') { h.w++; a.l++; } else { a.w++; h.l++; }
  }
  lg.results.unshift({ wk: lg.day + 1, home: h.name, away: a.name, hs: g.score.home, as: g.score.away, playoff });
  lg.results.length = Math.min(lg.results.length, 30);
}

export function completeFbDay(lg, userGame = null) {
  if (lg.phase === 'regular') {
    for (const [h, a] of lg.schedule[lg.day]) {
      const involvesUser = h === lg.userId || a === lg.userId;
      record(lg, involvesUser && userGame ? userGame : simGame(lg, lg.teams[h], lg.teams[a]), false);
    }
    lg.day++;
    if (lg.day >= FB_GAMES) startPlayoffs(lg);
  } else if (lg.phase === 'playoffs') {
    for (const s of series(lg).filter((x) => !x.done)) {
      const home = lg.teams[s.a], away = lg.teams[s.b], involvesUser = s.a === lg.userId || s.b === lg.userId;
      const g = involvesUser && userGame ? userGame : simGame(lg, home, away);
      record(lg, g, true);
      s.score = [g.score.home, g.score.away];
      s.winner = g.winner === 'home' ? s.a : g.winner === 'away' ? s.b : (lg.rng() < 0.5 ? s.a : s.b);
      s.done = true;
    }
    lg.day++;
    advance(lg);
  }
}

function startPlayoffs(lg) {
  const seeds = fbStandings(lg).map((t) => lg.teams.indexOf(t)), mk = (a, b) => ({ a, b, done: false, winner: null, score: null });
  lg.phase = 'playoffs'; lg.playoffs = { round: 'semi', semis: [mk(seeds[0], seeds[3]), mk(seeds[1], seeds[2])], final: null };
  lg.news.unshift('The regular season is over. Playoffs begin!');
}
function advance(lg) {
  const p = lg.playoffs;
  if (p.round === 'semi' && p.semis.every((s) => s.done)) {
    p.round = 'final'; p.final = { a: p.semis[0].winner, b: p.semis[1].winner, done: false, winner: null, score: null };
    lg.news.unshift('The championship game is set.');
  } else if (p.round === 'final' && p.final.done) {
    lg.champion = p.final.winner; lg.phase = 'done';
    const me = lg.userId, u = lg.teams[me], inFinal = p.final.a === me || p.final.b === me, inSemi = p.semis.some((x) => x.a === me || x.b === me);
    lg.history.push({ season: lg.season, champion: lg.teams[lg.champion].name, w: u.w, l: u.l, t: u.t, result: lg.champion === me ? 'Champions' : inFinal ? 'Lost the final' : inSemi ? 'Lost in the semifinals' : 'Missed the playoffs' });
    lg.news.unshift(`${lg.teams[lg.champion].name} are the champions!`);
  }
}

export function simFbUserGame(lg) {
  const ng = nextFbGame(lg);
  if (!ng) { completeFbDay(lg, null); return null; }
  const g = simGame(lg, ng.home, ng.away);
  completeFbDay(lg, g);
  return g;
}
export function simFbToEnd(lg) { for (let n = 0; lg.phase !== 'done' && n < 30; n++) simFbUserGame(lg); }
export function fbUserEliminated(lg) {
  if (lg.phase === 'done') return lg.champion !== lg.userId;
  if (lg.phase !== 'playoffs') return false;
  if (!lg.playoffs.semis.some((s) => s.a === lg.userId || s.b === lg.userId)) return true;
  return lg.playoffs.semis.some((s) => s.done && (s.a === lg.userId || s.b === lg.userId) && s.winner !== lg.userId) || (lg.playoffs.final && lg.playoffs.final.done && lg.playoffs.final.winner !== lg.userId);
}

export function newFbSeason(lg) {
  lg.season++; lg.day = 0; lg.phase = 'regular'; lg.playoffs = null; lg.champion = null; lg.schedule = buildSchedule(); lg.results = [];
  for (const t of lg.teams) {
    t.w = t.l = t.t = t.pf = t.pa = 0;
    for (const p of allPlayers(t)) {
      p.age++; const [lo, hi] = p.age <= 25 ? [0, 4] : p.age <= 30 ? [-1, 2] : [-4, 0];
      p.a = clamp(p.a + Math.round(lo + lg.rng() * (hi - lo)), 30, 97); p.b = clamp(p.b + Math.round(lo + lg.rng() * (hi - lo)), 30, 97);
      for (const k of Object.keys(p.ss)) p.ss[k] = 0;
    }
  }
}

export function fbLeaders(lg, n = 5) {
  const all = lg.teams.flatMap((t) => allPlayers(t).map((p) => ({ p, t })));
  const top = (f, filter = () => true) => all.filter(filter).sort((a, b) => f(b) - f(a)).slice(0, n).map((x) => ({ ...x, v: f(x) }));
  const withV = (arr, key) => arr.map((x) => ({ ...x, v: x.p.ss[key] }));
  return {
    pass: withV(top((x) => x.p.ss.py, (x) => x.p.pos === 'QB'), 'py'), rush: withV(top((x) => x.p.ss.ry, (x) => x.p.ss.ra > 0), 'ry'),
    rec: withV(top((x) => x.p.ss.recy, (x) => x.p.ss.rec > 0), 'recy'), sacks: withV(top((x) => x.p.ss.sk), 'sk'), ints: withV(top((x) => x.p.ss.int), 'int'),
  };
}
