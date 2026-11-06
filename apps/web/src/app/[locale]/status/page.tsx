import { leaderboardById } from "@finals-hq/db/catalog";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { InfoChip } from "@/components/hq/InfoChip";
import { RelativeTime } from "@/components/hq/RelativeTime";
import { ErrorState } from "@/components/hq/States";
import { Link } from "@/i18n/navigation";
import { boardPath, boardShortName } from "@/lib/boards";
import { cn } from "@/lib/cn";
import { getStatus } from "@/lib/data";
import { DataUnavailableError } from "@/lib/db";
import { formatBytes, formatNumber, freshness, type Locale } from "@/lib/format";
import type { StatusData } from "@/lib/types";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("statusTitle") };
}

/** Page vers laquelle pointe le FreshnessBanner : heure du dernier relevé par tableau, passages du worker, taille de la base. */
export default async function StatusPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("status");
  const te = await getTranslations("errors");
  const l = locale as Locale;
  let data: StatusData | null = null;
  try {
    data = await getStatus();
  } catch (error) {
    if (!(error instanceof DataUnavailableError)) throw error;
  }
  if (!data) return <ErrorState title={te("title")} body={te("body")} />;
  const now = new Date(data.generatedAt);
  const size = data.database.sizeBytes;
  const ratio = size !== null ? size / data.database.limitBytes : null;
  const kindLabel = (k: string | null) => (k === "full" ? t("full") : k === "delta" ? t("delta") : k === "archive" ? t("archive") : "—");
  return (
    <div className="grid grid-cols-1 gap-6">
      <div>
        <h1 className="font-display text-display-lg uppercase">{t("title")}</h1>
        <p className="mt-1 max-w-prose text-body-sm text-text-2">{t("intro")}</p>
      </div>

      <section aria-labelledby="boards" className="grid grid-cols-1 gap-2">
        <h2 id="boards" className="text-title-lg">{t("boards")}</h2>
        <div tabIndex={0} className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[520px] text-body-sm">
            <thead>
              <tr className="text-left text-caption uppercase text-text-2">
                <th scope="col" className="px-3 py-2">{t("board")}</th>
                <th scope="col" className="px-3 py-2">{t("lastSnapshot")}</th>
                <th scope="col" className="px-3 py-2">{t("kind")}</th>
                <th scope="col" className="px-3 py-2 text-right">{t("rows")}</th>
                <th scope="col" className="px-3 py-2 text-right">{t("rejected")}</th>
              </tr>
            </thead>
            <tbody>
              {data.boards.map((b) => {
                const lb = leaderboardById(b.id)!;
                const state = freshness(b.takenAt ? new Date(b.takenAt) : null, now);
                return (
                  <tr key={b.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <Link href={boardPath(lb)} className="font-medium hover:underline">{boardShortName(lb)}</Link>
                    </td>
                    <td className={cn("px-3 py-2", state === "stale" && "text-warning-ink", (state === "outdated" || state === "unknown") && "text-negative-ink")}>
                      {b.takenAt ? <RelativeTime iso={b.takenAt} now={data.generatedAt} /> : "—"}
                    </td>
                    <td className="px-3 py-2 text-text-2">{kindLabel(b.kind)}</td>
                    <td className="px-3 py-2 text-right tnum">{formatNumber(b.rows, l)}</td>
                    <td className={cn("px-3 py-2 text-right tnum", b.rejected24h > 0 && "text-negative-ink")}>{formatNumber(b.rejected24h, l)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="runs" className="grid grid-cols-1 gap-2">
        <h2 id="runs" className="text-title-lg">{t("runs")}</h2>
        <div tabIndex={0} className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[520px] text-body-sm">
            <thead>
              <tr className="text-left text-caption uppercase text-text-2">
                <th scope="col" className="px-3 py-2">{t("started")}</th>
                <th scope="col" className="px-3 py-2">{t("kind")}</th>
                <th scope="col" className="px-3 py-2 text-right">{t("duration")}</th>
                <th scope="col" className="px-3 py-2 text-right">{t("applied")}</th>
                <th scope="col" className="px-3 py-2">{t("result")}</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((r) => {
                const seconds = r.finishedAt ? Math.round((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000) : null;
                const ok = r.status === "ok" || r.status === "success";
                return (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="px-3 py-2"><RelativeTime iso={r.startedAt} now={data.generatedAt} /></td>
                    <td className="px-3 py-2 font-mono text-[13px]">{r.command}</td>
                    <td className="px-3 py-2 text-right tnum">{seconds === null ? "—" : `${formatNumber(seconds, l)} s`}</td>
                    <td className="px-3 py-2 text-right tnum">{formatNumber(r.applied, l)}{r.rejected > 0 && <span className="text-negative-ink"> / −{r.rejected}</span>}</td>
                    <td className="px-3 py-2">
                      <InfoChip tone={ok ? "neutral" : "warning"}>{ok ? t("ok") : r.status}</InfoChip>
                      {r.error && <p className="mt-1 max-w-xs break-words text-[12px] text-text-2">{r.error}</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="db" className="grid grid-cols-1 gap-2">
        <h2 id="db" className="text-title-lg">{t("database")}</h2>
        <div className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-surface p-4 text-body-sm">
          {size !== null && ratio !== null && (
            <>
              <p>{t("size", { size: formatBytes(size, l), limit: formatBytes(data.database.limitBytes, l) })}</p>
              <div className="h-2 overflow-hidden rounded-full bg-surface-raised" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} aria-label={t("database")}>
                <div className={cn("h-full rounded-full", ratio > 0.9 ? "bg-negative" : ratio > 0.8 ? "bg-warning" : "bg-positive")} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
              </div>
            </>
          )}
          <p className="text-text-2">{t("players", { count: formatNumber(data.database.players, l) })}</p>
          <p className="text-text-2">{t("archives", { imported: data.archives.imported, expected: data.archives.expected })}</p>
          <p className="text-text-2">{t("generated", { time: "" })}<RelativeTime iso={data.generatedAt} now={data.generatedAt} /></p>
        </div>
      </section>
    </div>
  );
}
