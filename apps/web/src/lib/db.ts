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
  connection ??= connect(url, { max: 1, connectTimeoutSeconds: 5 });
  return connection.db;
}

/**
 * Abandonne la connexion de l'instance. Avec une seule connexion, une requête restée sans réponse (connexion
 * coupée côté pooler, verrou) bloque toutes les suivantes de l'instance : on repart d'une connexion neuve.
 */
export function resetDb(): void {
  const old = connection;
  connection = null;
  if (old) void old.close().catch(() => undefined);
}

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Erreur levée quand la base ne répond pas à temps : la page affiche son état d'erreur au lieu de charger sans fin. */
export class DataTimeoutError extends Error {
  code = "DB_TIMEOUT";
  constructor(ms: number) {
    super(`la base n'a pas répondu en ${ms} ms`);
    this.name = "DataTimeoutError";
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      resetDb();
      reject(new DataTimeoutError(ms));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
