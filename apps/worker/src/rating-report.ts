/**
 * Rapport de calibration du Rating (sprint 5) : références réelles mesurées par le calcul comparées à celles
 * de la simulation de la phase D, répartition des notes par ligue, dix premiers, ligne d'un joueur suivi.
 * Markdown, écrit dans le résumé du job GitHub Actions et dans le journal (lisible depuis le fil du projet).
 */
import { CALIBRATION_DAYS, quantile, type PlayerRating, type WindowKey } from "@finals-hq/core/rating";
import { leagueName } from "@finals-hq/db/catalog";
import type { RatingRunSummary } from "./rating.ts";

/** Références de la simulation (finals-hq/04-simulation-rating.md, population synthétique du 5 nov. 2026). */
export const SIMULATION_REFERENCES = {
  momentum: { h24: { median: 200, mad: 383, n: 1208 }, d7: { median: 761, mad: 910, n: 1968 }, d30: { median: 3391, mad: 2531, n: 1999 } },
  drawdownMedian: 293,
  drawdownEligible: 1750,
  anomalyThreshold: 320,
  population: 2000,
} as const;

/** Joueurs dont la ligne figure toujours dans le rapport. */
export const WATCHED_PLAYERS = ["GOJO#6255"];

const f = (x: number | null | undefined, digits = 0) => (x === null || x === undefined ? "n/d" : x.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits }));
const WINDOW_LABEL: Record<WindowKey, string> = { h24: "24 h", d7: "7 j", d30: "30 j" };

export function calibrationReport(run: RatingRunSummary, watched: readonly string[] = WATCHED_PLAYERS): string {
  if (!run.references || !run.ratings || !run.current) return `## Rating ${run.key}\n\nCalcul ignoré : ${run.skipped ?? "—"}\n`;
  const refs = run.references;
  const ratings = run.ratings;
  const info = (p: PlayerRating) => run.current!.get(p.playerId)!;
  const lines: string[] = [];
  const days = run.observedDays ?? 0;
  lines.push(`## Rating FINALS HQ · ${run.key} · calcul n° ${run.runId}`);
  lines.push("");
  lines.push(`Données jusqu'au ${new Date(run.until!).toISOString()} · ${f(days, 2)} jour(s) observé(s) sur ${CALIBRATION_DAYS} requis · ${f(refs.players)} joueurs · ${f(run.durationMs)} ms.`);
  lines.push(days >= CALIBRATION_DAYS ? "Semaine de calibration complète : références comparables à la simulation." : `Calibration en cours : il manque ${f(CALIBRATION_DAYS - days, 1)} jour(s) ; les fenêtres 7 j et 30 j restent vides avant d'être couvertes.`);
  lines.push("");
  lines.push("### Références de population, réel vs simulation");
  lines.push("");
  lines.push("| Référence | Réel | Simulation | Écart |");
  lines.push("| --- | --- | --- | --- |");
  for (const w of ["h24", "d7", "d30"] as WindowKey[]) {
    const real = refs.momentum[w];
    const sim = SIMULATION_REFERENCES.momentum[w];
    lines.push(`| Momentum ${WINDOW_LABEL[w]} : médiane / MAD (n actifs) | ${real ? `${f(real.median)} / ${f(real.mad)} (${f(real.n)})` : "n/d"} | ${f(sim.median)} / ${f(sim.mad)} (${f(sim.n)}) | ${real ? `${real.median >= sim.median ? "+" : ""}${f(real.median - sim.median)} RS` : "—"} |`);
  }
  lines.push(`| Recul moyen médian, éligibles (≥ 10 jours actifs) | ${refs.drawdown ? `${f(refs.drawdown.median)} RS (${f(refs.drawdown.n)})` : "n/d"} | ${f(SIMULATION_REFERENCES.drawdownMedian)} RS (${f(SIMULATION_REFERENCES.drawdownEligible)}) | ${refs.drawdown ? `${f(refs.drawdown.median - SIMULATION_REFERENCES.drawdownMedian)} RS` : "—"} |`);
  lines.push(`| Seuil d'anomalie (99,9e centile, ${f(refs.anomalySamples)} variations sur ${f(run.closeSnapshots)} relevés espacés de 20 min au plus) | ${refs.anomalyThreshold === null ? "n/d" : `${f(refs.anomalyThreshold)} RS`} | ${f(SIMULATION_REFERENCES.anomalyThreshold)} RS | ${refs.anomalyThreshold === null ? "—" : `${f(refs.anomalyThreshold - SIMULATION_REFERENCES.anomalyThreshold)} RS`} |`);
  lines.push("");

  const rated = ratings.filter((p) => p.raw !== null);
  const provisional = ratings.filter((p) => p.provisional).length;
  const flagged = ratings.filter((p) => p.anomalies > 0);
  lines.push("### Couverture des composantes");
  lines.push("");
  lines.push(`- Momentum disponible : ${f(ratings.filter((p) => p.momentum !== null).length)} joueurs ; Consistance : ${f(ratings.filter((p) => p.consistency !== null).length)} ; note provisoire : ${f(provisional)} sur ${f(ratings.length)}.`);
  lines.push(`- Séries chaudes : ${f(ratings.filter((p) => p.hotStreak).length)} ; joueurs avec au moins une variation inhabituelle sur 7 j : ${f(flagged.length)}.`);
  lines.push("");

  lines.push("### Notes par ligue (cohérence : les bandes doivent monter avec la ligue)");
  lines.push("");
  lines.push("| Ligue | Joueurs | Note médiane | Min | Max | Niveau médian |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  const byLeague = new Map<number, PlayerRating[]>();
  for (const p of rated) {
    const l = info(p).league ?? 0;
    byLeague.set(l, [...(byLeague.get(l) ?? []), p]);
  }
  for (const [league, list] of [...byLeague.entries()].sort(([a], [b]) => b - a)) {
    const raws = list.map((p) => p.rating!);
    lines.push(`| ${league ? leagueName(league) : "?"} | ${f(list.length)} | ${f(quantile(raws, 0.5))} | ${f(Math.min(...raws))} | ${f(Math.max(...raws))} | ${f(quantile(list.map((p) => p.level), 0.5), 1)} |`);
  }
  lines.push("");

  const row = (p: PlayerRating) => {
    const c = info(p);
    return `| ${c.name} | ${f(c.rank)} | ${f(c.rs)} | **${f(p.rating)}**${p.provisional ? " (prov.)" : ""} | ${f(p.level, 1)} | ${f(p.peak, 1)} | ${f(p.momentum, 1)} | ${f(p.consistency, 1)} | ${f(p.legacy, 1)} | ${[p.hotStreak ? "série chaude" : "", p.anomalies ? `${p.anomalies} variation(s) inhabituelle(s)` : ""].filter(Boolean).join(", ") || "—"} |`;
  };
  const header = ["| Joueur | Rang | RS | Rating | Niveau | Pic | Momentum | Consistance | Legacy | Signaux |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"];
  lines.push("### Dix premiers du Rating");
  lines.push("");
  lines.push(...header);
  for (const p of [...rated].sort((a, b) => b.raw! - a.raw! || info(a).rank - info(b).rank).slice(0, 10)) lines.push(row(p));
  lines.push("");
  const watchedRows = ratings.filter((p) => watched.includes(info(p).name));
  if (watchedRows.length > 0) {
    lines.push("### Joueurs suivis");
    lines.push("");
    lines.push(...header);
    for (const p of watchedRows) lines.push(row(p));
    lines.push("");
  }
  if (flagged.length > 0) {
    lines.push("### Variations inhabituelles (à expliquer avant la publication)");
    lines.push("");
    lines.push("| Joueur | Rang | RS | Variations | Δ 24 h |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const p of [...flagged].sort((a, b) => b.anomalies - a.anomalies).slice(0, 15)) {
      const c = info(p);
      lines.push(`| ${c.name} | ${f(c.rank)} | ${f(c.rs)} | ${p.anomalies} | ${f(p.deltas.h24)} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
