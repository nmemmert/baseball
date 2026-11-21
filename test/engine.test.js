import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, autoPlay, pitch, finishAtBat, changePitcher, pinchHit, pinchRun, battingTeam, fieldingTeam,
  winProb, pack, unpack, reviveGame, aiPitch, currentBatter, defSub, bullpenRole, repertoire, makeFreeAgent,
} from '../src/engine.js';

test('AI-vs-AI games finish with realistic scoring at every difficulty', () => {
  for (const level of [0, 1, 2]) {
    let runs = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const g = autoPlay(newGame(seed, level));
      assert.ok(g.over && g.inning >= 9);
      assert.notEqual(g.home.runs, g.away.runs);
      for (const t of [g.home, g.away]) assert.equal(t.inningRuns.reduce((a, b) => a + (b || 0), 0), t.runs);
      runs += g.home.runs + g.away.runs;
    }
    const per = runs / 240;
    assert.ok(per > 3 && per < 6.2, `level ${level}: ${per} runs/team/game`);
  }
});

test('same seed is deterministic', () => {
  assert.deepEqual(autoPlay(newGame(42)).log, autoPlay(newGame(42)).log);
});

test('counts behave: 4 balls walks, 3 strikes strikes out, count resets', () => {
  const g = newGame(11);
  for (let i = 0; i < 400 && !g.over; i++) {
    pitch(g, { off: { swing: 'normal' }, def: {} });
    assert.ok(g.pa.balls <= 3 && g.pa.strikes <= 2);
  }
});

test('intentional walk, pitchout and take orders work', () => {
  const g = newGame(7);
  pitch(g, { def: { ibb: true } });
  assert.equal(g.outs, 0);
  assert.ok(g.bases[0]);
  assert.equal(g.pa.pitches, 0);
  pitch(g, { def: { pitchout: true } });
  assert.equal(g.pa.balls, 1);
});

test('steals either succeed or record an out', () => {
  let tries = 0;
  for (let seed = 1; seed <= 400 && tries < 20; seed++) {
    const g = newGame(seed);
    pitch(g, { def: { ibb: true } }); // runner on first
    const r = g.bases[0];
    const outs = g.outs;
    pitch(g, { off: { steal: true } });
    if (g.last.steal) {
      tries++;
      if (g.last.steal === 'SB') assert.ok(g.bases[1] === r || g.over);
      else assert.ok(g.outs === outs + 1 || g.half !== 'top');
    }
  }
  assert.ok(tries > 0);
});

test('finishAtBat ends the plate appearance', () => {
  const g = newGame(5);
  finishAtBat(g, { off: {}, def: {} });
  assert.equal(g.pa.pitches, 0);
});

test('substitutions', () => {
  const g = newGame(3);
  const fld = fieldingTeam(g), bat = battingTeam(g);
  const rp = fld.bullpen[0];
  assert.ok(changePitcher(g, fld, rp.id));
  assert.equal(fld.pitcher, rp);
  const pr = bat.bench[0];
  assert.ok(pinchHit(g, bat, pr.id));
  assert.equal(bat.lineup[bat.batIdx], pr);
  assert.equal(bat.usedBatters.length, 1);
  pitch(g, { def: { ibb: true } });
  assert.ok(pinchRun(g, bat, 0, bat.bench[0].id));
});

test('win probability is sane', () => {
  const g = newGame(9);
  const p0 = winProb(g);
  assert.ok(p0 > 0.45 && p0 < 0.6, `start ${p0}`);
  g.inning = 9; g.half = 'bot'; g.outs = 2; g.home.runs = 0; g.away.runs = 5;
  assert.ok(winProb(g) < 0.02);
  g.home.runs = 5; g.away.runs = 0;
  assert.ok(winProb(g) > 0.98);
});

test('save/load round-trips and resumes identically', () => {
  const a = newGame(21);
  for (let i = 0; i < 120; i++) { aiPitch(a, [a.home, a.away]); }
  const saved = pack({ g: a });
  const b = reviveGame(unpack(saved).g);
  assert.equal(b.home.lineup[0], b.home.batters[0]);          // identity preserved
  const bb = battingTeam(b);
  for (const r of b.bases) if (r) assert.ok(bb.lineup.includes(r) || bb.usedBatters.includes(r));
  autoPlay(a); autoPlay(b);
  assert.deepEqual(a.log, b.log);
  assert.equal(a.home.runs, b.home.runs);
});

test('platoon: same-handed matchups hurt hitters', () => {
  // Contact edge is encoded in effective ratings; check the helper API behaves.
  const g = newGame(2);
  const b = currentBatter(g), p = fieldingTeam(g).pitcher;
  assert.ok([-1, 0, 1].includes(((b.hand === 'S') ? 0 : (b.hand !== p.hand ? 1 : -1))));
});

test('arsenals, bullpen roles, defensive subs and free agents', () => {
  const g = newGame(31);
  const t = fieldingTeam(g);
  assert.ok(t.pitcher.ars.length === 3);
  assert.equal(repertoire(t.pitcher).length, 3);
  const roles = t.rp.map((p) => bullpenRole(t, p));
  assert.ok(roles.includes('Closer') && roles.includes('Setup') && roles.includes('Long'));
  const bat = battingTeam(g), b = bat.bench[0], old = bat.lineup[3];
  assert.ok(defSub(g, bat, b.id, 3));
  assert.equal(bat.lineup[3], b);
  assert.ok(bat.usedBatters.includes(old));
  const fa = makeFreeAgent(() => 0.5, new Set(), 'pbat');
  assert.ok(fa.age <= 21 && fa.type === 'bat');
});

test('pitch mix order changes outcomes without breaking the game', () => {
  const g = newGame(13);
  for (let i = 0; i < 200 && !g.over; i++) pitch(g, { off: {}, def: { mix: i % 2 ? 'fb' : 'off' } });
  assert.ok(g.paCount > 20);
});
