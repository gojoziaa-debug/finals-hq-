import { Barlow_Condensed, Inter, JetBrains_Mono } from "next/font/google";

/** Trois familles OFL auto-hébergées par next/font (sous-ensemble latin, font-display: swap). Display préchargée : c'est l'élément LCP. */
export const display = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display", display: "swap" });
export const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
export const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-mono", display: "swap", preload: false });
