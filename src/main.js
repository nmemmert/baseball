import { newGame, plateAppearance, aiOffense, aiDefense, changePitcher, pinchHit, pinchRun,
  battingTeam, fieldingTeam, currentBatter, onDeck, fatigue } from './engine.js';

let g, mark = 0;
const ui = { swing: 'normal', approach: 'normal', steal: false, bunt: false, ibb: false, infieldIn: false, pr: null };
const $ = (id) => document.getElementById(id);
const mine = () => g.home; // you manage the home team
const userBats = () => battingTeam(g) === mine();
const resetUi = () => Object.assign(ui, { swing: 'normal', approach: 'normal', steal: false, bunt: false, ibb: false, infieldIn: false, pr: null });

function start() { g = newGame(Date.now()); mark = 0; resetUi(); g.log.push('Play ball! You are the home manager.'); render(); }

function play() {
  if (g.over) return;
  const off = userBats() ? { swing: ui.swing, steal: ui.steal, bunt: ui.bunt } : aiOffense(g);
  const def = userBats() ? aiDefense(g) : { approach: ui.approach, ibb: ui.ibb, infieldIn: ui.infieldIn };
  mark = g.log.length;
  plateAppearance(g, { off, def });
  resetUi(); render();
}

const pct = (x) => `${Math.round(x * 100)}%`;
function stat(p) { const s = p.stats; return p.type === 'bat' ? `${s.h}-${s.ab}${s.hr ? `, ${s.hr} HR` : ''}${s.rbi ? `, ${s.rbi} RBI` : ''}` : `${Math.floor(s.outs / 3)}.${s.outs % 3} IP, ${s.r} R, ${s.k} K, ${s.bb} BB`; }
function ratings(p) { return p.type === 'bat' ? `CON ${p.contact} · PWR ${p.power} · EYE ${p.eye} · SPD ${p.speed}` : `STF ${p.stuff} · CTL ${p.control} · STA ${p.stamina}`; }

function renderScore() {
  const n = Math.max(9, g.inning);
  const head = Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join('');
  const row = (t, top) => {
    const cells = Array.from({ length: n }, (_, i) => {
      const v = t.inningRuns[i];
      const live = !g.over && g.inning === i + 1 && ((top && g.half === 'top') || (!top && g.half === 'bot'));
      return `<td>${v === undefined ? (live ? '·' : '') : v}</td>`;
    }).join('');
    return `<tr class="${!g.over && ((top && g.half === 'top') || (!top && g.half === 'bot')) ? 'live' : ''}"><td>${t.name}</td>${cells}<td><b>${t.runs}</b></td><td>${t.hits}</td></tr>`;
  };
  $('scoreboard').innerHTML = `<table><tr><th></th>${head}<th>R</th><th>H</th></tr>${row(g.away, true)}${row(g.home, false)}</table>`;
}

function renderField() {
  const base = (i, x, y) => `<rect x="${x - 12}" y="${y - 12}" width="24" height="24" transform="rotate(45 ${x} ${y})" fill="${g.bases[i] ? '#f2c14e' : '#0c1d13'}" stroke="#9db8a5"/>`;
  const names = g.bases.map((r) => (r ? r.name.split(' ')[1] : ''));
  const outs = [0, 1, 2].map((i) => `<circle cx="${100 + i * 24}" cy="205" r="7" fill="${i < g.outs ? '#e26d5c' : '#0c1d13'}" stroke="#9db8a5"/>`).join('');
  const label = (x, y, t) => `<text x="${x}" y="${y}" fill="#eef3ea" font-size="11" text-anchor="middle">${t}</text>`;
  const b = currentBatter(g), p = fieldingTeam(g).pitcher, f = fatigue(p);
  $('field').innerHTML = `<h2>${g.over ? 'Final' : `${g.half === 'top' ? 'Top' : 'Bottom'} ${g.inning}`} — ${g.outs} out</h2>
    <svg viewBox="0 0 280 220"><path d="M140 175 L40 95 L140 15 L240 95 Z" fill="#1f4d2f" stroke="#2b5a3c"/>
      ${base(0, 200, 100)}${base(1, 140, 40)}${base(2, 80, 100)}
      <path d="M140 175 l-10 -10 l10 -10 l10 10 z" fill="#eef3ea"/>
      ${label(200, 128, names[0])}${label(140, 24, names[1])}${label(80, 128, names[2])}${outs}</svg>
    <div class="row"><span class="label">At bat</span> <b>${b.name}</b> <small>${b.pos} · ${ratings(b)}</small></div>
    <div class="row"><span class="label">On deck</span> ${onDeck(g).name}</div>
    <div class="row"><span class="label">Pitching</span> <b>${p.name}</b> <small>${ratings(p)}</small></div>
    <div class="row"><span class="label">Pitch count</span> ${p.stats.pitches}
      <div class="meter ${f > 0.5 ? 'hot' : ''}"><i style="width:${Math.min(100, (p.stats.pitches / (p.stamina * 1.25)) * 100)}%"></i></div>
      <small>${f > 0.6 ? 'gassed' : f > 0.2 ? 'tiring' : 'fresh'}</small></div>`;
}

const seg = (name, cur, opts) => `<div class="seg">${opts.map(([v, t]) => `<label><input type="radio" name="${name}" value="${v}" ${cur === v ? 'checked' : ''} data-set="${name}"><span>${t}</span></label>`).join('')}</div>`;
const chk = (name, on, text, disabled) => `<label class="chk"><input type="checkbox" data-toggle="${name}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''}> ${text}</label>`;

function renderOrders() {
  if (g.over) { $('orders').innerHTML = `<div class="over">${g.winner === 'home' ? 'Victory!' : 'Defeat.'}<br>${g.away.name} ${g.away.runs}, ${g.home.name} ${g.home.runs}</div>`; return; }
  const [b1, b2] = g.bases;
  let html;
  if (userBats()) {
    html = `<h2>Offense — your orders</h2>
      <div class="group"><span class="label">Batter's approach</span>${seg('swing', ui.swing, [['patient', 'Work the count'], ['normal', 'Normal'], ['aggressive', 'Swing away']])}</div>
      <div class="group">${chk('steal', ui.steal, 'Steal second', !(b1 && !b2))}${chk('bunt', ui.bunt, 'Sacrifice bunt', !(g.outs < 2 && (b1 || b2)))}</div>`;
  } else {
    html = `<h2>Defense — your orders</h2>
      <div class="group"><span class="label">Pitching approach</span>${seg('approach', ui.approach, [['nibble', 'Nibble corners'], ['normal', 'Normal'], ['attack', 'Attack the zone']])}</div>
      <div class="group">${chk('ibb', ui.ibb, 'Intentional walk', false)}${chk('infieldIn', ui.infieldIn, 'Infield in', !g.bases[2])}</div>`;
  }
  $('orders').innerHTML = `${html}<div class="row"><button class="primary" data-action="play">Next batter ▶</button><small>The players do the playing. You make the calls.</small></div>`;
}

function renderRoster() {
  const t = mine(), bat = userBats(), cur = t.lineup[t.batIdx];
  const lineup = t.lineup.map((p, i) => `<tr class="${bat && p === cur ? 'live' : ''}"><td>${i + 1}. ${p.name}</td><td>${p.pos}</td><td>${stat(p)}</td></tr>`).join('');
  const benchBtns = (p) => {
    const act = [];
    if (bat) {
      act.push(`<button data-action="ph" data-id="${p.id}">Pinch hit</button>`);
      g.bases.forEach((r, i) => { if (r) act.push(`<button data-action="pr" data-base="${i}" data-id="${p.id}">Run for ${['1st', '2nd', '3rd'][i]}</button>`); });
    }
    return act.join(' ');
  };
  const bench = t.bench.map((p) => `<tr><td>${p.name}</td><td>${p.pos}</td><td><small>${ratings(p)}</small></td><td>${benchBtns(p)}</td></tr>`).join('');
  const pen = t.bullpen.map((p) => `<tr><td>${p.name}</td><td>${p.pos}</td><td><small>${ratings(p)}</small></td><td>${!bat ? `<button data-action="pitch" data-id="${p.id}">Bring in</button>` : ''}</td></tr>`).join('');
  $('roster').innerHTML = `<h2>Your club</h2><table>${lineup}</table>
    <h2 style="margin-top:12px">Bench</h2><table>${bench || '<tr><td>Empty</td></tr>'}</table>
    <h2 style="margin-top:12px">Bullpen <small>${bat ? '(change pitchers when you take the field)' : ''}</small></h2><table>${pen || '<tr><td>Empty</td></tr>'}</table>`;
}

function renderLog() {
  const lines = g.log.slice(-40).reverse();
  const first = g.log.length - mark;
  $('log').innerHTML = `<h2>Play by play</h2><div class="log">${lines.map((l, i) => `<p class="${i < first ? 'new' : ''}">${l}</p>`).join('')}</div>`;
}

function render() { renderScore(); renderField(); renderOrders(); renderRoster(); renderLog(); }

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || g.over) return;
  const t = mine(), id = Number(el.dataset.id);
  switch (el.dataset.action) {
    case 'play': play(); return;
    case 'ph': pinchHit(g, t, id); break;
    case 'pr': pinchRun(g, t, Number(el.dataset.base), id); break;
    case 'pitch': changePitcher(g, t, id); break;
  }
  render();
});
document.addEventListener('change', (e) => {
  const s = e.target.dataset;
  if (s.set) ui[s.set] = e.target.value;
  if (s.toggle) ui[s.toggle] = e.target.checked;
  renderOrders();
});
$('new').addEventListener('click', start);
start();
