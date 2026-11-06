import { describe, expect, it } from "vitest";
import { clubPath, clubPosition, parseClubSort, sortClubs, summarizeClub } from "../../src/lib/clubs";
import { compareHref, compareMetrics, comparePlayer, parseCompare } from "../../src/lib/compare";
import { DEFAULT_BOARD } from "../../src/lib/boards";
import type { ClubRow, PlayerData } from "../../src/lib/types";

const club = (tag: string, total: number, members: number, bestRank: number, d7: number | null = null, name: string | null = null): ClubRow => ({
  tag,
  name,
  members,
  total,
  avg: Math.round(total / members),
  bestRank,
  bestName: `${tag}-best#0001`,
  bestLeague: 18,
  d7,
  d7Known: d7 === null ? 0 : members,
});

describe("clubs (synthetic data)", () => {
  const clubs = [club("AAA", 200_000, 5, 40, 500), club("BBB", 300_000, 8, 10, null, "Bravo Squad"), club("CCC", 90_000, 1, 3, 1200)];

  it("sorts by combined RS by default and by the other keys on demand", () => {
    expect(sortClubs(clubs, "total").map((c) => c.tag)).toEqual(["BBB", "AAA", "CCC"]);
    expect(sortClubs(clubs, "avg").map((c) => c.tag)).toEqual(["CCC", "AAA", "BBB"]);
    expect(sortClubs(clubs, "members").map((c) => c.tag)).toEqual(["BBB", "AAA", "CCC"]);
    expect(sortClubs(clubs, "best").map((c) => c.tag)).toEqual(["CCC", "BBB", "AAA"]);
    // Variation inconnue en dernier.
    expect(sortClubs(clubs, "d7").map((c) => c.tag)).toEqual(["CCC", "AAA", "BBB"]);
  });

  it("filters by tag or official name, case-insensitive, and parses the sort safely", () => {
    expect(sortClubs(clubs, "total", "bravo").map((c) => c.tag)).toEqual(["BBB"]);
    expect(sortClubs(clubs, "total", "cc").map((c) => c.tag)).toEqual(["CCC"]);
    expect(parseClubSort("avg")).toBe("avg");
    expect(parseClubSort("drop table")).toBe("total");
    expect(parseClubSort(undefined)).toBe("total");
  });

  it("gives the club position and summarizes members", () => {
    expect(clubPosition(clubs, "AAA")).toBe(2);
    expect(clubPosition(clubs, "ZZZ")).toBeNull();
    const s = summarizeClub([
      { rank: 12, name: "A#0001", score: 50_000, league: 20, d24: 100, d7: 400 },
      { rank: 700, name: null, score: 44_000, league: 19, d24: null, d7: null },
      { rank: 3_000, name: "C#0003", score: 38_000, league: 16, d24: -50, d7: -100 },
    ]);
    expect(s).toMatchObject({ members: 3, total: 132_000, avg: 44_000, bestRank: 12, d7: 300, d7Known: 2, inTop500: 1 });
    expect(s.leagues.map((l) => l.league)).toEqual([20, 19, 16]);
    expect(summarizeClub([])).toMatchObject({ members: 0, avg: null, bestRank: null, d7: null });
    expect(clubPath("A/B")).toBe("/clubs/A%2FB");
  });
});

function player(name: string, opts: { rank?: number; score?: number; league?: number; d24?: number | null; seasons?: PlayerData["seasons"]; r500?: number }): PlayerData {
  const current =
    opts.rank === undefined
      ? []
      : [{ leaderboardId: DEFAULT_BOARD.id, rank: opts.rank, score: opts.score ?? 40_000, league: opts.league ?? 18, club: null, d24: opts.d24 ?? null, d7: null, updatedAt: "2026-11-06T17:00:00Z", lastChangeAt: "2026-11-06T16:00:00Z", firstSeenAt: "2026-11-05T22:00:00Z" }];
  return {
    id: name,
    name,
    hidden: false,
    platforms: { steam: null, psn: null, xbox: null },
    firstSeenAt: "2026-11-05T22:00:00Z",
    lastSeenAt: "2026-11-06T17:00:00Z",
    current,
    seasons: opts.seasons ?? [],
    formerNames: [],
    live: {
      leaderboardId: DEFAULT_BOARD.id,
      takenAt: "2026-11-06T17:00:00Z",
      historyStart: "2026-11-05",
      series: opts.score ? [{ t: "2026-11-05T23:59:59.000Z", score: opts.score - 500, rank: (opts.rank ?? 1) + 50, league: 18, kind: "close" }, { t: "2026-11-06T17:00:00.000Z", score: opts.score, rank: opts.rank ?? null, league: 18, kind: "now" }] : [{ t: "2026-11-05T23:59:59.000Z", score: 30_000, rank: 9_990, league: 13, kind: "close" }],
      activity: [{ day: "2026-11-06", changes: 4 }],
      cutoff: { takenAt: "2026-11-06T17:00:00Z", rank500: opts.r500 ?? 46_000, last: 34_500, rank1: 63_800, rowCount: 10_000, leagueCounts: [] },
    },
  };
}

describe("compare (synthetic data)", () => {
  it("parses up to 4 distinct slugs from the URL and builds a shareable href", () => {
    expect(parseCompare("GOJO-6255,Autre-1234")).toEqual(["GOJO-6255", "Autre-1234"]);
    expect(parseCompare("a-0001,A-0001,b-0002, ,c-0003,d-0004,e-0005")).toEqual(["a-0001", "b-0002", "c-0003", "d-0004"]);
    expect(parseCompare(["a-0001", "b-0002"])).toEqual(["a-0001", "b-0002"]);
    expect(parseCompare(undefined)).toEqual([]);
    expect(compareHref(["GOJO-6255", "Autre Nom-1234"])).toBe("/compare?p=GOJO-6255,Autre%20Nom-1234");
    expect(compareHref([])).toBe("/compare");
  });

  it("highlights the best value per row, lower is better for ranks and gaps", () => {
    const now = Date.parse("2026-11-06T17:30:00Z");
    const players = [
      comparePlayer("a", player("Fictif-A#0001", { rank: 7_683, score: 35_521, league: 14, d24: 200, seasons: [{ leaderboardId: 1400, rank: 450, score: 52_000, league: 21, club: null }] })),
      comparePlayer("b", player("Fictif-B#0002", { rank: 120, score: 52_000, league: 20, d24: -80 })),
      comparePlayer("c", player("Fictif-C#0003", {})),
      comparePlayer("d", null),
    ];
    expect(players.map((p) => p.ranked)).toEqual([true, true, false, false]);
    expect(players[2]!.lastSeen?.score).toBe(30_000);
    const m = Object.fromEntries(compareMetrics(players, now).map((x) => [x.key, x]));
    expect(m.rank!.values).toEqual([7_683, 120, null, null]);
    expect(m.rank!.best).toEqual([1]);
    expect(m.rs!.best).toEqual([1]);
    expect(m.d24!.best).toEqual([0]);
    expect(m.gap500!.values).toEqual([46_000 - 35_521, 0, null, null]);
    expect(m.gap500!.best).toEqual([1]);
    expect(m.bestRank!.values[0]).toBe(450);
    expect(m.top500!.values.slice(0, 2)).toEqual([1, 0]);
    // Une seule valeur connue : rien à surligner.
    expect(m.bestRank!.best).toEqual([]);
    // Égalité parfaite : rien à surligner non plus.
    expect(m.active7!.values.slice(0, 3)).toEqual([1, 1, 1]);
    expect(m.active7!.best).toEqual([]);
  });
});
