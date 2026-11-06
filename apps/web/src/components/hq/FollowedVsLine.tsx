"use client";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useFollowing } from "@/lib/following";
import { formatNumber, formatRank, type Locale } from "@/lib/format";
import { playerSlug, splitName } from "@/lib/players";
import type { FollowedRow } from "@/lib/types";
import { LeagueBadge } from "./LeagueBadge";
import { Skeleton } from "./States";

/** Joueurs suivis face à la ligne : écart au RS du 500e (la liste reste dans le navigateur, rien n'est envoyé d'autre que les ids). */
export function FollowedVsLine({ rank500 }: { rank500: number }) {
  const t = useTranslations("top500");
  const locale = useLocale() as Locale;
  const list = useFollowing();
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState<FollowedRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const ids = list.map((p) => p.id).sort().join(",");
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!ids) return;
    let cancelled = false;
    fetch(`/api/following?ids=${ids}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { players: FollowedRow[] }) => !cancelled && setRows(d.players))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [ids]);

  if (!mounted) return <Skeleton className="h-24" />;
  if (list.length === 0) return <p className="text-body-sm text-text-2">{t("followedEmpty")}</p>;
  if (failed) return <p role="alert" className="text-body-sm text-negative-ink">{t("followedError")}</p>;
  if (!rows) return <Skeleton className="h-24" />;
  const sorted = [...rows].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity)).slice(0, 10);
  return (
    <ul className="divide-y divide-border">
      {sorted.map((r) => {
        const n = splitName(r.name);
        const gap = r.score === null ? null : rank500 - r.score;
        return (
          <li key={r.id}>
            <Link href={`/players/${playerSlug(r.name)}`} className="flex min-h-11 items-center gap-2 py-1.5 hover:underline">
              <LeagueBadge leagueNumber={r.league} />
              <span className="min-w-0 flex-1 truncate font-medium">
                {n.base}
                {n.tag && <span className="text-text-2">{n.tag}</span>}
              </span>
              <span className="text-right text-body-sm tnum text-text-2">{r.rank ? formatRank(r.rank, locale) : t("notInTop")}</span>
              <span className="w-28 text-right text-body-sm font-semibold tnum">
                {gap === null ? "—" : gap <= 0 ? t("inside") : t("gap", { value: formatNumber(gap, locale) })}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
