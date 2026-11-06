import { describe, expect, it } from "vitest";
import { calibrationReadyAt, observedDays, peakLevel, ratePopulation, type PlayerInput } from "./population.ts";
import { level, RS_ANCHORS_STANDARD } from "./level.ts";
import type { RsPoint } from "./types.ts";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 11, 6, 20, 0, 0);

/** Daily history over `days` days ending now: rs(d) for d = days … 0 (days ago). */
function daily(days: number, rsAt: (daysAgo: number) => number, rank = 5_000): RsPoint[] {
  const out: RsPoint[] = [];
  for (let d = days; d >= 0; d--) out.push({ at: NOW - d * DAY, rs: Math.round(rsAt(d)), rank });
  return out;
}

function player(id: string, history: RsPoint[], rank: number, extra: Partial<PlayerInput> = {}): PlayerInput {
  const last = history[history.length - 1]!;
  return { playerId: id, history, rs: last.rs, rank, outcomes: [], recentDeltas: [], ...extra };
}

/** 40 ordinary players: +100 to +490 RS a day for 35 days, a small dip every 4th day. */
function crowd(): PlayerInput[] {
  return Array.from({ length: 40 }, (_, i) => {
    const slope = 100 + 10 * i;
    return player(`p${i}`, daily(35, (d) => 36_000 + (35 - d) * slope - (d % 4 === 0 ? 150 : 0)), 3_000 + i * 100);
  });
}

describe("ratePopulation", () => {
  const climber = player("climber", daily(35, (d) => 40_000 + (35 - d) * 900), 800);
  const yoyo = player("yoyo", daily(35, (d) => 44_000 + (d % 2 === 0 ? 1_500 : -1_500)), 700);
  const idle = player("idle", daily(35, () => 46_000), 400, {
    outcomes: [{ seasonId: "s10", finalRank: 50, leagueNumber: 21, hasComparableLeagues: true }],
  });
  const fresh = player("fresh", [{ at: NOW - 2 * 3_600_000, rs: 35_000, rank: 9_000 }, { at: NOW, rs: 35_400, rank: 8_900 }], 8_900);
  const booster = player("booster", daily(35, () => 41_000), 1_500, { recentDeltas: [9_000] });
  const all = [...crowd(), climber, yoyo, idle, fresh, booster];
  const deltas = Array.from({ length: 2_000 }, (_, i) => ((i % 40) - 15) * 10).concat([9_000]);
  const result = ratePopulation(all, NOW, { snapshotDeltas: deltas });
  const by = (id: string) => result.players.find((p) => p.playerId === id)!;

  it("measures the references on active players only", () => {
    expect(result.references.momentum.h24?.n).toBe(41); // crowd (p5 nets 0 today), climber, yo-yo; idle and booster did not move, fresh has no start
    expect(result.references.momentum.d30?.n).toBe(41); // the yo-yo is back where it was 30 days ago
    expect(result.references.drawdown?.n).toBe(42); // crowd, climber, yo-yo; fresh lacks 10 active days, idle and booster never moved
    expect(result.references.anomalyThreshold).not.toBeNull();
    expect(result.references.topRs).toBe(71_500); // the climber
  });

  it("rates the climber above the yo-yo on momentum and consistency", () => {
    expect(by("climber").momentum!).toBeGreaterThan(by("yoyo").momentum!);
    expect(by("climber").consistency!).toBeGreaterThanOrEqual(50); // tied at 0 drawdown with most of the crowd
    expect(by("yoyo").consistency!).toBeLessThan(by("climber").consistency!);
    expect(by("climber").hotStreak).toBe(true);
  });

  it("keeps an idle veteran provisional, with legacy and a full level", () => {
    const v = by("idle");
    expect(v.consistency).toBeNull();
    expect(v.provisional).toBe(true);
    expect(v.legacy).toBeGreaterThan(40);
    expect(v.level).toBeCloseTo(level(46_000, 400, 71_500), 6);
  });

  it("has no momentum window for a player seen only today", () => {
    const f = by("fresh");
    expect(f.momentum).toBeNull();
    expect(f.deltas).toEqual({ h24: null, d7: null, d30: null });
    expect(f.rating).not.toBeNull(); // the level alone still gives a provisional value
    expect(f.provisional).toBe(true);
  });

  it("flags an unusual jump without touching the rating", () => {
    const b = by("booster");
    expect(b.anomalies).toBe(1);
    const clean = ratePopulation(all.map((p) => (p.playerId === "booster" ? { ...p, recentDeltas: [] } : p)), NOW, { snapshotDeltas: deltas });
    expect(clean.players.find((p) => p.playerId === "booster")!.raw).toBe(b.raw);
  });

  it("caps every rating at 99 and keeps them integers", () => {
    for (const p of result.players) {
      if (p.rating === null) continue;
      expect(Number.isInteger(p.rating)).toBe(true);
      expect(p.rating).toBeLessThanOrEqual(99);
    }
  });
});

describe("peak and calibration helpers", () => {
  it("reads the peak on the best point of the season, never below the current level", () => {
    const h: RsPoint[] = [{ at: 0, rs: 45_000, rank: 500 }, { at: 1, rs: 41_000, rank: 2_000 }];
    const current = level(41_000, 2_000, 60_000);
    expect(peakLevel(h, current, 60_000, RS_ANCHORS_STANDARD)).toBeCloseTo(level(45_000, 500, 60_000), 6);
    expect(peakLevel([], current, 60_000, RS_ANCHORS_STANDARD)).toBe(current);
  });
  it("counts observed days from the first snapshot", () => {
    const first = Date.UTC(2026, 10, 5, 22, 5);
    expect(observedDays(first, first + 1.5 * DAY)).toBeCloseTo(1.5, 6);
    expect(observedDays(null, first)).toBe(0);
    expect(new Date(calibrationReadyAt(first)).toISOString()).toBe("2026-11-12T22:05:00.000Z");
  });
});
