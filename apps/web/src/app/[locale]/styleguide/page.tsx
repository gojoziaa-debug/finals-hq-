import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Button } from "@/components/hq/Button";
import { DeltaChip } from "@/components/hq/DeltaChip";
import { InfoChip } from "@/components/hq/InfoChip";
import { KpiCard } from "@/components/hq/KpiCard";
import { LeagueBadge } from "@/components/hq/LeagueBadge";
import { Sparkline } from "@/components/hq/Sparkline";
import { EmptyState, ErrorState, Skeleton } from "@/components/hq/States";
import { ThemeToggle } from "@/components/hq/ThemeToggle";
import { Monogram, Wordmark } from "@/components/hq/Wordmark";

export const metadata: Metadata = { title: "Styleguide · FINALS HQ", robots: { index: false, follow: false } };

/**
 * Tous les tokens et composants dans leurs états (phase E : remplace Storybook). Servie en développement
 * et sur les prévisualisations Vercel seulement. Les valeurs affichées ici sont fictives.
 */
const COLORS = ["bg", "surface", "surface-raised", "border", "border-strong", "text", "text-2", "text-3", "accent", "accent-ink", "positive", "negative", "warning", "info"];
const SWATCH: Record<string, string> = {
  bg: "bg-bg", surface: "bg-surface", "surface-raised": "bg-surface-raised", border: "bg-border", "border-strong": "bg-border-strong", text: "bg-text", "text-2": "bg-text-2", "text-3": "bg-text-3",
  accent: "bg-accent", "accent-ink": "bg-accent-ink", positive: "bg-positive", negative: "bg-negative", warning: "bg-warning", info: "bg-info",
};
const LEAGUE_SWATCH = ["bg-league-bronze", "bg-league-silver", "bg-league-gold", "bg-league-platinum", "bg-league-diamond", "bg-league-ruby"];

export default async function Styleguide({ params }: { params: Promise<{ locale: string }> }) {
  if (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview" && process.env.HQ_STYLEGUIDE !== "1") notFound();
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-display-lg uppercase">Styleguide</h1>
        <ThemeToggle />
      </div>
      <InfoChip tone="warning" className="justify-self-start">données fictives</InfoChip>

      <section className="grid grid-cols-1 gap-3">
        <h2 className="text-title-lg">Marque</h2>
        <div className="flex items-center gap-4"><Wordmark className="text-[40px]" /><Monogram size={40} /></div>
      </section>

      <section className="grid grid-cols-1 gap-3">
        <h2 className="text-title-lg">Couleurs</h2>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
          {COLORS.map((c) => (
            <li key={c} className="grid grid-cols-1 gap-1 text-[12px]"><span className={`h-12 rounded-md border border-border ${SWATCH[c]}`} />{c}</li>
          ))}
        </ul>
        <ul className="flex gap-2">{LEAGUE_SWATCH.map((c) => <li key={c} className={`h-8 w-14 rounded-md ${c}`} />)}</ul>
      </section>

      <section className="grid grid-cols-1 gap-2">
        <h2 className="text-title-lg">Typographie</h2>
        <p className="font-display text-display-hero">n° 7 703</p>
        <p className="font-display text-display-xl">35 521 RS</p>
        <p className="font-display text-display-lg">Titre de page</p>
        <p className="font-display text-display-md">Diamond 2</p>
        <p className="text-title-lg">Titre de section</p>
        <p className="text-body">Texte courant en Inter, chiffres tabulaires : <span className="tnum">1 234 567</span></p>
        <p className="text-caption uppercase text-text-2">Libellé de KPI</p>
        <p className="font-mono text-[13px]">Rating = min(99, Σ w·x / Σ w)</p>
      </section>

      <section className="grid grid-cols-1 gap-3">
        <h2 className="text-title-lg">LeagueBadge</h2>
        <div className="flex flex-wrap items-center gap-2">
          {[1, 5, 9, 13, 15, 17, 18, 20, 21, null].map((n, i) => <LeagueBadge key={i} leagueNumber={n} />)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[14, 19, 21].map((n) => <LeagueBadge key={n} leagueNumber={n} size="md" />)}
          <LeagueBadge leagueNumber={20} size="lg" />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3">
        <h2 className="text-title-lg">DeltaChip</h2>
        <div className="flex flex-wrap items-center gap-4">
          <DeltaChip value={1234} /> <DeltaChip value={-480} /> <DeltaChip value={0} /> <DeltaChip value={null} />
          <DeltaChip value={-12} kind="rank" /> <DeltaChip value={30} kind="rank" />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3">
        <h2 className="text-title-lg">InfoChip, Button</h2>
        <div className="flex flex-wrap items-center gap-2">
          <InfoChip tone="info">provisoire</InfoChip><InfoChip tone="warning">déduit</InfoChip><InfoChip tone="accent">série chaude</InfoChip><InfoChip tone="neutral">inactif depuis 9 j</InfoChip>
        </div>
        <div className="flex flex-wrap gap-2"><Button variant="primary">Principal</Button><Button>Secondaire</Button><Button variant="ghost">Discret</Button><Button disabled>Désactivé</Button></div>
      </section>

      <section className="grid grid-cols-1 gap-3">
        <h2 className="text-title-lg">KpiCard, Sparkline</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Ligne top 500" value="45 819" unit="RS" delta={<DeltaChip value={212} />} footer="relevé il y a 12 min" />
          <KpiCard label="Pic" value="36 410" unit="RS" chip={<InfoChip tone="warning">déduit</InfoChip>} />
          <KpiCard label="Momentum" value={<Sparkline values={[100, 120, null, 160, 150, 190, 230]} label="RS sur 7 jours, en hausse" />} />
          <div className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-surface p-4"><Skeleton className="h-3 w-20" /><Skeleton className="h-7 w-28" /><Skeleton className="h-3 w-16" /></div>
        </div>
        <div className="flex items-center gap-4">
          <Sparkline values={[300, 280, 250, 260, 200]} label="en baisse" />
          <Sparkline values={[300]} label="nouveau" />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <EmptyState title="Aucun joueur Diamond 1 dans le club XYZ" body="Essaie une autre ligue ou un autre tag de club." action={<Button>Effacer les filtres</Button>} />
        <ErrorState title="Données momentanément indisponibles" body="Les dernières données restent affichées." action={<Button variant="primary">Réessayer</Button>} />
      </section>
    </div>
  );
}
