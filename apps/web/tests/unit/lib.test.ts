import { LEADERBOARDS } from "@finals-hq/db/catalog";
import { describe, expect, it } from "vitest";
import { boardFromSegments, boardPath, DEFAULT_BOARD, seasonGroups } from "../../src/lib/boards";
import { formatNumber, formatRank, formatRelative, formatSigned, freshness } from "../../src/lib/format";
import { league, leagueFromSlug } from "../../src/lib/league";
import { namesFromSlug, playerSlug, splitName } from "../../src/lib/players";
import { createLimiter } from "../../src/lib/ratelimit";
import { DEFAULT_STATE, median, parseTableState, serializeTableState, viewIndices } from "../../src/lib/table-state";
import type { BoardColumns } from "../../src/lib/types";

describe("board addresses", () => {
  it("gives every catalog board a unique, reversible address", () => {
    const paths = LEADERBOARDS.map(boardPath);
    expect(new Set(paths).size).toBe(LEADERBOARDS.length);
    for (const lb of LEADERBOARDS) {
      const [, , season, board] = boardPath(lb).split("/");
      expect(boardFromSegments(season!, board!)?.id).toBe(lb.id);
    }
    expect(boardPath(DEFAULT_BOARD)).toBe("/leaderboards/s12/ranked");
    expect(boardFromSegments("s1", "ranked-steam")?.key).toBe("s1-steam");
    expect(boardFromSegments("events", "ce44")?.id).toBe(9044);
    expect(boardFromSegments("s12", "nope")).toBeUndefined();
    expect(seasonGroups()[0]!.id).toBe("s12");
  });
});

describe("formats (phase E)", () => {
  it("uses the narrow no-break space in French and commas in English", () => {
    expect(formatNumber(35521, "fr")).toBe("35 521");
    expect(formatNumber(35521, "en")).toBe("35,521");
    expect(formatRank(7703, "fr")).toBe("n° 7 703");
    expect(formatRank(7703, "en")).toBe("#7,703");
    expect(formatSigned(-1234, "fr")).toBe("−1 234");
    expect(formatSigned(1234, "en")).toBe("+1,234");
  });
  it("is relative under 24 h and grades freshness at 30 min and 3 h", () => {
    const now = new Date("2026-11-06T12:00:00Z");
    expect(formatRelative(new Date("2026-11-06T11:48:00Z"), now, "fr")).toMatch(/^il y a 12\s?min$/u);
    expect(freshness(new Date("2026-11-06T11:40:00Z"), now)).toBe("fresh");
    expect(freshness(new Date("2026-11-06T10:00:00Z"), now)).toBe("stale");
    expect(freshness(new Date("2026-11-06T08:00:00Z"), now)).toBe("outdated");
    expect(freshness(null, now)).toBe("unknown");
  });
});

describe("leagues and player slugs", () => {
  it("maps league numbers to game names and URL slugs", () => {
    expect(league(15)).toMatchObject({ name: "Platinum 2", short: "P2", slug: "p2", tier: "platinum" });
    expect(league(20)?.name).toBe("Diamond 1");
    expect(league(21)?.name).toBe("Ruby");
    expect(league(0)).toBeNull();
    expect(leagueFromSlug("D1")?.number).toBe(20);
  });
  it("turns GOJO#6255 into GOJO-6255 and back", () => {
    expect(playerSlug("GOJO#6255")).toBe("GOJO-6255");
    expect(namesFromSlug("GOJO-6255")).toEqual(["GOJO#6255", "GOJO-6255"]);
    expect(namesFromSlug(playerSlug("a b#0001"))).toContain("a b#0001");
    expect(namesFromSlug("%E0%A4%A")).toEqual([]);
    expect(splitName("GOJO#6255")).toEqual({ base: "GOJO", tag: "#6255" });
  });
});

describe("table state", () => {
  const rows: BoardColumns = {
    rank: [1, 2, 3, 4],
    name: ["Alpha#0001", "bravo#0002", null, "Delta#0004"],
    score: [500, 400, 300, 200],
    league: [20, 20, 19, 18],
    club: ["AAA", null, "aaa", "BBB"],
    d24: [10, null, -5, 30],
    d7: [null, null, null, null],
  };
  it("round-trips through the URL and ignores invalid values", () => {
    const s = parseTableState(new URLSearchParams("league=d1&club=AAA&sort=change24h&page=3&order=sideways"), { hasDeltas: true, hasLeagues: true });
    expect(s).toEqual({ league: 20, club: "AAA", q: "", sort: "change24h", order: "desc", page: 3 });
    expect(serializeTableState(s, (n) => league(n)!.slug)).toBe("?league=d1&club=AAA&sort=change24h&page=3");
    expect(parseTableState(new URLSearchParams("sort=change7d"), { hasDeltas: false, hasLeagues: false }).sort).toBe("rank");
    expect(serializeTableState(DEFAULT_STATE, String)).toBe("");
  });
  it("filters by league, club (case-insensitive) and name, then sorts with unknowns last", () => {
    expect(viewIndices(rows, { ...DEFAULT_STATE, league: 20 })).toEqual([0, 1]);
    expect(viewIndices(rows, { ...DEFAULT_STATE, club: "aaa" })).toEqual([0, 2]);
    expect(viewIndices(rows, { ...DEFAULT_STATE, q: "BRA" })).toEqual([1]);
    expect(viewIndices(rows, { ...DEFAULT_STATE, sort: "change24h", order: "desc" })).toEqual([3, 0, 2, 1]);
    expect(viewIndices(rows, { ...DEFAULT_STATE, sort: "change24h", order: "asc" })).toEqual([2, 0, 3, 1]);
    expect(viewIndices(rows, { ...DEFAULT_STATE, sort: "name", order: "asc" })).toEqual([0, 1, 3, 2]);
    expect(viewIndices(rows, { ...DEFAULT_STATE, order: "desc" })).toEqual([3, 2, 1, 0]);
    expect(median([3, 1, 2, 10])).toBe(3);
  });
});

describe("rate limiter", () => {
  it("allows N requests per window then asks to wait", () => {
    const l = createLimiter(2, 60_000);
    expect(l.check("ip", 0)).toBeNull();
    expect(l.check("ip", 1000)).toBeNull();
    expect(l.check("ip", 2000)).toBe(58);
    expect(l.check("other", 2000)).toBeNull();
    expect(l.check("ip", 61_000)).toBeNull();
  });
});
