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
