"use client";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/** La palette (Radix Dialog + cmdk) n'est chargée qu'à la première ouverture : rien dans le JS initial. */
const SearchPalette = dynamic(() => import("./SearchPalette").then((m) => m.SearchPalette), { ssr: false });

/** wide : champ pleine largeur avec le texte d'aide, même sur téléphone (accueil). */
export function SearchTrigger({ wide = false }: { wide?: boolean }) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setLoaded(true);
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
        onPointerEnter={() => setLoaded(true)}
        className={wide ? "flex h-12 w-full items-center gap-2 rounded-md border border-border-strong bg-surface px-3 text-body text-text-2 hover:text-text" : "inline-flex h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 text-body-sm text-text-2 hover:border-border-strong hover:text-text md:w-64"}
        aria-label={t("search")}
        aria-keyshortcuts="Control+K Meta+K"
      >
        <Search aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        <span className={wide ? "flex-1 text-left" : "hidden flex-1 text-left md:inline"}>{t("searchPlaceholder")}</span>
        <kbd className="hidden rounded-sm border border-border px-1.5 font-sans text-[11px] text-text-2 md:inline">Ctrl K</kbd>
      </button>
      {loaded && <SearchPalette open={open} onOpenChange={setOpen} />}
    </>
  );
}
