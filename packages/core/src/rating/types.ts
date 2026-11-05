/**
 * FINALS HQ Rating v1: types shared by the components.
 * Every number here is derived from public leaderboard data; nothing is guessed.
 */

/** One observed point of a player's Rank Score history (one per snapshot where it changed, plus the first). */
export interface RsPoint {
  /** Epoch milliseconds of the snapshot (the API's fetchedAt). */
  at: number;
  rs: number;
  /** Rank in the leaderboard at that snapshot. */
  rank: number;
}

/** Closing RS of one active UTC day (`day` = epoch days). */
export interface DailyClose {
  day: number;
  close: number;
}

/** Anchors mapping a Rank Score to the absolute scale A, per season (league thresholds). */
export interface LevelAnchors {
  /** [rs, a] pairs sorted by rs ascending; the last pair is the Diamond 1 threshold. */
  rs: ReadonlyArray<readonly [number, number]>;
  /** A of the #1 player of the snapshot. */
  topScore: number;
}

/** Population reference of RS deltas over one window, among active players (delta != 0). */
export interface WindowReference {
  median: number;
  mad: number;
  /** Number of active players the reference was computed on. */
  n: number;
}

export type WindowKey = "h24" | "d7" | "d30";

export interface WindowResult {
  delta: number | null;
  z: number | null;
}

export interface MomentumResult {
  /** 0–100, null when no window is available. */
  value: number | null;
  /** Weighted robust z, null when no window is available. */
  z: number | null;
  windows: Record<WindowKey, WindowResult>;
  availableWindows: WindowKey[];
  hotStreak: boolean;
}

/** A finished season, as linked to the player with high or certain confidence. */
export interface SeasonOutcome {
  seasonId: string;
  finalRank: number;
  /** Embark leagueNumber at the end of the season (0 Unranked … 21 Ruby), null when unknown. */
  leagueNumber: number | null;
  /** False for cb1, cb2, ob, s1, s2 (no comparable league system). */
  hasComparableLeagues: boolean;
}

export interface RatingComponents {
  level: number | null;
  peak: number | null;
  momentum: number | null;
  consistency: number | null;
  legacy: number | null;
}

export type ComponentKey = keyof RatingComponents;

export interface RatingResult {
  /** Integer 0–99, null when the level itself is unknown. */
  rating: number | null;
  /** Unrounded weighted mean. */
  raw: number | null;
  /** True when momentum or consistency could not be computed. */
  provisional: boolean;
  weightsUsed: Partial<Record<ComponentKey, number>>;
  version: string;
}
