/**
 * Migrateur minimal : applique migrations/*.sql dans l'ordre, une fois chacun, dans une transaction.
 * Les fichiers sont découpés sur la ligne "--> statement-breakpoint" (une instruction par morceau),
 * ce qui fonctionne aussi bien avec postgres.js qu'avec PGlite.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { queryRows, type Db } from "./index.ts";

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export interface MigrationFile {
  name: string;
  statements: string[];
}

export async function readMigrations(dir = MIGRATIONS_DIR): Promise<MigrationFile[]> {
  const names = (await readdir(dir)).filter((n) => /^\d{4}_.*\.sql$/.test(n)).sort();
  const files: MigrationFile[] = [];
  for (const name of names) {
    const text = await readFile(join(dir, name), "utf8");
    const statements = text
      .split(/^--> statement-breakpoint\s*$/m)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    files.push({ name, statements });
  }
  return files;
}

/** Applies pending migrations; returns the names applied in this call. */
export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await queryRows<{ name: string }>(db, sql`SELECT name FROM schema_migrations`)).map((r) => r.name));
  const applied: string[] = [];
  for (const file of await readMigrations(dir)) {
    if (done.has(file.name)) continue;
    await db.transaction(async (tx) => {
      for (const statement of file.statements) await tx.execute(sql.raw(statement));
      await tx.execute(sql`INSERT INTO schema_migrations (name) VALUES (${file.name})`);
    });
    applied.push(file.name);
  }
  return applied;
}

/** Creates the daily partition of rs_events that holds `day`, if missing. */
export async function ensureRsEventsPartition(db: Db, day: Date): Promise<string> {
  const iso = day.toISOString().slice(0, 10);
  const rows = await queryRows<{ name: string }>(db, sql`SELECT ensure_rs_events_partition(${iso}::date) AS name`);
  return rows[0]?.name ?? "";
}

const PARTITION_NAME = /^rs_events_(\d{4})_(\d{2})_(\d{2})$/;

/** Daily partitions of rs_events, oldest first, with the UTC day each one holds. */
export async function listRsEventsPartitions(db: Db): Promise<Array<{ name: string; day: string }>> {
  const rows = await queryRows<{ name: string }>(db, sql`SELECT relname AS name FROM pg_class WHERE relname ~ '^rs_events_\\d{4}_\\d{2}_\\d{2}$' AND relkind = 'r' ORDER BY relname`);
  return rows.flatMap((r) => {
    const m = PARTITION_NAME.exec(r.name);
    return m ? [{ name: r.name, day: `${m[1]}-${m[2]}-${m[3]}` }] : [];
  });
}

/**
 * Drops the daily partitions older than `keepDays` days before `now` (a whole table drop frees the
 * space at once, unlike DELETE) and returns their names. Rows stranded in the default partition
 * before the cutoff are deleted too.
 */
export async function pruneRsEventsPartitions(db: Db, keepDays: number, now = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - keepDays * 86_400_000).toISOString().slice(0, 10);
  const dropped: string[] = [];
  for (const partition of await listRsEventsPartitions(db)) {
    if (partition.day >= cutoff) continue;
    await db.execute(sql.raw(`DROP TABLE IF EXISTS ${partition.name}`));
    dropped.push(partition.name);
  }
  await db.execute(sql`DELETE FROM rs_events_default WHERE taken_at < ${cutoff}::date`);
  return dropped;
}

/**
 * Deletes the rs_events rows of the given boards (boards switched to history = 'daily') and compacts each
 * partition that held some with VACUUM FULL: a DELETE alone leaves the space inside past partitions,
 * which never receive new rows, so the database would not shrink before the partitions are dropped.
 * Once the boards are clean it costs one index probe per partition (primary key starts with leaderboard_id).
 */
export async function purgeBoardEvents(db: Db, leaderboardIds: readonly number[]): Promise<{ deleted: number; compacted: string[] }> {
  const result = { deleted: 0, compacted: [] as string[] };
  if (leaderboardIds.length === 0) return result;
  const ids = sql.join(leaderboardIds.map((id) => sql`${id}`), sql`, `);
  const partitions = [...(await listRsEventsPartitions(db)).map((p) => p.name), "rs_events_default"];
  for (const name of partitions) {
    const [row] = await queryRows<{ n: number }>(
      db,
      sql`WITH gone AS (DELETE FROM ${sql.raw(name)} WHERE leaderboard_id IN (${ids}) RETURNING 1) SELECT count(*)::int AS n FROM gone`,
    );
    const n = Number(row?.n ?? 0);
    if (n === 0) continue;
    result.deleted += n;
    await db.execute(sql.raw(`VACUUM FULL ${name}`));
    result.compacted.push(name);
  }
  return result;
}
