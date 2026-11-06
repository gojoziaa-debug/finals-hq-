"use client";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, SlidersHorizontal, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatNumber, type Locale } from "@/lib/format";
import { league as leagueOf } from "@/lib/league";
import { playerSlug, splitName } from "@/lib/players";
import {
  activeFilterCount,
  DEFAULT_ORDER,
  DEFAULT_STATE,
  median,
  PAGE_SIZE,
  parseTableState,
  serializeTableState,
  viewIndices,
  type SortKey,
  type TableState,
} from "@/lib/table-state";
import type { BoardColumns, BoardPayload } from "@/lib/types";
import { Button } from "./Button";
import { DeltaChip } from "./DeltaChip";
import { LeagueBadge } from "./LeagueBadge";
import { EmptyState, ErrorState } from "./States";

const ROW_HEIGHT = 44;

interface Props {
  boardId: number;
  isLive: boolean;
  hasLeagues: boolean;
  scoreUnit: string;
  /** Premières lignes rendues côté serveur (LCP, sans JavaScript), le reste arrive par /api/boards/[id]. */
  initial: BoardPayload;
  /** Ligues présentes dans le classement, pour le filtre. */
  leagues: number[];
}

type Load = { status: "partial" } | { status: "full" } | { status: "error" };

export function LeaderboardTable({ boardId, isLive, hasLeagues, scoreUnit, initial, leagues }: Props) {
  const t = useTranslations("leaderboard");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [rows, setRows] = useState<BoardColumns>(initial.rows);
  const [load, setLoad] = useState<Load>(initial.rows.rank.length >= initial.meta.rowCount ? { status: "full" } : { status: "partial" });
  const [state, setState] = useState<TableState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const hasDeltas = rows.d24 !== null;
  const total = initial.meta.rowCount;

  const fetchAll = useCallback(async () => {
    setLoad({ status: "partial" });
    try {
      const res = await fetch(`/api/boards/${boardId}`);
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as BoardPayload;
      setRows(body.rows);
      setLoad({ status: "full" });
    } catch {
      setLoad({ status: "error" });
    }
  }, [boardId]);

  // L'état vient de l'URL au montage (la page est statique : le serveur ne lit pas la query string).
  useEffect(() => {
    setState(parseTableState(new URLSearchParams(window.location.search), { hasDeltas: initial.rows.d24 !== null, hasLeagues }));
    setReady(true);
    if (initial.rows.rank.length >= initial.meta.rowCount) return;
    // Les 10 000 lignes arrivent quand le navigateur est libre : le premier rendu et le premier tap passent avant.
    const start = () => void fetchAll();
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(start, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(start, 300);
    return () => clearTimeout(id);
  }, [fetchAll, hasLeagues, initial]);

  useEffect(() => {
    if (!ready) return;
    const qs = serializeTableState(state, (n) => leagueOf(n)?.slug ?? String(n));
    if (qs !== window.location.search && !(qs === "" && window.location.search === "")) {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs}`);
    }
  }, [state, ready]);

  const view = useMemo(() => viewIndices(rows, state), [rows, state]);

  const virtualizer = useVirtualizer({
    count: view.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    initialRect: { width: 360, height: 20 * ROW_HEIGHT },
  });

  // ?page=N : on se place au début de la tranche une fois les données complètes.
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || !ready || load.status !== "full") return;
    jumped.current = true;
    if (state.page > 1) virtualizer.scrollToIndex(Math.min(view.length - 1, (state.page - 1) * PAGE_SIZE), { align: "start" });
  }, [ready, load.status, state.page, view.length, virtualizer]);

  const update = (patch: Partial<TableState>) => setState((s) => ({ ...s, ...patch, page: 1 }));

  const sortBy = (key: SortKey) =>
    setState((s) => ({ ...s, sort: key, order: s.sort === key ? (s.order === "asc" ? "desc" : "asc") : DEFAULT_ORDER[key], page: 1 }));

  const top500Index = useMemo(() => view.findIndex((i) => rows.rank[i] === 500), [view, rows]);
  const filters = activeFilterCount(state);
  const scores = useMemo(() => view.map((i) => rows.score[i]!), [view, rows]);
  const med = useMemo(() => (scores.length > 0 ? median(scores) : null), [scores]);

  // Page courante gardée dans l'URL pendant le défilement.
  const items = virtualizer.getVirtualItems();
  const firstVisible = items[0]?.index ?? 0;
  useEffect(() => {
    if (!ready || !jumped.current) return;
    const page = Math.floor(firstVisible / PAGE_SIZE) + 1;
    setState((s) => (s.page === page ? s : { ...s, page }));
  }, [firstVisible, ready]);

  const headers: Array<{ key: SortKey | null; label: string; className: string; numeric?: boolean }> = [
    { key: "rank", label: t("colRank"), className: "sticky left-0 z-[2] w-12 bg-surface pl-3 text-left", numeric: true },
    { key: "name", label: t("colPlayer"), className: "sticky left-12 z-[2] w-[44vw] min-w-[150px] max-w-[240px] bg-surface text-left md:w-auto md:max-w-none" },
    { key: "score", label: scoreUnit, className: "w-24 text-right", numeric: true },
    ...(hasDeltas
      ? [
          { key: "change24h" as const, label: t("col24h"), className: "w-20 text-right", numeric: true },
          { key: "change7d" as const, label: t("col7d"), className: "w-20 text-right", numeric: true },
        ]
      : []),
    ...(hasLeagues ? [{ key: null, label: t("colLeague"), className: "hidden w-32 text-left md:table-cell" }] : []),
    { key: null, label: t("colClub"), className: "hidden w-24 pr-3 text-left md:table-cell" },
  ];

  const paddingTop = items[0]?.start ?? 0;
  const paddingBottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0);
  const colCount = headers.length;

  const filterForm = (
    <div className="grid gap-4">
      <label className="grid gap-1">
        <span className="text-caption uppercase text-text-2">{t("filterName")}</span>
        <input type="search" value={state.q} onChange={(e) => update({ q: e.target.value })} placeholder={t("filterNamePlaceholder")} className="h-11 rounded-md border border-border-strong bg-bg px-3 text-body placeholder:text-text-3" />
      </label>
      <label className="grid gap-1">
        <span className="text-caption uppercase text-text-2">{t("filterClub")}</span>
        <input type="text" value={state.club} onChange={(e) => update({ club: e.target.value.trim() })} placeholder={t("filterClubPlaceholder")} maxLength={12} autoCapitalize="characters" className="h-11 rounded-md border border-border-strong bg-bg px-3 text-body uppercase placeholder:normal-case placeholder:text-text-3" />
      </label>
      {filters > 0 && (
        <Button variant="ghost" onClick={() => setState((s) => ({ ...DEFAULT_STATE, sort: s.sort, order: s.order }))} className="justify-start px-0">
          <X aria-hidden="true" className="h-4 w-4" /> {t("reset")}
        </Button>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {hasLeagues && leagues.length > 0 && (
          <label className="relative">
            <span className="sr-only">{t("filterLeague")}</span>
            <select
              value={state.league ?? ""}
              onChange={(e) => update({ league: e.target.value ? Number(e.target.value) : null })}
              className="h-11 appearance-none rounded-md border border-border-strong bg-surface pl-3 pr-8 text-body-sm font-medium"
            >
              <option value="">{t("filterLeagueAll")}</option>
              {[...leagues].reverse().map((n) => (
                <option key={n} value={n}>
                  {leagueOf(n)?.name ?? n}
                </option>
              ))}
            </select>
            <ArrowDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-3.5 h-4 w-4 text-text-3" />
          </label>
        )}
        <Button onClick={() => dialogRef.current?.showModal()} aria-haspopup="dialog" className="lg:hidden">
          <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
          {filters > 0 ? t("filtersCount", { count: filters }) : t("filters")}
        </Button>
        <div className="hidden items-center gap-2 lg:flex">
          <input type="search" value={state.q} onChange={(e) => update({ q: e.target.value })} placeholder={t("filterNamePlaceholder")} aria-label={t("filterName")} className="h-11 w-56 rounded-md border border-border-strong bg-surface px-3 text-body-sm placeholder:text-text-3" />
          <input type="text" value={state.club} onChange={(e) => update({ club: e.target.value.trim() })} placeholder={t("filterClub")} aria-label={t("filterClub")} maxLength={12} className="h-11 w-32 rounded-md border border-border-strong bg-surface px-3 text-body-sm uppercase placeholder:normal-case placeholder:text-text-3" />
          {filters > 0 && (
            <Button variant="ghost" onClick={() => setState((s) => ({ ...DEFAULT_STATE, sort: s.sort, order: s.order }))}>
              <X aria-hidden="true" className="h-4 w-4" /> {t("reset")}
            </Button>
          )}
        </div>
        <p className="ml-auto text-body-sm text-text-2 tnum" aria-live="polite">
          {filters > 0 && load.status === "full" ? t("filtered", { shown: formatNumber(view.length, locale), total: formatNumber(total, locale) }) : t("count", { count: total })}
          {med !== null && load.status === "full" && <span className="hidden lg:inline"> · {t("median", { unit: scoreUnit, value: formatNumber(med, locale) })}</span>}
        </p>
      </div>

      <dialog ref={dialogRef} aria-label={t("filters")} className="m-0 mt-auto w-full max-w-none rounded-t-xl border border-border-strong bg-surface p-0 text-text backdrop:bg-black/60 sm:m-auto sm:max-w-md sm:rounded-xl" onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}>
        <div className="grid gap-5 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between">
            <p className="text-title">{t("filters")}</p>
            <button type="button" onClick={() => dialogRef.current?.close()} className="inline-flex h-11 w-11 items-center justify-center rounded-md hover:bg-surface-raised" aria-label={tc("close")}>
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
          {filterForm}
          <Button variant="primary" onClick={() => dialogRef.current?.close()}>
            {t("apply")}
          </Button>
        </div>
      </dialog>

      {load.status === "error" && <ErrorState title={t("loadError")} action={<Button variant="primary" onClick={() => void fetchAll()}>{tc("retry")}</Button>} />}

      {view.length === 0 && load.status === "full" ? (
        total === 0 ? <EmptyState title={t("emptyBoard")} /> : <EmptyState title={t("empty")} body={t("emptyHint")} action={<Button onClick={() => setState(DEFAULT_STATE)}>{t("reset")}</Button>} />
      ) : (
        // overflow-x-clip : sans lui, Chrome mobile élargit la page à la largeur du tableau défilant (colonnes collées).
        <div className="relative overflow-x-clip">
          <div ref={scrollRef} className="h-[calc(100dvh-13rem)] min-h-[360px] overflow-auto overscroll-contain rounded-lg border border-border bg-surface md:h-[calc(100dvh-12rem)]" tabIndex={0} aria-label={t("title")}>
            <table className="w-full min-w-[460px] table-fixed border-separate border-spacing-0 text-num">
              <thead className="sticky top-0 z-[3]">
                <tr>
                  {headers.map((h, i) => {
                    const active = h.key !== null && state.sort === h.key;
                    return (
                      <th
                        key={i}
                        scope="col"
                        aria-sort={active ? (state.order === "asc" ? "ascending" : "descending") : undefined}
                        className={cn("h-10 border-b border-border bg-surface px-2 text-caption uppercase text-text-2", h.className, h.numeric && "text-right")}
                      >
                        {h.key ? (
                          <button type="button" onClick={() => sortBy(h.key!)} className={cn("inline-flex h-10 items-center gap-1 uppercase", h.numeric && "flex-row-reverse", active && "text-accent-ink")} aria-label={t("sortBy", { column: h.label })}>
                            {h.label}
                            {active && (state.order === "asc" ? <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" /> : <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" />)}
                          </button>
                        ) : (
                          h.label
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {paddingTop > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={colCount} style={{ height: paddingTop, padding: 0, border: 0 }} />
                  </tr>
                )}
                {items.map((item) => {
                  const i = view[item.index]!;
                  const name = rows.name[i] ?? null;
                  const rank = rows.rank[i]!;
                  const club = rows.club[i];
                  const isTop500 = rank === 500 && hasLeagues;
                  const n = name ? splitName(name) : null;
                  const href = name ? `/players/${playerSlug(name)}` : null;
                  return (
                    <tr
                      key={i}
                      data-index={item.index}
                      onClick={href ? (e) => !(e.target as HTMLElement).closest("a") && router.push(href) : undefined}
                      className={cn("group h-11", href && "cursor-pointer")}
                    >
                      <td className={cn("sticky left-0 z-[1] border-b border-border bg-surface pl-3 pr-2 text-right font-display text-[17px] font-semibold tnum group-hover:bg-surface-raised", isTop500 && "border-t-2 border-t-league-ruby")}>{formatNumber(rank, locale)}</td>
                      <td className={cn("relative sticky left-12 z-[1] border-b border-border bg-surface px-2 group-hover:bg-surface-raised", isTop500 && "border-t-2 border-t-league-ruby")}>
                        {isTop500 && <span className="absolute -top-2 left-2 rounded-sm bg-league-ruby px-1 text-[10px] font-semibold uppercase leading-4 text-accent-contrast">{t("top500")}</span>}
                        <span className="flex min-w-0 items-center gap-2">
                          {hasLeagues && <LeagueBadge leagueNumber={rows.league[i]} className="md:hidden" />}
                          {href && n ? (
                            <Link href={href} prefetch={false} className="min-w-0 truncate font-medium hover:underline">
                              {n.base}
                              {n.tag && <span className="text-text-2">{n.tag}</span>}
                            </Link>
                          ) : (
                            <span className="truncate italic text-text-2">{tc("hidden")}</span>
                          )}
                          {club && <span className="shrink-0 text-body-sm text-text-2 md:hidden">{club}</span>}
                        </span>
                      </td>
                      <td className={cn("border-b border-border px-2 text-right tnum group-hover:bg-surface-raised", isTop500 && "border-t-2 border-t-league-ruby")}>{formatNumber(rows.score[i]!, locale)}</td>
                      {hasDeltas && (
                        <>
                          <td className={cn("border-b border-border px-2 text-right group-hover:bg-surface-raised", isTop500 && "border-t-2 border-t-league-ruby")}>
                            <DeltaChip value={rows.d24![i]} compact />
                          </td>
                          <td className={cn("border-b border-border px-2 text-right group-hover:bg-surface-raised", isTop500 && "border-t-2 border-t-league-ruby")}>
                            <DeltaChip value={rows.d7![i]} compact />
                          </td>
                        </>
                      )}
                      {hasLeagues && (
                        <td className={cn("hidden border-b border-border px-2 group-hover:bg-surface-raised md:table-cell", isTop500 && "border-t-2 border-t-league-ruby")}>
                          <LeagueBadge leagueNumber={rows.league[i]} size="md" className="h-6 text-[15px]" />
                        </td>
                      )}
                      <td className={cn("hidden truncate border-b border-border px-2 pr-3 text-body-sm text-text-2 group-hover:bg-surface-raised md:table-cell", isTop500 && "border-t-2 border-t-league-ruby")}>{club ?? ""}</td>
                    </tr>
                  );
                })}
                {paddingBottom > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={colCount} style={{ height: paddingBottom, padding: 0, border: 0 }} />
                  </tr>
                )}
              </tbody>
            </table>
            {load.status === "partial" && (
              <p className="sticky bottom-0 left-0 border-t border-border bg-surface/95 px-3 py-2 text-body-sm text-text-2" aria-live="polite">
                {t("loading", { count: formatNumber(total, locale) })}
              </p>
            )}
          </div>
          {load.status === "full" && view.length > 20 && (
            <div className="pointer-events-none absolute bottom-3 right-3 z-[4] flex flex-col gap-2">
              {top500Index > 0 && (
                <button type="button" onClick={() => virtualizer.scrollToIndex(Math.max(0, top500Index - 3), { align: "start" })} className="pointer-events-auto inline-flex h-11 items-center gap-1 rounded-full border border-border-strong bg-surface-raised px-3 text-body-sm font-medium shadow-elevation-2">
                  <ChevronsDown aria-hidden="true" className="h-4 w-4 text-league-ruby-ink" /> {t("goTop500")}
                </button>
              )}
              {firstVisible > 30 && (
                <button type="button" onClick={() => virtualizer.scrollToIndex(0)} className="pointer-events-auto inline-flex h-11 items-center gap-1 self-end rounded-full border border-border-strong bg-surface-raised px-3 text-body-sm font-medium shadow-elevation-2" aria-label={t("goTop")}>
                  <ChevronsUp aria-hidden="true" className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
