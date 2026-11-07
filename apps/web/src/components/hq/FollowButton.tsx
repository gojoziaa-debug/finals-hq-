"use client";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { beacon } from "@/lib/beacon";
import { cn } from "@/lib/cn";
import { isFollowed, toggleFollow, useFollowing } from "@/lib/following";

/** ☆ Suivre / ★ Suivi : liste locale du navigateur (page Suivi). Seul un compteur anonyme « follow » part au serveur. */
export function FollowButton({ id, name, compact = false, className }: { id: string; name: string; compact?: boolean; className?: string }) {
  const t = useTranslations("follow");
  const list = useFollowing();
  const [error, setError] = useState(false);
  const on = isFollowed(list, id);
  const click = () => {
    const ok = toggleFollow({ id, name });
    setError(!ok);
    if (ok && !on) beacon("follow");
  };
  return (
    <button
      type="button"
      onClick={click}
      aria-pressed={on}
      title={error ? t("full") : t("hint")}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-1.5 rounded-md border text-body-sm font-semibold transition-colors duration-fast",
        compact ? "w-11 px-0" : "px-3",
        on ? "border-accent/60 bg-accent/10 text-accent-ink" : "border-border-strong bg-surface text-text hover:bg-surface-raised",
        className,
      )}
    >
      <Star aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} fill={on ? "currentColor" : "none"} />
      <span className={compact ? "sr-only" : undefined}>{on ? t("following") : t("follow")}</span>
      {error && <span className="sr-only" role="status">{t("full")}</span>}
    </button>
  );
}
