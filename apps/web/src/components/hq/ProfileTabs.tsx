"use client";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type Tab = "overview" | "career";

/**
 * Onglets Vue d'ensemble / Carrière. Les deux panneaux sont rendus côté serveur (ISR) ; l'onglet ouvert
 * se partage par l'ancre #career. Flèches gauche/droite entre onglets (motif ARIA tabs).
 */
export function ProfileTabs({ overview, career, careerCount }: { overview: React.ReactNode; career: React.ReactNode; careerCount: number }) {
  const t = useTranslations("profile");
  const [tab, setTab] = useState<Tab>("overview");
  useEffect(() => {
    const fromHash = () => setTab(window.location.hash === "#career" ? "career" : "overview");
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  const select = (next: Tab) => {
    setTab(next);
    history.replaceState(null, "", next === "career" ? "#career" : window.location.pathname + window.location.search);
  };
  const tabs: Tab[] = ["overview", "career"];
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = tab === "overview" ? "career" : "overview";
    select(next);
    document.getElementById(`tab-${next}`)?.focus();
  };
  return (
    <div className="grid grid-cols-1 gap-4">
      <div role="tablist" aria-label={t("tabs")} className="flex gap-1 border-b border-border" onKeyDown={onKey}>
        {tabs.map((k) => (
          <button
            key={k}
            id={`tab-${k}`}
            role="tab"
            type="button"
            aria-selected={tab === k}
            aria-controls={`panel-${k}`}
            tabIndex={tab === k ? 0 : -1}
            onClick={() => select(k)}
            className={cn("-mb-px inline-flex h-11 items-center gap-1.5 border-b-2 px-3 text-body-sm font-semibold", tab === k ? "border-accent text-text" : "border-transparent text-text-2 hover:text-text")}
          >
            {t(`tab.${k}`)}
            {k === "career" && careerCount > 0 && <span className="rounded-full bg-surface-raised px-1.5 text-caption tnum text-text-2">{careerCount}</span>}
          </button>
        ))}
      </div>
      <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" hidden={tab !== "overview"} className={cn(tab === "overview" ? "grid" : "hidden", "grid-cols-1 gap-6")}>
        {overview}
      </div>
      <div id="panel-career" role="tabpanel" aria-labelledby="tab-career" hidden={tab !== "career"} className={cn(tab === "career" ? "grid" : "hidden", "grid-cols-1 gap-6")}>
        {career}
      </div>
    </div>
  );
}
