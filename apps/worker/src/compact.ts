/**
 * Compactage des tables mises à jour à chaque passage (incident du 12 nov. 2026, base à 518 Mo pour 500 Mo gratuits).
 *
 * `players` (last_seen_at de 80 000 joueurs toutes les 10 min) et `leaderboard_current` (score, rang, deltas)
 * sont réécrites en permanence : autovacuum rend l'espace réutilisable mais ne rend rien au disque, et Supabase
 * facture la taille des fichiers. Mesuré sur la copie locale : leaderboard_current 72 → 17 Mo, players 102 → 89 Mo
 * après VACUUM FULL. Aucune ligne n'est supprimée.
 *
 * VACUUM FULL prend un verrou exclusif le temps de la réécriture (quelques secondes à une minute) : on ne le lance
 * que si la base dépasse le seuil et si la table a au moins `minBloatBytes` de plus que sa taille utile estimée.
 * Le fillfactor (place laissée libre dans chaque page) permet ensuite à Postgres de mettre à jour une ligne sans
 * en écrire une nouvelle ailleurs (mise à jour HOT), donc de regonfler beaucoup moins vite.
 */
import { queryRows, type Db } from "@finals-hq/db";
import { sql } from "drizzle-orm";

export const COMPACT_TABLES = [
  { name: "players", fillfactor: 90 },
  { name: "leaderboard_current", fillfactor: 85 },
] as const;

/** Au-delà de ce seuil on compacte (alerte du statut à 450 Mo, limite Supabase Free 500 Mo). */
export const DEFAULT_COMPACT_THRESHOLD_BYTES = 450_000_000;
const MIN_BLOAT_BYTES = 15_000_000;

export interface CompactResult {
  sizeBefore: number;
  sizeAfter: number;
  tables: Array<{ name: string; before: number; after: number; skipped?: string }>;
  skipped?: string;
}

const dbSize = async (db: Db) => Number((await queryRows<{ n: string | number }>(db, sql`SELECT pg_database_size(current_database()) AS n`))[0]?.n ?? 0);
const relSize = async (db: Db, table: string) => Number((await queryRows<{ n: string | number }>(db, sql`SELECT pg_total_relation_size(${table}::regclass) AS n`))[0]?.n ?? 0);

/**
 * Estimated bloat of a table: pages that hold no live tuple. Uses pg_stat_user_tables (dead tuples) and the
 * average live tuple width; good enough to decide whether a rewrite is worth an exclusive lock.
 */
async function bloatBytes(db: Db, table: string): Promise<number> {
  const [row] = await queryRows<{ heap: string | number; live: string | number; dead: string | number; width: string | number | null }>(
    db,
    sql`SELECT pg_relation_size(c.oid) AS heap, coalesce(s.n_live_tup, 0) AS live, coalesce(s.n_dead_tup, 0) AS dead,
               (SELECT sum(avg_width) FROM pg_stats WHERE schemaname = 'public' AND tablename = ${table}) AS width
          FROM pg_class c LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
         WHERE c.oid = ${table}::regclass`,
  );
  if (!row) return 0;
  const heap = Number(row.heap);
  const live = Number(row.live);
  // 24 bytes of tuple header + line pointer; without statistics assume 100 bytes per row.
  const width = (row.width === null ? 100 : Number(row.width)) + 28;
  return Math.max(0, heap - live * width);
}

export async function compactTables(
  db: Db,
  options: { thresholdBytes?: number; force?: boolean; minBloatBytes?: number; log?: (line: string) => void } = {},
): Promise<CompactResult> {
  const log = options.log ?? (() => {});
  const threshold = options.thresholdBytes ?? DEFAULT_COMPACT_THRESHOLD_BYTES;
  const sizeBefore = await dbSize(db);
  const result: CompactResult = { sizeBefore, sizeAfter: sizeBefore, tables: [] };
  if (!options.force && sizeBefore < threshold) {
    result.skipped = `base à ${Math.round(sizeBefore / 1e6)} Mo, sous le seuil de ${Math.round(threshold / 1e6)} Mo`;
    return result;
  }
  await db.execute(sql`ANALYZE players, leaderboard_current`);
  for (const { name, fillfactor } of COMPACT_TABLES) {
    const before = await relSize(db, name);
    const bloat = await bloatBytes(db, name);
    if (!options.force && bloat < (options.minBloatBytes ?? MIN_BLOAT_BYTES)) {
      result.tables.push({ name, before, after: before, skipped: `≈ ${Math.round(bloat / 1e6)} Mo récupérables` });
      continue;
    }
    await db.execute(sql.raw(`ALTER TABLE ${name} SET (fillfactor = ${fillfactor})`));
    await db.execute(sql.raw(`VACUUM (FULL, ANALYZE) ${name}`));
    const after = await relSize(db, name);
    result.tables.push({ name, before, after });
    log(`compactage ${name} : ${Math.round(before / 1e6)} → ${Math.round(after / 1e6)} Mo`);
  }
  result.sizeAfter = await dbSize(db);
  return result;
}
