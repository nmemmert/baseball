import {
  newGame, startGame, pitch, aiPrePA, aiOffense, aiDefense, autoHalf, autoPlay, changePitcher, pinchHit, pinchRun,
  battingTeam, fieldingTeam, currentBatter, onDeck, fatigue, winProb, platoonEdge, formTag, levelFor, pack, unpack, reviveGame, attachRng,
} from './engine.js';
import * as L from './league.js';
import { saveRaw, loadRaw, clearSave } from './store.js';
import { fx, react, prefs, initHaptics } from './feedback.js';

const app = { settings: { sound: true, haptics: true, level: 1 }, tab: 'game', lg: null, g: null, kind: null };
const ui = { swing: 'normal', approach: 'normal', call: '', shift: false, infieldIn: false, depth: 'normal', box: false, sel: null, newsOpen: false };
const $ = (id) => document.getElementById(id);
const LEVELS = ['Rookie', 'Pro', 'All-Star'];

// ---------- persistence ----------
function persist() { saveRaw(pack({ lg: app.lg, g: app.g, kind: app.kind, settings: app.settings })); }
function boot() {
  const raw = loadRaw();
  if (raw) {
    try {
      const s = unpack(raw);
      Object.assign(app, { lg: s.lg, g: s.g, kind: s.kind, settings: { ...app.settings, ...s.settings } });
      attachRng(app.lg); reviveGame(app.g);
    } catch { app.lg = null; app.g = null; app.kind = null; }
  }
  if (!app.lg) app.lg = L.createLeague();
  syncPrefs();
  const m = /seed=(\d+)/.exec(location.hash);
  if (m) {
    if (!app.g || app.g.over || app.kind === 'exhibit') startExhibition(Number(m[1]));
    else toast('Finish your current season game to open the shared game.');
    history.replaceState(null, '', location.pathname);
  }
}
const syncPrefs = () => { prefs.sound = app.settings.sound; prefs.haptics = app.settings.haptics; };

// ---------- helpers ----------
const mine = () => (app.kind === 'exhibit' && app.g ? app.g.home : app.kind === 'season' && app.g ? L.userTeam(app.lg) : L.userTeam(app.lg));
const opp = () => (app.g.home === mine() ? app.g.away : app.g.home);
const userBats = () => battingTeam(app.g) === mine();
const abbr = (t) => t.nick.slice(0, 3).toUpperCase();
const ip = (s) => `${Math.floor(s.outs / 3)}.${s.outs % 3}`;
const avg = (s) => (s.ab ? (s.h / s.ab).toFixed(3).replace(/^0/, '') : '.---');
const ra9 = (s) => (s.outs ? ((s.r * 27) / s.outs).toFixed(2) : '–');
let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2600); }

function findPlayer(uid) {
  const teams = [...app.lg.teams];
  if (app.g) teams.push(app.g.home, app.g.away);
  for (const t of teams) for (const p of [...t.batters, ...t.sp, ...t.rp]) if (p.uid === uid) return { p, t };
  return null;
}
const tagHtml = (p, vs) => {
  let h = '';
  const f = formTag(p);
  if (f === 'hot') h += '<span class="tag hot">🔥 hot</span>';
  if (f === 'cold') h += '<span class="tag cold">🧊 cold</span>';
  if (p.inj > 0) h += `<span class="tag inj">hurt ${p.inj}d</span>`;
  if (vs && p.type === 'bat') {
    const e = platoonEdge(p, vs);
    if (e > 0) h += '<span class="tag edge">platoon edge</span>';
    if (e < 0) h += '<span class="tag dis">same-side</span>';
  }
  return h;
};
const pl = (p, vs) => `<span class="player" data-act="card" data-uid="${p.uid}">${p.name}</span>${tagHtml(p, vs)}`;
const ratings = (p) => (p.type === 'bat' ? `CON ${p.contact} · PWR ${p.power} · EYE ${p.eye} · SPD ${p.speed}` : `STF ${p.stuff} · CTL ${p.control} · STA ${p.stamina}`);
const batLine = (s) => `${s.h}-${s.ab}${s.hr ? `, ${s.hr} HR` : ''}${s.rbi ? `, ${s.rbi} RBI` : ''}${s.bb ? `, ${s.bb} BB` : ''}${s.k ? `, ${s.k} K` : ''}`;
const pitLine = (s) => `${ip(s)} IP, ${s.h} H, ${s.r} R, ${s.bb} BB, ${s.k} K (${s.pitches} p)`;
const restLabel = (p) => (p.debt > 0.55 ? 'gassed' : p.debt > 0.2 ? 'tired' : 'rested');

// ---------- game flow ----------
function resetCalls() { Object.assign(ui, { swing: 'normal', approach: 'normal', call: '', shift: false, infieldIn: false, depth: 'normal' }); }

function startSeasonGame() {
  const ng = L.nextGame(app.lg);
  if (!ng) return;
  app.g = startGame(ng.home, ng.away, { seed: Math.floor(Math.random() * 2 ** 31), level: app.settings.level, user: L.userTeam(app.lg) });
  app.kind = 'season'; resetCalls(); app.tab = 'game';
  app.g.log.push(`${ng.label}: ${ng.away.name} at ${ng.home.name}. Play ball!`);
  persist(); render();
}
function startExhibition(seed) {
  if (app.g && !app.g.over && app.kind === 'season' && !confirm('Abandon your current season game?')) return;
  const s = seed || Math.floor(100000 + Math.random() * 899999);
  app.g = newGame(s, app.settings.level); app.g.user = app.g.home; app.kind = 'exhibit';
  resetCalls(); app.tab = 'game';
  app.g.log.push(`Exhibition #${s}. You manage ${app.g.home.name}. Play ball!`);
  persist(); render();
}

function callOk(call) {
  const g = app.g, [b1, b2, b3] = g.bases;
  if (userBats()) {
    if (call === 'steal') return (b1 && !b2) || (b2 && !b3);
    if (call === 'bunt') return g.outs < 2 && (b1 || b2 || b3) && g.pa.strikes < 2;
    if (call === 'hitrun') return b1 && !b2 && g.outs < 2;
    return call === '' || call === 'take';
  }
  if (call === 'pitchout') return !!(b1 || b2) && g.pa.balls < 3;
  return call === '' || call === 'ibb';
}

function doPitch(oneShots = true) {
  const g = app.g;
  aiPrePA(g, [opp()]);
  if (!callOk(ui.call)) ui.call = '';
  const c = oneShots ? ui.call : '';
  const bats = userBats();
  const orders = {
    off: bats ? { swing: ui.swing, take: c === 'take', steal: c === 'steal', bunt: c === 'bunt', hitRun: c === 'hitrun' } : aiOffense(g, levelFor(g, battingTeam(g))),
    def: bats ? aiDefense(g, levelFor(g, fieldingTeam(g))) : { approach: ui.approach, ibb: c === 'ibb', pitchout: c === 'pitchout', infieldIn: ui.infieldIn && !!g.bases[2], shift: ui.shift, depth: ui.depth },
  };
  const mark = g.log.length, half = g.half;
  const ev = pitch(g, orders);
  g.mark = mark;
  ui.call = '';
  if (g.pa.pitches === 0) { ui.swing = 'normal'; ui.approach = 'normal'; }
  if (g.half !== half) { ui.infieldIn = false; }
  return ev;
}

function afterPlay(ev) {
  const g = app.g;
  if (ev) react(ev);
  if (g.over) {
    const won = (g.winner === 'home') === (g.home === mine());
    setTimeout(won ? fx.win : fx.lose, 350);
  }
  persist(); render();
}

function throwPitch() { if (app.g && !app.g.over) afterPlay(doPitch(true)); }
function autoAtBat() {
  const g = app.g; if (!g || g.over) return;
  let ev, n = 0;
  do { ev = doPitch(n === 0); n++; } while (!g.over && g.pa.pitches > 0 && n < 30);
  afterPlay(ev);
}
function autopilot(kind) {
  const g = app.g; if (!g || g.over) return;
  g.mark = g.log.length;
  const ctl = [mine(), opp()];
  if (kind === 'half') autoHalf(g, ctl); else autoPlay(g, ctl);
  ui.call = '';
  afterPlay(null);
}

function finishGame() {
  const g = app.g;
  if (!g || !g.over) return;
  const you = mine() === g.home ? g.home.runs : g.away.runs, them = mine() === g.home ? g.away.runs : g.home.runs;
  if (app.kind === 'season') {
    L.completeDay(app.lg, g);
    toast(`${you > them ? 'Win' : 'Loss'} ${you}-${them}. ${L.userTeam(app.lg).w}-${L.userTeam(app.lg).l}`);
    app.tab = 'season';
  }
  app.g = null; app.kind = null;
  persist(); render();
}

// ---------- rendering: game ----------
function lineScore() {
  const g = app.g, n = Math.max(9, g.inning);
  const head = Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join('');
  const row = (t, top) => {
    const live = !g.over && ((top && g.half === 'top') || (!top && g.half === 'bot'));
    const cells = Array.from({ length: n }, (_, i) => {
      const v = t.inningRuns[i];
      return `<td>${v === undefined ? (live && g.inning === i + 1 ? '·' : '') : v}</td>`;
    }).join('');
    return `<tr class="${t === mine() ? 'me' : ''}"><td>${live ? '▸ ' : ''}${t.nick}</td>${cells}<td><b>${t.runs}</b></td><td>${t.hits}</td></tr>`;
  };
  return `<div class="scroll"><table><tr><th></th>${head}<th>R</th><th>H</th></tr>${row(g.away, true)}${row(g.home, false)}</table></div>`;
}

function fieldSvg() {
  const g = app.g;
  const base = (i, x, y) => `<rect x="${x - 12}" y="${y - 12}" width="24" height="24" transform="rotate(45 ${x} ${y})" fill="${g.bases[i] ? '#f2c14e' : '#0c1d13'}" stroke="#9db8a5"/>`;
  const nm = g.bases.map((r) => (r ? r.name.split(' ').slice(-1)[0] : ''));
  const t = (x, y, s) => `<text x="${x}" y="${y}" fill="#eef3ea" font-size="11" text-anchor="middle">${s}</text>`;
  return `<svg viewBox="0 0 280 190"><path d="M140 175 L40 95 L140 15 L240 95 Z" fill="#1f4d2f" stroke="#2b5a3c"/>${base(0, 200, 100)}${base(1, 140, 40)}${base(2, 80, 100)}<path d="M140 175 l-10 -10 l10 -10 l10 10 z" fill="#eef3ea"/>${t(200, 128, nm[0])}${t(140, 24, nm[1])}${t(80, 128, nm[2])}</svg>`;
}

const dots = (n, max, cls) => `<span class="dots">${Array.from({ length: max }, (_, i) => `<i class="dot ${cls} ${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
const SEQ = { B: 'B', C: 'K', S: 'S', F: 'F', X: '●', H: 'HBP', '-': '' };

function matchup() {
  const g = app.g, b = currentBatter(g), team = fieldingTeam(g), p = team.pitcher, f = fatigue(p);
  const wpHome = winProb(g), wp = g.home === mine() ? wpHome : 1 - wpHome;
  const ctx = `${g.over ? 'Final' : `${g.half === 'top' ? 'Top' : 'Bottom'} ${g.inning}`}`;
  return `<h2>${ctx}</h2>
    <div class="row"><span class="label">Your win chance</span><div class="wp"><i style="width:${(wp * 100).toFixed(0)}%"></i></div><b>${Math.round(wp * 100)}%</b></div>
    ${fieldSvg()}
    <div class="count"><span>B ${dots(g.pa.balls, 3, 'b')}</span><span>S ${dots(g.pa.strikes, 2, 's')}</span><span>O ${dots(g.outs, 2, 'o')}</span></div>
    <div class="seq">${g.pa.seq.map((c) => SEQ[c]).join(' ') || '&nbsp;'}</div>
    <div class="row"><span class="label">At bat</span> ${pl(b, p)}<small>${b.pos} · bats ${b.hand} · ${ratings(b)}</small></div>
    <div class="row"><small>Today: ${batLine(b.stats)} · On deck: ${onDeck(g).name}</small></div>
    <div class="row"><span class="label">Pitching</span> ${pl(p)}<small>throws ${p.hand} · ${ratings(p)}</small></div>
    <div class="row"><small>${pitLine(p.stats)}</small></div>
    <div class="row"><span class="label">Arm</span><div class="meter ${f > 0.5 ? 'hot' : ''}"><i style="width:${Math.min(100, (p.stats.pitches / (p.stamina * (1 - 0.45 * (p.debt || 0)) * 1.25)) * 100)}%"></i></div><small>${f > 0.6 ? 'gassed' : f > 0.2 ? 'tiring' : 'fresh'}${p.debt > 0.25 ? ' · started tired' : ''}</small></div>`;
}

const seg = (name, cur, opts, dis = {}) => `<div class="seg">${opts.map(([v, t]) => `<label><input type="radio" name="${name}" value="${v}" ${cur === v ? 'checked' : ''} ${dis[v] ? 'disabled' : ''} data-set="${name}"><span>${t}</span></label>`).join('')}</div>`;
const chk = (name, on, text, dis) => `<label class="chk"><input type="checkbox" data-toggle="${name}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}> ${text}</label>`;
const HINTS = {
  '': '', take: 'Take: the batter lets the next pitch go by (unless it is strike three).',
  steal: 'Steal: the runner goes on the pitch. Faster runners and slower pitchers help.',
  bunt: 'Bunt: move runners up at the cost of an out — likeliest to work with weak hitters.',
  hitrun: 'Hit & run: runner on 1st goes, batter must swing. No double play, but a miss exposes the runner.',
  pitchout: 'Pitchout: a wasted ball that makes a steal very hard — but it adds a ball to the count.',
  ibb: 'Intentional walk: put the batter on first for free, to set up a double play or avoid a slugger.',
};

function ordersPanel() {
  const g = app.g, [b1, b2, b3] = g.bases;
  if (g.over) return `<div class="banner">${(g.winner === 'home') === (g.home === mine()) ? 'Victory!' : 'Defeat.'}<br>${g.away.name} ${g.away.runs}, ${g.home.name} ${g.home.runs}</div>`;
  if (!callOk(ui.call)) ui.call = '';
  if (userBats()) {
    const dis = { steal: !callOk('steal'), bunt: !callOk('bunt'), hitrun: !callOk('hitrun') };
    return `<h2>Offense — your orders</h2>
      <div class="group"><span class="label">Batter's approach</span>${seg('swing', ui.swing, [['patient', 'Work the count'], ['normal', 'Normal'], ['aggressive', 'Swing away']])}</div>
      <div class="group"><span class="label">Play call (this pitch)</span>${seg('call', ui.call, [['', 'None'], ['take', 'Take'], ['steal', 'Steal'], ['bunt', 'Bunt'], ['hitrun', 'Hit & run']], dis)}<div class="hint">${HINTS[ui.call]}</div></div>`;
  }
  const dis = { pitchout: !callOk('pitchout') };
  return `<h2>Defense — your orders</h2>
    <div class="group"><span class="label">Pitching approach</span>${seg('approach', ui.approach, [['nibble', 'Nibble'], ['normal', 'Normal'], ['attack', 'Attack zone']])}</div>
    <div class="group"><span class="label">Pitch call</span>${seg('call', ui.call, [['', 'None'], ['pitchout', 'Pitchout'], ['ibb', 'Walk him']], dis)}<div class="hint">${HINTS[ui.call]}</div></div>
    <div class="group"><span class="label">Alignment</span><div>${chk('shift', ui.shift, 'Shift', false)}${chk('infieldIn', ui.infieldIn, 'Infield in', !b3)}</div>
      ${seg('depth', ui.depth, [['shallow', 'Shallow OF'], ['normal', 'Normal OF'], ['deep', 'Deep OF']])}
      <div class="hint">Shift cuts singles from power hitters; deep OF trims extra-base hits but lets runners tag up.</div></div>`;
}

function bench() {
  const g = app.g, t = mine(), bats = userBats();
  const vs = opp().pitcher;
  const benchRows = t.bench.map((p) => {
    const act = [];
    if (bats && !g.over) {
      act.push(`<button class="sm" data-act="ph" data-id="${p.id}">Pinch hit</button>`);
      g.bases.forEach((r, i) => { if (r) act.push(`<button class="sm" data-act="pr" data-base="${i}" data-id="${p.id}">Run ${['1st', '2nd', '3rd'][i]}</button>`); });
    }
    return `<tr><td>${pl(p, vs)}</td><td>${p.pos}</td><td><small>${p.hand} · ${ratings(p)}</small></td><td>${act.join(' ')}</td></tr>`;
  }).join('');
  const penRows = t.bullpen.map((p) => `<tr><td>${pl(p)}</td><td>${p.pos}</td><td><small>${p.hand}HP · ${ratings(p)} · ${restLabel(p)}</small></td><td>${!bats && !g.over ? `<button class="sm" data-act="pitch" data-id="${p.id}">Bring in</button>` : ''}</td></tr>`).join('');
  const lineup = t.lineup.map((p, i) => `<tr class="${bats && i === t.batIdx ? 'me' : ''}"><td>${i + 1}. ${pl(p, vs)}</td><td>${p.pos}</td><td><small>${batLine(p.stats)}</small></td></tr>`).join('');
  return `<h2>Your club</h2><div class="scroll"><table>${lineup}</table></div>
    <h3>Bench ${bats ? '' : '<small>(hit & run on offense)</small>'}</h3><div class="scroll"><table>${benchRows || '<tr><td>Empty</td></tr>'}</table></div>
    <h3>Bullpen ${bats ? '<small>(change pitchers when you take the field)</small>' : ''}</h3><div class="scroll"><table>${penRows || '<tr><td>Empty</td></tr>'}</table></div>`;
}

function boxScore() {
  const g = app.g;
  const one = (t) => {
    const bats = [...t.lineup, ...t.usedBatters.filter((b) => !t.lineup.includes(b))];
    const ps = [...t.usedPitchers, t.pitcher];
    return `<h3>${t.name}</h3><table>${bats.map((p) => `<tr><td>${p.name}</td><td>${p.pos}</td><td><small>${batLine(p.stats)}</small></td></tr>`).join('')}</table>
      <table style="margin-top:6px">${ps.map((p) => `<tr><td>${p.name}</td><td><small>${pitLine(p.stats)}</small></td></tr>`).join('')}</table>`;
  };
  return `<details id="box" ${ui.box ? 'open' : ''}><summary>Box score</summary>${one(g.away)}${one(g.home)}</details>`;
}

function logPanel() {
  const g = app.g, fresh = g.log.length - (g.mark ?? g.log.length);
  return `<h2>Play by play</h2><div class="log">${[...g.log].slice(-45).reverse().map((l, i) => `<p class="${i < fresh ? 'new' : ''}">${l}</p>`).join('')}</div>`;
}

function renderGame() {
  if (!app.g) {
    const ng = app.lg.phase === 'done' ? null : L.nextGame(app.lg);
    return `<section class="empty"><h2>No game in progress</h2>
      <p>${ng ? `Next up: <b>${ng.away.nick} at ${ng.home.nick}</b> — ${ng.label}` : app.lg.phase === 'done' ? 'The season is over.' : 'Your team has no game today.'}</p>
      <div class="row">${ng ? '<button class="primary" data-act="playnext">Manage next game</button>' : ''}<button data-act="exhibit">Exhibition game</button></div>
      <p class="mute">Season games count in the standings. Exhibition games are one-offs you can share.</p></section>`;
  }
  return `<section>${lineScore()}</section>
    <div class="cols"><section>${matchup()}</section><section>${ordersPanel()}
      ${app.g.over ? '' : `<div class="group"><span class="label">Autopilot</span><div class="row"><button class="sm" data-act="autohalf">Rest of half-inning</button><button class="sm" data-act="autogame">Finish game</button></div></div>`}</section></div>
    <div class="cols"><section>${bench()}</section><section>${logPanel()}</section></div>
    <section>${boxScore()}</section>`;
}

// ---------- rendering: lineup ----------
function renderLineup() {
  const t = L.userTeam(app.lg);
  const note = app.g && app.kind === 'season' ? '<p class="hint">A game is in progress — changes apply to your next game.</p>' : '';
  const row = (p, i, kind, extra = '') => `<tr class="${ui.sel === `${kind}${i}` ? 'sel' : ''} ${p.inj > 0 ? 'dim' : ''}" data-act="swap" data-kind="${kind}" data-i="${i}"><td>${extra}${p.name}${tagHtml(p)}</td><td>${p.pos}</td><td><small>${p.hand} · ${ratings(p)}</small></td></tr>`;
  const bat = t.batters.map((p, i) => (i === 9 ? '<tr><th colspan="3">Bench</th></tr>' : '') + row(p, i, 'b', i < 9 ? `${i + 1}. ` : '')).join('');
  const sp = t.sp.map((p, i) => row(p, i, 's', i === t.rotIdx % 5 ? '▶ ' : `${i + 1}. `) .replace('</tr>', `<td><small>${restLabel(p)}</small></td></tr>`)).join('');
  const rp = t.rp.map((p) => `<tr class="${p.inj > 0 ? 'dim' : ''}"><td>${p.name}${tagHtml(p)}</td><td>${p.pos}</td><td><small>${p.hand} · ${ratings(p)} · ${restLabel(p)}</small></td></tr>`).join('');
  return `<section><h2>Batting order</h2>${note}<p class="hint">Tap a player, then tap another to swap them. The first nine bat in order; hurt players are replaced automatically.</p><div class="scroll"><table>${bat}</table></div></section>
    <div class="cols"><section><h2>Starting rotation</h2><p class="hint">▶ is your next starter. Tap two to swap.</p><div class="scroll"><table>${sp}</table></div></section>
    <section><h2>Bullpen</h2><p class="hint">Relievers used yesterday are tired today — rest them or burn them.</p><div class="scroll"><table>${rp}</table></div></section></div>`;
}

// ---------- rendering: season ----------
function renderSeason() {
  const lg = app.lg, t = L.userTeam(lg), st = L.standings(lg), rank = st.indexOf(t) + 1;
  const ng = lg.phase === 'done' ? null : L.nextGame(lg);
  let status;
  if (lg.phase === 'done') {
    status = `<div class="banner">${lg.champion === lg.userId ? '🏆 You are the champions!' : `${lg.teams[lg.champion].name} won the title.`}</div>
      <div class="row" style="justify-content:center"><button class="primary" data-act="newseason">Start season ${lg.season + 1}</button></div>`;
  } else if (app.g && app.kind === 'season') {
    status = `<p>Game in progress.</p><div class="row"><button class="primary" data-act="resume">Resume game</button></div>`;
  } else if (ng) {
    const home = ng.home === t;
    status = `<p><b>${ng.label}</b><br>${home ? 'vs' : '@'} <b>${(home ? ng.away : ng.home).name}</b> <small>(${home ? 'home' : 'away'})</small></p>
      <div class="row"><button class="primary" data-act="playnext">Manage game</button><button data-act="simgame">Sim game</button><button class="ghost" data-act="simend">Sim to end of season</button></div>`;
  } else {
    status = `<p>${L.userEliminated(lg) ? 'You are out of the playoffs.' : 'Waiting on the other series.'}</p><div class="row"><button class="primary" data-act="advance">Advance a day</button><button class="ghost" data-act="simend">Sim to end of season</button></div>`;
  }
  const rows = st.map((x, i) => `<tr class="${x === t ? 'me' : ''} ${i === 3 ? 'cut' : ''}"><td>${i + 1}. ${x.name}</td><td>${x.w}</td><td>${x.l}</td><td>${x.rs - x.ra > 0 ? '+' : ''}${x.rs - x.ra}</td></tr>`).join('');
  let bracket = '';
  if (lg.playoffs) {
    const sr = (s, label) => `<tr><td>${label}</td><td>${lg.teams[s.a].nick} ${s.wa}</td><td>${lg.teams[s.b].nick} ${s.wb}</td><td>${s.done ? '✔' : ''}</td></tr>`;
    bracket = `<section><h2>Playoffs (best of 3)</h2><table>${lg.playoffs.semis.map((s, i) => sr(s, `Semi ${i + 1}`)).join('')}${lg.playoffs.final ? sr(lg.playoffs.final, 'Final') : ''}</table></section>`;
  }
  const res = lg.results.slice(0, 8).map((r) => `<tr><td>${r.away}</td><td>${r.ar}</td><td>${r.home}</td><td>${r.hr}</td></tr>`).join('');
  return `<section><h2>Season ${lg.season} · ${t.w}-${t.l} · ${lg.phase === 'regular' ? `${rank}${['st', 'nd', 'rd'][rank - 1] || 'th'} place` : lg.phase === 'playoffs' ? 'playoffs' : 'complete'}</h2>${status}</section>
    ${bracket}
    <div class="cols"><section><h2>Standings <small>(top 4 make the playoffs)</small></h2><div class="scroll"><table><tr><th></th><th>W</th><th>L</th><th>+/-</th></tr>${rows}</table></div></section>
    <section><h2>Latest results</h2><div class="scroll"><table>${res || '<tr><td>No games yet</td></tr>'}</table></div>
      <h2 style="margin-top:12px">League news</h2><div class="news">${lg.news.slice(0, 8).map((n) => `<p style="margin:3px 0">${n}</p>`).join('') || 'Quiet so far.'}</div></section></div>`;
}

// ---------- rendering: stats ----------
function renderStats() {
  const lg = app.lg, Lead = L.leaders(lg), t = L.userTeam(lg);
  const block = (title, rows) => `<div><h3>${title}</h3><table>${rows.map((x) => `<tr><td><span class="player" data-act="card" data-uid="${x.p.uid}">${x.p.name}</span> <small>${abbr(x.t)}</small></td><td><b>${x.v}</b></td></tr>`).join('') || '<tr><td>—</td></tr>'}</table></div>`;
  const bat = t.batters.map((p) => `<tr><td>${pl(p)}</td><td>${p.season.g}</td><td>${avg(p.season)}</td><td>${p.season.hr}</td><td>${p.season.rbi}</td><td>${p.season.bb}</td><td>${p.season.k}</td></tr>`).join('');
  const pit = [...t.sp, ...t.rp].map((p) => `<tr><td>${pl(p)}</td><td>${p.season.g}</td><td>${ip(p.season)}</td><td>${ra9(p.season)}</td><td>${p.season.k}</td><td>${p.season.bb}</td></tr>`).join('');
  return `<section><h2>League leaders</h2><div class="cols">${block('Batting avg', Lead.AVG)}${block('Home runs', Lead.HR)}${block('RBI', Lead.RBI)}${block('Runs allowed / 9', Lead.RA9)}${block('Strikeouts (P)', Lead.K)}</div></section>
    <section><h2>${t.name} — batting</h2><div class="scroll"><table><tr><th></th><th>G</th><th>AVG</th><th>HR</th><th>RBI</th><th>BB</th><th>K</th></tr>${bat}</table></div></section>
    <section><h2>${t.name} — pitching</h2><div class="scroll"><table><tr><th></th><th>G</th><th>IP</th><th>RA9</th><th>K</th><th>BB</th></tr>${pit}</table></div></section>`;
}

// ---------- rendering: more ----------
function renderMore() {
  const s = app.settings, g = app.g;
  const exSeed = g && app.kind === 'exhibit' ? g.seed : null;
  return `<section><h2>Settings</h2>
      <div class="group"><span class="label">Opposing manager</span>${seg('level', String(s.level), [['0', 'Rookie'], ['1', 'Pro'], ['2', 'All-Star']])}<div class="hint">Applies to your next game. Rookies leave tired arms in; All-Stars play the platoons, use their closer and call hit-and-runs.</div></div>
      <div class="group">${chk('sound', s.sound, 'Sound effects', false)}${chk('haptics', s.haptics, 'Haptics', false)}</div></section>
    <section><h2>Exhibition</h2><p class="mute">A one-off game with a random matchup. Share the link and a friend gets the same two teams to beat your score.</p>
      <div class="row"><button class="primary" data-act="exhibit">New exhibition game</button>${exSeed ? '<button data-act="share">Share this game</button>' : ''}</div>
      ${exSeed ? `<small>Game code #${exSeed}</small>` : ''}</section>
    <section><h2>How to play</h2><ul class="mute" style="padding-left:18px;margin:0">
      <li>You don't swing or throw — you make the calls. Tap <b>Next pitch</b> to play one pitch with your orders, or <b>Auto at-bat</b>.</li>
      <li>Watch the pitcher's arm. Past his limit his stuff and control fade fast — go to the bullpen before it costs you.</li>
      <li>Lefty vs. lefty favours the pitcher; opposite sides favour the hitter. Check the tags.</li>
      <li>In a season, tired relievers and injuries carry from game to game. Top 4 make the playoffs.</li></ul></section>
    <section><h2>Data</h2><div class="row"><button class="ghost" data-act="reset">Reset all progress</button></div></section>`;
}

// ---------- shell ----------
function renderBar() {
  const g = app.g, bar = $('bar');
  let h = '';
  if (app.tab === 'game' && g) h = g.over ? '<button class="primary" data-act="finish">Finish game</button>' : '<button data-act="atbat">Auto at-bat</button><button class="primary" data-act="pitch1">Next pitch ▶</button>';
  bar.innerHTML = h;
  document.body.classList.toggle('nobar', !h);
}

function render() {
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.tab === app.tab);
  const views = { game: renderGame, lineup: renderLineup, season: renderSeason, stats: renderStats, more: renderMore };
  $('view').innerHTML = views[app.tab]();
  renderBar();
}

function showCard(uid) {
  const f = findPlayer(uid); if (!f) return;
  const { p, t } = f, s = p.season, d = $('card');
  const bars = (items) => `<div class="bars">${items.map(([k, v]) => `<span class="label">${k}</span><div class="meter ${v >= 70 ? 'good' : ''}"><i style="width:${v}%"></i></div><b>${v}</b>`).join('')}</div>`;
  const rb = p.type === 'bat' ? bars([['CON', p.contact], ['PWR', p.power], ['EYE', p.eye], ['SPD', p.speed]]) : bars([['STF', p.stuff], ['CTL', p.control], ['STA', Math.min(100, Math.round(p.stamina))]]);
  const season = p.type === 'bat' ? `${avg(s)} AVG · ${s.hr} HR · ${s.rbi} RBI · ${s.bb} BB · ${s.k} K (${s.g} G)` : `${ip(s)} IP · ${ra9(s)} RA9 · ${s.k} K · ${s.bb} BB (${s.g} G)`;
  const today = p.stats && (p.type === 'bat' ? p.stats.ab + p.stats.bb > 0 : p.stats.pitches > 0) ? `<p><small>Today: ${p.type === 'bat' ? batLine(p.stats) : pitLine(p.stats)}</small></p>` : '';
  d.innerHTML = `<h2 style="margin-top:0">${p.name}${tagHtml(p)}</h2>
    <p class="mute">${t.name} · ${p.pos} · age ${p.age} · ${p.type === 'bat' ? 'bats' : 'throws'} ${p.hand}${p.type === 'pit' ? ` · ${restLabel(p)}` : ''}</p>${rb}
    <p>Season: ${season}</p>${today}<div class="row" style="justify-content:flex-end"><button data-act="closecard">Close</button></div>`;
  if (!d.open) d.showModal();
}

async function shareLink() {
  const url = `${location.origin}${location.pathname}#seed=${app.g.seed}`;
  const text = `Beat my Skipper game #${app.g.seed}!`;
  try { if (navigator.share) { await navigator.share({ title: 'Skipper', text, url }); return; } } catch { return; }
  try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); }
}

// ---------- events ----------
function swapRows(kind, i) {
  const t = L.userTeam(app.lg), key = `${kind}${i}`;
  if (ui.sel === null) { ui.sel = key; render(); return; }
  if (ui.sel === key) { ui.sel = null; render(); return; }
  const k0 = ui.sel[0], i0 = Number(ui.sel.slice(1));
  if (k0 !== kind) { ui.sel = key; render(); return; }
  const arr = kind === 'b' ? t.batters : t.sp;
  [arr[i0], arr[i]] = [arr[i], arr[i0]];
  ui.sel = null; persist(); render();
}

document.addEventListener('click', (e) => {
  initHaptics();
  const tab = e.target.closest('[data-tab]');
  if (tab) { app.tab = tab.dataset.tab; ui.sel = null; render(); window.scrollTo(0, 0); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const g = app.g, id = Number(el.dataset.id);
  switch (el.dataset.act) {
    case 'card': showCard(el.dataset.uid); return;
    case 'closecard': $('card').close(); return;
    case 'pitch1': throwPitch(); return;
    case 'atbat': autoAtBat(); return;
    case 'autohalf': autopilot('half'); return;
    case 'autogame': if (confirm('Let the AI manage the rest of this game for you?')) autopilot('game'); return;
    case 'finish': finishGame(); return;
    case 'playnext': startSeasonGame(); return;
    case 'resume': app.tab = 'game'; render(); return;
    case 'exhibit': startExhibition(); return;
    case 'share': shareLink(); return;
    case 'swap': swapRows(el.dataset.kind, Number(el.dataset.i)); return;
    case 'simgame': { const r = L.simUserGame(app.lg); const t = L.userTeam(app.lg); persist(); if (r) toast(`${(r.winner === 'home') === (r.home === t) ? 'Win' : 'Loss'} ${r.away.nick} ${r.away.runs}, ${r.home.nick} ${r.home.runs}`); render(); return; }
    case 'advance': L.completeDay(app.lg, null); persist(); render(); return;
    case 'simend': if (confirm('Sim the rest of the season with the AI managing for you?')) { L.simToEnd(app.lg); persist(); render(); } return;
    case 'newseason': L.newSeason(app.lg); persist(); render(); return;
    case 'reset': if (confirm('Erase your season and start over?')) { clearSave(); app.g = null; app.kind = null; app.lg = L.createLeague(); persist(); render(); } return;
    case 'ph': if (g && pinchHit(g, mine(), id)) { persist(); render(); } return;
    case 'pr': if (g && pinchRun(g, mine(), Number(el.dataset.base), id)) { persist(); render(); } return;
    case 'pitch': if (g && changePitcher(g, mine(), id)) { persist(); render(); } return;
    default:
  }
});

document.addEventListener('change', (e) => {
  const s = e.target.dataset;
  if (s.set === 'level') { app.settings.level = Number(e.target.value); persist(); render(); return; }
  if (s.set) { ui[s.set] = e.target.value; render(); return; }
  if (s.toggle === 'sound' || s.toggle === 'haptics') {
    app.settings[s.toggle] = e.target.checked; syncPrefs(); persist();
    if (e.target.checked) { (s.toggle === 'sound' ? fx.hit : fx.tick)(); }
    return;
  }
  if (s.toggle) { ui[s.toggle] = e.target.checked; render(); }
});
document.addEventListener('toggle', (e) => { if (e.target.id === 'box') ui.box = e.target.open; }, true);
$('card').addEventListener('click', (e) => { if (e.target === $('card')) $('card').close(); });

boot();
if (app.g && !app.g.over) app.tab = 'game';
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
