import "server-only";
import { connect, type Connection, type Db } from "@finals-hq/db";

/**
 * Connexion partagée par instance de fonction. Sur Vercel : DATABASE_URL = pooler Supabase en mode
 * transaction (port 6543), une seule connexion par instance, aucune requête préparée (géré par connect()).
 * Le site ne fait que des SELECT, plus deux écritures minuscules (lib/writes.ts) : demande de masquage, compteur du jour.
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
  if (!connection) {
    connection = connect(url, { max: 1, connectTimeoutSeconds: 5 });
    serialize(connection.db);
  }
  return connection.db;
}

/**
 * Une requête à la fois sur la connexion. postgres.js enchaîne sinon plusieurs requêtes sur la même
 * connexion sans attendre les réponses (pipelining), et le pooler Supabase en mode transaction peut rester
 * coincé dessus : la base a répondu mais la réponse n'arrive jamais (incident du 6 nov. 2026).
 * Toutes les lectures du site passent par db.execute (queryRows).
 */
function serialize(db: Db): void {
  const execute = db.execute.bind(db) as (query: unknown) => Promise<unknown>;
  let chain: Promise<unknown> = Promise.resolve();
  (db as unknown as { execute: (query: unknown) => Promise<unknown> }).execute = (query) => {
    const run = chain.then(() => execute(query));
    chain = run.catch(() => undefined);
    return run;
  };
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
