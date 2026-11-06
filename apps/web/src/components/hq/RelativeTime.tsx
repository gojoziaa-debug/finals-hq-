"use client";
import { useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { formatDateTime, formatRelative, type Locale } from "@/lib/format";

/**
 * Heure d'un relevé, relative sous 24 h. Avec `now` (heure du rendu serveur), le premier rendu est déjà relatif :
 * même largeur de texte après hydratation, donc pas de décalage de mise en page. Sans, heure absolue UTC.
 */
export function RelativeTime({ iso, now, className }: { iso: string; now?: string; className?: string }) {
  const locale = useLocale() as Locale;
  const at = new Date(iso);
  const [label, setLabel] = useState(() => (now ? formatRelative(at, new Date(now), locale, "UTC") : formatDateTime(at, locale, "UTC")));
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tick = () => setLabel(formatRelative(new Date(iso), new Date(), locale, tz));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [iso, locale]);
  return (
    <time dateTime={iso} title={formatDateTime(at, locale, "UTC")} className={className}>
      {label}
    </time>
  );
}
