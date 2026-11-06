"use client";
import { Copy } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadECharts, token } from "@/components/charts/echarts";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatNumber, formatRank, formatSigned, type Locale } from "@/lib/format";
import { league as leagueOf } from "@/lib/league";
import { peak, scoredCount, seriesInRange, top500Entry, type ChartRange } from "@/lib/profile";
import type { ProfilePoint } from "@/lib/types";

type Metric = "rs" | "rank";
const RANGES: ChartRange[] = ["24h", "7d", "30d", "season"];

/**
 * Courbe RS (ou rang, axe inversé) du classement ranked en cours. Marches : le RS ne bouge qu'à un match,
 * la valeur tient jusqu'au relevé suivant. Annotations : pic, entrée dans le top 500, ligne top 500.
 * Moins de 2 points dans la fenêtre : un cadre qui dit depuis quand l'historique se construit, jamais d'axes vides.
 */
export function RsChart({ series, top500, historyStart, renderedAt, playerName }: { series: ProfilePoint[]; top500: number | null; historyStart: string | null; renderedAt: string; playerName: string }) {
  const t = useTranslations("profile");
  const locale = useLocale() as Locale;
  const [range, setRange] = useState<ChartRange>("7d");
  const [metric, setMetric] = useState<Metric>("rs");
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<ReturnType<(typeof import("echarts/core"))["init"]> | null>(null);
  const firstDraw = useRef(true);
  const now = useMemo(() => Date.parse(renderedAt), [renderedAt]);
  const points = useMemo(() => seriesInRange(series, range, now), [series, range, now]);
  const enough = scoredCount(points) >= 2;

  const scored = points.filter((p) => p.score !== null);
  const first = scored[0];
  const last = scored[scored.length - 1];
  const windowStart = range === "season" ? null : now - { "24h": 1, "7d": 7, "30d": 30 }[range] * 86_400_000;
  const startsLate = !first || windowStart === null || Date.parse(first.t) > windowStart + 60_000;
  const delta = metric === "rs" ? (first && last ? last.score! - first.score! : null) : first?.rank && last?.rank ? last.rank - first.rank : null;

  let title: string;
  if (!enough || delta === null) title = t("chartBuilding", { date: historyStart ? formatDate(new Date(`${historyStart}T00:00:00Z`), locale) : "—" });
  else {
    const when = startsLate || range === "season" ? t("since", { date: formatDate(new Date(first!.t), locale) }) : t(`window.${range}`);
    if (metric === "rs") title = delta === 0 ? t("chartFlat", { when }) : t("chartRs", { delta: formatSigned(delta, locale), when });
    else title = delta === 0 ? t("chartRankFlat", { when }) : t(delta < 0 ? "chartRankUp" : "chartRankDown", { places: formatNumber(Math.abs(delta), locale), when });
  }

  useEffect(() => {
    if (!enough || !box.current) return;
    let disposed = false;
    let observer: MutationObserver | null = null;
    let resize: ResizeObserver | null = null;
    loadECharts().then((echarts) => {
      if (disposed || !box.current) return;
      chart.current ??= echarts.init(box.current, undefined, { renderer: "canvas" });
      const draw = () => {
        const c = chart.current;
        if (!c) return;
        const line = token("accent-ink");
        const text2 = token("text-2");
        const grid = token("border");
        const data = points.map((p) => [Date.parse(p.t), metric === "rs" ? p.score : p.rank]);
        const pk = metric === "rs" ? peak(points) : null;
        const entry = top500Entry(points);
        const marks: Array<{ coord: [number, number]; name: string }> = [];
        if (pk && pk.score !== null && pk !== last) marks.push({ coord: [Date.parse(pk.t), pk.score], name: t("annotPeak") });
        if (entry) marks.push({ coord: [Date.parse(entry.t), (metric === "rs" ? entry.score : entry.rank)!], name: t("annotTop500") });
        const refValue = metric === "rs" ? top500 : 500;
        c.setOption(
          {
            animation: firstDraw.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
            animationDuration: 600,
            grid: { left: 8, right: 12, top: 16, bottom: 8, containLabel: true },
            textStyle: { fontFamily: "var(--font-sans), system-ui, sans-serif" },
            xAxis: {
              type: "time",
              axisLine: { lineStyle: { color: grid } },
              axisLabel: { color: text2, hideOverlap: true, fontSize: 11 },
              splitLine: { show: false },
            },
            yAxis: {
              type: "value",
              scale: true,
              inverse: metric === "rank",
              minInterval: 1,
              axisLabel: { color: text2, fontSize: 11, formatter: (v: number) => formatNumber(v, locale) },
              splitLine: { lineStyle: { color: grid, type: "dashed" } },
            },
            tooltip: {
              trigger: "axis",
              triggerOn: "mousemove|click",
              confine: true,
              backgroundColor: token("surface-raised"),
              borderColor: token("border-strong"),
              textStyle: { color: token("text"), fontSize: 12 },
              formatter: (params: Array<{ dataIndex: number }>) => {
                const i = params[0]?.dataIndex ?? 0;
                const p = points[i];
                if (!p || p.score === null) return t("absent");
                let prev: ProfilePoint | undefined;
                for (let j = i - 1; j >= 0; j--) if (points[j]!.score !== null) { prev = points[j]; break; }
                const lg = leagueOf(p.league);
                const lines = [
                  `<b>${formatDateTime(new Date(p.t), locale, Intl.DateTimeFormat().resolvedOptions().timeZone)}</b>`,
                  `${formatNumber(p.score, locale)} RS${prev?.score != null && prev.score !== p.score ? ` (${formatSigned(p.score - prev.score, locale)})` : ""}`,
                  p.rank ? formatRank(p.rank, locale) : "",
                  lg ? lg.name : "",
                  p.kind === "close" ? `<span style="color:${text2}">${t("closeNote")}</span>` : "",
                ];
                return lines.filter(Boolean).join("<br/>");
              },
            },
            series: [
              {
                type: "line",
                step: "end",
                data,
                connectNulls: false,
                showSymbol: data.length <= 2,
                symbolSize: 6,
                lineStyle: { color: line, width: 2 },
                itemStyle: { color: line },
                areaStyle: metric === "rs" ? { color: token("accent-ink", 0.08) } : undefined,
                markPoint: {
                  symbol: "circle",
                  symbolSize: 8,
                  itemStyle: { color: line, borderColor: token("surface"), borderWidth: 2 },
                  label: { show: true, position: "top", color: text2, fontSize: 11, formatter: "{b}" },
                  data: marks.slice(0, 3),
                },
                markLine: refValue
                  ? {
                      silent: true,
                      symbol: "none",
                      lineStyle: { color: token("text-3"), type: "dashed", width: 1 },
                      label: { color: text2, fontSize: 11, position: "insideEndTop", formatter: metric === "rs" ? t("top500Line", { value: formatNumber(refValue, locale) }) : t("top500Rank") },
                      data: [{ yAxis: refValue }],
                    }
                  : undefined,
              },
            ],
          },
          { notMerge: true },
        );
        firstDraw.current = false;
      };
      draw();
      setReady(true);
      observer = new MutationObserver(draw); // changement de thème : mêmes données, autres couleurs
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      resize = new ResizeObserver(() => chart.current?.resize());
      resize.observe(box.current);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      resize?.disconnect();
    };
  }, [enough, points, metric, top500, locale, t, last]);

  useEffect(() => () => chart.current?.dispose(), []);
  useEffect(() => {
    if (!enough && chart.current) {
      chart.current.dispose();
      chart.current = null;
      setReady(false);
    }
  }, [enough]);

  /** PNG avec le cachet HQ et la ligne de source, copié dans le presse-papiers (téléchargé sinon). */
  const copyImage = async () => {
    const c = chart.current;
    if (!c) return;
    c.setOption({
      graphic: [
        { type: "text", right: 12, bottom: 4, style: { text: `FINALS HQ · ${playerName} · ${t("source")}`, fill: token("text-2"), fontSize: 11 } },
      ],
      grid: { bottom: 24 },
    });
    const url = c.getDataURL({ pixelRatio: 2, backgroundColor: token("surface") });
    c.setOption({ graphic: [], grid: { bottom: 8 } }, { replaceMerge: ["graphic"] });
    try {
      const blob = await (await fetch(url)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied("ok");
    } catch {
      const a = document.createElement("a");
      a.href = url;
      a.download = `finals-hq-${playerName.replace(/[^\w-]+/g, "-")}.png`;
      a.click();
      setCopied("fail");
    }
    setTimeout(() => setCopied(null), 2500);
  };

  const tableRows = scored.slice(-20);
  return (
    <section aria-labelledby="chart-title" className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="chart-title" className="text-title tnum">
          {title}
        </h2>
        {enough && (
          <button type="button" onClick={copyImage} disabled={!ready} className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-body-sm text-text-2 hover:bg-surface-raised hover:text-text disabled:opacity-50">
            <Copy aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            <span aria-live="polite">{copied === "ok" ? t("copied") : copied === "fail" ? t("downloaded") : t("copyImage")}</span>
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t("rangeLabel")} className="inline-flex rounded-md border border-border p-0.5">
          {RANGES.map((r) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)} className={cn("h-9 min-w-11 rounded-[6px] px-2.5 text-body-sm font-medium", range === r ? "bg-surface-raised text-text" : "text-text-2 hover:text-text")}>
              {t(`range.${r}`)}
            </button>
          ))}
        </div>
        <div role="group" aria-label={t("metricLabel")} className="inline-flex rounded-md border border-border p-0.5">
          {(["rs", "rank"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={metric === m} onClick={() => setMetric(m)} className={cn("h-9 min-w-11 rounded-[6px] px-2.5 text-body-sm font-medium", metric === m ? "bg-surface-raised text-text" : "text-text-2 hover:text-text")}>
              {t(`metric.${m}`)}
            </button>
          ))}
        </div>
      </div>
      {enough ? (
        <>
          <div ref={box} role="img" aria-label={title} className={cn("mt-3 h-[240px] w-full lg:h-[320px]", !ready && "animate-pulse rounded-md bg-surface-raised")} />
          <table className="sr-only">
            <caption>{t("tableCaption")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("colTime")}</th>
                <th scope="col">RS</th>
                <th scope="col">{t("colRank")}</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((p) => (
                <tr key={p.t}>
                  <td>{formatDateTime(new Date(p.t), locale, "UTC")}</td>
                  <td>{formatNumber(p.score!, locale)}</td>
                  <td>{p.rank ? formatRank(p.rank, locale) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <div className="mt-3 flex h-[240px] items-center justify-center rounded-md border border-dashed border-border px-6 text-center text-body-sm text-text-2 lg:h-[320px]">
          {t("chartEmpty", { date: historyStart ? formatDate(new Date(`${historyStart}T00:00:00Z`), locale) : "—" })}
        </div>
      )}
    </section>
  );
}
