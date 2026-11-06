import { queryRows, type Db } from "@finals-hq/db";
import { leaderboardByKey } from "@finals-hq/db/catalog";
import { createTestDb, type TestDb } from "@finals-hq/db/test";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contributions, gaugeArc, radarPoints, ratingVisibility } from "../../src/lib/rating";
import { loadPlayerRating, loadRatingBoard, loadRatingExample, loadRatingRun } from "../../src/lib/rating-queries";

const LIVE = leaderboardByKey("s12-crossplay")!;
const SINCE = "2026-11-05T22:05:21.000Z";

describe("rating visibility", () => {
  const run = (days: number) => ({ observedDays: days, calibrationDays: 7, dataSince: SINCE });
  it("stays closed in production during the calibration week, even with the switch on", () => {
    expect(ratingVisibility(run(0.9), { vercelEnv: "production", nodeEnv: "production" }, true)).toMatchObject({ open: false, calibrated: false, readyAt: "2026-11-12T22:05:21.000Z" });
  });
  it("needs both seven days and the public switch in production", () => {
    expect(ratingVisibility(run(7.1), { vercelEnv: "production" }, false).open).toBe(false);
    expect(ratingVisibility(run(7.1), { vercelEnv: "production" }, true)).toMatchObject({ open: true, preview: false, calibrated: true });
  });
  it("opens on Vercel previews and in local development", () => {
    expect(ratingVisibility(run(0.9), { vercelEnv: "preview" }, false)).toMatchObject({ open: true, preview: true });
    expect(ratingVisibility(run(0.9), { nodeEnv: "development" }, false).open).toBe(true);
    expect(ratingVisibility(run(0.9), { nodeEnv: "production" }, false).open).toBe(false); // next start locally
  });
  it("is closed without any computation", () => {
    expect(ratingVisibility(null, { vercelEnv: "preview" })).toMatchObject({ open: false, readyAt: null });
  });
});

describe("rating geometry and contributions", () => {
  it("renormalises the weights over the available components", () => {
    const parts = contributions({ level: 60, peak: 62, momentum: null, consistency: null, legacy: 0 });
    const total = parts.reduce((s, p) => s + p.weight, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(parts.find((p) => p.key === "momentum")).toMatchObject({ weight: 0, points: null });
    expect(parts.find((p) => p.key === "level")!.weight).toBeCloseTo(0.7 / 0.85, 10);
    expect(parts.reduce((s, p) => s + (p.points ?? 0), 0)).toBeCloseTo((0.7 * 60 + 0.1 * 62) / 0.85, 10);
  });
  it("draws the radar from the top axis clockwise", () => {
    const [top, right] = radarPoints([100, 50, null, 0, 0], 200);
    expect(top).toMatchObject({ x: 100, y: 0 });
    expect(right!.x).toBeGreaterThan(100);
    expect(radarPoints([null], 200)[0]).toMatchObject({ x: 100, y: 100 });
  });
  it("ends the gauge arc on the right for 99", () => {
    expect(gaugeArc(99, 100, 100, 80)).toBe("M 20 100 A 80 80 0 0 1 180.00 100.00");
    expect(gaugeArc(0, 100, 100, 80)).toBe("M 20 100 A 80 80 0 0 1 20.00 100.00");
  });
});

/** Base synthétique (données fictives) : quatre joueurs classés, un masqué, un calcul du Rating. */
async function seed(db: Db): Promise<Map<string, string>> {
  await db.execute(sql`INSERT INTO seasons (id, name, ordinal, is_live, has_comparable_leagues) VALUES ('s12', 'Season 12', 15, true, true)`);
  await db.execute(sql`INSERT INTO leaderboards (id, key, upstream_id, platform, kind, mode, name, season_id, score_field, schema_version, has_leagues, is_live, history)
    VALUES (${LIVE.id}, ${LIVE.key}, ${LIVE.upstreamId}, ${LIVE.platform}, ${LIVE.kind}, ${LIVE.mode}, ${LIVE.name}, ${LIVE.seasonId}, ${LIVE.scoreField}, ${LIVE.schemaVersion}, ${LIVE.hasLeagues}, ${LIVE.isLive}, ${LIVE.history})`);
  const people = [
    { name: "Fictif-Un#0001", score: 50_000, hidden: false, rating: 88, raw: 88.2, momentum: 70, consistency: null },
    { name: "Masque#0002", score: 49_000, hidden: true, rating: 95, raw: 95.1, momentum: 99, consistency: 90 },
    { name: "Fictif-Deux#0003", score: 48_000, hidden: false, rating: 90, raw: 90.4, momentum: null, consistency: 60 },
    { name: "Fictif-Trois#0004", score: 47_000, hidden: false, rating: 80, raw: 80.1, momentum: 40, consistency: 75 },
  ];
  const [run] = await queryRows<{ id: number }>(
    db,
    sql`INSERT INTO rating_runs (leaderboard_id, rating_version, computed_at, data_until, data_since, players, refs)
        VALUES (${LIVE.id}, '1.0.0', '2026-11-06T19:00:00Z', '2026-11-06T18:53:00Z', ${SINCE}, 4,
                ${JSON.stringify({ momentum: { h24: { median: 150, mad: 300, n: 3000 }, d7: null, d30: null }, drawdown: null, anomalyThreshold: 1456, anomalySamples: 2093, topRs: 50000, players: 4, observedDays: 0.866, calibrationDays: 7 })}::jsonb)
        RETURNING id`,
  );
  const ids = new Map<string, string>();
  for (const [i, p] of people.entries()) {
    const [row] = await queryRows<{ id: string }>(
      db,
      sql`INSERT INTO players (embark_name, first_seen_at, last_seen_at, hidden_at) VALUES (${p.name}, '2026-11-05T22:05:21Z', '2026-11-06T18:53:00Z', ${p.hidden ? "2026-11-06T00:00:00Z" : null}) RETURNING id::text`,
    );
    ids.set(p.name, row!.id);
    await db.execute(sql`INSERT INTO leaderboard_current (player_id, first_seen_at, last_change_at, updated_at, score, rank, leaderboard_id, league_number, name)
      VALUES (${row!.id}::bigint, '2026-11-05T22:05:21Z', '2026-11-06T18:00:00Z', '2026-11-06T18:53:00Z', ${p.score}, ${i + 1}, ${LIVE.id}, 20, ${p.name})`);
    await db.execute(sql`INSERT INTO ratings (leaderboard_id, player_id, run_id, rating_version, rating, raw, provisional, level, peak, momentum, consistency, legacy, active_days_30, hot_streak, anomalies, delta_24h)
      VALUES (${LIVE.id}, ${row!.id}::bigint, ${run!.id}, '1.0.0', ${p.rating}, ${p.raw}, ${p.consistency === null || p.momentum === null}, 85, 86, ${p.momentum}, ${p.consistency}, 20, 1, ${p.momentum === 70}, ${i === 3 ? 1 : 0}, 300)`);
  }
  return ids;
}

describe("rating queries", () => {
  let t: TestDb;
  let ids: Map<string, string>;
  beforeAll(async () => {
    t = await createTestDb();
    ids = await seed(t.db);
  });
  afterAll(async () => {
    await t.close();
  });

  it("reads the last run and its references", async () => {
    const run = await loadRatingRun(t.db, LIVE);
    expect(run).toMatchObject({ observedDays: 0.866, calibrationDays: 7, players: 4, version: "1.0.0", dataSince: SINCE });
    expect(run!.refs.momentum.h24).toEqual({ median: 150, mad: 300, n: 3000 });
    expect(run!.refs.anomalyThreshold).toBe(1456);
  });

  it("gives a player's rating and position, hidden profiles left out", async () => {
    const r = await loadPlayerRating(t.db, ids.get("Fictif-Un#0001")!, LIVE.id);
    expect(r).toMatchObject({ rating: 88, provisional: true, momentum: 70, consistency: null, hotStreak: true, position: 2 }); // behind Fictif-Deux; Masque does not count
    expect(r!.deltas).toEqual({ h24: 300, d7: null, d30: null });
    expect(await loadPlayerRating(t.db, "999999", LIVE.id)).toBeNull();
  });

  it("orders the derived leaderboards and skips missing values", async () => {
    const byRating = await loadRatingBoard(t.db, LIVE, "rating");
    expect(byRating.rows.map((r) => r.name)).toEqual(["Fictif-Deux#0003", "Fictif-Un#0001", "Fictif-Trois#0004"]);
    expect(byRating.rows.map((r) => r.rank)).toEqual([3, 1, 4]); // board order includes the hidden player
    const byMomentum = await loadRatingBoard(t.db, LIVE, "momentum");
    expect(byMomentum.rows.map((r) => r.name)).toEqual(["Fictif-Un#0001", "Fictif-Trois#0004"]);
    const byConsistency = await loadRatingBoard(t.db, LIVE, "consistency");
    expect(byConsistency.rows.map((r) => r.name)).toEqual(["Fictif-Trois#0004", "Fictif-Deux#0003"]);
  });

  it("picks the live example at the requested rank, skipping hidden profiles", async () => {
    const ex = await loadRatingExample(t.db, LIVE, 2);
    expect(ex).toMatchObject({ name: "Fictif-Deux#0003", rank: 3 });
  });

  it("returns nothing instead of failing before migration 0004", async () => {
    const bare = await createTestDb();
    await bare.db.execute(sql`DROP TABLE ratings`);
    await bare.db.execute(sql`DROP TABLE rating_runs`);
    expect(await loadRatingRun(bare.db, LIVE)).toBeNull();
    expect(await loadPlayerRating(bare.db, "1", LIVE.id)).toBeNull();
    expect(await loadRatingBoard(bare.db, LIVE, "rating")).toEqual({ run: null, rows: [] });
    await bare.close();
  });
});
