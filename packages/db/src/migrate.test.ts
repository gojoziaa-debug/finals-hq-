import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { queryRows } from "./index.ts";
import { ensureRsEventsPartition, listRsEventsPartitions, migrate, pruneRsEventsPartitions, readMigrations } from "./migrate.ts";
import { createTestDb, type TestDb } from "./test.ts";

describe("migrations", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  });
  afterAll(async () => {
    await t.close();
  });

  it("splits files on statement breakpoints", async () => {
    const files = await readMigrations();
    expect(files.map((f) => f.name)).toEqual(["0001_init.sql", "0002_compact.sql", "0003_rs_events_index_diet.sql", "0004_rating.sql", "0005_privacy_usage.sql"]);
    expect(files[1]!.statements.length).toBeGreaterThan(20);
  });

  it("applies once and is idempotent", async () => {
    expect(await migrate(t.db)).toEqual([]);
    const tables = await queryRows<{ table_name: string }>(
      t.db,
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    const names = tables.map((r) => r.table_name);
    for (const expected of [
      "seasons", "leaderboards", "players", "player_names", "identity_candidates", "snapshots", "rs_events",
      "player_history", "leaderboard_current", "season_results", "clubs", "cutoff_history", "ingestion_runs", "hidden_profiles", "rating_runs", "ratings", "usage_counters",
    ]) expect(names).toContain(expected);
    expect(names).not.toContain("rank_daily");
  });

  it("creates daily partitions of rs_events, moves rows out of the default partition and prunes old days", async () => {
    await t.db.execute(sql`INSERT INTO rs_events (leaderboard_id, player_id, taken_at, score, rank, snapshot_id) VALUES (1500, 1, '2026-11-05T22:05:00Z', 10, 1, 1)`);
    const count = async (table: string) =>
      (await queryRows<{ n: number }>(t.db, sql.raw(`SELECT count(*)::int AS n FROM ${table}`)))[0]?.n;
    expect(await count("rs_events_default")).toBe(1);
    expect(await ensureRsEventsPartition(t.db, new Date("2026-11-05T23:59:59Z"))).toBe("rs_events_2026_11_05");
    expect(await ensureRsEventsPartition(t.db, new Date("2026-11-05T00:00:00Z"))).toBe("rs_events_2026_11_05");
    expect(await ensureRsEventsPartition(t.db, new Date("2026-11-13T10:00:00Z"))).toBe("rs_events_2026_11_13");
    expect(await count("rs_events_2026_11_05")).toBe(1);
    expect(await count("rs_events_default")).toBe(0);
    expect(await count("rs_events")).toBe(1);
    expect((await listRsEventsPartitions(t.db)).map((p) => p.day)).toEqual(["2026-11-05", "2026-11-13"]);
    // Keep 8 days as of 2026-11-14: the 5th goes, the 13th stays.
    expect(await pruneRsEventsPartitions(t.db, 8, new Date("2026-11-14T06:00:00Z"))).toEqual(["rs_events_2026_11_05"]);
    expect((await listRsEventsPartitions(t.db)).map((p) => p.name)).toEqual(["rs_events_2026_11_13"]);
    expect(await count("rs_events")).toBe(0);
    expect(await pruneRsEventsPartitions(t.db, 8, new Date("2026-11-14T06:00:00Z"))).toEqual([]);
  });

  it("has the trigram index for name search on players only", async () => {
    const r = await queryRows<{ similarity: number }>(t.db, sql`SELECT similarity('GOJO#6255', 'gojo') AS similarity`);
    expect(r[0]?.similarity).toBeGreaterThan(0);
    const indexes = await queryRows<{ indexname: string }>(t.db, sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexdef LIKE '%gin_trgm_ops%'`);
    expect(indexes.map((i) => i.indexname)).toEqual(["players_embark_name_trgm_idx"]);
  });
});
