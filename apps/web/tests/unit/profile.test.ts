import { leaderboardByKey } from "@finals-hq/db/catalog";
import { describe, expect, it } from "vitest";
import { activeDays, career, DAY_MS, daysSince, heatLevel, heatmap, peak, rankDelta, seriesInRange, top500Entry, topPercent, windowDelta } from "../../src/lib/profile";
import { parseFollowing } from "../../src/lib/following";
import type { ProfilePoint } from "../../src/lib/types";

const P = (t: string, score: number | null, rank: number | null, kind: ProfilePoint["kind"] = "event"): ProfilePoint => ({ t, score, rank, league: 15, kind });

/** Données fictives : trois jours de relevés. */
const series: ProfilePoint[] = [
  P("2026-11-05T23:59:59.000Z", 35_000, 8_000, "close"),
  P("2026-11-06T10:00:00.000Z", 35_300, 7_700),
  P("2026-11-06T12:00:00.000Z", 46_000, 480),
  P("2026-11-07T09:00:00.000Z", 45_800, 510),
  P("2026-11-07T10:00:00.000Z", 45_800, 505, "now"),
];
const now = Date.parse("2026-11-07T10:00:00Z");

describe("profile metrics (synthetic data)", () => {
  it("measures a window against the last point at or before its start, null when not observed", () => {
    expect(windowDelta(series, now, DAY_MS)).toBe(45_800 - 35_300);
    expect(windowDelta(series, now, 7 * DAY_MS)).toBeNull();
    expect(rankDelta(series, now, DAY_MS)).toBe(505 - 7_700);
  });

  it("finds the peak and the top 500 entry", () => {
    expect(peak(series)?.score).toBe(46_000);
    expect(top500Entry(series)?.t).toBe("2026-11-06T12:00:00.000Z");
    expect(top500Entry(series.slice(0, 2))).toBeNull();
  });

  it("starts a range at its left edge with the value held then", () => {
    const r = seriesInRange(series, "24h", now);
    expect(r[0]).toMatchObject({ t: "2026-11-06T10:00:00.000Z", score: 35_300 });
    expect(r).toHaveLength(4);
    expect(seriesInRange(series, "season", now)).toHaveLength(5);
  });

  it("counts active days against the days actually observed", () => {
    const activity = [{ day: "2026-11-06", changes: 2 }, { day: "2026-11-07", changes: 1 }];
    expect(activeDays(activity, "2026-11-05", now, 7)).toEqual({ active: 2, observed: 3 });
    expect(activeDays(activity, null, now, 7)).toEqual({ active: 2, observed: 0 });
  });

  it("hatches the days before collection in the heatmap", () => {
    const days = heatmap([{ day: "2026-11-06", changes: 12 }], "2026-11-05", now, 4);
    expect(days.map((d) => d.level)).toEqual([-1, 0, 5, 0]);
    expect([0, 1, 2, 4, 7, 11].map(heatLevel)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("formats top share and inactivity", () => {
    expect(topPercent(7_703, 10_000)).toBe(78);
    expect(topPercent(1, 10_000)).toBe(1);
    expect(daysSince("2026-11-04T09:00:00Z", now)).toBe(3);
  });
});

describe("career from the archives (synthetic data)", () => {
  const id = (k: string) => leaderboardByKey(k)!.id;
  it("keeps the best ranked result per season, records, badges and legacy", () => {
    const c = career([
      { leaderboardId: id("s11-crossplay"), rank: 80, score: 60_000, league: 21, club: null },
      { leaderboardId: id("s11worldtour-crossplay"), rank: 300, score: 1_000_000, league: null, club: null },
      { leaderboardId: id("s10-crossplay"), rank: 2_000, score: 42_000, league: 18, club: null },
      { leaderboardId: id("s1-steam"), rank: 900, score: 5_000_000, league: 12, club: null },
      { leaderboardId: id("s1-psn"), rank: 50, score: 4_000_000, league: 15, club: null },
    ]);
    expect(c.seasons.map((s) => s.seasonId)).toEqual(["s11", "s10", "s1"]);
    expect(c.seasons[0]!.others).toHaveLength(1);
    expect(c.seasons[2]!.ranked).toMatchObject({ rank: 50, platform: "psn" });
    // S11 top 100 = 140, S10 Diamond = 60, S1 sans ligues comparables = 10.
    expect(c.legacy.points).toBe(210);
    expect(c.legacy.value).toBeCloseTo(100 * (1 - Math.exp(-210 / 250)), 6);
    expect(c.records.bestRank).toEqual({ rank: 50, seasonId: "s1" });
    expect(c.records.bestScore).toEqual({ score: 60_000, seasonId: "s11" });
    expect(c.records.bestLeague).toEqual({ league: 21, seasonId: "s11" });
    expect(c.badges).toMatchObject({ top100: 2, top500: 2, ruby: 1, seasonsPlayed: 3, first: 0 });
  });
});

describe("following list parsing", () => {
  it("accepts the export file and plain arrays, drops junk and duplicates", () => {
    expect(parseFollowing(JSON.stringify({ app: "finals-hq", players: [{ id: "12", name: "A#0001" }, { id: 12, name: "dup" }, { id: "x", name: "bad" }] }))).toEqual([{ id: "12", name: "A#0001" }]);
    expect(parseFollowing("not json")).toEqual([]);
    expect(parseFollowing(null)).toEqual([]);
  });
});
