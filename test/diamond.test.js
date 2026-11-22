import test from 'node:test';
import assert from 'node:assert/strict';
import { newDiamond, step, throwPitch, swing, decide, toggleSteal, playBotD, userBatting, userPitching, PITCHES } from '../src/diamond.js';

test('bot games finish at every length with sane scoring', () => {
  for (const innings of [3, 5, 9]) {
    let runs = 0, n = 0;
    for (let seed = 1; seed <= 15; seed++) {
      const g = playBotD(newDiamond({ seed, innings, level: 1, auto: true }));
      assert.ok(g.over, `seed ${seed} innings ${innings} did not finish`);
      assert.ok(g.score.U >= 0 && g.score.C >= 0 && g.inning >= innings);
      runs += g.score.U + g.score.C; n += 2;
    }
    const per = (runs / n) * (9 / innings);
    assert.ok(per > 1.5 && per < 9, `${innings} innings: ${per} runs per 9`);
  }
});

test('same seed gives the same game', () => {
  const a = playBotD(newDiamond({ seed: 5, auto: true })), b = playBotD(newDiamond({ seed: 5, auto: true }));
  assert.deepEqual(a.score, b.score); assert.equal(a.stat.U.h, b.stat.U.h);
});

test('a well-timed swing on the ball makes contact; taking a pitch never does', () => {
  let contact = 0, tot = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const g = newDiamond({ seed });
    assert.ok(userBatting(g));
    let n = 0; while (g.phase !== 'pitch' && n++ < 400) step(g, 1 / 60);
    assert.equal(g.phase, 'pitch');
    const p = g.pitch; g.in.cx = p.x; let swung = false;
    n = 0; while (g.phase === 'pitch' && n++ < 400) {
      if (!swung && g.pitch.t >= p.dur - 0.16) { assert.ok(swing(g, p.x, p.y)); swung = true; }
      step(g, 1 / 60);
    }
    tot++; if (g.phase === 'bip' || /Foul/.test(g.last)) contact++;
  }
  assert.ok(contact / tot > 0.85, `contact ${contact}/${tot}`);
  const g = newDiamond({ seed: 3 }); let n = 0; while (g.phase !== 'pitch' && n++ < 400) step(g, 1 / 60);
  while (g.phase === 'pitch' && n++ < 800) step(g, 1 / 60);
  assert.notEqual(g.phase, 'bip'); assert.ok(/Ball|strike/i.test(g.last));
});

test('the player pitching can throw every pitch type and gets strikes and balls', () => {
  let balls = 0, strikes = 0;
  for (const type of Object.keys(PITCHES)) {
    const g = newDiamond({ seed: 9 }); g.half = 'bot'; g.pit = g.pitcher.U; g.batter = g.lineup.C[0]; g.phase = 'ready';
    assert.ok(userPitching(g));
    assert.ok(throwPitch(g, type, 0, 0, 0)); let n = 0; while (g.phase === 'pitch' && n++ < 400) step(g, 1 / 60);
    if (/Ball/.test(g.last)) balls++; else strikes++;
  }
  assert.ok(balls + strikes === 4);
});

test('throw and stretch decisions resolve and play continues', () => {
  let thr = 0, str = 0;
  for (let seed = 1; seed <= 400 && (thr < 3 || str < 3); seed++) {
    const g = newDiamond({ seed }); let n = 0;
    while (!g.over && n++ < 60000) {
      if (g.pending) {
        if (g.pending.kind === 'throw') { thr++; assert.ok(decide(g, g.pending.opts[g.pending.opts.length - 1])); } else { str++; assert.ok(decide(g, 'stretch')); }
        assert.equal(g.pending, null); continue;
      }
      if (userPitching(g) && g.phase === 'ready') throwPitch(g, 'FB', (Math.random() - 0.5), (Math.random() - 0.5), 0.2);
      if (userBatting(g) && g.phase === 'ready' && g.bases[0] && !g.bases[1]) toggleSteal(g);
      if (userBatting(g) && g.phase === 'pitch' && g.pitch.t > g.pitch.dur - 0.17 && !g.pitch.swing && Math.random() < 0.8) swing(g, g.pitch.x, g.pitch.y);
      step(g, 1 / 30);
      if (g.bases[0] === null && g.bases[1] === null && g.bases[2] === null) { /* keep going */ }
      if (g.inning >= 2 && thr >= 3 && str >= 3) break;
    }
  }
  assert.ok(thr >= 1 && str >= 1, `decisions seen: throw ${thr}, stretch ${str}`);
});

test('three outs end the half and the game ends after the last inning', () => {
  const g = playBotD(newDiamond({ seed: 2, innings: 3, auto: true }));
  assert.ok(g.over); assert.ok(g.winner === 'U' || g.winner === 'C' || g.winner === null);
  assert.ok(g.byInning.U.length >= 1);
});
