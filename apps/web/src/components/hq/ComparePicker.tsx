"use client";
import { Plus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { compareHref, COMPARE_MAX } from "@/lib/compare";
import { cn } from "@/lib/cn";
import { formatRank, type Locale } from "@/lib/format";
import { playerSlug, splitName } from "@/lib/players";
import { COMPARE_COLORS } from "@/components/charts/CompareChart";
import { LeagueBadge } from "./LeagueBadge";
import { useSearch } from "@/lib/use-search";

const DOT: Record<(typeof COMPARE_COLORS)[number], string> = {
  "accent-ink": "bg-accent-ink",
  "info-ink": "bg-info-ink",
  "league-ruby-ink": "bg-league-ruby-ink",
  "league-gold-ink": "bg-league-gold-ink",
};

export function CompareDot({ index }: { index: number }) {
  const c = COMPARE_COLORS[index];
  return <span aria-hidden="true" className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", c ? DOT[c] : "bg-text-3")} />;
}

/** Joueurs de la comparaison : une puce par joueur (retirer), un champ pour en ajouter (même recherche que ⌘K). L'URL porte tout. */
export function ComparePicker({ slugs, names }: { slugs: string[]; names: string[] }) {
  const t = useTranslations("compare");
  const ts = useTranslations("search");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [q, setQ] = useState("");
  const state = useSearch(q);
  const full = slugs.length >= COMPARE_MAX;
  const open = state.status === "done" && q.trim().length >= 2;
  const add = (name: string) => {
    const slug = decodeURIComponent(playerSlug(name));
    if (slugs.some((s) => s.toLowerCase() === slug.toLowerCase())) return;
    setQ("");
    router.push(compareHref([...slugs, slug]));
  };
  return (
    <div className="grid grid-cols-1 gap-3">
      <ul className="flex flex-wrap gap-2" aria-label={t("players")}>
        {slugs.map((s, i) => (
          <li key={s} className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-surface pl-3 pr-1 text-body-sm font-medium">
            <CompareDot index={i} />
            <span className="max-w-[12rem] truncate">{names[i] ?? s}</span>
            <Link href={compareHref(slugs.filter((x) => x !== s))} aria-label={t("remove", { name: names[i] ?? s })} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-2 hover:bg-surface-raised hover:text-text">
              <X aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            </Link>
          </li>
        ))}
      </ul>
      {full ? (
        <p className="text-body-sm text-text-2">{t("full", { max: COMPARE_MAX })}</p>
      ) : (
        <div className="relative max-w-md">
          <label className="grid gap-1">
            <span className="text-caption uppercase text-text-2">{t("add")}</span>
            <span className="flex h-11 items-center gap-2 rounded-md border border-border-strong bg-surface px-3">
              <Plus aria-hidden="true" className="h-4 w-4 text-text-3" strokeWidth={1.75} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ts("placeholder")} maxLength={40} className="w-full bg-transparent text-body outline-none placeholder:text-text-3" aria-autocomplete="list" aria-controls={open ? "compare-results" : undefined} aria-expanded={open} role="combobox" />
            </span>
          </label>
          {open && state.status === "done" && (
            <ul id="compare-results" role="listbox" aria-label={ts("results", { count: state.results.length, q: state.q })} className="absolute inset-x-0 top-full z-dropdown mt-1 max-h-72 overflow-y-auto rounded-md border border-border-strong bg-surface p-1 shadow-elevation-2">
              {state.results.length === 0 && <li className="px-3 py-2 text-body-sm text-text-2">{ts("none", { q: state.q })}</li>}
              {state.results.map((r) => {
                const n = splitName(r.name);
                return (
                  <li key={r.playerId} role="option" aria-selected="false">
                    <button type="button" onClick={() => add(r.name)} className="flex min-h-11 w-full items-center gap-2 rounded-sm px-2 text-left hover:bg-surface-raised">
                      <LeagueBadge leagueNumber={r.league} />
                      <span className="min-w-0 flex-1 truncate">
                        {n.base}
                        {n.tag && <span className="text-text-2">{n.tag}</span>}
                      </span>
                      <span className="text-body-sm tnum text-text-2">{r.rank ? formatRank(r.rank, locale) : ts("notRanked")}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {state.status === "error" && <p role="alert" className="mt-1 text-body-sm text-negative-ink">{state.limited ? ts("rateLimited") : ts("error")}</p>}
        </div>
      )}
    </div>
  );
}
