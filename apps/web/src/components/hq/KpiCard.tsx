import { cn } from "@/lib/cn";

/** Chiffre clé (Display), libellé en caption au-dessus, variation à droite, contexte en bas. Rien d'autre. */
export function KpiCard({ label, value, unit, delta, footer, chip, className }: { label: string; value: React.ReactNode; unit?: string | undefined; delta?: React.ReactNode; footer?: React.ReactNode; chip?: React.ReactNode; className?: string | undefined }) {
  return (
    <div className={cn("rounded-lg border border-border bg-surface p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-caption uppercase text-text-2">{label}</p>
        {chip}
      </div>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-display-lg tnum">{value}</span>
        {unit && <span className="text-body-sm text-text-2">{unit}</span>}
        {delta && <span className="text-body-sm">{delta}</span>}
      </p>
      {footer && <p className="mt-1 text-body-sm text-text-2">{footer}</p>}
    </div>
  );
}
