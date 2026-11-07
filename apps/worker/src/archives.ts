/**
 * Import unique des classements figés (seasons/<clé>/full-*.json.gz, écrits par le script
 * import-archives du dépôt de données) vers season_results. Un fichier = une transaction.
 */
import { describeError } from "./errors.ts";
import { leaderboardByKey, schema, type Db, type LeaderboardDef } from "@finals-hq/db";
import { and, eq } from "drizzle-orm";
import { FileFormatError, type FullSnapshot } from "./files.ts";
import { resolveIdentities, platformCounts } from "./identity.ts";
import { RowError, extraFields, indexRows } from "./normalize.ts";
import { finishRun, startRun, summarize, syncCatalog, writeCutoffs, type FileOutcome, type Logger, type RunSummary } from "./ingest.ts";
import type { DataSource } from "./source.ts";
import { chunk } from "./state.ts";

const { snapshots, seasonResults, clubs, leaderboardCurrent } = schema;
const CHUNK = 2000; // see ingest.ts

export interface ArchiveOptions {
  only?: string | undefined;
  log?: Logger | undefined;
  now?: Date | undefined;
}

export async function importArchives(db: Db, source: DataSource, options: ArchiveOptions = {}): Promise<RunSummary> {
  const log = options.log ?? (() => {});
  const runId = await startRun(db, "import-archives", options.now ?? new Date());
  await syncCatalog(db);
  const outcomes: FileOutcome[] = [];
  const errors: string[] = [];
  const files = (await source.listSeasonFiles()).filter((f) => !options.only || f.key === options.only);
  for (const { key, file } of files) {
    const lb = leaderboardByKey(key);
    if (!lb) {
      errors.push(`${key} : classement absent du catalogue`);
      continue;
    }
    // Only an archive snapshot counts: a season that just ended still has its live chain (full/delta)
    // in snapshots, and its frozen file must be imported anyway (season-change rehearsal, 7 Nov 2026).
    const [known] = await db
      .select({ id: snapshots.id })
      .from(snapshots)
      .where(and(eq(snapshots.leaderboardId, lb.id), eq(snapshots.kind, "archive")))
      .limit(1);
    if (known) {
      outcomes.push({ key, file, status: "skipped" });
      continue;
    }
    try {
      outcomes.push(await importOne(db, source, lb, file, runId, log));
    } catch (error) {
      errors.push(`${key}/${file} : ${describeError(error)}`);
      log(`[${key}] ERREUR ${describeError(error)}`);
    }
  }
  const summary = summarize(runId, outcomes, errors);
  await finishRun(db, runId, summary, new Date());
  return summary;
}

async function importOne(db: Db, source: DataSource, lb: LeaderboardDef, file: string, runId: number, log: Logger): Promise<FileOutcome> {
  let snapshot: FullSnapshot | null = null;
  try {
    const parsed = await source.readSeasonSnapshot(lb.key, file);
    if (parsed.type !== "full") throw new FileFormatError("une archive doit être un snapshot complet");
    if (lb.isLive) throw new FileFormatError(`${lb.key} est un classement en direct, pas une archive`);
    snapshot = parsed;
    const takenAt = new Date(parsed.source.fetchedAt);
    const outcome = await db.transaction(async (tx) => {
      const indexed = indexRows(parsed.rows, lb);
      const rows = [...indexed.byName.values()];
      const resolution = await resolveIdentities(tx, rows, { key: lb.key, takenAt, removed: [], platformCounts: platformCounts(rows) });
      const [inserted] = await tx
        .insert(snapshots)
        .values({
          leaderboardId: lb.id,
          kind: "archive",
          sourceFile: file,
          sha256: parsed.sha256,
          takenAt,
          rowCount: rows.length,
          addedCount: rows.length,
          duplicates: indexed.duplicates,
          unidentified: indexed.unidentified,
          status: "applied",
          ingestionRunId: runId,
        })
        .returning({ id: snapshots.id });
      const snapshotId = inserted!.id;
      const values: Array<typeof seasonResults.$inferInsert> = [];
      for (const row of rows) {
        const playerId = resolution.byName.get(row.name);
        if (playerId === undefined) continue;
        values.push({
          leaderboardId: lb.id,
          playerId,
          finalRank: row.rank,
          finalScore: row.score,
          finalLeagueNumber: row.leagueNumber,
          finalLeague: row.league,
          clubTag: row.clubTag,
          clubUuid: row.clubUuid,
          officialClubName: row.officialClubName,
          extra: extraFields(row.raw, lb),
          snapshotId,
        });
      }
      for (const part of chunk(values, CHUNK)) await tx.insert(seasonResults).values(part).onConflictDoNothing();
      const clubValues = new Map<string, (typeof clubs.$inferInsert)>();
      for (const r of rows) if (r.clubUuid && r.clubTag) clubValues.set(r.clubUuid, { clubUuid: r.clubUuid, tag: r.clubTag, officialName: r.officialClubName, firstSeenAt: takenAt, lastSeenAt: takenAt });
      for (const part of chunk([...clubValues.values()], CHUNK)) await tx.insert(clubs).values(part).onConflictDoNothing();
      await writeCutoffs(tx, lb, snapshotId, takenAt, rows);
      // A board that was live until the season change: its current rows are now dead weight (the site
      // reads season_results for archived boards) and would show up as "current" on profiles.
      const freed = await tx.delete(leaderboardCurrent).where(eq(leaderboardCurrent.leaderboardId, lb.id)).returning({ playerId: leaderboardCurrent.playerId });
      if (freed.length > 0) log(`[${lb.key}] ${freed.length} lignes de leaderboard_current supprimées (saison terminée)`);
      const { byName: _ignored, ...identity } = resolution;
      return { key: lb.key, file, status: "applied" as const, takenAt: takenAt.toISOString(), rows: values.length, events: 0, identity };
    });
    log(`[${lb.key}] ${file} importé : ${outcome.rows} résultats, ${outcome.identity?.created ?? 0} nouveaux joueurs`);
    return outcome;
  } catch (error) {
    if (error instanceof FileFormatError || error instanceof RowError) {
      const reason = `${error.name}: ${error.message}`;
      await db
        .insert(snapshots)
        .values({
          leaderboardId: lb.id,
          kind: "archive",
          sourceFile: file,
          sha256: snapshot?.sha256 ?? "",
          takenAt: snapshot ? new Date(snapshot.source.fetchedAt) : new Date(),
          rowCount: snapshot?.count ?? 0,
          status: "rejected",
          reason: reason.slice(0, 2000),
          ingestionRunId: runId,
        })
        .onConflictDoNothing();
      log(`[${lb.key}] ${file} rejeté : ${reason}`);
      return { key: lb.key, file, status: "rejected", reason };
    }
    throw error;
  }
}
