import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { InfoChip } from "@/components/hq/InfoChip";
import { Link } from "@/i18n/navigation";
import { boardPath, boardShortName, seasonGroups } from "@/lib/boards";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("leaderboardsTitle"), alternates: { canonical: `/${locale}/leaderboards`, languages: { fr: "/fr/leaderboards", en: "/en/leaderboards" } } };
}

/** Index de tous les classements : saison en cours d'abord, archives ensuite. Page statique (catalogue). */
export default async function LeaderboardsIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("leaderboard");
  const groups = seasonGroups();
  return (
    <div className="grid grid-cols-1 gap-6">
      <div>
        <h1 className="font-display text-display-lg uppercase">{t("pageTitle")}</h1>
        <p className="mt-1 text-body-sm text-text-2">{t("pageIntro")}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <section key={g.id} aria-labelledby={`season-${g.id}`} className="rounded-lg border border-border bg-surface p-4">
            <h2 id={`season-${g.id}`} className="flex items-center gap-2 font-display text-display-md uppercase">
              {g.id === "special" ? t("special") : g.id === "events" ? t("events") : g.label}
              {g.isLive && <InfoChip tone="accent">{t("live")}</InfoChip>}
            </h2>
            <ul className="mt-2 flex flex-wrap gap-1">
              {g.boards.map((b) => (
                <li key={b.id}>
                  <Link href={boardPath(b)} className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-body-sm text-text-2 hover:border-border-strong hover:text-text">
                    {boardShortName(b)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
