import type { ComponentKey, RatingComponents, RatingResult } from "./types.ts";

export const RATING_VERSION = "1.0.0";

export const RATING_WEIGHTS: Record<ComponentKey, number> = {
  level: 0.7,
  peak: 0.1,
  momentum: 0.1,
  consistency: 0.05,
  legacy: 0.05,
};

export const RATING_CAP = 99;

const KEYS: ComponentKey[] = ["level", "peak", "momentum", "consistency", "legacy"];

/**
 * Weighted mean of the available components, weights renormalised over what is available,
 * rounded and capped at 99. The rating is provisional while momentum or consistency is missing.
 * A missing peak falls back to the level (the peak is at least the current level).
 */
export function combineRating(components: RatingComponents): RatingResult {
  if (components.level === null) {
    return { rating: null, raw: null, provisional: true, weightsUsed: {}, version: RATING_VERSION };
  }
  const filled: RatingComponents = { ...components, peak: components.peak ?? components.level };
  let weighted = 0;
  let weightSum = 0;
  const weightsUsed: Partial<Record<ComponentKey, number>> = {};
  for (const key of KEYS) {
    const value = filled[key];
    if (value === null) continue;
    weighted += RATING_WEIGHTS[key] * value;
    weightSum += RATING_WEIGHTS[key];
  }
  const raw = weighted / weightSum;
  for (const key of KEYS) {
    if (filled[key] !== null) weightsUsed[key] = RATING_WEIGHTS[key] / weightSum;
  }
  return {
    rating: Math.min(RATING_CAP, Math.round(raw)),
    raw,
    provisional: filled.momentum === null || filled.consistency === null,
    weightsUsed,
    version: RATING_VERSION,
  };
}
