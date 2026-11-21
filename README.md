# Skipper

A baseball game about **managing** the game. You don't swing or throw — you make the calls:

- **Offense:** batter's approach (work the count / normal / swing away), steal, sacrifice bunt, pinch-hit, pinch-run.
- **Defense:** pitching approach (nibble / normal / attack), intentional walk, infield in, and when to go to the bullpen.
- Pitchers tire as their pitch count climbs, so *when* you pull them is the game.

You manage the home team; the visitors are run by a simple AI manager.

## Run

```
npm start      # serves http://localhost:8080
npm test       # engine tests (Node 20+)
```

No dependencies. `src/engine.js` is a pure, seeded simulation (testable in Node); `src/main.js` is the browser UI.
