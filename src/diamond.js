// Skipper Diamond: baseball you PLAY (swing, pitch, field, run). Pure logic, no DOM, so it can run headless in tests.
// Strike-zone coordinates: x in [-ZONE, ZONE] left to right (catcher's view), y in [-ZONE, ZONE] low to high.
// Field coordinates are in feet from home plate: x to the right-field side, y out toward centre field.
export const ZONE = 0.8;
export const PITCHES = {
  FB: { n: 'Fastball', dur: 0.82, mv: [0, 0.04], diff: 0 },
  SL: { n: 'Slider', dur: 0.94, mv: [0.5, -0.18], diff: 0.06 },
  CB: { n: 'Curveball', dur: 1.1, mv: [0.08, -0.75], diff: 0.09 },
  CH: { n: 'Changeup', dur: 1.06, mv: [0.14, -0.3], diff: 0.04 },
};
export const LEVELS = [
  { id: 0, name: 'Rookie', bat: -0.08, ctl: -0.12, eye: -0.08 },
  { id: 1, name: 'Pro', bat: 0, ctl: 0, eye: 0 },
  { id: 2, name: 'All-Star', bat: 0.06, ctl: 0.08, eye: 0.08 },
];
export const TEAMS = [
  { name: 'Harbor Hawks', col: '#c0392b' }, { name: 'Prairie Bison', col: '#9a6a34' }, { name: 'Bay Sharks', col: '#139a98' },
  { name: 'Mesa Scorpions', col: '#e0701f' }, { name: 'Capital Wolves', col: '#7b4bc2' }, { name: 'Lakeshore Gulls', col: '#cfd6e2' }, { name: 'Steel City Forge', col: '#d9a21b' },
];
export const BAG = [[63.6, 63.6], [0, 127.3], [-63.6, 63.6]], HOME = [0, 0];
export const POS = { P: [0, 60], '1B': [66, 84], '2B': [34, 126], SS: [-34, 126], '3B': [-66, 84], LF: [-150, 275], CF: [0, 305], RF: [150, 275] };
const NUMS = { P: 1, '1B': 3, '2B': 4, '3B': 5, SS: 6, LF: 7, CF: 8, RF: 9 };
const SPD = { P: 22, '1B': 23, '2B': 25, SS: 26, '3B': 25, LF: 29, CF: 31, RF: 29 };
export const fenceAt = (phi) => 330 + 70 * Math.cos((2 * phi * Math.PI) / 180);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const other = (t) => (t === 'U' ? 'C' : 'U');
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function rnd(g) { let t = (g.rs = (g.rs + 0x6D2B79F5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const gauss = (g) => { let s = 0; for (let i = 0; i < 4; i++) s += rnd(g); return (s - 2) * 1.73; };
const pickOne = (g, a) => a[Math.floor(rnd(g) * a.length)];

const FIRST = ['Alex', 'Ben', 'Cal', 'Dev', 'Eli', 'Finn', 'Gus', 'Hal', 'Ike', 'Jay', 'Kai', 'Leo', 'Max', 'Ned', 'Oz', 'Pat', 'Ray', 'Sam', 'Ty', 'Vic', 'Wes', 'Zed'];
const LAST = ['Reyes', 'Brooks', 'Okafor', 'Lindqvist', 'Moreno', 'Tanaka', 'Walsh', 'Dubois', 'Petrov', 'Hayes', 'Castillo', 'Nguyen', 'Foster', 'Ibarra', 'Kowalski', 'Mensah', 'Rowe', 'Shaw', 'Vance', 'Zimmer', 'Bell', 'Cruz', 'Doyle', 'Eaton'];
function makeBatter(g, i, s = 1) {
  const r = () => clamp(0.38 + rnd(g) * 0.5 + (s - 1) * 0.9, 0.2, 0.98);
  return { id: i, name: `${pickOne(g, FIRST)[0]}. ${pickOne(g, LAST)}`, contact: clamp(r() + 0.05, 0.2, 0.99), power: r(), eye: r(), speed: r() };
}
function makePitcher(g, s = 1) { const r = () => clamp(0.45 + rnd(g) * 0.4 + (s - 1) * 0.9, 0.25, 0.98); return { name: `${pickOne(g, FIRST)[0]}. ${pickOne(g, LAST)}`, velo: r(), ctrl: r(), brk: r(), pitches: 0 }; }

export function newDiamond(o = {}) {
  const lv = o.level ?? 1;
  const g = {
    rs: ((o.seed ?? (Date.now() & 0x7fffffff)) >>> 0) || 1, lv, level: LEVELS[lv], innings: o.innings || 5, inning: 1, half: 'top', outs: 0, balls: 0, strikes: 0,
    score: { U: 0, C: 0 }, byInning: { U: [], C: [] }, names: { U: o.name || 'Skipper', C: o.opp?.name || 'Hawks' }, col: { U: o.col || '#2b6cb0', C: o.opp?.col || '#c0392b' },
    lineup: { U: [], C: [] }, order: { U: 0, C: 0 }, pitcher: { U: null, C: null }, bases: [null, null, null], phase: 'ready', timer: 1.2, pitch: null, batter: null,
    last: '', ev: [], in: { cx: 0, cy: 0 }, steal: false, pending: null, bip: null, auto: !!o.auto, over: false, winner: null, drill: o.drill || null,
    stat: { U: { h: 0, k: 0, bb: 0, hr: 0, ab: 0, pit: 0, kp: 0, dp: 0, sb: 0, cs: 0 }, C: { h: 0, k: 0, bb: 0, hr: 0, ab: 0, pit: 0, kp: 0, dp: 0, sb: 0, cs: 0 } }, runsThis: 0, pitchCount: 0,
  };
  const str = { U: o.strU ?? 1, C: o.strC ?? o.opp?.str ?? 1 };
  for (const t of ['U', 'C']) { for (let i = 0; i < 9; i++) g.lineup[t].push(makeBatter(g, i, str[t])); g.pitcher[t] = makePitcher(g, str[t]); }
  if (o.start) Object.assign(g, o.start);
  startAtBat(g);
  return g;
}
export const batTeam = (g) => (g.half === 'top' ? 'U' : 'C');
export const fieldTeam = (g) => (g.half === 'top' ? 'C' : 'U');
export const userBatting = (g) => !g.auto && batTeam(g) === 'U';
export const userPitching = (g) => !g.auto && fieldTeam(g) === 'U';
const banner = (g, t, s = '', c = 'info') => g.ev.push({ k: 'banner', t, s, c });
const sfx = (g, n) => g.ev.push({ k: 'sfx', n });

function startAtBat(g) {
  g.balls = g.strikes = 0; g.phase = 'ready'; g.timer = 1.25; g.pitch = null; g.bip = null; g.pending = null; g.steal = false;
  const bt = batTeam(g); g.batter = g.lineup[bt][g.order[bt] % 9]; g.pit = g.pitcher[fieldTeam(g)];
}

/* ------------------------------------ pitching ------------------------------------ */
const pitchDur = (g, type) => PITCHES[type].dur * (1.12 - 0.22 * g.pit.velo);
/** Where the ball is (zone units, plus scale 0..1 for perspective) at progress u. */
export function ballAt(p, u) {
  const e = clamp(u, 0, 1.06), k = Math.pow(e, 1.15), mv = PITCHES[p.type].mv, brk = Math.pow(1 - Math.min(1, e), 2) * p.brk;
  const sx = 0.05, sy = 1.55;
  return { x: sx + (p.x - sx) * k - mv[0] * brk, y: sy + (p.y - sy) * k - mv[1] * brk, s: 0.18 + 0.82 * k };
}
/** err: 0 (perfect meter) .. 1 (terrible). */
export function throwPitch(g, type, tx, ty, err) {
  if (g.phase !== 'ready' || !PITCHES[type]) return false;
  const p = g.pit, lvC = fieldTeam(g) === 'C' ? g.level.ctl : 0;
  const tired = 1 + Math.max(0, p.pitches - 70) * 0.012;
  const r = (0.1 + clamp(err, 0, 1) * 0.95) * (1.38 - clamp(p.ctrl + lvC, 0.2, 1) * 0.72) * tired;
  const ang = rnd(g) * 6.283, rad = r * Math.sqrt(rnd(g));
  const x = clamp(tx + Math.cos(ang) * rad, -1.9, 1.9), y = clamp(ty + Math.sin(ang) * rad, -1.9, 1.9);
  g.pitch = { type, tx, ty, x, y, t: 0, dur: pitchDur(g, type), brk: PITCHES[type].mv ? 0.8 + 0.5 * p.brk : 1, swing: null, spd: Math.round(70 + 28 * p.velo - PITCHES[type].diff * 60) };
  p.pitches++; g.pitchCount++; g.phase = 'pitch';
  if (!userBatting(g)) g.pitch.cpu = cpuSwing(g, g.pitch);
  sfx(g, 'throw');
  return true;
}
function cpuPitchChoice(g) {
  const p = g.pit, ahead = g.strikes > g.balls, behind = g.balls > g.strikes + 0;
  const w = { FB: behind ? 3.5 : 2, SL: 1.2 + p.brk, CB: ahead ? 1.6 : 0.7, CH: 1 };
  let tot = 0; for (const k in w) tot += w[k]; let r = rnd(g) * tot, type = 'FB'; for (const k in w) { r -= w[k]; if (r <= 0) { type = k; break; } }
  let tx, ty;
  if (ahead && rnd(g) < (g.strikes === 2 ? 0.6 : 0.4)) { tx = (rnd(g) < 0.5 ? -1 : 1) * (0.9 + rnd(g) * 0.3); ty = (rnd(g) - 0.5) * 1.6; if (type === 'CB') ty = -1.05 - rnd(g) * 0.2; }
  else if (behind) { tx = (rnd(g) - 0.5) * 0.9; ty = (rnd(g) - 0.5) * 0.9; }
  else { tx = (rnd(g) < 0.5 ? -1 : 1) * (0.3 + rnd(g) * 0.55); ty = (rnd(g) < 0.5 ? -1 : 1) * (0.2 + rnd(g) * 0.6); }
  return { type, tx, ty, err: Math.abs(gauss(g)) * 0.75 + (rnd(g) < 0.14 ? 0.5 : 0) };
}

/* ------------------------------------ batting ------------------------------------ */
const quality = (dt, dist, user) => (user ? { tq: 1 - Math.abs(dt) / 0.19, sq: 1 - dist / 1.05 } : { tq: 1 - Math.abs(dt) / 0.135, sq: 1 - dist / 0.85 });
function cpuSwing(g, p) {
  const b = g.batter, inZ = Math.abs(p.x) < ZONE && Math.abs(p.y) < ZONE, heart = Math.abs(p.x) < 0.4 && Math.abs(p.y) < 0.4, dz = Math.max(Math.abs(p.x), Math.abs(p.y));
  const eye = clamp(b.eye + (batTeam(g) === 'C' ? g.level.eye : 0), 0.1, 0.99);
  let ps = heart ? 0.74 : inZ ? 0.55 : dz < 1.15 ? 0.3 * (1.3 - eye) : 0.06 * (1.35 - eye);
  if (g.strikes === 2) ps = Math.min(0.97, ps + (inZ ? 0.25 : 0.12));
  if (g.balls === 3 && g.strikes < 2) ps *= 0.5;
  const contact = clamp(b.contact + (batTeam(g) === 'C' ? g.level.bat : 0), 0.2, 0.99), diff = PITCHES[p.type].diff;
  const sdT = clamp(0.1 - (contact - 0.5) * 0.07 + diff * 0.3, 0.05, 0.17), sdS = clamp(0.46 - (contact - 0.55) * 0.3 + diff * 1.0, 0.2, 0.7);
  return { swing: rnd(g) < ps, dt: gauss(g) * sdT - (p.type === 'CH' ? 0.03 : 0), dist: Math.abs(gauss(g)) * sdS + (inZ ? 0 : 0.28) };
}
export function swing(g, cx, cy) {
  if (g.phase !== 'pitch' || !g.pitch || g.pitch.swing || !userBatting(g)) return false;
  g.pitch.swing = { t: g.pitch.t, cx, cy }; sfx(g, 'swing'); return true;
}
export function toggleSteal(g) {
  if (g.phase !== 'ready' && g.phase !== 'pitch') return false;
  if (!g.bases[0] || g.bases[1]) return false; g.steal = !g.steal; return true;
}

function resolvePitch(g) {
  const p = g.pitch, b = g.batter, bt = batTeam(g), ft = fieldTeam(g), inZ = Math.abs(p.x) < ZONE && Math.abs(p.y) < ZONE;
  let swung = false, dt = 0, dist2 = 9, cx = 0, cy = 0;
  if (userBatting(g)) { if (p.swing) { swung = true; dt = p.swing.t + 0.16 - p.dur; cx = p.swing.cx; cy = p.swing.cy; dist2 = Math.hypot(cx - p.x, cy - p.y); } }
  else if (p.cpu.swing) { swung = true; dt = p.cpu.dt; dist2 = p.cpu.dist; cx = p.x; cy = p.y; }
  g.stat[ft].pit++;
  let res = 'ball';
  if (swung) {
    const { tq, sq } = quality(dt, dist2, userBatting(g));
    if (tq <= 0 || sq <= 0) res = 'miss';
    else {
      const diff = PITCHES[p.type].diff + (p.spd - 85) * -0.002;
      let q = clamp(tq * 0.6 + sq * 0.4 - diff * 0.6, 0.02, 1);
      if (userBatting(g)) q = clamp(q + 0.04, 0, 1);
      const pw = b.power + (bt === 'C' ? g.level.bat : 0) * 0.5;
      const ev = 55 + 56 * Math.pow(q, 1.0) * (0.55 + 0.6 * pw) + gauss(g) * 4;
      const phi = dt * 190 + gauss(g) * 5 + (userBatting(g) ? 0 : gauss(g) * 6);
      const la = 6 + (userBatting(g) ? (p.y - cy) * 38 : (p.y * -9 + gauss(g) * 15 + 11)) + gauss(g) * 4;
      if (rnd(g) < clamp(0.7 - q * 0.85, 0, 0.62)) res = 'foul';
      else { res = 'inplay'; g.pendingBip = { ev, la, phi, q }; }
    }
  } else res = inZ ? (Math.abs(Math.abs(p.x) - ZONE) < 0.05 && rnd(g) < 0.35 ? 'ball' : 'strike') : (Math.max(Math.abs(p.x), Math.abs(p.y)) < ZONE + 0.07 && rnd(g) < 0.3 ? 'strike' : 'ball');
  if (res === 'inplay') {
    const bip = contactResult(g, g.pendingBip.ev, g.pendingBip.la, g.pendingBip.phi); g.pendingBip = null;
    if (bip.foul) res = 'foul'; else { g.last = ''; return startBip(g, bip); }
  }
  const stolen = g.steal && g.bases[0] && !g.bases[1];
  g.steal = false;
  if (res === 'strike' || res === 'miss') { g.strikes++; g.last = res === 'miss' ? 'Swing and a miss!' : 'Called strike'; sfx(g, 'strike'); }
  else if (res === 'foul') { if (g.strikes < 2) g.strikes++; g.last = 'Foul ball'; sfx(g, 'foul'); }
  else { g.balls++; g.last = 'Ball'; }
  let over = false;
  if (stolen && res !== 'foul') over = attemptSteal(g, p);
  if (g.phase === 'result' || g.over) return;
  if (g.strikes >= 3) { g.stat[ft].k++; if (swung) g.stat[ft].kp++; banner(g, swung && res === 'miss' ? 'STRIKEOUT!' : 'STRUCK OUT LOOKING', b.name, bt === 'U' ? 'bad' : 'good'); out(g, 1, true); return; }
  if (g.balls >= 4) { g.stat[bt].bb++; banner(g, 'WALK', b.name, bt === 'U' ? 'good' : 'bad'); walk(g); return; }
  void over; g.phase = 'result'; g.timer = 0.9;
}
function attemptSteal(g, p) {
  const r = g.bases[0], ft = fieldTeam(g), bt = batTeam(g);
  const pr = clamp(0.6 + (r.speed - 0.5) * 0.55 + (p.dur - 0.9) * 0.35 - (g.pit.velo - 0.6) * 0.1, 0.2, 0.93);
  if (rnd(g) < pr) { g.bases[1] = r; g.bases[0] = null; g.stat[bt].sb++; g.last += '. Stolen base!'; banner(g, 'STOLEN BASE', r.name, bt === 'U' ? 'good' : 'bad'); sfx(g, 'run'); return false; }
  g.bases[0] = null; g.stat[ft].cs++; g.last += '. Caught stealing!'; banner(g, 'CAUGHT STEALING', r.name, bt === 'U' ? 'bad' : 'good');
  if (g.strikes >= 3) { out(g, 2, true); return true; }
  out(g, 1, false, true); return true;
}

/* ------------------------------------ balls in play ------------------------------------ */
function nearestFielder(land, listed) {
  let best = null, bt = 99;
  for (const k of Object.keys(POS)) { if (listed && !listed.includes(k)) continue; const tF = 0.45 + dist(POS[k], land) / (SPD[k] * 0.92); if (tF < bt) { bt = tF; best = k; } }
  return { pos: best, tF: bt };
}
function contactResult(g, ev, la, phi) {
  if (Math.abs(phi) > 45) return { foul: true, ev, la, phi };
  const vf = ev * 1.467, th = (Math.max(la, -5) * Math.PI) / 180;
  const bip = { ev: Math.round(ev), la: Math.round(la), phi: Math.round(phi), foul: false, hr: false, kind: 'fly' };
  if (la < 10) {
    bip.kind = 'ground'; const vb = Math.max(20, vf * 0.66);
    let found = null;
    for (let s = 20; s <= 220 && !found; s += 4) {
      const pt = [s * Math.sin((phi * Math.PI) / 180), s * Math.cos((phi * Math.PI) / 180)], tb = s / vb + 0.1;
      for (const k of ['P', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF']) { const tf = 0.45 + dist(POS[k], pt) / (SPD[k] * 0.95); if (tf <= tb) { if (!found || tf < found.tf) found = { pos: k, s, pt, tb, tf }; } }
    }
    if (found && found.s < 175) { bip.fielded = found; bip.land = found.pt; bip.T = found.tb; }
    else { const far = [160 * Math.sin((phi * Math.PI) / 180), 170 * Math.cos((phi * Math.PI) / 180)]; bip.through = true; bip.land = [far[0] * 1.25, far[1] * 1.3]; bip.T = 1.4; const nf = nearestFielder(bip.land, ['LF', 'CF', 'RF']); bip.pos = nf.pos; bip.tF = Math.max(bip.T + 0.5, nf.tF); bip.R = dist(HOME, bip.land); }
    return bip;
  }
  const R = (vf * vf * Math.sin(2 * th) / 32.2) * 0.6, T = Math.max(0.8, (2 * vf * Math.sin(th) / 32.2) * 0.85);
  bip.R = Math.round(R); bip.T = T; bip.land = [R * Math.sin((phi * Math.PI) / 180), R * Math.cos((phi * Math.PI) / 180)];
  if (R > fenceAt(phi) && la >= 12) { bip.hr = true; bip.kind = 'hr'; return bip; }
  const nf = nearestFielder(bip.land); bip.pos = nf.pos; bip.tF = nf.tF;
  bip.caught = nf.tF <= T + 0.12; bip.kind = la < 22 && ev > 85 ? 'line' : la > 50 ? 'pop' : 'fly';
  if (!bip.caught) {
    const extra = Math.max(0, nf.tF - T);
    bip.bases = R < 150 ? 1 : (extra > 0.9 || R > 215) ? 2 : 1;
    if (R > 285 && extra > 1.6 && bip.bases === 2) bip.bases = 3;
    if (R < 150) bip.bases = 1;
    bip.extra = extra;
  }
  return bip;
}

const posName = (k) => ({ P: 'pitcher', '1B': 'first base', '2B': 'second base', SS: 'shortstop', '3B': 'third base', LF: 'left field', CF: 'center field', RF: 'right field' }[k]);
function startBip(g, bip) {
  g.bip = bip; g.phase = 'bip'; g.timer = 0; g.bt = 0; const bt = batTeam(g), ft = fieldTeam(g);
  g.stat[bt].ab++; sfx(g, 'hit');
  // build the animation + decide whether the player gets a choice
  bip.anim = { dur: 3.2, ball: [{ t0: 0, t1: Math.max(0.5, bip.T), from: HOME, to: bip.land, arc: bip.kind === 'ground' ? 0 : Math.min(60, (bip.R || 100) * 0.3) }], run: [], fieldPos: bip.fielded ? bip.fielded.pos : bip.pos };
  if (bip.hr) { bip.anim.dur = 4.4; return finishBip(g, null); }
  const runners = g.bases.some(Boolean);
  if (userPitching(g)) {
    // the player is in the field: offer a throw when runners could be played on
    if (bip.kind === 'ground' && bip.fielded && runners) return askThrow(g, bip);
    if (bip.caught && g.bases[2] && g.outs < 2 && (bip.R || 0) > 150) return askThrow(g, bip);
    if (!bip.caught && bip.kind !== 'ground' && (g.bases[1] || g.bases[2]) && g.outs < 2) return askThrow(g, bip);
  } else if (userBatting(g)) {
    if (!bip.caught && !(bip.kind === 'ground' && bip.fielded) && (bip.bases === 1 || bip.bases === 2) && (bip.R || 0) >= 150 && g.outs < 2) { g.pending = { kind: 'stretch', t: 0, dl: 2.2, to: bip.bases + 1 }; return; }
  }
  void ft; finishBip(g, null);
}
function askThrow(g, bip) {
  const opts = [];
  const b = g.bases;
  if (bip.kind === 'ground' && bip.fielded) { opts.push('1'); if (b[0]) opts.push('2'); if (b[0] && b[1]) opts.push('3'); if (b[2]) opts.push('H'); }
  else { if (b[2]) opts.push('H'); if (b[1] && !b[2]) opts.push('3'); }
  if (!opts.length) return finishBip(g, null);
  g.pending = { kind: 'throw', t: 0, dl: 2.4, opts };
}
export function decide(g, choice) {
  if (!g.pending || g.phase !== 'bip') return false;
  const pd = g.pending; g.pending = null;
  if (pd.kind === 'throw' && !pd.opts.includes(choice)) choice = null;
  finishBip(g, choice, pd); return true;
}

const runTime = (r, bases) => bases * 2.9 + 1.4 - 0.55 * r.speed + (bases === 1 ? 0 : 0);
function race(g, thrower, margin = 0) { return thrower + margin < 0 + 1e9 && thrower < 0 ? true : false; }
void race;
const throwT = (from, to) => dist(from, to) / 88 + 0.5;

/** Apply the outcome of a ball in play. choice: user's throw target / stretch / null. */
function finishBip(g, choice, pd) {
  const bip = g.bip, bt = batTeam(g), ft = fieldTeam(g), b = g.batter, B = g.bases;
  const moves = []; // {from: 0 batter | 1..3, to: 0 out | 1..3 base | 4 scored}
  let outs = 0, text = '', hit = 0, banr = null;
  const bag = (n) => BAG[n - 1] || HOME;
  const fpos = bip.fielded ? bip.fielded.pos : bip.pos, fnum = NUMS[fpos] || 8;
  const keep = (from, to) => moves.push({ from, to });
  const advanceAll = (n, onlyForced) => {
    // advance existing runners n bases (or just the forced ones)
    let blocked = 0;
    for (let i = 3; i >= 1; i--) { if (!B[i - 1]) continue; let to = Math.min(4, i + n); if (onlyForced) { const forced = [1, 2, 3].slice(0, i).every((k) => B[k - 1]) ; to = forced ? Math.min(4, i + 1) : i; } keep(i, to); }
    void blocked;
  };
  if (bip.hr) {
    for (let i = 1; i <= 3; i++) if (B[i - 1]) keep(i, 4); keep(0, 4); hit = 4; text = `HOME RUN! ${Math.round(bip.R)} feet`; g.stat[bt].h++; g.stat[bt].hr++; banr = ['HOME RUN!', `${b.name} · ${Math.round(bip.R)} ft`, bt === 'U' ? 'good' : 'bad']; sfx(g, 'homer');
    bip.anim.run = [{ who: 0, to: 4, t0: 0.4, t1: 3.9 }];
  } else if (bip.kind === 'ground' && bip.fielded) {
    const f = bip.fielded, ch = choice || '1', tb = f.tb;
    const rb = (3.9 - 0.55 * b.speed) + 0.25, bobble = rnd(g) < 0.035;
    const t1 = tb + throwT(f.pt, bag(1)), t2 = tb + throwT(f.pt, bag(2)), t3 = tb + throwT(f.pt, bag(3)), tH = tb + throwT(f.pt, HOME);
    const anyForce = (n) => [1, 2, 3].slice(0, n).every((k) => B[k - 1]);
    anim(bip, f.pt, ch === 'H' ? HOME : ch === '3' ? bag(3) : ch === '2' ? bag(2) : bag(1), tb);
    if (ch === '2' && B[0]) {
      const r = B[0], rt = 3.0 - 0.45 * r.speed + 0.1;
      if (!bobble && t2 < rt) {
        outs++; keep(1, 0); text = `Force at second, ${fnum}-4`;
        // relay to first for the double play?
        const tDP = t2 + 0.55 + 90 / 88; if (g.outs + outs < 2 && tDP < rb + 0.1) { outs++; keep(0, 0); text = `DOUBLE PLAY! ${fnum}-4-3`; g.stat[ft].dp++; banr = ['DOUBLE PLAY', text, ft === 'U' ? 'good' : 'bad']; }
        else { keep(0, 1); if (B[1]) keep(2, 3); if (B[2]) keep(3, 4); }
        if (outs === 1) { if (B[1]) { /* already handled */ } }
      } else { text = `Safe at second, fielder's choice ${fnum}`; keep(1, 2); keep(0, 1); if (B[1]) keep(2, 3); if (B[2]) keep(3, 4); }
    } else if (ch === '3' && B[0] && B[1]) {
      const r = B[1], rt = 3.0 - 0.45 * r.speed + 0.1;
      if (!bobble && t3 < rt) { outs++; keep(2, 0); text = `Force at third, ${fnum}-5`; keep(1, 2); keep(0, 1); if (B[2]) keep(3, 4); }
      else { text = 'Safe at third'; keep(2, 3); keep(1, 2); keep(0, 1); if (B[2]) keep(3, 4); }
    } else if (ch === 'H' && B[2]) {
      const r = B[2], rt = 3.2 - 0.45 * r.speed + 0.1;
      if (!bobble && tH < rt) { outs++; keep(3, 0); text = `Out at the plate, ${fnum}-2`; if (B[1]) keep(2, 3); if (B[0]) keep(1, 2); keep(0, 1); }
      else { text = 'Safe at home!'; keep(3, 4); if (B[1]) keep(2, 3); if (B[0]) keep(1, 2); keep(0, 1); }
    } else {
      // throw to first
      const dpPossible = B[0] && g.outs < 2 && (t2 + 0.55 + 90 / 88) < rb + 0.1 && rnd(g) < 0.7;
      if (dpPossible && ch === '1' && !pd) {
        outs += 2; keep(1, 0); keep(0, 0); text = `DOUBLE PLAY! ${fnum}-4-3`; g.stat[ft].dp++; banr = ['DOUBLE PLAY', text, ft === 'U' ? 'good' : 'bad']; if (B[1]) keep(2, 3); if (B[2]) keep(3, 4);
      } else if (!bobble && t1 < rb) {
        outs++; keep(0, 0); text = `Ground out, ${fnum}-3`;
        if (B[2] && g.outs + outs < 3 && rnd(g) < 0.55) keep(3, 4); else if (B[2]) keep(3, 3);
        if (B[1]) keep(2, 3); if (B[0]) keep(1, 2);
      } else { hit = 1; text = bobble ? `Error! ${fnum} bobbles it` : `Infield single to ${posName(fpos)}`; keep(0, 1); if (B[2]) keep(3, 4); if (B[1]) keep(2, 3); if (B[0]) keep(1, 2); if (!bobble) g.stat[bt].h++; }
    }
  } else if (bip.caught) {
    outs++; keep(0, 0);
    const R = bip.R || 0, ft2 = bip.land;
    text = `${bip.kind === 'line' ? 'Lineout' : bip.kind === 'pop' ? 'Popup' : 'Flyout'} to ${posName(fpos)}`;
    anim(bip, bip.land, B[2] && choice === 'H' ? HOME : bag(1), bip.T);
    if (B[2] && g.outs + outs < 3 && R > 150) {
      const r = B[2], rt = 3.5 - 0.45 * r.speed + 0.2;
      if (choice === 'H') { const tt = bip.T + throwT(ft2, HOME); if (tt < rt) { outs++; keep(3, 0); text += `, doubled up at the plate!`; g.stat[ft].dp++; } else { keep(3, 4); text += ', sacrifice fly'; } }
      else if (R > 200 && rnd(g) < 0.85) { keep(3, 4); text += ', sacrifice fly'; }
      else keep(3, 3);
    } else if (B[2]) keep(3, 3);
    if (B[1]) keep(2, 2); if (B[0]) keep(1, 1);
  } else {
    // a hit that falls in (or a ball through the infield)
    hit = bip.bases || 1;
    const tF = bip.tF || 3, throwFrom = bip.land;
    let stretchTo = 0;
    if (pd && pd.kind === 'stretch' && choice === 'stretch') stretchTo = hit + 1;
    text = hit === 3 ? `Triple to ${posName(fpos)}` : hit === 2 ? `Double to ${posName(fpos)}` : `${bip.kind === 'ground' ? 'Ground-ball single' : 'Single'} to ${posName(fpos)}`;
    // existing runners
    const scoreFrom2 = hit >= 2 ? true : rnd(g) < (g.outs === 2 ? 0.92 : 0.6), scoreFrom1 = hit >= 3 ? true : hit === 2 ? rnd(g) < (g.outs === 2 ? 0.8 : 0.45) : false;
    const toHome2 = scoreFrom2 && B[1], mustThrowHome = (B[1] && scoreFrom2 && hit === 1) || (B[0] && scoreFrom1 && hit === 2);
    let cutOff = null;
    if (userPitching(g) && choice === 'H' && mustThrowHome) {
      const runner = hit === 1 ? B[1] : B[0], rt = (hit === 1 ? 2.9 : 5.0) * 1 + 1.2 - 0.5 * runner.speed + 0.5;
      const tt = tF + throwT(throwFrom, HOME);
      cutOff = tt < rt ? 'out' : 'safe';
    } else if (userPitching(g) && choice === '3') cutOff = 'hold';
    if (B[2]) keep(3, 4);
    if (B[1]) { if (cutOff === 'out' && hit === 1) { keep(2, 0); outs++; text += ', runner thrown out at the plate!'; } else if (cutOff === 'hold') keep(2, 3); else keep(2, scoreFrom2 || hit >= 2 ? 4 : 3); }
    if (B[0]) { if (cutOff === 'out' && hit === 2) { keep(1, 0); outs++; text += ', runner thrown out at the plate!'; } else keep(1, hit >= 3 ? 4 : hit === 2 ? (scoreFrom1 && cutOff !== 'hold' ? 4 : 3) : (cutOff === 'hold' ? 2 : (rnd(g) < 0.2 && g.outs < 2 ? 3 : 2))); }
    if (stretchTo) {
      const tRun = runTime(b, stretchTo) , tThrow = tF + throwT(throwFrom, bag(stretchTo)) + 0.3;
      if (tRun < tThrow + 0.5 && rnd(g) < 0.95) { keep(0, stretchTo); text += `, and he stretches it into a ${stretchTo === 2 ? 'double' : 'triple'}!`; hit = stretchTo; }
      else { keep(0, 0); outs++; text += `... thrown out trying to stretch it!`; hit = 0; }
      anim(bip, throwFrom, bag(stretchTo), tF);
    } else { keep(0, hit); anim(bip, throwFrom, bag(Math.min(3, hit + 1)), tF); }
    if (hit) { g.stat[bt].h++; }
  }
  // apply moves
  const nb = [null, null, null]; let runs = 0;
  for (const m of moves) { const who = m.from === 0 ? b : B[m.from - 1]; if (m.to === 0) continue; if (m.to === 4) { runs++; continue; } nb[m.to - 1] = who; }
  // runner anim
  bip.anim.run = moves.map((m) => ({ who: m.from, to: m.to, t0: 0.3 + (m.from === 0 ? 0 : 0.1), t1: 0.3 + 1.4 * Math.max(1, Math.abs((m.to === 0 ? m.from + 1 : m.to) - m.from)) + 0.8 }));
  bip.anim.dur = Math.max(bip.anim.dur, 3.4);
  g.outs += outs;
  g.bases = nb; g.score[bt] += runs; g.runsThis += runs; g.byInning[bt][g.inning - 1] = (g.byInning[bt][g.inning - 1] || 0) + runs;
  g.last = text + (runs ? ` ${runs} run${runs > 1 ? 's' : ''} score${runs === 1 ? 's' : ''}!` : '');
  if (banr) banner(g, ...banr); else if (hit >= 1) banner(g, hit === 1 ? 'SINGLE' : hit === 2 ? 'DOUBLE' : 'TRIPLE', b.name, bt === 'U' ? 'good' : 'bad');
  else if (outs) banner(g, 'OUT', text, bt === 'U' ? 'bad' : 'good');
  if (runs) { sfx(g, 'run'); g.ev.push({ k: 'runs', n: runs, team: bt }); }
  bip.done = { outs, runs, hit, text };
  g.order[bt]++; g.phase = 'bip'; g.timer = 0; g.bt = 0; g.bipDone = true;
  if (g.outs >= 3) g.endHalfAfterBip = true;
  if (g.half === 'bot' && g.inning >= g.innings && g.score.C > g.score.U) g.walkoff = true;
}
function anim(bip, from, to, t0) { bip.anim.ball.push({ t0, t1: t0 + dist(from, to) / 88 + 0.3, from, to, arc: 6 }); bip.anim.dur = Math.max(bip.anim.dur, t0 + dist(from, to) / 88 + 1.2); }

/* ------------------------------------ outs / walks / innings ------------------------------------ */
function out(g, n, atBatEnds = true, steal = false) {
  const bt = batTeam(g); g.outs += n; sfx(g, 'out');
  if (atBatEnds && !steal) g.order[bt]++;
  if (g.outs >= 3) return endHalf(g);
  if (steal) { g.phase = 'result'; g.timer = 1.0; return; }
  g.phase = 'result'; g.timer = 1.1; g.nextAB = true;
}
function walk(g) {
  const bt = batTeam(g), b = g.batter, B = g.bases; let runs = 0;
  if (B[0] && B[1] && B[2]) { runs++; g.bases = [b, B[0], B[1]]; }
  else if (B[0] && B[1]) g.bases = [b, B[0], B[1]];
  else if (B[0]) g.bases = [b, B[0], B[2]];
  else g.bases = [b, B[1], B[2]];
  g.score[bt] += runs; g.byInning[bt][g.inning - 1] = (g.byInning[bt][g.inning - 1] || 0) + runs; g.runsThis += runs;
  g.order[bt]++; g.last = runs ? 'Ball four. Run forced in!' : 'Ball four'; if (runs) g.ev.push({ k: 'runs', n: runs, team: bt });
  g.phase = 'result'; g.timer = 1.0; g.nextAB = true;
  if (g.half === 'bot' && g.inning >= g.innings && g.score.C > g.score.U) g.walkoff = true;
}
function endHalf(g) {
  g.phase = 'between'; g.timer = 2.0; g.bases = [null, null, null]; g.steal = false;
  const wasTop = g.half === 'top';
  const lastInn = g.inning >= g.innings;
  if (wasTop && lastInn && g.score.C > g.score.U) { g.phase = 'between'; g.afterBetween = () => finish(g); return banner(g, 'END OF TOP', 'Home team leads, game over', 'info'); }
  if (!wasTop && lastInn && g.score.U !== g.score.C) { g.afterBetween = () => finish(g); return banner(g, 'GAME OVER', '', 'info'); }
  if (!wasTop && g.inning >= g.innings + 3) { g.afterBetween = () => finish(g); return banner(g, 'GAME OVER', 'Tied after extra innings', 'info'); }
  g.afterBetween = () => { if (wasTop) g.half = 'bot'; else { g.half = 'top'; g.inning++; } g.outs = 0; g.runsThis = 0; startAtBat(g); };
  banner(g, wasTop ? `END OF ${g.inning}${g.inning === 1 ? 'ST' : g.inning === 2 ? 'ND' : g.inning === 3 ? 'RD' : 'TH'}` : 'MIDDLE', `${g.names.U} ${g.score.U} · ${g.names.C} ${g.score.C}`, 'info');
}
function finish(g) { g.over = true; g.phase = 'over'; g.winner = g.score.U > g.score.C ? 'U' : g.score.C > g.score.U ? 'C' : null; g.ev.push({ k: 'over', winner: g.winner }); }

/* ------------------------------------ main step ------------------------------------ */
export function step(g, dt) {
  if (g.over) return;
  switch (g.phase) {
    case 'ready': {
      if (userPitching(g)) break; // the player starts the pitch
      g.timer -= dt; if (g.timer <= 0) { const c = cpuPitchChoice(g); throwPitch(g, c.type, c.tx, c.ty, c.err); }
      break;
    }
    case 'pitch': {
      const p = g.pitch; p.t += dt;
      if (p.t >= p.dur + 0.14) resolvePitch(g);
      break;
    }
    case 'result': g.timer -= dt; if (g.timer <= 0) { if (g.nextAB) { g.nextAB = false; startAtBat(g); } else { g.phase = 'ready'; g.timer = 1.0; g.pitch = null; } } break;
    case 'bip': {
      if (g.pending) { g.pending.t += dt; if (g.pending.t >= g.pending.dl) { const pd = g.pending; g.pending = null; finishBip(g, pd.kind === 'throw' ? null : null, pd); } break; }
      g.bt += dt;
      if (g.bipDone && g.bt >= g.bip.anim.dur) {
        g.bipDone = false;
        if (g.walkoff) { g.walkoff = false; g.endHalfAfterBip = false; g.phase = 'between'; g.timer = 1.5; g.afterBetween = () => finish(g); banner(g, 'WALK-OFF!', `${g.names.C} win`, 'bad'); break; }
        if (g.endHalfAfterBip) { g.endHalfAfterBip = false; endHalf(g); break; }
        startAtBat(g);
      }
      break;
    }
    case 'between': g.timer -= dt; if (g.timer <= 0) { const a = g.afterBetween; g.afterBetween = null; if (a) a(); } break;
    default: break;
  }
}
export function autoStep(g, dt) {
  if (g.auto && g.phase === 'ready') { g.timer -= 0; }
  step(g, dt);
}
export function playBotD(g, maxSteps = 400000) { g.auto = true; let n = 0; while (!g.over && n++ < maxSteps) step(g, 1 / 30); return g; }
export const countText = (g) => `${g.balls}-${g.strikes}`;
export const inningText = (g) => `${g.half === 'top' ? '▲' : '▼'} ${g.inning}`;
