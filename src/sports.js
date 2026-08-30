// One series ticker per board tab. These are Kalshi's moneyline game series.
export const SPORTS = [
  { id: 'mlb', label: 'MLB', seriesTicker: 'KXMLBGAME', category: 'Pro Baseball', icon: 'baseball' },
  { id: 'nfl', label: 'NFL', seriesTicker: 'KXNFLGAME', category: 'Football', icon: 'football' },
  { id: 'nba', label: 'NBA', seriesTicker: 'KXNBAGAME', category: 'Basketball', icon: 'basketball' },
  { id: 'wnba', label: 'WNBA', seriesTicker: 'KXWNBAGAME', category: 'Basketball', icon: 'basketball' },
  { id: 'nhl', label: 'NHL', seriesTicker: 'KXNHLGAME', category: 'Hockey', icon: 'hockey' },
  { id: 'cfb', label: 'CFB', seriesTicker: 'KXNCAAFGAME', category: 'College Football', icon: 'football' },
  { id: 'mls', label: 'MLS', seriesTicker: 'KXMLSGAME', category: 'Soccer', icon: 'soccer' },
  { id: 'epl', label: 'EPL', seriesTicker: 'KXEPLGAME', category: 'Soccer', icon: 'soccer' },
];

const TEAM_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#14b8a6',
  '#a855f7',
  '#f59e0b',
  '#22c55e',
  '#ec4899',
  '#38bdf8',
];

export function teamColor(name) {
  const key = String(name || '');
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return TEAM_COLORS[hash % TEAM_COLORS.length];
}

export function findSport(id) {
  return SPORTS.find((s) => s.id === id) ?? SPORTS[0];
}

function dollars(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function volumeDollars(markets) {
  return markets.reduce((sum, m) => {
    const raw = m.volume_fp ?? m.volume ?? 0;
    return sum + (Number(raw) || 0);
  }, 0);
}

/** Turn a Kalshi event + nested markets into a sportsbook card. */
export function toGame(event, sport) {
  const markets = (event.markets ?? [])
    .filter((m) => m.status === 'active' || m.status === 'open' || !m.status)
    .map((m) => {
      const yesAsk =
        dollars(m.yes_ask_dollars) ??
        (dollars(m.yes_ask) != null ? dollars(m.yes_ask) / 100 : null);
      const noAsk = dollars(m.no_ask_dollars) ?? (yesAsk != null ? 1 - yesAsk : null);
      const name = m.yes_sub_title || m.title || 'Yes';
      return {
        ticker: m.ticker,
        name,
        title: m.title,
        color: teamColor(name),
        yesAsk,
        noAsk,
        yesBid: dollars(m.yes_bid_dollars),
        last: dollars(m.last_price_dollars),
      };
    });

  return {
    eventTicker: event.event_ticker,
    title: event.title,
    sportId: sport.id,
    category: sport.category,
    icon: sport.icon,
    strikeDate: event.strike_date || event.last_updated_ts || null,
    volume: volumeDollars(event.markets ?? []),
    markets,
  };
}
