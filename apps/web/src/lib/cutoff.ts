/**
 * Ligne top 500 (sprint 4) : projection du RS du 500e, pure et sans accès base (tests/unit/cutoff.test.ts).
 *
 * Méthode (déduit, jamais présenté comme une donnée du jeu) :
 *   · on ne projette qu'à partir de 7 jours de relevés ; avant, la page dit à partir de quand ;
 *   · pente de Theil-Sen (médiane des pentes entre toutes les paires de points) sur les 7 derniers jours :
 *     robuste à un relevé aberrant, là où une régression des moindres carrés suivrait un pic isolé ;
 *   · intervalle : pentes du 10e et du 90e centile des paires, élargi de l'écart typique des résidus
 *     (1,4826 × MAD), pour que la bande couvre à la fois l'incertitude sur la tendance et le bruit des relevés ;
 *   · contrôle de cohérence affiché : part des relevés des 7 derniers jours qui tombent dans la bande ajustée.
 */

export const DAY_MS = 86_400_000;
/** Jours de relevés exigés avant d'afficher une projection (phase F, sprint 4). */
export const PROJECTION_MIN_DAYS = 7;
/** Fenêtre d'ajustement de la tendance. */
export const FIT_DAYS = 7;
/** Horizons affichés, en jours après le dernier relevé. */
export const HORIZONS = [1, 3, 7] as const;

export interface CutoffPoint {
  t: string;
  score: number;
}

export interface ProjectionPoint {
  days: number;
  t: string;
  low: number;
  mid: number;
  high: number;
}

export type Projection =
  | { available: false; observedDays: number; availableFrom: string | null }
  | {
      available: true;
      observedDays: number;
      /** RS par jour (médiane), et bornes basse et haute de la pente. */
      slopePerDay: number;
      slopeLow: number;
      slopeHigh: number;
      /** Écart typique des relevés autour de la droite (RS). */
      noise: number;
      /** Droite ajustée aux deux bords de la fenêtre (pour la tracer sur la courbe). */
      fit: { from: { t: string; value: number }; to: { t: string; value: number } };
      points: ProjectionPoint[];
      /** Part (0 à 1) des relevés des 7 derniers jours dans la bande ajustée : le critère « cohérente avec la courbe ». */
      coverage: number;
      fitPoints: number;
    };

const ms = (p: CutoffPoint) => Date.parse(p.t);

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Au plus `max` points régulièrement espacés (les paires de Theil-Sen croissent en n²). */
export function thin<T>(points: readonly T[], max: number): T[] {
  if (points.length <= max) return [...points];
  const out: T[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]!);
  return out;
}

/** Jours couverts par les relevés (du premier au dernier). */
export function observedDays(points: readonly CutoffPoint[]): number {
  if (points.length < 2) return 0;
  return (ms(points[points.length - 1]!) - ms(points[0]!)) / DAY_MS;
}

/**
 * Projection du RS du 500e. `points` : relevés dans l'ordre chronologique (un par heure suffit).
 * Le RS du 500e ne fait que monter en cours de saison, mais la méthode ne le suppose pas.
 */
export function projectTop500(points: readonly CutoffPoint[]): Projection {
  const span = observedDays(points);
  if (points.length < 2 || span < PROJECTION_MIN_DAYS) {
    const first = points[0];
    return { available: false, observedDays: span, availableFrom: first ? new Date(ms(first) + PROJECTION_MIN_DAYS * DAY_MS).toISOString() : null };
  }
  const end = ms(points[points.length - 1]!);
  const windowStart = end - FIT_DAYS * DAY_MS;
  const fitSet = points.filter((p) => ms(p) >= windowStart);
  const sample = thin(fitSet, 200);
  // x en jours depuis le dernier relevé (0 = maintenant, négatif = passé) : l'ordonnée à l'origine est la valeur actuelle ajustée.
  const xs = sample.map((p) => (ms(p) - end) / DAY_MS);
  const ys = sample.map((p) => p.score);
  const slopes: number[] = [];
  for (let i = 0; i < sample.length; i++) {
    for (let j = i + 1; j < sample.length; j++) {
      const dx = xs[j]! - xs[i]!;
      if (dx > 1e-6) slopes.push((ys[j]! - ys[i]!) / dx);
    }
  }
  slopes.sort((a, b) => a - b);
  const slope = quantile(slopes, 0.5);
  const slopeLow = quantile(slopes, 0.1);
  const slopeHigh = quantile(slopes, 0.9);
  const intercept = median(ys.map((y, i) => y - slope * xs[i]!));
  const residuals = ys.map((y, i) => y - (intercept + slope * xs[i]!));
  const noise = 1.4826 * median(residuals.map((r) => Math.abs(r - median(residuals))));

  // Bande ajustée sur la fenêtre passée : mêmes règles que la projection, ancrée sur la valeur actuelle.
  const band = (x: number) => {
    const a = intercept + slopeLow * x;
    const b = intercept + slopeHigh * x;
    return { low: Math.min(a, b) - noise, high: Math.max(a, b) + noise };
  };
  const inside = fitSet.filter((p) => {
    const b = band((ms(p) - end) / DAY_MS);
    return p.score >= b.low - 0.5 && p.score <= b.high + 0.5;
  }).length;

  const round = (v: number) => Math.round(v);
  return {
    available: true,
    observedDays: span,
    slopePerDay: round(slope),
    slopeLow: round(slopeLow),
    slopeHigh: round(slopeHigh),
    noise: round(noise),
    fit: {
      from: { t: new Date(windowStart).toISOString(), value: round(intercept - slope * FIT_DAYS) },
      to: { t: new Date(end).toISOString(), value: round(intercept) },
    },
    points: HORIZONS.map((d) => {
      const b = band(d);
      return { days: d, t: new Date(end + d * DAY_MS).toISOString(), low: round(b.low), mid: round(intercept + slope * d), high: round(b.high) };
    }),
    coverage: fitSet.length ? inside / fitSet.length : 0,
    fitPoints: fitSet.length,
  };
}

/** Variation du RS du 500e sur une fenêtre : dernier relevé moins le dernier relevé au plus tard au début. */
export function cutoffChange(points: readonly CutoffPoint[], windowMs: number): number | null {
  const last = points[points.length - 1];
  if (!last) return null;
  const from = ms(last) - windowMs;
  let start: CutoffPoint | undefined;
  for (const p of points) {
    if (ms(p) > from) break;
    start = p;
  }
  return start ? last.score - start.score : null;
}
