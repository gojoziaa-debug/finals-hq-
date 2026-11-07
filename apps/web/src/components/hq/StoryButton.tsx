"use client";
import { ImageDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Story 1080×1920 (sprint 6) : sur téléphone, menu de partage avec l'image (Instagram, TikTok, WhatsApp) ;
 * sinon téléchargement du PNG. L'image est la carte du profil générée par /api/og/player/….
 */
export function StoryButton({ src, filename, className }: { src: string; filename: string; className?: string }) {
  const t = useTranslations("share");
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const blob = await (await fetch(src)).blob();
      const file = new File([blob], filename, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] }) && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ files: [file] });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      // partage annulé ou image indisponible : rien à signaler
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={run} disabled={busy} title={t("storyHint")} className={cn("inline-flex h-11 items-center justify-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-body-sm font-semibold hover:bg-surface-raised disabled:opacity-60", className)}>
      <ImageDown aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
      <span className="sr-only sm:not-sr-only">{t("story")}</span>
    </button>
  );
}
