/**
 * Ingestion des relevés du collecteur (chaînes full + deltas) vers Postgres.
 * Un fichier = une transaction ; un fichier déjà présent dans `snapshots` est ignoré (idempotence).
 *
 * Schéma v2 (migration 0002) : l'historique quotidien est un tableau par (classement, joueur) dans
 * player_history ; rs_events ne reçoit que les classements dont history = 'events' et ses partitions
 * journalières sont purgées en fin de passage (`keepDays`).
 */
import { LEADERBOARDS, SEASONS, leaderboardByKey, schema, timestamptz, type Db, type LeaderboardDef } from "@finals-hq/db";
import { ensureRsEventsPartition, pruneRsEventsPartitions, purgeBoardEvents } from "@finals-hq/db/migrate";
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { FileFormatError, type DeltaSnapshot, type Row, type SnapshotFile } from "./files.ts";
import { platformCounts, resolveIdentities, type RemovedPlayer, type Resolution } from "./identity.ts";
import { describeError } from "./errors.ts";
import { RowError, extraFields, indexRows, normalizeRow, type NormalizedRow } from "./normalize.ts";
import type { DataSource } from "./source.ts";
import { assignRanks, chunk, cutoffs, dayIndex, daysBefore, hasScoreChange, previousUtcDay, utcDay, type CurrentRow } from "./state.ts";

const { seasons, leaderboards, players, snapshots, rsEvents, playerHistory, leaderboardCurrent, clubs, cutoffHistory, ingestionRuns } = schema;

export type Logger = (line: string) => void;

/** Days of rs_events kept (daily partitions); delta_7d needs seven full days plus the current one. */
export const DEFAULT_KEEP_DAYS = 8;

export interface FileOutcome {
  key: string;
  file: string;
  status: "applied" | "rejected" | "skipped";
  reason?: string;
  takenAt?: string;
  rows?: number;
  /** Rows whose score, league or club changed (or new rows), whatever the history mode. */
  changes?: number;
  /** rs_events written: equals `changes` on 'events' boards, 0 on 'daily' boards. */
  events?: number;
  identity?: Omit<Resolution, "byName">;
}

export interface RunSummary {
  runId: number;
  status: "ok" | "error";
  applied: number;
  rejected: number;
  skipped: number;
  freshnessAt: string | null;
  outcomes: FileOutcome[];
  errors: string[];
  prunedPartitions: string[];
}

interface LastApplied {
  sourceFile: string;
  kind: string;
  baseFile: string | null;
  seq: number | null;
  takenAt: Date;
}

class ChainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChainError";
  }
}

// Rows per statement: the CI runner talks to Supabase across the Atlantic, so fewer, larger
// round trips matter more than statement size (postgres.js allows 65 534 parameters).
const CHUNK = 2000;
const quiet: Logger = () => {};

/** Seasons and leaderboards of the catalog, upserted so foreign keys always resolve (history_start_day is never touched). */
export async function syncCatalog(db: Db): Promise<void> {
  await db
    .insert(seasons)
    .values(SEASONS.map((s) => ({ id: s.id, name: s.name, ordinal: s.ordinal, isLive: s.isLive, hasComparableLeagues: s.hasComparableLeagues })))
    .onConflictDoUpdate({
      target: seasons.id,
      set: { name: sql`excluded.name`, ordinal: sql`excluded.ordinal`, isLive: sql`excluded.is_live`, hasComparableLeagues: sql`excluded.has_comparable_leagues` },
    });
  await db
    .insert(leaderboards)
    .values(
      LEADERBOARDS.map((lb) => ({
        id: lb.id,
        key: lb.key,
        upstreamId: lb.upstreamId,
        platform: lb.platform,
        kind: lb.kind,
        mode: lb.mode,
        name: lb.name,
        seasonId: lb.seasonId,
        scoreField: lb.scoreField,
        schemaVersion: lb.schemaVersion,
        hasLeagues: lb.hasLeagues,
        isLive: lb.isLive,
        history: lb.history,
      })),
    )
    .onConflictDoUpdate({
      target: leaderboards.id,
      set: {
        key: sql`excluded.key`,
        name: sql`excluded.name`,
        kind: sql`excluded.kind`,
        mode: sql`excluded.mode`,
        seasonId: sql`excluded.season_id`,
        scoreField: sql`excluded.score_field`,
        schemaVersion: sql`excluded.schema_version`,
        hasLeagues: sql`excluded.has_leagues`,
        isLive: sql`excluded.is_live`,
        history: sql`excluded.history`,
      },
    });
}

export async function startRun(db: Db, command: string, startedAt: Date): Promise<number> {
  const [row] = await db.insert(ingestionRuns).values({ command, startedAt, status: "running" }).returning({ id: ingestionRuns.id });
  return row!.id;
}

export async function finishRun(db: Db, runId: number, summary: Omit<RunSummary, "runId">, finishedAt: Date): Promise<void> {
  await db
    .update(ingestionRuns)
    .set({
      finishedAt,
      status: summary.status,
      filesApplied: summary.applied,
      filesRejected: summary.rejected,
      filesSkipped: summary.skipped,
      sourceFreshnessAt: summary.freshnessAt ? new Date(summary.freshnessAt) : null,
      error: summary.errors.length > 0 ? summary.errors.join("\n") : null,
      details: {
        files: summary.outcomes
          .filter((o) => o.status !== "skipped")
          .map(({ key, file, status, reason, takenAt, rows, changes, events }) => ({ key, file, status, reason, takenAt, rows, changes, events })),
        prunedPartitions: summary.prunedPartitions,
      },
    })
    .where(eq(ingestionRuns.id, runId));
}

export function summarize(runId: number, outcomes: FileOutcome[], errors: string[], prunedPartitions: string[] = []): RunSummary {
  const applied = outcomes.filter((o) => o.status === "applied");
  const rejected = outcomes.filter((o) => o.status === "rejected").length;
  const skipped = outcomes.filter((o) => o.status === "skipped").length;
  const freshness = applied.map((o) => o.takenAt!).sort().at(-1) ?? null;
  return {
    runId,
    status: errors.length > 0 || rejected > 0 ? "error" : "ok",
    applied: applied.length,
    rejected,
    skipped,
    freshnessAt: freshness,
    outcomes,
    errors,
    prunedPartitions,
  };
}

export interface IngestOptions {
  only?: string | undefined;
  log?: Logger | undefined;
  now?: Date | undefined;
  /** Daily partitions of rs_events older than this many days before `now` are dropped at the end of the run. */
  keepDays?: number | undefined;
}

export async function ingestAll(db: Db, source: DataSource, options: IngestOptions = {}): Promise<RunSummary> {
  const log = options.log ?? quiet;
  const now = options.now ?? new Date();
  const runId = await startRun(db, "ingest", now);
  await syncCatalog(db);
  const keys = options.only ? [options.only] : await source.listStateKeys();
  const outcomes: FileOutcome[] = [];
  const errors: string[] = [];
  for (const key of keys) {
    try {
      outcomes.push(...(await ingestLeaderboard(db, source, key, runId, log)));
    } catch (error) {
      const message = `${key} : ${describeError(error)}`;
      errors.push(message);
      log(`[${key}] ERREUR ${describeError(error)}`);
    }
  }
  try {
    // Live boards without event history (World Tour and sponsor since 2026-11-08): drop what they wrote before.
    const daily = LEADERBOARDS.filter((lb) => lb.isLive && lb.history !== "events").map((lb) => lb.id);
    const purge = await purgeBoardEvents(db, daily);
    if (purge.deleted > 0) log(`rs_events : ${purge.deleted} événements de classements sans détail supprimés, ${purge.compacted.join(", ")} compactée(s)`);
  } catch (error) {
    errors.push(`purge des événements sans détail : ${describeError(error)}`);
    log(`ERREUR purge des événements sans détail : ${describeError(error)}`);
  }
  let pruned: string[] = [];
  try {
    pruned = await pruneRsEventsPartitions(db, options.keepDays ?? DEFAULT_KEEP_DAYS, now);
    if (pruned.length > 0) log(`partitions purgées : ${pruned.join(", ")}`);
  } catch (error) {
    errors.push(`purge rs_events : ${describeError(error)}`);
    log(`ERREUR purge rs_events : ${describeError(error)}`);
  }
  const summary = summarize(runId, outcomes, errors, pruned);
  await finishRun(db, runId, summary, new Date());
  return summary;
}

export async function lastAppliedSnapshot(db: Db, lb: LeaderboardDef): Promise<LastApplied | null> {
  const [row] = await db
    .select({ sourceFile: snapshots.sourceFile, kind: snapshots.kind, baseFile: snapshots.baseFile, seq: snapshots.seq, takenAt: snapshots.takenAt })
    .from(snapshots)
    .where(and(eq(snapshots.leaderboardId, lb.id), eq(snapshots.status, "applied"), inArray(snapshots.kind, ["full", "delta"])))
    .orderBy(desc(snapshots.takenAt), desc(snapshots.id))
    .limit(1);
  return row ?? null;
}

export async function ingestLeaderboard(db: Db, source: DataSource, key: string, runId: number, log: Logger = quiet): Promise<FileOutcome[]> {
  const lb = leaderboardByKey(key);
  if (!lb) throw new Error("classement absent du catalogue (packages/db/src/catalog.ts), fichiers ignorés");
  if (!lb.isLive) {
    // Season over: its frozen result comes from seasons/ (import-archives). Applying a late file here
    // would recreate leaderboard_current rows that import-archives has just removed.
    log(`[${key}] saison terminée dans le catalogue, chaîne ignorée`);
    return [];
  }
  const manifest = await source.readManifest(key);
  const files = await source.listArchiveFiles(key);
  if (manifest?.base) files.push(manifest.base.file, ...manifest.deltas.map((d) => d.file));
  const known = new Set(
    (await db.select({ file: snapshots.sourceFile }).from(snapshots).where(eq(snapshots.leaderboardId, lb.id))).map((r) => r.file),
  );
  let last = await lastAppliedSnapshot(db, lb);
  const outcomes: FileOutcome[] = [];
  let appliedAny = false;
  for (const file of files) {
    if (known.has(file)) {
      outcomes.push({ key, file, status: "skipped" });
      continue;
    }
    const outcome = await applyFile(db, source, lb, file, last, runId, log);
    outcomes.push(outcome);
    known.add(file);
    if (outcome.status === "applied") {
      appliedAny = true;
      last = await lastAppliedSnapshot(db, lb);
    }
  }
  if (appliedAny && last) await refreshWindowDeltas(db, lb, last.takenAt);
  return outcomes;
}

function expectedPredecessor(delta: DeltaSnapshot, last: LastApplied | null): string | null {
  if (!last) return `aucun fichier appliqué avant ${delta.base}`;
  if (delta.seq === 1) return last.sourceFile === delta.base ? null : `attendu ${delta.base}, dernier appliqué ${last.sourceFile}`;
  if (last.kind === "delta" && last.baseFile === delta.base && last.seq === delta.seq - 1) return null;
  return `attendu le delta ${delta.seq - 1} de ${delta.base}, dernier appliqué ${last.sourceFile}`;
}

async function rejectFile(db: Db, lb: LeaderboardDef, file: string, snapshot: SnapshotFile | null, reason: string, runId: number): Promise<void> {
  await db
    .insert(snapshots)
    .values({
      leaderboardId: lb.id,
      kind: snapshot?.type ?? "unknown",
      sourceFile: file,
      baseFile: snapshot?.type === "delta" ? snapshot.base : null,
      seq: snapshot?.type === "delta" ? snapshot.seq : null,
      sha256: snapshot?.sha256 ?? "",
      takenAt: snapshot ? new Date(snapshot.source.fetchedAt) : new Date(),
      rowCount: snapshot?.count ?? 0,
      status: "rejected",
      reason: reason.slice(0, 2000),
      ingestionRunId: runId,
    })
    .onConflictDoNothing();
}

/** A row of leaderboard_current joined with the platform names of its player. */
export interface StoredCurrent {
  playerId: number;
  name: string;
  rank: number;
  score: number;
  leagueNumber: number | null;
  steamName: string | null;
  psnName: string | null;
  xboxName: string | null;
  clubTag: string | null;
  clubUuid: string | null;
  officialClubName: string | null;
  extra: Record<string, unknown> | null;
  firstSeenAt: Date;
  lastChangeAt: Date;
}

/**
 * The API row rebuilt from the stored columns, so a partial delta row can be merged into it.
 * Volatile fields (`change`) and the league label are not stored and come back only with the next full snapshot.
 */
export function rawOf(r: StoredCurrent, lb: LeaderboardDef): Row {
  const raw: Row = { ...((r.extra ?? {}) as Row), rank: r.rank, name: r.name, [lb.scoreField]: r.score };
  if (r.steamName !== null) raw.steamName = r.steamName;
  if (r.psnName !== null) raw.psnName = r.psnName;
  if (r.xboxName !== null) raw.xboxName = r.xboxName;
  if (r.leagueNumber !== null) raw.leagueNumber = r.leagueNumber;
  if (r.clubTag !== null) raw.clubTag = r.clubTag;
  if (r.clubUuid !== null) raw.clubUuid = r.clubUuid;
  if (r.officialClubName !== null) raw.officialClubName = r.officialClubName;
  return raw;
}

interface LoadedState {
  rows: CurrentRow[];
  byName: Map<string, CurrentRow>;
  byPlayer: Map<number, CurrentRow>;
}

async function loadState(tx: Db, lb: LeaderboardDef): Promise<LoadedState> {
  const found: StoredCurrent[] = await tx
    .select({
      playerId: leaderboardCurrent.playerId,
      name: leaderboardCurrent.name,
      rank: leaderboardCurrent.rank,
      score: leaderboardCurrent.score,
      leagueNumber: leaderboardCurrent.leagueNumber,
      steamName: players.steamName,
      psnName: players.psnName,
      xboxName: players.xboxName,
      clubTag: leaderboardCurrent.clubTag,
      clubUuid: leaderboardCurrent.clubUuid,
      officialClubName: leaderboardCurrent.officialClubName,
      extra: leaderboardCurrent.extra,
      firstSeenAt: leaderboardCurrent.firstSeenAt,
      lastChangeAt: leaderboardCurrent.lastChangeAt,
    })
    .from(leaderboardCurrent)
    .innerJoin(players, eq(players.id, leaderboardCurrent.playerId))
    .where(eq(leaderboardCurrent.leaderboardId, lb.id));
  const rows: CurrentRow[] = [];
  for (const r of found) {
    const normalized = normalizeRow(rawOf(r, lb), lb);
    rows.push({ ...normalized, rank: r.rank, playerId: r.playerId, firstSeenAt: r.firstSeenAt, lastChangeAt: r.lastChangeAt });
  }
  return { rows, byName: new Map(rows.map((r) => [r.name, r])), byPlayer: new Map(rows.map((r) => [r.playerId, r])) };
}

/** First day closed for this leaderboard (element 1 of the player_history arrays), as YYYY-MM-DD. */
export async function historyStartDay(db: Db, lb: LeaderboardDef): Promise<string | null> {
  const [row] = await db
    .select({ start: sql<string | null>`${leaderboards.historyStartDay}::text` })
    .from(leaderboards)
    .where(eq(leaderboards.id, lb.id));
  return row?.start ?? null;
}

/** `array[i] = value` on a 1-based array that may be shorter than i - 1 (padded with NULL) or longer (tail kept). */
function setArrayElement(column: string, type: string, value: string, index: number): SQL {
  const before = index - 1;
  return sql.raw(
    `${column} = (h.${column} || array_fill(NULL::${type}, ARRAY[greatest(0, ${before} - cardinality(h.${column}))]))[1:${before}] || v.${value} || h.${column}[${index + 1}:]`,
  );
}

/**
 * Closing values of `day` for every player of the state, written at index dayIndex(day, history_start_day)
 * of the player_history arrays. Players absent from the state keep a shorter array (NULL when read).
 */
async function writeDailyClose(tx: Db, lb: LeaderboardDef, day: string, state: readonly CurrentRow[]): Promise<number> {
  let start = await historyStartDay(tx, lb);
  if (start === null) {
    start = day;
    await tx.update(leaderboards).set({ historyStartDay: day }).where(eq(leaderboards.id, lb.id));
  }
  const index = dayIndex(day, start);
  if (index < 1) throw new Error(`clôture du ${day} avant le début d'historique ${start} de ${lb.key}`);
  const ranked = assignRanks(state.map((r) => ({ ...r })));
  for (const part of chunk(ranked, CHUNK)) {
    await tx
      .insert(playerHistory)
      .values(part.map((r) => ({ leaderboardId: lb.id, playerId: r.playerId, scores: [], ranks: [], leagueNumbers: [] })))
      .onConflictDoNothing();
    const values = sql.join(
      part.map((r) => sql`(${r.playerId}::bigint, ${r.score}::integer, ${r.rank}::smallint, ${r.leagueNumber}::smallint)`),
      sql`, `,
    );
    await tx.execute(sql`
      UPDATE player_history AS h
      SET ${setArrayElement("scores", "integer", "score", index)},
          ${setArrayElement("ranks", "smallint", "rank", index)},
          ${setArrayElement("league_numbers", "smallint", "league", index)}
      FROM (VALUES ${values}) AS v(player_id, score, rank, league)
      WHERE h.leaderboard_id = ${lb.id} AND h.player_id = v.player_id`);
  }
  return ranked.length;
}

async function upsertClubs(tx: Db, rows: readonly NormalizedRow[], at: Date): Promise<void> {
  const byUuid = new Map<string, NormalizedRow>();
  for (const r of rows) if (r.clubUuid && r.clubTag) byUuid.set(r.clubUuid, r);
  const values = [...byUuid.values()].map((r) => ({ clubUuid: r.clubUuid!, tag: r.clubTag!, officialName: r.officialClubName, firstSeenAt: at, lastSeenAt: at }));
  for (const part of chunk(values, CHUNK)) {
    await tx
      .insert(clubs)
      .values(part)
      .onConflictDoUpdate({
        target: clubs.clubUuid,
        set: { tag: sql`excluded.tag`, officialName: sql`coalesce(excluded.official_name, ${clubs.officialName})`, lastSeenAt: sql`greatest(${clubs.lastSeenAt}, excluded.last_seen_at)` },
      });
  }
}

export async function writeCutoffs(tx: Db, lb: LeaderboardDef, snapshotId: number, at: Date, rows: readonly NormalizedRow[]): Promise<void> {
  const c = cutoffs(rows, lb);
  await tx
    .insert(cutoffHistory)
    .values({ leaderboardId: lb.id, takenAt: at, snapshotId, rowCount: c.rowCount, rank1Score: c.rank1Score, rank500Score: c.rank500Score, lastScore: c.lastScore, leagueCounts: c.leagueCounts })
    .onConflictDoNothing();
}

/** Next state after a delta: removed names dropped, partial rows merged field by field into the previous raw row. */
function applyDeltaToState(prev: LoadedState, delta: DeltaSnapshot, lb: LeaderboardDef): { byName: Map<string, NormalizedRow>; touched: Set<string> } {
  const byName = new Map<string, NormalizedRow>();
  for (const row of prev.rows) byName.set(row.name, row);
  for (const name of delta.removed) byName.delete(name);
  const touched = new Set<string>();
  for (const partial of delta.changed) {
    const name = partial[delta.idField];
    if (typeof name !== "string" || name.trim().length === 0) continue;
    const existing = byName.get(name.trim());
    const raw = existing ? { ...existing.raw, ...partial } : partial;
    const normalized = normalizeRow(raw, lb);
    byName.set(normalized.name, normalized);
    touched.add(normalized.name);
  }
  return { byName, touched };
}

async function applyFile(db: Db, source: DataSource, lb: LeaderboardDef, file: string, last: LastApplied | null, runId: number, log: Logger): Promise<FileOutcome> {
  let snapshot: SnapshotFile | null = null;
  try {
    snapshot = await source.readSnapshot(lb.key, file);
    if (snapshot.key !== lb.key) throw new FileFormatError(`clé ${snapshot.key} dans un fichier de ${lb.key}`);
    if (snapshot.type === "delta") {
      const gap = expectedPredecessor(snapshot, last);
      if (gap) throw new ChainError(`chaîne rompue : ${gap}`);
    }
    const takenAt = new Date(snapshot.source.fetchedAt);
    if (Number.isNaN(takenAt.getTime())) throw new FileFormatError(`fetchedAt illisible : ${snapshot.source.fetchedAt}`);
    if (lb.history === "events") await ensureRsEventsPartition(db, takenAt);
    const startedAt = Date.now();
    const outcome = await db.transaction((tx) => applyInTransaction(tx, lb, file, snapshot as SnapshotFile, takenAt, last, runId));
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    log(
      `[${lb.key}] ${file} appliqué : ${outcome.rows} lignes, ${outcome.changes} changements, ${outcome.events} événements, ${outcome.identity?.created ?? 0} nouveaux joueurs (${seconds} s)`,
    );
    return outcome;
  } catch (error) {
    if (error instanceof FileFormatError || error instanceof RowError || error instanceof ChainError) {
      const reason = `${error.name}: ${error.message}`;
      await rejectFile(db, lb, file, snapshot, reason, runId);
      log(`[${lb.key}] ${file} rejeté : ${reason}`);
      return { key: lb.key, file, status: "rejected", reason };
    }
    throw error;
  }
}

async function applyInTransaction(tx: Db, lb: LeaderboardDef, file: string, snapshot: SnapshotFile, takenAt: Date, last: LastApplied | null, runId: number): Promise<FileOutcome> {
  const prev = await loadState(tx, lb);

  // The first file of a new UTC day closes the previous day with the state as it stood.
  if (last && utcDay(takenAt) > utcDay(last.takenAt) && prev.rows.length > 0) {
    await writeDailyClose(tx, lb, utcDay(last.takenAt), prev.rows);
  }

  let next: Map<string, NormalizedRow>;
  let touched: Set<string> | null = null;
  let duplicates = 0;
  let unidentified = 0;
  if (snapshot.type === "full") {
    const indexed = indexRows(snapshot.rows, lb);
    next = indexed.byName;
    duplicates = indexed.duplicates;
    unidentified = indexed.unidentified;
  } else {
    const applied = applyDeltaToState(prev, snapshot, lb);
    next = applied.byName;
    touched = applied.touched;
  }

  const newRows = [...next.values()].filter((r) => !prev.byName.has(r.name));
  const removed: RemovedPlayer[] = prev.rows
    .filter((r) => !next.has(r.name))
    .map((r) => ({ playerId: r.playerId, name: r.name, steamName: r.steamName, psnName: r.psnName, xboxName: r.xboxName }));
  const resolution = await resolveIdentities(tx, newRows, { key: lb.key, takenAt, removed, platformCounts: platformCounts(next.values()) });

  const keepEvents = lb.history === "events";
  const current: CurrentRow[] = [];
  const events: Array<typeof rsEvents.$inferInsert> = [];
  let changes = 0;
  let changedExisting = 0;
  for (const row of next.values()) {
    const playerId = prev.byName.get(row.name)?.playerId ?? resolution.byName.get(row.name);
    if (playerId === undefined) {
      unidentified++;
      continue;
    }
    const before = prev.byPlayer.get(playerId);
    const changed = !before || hasScoreChange(before, row);
    current.push({ ...row, playerId, firstSeenAt: before?.firstSeenAt ?? takenAt, lastChangeAt: changed ? takenAt : before.lastChangeAt });
    if (!changed) continue;
    changes++;
    if (before) changedExisting++;
    if (keepEvents) {
      events.push({
        leaderboardId: lb.id,
        playerId,
        takenAt,
        score: row.score,
        scoreDelta: before ? row.score - before.score : null,
        rank: row.rank,
        leagueNumber: row.leagueNumber,
        clubTag: row.clubTag,
        snapshotId: 0,
      });
    }
  }
  if (snapshot.type === "delta") {
    assignRanks(current);
    const byPlayer = new Map(current.map((r) => [r.playerId, r.rank]));
    for (const e of events) e.rank = byPlayer.get(e.playerId) ?? e.rank;
  }

  const nextPlayerIds = new Set(current.map((r) => r.playerId));
  const removedPlayerIds = prev.rows.map((r) => r.playerId).filter((id) => !nextPlayerIds.has(id));
  for (const part of chunk(removedPlayerIds, CHUNK)) {
    await tx.delete(leaderboardCurrent).where(and(eq(leaderboardCurrent.leaderboardId, lb.id), inArray(leaderboardCurrent.playerId, part)));
  }

  // Untouched rows of a delta keep their stored rank (the site orders by score); their recomputed rank
  // only feeds rs_events and the daily close. Rewriting them every ten minutes would cost more than it brings.
  const toUpsert = snapshot.type === "full" ? current : current.filter((r) => touched!.has(r.name) || !prev.byPlayer.has(r.playerId));
  for (const part of chunk(toUpsert, CHUNK)) {
    await tx
      .insert(leaderboardCurrent)
      .values(
        part.map((r) => ({
          leaderboardId: lb.id,
          playerId: r.playerId,
          name: r.name,
          rank: r.rank,
          score: r.score,
          leagueNumber: r.leagueNumber,
          clubTag: r.clubTag,
          clubUuid: r.clubUuid,
          officialClubName: r.officialClubName,
          extra: extraFields(r.raw, lb),
          firstSeenAt: r.firstSeenAt,
          lastChangeAt: r.lastChangeAt,
          updatedAt: takenAt,
        })),
      )
      .onConflictDoUpdate({
        target: [leaderboardCurrent.leaderboardId, leaderboardCurrent.playerId],
        set: {
          name: sql`excluded.name`,
          rank: sql`excluded.rank`,
          score: sql`excluded.score`,
          leagueNumber: sql`excluded.league_number`,
          clubTag: sql`excluded.club_tag`,
          clubUuid: sql`excluded.club_uuid`,
          officialClubName: sql`excluded.official_club_name`,
          extra: sql`excluded.extra`,
          lastChangeAt: sql`excluded.last_change_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  const [inserted] = await tx
    .insert(snapshots)
    .values({
      leaderboardId: lb.id,
      kind: snapshot.type,
      sourceFile: file,
      baseFile: snapshot.type === "delta" ? snapshot.base : null,
      seq: snapshot.type === "delta" ? snapshot.seq : null,
      sha256: snapshot.sha256,
      takenAt,
      rowCount: current.length,
      addedCount: newRows.length,
      changedCount: changedExisting,
      removedCount: removedPlayerIds.length,
      duplicates,
      unidentified,
      status: "applied",
      ingestionRunId: runId,
    })
    .returning({ id: snapshots.id });
  const snapshotId = inserted!.id;

  for (const part of chunk(events, CHUNK)) {
    await tx.insert(rsEvents).values(part.map((e) => ({ ...e, snapshotId }))).onConflictDoNothing();
  }
  await writeCutoffs(tx, lb, snapshotId, takenAt, current);
  await upsertClubs(tx, toUpsert, takenAt);
  for (const part of chunk(toUpsert.map((r) => r.playerId), CHUNK)) {
    await tx.update(players).set({ lastSeenAt: takenAt }).where(and(inArray(players.id, part), sql`${players.lastSeenAt} < ${timestamptz(takenAt)}`));
  }

  const { byName: _ignored, ...identity } = resolution;
  return { key: lb.key, file, status: "applied", takenAt: takenAt.toISOString(), rows: current.length, changes, events: events.length, identity };
}

/**
 * delta_24h / delta_7d of a live leaderboard:
 *   1. against the daily close of the previous day / of seven days before `asOf` (player_history), on every board;
 *   2. on 'events' boards, replaced by the rolling value against the last rs_event at or before the window start
 *      when one exists (same rule as the rating). Events older than `keepDays` are gone, so inactive players
 *      keep the close-based value.
 */
export async function refreshWindowDeltas(db: Db, lb: LeaderboardDef, asOf: Date): Promise<void> {
  await db.execute(sql`UPDATE leaderboard_current SET delta_24h = NULL, delta_7d = NULL WHERE leaderboard_id = ${lb.id}`);
  const start = await historyStartDay(db, lb);
  if (start !== null) {
    const day = utcDay(asOf);
    const fromClose = (closeDay: string): SQL => {
      const index = dayIndex(closeDay, start);
      return index >= 1 ? sql`c.score - h.scores[${sql.raw(String(index))}]` : sql`NULL`;
    };
    await db.execute(sql`
      UPDATE leaderboard_current AS c
      SET delta_24h = ${fromClose(previousUtcDay(day))}, delta_7d = ${fromClose(daysBefore(day, 7))}
      FROM player_history AS h
      WHERE c.leaderboard_id = ${lb.id} AND h.leaderboard_id = ${lb.id} AND h.player_id = c.player_id`);
  }
  if (lb.history !== "events") return;
  for (const [column, hours] of [["delta_24h", 24], ["delta_7d", 168]] as const) {
    await db.execute(sql`
      UPDATE leaderboard_current c
      SET ${sql.raw(column)} = c.score - p.score
      FROM (
        SELECT DISTINCT ON (player_id) player_id, score
        FROM rs_events
        WHERE leaderboard_id = ${lb.id} AND taken_at <= ${timestamptz(asOf)} - make_interval(hours => ${hours})
        ORDER BY player_id, taken_at DESC
      ) p
      WHERE c.leaderboard_id = ${lb.id} AND c.player_id = p.player_id`);
  }
}
