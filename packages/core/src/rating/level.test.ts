import { describe, expect, it } from "vitest";
import { absoluteScale, level, relativeScale, RS_ANCHORS_S3, RS_ANCHORS_STANDARD } from "./level.ts";
import { median, mad, percentileRank, piecewiseLinear, quantile } from "./stats.ts";

const TOP = 63_485; // #1 of S12 on 2026-11-05

describe("stats", () => {
  it("median and MAD", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(mad([1, 2, 3, 4, 100])).toBe(1);
    expect(() => median([])).toThrow(RangeError);
  });
  it("piecewiseLinear interpolates and clamps", () => {
    const pts = [[0, 0], [10, 100]] as const;
    expect(piecewiseLinear(pts, 5)).toBe(50);
    expect(piecewiseLinear(pts, -1)).toBe(0);
    expect(piecewiseLinear(pts, 11)).toBe(100);
  });
  it("percentileRank is a mid-rank", () => {
    expect(percentileRank([1, 2, 3, 4], 0)).toBe(0);
    expect(percentileRank([1, 2, 3, 4], 2)).toBe(0.375);
    expect(percentileRank([1, 2, 3, 4], 5)).toBe(1);
  });
  it("quantile", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([1, 2, 3, 4, 5], 1)).toBe(5);
  });
});

describe("absoluteScale", () => {
  it("hits the anchors exactly", () => {
    expect(absoluteScale(35_000, TOP)).toBe(62);
    expect(absoluteScale(40_000, TOP)).toBe(74);
    expect(absoluteScale(47_500, TOP)).toBe(86);
    expect(absoluteScale(TOP, TOP)).toBe(99);
  });
  it("interpolates between anchors", () => {
    expect(absoluteScale(36_250, TOP)).toBe(65);
  });
  it("is logarithmic above Diamond 1 and monotonic", () => {
    const a50 = absoluteScale(50_000, TOP);
    const a55 = absoluteScale(55_000, TOP);
    expect(a50).toBeGreaterThan(86);
    expect(a55).toBeGreaterThan(a50);
    expect(a55).toBeLessThan(99);
    // Half of the log distance to #1 gives half of the points.
    const mid = Math.sqrt(47_500 * TOP);
    expect(absoluteScale(mid, TOP)).toBeCloseTo(92.5, 5);
  });
  it("handles a top below Diamond 1 (early season) and values below the first anchor", () => {
    expect(absoluteScale(48_000, 46_000)).toBe(86);
    expect(absoluteScale(15_000, TOP)).toBe(25);
    expect(absoluteScale(0, TOP)).toBe(0);
  });
  it("uses season-specific anchors", () => {
    expect(absoluteScale(65_000, 80_000, RS_ANCHORS_S3)).toBe(86);
    expect(absoluteScale(40_000, 80_000, RS_ANCHORS_S3)).toBe(62);
    expect(RS_ANCHORS_STANDARD.rs.length).toBe(7);
  });
});

describe("relativeScale", () => {
  it("hits the anchors and clamps", () => {
    expect(relativeScale(1)).toBe(100);
    expect(relativeScale(100)).toBe(92);
    expect(relativeScale(500)).toBe(86);
    expect(relativeScale(10_000)).toBe(55);
    expect(relativeScale(25_000)).toBe(55);
  });
  it("is linear in log(rank): rank 50 is halfway between 10 and 100 in points", () => {
    const expected = 96 + ((Math.log10(50) - 1) / 1) * (92 - 96);
    expect(relativeScale(50)).toBeCloseTo(expected, 10);
  });
  it("decreases with rank", () => {
    let previous = 101;
    for (const rank of [1, 2, 5, 10, 50, 100, 500, 1000, 5000, 9999, 10_000]) {
      const value = relativeScale(rank);
      expect(value).toBeLessThan(previous);
      previous = value;
    }
  });
});

describe("level", () => {
  it("reproduces the reference players of 2026-11-05", () => {
    expect(level(TOP, 1, TOP)).toBeCloseTo(99.5, 5);
    expect(level(45_819, 500, TOP)).toBeCloseTo(0.5 * (82 + (819 / 2500) * 4) + 0.5 * 86, 5);
    expect(Math.round(level(35_521, 7_703, TOP))).toBe(61);
    expect(Math.round(level(34_415, 10_000, TOP))).toBe(58);
  });
});
