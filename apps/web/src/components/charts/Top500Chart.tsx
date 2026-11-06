"use client";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { DAY_MS, type CutoffPoint, type Projection } from "@/lib/cutoff";
import { formatDate, formatDateTime, formatNumber, type Locale } from "@/lib/format";
import { loadECharts, reducedMotion, token, type EChartsInstance } from "./echarts";

type Range = "24h" | "7d" | "season";
const RANGES: Range[] = ["24h", "7d", "season"];

/**
 * Courbe du RS du 500e : marches (la valeur tient jusqu'au relevé suivant), droite ajustée des 7 derniers jours
 * et bande de projection (league-ruby à 12 %, trait médian pointillé) quand elle est disponible.
 * Moins de 2 points : un cadre qui dit depuis quand la courbe se construit.
 */
export function Top500Chart({ series, projection, renderedAt, historyStart }: { series: CutoffPoint[]; projection: Projection; renderedAt: string; historyStart: string | null }) {
  const t = useTranslations("top500");
  const locale = useLocale() as Locale;
  const [range, setRange] = useState<Range>(projection.available ? "7d" : "season");
  const [ready, setReady] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<EChartsInstance | null>(null);
  const now = useMemo(() => Date.parse(renderedAt), [renderedAt]);
  const points = useMemo(() => {
    if (range === "season") return series;
    const from = now - (range === "24h" ? 1 : 7) * DAY_MS;
    return series.filter((p) => Date.parse(p.t) >= from);
  }, [series, range, now]);
  const enough = points.length >= 2;
  const showProjection = projection.available && range !== "24h";

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
        const line = token("league-ruby-ink");
        const text2 = token("text-2");
        const grid = token("border");
        const data = points.map((p) => [Date.parse(p.t), p.score]);
        const extra: unknown[] = [];
        if (showProjection && projection.available) {
          const last = points[points.length - 1]!;
          const base = [[Date.parse(last.t), last.score]];
          const band = projection.points.map((p) => [Date.parse(p.t), p.low, p.high - p.low]);
          extra.push(
            { type: "line", data: [[Date.parse(projection.fit.from.t), projection.fit.from.value], [Date.parse(projection.fit.to.t), projection.fit.to.value]], symbol: "none", lineStyle: { color: token("text-3"), width: 1, type: "dotted" }, silent: true, tooltip: { show: false } },
            { type: "line", data: [...base, ...band.map((b) => [b[0], b[1]])], stack: "band", symbol: "none", lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false } },
            { type: "line", data: [[Date.parse(last.t), 0], ...band.map((b) => [b[0], b[2]])], stack: "band", symbol: "none", lineStyle: { opacity: 0 }, areaStyle: { color: token("league-ruby", 0.12) }, silent: true, tooltip: { show: false } },
            { type: "line", data: [...base, ...projection.points.map((p) => [Date.parse(p.t), p.mid])], symbol: "circle", symbolSize: 5, lineStyle: { color: line, width: 1.5, type: "dashed" }, itemStyle: { color: line }, silent: true, tooltip: { show: false } },
          );
        }
        c.setOption(
          {
            animation: !reducedMotion(),
            animationDuration: 500,
            grid: { left: 8, right: 12, top: 16, bottom: 8, containLabel: true },
            textStyle: { fontFamily: "var(--font-sans), system-ui, sans-serif" },
            xAxis: { type: "time", axisLine: { lineStyle: { color: grid } }, axisLabel: { color: text2, hideOverlap: true, fontSize: 11 }, splitLine: { show: false } },
            yAxis: { type: "value", scale: true, minInterval: 1, axisLabel: { color: text2, fontSize: 11, formatter: (v: number) => formatNumber(v, locale) }, splitLine: { lineStyle: { color: grid, type: "dashed" } } },
            tooltip: {
              trigger: "axis",
              triggerOn: "mousemove|click",
              confine: true,
              backgroundColor: token("surface-raised"),
              borderColor: token("border-strong"),
              textStyle: { color: token("text"), fontSize: 12 },
              formatter: (params: Array<{ seriesIndex: number; dataIndex: number }>) => {
                const hit = params.find((p) => p.seriesIndex === 0);
                const p = hit ? points[hit.dataIndex] : undefined;
                if (!p) return "";
                return `<b>${formatDateTime(new Date(p.t), locale, Intl.DateTimeFormat().resolvedOptions().timeZone)}</b><br/>${t("tooltip", { value: formatNumber(p.score, locale) })}`;
              },
            },
            series: [
              { type: "line", step: "end", data, showSymbol: data.length <= 2, symbolSize: 6, lineStyle: { color: line, width: 2 }, itemStyle: { color: line }, areaStyle: { color: token("league-ruby", 0.06) } },
              ...extra,
            ],
          },
          { notMerge: true },
        );
      };
      draw();
      setReady(true);
      observer = new MutationObserver(draw);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      resize = new ResizeObserver(() => chart.current?.resize());
      resize.observe(box.current);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      resize?.disconnect();
    };
  }, [enough, points, showProjection, projection, locale, t]);

  useEffect(() => () => chart.current?.dispose(), []);
  useEffect(() => {
    if (!enough && chart.current) {
      chart.current.dispose();
      chart.current = null;
      setReady(false);
    }
  }, [enough]);

  const first = points[0];
  const last = points[points.length - 1];
  const delta = first && last ? last.score - first.score : null;
  const startLabel = historyStart ? formatDate(new Date(`${historyStart}T00:00:00Z`), locale) : "—";
  const title = !enough || delta === null ? t("chartBuilding", { date: startLabel }) : t("chartTitle", { delta: (delta >= 0 ? "+" : "") + formatNumber(delta, locale), since: formatDate(new Date(first!.t), locale) });

  return (
    <section aria-labelledby="cutoff-chart" className="rounded-lg border border-border bg-surface p-4">
      <h2 id="cutoff-chart" className="text-title tnum">{title}</h2>
      <div role="group" aria-label={t("rangeLabel")} className="mt-2 inline-flex rounded-md border border-border p-0.5">
        {RANGES.map((r) => (
          <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)} className={cn("h-9 min-w-11 rounded-[6px] px-2.5 text-body-sm font-medium", range === r ? "bg-surface-raised text-text" : "text-text-2 hover:text-text")}>
            {t(`range.${r}`)}
          </button>
        ))}
      </div>
      {enough ? (
        <>
          <div ref={box} role="img" aria-label={title} className={cn("mt-3 h-[240px] w-full lg:h-[320px]", !ready && "animate-pulse rounded-md bg-surface-raised")} />
          {showProjection && <p className="mt-2 text-[12px] text-text-2">{t("legend")}</p>}
          <table className="sr-only">
            <caption>{t("tableCaption")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("colTime")}</th>
                <th scope="col">RS</th>
              </tr>
            </thead>
            <tbody>
              {points.slice(-24).map((p) => (
                <tr key={p.t}>
                  <td>{formatDateTime(new Date(p.t), locale, "UTC")}</td>
                  <td>{formatNumber(p.score, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <div className="mt-3 flex h-[240px] items-center justify-center rounded-md border border-dashed border-border px-6 text-center text-body-sm text-text-2 lg:h-[320px]">{t("chartEmpty", { date: startLabel })}</div>
      )}
    </section>
  );
}
