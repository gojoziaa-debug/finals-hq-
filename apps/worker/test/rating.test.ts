import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { leaderboardByKey, schema } from "@finals-hq/db";
import { createTestDb, type TestDb } from "@finals-hq/db/test";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ingestAll } from "../src/ingest.ts";
import { calibrationReport } from "../src/rating-report.ts";
import { loadBoardData, ratedBoards, runRating } from "../src/rating.ts";
import { DataSource } from "../src/source.ts";
import { rankedRow, writeFull, writeManifest } from "./helpers.ts";

const KEY = "s12-crossplay";
const LB = leaderboardByKey(KEY)!;

/** 14 synthetic players; player i gains `gain(i, day)` RS per day. */
const NAMES = Array.from({ length: 14 }, (_, i) => `P${String(i).padStart(2, "0")}#00${String(i).padStart(2, "0")}`);
const scoreOf = (i: number, day: number) => 48_000 - i * 900 + day * (i % 3 === 0 ? 0 : 150 + i * 20);

describe("rating over an ingested chain", () => {
  let t: TestDb;
  let root: string;
  beforeAll(async () => {
    t = await createTestDb();
    root = await mkdtemp(join(tmpdir(), "finals-hq-rating-"));
    const source = new DataSource(root);
    // Three daily full snapshots, 5, 6 and 7 Nov. 2026 at 22:05 UTC.
    for (let day = 0; day < 3; day++) {
      const at = new Date(Date.UTC(2026, 10, 5 + day, 22, 5, 21)).toISOString();
      const rows = NAMES.map((name, i) => ({ name, score: scoreOf(i, day) }))
        .sort((a, b) => b.score - a.score)
        .map((r, k) => rankedRow(k + 1, r.name, r.score, r.score >= 47_500 ? 20 : r.score >= 45_000 ? 19 : 18));
      const full = await writeFull(root, KEY, at, rows);
      await writeManifest(root, KEY, full, []);
      const summary = await ingestAll(t.db, source, { keepDays: 10_000, now: new Date(Date.parse(at) + 60_000) });
      expect(summary.status).toBe("ok");
    }
    // Ten minutes later, P01 wins one match: the only change between two close snapshots.
    const at = "2026-11-07T22:15:21.000Z";
    const rows = NAMES.map((name, i) => ({ name, score: scoreOf(i, 2) + (i === 1 ? 300 : 0) }))
      .sort((a, b) => b.score - a.score)
      .map((r, k) => rankedRow(k + 1, r.name, r.score, r.score >= 47_500 ? 20 : r.score >= 45_000 ? 19 : 18));
    const full = await writeFull(root, KEY, at, rows);
    await writeManifest(root, KEY, full, []);
    expect((await ingestAll(t.db, source, { keepDays: 10_000, now: new Date("2026-11-07T22:16:00Z") })).status).toBe("ok");
  });
  afterAll(async () => {
    await t.close();
  });

  it("rates the live ranked board only", () => {
    expect(ratedBoards().map((lb) => lb.key)).toEqual([KEY]);
  });

  it("assembles each player's history from closes, events and the current row", async () => {
    const data = (await loadBoardData(t.db, LB))!;
    expect(data.inputs).toHaveLength(14);
    expect(new Date(data.since).toISOString()).toBe("2026-11-05T22:05:21.000Z");
    expect(new Date(data.until).toISOString()).toBe("2026-11-07T22:15:21.000Z");
    const p1 = data.inputs.find((p) => data.current.get(p.playerId)!.name === NAMES[1])!;
    expect(p1.history.map((h) => h.rs)).toEqual([scoreOf(1, 0), scoreOf(1, 1), scoreOf(1, 2), scoreOf(1, 2) + 300]);
    // Daily snapshots are 24 h apart: their changes add up many matches and stay out of the anomaly threshold.
    expect(p1.recentDeltas).toEqual([300]);
    expect(data.snapshotDeltas).toEqual([300]);
    expect(data.closeSnapshots).toBe(1);
    // Board order rank, the same as the leaderboard page.
    expect([...data.current.values()].map((c) => c.rank).sort((a, b) => a - b)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
  });

  it("stores one versioned rating per player and the references of the run", async () => {
    const [run] = await runRating(t.db, { force: true, now: new Date("2026-11-07T22:20:00Z") });
    expect(run).toMatchObject({ key: KEY, players: 14 });
    expect(run!.observedDays).toBeCloseTo(2 + 10 / 1440, 6);
    const rows = await t.db.select().from(schema.ratings).where(eq(schema.ratings.leaderboardId, LB.id));
    expect(rows).toHaveLength(14);
    for (const r of rows) {
      expect(r.ratingVersion).toBe("1.0.0");
      expect(r.level).toBeGreaterThan(50);
      expect(r.provisional).toBe(true); // no consistency before 10 active days
      expect(r.delta7d).toBeNull(); // nothing seen 7 days ago
    }
    const movers = rows.filter((r) => r.delta24h !== null && r.delta24h !== 0);
    expect(movers.length).toBeGreaterThanOrEqual(9);
    const [stored] = await t.db.select().from(schema.ratingRuns);
    expect(stored!.refs).toMatchObject({ players: 14, calibrationDays: 7 });
    const report = calibrationReport(run!);
    expect(report).toContain("Calibration en cours");
    expect(report).toContain("Dix premiers du Rating");
  });

  it("skips a run within the interval and replaces the table on the next one", async () => {
    const [skipped] = await runRating(t.db, { now: new Date("2026-11-07T22:30:00Z") });
    expect(skipped!.skipped).toMatch(/dernier calcul/);
    const [again] = await runRating(t.db, { now: new Date("2026-11-07T23:30:00Z") });
    expect(again!.skipped).toBe("aucun relevé nouveau");
    const [forced] = await runRating(t.db, { force: true, now: new Date("2026-11-07T23:40:00Z") });
    expect(forced!.runId).toBeGreaterThan(1);
    const rows = await t.db.select().from(schema.ratings);
    expect(rows).toHaveLength(14);
    expect(new Set(rows.map((r) => r.runId))).toEqual(new Set([forced!.runId]));
  });
});
