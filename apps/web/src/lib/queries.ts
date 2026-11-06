/**
 * Requêtes de lecture du site. Fonctions pures qui reçoivent la base : testées sur PGlite avec les vraies
 * migrations (tests/unit/queries.test.ts), mises en cache par src/lib/data.ts.
 * Le site lit le schéma compact du sprint 1b : identifiants numériques de classement (leaderboards.id),
 * historique dans player_history, noms courants dans players.embark_name.
 */
import { queryRows, type Db } from "@finals-hq/db";
import { leaderboardById, LEADERBOARDS, SEASONS, type LeaderboardDef } from "@finals-hq/db/catalog";
import { sql, type SQL } from "drizzle-orm";
import type { BoardPayload, ClubData, ClubRow, ClubsData, FollowedRow, FreshnessInfo, HomeData, MoversData, MoverWindow, PastThreshold, PlayerData, ProfileLive, ProfilePoint, SearchResult, StatusData, Top500Data } from "./types";

/** Classement ranked crossplay de la saison en cours (s12-crossplay = 1500), sans dépendre de lib/boards côté tests. */
export const DEFAULT_LIVE_BOARD_ID = LEADERBOARDS.find((lb) => lb.isLive && lb.kind === "ranked" && lb.platform === "crossplay")!.id;
/** Taille maximale de la liste de suivi (stockée dans le navigateur). */
export const MAX_FOLLOWED = 50;

/**
 * Rang de la ligne c dans l'ordre exact du tableau (score, puis rang stocké, puis identifiant) : à égalité de score,
 * le profil, la recherche et le suivi donnent le même rang que la ligne du classement. Deux comptes séparés
 * pour que chacun reste une lecture de l'index (leaderboard_id, score DESC, rank).
 */
function rankOf(board: SQL): SQL {
  return sql`((SELECT count(*) FROM leaderboard_current o WHERE o.leaderboard_id = ${board} AND o.score > c.score)
    + (SELECT count(*) FROM leaderboard_current o WHERE o.leaderboard_id = ${board} AND o.score = c.score
         AND (o.rank < c.rank OR (o.rank = c.rank AND o.player_id < c.player_id))) + 1)::int`;
}

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
                 SELECT ${rankOf(sql`${liveBoardId}`)}
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

const dayString = (v: Date | string): string => (typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10));

/** Jour UTC AAAA-MM-JJ + n jours. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Historique d'un joueur sur un classement en cours : clôtures quotidiennes compactées (player_history),
 * événements des 8 derniers jours (rs_events), dernière ligne de coupe (cutoff_history).
 * Les clôtures ne servent qu'avant le premier événement gardé : après, chaque changement est déjà un événement.
 */
export async function loadLive(db: Db, playerId: string, leaderboardId: number, current: { score: number; rank: number; league: number | null } | null): Promise<ProfileLive> {
  const [meta, histRows, events, cut] = await Promise.all([
    queryRows<{ start: Date | string | null; t: Date | string | null }>(
      db,
      sql`SELECT history_start_day AS start,
                 (SELECT max(taken_at) FROM snapshots WHERE leaderboard_id = ${leaderboardId} AND status = 'applied') AS t
          FROM leaderboards WHERE id = ${leaderboardId}`,
    ),
    queryRows<{ scores: Array<number | null>; ranks: Array<number | null>; leagues: Array<number | null> }>(
      db,
      sql`SELECT scores, ranks, league_numbers AS leagues FROM player_history WHERE leaderboard_id = ${leaderboardId} AND player_id = ${playerId}::bigint`,
    ),
    queryRows<{ taken_at: Date | string; score: number; delta: number | null; rank: number; league: number | null }>(
      db,
      sql`SELECT taken_at, score, score_delta AS delta, rank, league_number AS league
          FROM rs_events WHERE leaderboard_id = ${leaderboardId} AND player_id = ${playerId}::bigint ORDER BY taken_at`,
    ),
    queryRows<{ taken_at: Date | string; r500: number | null; last: number | null; r1: number | null; row_count: number; league_counts: Record<string, number> | null }>(
      db,
      sql`SELECT taken_at, rank_500_score AS r500, last_score AS last, rank_1_score AS r1, row_count, league_counts
          FROM cutoff_history WHERE leaderboard_id = ${leaderboardId} ORDER BY taken_at DESC LIMIT 1`,
    ),
  ]);
  const historyStart = meta[0]?.start ? dayString(meta[0].start) : null;
  const takenAt = iso(meta[0]?.t);
  const firstEventAt = events[0] ? new Date(events[0].taken_at).getTime() : Infinity;

  const series: ProfilePoint[] = [];
  const activity = new Map<string, number>();
  const h = histRows[0];
  if (h && historyStart) {
    let previous: number | null = null;
    h.scores.forEach((score, i) => {
      const day = addDays(historyStart, i);
      const t = `${day}T23:59:59.000Z`;
      const s = num(score);
      // Jour actif d'après les clôtures (un seul changement compté) : complété par les événements plus bas.
      if (s !== null && previous !== null && s !== previous) activity.set(day, 1);
      if (s !== null) previous = s;
      if (new Date(t).getTime() < firstEventAt) series.push({ t, score: s, rank: num(h.ranks[i]), league: num(h.leagues[i]), kind: "close" });
    });
  }
  const eventDays = new Map<string, number>();
  for (const e of events) {
    const t = iso(e.taken_at)!;
    series.push({ t, score: Number(e.score), rank: Number(e.rank), league: num(e.league), kind: "event" });
    // score_delta null = première apparition sur le classement, pas un match.
    if (e.delta !== null && Number(e.delta) !== 0) eventDays.set(t.slice(0, 10), (eventDays.get(t.slice(0, 10)) ?? 0) + 1);
  }
  for (const [day, n] of eventDays) activity.set(day, n);
  if (current && takenAt) {
    const last = series[series.length - 1];
    if (!last || new Date(last.t).getTime() < new Date(takenAt).getTime()) series.push({ t: takenAt, score: current.score, rank: current.rank, league: current.league, kind: "now" });
  }
  // Les clôtures ne descendent pas sous la seconde : un événement peut tomber avant la clôture du même jour.
  series.sort((a, b) => a.t.localeCompare(b.t));

  const c = cut[0];
  return {
    leaderboardId,
    takenAt,
    historyStart,
    series,
    activity: [...activity.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, changes]) => ({ day, changes })),
    cutoff: c
      ? {
          takenAt: iso(c.taken_at)!,
          rank500: num(c.r500),
          last: num(c.last),
          rank1: num(c.r1),
          rowCount: c.row_count,
          leagueCounts: Object.entries(c.league_counts ?? {})
            .filter(([k]) => k !== "unknown")
            .map(([k, count]) => ({ league: Number(k), count }))
            .sort((a, b) => a.league - b.league),
        }
      : null,
  };
}

/**
 * Profil complet : identité, classements en cours, saisons passées (archives), anciens pseudos et historique
 * du classement ranked en cours. null si inconnu ; masqué : rien d'autre que le drapeau.
 */
export async function loadPlayer(db: Db, candidates: string[], liveBoardId: number = DEFAULT_LIVE_BOARD_ID): Promise<PlayerData | null> {
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
    return { id, name: "", hidden: true, platforms: { steam: null, psn: null, xbox: null }, firstSeenAt: iso(p.first_seen_at)!, lastSeenAt: iso(p.last_seen_at)!, current: [], seasons: [], formerNames: [], live: null };
  }
  const [current, seasons, former] = await Promise.all([
    queryRows<{ leaderboard_id: number; score: number; league: number | null; club: string | null; d24: number | null; d7: number | null; updated_at: Date | string; last_change_at: Date | string; first_seen_at: Date | string; rank: number }>(
      db,
      sql`SELECT c.leaderboard_id, c.score, c.league_number AS league, c.club_tag AS club, c.delta_24h AS d24, c.delta_7d AS d7, c.updated_at, c.last_change_at, c.first_seen_at,
                 ${rankOf(sql`c.leaderboard_id`)} AS rank
          FROM leaderboard_current c WHERE c.player_id = ${id}::bigint ORDER BY c.leaderboard_id`,
    ),
    queryRows<{ leaderboard_id: number; final_rank: number; final_score: number; league: number | null; club: string | null }>(
      db,
      sql`SELECT leaderboard_id, final_rank, final_score, final_league_number AS league, club_tag AS club
          FROM season_results WHERE player_id = ${id}::bigint ORDER BY leaderboard_id DESC`,
    ),
    queryRows<{ name: string; last_seen_at: Date | string }>(
      db,
      sql`SELECT name, last_seen_at FROM player_names WHERE player_id = ${id}::bigint AND kind = 'embark' ORDER BY last_seen_at DESC LIMIT 10`,
    ),
  ]);
  const currentRows = current
    .filter((c) => leaderboardById(c.leaderboard_id))
    .map((c) => ({
      leaderboardId: c.leaderboard_id,
      rank: c.rank,
      score: c.score,
      league: num(c.league),
      club: c.club || null,
      d24: num(c.d24),
      d7: num(c.d7),
      updatedAt: iso(c.updated_at)!,
      lastChangeAt: iso(c.last_change_at)!,
      firstSeenAt: iso(c.first_seen_at)!,
    }));
  const main = currentRows.find((c) => c.leaderboardId === liveBoardId) ?? null;
  const live = await loadLive(db, id, liveBoardId, main);
  return {
    id,
    name: p.embark_name,
    hidden: false,
    platforms: { steam: p.steam_name, psn: p.psn_name, xbox: p.xbox_name },
    firstSeenAt: iso(p.first_seen_at)!,
    lastSeenAt: iso(p.last_seen_at)!,
    current: currentRows,
    seasons: seasons
      .filter((s) => leaderboardById(s.leaderboard_id))
      .map((s) => ({ leaderboardId: s.leaderboard_id, rank: s.final_rank, score: s.final_score, league: num(s.league), club: s.club || null })),
    formerNames: former.map((f) => ({ name: f.name, lastSeenAt: iso(f.last_seen_at)! })),
    live,
  };
}

/** Joueurs suivis (page Suivi) : état au dernier relevé du classement ranked en cours. Masqués et inconnus exclus. */
export async function loadFollowed(db: Db, ids: string[], liveBoardId: number = DEFAULT_LIVE_BOARD_ID): Promise<FollowedRow[]> {
  const clean = [...new Set(ids.filter((i) => /^\d{1,18}$/.test(i)))].slice(0, MAX_FOLLOWED);
  if (clean.length === 0) return [];
  const rows = await queryRows<{ id: string | number; name: string; score: number | null; league: number | null; club: string | null; d24: number | null; d7: number | null; rank: number | null }>(
    db,
    sql`SELECT p.id, p.embark_name AS name, c.score, c.league_number AS league, c.club_tag AS club, c.delta_24h AS d24, c.delta_7d AS d7,
               CASE WHEN c.player_id IS NULL THEN NULL ELSE (
                 SELECT ${rankOf(sql`${liveBoardId}`)}
               ) END AS rank
        FROM players p
        LEFT JOIN leaderboard_current c ON c.leaderboard_id = ${liveBoardId} AND c.player_id = p.id
        WHERE p.id IN (${sql.join(clean.map((c) => sql`${c}::bigint`), sql`, `)}) AND p.hidden_at IS NULL AND p.merged_into IS NULL`,
  );
  return rows
    .map((r) => ({ id: String(r.id), name: r.name, rank: num(r.rank), score: num(r.score), league: num(r.league), club: r.club || null, d24: num(r.d24), d7: num(r.d7) }))
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name));
}

/* ───────────────────────────── Sprint 4 : ligne top 500, clubs, progressions ───────────────────────────── */

/**
 * Ligne top 500 d'un classement en cours : RS du 500e à chaque relevé (cutoff_history, un par heure : le dernier
 * de l'heure), dernier relevé complet, et les joueurs des rangs 495 à 505.
 */
export async function loadTop500(db: Db, lb: LeaderboardDef): Promise<Top500Data> {
  const [series, latest, around, takenAt] = await Promise.all([
    queryRows<{ t: Date | string; score: number }>(
      db,
      sql`SELECT DISTINCT ON (date_trunc('hour', taken_at)) taken_at AS t, rank_500_score AS score
          FROM cutoff_history WHERE leaderboard_id = ${lb.id} AND rank_500_score IS NOT NULL
          ORDER BY date_trunc('hour', taken_at), taken_at DESC`,
    ),
    queryRows<{ taken_at: Date | string; r500: number | null; r1: number | null; last: number | null; row_count: number; league_counts: Record<string, number> | null }>(
      db,
      sql`SELECT taken_at, rank_500_score AS r500, rank_1_score AS r1, last_score AS last, row_count, league_counts
          FROM cutoff_history WHERE leaderboard_id = ${lb.id} ORDER BY taken_at DESC LIMIT 1`,
    ),
    queryRows<{ rank: number; name: string; score: number; league: number | null; club: string | null; d24: number | null; hidden: boolean }>(
      db,
      sql`SELECT c.name, c.score, c.league_number AS league, c.club_tag AS club, c.delta_24h AS d24, (p.hidden_at IS NOT NULL) AS hidden,
                 row_number() OVER (ORDER BY c.score DESC, c.rank ASC, c.player_id)::int AS rank
          FROM leaderboard_current c JOIN players p ON p.id = c.player_id
          WHERE c.leaderboard_id = ${lb.id}
          ORDER BY c.score DESC, c.rank ASC, c.player_id OFFSET 494 LIMIT 11`,
    ),
    lastTakenAt(db, lb.id),
  ]);
  const l = latest[0];
  return {
    takenAt,
    series: series.map((p) => ({ t: iso(p.t)!, score: Number(p.score) })),
    latest: l
      ? {
          takenAt: iso(l.taken_at)!,
          rank500: num(l.r500),
          rank1: num(l.r1),
          last: num(l.last),
          rowCount: l.row_count,
          leagueCounts: Object.entries(l.league_counts ?? {})
            .filter(([k]) => k !== "unknown")
            .map(([k, count]) => ({ league: Number(k), count }))
            .sort((a, b) => a.league - b.league),
        }
      : null,
    around: around.map((r) => ({ rank: Number(r.rank), name: r.hidden ? null : r.name, score: Number(r.score), league: num(r.league), club: r.club || null, d24: num(r.d24) })),
  };
}

/**
 * Classement ranked de référence d'une saison terminée : crossplay s'il existe, sinon le premier ranked archivé.
 * Seulement les saisons à ligues comparables (S3 et après) : avant, le score n'est pas un RS (fame, cashouts).
 */
export function pastRankedBoards(): LeaderboardDef[] {
  const out: LeaderboardDef[] = [];
  for (const s of SEASONS) {
    if (s.isLive || !s.hasComparableLeagues) continue;
    const ranked = LEADERBOARDS.filter((lb) => lb.seasonId === s.id && lb.kind === "ranked" && lb.mode === "ranked" && !lb.isLive);
    const pick = ranked.find((lb) => lb.platform === "crossplay") ?? ranked[0];
    if (pick) out.push(pick);
  }
  return out;
}

/**
 * Seuils des saisons passées : RS final du 500e (cutoff_history de l'archive) et sa ligue (season_results).
 * Les barèmes de RS changent d'une saison à l'autre : la page le dit, ces valeurs ne se comparent qu'en ordre de grandeur.
 */
export async function loadPastThresholds(db: Db): Promise<PastThreshold[]> {
  const boards = pastRankedBoards();
  if (boards.length === 0) return [];
  const ids = boards.map((b) => b.id);
  const rows = await queryRows<{ leaderboard_id: number; taken_at: Date | string; r500: number | null; r1: number | null; league500: number | null }>(
    db,
    sql`SELECT DISTINCT ON (h.leaderboard_id) h.leaderboard_id, h.taken_at, h.rank_500_score AS r500, h.rank_1_score AS r1,
               (SELECT s.final_league_number FROM season_results s WHERE s.leaderboard_id = h.leaderboard_id AND s.final_rank = 500 LIMIT 1) AS league500
        FROM cutoff_history h WHERE h.leaderboard_id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
        ORDER BY h.leaderboard_id, h.taken_at DESC`,
  );
  const byId = new Map(rows.map((r) => [Number(r.leaderboard_id), r]));
  const seasonName = new Map(SEASONS.map((s) => [s.id, s.name]));
  return boards
    .filter((b) => byId.has(b.id))
    .map((b) => {
      const r = byId.get(b.id)!;
      return { seasonId: b.seasonId!, seasonName: seasonName.get(b.seasonId!) ?? b.seasonId!, leaderboardId: b.id, rank500: num(r.r500), rank1: num(r.r1), league500: num(r.league500), takenAt: iso(r.taken_at)! };
    })
    .sort((a, b) => b.leaderboardId - a.leaderboardId);
}

/**
 * Classement des clubs : agrégats des membres présents dans le top 10 000 du classement en cours, par tag.
 * Seuls les membres classés sont comptés (l'API ne donne pas la liste complète d'un club).
 */
export async function loadClubs(db: Db, lb: LeaderboardDef): Promise<ClubsData> {
  const [rows, takenAt] = await Promise.all([
    queryRows<{ tag: string; name: string | null; members: number; total: string | number; avg: number; best_rank: number; best_name: string | null; best_league: number | null; d7: string | number | null; d7_known: number }>(
      db,
      sql`WITH ranked AS (
            SELECT c.club_tag, c.official_club_name, c.name, c.score, c.league_number, c.delta_7d, (p.hidden_at IS NOT NULL) AS hidden,
                   row_number() OVER (ORDER BY c.score DESC, c.rank ASC, c.player_id)::int AS pos
            FROM leaderboard_current c JOIN players p ON p.id = c.player_id
            WHERE c.leaderboard_id = ${lb.id}
          )
          SELECT club_tag AS tag, max(official_club_name) AS name, count(*)::int AS members, sum(score)::bigint AS total,
                 round(avg(score))::int AS avg, min(pos)::int AS best_rank,
                 (array_agg(name ORDER BY pos) FILTER (WHERE NOT hidden))[1] AS best_name,
                 (array_agg(league_number ORDER BY pos))[1] AS best_league,
                 sum(delta_7d)::bigint AS d7, count(delta_7d)::int AS d7_known
          FROM ranked WHERE club_tag IS NOT NULL AND club_tag <> ''
          GROUP BY club_tag
          ORDER BY sum(score) DESC, min(pos)`,
    ),
    lastTakenAt(db, lb.id),
  ]);
  return {
    takenAt,
    clubs: rows.map(
      (r): ClubRow => ({
        tag: r.tag,
        name: r.name || null,
        members: r.members,
        total: Number(r.total),
        avg: r.avg,
        bestRank: r.best_rank,
        bestName: r.best_name,
        bestLeague: num(r.best_league),
        d7: r.d7_known > 0 ? Number(r.d7) : null,
        d7Known: r.d7_known,
      }),
    ),
  };
}

/** Page d'un club : membres classés (ordre du classement). Tag exact d'abord, sinon sans tenir compte de la casse. */
export async function loadClub(db: Db, lb: LeaderboardDef, rawTag: string): Promise<ClubData | null> {
  const tag = rawTag.trim().slice(0, 16);
  if (!tag) return null;
  const members = await queryRows<{ tag: string; official: string | null; rank: number; name: string; score: number; league: number | null; d24: number | null; d7: number | null; hidden: boolean }>(
    db,
    sql`SELECT * FROM (
          SELECT c.club_tag AS tag, c.official_club_name AS official, c.name, c.score, c.league_number AS league, c.delta_24h AS d24, c.delta_7d AS d7,
                 (p.hidden_at IS NOT NULL) AS hidden,
                 row_number() OVER (ORDER BY c.score DESC, c.rank ASC, c.player_id)::int AS rank
          FROM leaderboard_current c JOIN players p ON p.id = c.player_id
          WHERE c.leaderboard_id = ${lb.id}
        ) t
        WHERE lower(tag) = lower(${tag})
        ORDER BY (tag = ${tag}) DESC, rank`,
  );
  // Un même tag en deux casses : on garde la casse exacte demandée, sinon la plus représentée (la première triée).
  const chosen = members.find((m) => m.tag === tag)?.tag ?? members[0]?.tag ?? null;
  const own = chosen ? members.filter((m) => m.tag === chosen) : [];
  const [club] = await queryRows<{ tag: string; official_name: string | null; last_seen_at: Date | string }>(
    db,
    sql`SELECT tag, official_name, last_seen_at FROM clubs WHERE lower(tag) = lower(${tag}) ORDER BY (tag = ${tag}) DESC, last_seen_at DESC LIMIT 1`,
  );
  if (own.length === 0 && !club) return null;
  return {
    tag: chosen ?? club!.tag,
    name: own.find((m) => m.official)?.official ?? club?.official_name ?? null,
    takenAt: await lastTakenAt(db, lb.id),
    members: own.map((m) => ({ rank: m.rank, name: m.hidden ? null : m.name, score: Number(m.score), league: num(m.league), d24: num(m.d24), d7: num(m.d7) })),
    lastSeenAt: iso(club?.last_seen_at),
  };
}

export const MOVERS_LIMIT = 100;

/**
 * Classements dérivés : plus fortes progressions et plus grosses chutes de RS.
 * 24 h et 7 j : delta_24h / delta_7d du worker (fenêtres glissantes, voir apps/worker/README.md).
 * Saison : RS actuel moins la première clôture quotidienne relevée du joueur (player_history), ou à défaut
 * le RS d'avant son premier changement gardé (rs_events) ; « saison » = depuis le début de la collecte.
 */
export async function loadMovers(db: Db, lb: LeaderboardDef, window: MoverWindow, direction: "up" | "down", limit = MOVERS_LIMIT): Promise<MoversData> {
  const delta =
    window === "24h"
      ? sql`c.delta_24h`
      : window === "7d"
        ? sql`c.delta_7d`
        : sql`c.score - coalesce(
            (SELECT u.s FROM player_history h, unnest(h.scores) WITH ORDINALITY AS u(s, i)
              WHERE h.leaderboard_id = c.leaderboard_id AND h.player_id = c.player_id AND u.s IS NOT NULL ORDER BY u.i LIMIT 1),
            (SELECT e.score - coalesce(e.score_delta, 0) FROM rs_events e
              WHERE e.leaderboard_id = c.leaderboard_id AND e.player_id = c.player_id ORDER BY e.taken_at LIMIT 1))`;
  const [rows, meta] = await Promise.all([
    queryRows<{ rank: number; name: string; score: number; league: number | null; club: string | null; delta: number }>(
      db,
      sql`SELECT rank, name, score, league, club, delta FROM (
            SELECT row_number() OVER (ORDER BY c.score DESC, c.rank ASC, c.player_id)::int AS rank, c.name, c.score,
                   c.league_number AS league, c.club_tag AS club, (p.hidden_at IS NOT NULL) AS hidden, (${delta})::int AS delta
            FROM leaderboard_current c JOIN players p ON p.id = c.player_id
            WHERE c.leaderboard_id = ${lb.id}
          ) t
          WHERE NOT hidden AND delta IS NOT NULL AND ${direction === "up" ? sql`delta > 0` : sql`delta < 0`}
          ORDER BY ${direction === "up" ? sql`delta DESC` : sql`delta ASC`}, rank
          LIMIT ${limit}`,
    ),
    queryRows<{ start: Date | string | null; t: Date | string | null }>(
      db,
      sql`SELECT history_start_day AS start, (SELECT max(taken_at) FROM snapshots WHERE leaderboard_id = ${lb.id} AND status = 'applied') AS t FROM leaderboards WHERE id = ${lb.id}`,
    ),
  ]);
  return {
    takenAt: iso(meta[0]?.t),
    historyStart: meta[0]?.start ? dayString(meta[0].start) : null,
    rows: rows.map((r) => ({ rank: Number(r.rank), name: r.name, score: Number(r.score), league: num(r.league), club: r.club || null, delta: Number(r.delta) })),
  };
}
