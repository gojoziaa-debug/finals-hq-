"use client";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDateTime, formatNumber, type Locale } from "@/lib/format";
import { seriesInRange, type ChartRange } from "@/lib/profile";
import type { ProfilePoint } from "@/lib/types";
import { loadECharts, reducedMotion, token, type EChartsInstance } from "./echarts";

/** Couleurs des joueurs comparés, dans l'ordre des colonnes (mêmes tokens que les pastilles de la grille). */
export const COMPARE_COLORS = ["accent-ink", "info-ink", "league-ruby-ink", "league-gold-ink"] as const;
const RANGES: ChartRange[] = ["24h", "7d", "season"];

/** Courbes RS superposées des joueurs comparés (marches, trous jamais interpolés), légende = noms. */
export function CompareChart({ players, renderedAt }: { players: Array<{ name: string; series: ProfilePoint[]; color: number }>; renderedAt: string }) {
  const t = useTranslations("compare");
  const tp = useTranslations("profile");
  const locale = useLocale() as Locale;
  const [range, setRange] = useState<ChartRange>("season");
  const [ready, setReady] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<EChartsInstance | null>(null);
  const now = useMemo(() => Date.parse(renderedAt), [renderedAt]);
  const lines = useMemo(() => players.map((p) => ({ name: p.name, color: p.color, points: seriesInRange(p.series, range, now).filter((x) => x.score !== null) })), [players, range, now]);
  const enough = lines.filter((l) => l.points.length >= 2).length >= 1;

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
        const text2 = token("text-2");
        const grid = token("border");
        c.setOption(
          {
            animation: !reducedMotion(),
            animationDuration: 500,
            grid: { left: 8, right: 12, top: 36, bottom: 8, containLabel: true },
            textStyle: { fontFamily: "var(--font-sans), system-ui, sans-serif" },
            legend: { top: 0, left: 0, textStyle: { color: token("text"), fontSize: 12 }, icon: "roundRect", itemWidth: 12, itemHeight: 4 },
            xAxis: { type: "time", axisLine: { lineStyle: { color: grid } }, axisLabel: { color: text2, hideOverlap: true, fontSize: 11 }, splitLine: { show: false } },
            yAxis: { type: "value", scale: true, minInterval: 1, axisLabel: { color: text2, fontSize: 11, formatter: (v: number) => formatNumber(v, locale) }, splitLine: { lineStyle: { color: grid, type: "dashed" } } },
            tooltip: {
              trigger: "axis",
              triggerOn: "mousemove|click",
              confine: true,
              backgroundColor: token("surface-raised"),
              borderColor: token("border-strong"),
              textStyle: { color: token("text"), fontSize: 12 },
              valueFormatter: (v: number) => `${formatNumber(v, locale)} RS`,
              axisPointer: { label: { formatter: (p: { value: number }) => formatDateTime(new Date(p.value), locale) } },
            },
            series: lines.map((l) => {
              const color = token(COMPARE_COLORS[l.color] ?? "text-2");
              return { type: "line", name: l.name, step: "end", data: l.points.map((p) => [Date.parse(p.t), p.score]), showSymbol: l.points.length <= 2, symbolSize: 5, lineStyle: { color, width: 2 }, itemStyle: { color } };
            }),
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
  }, [enough, lines, locale]);

  useEffect(() => () => chart.current?.dispose(), []);
  useEffect(() => {
    if (!enough && chart.current) {
      chart.current.dispose();
      chart.current = null;
      setReady(false);
    }
  }, [enough]);

  return (
    <section aria-labelledby="compare-chart" className="rounded-lg border border-border bg-surface p-4">
      <h2 id="compare-chart" className="text-title">{t("chartTitle")}</h2>
      <div role="group" aria-label={tp("rangeLabel")} className="mt-2 inline-flex rounded-md border border-border p-0.5">
        {RANGES.map((r) => (
          <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)} className={cn("h-9 min-w-11 rounded-[6px] px-2.5 text-body-sm font-medium", range === r ? "bg-surface-raised text-text" : "text-text-2 hover:text-text")}>
            {tp(`range.${r}`)}
          </button>
        ))}
      </div>
      {enough ? (
        <div ref={box} role="img" aria-label={t("chartTitle")} className={cn("mt-3 h-[260px] w-full lg:h-[340px]", !ready && "animate-pulse rounded-md bg-surface-raised")} />
      ) : (
        <div className="mt-3 flex h-[200px] items-center justify-center rounded-md border border-dashed border-border px-6 text-center text-body-sm text-text-2">{t("chartEmpty")}</div>
      )}
    </section>
  );
}
