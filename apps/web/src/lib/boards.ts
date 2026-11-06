/**
 * Adresses des classements : /leaderboards/[season]/[board], slugs anglais stables (phase E).
 * season = id de saison (s12, s3…), « special » ou « events » ; board = mode (ranked, worldtour…),
 * suffixé de la plateforme quand elle n'est pas crossplay (ranked-steam), ou l'id de l'événement (ce44).
 * Pur et sans accès base : utilisable côté client.
 */
import { LEADERBOARDS, SEASONS, type LeaderboardDef, type SeasonDef } from "@finals-hq/db/catalog";

export const LIVE_SEASON: SeasonDef = SEASONS.find((s) => s.isLive) ?? SEASONS[SEASONS.length - 1]!;

export function seasonSegment(lb: LeaderboardDef): string {
  if (lb.seasonId) return lb.seasonId;
  return lb.kind === "event" ? "events" : "special";
}

export function boardSegment(lb: LeaderboardDef): string {
  if (lb.kind === "event") return lb.upstreamId;
  if (lb.platform && lb.platform !== "crossplay") return `${lb.mode}-${lb.platform}`;
  return lb.mode;
}

export function boardPath(lb: LeaderboardDef): string {
  return `/leaderboards/${seasonSegment(lb)}/${boardSegment(lb)}`;
}

const BY_PATH = new Map(LEADERBOARDS.map((lb) => [`${seasonSegment(lb)}/${boardSegment(lb)}`, lb]));

export function boardFromSegments(season: string, board: string): LeaderboardDef | undefined {
  return BY_PATH.get(`${season.toLowerCase()}/${board.toLowerCase()}`);
}

/** Classement par défaut : ranked crossplay de la saison en cours. */
export const DEFAULT_BOARD: LeaderboardDef = LEADERBOARDS.find((lb) => lb.isLive && lb.kind === "ranked" && lb.platform === "crossplay")!;

export interface SeasonGroup {
  id: string;
  label: string;
  isLive: boolean;
  boards: LeaderboardDef[];
}

/** Saisons de la plus récente à la plus ancienne, puis spéciaux et événements. */
export function seasonGroups(): SeasonGroup[] {
  const groups: SeasonGroup[] = [...SEASONS]
    .sort((a, b) => b.ordinal - a.ordinal)
    .map((s) => ({ id: s.id, label: s.name, isLive: s.isLive, boards: LEADERBOARDS.filter((lb) => lb.seasonId === s.id) }));
  groups.push({ id: "special", label: "Special", isLive: false, boards: LEADERBOARDS.filter((lb) => lb.kind === "special") });
  groups.push({ id: "events", label: "Community events", isLive: false, boards: LEADERBOARDS.filter((lb) => lb.kind === "event") });
  return groups.filter((g) => g.boards.length > 0);
}

/** Nom court du mode, sans la saison (« World Tour », « Ranked Cashout (steam) »). */
export function boardShortName(lb: LeaderboardDef): string {
  const i = lb.name.indexOf(" · ");
  return i === -1 ? lb.name : lb.name.slice(i + 3);
}

/** Unité du score affichée après le nombre. */
export function scoreUnit(lb: LeaderboardDef): "rs" | "cashouts" | "fans" | "points" | "wins" | "score" {
  if (lb.kind === "ranked") return lb.scoreField === "rankScore" ? "rs" : "score";
  if (lb.kind === "worldtour") return "cashouts";
  if (lb.kind === "sponsor") return "fans";
  if (lb.kind === "mode") return "points";
  if (lb.scoreField === "tournamentWins") return "wins";
  return "score";
}
