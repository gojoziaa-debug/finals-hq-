"use client";
import { Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { beacon } from "@/lib/beacon";
import { cn } from "@/lib/cn";

/** ↪ Partager : menu de partage du téléphone quand il existe, sinon copie du lien. L'aperçu du lien est la carte OG de la page (sprint 6). */
export function ShareButton({ title, compact = false, className }: { title: string; compact?: boolean; className?: string }) {
  const t = useTranslations("share");
  const [done, setDone] = useState(false);
  const share = async () => {
    const url = window.location.href.split("#")[0]!;
    beacon("share");
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      // partage annulé ou presse-papiers refusé : rien à signaler
    }
  };
  return (
    <button type="button" onClick={share} title={t("hint")} className={cn("inline-flex h-11 items-center justify-center gap-1.5 rounded-md border border-border-strong bg-surface text-body-sm font-semibold hover:bg-surface-raised", compact ? "w-11 px-0" : "px-3", className)}>
      <Share2 aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
      <span className={compact ? "sr-only" : undefined} aria-live="polite">
        {done ? t("copied") : t("share")}
      </span>
    </button>
  );
}
