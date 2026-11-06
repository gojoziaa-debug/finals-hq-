/**
 * FINALS HQ Rating v1 over a whole leaderboard: one pass to measure the population references
 * (median and MAD of the RS deltas per window, distribution of mean drawdowns, anomaly threshold),
 * one pass to rate every player against them. Pure: the worker loads the data, this file decides.
 */
import { anomalyThreshold, isAnomalous } from "./anomaly.ts";
import { consistency, CONSISTENCY_MIN_ACTIVE_DAYS, dailyCloses, meanDrawdown } from "./consistency.ts";
import { legacy } from "./legacy.ts";
import { level, RS_ANCHORS_STANDARD } from "./level.ts";
import { momentum, MOMENTUM_WINDOWS, referenceFromDeltas, windowDelta } from "./momentum.ts";
import { combineRating } from "./rating.ts";
import { quantile } from "./stats.ts";
import type { LevelAnchors, RsPoint, SeasonOutcome, WindowKey, WindowReference } from "./types.ts";

const DAY = 86_400_000;

/** The public Rating waits for this many days of real observations (phase D: references measured on a week). */
export const CALIBRATION_DAYS = 7;

export interface PlayerInput {
  playerId: string;
  /** Observed points of the live season, sorted by `at`, the current state included. */
  history: RsPoint[];
  /** Current Rank Score and rank in board order (score desc). */
  rs: number;
  rank: number;
  /** Finished ranked seasons linked to the player. */
  outcomes: SeasonOutcome[];
  /** RS changes between consecutive snapshots in the anomaly window (from the events), for the flag only. */
  recentDeltas: number[];
}

export interface PlayerRating {
  playerId: string;
  rating: number | null;
  raw: number | null;
  provisional: boolean;
  level: number;
  peak: number;
  momentum: number | null;
  momentumZ: number | null;
  deltas: Record<WindowKey, number | null>;
  drawdown: number | null;
  consistency: number | null;
  legacy: number;
  activeDays30: number;
  hotStreak: boolean;
  anomalies: number;
}

export interface PopulationReferences {
  momentum: Record<WindowKey, WindowReference | null>;
  drawdown: { n: number; p10: number; p25: number; median: number; p75: number; p90: number } | null;
  anomalyThreshold: number | null;
  /** Number of non-zero snapshot deltas the anomaly threshold was measured on. */
  anomalySamples: number;
  topRs: number;
  players: number;
}

export interface PopulationResult {
  references: PopulationReferences;
  players: PlayerRating[];
}

export interface RateOptions {
  anchors?: LevelAnchors;
  /** Non-zero RS changes between consecutive snapshots across the population (anomaly threshold). */
  snapshotDeltas: readonly number[];
}

const WINDOWS: WindowKey[] = ["h24", "d7", "d30"];

/**
 * Peak = best Niveau reached during the live season, every observed point read against today's #1
 * (as in the phase D simulation); never below the current Niveau.
 */
export function peakLevel(history: readonly RsPoint[], current: number, topRs: number, anchors: LevelAnchors): number {
  let best = current;
  for (const point of history) best = Math.max(best, level(point.rs, point.rank, topRs, anchors));
  return best;
}

export function ratePopulation(inputs: readonly PlayerInput[], now: number, options: RateOptions): PopulationResult {
  const anchors = options.anchors ?? RS_ANCHORS_STANDARD;
  const topRs = inputs.reduce((max, p) => Math.max(max, p.rs), 0);

  // Pass 1: population references.
  const deltas = inputs.map((p) => Object.fromEntries(WINDOWS.map((w) => [w, windowDelta(p.history, now, MOMENTUM_WINDOWS[w])])) as Record<WindowKey, number | null>);
  const references = Object.fromEntries(WINDOWS.map((w) => [w, referenceFromDeltas(deltas.map((d) => d[w]))])) as Record<WindowKey, WindowReference | null>;
  const drawdowns = inputs.map((p) => meanDrawdown(p.history, now));
  const eligible = drawdowns.filter((d): d is number => d !== null).sort((a, b) => a - b);
  const nonZero = options.snapshotDeltas.filter((d) => d !== 0);
  const threshold = anomalyThreshold(nonZero);

  // Pass 2: every player against the references.
  const players = inputs.map((p, i): PlayerRating => {
    const lvl = level(p.rs, p.rank, topRs, anchors);
    const pk = peakLevel(p.history, lvl, topRs, anchors);
    const mom = momentum(p.history, now, references);
    const cons = consistency(drawdowns[i]!, eligible);
    const leg = legacy(p.outcomes);
    const result = combineRating({ level: lvl, peak: pk, momentum: mom.value, consistency: cons, legacy: leg });
    return {
      playerId: p.playerId,
      rating: result.rating,
      raw: result.raw,
      provisional: result.provisional,
      level: lvl,
      peak: pk,
      momentum: mom.value,
      momentumZ: mom.z,
      deltas: deltas[i]!,
      drawdown: drawdowns[i]!,
      consistency: cons,
      legacy: leg,
      activeDays30: dailyCloses(p.history, now).length,
      hotStreak: mom.hotStreak,
      anomalies: p.recentDeltas.filter((d) => isAnomalous(d, threshold)).length,
    };
  });

  return {
    references: {
      momentum: references,
      drawdown:
        eligible.length === 0
          ? null
          : { n: eligible.length, p10: quantile(eligible, 0.1), p25: quantile(eligible, 0.25), median: quantile(eligible, 0.5), p75: quantile(eligible, 0.75), p90: quantile(eligible, 0.9) },
      anomalyThreshold: threshold,
      anomalySamples: nonZero.length,
      topRs,
      players: inputs.length,
    },
    players,
  };
}

/** Days of real observations between the first snapshot of the board and the last one. */
export function observedDays(firstSnapshotAt: number | null, lastSnapshotAt: number | null): number {
  if (firstSnapshotAt === null || lastSnapshotAt === null || lastSnapshotAt < firstSnapshotAt) return 0;
  return (lastSnapshotAt - firstSnapshotAt) / DAY;
}

/** Earliest moment the calibration week is complete (first snapshot + CALIBRATION_DAYS). */
export function calibrationReadyAt(firstSnapshotAt: number): number {
  return firstSnapshotAt + CALIBRATION_DAYS * DAY;
}

export { CONSISTENCY_MIN_ACTIVE_DAYS };
