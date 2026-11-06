import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { SUPABASE_ROOT_2021_CA } from "./certs.ts";
import * as schema from "./schema.ts";

export { schema };
export * from "./catalog.ts";

/**
 * Type de base commun aux deux pilotes (postgres.js en production, PGlite en test) et aux transactions.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * A Date inside a raw `sql` fragment. Drizzle's postgres-js driver makes the timestamp serializers
 * transparent, so a bare Date reaches the wire as an object and postgres.js throws
 * ERR_INVALID_ARG_TYPE (tests on PGlite do not catch it). Columns map their own values; raw
 * fragments must go through this helper.
 */
export function timestamptz(date: Date): SQL {
  return sql`${date.toISOString()}::timestamptz`;
}

/**
 * Lignes d'une requête SQL brute, quel que soit le pilote : postgres.js renvoie un tableau,
 * PGlite un objet `{ rows }`.
 */
export async function queryRows<T>(db: Db, query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as unknown;
  if (Array.isArray(result)) return result as T[];
  return (result as { rows: T[] }).rows;
}

export interface Connection {
  db: Db;
  close: () => Promise<void>;
}

/**
 * Autorité de certification du pooler Supabase, certificat public (chaîne vérifiée le 6 novembre 2026
 * depuis le PC de l'utilisateur : *.pooler.supabase.com ← Supabase Intermediate 2021 CA ← Supabase
 * Root 2021 CA, empreinte SHA-256 80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA).
 * Si Supabase change de racine, ajouter le nouveau certificat dans certs/ et dans certs.ts : la vérification ne se désactive jamais.
 */
export function supabaseCertificates(): string[] {
  return [SUPABASE_ROOT_2021_CA];
}

/**
 * Lit DATABASE_URL sans jamais recopier sa valeur dans l'erreur (elle contient le mot de passe et finirait
 * dans les journaux de build). Attendu : postgresql://utilisateur:motdepasse@hôte:port/base.
 */
export function parseDatabaseUrl(url: string): URL {
  let parsed: URL | null = null;
  try {
    parsed = new URL(url.trim());
  } catch {
    parsed = null;
  }
  if (!parsed || (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") || !parsed.hostname) {
    const hint = /^["']/.test(url.trim()) ? " (retire les guillemets)" : /^[A-Z_]+=/.test(url.trim()) ? " (retire le « NOM= » devant)" : "";
    throw new Error(`DATABASE_URL invalide${hint} : attendu postgresql://utilisateur:motdepasse@hôte:port/base`);
  }
  return parsed;
}

type SslOption = false | { rejectUnauthorized: true; servername: string; ca?: string[] };

/** TLS strict partout, sauf en local. postgres.js désactive la vérification avec `ssl: "require"`, d'où cet objet explicite. */
export function sslOptionsFor(url: string): SslOption {
  const host = parseDatabaseUrl(url).hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
  if (host.endsWith(".supabase.com") || host.endsWith(".supabase.co")) {
    return { rejectUnauthorized: true, servername: host, ca: supabaseCertificates() };
  }
  return { rejectUnauthorized: true, servername: host };
}

/**
 * Connexion de production. Fonctionne avec le pooler Supabase en mode transaction (port 6543)
 * comme en mode session (port 5432) : aucune requête préparée, pool réduit.
 */
export function connect(url: string, options: { max?: number; connectTimeoutSeconds?: number } = {}): Connection {
  if (!url) throw new Error("DATABASE_URL manquante");
  parseDatabaseUrl(url);
  const client = postgres(url.trim(), {
    prepare: false,
    max: options.max ?? 4,
    ssl: sslOptionsFor(url.trim()),
    connect_timeout: options.connectTimeoutSeconds ?? 20,
    idle_timeout: 30,
  });
  const db = drizzle(client, { schema }) as unknown as Db;
  return { db, close: () => client.end({ timeout: 5 }) };
}
