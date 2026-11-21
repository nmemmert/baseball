// The coach: reads the game situation and recommends moves. Pure advice — nothing here changes the game.
import { battingTeam, fieldingTeam, currentBatter, onDeck, fatigue, platoonEdge, bullpenRole, tiltLabel } from './engine.js';
import * as L from './league.js';

const bat = (b, p) => b.contact * 0.5 + b.power * 0.35 + b.eye * 0.15 + platoonEdge(b, p) * 6;

/**
 * Suggestions for the user's side right now. Each: { key, icon, title, why, pri, apply }
 * where apply is { ui: {...} } (set an order) or { sub: 'ph'|'pr'|'pitch'|'dsub', ... } (make a substitution).
 */
export function advise(g, mine, ui = {}) {
  if (!g || g.over || !mine) return [];
  const out = [];
  const add = (key, icon, title, why, apply, pri) => out.push({ key, icon, title, why, apply, pri });
  const batting = battingTeam(g) === mine, fld = fieldingTeam(g), bt = battingTeam(g);
  const batter = currentBatter(g), pit = fld.pitcher, [b1, b2, b3] = g.bases;
  const late = g.inning >= 7, close = Math.abs(g.home.runs - g.away.runs) <= 2;
  const myRuns = mine === g.home ? g.home.runs : g.away.runs, theirRuns = mine === g.home ? g.away.runs : g.home.runs;
  const lead = myRuns - theirRuns, { balls, strikes } = g.pa;

  if (batting) {
    if (b1 && !b2 && g.outs < 2) {
      const p = Math.min(0.92, Math.max(0.1, 0.68 + (b1.speed - 50) / 110 - (pit.control > 60 ? 0.03 : 0)));
      if (p >= 0.72 && ui.call !== 'steal') add('steal', '🏃', 'Steal second', `${b1.name} (SPD ${b1.speed}) should make it about ${Math.round(p * 100)}% of the time.`, { ui: { call: 'steal' } }, 70);
      else if (batter.contact >= 65 && ui.call !== 'hitrun') add('hitrun', '⚡', 'Hit & run', `${batter.name} makes contact (CON ${batter.contact}); the runner goes and the double play is off.`, { ui: { call: 'hitrun' } }, 52);
    }
    if (g.outs === 0 && (b1 || b2) && late && close && batter.power < 45 && batter.contact < 55 && ui.call !== 'bunt') add('bunt', '🤏', 'Sacrifice bunt', 'Weak bat, late and close — move the runner into scoring position.', { ui: { call: 'bunt' } }, 66);
    if (balls === 3 && strikes < 2 && ui.call !== 'take') add('take', '✋', 'Take the next pitch', `3-${strikes}: a walk is as good as a single.`, { ui: { call: 'take' } }, 75);
    else if (batter.eye >= 65 && pit.control <= 50 && ui.swing !== 'patient') add('patient', '👀', 'Work the count', `${batter.name} has a good eye (${batter.eye}) and ${pit.name} struggles with control (${pit.control}).`, { ui: { swing: 'patient' } }, 40);
    else if (batter.power >= 72 && ui.swing !== 'aggressive') add('aggr', '💥', 'Swing away', `${batter.name} has big power (${batter.power}) — let him hunt a pitch.`, { ui: { swing: 'aggressive' } }, 44);
    if (late && bt.bench.length) {
      const best = [...bt.bench].sort((a, b) => bat(b, pit) - bat(a, pit))[0], diff = Math.round(bat(best, pit) - bat(batter, pit));
      if (diff >= 12 && g.pa.pitches === 0) add('ph', '🔁', `Pinch hit ${best.name}`, `+${diff} better than ${batter.name} against ${pit.name}${platoonEdge(best, pit) > 0 ? ' (platoon edge)' : ''}.`, { sub: 'ph', id: best.id }, 60);
    }
    if (late && close && bt.bench.length) {
      const slot = g.bases.findIndex((r) => r && r.speed < 45), fast = [...bt.bench].sort((a, b) => b.speed - a.speed)[0];
      if (slot >= 0 && fast && fast.speed > 72) add('pr', '💨', `Pinch run ${fast.name}`, `${g.bases[slot].name} is slow (SPD ${g.bases[slot].speed}); ${fast.name} has SPD ${fast.speed}.`, { sub: 'pr', base: slot, id: fast.id }, 50);
    }
  } else {
    const f = fatigue(pit);
    const pen = fld.bullpen;
    if (pen.length && g.pa.pitches === 0) {
      const cl = pen.find((x) => bullpenRole(fld, x) === 'Closer'), su = pen.find((x) => bullpenRole(fld, x) === 'Setup');
      if (f > 0.6) {
        const pick = (g.inning >= 9 && lead > 0 && lead <= 3 && cl) || (g.inning === 8 && lead >= 0 && lead <= 3 && su) || [...pen].sort((a, b) => b.stuff - a.stuff)[0];
        add('pitch', '🔥', `Bring in ${pick.name}`, `${pit.name} is ${f > 0.8 ? 'gassed' : 'tiring'} (${pit.stats.pitches} pitches). ${pick.name} is your ${bullpenRole(fld, pick).toLowerCase()}.`, { sub: 'pitch', id: pick.id }, 90);
      } else if (g.inning >= 9 && lead > 0 && lead <= 3 && cl && pit.role !== 'CL') add('save', '🔒', `Save chance: ${cl.name}`, 'Protect a 1–3 run lead in the 9th with your closer.', { sub: 'pitch', id: cl.id }, 72);
    }
    const tl = tiltLabel(batter);
    if (tl) {
      const mix = batter.tilt >= 6 ? 'off' : 'fb';
      if (ui.mix !== mix) add('mix', '🎯', `Throw ${mix === 'fb' ? 'fastballs' : 'offspeed'}`, `${batter.name} is a ${tl} — attack the other side.`, { ui: { mix } }, 50);
    }
    if (!b1 && (b2 || b3) && g.outs < 2 && late && batter.power >= 70 && onDeck(g).power < batter.power - 15 && ui.call !== 'ibb') add('ibb', '🚫', 'Walk him on purpose', `${batter.name} (PWR ${batter.power}) is dangerous and first base is open; the next hitter is weaker.`, { ui: { call: 'ibb' } }, 60);
    if (b3 && g.outs < 2 && late && close && !ui.infieldIn) add('inin', '⬆️', 'Infield in', 'A run at third matters — cut it off on the ground ball.', { ui: { infieldIn: true } }, 55);
    if (b1 && !b2 && b1.speed > 78 && strikes < 2 && balls < 2 && ui.call !== 'pitchout') add('po', '🎣', 'Pitchout', `${b1.name} (SPD ${b1.speed}) is a stolen-base threat.`, { ui: { call: 'pitchout' } }, 45);
    if (batter.power > 60 && batter.hand === 'L' && !ui.shift) add('shift', '↔️', 'Shift the infield', `${batter.name} pulls the ball to the right side.`, { ui: { shift: true } }, 35);
    if (batter.power >= 72 && ui.depth !== 'deep') add('deep', '🧢', 'Play the outfield deep', `${batter.name} hits it a long way (PWR ${batter.power}).`, { ui: { depth: 'deep' } }, 33);
    if (g.inning >= 8 && lead > 0 && lead <= 3 && mine.bench.length && g.pa.pitches === 0) {
      const wi = mine.lineup.reduce((m, p, i) => ((p.def ?? 55) < (mine.lineup[m].def ?? 55) ? i : m), 0), bd = [...mine.bench].sort((a, b) => (b.def ?? 55) - (a.def ?? 55))[0];
      if ((bd.def ?? 55) - (mine.lineup[wi].def ?? 55) >= 15) add('dsub', '🧤', `Glove for ${mine.lineup[wi].name}`, `${bd.name} (DEF ${bd.def ?? 55}) is much better in the field; protect the lead.`, { sub: 'dsub', id: bd.id, i: wi }, 45);
    }
  }
  return out.sort((a, b) => b.pri - a.pri).slice(0, 3);
}

// Highlight map for the order radios, e.g. { call: 'steal', swing: 'patient' }
export function stars(sugg) {
  const m = {};
  for (const s of sugg) if (s.apply.ui) for (const [k, v] of Object.entries(s.apply.ui)) m[k] ||= v;
  return m;
}

// Season-level to-do list.
export function todo(lg) {
  const t = L.userTeam(lg), out = [];
  const add = (icon, text, act) => out.push({ icon, text, act });
  const hurt = t.batters.slice(0, 9).filter((p) => p.inj > 0);
  if (hurt.length) add('🩹', `${hurt.length} starter${hurt.length > 1 ? 's are' : ' is'} hurt (${hurt.map((p) => p.name).join(', ')}). The game will sub for them, or auto-set your lineup.`, { act: 'autolineup', label: 'Auto-set lineup' });
  const next = t.sp[t.rotIdx % 5];
  if (lg.phase !== 'done' && (next.inj > 0 || next.debt > 0.5)) add('⚾', `Your next starter ${next.name} is ${next.inj > 0 ? 'hurt' : 'worn out'}. Move a fresher arm into the slot.`, { act: 'autolineup', label: 'Fix rotation' });
  const tired = t.rp.filter((p) => p.debt > 0.55);
  if (lg.phase !== 'done' && tired.length >= 2) add('😮‍💨', `${tired.length} relievers are tired — expect the bullpen to be thin today.`, null);
  if (lg.phase === 'done') {
    const room = Math.round((t.budget - L.payroll(t)) * 10) / 10;
    const kinds = ['bat', 'sp', 'rp'];
    let best = null;
    for (const k of kinds) {
      const mine = L.roster(t).filter((p) => L.kindOf(p) === k).sort((a, b) => L.value(a) - L.value(b))[0];
      for (const f of lg.fa.filter((x) => L.kindOf(x) === k)) {
        const gain = L.value(f) - L.value(mine);
        if (gain > 4 && L.payroll(t) - L.salary(mine) + L.salary(f) <= t.budget && (!best || gain > best.gain)) best = { f, mine, gain };
      }
    }
    if (best) add('💼', `${best.f.name} (${best.f.pos}, ${best.f.age}) would upgrade ${best.mine.name} by about ${Math.round(best.gain)} points.`, { act: 'off', v: 'fa', label: 'See free agents' });
    add('💰', `You have ${room >= 0 ? '$' + room.toFixed(1) + 'M of payroll room' : 'no payroll room'}. Prospects are cheap and improve every year.`, null);
    add('📅', 'When you are ready, start the next season — the other clubs will shop the market too.', { act: 'newseason', label: 'Start next season' });
  } else if (!out.length) add('✅', 'Roster is healthy and rested. Nothing to fix — play ball!', null);
  return out;
}
