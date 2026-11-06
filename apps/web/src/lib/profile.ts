/**
 * Calculs du profil joueur (sprint 3), purs et sans accès base : testés dans tests/unit/profile.test.ts,
 * utilisables côté serveur comme côté navigateur. Tout part des données relevées (V) ou de nos relevés (D) ;
 * rien n'est extrapolé : une valeur sans assez d'historique vaut null et s'affiche « n/d ».
 */
import { LEADERBOARDS, leaderboardById, SEASONS } from "@finals-hq/db/catalog";
import { legacy, seasonPoints, type SeasonOutcome } from "@finals-hq/core/rating";
import type { PlayerSeason, ProfileLive, ProfilePoint } from "./types";

export const DAY_MS = 86_400_000;

/** Fenêtres du sélecteur de la courbe. « season » = tout ce qui a été relevé de la saison. */
export type ChartRange = "24h" | "7d" | "30d" | "season";
export const RANGE_MS: Record<Exclude<ChartRange, "season">, number> = { "24h": DAY_MS, "7d": 7 * DAY_MS, "30d": 30 * DAY_MS };

const ms = (p: ProfilePoint) => Date.parse(p.t);

/** Dernier point (avec un score) au plus tard à t. */
export function pointAtOrBefore(series: readonly ProfilePoint[], t: number): ProfilePoint | undefined {
  let found: ProfilePoint | undefined;
  for (const p of series) {
    if (ms(p) > t) break;
    if (p.score !== null) found = p;
  }
  return found;
}

export function lastPoint(series: readonly ProfilePoint[]): ProfilePoint | undefined {
  for (let i = series.length - 1; i >= 0; i--) if (series[i]!.score !== null) return series[i];
  return undefined;
}

/**
 * Variation de RS sur une fenêtre : dernier point moins le dernier point au plus tard au début de la fenêtre.
 * null quand le joueur n'était pas encore relevé au début (même règle que le Momentum, phase D).
 */
export function windowDelta(series: readonly ProfilePoint[], now: number, windowMs: number): number | null {
  const end = lastPoint(series);
  const start = pointAtOrBefore(series, now - windowMs);
  if (!end || !start || end.score === null || start.score === null) return null;
  return end.score - start.score;
}

/** Variation du rang sur une fenêtre (négatif = progression). */
export function rankDelta(series: readonly ProfilePoint[], now: number, windowMs: number): number | null {
  const end = lastPoint(series);
  const start = pointAtOrBefore(series, now - windowMs);
  if (!end?.rank || !start?.rank) return null;
  return end.rank - start.rank;
}

/** Plus haut RS relevé (et quand). */
export function peak(series: readonly ProfilePoint[]): ProfilePoint | null {
  let best: ProfilePoint | null = null;
  for (const p of series) if (p.score !== null && (!best || p.score > best.score!)) best = p;
  return best;
}

/** Premier passage sous le rang 500 après avoir été au-delà (annotation « entrée top 500 »). */
export function top500Entry(series: readonly ProfilePoint[]): ProfilePoint | null {
  let previous: number | null = null;
  for (const p of series) {
    if (p.rank === null || p.score === null) continue;
    if (previous !== null && previous > 500 && p.rank <= 500) return p;
    previous = p.rank;
  }
  return null;
}

/** Points de la fenêtre, précédés du dernier point d'avant pour que la courbe parte du bord gauche. */
export function seriesInRange(series: readonly ProfilePoint[], range: ChartRange, now: number): ProfilePoint[] {
  if (range === "season") return [...series];
  const from = now - RANGE_MS[range];
  const before = pointAtOrBefore(series, from);
  const inside = series.filter((p) => ms(p) > from);
  return before ? [{ ...before, t: new Date(from).toISOString() }, ...inside] : inside;
}

/** Nombre de points avec un score : sous 2, la courbe laisse place à l'état « historique en construction ». */
export function scoredCount(series: readonly ProfilePoint[]): number {
  return series.reduce((n, p) => n + (p.score === null ? 0 : 1), 0);
}

const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * Jours actifs (au moins un changement de RS) sur les `days` derniers jours UTC, et nombre de jours réellement
 * observés dans cette fenêtre (la collecte a commencé le 5 nov. 2026 : « 2 / 2 j observés », pas « 2 / 7 »).
 */
export function activeDays(activity: ProfileLive["activity"], historyStart: string | null, now: number, days: number): { active: number; observed: number } {
  const today = dayOf(now);
  const from = dayOf(now - (days - 1) * DAY_MS);
  const active = activity.filter((a) => a.changes > 0 && a.day >= from && a.day <= today).length;
  if (!historyStart) return { active, observed: 0 };
  const start = historyStart > from ? historyStart : from;
  const observed = Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS) + 1);
  return { active, observed: Math.min(days, observed) };
}

export interface HeatDay {
  day: string;
  /** -1 = avant la collecte (hachuré), 0 = aucun changement, 1 à 5 = intensité. */
  level: number;
  changes: number;
}

/** Niveau d'intensité de la heatmap : 1, 2–3, 4–6, 7–10, 11+ changements de RS dans la journée. */
export function heatLevel(changes: number): number {
  if (changes <= 0) return 0;
  if (changes === 1) return 1;
  if (changes <= 3) return 2;
  if (changes <= 6) return 3;
  if (changes <= 10) return 4;
  return 5;
}

/** Les `days` derniers jours UTC jusqu'à aujourd'hui inclus, du plus ancien au plus récent. */
export function heatmap(activity: ProfileLive["activity"], historyStart: string | null, now: number, days: number): HeatDay[] {
  const byDay = new Map(activity.map((a) => [a.day, a.changes]));
  const out: HeatDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = dayOf(now - i * DAY_MS);
    const changes = byDay.get(day) ?? 0;
    out.push({ day, changes, level: !historyStart || day < historyStart ? -1 : heatLevel(changes) });
  }
  return out;
}

/** Jours entiers depuis le dernier changement de score (null si inconnu). */
export function daysSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  return Math.floor((now - Date.parse(iso)) / DAY_MS);
}

/** Part du top 10 000 au-dessus ou au niveau du joueur : rang 7 703 sur 10 000 → 77 %. Arrondi au supérieur, minimum 1 %. */
export function topPercent(rank: number, rowCount: number): number | null {
  if (!rowCount || rank < 1) return null;
  return Math.max(1, Math.ceil((rank / rowCount) * 100));
}

/* ───────────────────────────── Carrière (archives) ───────────────────────────── */

export interface CareerSeason {
  seasonId: string;
  seasonName: string;
  ordinal: number;
  hasComparableLeagues: boolean;
  /** Meilleur résultat ranked de la saison (toutes plateformes), null si seulement d'autres tableaux. */
  ranked: { leaderboardId: number; rank: number; score: number; league: number | null; platform: string | null } | null;
  /** Autres tableaux de la saison (World Tour, sponsor, modes). */
  others: Array<{ leaderboardId: number; rank: number; score: number }>;
  legacyPoints: number;
}

export interface Career {
  seasons: CareerSeason[];
  records: {
    bestRank: { rank: number; seasonId: string } | null;
    bestScore: { score: number; seasonId: string } | null;
    bestLeague: { league: number; seasonId: string } | null;
  };
  badges: { top500: number; top100: number; ruby: number; first: number; seasonsPlayed: number };
  legacy: { points: number; value: number };
}

const SEASON_BY_ID = new Map(SEASONS.map((s) => [s.id, s]));

/**
 * Carrière depuis les archives (season_results) : une ligne par saison terminée, le meilleur résultat ranked
 * de la saison en tête, les records, les badges et le Legacy (règles de packages/core, phase D).
 * Les RS de saisons différentes ne se comparent pas (barèmes différents) : le record de RS dit sa saison.
 */
export function career(seasons: readonly PlayerSeason[]): Career {
  const bySeason = new Map<string, CareerSeason>();
  for (const s of seasons) {
    const lb = leaderboardById(s.leaderboardId);
    if (!lb?.seasonId || lb.isLive) continue;
    const def = SEASON_BY_ID.get(lb.seasonId);
    if (!def) continue;
    let entry = bySeason.get(def.id);
    if (!entry) {
      entry = { seasonId: def.id, seasonName: def.name, ordinal: def.ordinal, hasComparableLeagues: def.hasComparableLeagues, ranked: null, others: [], legacyPoints: 0 };
      bySeason.set(def.id, entry);
    }
    if (lb.kind === "ranked" && lb.mode === "ranked") {
      if (!entry.ranked || s.rank < entry.ranked.rank) entry.ranked = { leaderboardId: s.leaderboardId, rank: s.rank, score: s.score, league: s.league, platform: lb.platform };
    } else {
      entry.others.push({ leaderboardId: s.leaderboardId, rank: s.rank, score: s.score });
    }
  }
  const list = [...bySeason.values()].sort((a, b) => b.ordinal - a.ordinal);
  let totalPoints = 0;
  const outcomes: SeasonOutcome[] = [];
  const badges = { top500: 0, top100: 0, ruby: 0, first: 0, seasonsPlayed: 0 };
  const records: Career["records"] = { bestRank: null, bestScore: null, bestLeague: null };
  for (const s of list) {
    s.others.sort((a, b) => a.leaderboardId - b.leaderboardId);
    if (!s.ranked) continue;
    badges.seasonsPlayed++;
    const outcome: SeasonOutcome = { seasonId: s.seasonId, finalRank: s.ranked.rank, leagueNumber: s.ranked.league, hasComparableLeagues: s.hasComparableLeagues };
    outcomes.push(outcome);
    s.legacyPoints = seasonPoints(outcome);
    totalPoints += s.legacyPoints;
    if (s.ranked.rank <= 500) badges.top500++;
    if (s.ranked.rank <= 100) badges.top100++;
    if (s.ranked.rank === 1) badges.first++;
    if (s.ranked.league === 21) badges.ruby++;
    if (!records.bestRank || s.ranked.rank < records.bestRank.rank) records.bestRank = { rank: s.ranked.rank, seasonId: s.seasonId };
    // Le score n'a de sens qu'avec le RS (S3 et après) : fame et cashouts des bêtas ne sont pas comparables.
    const lb = leaderboardById(s.ranked.leaderboardId);
    if (lb?.scoreField === "rankScore" && (!records.bestScore || s.ranked.score > records.bestScore.score)) records.bestScore = { score: s.ranked.score, seasonId: s.seasonId };
    if (s.ranked.league !== null && s.hasComparableLeagues && (!records.bestLeague || s.ranked.league > records.bestLeague.league)) records.bestLeague = { league: s.ranked.league, seasonId: s.seasonId };
  }
  return { seasons: list, records, badges, legacy: { points: totalPoints, value: legacy(outcomes) } };
}

/** Saisons dont le classement ranked est archivé (pour dire « 3 saisons sur 12 »). */
export const ARCHIVED_RANKED_SEASONS = new Set(LEADERBOARDS.filter((lb) => lb.kind === "ranked" && lb.mode === "ranked" && !lb.isLive && lb.seasonId).map((lb) => lb.seasonId!)).size;
