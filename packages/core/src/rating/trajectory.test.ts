import { describe, expect, it } from "vitest";
import { anomalyThreshold, isAnomalous } from "./anomaly.ts";
import { consistency, dailyCloses, meanDrawdown } from "./consistency.ts";
import { legacy, seasonPoints } from "./legacy.ts";
import {
  activeDays,
  momentum,
  momentumFromZ,
  referenceFromDeltas,
  windowDelta,
  zScore,
} from "./momentum.ts";
import { combineRating } from "./rating.ts";
import type { RsPoint, SeasonOutcome } from "./types.ts";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 5, 22, 0, 0);

/** Builds a history from [daysAgo, rs] pairs. */
const history = (points: ReadonlyArray<readonly [number, number]>): RsPoint[] =>
  [...points]
    .map(([daysAgo, rs]) => ({ at: NOW - daysAgo * DAY, rs, rank: 5000 }))
    .sort((a, b) => a.at - b.at);

describe("momentum windows", () => {
  const steady = history([[31, 40_000], [8, 41_000], [2, 41_800], [0.5, 42_000], [0, 42_100]]);
  it("computes deltas against the last point at or before the window start", () => {
    expect(windowDelta(steady, NOW, DAY)).toBe(300); // vs the point 2 d ago (last one before the window)
    expect(windowDelta(steady, NOW, 7 * DAY)).toBe(1_100); // vs the point 8 d ago
    expect(windowDelta(steady, NOW, 30 * DAY)).toBe(2_100); // vs the point 31 d ago
  });
  it("is unavailable when the player was not visible at the window start", () => {
    const fresh = history([[0.2, 36_000], [0, 36_300]]);
    expect(windowDelta(fresh, NOW, DAY)).toBeNull();
  });
  it("builds a robust reference from active players only", () => {
    const ref = referenceFromDeltas([0, 0, 0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, null]);
    expect(ref).toEqual({ median: 550, mad: 250, n: 10 });
    expect(referenceFromDeltas([100, 200])).toBeNull();
  });
  it("clips z at ±3 and ignores a degenerate reference", () => {
    const ref = { median: 500, mad: 100, n: 50 };
    expect(zScore(500, ref)).toBe(0);
    expect(zScore(100_000, ref)).toBe(3);
    expect(zScore(-100_000, ref)).toBe(-3);
    expect(zScore(900, { median: 0, mad: 0, n: 50 })).toBe(0);
    expect(zScore(900, null)).toBe(0);
  });
});

describe("momentum", () => {
  const refs = {
    h24: { median: 150, mad: 120, n: 3000 },
    d7: { median: 600, mad: 400, n: 5000 },
    d30: { median: 1500, mad: 900, n: 6000 },
  };
  it("maps z to 0–100 with 50 at the median", () => {
    expect(momentumFromZ(0)).toBe(50);
    expect(momentumFromZ(3)).toBeCloseTo(95.26, 1);
    expect(momentumFromZ(-3)).toBeCloseTo(4.74, 1);
  });
  it("gives a hot streak to a player climbing fast on several days", () => {
    const climber = history([[31, 40_000], [8, 41_000], [6, 41_600], [4, 42_300], [2, 43_000], [0.5, 43_600], [0, 43_900]]);
    const result = momentum(climber, NOW, refs);
    expect(result.availableWindows).toEqual(["h24", "d7", "d30"]);
    expect(result.windows.d7.delta).toBe(2_900);
    expect(result.value!).toBeGreaterThan(85);
    expect(result.hotStreak).toBe(true);
  });
  it("drifts below 50 for an inactive player when the median active player climbs", () => {
    const inactive = history([[40, 44_000], [35, 44_000]]);
    const result = momentum(inactive, NOW, refs);
    expect(result.windows.d7.delta).toBe(0);
    expect(result.value!).toBeLessThan(50);
    expect(result.value!).toBeGreaterThan(20);
    expect(result.hotStreak).toBe(false);
  });
  it("renormalises weights over the available windows and is null without any", () => {
    const young = history([[8, 38_000], [2, 38_500], [0, 38_900]]);
    const result = momentum(young, NOW, refs);
    expect(result.availableWindows).toEqual(["h24", "d7"]);
    expect(result.windows.h24.delta).toBe(400);
    expect(result.windows.d7.delta).toBe(900);
    expect(result.windows.d30.delta).toBeNull();
    const z = (0.3 * result.windows.h24.z! + 0.5 * result.windows.d7.z!) / 0.8;
    expect(result.z).toBeCloseTo(z, 10);
    expect(momentum(history([[0, 38_000]]), NOW, refs).value).toBeNull();
    expect(momentum(history([[2, 38_000], [0, 38_900]]), NOW, refs).availableWindows).toEqual(["h24"]);
  });
  it("caps the gain of a single explosive day", () => {
    const spam = history([[31, 40_000], [8, 40_000], [1.1, 40_000], [0.5, 46_000], [0, 52_000]]);
    const result = momentum(spam, NOW, refs);
    expect(result.windows.h24.z).toBe(3);
    expect(result.value!).toBeLessThanOrEqual(95.3);
  });
  it("counts distinct active days, not changes", () => {
    const player = history([[6.5, 40_000], [6.2, 40_200], [6.1, 40_300], [3.1, 40_300], [3.0, 40_500], [0.4, 40_800]]);
    expect(activeDays(player, NOW, 7)).toBe(3); // 4 changes on 3 UTC days
    expect(activeDays(player, NOW, 2)).toBe(1);
  });
});

describe("consistency", () => {
  /** One session per day for `days` days: the closing RS of day d (counting back from today) is `rsOf(d)`. */
  const daily = (days: number, rsOf: (d: number) => number): RsPoint[] =>
    history(Array.from({ length: days }, (_, i) => [i + 0.1, rsOf(i)] as const));
  it("keeps the closing RS of active days only", () => {
    const player = history([[5.5, 40_000], [5.4, 40_200], [5.1, 40_300], [3.2, 40_300], [1.1, 40_100]]);
    const closes = dailyCloses(player, NOW);
    expect(closes.map((c) => c.close)).toEqual([40_300, 40_100]); // the day 3.2 d ago had no change
    expect(meanDrawdown(player, NOW)).toBeNull(); // fewer than ten active days
  });
  it("ignores days outside the window", () => {
    const player = history([[40, 40_000], [35, 41_000], [5.5, 41_000], [4.5, 41_300]]);
    expect(dailyCloses(player, NOW).map((c) => c.close)).toEqual([41_300]);
  });
  it("measures how far the player sits below their best of the month", () => {
    // The earliest point of a history is never an active day (no previous snapshot): 11 closes each.
    const climber = daily(12, (d) => 40_000 + (11 - d) * 100);
    const yoyo = daily(12, (d) => 42_000 + (d % 2 === 0 ? 1_000 : -1_000));
    const tilt = daily(12, (d) => 46_000 - (11 - d) * 300);
    expect(dailyCloses(climber, NOW)).toHaveLength(11);
    expect(meanDrawdown(climber, NOW)).toBe(0);
    expect(meanDrawdown(yoyo, NOW)).toBeCloseTo((5 * 2_000) / 11, 10); // five closes 2 000 below the best
    expect(meanDrawdown(tilt, NOW)).toBeCloseTo(1_500, 10); // 0, 300, …, 3 000
  });
  it("counts the RS at the start of the window as a best to defend", () => {
    const fell = history([[31, 45_000], ...Array.from({ length: 10 }, (_, i) => [i + 0.5, 44_000] as const).map(([d, rs], i) => [d, rs - i] as const)]);
    expect(meanDrawdown(fell, NOW)!).toBeGreaterThan(1_000);
  });
  it("ranks a steady player above a yo-yo player and gives the median player 50", () => {
    const population = [0, 50, 100, 200, 400, 800, 1_600].sort((a, b) => a - b);
    expect(consistency(0, population)).toBeCloseTo(100 - 100 / 14, 10); // mid-rank of the tie at 0
    expect(consistency(200, population)).toBe(50);
    expect(consistency(1_600, population)).toBeCloseTo(100 / 14, 10);
    expect(consistency(5_000, population)).toBe(0);
    expect(consistency(null, population)).toBeNull();
    expect(consistency(10, [])).toBeNull();
  });
});

describe("legacy", () => {
  const season = (finalRank: number, leagueNumber: number | null, comparable = true): SeasonOutcome => ({
    seasonId: "s11",
    finalRank,
    leagueNumber,
    hasComparableLeagues: comparable,
  });
  it("scores finishes", () => {
    expect(seasonPoints(season(1, 21))).toBe(200);
    expect(seasonPoints(season(50, 21))).toBe(140);
    expect(seasonPoints(season(500, 21))).toBe(100);
    expect(seasonPoints(season(2_000, 18))).toBe(60);
    expect(seasonPoints(season(8_000, 14))).toBe(30);
    expect(seasonPoints(season(9_999, 12))).toBe(10);
    expect(seasonPoints(season(5_000, null, false))).toBe(10);
    expect(seasonPoints(season(0, 21))).toBe(0);
  });
  it("saturates and never decreases", () => {
    expect(legacy([])).toBe(0);
    expect(Math.round(legacy([season(300, 21)]))).toBe(33);
    expect(Math.round(legacy([season(300, 21), season(300, 21), season(300, 21)]))).toBe(70);
    const five = Array.from({ length: 5 }, () => season(300, 21));
    expect(Math.round(legacy(five))).toBe(86);
    expect(legacy([...five, season(9_000, 14)])).toBeGreaterThan(legacy(five));
    expect(legacy(Array.from({ length: 50 }, () => season(1, 21)))).toBeLessThanOrEqual(100);
  });
});

describe("combineRating", () => {
  it("weights the five components", () => {
    const result = combineRating({ level: 80, peak: 85, momentum: 60, consistency: 50, legacy: 20 });
    expect(result.raw).toBeCloseTo(0.7 * 80 + 0.1 * 85 + 0.1 * 60 + 0.05 * 50 + 0.05 * 20, 10);
    expect(result.rating).toBe(74);
    expect(result.provisional).toBe(false);
    expect(result.weightsUsed.level).toBeCloseTo(0.7, 10);
  });
  it("renormalises over available components and flags provisional", () => {
    const result = combineRating({ level: 80, peak: null, momentum: null, consistency: null, legacy: 0 });
    expect(result.raw).toBeCloseTo((0.7 * 80 + 0.1 * 80 + 0.05 * 0) / 0.85, 10);
    expect(result.provisional).toBe(true);
    expect(result.weightsUsed.momentum).toBeUndefined();
    expect(result.weightsUsed.peak).toBeCloseTo(0.1 / 0.85, 10);
  });
  it("caps at 99 and returns null without a level", () => {
    expect(combineRating({ level: 99.5, peak: 99.5, momentum: 95, consistency: 99, legacy: 100 }).rating).toBe(99);
    expect(combineRating({ level: null, peak: 10, momentum: 10, consistency: 10, legacy: 10 }).rating).toBeNull();
  });
});

describe("anomaly", () => {
  it("flags only extreme deltas and needs a population", () => {
    const deltas = Array.from({ length: 1000 }, (_, i) => (i % 2 === 0 ? 1 : -1) * (100 + (i % 50) * 10));
    const threshold = anomalyThreshold(deltas)!;
    expect(threshold).toBeGreaterThanOrEqual(590);
    expect(isAnomalous(5_000, threshold)).toBe(true);
    expect(isAnomalous(300, threshold)).toBe(false);
    expect(anomalyThreshold([100, 200])).toBeNull();
    expect(isAnomalous(5_000, null)).toBe(false);
  });
});
