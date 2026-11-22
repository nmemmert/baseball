import test from 'node:test';
import assert from 'node:assert/strict';
import { newArcade, step, call, playBot, throwTo, targets, OFF_PLAYS, DEF_CALLS, fgInfo, downText, snapshot, resumeArcade, uncall } from '../src/arcade.js';

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
    g.defCall = 'blitz'; g.in.hike = true;
    let n = 0; while (g.phase !== 'dead' && n++ < 3000) step(g, 1 / 30);
    if (g.ev.some((e) => e.k === 'banner' && e.t === 'SACKED!')) sacks++;
  }
  assert.ok(sacks >= 6, `only ${sacks} sacks`);
});

test('throwing to an open receiver can complete and the down advances', () => {
  let done = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const g = newArcade({ seed }); call(g, 'pass_quick');
    assert.equal(g.phase, 'set'); step(g, 1 / 30); assert.equal(g.phase, 'set', 'waits for the hike');
    g.in.hike = true; step(g, 1 / 30);
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

test('penalties show up in games', () => {
  let flags = 0;
  for (let seed = 1; seed <= 6; seed++) { const g = playBot(newArcade({ seed, auto: true })); flags += g.ev.filter((e) => e.k === 'banner' && e.t.startsWith('FLAG')).length; }
  assert.ok(flags >= 8, `only ${flags} flags in 6 games`);
});

test('user touchdown offers a choice; going for two is a real play and the game moves on to the kickoff', () => {
  let tried = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const g = newArcade({ seed }); g.f = 96; g.firstAt = 100; g.down = 1; g.toGo = 4;
    assert.ok(call(g, 'run_in')); g.auto = true;
    let n = 0; while (g.phase !== 'dead' && n++ < 3000) step(g, 1 / 30);
    if (!g.ev.some((e) => e.k === 'banner' && e.t === 'TOUCHDOWN!')) continue;
    g.auto = false; n = 0; while (g.phase !== 'pat' && n++ < 600) step(g, 1 / 30);
    assert.equal(g.phase, 'pat'); assert.equal(g.score.U, 6);
    assert.ok(call(g, 'go2')); assert.equal(g.twoPt.team, 'U'); assert.equal(g.f, 98);
    assert.ok(call(g, 'run_in')); g.auto = true;
    n = 0; while ((g.twoPt || g.phase !== 'call') && n++ < 6000) step(g, 1 / 30);
    assert.ok(g.score.U === 6 || g.score.U === 8); assert.equal(g.twoPt, null);
    tried++; if (tried >= 3) break;
  }
  assert.ok(tried >= 1);
});

test('timeout gives the clock back once per use and hurry-up is a toggle', () => {
  const g = newArcade({ seed: 2 }); call(g, 'run_in'); g.auto = true;
  let n = 0; while (g.phase !== 'dead' && n++ < 4000) step(g, 1 / 30);
  g.auto = false; n = 0; while (g.phase !== 'call' && n++ < 600) step(g, 1 / 30);
  assert.equal(g.phase, 'call');
  if (g.lastRunoff > 0) { const c = g.clock; assert.ok(call(g, 'timeout')); assert.ok(g.clock > c); assert.equal(g.to.U, 2); assert.equal(call(g, 'timeout'), false); }
  assert.ok(call(g, 'hurry')); assert.equal(g.hurry, true);
});

test('a saved game resumes at the same spot', () => {
  const g = newArcade({ seed: 8 }); call(g, 'pass_quick'); g.auto = true;
  let n = 0; while (g.phase !== 'dead' && n++ < 4000) step(g, 1 / 30);
  g.auto = false; n = 0; while (g.phase !== 'call' && n++ < 600) step(g, 1 / 30);
  const sn = snapshot(g); assert.ok(sn);
  const h = resumeArcade(JSON.parse(JSON.stringify(sn)));
  assert.deepEqual([h.score, h.down, h.f, h.q, h.off], [g.score, g.down, g.f, g.q, g.off]); assert.equal(h.phase === 'call' || h.phase === 'kick', true);
});

test('names exist for every player and opponents differ in strength', () => {
  const g = newArcade({ seed: 4, opp: { name: 'X', col: '#fff', str: 1.06 } });
  assert.ok(g.pl.every((p) => /^[A-Z]\. \w+/.test(p.name)));
  assert.ok(g.level.dSpd > 0.97);
});

test('the play can be changed before the hike', () => {
  const g = newArcade({ seed: 6 }); assert.ok(call(g, 'run_in')); assert.equal(g.phase, 'set');
  assert.ok(uncall(g)); assert.equal(g.phase, 'call'); assert.ok(call(g, 'pass_deep')); assert.equal(g.play, 'pass_deep');
});
