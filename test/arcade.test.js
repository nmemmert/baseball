import test from 'node:test';
import assert from 'node:assert/strict';
import { newArcade, step, call, playBot, throwTo, targets, OFF_PLAYS, DEF_CALLS, fgInfo, downText } from '../src/arcade.js';

test('bot games always finish with sane scores at every level', () => {
  for (const level of [0, 1, 2]) {
    let pts = 0, n = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const g = playBot(newArcade({ seed, level, auto: true }));
      assert.ok(g.over, `seed ${seed} level ${level} did not finish`);
      assert.ok(g.score.U >= 0 && g.score.C >= 0);
      assert.ok(g.q >= 4);
      pts += g.score.U + g.score.C; n += 2;
    }
    const per = pts / n;
    assert.ok(per > 6 && per < 40, `level ${level}: ${per} pts/team`);
  }
});

test('same seed gives the same game', () => {
  const a = playBot(newArcade({ seed: 7, auto: true })), b = playBot(newArcade({ seed: 7, auto: true }));
  assert.deepEqual(a.score, b.score); assert.equal(a.plays, b.plays);
});

test('every offensive play and defensive call runs to the end of a down', () => {
  for (const pl of Object.keys(OFF_PLAYS)) for (const df of Object.keys(DEF_CALLS)) {
    const g = newArcade({ seed: 5 }); g.auto = false;
    assert.ok(call(g, pl)); g.auto = true; g.defCall = df;
    let n = 0; while (g.phase !== 'dead' && g.phase !== 'kick' && n++ < 4000) step(g, 1 / 30);
    assert.ok(g.phase === 'dead' || g.phase === 'kick', `${pl}/${df} never ended`);
  }
});

test('a quarterback who never throws gets sacked', () => {
  let sacks = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const g = newArcade({ seed }); call(g, 'pass_deep');
    // user-controlled QB, idle sticks, defence on the blitz
    g.defCall = 'blitz';
    let n = 0; while (g.phase !== 'dead' && n++ < 3000) step(g, 1 / 30);
    if (g.ev.some((e) => e.k === 'banner' && e.t === 'SACKED!')) sacks++;
  }
  assert.ok(sacks >= 6, `only ${sacks} sacks`);
});

test('throwing to an open receiver can complete and the down advances', () => {
  let done = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const g = newArcade({ seed }); call(g, 'pass_quick');
    let n = 0; while (g.phase !== 'live' && n++ < 200) step(g, 1 / 30);
    n = 0; while (g.t < 1.0 && n++ < 200) step(g, 1 / 30);
    assert.equal(g.mode, 'drop');
    g.in.throw = 0; step(g, 1 / 30);
    n = 0; while (g.phase === 'live' && n++ < 3000) step(g, 1 / 30);
    assert.ok(g.phase === 'dead' || g.phase === 'kick');
    done++;
  }
  assert.equal(done, 30);
});

test('4th down: punt and field goal resolve and hand over the ball or points', () => {
  const g = newArcade({ seed: 3 }); g.f = 40; g.down = 4; call(g, 'punt');
  assert.equal(g.phase, 'kick'); let n = 0; while (g.phase === 'kick' && n++ < 400) step(g, 1 / 30);
  assert.equal(g.off, 'C'); assert.equal(g.down, 1);
  const h = newArcade({ seed: 4 }); h.f = 80; h.down = 4; call(h, 'fg');
  assert.equal(h.phase, 'meter'); assert.ok(fgInfo(h).dist < 40);
  h.in.kick = true; step(h, 1 / 30); assert.equal(h.phase, 'kick');
});

test('down and distance text', () => {
  const g = newArcade({ seed: 1 }); assert.equal(downText(g), '1st & 10'); g.f = 95; g.toGo = 10; assert.equal(downText(g), '1st & Goal');
});
