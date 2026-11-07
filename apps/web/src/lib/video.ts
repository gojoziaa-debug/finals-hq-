/**
 * Templates vidéo « data → edit » (sprint 7) : paramètres et adresses, pur et testé.
 *
 * Trois modèles 1080×1920 à poser dans un logiciel de montage : progressions (top movers), duel (#1 vs #2 par
 * défaut) et ligne top 500. Chaque modèle se découpe en étapes (step) : la mise en page ne bouge pas d'une étape
 * à l'autre, seules les cases se remplissent, pour enchaîner les images en révélation sans recaler les calques.
 * Fond plein (Volt sombre) ou transparent (PNG alpha, à poser sur une séquence de jeu).
 */
import type { Locale } from "./format";
import type { MoverWindow } from "./types";

export const VIDEO_KINDS = ["movers", "duel", "cutoff"] as const;
export type VideoKind = (typeof VIDEO_KINDS)[number];
export const VIDEO_WINDOWS: MoverWindow[] = ["24h", "7d", "season"];
export const VIDEO_COUNTS = [3, 5] as const;
export type VideoCount = (typeof VIDEO_COUNTS)[number];

export interface VideoParams {
  kind: VideoKind;
  locale: Locale;
  bg: "solid" | "transparent";
  /** 0 = image complète ; 1…maxSteps = révélation progressive. */
  step: number;
  window: MoverWindow;
  dir: "up" | "down";
  count: VideoCount;
  /** Duel : deux slugs de profil (GOJO-6255) ; vide = #1 contre #2 du classement en direct. */
  players: string[];
  /** Repères des zones masquées par l'interface TikTok / Reels (aperçu seulement). */
  safe: boolean;
  download: boolean;
}

export function isVideoKind(v: string): v is VideoKind {
  return (VIDEO_KINDS as readonly string[]).includes(v);
}

/** Nombre d'étapes d'un modèle : une par ligne pour les progressions, trois pour le duel et la ligne top 500. */
export function maxSteps(kind: VideoKind, count: VideoCount): number {
  return kind === "movers" ? count : 3;
}

const SLUG = /^[^,\s]{1,48}$/;

export function parseVideoParams(kind: VideoKind, sp: URLSearchParams): VideoParams {
  const w = sp.get("w");
  const count: VideoCount = sp.get("n") === "3" ? 3 : 5;
  const rawStep = Number(sp.get("step") ?? 0);
  const players = (sp.get("p") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => SLUG.test(s))
    .slice(0, 2);
  return {
    kind,
    locale: sp.get("l") === "en" ? "en" : "fr",
    bg: sp.get("bg") === "transparent" ? "transparent" : "solid",
    step: Number.isInteger(rawStep) && rawStep > 0 ? Math.min(rawStep, maxSteps(kind, count)) : 0,
    window: (VIDEO_WINDOWS as string[]).includes(w ?? "") ? (w as MoverWindow) : "7d",
    dir: sp.get("dir") === "down" ? "down" : "up",
    count,
    players: players.length === 2 ? players : [],
    safe: sp.get("safe") === "1",
    download: sp.get("dl") === "1",
  };
}

/** Adresse d'une image ; seuls les paramètres différents des valeurs par défaut sont écrits (cache CDN partagé). */
export function videoPath(p: Pick<VideoParams, "kind" | "locale"> & Partial<VideoParams>): string {
  const q = new URLSearchParams();
  q.set("l", p.locale);
  if (p.kind === "movers") {
    if (p.window && p.window !== "7d") q.set("w", p.window);
    if (p.dir === "down") q.set("dir", "down");
    if (p.count === 3) q.set("n", "3");
  }
  if (p.kind === "duel" && p.players?.length === 2) q.set("p", p.players.join(","));
  if (p.bg === "transparent") q.set("bg", "transparent");
  if (p.step) q.set("step", String(p.step));
  if (p.safe) q.set("safe", "1");
  if (p.download) q.set("dl", "1");
  return `/api/og/video/${p.kind}?${q.toString()}`;
}

/** Nom du fichier téléchargé : se trie dans l'ordre des étapes dans un dossier de rushs. */
export function videoFilename(p: VideoParams, takenAt: string | null): string {
  const day = takenAt ? takenAt.slice(0, 10) : "na";
  const variant = p.kind === "movers" ? `-${p.dir}-${p.window}-top${p.count}` : "";
  const bg = p.bg === "transparent" ? "-alpha" : "";
  const step = p.step ? `-${String(p.step).padStart(2, "0")}` : "-full";
  return `finals-hq-${p.kind}${variant}-${day}${bg}${step}.png`;
}
