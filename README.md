# Super-Sports-Betting-Bot-9000

Sports picks and parlay helper. A small Node.js + Express web app that serves a
list of daily picks and a parlay builder that computes combined American odds,
implied win probability, and payout.

## Requirements

- Node.js >= 20 (developed on Node 22)

## Setup

```bash
npm install
```

## Run

```bash
npm start        # production start on http://localhost:3000
npm run dev      # dev mode with auto-reload (node --watch)
```

Then open http://localhost:3000. Set `PORT` / `HOST` env vars to override the
defaults (`3000` / `0.0.0.0`).

## Test

```bash
npm test
```

## API

| Method | Route | Description |
| --- | --- | --- |
| GET | `/api/health` | Health check. |
| GET | `/api/picks` | Today's picks with market implied probability and model edge. |
| GET | `/api/suggested-parlay?size=3&stake=10` | Highest-edge parlay suggestion. |
| POST | `/api/parlay` | Body `{ "legs": [{ "american": -110 }], "stake": 10 }` → combined parlay math. |

## Project layout

```
src/odds.js      Pure odds conversion + parlay math (unit tested)
src/picks.js     Sample picks model and edge-based parlay suggestion
src/server.js    Express server + API + static file serving
public/          Frontend (parlay builder UI)
test/            Unit tests (node:test)
```

## Cloud Agent environment

`.cursor/environment.json` installs dependencies with `npm ci` and runs the dev
server (`npm run dev`) in a `dev-server` terminal on port 3000.
