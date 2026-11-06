"use client";
import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export const THEME_KEY = "hq-theme";

/**
 * Script posé dans <head> avant le premier rendu : applique le thème choisi (localStorage) ou celui du système,
 * sombre par défaut. Les pages restent statiques (ISR) : pas de cookie lu côté serveur, donc pas de flash ni de rendu dynamique.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');var d=t?t==='dark':!(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;

export function ThemeToggle() {
  const t = useTranslations("common");
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // stockage refusé (navigation privée) : le choix vaut pour la page
    }
    setDark(next);
  };
  return (
    <button type="button" onClick={toggle} className="inline-flex h-11 w-11 items-center justify-center rounded-md text-text-2 hover:bg-surface-raised hover:text-text" aria-label={dark === false ? t("themeDark") : t("themeLight")} title={t("theme")}>
      {dark === false ? <Moon aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} /> : <Sun aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />}
    </button>
  );
}
