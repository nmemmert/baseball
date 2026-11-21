import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, aiPitch } from '../src/engine.js';
import { newFbGame, fbAutoStep } from '../src/football.js';
import { bbGameIntel, bbReport, bbChip, fbGameIntel, fbReport, fbChip, renderIntel, renderReport, chipHtml } from '../src/intel.js';
import { createLeague } from '../src/league.js';

const shape = (info) => {
  for (const k of ['now', 'oppBad', 'oppGood', 'mineBad', 'mineGood', 'flow']) assert.ok(Array.isArray(info[k]), k);
  for (const k of ['now', 'good', 'bad', 'lev']) assert.ok(info.lev[k] >= 0 && info.lev[k] <= 1, `lev.${k}=${info.lev[k]}`);
  for (const arr of [info.now, info.oppBad, info.mineBad, info.mineGood, info.oppGood, info.flow]) for (const x of arr) assert.ok(x.text && x.ic !== undefined);
  assert.match(renderIntel(info), /Where you are/);
};

test('baseball intel is well-formed throughout many games and tracks pitch results', () => {
  let items = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const g = newGame(seed);
    for (let i = 0; i < 260 && !g.over; i++) {
      aiPitch(g, [g.home, g.away]);
      if (i % 9 === 0) for (const t of [g.home, g.away]) { const info = bbGameIntel(g, t); shape(info); items += info.mineBad.length + info.mineGood.length + info.oppBad.length; assert.ok(Array.isArray(bbChip(g, t))); }
    }
    assert.ok(g.track && g.hist.length > 20);
  }
  assert.ok(items > 200, `expected plenty of insight, got ${items}`);
});

test('baseball report flags real weaknesses and gives tips on opponents', () => {
  const lg = createLeague(4), t = lg.teams[1];
  for (const p of t.batters.slice(0, 9)) { p.contact = 40; p.eye = 40; p.speed = 35; p.def = 40; }
  t.sp[t.rotIdx % 5].control = 40;
  const r = bbReport(t, { asOpp: true });
  const txt = r.bad.map((x) => x.text).join(' ');
  assert.match(txt, /Strikeout-prone/); assert.match(txt, /Slow lineup/); assert.match(txt, /Shaky defense/); assert.match(txt, /Control problems/);
  assert.match(txt, /→/);
  assert.match(renderReport(r), /Weaknesses/);
});

test('football intel is well-formed throughout many games', () => {
  let items = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const g = newFbGame(seed);
    for (let i = 0; i < 220 && !g.over; i++) {
      fbAutoStep(g, [g.home, g.away]);
      if (i % 7 === 0) for (const t of [g.home, g.away]) { const info = fbGameIntel(g, t); shape(info); items += info.mineBad.length + info.mineGood.length + info.oppBad.length; assert.ok(Array.isArray(fbChip(g, t))); }
    }
    assert.ok(g.hist.length > 40);
  }
  assert.ok(items > 150);
});

test('football report compares units and spots a weak line', () => {
  const g = newFbGame(8);
  for (const p of g.home.players.OL) { p.a = 45; p.b = 45; }
  for (const p of g.away.players.DL) { p.a = 85; p.b = 85; }
  const r = fbReport(g.home, { opp: g.away });
  assert.match(r.bad.map((x) => x.text).join(' '), /Weak pass blocking|pass rush beats your blocking/);
  assert.match(chipHtml([{ t: 'x', tone: 'good' }]), /camchip/);
});
