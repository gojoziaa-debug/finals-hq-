import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { queryRows } from "./index.ts";
import { ensureRsEventsPartition, migrate, readMigrations } from "./migrate.ts";
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
    expect(files[0]?.name).toBe("0001_init.sql");
    expect(files[0]!.statements.length).toBeGreaterThan(20);
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
      "rank_daily", "leaderboard_current", "season_results", "clubs", "cutoff_history", "ingestion_runs", "hidden_profiles",
    ]) expect(names).toContain(expected);
  });

  it("creates monthly partitions of rs_events and moves rows out of the default partition", async () => {
    await t.db.execute(sql`INSERT INTO rs_events (leaderboard_key, player_id, taken_at, score, rank, snapshot_id) VALUES ('k', 1, '2026-11-05T22:05:00Z', 10, 1, 1)`);
    const count = async (table: string) =>
      (await queryRows<{ n: number }>(t.db, sql.raw(`SELECT count(*)::int AS n FROM ${table}`)))[0]?.n;
    expect(await count("rs_events_default")).toBe(1);
    expect(await ensureRsEventsPartition(t.db, new Date("2026-11-20T00:00:00Z"))).toBe("rs_events_2026_11");
    expect(await ensureRsEventsPartition(t.db, new Date("2026-11-01T00:00:00Z"))).toBe("rs_events_2026_11");
    expect(await count("rs_events_2026_11")).toBe(1);
    expect(await count("rs_events_default")).toBe(0);
    expect(await count("rs_events")).toBe(1);
  });

  it("has the trigram index for name search", async () => {
    const r = await queryRows<{ similarity: number }>(t.db, sql`SELECT similarity('GOJO#6255', 'gojo') AS similarity`);
    expect(r[0]?.similarity).toBeGreaterThan(0);
  });
});
