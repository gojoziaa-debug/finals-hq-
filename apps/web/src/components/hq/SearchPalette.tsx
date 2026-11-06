"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { formatNumber, formatRank, type Locale } from "@/lib/format";
import { playerSlug, splitName } from "@/lib/players";
import type { SearchResult } from "@/lib/types";
import { LeagueBadge } from "./LeagueBadge";

type State = { status: "idle" } | { status: "loading" } | { status: "done"; q: string; results: SearchResult[] } | { status: "error"; limited: boolean };

export function useSearch(q: string): State {
  const [state, setState] = useState<State>({ status: "idle" });
  const latest = useRef(0);
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setState({ status: "idle" });
      return;
    }
    const id = ++latest.current;
    setState((s) => (s.status === "done" ? s : { status: "loading" }));
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (id !== latest.current) return;
        if (!res.ok) return setState({ status: "error", limited: res.status === 429 });
        const body = (await res.json()) as { results: SearchResult[] };
        if (id === latest.current) setState({ status: "done", q: query, results: body.results });
      } catch {
        if (id === latest.current) setState({ status: "error", limited: false });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [q]);
  return state;
}

/** Palette ⌘K : joueurs groupés, anciens pseudos signalés, tolérante aux fautes (pg_trgm). */
export function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("search");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [q, setQ] = useState("");
  const state = useSearch(q);
  const [selected, setSelected] = useState("");
  // Nouveaux résultats : le premier joueur est présélectionné (Entrée ouvre son profil).
  useEffect(() => {
    if (state.status === "done") setSelected(state.results[0]?.playerId ?? "__all");
  }, [state]);
  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-overlay bg-black/60" />
        <Dialog.Content className="fixed inset-x-0 top-0 z-modal mx-auto w-full max-w-xl p-2 sm:top-[12vh]" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">{t("palette")}</Dialog.Title>
          <Command shouldFilter={false} value={selected} onValueChange={setSelected} label={t("palette")} className="overflow-hidden rounded-lg border border-border-strong bg-surface shadow-elevation-2">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-text-3" strokeWidth={1.75} />
              <Command.Input value={q} onValueChange={setQ} placeholder={t("placeholder")} className="h-12 w-full bg-transparent text-body outline-none placeholder:text-text-3" autoFocus />
              <Dialog.Close className="rounded-sm border border-border px-1.5 text-[11px] text-text-2" aria-label={tc("close")}>
                Esc
              </Dialog.Close>
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-1">
              {state.status === "idle" && <p className="px-3 py-4 text-body-sm text-text-2">{t("hint")}</p>}
              {state.status === "loading" && <Command.Loading><p className="px-3 py-4 text-body-sm text-text-2">{t("loading")}</p></Command.Loading>}
              {state.status === "error" && <p role="alert" className="px-3 py-4 text-body-sm text-negative-ink">{state.limited ? t("rateLimited") : t("error")}</p>}
              {state.status === "done" && state.results.length === 0 && (
                <div className="px-3 py-4 text-body-sm">
                  <p>{t("none", { q: state.q })}</p>
                  <p className="mt-1 text-text-2">{t("noneHint")}</p>
                </div>
              )}
              {state.status === "done" && state.results.length > 0 && (
                <Command.Group heading={tc("players", { count: state.results.length })} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-text-2">
                  {state.results.map((r) => {
                    const n = splitName(r.name);
                    return (
                      <Command.Item key={r.playerId} value={r.playerId} onSelect={() => go(`/players/${playerSlug(r.name)}`)} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-2 data-[selected=true]:bg-surface-raised">
                        <LeagueBadge leagueNumber={r.league} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {n.base}
                            {n.tag && <span className="text-text-2">{n.tag}</span>}
                          </span>
                          {r.formerName && <span className="block truncate text-body-sm text-text-2">{t("former", { name: r.formerName })}</span>}
                        </span>
                        <span className="shrink-0 text-right text-body-sm tnum">
                          {r.rank !== null ? (
                            <>
                              <span className="block">{formatRank(r.rank, locale)}</span>
                              <span className="block text-text-2">{formatNumber(r.score ?? 0, locale)} RS</span>
                            </>
                          ) : (
                            <span className="text-text-2">{t("notRanked")}</span>
                          )}
                        </span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}
              {q.trim().length >= 2 && (
                <Command.Item value="__all" onSelect={() => go(`/search?q=${encodeURIComponent(q.trim())}`)} className="flex min-h-11 cursor-pointer items-center rounded-md px-3 text-body-sm text-accent-ink data-[selected=true]:bg-surface-raised">
                  {t("seeAll")} →
                </Command.Item>
              )}
            </Command.List>
            <p className="border-t border-border px-3 py-2 text-[11px] text-text-2">{t("paletteHint")}</p>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
