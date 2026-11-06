/**
 * Classement des clubs (sprint 4) : tri, filtre et position, purs (tests/unit/clubs.test.ts).
 * Un club n'est vu qu'à travers ses membres présents dans le top 10 000 : les agrégats le disent.
 */
import type { ClubMember, ClubRow } from "./types";

export const CLUB_SORTS = ["total", "avg", "members", "d7", "best"] as const;
export type ClubSort = (typeof CLUB_SORTS)[number];
export const CLUBS_PAGE = 100;

export function parseClubSort(raw: string | undefined): ClubSort {
  return (CLUB_SORTS as readonly string[]).includes(raw ?? "") ? (raw as ClubSort) : "total";
}

/** Filtre par tag ou nom officiel (sans casse), puis tri ; à égalité, meilleur rang d'abord. */
export function sortClubs(clubs: readonly ClubRow[], sort: ClubSort, q = ""): ClubRow[] {
  const needle = q.trim().toLowerCase();
  const list = needle ? clubs.filter((c) => c.tag.toLowerCase().includes(needle) || (c.name ?? "").toLowerCase().includes(needle)) : [...clubs];
  const key = (c: ClubRow): number => {
    switch (sort) {
      case "total":
        return c.total;
      case "avg":
        return c.avg;
      case "members":
        return c.members;
      case "d7":
        return c.d7 ?? -Infinity;
      case "best":
        return -c.bestRank;
    }
  };
  return list.sort((a, b) => key(b) - key(a) || a.bestRank - b.bestRank || a.tag.localeCompare(b.tag));
}

/** Position d'un club au classement par RS cumulé (1 = premier), null s'il n'a aucun membre classé. */
export function clubPosition(clubs: readonly ClubRow[], tag: string): number | null {
  const i = sortClubs(clubs, "total").findIndex((c) => c.tag === tag);
  return i === -1 ? null : i + 1;
}

export interface ClubSummary {
  members: number;
  total: number;
  avg: number | null;
  bestRank: number | null;
  /** Somme des variations 7 j connues ; null si aucune n'est connue. */
  d7: number | null;
  d7Known: number;
  /** Membres par ligue, de la plus haute à la plus basse. */
  leagues: Array<{ league: number | null; count: number }>;
  inTop500: number;
}

export function summarizeClub(members: readonly ClubMember[]): ClubSummary {
  const total = members.reduce((s, m) => s + m.score, 0);
  const known = members.filter((m) => m.d7 !== null);
  const byLeague = new Map<number | null, number>();
  for (const m of members) byLeague.set(m.league, (byLeague.get(m.league) ?? 0) + 1);
  return {
    members: members.length,
    total,
    avg: members.length ? Math.round(total / members.length) : null,
    bestRank: members.length ? Math.min(...members.map((m) => m.rank)) : null,
    d7: known.length ? known.reduce((s, m) => s + m.d7!, 0) : null,
    d7Known: known.length,
    leagues: [...byLeague.entries()].map(([league, count]) => ({ league, count })).sort((a, b) => (b.league ?? -1) - (a.league ?? -1)),
    inTop500: members.filter((m) => m.rank <= 500).length,
  };
}

/** Adresse d'un club : /clubs/<tag> (le tag tel que l'API le donne, encodé). */
export function clubPath(tag: string): string {
  return `/clubs/${encodeURIComponent(tag)}`;
}
