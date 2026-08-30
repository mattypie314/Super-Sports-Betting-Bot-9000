# Super-Sports-Betting-Bot-9000

Kalshi sportsbook: live moneyline boards, cash balance, and Quick / Limit orders.

## Setup

```bash
npm install
```

To show your cash balance and place orders, put a gitignored `.env` in the repo root:

```
KALSHI_API_KEY_ID=your-key-id
KALSHI_PRIVATE_KEY_PATH=.kalshi.key
KALSHI_ENV=prod
```

Keep the PEM in `.kalshi.key` (also gitignored). You can instead set `KALSHI_PRIVATE_KEY` to the PEM text. Never commit either file.

The board still loads public Kalshi markets without keys.

## Run

```bash
npm start        # http://localhost:3000
npm run dev      # auto-reload
npm test
```

## API

| Method | Route | Description |
| --- | --- | --- |
| GET | `/api/health` | Health + Kalshi credential status |
| GET | `/api/sports` | Board tabs |
| GET | `/api/games?sport=mlb` | Open Kalshi moneyline games |
| GET | `/api/balance` | Kalshi cash |
| GET | `/api/positions` | Open positions |
| POST | `/api/order` | `{ ticker, side: "yes"\|"no", count, price, orderType: "quick"\|"limit" }` |
