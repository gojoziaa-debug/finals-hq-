/**
 * Comparaison de 2 à 4 joueurs (sprint 4) : lecture de l'URL et indicateurs, purs (tests/unit/compare.test.ts).
 * Mêmes calculs que le profil (lib/profile.ts) ; le meilleur de chaque ligne est surligné.
 */
import { DEFAULT_BOARD } from "./boards";
import { activeDays, career, lastPoint, peak } from "./profile";
import type { PlayerData, ProfilePoint } from "./types";

export const COMPARE_MAX = 4;

/** ?p=GOJO-6255,Autre-1234 → slugs distincts (sans tenir compte de la casse), au plus 4. */
export function parseCompare(raw: string | string[] | undefined): string[] {
  const joined = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of joined.split(",")) {
    const s = part.trim().slice(0, 64);
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
    if (out.length === COMPARE_MAX) break;
  }
  return out;
}

export function compareHref(slugs: readonly string[]): string {
  return slugs.length ? `/compare?p=${slugs.map((s) => encodeURIComponent(decodeSafe(s))).join(",")}` : "/compare";
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export type Better = "high" | "low";

export interface CompareMetric {
  key: "rank" | "rs" | "league" | "d24" | "d7" | "peak" | "active7" | "gap500" | "bestRank" | "seasons" | "top500" | "legacy";
  better: Better;
  values: Array<number | null>;
  /** Index des joueurs qui ont la meilleure valeur (vide si moins de deux valeurs connues ou tous égaux). */
  best: number[];
  /** Texte annexe par joueur (ex. saison du meilleur rang, jours observés). */
  notes: Array<string | null>;
}

export interface ComparePlayer {
  slug: string;
  data: PlayerData | null;
  /** Dans le top 10 000 du classement en cours au dernier relevé. */
  ranked: boolean;
  /** Dernière valeur relevée quand le joueur n'est plus classé. */
  lastSeen: ProfilePoint | null;
}

function bestIndexes(values: Array<number | null>, better: Better): number[] {
  const known = values.map((v, i) => [v, i] as const).filter((x): x is readonly [number, number] => x[0] !== null);
  if (known.length < 2) return [];
  const target = better === "high" ? Math.max(...known.map((k) => k[0])) : Math.min(...known.map((k) => k[0]));
  const winners = known.filter((k) => k[0] === target).map((k) => k[1]);
  return winners.length === known.length ? [] : winners;
}

export function compareMetrics(players: readonly ComparePlayer[], now: number, liveBoardId: number = DEFAULT_BOARD.id): CompareMetric[] {
  const rows: Array<Omit<CompareMetric, "best">> = [];
  const add = (key: CompareMetric["key"], better: Better, pick: (p: ComparePlayer) => [number | null, string | null]) => {
    const picked = players.map((p) => (p.data && !p.data.hidden ? pick(p) : ([null, null] as [null, null])));
    rows.push({ key, better, values: picked.map((x) => x[0]), notes: picked.map((x) => x[1]) });
  };
  const main = (p: ComparePlayer) => p.data?.current.find((c) => c.leaderboardId === liveBoardId) ?? null;
  add("rank", "low", (p) => [main(p)?.rank ?? null, null]);
  add("rs", "high", (p) => [main(p)?.score ?? null, null]);
  add("league", "high", (p) => [main(p)?.league ?? null, null]);
  add("d24", "high", (p) => [main(p)?.d24 ?? null, null]);
  add("d7", "high", (p) => [main(p)?.d7 ?? null, null]);
  add("peak", "high", (p) => {
    const pk = p.data?.live ? peak(p.data.live.series) : null;
    return [pk?.score ?? null, pk ? pk.t : null];
  });
  add("active7", "high", (p) => {
    const live = p.data?.live;
    if (!live) return [null, null];
    const d = activeDays(live.activity, live.historyStart, now, 7);
    return [d.active, String(d.observed)];
  });
  add("gap500", "low", (p) => {
    const m = main(p);
    const r500 = p.data?.live?.cutoff?.rank500 ?? null;
    if (!m || r500 === null) return [null, null];
    return [m.rank <= 500 ? 0 : Math.max(0, r500 - m.score), null];
  });
  const careers = players.map((p) => (p.data && !p.data.hidden ? career(p.data.seasons) : null));
  add("bestRank", "low", (p) => {
    const c = careers[players.indexOf(p)];
    return [c?.records.bestRank?.rank ?? null, c?.records.bestRank?.seasonId ?? null];
  });
  add("seasons", "high", (p) => [careers[players.indexOf(p)]?.badges.seasonsPlayed ?? null, null]);
  add("top500", "high", (p) => [careers[players.indexOf(p)]?.badges.top500 ?? null, null]);
  add("legacy", "high", (p) => {
    const c = careers[players.indexOf(p)];
    return [c ? Math.round(c.legacy.value) : null, null];
  });
  return rows.map((r) => ({ ...r, best: bestIndexes(r.values, r.better) }));
}

export function comparePlayer(slug: string, data: PlayerData | null, liveBoardId: number = DEFAULT_BOARD.id): ComparePlayer {
  const ranked = Boolean(data && !data.hidden && data.current.some((c) => c.leaderboardId === liveBoardId));
  return { slug, data, ranked, lastSeen: data && !data.hidden && !ranked && data.live ? (lastPoint(data.live.series) ?? null) : null };
}

