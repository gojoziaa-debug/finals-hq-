import type { Config } from "tailwindcss";

/** Un composant ne connaît que ces noms, jamais un hex (design system, phase E). */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
const LEAGUES = ["bronze", "silver", "gold", "platinum", "diamond", "ruby"] as const;

const league: Record<string, string> = {};
for (const l of LEAGUES) {
  league[l] = token(`league-${l}`);
  league[`${l}-ink`] = token(`league-${l}-ink`);
}

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    screens: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px" },
    extend: {
      colors: {
        bg: token("bg"),
        surface: { DEFAULT: token("surface"), raised: token("surface-raised") },
        border: { DEFAULT: token("border"), strong: token("border-strong") },
        text: { DEFAULT: token("text"), 2: token("text-2"), 3: token("text-3") },
        accent: { DEFAULT: token("accent"), ink: token("accent-ink"), contrast: token("accent-contrast") },
        positive: { DEFAULT: token("positive"), ink: token("positive-ink") },
        negative: { DEFAULT: token("negative"), ink: token("negative-ink") },
        warning: { DEFAULT: token("warning"), ink: token("warning-ink") },
        info: { DEFAULT: token("info"), ink: token("info-ink") },
        focus: token("focus"),
        league,
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        "display-hero": ["56px", { lineHeight: "1", fontWeight: "800" }],
        "display-xl": ["40px", { lineHeight: "1.05", fontWeight: "700" }],
        "display-lg": ["28px", { lineHeight: "1.1", fontWeight: "700" }],
        "display-md": ["22px", { lineHeight: "1.15", fontWeight: "600" }],
        "title-lg": ["20px", { lineHeight: "1.3", fontWeight: "600" }],
        title: ["16px", { lineHeight: "1.4", fontWeight: "600" }],
        body: ["15px", { lineHeight: "1.5" }],
        "body-sm": ["13px", { lineHeight: "1.45" }],
        num: ["14px", { lineHeight: "1.3", fontWeight: "500" }],
        caption: ["12px", { lineHeight: "1.4", fontWeight: "500", letterSpacing: "0.04em" }],
      },
      borderRadius: { sm: "4px", md: "8px", lg: "12px", xl: "16px" },
      boxShadow: { "elevation-1": "var(--elevation-1)", "elevation-2": "var(--elevation-2)", "glow-accent": "var(--glow-accent)" },
      transitionDuration: { fast: "120ms", base: "200ms", slow: "320ms", roll: "600ms" },
      transitionTimingFunction: { standard: "cubic-bezier(0.2, 0, 0, 1)", emphasized: "cubic-bezier(0.3, 0, 0, 1)", exit: "cubic-bezier(0.4, 0, 1, 1)" },
      zIndex: { sticky: "10", dropdown: "20", overlay: "30", modal: "40", toast: "50" },
      maxWidth: { container: "1200px" },
    },
  },
  plugins: [],
} satisfies Config;
