import { cn } from "@/lib/cn";

const TONES = {
  info: "bg-info/12 text-info-ink border-info/30",
  warning: "bg-warning/12 text-warning-ink border-warning/30",
  accent: "bg-accent text-accent-contrast border-accent",
  neutral: "bg-surface-raised text-text-2 border-border",
} as const;

/** Mentions : déduit, provisoire, données fictives, en cours… Le title explique en une phrase. */
export function InfoChip({ children, tone = "info", hint, className }: { children: React.ReactNode; tone?: keyof typeof TONES; hint?: string; className?: string }) {
  return (
    <span title={hint} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption uppercase", TONES[tone], className)}>
      {children}
      {hint && <span className="sr-only">: {hint}</span>}
    </span>
  );
}
