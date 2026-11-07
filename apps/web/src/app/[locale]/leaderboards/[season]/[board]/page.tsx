import type { LeaderboardDef } from "@finals-hq/db/catalog";
import { Clock } from "lucide-react";
import type { Metadata } from "next";
import { alternates } from "@/lib/site";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { SeasonSelect } from "@/components/hq/BoardPicker";
import { InfoChip } from "@/components/hq/InfoChip";
import { LeaderboardTable } from "@/components/hq/LeaderboardTable";
import { ErrorState } from "@/components/hq/States";
import { Link } from "@/i18n/navigation";
import { boardFromSegments, boardPath, boardShortName, scoreUnit, seasonGroups } from "@/lib/boards";
import { cn } from "@/lib/cn";
import { getBoard } from "@/lib/data";
import { DataUnavailableError } from "@/lib/db";
import { formatDate, formatDateTime, type Locale } from "@/lib/format";
import type { BoardPayload } from "@/lib/types";

/** ISR 60 s : le CDN sert la page, recalculée au plus une fois par minute (relevés toutes les 10 min). */
export const revalidate = 60;
export const dynamicParams = true;

const INITIAL_ROWS = 100;

/** Les classements en cours sont précalculés au build ; les archives à la première visite. */
/** Aucun classement précalculé au build (voir le layout [locale]) : rendu à la première visite, puis ISR 60 s. */
export function generateStaticParams() {
  return [];
}

type Params = Promise<{ locale: string; season: string; board: string }>;

function seasonLabel(lb: LeaderboardDef, t: (k: string) => string): string {
  if (lb.kind === "event") return t("events");
  if (lb.kind === "special") return t("special");
  return lb.name.split(" · ")[0] ?? lb.name;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, season, board } = await params;
  const lb = boardFromSegments(season, board);
  if (!lb) return {};
  const t = await getTranslations({ locale, namespace: "meta" });
  const tl = await getTranslations({ locale, namespace: "leaderboard" });
  const path = boardPath(lb);
  return {
    title: t("leaderboardTitle", { board: boardShortName(lb), season: seasonLabel(lb, tl) }),
    description: t("leaderboardDescription", { board: boardShortName(lb), season: seasonLabel(lb, tl) }),
    alternates: alternates(locale, path),
  };
}

export default async function LeaderboardPage({ params }: { params: Params }) {
  const { locale, season, board } = await params;
  setRequestLocale(locale);
  const lb = boardFromSegments(season, board);
  if (!lb) notFound();
  const t = await getTranslations("leaderboard");
  const te = await getTranslations("errors");
  const tu = await getTranslations("units");

  let payload: BoardPayload | null = null;
  try {
    payload = await getBoard(lb);
  } catch (error) {
    if (!(error instanceof DataUnavailableError)) throw error;
  }

  const groups = seasonGroups();
  const group = groups.find((g) => g.boards.some((b) => b.id === lb.id))!;
  const seasonOptions = groups.map((g) => {
    const target = g.boards.find((b) => b.kind === "ranked" && (b.platform === "crossplay" || b.platform === null)) ?? g.boards[0]!;
    return { id: g.id, label: g.id === "special" ? t("special") : g.id === "events" ? t("events") : g.label, href: boardPath(target) };
  });
  const unit = tu(scoreUnit(lb));
  const takenAt = payload?.meta.takenAt ? new Date(payload.meta.takenAt) : null;

  let initial: BoardPayload | null = null;
  let leagues: number[] = [];
  if (payload) {
    const r = payload.rows;
    initial = {
      meta: payload.meta,
      rows: {
        rank: r.rank.slice(0, INITIAL_ROWS),
        name: r.name.slice(0, INITIAL_ROWS),
        score: r.score.slice(0, INITIAL_ROWS),
        league: r.league.slice(0, INITIAL_ROWS),
        club: r.club.slice(0, INITIAL_ROWS),
        d24: r.d24 ? r.d24.slice(0, INITIAL_ROWS) : null,
        d7: r.d7 ? r.d7.slice(0, INITIAL_ROWS) : null,
      },
    };
    leagues = [...new Set(r.league.filter((l): l is number => l !== null))].sort((a, b) => a - b);
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SeasonSelect value={group.id} options={seasonOptions} />
          {lb.isLive ? <InfoChip tone="accent">{t("live")}</InfoChip> : null}
          {takenAt && (
            <p className="inline-flex items-center gap-1 text-body-sm text-text-2">
              <Clock aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
              <time dateTime={takenAt.toISOString()}>{formatDateTime(takenAt, locale as Locale, "UTC")}</time>
            </p>
          )}
        </div>
        <h1 className="font-display text-display-lg uppercase">
          {boardShortName(lb)} <span className="text-text-2">· {seasonLabel(lb, t)}</span>
        </h1>
        {!lb.isLive && <p className="text-body-sm text-text-2">{t("archived", { date: takenAt ? formatDate(takenAt, locale as Locale) : "none" })}</p>}
        {group.boards.length > 1 && (
          <nav aria-label={t("otherBoards")} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <ul className="flex gap-1 whitespace-nowrap">
              {group.boards.map((b) => (
                <li key={b.id}>
                  <Link
                    href={boardPath(b)}
                    aria-current={b.id === lb.id ? "page" : undefined}
                    className={cn("inline-flex h-11 items-center rounded-md border px-3 text-body-sm font-medium", b.id === lb.id ? "border-accent bg-accent text-accent-contrast" : "border-border bg-surface text-text-2 hover:text-text")}
                  >
                    {boardShortName(b)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
      {initial ? (
        <LeaderboardTable boardId={lb.id} isLive={lb.isLive} hasLeagues={lb.hasLeagues} scoreUnit={unit} initial={initial} leagues={leagues} />
      ) : (
        <ErrorState title={te("title")} body={te("body")} />
      )}
    </div>
  );
}
