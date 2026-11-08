import { describe, expect, it } from "vitest";
import { LEADERBOARDS, SEASONS, leaderboardById, leaderboardByKey, leagueName, upstreamPath } from "./catalog.ts";

describe("catalog", () => {
  it("lists the 82 leaderboard ids and 2 community events of the verified API", () => {
    const ids = new Set(LEADERBOARDS.filter((lb) => lb.kind !== "event").map((lb) => lb.upstreamId));
    expect(ids.size).toBe(82);
    expect(LEADERBOARDS.filter((lb) => lb.kind === "event")).toHaveLength(2);
    // 82 ids - 3 multi-platform ids + 3 × 4 platforms + 2 events = 93 keys, as tested on 2026-11-05
    expect(LEADERBOARDS).toHaveLength(93);
    expect(new Set(LEADERBOARDS.map((lb) => lb.key)).size).toBe(93);
  });
  it("knows the schema of each ranked season", () => {
    expect(leaderboardByKey("s12-crossplay")).toMatchObject({ scoreField: "rankScore", schemaVersion: "R6", hasLeagues: true, isLive: true });
    expect(leaderboardByKey("cb1")).toMatchObject({ scoreField: "fame", schemaVersion: "R1", platform: null });
    expect(leaderboardByKey("s2-xbox")).toMatchObject({ scoreField: "cashouts", schemaVersion: "R3" });
    expect(leaderboardByKey("s12sponsor-crossplay")).toMatchObject({ scoreField: "fans", kind: "sponsor" });
    expect(leaderboardByKey("s3worldtour-crossplay")).toMatchObject({ scoreField: "cashouts", kind: "worldtour" });
    expect(leaderboardByKey("s10creatorgauntlet-crossplay")).toMatchObject({ scoreField: "points", kind: "mode" });
    expect(leaderboardByKey("ce44")).toMatchObject({ kind: "event", scoreField: "score" });
    expect(LEADERBOARDS.filter((lb) => lb.isLive).map((lb) => lb.upstreamId)).toEqual([
      "s12", "s12sponsor", "s12worldtour", "s12powershift", "s12quickcash", "s12teamdeathmatch", "s12pointbreak", "s12soloshowdown",
    ]);
  });
  it("gives every leaderboard a stable, unique numeric id and a history mode", () => {
    expect(new Set(LEADERBOARDS.map((lb) => lb.id)).size).toBe(LEADERBOARDS.length);
    expect(LEADERBOARDS.every((lb) => Number.isInteger(lb.id) && lb.id > 0 && lb.id < 32768)).toBe(true);
    // Pinned values: changing them would orphan every row of the volume tables.
    expect(leaderboardByKey("cb1")!.id).toBe(100);
    expect(leaderboardByKey("s1-psn")!.id).toBe(403);
    expect(leaderboardByKey("s3original-crossplay")!.id).toBe(604);
    expect(leaderboardByKey("s12-crossplay")!.id).toBe(1500);
    expect(leaderboardByKey("s12sponsor-crossplay")!.id).toBe(1512);
    expect(leaderboardByKey("s12soloshowdown-crossplay")!.id).toBe(1580);
    expect(leaderboardByKey("ce48")!.id).toBe(9048);
    expect(leaderboardById(1500)?.key).toBe("s12-crossplay");
    expect(LEADERBOARDS.filter((lb) => lb.history === "events").map((lb) => lb.key)).toEqual(["s12-crossplay"]);
  });
  it("builds upstream paths and league names", () => {
    expect(upstreamPath(leaderboardByKey("s12-crossplay")!)).toBe("/v1/leaderboard/s12/crossplay");
    expect(upstreamPath(leaderboardByKey("cb1")!)).toBe("/v1/leaderboard/cb1");
    expect(upstreamPath(leaderboardByKey("ce44")!)).toBe("/v1/community-event/ce44");
    expect(leagueName(15)).toBe("Platinum 2");
    expect(leagueName(21)).toBe("Ruby");
    expect(leagueName(0)).toBe("Unranked");
    expect(leagueName(1)).toBe("Bronze 4");
    expect(leagueName(20)).toBe("Diamond 1");
    expect(SEASONS.filter((s) => !s.hasComparableLeagues).map((s) => s.id)).toEqual(["cb1", "cb2", "ob", "s1", "s2"]);
  });
});

describe("ssl options", async () => {
  const { sslOptionsFor, supabaseCertificates } = await import("./index.ts");
  it("verifies Supabase hosts against the bundled root certificates and never disables verification", () => {
    const supabase = sslOptionsFor("postgresql://postgres.ref:pwd@aws-1-eu-central-1.pooler.supabase.com:6543/postgres");
    expect(supabase).toMatchObject({ rejectUnauthorized: true, servername: "aws-1-eu-central-1.pooler.supabase.com" });
    expect(supabase && supabase.ca?.length).toBe(1);
    expect(supabaseCertificates()[0]).toContain("BEGIN CERTIFICATE");
  });
  it("keeps the embedded root certificate identical to certs/supabase-prod-ca-2021.crt", async () => {
    const { readFileSync } = await import("node:fs");
    const file = readFileSync(new URL("../certs/supabase-prod-ca-2021.crt", import.meta.url), "utf8");
    expect(supabaseCertificates()[0]?.trim()).toBe(file.trim());
  });
  it("rejects a malformed DATABASE_URL without echoing the secret", async () => {
    const { parseDatabaseUrl } = await import("./index.ts");
    expect(() => parseDatabaseUrl("aws-1-eu-central-1.pooler.supabase.com")).toThrow(/^DATABASE_URL invalide : attendu postgresql:/);
    expect(() => parseDatabaseUrl('"postgresql://u:secret@h:6543/p"')).toThrow(/retire les guillemets/);
    expect(() => parseDatabaseUrl("DATABASE_URL=postgresql://u:secret@h:6543/p")).toThrow(/NOM=/);
    expect(() => parseDatabaseUrl("https://u:secret@h/p")).toThrow(/invalide/);
    try {
      parseDatabaseUrl("postgresql//u:secret@h");
    } catch (e) {
      expect(String(e)).not.toContain("secret");
    }
    expect(parseDatabaseUrl(" postgresql://u:p@h.example:6543/postgres\n").port).toBe("6543");
  });
  it("still refuses to disable verification", () => {
    expect(sslOptionsFor("postgresql://u:p@localhost:5432/db")).toBe(false);
    expect(sslOptionsFor("postgresql://u:p@db.example.org:5432/db")).toEqual({ rejectUnauthorized: true, servername: "db.example.org" });
  });
});

describe("timestamptz", () => {
  it("passes a Date to raw SQL as an ISO string, never as a Date object", async () => {
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const { sql } = await import("drizzle-orm");
    const { timestamptz } = await import("./index.ts");
    const at = new Date("2026-11-05T22:05:21.579Z");
    const query = new PgDialect().sqlToQuery(sql`SELECT 1 WHERE now() > ${timestamptz(at)}`);
    expect(query.sql).toBe("SELECT 1 WHERE now() > $1::timestamptz");
    expect(query.params).toEqual(["2026-11-05T22:05:21.579Z"]);
  });
});
