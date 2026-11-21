import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, autoPlay, plateAppearance, changePitcher, pinchHit, battingTeam, fieldingTeam } from '../src/engine.js';

test('full AI-vs-AI games finish with sane scores and invariants', () => {
  let totalRuns = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const g = autoPlay(newGame(seed));
    assert.ok(g.over, `seed ${seed} did not finish`);
    assert.ok(g.inning >= 9);
    assert.notEqual(g.home.runs, g.away.runs);
    assert.ok(g.outs >= 0 && g.outs <= 2 || g.over);
    for (const t of [g.home, g.away]) {
      assert.equal(t.inningRuns.reduce((a, b) => a + (b || 0), 0), t.runs, 'line score matches runs');
    }
    totalRuns += g.home.runs + g.away.runs;
  }
  const perTeamGame = totalRuns / 400;
  assert.ok(perTeamGame > 2.5 && perTeamGame < 7, `runs/team/game ${perTeamGame}`);
});

test('same seed is deterministic', () => {
  const a = autoPlay(newGame(42)), b = autoPlay(newGame(42));
  assert.deepEqual(a.log, b.log);
});

test('intentional walk puts the batter on first without an out', () => {
  const g = newGame(7);
  plateAppearance(g, { def: { ibb: true } });
  assert.equal(g.outs, 0);
  assert.ok(g.bases[0]);
});

test('substitutions move players correctly', () => {
  const g = newGame(3);
  const fld = fieldingTeam(g), bat = battingTeam(g);
  const rp = fld.bullpen[0];
  assert.ok(changePitcher(g, fld, rp.id));
  assert.equal(fld.pitcher, rp);
  assert.equal(fld.bullpen.length, 4);
  const pr = bat.bench[0];
  assert.ok(pinchHit(g, bat, pr.id));
  assert.equal(bat.lineup[bat.batIdx], pr);
});
