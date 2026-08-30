/** Convert a Kalshi contract price in dollars (0–1) to American odds. */
export function dollarsToAmerican(dollars) {
  const price = Number(dollars);
  if (!Number.isFinite(price) || price <= 0 || price >= 1) {
    throw new Error(`Invalid contract price: ${dollars}`);
  }
  const decimal = 1 / price;
  if (decimal >= 2) {
    return Math.round((decimal - 1) * 100);
  }
  return Math.round(-100 / (decimal - 1));
}

/** Format a 0–1 dollar price as a Kalshi-style percent, e.g. 0.32 → "32%". */
export function dollarsToPercentLabel(dollars) {
  const price = Number(dollars);
  if (!Number.isFinite(price) || price < 0) return '—';
  return `${Math.round(price * 100)}%`;
}

/** Parse a user percent (32 or "32%") or dollar string ("0.32") into dollars. */
export function parsePriceDollars(input) {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input > 1 ? input / 100 : input;
  }
  const raw = String(input ?? '').trim().replace('%', '');
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid price: ${input}`);
  }
  return n > 1 ? n / 100 : n;
}

/**
 * Build the V2 event-order payload for a buy.
 * Buying Yes = bid on the Yes book. Buying No = ask on the Yes book at 1 − noPrice.
 */
export function buildBuyOrder({ ticker, side, count, priceDollars, orderType }) {
  const contracts = Number(count);
  if (!Number.isFinite(contracts) || contracts <= 0) {
    throw new Error('Contracts must be greater than 0.');
  }
  const price = Number(priceDollars);
  if (!Number.isFinite(price) || price <= 0 || price >= 1) {
    throw new Error('Price must be between 1¢ and 99¢.');
  }
  const buySide = String(side).toLowerCase();
  if (buySide !== 'yes' && buySide !== 'no') {
    throw new Error('Side must be yes or no.');
  }

  const isQuick = String(orderType).toLowerCase() === 'quick';
  return {
    ticker,
    side: buySide === 'yes' ? 'bid' : 'ask',
    count: contracts.toFixed(2),
    price: (buySide === 'yes' ? price : 1 - price).toFixed(4),
    time_in_force: isQuick ? 'immediate_or_cancel' : 'good_till_canceled',
    self_trade_prevention_type: 'taker_at_cross',
  };
}

/** Cost to buy `count` contracts at `priceDollars`. */
export function orderCost(count, priceDollars) {
  return round(Number(count) * Number(priceDollars), 2);
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
