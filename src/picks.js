// A small in-memory "model" of today's suggested picks. In a real bot these
// would come from a data feed / prediction model; here they are deterministic
// sample data so the environment can be demonstrated end to end offline.
import { impliedProbability } from './odds.js';

const RAW_PICKS = [
  { id: 'nba-1', league: 'NBA', matchup: 'Celtics vs. Heat', selection: 'Celtics ML', american: -145, confidence: 0.62 },
  { id: 'nba-2', league: 'NBA', matchup: 'Nuggets vs. Suns', selection: 'Over 228.5', american: -110, confidence: 0.55 },
  { id: 'nfl-1', league: 'NFL', matchup: 'Eagles vs. Cowboys', selection: 'Eagles -3.5', american: -105, confidence: 0.58 },
  { id: 'nfl-2', league: 'NFL', matchup: 'Chiefs vs. Bills', selection: 'Chiefs +2.5', american: +120, confidence: 0.51 },
  { id: 'mlb-1', league: 'MLB', matchup: 'Dodgers vs. Padres', selection: 'Dodgers ML', american: -130, confidence: 0.6 },
  { id: 'nhl-1', league: 'NHL', matchup: 'Oilers vs. Kings', selection: 'Oilers ML', american: +105, confidence: 0.53 },
];

/** Return all picks, enriched with implied (market) probability. */
export function listPicks() {
  return RAW_PICKS.map((p) => ({
    ...p,
    impliedProbability: round(impliedProbability(p.american), 4),
    edge: round(p.confidence - impliedProbability(p.american), 4),
  }));
}

/**
 * Suggest a parlay of `size` picks with the highest model edge
 * (model confidence minus market implied probability).
 */
export function suggestParlay(size = 3) {
  const n = Math.max(1, Math.min(Number(size) || 3, RAW_PICKS.length));
  return listPicks()
    .sort((a, b) => b.edge - a.edge)
    .slice(0, n);
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
