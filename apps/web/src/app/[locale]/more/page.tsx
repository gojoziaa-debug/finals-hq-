import { Activity, ArrowRight, GitCompare, Shield, TrendingUp, Trophy } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("moreTitle"), robots: { index: false, follow: true } };
}

const ITEMS = [
  { href: "/top-500", key: "top500", icon: Trophy },
  { href: "/clubs", key: "clubs", icon: Shield },
  { href: "/movers", key: "movers", icon: TrendingUp },
  { href: "/compare", key: "compare", icon: GitCompare },
  { href: "/status", key: "status", icon: Activity },
] as const;

/** Onglet « Plus » du téléphone (phase E) : les pages qui n'ont pas leur place dans la barre du bas. */
export default async function MorePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("more");
  const tn = await getTranslations("nav");
  return (
    <div className="grid grid-cols-1 gap-4">
      <h1 className="font-display text-display-xl uppercase">{tn("more")}</h1>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {ITEMS.map(({ href, key, icon: Icon }) => (
          <li key={key}>
            <Link href={href} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-surface-raised">
              <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-accent-ink" strokeWidth={1.75} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{tn(key)}</span>
                <span className="block text-body-sm text-text-2">{t(key)}</span>
              </span>
              <ArrowRight aria-hidden="true" className="h-4 w-4 text-text-3" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
