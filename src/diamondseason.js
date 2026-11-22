// Skipper Diamond season: 8 teams, a round-robin (one or two meetings), then a 4-team single-game playoff.
// Pure logic so it can be tested headless. Games the player does not play are simulated with the same engine.
import { newDiamond, playBotD, TEAMS } from './diamond.js';

const TEAM_COUNT = 8;
function rng(s) { let t = (s.rng = (s.rng + 0x6D2B79F5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const nextSeed = (s) => Math.floor(rng(s) * 2 ** 31);

export function newSeason(seed = Date.now() & 0x7fffffff, games = 7, userName = 'Skipper') {
  const s = { seed, rng: (seed >>> 0) || 1, games: games >= 14 ? 14 : 7, rd: 0, stage: 'reg', champ: null, userFinish: '', log: [], po: { semi: [], final: null }, stats: { g: 0, ab: 0, h: 0, hr: 0, sb: 0, k: 0, rs: 0, ra: 0 } };
  const pool = TEAMS.slice(); const picks = [];
  while (picks.length < TEAM_COUNT - 1) picks.push(pool.splice(Math.floor(rng(s) * pool.length), 1)[0]);
  s.teams = [{ id: 0, name: userName, col: '#2b6cb0', str: 1, w: 0, l: 0, rs: 0, ra: 0 }, ...picks.map((t, i) => ({ id: i + 1, name: t.name, col: t.col, str: +(0.92 + rng(s) * 0.17).toFixed(3), w: 0, l: 0, rs: 0, ra: 0 }))];
  // circle method: 7 rounds, repeated for a 14-game season
  const arr = [0, 1, 2, 3, 4, 5, 6, 7], one = [];
  for (let r = 0; r < 7; r++) { const pairs = []; for (let i = 0; i < 4; i++) pairs.push([arr[i], arr[7 - i]]); one.push(pairs); arr.splice(1, 0, arr.pop()); }
  s.rounds = s.games === 14 ? [...one, ...one.map((p) => p.map(([a, b]) => [b, a]))] : one;
  return s;
}
export const totalRounds = (s) => s.rounds.length;
const sortTeams = (s) => s.teams.slice().sort((a, b) => b.w - a.w || (b.rs - b.ra) - (a.rs - a.ra) || a.id - b.id);
export const standings = (s) => sortTeams(s);

/** Who the player faces next (or null when the season is over). */
export function nextGame(s) {
  if (s.stage === 'done') return null;
  if (s.stage === 'reg') { const pr = s.rounds[s.rd].find(([a, b]) => a === 0 || b === 0), opp = pr[0] === 0 ? pr[1] : pr[0]; return { kind: 'reg', opp, label: `Game ${s.rd + 1} of ${totalRounds(s)}` }; }
  if (s.stage === 'semi') { const m = s.po.semi.find((x) => x.a === 0 || x.b === 0); return m ? { kind: 'semi', opp: m.a === 0 ? m.b : m.a, label: 'Semifinal' } : null; }
  if (s.stage === 'final') { const f = s.po.final; return f && (f.a === 0 || f.b === 0) ? { kind: 'final', opp: f.a === 0 ? f.b : f.a, label: 'CHAMPIONSHIP' } : null; }
  return null;
}

export function simGame(s, a, b, innings = 5) {
  const A = s.teams[a], B = s.teams[b];
  const g = playBotD(newDiamond({ seed: nextSeed(s), innings, level: 1, auto: true, name: A.name, opp: { name: B.name, col: B.col }, strU: A.str, strC: B.str }));
  let w = g.winner; if (!w) w = rng(s) < 0.5 ? 'U' : 'C';
  return { winner: w === 'U' ? a : b, a, b, ra: g.score.U, rb: g.score.C };
}
function book(s, r, tag) {
  const A = s.teams[r.a], B = s.teams[r.b];
  if (tag === 'reg') { if (r.winner === r.a) { A.w++; B.l++; } else { B.w++; A.l++; } A.rs += r.ra; A.ra += r.rb; B.rs += r.rb; B.ra += r.ra; }
  s.log.push({ tag, a: r.a, b: r.b, ra: r.ra, rb: r.rb, w: r.winner, rd: s.rd });
}

/** Record the player's result and play out everything else that happens at the same time. Returns a short text. */
export function applyUserResult(s, res) {
  const ng = nextGame(s); if (!ng) return '';
  const a = res.userIsA === false ? ng.opp : 0, b = res.userIsA === false ? 0 : ng.opp;
  const win = res.us > res.them ? 0 : res.us < res.them ? ng.opp : (rng(s) < 0.5 ? 0 : ng.opp);
  const r = { a, b, winner: win, ra: a === 0 ? res.us : res.them, rb: a === 0 ? res.them : res.us };
  book(s, r, ng.kind === 'reg' ? 'reg' : ng.kind);
  const st = s.stats; st.g++; for (const k of ['ab', 'h', 'hr', 'sb', 'k']) st[k] += (res.stat && res.stat[k]) || 0; st.rs += res.us; st.ra += res.them;
  if (ng.kind === 'reg') {
    for (const [x, y] of s.rounds[s.rd]) if (x !== 0 && y !== 0) book(s, simGame(s, x, y, res.innings || 5), 'reg');
    s.rd++;
    if (s.rd >= totalRounds(s)) startPlayoffs(s);
  } else if (ng.kind === 'semi') {
    for (const m of s.po.semi) if (m.a !== 0 && m.b !== 0 && m.w == null) { const q = simGame(s, m.a, m.b, res.innings || 5); m.w = q.winner; s.log.push({ tag: 'semi', a: q.a, b: q.b, ra: q.ra, rb: q.rb, w: q.winner, rd: s.rd }); }
    for (const m of s.po.semi) if (m.w == null) m.w = win;
    nextPlayoffStage(s);
  } else if (ng.kind === 'final') { s.po.final.w = win; s.champ = win; s.stage = 'done'; finishSeason(s); }
  return win === 0 ? 'W' : 'L';
}
function startPlayoffs(s) {
  const top = sortTeams(s).slice(0, 4).map((t) => t.id);
  s.po.seeds = top; s.po.semi = [{ a: top[0], b: top[3], w: null }, { a: top[1], b: top[2], w: null }];
  if (!top.includes(0)) { s.userFinish = 'Missed the playoffs'; return simPlayoffs(s); }
  s.stage = 'semi';
}
function nextPlayoffStage(s) {
  const w = s.po.semi.map((m) => m.w);
  if (!s.po.semi.some((m) => (m.a === 0 || m.b === 0) && m.w === 0)) { s.userFinish = 'Lost in the semifinal'; return simPlayoffs(s, true); }
  s.po.final = { a: w[0], b: w[1], w: null }; s.stage = 'final';
}
function simPlayoffs(s, fromSemi) {
  for (const m of s.po.semi) if (m.w == null) { const q = simGame(s, m.a, m.b); m.w = q.winner; s.log.push({ tag: 'semi', a: q.a, b: q.b, ra: q.ra, rb: q.rb, w: q.winner, rd: s.rd }); }
  const [x, y] = s.po.semi.map((m) => m.w); const q = simGame(s, x, y); s.po.final = { a: x, b: y, w: q.winner }; s.log.push({ tag: 'final', a: q.a, b: q.b, ra: q.ra, rb: q.rb, w: q.winner, rd: s.rd });
  s.champ = q.winner; s.stage = 'done'; void fromSemi; finishSeason(s);
}
function finishSeason(s) { if (s.champ === 0) s.userFinish = 'CHAMPIONS'; else if (!s.userFinish) s.userFinish = 'Lost in the final'; }
/** Let the computer play the player's next game (used for "sim this game"). */
export function simUserGame(s, innings = 5) {
  const ng = nextGame(s); if (!ng) return null;
  const q = simGame(s, 0, ng.opp, innings);
  return applyUserResult(s, { us: q.ra, them: q.rb, innings, stat: {} });
}
export function simToEnd(s, innings = 5) { let n = 0; while (s.stage !== 'done' && n++ < 80) simUserGame(s, innings); return s; }
export const userRank = (s) => sortTeams(s).findIndex((t) => t.id === 0) + 1;
