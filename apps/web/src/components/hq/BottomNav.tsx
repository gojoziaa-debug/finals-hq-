"use client";
import { Activity, Home, LayoutGrid, ListOrdered, Search, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/", key: "home", icon: Home, match: (p: string) => p === "/" },
  { href: "/leaderboards", key: "leaderboards", icon: ListOrdered, match: (p: string) => p.startsWith("/leaderboards") },
  { href: "/search", key: "search", icon: Search, match: (p: string) => p.startsWith("/search") },
  { href: "/following", key: "following", icon: Star, match: (p: string) => p.startsWith("/following") },
  { href: "/status", key: "status", icon: Activity, match: (p: string) => p.startsWith("/status") },
] as const;

const MORE_PATHS = ["/more", "/top-500", "/clubs", "/movers", "/compare", "/status"];

/** Téléphone (phase E) : Accueil, Classements, Recherche, Suivi, Plus ; Plus mène à la ligne top 500, aux clubs, aux progressions, à la comparaison et à l'état. */
const PHONE_ITEMS = [
  ...ITEMS.filter((i) => i.key !== "status"),
  { href: "/more", key: "more", icon: LayoutGrid, match: (p: string) => MORE_PATHS.some((m) => p.startsWith(m)) },
] as const;

/** Ordinateur : la navigation de la phase E (le Rating et la Méthodologie arrivent au sprint 5). */
const DESKTOP_ITEMS = [
  { href: "/leaderboards", key: "leaderboards", match: (p: string) => p.startsWith("/leaderboards") },
  { href: "/top-500", key: "top500", match: (p: string) => p.startsWith("/top-500") },
  { href: "/clubs", key: "clubs", match: (p: string) => p.startsWith("/clubs") },
  { href: "/movers", key: "movers", match: (p: string) => p.startsWith("/movers") },
  { href: "/compare", key: "compare", match: (p: string) => p.startsWith("/compare") },
  { href: "/following", key: "following", match: (p: string) => p.startsWith("/following") },
] as const;

/** Barre d'onglets en bas sous md (téléphone d'abord, cibles de 44 px). */
export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("tabs")} className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="grid grid-cols-5">
        {PHONE_ITEMS.map(({ href, key, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={key}>
              <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active ? "text-accent-ink" : "text-text-2")}>
                <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.75} />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function TopNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("primary")} className="hidden lg:block">
      <ul className="flex items-center gap-1">
        {DESKTOP_ITEMS.map(({ href, key, match }) => {
          const active = match(pathname);
          return (
            <li key={key}>
              <Link href={href} aria-current={active ? "page" : undefined} className={cn("inline-flex h-11 items-center whitespace-nowrap rounded-md px-2.5 text-body-sm font-medium hover:bg-surface-raised", active ? "text-accent-ink" : "text-text-2 hover:text-text")}>
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
