/**
 * FINALS HQ worker.
 *
 *   node --experimental-strip-types src/cli.ts migrate                      # DIRECT_URL (ou DATABASE_URL)
 *   node --experimental-strip-types src/cli.ts ingest [--data-root ../../data] [--only s12-crossplay]
 *   node --experimental-strip-types src/cli.ts import-archives [--data-root ../../data] [--only s11-crossplay]
 *   node --experimental-strip-types src/cli.ts status [--json]
 *
 * Code de sortie 1 dès qu'un fichier est rejeté ou qu'un classement échoue : GitHub Actions prévient.
 */
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { connect } from "@finals-hq/db";
import { migrate } from "@finals-hq/db/migrate";
import { importArchives } from "./archives.ts";
import { ingestAll, syncCatalog } from "./ingest.ts";
import { DataSource } from "./source.ts";
import { status } from "./status.ts";

const log = (line: string) => console.log(`${new Date().toISOString()} ${line}`);

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "data-root": { type: "string" },
      only: { type: "string" },
      json: { type: "boolean", default: false },
    },
  });
  const command = positionals[0] ?? "status";
  const dataRoot = resolve(values["data-root"] ?? env("DATA_ROOT") ?? "data");

  if (command === "migrate") {
    const url = env("DIRECT_URL") ?? env("DATABASE_URL");
    if (!url) throw new Error("DIRECT_URL ou DATABASE_URL requise");
    const { db, close } = connect(url, { max: 1 });
    try {
      const applied = await migrate(db);
      await syncCatalog(db);
      log(applied.length ? `migrations appliquées : ${applied.join(", ")}` : "aucune migration à appliquer");
    } finally {
      await close();
    }
    return 0;
  }

  const url = env("DATABASE_URL");
  if (!url) throw new Error("DATABASE_URL requise");
  const { db, close } = connect(url);
  try {
    if (command === "ingest" || command === "import-archives") {
      const source = new DataSource(dataRoot);
      const summary =
        command === "ingest"
          ? await ingestAll(db, source, { only: values.only, log })
          : await importArchives(db, source, { only: values.only, log });
      log(`${command} : ${summary.applied} appliqué(s), ${summary.rejected} rejeté(s), ${summary.skipped} ignoré(s), fraîcheur ${summary.freshnessAt ?? "—"}`);
      for (const error of summary.errors) log(`ERREUR ${error}`);
      if (values.json) console.log(JSON.stringify(summary, null, 2));
      return summary.status === "ok" ? 0 : 1;
    }
    if (command === "status") {
      const report = await status(db);
      console.log(JSON.stringify(report, null, 2));
      return 0;
    }
    throw new Error(`commande inconnue : ${command}`);
  } finally {
    await close();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`${new Date().toISOString()} FATAL ${(error as Error).stack ?? error}`);
    process.exit(1);
  });
