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

/** Supabase Free: 500 MB of database, averaged over the month; the worker warns from 450 MB. */
export const DATABASE_LIMIT_BYTES = 500_000_000;
export const DATABASE_ALERT_BYTES = 450_000_000;

export interface StatusReport {
  generatedAt: string;
  live: LeaderboardStatus[];
  archives: { imported: number; expected: number };
  lastRuns: Array<{ id: number; command: string; status: string; startedAt: string; finishedAt: string | null; applied: number; rejected: number; error: string | null }>;
  database: {
    sizeBytes: number | null;
    limitBytes: number;
    /** True when the database is above DATABASE_ALERT_BYTES: time to prune or shrink. */
    alert: boolean;
    players: number;
    rsEventsEstimate: number;
    partitions: string[];
    /** Largest relations (table + indexes + toast), to watch the 500 MB Supabase Free limit. */
    tables: Array<{ name: string; totalBytes: number; tableBytes: number; indexBytes: number; rowsEstimate: number }>;
    indexes: Array<{ name: string; table: string; bytes: number }>;
  };
}

export async function status(db: Db): Promise<StatusReport> {
  const live: LeaderboardStatus[] = [];
  for (const lb of LEADERBOARDS.filter((l) => l.isLive)) {
    const [last] = await db
      .select({ file: snapshots.sourceFile, takenAt: snapshots.takenAt, kind: snapshots.kind })
      .from(snapshots)
      .where(and(eq(snapshots.leaderboardId, lb.id), eq(snapshots.status, "applied")))
      .orderBy(desc(snapshots.takenAt))
      .limit(1);
    const [rows] = await db.select({ n: sql<number>`count(*)::int` }).from(leaderboardCurrent).where(eq(leaderboardCurrent.leaderboardId, lb.id));
    const [rejected] = await db.select({ n: sql<number>`count(*)::int` }).from(snapshots).where(and(eq(snapshots.leaderboardId, lb.id), eq(snapshots.status, "rejected")));
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
  const [archives] = await db.select({ n: sql<number>`count(distinct leaderboard_id)::int` }).from(snapshots).where(and(eq(snapshots.kind, "archive"), eq(snapshots.status, "applied")));
  const runs = await db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.id)).limit(5);
  const [size] = await queryRows<{ bytes: string | number | null }>(db, sql`SELECT pg_database_size(current_database())::bigint AS bytes`);
  const [playersCount] = await queryRows<{ n: number }>(db, sql`SELECT count(*)::int AS n FROM players`);
  const [events] = await queryRows<{ n: string | number | null }>(db, sql`SELECT coalesce(sum(greatest(reltuples, 0)), 0)::bigint AS n FROM pg_class WHERE relname LIKE 'rs\_events\_%' AND relkind = 'r'`);
  const partitions = await queryRows<{ name: string }>(db, sql`SELECT relname AS name FROM pg_class WHERE relname LIKE 'rs\_events\_%' AND relkind = 'r' ORDER BY relname`);
  const tables = await queryRows<{ name: string; total: string | number; table: string | number; index: string | number; rows: string | number }>(
    db,
    sql`SELECT c.relname AS name,
               pg_total_relation_size(c.oid)::bigint AS total,
               pg_relation_size(c.oid)::bigint AS "table",
               pg_indexes_size(c.oid)::bigint AS index,
               greatest(c.reltuples, 0)::bigint AS rows
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 12`,
  );
  const indexes = await queryRows<{ name: string; table: string; bytes: string | number }>(
    db,
    sql`SELECT i.relname AS name, t.relname AS "table", pg_relation_size(i.oid)::bigint AS bytes
        FROM pg_class i
        JOIN pg_index x ON x.indexrelid = i.oid
        JOIN pg_class t ON t.oid = x.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
        ORDER BY pg_relation_size(i.oid) DESC
        LIMIT 10`,
  );
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
      limitBytes: DATABASE_LIMIT_BYTES,
      alert: size?.bytes !== null && size?.bytes !== undefined && Number(size.bytes) > DATABASE_ALERT_BYTES,
      players: playersCount?.n ?? 0,
      rsEventsEstimate: Number(events?.n ?? 0),
      partitions: partitions.map((p) => p.name),
      tables: tables.map((t) => ({ name: t.name, totalBytes: Number(t.total), tableBytes: Number(t.table), indexBytes: Number(t.index), rowsEstimate: Number(t.rows) })),
      indexes: indexes.map((i) => ({ name: i.name, table: i.table, bytes: Number(i.bytes) })),
    },
  };
}
