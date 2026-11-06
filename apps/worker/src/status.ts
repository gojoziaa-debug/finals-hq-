/** État de la chaîne de données, pour la page /status et le résumé des workflows. */
import { LEADERBOARDS, queryRows, schema, type Db } from "@finals-hq/db";
import { and, desc, eq, sql } from "drizzle-orm";

const { snapshots, leaderboardCurrent, ingestionRuns } = schema;

export interface LeaderboardStatus {
  key: string;
  name: string;
  lastFile: string | null;
  lastTakenAt: string | null;
  lastKind: string | null;
  rows: number;
  rejectedFiles: number;
}

export interface StatusReport {
  generatedAt: string;
  live: LeaderboardStatus[];
  archives: { imported: number; expected: number };
  lastRuns: Array<{ id: number; command: string; status: string; startedAt: string; finishedAt: string | null; applied: number; rejected: number; error: string | null }>;
  database: { sizeBytes: number | null; players: number; rsEventsEstimate: number; partitions: string[] };
}

export async function status(db: Db): Promise<StatusReport> {
  const live: LeaderboardStatus[] = [];
  for (const lb of LEADERBOARDS.filter((l) => l.isLive)) {
    const [last] = await db
      .select({ file: snapshots.sourceFile, takenAt: snapshots.takenAt, kind: snapshots.kind })
      .from(snapshots)
      .where(and(eq(snapshots.leaderboardKey, lb.key), eq(snapshots.status, "applied")))
      .orderBy(desc(snapshots.takenAt))
      .limit(1);
    const [rows] = await db.select({ n: sql<number>`count(*)::int` }).from(leaderboardCurrent).where(eq(leaderboardCurrent.leaderboardKey, lb.key));
    const [rejected] = await db.select({ n: sql<number>`count(*)::int` }).from(snapshots).where(and(eq(snapshots.leaderboardKey, lb.key), eq(snapshots.status, "rejected")));
    live.push({
      key: lb.key,
      name: lb.name,
      lastFile: last?.file ?? null,
      lastTakenAt: last?.takenAt.toISOString() ?? null,
      lastKind: last?.kind ?? null,
      rows: rows?.n ?? 0,
      rejectedFiles: rejected?.n ?? 0,
    });
  }
  const [archives] = await db.select({ n: sql<number>`count(distinct leaderboard_key)::int` }).from(snapshots).where(and(eq(snapshots.kind, "archive"), eq(snapshots.status, "applied")));
  const runs = await db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.id)).limit(5);
  const [size] = await queryRows<{ bytes: string | number | null }>(db, sql`SELECT pg_database_size(current_database())::bigint AS bytes`);
  const [playersCount] = await queryRows<{ n: number }>(db, sql`SELECT count(*)::int AS n FROM players`);
  const [events] = await queryRows<{ n: string | number | null }>(db, sql`SELECT coalesce(sum(greatest(reltuples, 0)), 0)::bigint AS n FROM pg_class WHERE relname LIKE 'rs_events_%' AND relkind = 'r'`);
  const partitions = await queryRows<{ name: string }>(db, sql`SELECT relname AS name FROM pg_class WHERE relname LIKE 'rs_events_%' AND relkind = 'r' ORDER BY relname`);
  return {
    generatedAt: new Date().toISOString(),
    live,
    archives: { imported: archives?.n ?? 0, expected: LEADERBOARDS.filter((l) => !l.isLive).length },
    lastRuns: runs.map((r) => ({
      id: r.id,
      command: r.command,
      status: r.status,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      applied: r.filesApplied,
      rejected: r.filesRejected,
      error: r.error,
    })),
    database: {
      sizeBytes: size?.bytes === null || size?.bytes === undefined ? null : Number(size.bytes),
      players: playersCount?.n ?? 0,
      rsEventsEstimate: Number(events?.n ?? 0),
      partitions: partitions.map((p) => p.name),
    },
  };
}
