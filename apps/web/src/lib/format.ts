/**
 * Formats de la phase E : espace fine insécable en français (35 521), virgule des milliers en anglais (35,521),
 * signe explicite sur les variations (+1 234, −1 234), rang « n° 7 703 » / « #7,703 ».
 * Relatif sous 24 h, absolu au-delà dans le fuseau du visiteur.
 */
export type Locale = "fr" | "en";

const numberFormats = new Map<string, Intl.NumberFormat>();
function nf(locale: Locale): Intl.NumberFormat {
  let f = numberFormats.get(locale);
  if (!f) {
    f = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 0 });
    numberFormats.set(locale, f);
  }
  return f;
}

export function formatNumber(value: number, locale: Locale): string {
  // fr-FR utilise déjà U+202F (espace fine insécable) ; on le garantit quelle que soit la version d'ICU.
  const s = nf(locale).format(value);
  return locale === "fr" ? s.replace(/[  ]/g, " ") : s;
}

export function formatRank(rank: number, locale: Locale): string {
  return locale === "fr" ? `n° ${formatNumber(rank, locale)}` : `#${formatNumber(rank, locale)}`;
}

/** +1 234 / −1 234 (vrai signe moins) ; 0 → « 0 ». */
export function formatSigned(value: number, locale: Locale): string {
  if (value === 0) return "0";
  const abs = formatNumber(Math.abs(value), locale);
  return value > 0 ? `+${abs}` : `−${abs}`;
}

export function formatBytes(bytes: number, locale: Locale): string {
  const mb = bytes / 1_000_000;
  return `${new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 1 }).format(mb)} ${locale === "fr" ? "Mo" : "MB"}`;
}

/** « il y a 12 min » sous 24 h, sinon date et heure absolues (fuseau du visiteur, ou UTC côté serveur). */
export function formatRelative(at: Date, now: Date, locale: Locale, timeZone?: string): string {
  const seconds = Math.round((now.getTime() - at.getTime()) / 1000);
  if (seconds >= 0 && seconds < 86_400) {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
    if (seconds < 60) return rtf.format(0, "minute");
    if (seconds < 3600) return rtf.format(-Math.floor(seconds / 60), "minute");
    return rtf.format(-Math.floor(seconds / 3600), "hour");
  }
  return formatDateTime(at, locale, timeZone);
}

export function formatDateTime(at: Date, locale: Locale, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone, timeZoneName: "short" } : {}),
  }).format(at);
}

export function formatDate(at: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(at);
}

/** Âge d'un relevé pour le FreshnessBanner : caché sous 30 min, warning jusqu'à 3 h, negative au-delà. */
export type Freshness = "fresh" | "stale" | "outdated" | "unknown";
export function freshness(takenAt: Date | null, now: Date): Freshness {
  if (!takenAt) return "unknown";
  const minutes = (now.getTime() - takenAt.getTime()) / 60_000;
  if (minutes < 30) return "fresh";
  if (minutes < 180) return "stale";
  return "outdated";
}
