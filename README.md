# Skipper

A baseball game about **managing** the game. You don't swing or throw — you make the calls, pitch by pitch.
Installable as an iPhone/Android PWA (works offline).

## What you control
- **Offense:** batter approach (work the count / normal / swing away) and a play call per pitch — take, steal, bunt, hit & run — plus pinch-hitters and pinch-runners.
- **Defense:** pitching approach, **pitch mix** (fastballs / mix / offspeed — hitters have a fastball or offspeed tilt, pitchers have an arsenal with a quality per pitch), pitchout, intentional walk, shift, infield in, outfield depth, bullpen changes and defensive replacements.
- **Bullpen roles:** closer (9th, 1–3 run leads), setup man (8th), long man, middle relief. The opposing AI follows them.
- **Gameday-style screen:** scorebug, strike-zone pitch tracker (type, speed, location), diamond with count, pitcher-vs-batter strip, win-probability graph, hot/cold and platoon tags, replay of the last at-bat, box score, player cards.

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
- `src/main.js` — UI. `src/feedback.js` — sound + haptics. `src/store.js` — localStorage.
- `sw.js` + `manifest.webmanifest` — PWA. Bump `VERSION` in `sw.js` if you change the shell file list.
