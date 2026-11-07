/**
 * FINALS HQ worker.
 *
 *   node --experimental-strip-types src/cli.ts migrate                      # DIRECT_URL (ou DATABASE_URL)
 *   node --experimental-strip-types src/cli.ts ingest [--data-root ../../data] [--only s12-crossplay] [--keep-days 8]
 *   node --experimental-strip-types src/cli.ts import-archives [--data-root ../../data] [--only s11-crossplay]
 *   node --experimental-strip-types src/cli.ts status [--json]
 *   node --experimental-strip-types src/cli.ts rating [--force] [--min-interval 55] [--report rapport.md]
 *   node --experimental-strip-types src/cli.ts privacy list|check|purge [--all] [--show-contact]
 *   node --experimental-strip-types src/cli.ts privacy apply|reject|lift <joueur> [--reason "…"]
 *
 * Code de sortie 1 dès qu'un fichier est rejeté ou qu'un classement échoue : GitHub Actions prévient.
 */
import { describeError } from "./errors.ts";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { connect } from "@finals-hq/db";
import { migrate } from "@finals-hq/db/migrate";
import { importArchives } from "./archives.ts";
import { DEFAULT_KEEP_DAYS, ingestAll, syncCatalog } from "./ingest.ts";
import { DataSource } from "./source.ts";
import { status } from "./status.ts";
import { runRating } from "./rating.ts";
import { calibrationReport } from "./rating-report.ts";
import { appendFile, writeFile } from "node:fs/promises";
import { applyHide, findPlayer, liftHide, listRequests, overdueRequests, PENDING_ALERT_HOURS, purgeContacts, purgeUsage, rejectRequest, usageSummary } from "./privacy.ts";

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
      "keep-days": { type: "string" },
      json: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      "min-interval": { type: "string" },
      report: { type: "string" },
      reason: { type: "string" },
      all: { type: "boolean", default: false },
      "show-contact": { type: "boolean", default: false },
    },
  });
  const command = positionals[0] ?? "status";
  const dataRoot = resolve(values["data-root"] ?? env("DATA_ROOT") ?? "data");
  const keepDays = Number(values["keep-days"] ?? env("RS_EVENTS_KEEP_DAYS") ?? DEFAULT_KEEP_DAYS);
  if (!Number.isInteger(keepDays) || keepDays < 1) throw new Error("--keep-days doit être un entier ≥ 1");

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
          ? await ingestAll(db, source, { only: values.only, log, keepDays })
          : await importArchives(db, source, { only: values.only, log });
      log(`${command} : ${summary.applied} appliqué(s), ${summary.rejected} rejeté(s), ${summary.skipped} ignoré(s), fraîcheur ${summary.freshnessAt ?? "—"}`);
      if (summary.prunedPartitions.length > 0) log(`partitions purgées : ${summary.prunedPartitions.join(", ")}`);
      for (const error of summary.errors) log(`ERREUR ${error}`);
      if (values.json) console.log(JSON.stringify(summary, null, 2));
      return summary.status === "ok" ? 0 : 1;
    }
    if (command === "status") {
      const report = await status(db);
      console.log(JSON.stringify({ ...report, usage: await usageSummary(db).catch(() => []), pendingHideRequests: (await listRequests(db).catch(() => [])).length }, null, 2));
      if (report.database.alert) log(`ALERTE taille de base ${Math.round((report.database.sizeBytes ?? 0) / 1e6)} Mo (limite ${report.database.limitBytes / 1e6} Mo)`);
      return 0;
    }
    if (command === "rating") {
      const minIntervalMin = Number(values["min-interval"] ?? env("RATING_MIN_INTERVAL_MIN") ?? 55);
      const runs = await runRating(db, { force: values.force, minIntervalMin, log });
      const reports: string[] = [];
      for (const run of runs) {
        if (run.skipped) log(`rating ${run.key} : ignoré (${run.skipped})`);
        else reports.push(calibrationReport(run));
      }
      if (reports.length > 0) {
        const markdown = reports.join("\n\n");
        console.log(markdown);
        if (values.report) await writeFile(values.report, markdown);
        const summary = env("GITHUB_STEP_SUMMARY");
        if (summary) await appendFile(summary, `${markdown}\n`);
      }
      return 0;
    }
    if (command === "privacy") return await privacy(db, positionals.slice(1), values);
    throw new Error(`commande inconnue : ${command}`);
  } finally {
    await close();
  }
}

/** Demandes de masquage (voir privacy.ts) : jamais de coordonnées en clair dans les journaux publics d'Actions. */
async function privacy(db: Parameters<typeof listRequests>[0], args: string[], values: { reason?: string | undefined; all?: boolean | undefined; "show-contact"?: boolean | undefined }): Promise<number> {
  const [action = "list", ref] = args;
  const showContact = Boolean(values["show-contact"]) && !env("GITHUB_ACTIONS");
  if (action === "list") {
    const rows = await listRequests(db, { all: Boolean(values.all), showContact });
    if (rows.length === 0) log(values.all ? "aucune demande de masquage" : "aucune demande en attente");
    for (const r of rows) log(`${r.status.padEnd(8)} ${r.name} (id ${r.playerId}) demandé ${r.requestedAt}${r.decidedAt ? `, décidé ${r.decidedAt}` : ""} · contact ${r.contact ?? "—"} · message ${r.message ?? "—"}${r.reason ? ` · raison : ${r.reason}` : ""}`);
    return 0;
  }
  if (action === "check") {
    const late = await overdueRequests(db);
    for (const r of late) log(`EN RETARD ${r.name} (id ${r.playerId}) en attente depuis ${r.requestedAt}`);
    const purged = await purgeContacts(db);
    await purgeUsage(db);
    if (purged > 0) log(`coordonnées effacées pour ${purged} demande(s) décidée(s) il y a plus de 30 jours`);
    if (late.length > 0) {
      log(`${late.length} demande(s) de masquage en attente depuis plus de ${PENDING_ALERT_HOURS} h : à traiter (promesse : 48 h)`);
      return 1;
    }
    log(`aucune demande en retard (${(await listRequests(db)).length} en attente)`);
    return 0;
  }
  if (action === "purge") {
    log(`coordonnées effacées : ${await purgeContacts(db)}`);
    return 0;
  }
  if (!ref) throw new Error(`privacy ${action} : joueur attendu (pseudo GOJO#6255, slug GOJO-6255 ou identifiant)`);
  const player = await findPlayer(db, ref);
  if (!player) throw new Error(`joueur introuvable : ${ref}`);
  if (action === "apply") {
    await applyHide(db, player.id, values.reason ?? null);
    log(`profil masqué : ${player.name} (id ${player.id}). Visible nulle part sur le site d'ici 2 à 10 minutes (caches).`);
    return 0;
  }
  if (action === "reject") {
    if (!values.reason) throw new Error("privacy reject : --reason obligatoire (elle sert de trace en cas de contestation)");
    const ok = await rejectRequest(db, player.id, values.reason);
    log(ok ? `demande refusée : ${player.name}` : `aucune demande en attente pour ${player.name}`);
    return ok ? 0 : 1;
  }
  if (action === "lift") {
    await liftHide(db, player.id);
    log(`masquage levé : ${player.name} (id ${player.id})`);
    return 0;
  }
  throw new Error(`privacy : action inconnue ${action} (list, check, purge, apply, reject, lift)`);
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`${new Date().toISOString()} FATAL ${describeError(error)}`);
    if ((error as Error).stack) console.error((error as Error).stack);
    process.exit(1);
  });
