import type { SeasonOutcome } from "./types.ts";

export const LEGACY_SCALE = 250;
export const LEGACY_POINTS = {
  top500: 100,
  top100Bonus: 40,
  firstBonus: 60,
  diamond: 60,
  platinum: 30,
  presence: 10,
} as const;

/** Points of one finished season. Only ranked leaderboards count in v1. */
export function seasonPoints(outcome: SeasonOutcome): number {
  if (outcome.finalRank < 1) return 0;
  if (!outcome.hasComparableLeagues) return outcome.finalRank <= 10_000 ? LEGACY_POINTS.presence : 0;
  if (outcome.finalRank <= 500) {
    let points: number = LEGACY_POINTS.top500;
    if (outcome.finalRank <= 100) points += LEGACY_POINTS.top100Bonus;
    if (outcome.finalRank === 1) points += LEGACY_POINTS.firstBonus;
    return points;
  }
  const league = outcome.leagueNumber ?? 0;
  if (league >= 17) return LEGACY_POINTS.diamond;
  if (league >= 13) return LEGACY_POINTS.platinum;
  return outcome.finalRank <= 10_000 ? LEGACY_POINTS.presence : 0;
}

/** L = 100 × (1 − e^(−points / 250)); 0 without any finished season. */
export function legacy(outcomes: readonly SeasonOutcome[]): number {
  const total = outcomes.reduce((sum, outcome) => sum + seasonPoints(outcome), 0);
  return 100 * (1 - Math.exp(-total / LEGACY_SCALE));
}
