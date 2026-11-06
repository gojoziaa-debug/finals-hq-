import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { formatNumber, formatSigned, type Locale } from "@/lib/format";

/**
 * Variation signée avec flèche. kind « rank » inverse les couleurs (un rang qui baisse est une progression).
 * 0 : « — » neutre ; inconnu : « n/d » avec explication. La couleur n'est jamais seule : flèche, signe et libellé.
 */
export function DeltaChip({ value, kind = "rs", className, compact = false }: { value: number | null | undefined; kind?: "rs" | "rank"; className?: string; compact?: boolean }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  if (value === null || value === undefined) {
    return (
      <span className={cn("text-text-2 tnum", className)} title={t("common.unknownHint")}>
        <span aria-hidden="true">{t("common.unknown")}</span>
        <span className="sr-only">{t("delta.unknown")}</span>
      </span>
    );
  }
  if (value === 0) {
    return (
      <span className={cn("text-text-2 tnum", className)}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{t("delta.none")}</span>
      </span>
    );
  }
  const good = kind === "rank" ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight;
  const label = value > 0 ? t("delta.up", { value: formatNumber(Math.abs(value), locale) }) : t("delta.down", { value: formatNumber(Math.abs(value), locale) });
  return (
    <span className={cn("inline-flex items-center gap-0.5 whitespace-nowrap tnum", good ? "text-positive-ink" : "text-negative-ink", className)} title={label}>
      {!compact && <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />}
      <span aria-hidden="true">{formatSigned(value, locale)}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
