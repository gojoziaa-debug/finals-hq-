import { cn } from "@/lib/cn";
import { gaugeArc, radarPoints } from "@/lib/rating";

/**
 * Jauge du Rating (phase E) : demi-cercle 0–99 en Volt, la note au centre en Barlow. SVG pur, rendu serveur,
 * aucun JavaScript. Sans note (calibration), l'arc reste en pointillé et le centre affiche un tiret.
 */
export function RatingGauge({ value, label, sub, className }: { value: number | null; label: string; sub?: string | undefined; className?: string }) {
  const W = 200;
  const cx = 100;
  const cy = 100;
  const r = 84;
  return (
    <figure className={cn("relative mx-auto w-full max-w-[220px]", className)}>
      <svg viewBox={`0 0 ${W} 112`} role="img" aria-label={label} className="block w-full">
        <path d={gaugeArc(99, cx, cy, r)} fill="none" strokeWidth="14" strokeLinecap="round" className={cn("stroke-surface-raised", value === null && "stroke-border")} strokeDasharray={value === null ? "1 9" : undefined} />
        {value !== null && value > 0 && <path d={gaugeArc(value, cx, cy, r)} fill="none" strokeWidth="14" strokeLinecap="round" className="stroke-accent" />}
        <text x={cx} y={cy - 8} textAnchor="middle" className="fill-text font-display" style={{ fontSize: 56, fontWeight: 800 }}>
          {value === null ? "—" : value}
        </text>
        <text x={cx - r} y={cy + 12} textAnchor="middle" className="fill-text-3" style={{ fontSize: 10 }}>0</text>
        <text x={cx + r} y={cy + 12} textAnchor="middle" className="fill-text-3" style={{ fontSize: 10 }}>99</text>
      </svg>
      {sub && <figcaption className="-mt-1 text-center text-caption uppercase text-text-2">{sub}</figcaption>}
    </figure>
  );
}

/**
 * Radar des cinq composantes (0–100). Un axe sans valeur reste en pointillé et son libellé dit « n/d » :
 * on ne dessine pas un zéro qui n'a pas été mesuré.
 */
export function RatingRadar({ axes, label, className }: { axes: Array<{ label: string; value: number | null }>; label: string; className?: string }) {
  const S = 220;
  const pad = 30;
  const outer = radarPoints(axes.map(() => 100), S, pad);
  const rings = [25, 50, 75, 100].map((v) => radarPoints(axes.map(() => v), S, pad));
  const pts = radarPoints(axes.map((a) => a.value), S, pad);
  const known = axes.some((a) => a.value !== null);
  return (
    <svg viewBox={`-44 4 ${S + 88} ${S - 8}`} role="img" aria-label={label} className={cn("block w-full max-w-[320px]", className)}>
      {rings.map((ring, i) => (
        <polygon key={i} points={ring.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" className="stroke-border" strokeWidth="1" />
      ))}
      {outer.map((p, i) => (
        <line key={i} x1={S / 2} y1={S / 2} x2={p.ax} y2={p.ay} className="stroke-border" strokeWidth="1" strokeDasharray={axes[i]!.value === null ? "3 4" : undefined} />
      ))}
      {known && <polygon points={pts.map((p) => `${p.x},${p.y}`).join(" ")} className="fill-accent/25 stroke-accent-ink" strokeWidth="2" strokeLinejoin="round" />}
      {pts.map((p, i) => (axes[i]!.value === null ? null : <circle key={i} cx={p.x} cy={p.y} r="3" className="fill-accent-ink" />))}
      {outer.map((p, i) => {
        const dx = p.ax - S / 2;
        const anchor = Math.abs(dx) < 4 ? "middle" : dx > 0 ? "start" : "end";
        const x = p.ax + (Math.abs(dx) < 4 ? 0 : dx > 0 ? 6 : -6);
        const y = p.ay + (p.ay < S / 2 - 4 ? -8 : p.ay > S / 2 + 4 ? 14 : 4);
        const a = axes[i]!;
        return (
          <text key={i} x={x} y={y} textAnchor={anchor} className={a.value === null ? "fill-text-3" : "fill-text-2"} style={{ fontSize: 11 }}>
            {a.label} {a.value === null ? "n/d" : Math.round(a.value)}
          </text>
        );
      })}
    </svg>
  );
}

/** Barre 0–100 d'une composante ; vide et hachurée quand elle n'est pas encore mesurable. */
export function ComponentBar({ value, className }: { value: number | null; className?: string }) {
  return (
    <span className={cn("block h-2 w-full overflow-hidden rounded-full bg-surface-raised", value === null && "bg-[repeating-linear-gradient(135deg,rgb(var(--border))_0_2px,transparent_2px_5px)]", className)} aria-hidden="true">
      {value !== null && <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />}
    </span>
  );
}
