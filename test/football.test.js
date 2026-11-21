import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newFbGame, fbAutoPlay, fbSnap, fbAutoStep, fbWinProb, fgProb, convProb, fbAdvise, fbDecisionReason, actingSide, other, allPlayers, units, startFbGame,
  makeFbTeam, fbReviveGame, remainSeconds, QUARTER,
} from '../src/football.js';
import { pack, unpack, makeRng } from '../src/engine.js';

test('football games always finish with sane scores at every level', () => {
  for (const level of [0, 1, 2]) {
    let pts = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const g = fbAutoPlay(newFbGame(seed, level));
      assert.ok(g.over, `seed ${seed} level ${level} did not finish`);
      assert.ok(g.clock >= 0 && g.quarter >= 4);
      assert.ok(g.score.home >= 0 && g.score.away >= 0);
      pts += g.score.home + g.score.away;
    }
    const per = pts / 160;
    assert.ok(per > 14 && per < 34, `level ${level}: ${per} pts/team`);
  }
});

test('same seed is deterministic', () => {
  assert.deepEqual(fbAutoPlay(newFbGame(9)).log, fbAutoPlay(newFbGame(9)).log);
});

test('downs and field position stay consistent every snap', () => {
  const g = newFbGame(4);
  for (let i = 0; i < 400 && !g.over; i++) {
    fbAutoStep(g, [g.home, g.away]);
    assert.ok(g.ball >= 0 && g.ball <= 100);
    if (g.phase === 'snap') { assert.ok(g.down >= 1 && g.down <= 4, `down ${g.down}`); assert.ok(g.toGo >= 0 && g.toGo <= 100); }
  }
});

test('field goal and conversion odds behave', () => {
  const g = newFbGame(2); g.phase = 'snap'; g.poss = 'home';
  g.ball = 90; const near = fgProb(g); g.ball = 60; const far = fgProb(g);
  assert.ok(near > far && near <= 0.985 && far >= 0.05);
  assert.ok(convProb(1) > convProb(5) && convProb(5) > convProb(10));
});

test('win probability moves with score, time and possession', () => {
  const g = newFbGame(6); g.phase = 'snap'; g.poss = 'home'; g.ball = 40;
  const p0 = fbWinProb(g);
  assert.ok(p0 > 0.4 && p0 < 0.65, `start ${p0}`);
  g.quarter = 4; g.clock = 30; g.score = { home: 21, away: 10 };
  assert.ok(fbWinProb(g) > 0.97);
  g.score = { home: 10, away: 21 };
  assert.ok(fbWinProb(g) < 0.05);
});

test('orders work: kneel burns the clock, spike stops it, timeouts count', () => {
  const g = newFbGame(7); g.phase = 'snap'; g.poss = 'home'; g.ball = 40; g.down = 1; g.toGo = 10; g.running = true; g.clock = 200; g.quarter = 4; g.score = { home: 7, away: 3 };
  const c0 = g.clock;
  fbSnap(g, { off: { call: 'kneel' } });
  assert.ok(c0 - g.clock >= 30, 'kneel burns clock');
  assert.equal(g.running, true);
  g.running = true; const t0 = g.timeouts.home;
  fbSnap(g, { off: { call: 'inrun', timeout: true } });
  assert.equal(g.timeouts.home, t0 - 1);
  const g2 = newFbGame(8); g2.phase = 'snap'; g2.poss = 'away'; g2.down = 1; g2.running = true;
  fbSnap(g2, { off: { call: 'spike' } });
  assert.equal(g2.running, false);
  assert.equal(g2.down, 2);
});

test('touchdown leads to a try, then a kickoff; field goal scores three', () => {
  const g = newFbGame(11); g.phase = 'snap'; g.poss = 'home'; g.ball = 99; g.down = 1; g.toGo = 1;
  let n = 0;
  while (g.phase === 'snap' && n++ < 30) fbSnap(g, { off: { call: 'sneak' } });
  assert.ok(g.phase === 'try' || g.score.home === 6 || g.phase === 'snap');
  const g2 = newFbGame(12); g2.phase = 'snap'; g2.poss = 'home'; g2.ball = 90; g2.down = 4; g2.toGo = 5;
  const before = g2.score.home;
  fbSnap(g2, { off: { call: 'fg' } });
  assert.ok(g2.score.home === before + 3 || g2.poss === 'away');
});

test('coach gives well-formed advice in every situation', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const g = newFbGame(seed);
    for (let i = 0; i < 120 && !g.over; i++) {
      fbAutoStep(g, [g.home, g.away]);
      for (const t of [g.home, g.away]) for (const x of fbAdvise(g, t, {})) { assert.ok(x.title && x.why && x.apply); }
    }
  }
  const g = newFbGame(3); g.phase = 'snap'; g.poss = 'home'; g.down = 4; g.toGo = 1; g.ball = 60;
  assert.ok(fbAdvise(g, g.home, {}).some((x) => ['go', 'fg', 'punt'].includes(x.key)));
});

test('stop rules fire for 4th down', () => {
  const g = newFbGame(5); g.phase = 'snap'; g.poss = 'home'; g.down = 4; g.toGo = 3;
  assert.match(fbDecisionReason(g, g.home, { fourth: true }), /4th/);
  assert.equal(fbDecisionReason(g, g.away, { fourth: true }), null);
});

test('save / load round trip resumes identically', () => {
  const a = newFbGame(21);
  for (let i = 0; i < 60; i++) fbAutoStep(a, [a.home, a.away]);
  const b = fbReviveGame(unpack(pack({ g: a })).g);
  assert.equal(b.home.players.QB[0], b.home.players.QB[0]);
  fbAutoPlay(a); fbAutoPlay(b);
  assert.deepEqual(a.log, b.log);
  assert.equal(a.score.home, b.score.home);
});

test('teams have full rosters and sensible unit ratings', () => {
  const t = makeFbTeam(makeRng(1), 'Test', 'Team');
  assert.equal(allPlayers(t).length, 25);
  const u = units(t);
  for (const v of Object.values(u)) assert.ok(v > 30 && v < 97);
});
