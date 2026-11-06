import { createTestDb } from "@finals-hq/db/test";
import { describe, expect, it } from "vitest";
import { status } from "./status.ts";

describe("status", () => {
  it("reports the live boards, the archives and the largest relations of an empty database", async () => {
    const t = await createTestDb();
    const report = await status(t.db);
    await t.close();
    expect(report.live).toHaveLength(8);
    expect(report.archives).toEqual({ imported: 0, expected: 85 });
    expect(report.database.players).toBe(0);
    expect(report.database.tables.map((t) => t.name)).toContain("players");
    expect(report.database.indexes.map((i) => i.name)).toContain("player_names_name_trgm_idx");
    for (const t of report.database.tables) expect(t.totalBytes).toBeGreaterThanOrEqual(t.tableBytes + t.indexBytes);
  });
});
