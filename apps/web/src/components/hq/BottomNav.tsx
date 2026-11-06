"use client";
import { Activity, Home, ListOrdered, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/", key: "home", icon: Home, match: (p: string) => p === "/" },
  { href: "/leaderboards", key: "leaderboards", icon: ListOrdered, match: (p: string) => p.startsWith("/leaderboards") },
  { href: "/search", key: "search", icon: Search, match: (p: string) => p.startsWith("/search") },
  { href: "/status", key: "status", icon: Activity, match: (p: string) => p.startsWith("/status") },
] as const;

/** Barre d'onglets en bas sous md (téléphone d'abord, cibles de 44 px). */
export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  return (
    <nav aria-label={t("tabs")} className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-4">
        {ITEMS.map(({ href, key, icon: Icon, match }) => {
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
    <nav aria-label={t("primary")} className="hidden md:block">
      <ul className="flex items-center gap-1">
        {ITEMS.slice(1).map(({ href, key, match }) => {
          const active = match(pathname);
          return (
            <li key={key}>
              <Link href={href} aria-current={active ? "page" : undefined} className={cn("inline-flex h-11 items-center rounded-md px-3 text-body-sm font-medium hover:bg-surface-raised", active ? "text-accent-ink" : "text-text-2 hover:text-text")}>
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
