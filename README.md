# Super-Sports-Betting-Bot-9000

Kalshi sportsbook: live moneyline boards, cash balance, and Quick / Limit orders.

## Setup

```bash
npm install
```

To show your cash balance and place orders, set:

- `KALSHI_API_KEY_ID` — API key ID from Kalshi → Account → API Keys
- `KALSHI_PRIVATE_KEY` — the PEM private key (newlines may be stored as `\n`)
- `KALSHI_ENV` — `prod` (default) or `demo`

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
