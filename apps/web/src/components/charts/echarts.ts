"use client";
/**
 * ECharts en import dynamique, partagé par toutes les courbes (profil, comparaison, ligne top 500) :
 * chargé une seule fois, seulement sur les pages qui en ont une (environ 150 ko compressés hors du bundle initial).
 */
let echartsPromise: Promise<typeof import("echarts/core")> | null = null;

export function loadECharts() {
  echartsPromise ??= Promise.all([import("echarts/core"), import("echarts/charts"), import("echarts/components"), import("echarts/renderers")]).then(([core, charts, components, renderers]) => {
    core.use([charts.LineChart, components.GridComponent, components.TooltipComponent, components.LegendComponent, components.MarkLineComponent, components.MarkPointComponent, components.MarkAreaComponent, components.GraphicComponent, renderers.CanvasRenderer]);
    return core;
  });
  return echartsPromise;
}

export type EChartsInstance = ReturnType<(typeof import("echarts/core"))["init"]>;

/** Couleur d'un token du design system (triplet RGB dans une variable CSS). */
export function token(name: string, alpha = 1): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim().split(/\s+/).join(",");
  return alpha === 1 ? `rgb(${v})` : `rgba(${v},${alpha})`;
}

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
