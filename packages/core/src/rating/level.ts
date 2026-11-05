import { clip, piecewiseLinear } from "./stats.ts";
import type { LevelAnchors } from "./types.ts";

/**
 * Absolute anchors for seasons with the 2 500-RS league steps (S4, S5, S8, S10, S11, S12: verified
 * on observed minima on 2026-11-05; Platinum 4 at 30 000 is extrapolated with the same step).
 */
export const RS_ANCHORS_STANDARD: LevelAnchors = {
  rs: [
    [30_000, 50], // Platinum 4 (extrapolated)
    [35_000, 62], // Platinum 2
    [37_500, 68], // Platinum 1
    [40_000, 74], // Diamond 4
    [42_500, 78], // Diamond 3
    [45_000, 82], // Diamond 2
    [47_500, 86], // Diamond 1
  ],
  topScore: 99,
};

/** Season 3 used 5 000-RS steps (Diamond 1 at 65 000); same A per league. */
export const RS_ANCHORS_S3: LevelAnchors = {
  rs: [
    [30_000, 50], // Platinum 4
    [35_000, 56], // Platinum 3
    [40_000, 62], // Platinum 2
    [45_000, 68], // Platinum 1
    [50_000, 74], // Diamond 4
    [55_000, 78], // Diamond 3
    [60_000, 82], // Diamond 2
    [65_000, 86], // Diamond 1
  ],
  topScore: 99,
};

/** Relative anchors on the rank, linear in log10(rank). */
export const RANK_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [1, 100],
  [10, 96],
  [100, 92],
  [500, 86],
  [1_000, 80],
  [2_500, 72],
  [5_000, 64],
  [10_000, 55],
];

export const RANK_FLOOR = 55;
export const LEADERBOARD_SIZE = 10_000;

/**
 * A: the Rank Score read against the league thresholds of the season, 0–99.
 * Above the last anchor the scale is logarithmic up to the #1 of the same snapshot (`topRs`).
 */
export function absoluteScale(rs: number, topRs: number, anchors: LevelAnchors = RS_ANCHORS_STANDARD): number {
  const first = anchors.rs[0]!;
  const last = anchors.rs[anchors.rs.length - 1]!;
  if (rs <= first[0]) return clip((rs / first[0]) * first[1], 0, first[1]);
  if (rs <= last[0]) return piecewiseLinear(anchors.rs, rs);
  // Early season: nobody above the last anchor yet, the logarithmic part has no range.
  if (topRs <= last[0]) return last[1];
  if (rs >= topRs) return anchors.topScore;
  const share = Math.log(rs / last[0]) / Math.log(topRs / last[0]);
  return clip(last[1] + (anchors.topScore - last[1]) * share, last[1], anchors.topScore);
}

/** R: the rank read on a log scale, 100 for #1 down to 55 for #10 000; never below 55. */
export function relativeScale(rank: number): number {
  if (rank <= 1) return 100;
  if (rank >= LEADERBOARD_SIZE) return RANK_FLOOR;
  const logPoints = RANK_ANCHORS.map(([r, v]) => [Math.log10(r), v] as const);
  return piecewiseLinear(logPoints, Math.log10(rank));
}

/** N = (A + R) / 2. */
export function level(rs: number, rank: number, topRs: number, anchors: LevelAnchors = RS_ANCHORS_STANDARD): number {
  return 0.5 * absoluteScale(rs, topRs, anchors) + 0.5 * relativeScale(rank);
}
