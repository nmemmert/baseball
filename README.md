# Skipper

Two games about **coaching** rather than playing — pick one on the start screen:

- ⚾ **Baseball:** you don't swing or throw — you make the calls, pitch by pitch.
- 🏈 **Football:** you're the head coach — you call the plays, the players run them.

Installable as an iPhone/Android PWA (works offline).

## Football
- **Play calling:** inside/outside runs, QB sneak, short/medium/deep passes, screens, punt, field goal (with your make percentage), kneel and spike, plus tempo (hurry-up / normal / slow) and timeouts. No call selected? The coordinator picks.
- **Defense:** base, stack the box, blitz, man, zone, prevent.
- **Special situations:** 4th-down decisions, kick vs. go for two, onside kicks, overtime, penalties, clock management.
- **Same helpers as baseball:** a one-line **coach** with the percentages, **auto mode** that pauses at 4th downs / red zone / two-minute drill / after touchdowns, an animated **field cam** with formations that change with your calls, a Matchup tab (your units vs. theirs), box score, and a **tutorial** plus written guide.
- **Season:** 7 games, then single-game playoffs for the top 4, with league leaders.

## What you control (baseball)
- **Offense:** batter approach (work the count / normal / swing away) and a play call per pitch — take, steal, bunt, hit & run — plus pinch-hitters and pinch-runners.
- **Defense:** pitching approach, **pitch mix** (fastballs / mix / offspeed — hitters have a fastball or offspeed tilt, pitchers have an arsenal with a quality per pitch), pitchout, intentional walk, shift, infield in, outfield depth, bullpen changes and defensive replacements.
- **Bullpen roles:** closer (9th, 1–3 run leads), setup man (8th), long man, middle relief. The opposing AI follows them.
- **One-screen game view:** scorebug, field cam and pitch tracker side by side, a one-line coach tip, and tabs for Orders / Coach / Matchup / Auto / Club / Log / Box — the core loop needs no scrolling on a phone. Longer screens (Season, Stats, More) use collapsible sections.
- **Gameday-style screen:** scorebug, strike-zone pitch tracker (type, speed, location), count and outs, pitcher-vs-batter strip, win-probability graph, hot/cold and platoon tags, replay of the last at-bat, box score, player cards.

## Visuals, coach & learning
- **Field cam:** an animated top-down field. Every pitch flies in from the mound; hits, ground balls, fly balls and home runs travel to where they land; fielders chase; runners round the bases; labels pop up (STRIKE, SINGLE, HOME RUN!, CAUGHT STEALING). Your shift, outfield depth and infield-in orders visibly move the fielders. Animations can be Full / Quick / Off.
- **Coach:** a card suggests up to three moves for the situation (steal, bunt, pinch hit, bring in the closer, pitch mix, shift…) with the reason. Tap **Do it**, or follow the ★ markers in your orders. The Season tab has a **manager's to-do** list (hurt starters, tired arms, off-season upgrades).
- **Title screen & intro:** a title screen with Continue / Exhibition / Daily / Tutorial / How to play, and a first-run intro where you name your club.
- **Tutorial:** a hands-on practice game that walks you through pitching, orders, steals, the coach, the bench, auto mode, defense and the bullpen — each step waits for you to do the thing.
- **How to play:** a full written guide (screen legend, every order, ratings, auto mode, season, strategy tips, FAQ) from the title screen or More.

## Graphics
- **Generated art, no image files:** a crest for every team (scorebug, standings) and a portrait for every player (cap in baseball, helmet in football) on matchup strips and player cards.
- **Baseball field cam:** crowd, padded wall with distance markers, warning track, mowing stripes, shaded players, a spinning ball with a motion trail, and particle bursts and a flash on home runs and runs scoring.
- **Football field cam:** textured grass, patterned end zones with team names, a midfield logo, shaded helmets, a glowing first-down line, a trailing football with laces, and touchdown particles, flash and a camera shake on sacks and scores.
- **Polish:** score "bump" animation, confetti on wins and titles, win-probability area graph, tab fade-ins and button press feedback. **More → Effects: Reduced** (or your phone's reduce-motion setting) turns off shake, particles and confetti.

## Intel (both sports)
- **🔎 Intel tab:** *where you are* (situation in plain English plus how much this moment swings your win chance), *their weaknesses to attack*, *your weaknesses to cover*, *strengths on both sides*, and *how the game has gone*.
- It reads today's data, not just ratings: baseball tracks which of your pitches are working or getting hit and your recent at-bats; football tracks run vs. pass yards, 3rd-down success, which of your calls and defenses work, and how often they blitz.
- **Field chips** keep the key facts in view ("Trailing by 2 · 1 out · ⚡ High leverage", "Leading by 3 · 3rd & 7").
- **Before a game:** a team report on the Lineup/Roster tab and a scouting report on your next opponent on the Season tab.

## Auto mode
- **▶ Auto** lets the AI manage your team while you watch (Slow / Normal / Fast / Instant).
- It **pauses at decision points** you choose: tired pitcher, scoring chances, late & close, bases loaded.
- **⏭ Decision** instantly plays to the next decision point. Autopilot can also finish the half-inning or the game, and "keep going into the next game" chains season games together.
- ✨ **Auto-set lineup & rotation** (optionally before every game) and **Auto off-season** handle the roster chores.

## Modes
- **Season:** 8-team league, 28 games, top 4 reach best-of-3 playoffs. Pitchers carry fatigue between games, relievers get tired, players get hurt and go hot or cold. Progress saves automatically.
- **Off-season:** payroll and budget, a free-agent market with cheap prospects, like-for-like trades the AI must agree to, yearly player development, and a season history.
- **Exhibition:** a one-off game. Share the link (`#seed=…`) so a friend gets the same two teams.
- **Daily challenge:** the same game for everyone each day vs an All-Star manager, with a streak. **Share result** makes an image card.
- **Opposing manager:** Rookie / Pro / All-Star. Only the opponent is affected; your own side on autopilot plays at Pro level.

## Display & accessibility
Light / dark / auto theme, three text sizes, a colour-blind-safe pitch palette, sound and haptics (haptic ticks on iOS 17.4+, vibration on Android), and a first-run tutorial (More → How to play).

## Run
```
npm start      # serves http://localhost:8080
npm test       # engine + league tests (Node 20+)
```
No dependencies, no build step. To install on iPhone, host it over HTTPS (this repo deploys to GitHub Pages) and use Share → Add to Home Screen.

## Layout
- `src/engine.js` — seeded, serialisable pitch-by-pitch simulation, AI managers, win probability, auto-mode stop rules, save/load.
- `src/league.js` — season, schedule, standings, playoffs, injuries, rest, progression, payroll, free agents, trades, history, leaders.
- `src/football.js` (engine, AI coordinators, coach), `src/fbleague.js` (season), `src/fbcam.js` (field cam), `src/fbui.js` (football screens).
- `src/main.js` — UI shell. `src/cam.js` — animated field cam. `src/coach.js` — suggestions and to-do. `src/screens.js` — title, intro, guide, tutorial script. `src/feedback.js` — sound + haptics. `src/store.js` — localStorage.
- `sw.js` + `manifest.webmanifest` — PWA. Bump `VERSION` in `sw.js` if you change the shell file list.

## Gridiron: football you play (not coach)

A third option on the start screen, **Football: You Play**, is a real-time 7-on-7 game with no coaching menus in the way.
Pick a play, then control the action with your thumbs:

- **Move**: drag anywhere on the lower left (floating stick). **Sprint** is hold-to-run.
- **Offence**: pick Inside Run, Outside Run, Quick Pass, Deep Pass or Screen (4th down adds Punt and Field Goal).
  On passes you are the quarterback: tap a numbered button (or the player) to throw; the ring shows how open he is
  (green, yellow, red). After a handoff or catch you carry the ball: **Juke** and **Stiff arm** beat tacklers.
- **Defence**: pick Balanced, Blitz, Deep Zone or Stack the Box, then chase with the nearest defender. **Tackle** is a dive
  (miss and you are down), **Switch** changes player, **Jump** swats or picks off a pass if timed right.
- **Kicking**: field goals use a timing meter.
- Four quarters (Short / Normal / Long), sudden-death overtime, three difficulty levels, a demo mode, and a saved win-loss record.

The simulation (`src/arcade.js`) is DOM-free and covered by `test/arcade.test.js`; the canvas UI is `src/arcadeui.js`.

### Gridiron v2

Landscape layout, penalties (offside, false start, holding, pass interference), two-point tries, timeouts and hurry-up,
named players, a seven-game season with a title, four practice drills, saved games you can continue, touchdown replays,
more sound (whistles, hits, crowd), and control settings (stick size, button size, left-handed layout).

## Diamond: baseball you play (not manage)

A fourth option on the start screen, **Baseball: You Play**. You bat, pitch, make throws and run the bases in real time:

- **Batting**: drag the aim pad to place the bat circle, then SWING as the ball reaches the plate. Timing decides pull or push, bat height decides fly ball or grounder.
- **Pitching**: choose a fastball, slider, curve or changeup, aim at a spot, then stop a timing meter for accuracy.
- **Fielding**: when runners are on, choose where to throw (1st, 2nd, 3rd, Home) for force outs and double plays.
- **Running**: STEAL with a runner on first, STRETCH a hit into an extra base (and risk being thrown out).
- 3, 5 or 9 innings, three difficulty levels, extra innings, walk-offs, saved win-loss record.

The simulation is `src/diamond.js` (DOM-free, tested in `test/diamond.test.js`); the canvas UI is `src/diamondui.js`.

### Diamond season

Season mode: eight teams, one or two meetings with everyone (7 or 14 games), standings with run difference, then a four-team
single-game playoff (semifinal and final). Play your games, simulate one, or simulate to the end. The other games are simulated with
the same engine and team strengths. Season stats and titles are saved. Logic lives in `src/diamondseason.js`.
