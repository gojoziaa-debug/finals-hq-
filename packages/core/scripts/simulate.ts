/**
 * Simulation of the FINALS HQ Rating v1.
 *
 *   node --experimental-strip-types scripts/simulate.ts <full-snapshot.json.gz> [out-dir]
 *
 * Part 1 uses the REAL S12 snapshot (10 000 players) for the Level: distribution per league.
 * Part 2 uses SYNTHETIC 30-day trajectories (clearly marked) for the time-based components,
 * because the real history only started on 2026-11-05. The synthetic population is seeded from
 * the real RS distribution so that ranks are meaningful.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { anomalyThreshold, isAnomalous } from "../src/rating/anomaly.ts";
import { consistency, meanDrawdown } from "../src/rating/consistency.ts";
import { legacy } from "../src/rating/legacy.ts";
import { absoluteScale, level, relativeScale } from "../src/rating/level.ts";
import { MOMENTUM_WINDOWS, momentum, referenceFromDeltas, windowDelta } from "../src/rating/momentum.ts";
import { combineRating } from "../src/rating/rating.ts";
import { median, quantile } from "../src/rating/stats.ts";
import type { RsPoint, SeasonOutcome, WindowKey, WindowReference } from "../src/rating/types.ts";

interface Row {
  rank: number;
  name: string;
  league: string;
  leagueNumber: number;
  rankScore: number;
}

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 5, 22, 5, 21);
const SIM_DAYS = 30;

// ---------- deterministic pseudo-random (LCG), so the simulation is reproducible ----------
let seed = 20261105;
function rand(): number {
  seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
  return seed / 4_294_967_296;
}
function randInt(lo: number, hi: number): number {
  return lo + Math.floor(rand() * (hi - lo + 1));
}

// ---------- part 1: real snapshot ----------
const snapshotPath = process.argv[2];
if (!snapshotPath) throw new Error("usage: simulate.ts <full-snapshot.json.gz> [out-dir]");
const outDir = process.argv[3] ?? join(import.meta.dirname, "out");
mkdirSync(outDir, { recursive: true });

const snapshot = JSON.parse(gunzipSync(readFileSync(snapshotPath)).toString("utf8")) as { source: { fetchedAt: string }; rows: Row[] };
const rows = snapshot.rows;
const topRs = Math.max(...rows.map((r) => r.rankScore));
const realRs = rows.map((r) => r.rankScore).sort((a, b) => b - a);

/** Rank a score would have among the real top 10 000 (1 + number of better scores). */
function rankOf(rs: number): number {
  let lo = 0;
  let hi = realRs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (realRs[mid]! > rs) lo = mid + 1;
    else hi = mid;
  }
  return lo + 1;
}

const byLeague = new Map<string, number[]>();
for (const r of rows) {
  const n = level(r.rankScore, r.rank, topRs);
  const list = byLeague.get(r.league) ?? [];
  list.push(n);
  byLeague.set(r.league, list);
}
const leagueOrder = [...byLeague.entries()].sort((a, b) => median(b[1]) - median(a[1]));

const lines: string[] = [];
const out = (line = "") => lines.push(line);

out(`# Simulation du FINALS HQ Rating v1`);
out();
out(`Snapshot réel : ${rows.length} joueurs, s12-crossplay, ${snapshot.source.fetchedAt}. RS du n° 1 : ${topRs}.`);
out();
out(`## Niveau par ligue (données réelles)`);
out();
out(`| Ligue | Joueurs | Niveau médian | Min | Max |`);
out(`| --- | --- | --- | --- | --- |`);
const leagueJson: { league: string; players: number; median: number; min: number; max: number }[] = [];
for (const [league, values] of leagueOrder) {
  const m = median(values);
  const min = Math.min(...values);
  const max = Math.max(...values);
  leagueJson.push({ league, players: values.length, median: round1(m), min: round1(min), max: round1(max) });
  out(`| ${league} | ${values.length} | ${round1(m)} | ${round1(min)} | ${round1(max)} |`);
}
out();
out(`## Joueurs de référence (données réelles)`);
out();
out(`| Joueur | Rang | RS | Ligue | A | R | Niveau |`);
out(`| --- | --- | --- | --- | --- | --- | --- |`);
const refs = [rows[0]!, rows[99]!, rows[499]!, rows[999]!, rows.find((r) => r.name === "GOJO#6255")!, rows[rows.length - 1]!];
for (const r of refs) {
  out(`| ${r.name === "GOJO#6255" ? "GOJO#6255" : `n° ${r.rank}`} | ${r.rank} | ${r.rankScore} | ${r.league} | ${round1(absoluteScale(r.rankScore, topRs))} | ${round1(relativeScale(r.rank))} | ${round1(level(r.rankScore, r.rank, topRs))} |`);
}

// Monotonicity check on the real data: a better rank never has a lower level when RS is also higher.
let violations = 0;
for (let i = 1; i < rows.length; i++) {
  const a = rows[i - 1]!;
  const b = rows[i]!;
  if (a.rankScore >= b.rankScore && level(a.rankScore, a.rank, topRs) < level(b.rankScore, b.rank, topRs)) violations++;
}
out();
out(`Cohérence : ${violations} inversion(s) de Niveau entre voisins de classement (attendu : 0).`);

// ---------- part 2: synthetic trajectories ----------
interface SimPlayer {
  id: string;
  history: RsPoint[];
  outcomes: SeasonOutcome[];
  note: string;
}

/** Plays `matches` matches at time `at` (spread over 3 h), win probability `p`. Returns the new RS. */
function playSession(history: RsPoint[], at: number, matches: number, p: number, gain: [number, number], loss: [number, number]): void {
  let rs = history[history.length - 1]!.rs;
  const slot = (3 * HOUR) / Math.max(1, matches);
  for (let i = 0; i < matches; i++) {
    const win = rand() < p;
    rs += win ? randInt(gain[0], gain[1]) : -randInt(loss[0], loss[1]);
    rs = Math.max(0, rs);
    history.push({ at: at + i * slot, rs, rank: 0 });
  }
}

const GAIN: [number, number] = [180, 320];
const LOSS: [number, number] = [120, 260];

function synthPlayer(id: string, startRs: number, startDay: number, activeProb: number, matchesPerDay: [number, number], p: number): SimPlayer {
  const start = NOW - startDay * DAY;
  const history: RsPoint[] = [{ at: start, rs: startRs, rank: 0 }];
  for (let d = startDay - 1; d >= 0; d--) {
    if (rand() < activeProb) {
      const at = NOW - d * DAY - 4 * HOUR + randInt(0, 2) * HOUR; // evening sessions
      playSession(history, at, randInt(matchesPerDay[0], matchesPerDay[1]), p, GAIN, LOSS);
    }
  }
  return { id, history, outcomes: [], note: "" };
}

// Population of 2 000 synthetic players seeded from the real RS distribution.
const population: SimPlayer[] = [];
for (let i = 0; i < 2000; i++) {
  const startRs = realRs[randInt(0, realRs.length - 1)]! - 1500;
  const activeProb = 0.25 + rand() * 0.6;
  const p = 0.42 + rand() * 0.16;
  population.push(synthPlayer(`pop-${i}`, Math.max(30_000, startRs), SIM_DAYS, activeProb, [3, 12], p));
}

function fixedPlayer(id: string, note: string, build: (h: RsPoint[]) => void, startRs: number, startDay: number, outcomes: SeasonOutcome[] = []): SimPlayer {
  const history: RsPoint[] = [{ at: NOW - startDay * DAY, rs: startRs, rank: 0 }];
  build(history);
  return { id, history, outcomes, note };
}

const eveningOf = (daysAgo: number) => NOW - daysAgo * DAY - 3 * HOUR;
const season = (seasonId: string, finalRank: number, leagueNumber: number): SeasonOutcome => ({ seasonId, finalRank, leagueNumber, hasComparableLeagues: true });

const archetypes: SimPlayer[] = [
  fixedPlayer("Grinder régulier", "8 matchs chaque soir, 55 % de victoires, 1 saison Diamond derrière lui", (h) => {
    for (let d = 29; d >= 0; d--) playSession(h, eveningOf(d), 8, 0.55, GAIN, LOSS);
  }, 40_000, 30, [season("s11", 3_000, 18)]),
  fixedPlayer("Yo-yo", "10 matchs chaque soir, 50 % de victoires, grosses séries dans les deux sens", (h) => {
    for (let d = 29; d >= 0; d--) {
      const streak = d % 2 === 0 ? 0.85 : 0.15; // alternating hot and cold nights
      playSession(h, eveningOf(d), 10, streak, GAIN, LOSS);
    }
  }, 42_000, 30),
  fixedPlayer("Inactif (vétéran)", "aucun match depuis 30 jours, 2 saisons Ruby et 1 top 100", (h) => {
    h.push({ at: eveningOf(29), rs: 44_000, rank: 0 });
  }, 44_000, 35, [season("s10", 120, 21), season("s11", 40, 21)]),
  fixedPlayer("Fusée (nouveau compte)", "apparu il y a 10 jours, 12 matchs par soir à 65 % de victoires, aucune saison passée", (h) => {
    for (let d = 9; d >= 0; d--) playSession(h, eveningOf(d), 12, 0.65, GAIN, LOSS);
  }, 35_000, 10),
  fixedPlayer("Tilt", "6 matchs chaque soir à 35 % de victoires depuis 46 000 RS", (h) => {
    for (let d = 29; d >= 0; d--) playSession(h, eveningOf(d), 6, 0.35, GAIN, LOSS);
  }, 46_000, 30, [season("s11", 450, 21)]),
  fixedPlayer("Boost suspect", "rien pendant 29 jours, puis +5 000 RS en une heure hier soir", (h) => {
    h.push({ at: eveningOf(1), rs: 41_000, rank: 0 });
    h.push({ at: eveningOf(1) + HOUR, rs: 46_000, rank: 0 });
  }, 41_000, 30),
  fixedPlayer("Neuf matchs seulement", "9 matchs en 30 jours, tous gagnés, pour laisser la Consistance indisponible", (h) => {
    for (let d = 27; d >= 3; d -= 3) playSession(h, eveningOf(d), 1, 1, GAIN, LOSS);
  }, 43_000, 30),
  fixedPlayer("Spam 200 matchs", "comme le grinder régulier, puis 200 matchs à 60 % de victoires en 24 h", (h) => {
    for (let d = 29; d >= 1; d--) playSession(h, eveningOf(d), 8, 0.55, GAIN, LOSS);
    playSession(h, eveningOf(0) - 20 * HOUR, 200, 0.6, GAIN, LOSS);
  }, 40_000, 30, [season("s11", 3_000, 18)]),
];

// Ranks: every synthetic point is ranked among the real top 10 000 (the real field is treated as static).
for (const player of [...population, ...archetypes]) {
  for (const point of player.history) point.rank = rankOf(point.rs);
}

// Population references for momentum (per window) and consistency.
const windowRefs: Partial<Record<WindowKey, WindowReference | null>> = {};
for (const key of Object.keys(MOMENTUM_WINDOWS) as WindowKey[]) {
  windowRefs[key] = referenceFromDeltas(population.map((p) => windowDelta(p.history, NOW, MOMENTUM_WINDOWS[key])));
}
const populationDrawdowns = population
  .map((p) => meanDrawdown(p.history, NOW))
  .filter((d): d is number => d !== null)
  .sort((a, b) => a - b);
const allSnapshotDeltas: number[] = [];
for (const p of population) for (let i = 1; i < p.history.length; i++) allSnapshotDeltas.push(p.history[i]!.rs - p.history[i - 1]!.rs);
const threshold = anomalyThreshold(allSnapshotDeltas);

out();
out(`## Trajectoires types (données synthétiques, 30 jours)`);
out();
out(`Population synthétique : ${population.length} joueurs semés sur la distribution réelle des RS. Références de momentum (médiane / MAD des joueurs actifs) : 24 h ${fmtRef(windowRefs.h24)}, 7 j ${fmtRef(windowRefs.d7)}, 30 j ${fmtRef(windowRefs.d30)}. Joueurs éligibles à la Consistance (≥ 10 jours actifs) : ${populationDrawdowns.length}, drawdown moyen médian ${Math.round(quantile(populationDrawdowns, 0.5))} RS. Seuil d'anomalie (99,9e centile des variations) : ${threshold === null ? "n/d" : Math.round(threshold)} RS.`);
out();
out(`| Archétype | RS final | Rang | Niveau | Pic | Momentum | Consistance | Legacy | Rating | Provisoire | Signaux |`);
out(`| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`);

const archetypeJson: Record<string, unknown>[] = [];
for (const player of archetypes) {
  const last = player.history[player.history.length - 1]!;
  const lvl = level(last.rs, last.rank, topRs);
  const peak = Math.max(...player.history.map((pt) => level(pt.rs, pt.rank, topRs)));
  const mom = momentum(player.history, NOW, windowRefs);
  const drawdown = meanDrawdown(player.history, NOW);
  const cons = consistency(drawdown, populationDrawdowns);
  const leg = legacy(player.outcomes);
  const rating = combineRating({ level: lvl, peak, momentum: mom.value, consistency: cons, legacy: leg });
  let anomalies = 0;
  for (let i = 1; i < player.history.length; i++) {
    if (isAnomalous(player.history[i]!.rs - player.history[i - 1]!.rs, threshold)) anomalies++;
  }
  const signals = [mom.hotStreak ? "série chaude" : "", anomalies > 0 ? `${anomalies} variation(s) inhabituelle(s)` : "", cons === null ? "consistance n/d" : ""].filter(Boolean).join(", ") || "—";
  archetypeJson.push({ id: player.id, note: player.note, rs: last.rs, rank: last.rank, level: round1(lvl), peak: round1(peak), momentum: fmt(mom.value), drawdown: drawdown === null ? null : Math.round(drawdown), consistency: fmt(cons), legacy: round1(leg), rating: rating.rating, provisional: rating.provisional, signals });
  out(`| ${player.id} (${player.note}) | ${last.rs} | ${last.rank} | ${round1(lvl)} | ${round1(peak)} | ${fmt(mom.value)} | ${fmt(cons)} | ${round1(leg)} | **${rating.rating}** | ${rating.provisional ? "oui" : "non"} | ${signals} |`);
}

// Manipulation deltas worth stating explicitly.
const byId = Object.fromEntries(archetypeJson.map((a) => [a.id as string, a]));
out();
out(`Écarts à retenir : Spam 200 matchs vs Grinder régulier = ${Number(byId["Spam 200 matchs"]!.rating) - Number(byId["Grinder régulier"]!.rating)} point(s) de rating ; Inactif (vétéran) garde un Niveau de ${byId["Inactif (vétéran)"]!.level} mais un Momentum de ${byId["Inactif (vétéran)"]!.momentum}.`);

const report = lines.join("\n") + "\n";
writeFileSync(join(outDir, "simulation.md"), report);
writeFileSync(join(outDir, "simulation.json"), JSON.stringify({ fetchedAt: snapshot.source.fetchedAt, topRs, leagues: leagueJson, archetypes: archetypeJson, windowRefs, threshold }, null, 2));
process.stdout.write(report);

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
function fmt(x: number | null): string {
  return x === null ? "n/d" : String(round1(x));
}
function fmtRef(ref: WindowReference | null | undefined): string {
  return ref ? `${Math.round(ref.median)} / ${Math.round(ref.mad)} (n = ${ref.n})` : "n/d";
}
