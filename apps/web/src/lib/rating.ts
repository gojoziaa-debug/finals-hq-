/**
 * Rating FINALS HQ côté site (sprint 5) : quand la note devient publique, composantes affichées, radar.
 * Pur (testé dans tests/unit/rating.test.ts) : le serveur passe l'environnement, rien n'est lu ici.
 */
import { CALIBRATION_DAYS, RATING_WEIGHTS } from "@finals-hq/core/rating";
import type { PlayerRatingData, RatingComponentKey, RatingRunInfo } from "./types";

/**
 * Interrupteur de publication. Reste false pendant la semaine de calibration : la note n'est montrée qu'une fois
 * le rapport de calibration relu sur sept jours de vraies données (le 12 nov. 2026 au plus tôt) et validé par GOJO.
 * Les previews Vercel et le développement local l'affichent déjà, pour vérifier la page avant.
 */
export const RATING_PUBLIC = false;

export const COMPONENTS: readonly RatingComponentKey[] = ["level", "peak", "momentum", "consistency", "legacy"];

/** Composantes qui ne dépendent d'aucune référence de population : montrées dès maintenant. */
export const CALIBRATION_FREE: ReadonlySet<RatingComponentKey> = new Set(["level", "peak", "legacy"]);

export const WEIGHTS: Record<RatingComponentKey, number> = RATING_WEIGHTS;

export interface RatingEnv {
  vercelEnv?: string | undefined;
  nodeEnv?: string | undefined;
}

export interface RatingVisibility {
  /** La note et toutes ses composantes sont affichées. */
  open: boolean;
  /** Ouverte seulement parce que c'est une preview ou le développement local. */
  preview: boolean;
  /** Semaine de calibration complète d'après les relevés. */
  calibrated: boolean;
  observedDays: number;
  calibrationDays: number;
  /** Fin prévue de la semaine de calibration (premier relevé + 7 jours), ISO. */
  readyAt: string | null;
}

export function ratingVisibility(run: Pick<RatingRunInfo, "observedDays" | "calibrationDays" | "dataSince"> | null, env: RatingEnv, publicSwitch: boolean = RATING_PUBLIC): RatingVisibility {
  const calibrationDays = run?.calibrationDays ?? CALIBRATION_DAYS;
  const observedDays = run?.observedDays ?? 0;
  const calibrated = run !== null && observedDays >= calibrationDays;
  const preview = env.vercelEnv === "preview" || (env.vercelEnv === undefined && env.nodeEnv === "development");
  const readyAt = run ? new Date(Date.parse(run.dataSince) + calibrationDays * 86_400_000).toISOString() : null;
  const live = publicSwitch && calibrated;
  return { open: run !== null && (live || preview), preview: preview && !live, calibrated, observedDays, calibrationDays, readyAt };
}

/** Part de la note apportée par chaque composante disponible (poids renormalisés, comme le calcul). */
export function contributions(r: Pick<PlayerRatingData, RatingComponentKey>): Array<{ key: RatingComponentKey; value: number | null; weight: number; points: number | null }> {
  const available = COMPONENTS.filter((k) => r[k] !== null);
  const sum = available.reduce((s, k) => s + WEIGHTS[k], 0);
  return COMPONENTS.map((key) => {
    const value = r[key];
    const weight = value === null || sum === 0 ? 0 : WEIGHTS[key] / sum;
    return { key, value, weight, points: value === null ? null : value * weight };
  });
}

/** Points du radar (0–100 sur 5 axes, premier axe en haut), dans un carré de côté `size`. null = axe vide. */
export function radarPoints(values: ReadonlyArray<number | null>, size: number, padding = 0): Array<{ x: number; y: number; ax: number; ay: number }> {
  const c = size / 2;
  const radius = c - padding;
  return values.map((v, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / values.length;
    const r = (Math.max(0, Math.min(100, v ?? 0)) / 100) * radius;
    return { x: c + r * Math.cos(angle), y: c + r * Math.sin(angle), ax: c + radius * Math.cos(angle), ay: c + radius * Math.sin(angle) };
  });
}

/** Arc de la jauge : demi-cercle de gauche à droite, `value` sur 99. */
export function gaugeArc(value: number, cx: number, cy: number, r: number): string {
  const share = Math.max(0, Math.min(1, value / 99));
  const angle = Math.PI * (1 - share);
  const x = cx + r * Math.cos(angle);
  const y = cy - r * Math.sin(angle);
  return `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
}
