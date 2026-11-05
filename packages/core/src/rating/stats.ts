/** Small, dependency-free robust statistics. */

export const ROBUST_SIGMA_FACTOR = 1.4826;

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError("median of an empty array");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Median absolute deviation around `center` (the median by default). */
export function mad(values: readonly number[], center: number = median(values)): number {
  return median(values.map((v) => Math.abs(v - center)));
}

export function clip(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Linear interpolation between sorted [x, y] points. Below the first point returns the first y,
 * above the last returns the last y: callers decide what happens outside the anchors.
 */
export function piecewiseLinear(points: ReadonlyArray<readonly [number, number]>, x: number): number {
  if (points.length === 0) throw new RangeError("piecewiseLinear needs at least one point");
  const first = points[0]!;
  if (x <= first[0]) return first[1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    if (x <= x1) {
      const [x0, y0] = points[i - 1]!;
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return points[points.length - 1]![1];
}

/**
 * Mid-rank percentile of `x` within `sortedAsc`, in [0, 1]:
 * share of values strictly below x plus half of the values equal to x.
 */
export function percentileRank(sortedAsc: readonly number[], x: number): number {
  if (sortedAsc.length === 0) throw new RangeError("percentileRank of an empty population");
  let below = 0;
  let equal = 0;
  for (const v of sortedAsc) {
    if (v < x) below++;
    else if (v === x) equal++;
    else break;
  }
  return (below + equal / 2) / sortedAsc.length;
}

/** Empirical quantile (linear interpolation) of an unsorted sample. */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) throw new RangeError("quantile of an empty array");
  const sorted = [...values].sort((a, b) => a - b);
  const pos = clip(q, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}
