// Pure helpers for converting and combining sports-betting odds.
// American ("moneyline") odds are the source of truth throughout the app.

/** Convert American odds (e.g. -150, +200) to a decimal multiplier (>= 1). */
export function americanToDecimal(american) {
  const odds = Number(american);
  if (!Number.isFinite(odds) || odds === 0) {
    throw new Error(`Invalid American odds: ${american}`);
  }
  if (odds > 0) {
    return 1 + odds / 100;
  }
  return 1 + 100 / Math.abs(odds);
}

/** Convert a decimal multiplier back to American odds (rounded to an integer). */
export function decimalToAmerican(decimal) {
  const d = Number(decimal);
  if (!Number.isFinite(d) || d <= 1) {
    throw new Error(`Invalid decimal odds: ${decimal}`);
  }
  if (d >= 2) {
    return Math.round((d - 1) * 100);
  }
  return Math.round(-100 / (d - 1));
}

/** Implied win probability (0..1) for the given American odds. */
export function impliedProbability(american) {
  return 1 / americanToDecimal(american);
}

/**
 * Combine a list of legs into a parlay.
 * @param {Array<{american:number}>} legs
 * @param {number} stake dollars risked
 * @returns {{decimal:number, american:number, impliedProbability:number, stake:number, payout:number, profit:number, legs:number}}
 */
export function calculateParlay(legs, stake = 10) {
  if (!Array.isArray(legs) || legs.length === 0) {
    throw new Error('A parlay needs at least one leg.');
  }
  const wager = Number(stake);
  if (!Number.isFinite(wager) || wager <= 0) {
    throw new Error(`Invalid stake: ${stake}`);
  }

  const combinedDecimal = legs.reduce(
    (acc, leg) => acc * americanToDecimal(leg.american),
    1,
  );

  const payout = wager * combinedDecimal;
  return {
    legs: legs.length,
    decimal: round(combinedDecimal, 4),
    american: decimalToAmerican(combinedDecimal),
    impliedProbability: round(1 / combinedDecimal, 4),
    stake: round(wager, 2),
    payout: round(payout, 2),
    profit: round(payout - wager, 2),
  };
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
