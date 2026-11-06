"use client";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

/** Sélecteur de saison : navigue vers le tableau ranked (ou le premier) de la saison choisie. */
export function SeasonSelect({ value, options }: { value: string; options: Array<{ id: string; label: string; href: string }> }) {
  const t = useTranslations("leaderboard");
  const router = useRouter();
  return (
    <label className="relative inline-flex">
      <span className="sr-only">{t("season")}</span>
      <select value={value} onChange={(e) => router.push(options.find((o) => o.id === e.target.value)?.href ?? "/leaderboards")} className="h-11 appearance-none rounded-md border border-border-strong bg-surface pl-3 pr-9 text-body-sm font-semibold">
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-3.5 h-4 w-4 text-text-3" />
    </label>
  );
}
