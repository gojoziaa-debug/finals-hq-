"use client";
import { Download, Star, Upload, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { exportFollowing, importFollowing, refreshNames, removeFollow, useFollowing } from "@/lib/following";
import { formatNumber, formatRank, type Locale } from "@/lib/format";
import { playerSlug, splitName } from "@/lib/players";
import type { FollowedRow } from "@/lib/types";
import { buttonClasses } from "./Button";
import { DeltaChip } from "./DeltaChip";
import { LeagueBadge } from "./LeagueBadge";
import { Skeleton } from "./States";
import { cn } from "@/lib/cn";

type Load = { state: "idle" | "loading" | "error" } | { state: "ok"; rows: Map<string, FollowedRow> };

/**
 * Tableau compact des joueurs suivis (rang, RS, variation 24 h), trié par rang. Export et import d'un fichier JSON
 * pour passer d'un appareil à l'autre ; la liste reste « stockée dans ton navigateur ».
 */
export function FollowingList() {
  const t = useTranslations("following");
  const locale = useLocale() as Locale;
  const list = useFollowing();
  const [load, setLoad] = useState<Load>({ state: "idle" });
  const [mounted, setMounted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const ids = list.map((p) => p.id).sort().join(",");

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!ids) return;
    let cancelled = false;
    setLoad((l) => (l.state === "ok" ? l : { state: "loading" }));
    fetch(`/api/following?ids=${ids}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { players: FollowedRow[] }) => {
        if (cancelled) return;
        const rows = new Map(data.players.map((p) => [p.id, p]));
        setLoad({ state: "ok", rows });
        refreshNames(new Map(data.players.map((p) => [p.id, p.name])));
      })
      .catch(() => !cancelled && setLoad({ state: "error" }));
    return () => {
      cancelled = true;
    };
  }, [ids]);

  const download = () => {
    const blob = new Blob([exportFollowing()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "finals-hq-suivi.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    const added = importFollowing(await f.text());
    setNotice(added === null ? t("importError") : t("imported", { count: added }));
    if (file.current) file.current.value = "";
  };

  const tools = (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={download} disabled={list.length === 0} className={cn(buttonClasses.base, buttonClasses.secondary)}>
        <Download aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
        {t("export")}
      </button>
      <label className={cn(buttonClasses.base, buttonClasses.secondary, "cursor-pointer")}>
        <Upload aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
        {t("import")}
        <input ref={file} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      {notice && (
        <p role="status" className="self-center text-body-sm text-text-2">
          {notice}
        </p>
      )}
    </div>
  );

  if (!mounted) return <Skeleton className="h-40" />;
  if (list.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface px-6 py-10 text-center">
          <Star aria-hidden="true" className="h-6 w-6 text-text-3" strokeWidth={1.75} />
          <p className="text-title">{t("empty")}</p>
          <p className="max-w-prose text-body-sm text-text-2">{t("emptyHint")}</p>
          <Link href="/search" className={cn(buttonClasses.base, buttonClasses.primary, "mt-2")}>
            {t("findPlayer")}
          </Link>
        </div>
        {tools}
      </>
    );
  }

  const rows = list
    .map((p) => ({ p, row: load.state === "ok" ? load.rows.get(p.id) : undefined }))
    .sort((a, b) => (a.row?.rank ?? Infinity) - (b.row?.rank ?? Infinity) || a.p.name.localeCompare(b.p.name));
  return (
    <>
      {load.state === "error" && <p role="alert" className="text-body-sm text-negative-ink">{t("loadError")}</p>}
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-body-sm">
          <caption className="sr-only">{t("title")}</caption>
          <thead className="border-b border-border text-caption uppercase text-text-2">
            <tr>
              <th scope="col" className="w-20 px-3 py-2 text-left font-medium">#</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">{t("colPlayer")}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">RS</th>
              <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">24 h</th>
              <th scope="col" className="w-12 px-1 py-2"><span className="sr-only">{t("remove")}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ p, row }) => {
              const name = row?.name ?? p.name;
              const n = splitName(name);
              const missing = load.state === "ok" && !row;
              return (
                <tr key={p.id} className="hover:bg-surface-raised">
                  <td className="px-3 py-2 tnum">{load.state === "loading" || load.state === "idle" ? <Skeleton className="h-4 w-12" /> : row?.rank ? formatRank(row.rank, locale) : "—"}</td>
                  <td className="px-3 py-2">
                    <Link href={`/players/${playerSlug(name)}`} className="flex min-h-8 items-center gap-2 font-medium hover:underline">
                      <span className="min-w-0 truncate">
                        {n.base}
                        {n.tag && <span className="text-text-2">{n.tag}</span>}
                      </span>
                      {row?.league != null && <LeagueBadge leagueNumber={row.league} />}
                    </Link>
                    {(missing || (row && row.rank === null)) && <p className="text-[12px] text-text-2">{missing ? t("gone") : t("notInTop")}</p>}
                  </td>
                  <td className="px-3 py-2 text-right tnum">{row?.score != null ? formatNumber(row.score, locale) : "—"}</td>
                  <td className="hidden px-3 py-2 text-right sm:table-cell">{row?.rank ? <DeltaChip value={row.d24} /> : null}</td>
                  <td className="px-1 py-1 text-right">
                    <button type="button" onClick={() => removeFollow(p.id)} className="inline-flex h-11 w-11 items-center justify-center rounded-md text-text-2 hover:bg-surface-raised hover:text-text" aria-label={t("removeName", { name })}>
                      <X aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-text-2">{t("stored", { count: list.length })}</p>
      {tools}
    </>
  );
}
