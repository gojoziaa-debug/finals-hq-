"use client";
import { AlertTriangle, Clock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatRelative, freshness, type Locale } from "@/lib/format";

/**
 * Âge du dernier relevé, sous l'en-tête. Caché sous 30 min ; warning de 30 min à 3 h ; negative au-delà
 * ou si des fichiers ont été rejetés. Calculé au rendu serveur (ISR 60 s), puis recalculé chaque minute dans le navigateur.
 */
export function FreshnessBanner({ takenAt, rejected24h, renderedAt }: { takenAt: string | null; rejected24h: number; renderedAt: string }) {
  const t = useTranslations("freshness");
  const locale = useLocale() as Locale;
  // Premier rendu à l'heure du calcul serveur (même HTML des deux côtés, pas de décalage de mise en page), puis heure du navigateur.
  const [now, setNow] = useState<Date>(() => new Date(renderedAt));
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const at = takenAt ? new Date(takenAt) : null;
  const state = freshness(at, now);
  if (state === "fresh" && rejected24h === 0) return null;
  const bad = state === "outdated" || state === "unknown" || rejected24h > 0;
  const age = at ? formatRelative(at, now, locale, "UTC") : "";
  const message = state === "unknown" ? t("unknown") : state === "fresh" ? t("rejected") : t(state === "stale" ? "stale" : "outdated", { age });
  const Icon = bad ? AlertTriangle : Clock;
  return (
    <div role="status" aria-live="polite" className={cn("border-b text-body-sm", bad ? "border-negative/40 bg-negative/10" : "border-warning/40 bg-warning/10")}>
      <div className="mx-auto flex max-w-container items-center gap-2 px-4 py-2 md:px-6 lg:px-8">
        <Icon aria-hidden="true" className={cn("h-4 w-4 shrink-0", bad ? "text-negative-ink" : "text-warning-ink")} strokeWidth={1.75} />
        <p className="flex-1">{message}</p>
        <Link href="/status" className="shrink-0 font-semibold underline underline-offset-2">
          {t("link")}
        </Link>
      </div>
    </div>
  );
}
