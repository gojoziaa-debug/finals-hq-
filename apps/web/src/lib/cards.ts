/** Données des cartes de partage, tirées des mêmes lectures que les pages (pur, testé). */
import { DEFAULT_BOARD } from "./boards";
import type { PlayerCard } from "./og";
import type { PlayerData } from "./types";

/** Courbe de la carte : au plus 120 points (clôtures quotidiennes + relevés récents), dans l'ordre. */
const SERIES_MAX = 120;

/** null pour un profil masqué ou inconnu : la carte générique du site prend le relais, sans pseudo. */
export function playerCardData(p: PlayerData | null, liveBoardId: number = DEFAULT_BOARD.id): PlayerCard | null {
  if (!p || p.hidden) return null;
  const main = p.current.find((c) => c.leaderboardId === liveBoardId) ?? null;
  const series = (p.live?.series ?? []).map((pt) => pt.score);
  const step = Math.max(1, Math.ceil(series.length / SERIES_MAX));
  const thinned = series.filter((_, i) => i % step === 0 || i === series.length - 1);
  return {
    name: p.name,
    rank: main?.rank ?? null,
    score: main?.score ?? null,
    league: main?.league ?? null,
    club: main?.club ?? p.current.find((c) => c.club)?.club ?? null,
    d24: main?.d24 ?? null,
    d7: main?.d7 ?? null,
    series: thinned,
    takenAt: p.live?.takenAt ?? null,
  };
}

/** Adresse de la carte d'un profil, d'un club ou d'une comparaison (chemins relatifs, metadataBase complète). */
export function cardPath(kind: "player" | "club", key: string, locale: string, format: "og" | "story" = "og"): string {
  return `/api/og/${kind}/${key}?l=${locale}${format === "story" ? "&f=story" : ""}`;
}
