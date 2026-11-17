import { queryRows } from "@finals-hq/db";
import { createTestDb, type TestDb } from "@finals-hq/db/test";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compactTables } from "../src/compact.ts";

describe("compactage des tables réécrites à chaque passage", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
    await t.db.execute(sql`INSERT INTO players (embark_name, first_seen_at, last_seen_at)
      SELECT 'P' || g || '#0001', now(), now() FROM generate_series(1, 3000) g`);
    // Every ingest rewrites last_seen_at: simulate a day of updates.
    for (let i = 0; i < 6; i++) await t.db.execute(sql`UPDATE players SET last_seen_at = now() + ${`${i} minutes`}::interval`);
  });
  afterAll(async () => {
    await t.close();
  });

  it("does nothing below the size threshold", async () => {
    const r = await compactTables(t.db, { thresholdBytes: 10_000_000_000 });
    expect(r.skipped).toMatch(/sous le seuil/);
    expect(r.tables).toEqual([]);
  });

  it("skips a table with little to gain, rewrites it when forced, and keeps every row", async () => {
    const lines: string[] = [];
    const quiet = await compactTables(t.db, { thresholdBytes: 0, minBloatBytes: 1e12 });
    expect(quiet.tables.every((x) => x.skipped)).toBe(true);
    const r = await compactTables(t.db, { force: true, log: (l) => lines.push(l) });
    const players = r.tables.find((x) => x.name === "players")!;
    expect(players.skipped).toBeUndefined();
    expect(players.after).toBeLessThan(players.before);
    expect(lines.some((l) => l.startsWith("compactage players"))).toBe(true);
    const [n] = await queryRows<{ n: number }>(t.db, sql`SELECT count(*)::int AS n FROM players`);
    expect(n!.n).toBe(3000);
    const [ff] = await queryRows<{ o: string[] | null }>(t.db, sql`SELECT reloptions AS o FROM pg_class WHERE relname = 'players'`);
    expect(ff!.o).toContain("fillfactor=90");
  });
});
