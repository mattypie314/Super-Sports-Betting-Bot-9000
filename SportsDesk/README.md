# SportsDesk (Kalshi)

Local Kalshi sports desk. Prompt it and it returns:

1. Best 3 overall Kalshi game contracts
2. A 3+ and 4+ same-game stack (spread / total / first half or first inning)
3. A YRFI/NRFI MLB stack from `KXMLBRFI` (YES = YRFI, NO = NRFI)

Dropdown: **MLB, NFL, NBA, WNBA**. Add NHL, NCAAF, NCAAB, MLS, EPL.

Kalshi does not sell those stacks as one parlay ticket. **Place stack** buys each leg as its own contract.

```bash
export KALSHI_API_KEY_ID=...
export KALSHI_PRIVATE_KEY_PATH=~/.kalshi/kalshi_private_key.pem
# required before Live checkbox can send real orders
export KALSHI_LIVE=1

cd /home/mkubit/Programs/SportsDesk
.venv/bin/python -m sportsdesk
```

Open http://127.0.0.1:8765

Paper is the default. Live needs keys, `KALSHI_LIVE=1`, and the **I confirm live** checkbox.
