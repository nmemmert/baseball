// Intel: plain-English "where are we, what's working, what's weak" for both sports. Pure functions over game state — no DOM except HTML helpers.
import { battingTeam, fieldingTeam, currentBatter, fatigue, platoonEdge, bullpenRole, repertoire, pitchName, winProb, formTag } from './engine.js';
import { units, fbWinProb, remainSeconds, fgDistance, fgProb, actingSide, other, allPlayers, DEF_CALLS, OFF_CALLS } from './football.js';

const it = (tone, ic, text) => ({ tone, ic, text });
const avg = (arr, f) => (arr.length ? arr.reduce((a, p) => a + f(p), 0) / arr.length : 0);
const ovr = (b) => b.contact * 0.5 + b.power * 0.35 + b.eye * 0.15;
const sur = (p) => p.name.split(' ').slice(-1)[0];
const pc = (x) => Math.round(x * 100);
const ORD = ['', '1st', '2nd', '3rd', '4th'];
const fmtClock = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const levelOf = (lev) => (lev >= 0.22 ? 'High' : lev >= 0.1 ? 'Medium' : 'Low');
const cap = (a, n = 5) => a.slice(0, n);

// ===================================================================================
// BASEBALL
// ===================================================================================
function bbBase(team, g) {
  const live = g && team.lineup && team.lineup.length;
  return {
    lineup: live ? team.lineup : team.batters.slice(0, 9),
    sp: live && team.pitcher ? team.pitcher : team.sp[team.rotIdx % 5],
    pen: live && team.bullpen ? team.bullpen : team.rp,
  };
}

/** Ratings-based strengths and weaknesses. asOpp adds "what you should do about it" tips. */
export function bbReport(team, { g = null, vs = null, asOpp = false } = {}) {
  const { lineup, sp, pen } = bbBase(team, g), good = [], bad = [];
  const tip = (t) => (asOpp ? ` <i>→ ${t}</i>` : '');
  const A = (k) => avg(lineup, (p) => p[k] ?? 55);
  const contact = A('contact'), power = A('power'), eye = A('eye'), speed = A('speed'), def = A('def');
  const top = [...lineup].sort((a, b) => ovr(b) - ovr(a)), bottom = top.slice(-3).reverse();
  const f = (n) => Math.round(n);

  if (ovr(top[0]) >= 62) good.push(it('good', '🏏', `<b>Best bats:</b> ${top.slice(0, 2).map((p) => `${sur(p)} (CON ${p.contact}, PWR ${p.power})`).join(' and ')}.${tip('pitch carefully; with first base open, consider a walk')}`));
  if (contact >= 61) good.push(it('good', '🎯', `<b>Contact lineup</b> (avg CON ${f(contact)}): hard to strike out.${tip('use your defense; strikeouts will be scarce')}`));
  else if (contact <= 54) bad.push(it('bad', '🌀', `<b>Strikeout-prone</b> (avg CON ${f(contact)}).${tip('attack the zone and go for strikeouts')}`));
  if (power >= 57) good.push(it('good', '💥', `<b>Real power</b> (avg PWR ${f(power)}): one swing can change the game.${tip('nibble, play the outfield deep')}`));
  else if (power <= 46) bad.push(it('bad', '🪶', `<b>Little power</b> (avg PWR ${f(power)}): they must string hits together.${tip('pitch to contact; the outfield can play shallow')}`));
  if (eye >= 62) good.push(it('good', '👀', `<b>Patient hitters</b> (avg EYE ${f(eye)}): they draw walks.${tip('throw strikes and attack early')}`));
  else if (eye <= 52) bad.push(it('bad', '🎣', `<b>Impatient hitters</b> (avg EYE ${f(eye)}): they chase bad pitches.${tip('nibble off the plate — they will chase')}`));
  const fast = lineup.filter((p) => p.speed >= 68);
  if (fast.length >= 2) good.push(it('good', '💨', `<b>Speed:</b> ${list(fast)} can steal.${tip('hold runners; consider a pitchout')}`));
  else if (speed <= 44) bad.push(it('bad', '🐢', `<b>Slow lineup</b> (avg SPD ${f(speed)}): no running game.${tip('ignore the running game; double plays are likely')}`));
  if (def >= 61) good.push(it('good', '🧤', `<b>Strong defense</b> (avg DEF ${f(def)}): ground balls become outs.${tip('hits will need to be hard-hit')}`));
  else if (def <= 50) bad.push(it('bad', '🕳️', `<b>Shaky defense</b> (avg DEF ${f(def)}): balls fall in.${tip('hit it on the ground; bunts and grounders work')}`));
  if (bottom.length && avg(bottom, ovr) < 50) bad.push(it('bad', '📉', `<b>Weak spots:</b> ${list(bottom)}.${tip('pitch around the top, attack the bottom of the order')}`));
  const hot = lineup.filter((p) => formTag(p) === 'hot'), cold = lineup.filter((p) => formTag(p) === 'cold');
  if (hot.length) good.push(it('good', '🔥', `<b>Hot:</b> ${list(hot)}.${tip('be careful with them')}`));
  if (cold.length) bad.push(it('bad', '🧊', `<b>Cold:</b> ${list(cold)}.${tip('attack them')}`));
  if (vs) {
    const edge = lineup.filter((p) => platoonEdge(p, vs) > 0).length, dis = lineup.filter((p) => platoonEdge(p, vs) < 0).length;
    if (edge >= 5) good.push(it('good', '↔️', `<b>Platoon edge:</b> ${edge} of 9 hitters bat on the good side against ${sur(vs)}.${tip('a same-handed reliever would help')}`));
    if (dis >= 5) bad.push(it('bad', '🚫', `<b>Platoon disadvantage:</b> ${dis} of 9 are same-sided against ${sur(vs)}.${tip('keep ${sur(vs)} in')}`.replace('${sur(vs)}', sur(vs))));
  }
  // pitching
  if (sp) {
    const ars = [...repertoire(sp)].sort((a, b) => b.q - a.q), best = ars[0], worst = ars[ars.length - 1];
    if (sp.stuff >= 62) good.push(it('good', '⚾', `<b>Starter ${sur(sp)}</b> (STF ${sp.stuff}, CTL ${sp.control}); best pitch ${best.name} (${best.q}).${tip('he is tough — be patient early')}`));
    else if (best.q >= 66) good.push(it('good', '⚾', `<b>${sur(sp)}'s ${best.name}</b> (${best.q}) is his best pitch.${tip('look for his other pitches')}`));
    if (sp.control <= 48) bad.push(it('bad', '🎯', `<b>Control problems</b> (${sur(sp)}, CTL ${sp.control}): walks and wild pitches.${tip('work the count; take pitches')}`));
    if (sp.stamina <= 88 && sp.role === 'SP') bad.push(it('bad', '🔋', `<b>Starter tires early</b> (${sur(sp)}, STA ${Math.round(sp.stamina)}).${tip('run up his pitch count')}`));
    if (g) { const fa = fatigue(sp); if (fa > 0.5) bad.push(it('bad', '😮‍💨', `<b>${sur(sp)} is ${fa > 0.8 ? 'gassed' : 'tiring'}</b> (${sp.stats.pitches} pitches).${tip(asOpp ? 'press him now' : 'consider the bullpen')}`)); }
    if (worst && worst.q <= 45) bad.push(it('bad', '🍬', `<b>${sur(sp)}'s ${worst.name}</b> is weak (${worst.q}).${tip('sit on it when he throws it')}`));
  }
  const closer = pen.find((p) => p.role === 'CL');
  if (closer && closer.stuff >= 66) good.push(it('good', '🔒', `<b>Closer ${sur(closer)}</b> (STF ${closer.stuff}) shuts the door.${tip('get the lead before the 9th')}`));
  else if (closer && closer.stuff <= 55) bad.push(it('bad', '🔓', `<b>Shaky closer</b> (${sur(closer)}, STF ${closer.stuff}).${tip('late rallies can work')}`));
  const tired = pen.filter((p) => (p.debt || 0) > 0.55);
  if (tired.length >= 2) bad.push(it('bad', '😴', `<b>${tired.length} relievers are tired:</b> ${list(tired)}.${tip('chase the starter — the pen is thin')}`));
  else if (pen.filter((p) => (p.debt || 0) < 0.2).length >= 4 && pen.length >= 4) good.push(it('good', '🛡️', `<b>Deep, rested bullpen</b> (${pen.length} arms).${tip('do not count on a late rally')}`));
  return { good: cap(good, 8), bad: cap(bad, 8) };
}
const list = (arr) => arr.map(sur).join(', ');

const runnersText = (g) => {
  const r = [g.bases[0] && '1st', g.bases[1] && '2nd', g.bases[2] && '3rd'].filter(Boolean);
  return r.length ? `runner${r.length > 1 ? 's' : ''} on ${r.join(' and ')}` : 'bases empty';
};
function endOfInning(g) {
  if (g.half === 'top') {
    if (g.inning >= 9 && g.home.runs > g.away.runs) return { over: true, winner: 'home' };
    return { half: 'bot', outs: 0, bases: [null, null, null] };
  }
  if (g.inning >= 9 && g.home.runs !== g.away.runs) return { over: true, winner: g.home.runs > g.away.runs ? 'home' : 'away' };
  return { half: 'top', inning: g.inning + 1, outs: 0, bases: [null, null, null] };
}
function bbWp(g, mine, patch) {
  const h = { over: false, winner: null, half: g.half, inning: g.inning, outs: g.outs, bases: g.bases.map((b) => (b ? {} : null)), home: { runs: g.home.runs }, away: { runs: g.away.runs }, ...patch };
  const w = winProb(h);
  return mine === g.home ? w : 1 - w;
}
function bbLeverage(g, mine) {
  const bats = battingTeam(g) === mine, bsHome = battingTeam(g) === g.home;
  const run = bsHome ? { home: { runs: g.home.runs + 1 } } : { away: { runs: g.away.runs + 1 } };
  const now = bbWp(g, mine, {}), scoreWp = bbWp(g, mine, run), endWp = bbWp(g, mine, endOfInning(g));
  const good = bats ? scoreWp : endWp, bad = bats ? endWp : scoreWp;
  const lev = Math.abs(good - bad);
  return { now, good, bad, lev, level: levelOf(lev), goodLabel: bats ? 'a run scores' : 'you get out of the inning', badLabel: bats ? 'the inning ends' : 'they score' };
}

export function bbChip(g, mine) {
  if (g.over) return [];
  const myRuns = mine.runs, their = (mine === g.home ? g.away : g.home).runs, d = myRuns - their;
  const lv = bbLeverage(g, mine);
  const chips = [{ t: d > 0 ? `Leading by ${d}` : d < 0 ? `Trailing by ${-d}` : 'Tied', tone: d > 0 ? 'good' : d < 0 ? 'bad' : '' }, { t: `${g.outs} out · ${runnersText(g).replace('bases empty', 'bases empty')}`, tone: '' }];
  if (lv.level !== 'Low') chips.push({ t: `⚡ ${lv.level} leverage`, tone: lv.level === 'High' ? 'warn' : '' });
  return chips;
}

function bbToday(g, mine) {
  const good = [], bad = [], flow = [];
  const mySide = mine === g.home ? 'home' : 'away', oppSide = mySide === 'home' ? 'away' : 'home';
  const opp = mine === g.home ? g.away : g.home;
  // pitch types
  const track = g.track || { home: { pt: {} }, away: { pt: {} } };
  const mine_pt = track[mySide].pt, their_pt = track[oppSide].pt;
  for (const [code, r] of Object.entries(mine_pt)) {
    const bip = r.h + r.o, name = pitchName(code);
    if (r.n >= 4 && r.wh >= 3 && r.h <= 1) good.push(it('good', '🌀', `<b>Your ${name}</b> is working: ${r.wh} swings-and-misses, ${r.h} hit${r.h === 1 ? '' : 's'} in ${r.n} pitches. Keep using it.`));
    else if (bip >= 3 && r.h / bip >= 0.6) bad.push(it('bad', '🔨', `<b>Your ${name}</b> is getting hit: ${r.h} hits on ${bip} balls in play. Mix in something else.`));
    else if (r.n >= 6 && r.b / r.n >= 0.55) bad.push(it('bad', '🎈', `<b>Your ${name}</b> keeps missing the zone (${r.b} balls in ${r.n}). Throw it less.`));
  }
  const oppWeak = [], oppStrong = [];
  for (const [code, r] of Object.entries(their_pt)) {
    const bip = r.h + r.o, name = pitchName(code);
    if (bip >= 3 && r.h / bip >= 0.6) oppWeak.push(it('good', '🎯', `<b>Their ${name}</b> has been hit: ${r.h} hits on ${bip} balls in play. <i>→ sit on it</i>`));
    else if (r.n >= 4 && r.wh >= 3 && r.h <= 1) oppStrong.push(it('bad', '🌀', `<b>Their ${name}</b> is getting swings-and-misses (${r.wh} in ${r.n}). <i>→ protect with two strikes</i>`));
  }
  // recent form
  const hist = g.hist || [], HIT = ['1B', '2B', '3B', 'HR'];
  const recent = (side, n = 8) => hist.filter((h) => h.side === side).slice(-n);
  const rf = recent(mySide), rt = recent(oppSide);
  if (rf.length >= 6) {
    const h = rf.filter((x) => HIT.includes(x.res)).length, k = rf.filter((x) => x.res === 'K').length, bb = rf.filter((x) => x.res === 'BB').length;
    if (h >= 4) good.push(it('good', '📈', `<b>Your last ${rf.length} at-bats:</b> ${h} hits${bb ? `, ${bb} walk${bb > 1 ? 's' : ''}` : ''}. The bats are alive.`));
    else if (h <= 1) bad.push(it('bad', '📉', `<b>Your last ${rf.length} at-bats:</b> ${h} hit${h === 1 ? '' : 's'}${k ? `, ${k} strikeouts` : ''}. The offense is stuck.`));
  }
  if (rt.length >= 6) {
    const h = rt.filter((x) => HIT.includes(x.res)).length;
    if (h >= 4) bad.push(it('bad', '🚨', `<b>Their last ${rt.length} at-bats:</b> ${h} hits against you. Your pitching is under pressure.`));
    else if (h <= 1) good.push(it('good', '🧱', `<b>Their last ${rt.length} at-bats:</b> only ${h} hit${h === 1 ? '' : 's'}. Your pitching has them handled.`));
  }
  const sum = (t, k) => [...t.lineup, ...t.usedBatters].reduce((a, b) => a + (b.stats[k] || 0), 0);
  const myK = sum(mine, 'k'), myBB = sum(mine, 'bb'), thK = sum(opp, 'k'), thBB = sum(opp, 'bb');
  if (myK >= 8) bad.push(it('bad', '💨', `<b>${myK} strikeouts</b> for your hitters so far.`));
  if (thK >= 8) good.push(it('good', '🔥', `<b>${thK} strikeouts</b> by your pitchers so far.`));
  if (mine.pitcher.stats.bb >= 4) bad.push(it('bad', '🚶', `<b>${sur(mine.pitcher)} has walked ${mine.pitcher.stats.bb}.</b> Control is slipping.`));
  if (opp.pitcher.stats.bb >= 4) oppWeak.push(it('good', '🚶', `<b>${sur(opp.pitcher)} has walked ${opp.pitcher.stats.bb}.</b> <i>→ stay patient</i>`));
  // flow
  const inningLine = (t) => t.inningRuns.map((v) => (v === undefined ? '–' : v)).join(' ');
  flow.push(it('', '🧮', `<b>Runs by inning:</b> you ${inningLine(mine) || '–'} · they ${inningLine(opp) || '–'}`));
  flow.push(it('', '📊', `<b>Hits:</b> you ${mine.hits}, they ${opp.hits} · <b>K:</b> you ${myK}, they ${thK} · <b>BB:</b> you ${myBB}, they ${thBB}`));
  flow.push(it('', '🎽', `<b>Pitchers:</b> ${sur(mine.pitcher)} ${mine.pitcher.stats.pitches} pitches (${Math.floor(mine.pitcher.stats.outs / 3)}.${mine.pitcher.stats.outs % 3} IP, ${mine.pitcher.stats.r} R) · ${sur(opp.pitcher)} ${opp.pitcher.stats.pitches} pitches`));
  return { good, bad, oppWeak, oppStrong, flow };
}

export function bbGameIntel(g, mine) {
  const opp = mine === g.home ? g.away : g.home, bats = battingTeam(g) === mine;
  const b = currentBatter(g), p = fieldingTeam(g).pitcher, lv = bbLeverage(g, mine);
  const d = mine.runs - opp.runs, lead = d > 0 ? `leading by ${d}` : d < 0 ? `trailing by ${-d}` : 'tied';
  const now = [
    it('', '📍', `<b>${g.half === 'top' ? 'Top' : 'Bottom'} ${g.inning}:</b> you're ${lead} (${mine.runs}–${opp.runs}). ${g.outs} out, ${runnersText(g)}. ${g.pa.balls}-${g.pa.strikes} count.`),
    it('', bats ? '🏏' : '⚾', bats ? `<b>You're batting:</b> ${b.name} (CON ${b.contact}, PWR ${b.power}) vs ${p.name} (${p.hand}HP, STF ${p.stuff}).` : `<b>You're pitching:</b> ${p.name} (${p.stats.pitches} pitches) vs ${b.name} (${b.hand}, CON ${b.contact}, PWR ${b.power}).`),
  ];
  const today = bbToday(g, mine);
  const myRep = bbReport(mine, { g, vs: opp.pitcher }), oppRep = bbReport(opp, { g, vs: mine.pitcher, asOpp: true });
  return {
    now, lev: lv, chip: bbChip(g, mine),
    oppBad: cap([...today.oppWeak, ...oppRep.bad], 7), oppGood: cap([...today.oppStrong, ...oppRep.good], 5),
    mineBad: cap([...today.bad, ...myRep.bad], 7), mineGood: cap([...today.good, ...myRep.good], 7), flow: today.flow,
  };
}

// ===================================================================================
// FOOTBALL
// ===================================================================================
export function fbReport(team, { opp = null, asOpp = false } = {}) {
  const U = units(team), P = team.players, good = [], bad = [];
  const tip = (t) => (asOpp ? ` <i>→ ${t}</i>` : '');
  const r = (n) => Math.round(n);
  const unit = (key, label, short, goodTip, badTip, goodTxt, badTxt) => {
    if (U[key] >= 67) good.push(it('good', goodTxt[0], `<b>${goodTxt[1]}</b> (${short} ${r(U[key])}).${tip(goodTip)}`));
    else if (U[key] <= 58) bad.push(it('bad', badTxt[0], `<b>${badTxt[1]}</b> (${short} ${r(U[key])}).${tip(badTip)}`));
  };
  unit('passBlock', '', 'PBK', 'blitzing is risky — play coverage', 'blitz and rush: sacks are coming', ['🛡️', 'Pass protection'], ['🕳️', 'Weak pass blocking']);
  unit('runBlock', '', 'RBK', 'expect runs: stack the box', 'they struggle to run — sit back in pass defense', ['🚜', 'Run blocking'], ['🚧', 'Weak run blocking']);
  unit('passRush', '', 'RSH', 'use screens and quick passes', 'take deep shots: you will have time', ['🌪️', 'Pass rush'], ['😴', 'Weak pass rush']);
  unit('runStop', '', 'RUN', 'avoid runs up the middle', 'run it — they cannot stop it', ['🧱', 'Run defense'], ['🫥', 'Soft run defense']);
  unit('cover', '', 'COV', 'short passes and screens; avoid the deep ball', 'attack with medium and deep passes', ['🔒', 'Pass coverage'], ['🪟', 'Leaky coverage']);
  unit('recv', '', 'REC', 'play zone and keep them in front', 'cover tight — they struggle to get open', ['🙌', 'Receivers'], ['🧤', 'Weak receivers']);
  const qb = P.QB[0], rb = P.RB[0], k = P.K[0], pt = P.P[0];
  if (qb.a >= 72) good.push(it('good', '💪', `<b>Strong-armed QB</b> ${sur(qb)} (ARM ${qb.a}).${tip('respect the deep ball — late, use prevent')}`));
  if (qb.b >= 70) good.push(it('good', '🎯', `<b>Accurate QB</b> ${sur(qb)} (ACC ${qb.b}).${tip('he beats soft coverage; pressure him')}`));
  else if (qb.b <= 58) bad.push(it('bad', '🎲', `<b>Inaccurate QB</b> ${sur(qb)} (ACC ${qb.b}).${tip('force them to throw — interceptions are likely')}`));
  if (qb.a <= 55) bad.push(it('bad', '🪶', `<b>Weak arm</b> (${sur(qb)}, ARM ${qb.a}): deep shots are rare.${tip('cheat toward the short routes')}`));
  if (rb.a >= 72) good.push(it('good', '🐂', `<b>Power back</b> ${sur(rb)} (RUN ${rb.a}).${tip('stack the box on early downs')}`));
  if (rb.b >= 75) good.push(it('good', '⚡', `<b>Breakaway speed</b> ${sur(rb)} (SPD ${rb.b}).${tip('keep a safety deep against the run')}`));
  if (rb.a <= 55) bad.push(it('bad', '🐌', `<b>Weak runner</b> ${sur(rb)} (RUN ${rb.a}).${tip('they cannot run it: play the pass')}`));
  if (k.a >= 75) good.push(it('good', '🥅', `<b>Strong-legged kicker</b> ${sur(k)} (PWR ${k.a}): field goals from 55.${tip('stop drives before midfield')}`));
  if (k.b <= 55) bad.push(it('bad', '🫣', `<b>Shaky kicker</b> ${sur(k)} (ACC ${k.b}).${tip('a long field goal is a coin flip')}`));
  if (pt.a >= 72) good.push(it('good', '🦶', `<b>Booming punter</b> ${sur(pt)} (PWR ${pt.a}): wins field position.${tip('plan for a long field')}`));
  if (opp) {
    const O = units(opp), d = (a, b) => Math.round(a - b);
    if (U.passBlock - O.passRush >= 8) good.push(it('good', '🛡️', `<b>Your pass blocking beats their rush</b> by ${d(U.passBlock, O.passRush)}: time to throw.`));
    else if (U.passBlock - O.passRush <= -8) bad.push(it('bad', '🌪️', `<b>Their pass rush beats your blocking</b> by ${d(O.passRush, U.passBlock)}: expect pressure — use screens and quick passes.`));
    if (U.runBlock - O.runStop >= 8) good.push(it('good', '🚜', `<b>Your run blocking beats their run defense</b> by ${d(U.runBlock, O.runStop)}: run it.`));
    else if (U.runBlock - O.runStop <= -8) bad.push(it('bad', '🧱', `<b>Their run defense beats your blocking</b> by ${d(O.runStop, U.runBlock)}: runs will be tough.`));
    if (U.recv - O.cover >= 6) good.push(it('good', '🙌', `<b>Your receivers beat their coverage</b> by ${d(U.recv, O.cover)}: throw medium and deep.`));
    else if (U.recv - O.cover <= -6) bad.push(it('bad', '🪟', `<b>Their coverage beats your receivers</b> by ${d(O.cover, U.recv)}: stick to short and screens.`));
    if (U.passRush - O.passBlock >= 8) good.push(it('good', '⚡', `<b>Your rush beats their blocking</b> by ${d(U.passRush, O.passBlock)}: blitzing is optional — you'll get sacks.`));
    if (U.cover - O.recv <= -6) bad.push(it('bad', '🕳️', `<b>Their receivers beat your coverage</b> by ${d(O.recv, U.cover)}: don't rely on man; use zone and pressure.`));
  }
  return { good: cap(good, 8), bad: cap(bad, 8) };
}

function plays(hist, side) { return hist.filter((h) => h.side === side && !h.pen && !['punt', 'fg', 'kneel', 'spike'].includes(h.call)); }
const RUN = ['inrun', 'outrun', 'sneak'], PASS = ['short', 'medium', 'deep', 'screen'];
function fbSplit(arr) {
  const runs = arr.filter((h) => RUN.includes(h.call)), pass = arr.filter((h) => PASS.includes(h.call));
  const att = pass.filter((h) => h.res !== 'SACK'), comp = att.filter((h) => h.res !== 'INCOMPLETE' && h.res !== 'INTERCEPTION');
  const ry = runs.reduce((a, h) => a + h.y, 0), py = comp.reduce((a, h) => a + h.y, 0);
  const third = arr.filter((h) => h.down === 3), thirdOk = third.filter((h) => h.fd || h.td);
  const by = {};
  for (const h of arr) { const o = (by[h.call] ||= { n: 0, y: 0 }); o.n++; o.y += h.y; }
  return {
    runs: runs.length, ry, ypc: runs.length ? ry / runs.length : 0, att: att.length, comp: comp.length, py, ypa: att.length ? py / att.length : 0,
    sacks: pass.filter((h) => h.res === 'SACK').length, ints: pass.filter((h) => h.res === 'INTERCEPTION').length,
    to: arr.filter((h) => ['INTERCEPTION', 'FUMBLE', 'DOWNS'].includes(h.res)).length, third: third.length, thirdOk: thirdOk.length,
    expl: arr.filter((h) => h.y >= 20).length, yards: ry + py + arr.filter((h) => h.res === 'SACK').reduce((a, h) => a + h.y, 0), by, n: arr.length,
  };
}

function fbToday(g, mine) {
  const good = [], bad = [], oppBad = [], oppGood = [], flow = [];
  const ms = g.home === mine ? 'home' : 'away', os = other(ms), hist = g.hist || [];
  const me = fbSplit(plays(hist, ms)), th = fbSplit(plays(hist, os));
  if (me.runs >= 4 && me.ypc >= 4.6) good.push(it('good', '🏃', `<b>Your run game:</b> ${me.ypc.toFixed(1)} yards per carry on ${me.runs} carries.`));
  if (me.runs >= 4 && me.ypc <= 3.0) bad.push(it('bad', '🧱', `<b>Your run game is stuck:</b> ${me.ypc.toFixed(1)} per carry. Consider passing or a different run.`));
  if (me.att >= 5 && me.ypa >= 7.5) good.push(it('good', '🎯', `<b>Your passing:</b> ${me.comp}/${me.att}, ${me.ypa.toFixed(1)} per attempt.`));
  if (me.att >= 5 && (me.ypa <= 5.2 || me.comp / me.att < 0.5)) bad.push(it('bad', '🪂', `<b>Your passing is struggling:</b> ${me.comp}/${me.att}, ${me.ypa.toFixed(1)} per attempt. Try shorter throws.`));
  if (me.to >= 2) bad.push(it('bad', '🥴', `<b>${me.to} turnovers</b> by your offense. Protect the ball.`));
  if (me.third >= 4 && me.thirdOk / me.third <= 0.25) bad.push(it('bad', '🚫', `<b>3rd down:</b> only ${me.thirdOk} of ${me.third}. Drives keep stalling.`));
  if (me.third >= 4 && me.thirdOk / me.third >= 0.6) good.push(it('good', '✅', `<b>3rd down:</b> ${me.thirdOk} of ${me.third}. You keep the chains moving.`));
  if (me.sacks >= 3) bad.push(it('bad', '🌪️', `<b>${me.sacks} sacks allowed.</b> Use quick passes and screens.`));
  if (th.sacks >= 2) good.push(it('good', '⚡', `<b>${th.sacks} sacks</b> by your defense.`));
  if (th.runs >= 4 && th.ypc <= 3.2) good.push(it('good', '🧱', `<b>Run defense:</b> holding them to ${th.ypc.toFixed(1)} per carry.`));
  if (th.runs >= 4 && th.ypc >= 5.2) bad.push(it('bad', '🫥', `<b>Run defense is soft:</b> ${th.ypc.toFixed(1)} per carry. Stack the box.`));
  if (th.att >= 5 && th.ypa <= 5.5) good.push(it('good', '🔒', `<b>Pass defense:</b> ${th.ypa.toFixed(1)} per attempt allowed.`));
  if (th.att >= 5 && th.ypa >= 8.5) bad.push(it('bad', '🪟', `<b>Coverage is leaking:</b> ${th.ypa.toFixed(1)} per attempt. Try zone or prevent.`));
  if (th.to >= 1) good.push(it('good', '🎁', `<b>${th.to} takeaway${th.to > 1 ? 's' : ''}</b> so far.`));
  // by call
  const bestCall = Object.entries(me.by).filter(([c, o]) => o.n >= 3 && c !== 'punt').sort((a, b) => b[1].y / b[1].n - a[1].y / a[1].n)[0];
  if (bestCall && bestCall[1].y / bestCall[1].n >= 6) good.push(it('good', '⭐', `<b>${OFF_CALLS[bestCall[0]]}</b> is your best call: ${(bestCall[1].y / bestCall[1].n).toFixed(1)} per play (${bestCall[1].n} plays).`));
  const worst = Object.entries(me.by).filter(([c, o]) => o.n >= 3).sort((a, b) => a[1].y / a[1].n - b[1].y / b[1].n)[0];
  if (worst && worst[1].y / worst[1].n <= 2.0) bad.push(it('bad', '👎', `<b>${OFF_CALLS[worst[0]]}</b> is not working: ${(worst[1].y / worst[1].n).toFixed(1)} per play over ${worst[1].n} plays.`));
  // our defensive calls vs them
  const byD = {};
  for (const h of plays(hist, os)) { const o = (byD[h.dcall || 'base'] ||= { n: 0, y: 0 }); o.n++; o.y += h.y; }
  for (const [c, o] of Object.entries(byD)) {
    if (o.n < 3) continue;
    const a = o.y / o.n;
    if (a <= 3) good.push(it('good', '🛑', `<b>${DEF_CALLS[c].name}</b> works: they average ${a.toFixed(1)} per play against it.`));
    else if (a >= 7) bad.push(it('bad', '💣', `<b>${DEF_CALLS[c].name}</b> is getting burned: ${a.toFixed(1)} per play allowed.`));
  }
  // opponent tendencies
  const theirFirst = plays(hist, os).filter((h) => h.down === 1);
  if (theirFirst.length >= 5) { const rr = theirFirst.filter((h) => RUN.includes(h.call)).length; if (rr / theirFirst.length >= 0.7) oppBad.push(it('good', '🔍', `<b>Predictable:</b> they run on ${rr} of ${theirFirst.length} first downs. <i>→ stack the box on 1st down</i>`)); else if (rr / theirFirst.length <= 0.3) oppBad.push(it('good', '🔍', `<b>Predictable:</b> they pass on ${theirFirst.length - rr} of ${theirFirst.length} first downs. <i>→ play zone on 1st down</i>`)); }
  const myPass = plays(hist, ms).filter((h) => PASS.includes(h.call));
  if (myPass.length >= 5) { const bl = myPass.filter((h) => h.dcall === 'blitz').length; if (bl / myPass.length >= 0.3) oppGood.push(it('bad', '⚡', `<b>They blitz often:</b> ${bl} of your ${myPass.length} passes. <i>→ screens and quick throws beat the blitz</i>`)); }
  const theirDeep = plays(hist, os).filter((h) => h.call === 'deep').length;
  if (theirDeep >= 3) oppGood.push(it('bad', '🚀', `<b>They keep going deep:</b> ${theirDeep} deep shots. <i>→ prevent or man coverage</i>`));
  // flow
  const spent = (t) => t.yards;
  flow.push(it('', '📊', `<b>Total offense:</b> you ${spent(me)} yds, they ${spent(th)} yds · <b>Plays:</b> ${me.n} to ${th.n}`));
  flow.push(it('', '🔁', `<b>Turnovers:</b> you ${me.to}, they ${th.to} · <b>3rd down:</b> you ${me.thirdOk}/${me.third}, they ${th.thirdOk}/${th.third} · <b>Big plays (20+):</b> ${me.expl} to ${th.expl}`));
  flow.push(it('', '🏈', `<b>Passing:</b> you ${me.comp}/${me.att} for ${me.py}, they ${th.comp}/${th.att} for ${th.py} · <b>Rushing:</b> you ${me.ry}, they ${th.ry}`));
  return { good, bad, oppBad, oppGood, flow };
}

function fbWpIf(g, mine, fn) {
  const h = { ...g, score: { ...g.score } };
  fn(h);
  const w = fbWinProb(h);
  return mine === g.home ? w : 1 - w;
}
function fbLeverage(g, mine) {
  const side = actingSide(g), me = g[side] === mine, ms = g.home === mine ? 'home' : 'away';
  const now = (() => { const w = fbWinProb(g); return ms === 'home' ? w : 1 - w; })();
  const score = (h, s, pts) => { h.score[s] += pts; h.phase = 'kickoff'; h.kicking = s; };
  const give = (h) => { h.phase = 'snap'; h.poss = other(g.phase === 'snap' ? g.poss : side); h.ball = 30; h.down = 1; h.toGo = 10; };
  const poss = g.poss;
  let good, bad, goodLabel, badLabel;
  if (g.phase === 'snap' && me) {
    good = fbWpIf(g, mine, (h) => score(h, ms, 7)); bad = fbWpIf(g, mine, (h) => { h.poss = other(ms); h.ball = clampN(100 - g.ball); h.down = 1; h.toGo = 10; });
    goodLabel = 'you score a touchdown'; badLabel = 'you turn it over here';
  } else if (g.phase === 'snap') {
    good = fbWpIf(g, mine, (h) => { h.poss = ms; h.ball = clampN(100 - g.ball); h.down = 1; h.toGo = 10; }); bad = fbWpIf(g, mine, (h) => score(h, other(ms), 7));
    goodLabel = 'you get a stop'; badLabel = 'they score a touchdown';
  } else { good = bad = now; goodLabel = badLabel = ''; }
  const lev = Math.abs(good - bad);
  void poss;
  return { now, good, bad, lev, level: levelOf(lev), goodLabel, badLabel };
}
const clampN = (x) => Math.max(1, Math.min(99, x));

export function fbChip(g, mine) {
  if (g.over) return [];
  const ms = g.home === mine ? 'home' : 'away', d = g.score[ms] - g.score[other(ms)], lv = fbLeverage(g, mine);
  const chips = [{ t: d > 0 ? `Leading by ${d}` : d < 0 ? `Trailing by ${-d}` : 'Tied', tone: d > 0 ? 'good' : d < 0 ? 'bad' : '' }];
  if (g.phase === 'snap') chips.push({ t: `${ORD[g.down]} & ${g.ball + g.toGo >= 100 ? 'goal' : Math.round(g.toGo)}`, tone: '' });
  chips.push({ t: `${pc(lv.now)}% win`, tone: lv.now >= 0.5 ? 'good' : 'bad' });
  if (lv.level !== 'Low') chips.push({ t: `⚡ ${lv.level} leverage`, tone: lv.level === 'High' ? 'warn' : '' });
  return chips;
}

export function fbGameIntel(g, mine) {
  const opp = g.home === mine ? g.away : g.home, side = actingSide(g), me = g[side] === mine, ms = g.home === mine ? 'home' : 'away';
  const d = g.score[ms] - g.score[other(ms)], lead = d > 0 ? `leading by ${d}` : d < 0 ? `trailing by ${-d}` : 'tied', rem = remainSeconds(g);
  const lv = fbLeverage(g, mine), now = [];
  const q = g.ot ? 'Overtime' : `Quarter ${g.quarter}`;
  if (g.phase === 'snap') {
    const where = g.ball <= 50 ? `${me ? 'your' : 'their'} own ${g.ball}` : `${me ? "the opponent's" : 'your'} ${100 - g.ball}`;
    now.push(it('', '📍', `<b>${q}, ${fmtClock(g.clock)}:</b> you're ${lead} (${g.score[ms]}–${g.score[other(ms)]}). ${me ? 'Your offense has' : 'They have'} the ball: <b>${ORD[g.down]} &amp; ${g.ball + g.toGo >= 100 ? 'goal' : Math.round(g.toGo)}</b> at ${where}.`));
    if (me) {
      const dist = fgDistance(g);
      now.push(it('', '🥅', dist <= 66 ? `<b>${100 - g.ball} yards to the end zone.</b> Field goal from ${dist} yards: ${pc(fgProb(g))}% to make.` : `<b>${100 - g.ball} yards to the end zone.</b> Out of field-goal range.`));
    }
  } else now.push(it('', '📍', `<b>${q}, ${fmtClock(g.clock)}:</b> you're ${lead} (${g.score[ms]}–${g.score[other(ms)]}). ${g.phase === 'kickoff' ? 'A kickoff is coming.' : 'A point-after try is coming.'}`));
  const q4 = g.quarter >= 4;
  if (q4 && d > 0 && rem < 420) now.push(it('good', '⏳', `<b>Protect the lead:</b> run the ball, slow the tempo and avoid turnovers.`));
  else if (q4 && d < 0 && rem < 300) now.push(it('bad', '⏳', `<b>You need points:</b> hurry-up, sideline throws, and save timeouts for the end.`));
  const today = fbToday(g, mine), myRep = fbReport(mine, { opp }), oppRep = fbReport(opp, { asOpp: true });
  return {
    now, lev: lv, chip: fbChip(g, mine),
    oppBad: cap([...today.oppBad, ...oppRep.bad], 6), oppGood: cap([...today.oppGood, ...oppRep.good], 5),
    mineBad: cap([...today.bad, ...myRep.bad], 7), mineGood: cap([...today.good, ...myRep.good], 7), flow: today.flow,
  };
}

// ===================================================================================
// HTML
// ===================================================================================
const items = (arr, empty) => (arr.length ? arr.map((x) => `<div class="ins ${x.tone}"><i>${x.ic}</i><span>${x.text}</span></div>`).join('') : `<div class="ins"><span class="mute">${empty}</span></div>`);

export function renderIntel(info) {
  const lv = info.lev;
  const lev = lv.goodLabel ? `<div class="lev"><div class="levrow"><span>Win chance now</span><b>${pc(lv.now)}%</b></div>
    <div class="levrow good"><span>If ${lv.goodLabel}</span><b>${pc(lv.good)}%</b></div><div class="levrow bad"><span>If ${lv.badLabel}</span><b>${pc(lv.bad)}%</b></div>
    <div class="levmeter"><i style="width:${Math.min(100, lv.lev * 250)}%"></i></div><small>Leverage <b>${lv.level}</b> — this moment moves your win chance about ${pc(lv.lev)} points.</small></div>` : '';
  return `<div class="intel"><h3 style="margin-top:0">📍 Where you are</h3>${items(info.now, '')}${lev}
    <h3>🎯 Their weaknesses — attack these</h3>${items(info.oppBad, 'Nothing obvious yet — keep watching.')}
    <h3>⚠️ Your weaknesses — cover these</h3>${items(info.mineBad, 'No glaring weaknesses right now.')}
    <h3>💪 Your strengths — lean on these</h3>${items(info.mineGood, 'Nothing standing out yet.')}
    <h3>🛡️ Their strengths — watch out</h3>${items(info.oppGood, 'Nothing standing out yet.')}
    <h3>📈 How the game has gone</h3>${items(info.flow, '')}</div>`;
}
export function renderReport(rep, { title = 'Scouting report', goodT = 'Strengths', badT = 'Weaknesses' } = {}) {
  return `<div class="intel"><h3 style="margin-top:0">${badT}</h3>${items(rep.bad, 'No obvious weaknesses.')}<h3>${goodT}</h3>${items(rep.good, 'Nothing standing out.')}</div>`;
}
export const chipHtml = (chips) => (chips.length ? `<div class="camchip">${chips.map((c) => `<span class="${c.tone}">${c.t}</span>`).join('')}</div>` : '');
void allPlayers; void bullpenRole;
