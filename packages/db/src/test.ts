/**
 * Base Postgres en mémoire (PGlite) pour les tests : même SQL, mêmes migrations qu'en production.
 */
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import type { Db } from "./index.ts";
import { migrate } from "./migrate.ts";
import * as schema from "./schema.ts";

export interface TestDb {
  db: Db;
  client: PGlite;
  close: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite({ extensions: { pg_trgm } });
  const db = drizzle(client, { schema }) as unknown as Db;
  await migrate(db);
  return { db, client, close: () => client.close() };
}
