"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * En-tête compact collé sous la barre du site quand l'en-tête du profil sort de l'écran (IntersectionObserver
 * sur un repère placé sous l'en-tête). Masqué des lecteurs d'écran quand il est caché : il double l'en-tête.
 */
export function StickyPlayerBar({ sentinelId, children }: { sentinelId: string; children: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = document.getElementById(sentinelId);
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShown(!e!.isIntersecting && e!.boundingClientRect.top < 0), { rootMargin: "-56px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [sentinelId]);
  return (
    <div
      aria-hidden={!shown}
      inert={!shown}
      className={cn(
        "fixed inset-x-0 top-14 z-sticky border-b border-border bg-bg/95 backdrop-blur transition-[opacity,transform] duration-base ease-standard",
        shown ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0",
      )}
    >
      <div className="mx-auto flex h-14 max-w-container items-center gap-3 px-4 md:px-6 lg:px-8">{children}</div>
    </div>
  );
}
