import { describe, expect, it } from "vitest";
import { cutoffChange, DAY_MS, observedDays, projectTop500, thin, type CutoffPoint } from "../../src/lib/cutoff";

const T0 = Date.parse("2026-11-05T22:00:00Z");
/** Série fictive : un relevé par heure, pente `perDay`, bruit déterministe d'amplitude `noise`. */
function series(days: number, perDay: number, noise = 0, start = 46_000): CutoffPoint[] {
  const out: CutoffPoint[] = [];
  for (let h = 0; h <= days * 24; h++) {
    const wobble = noise ? Math.round(noise * Math.sin(h * 1.7)) : 0;
    out.push({ t: new Date(T0 + h * 3_600_000).toISOString(), score: Math.round(start + (perDay * h) / 24) + wobble });
  }
  return out;
}

describe("top 500 projection", () => {
  it("waits for 7 days of snapshots and says when it will be available", () => {
    const p = projectTop500(series(1, 300));
    expect(p.available).toBe(false);
    if (!p.available) {
      expect(p.observedDays).toBeCloseTo(1, 5);
      expect(p.availableFrom).toBe(new Date(T0 + 7 * DAY_MS).toISOString());
    }
    expect(projectTop500([]).available).toBe(false);
  });

  it("recovers a clean linear trend exactly", () => {
    const p = projectTop500(series(8, 240));
    expect(p.available).toBe(true);
    if (!p.available) return;
    expect(p.slopePerDay).toBe(240);
    const last = 46_000 + 240 * 8;
    expect(p.points.map((x) => x.days)).toEqual([1, 3, 7]);
    expect(p.points[0]!.mid).toBe(last + 240);
    expect(p.points[2]!.mid).toBe(last + 7 * 240);
    expect(p.coverage).toBe(1);
  });

  it("is robust to an isolated spike (Theil-Sen, not least squares)", () => {
    const s = series(8, 200, 15);
    s[150] = { ...s[150]!, score: s[150]!.score + 5_000 };
    const p = projectTop500(s);
    if (!p.available) throw new Error("expected a projection");
    expect(Math.abs(p.slopePerDay - 200)).toBeLessThanOrEqual(5);
    expect(p.coverage).toBeGreaterThan(0.9);
  });

  it("is consistent with the real curve of the last 7 days: the band covers the noisy snapshots", () => {
    const p = projectTop500(series(10, 150, 60));
    if (!p.available) throw new Error("expected a projection");
    expect(p.coverage).toBeGreaterThanOrEqual(0.8);
    for (const x of p.points) {
      expect(x.low).toBeLessThanOrEqual(x.mid);
      expect(x.high).toBeGreaterThanOrEqual(x.mid);
    }
    // La bande s'élargit avec l'horizon.
    expect(p.points[2]!.high - p.points[2]!.low).toBeGreaterThan(p.points[0]!.high - p.points[0]!.low);
    // La droite ajustée part de la valeur ajustée il y a 7 jours et arrive à la valeur actuelle.
    expect(p.fit.to.value - p.fit.from.value).toBeCloseTo(p.slopePerDay * 7, -1);
  });

  it("does not assume the line only goes up", () => {
    const p = projectTop500(series(8, -120));
    if (!p.available) throw new Error("expected a projection");
    expect(p.slopePerDay).toBe(-120);
    expect(p.points[0]!.mid).toBeLessThan(46_000 - 120 * 8);
  });

  it("computes window changes and observed days", () => {
    const s = series(3, 240);
    expect(observedDays(s)).toBeCloseTo(3, 5);
    expect(cutoffChange(s, DAY_MS)).toBe(240);
    expect(cutoffChange(s, 10 * DAY_MS)).toBeNull();
    expect(cutoffChange([], DAY_MS)).toBeNull();
  });

  it("thins long series to a bounded number of evenly spaced points, keeping both ends", () => {
    const xs = Array.from({ length: 1000 }, (_, i) => i);
    const t = thin(xs, 200);
    expect(t).toHaveLength(200);
    expect(t[0]).toBe(0);
    expect(t[199]).toBe(999);
    expect(thin([1, 2, 3], 200)).toEqual([1, 2, 3]);
  });
});
