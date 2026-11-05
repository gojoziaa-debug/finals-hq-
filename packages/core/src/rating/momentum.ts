import { clip, mad, median, ROBUST_SIGMA_FACTOR } from "./stats.ts";
import type { MomentumResult, RsPoint, WindowKey, WindowReference, WindowResult } from "./types.ts";

export const MOMENTUM_WINDOWS: Record<WindowKey, number> = {
  h24: 24 * 3_600_000,
  d7: 7 * 86_400_000,
  d30: 30 * 86_400_000,
};

export const MOMENTUM_WEIGHTS: Record<WindowKey, number> = { h24: 0.3, d7: 0.5, d30: 0.2 };

export const Z_CLIP = 3;
export const HOT_STREAK_Z = 1.5;
export const HOT_STREAK_ACTIVE_DAYS = 3;
/** Below this many active players a window reference carries no information. */
export const REFERENCE_MIN_ACTIVE = 10;

const WINDOW_KEYS: WindowKey[] = ["h24", "d7", "d30"];

/** Last point at or before `t`; history must be sorted by `at` ascending. */
export function pointAtOrBefore(history: readonly RsPoint[], t: number): RsPoint | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const point = history[i]!;
    if (point.at <= t) return point;
  }
  return undefined;
}

/** RS(now) − RS(now − window), or null when the player was not visible at the start of the window. */
export function windowDelta(history: readonly RsPoint[], now: number, windowMs: number): number | null {
  const current = pointAtOrBefore(history, now);
  const start = pointAtOrBefore(history, now - windowMs);
  if (!current || !start) return null;
  return current.rs - start.rs;
}

/** Reference computed over the deltas of the whole population; only active players (delta ≠ 0) count. */
export function referenceFromDeltas(deltas: readonly (number | null)[]): WindowReference | null {
  const active = deltas.filter((d): d is number => d !== null && d !== 0);
  if (active.length < REFERENCE_MIN_ACTIVE) return null;
  const center = median(active);
  return { median: center, mad: mad(active, center), n: active.length };
}

/** Robust z-score, clipped to ±Z_CLIP; 0 when the reference carries no information. */
export function zScore(delta: number, reference: WindowReference | null | undefined): number {
  if (!reference || reference.mad === 0) return 0;
  return clip((delta - reference.median) / (ROBUST_SIGMA_FACTOR * reference.mad), -Z_CLIP, Z_CLIP);
}

/** Number of distinct UTC days in (now − days, now] with at least one RS change. */
export function activeDays(history: readonly RsPoint[], now: number, days: number): number {
  const from = now - days * 86_400_000;
  const seen = new Set<number>();
  for (let i = 1; i < history.length; i++) {
    const point = history[i]!;
    if (point.at <= from || point.at > now) continue;
    if (point.rs !== history[i - 1]!.rs) seen.add(Math.floor(point.at / 86_400_000));
  }
  return seen.size;
}

export function momentumFromZ(z: number): number {
  return 50 + 50 * Math.tanh(z / 2);
}

export function momentum(
  history: readonly RsPoint[],
  now: number,
  references: Partial<Record<WindowKey, WindowReference | null>>,
): MomentumResult {
  const windows = {} as Record<WindowKey, WindowResult>;
  const availableWindows: WindowKey[] = [];
  let weighted = 0;
  let weightSum = 0;
  for (const key of WINDOW_KEYS) {
    const delta = windowDelta(history, now, MOMENTUM_WINDOWS[key]);
    if (delta === null) {
      windows[key] = { delta: null, z: null };
      continue;
    }
    const z = zScore(delta, references[key]);
    windows[key] = { delta, z };
    availableWindows.push(key);
    weighted += MOMENTUM_WEIGHTS[key] * z;
    weightSum += MOMENTUM_WEIGHTS[key];
  }
  if (weightSum === 0) {
    return { value: null, z: null, windows, availableWindows, hotStreak: false };
  }
  const z = weighted / weightSum;
  const d7 = windows.d7.z;
  const hotStreak = d7 !== null && d7 >= HOT_STREAK_Z && activeDays(history, now, 7) >= HOT_STREAK_ACTIVE_DAYS;
  return { value: momentumFromZ(z), z, windows, availableWindows, hotStreak };
}
