import { existsSync, readdirSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { leaderboardByKey, schema } from "@finals-hq/db";
import { createTestDb, type TestDb } from "@finals-hq/db/test";
import { and, asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importArchives } from "../src/archives.ts";
import { ingestAll, refreshWindowDeltas, type IngestOptions } from "../src/ingest.ts";
import { DataSource } from "../src/source.ts";
import { rankedRow, writeDelta, writeFull, writeManifest, type FileRef } from "./helpers.ts";

const { leaderboards, players, playerNames, identityCandidates, snapshots, rsEvents, playerHistory, leaderboardCurrent, cutoffHistory, clubs, seasonResults, ingestionRuns } = schema;
const KEY = "s12-crossplay";
const LB = leaderboardByKey(KEY)!;
const DAILY_KEY = "s12powershift-crossplay";
const DAILY_LB = leaderboardByKey(DAILY_KEY)!;

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
  // keepDays far away: the synthetic chain is dated November 2026 and must survive whatever day the tests run.
  const ingest = (options: IngestOptions = {}) => ingestAll(t.db, source, { keepDays: 10_000, ...options });
  const history = async (lb = LB) => (await t.db.select().from(playerHistory).where(eq(playerHistory.leaderboardId, lb.id))).sort((a, b) => a.playerId - b.playerId);

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
    const summary = await ingest({ now: new Date("2026-11-05T22:10:00Z") });
    expect(summary.status).toBe("ok");
    expect(summary.applied).toBe(1);
    expect(summary.freshnessAt).toBe("2026-11-05T22:05:21.000Z");
    expect(await count("players")).toBe(6);
    expect(await count("player_names")).toBe(4); // platform names only; the Embark name lives in players
    expect(await count("rs_events")).toBe(6);
    expect(await count("rs_events", "WHERE score_delta IS NULL")).toBe(6);
    expect(await count("leaderboard_current")).toBe(6);
    expect(await count("clubs")).toBe(1);
    const [cutoff] = await t.db.select().from(cutoffHistory);
    expect(cutoff).toMatchObject({ rowCount: 6, rank1Score: 46_000, rank500Score: null, lastScore: 41_000, leagueCounts: { "19": 2, "18": 3, "17": 1 } });
    const [run] = await t.db.select().from(ingestionRuns);
    expect(run).toMatchObject({ status: "ok", filesApplied: 1, command: "ingest" });
    expect(await count("rs_events_2026_11_05")).toBe(6);
    expect(summary.outcomes[0]).toMatchObject({ rows: 6, changes: 6, events: 6 });
    expect(summary.prunedPartitions).toEqual([]);
  });

  it("applies a delta: partial rows merged, ranks recomputed, dropped players removed", async () => {
    const delta1 = await writeDelta(root, KEY, "2026-11-05T22:15:21.000Z", base1.file, 1, [
      { name: "Alpha#0001", rankScore: 46_300, change: 300, rank: 1 },
      rankedRow(4, "Golf#0007", 43_500, 18, { steamName: "golf_s" }),
    ], ["Foxtrot#0006"], 6);
    await writeManifest(root, KEY, base1, [delta1]);
    const summary = await ingest();
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
    expect(alphaRow).toMatchObject({ leaderboardId: LB.id, name: "Alpha#0001", score: 46_300, extra: null });
    const foxtrot = await playerByName("Foxtrot#0006");
    expect(await count("leaderboard_current", `WHERE player_id = ${foxtrot!.id}`)).toBe(0);
    expect(await count("player_history")).toBe(0);
  });

  it("detects a rename within a file and closes the previous UTC day", async () => {
    const delta1File = `delta-2026-11-05T22-15-21Z.json.gz`;
    const delta2 = await writeDelta(root, KEY, "2026-11-06T00:05:21.000Z", base1.file, 2, [
      rankedRow(2, "Bravo2#0002", 45_200, 19, { steamName: "bravo_s", change: 200 }),
    ], ["Bravo#0002"], 6);
    const manifestDeltas: FileRef[] = [{ file: delta1File, at: "2026-11-05T22:15:21.000Z", sha256: "x", count: 6 }, delta2];
    await writeManifest(root, KEY, base1, manifestDeltas);
    const summary = await ingest();
    expect(summary.applied).toBe(1);
    expect(summary.outcomes.find((o) => o.status === "applied")?.identity).toMatchObject({ renamed: 1, created: 0 });
    expect(await count("players")).toBe(7);
    const bravo = await playerByName("Bravo2#0002");
    expect(bravo).toBeDefined();
    expect(await playerByName("Bravo#0002")).toBeUndefined();
    const names = await t.db.select().from(playerNames).where(eq(playerNames.playerId, bravo!.id));
    expect(names.map((n) => `${n.kind}:${n.name}`).sort()).toEqual(["embark:Bravo#0002", "steam:bravo_s"]);
    const bravoEvents = await t.db.select().from(rsEvents).where(eq(rsEvents.playerId, bravo!.id)).orderBy(asc(rsEvents.takenAt));
    expect(bravoEvents.map((e) => e.scoreDelta)).toEqual([null, 200]);
    // Close of 2026-11-05 = state after the delta of 22:15: six players ranked by score, element 1 of the arrays.
    const [board] = await t.db.select().from(leaderboards).where(eq(leaderboards.id, LB.id));
    expect(board!.historyStartDay).toBe("2026-11-05");
    const closes = (await history()).sort((a, b) => a.ranks[0]! - b.ranks[0]!);
    expect(closes.every((c) => c.scores.length === 1 && c.ranks.length === 1 && c.leagueNumbers.length === 1)).toBe(true);
    expect(closes.map((c) => [c.playerId, c.ranks[0], c.scores[0]])).toEqual([
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
    const summary = await ingest({ only: key });
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
    const again = await ingest();
    expect(again.applied).toBe(0);
    expect(again.skipped).toBe(4);
    expect(await count("rs_events")).toBe(before);
    const gap = await writeDelta(root, KEY, "2026-11-06T02:05:21.000Z", base1.file, 4, [{ name: "Alpha#0001", rankScore: 47_000 }], [], 6);
    await writeManifest(root, KEY, base1, [
      { file: "delta-2026-11-05T22-15-21Z.json.gz", at: "2026-11-05T22:15:21.000Z", sha256: "x", count: 6 },
      { file: "delta-2026-11-06T00-05-21Z.json.gz", at: "2026-11-06T00:05:21.000Z", sha256: "y", count: 6 },
      gap,
    ]);
    const summary = await ingest({ only: KEY });
    expect(summary.status).toBe("error");
    expect(summary.rejected).toBe(1);
    expect(summary.outcomes.find((o) => o.status === "rejected")?.reason).toMatch(/chaîne rompue/);
    expect(await count("snapshots", "WHERE status = 'rejected'")).toBe(1);
    expect(await count("rs_events")).toBe(before);
    // Rejected files are never retried.
    expect((await ingest({ only: KEY })).skipped).toBe(4);
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
    const summary = await ingest({ only: KEY });
    expect(summary.applied).toBe(1);
    expect(await count("players")).toBe(9);
    expect(await count("rs_events")).toBe(13); // 9 on s12 + 3 on World Tour, + Golf (43 500 → 43 900)
    await refreshWindowDeltas(t.db, LB, new Date("2026-11-06T22:05:21.000Z"));
    const rows = await t.db.select().from(leaderboardCurrent).where(eq(leaderboardCurrent.leaderboardId, LB.id)).orderBy(asc(leaderboardCurrent.rank));
    const alpha = rows.find((r) => r.rank === 1)!;
    expect(alpha.delta24h).toBe(300); // rolling: vs the event at exactly 24 h before (46 000)
    expect(alpha.delta7d).toBeNull();
    const golf = rows.find((r) => r.rank === 4)!;
    expect(golf.delta24h).toBe(400); // no event at or before the window start: vs the close of 2026-11-05 (43 500)
    expect((await history()).every((h) => h.scores.length === 1)).toBe(true); // 2026-11-06 not closed yet
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
    const results = await t.db.select().from(seasonResults).where(eq(seasonResults.leaderboardId, 100)).orderBy(asc(seasonResults.finalRank));
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ finalRank: 1, finalScore: 9_000, finalLeague: "Diamond", extra: { xp: 1, level: 2, cashouts: 3 } });
    const zulu = await playerByName("Zulu");
    expect(zulu).toMatchObject({ linkable: false, scopeKey: "cb1" });
    expect(results[1]!.playerId).toBe((await playerByName("Alpha#0001"))!.id);
    const [snap] = await t.db.select().from(snapshots).where(eq(snapshots.leaderboardId, 100));
    expect(snap).toMatchObject({ kind: "archive", status: "applied", unidentified: 1, rowCount: 2 });
    expect(await count("cutoff_history", "WHERE leaderboard_id = 100")).toBe(1);
    expect((await importArchives(t.db, source)).skipped).toBe(1);
  });

  it("keeps daily closes but no events on a 'daily' board, deltas measured since the previous close", async () => {
    const row = (rank: number, name: string, points: number) => ({ rank, name, steamName: "", psnName: "", xboxName: "", clubTag: "", clubUuid: "", officialClubName: "", points });
    const full = await writeFull(root, DAILY_KEY, "2026-11-06T06:00:00.000Z", [row(1, "Alpha#0001", 600_000), row(2, "India#0009", 500_000), row(3, "Juliet#0010", 400_000)]);
    await writeManifest(root, DAILY_KEY, full, []);
    const first = await ingest({ only: DAILY_KEY });
    expect(first.outcomes[0]).toMatchObject({ rows: 3, changes: 3, events: 0, identity: { linked: 1, created: 2 } });
    expect(await count("rs_events", `WHERE leaderboard_id = ${DAILY_LB.id}`)).toBe(0);
    expect(await count("player_history", `WHERE leaderboard_id = ${DAILY_LB.id}`)).toBe(0);
    const delta = await writeDelta(root, DAILY_KEY, "2026-11-07T06:00:00.000Z", full.file, 1, [{ name: "India#0009", points: 650_000 }], ["Juliet#0010"], 2);
    await writeManifest(root, DAILY_KEY, full, [delta]);
    const second = await ingest({ only: DAILY_KEY });
    expect(second.outcomes.find((o) => o.status === "applied")).toMatchObject({ rows: 2, changes: 1, events: 0 });
    expect(await count("rs_events", `WHERE leaderboard_id = ${DAILY_LB.id}`)).toBe(0);
    expect(await count("pg_class", "WHERE relname = 'rs_events_2026_11_07'")).toBe(0); // partitions are created for 'events' boards only
    const closes = await history(DAILY_LB);
    expect(closes.map((c) => [c.ranks[0], c.scores[0], c.leagueNumbers[0]])).toEqual([[1, 600_000, null], [2, 500_000, null], [3, 400_000, null]]);
    const current = await t.db.select().from(leaderboardCurrent).where(eq(leaderboardCurrent.leaderboardId, DAILY_LB.id)).orderBy(asc(leaderboardCurrent.score));
    expect(current.map((c) => [c.name, c.score, c.rank, c.delta24h, c.delta7d])).toEqual([["Alpha#0001", 600_000, 1, 0, null], ["India#0009", 650_000, 1, 150_000, null]]);
    expect(current[1]!.extra).toBeNull();

    // Days without any file leave NULL holes: the file of the 10th closes the 7th (index 2), the file of the 11th closes the 10th (index 5).
    const delta2 = await writeDelta(root, DAILY_KEY, "2026-11-10T06:00:00.000Z", full.file, 2, [{ name: "India#0009", points: 700_000 }], [], 2);
    const delta3 = await writeDelta(root, DAILY_KEY, "2026-11-11T06:00:00.000Z", full.file, 3, [{ name: "Alpha#0001", points: 610_000 }], [], 2);
    await writeManifest(root, DAILY_KEY, full, [delta, delta2, delta3]);
    expect((await ingest({ only: DAILY_KEY })).applied).toBe(2);
    const later = await history(DAILY_LB);
    const india = later.find((h) => h.playerId === current[1]!.playerId)!;
    expect(india.scores).toEqual([500_000, 650_000, null, null, 700_000]);
    expect(india.ranks).toEqual([2, 1, null, null, 1]);
    expect(later.find((h) => h.playerId !== india.playerId && h.scores.length === 1)!.scores).toEqual([400_000]); // Juliet, gone since the 7th
    const [alphaNow] = await t.db.select().from(leaderboardCurrent).where(and(eq(leaderboardCurrent.leaderboardId, DAILY_LB.id), eq(leaderboardCurrent.name, "Alpha#0001")));
    expect([alphaNow!.delta24h, alphaNow!.delta7d]).toEqual([10_000, null]); // vs the close of the 10th (600 000); the 4th is before the history starts
  });

  it("drops the rs_events partitions older than keepDays at the end of a run", async () => {
    const before = await count("rs_events");
    expect(before).toBeGreaterThan(0);
    const summary = await ingest({ only: KEY, now: new Date("2026-11-20T00:00:00Z"), keepDays: 8 });
    expect(summary.status).toBe("ok");
    expect(summary.prunedPartitions).toEqual(["rs_events_2026_11_05", "rs_events_2026_11_06"]);
    expect(await count("rs_events")).toBe(0);
    expect(await count("leaderboard_current")).toBeGreaterThan(0);
    expect((await history()).length).toBe(6);
    const [run] = await t.db.select().from(ingestionRuns).where(eq(ingestionRuns.id, summary.runId));
    expect(run!.details).toMatchObject({ prunedPartitions: ["rs_events_2026_11_05", "rs_events_2026_11_06"] });
    expect(await count("pg_class", "WHERE relname = 'rs_events_2026_11_05'")).toBe(0);
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
    expect(summary.outcomes[0]).toMatchObject({ rows: 10_000, changes: 10_000, events: 10_000 });
    const [n] = await t.db.select({ n: sql<number>`count(*)::int` }).from(players);
    expect(n!.n).toBe(10_000);
    console.log(`real snapshot ingested in ${ms} ms`);
    await t.close();
  }, 120_000);
});
