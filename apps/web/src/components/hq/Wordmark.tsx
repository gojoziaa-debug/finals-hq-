import { cn } from "@/lib/cn";

/** Mot-symbole : capitales condensées, « HQ » en Volt (accent-ink pour rester lisible sur le thème clair). */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display text-[22px] font-extrabold uppercase leading-none tracking-wide", className)}>
      Finals <span className="text-accent-ink">HQ</span>
    </span>
  );
}

/** Monogramme « HQ » dans un carré arrondi (favicon, cachet). */
export function Monogram({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#0B0B0F" />
      <text x="16" y="22.5" textAnchor="middle" fontFamily="var(--font-display), sans-serif" fontWeight="800" fontSize="17" fill="#D7FF3C">
        HQ
      </text>
    </svg>
  );
}
