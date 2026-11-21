import test from 'node:test';
import assert from 'node:assert/strict';
import { createLeague, nextGame, completeDay, simUserGame, simToEnd, standings, leaders, newSeason, SEASON_GAMES, userTeam } from '../src/league.js';
import { startGame, autoPlay, pack, unpack, attachRng } from '../src/engine.js';

test('schedule: everyone plays every day; each opponent faces you 4 times, 2 home 2 away', () => {
  const lg = createLeague(5);
  assert.equal(lg.schedule.length, SEASON_GAMES);
  const seen = {};
  for (const day of lg.schedule) {
    assert.equal(new Set(day.flat()).size, 8);
    const g = day.find(([h, a]) => h === 0 || a === 0);
    const opp = g[0] === 0 ? g[1] : g[0];
    (seen[opp] ??= []).push(g[0] === 0 ? 'H' : 'A');
  }
  for (const k of Object.keys(seen)) { assert.equal(seen[k].length, 4); assert.equal(seen[k].filter((x) => x === 'H').length, 2); }
});

test('a full season plays through playoffs to a champion', () => {
  const lg = createLeague(7);
  simToEnd(lg);
  assert.equal(lg.phase, 'done');
  assert.ok(lg.champion >= 0);
  const st = standings(lg);
  for (const t of lg.teams) assert.equal(t.w + t.l, SEASON_GAMES);
  assert.ok(st[0].w > st[7].w);
  const L = leaders(lg);
  assert.ok(L.HR.length && L.AVG.length && L.RA9.length && L.K.length);
  assert.ok(lg.history.length === 1);
});

test('injuries, rest and form happen; new season develops players', () => {
  const lg = createLeague(8);
  for (let i = 0; i < 10; i++) simUserGame(lg);
  const all = lg.teams.flatMap((t) => [...t.batters, ...t.sp, ...t.rp]);
  assert.ok(all.some((p) => p.debt > 0.01), 'some pitchers are carrying fatigue');
  assert.ok(all.some((p) => p.form !== 0), 'form moves');
  simToEnd(lg);
  const ages = userTeam(lg).batters.map((p) => p.age);
  newSeason(lg);
  assert.equal(lg.day, 0); assert.equal(lg.phase, 'regular');
  assert.deepEqual(userTeam(lg).batters.map((p) => p.age), ages.map((a) => a + 1));
  assert.equal(userTeam(lg).w, 0);
});

test('a season with a user-played game saves and reloads', () => {
  const lg = createLeague(9);
  const ng = nextGame(lg);
  const g = startGame(ng.home, ng.away, { seed: 3 });
  autoPlay(g);
  completeDay(lg, g);
  const s = pack({ lg, g });
  const r = unpack(s);
  attachRng(r.lg);
  assert.equal(r.lg.day, 1);
  assert.equal(r.lg.teams.length, 8);
  simToEnd(r.lg);
  assert.equal(r.lg.phase, 'done');
});

import { value, salary, payroll, signFreeAgent, proposeTrade, autoLineup, roster, kindOf } from '../src/league.js';
import { decisionReason, newGame, pitch, fieldingTeam, battingTeam } from '../src/engine.js';

test('payroll, budget, free agents and trades', () => {
  const lg = createLeague(21);
  const me = userTeam(lg);
  assert.ok(payroll(me) <= me.budget);
  assert.equal(lg.fa.length, 14);
  // sign the best affordable batter, releasing the weakest batter
  const weakest = [...me.batters].sort((a, b) => value(a) - value(b))[0];
  const fa = [...lg.fa].filter((f) => f.type === 'bat').sort((a, b) => value(b) - value(a))[0];
  const r = signFreeAgent(lg, me, fa.uid, weakest.uid);
  if (r.ok) { assert.ok(me.batters.includes(fa)); assert.ok(lg.fa.includes(weakest)); assert.ok(payroll(me) <= me.budget); }
  else assert.match(r.msg, /budget/);
  // releasing a pitcher for a hitter is rejected by slot (not found)
  assert.equal(signFreeAgent(lg, me, fa.uid, me.sp[0].uid).ok, false);
  // trades: must be like-for-like and value-fair
  const other = lg.teams[1];
  const mine = [...me.batters].sort((a, b) => value(b) - value(a))[0], theirs = [...other.batters].sort((a, b) => value(a) - value(b))[0];
  assert.equal(proposeTrade(lg, me, mine.uid, other, other.sp[0].uid).ok, false);
  const t = proposeTrade(lg, me, mine.uid, other, theirs.uid);
  if (t.ok) { assert.ok(other.batters.includes(mine)); assert.ok(me.batters.includes(theirs)); }
  assert.equal(roster(me).length, 24);
});

test('history records the user result and offseason keeps rosters whole', () => {
  const lg = createLeague(22);
  simToEnd(lg);
  const h = lg.history[0];
  assert.ok(h.result && h.w + h.l === SEASON_GAMES);
  const budget = userTeam(lg).budget;
  newSeason(lg);
  for (const t of lg.teams) { assert.equal(t.batters.length, 14); assert.equal(t.sp.length, 5); assert.equal(t.rp.length, 5); assert.ok(payroll(t) <= t.budget + 0.01, `${t.name} payroll`); }
  assert.ok(lg.fa.length === 14);
  assert.ok(budget > 0);
});

test('auto lineup puts a healthy, good nine in order', () => {
  const lg = createLeague(23);
  const me = userTeam(lg);
  me.batters[0].inj = 5;
  autoLineup(me);
  assert.equal(me.batters.length, 14);
  assert.ok(me.batters.slice(0, 9).every((p) => p.inj === 0));
});

test('decision rules fire for the user team only when asked', () => {
  const g = newGame(41);
  const fld = fieldingTeam(g);
  g.bases = [{}, {}, {}];
  assert.equal(decisionReason(g, fld, { loaded: true }), 'Bases loaded');
  assert.equal(decisionReason(g, fld, {}), null);
  g.bases = [null, null, null];
  fld.pitcher.stats.pitches = 200;
  assert.match(decisionReason(g, fld, { tired: true }), /tiring/);
  assert.equal(decisionReason(g, battingTeam(g), { tired: true }), null);
});
