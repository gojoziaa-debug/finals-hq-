import { quantile } from "./stats.ts";

export const ANOMALY_QUANTILE = 0.999;

/** Threshold on |Δ| between two consecutive snapshots, from the population's non-zero deltas. */
export function anomalyThreshold(deltas: readonly number[], q: number = ANOMALY_QUANTILE): number | null {
  const magnitudes = deltas.filter((d) => d !== 0).map((d) => Math.abs(d));
  if (magnitudes.length < 100) return null;
  return quantile(magnitudes, q);
}

/** A change beyond the threshold is flagged for review; it never alters the rating by itself. */
export function isAnomalous(delta: number, threshold: number | null): boolean {
  return threshold !== null && Math.abs(delta) > threshold;
}
