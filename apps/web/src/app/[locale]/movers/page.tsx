import type { Metadata } from "next";
import { alternates } from "@/lib/site";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DeltaChip } from "@/components/hq/DeltaChip";
import { LeagueBadge } from "@/components/hq/LeagueBadge";
import { RelativeTime } from "@/components/hq/RelativeTime";
import { EmptyState, ErrorState } from "@/components/hq/States";
import { Link } from "@/i18n/navigation";
import { LIVE_SEASON } from "@/lib/boards";
import { cn } from "@/lib/cn";
import { clubPath } from "@/lib/clubs";
import { getMovers } from "@/lib/data";
import { DataUnavailableError } from "@/lib/db";
import { formatDate, formatNumber, formatRank, type Locale } from "@/lib/format";
import { playerSlug, splitName } from "@/lib/players";
import type { MoversData, MoverWindow } from "@/lib/types";

export const dynamic = "force-dynamic";

const WINDOWS: MoverWindow[] = ["24h", "7d", "season"];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("moversTitle"), description: t("moversDescription", { season: LIVE_SEASON.name }), alternates: alternates(locale, "/movers") };
}

/**
 * Classements dérivés (phase F, sprint 4) : plus fortes progressions et plus grosses chutes de RS sur 24 h, 7 jours
 * ou depuis le début de la collecte. Le sprint 5 les range sous les onglets du Rating.
 */
export default async function MoversPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ w?: string | string[]; dir?: string | string[] }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const w = (WINDOWS as string[]).includes(one(sp.w) ?? "") ? (one(sp.w) as MoverWindow) : "24h";
  const dir = one(sp.dir) === "down" ? "down" : "up";
  const t = await getTranslations("movers");
  const tc = await getTranslations("common");
  const te = await getTranslations("errors");
  const l = locale as Locale;
  let data: MoversData | null = null;
  try {
    data = await getMovers(w, dir);
  } catch (error) {
    if (!(error instanceof DataUnavailableError)) throw error;
  }
  if (!data) return <ErrorState title={te("title")} body={te("body")} />;
  const start = data.historyStart ? formatDate(new Date(`${data.historyStart}T00:00:00Z`), l) : "—";
  const href = (nw: MoverWindow, nd: "up" | "down") => {
    const p = new URLSearchParams();
    if (nw !== "24h") p.set("w", nw);
    if (nd !== "up") p.set("dir", nd);
    const s = p.toString();
    return `/movers${s ? `?${s}` : ""}`;
  };
  const tab = (active: boolean) => cn("inline-flex h-9 items-center whitespace-nowrap rounded-full border px-3 text-body-sm font-medium", active ? "border-accent-ink bg-accent/15 text-text" : "border-border text-text-2 hover:text-text");
  const renderedAt = new Date().toISOString();
  return (
    <div className="grid grid-cols-1 gap-4">
      <header className="grid grid-cols-1 gap-1">
        <h1 className="font-display text-display-xl uppercase">{t(dir === "up" ? "titleUp" : "titleDown")}</h1>
        <p className="max-w-prose text-body-sm text-text-2">{t(`intro.${w}`, { date: start })}</p>
        {data.takenAt && (
          <p className="text-body-sm text-text-2">
            {tc("takenAt", { time: "" })}
            <RelativeTime iso={data.takenAt} now={renderedAt} />
          </p>
        )}
      </header>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <nav aria-label={t("directionLabel")}>
          <ul className="flex gap-1.5">
            <li><Link href={href(w, "up")} aria-current={dir === "up" ? "true" : undefined} className={tab(dir === "up")}>{t("up")}</Link></li>
            <li><Link href={href(w, "down")} aria-current={dir === "down" ? "true" : undefined} className={tab(dir === "down")}>{t("down")}</Link></li>
          </ul>
        </nav>
        <nav aria-label={t("windowLabel")}>
          <ul className="flex gap-1.5">
            {WINDOWS.map((x) => (
              <li key={x}><Link href={href(x, dir)} aria-current={w === x ? "true" : undefined} className={tab(w === x)}>{t(`window.${x}`)}</Link></li>
            ))}
          </ul>
        </nav>
      </div>
      {data.rows.length === 0 ? (
        <EmptyState title={t("empty")} body={t(w === "7d" ? "empty7d" : "emptyHint", { date: start })} />
      ) : (
        <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {data.rows.map((r, i) => {
            const n = splitName(r.name);
            return (
              <li key={r.name} className="flex min-h-12 items-center gap-3 px-3 py-1.5">
                <span className="w-7 text-right font-display text-[19px] font-bold tnum text-text-2">{i + 1}</span>
                <LeagueBadge leagueNumber={r.league} />
                <span className="min-w-0 flex-1">
                  <Link href={`/players/${playerSlug(r.name)}`} className="block truncate font-medium hover:underline">
                    {n.base}
                    {n.tag && <span className="text-text-2">{n.tag}</span>}
                  </Link>
                  <span className="text-[12px] text-text-2 tnum">
                    {formatRank(r.rank, l)} · {formatNumber(r.score, l)} RS
                    {r.club && (
                      <>
                        {" · "}
                        <Link href={clubPath(r.club)} className="hover:underline">[{r.club}]</Link>
                      </>
                    )}
                  </span>
                </span>
                <DeltaChip value={r.delta} className="text-body font-semibold" />
              </li>
            );
          })}
        </ol>
      )}
      <p className="text-[12px] text-text-2">{t("note")}</p>
    </div>
  );
}
