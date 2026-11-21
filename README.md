# Skipper

A baseball game about **managing** the game. You don't swing or throw — you make the calls, pitch by pitch.
Installable as an iPhone/Android PWA (works offline).

## What you control
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
- `src/main.js` — UI. `src/cam.js` — animated field cam. `src/coach.js` — suggestions and to-do. `src/screens.js` — title, intro, guide, tutorial script. `src/feedback.js` — sound + haptics. `src/store.js` — localStorage.
- `sw.js` + `manifest.webmanifest` — PWA. Bump `VERSION` in `sw.js` if you change the shell file list.
