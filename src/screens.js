// Title screen, intro, written guide and the scripted tutorial. HTML generators and data only — main.js wires the events.

export const INTRO = [
  { icon: '🏟️', title: 'Welcome to the dugout', body: 'The owner just hired you as manager of the <b>Skippers</b>. A 28-game season, a playoff, and a fan base that expects a pennant.' },
  { icon: '🧢', title: 'You make the calls', body: 'You never swing a bat or throw a pitch. You decide <b>who plays</b>, <b>when to steal</b>, <b>when to change pitchers</b>, how to set the defense. The players do the rest.' },
  { icon: '📡', title: 'Read the game', body: 'A live <b>field cam</b> shows every pitch, hit and runner. A <b>coach</b> suggests moves, and <b>auto mode</b> lets the AI take over whenever you just want to watch.' },
  { icon: '🏆', title: 'Win the pennant', body: 'Climb the standings, survive the playoffs, then rebuild in the off-season with free agents, prospects and trades — all under a budget. Ready?' },
];

export function introHtml(i, club) {
  const s = INTRO[i], last = i === INTRO.length - 1;
  const dots = INTRO.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
  const name = last ? `<div class="club"><label>City<input id="clubCity" value="${club.city}" maxlength="16" autocomplete="off"></label><label>Nickname<input id="clubNick" value="${club.nick}" maxlength="16" autocomplete="off"></label></div>` : '';
  return `<div class="scr intro"><div class="intro-ic">${s.icon}</div><h1>${s.title}</h1><p>${s.body}</p>${name}
    <div class="steps">${dots}</div>
    <div class="row" style="justify-content:center">${i ? `<button data-act="intro" data-i="${i - 1}">Back</button>` : '<button class="ghost" data-act="introskip">Skip</button>'}
    ${last ? '<button class="primary" data-act="introdone" data-tut="1">Learn the ropes</button><button data-act="introdone">Start playing</button>' : `<button class="primary" data-act="intro" data-i="${i + 1}">Next</button>`}</div></div>`;
}

export function sportHtml(info) {
  return `<div class="scr start sport"><div class="start-bg"><i class="b1"></i><i class="b2"></i><i class="b3"></i></div>
    <div class="start-card"><div class="logo" data-act="introopen">SKIP<b>PER</b></div><p class="tagline">Choose your game</p>
      <div class="sports">
        <button class="sportcard" data-act="pickbaseball"><span class="sp-ic">⚾</span><b>Baseball</b><span class="sp-d">Steal, bunt, change pitchers, set the defense. Pitch by pitch.</span><small>${info.bb}</small></button>
        <button class="sportcard" data-act="pickfootball"><span class="sp-ic">🏈</span><b>Football</b><span class="sp-d">Call the plays: runs, passes, 4th downs, the clock.</span><small>${info.fb}</small></button>
      </div><small class="mute">You can switch sports any time from the title screen.</small></div></div>`;
}

export function startHtml(info) {
  const { cont, label, hasDaily, dailyDone, fb } = info;
  return `<div class="scr start">
    <div class="start-bg"><i class="b1"></i><i class="b2"></i><i class="b3"></i>
      <svg viewBox="0 0 320 200" aria-hidden="true"><path class="s-field" d="M160 190 L20 60 Q160 -60 300 60 Z"/><path class="s-line" d="M160 190 L20 60 M160 190 L300 60 M160 190 L226 124 L160 58 L94 124 Z"/><g class="s-ball"><circle r="5"/></g></svg></div>
    <div class="start-card"><div class="logo" data-act="introopen">SKIP<b>PER</b></div><p class="tagline">${fb ? '🏈 Football — call the plays.' : '⚾ Baseball — manage the game.'}</p>
      <div class="menu">
        ${cont ? `<button class="primary big" data-act="startcontinue">▶ Continue<small>${label}</small></button>` : `<button class="primary big" data-act="startcontinue">▶ ${label}</button>`}
        <button data-act="startexhibit">Exhibition game</button>
        ${fb ? '' : `<button data-act="startdaily" ${dailyDone ? 'disabled' : ''}>${dailyDone ? 'Daily challenge ✔' : 'Daily challenge'}</button>`}
        <div class="two"><button data-act="starttut">🎓 Tutorial</button><button data-act="startguide">📖 How to play</button></div>
      </div>
      <div class="row" style="justify-content:center"><button class="ghost" data-act="changesport">⇄ Change sport</button></div></div></div>`;
}

const sw = (cls, txt) => `<span class="sw ${cls}"></span> ${txt}`;
export const GUIDE = [
  ['The basics', `<p>You are the <b>manager</b>. A baseball game is a long series of one-on-one duels (a pitcher against a batter). You can't change how hard a player swings — but you can change <i>who</i> is in the duel and <i>how</i> your team approaches it.</p>
    <ul><li><b>▶ Next pitch</b> plays one pitch with your orders. <b>Auto at-bat</b> plays the whole at-bat.</li><li>A game is 9 innings. Each half-inning ends after 3 outs. The home team bats second.</li><li>You win by scoring more runs than the other team.</li></ul>`],
  ['Reading the screen', `<ul class="legend"><li><b>Scorebug</b> (top): runs, hits, inning (▲ top, ▼ bottom) and outs.</li>
    <li><b>Field cam</b>: your hitters are the dots with initials; fielders stand in position. Watch the ball, runners and fielders move. Your shift, outfield depth and infield-in orders move the fielders.</li>
    <li><b>Count</b>: B = balls (4 is a walk), S = strikes (3 is out), O = outs.</li>
    <li><b>Pitch tracker</b>: ${sw('ball', 'green = ball')} ${sw('strike', 'red = strike / swing / foul')} ${sw('inplay', 'blue = hit in play')} — numbered in order, with pitch type and speed.</li>
    <li><b>Tags</b>: 🔥 hot / 🧊 cold streak, <span class="tag edge">platoon edge</span> (the hitter is on the good side vs this pitcher), <span class="tag dis">same-side</span> (bad matchup), <span class="tag inj">hurt</span>.</li>
    <li><b>Win probability</b>: your chance to win right now. Big swings mark big moments.</li>
    <li><b>Arm meter</b>: how tired the pitcher is. Gassed pitchers lose stuff and control.</li></ul>`],
  ['Your orders — offense', `<ul><li><b>Work the count</b>: wait for a good pitch, draw walks. Use with patient hitters (high EYE) against wild pitchers.</li>
    <li><b>Swing away</b>: aggressive. Best for power hitters; more strikeouts too.</li>
    <li><b>Take</b>: let the next pitch go. Great on 3-0 and 3-1.</li>
    <li><b>Steal</b>: runner goes on the pitch. Needs a fast runner (SPD) and an open base ahead. Failing costs an out.</li>
    <li><b>Bunt</b>: give up an out to move runners up. Use with weak hitters when one run matters.</li>
    <li><b>Hit &amp; run</b>: runner on first goes, batter must swing. Avoids double plays; risky if he misses.</li>
    <li><b>Pinch hit / pinch run</b>: swap a bench player in (Club tab). Late in close games they can win it.</li></ul>`],
  ['Your orders — defense', `<ul><li><b>Approach</b>: <i>Nibble</i> corners (fewer hits, more walks) or <i>Attack</i> the zone (more strikes, more contact).</li>
    <li><b>Pitch mix</b>: hitters tend to handle fastballs or offspeed pitches better. Throw the other kind. Each pitcher's arsenal shows a quality number per pitch.</li>
    <li><b>Pitchout</b>: wasted ball that makes a steal very hard. <b>Walk him</b>: intentional walk — avoid a slugger with first base open.</li>
    <li><b>Shift</b>: cuts singles from power hitters. <b>Infield in</b>: cuts off a run at third on grounders (more hits get through, though).</li>
    <li><b>Outfield depth</b>: deep trims doubles and triples; shallow helps throw out runners but hurts against hard hits.</li>
    <li><b>Bullpen</b>: bring in a reliever when your starter tires. <b>Closer</b> = 9th-inning saves, <b>Setup</b> = 8th, <b>Long</b> = early innings.</li>
    <li><b>Defensive replacement</b>: late with a lead, swap a bat for a better glove (Club tab).</li></ul>`],
  ['Ratings explained', `<ul><li><b>CON</b> contact · <b>PWR</b> power · <b>EYE</b> plate discipline · <b>SPD</b> speed · <b>DEF</b> defense (hitters, 20–95).</li>
    <li><b>STF</b> stuff · <b>CTL</b> control · <b>STA</b> stamina (pitchers). Stamina is roughly how many pitches before he tires.</li>
    <li><b>Handedness</b>: lefty hitters do better against righty pitchers and vice versa. Switch hitters are neutral.</li>
    <li><b>Tilt</b>: a "fastball hitter" or "offspeed hitter" has a weakness you can attack with your pitch mix.</li>
    <li><b>Form</b>: 🔥/🧊 streaks change day to day. <b>Rest</b>: pitchers who threw yesterday are tired today.</li></ul>`],
  ['The coach &amp; auto mode', `<ul><li>The <b>🧑‍🏫 Coach</b> shows a one-line tip under the field (and up to three ideas on the Coach tab). Tap <b>Do it</b> to apply one. Suggested options are starred ★ in your orders. Turn it off in More.</li>
    <li><b>▶ Auto</b> lets the AI manage your team while you watch. It <b>pauses at decision points</b> you choose (tired pitcher, scoring chances, late &amp; close, bases loaded).</li>
    <li><b>⏭ Decision</b> instantly plays ahead to the next decision point. <b>Autopilot</b> can finish the half-inning or the whole game.</li></ul>`],
  ['Season, playoffs &amp; off-season', `<ul><li>28 games against 7 opponents. The top 4 teams reach the playoffs (best-of-3 rounds).</li>
    <li>Set your <b>batting order</b> and <b>rotation</b> on the Lineup tab, or tap ✨ Auto. Injured players are replaced automatically.</li>
    <li>After the playoffs: sign <b>free agents</b> and cheap <b>prospects</b>, make <b>trades</b>, and stay under your <b>payroll budget</b>. Winning raises your budget.</li>
    <li>Players develop each year — young players improve, veterans decline.</li></ul>`],
  ['Strategy tips', `<ol><li>Check the arm meter every inning — pulling a tiring starter early is usually right.</li>
    <li>Save your closer for 1–3 run leads in the 9th.</li><li>Stolen bases only pay when the runner is genuinely fast.</li>
    <li>Look for <b>platoon edge</b> tags when choosing pinch hitters.</li><li>Walk the slugger only when first base is open and the next hitter is much weaker.</li>
    <li>Rest tired relievers — don't use the same arm three days running.</li><li>Prospects are the cheapest way to get better over several seasons.</li></ol>`],
  ['Questions', `<p><b>Why can't I pick Steal?</b> It needs a runner on first with second open (or on second with third open).</p>
    <p><b>Why did my pitcher get slower/worse?</b> Fatigue: past his pitch limit his stuff and control fade fast.</p>
    <p><b>What does "same-side" mean?</b> Lefty vs lefty or righty vs righty — a disadvantage for the hitter.</p>
    <p><b>Will I lose progress if I close the app?</b> No. The game saves after every pitch.</p>
    <p><b>Can I just let the AI play?</b> Yes — Auto mode, Autopilot, or "Sim game" on the Season tab.</p>`],
];

export function guideHtml(open = 0, sport = 'bb') {
  if (sport === 'fb') return fbGuideHtml(open);
  return `<div class="scr guide"><div class="guide-head"><h1>How to play</h1><button class="sm" data-act="closescreen">✕ Close</button></div>
    <div class="guide-body">${GUIDE.map(([t, b], i) => `<details ${i === open ? 'open' : ''}><summary>${t}</summary>${b}</details>`).join('')}
    <div class="row" style="justify-content:center;margin:16px 0"><button class="primary" data-act="starttut">🎓 Start the tutorial</button><button data-act="closescreen">Back</button></div></div></div>`;
}

// ---------- scripted tutorial ----------
// A practice game where you manage the visitors (you bat first). Steps advance when you do the thing, or via Continue.
export const TUTORIAL = [
  { id: 'welcome', title: 'Welcome to practice', manual: true, text: 'This is a practice game — nothing here counts. You manage the visitors, so you bat first. I\'ll guide you step by step. Tap <b>Continue</b>.' },
  { id: 'cam', title: 'The field cam', manual: true, text: 'This top-down view shows everything. <b>Your hitters</b> are the dots with initials; <b>fielders</b> are the plain dots in the other team\'s colour. The ball, runners and fielders move as plays happen.', spot: '#camslot' },
  { id: 'pitch', title: 'Play a pitch', text: 'Tap <b>Next pitch ▶</b> to play one pitch.', spot: '[data-act=pitch1]', ok: (c) => c.tut.pitches >= 1 },
  { id: 'tracker', title: 'The pitch tracker', manual: true, text: 'The strike zone shows where the pitch went: <b>green = ball</b>, <b>red = strike</b>, <b>blue = hit in play</b>. The count (B-S-O) is beside the field. Four balls = walk, three strikes = out.', spot: '.zonebox' },
  { id: 'swing', title: 'Choose an approach', text: 'Set how your batter approaches this at-bat. Tap <b>Swing away</b>.', spot: 'input[data-set=swing][value=aggressive]', ok: (c) => c.ui.swing === 'aggressive' || c.ui.swing === 'patient' },
  { id: 'play', title: 'Keep playing', text: 'Throw a few more pitches with <b>Next pitch</b> and watch the field cam.', spot: '[data-act=pitch1]', ok: (c) => c.tut.pitches >= 4 },
  { id: 'steal', title: 'Call a steal', scene: 'runner', text: 'A fast runner is on first with nobody out. Under <b>Play call</b>, pick <b>Steal</b>, then tap <b>Next pitch</b>.', spot: 'input[data-set=call][value=steal]', ok: (c) => c.tut.stolen },
  { id: 'coach', title: 'Your coach', manual: true, text: 'The <b>coach line</b> under the field suggests a move — tap <b>Do it</b> to apply it. The <b>Coach</b> tab lists more ideas, and suggested options are starred ★ in <b>Orders</b>.', spot: '.coachline' },
  { id: 'club', title: 'The Club tab', text: 'Your bench and bullpen live in <b>Club</b>: pinch hitters, pinch runners and relievers. Tap <b>Club</b> to look.', spot: '[data-sub=club]', ok: (c) => c.ui.sub === 'club' },
  { id: 'back', title: 'Back to your orders', text: 'Tap <b>Orders</b> to return.', spot: '[data-sub=orders]', ok: (c) => c.ui.sub === 'orders' },
  { id: 'auto', title: 'Auto mode', text: 'Want to just watch? Tap <b>▶ Auto</b> and the AI manages for you. It pauses at decision points.', spot: '[data-act=autostart]', ok: (c) => c.tut.autoUsed },
  { id: 'auto2', title: 'Pause & Decision', manual: true, text: '<b>⏸ Pause</b> stops auto mode any time. <b>⏭ Decision</b> skips ahead to the next moment worth deciding. What counts as a decision is set in <b>More</b>.', spot: '#bar' },
  { id: 'field', title: 'Now play defense', scene: 'field', text: 'Tap <b>Go to the field</b> below — the AI plays out the rest of this half-inning and you take the field.', button: { act: 'tutfield', label: 'Go to the field' }, ok: (c) => c.g.half === 'bot' },
  { id: 'defense', title: 'Defensive orders', text: 'In the field you set the pitch approach, <b>pitch mix</b>, shift and outfield depth. Look at the hitter\'s weakness and pick <b>Offspeed</b> or <b>Fastballs</b>.', spot: 'input[data-set=mix][value=off]', ok: (c) => c.ui.mix !== 'mix' },
  { id: 'bullpen', title: 'Change the pitcher', scene: 'gassed', text: 'Your starter is <b>gassed</b> (see the arm meter). Open <b>Club</b> and tap <b>Bring in</b> on a reliever — the coach suggests the best one.', spot: '[data-sub=club]', ok: (c) => c.tut.changed },
  { id: 'done', title: 'You\'re ready!', manual: true, last: true, text: 'That\'s the core of it. Use <b>▶ Auto</b> whenever you want a break, check the coach when unsure, and read <b>How to play</b> in More anytime. Good luck, Skipper!' },
];

export const FB_GUIDE = [
  ['The basics', `<p>You are the <b>head coach</b>. You pick the plays; the players run them. Score more points than the other team before time runs out.</p>
    <ul><li>The team with the ball is the <b>offense</b>. It has <b>4 downs</b> (tries) to gain <b>10 yards</b>. Gain them and you get a fresh 4 downs; fail and the other team gets the ball.</li>
    <li>Your offense always drives to the <b>right</b> of the field cam. The <b>blue line</b> is the ball; the <b>yellow line</b> is the first-down marker.</li>
    <li><b>Touchdown</b> = 6 points, then a <b>kick</b> (+1) or <b>two-point try</b> (+2). <b>Field goal</b> = 3. <b>Safety</b> = 2 for the defense.</li>
    <li>A game is four 12-minute quarters. A tie goes to a 7-minute overtime where the first score wins.</li></ul>`],
  ['Reading the screen', `<ul><li><b>Scorebug</b>: score, quarter, clock, down &amp; distance (e.g. "2nd &amp; 7"), where the ball is (OWN 38 / OPP 22), timeouts left (TO) and your win chance. 🏈 marks who has the ball.</li>
    <li><b>Field cam</b>: formations change with your calls. Watch passes fly, runners cut, sacks and kicks.</li>
    <li><b>Coach line</b>: a one-line recommendation with a <b>Do it</b> button.</li>
    <li><b>Tabs</b>: Play (your calls), Coach, Matchup (your units vs theirs), Auto, Log, Box.</li></ul>`],
  ['Offense: your play calls', `<ul><li><b>Inside run</b>: steady yards. <b>Outside run</b>: bigger gains and bigger losses. <b>QB sneak</b>: best for 1–2 yards.</li>
    <li><b>Short pass</b>: safe and quick. <b>Medium</b>: the balanced pass. <b>Deep</b>: big plays, low completion, more interceptions. <b>Screen</b>: beats a blitz.</li>
    <li><b>Punt</b>: on 4th down, give up the ball and flip the field. <b>Field goal</b>: shows your chance of making it from here.</li>
    <li><b>Kneel</b>: run out the clock when you are winning. <b>Spike</b>: stop the clock when you are losing.</li>
    <li><b>Tempo</b>: Normal, <b>Hurry-up</b> (saves clock), <b>Slow</b> (drains it). <b>Timeout</b> stops a running clock.</li>
    <li>No call selected? Your coordinator picks a sensible play.</li></ul>`],
  ['Defense: your calls', `<ul><li><b>Base</b>: balanced. <b>Stack the box</b>: stops the run, weaker deep. <b>Blitz</b>: pressure and sacks, but short passes and screens get open.</li>
    <li><b>Man</b>: tight on deep passes. <b>Zone</b>: fewer big plays, more interceptions. <b>Prevent</b>: protect a late lead from the deep ball but give up short gains.</li>
    <li>Use a timeout on defense when you are behind and the other team is running the clock.</li></ul>`],
  ['Fourth down & special teams', `<ul><li><b>Go for it</b> when you need only 1–2 yards, or are in field-goal range and behind late. The Coach shows the conversion chance.</li>
    <li><b>Field goal</b> when you are close enough (about 50 yards or less) — the button shows your percentage.</li>
    <li><b>Punt</b> when you are deep in your own territory and need a lot of yards.</li>
    <li>After a touchdown choose <b>kick</b> (about 94%) or <b>go for two</b> (about 47%) — usually only worth it late when the score makes it matter.</li>
    <li>Down late? An <b>onside kick</b> wins the ball back about 1 time in 7.</li></ul>`],
  ['Clock management', `<ul><li>The clock stops on incomplete passes, out-of-bounds plays, scores, timeouts and penalties. It keeps running on most runs and completions.</li>
    <li>Leading late: run the ball, play <b>Slow</b>, then <b>Kneel</b>. Trailing late: <b>Hurry-up</b>, throw short sideline passes, save timeouts for the end, <b>Spike</b> when you need to stop it.</li></ul>`],
  ['Auto mode, season &amp; strategy', `<ul><li><b>▶ Auto</b>: the AI coaches while you watch and pauses at 4th downs, the red zone, the two-minute drill and after touchdowns (change in More). <b>⏭ Decision</b> skips to the next one.</li>
    <li>Season: 7 games against the other clubs, then single-game playoffs for the top 4.</li>
    <li>Tips: don't punt on 4th &amp; 1 near midfield; blitz on 3rd &amp; long only if your rush beats their blocking; use the Matchup tab to see where you are strong.</li></ul>`],
];
export function fbGuideHtml(open = 0) {
  return `<div class="scr guide"><div class="guide-head"><h1>How to play — football</h1><button class="sm" data-act="closescreen">✕ Close</button></div>
    <div class="guide-body">${FB_GUIDE.map(([t, b], i) => `<details ${i === open ? 'open' : ''}><summary>${t}</summary>${b}</details>`).join('')}
    <div class="row" style="justify-content:center;margin:16px 0"><button class="primary" data-act="starttut">🎓 Start the tutorial</button><button data-act="closescreen">Back</button></div></div></div>`;
}

export const FB_TUTORIAL = [
  { id: 'welcome', title: 'Welcome to practice', manual: true, text: 'This is a practice game — nothing here counts. You are the head coach of the home team and your offense has the ball. Tap <b>Continue</b>.' },
  { id: 'field', title: 'The field', manual: true, text: 'Your offense always drives to the <b>right</b>. The <b>blue line</b> is the ball; the <b>yellow line</b> is the first-down marker. Reach it within four downs to keep the ball.', spot: '#fbcamslot' },
  { id: 'snap', title: 'Run a play', text: 'Tap <b>Snap ▶</b>. With no call selected, your coordinator picks the play.', spot: '[data-act=fbsnap]', ok: (c) => c.tut.snaps >= 1 },
  { id: 'call', title: 'Call a play', text: 'Now you pick. Under <b>Pass</b>, tap <b>Short</b>, then tap <b>Snap</b>.', spot: 'input[data-set=fbcall][value=short]', ok: (c) => c.tut.stepSnaps >= 1 && ['short', 'medium', 'deep', 'screen'].includes(c.tut.calls[c.tut.calls.length - 1]) },
  { id: 'downs', title: 'Downs & distance', manual: true, text: 'You get <b>4 downs</b> to gain <b>10 yards</b>. The scorebug shows e.g. "2nd &amp; 7": second down, 7 yards to go. Gain enough and you earn a fresh set of downs.', spot: '.bug' },
  { id: 'fourth', title: 'Fourth down', scene: 'fourth', text: 'It is <b>4th &amp; 2</b> past midfield — a big decision. <b>Go for it</b> with a pass or run, kick a <b>field goal</b>, or <b>punt</b>. Check the coach tip, choose, then <b>Snap</b>.', spot: '.coachline', ok: (c) => c.tut.stepSnaps >= 1 },
  { id: 'coach', title: 'Your coach', manual: true, text: 'The <b>coach line</b> recommends the percentage play and why. Tap <b>Do it</b> to apply it. The <b>Coach</b> tab has more ideas.', spot: '.coachline' },
  { id: 'clock', title: 'Clock & timeouts', manual: true, text: 'Quarters are 12 minutes. Incomplete passes and out-of-bounds plays stop the clock. <b>Hurry-up</b> saves time, <b>Slow</b> drains it, and a <b>timeout</b> stops a running clock. They matter most late in the game.', spot: 'input[data-set=fbpace][value=hurry]' },
  { id: 'defense', title: 'Play defense', scene: 'defense', text: 'Now the opponent has the ball: <b>3rd &amp; 8</b>. Under <b>Call</b>, tap <b>Blitz</b> to pressure the passer, then <b>Snap</b>.', spot: 'input[data-set=fbdef][value=blitz]', ok: (c) => c.tut.stepSnaps >= 1 },
  { id: 'auto', title: 'Auto mode', text: 'Tap <b>▶ Auto</b> to let the AI coach while you watch. It pauses at big moments such as 4th down.', spot: '[data-act=fbautostart]', ok: (c) => c.tut.autoUsed },
  { id: 'done', title: 'You are ready!', manual: true, last: true, text: 'That is the core of it. Use the coach when unsure, <b>▶ Auto</b> for a break, and <b>How to play</b> in More any time. Good luck, Coach!' },
];
