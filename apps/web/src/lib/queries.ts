/**
 * Requêtes de lecture du site. Fonctions pures qui reçoivent la base : testées sur PGlite avec les vraies
 * migrations (tests/unit/queries.test.ts), mises en cache par src/lib/data.ts.
 * Le site lit le schéma compact du sprint 1b : identifiants numériques de classement (leaderboards.id),
 * historique dans player_history, noms courants dans players.embark_name.
 */
import { queryRows, type Db } from "@finals-hq/db";
import { leaderboardById, LEADERBOARDS, type LeaderboardDef } from "@finals-hq/db/catalog";
import { sql } from "drizzle-orm";
import type { BoardPayload, FreshnessInfo, HomeData, PlayerData, SearchResult, StatusData } from "./types";

const iso = (v: Date | string | null | undefined): string | null => (v === null || v === undefined ? null : new Date(v).toISOString());
const num = (v: number | string | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));

export const DATABASE_LIMIT_BYTES = 500_000_000;

async function lastTakenAt(db: Db, leaderboardId: number): Promise<string | null> {
  const [row] = await queryRows<{ t: Date | string | null }>(
    db,
    sql`SELECT max(taken_at) AS t FROM snapshots WHERE leaderboard_id = ${leaderboardId} AND status = 'applied'`,
  );
  return iso(row?.t);
}

/**
 * Classement complet. En cours : leaderboard_current, rang = ordre des scores (les rangs stockés sont ceux
 * du dernier relevé complet, voir apps/worker/README.md). Archive : season_results, rang final de l'API.
 */
export async function loadBoard(db: Db, lb: LeaderboardDef): Promise<BoardPayload> {
  const takenAt = await lastTakenAt(db, lb.id);
  type Row = { name: string; score: number; league: number | null; club: string | null; d24: number | null; d7: number | null; hidden: boolean; rank: number };
  const rows = lb.isLive
    ? await queryRows<Row>(
        db,
        sql`SELECT c.name, c.score, c.league_number AS league, c.club_tag AS club, c.delta_24h AS d24, c.delta_7d AS d7,
                   (p.hidden_at IS NOT NULL) AS hidden,
                   row_number() OVER (ORDER BY c.score DESC, c.rank ASC, c.player_id)::int AS rank
            FROM leaderboard_current c JOIN players p ON p.id = c.player_id
            WHERE c.leaderboard_id = ${lb.id}
            ORDER BY c.score DESC, c.rank ASC, c.player_id`,
      )
    : await queryRows<Row>(
        db,
        sql`SELECT p.embark_name AS name, s.final_score AS score, s.final_league_number AS league, s.club_tag AS club,
                   NULL::int AS d24, NULL::int AS d7, (p.hidden_at IS NOT NULL) AS hidden, s.final_rank AS rank
            FROM season_results s JOIN players p ON p.id = s.player_id
            WHERE s.leaderboard_id = ${lb.id}
            ORDER BY s.final_rank ASC, s.final_score DESC, s.player_id`,
      );
  const n = rows.length;
  const out: BoardPayload = {
    meta: { id: lb.id, key: lb.key, isLive: lb.isLive, hasLeagues: lb.hasLeagues, takenAt, rowCount: n },
    rows: {
      rank: new Array<number>(n),
      name: new Array<string | null>(n),
      score: new Array<number>(n),
      league: new Array<number | null>(n),
      club: new Array<string | null>(n),
      d24: lb.isLive ? new Array<number | null>(n) : null,
      d7: lb.isLive ? new Array<number | null>(n) : null,
    },
  };
  rows.forEach((r, i) => {
    out.rows.rank[i] = Number(r.rank);
    out.rows.name[i] = r.hidden ? null : r.name;
    out.rows.score[i] = Number(r.score);
    out.rows.league[i] = num(r.league);
    out.rows.club[i] = r.club || null;
    if (out.rows.d24) out.rows.d24[i] = num(r.d24);
    if (out.rows.d7) out.rows.d7[i] = num(r.d7);
  });
  return out;
}

export async function loadFreshness(db: Db, leaderboardId: number): Promise<FreshnessInfo> {
  const [row] = await queryRows<{ t: Date | string | null; rejected: number }>(
    db,
    sql`SELECT (SELECT max(taken_at) FROM snapshots WHERE leaderboard_id = ${leaderboardId} AND status = 'applied') AS t,
               (SELECT count(*)::int FROM snapshots WHERE status = 'rejected' AND ingested_at > now() - interval '24 hours') AS rejected`,
  );
  return { takenAt: iso(row?.t), rejected24h: row?.rejected ?? 0 };
}

/**
 * Recherche tolérante aux fautes sur le pseudo Embark courant (pg_trgm, index players_embark_name_trgm_idx)
 * et par préfixe sur les anciens pseudos (clé primaire de player_names). Moins de 3 caractères : préfixe
 * seulement, l'index trigramme ne servant qu'à partir de 3. Profils masqués exclus.
 */
export async function searchPlayers(db: Db, rawQuery: string, liveBoardId: number, limit = 20): Promise<SearchResult[]> {
  const q = rawQuery.trim().slice(0, 40);
  if (q.length < 2) return [];
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const upper = `${q}\u{10FFFF}`;
  const fuzzy = q.length >= 3;
  const rows = await queryRows<{
    id: string | number;
    name: string;
    former: string | null;
    score: number | null;
    league: number | null;
    club: string | null;
    rank: number | null;
  }>(
    db,
    sql`WITH current_matches AS (
          SELECT p.id, p.embark_name AS name, NULL::text AS former,
                 CASE WHEN lower(p.embark_name) = lower(${q}) OR lower(split_part(p.embark_name, '#', 1)) = lower(${q}) THEN 3
                      WHEN p.embark_name ILIKE ${`${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`} THEN 2
                      ELSE 1 END AS tier,
                 ${fuzzy ? sql`similarity(p.embark_name, ${q})` : sql`0::real`} AS sim
          FROM players p
          WHERE p.linkable AND p.merged_into IS NULL AND p.hidden_at IS NULL
            AND ${fuzzy ? sql`(p.embark_name ILIKE ${like} OR p.embark_name % ${q})` : sql`p.embark_name >= ${q} AND p.embark_name < ${upper}`}
          ORDER BY tier DESC, sim DESC
          LIMIT 60
        ),
        former_matches AS (
          SELECT p.id, p.embark_name AS name, n.name AS former, 0 AS tier, 0::real AS sim
          FROM player_names n JOIN players p ON p.id = n.player_id
          WHERE n.kind = 'embark' AND n.name >= ${q} AND n.name < ${upper}
            AND p.linkable AND p.merged_into IS NULL AND p.hidden_at IS NULL
          LIMIT 20
        ),
        matches AS (
          SELECT DISTINCT ON (id) * FROM (SELECT * FROM current_matches UNION ALL SELECT * FROM former_matches) m
          ORDER BY id, tier DESC, sim DESC
        )
        SELECT m.id, m.name, m.former, c.score, c.league_number AS league, c.club_tag AS club,
               CASE WHEN c.player_id IS NULL THEN NULL ELSE (
                 SELECT count(*)::int + 1 FROM leaderboard_current o WHERE o.leaderboard_id = ${liveBoardId} AND o.score > c.score
               ) END AS rank
        FROM matches m
        LEFT JOIN leaderboard_current c ON c.leaderboard_id = ${liveBoardId} AND c.player_id = m.id
        ORDER BY m.tier DESC, (c.player_id IS NOT NULL) DESC, m.sim DESC, c.score DESC NULLS LAST, m.name
        LIMIT ${limit}`,
  );
  return rows.map((r) => ({
    playerId: String(r.id),
    name: r.name,
    formerName: r.former,
    rank: num(r.rank),
    score: num(r.score),
    league: num(r.league),
    club: r.club || null,
  }));
}

export async function loadStatus(db: Db): Promise<StatusData> {
  const live = LEADERBOARDS.filter((l) => l.isLive);
  const boards = await queryRows<{ id: number; t: Date | string | null; kind: string | null; rows: number; rejected: number }>(
    db,
    sql`SELECT l.id,
               (SELECT taken_at FROM snapshots s WHERE s.leaderboard_id = l.id AND s.status = 'applied' ORDER BY taken_at DESC LIMIT 1) AS t,
               (SELECT kind FROM snapshots s WHERE s.leaderboard_id = l.id AND s.status = 'applied' ORDER BY taken_at DESC LIMIT 1) AS kind,
               (SELECT count(*)::int FROM leaderboard_current c WHERE c.leaderboard_id = l.id) AS rows,
               (SELECT count(*)::int FROM snapshots s WHERE s.leaderboard_id = l.id AND s.status = 'rejected' AND s.ingested_at > now() - interval '24 hours') AS rejected
        FROM leaderboards l WHERE l.is_live ORDER BY l.id`,
  );
  const runs = await queryRows<{ id: number | string; command: string; status: string; started_at: Date | string; finished_at: Date | string | null; files_applied: number; files_rejected: number; error: string | null }>(
    db,
    sql`SELECT id, command, status, started_at, finished_at, files_applied, files_rejected, error FROM ingestion_runs ORDER BY id DESC LIMIT 8`,
  );
  const [stats] = await queryRows<{ size: string | number | null; players: number; archives: number }>(
    db,
    sql`SELECT pg_database_size(current_database())::bigint AS size,
               (SELECT count(*)::int FROM players) AS players,
               (SELECT count(DISTINCT leaderboard_id)::int FROM snapshots WHERE kind = 'archive' AND status = 'applied') AS archives`,
  );
  const byId = new Map(boards.map((b) => [Number(b.id), b]));
  return {
    generatedAt: new Date().toISOString(),
    boards: live.map((lb) => {
      const b = byId.get(lb.id);
      return { id: lb.id, key: lb.key, takenAt: iso(b?.t), kind: b?.kind ?? null, rows: b?.rows ?? 0, rejected24h: b?.rejected ?? 0 };
    }),
    runs: runs.map((r) => ({
      id: Number(r.id),
      command: r.command,
      status: r.status,
      startedAt: iso(r.started_at)!,
      finishedAt: iso(r.finished_at),
      applied: r.files_applied,
      rejected: r.files_rejected,
      error: r.error ? r.error.slice(0, 300) : null,
    })),
    archives: { imported: stats?.archives ?? 0, expected: LEADERBOARDS.filter((l) => !l.isLive).length },
    database: { sizeBytes: num(stats?.size), limitBytes: DATABASE_LIMIT_BYTES, players: stats?.players ?? 0 },
  };
}

export async function loadHome(db: Db, lb: LeaderboardDef): Promise<HomeData> {
  const takenAt = await lastTakenAt(db, lb.id);
  const top = await queryRows<{ name: string; score: number; league: number | null; club: string | null; d24: number | null; hidden: boolean }>(
    db,
    sql`SELECT c.name, c.score, c.league_number AS league, c.club_tag AS club, c.delta_24h AS d24, (p.hidden_at IS NOT NULL) AS hidden
        FROM leaderboard_current c JOIN players p ON p.id = c.player_id
        WHERE c.leaderboard_id = ${lb.id} ORDER BY c.score DESC, c.rank ASC, c.player_id LIMIT 10`,
  );
  const cut = await queryRows<{ taken_at: Date | string; r500: number | null; last: number | null; r1: number | null; league_counts: Record<string, number> | null }>(
    db,
    sql`SELECT taken_at, rank_500_score AS r500, last_score AS last, rank_1_score AS r1, league_counts
        FROM cutoff_history WHERE leaderboard_id = ${lb.id} ORDER BY taken_at DESC LIMIT 1`,
  );
  const latest = cut[0];
  let change24h: number | null = null;
  if (latest?.r500 !== null && latest?.r500 !== undefined) {
    const [before] = await queryRows<{ r500: number | null }>(
      db,
      sql`SELECT rank_500_score AS r500 FROM cutoff_history
          WHERE leaderboard_id = ${lb.id} AND taken_at <= ${iso(latest.taken_at)}::timestamptz - interval '24 hours'
          ORDER BY taken_at DESC LIMIT 1`,
    );
    if (before?.r500 !== null && before?.r500 !== undefined) change24h = latest.r500 - before.r500;
  }
  const movers = await queryRows<{ name: string; d7: number; score: number; league: number | null; rank: number }>(
    db,
    sql`SELECT name, d7, score, league, rank FROM (
          SELECT c.name, c.delta_7d AS d7, c.score, c.league_number AS league, (p.hidden_at IS NOT NULL) AS hidden,
                 row_number() OVER (ORDER BY c.score DESC, c.rank ASC, c.player_id)::int AS rank
          FROM leaderboard_current c JOIN players p ON p.id = c.player_id
          WHERE c.leaderboard_id = ${lb.id}
        ) t WHERE NOT hidden AND d7 IS NOT NULL AND d7 > 0 ORDER BY d7 DESC LIMIT 3`,
  );
  const leagues = Object.entries(latest?.league_counts ?? {})
    .filter(([k]) => k !== "unknown")
    .map(([k, count]) => ({ league: Number(k), count }))
    .sort((a, b) => a.league - b.league);
  return {
    takenAt,
    top: top.map((r, i) => ({ rank: i + 1, name: r.hidden ? null : r.name, score: r.score, league: num(r.league), club: r.club || null, d24: num(r.d24) })),
    top500: latest ? { score: num(latest.r500), change24h, lastScore: num(latest.last), rank1Score: num(latest.r1) } : null,
    leagues,
    movers: movers.map((m) => ({ name: m.name, d7: m.d7, score: m.score, league: num(m.league), rank: m.rank })),
  };
}

/** Profil minimal (le profil complet arrive au sprint 3). null si inconnu ; nom remplacé si masqué. */
export async function loadPlayer(db: Db, candidates: string[]): Promise<PlayerData | null> {
  if (candidates.length === 0) return null;
  const [p] = await queryRows<{ id: string | number; embark_name: string; steam_name: string | null; psn_name: string | null; xbox_name: string | null; hidden: boolean; first_seen_at: Date | string; last_seen_at: Date | string }>(
    db,
    sql`SELECT id, embark_name, steam_name, psn_name, xbox_name, (hidden_at IS NOT NULL) AS hidden, first_seen_at, last_seen_at
        FROM players
        WHERE linkable AND merged_into IS NULL AND embark_name IN (${sql.join(candidates.map((c) => sql`${c}`), sql`, `)})
        ORDER BY last_seen_at DESC LIMIT 1`,
  );
  if (!p) return null;
  const id = String(p.id);
  if (p.hidden) {
    return { id, name: "", hidden: true, platforms: { steam: null, psn: null, xbox: null }, firstSeenAt: iso(p.first_seen_at)!, lastSeenAt: iso(p.last_seen_at)!, current: [], seasons: [], formerNames: [] };
  }
  const current = await queryRows<{ leaderboard_id: number; score: number; league: number | null; club: string | null; d24: number | null; d7: number | null; updated_at: Date | string; rank: number }>(
    db,
    sql`SELECT c.leaderboard_id, c.score, c.league_number AS league, c.club_tag AS club, c.delta_24h AS d24, c.delta_7d AS d7, c.updated_at,
               (SELECT count(*)::int + 1 FROM leaderboard_current o WHERE o.leaderboard_id = c.leaderboard_id AND o.score > c.score) AS rank
        FROM leaderboard_current c WHERE c.player_id = ${id}::bigint ORDER BY c.leaderboard_id`,
  );
  const seasons = await queryRows<{ leaderboard_id: number; final_rank: number; final_score: number; league: number | null; club: string | null }>(
    db,
    sql`SELECT leaderboard_id, final_rank, final_score, final_league_number AS league, club_tag AS club
        FROM season_results WHERE player_id = ${id}::bigint ORDER BY leaderboard_id DESC`,
  );
  const former = await queryRows<{ name: string; last_seen_at: Date | string }>(
    db,
    sql`SELECT name, last_seen_at FROM player_names WHERE player_id = ${id}::bigint AND kind = 'embark' ORDER BY last_seen_at DESC LIMIT 10`,
  );
  return {
    id,
    name: p.embark_name,
    hidden: false,
    platforms: { steam: p.steam_name, psn: p.psn_name, xbox: p.xbox_name },
    firstSeenAt: iso(p.first_seen_at)!,
    lastSeenAt: iso(p.last_seen_at)!,
    current: current
      .filter((c) => leaderboardById(c.leaderboard_id))
      .map((c) => ({ leaderboardId: c.leaderboard_id, rank: c.rank, score: c.score, league: num(c.league), club: c.club || null, d24: num(c.d24), d7: num(c.d7), updatedAt: iso(c.updated_at)! })),
    seasons: seasons
      .filter((s) => leaderboardById(s.leaderboard_id))
      .map((s) => ({ leaderboardId: s.leaderboard_id, rank: s.final_rank, score: s.final_score, league: num(s.league), club: s.club || null })),
    formerNames: former.map((f) => ({ name: f.name, lastSeenAt: iso(f.last_seen_at)! })),
  };
}
