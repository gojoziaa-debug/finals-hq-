import { queryRows } from "@finals-hq/db";
import { leaderboardByKey } from "@finals-hq/db/catalog";
import { createTestDb, type TestDb } from "@finals-hq/db/test";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cardPath, playerCardData } from "../../src/lib/cards";
import { parsePrivacyRequest, playerRefFromInput } from "../../src/lib/privacy-request";
import { loadSitemap } from "../../src/lib/queries";
import { alternates, indexable, legalIdentity, siteUrl } from "../../src/lib/site";
import { clubPaths, pagePaths, playerPaths, sitemapIndex, urlset } from "../../src/lib/sitemap";
import type { PlayerData } from "../../src/lib/types";
import { bumpUsage, insertHideRequest, isUsageEvent } from "../../src/lib/writes";

const LIVE = leaderboardByKey("s12-crossplay")!;

describe("site", () => {
  it("derives the public URL and only indexes the final domain in production", () => {
    expect(siteUrl({})).toBe("http://localhost:3000");
    expect(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "finals-hq-nine.vercel.app" })).toBe("https://finals-hq-nine.vercel.app");
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://finalshq.gg/", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" })).toBe("https://finalshq.gg");
    expect(indexable({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "finals-hq-nine.vercel.app" })).toBe(false);
    expect(indexable({ VERCEL_ENV: "preview", NEXT_PUBLIC_SITE_URL: "https://finalshq.gg" })).toBe(false);
    expect(indexable({ VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://finalshq.gg" })).toBe(true);
    expect(indexable({ HQ_INDEX: "1" })).toBe(true);
  });

  it("builds canonical and hreflang alternates with x-default", () => {
    expect(alternates("en", "/top-500")).toEqual({ canonical: "/en/top-500", languages: { fr: "/fr/top-500", en: "/en/top-500", "x-default": "/fr/top-500" } });
    expect(alternates("fr", "/").canonical).toBe("/fr");
  });

  it("reads the publisher identity from the environment only", () => {
    expect(legalIdentity({})).toEqual({ name: null, email: null, location: null });
    expect(legalIdentity({ LEGAL_NAME: " Maxime ", LEGAL_EMAIL: "x@y.z", LEGAL_LOCATION: "" })).toEqual({ name: "Maxime", email: "x@y.z", location: null });
  });
});

describe("hide request form", () => {
  const ok = { player: "GOJO#6255", contact: "gojo@example.com", owner: true };
  it("accepts an email or a Discord name and requires the owner box", () => {
    expect(parsePrivacyRequest(ok)).toMatchObject({ ok: true, value: { player: "GOJO#6255", locale: "fr", owner: true } });
    expect(parsePrivacyRequest({ ...ok, contact: "@gojo_edits", locale: "en" })).toMatchObject({ ok: true, value: { locale: "en" } });
    expect(parsePrivacyRequest({ ...ok, contact: "not an email" })).toEqual({ ok: false, error: "contact" });
    expect(parsePrivacyRequest({ ...ok, owner: false })).toEqual({ ok: false, error: "owner" });
    expect(parsePrivacyRequest({ ...ok, player: "" })).toEqual({ ok: false, error: "player" });
    expect(parsePrivacyRequest({ ...ok, message: "x".repeat(1001) })).toEqual({ ok: false, error: "message" });
    expect(parsePrivacyRequest({ ...ok, website: "spam" })).toEqual({ ok: false, error: "bot" });
    expect(parsePrivacyRequest(null)).toEqual({ ok: false, error: "player" });
  });
  it("takes a name, a slug or a pasted profile address", () => {
    expect(playerRefFromInput("https://finalshq.gg/fr/players/GOJO-6255?x=1")).toBe("GOJO-6255");
    expect(playerRefFromInput(" GOJO#6255 ")).toBe("GOJO#6255");
  });
});

describe("sitemaps", () => {
  it("lists every page in both languages with hreflang", () => {
    const xml = urlset("https://finalshq.gg", ["/", "/clubs/A&B"], "2026-11-07T10:00:00.000Z");
    expect(xml.match(/<url>/g)).toHaveLength(4);
    expect(xml).toContain("<loc>https://finalshq.gg/fr</loc>");
    expect(xml).toContain('hreflang="x-default" href="https://finalshq.gg/fr/clubs/A&amp;B"');
    expect(xml).toContain("<lastmod>2026-11-07T10:00:00.000Z</lastmod>");
    expect(sitemapIndex("https://finalshq.gg", null)).toContain("https://finalshq.gg/sitemaps/players.xml");
    expect(pagePaths()).toEqual(expect.arrayContaining(["/", "/privacy", "/leaderboards/s12/ranked"]));
    expect(playerPaths(["GOJO#6255"])).toEqual(["/players/GOJO-6255"]);
    expect(clubPaths(["A B"])).toEqual(["/clubs/A%20B"]);
  });
});

describe("share cards", () => {
  const base: PlayerData = {
    id: "1",
    name: "GOJO#6255",
    hidden: false,
    platforms: { steam: null, psn: null, xbox: null },
    firstSeenAt: "2026-11-05T22:05:00Z",
    lastSeenAt: "2026-11-07T10:00:00Z",
    current: [{ leaderboardId: LIVE.id, rank: 6157, score: 36595, league: 15, club: "HQ", d24: 1074, d7: null, updatedAt: "", lastChangeAt: "", firstSeenAt: "" }],
    seasons: [],
    formerNames: [],
    live: { leaderboardId: LIVE.id, takenAt: "2026-11-07T10:00:00Z", historyStart: "2026-11-05", series: Array.from({ length: 300 }, (_, i) => ({ t: "", score: i === 5 ? null : 35000 + i, rank: null, league: null, kind: "event" as const })), activity: [], cutoff: null },
  };
  it("uses the live board values and thins the curve", () => {
    const c = playerCardData(base, LIVE.id)!;
    expect(c).toMatchObject({ name: "GOJO#6255", rank: 6157, score: 36595, league: 15, club: "HQ", d24: 1074, d7: null, takenAt: "2026-11-07T10:00:00Z" });
    expect(c.series.length).toBeLessThanOrEqual(121);
    expect(c.series.at(-1)).toBe(35299);
  });
  it("never builds a card for a hidden or unknown profile", () => {
    expect(playerCardData({ ...base, hidden: true })).toBeNull();
    expect(playerCardData(null)).toBeNull();
  });
  it("points to the card routes", () => {
    expect(cardPath("player", "GOJO-6255", "en", "story")).toBe("/api/og/player/GOJO-6255?l=en&f=story");
    expect(cardPath("club", "HQ", "fr")).toBe("/api/og/club/HQ?l=fr");
  });
});

describe("writes", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
    await t.db.execute(sql`INSERT INTO seasons (id, name, ordinal, is_live, has_comparable_leagues) VALUES ('s12', 'Season 12', 15, true, true)`);
    await t.db.execute(sql`INSERT INTO leaderboards (id, key, upstream_id, platform, kind, mode, name, season_id, score_field, schema_version, has_leagues, is_live, history)
      VALUES (${LIVE.id}, ${LIVE.key}, ${LIVE.upstreamId}, ${LIVE.platform}, ${LIVE.kind}, ${LIVE.mode}, ${LIVE.name}, ${LIVE.seasonId}, ${LIVE.scoreField}, ${LIVE.schemaVersion}, ${LIVE.hasLeagues}, ${LIVE.isLive}, ${LIVE.history})`);
    await t.db.execute(sql`INSERT INTO players (embark_name, first_seen_at, last_seen_at, hidden_at) VALUES
      ('Fictif#0001', now(), now(), NULL), ('Masque#0002', now(), now(), now()), ('Fictif#0003', now(), now(), NULL)`);
    for (const [name, score, club] of [["Fictif#0001", 40000, "HQ"], ["Masque#0002", 39000, "HQ"], ["Fictif#0003", 38000, null]] as const) {
      await t.db.execute(sql`INSERT INTO leaderboard_current (player_id, first_seen_at, last_change_at, updated_at, score, rank, leaderboard_id, name, club_tag)
        SELECT id, now(), now(), now(), ${score}, 1, ${LIVE.id}, ${name}, ${club} FROM players WHERE embark_name = ${name}`);
    }
  });
  afterAll(() => t.close());

  it("counts usage per day", async () => {
    const day = new Date("2026-11-07T10:00:00Z");
    await bumpUsage(t.db, "profile_view", day);
    await bumpUsage(t.db, "profile_view", day);
    await bumpUsage(t.db, "card", day);
    const rows = await queryRows<{ event: string; n: number }>(t.db, sql`SELECT event, n FROM usage_counters ORDER BY event`);
    expect(rows).toEqual([{ event: "card", n: 1 }, { event: "profile_view", n: 2 }]);
    expect(isUsageEvent("follow")).toBe(true);
    expect(isUsageEvent("drop table")).toBe(false);
  });

  it("records one pending request per player and lets a rejected one be made again", async () => {
    const [p] = await queryRows<{ id: string }>(t.db, sql`SELECT id::text FROM players WHERE embark_name = 'Fictif#0001'`);
    const input = { playerId: p!.id, contact: "a@b.co", message: "", locale: "fr" };
    expect(await insertHideRequest(t.db, input)).toBe("created");
    expect(await insertHideRequest(t.db, { ...input, contact: "attaquant@x.co" })).toBe("already_pending");
    const [row] = await queryRows<{ contact: string; status: string }>(t.db, sql`SELECT contact, status FROM hidden_profiles`);
    expect(row).toEqual({ contact: "a@b.co", status: "pending" });
    await t.db.execute(sql`UPDATE hidden_profiles SET status = 'rejected', decided_at = now()`);
    expect(await insertHideRequest(t.db, { ...input, contact: "c@d.co" })).toBe("created");
    await t.db.execute(sql`UPDATE hidden_profiles SET status = 'applied'`);
    expect(await insertHideRequest(t.db, input)).toBe("already_hidden");
  });

  it("lists visible players and clubs for the sitemap", async () => {
    const s = await loadSitemap(t.db, LIVE.id);
    expect(s.players).toEqual(["Fictif#0001", "Fictif#0003"]);
    expect(s.clubs).toEqual(["HQ"]);
  });
});
