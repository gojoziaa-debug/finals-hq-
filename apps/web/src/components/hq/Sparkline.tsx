import { cn } from "@/lib/cn";

/**
 * Mini-courbe SVG 96×24 rendue côté serveur. null = jour sans relevé (trou, jamais interpolé).
 * Moins de 2 points : trait plat. Trait text-3, teinté positive ou negative selon la variation nette.
 */
export function Sparkline({ values, width = 96, height = 24, label, className }: { values: ReadonlyArray<number | null>; width?: number; height?: number; label: string; className?: string }) {
  const points = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (points.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className={cn("text-text-3", className)}>
        <line x1="2" x2={width - 2} y1={height / 2} y2={height / 2} stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
      </svg>
    );
  }
  const min = Math.min(...points.map((p) => p.v));
  const max = Math.max(...points.map((p) => p.v));
  const span = max - min || 1;
  const step = (width - 6) / Math.max(1, values.length - 1);
  const x = (i: number) => 3 + i * step;
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
  // Segments séparés aux trous de collecte.
  const segments: string[] = [];
  let current = "";
  values.forEach((v, i) => {
    if (v === null) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    current += `${current ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (current) segments.push(current);
  const net = points[points.length - 1]!.v - points[0]!.v;
  const last = points[points.length - 1]!;
  const tone = net > 0 ? "text-positive" : net < 0 ? "text-negative" : "text-text-3";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className={cn(tone, className)}>
      {segments.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      ))}
      <circle cx={x(last.i)} cy={y(last.v)} r="2.25" fill="currentColor" />
    </svg>
  );
}
