/**
 * Lectures du Rating (sprint 5) : dernier calcul d'un classement, note d'un joueur, classements par Rating,
 * Momentum et Consistance. Pures comme queries.ts, testées sur PGlite (tests/unit/rating-queries.test.ts).
 * Tant que la migration 0004 n'est pas passée, chaque lecture renvoie « rien » au lieu d'une erreur : le site
 * ne casse pas entre le déploiement et la première ingestion.
 */
import { queryRows, type Db } from "@finals-hq/db";
import type { LeaderboardDef } from "@finals-hq/db/catalog";
import { sql, type SQL } from "drizzle-orm";
import type { PlayerRatingData, RatingBoardData, RatingRunInfo, RatingSort } from "./types";

export const RATING_BOARD_LIMIT = 100;

const iso = (v: Date | string) => new Date(v).toISOString();
const num = (v: number | string | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));

/** 42P01 = table absente (migration 0004 pas encore appliquée). */
function isMissingTable(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string }; message?: string };
  return e?.code === "42P01" || e?.cause?.code === "42P01" || /relation "rating/.test(e?.message ?? "");
}

async function orEmpty<T>(work: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isMissingTable(error)) return empty;
    throw error;
  }
}

interface RunRow {
  id: number;
  computed_at: Date | string;
  data_until: Date | string;
  data_since: Date | string;
  players: number;
  rating_version: string;
  refs: Record<string, unknown>;
}

function runInfo(r: RunRow): RatingRunInfo {
  const refs = r.refs as unknown as RatingRunInfo["refs"] & { observedDays?: number; calibrationDays?: number };
  return {
    computedAt: iso(r.computed_at),
    dataUntil: iso(r.data_until),
    dataSince: iso(r.data_since),
    observedDays: Number(refs.observedDays ?? (Date.parse(iso(r.data_until)) - Date.parse(iso(r.data_since))) / 86_400_000),
    calibrationDays: Number(refs.calibrationDays ?? 7),
    players: Number(r.players),
    version: r.rating_version,
    refs: {
      momentum: refs.momentum ?? { h24: null, d7: null, d30: null },
      drawdown: refs.drawdown ?? null,
      anomalyThreshold: refs.anomalyThreshold ?? null,
      anomalySamples: Number(refs.anomalySamples ?? 0),
      topRs: Number(refs.topRs ?? 0),
    },
  };
}

async function latestRun(db: Db, leaderboardId: number): Promise<RunRow | null> {
  const [run] = await queryRows<RunRow>(
    db,
    sql`SELECT id, computed_at, data_until, data_since, players, rating_version, refs FROM rating_runs
        WHERE leaderboard_id = ${leaderboardId} ORDER BY computed_at DESC LIMIT 1`,
  );
  return run ?? null;
}

export function loadRatingRun(db: Db, lb: LeaderboardDef): Promise<RatingRunInfo | null> {
  return orEmpty(async () => {
    const run = await latestRun(db, lb.id);
    return run ? runInfo(run) : null;
  }, null);
}

/** Note d'un joueur sur un classement, avec le calcul dont elle sort ; null si le joueur n'est pas noté. */
export function loadPlayerRating(db: Db, playerId: string, leaderboardId: number): Promise<PlayerRatingData | null> {
  return orEmpty(async () => {
    const [r] = await queryRows<{
      run_id: number; rating: number | null; raw: number | null; provisional: boolean; level: number; peak: number; momentum: number | null; consistency: number | null; legacy: number;
      momentum_z: number | null; delta_24h: number | null; delta_7d: number | null; delta_30d: number | null; drawdown: number | null; active_days_30: number; hot_streak: boolean; anomalies: number; position: number | null;
    }>(
      db,
      sql`SELECT r.*,
                 CASE WHEN r.raw IS NULL THEN NULL ELSE (SELECT count(*) + 1 FROM ratings o JOIN players p ON p.id = o.player_id
                   WHERE o.leaderboard_id = r.leaderboard_id AND p.hidden_at IS NULL AND o.raw > r.raw)::int END AS position
          FROM ratings r WHERE r.leaderboard_id = ${leaderboardId} AND r.player_id = ${playerId}::bigint`,
    );
    if (!r) return null;
    const [run] = await queryRows<RunRow>(db, sql`SELECT id, computed_at, data_until, data_since, players, rating_version, refs FROM rating_runs WHERE id = ${r.run_id}`);
    if (!run) return null;
    return {
      rating: num(r.rating),
      raw: num(r.raw),
      provisional: Boolean(r.provisional),
      level: Number(r.level),
      peak: Number(r.peak),
      momentum: num(r.momentum),
      consistency: num(r.consistency),
      legacy: Number(r.legacy),
      momentumZ: num(r.momentum_z),
      deltas: { h24: num(r.delta_24h), d7: num(r.delta_7d), d30: num(r.delta_30d) },
      drawdown: num(r.drawdown),
      activeDays30: Number(r.active_days_30),
      hotStreak: Boolean(r.hot_streak),
      anomalies: Number(r.anomalies),
      position: num(r.position),
      run: runInfo(run),
    };
  }, null);
}

const ORDER: Record<RatingSort, { where: SQL; order: SQL }> = {
  rating: { where: sql`r.raw IS NOT NULL`, order: sql`r.raw DESC, board_rank` },
  momentum: { where: sql`r.momentum IS NOT NULL`, order: sql`r.momentum DESC, board_rank` },
  consistency: { where: sql`r.consistency IS NOT NULL`, order: sql`r.consistency DESC, board_rank` },
};

/** Les 100 premiers d'un classement dérivé du Rating ; profils masqués exclus. */
export function loadRatingBoard(db: Db, lb: LeaderboardDef, sort: RatingSort, limit = RATING_BOARD_LIMIT): Promise<RatingBoardData> {
  return orEmpty(async () => {
    const run = await latestRun(db, lb.id);
    if (!run) return { run: null, rows: [] };
    const { where, order } = ORDER[sort];
    const rows = await queryRows<{
      board_rank: number; name: string; score: number; league: number | null; club: string | null; rating: number | null; raw: number | null; provisional: boolean;
      level: number; momentum: number | null; consistency: number | null; legacy: number; hot_streak: boolean;
    }>(
      db,
      sql`SELECT b.board_rank, b.name, b.score, b.league, b.club, r.rating, r.raw, r.provisional, r.level, r.momentum, r.consistency, r.legacy, r.hot_streak
          FROM ratings r
          JOIN (SELECT c.player_id, c.name, c.score, c.league_number AS league, c.club_tag AS club,
                       row_number() OVER (ORDER BY c.score DESC, c.rank ASC, c.player_id)::int AS board_rank
                FROM leaderboard_current c WHERE c.leaderboard_id = ${lb.id}) b ON b.player_id = r.player_id
          JOIN players p ON p.id = r.player_id
          WHERE r.leaderboard_id = ${lb.id} AND p.hidden_at IS NULL AND ${where}
          ORDER BY ${order}
          LIMIT ${limit}`,
    );
    return {
      run: runInfo(run),
      rows: rows.map((r, i) => ({
        position: i + 1,
        rank: Number(r.board_rank),
        name: r.name,
        score: Number(r.score),
        league: num(r.league),
        club: r.club || null,
        rating: num(r.rating),
        raw: num(r.raw),
        provisional: Boolean(r.provisional),
        level: Number(r.level),
        momentum: num(r.momentum),
        consistency: num(r.consistency),
        legacy: Number(r.legacy),
        hotStreak: Boolean(r.hot_streak),
      })),
    };
  }, { run: null, rows: [] });
}

/** Exemple vivant de la page Méthodologie : le joueur à ce rang du classement (le 500e par défaut). */
export function loadRatingExample(db: Db, lb: LeaderboardDef, rank = 500): Promise<{ name: string; rank: number; score: number; league: number | null; rating: PlayerRatingData } | null> {
  return orEmpty(async () => {
    const [row] = await queryRows<{ player_id: string | number; name: string; score: number; league: number | null; board_rank: number }>(
      db,
      sql`SELECT player_id, name, score, league, board_rank FROM (
            SELECT c.player_id, c.name, c.score, c.league_number AS league, (p.hidden_at IS NOT NULL) AS hidden,
                   row_number() OVER (ORDER BY c.score DESC, c.rank ASC, c.player_id)::int AS board_rank
            FROM leaderboard_current c JOIN players p ON p.id = c.player_id WHERE c.leaderboard_id = ${lb.id}) t
          WHERE NOT hidden AND board_rank >= ${rank} ORDER BY board_rank LIMIT 1`,
    );
    if (!row) return null;
    const rating = await loadPlayerRating(db, String(row.player_id), lb.id);
    if (!rating) return null;
    return { name: row.name, rank: Number(row.board_rank), score: Number(row.score), league: num(row.league), rating };
  }, null);
}
