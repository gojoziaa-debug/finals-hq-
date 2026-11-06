import { connect, queryRows, type Db } from "@finals-hq/db";
import { leaderboardByKey } from "@finals-hq/db/catalog";
import { createTestDb, type TestDb } from "@finals-hq/db/test";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadBoard, loadFreshness, loadHome, loadPlayer, loadStatus, searchPlayers } from "../../src/lib/queries";

const LIVE = leaderboardByKey("s12-crossplay")!;
const ARCHIVE = leaderboardByKey("s11-crossplay")!;

/** Petite base synthétique (données fictives, marquées comme telles) sur les vraies migrations. */
async function seed(db: Db): Promise<void> {
  await db.execute(sql`INSERT INTO seasons (id, name, ordinal, is_live, has_comparable_leagues) VALUES ('s11', 'Season 11', 14, false, true), ('s12', 'Season 12', 15, true, true)`);
  for (const lb of [LIVE, ARCHIVE]) {
    await db.execute(sql`INSERT INTO leaderboards (id, key, upstream_id, platform, kind, mode, name, season_id, score_field, schema_version, has_leagues, is_live, history)
      VALUES (${lb.id}, ${lb.key}, ${lb.upstreamId}, ${lb.platform}, ${lb.kind}, ${lb.mode}, ${lb.name}, ${lb.seasonId}, ${lb.scoreField}, ${lb.schemaVersion}, ${lb.hasLeagues}, ${lb.isLive}, ${lb.history})`);
  }
  const names = ["Fictif-Alpha#0001", "Fictif-Bravo#0002", "Fictif-Charlie#0003", "Masque#0004", "Fictif-Delta#0005"];
  for (const name of names) {
    await db.execute(sql`INSERT INTO players (embark_name, steam_name, first_seen_at, last_seen_at, hidden_at)
      VALUES (${name}, ${name === "Fictif-Alpha#0001" ? "alpha_steam" : null}, '2026-11-05T00:00:00Z', '2026-11-06T09:00:00Z', ${name.startsWith("Masque") ? "2026-11-06T00:00:00Z" : null})`);
  }
  const ids = new Map((await queryRows<{ id: string; embark_name: string }>(db, sql`SELECT id::text, embark_name FROM players`)).map((r) => [r.embark_name, r.id]));
  await db.execute(sql`INSERT INTO player_names (kind, name, player_id, first_seen_at, last_seen_at) VALUES ('embark', 'AncienNom#0001', ${ids.get("Fictif-Alpha#0001")}::bigint, '2026-11-01T00:00:00Z', '2026-11-04T00:00:00Z')`);
  const [run] = await queryRows<{ id: number }>(db, sql`INSERT INTO ingestion_runs (command, started_at, finished_at, status, files_applied) VALUES ('ingest', '2026-11-06T09:30:00Z', '2026-11-06T09:31:00Z', 'ok', 1) RETURNING id`);
  const [snap] = await queryRows<{ id: number }>(
    db,
    sql`INSERT INTO snapshots (leaderboard_id, kind, source_file, sha256, taken_at, row_count, status, ingestion_run_id)
        VALUES (${LIVE.id}, 'full', 'full-x.json.gz', 'x', '2026-11-06T09:30:00Z', 4, 'applied', ${run!.id}) RETURNING id`,
  );
  const [archive] = await queryRows<{ id: number }>(
    db,
    sql`INSERT INTO snapshots (leaderboard_id, kind, source_file, sha256, taken_at, row_count, status)
        VALUES (${ARCHIVE.id}, 'archive', 'full-s11.json.gz', 'y', '2026-09-10T00:00:00Z', 2, 'applied') RETURNING id`,
  );
  // Le rang stocké (API, dernier relevé complet) peut être en retard sur les scores : le site trie par score.
  const live: Array<[string, number, number, number | null, string | null, number | null]> = [
    ["Fictif-Alpha#0001", 50_000, 2, 20, "AAA", 300],
    ["Fictif-Bravo#0002", 52_000, 1, 20, null, -150],
    ["Fictif-Charlie#0003", 40_000, 3, 17, "AAA", null],
    ["Masque#0004", 39_000, 4, 16, null, 10],
  ];
  for (const [name, score, rank, league, club, d24] of live) {
    await db.execute(sql`INSERT INTO leaderboard_current (player_id, first_seen_at, last_change_at, updated_at, score, rank, delta_24h, delta_7d, leaderboard_id, league_number, name, club_tag)
      VALUES (${ids.get(name)}::bigint, '2026-11-05T00:00:00Z', '2026-11-06T09:30:00Z', '2026-11-06T09:30:00Z', ${score}, ${rank}, ${d24}, ${d24 === null ? null : d24 * 3}, ${LIVE.id}, ${league}, ${name}, ${club})`);
  }
  await db.execute(sql`INSERT INTO season_results (player_id, snapshot_id, final_score, final_rank, leaderboard_id, final_league_number) VALUES
    (${ids.get("Fictif-Delta#0005")}::bigint, ${archive!.id}, 60000, 1, ${ARCHIVE.id}, 21),
    (${ids.get("Fictif-Alpha#0001")}::bigint, ${archive!.id}, 41000, 2, ${ARCHIVE.id}, 18)`);
  await db.execute(sql`INSERT INTO cutoff_history (taken_at, snapshot_id, row_count, rank_1_score, rank_500_score, last_score, leaderboard_id, league_counts) VALUES
    ('2026-11-05T09:00:00Z', ${snap!.id}, 4, 52000, 45000, 39000, ${LIVE.id}, '{"16":1,"17":1,"20":2}'),
    ('2026-11-06T09:30:00Z', ${snap!.id}, 4, 52000, 45250, 39000, ${LIVE.id}, '{"16":1,"17":1,"20":2}')`);
}

describe("read queries (PGlite, synthetic data)", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
    await seed(t.db);
  });
  afterAll(async () => t.close());

  it("orders a live board by score and recomputes the displayed rank", async () => {
    const board = await loadBoard(t.db, LIVE);
    expect(board.meta).toMatchObject({ isLive: true, hasLeagues: true, rowCount: 4, takenAt: "2026-11-06T09:30:00.000Z" });
    expect(board.rows.rank).toEqual([1, 2, 3, 4]);
    expect(board.rows.name).toEqual(["Fictif-Bravo#0002", "Fictif-Alpha#0001", "Fictif-Charlie#0003", null]);
    expect(board.rows.d24).toEqual([-150, 300, null, 10]);
    expect(board.rows.club).toEqual([null, "AAA", "AAA", null]);
  });

  it("reads an archived board from season_results, without deltas", async () => {
    const board = await loadBoard(t.db, ARCHIVE);
    expect(board.meta.isLive).toBe(false);
    expect(board.rows.name).toEqual(["Fictif-Delta#0005", "Fictif-Alpha#0001"]);
    expect(board.rows.league).toEqual([21, 18]);
    expect(board.rows.d24).toBeNull();
  });

  it("finds players by typo, prefix and former name, never a hidden profile", async () => {
    const fuzzy = await searchPlayers(t.db, "fictif-alfa", LIVE.id);
    expect(fuzzy.map((r) => r.name)).toContain("Fictif-Alpha#0001");
    const exact = await searchPlayers(t.db, "Fictif-Bravo", LIVE.id);
    expect(exact[0]).toMatchObject({ name: "Fictif-Bravo#0002", rank: 1, score: 52_000, league: 20 });
    const former = await searchPlayers(t.db, "AncienNom", LIVE.id);
    expect(former[0]).toMatchObject({ name: "Fictif-Alpha#0001", formerName: "AncienNom#0001", rank: 2 });
    expect(await searchPlayers(t.db, "Masque", LIVE.id)).toEqual([]);
    expect(await searchPlayers(t.db, "F", LIVE.id)).toEqual([]);
    const short = await searchPlayers(t.db, "Fi", LIVE.id);
    expect(short.length).toBe(4);
  });

  it("escapes LIKE wildcards in the query", async () => {
    expect(await searchPlayers(t.db, "%%%", LIVE.id)).toEqual([]);
  });

  it("builds the home data: top, top 500 line with its 24 h change, leagues, movers", async () => {
    const home = await loadHome(t.db, LIVE);
    expect(home.top.map((r) => r.name)).toEqual(["Fictif-Bravo#0002", "Fictif-Alpha#0001", "Fictif-Charlie#0003", null]);
    expect(home.top500).toEqual({ score: 45_250, change24h: 250, lastScore: 39_000, rank1Score: 52_000 });
    expect(home.leagues).toEqual([{ league: 16, count: 1 }, { league: 17, count: 1 }, { league: 20, count: 2 }]);
    expect(home.movers[0]).toMatchObject({ name: "Fictif-Alpha#0001", d7: 900, rank: 2 });
    expect(home.movers.map((m) => m.name)).not.toContain("Masque#0004");
  });

  it("loads a minimal profile and hides a hidden one", async () => {
    const p = await loadPlayer(t.db, ["Fictif-Alpha#0001"]);
    expect(p).toMatchObject({ name: "Fictif-Alpha#0001", hidden: false, platforms: { steam: "alpha_steam" } });
    expect(p!.current[0]).toMatchObject({ leaderboardId: LIVE.id, rank: 2, score: 50_000 });
    expect(p!.seasons[0]).toMatchObject({ leaderboardId: ARCHIVE.id, rank: 2, league: 18 });
    expect(p!.formerNames[0]!.name).toBe("AncienNom#0001");
    const hidden = await loadPlayer(t.db, ["Masque#0004"]);
    expect(hidden).toMatchObject({ hidden: true, name: "", current: [] });
    expect(await loadPlayer(t.db, ["Personne#9999"])).toBeNull();
  });

  it("reports freshness and status", async () => {
    expect(await loadFreshness(t.db, LIVE.id)).toEqual({ takenAt: "2026-11-06T09:30:00.000Z", rejected24h: 0 });
    const status = await loadStatus(t.db);
    expect(status.boards.find((b) => b.id === LIVE.id)).toMatchObject({ rows: 4, kind: "full" });
    expect(status.runs[0]).toMatchObject({ command: "ingest", status: "ok", applied: 1 });
    expect(status.archives.imported).toBe(1);
  });
});

/**
 * Sur une vraie base locale chargée par le worker (LOCAL_DATABASE_URL), mesure les temps côté base.
 * Ignoré en CI. Critère du sprint 2 : une recherche répond en moins de 100 ms côté base.
 */
describe.skipIf(!process.env.LOCAL_DATABASE_URL)("read queries on a real local database", () => {
  const conn = process.env.LOCAL_DATABASE_URL ? connect(process.env.LOCAL_DATABASE_URL) : null;
  afterAll(async () => conn?.close());

  it("serves the 10 000 rows of S12 and searches under 100 ms", async () => {
    const db = conn!.db;
    const board = await loadBoard(db, LIVE);
    expect(board.meta.rowCount).toBe(10_000);
    expect(JSON.stringify(board).length).toBeLessThan(700_000);
    const times: number[] = [];
    for (const q of ["GOJO", "gojo#62", "zzzz", "Ma", "shroud", "xX_"]) {
      await searchPlayers(db, q, LIVE.id);
      const start = performance.now();
      await searchPlayers(db, q, LIVE.id);
      times.push(performance.now() - start);
    }
    console.log("search ms", times.map((t) => t.toFixed(1)).join(" "));
    expect(Math.max(...times)).toBeLessThan(100);
    const gojo = await searchPlayers(db, "GOJO#6255", LIVE.id);
    expect(gojo[0]?.name).toBe("GOJO#6255");
  });
});
