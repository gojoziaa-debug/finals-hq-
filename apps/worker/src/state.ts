/** Pure helpers on an in-memory leaderboard state. */
import type { LeaderboardDef } from "@finals-hq/db/catalog";
import type { NormalizedRow } from "./normalize.ts";

export interface CurrentRow extends NormalizedRow {
  playerId: number;
  firstSeenAt: Date;
  lastChangeAt: Date;
}

/** A change worth an rs_event: score, league or club. Rank alone moves because of others. */
export function hasScoreChange(prev: NormalizedRow, next: NormalizedRow): boolean {
  return (
    prev.score !== next.score ||
    prev.leagueNumber !== next.leagueNumber ||
    prev.clubTag !== next.clubTag ||
    prev.clubUuid !== next.clubUuid
  );
}

/**
 * Ranks recomputed from scores (descending), previous rank as tie-break: between two full
 * snapshots the collector does not record rank moves of unchanged players.
 */
export function assignRanks<T extends { score: number; rank: number }>(rows: readonly T[]): T[] {
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.rank - b.rank);
  sorted.forEach((row, i) => {
    row.rank = i + 1;
  });
  return sorted;
}

export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

export function previousUtcDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return utcDay(d);
}

export interface Cutoffs {
  rowCount: number;
  rank1Score: number | null;
  rank500Score: number | null;
  lastScore: number | null;
  leagueCounts: Record<string, number> | null;
}

export function cutoffs(rows: readonly NormalizedRow[], lb: LeaderboardDef): Cutoffs {
  const sorted = [...rows].sort((a, b) => b.score - a.score || a.rank - b.rank);
  let leagueCounts: Record<string, number> | null = null;
  if (lb.hasLeagues) {
    leagueCounts = {};
    for (const row of sorted) {
      const key = row.leagueNumber === null ? "unknown" : String(row.leagueNumber);
      leagueCounts[key] = (leagueCounts[key] ?? 0) + 1;
    }
  }
  return {
    rowCount: sorted.length,
    rank1Score: sorted[0]?.score ?? null,
    rank500Score: sorted[499]?.score ?? null,
    lastScore: sorted.at(-1)?.score ?? null,
    leagueCounts,
  };
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
