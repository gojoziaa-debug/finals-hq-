import "server-only";
import { connect, type Connection, type Db } from "@finals-hq/db";

/**
 * Connexion partagée par instance de fonction. Sur Vercel : DATABASE_URL = pooler Supabase en mode
 * transaction (port 6543), une seule connexion par instance, aucune requête préparée (géré par connect()).
 * Le site ne fait que des SELECT.
 */
let connection: Connection | null = null;

export class DataUnavailableError extends Error {
  constructor() {
    super("DATABASE_URL absente : le site ne peut pas lire la base");
    this.name = "DataUnavailableError";
  }
}

export function getDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new DataUnavailableError();
  connection ??= connect(url, { max: 1 });
  return connection.db;
}

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
