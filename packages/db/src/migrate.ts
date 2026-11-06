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

/** Creates the monthly partition of rs_events that holds `day`, if missing. */
export async function ensureRsEventsPartition(db: Db, day: Date): Promise<string> {
  const iso = day.toISOString().slice(0, 10);
  const rows = await queryRows<{ name: string }>(db, sql`SELECT ensure_rs_events_partition(${iso}::date) AS name`);
  return rows[0]?.name ?? "";
}
