import { pointAtOrBefore } from "./momentum.ts";
import { percentileRank } from "./stats.ts";
import type { DailyClose, RsPoint } from "./types.ts";

const DAY = 86_400_000;

export const CONSISTENCY_WINDOW_DAYS = 30;
/** Below this many active days in the window the Consistency is unavailable. */
export const CONSISTENCY_MIN_ACTIVE_DAYS = 10;

/**
 * Closing RS of every active UTC day in (now − days, now]. A day is active when at least one
 * snapshot of that day carries an RS different from the previous snapshot. History sorted by `at`.
 */
export function dailyCloses(history: readonly RsPoint[], now: number, days: number = CONSISTENCY_WINDOW_DAYS): DailyClose[] {
  const from = now - days * DAY;
  const byDay = new Map<number, { close: number; active: boolean }>();
  for (let i = 0; i < history.length; i++) {
    const point = history[i]!;
    if (point.at <= from || point.at > now) continue;
    const day = Math.floor(point.at / DAY);
    const previous = i > 0 ? history[i - 1]!.rs : point.rs;
    const entry = byDay.get(day) ?? { close: point.rs, active: false };
    entry.close = point.rs;
    entry.active = entry.active || point.rs !== previous;
    byDay.set(day, entry);
  }
  return [...byDay.entries()]
    .filter(([, entry]) => entry.active)
    .sort(([a], [b]) => a - b)
    .map(([day, entry]) => ({ day, close: entry.close }));
}

/**
 * Mean drawdown over the active days of the window: how far (in RS) the closing RS of each active
 * day sits below the best RS seen so far in the window, the RS at the start of the window included.
 * 0 for a player who never closed a day below their running best; null below
 * CONSISTENCY_MIN_ACTIVE_DAYS active days.
 */
export function meanDrawdown(history: readonly RsPoint[], now: number, days: number = CONSISTENCY_WINDOW_DAYS): number | null {
  const closes = dailyCloses(history, now, days);
  if (closes.length < CONSISTENCY_MIN_ACTIVE_DAYS) return null;
  const start = pointAtOrBefore(history, now - days * DAY);
  let best = start ? start.rs : Number.NEGATIVE_INFINITY;
  let total = 0;
  for (const { close } of closes) {
    best = Math.max(best, close);
    total += best - close;
  }
  return total / closes.length;
}

/**
 * C = 100 × (1 − F(drawdown)), F being the mid-rank percentile of the player's mean drawdown among
 * eligible players (`populationDrawdowns` sorted ascending). The median player scores 50; a player
 * who stays close to their best of the month scores high, a yo-yo or a tilt scores low.
 */
export function consistency(drawdown: number | null, populationDrawdowns: readonly number[]): number | null {
  if (drawdown === null || populationDrawdowns.length === 0) return null;
  return 100 * (1 - percentileRank(populationDrawdowns, drawdown));
}
