/**
 * FINALS HQ Rating v1 (sprint 5) : calcul sur les classements ranked en cours.
 *
 *   worker rating [--force] [--min-interval 55] [--report rapport.md]
 *
 * Lit l'historique en base (clôtures quotidiennes de player_history, événements des 8 derniers jours de
 * rs_events, état courant de leaderboard_current, saisons archivées de season_results), mesure les
 * références de la population, note chaque joueur avec @finals-hq/core et remplace la table ratings en une
 * transaction. Les requêtes partent une par une sur la connexion du lot (incident du pooler du 6 nov. 2026).
 * Au plus un calcul par heure et par classement : le cron d'ingestion passe toutes les 10 minutes.
 */
import { LEADERBOARDS, SEASONS, type LeaderboardDef } from "@finals-hq/db/catalog";
import { queryRows, schema, timestamptz, type Db } from "@finals-hq/db";
import {
  CALIBRATION_DAYS,
  observedDays,
  ratePopulation,
  RATING_VERSION,
  type PlayerInput,
  type PlayerRating,
  type PopulationReferences,
  type RsPoint,
  type SeasonOutcome,
} from "@finals-hq/core/rating";
import { eq, lt, sql } from "drizzle-orm";
import { chunk } from "./state.ts";

const DAY = 86_400_000;
const CHUNK = 2000;
/** Fenêtre du drapeau d'anomalie : variations entre deux relevés consécutifs des 7 derniers jours. */
export const ANOMALY_WINDOW_DAYS = 7;
export const DEFAULT_MIN_INTERVAL_MIN = 55;
/**
 * Le seuil d'anomalie ne lit que les variations entre deux relevés rapprochés : après un trou de collecte
 * (nuit du 5 au 6 nov. 2026, relevés espacés de 4 h), une variation cumule des dizaines de matchs et
 * n'a rien d'inhabituel. Mesuré en local le 6 nov. : 99,9e centile 3 732 RS toutes variations confondues.
 */
export const ANOMALY_MAX_GAP_MIN = 20;
export const RUNS_KEEP_DAYS = 60;

/** Classements notés : le ranked de la saison en cours (une note par plateforme si elle a son tableau). */
export function ratedBoards(): LeaderboardDef[] {
  return LEADERBOARDS.filter((lb) => lb.isLive && lb.kind === "ranked" && lb.mode === "ranked" && lb.history === "events");
}

type Ts = Date | string;
const ms = (t: Ts) => (t instanceof Date ? t.getTime() : Date.parse(t));
const dayString = (d: Ts) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

export interface CurrentInfo {
  playerId: string;
  name: string;
  league: number | null;
  rs: number;
  rank: number;
}

export interface BoardData {
  since: number;
  until: number;
  inputs: PlayerInput[];
  current: Map<string, CurrentInfo>;
  snapshotDeltas: number[];
  /** Relevés des 7 derniers jours retenus pour le seuil d'anomalie (écart ≤ ANOMALY_MAX_GAP_MIN avec le précédent). */
  closeSnapshots: number;
}

/** Charge tout ce qu'il faut pour noter un classement ; null quand le classement n'a encore aucun relevé. */
export async function loadBoardData(db: Db, lb: LeaderboardDef): Promise<BoardData | null> {
  const [meta] = await queryRows<{ since: Ts | null; until: Ts | null; start: Ts | null }>(
    db,
    sql`SELECT (SELECT min(taken_at) FROM snapshots WHERE leaderboard_id = ${lb.id} AND status = 'applied') AS since,
               (SELECT max(taken_at) FROM snapshots WHERE leaderboard_id = ${lb.id} AND status = 'applied') AS until,
               history_start_day AS start
        FROM leaderboards WHERE id = ${lb.id}`,
  );
  if (!meta?.since || !meta.until) return null;
  const since = ms(meta.since);
  const until = ms(meta.until);
  const historyStart = meta.start ? dayString(meta.start) : null;

  const currentRows = await queryRows<{ player_id: string | number; name: string; league: number | null; score: number; rank: number }>(
    db,
    sql`SELECT player_id, name, league_number AS league, score,
               row_number() OVER (ORDER BY score DESC, rank ASC, player_id)::int AS rank
        FROM leaderboard_current WHERE leaderboard_id = ${lb.id}`,
  );
  const current = new Map<string, CurrentInfo>();
  for (const r of currentRows) {
    const id = String(r.player_id);
    current.set(id, { playerId: id, name: r.name, league: r.league === null ? null : Number(r.league), rs: Number(r.score), rank: Number(r.rank) });
  }

  const historyRows = await queryRows<{ player_id: string | number; scores: Array<number | null>; ranks: Array<number | null> }>(
    db,
    sql`SELECT h.player_id, h.scores, h.ranks FROM player_history h
        JOIN leaderboard_current c ON c.leaderboard_id = h.leaderboard_id AND c.player_id = h.player_id
        WHERE h.leaderboard_id = ${lb.id}`,
  );
  const snapshotRows = await queryRows<{ taken_at: Ts }>(
    db,
    sql`SELECT taken_at FROM snapshots WHERE leaderboard_id = ${lb.id} AND status = 'applied'
        AND taken_at > ${timestamptz(new Date(until - (ANOMALY_WINDOW_DAYS + 1) * DAY))} ORDER BY taken_at`,
  );
  const closeSnapshots = new Set<number>();
  for (let i = 1; i < snapshotRows.length; i++) {
    const t = ms(snapshotRows[i]!.taken_at);
    if (t - ms(snapshotRows[i - 1]!.taken_at) <= ANOMALY_MAX_GAP_MIN * 60_000) closeSnapshots.add(t);
  }
  const fromEvents = new Date(until - 31 * DAY);
  const eventRows = await queryRows<{ player_id: string | number; taken_at: Ts; score: number; delta: number | null; rank: number }>(
    db,
    sql`SELECT e.player_id, e.taken_at, e.score, e.score_delta AS delta, e.rank FROM rs_events e
        WHERE e.leaderboard_id = ${lb.id} AND e.taken_at > ${timestamptz(fromEvents)}
        ORDER BY e.player_id, e.taken_at`,
  );
  const outcomeRows = await queryRows<{ player_id: string | number; season_id: string; rank: number; league: number | null }>(
    db,
    sql`SELECT sr.player_id, l.season_id, min(sr.final_rank)::int AS rank,
               (array_agg(sr.final_league_number ORDER BY sr.final_rank))[1] AS league
        FROM season_results sr
        JOIN leaderboards l ON l.id = sr.leaderboard_id
        JOIN leaderboard_current c ON c.leaderboard_id = ${lb.id} AND c.player_id = sr.player_id
        WHERE l.kind = 'ranked' AND l.mode = 'ranked' AND NOT l.is_live AND l.season_id IS NOT NULL
        GROUP BY sr.player_id, l.season_id`,
  );

  const comparable = new Map(SEASONS.map((s) => [s.id, s.hasComparableLeagues]));
  const outcomes = new Map<string, SeasonOutcome[]>();
  for (const r of outcomeRows) {
    const id = String(r.player_id);
    const list = outcomes.get(id) ?? [];
    list.push({ seasonId: r.season_id, finalRank: Number(r.rank), leagueNumber: r.league === null ? null : Number(r.league), hasComparableLeagues: comparable.get(r.season_id) ?? false });
    outcomes.set(id, list);
  }

  const events = new Map<string, Array<{ at: number; rs: number; rank: number; delta: number | null }>>();
  for (const e of eventRows) {
    const id = String(e.player_id);
    const list = events.get(id) ?? [];
    list.push({ at: ms(e.taken_at), rs: Number(e.score), rank: Number(e.rank), delta: e.delta === null ? null : Number(e.delta) });
    events.set(id, list);
  }
  const closes = new Map<string, RsPoint[]>();
  if (historyStart) {
    const startMs = Date.parse(`${historyStart}T00:00:00Z`);
    for (const h of historyRows) {
      const points: RsPoint[] = [];
      h.scores.forEach((score, i) => {
        if (score === null || score === undefined) return;
        const rank = h.ranks[i];
        // Clôture du jour i : l'état à la fin de la journée UTC (même convention que le profil).
        points.push({ at: startMs + (i + 1) * DAY - 1_000, rs: Number(score), rank: rank === null || rank === undefined ? 10_000 : Number(rank) });
      });
      closes.set(String(h.player_id), points);
    }
  }

  const anomalyFrom = until - ANOMALY_WINDOW_DAYS * DAY;
  const snapshotDeltas: number[] = [];
  const inputs: PlayerInput[] = [];
  for (const info of current.values()) {
    const ev = events.get(info.playerId) ?? [];
    const firstEventAt = ev[0]?.at ?? Infinity;
    // Les clôtures ne servent qu'avant le premier événement gardé : après, chaque changement est un événement.
    const history: RsPoint[] = (closes.get(info.playerId) ?? []).filter((p) => p.at < firstEventAt);
    const recentDeltas: number[] = [];
    for (const e of ev) {
      history.push({ at: e.at, rs: e.rs, rank: e.rank });
      if (e.delta !== null && e.delta !== 0 && e.at > anomalyFrom && closeSnapshots.has(e.at)) {
        recentDeltas.push(e.delta);
        snapshotDeltas.push(e.delta);
      }
    }
    const last = history[history.length - 1];
    if (!last || last.at < until) history.push({ at: until, rs: info.rs, rank: info.rank });
    history.sort((a, b) => a.at - b.at);
    inputs.push({ playerId: info.playerId, history, rs: info.rs, rank: info.rank, outcomes: outcomes.get(info.playerId) ?? [], recentDeltas });
  }
  return { since, until, inputs, current, snapshotDeltas, closeSnapshots: closeSnapshots.size };
}

export interface RatingRunSummary {
  leaderboardId: number;
  key: string;
  skipped?: string;
  runId?: number;
  players?: number;
  observedDays?: number;
  durationMs?: number;
  references?: PopulationReferences;
  ratings?: PlayerRating[];
  current?: Map<string, CurrentInfo>;
  until?: number;
  closeSnapshots?: number;
}

const round = (x: number | null, digits = 2) => (x === null ? null : Math.round(x * 10 ** digits) / 10 ** digits);

export interface RunRatingOptions {
  force?: boolean;
  minIntervalMin?: number;
  log?: (line: string) => void;
  now?: Date;
}

export async function runRating(db: Db, options: RunRatingOptions = {}): Promise<RatingRunSummary[]> {
  const log = options.log ?? (() => {});
  const minInterval = (options.minIntervalMin ?? DEFAULT_MIN_INTERVAL_MIN) * 60_000;
  const now = options.now ?? new Date();
  const out: RatingRunSummary[] = [];
  for (const lb of ratedBoards()) {
    const [last] = await queryRows<{ computed_at: Ts; data_until: Ts }>(
      db,
      sql`SELECT computed_at, data_until FROM rating_runs WHERE leaderboard_id = ${lb.id} ORDER BY computed_at DESC LIMIT 1`,
    );
    if (!options.force && last && now.getTime() - ms(last.computed_at) < minInterval) {
      out.push({ leaderboardId: lb.id, key: lb.key, skipped: `dernier calcul ${new Date(ms(last.computed_at)).toISOString()}` });
      continue;
    }
    const started = Date.now();
    const data = await loadBoardData(db, lb);
    if (!data || data.inputs.length === 0) {
      out.push({ leaderboardId: lb.id, key: lb.key, skipped: "aucun relevé" });
      continue;
    }
    if (!options.force && last && ms(last.data_until) >= data.until) {
      out.push({ leaderboardId: lb.id, key: lb.key, skipped: "aucun relevé nouveau" });
      continue;
    }
    const result = ratePopulation(data.inputs, data.until, { snapshotDeltas: data.snapshotDeltas });
    const days = observedDays(data.since, data.until);
    const durationMs = Date.now() - started;
    const refs = { ...result.references, anomalyCloseSnapshots: data.closeSnapshots, anomalyMaxGapMin: ANOMALY_MAX_GAP_MIN, observedDays: round(days, 3), calibrationDays: CALIBRATION_DAYS };
    const runId = await db.transaction(async (tx) => {
      const [run] = await tx
        .insert(schema.ratingRuns)
        .values({ leaderboardId: lb.id, ratingVersion: RATING_VERSION, computedAt: now, dataUntil: new Date(data.until), dataSince: new Date(data.since), players: result.players.length, refs, durationMs })
        .returning({ id: schema.ratingRuns.id });
      const id = run!.id;
      await tx.delete(schema.ratings).where(eq(schema.ratings.leaderboardId, lb.id));
      for (const part of chunk(result.players, CHUNK)) {
        await tx.insert(schema.ratings).values(
          part.map((p) => ({
            leaderboardId: lb.id,
            playerId: Number(p.playerId),
            runId: id,
            ratingVersion: RATING_VERSION,
            rating: p.rating,
            raw: round(p.raw, 3),
            provisional: p.provisional,
            level: round(p.level, 3)!,
            peak: round(p.peak, 3)!,
            momentum: round(p.momentum, 3),
            momentumZ: round(p.momentumZ, 4),
            delta24h: p.deltas.h24,
            delta7d: p.deltas.d7,
            delta30d: p.deltas.d30,
            drawdown: round(p.drawdown, 1),
            consistency: round(p.consistency, 3),
            legacy: round(p.legacy, 3)!,
            activeDays30: p.activeDays30,
            hotStreak: p.hotStreak,
            anomalies: p.anomalies,
          })),
        );
      }
      await tx.delete(schema.ratingRuns).where(sql`${schema.ratingRuns.leaderboardId} = ${lb.id} AND ${lt(schema.ratingRuns.computedAt, new Date(now.getTime() - RUNS_KEEP_DAYS * DAY))}`);
      return id;
    });
    log(`rating ${lb.key} : ${result.players.length} joueurs notés en ${Date.now() - started} ms, ${round(days, 2)} j observés (calcul n° ${runId})`);
    out.push({ leaderboardId: lb.id, key: lb.key, runId, players: result.players.length, observedDays: days, durationMs, references: result.references, ratings: result.players, current: data.current, until: data.until, closeSnapshots: data.closeSnapshots });
  }
  return out;
}
