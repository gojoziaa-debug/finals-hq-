import { existsSync, readdirSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { schema } from "@finals-hq/db";
import { createTestDb, type TestDb } from "@finals-hq/db/test";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importArchives } from "../src/archives.ts";
import { ingestAll, refreshWindowDeltas } from "../src/ingest.ts";
import { DataSource } from "../src/source.ts";
import { rankedRow, writeDelta, writeFull, writeManifest, type FileRef } from "./helpers.ts";

const { players, playerNames, identityCandidates, snapshots, rsEvents, rankDaily, leaderboardCurrent, cutoffHistory, clubs, seasonResults, ingestionRuns } = schema;
const KEY = "s12-crossplay";

describe("ingestion of a collector chain", () => {
  let t: TestDb;
  let root: string;
  let source: DataSource;
  let base1: FileRef;
  beforeAll(async () => {
    t = await createTestDb();
    root = await mkdtemp(join(tmpdir(), "finals-hq-worker-"));
    source = new DataSource(root);
  });
  afterAll(async () => {
    await t.close();
  });

  const playerByName = async (name: string) => (await t.db.select().from(players).where(eq(players.embarkName, name)))[0];
  const count = async (table: string, where = "") => Number((await t.client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} ${where}`)).rows[0]!.n);

  it("creates players, events and the current table from a full snapshot", async () => {
    base1 = await writeFull(root, KEY, "2026-11-05T22:05:21.000Z", [
      rankedRow(1, "Alpha#0001", 46_000, 19, { steamName: "alpha_s" }),
      rankedRow(2, "Bravo#0002", 45_000, 19, { steamName: "bravo_s" }),
      rankedRow(3, "Charlie#0003", 44_000, 18, { psnName: "charlie_p" }),
      rankedRow(4, "Delta#0004", 43_000, 18, { clubTag: "CLB", clubUuid: "club-1", officialClubName: "Club One" }),
      rankedRow(5, "Echo#0005", 42_000, 18),
      rankedRow(6, "Foxtrot#0006", 41_000, 17, { xboxName: "fox_x" }),
    ]);
    await writeManifest(root, KEY, base1, []);
    const summary = await ingestAll(t.db, source, { now: new Date("2026-11-05T22:10:00Z") });
    expect(summary.status).toBe("ok");
    expect(summary.applied).toBe(1);
    expect(summary.freshnessAt).toBe("2026-11-05T22:05:21.000Z");
    expect(await count("players")).toBe(6);
    expect(await count("player_names")).toBe(10);
    expect(await count("rs_events")).toBe(6);
    expect(await count("rs_events", "WHERE score_delta IS NULL")).toBe(6);
    expect(await count("leaderboard_current")).toBe(6);
    expect(await count("clubs")).toBe(1);
    const [cutoff] = await t.db.select().from(cutoffHistory);
    expect(cutoff).toMatchObject({ rowCount: 6, rank1Score: 46_000, rank500Score: null, lastScore: 41_000, leagueCounts: { "19": 2, "18": 3, "17": 1 } });
    const [run] = await t.db.select().from(ingestionRuns);
    expect(run).toMatchObject({ status: "ok", filesApplied: 1, command: "ingest" });
    expect(await count("rs_events_2026_11")).toBe(6);
  });

  it("applies a delta: partial rows merged, ranks recomputed, dropped players removed", async () => {
    const delta1 = await writeDelta(root, KEY, "2026-11-05T22:15:21.000Z", base1.file, 1, [
      { name: "Alpha#0001", rankScore: 46_300, change: 300, rank: 1 },
      rankedRow(4, "Golf#0007", 43_500, 18, { steamName: "golf_s" }),
    ], ["Foxtrot#0006"], 6);
    await writeManifest(root, KEY, base1, [delta1]);
    const summary = await ingestAll(t.db, source);
    expect(summary.applied).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(await count("rs_events")).toBe(8);
    expect(await count("leaderboard_current")).toBe(6);
    const golf = await playerByName("Golf#0007");
    const [golfRow] = await t.db.select().from(leaderboardCurrent).where(eq(leaderboardCurrent.playerId, golf!.id));
    expect(golfRow).toMatchObject({ rank: 4, score: 43_500 });
    const alpha = await playerByName("Alpha#0001");
    const alphaEvents = await t.db.select().from(rsEvents).where(eq(rsEvents.playerId, alpha!.id)).orderBy(asc(rsEvents.takenAt));
    expect(alphaEvents.map((e) => [e.score, e.scoreDelta, e.rank])).toEqual([[46_000, null, 1], [46_300, 300, 1]]);
    const [alphaRow] = await t.db.select().from(leaderboardCurrent).where(eq(leaderboardCurrent.playerId, alpha!.id));
    expect(alphaRow!.raw).toMatchObject({ rankScore: 46_300, steamName: "alpha_s", change: 300 });
    const foxtrot = await playerByName("Foxtrot#0006");
    expect(await count("leaderboard_current", `WHERE player_id = ${foxtrot!.id}`)).toBe(0);
    expect(await count("rank_daily")).toBe(0);
  });

  it("detects a rename within a file and closes the previous UTC day", async () => {
    const delta1File = `delta-2026-11-05T22-15-21Z.json.gz`;
    const delta2 = await writeDelta(root, KEY, "2026-11-06T00:05:21.000Z", base1.file, 2, [
      rankedRow(2, "Bravo2#0002", 45_200, 19, { steamName: "bravo_s", change: 200 }),
    ], ["Bravo#0002"], 6);
    const manifestDeltas: FileRef[] = [{ file: delta1File, at: "2026-11-05T22:15:21.000Z", sha256: "x", count: 6 }, delta2];
    await writeManifest(root, KEY, base1, manifestDeltas);
    const summary = await ingestAll(t.db, source);
    expect(summary.applied).toBe(1);
    expect(summary.outcomes.find((o) => o.status === "applied")?.identity).toMatchObject({ renamed: 1, created: 0 });
    expect(await count("players")).toBe(7);
    const bravo = await playerByName("Bravo2#0002");
    expect(bravo).toBeDefined();
    expect(await playerByName("Bravo#0002")).toBeUndefined();
    const names = await t.db.select().from(playerNames).where(eq(playerNames.playerId, bravo!.id));
    expect(names.map((n) => `${n.kind}:${n.name}`).sort()).toEqual(["embark:Bravo#0002", "embark:Bravo2#0002", "steam:bravo_s"]);
    const bravoEvents = await t.db.select().from(rsEvents).where(eq(rsEvents.playerId, bravo!.id)).orderBy(asc(rsEvents.takenAt));
    expect(bravoEvents.map((e) => e.scoreDelta)).toEqual([null, 200]);
    // Close of 2026-11-05 = state after the delta of 22:15: six players ranked by score.
    const closes = await t.db.select().from(rankDaily).where(eq(rankDaily.day, "2026-11-05")).orderBy(asc(rankDaily.rank));
    expect(closes.map((c) => [c.playerId, c.rank, c.score])).toEqual([
      [(await playerByName("Alpha#0001"))!.id, 1, 46_300],
      [bravo!.id, 2, 45_000],
      [(await playerByName("Charlie#0003"))!.id, 3, 44_000],
      [(await playerByName("Golf#0007"))!.id, 4, 43_500],
      [(await playerByName("Delta#0004"))!.id, 5, 43_000],
      [(await playerByName("Echo#0005"))!.id, 6, 42_000],
    ]);
  });

  it("links a known name across leaderboards, flags contradictions and shared platform names as candidates", async () => {
    const key = "s12worldtour-crossplay";
    const full = await writeFull(root, key, "2026-11-06T01:05:21.000Z", [
      { rank: 1, name: "Alpha#0001", steamName: "", psnName: "", xboxName: "", clubTag: "", clubUuid: "", officialClubName: "", cashouts: 9_000_000 },
      { rank: 2, name: "Charlie#0003", steamName: "", psnName: "other_p", xboxName: "", clubTag: "", clubUuid: "", officialClubName: "", cashouts: 8_000_000 },
      { rank: 3, name: "Hotel#0008", steamName: "", psnName: "", xboxName: "fox_x", clubTag: "", clubUuid: "", officialClubName: "", cashouts: 7_000_000 },
    ]);
    await writeManifest(root, key, full, []);
    const summary = await ingestAll(t.db, source, { only: key });
    expect(summary.applied).toBe(1);
    expect(summary.outcomes[0]?.identity).toMatchObject({ linked: 1, created: 2, candidates: 2 });
    expect(await count("players")).toBe(9);
    const charlies = await t.db.select().from(players).where(eq(players.embarkName, "Charlie#0003"));
    expect(charlies).toHaveLength(2);
    const candidates = await t.db.select().from(identityCandidates).orderBy(asc(identityCandidates.id));
    expect(candidates.map((c) => [c.reason, c.confidence])).toEqual([
      ["same_embark_name_platform_mismatch", "low"],
      ["same_platform_names", "medium"],
    ]);
    const foxtrot = await playerByName("Foxtrot#0006");
    const hotel = await playerByName("Hotel#0008");
    expect(candidates[1]).toMatchObject({ playerA: Math.min(foxtrot!.id, hotel!.id), playerB: Math.max(foxtrot!.id, hotel!.id) });
  });

  it("is idempotent and rejects a delta whose predecessor is missing", async () => {
    const before = await count("rs_events");
    const again = await ingestAll(t.db, source);
    expect(again.applied).toBe(0);
    expect(again.skipped).toBe(4);
    expect(await count("rs_events")).toBe(before);
    const gap = await writeDelta(root, KEY, "2026-11-06T02:05:21.000Z", base1.file, 4, [{ name: "Alpha#0001", rankScore: 47_000 }], [], 6);
    await writeManifest(root, KEY, base1, [
      { file: "delta-2026-11-05T22-15-21Z.json.gz", at: "2026-11-05T22:15:21.000Z", sha256: "x", count: 6 },
      { file: "delta-2026-11-06T00-05-21Z.json.gz", at: "2026-11-06T00:05:21.000Z", sha256: "y", count: 6 },
      gap,
    ]);
    const summary = await ingestAll(t.db, source, { only: KEY });
    expect(summary.status).toBe("error");
    expect(summary.rejected).toBe(1);
    expect(summary.outcomes.find((o) => o.status === "rejected")?.reason).toMatch(/chaîne rompue/);
    expect(await count("snapshots", "WHERE status = 'rejected'")).toBe(1);
    expect(await count("rs_events")).toBe(before);
    // Rejected files are never retried.
    expect((await ingestAll(t.db, source, { only: KEY })).skipped).toBe(4);
  });

  it("starts a new chain from a full snapshot and refreshes 24 h deltas", async () => {
    const base2 = await writeFull(root, KEY, "2026-11-06T22:05:21.000Z", [
      rankedRow(1, "Alpha#0001", 46_300, 19, { steamName: "alpha_s" }),
      rankedRow(2, "Bravo2#0002", 45_200, 19, { steamName: "bravo_s" }),
      rankedRow(3, "Charlie#0003", 44_000, 18, { psnName: "charlie_p" }),
      rankedRow(4, "Golf#0007", 43_900, 18, { steamName: "golf_s" }),
      rankedRow(5, "Delta#0004", 43_000, 18, { clubTag: "CLB", clubUuid: "club-1", officialClubName: "Club One" }),
      rankedRow(6, "Echo#0005", 42_000, 18),
    ]);
    await writeManifest(root, KEY, base2, []);
    const summary = await ingestAll(t.db, source, { only: KEY });
    expect(summary.applied).toBe(1);
    expect(await count("players")).toBe(9);
    expect(await count("rs_events")).toBe(13); // 9 on s12 + 3 on World Tour, + Golf (43 500 → 43 900)
    await refreshWindowDeltas(t.db, KEY, new Date("2026-11-06T22:05:21.000Z"));
    const rows = await t.db.select().from(leaderboardCurrent).where(eq(leaderboardCurrent.leaderboardKey, KEY)).orderBy(asc(leaderboardCurrent.rank));
    const alpha = rows.find((r) => r.rank === 1)!;
    expect(alpha.delta24h).toBe(300); // vs the point at exactly 24 h before (46 000)
    expect(alpha.delta7d).toBeNull();
    const golf = rows.find((r) => r.rank === 4)!;
    expect(golf.delta24h).toBeNull(); // first seen after the window start
    expect(await count("rank_daily", "WHERE day = '2026-11-06'")).toBe(0); // day not closed yet
  });

  it("imports a frozen archive into season_results with unlinked identities", async () => {
    await writeFull(root, "cb1", "2026-11-07T10:00:00.000Z", [
      { rank: 1, change: 0, name: "Zulu", steamName: "", xboxName: "", psnName: "", league: "Diamond", fame: 9_000, xp: 1, level: 2, cashouts: 3 },
      { rank: 2, change: 0, name: "", steamName: "", xboxName: "", psnName: "", league: "Diamond", fame: 8_000, xp: 0, level: 0, cashouts: 0 },
      { rank: 3, change: 0, name: "Alpha#0001", steamName: "alpha_s", xboxName: "", psnName: "", league: "Gold", fame: 7_000, xp: 0, level: 0, cashouts: 0 },
    ], "seasons");
    const summary = await importArchives(t.db, source);
    expect(summary.status).toBe("ok");
    expect(summary.applied).toBe(1);
    const results = await t.db.select().from(seasonResults).where(eq(seasonResults.leaderboardKey, "cb1")).orderBy(asc(seasonResults.finalRank));
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ finalRank: 1, finalScore: 9_000, finalLeague: "Diamond", extra: { xp: 1, level: 2, cashouts: 3 } });
    const zulu = await playerByName("Zulu");
    expect(zulu).toMatchObject({ linkable: false, scopeKey: "cb1" });
    expect(results[1]!.playerId).toBe((await playerByName("Alpha#0001"))!.id);
    const [snap] = await t.db.select().from(snapshots).where(eq(snapshots.leaderboardKey, "cb1"));
    expect(snap).toMatchObject({ kind: "archive", status: "applied", unidentified: 1, rowCount: 2 });
    expect(await count("cutoff_history", "WHERE leaderboard_key = 'cb1'")).toBe(1);
    expect((await importArchives(t.db, source)).skipped).toBe(1);
  });
});

const REAL_STATE = "/home/user/finals-hq-data/state/s12-crossplay";
const realFull = existsSync(REAL_STATE) ? readdirSync(REAL_STATE).find((f) => f.startsWith("full-")) : undefined;

describe.skipIf(!realFull)("real snapshot (local only)", () => {
  it("ingests a real 10 000-row snapshot", async () => {
    const t = await createTestDb();
    const root = await mkdtemp(join(tmpdir(), "finals-hq-real-"));
    await mkdir(join(root, "state", KEY), { recursive: true });
    await copyFile(join(REAL_STATE, realFull!), join(root, "state", KEY, realFull!));
    const parsed = JSON.parse(gunzipSync(await readFile(join(REAL_STATE, realFull!))).toString("utf8")) as { source: { fetchedAt: string }; sha256: string; count: number };
    await writeManifest(root, KEY, { file: realFull!, at: parsed.source.fetchedAt, sha256: parsed.sha256, count: parsed.count }, []);
    const started = Date.now();
    const summary = await ingestAll(t.db, new DataSource(root));
    const ms = Date.now() - started;
    expect(summary.status).toBe("ok");
    expect(summary.outcomes[0]).toMatchObject({ rows: 10_000, events: 10_000 });
    const [n] = await t.db.select({ n: sql<number>`count(*)::int` }).from(players);
    expect(n!.n).toBe(10_000);
    console.log(`real snapshot ingested in ${ms} ms`);
    await t.close();
  }, 120_000);
});
